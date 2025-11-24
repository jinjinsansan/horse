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
  const { signal, headless } = payload;

  if (signal.race_type === 'JRA') {
    if (!payload.credentials.ipat) {
      return { success: false, message: 'IPAT認証情報が設定されていません' };
    }
    const request: IpatBetRequest = {
      joName: signal.jo_name,
      raceNo: signal.race_no,
      betTypeName: signal.bet_type_name,
      kaime: signal.kaime_data,
      amount: signal.suggested_amount,
    };
    return executeIpatVote(payload.credentials.ipat, request, { headless });
  }

  if (!payload.credentials.spat4) {
    return { success: false, message: 'SPAT4認証情報が設定されていません' };
  }

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
    return await voter.vote(request);
  } finally {
    await voter.close();
  }
}
