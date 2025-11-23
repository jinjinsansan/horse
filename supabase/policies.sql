-- Enable Row Level Security and define policies

ALTER TABLE bet_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bet_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE oiage_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "bet_signals_read"
    ON bet_signals FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "bet_signals_insert"
    ON bet_signals FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid()
              AND settings->>'role' = 'admin'
        )
    );

CREATE POLICY IF NOT EXISTS "user_profiles_read"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "user_profiles_update"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "bet_history_read"
    ON bet_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "bet_history_insert"
    ON bet_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "oiage_state_manage"
    ON oiage_state FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "system_logs_read"
    ON system_logs FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

ALTER PUBLICATION supabase_realtime ADD TABLE bet_signals;
