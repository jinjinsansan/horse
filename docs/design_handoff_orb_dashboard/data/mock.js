// 模擬データ — 競馬GANTZ
const MOCK_RACES = [
  {
    id: 1, signal_date: '2026-04-26', race_type: 'JRA', jo_name: '東京', jo_code: '05',
    race_no: 11, race_name: '天皇賞(秋)', distance: '芝2000m', course: 'A', total_horses: 16,
    start_time: '15:40', bet_type_name: '単勝', bet_type: 1, suggested_amount: 100,
    kaime_data: ['7'], horse_name: 'ドゥラエレーデ', popularity: 3, ai_prob: 78.6,
    consensus: '4/4', engines: 'D+I+V+R', source: 'gantz_strict', status: 'active',
    odds: { win: [3.2, 5.8, 7.6, 12.3, 15.4], }, jockey: 'ルメール',
    trainer: '川田将雅', estimated_3f: 33.4, speed: 'A+', stamina: 'A',
    schedule: 'scheduled', fire_at: '15:35',
    note: 'GANTZ strict | 7番ドゥラエレーデ | 3人気 | 発走15:40 | 一致4/4(D+I+V+R)',
  },
  {
    id: 2, signal_date: '2026-04-26', race_type: 'NAR', jo_name: '船橋', jo_code: '34',
    race_no: 7, race_name: 'C2', distance: 'ダ1200m', course: 'B', total_horses: 12,
    start_time: '15:25', bet_type_name: '単勝', bet_type: 1, suggested_amount: 100,
    kaime_data: ['5'], horse_name: 'ヒロイン', popularity: 6, ai_prob: 64.2,
    consensus: '3/4', engines: 'D+I+V', source: 'gantz_strict', status: 'active',
    odds: { win: [4.1, 6.2, 8.0, 11.5, 13.8], }, jockey: '戸崎圭太',
    trainer: '横山武史', estimated_3f: 36.8, speed: 'A', stamina: 'B+',
    schedule: 'submitted', fire_at: '15:20',
    note: 'GANTZ strict | 5番ヒロイン | 6人気 | 発走15:25 | 一致3/4(D+I+V)',
  },
  {
    id: 3, signal_date: '2026-04-26', race_type: 'NAR', jo_name: '浦和', jo_code: '33',
    race_no: 5, race_name: 'C3', distance: 'ダ1500m', course: 'A', total_horses: 11,
    start_time: '16:10', bet_type_name: '単勝', bet_type: 1, suggested_amount: 100,
    kaime_data: ['3'], horse_name: 'ハヤブサ', popularity: 2, ai_prob: 81.3,
    consensus: '4/4', engines: 'D+I+V+R', source: 'gantz_strict', status: 'active',
    odds: { win: [2.8, 4.5, 6.7, 9.2, 14.1], }, jockey: '武豊',
    trainer: '友道康夫', estimated_3f: 37.1, speed: 'S', stamina: 'A+',
    schedule: 'queued', fire_at: '16:05',
    note: 'GANTZ strict | 3番ハヤブサ | 2人気 | 発走16:10 | 一致4/4',
  },
  {
    id: 4, signal_date: '2026-04-26', race_type: 'NAR', jo_name: '名古屋', jo_code: '39',
    race_no: 9, race_name: 'B3', distance: 'ダ1400m', course: 'A', total_horses: 10,
    start_time: '16:55', bet_type_name: '単勝', bet_type: 1, suggested_amount: 100,
    kaime_data: ['8'], horse_name: 'シリウス', popularity: 5, ai_prob: 72.8,
    consensus: '3/4', engines: 'D+I+V', source: 'gantz_strict', status: 'active',
    odds: { win: [5.4, 6.8, 8.2, 10.9, 12.7], }, jockey: '岡部誠',
    trainer: '加藤敬二', estimated_3f: 36.2, speed: 'A', stamina: 'A',
    schedule: 'queued', fire_at: '16:50',
    note: 'GANTZ strict | 8番シリウス | 5人気 | 発走16:55 | 一致3/4',
  },
  {
    id: 5, signal_date: '2026-04-26', race_type: 'NAR', jo_name: '高知', jo_code: '42',
    race_no: 11, race_name: '黒潮特別', distance: 'ダ1400m', course: 'A', total_horses: 12,
    start_time: '20:25', bet_type_name: '単勝', bet_type: 1, suggested_amount: 100,
    kaime_data: ['4'], horse_name: 'コウチノカゼ', popularity: 4, ai_prob: 69.5,
    consensus: '3/4', engines: 'D+V+R', source: 'gantz_strict', status: 'active',
    odds: { win: [4.8, 5.9, 7.3, 10.2, 14.6], }, jockey: '赤岡修次',
    trainer: '田中淳司', estimated_3f: 36.5, speed: 'A', stamina: 'B+',
    schedule: 'queued', fire_at: '20:20',
    note: 'GANTZ strict | 4番コウチノカゼ | 4人気 | 発走20:25 | 一致3/4',
  },
  {
    id: 6, signal_date: '2026-04-26', race_type: 'NAR', jo_name: '川崎', jo_code: '36',
    race_no: 8, race_name: 'C2', distance: 'ダ1500m', course: 'A', total_horses: 11,
    start_time: '17:30', bet_type_name: '単勝', bet_type: 1, suggested_amount: 100,
    kaime_data: ['2'], horse_name: 'ミラージュ', popularity: 1, ai_prob: 84.1,
    consensus: '4/4', engines: 'D+I+V+R', source: 'gantz_strict', status: 'active',
    odds: { win: [2.1, 4.2, 6.5, 8.8, 11.3], }, jockey: '森泰斗',
    trainer: '阿久津正', estimated_3f: 36.9, speed: 'S', stamina: 'A',
    schedule: 'queued', fire_at: '17:25',
    note: 'GANTZ strict | 2番ミラージュ | 1人気 | 発走17:30 | 一致4/4',
  },
];

