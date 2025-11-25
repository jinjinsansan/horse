import {
  executeIpatVote,
  type IpatCredentials,
  type IpatBetRequest,
  Spat4Voter,
  type Spat4Credentials,
  type Spat4BetRequest,
} from '@horsebet/shared/automation';

type MinimalBetSignal = {
  race_type: 'JRA' | 'NAR';
  jo_name: string;
  race_no: number;
  bet_type_name: string;
  kaime_data: string[];
  suggested_amount: number;
};

export interface BetExecutionPayload {
  signal: MinimalBetSignal;
  credentials: {
    ipat?: IpatCredentials;
    spat4?: Spat4Credentials;
  };
  headless?: boolean;
}

export async function executeBet(payload: BetExecutionPayload) {
  console.log('[bet-executor] Starting bet execution:', {
    raceType: payload.signal.race_type,
    hasIpat: !!payload.credentials.ipat,
    hasSpat4: !!payload.credentials.spat4,
  });

  const { signal, headless } = payload;

  try {
    if (signal.race_type === 'JRA') {
      if (!payload.credentials.ipat) {
        return { success: false, message: 'IPAT認証情報が設定されていません' };
      }
      console.log('[bet-executor] Executing IPAT vote...');
      const request: IpatBetRequest = {
        joName: signal.jo_name,
        raceNo: signal.race_no,
        betTypeName: signal.bet_type_name,
        kaime: signal.kaime_data,
        amount: signal.suggested_amount,
      };
      const result = await executeIpatVote(payload.credentials.ipat, request, { headless });
      console.log('[bet-executor] IPAT result:', result);
      return result;
    }

    if (!payload.credentials.spat4) {
      return { success: false, message: 'SPAT4認証情報が設定されていません' };
    }

    console.log('[bet-executor] Executing SPAT4 vote...');
    const voter = new Spat4Voter();
    try {
      await voter.initialize(headless);
      await voter.login(payload.credentials.spat4);
      const request: Spat4BetRequest = {
        joName: signal.jo_name,
        raceNo: signal.race_no,
        betTypeName: signal.bet_type_name,
        kaime: signal.kaime_data,
        amount: signal.suggested_amount,
      };
      const result = await voter.vote(request);
      console.log('[bet-executor] SPAT4 result:', result);
      return result;
    } finally {
      await voter.close();
    }
  } catch (error) {
    console.error('[bet-executor] Error:', error);
    return {
      success: false,
      message: '投票処理中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}
