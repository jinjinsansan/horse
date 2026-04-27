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
  method: number;    // 方式コード (0=不要, 101=ながし, 201=ボックス, 301=フォーメーション)
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

const getScreenshotDir = (() => {
  let cached: string | null = null;
  return () => {
    if (!cached) {
      const dir = path.join(app.getPath('userData'), 'screenshots');
      ensureDir(dir);
      cached = dir;
    }
    return cached;
  };
})();

// SPAT4はChromium persistent profileを1つ共有するため、同時実行するとプロファイルロック競合が発生する。
// シリアライズ用ミューテックス: 前のSPAT4投票が完了してから次を開始する。
let spat4QueueTail: Promise<void> = Promise.resolve();

// IPATも同一アカウントへの並列ログインを避けるため直列化する。
// (L3 JRA同レースで F5複勝+U2馬連×3+S1三連複 が同時発火するケースに対応)
let ipatQueueTail: Promise<void> = Promise.resolve();

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
      
      // signal.method を優先使用。未指定またはゼロの場合は式別ごとのデフォルトにフォールバック
      const method = signal.method !== undefined && signal.method !== 0
        ? signal.method
        : (betTypeNo === 1 || betTypeNo === 2 ? 0 : 301);

      const request: IpatBetRequest = {
        kaisaiDate,
        joName: signal.jo_name,
        raceNo: signal.race_no,
        betType: signal.bet_type_name,
        betTypeNo,
        method,
        kaime: signal.kaime_data,
        amount: signal.suggested_amount,
      };
      
      // ❽ IPAT も直列化（同一アカウントへの並列ログイン防止）
      let releaseIpatLock!: () => void;
      const myIpatTurn = new Promise<void>((resolve) => { releaseIpatLock = resolve; });
      const prevIpatTail = ipatQueueTail;
      ipatQueueTail = myIpatTurn;
      try {
        await prevIpatTail;
      } catch { /* 前の投票失敗でも続行 */ }

      let ipatResult: Awaited<ReturnType<typeof executeIpatVote>>;
      try {
        ipatResult = await executeIpatVote(payload.credentials.ipat, [request], {
          headless,
          screenshotDir: getScreenshotDir(),
        });
      } finally {
        releaseIpatLock();
      }
      console.log('[bet-executor] IPAT result:', ipatResult);
      return normalizeResult(ipatResult);
    }

    if (!payload.credentials.spat4) {
      return { success: false, message: 'SPAT4認証情報が設定されていません' };
    }

    const profileDir = getSpat4ProfileDir();
    // 認証情報は絶対にログ出力しない。存在チェックのみ表示
    console.log('[bet-executor] Executing SPAT4 vote...', {
      profileDir,
      hasMemberNumber: !!payload.credentials.spat4?.memberNumber,
      hasMemberId: !!payload.credentials.spat4?.memberId,
      hasPassword: !!payload.credentials.spat4?.password,
    });

    const memberNumber = payload.credentials.spat4.memberNumber?.toString().trim();
    const memberId = payload.credentials.spat4.memberId?.toString().trim();
    const password = payload.credentials.spat4.password?.toString().trim();
    
    if (!memberNumber || !memberId) {
      return { success: false, message: 'SPAT4加入者番号または利用者IDが未入力です' };
    }
    
    if (!password) {
      return { success: false, message: 'SPAT4暗証番号が未入力です' };
    }

    // 同一 profileDir への並列アクセスを防ぐためシリアライズ
    let releaseSpat4Lock!: () => void;
    const myTurn = new Promise<void>((resolve) => { releaseSpat4Lock = resolve; });
    const prevTail = spat4QueueTail;
    spat4QueueTail = myTurn;

    try {
      await prevTail; // 前の投票が終わるまで待機
    } catch {
      // 前の投票が失敗しても自分は続行
    }

    const voter = new Spat4Voter({ profileDir, screenshotDir: getScreenshotDir() });
    try {
      await voter.initialize(headless);
      await voter.login({ memberNumber, memberId, password });
      
      // 買い目データを配列に変換
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
      releaseSpat4Lock(); // 次の待機中投票を解放
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
