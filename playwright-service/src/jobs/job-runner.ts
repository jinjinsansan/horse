import PQueue from 'p-queue';
import {
  executeIpatVote,
  type IpatBetRequest,
  type IpatCredentials,
  Spat4Voter,
  type Spat4BetRequest,
  type Spat4Credentials,
} from '@horsebet/shared/automation';
import { env } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import type { ExecuteBetRequestBody, SignalPayload } from '../types.js';

const jobQueue = new PQueue({ concurrency: env.jobConcurrency });

type BetJobRow = {
  id: string;
  user_id: string;
  status: string;
};

export async function enqueueBetJob(payload: ExecuteBetRequestBody) {
  const { data, error } = await supabaseAdmin
    .from('bet_jobs')
    .insert({
      user_id: payload.userId,
      signal_id: payload.signal.id,
      status: 'pending',
      trigger_source: payload.options?.auto ? 'auto' : 'manual',
      job_payload: payload,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert bet job: ${error?.message ?? 'unknown error'}`);
  }

  jobQueue.add(() => processJob(data.id, payload)).catch((queueError) => {
    console.error('[job-runner] queue execution failed', queueError);
  });

  await recordJobEvent(data.id, 'queued', { signalId: payload.signal.id });
  return { jobId: data.id };
}

async function processJob(jobId: string, payload: ExecuteBetRequestBody) {
  await updateJobStatus(jobId, 'running', { started_at: new Date().toISOString() });
  await recordJobEvent(jobId, 'started', { userId: payload.userId });

  try {
    const credentials = await fetchUserCredentials(payload.userId);
    const result = await executeBet(jobId, payload.signal, credentials, payload.options?.headless);

    await insertBetHistory(payload.userId, payload.signal, payload.options?.auto ?? false);
    await recordJobEvent(jobId, 'completed', { success: true, message: result.message });
    await updateJobStatus(jobId, 'succeeded', {
      completed_at: new Date().toISOString(),
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[job-runner] job failed', message);
    await recordJobEvent(jobId, 'failed', { message });
    await updateJobStatus(jobId, 'failed', {
      completed_at: new Date().toISOString(),
      error_message: message,
    });
  }
}

async function executeBet(
  jobId: string,
  signal: SignalPayload,
  credentials: {
    ipat_credentials?: Record<string, string> | null;
    spat4_credentials?: Record<string, string> | null;
  },
  overrideHeadless?: boolean,
) {
  const headless = overrideHeadless ?? env.headless;
  if (signal.race_type === 'JRA') {
    const ipat = mapIpatCredentials(credentials.ipat_credentials);
    if (!ipat) {
      throw new Error('IPAT認証情報が設定されていません');
    }
    const request: IpatBetRequest = {
      joName: signal.jo_name,
      raceNo: signal.race_no,
      betTypeName: signal.bet_type_name,
      kaime: signal.kaime_data,
      amount: signal.suggested_amount,
    };
    await recordJobEvent(jobId, 'ipat_vote_start', { joName: request.joName, raceNo: request.raceNo });
    const result = await executeIpatVote(ipat, request, { headless });
    if (!result.success) {
      throw new Error(result.detail ?? result.message);
    }
    return result;
  }

  const spat = mapSpatCredentials(credentials.spat4_credentials);
  if (!spat) {
    throw new Error('SPAT4認証情報が設定されていません');
  }
  const voter = new Spat4Voter();
  const request: Spat4BetRequest = {
    joName: signal.jo_name,
    raceNo: signal.race_no,
    betTypeName: signal.bet_type_name,
    kaime: signal.kaime_data,
    amount: signal.suggested_amount,
  };
  await recordJobEvent(jobId, 'spat4_vote_start', { joName: request.joName, raceNo: request.raceNo });
  try {
    await voter.initialize(headless);
    await voter.login(spat);
    const result = await voter.vote(request);
    if (!result.success) {
      throw new Error(result.detail ?? result.message);
    }
    return result;
  } finally {
    await voter.close();
  }
}

async function fetchUserCredentials(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('ipat_credentials, spat4_credentials')
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new Error(`ユーザープロファイルの取得に失敗しました (${error?.message ?? 'not found'})`);
  }
  return data;
}

async function insertBetHistory(userId: string, signal: SignalPayload, isAuto: boolean) {
  const oiageState = await updateOiageState(userId, signal.suggested_amount);
  const totalInvestment = oiageState?.total_investment ?? signal.suggested_amount;

  const { error } = await supabaseAdmin.from('bet_history').insert({
    user_id: userId,
    signal_id: signal.id,
    race_type: signal.race_type,
    jo_name: signal.jo_name,
    race_no: signal.race_no,
    bet_type_name: signal.bet_type_name,
    selected_kaime: signal.kaime_data,
    bet_amount: signal.suggested_amount,
    is_auto_bet: isAuto,
    kaime_count: signal.kaime_data.length,
    total_investment: totalInvestment,
  });

  if (error) {
    console.error('[bet-history] insert failed', error.message);
  }
}

async function updateOiageState(userId: string, betAmount: number) {
  const { data } = await supabaseAdmin
    .from('oiage_state')
    .select('id, total_investment, current_kaime')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const updated = {
    total_investment: (data.total_investment ?? 0) + betAmount,
    current_kaime: (data.current_kaime ?? 0) + 1,
    last_bet_date: new Date().toISOString(),
  };

  await supabaseAdmin
    .from('oiage_state')
    .update(updated)
    .eq('id', data.id);

  return { ...data, ...updated };
}

async function updateJobStatus(jobId: string, status: string, patch: Record<string, unknown>) {
  await supabaseAdmin
    .from('bet_jobs')
    .update({ status, ...patch })
    .eq('id', jobId);
}

async function recordJobEvent(jobId: string, eventType: string, details?: Record<string, unknown>) {
  await supabaseAdmin.from('bet_job_events').insert({
    job_id: jobId,
    event_type: eventType,
    details: details ?? null,
  });
}

function mapIpatCredentials(raw?: Record<string, string> | null): IpatCredentials | null {
  if (!raw) return null;
  return {
    inetId: raw.inet_id ?? raw.inetId ?? '',
    userCode: raw.user_cd ?? raw.userCode ?? '',
    password: raw.password ?? '',
    pin: raw.pin ?? raw.ipatPin ?? '',
  } satisfies IpatCredentials;
}

function normalizeCredential(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function mapSpatCredentials(raw?: Record<string, unknown> | null): Spat4Credentials | null {
  if (!raw) return null;
  const memberNumber = normalizeCredential(raw.member_number ?? raw.memberNumber ?? raw.user_id ?? '');
  const memberId = normalizeCredential(raw.member_id ?? raw.memberId ?? raw.password ?? '');
  if (!memberNumber || !memberId) return null;
  return {
    memberNumber,
    memberId,
  } satisfies Spat4Credentials;
}