const MOCK_HISTORY = [
  { date: '2026-04-25', venue: '大井', race: 9, horse: '5番ライトニング', amount: 100, payout: 380, result: 'win', odds: 3.8 },
  { date: '2026-04-25', venue: '園田', race: 11, horse: '7番サンダー', amount: 100, payout: 0, result: 'lose', odds: 5.2 },
  { date: '2026-04-24', venue: '浦和', race: 7, horse: '3番ストーム', amount: 100, payout: 460, result: 'win', odds: 4.6 },
  { date: '2026-04-24', venue: '金沢', race: 5, horse: '6番フェニックス', amount: 100, payout: 0, result: 'lose', odds: 8.1 },
  { date: '2026-04-24', venue: '金沢', race: 8, horse: '4番ブレイブ', amount: 100, payout: 290, result: 'win', odds: 2.9 },
  { date: '2026-04-23', venue: '船橋', race: 10, horse: '2番ヴィクター', amount: 100, payout: 720, result: 'win', odds: 7.2 },
  { date: '2026-04-23', venue: '高知', race: 6, horse: '8番ミッドナイト', amount: 100, payout: 0, result: 'lose', odds: 11.4 },
  { date: '2026-04-22', venue: '名古屋', race: 9, horse: '5番イクリプス', amount: 100, payout: 340, result: 'win', odds: 3.4 },
  { date: '2026-04-22', venue: '佐賀', race: 11, horse: '1番タイタン', amount: 100, payout: 0, result: 'lose', odds: 6.7 },
  { date: '2026-04-21', venue: '盛岡', race: 7, horse: '9番アポロン', amount: 100, payout: 280, result: 'win', odds: 2.8 },
];

const MOCK_NOTIFICATIONS = [
  { id: 1, time: '15:35', type: 'fire', message: '東京 11R 自動投票を実行中…', severity: 'info' },
  { id: 2, time: '15:21', type: 'submitted', message: '船橋 7R 単勝 5番 / ¥100 投票完了', severity: 'success' },
  { id: 3, time: '15:08', type: 'win', message: '大井 9R 的中 / 払戻 ¥380', severity: 'win' },
  { id: 4, time: '09:01', type: 'signal', message: 'GANTZ 配信受信: 6件のSTRICTシグナル', severity: 'info' },
  { id: 5, time: '08:30', type: 'system', message: 'D-Logic Engine v2.6.0 起動完了', severity: 'info' },
  { id: 6, time: '08:00', type: 'system', message: 'IPAT/SPAT4 認証情報確認: OK', severity: 'success' },
];

window.MOCK_RACES = MOCK_RACES;
window.MOCK_HISTORY = MOCK_HISTORY;
window.MOCK_NOTIFICATIONS = MOCK_NOTIFICATIONS;
