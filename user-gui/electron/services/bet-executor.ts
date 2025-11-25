import {
  executeIpatVote,
  type IpatCredentials,
  type IpatBetRequest,
  Spat4Voter,
  type Spat4Credentials,
  type Spat4BetRequest,
} from '@horsebet/shared/automation';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

type MinimalBetSignal = {
  signal_date: string; // 開催日
  race_type: 'JRA' | 'NAR';
  jo_name: string;
  race_no: number;
  bet_type_name: string;
  kaime_data: string[];
  suggested_amount: number;
};

type VoteOutcome = {
  success: boolean;
  message?: string;
  detail?: unknown;
  details?: unknown;
};

export interface BetExecutionPayload {
  signal: MinimalBetSignal;
  credentials: {
    ipat?: IpatCredentials;
    spat4?: Spat4Credentials;
  };
  headless?: boolean;
}

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const getSpat4ProfileDir = (() => {
  let cached: string | null = null;
  return () => {
    if (!cached) {
      const dir = path.join(app.getPath('userData'), 'playwright', 'spat4');
      ensureDir(dir);
      cached = dir;
    }
    return cached;
  };
})();

function normalizeResult<T extends VoteOutcome>(result: T): T {
  if (result && result.detail && !result.details) {
    return { ...result, details: result.detail };
  }
  return result;
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
      
      // 馬券種類名から馬券種類コードを取得
      const betTypeMap: Record<string, number> = {
        '単勝': 1,
        '複勝': 2,
        '枠連': 3,
        '馬連': 4,
        'ワイド': 5,
        '馬単': 6,
        '3連複': 7,
        '３連複': 7,
        '3連単': 8,
        '３連単': 8,
      };
      const betTypeNo = betTypeMap[signal.bet_type_name] || 8;
      
      // kaisaiDateをDateオブジェクトに変換
      const kaisaiDate = new Date(signal.signal_date);
      
      const request: IpatBetRequest = {
        kaisaiDate,
        joName: signal.jo_name,
        raceNo: signal.race_no,
        betType: signal.bet_type_name,
        betTypeNo,
        method: 301, // デフォルトはフォーメーション
        kaime: signal.kaime_data,
        amount: signal.suggested_amount,
      };
      
      const result = await executeIpatVote(payload.credentials.ipat, [request], { headless });
      console.log('[bet-executor] IPAT result:', result);
      return normalizeResult(result);
    }

    if (!payload.credentials.spat4) {
      return { success: false, message: 'SPAT4認証情報が設定されていません' };
    }

    const profileDir = getSpat4ProfileDir();
    console.log('[bet-executor] Executing SPAT4 vote...', { profileDir, credentials: payload.credentials.spat4 });

    const memberNumber = payload.credentials.spat4.memberNumber?.toString().trim();
    const memberId = payload.credentials.spat4.memberId?.toString().trim();
    const password = payload.credentials.spat4.password?.toString().trim();
    
    if (!memberNumber || !memberId) {
      return { success: false, message: 'SPAT4加入者番号または利用者IDが未入力です' };
    }
    
    if (!password) {
      return { success: false, message: 'SPAT4暗証番号が未入力です' };
    }

    const voter = new Spat4Voter({ profileDir });
    try {
      await voter.initialize(headless);
      await voter.login({ memberNumber, memberId, password });
      
      // 買い目データを配列に変換（現在は1つの買い目のみサポート）
      const kaimeNumbers = signal.kaime_data.map((k: string) => {
        const num = parseInt(k, 10);
        return isNaN(num) ? 0 : num;
      });
      
      const request: Spat4BetRequest = {
        kaisaiDate: new Date(signal.signal_date),
        joName: signal.jo_name,
        raceNo: signal.race_no,
        betType: signal.bet_type_name,
        kaime: kaimeNumbers,
        amount: signal.suggested_amount,
      };
      
      const result = await voter.vote([request]);
      console.log('[bet-executor] SPAT4 result:', result);
      return normalizeResult(result);
    } finally {
      await voter.close();
    }
  } catch (error) {
    console.error('[bet-executor] Error:', error);
    return {
      success: false,
      message: '投票処理中にエラーが発生しました',
      detail: error instanceof Error ? error.message : String(error),
      details: error instanceof Error ? error.message : String(error),
    };
  }
}
