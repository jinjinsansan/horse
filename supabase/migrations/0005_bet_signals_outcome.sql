-- ===============================================================
-- Migration 0005: bet_signals に GANTZ レース結果列を追加
--
-- ユーザーが個人的に投票したかに関わらず、GANTZ 配信のレースが
-- 勝った/負けたかと、100円ベースの単勝払戻額を記録する。
-- update_bet_results.py が race_results 照合時に書き込む。
-- 用途: ダッシュボード右上「GANTZ 全体の本日回収率」の計算
-- ===============================================================

ALTER TABLE bet_signals
    ADD COLUMN IF NOT EXISTS outcome_status TEXT
        DEFAULT 'pending'
        CHECK (outcome_status IN ('pending','win','lose','cancelled','unknown')),
    ADD COLUMN IF NOT EXISTS outcome_winner_number INTEGER,
    ADD COLUMN IF NOT EXISTS outcome_payout_per_100 INTEGER,
    ADD COLUMN IF NOT EXISTS outcome_updated_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN bet_signals.outcome_status         IS 'レース結果ステータス: pending(未確定) / win(GANTZ単勝的中) / lose(外れ) / cancelled(取消) / unknown';
COMMENT ON COLUMN bet_signals.outcome_winner_number  IS '実際の勝ち馬の馬番';
COMMENT ON COLUMN bet_signals.outcome_payout_per_100 IS '100円ベースの単勝払戻額 (race_results.win_payout)';
COMMENT ON COLUMN bet_signals.outcome_updated_at     IS 'outcome_status 最終更新時刻';

-- 既存行を pending で初期化
UPDATE bet_signals SET outcome_status = 'pending' WHERE outcome_status IS NULL;

-- 当日 GANTZ 戦果取得用 index
CREATE INDEX IF NOT EXISTS idx_bet_signals_outcome
    ON bet_signals (signal_date, source, outcome_status);
