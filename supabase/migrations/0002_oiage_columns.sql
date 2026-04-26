-- ===============================================================
-- Migration 0002: oiage_state にコード側で参照されている列を追加
-- ・user-gui/src/lib/api/oiage.ts が base_amount / max_steps を
--   upsert で書き込もうとしているが、schema.sql:99-111 には未定義
-- ===============================================================

ALTER TABLE oiage_state
    ADD COLUMN IF NOT EXISTS base_amount INTEGER NOT NULL DEFAULT 1000,
    ADD COLUMN IF NOT EXISTS max_steps   INTEGER NOT NULL DEFAULT 5;

COMMENT ON COLUMN oiage_state.base_amount IS 'マーチンゲール 1 回目の金額（円）';
COMMENT ON COLUMN oiage_state.max_steps   IS 'マーチンゲール最大ステップ数';
