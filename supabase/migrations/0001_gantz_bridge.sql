-- ===============================================================
-- Migration 0001: GANTZ Bridge support
-- Adds start_time / source columns and upsert key for bet_signals
-- Run in Supabase SQL Editor
-- ===============================================================

-- 1. Add columns
ALTER TABLE bet_signals
    ADD COLUMN IF NOT EXISTS start_time TEXT,
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN bet_signals.start_time IS 'HH:MM JST race start time (from GANTZ source)';
COMMENT ON COLUMN bet_signals.source     IS 'Signal origin: manual | gantz_strict | gantz_loose | other';

-- 2. Backfill: existing rows are 'manual'
UPDATE bet_signals SET source = 'manual' WHERE source IS NULL;

-- 3. Upsert key for bridge idempotency
-- Same (source, date, jo, race, bet_type) → updated, not duplicated
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bet_signals_bridge
    ON bet_signals (source, signal_date, jo_code, race_no, bet_type);

-- 4. Helpful read index
CREATE INDEX IF NOT EXISTS idx_bet_signals_source_date
    ON bet_signals (source, signal_date DESC);

-- 5. Realtime publication already includes bet_signals (policies.sql:67)
-- No change needed. New columns are auto-included.

-- ---------------------------------------------------------------
-- Verification queries (run after migration):
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns WHERE table_name='bet_signals';
--   SELECT indexname FROM pg_indexes WHERE tablename='bet_signals';
-- ---------------------------------------------------------------
