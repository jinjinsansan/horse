export const BET_TYPES = {
  1: '単勝',
  2: '複勝',
  3: '枠連',
  4: '馬連',
  5: 'ワイド',
  6: '馬単',
  7: '3連複',
  8: '3連単'
} as const;

export const JO_CODES = {
  '01': '札幌',
  '02': '函館',
  '03': '福島',
  '04': '新潟',
  '05': '東京',
  '06': '中山',
  '07': '中京',
  '08': '京都',
  '09': '阪神',
  '10': '小倉'
} as const;

export interface CreateSignalRequest {
  signal_date: string;
  race_type: 'JRA' | 'NAR';
  jo_code: string;
  race_no: number;
  bet_type: number;
  method: number;
  suggested_amount: number;
  kaime_data: string[];
  note?: string;
}

export type BetTypeName = (typeof BET_TYPES)[keyof typeof BET_TYPES];
