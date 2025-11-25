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

// JRA競馬場コード
export const JRA_JO_CODES = {
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

// NAR（地方競馬）競馬場コード
export const NAR_JO_CODES = {
  '30': '門別',
  '31': '盛岡',
  '32': '水沢',
  '33': '浦和',
  '34': '船橋',
  '35': '大井',
  '36': '川崎',
  '37': '金沢',
  '38': '笠松',
  '39': '名古屋',
  '40': '園田',
  '41': '姫路',
  '42': '高知',
  '43': '佐賀',
  '44': '帯広'
} as const;

// 全競馬場コード（統合）
export const JO_CODES = {
  ...JRA_JO_CODES,
  ...NAR_JO_CODES
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
