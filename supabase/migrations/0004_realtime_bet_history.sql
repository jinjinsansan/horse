-- ===============================================================
-- Migration 0004: bet_history を Realtime publication に追加
-- update_bet_results.py が payout/bet_result を更新したとき、
-- user-gui に即時反映されるようにする（回収率の即時更新用）
-- ===============================================================
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE bet_history;
    EXCEPTION WHEN duplicate_object THEN
        -- already in publication, no-op
        NULL;
    END;
END $$;
