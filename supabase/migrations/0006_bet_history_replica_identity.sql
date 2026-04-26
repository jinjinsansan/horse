-- ===============================================================
-- Migration 0006: bet_history REPLICA IDENTITY FULL
--
-- Supabase Realtime の row-level filter (user_id=eq.X) を正しく機能させるために必要。
-- 主キー以外の列 (user_id) でフィルタリングするには REPLICA IDENTITY FULL が必要。
-- これがないと全ユーザーの bet_history UPDATE が全員に配信されてしまう。
-- ===============================================================
ALTER TABLE bet_history REPLICA IDENTITY FULL;
