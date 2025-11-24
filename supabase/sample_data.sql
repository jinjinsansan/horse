-- Replace placeholders before running

-- Insert admin profile after creating auth user via Supabase dashboard
INSERT INTO user_profiles (id, user_id, display_name, settings)
VALUES (
    'REPLACE_WITH_AUTH_USER_UUID',
    'admin001',
    '管理者テスト',
    jsonb_build_object('role', 'admin')
)
ON CONFLICT (id) DO NOTHING;

-- Seed sample bet signal for verification
INSERT INTO bet_signals (
    signal_date,
    race_type,
    jo_code,
    jo_name,
    race_no,
    bet_type,
    bet_type_name,
    method,
    suggested_amount,
    kaime_data,
    note,
    created_by
)
VALUES (
    CURRENT_DATE,
    'JRA',
    '05',
    '東京',
    11,
    8,
    '3連単',
    301,
    1000,
    '["1-2-3", "4-5-6", "7-8-9"]'::jsonb,
    '本命◎1番軸の流し',
    'REPLACE_WITH_AUTH_USER_UUID'
);

-- Seed placeholder bet job (will be processed by backend service)
INSERT INTO bet_jobs (user_id, signal_id, status, trigger_source)
VALUES ('REPLACE_WITH_AUTH_USER_UUID', currval('bet_signals_id_seq'), 'pending', 'manual')
ON CONFLICT DO NOTHING;
