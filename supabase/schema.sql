-- ========================================
-- Schema initialization for HorseRaceBetter system
-- Run in Supabase SQL editor to create core tables
-- ========================================

CREATE TABLE IF NOT EXISTS bet_signals (
    id BIGSERIAL PRIMARY KEY,
    signal_date DATE NOT NULL,
    race_type VARCHAR(10) NOT NULL CHECK (race_type IN ('JRA', 'NAR')),
    jo_code VARCHAR(10) NOT NULL,
    jo_name VARCHAR(50) NOT NULL,
    race_no INTEGER NOT NULL CHECK (race_no BETWEEN 1 AND 12),
    bet_type INTEGER NOT NULL CHECK (bet_type BETWEEN 1 AND 8),
    bet_type_name VARCHAR(20) NOT NULL,
    method INTEGER NOT NULL,
    suggested_amount INTEGER DEFAULT 1000,
    kaime_data JSONB NOT NULL,
    note TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_bet_signals_date ON bet_signals(signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_bet_signals_status ON bet_signals(status);
CREATE INDEX IF NOT EXISTS idx_bet_signals_race ON bet_signals(signal_date, jo_code, race_no);

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    license_key VARCHAR(255),
    mac_addresses JSONB DEFAULT '[]'::jsonb,
    subscription_status VARCHAR(20) DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'expired', 'suspended')),
    subscription_start DATE,
    subscription_end DATE,
    auto_bet_enabled BOOLEAN DEFAULT FALSE,
    ipat_credentials JSONB,
    spat4_credentials JSONB,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bet_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    signal_id BIGINT REFERENCES bet_signals(id),
    bet_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    race_type VARCHAR(10) NOT NULL,
    jo_name VARCHAR(50) NOT NULL,
    race_no INTEGER NOT NULL,
    bet_type_name VARCHAR(20) NOT NULL,
    selected_kaime JSONB NOT NULL,
    bet_amount INTEGER NOT NULL,
    bet_result VARCHAR(20) DEFAULT 'pending' CHECK (bet_result IN ('pending', 'win', 'lose', 'cancelled')),
    payout INTEGER DEFAULT 0,
    profit_loss INTEGER GENERATED ALWAYS AS (payout - bet_amount) STORED,
    is_auto_bet BOOLEAN DEFAULT FALSE,
    kaime_count INTEGER DEFAULT 1,
    total_investment INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bet_history_user ON bet_history(user_id, bet_date DESC);
CREATE INDEX IF NOT EXISTS idx_bet_history_signal ON bet_history(signal_id);

CREATE TABLE IF NOT EXISTS oiage_state (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    bet_type INTEGER NOT NULL,
    bet_type_name VARCHAR(20) NOT NULL,
    current_kaime INTEGER DEFAULT 1,
    total_investment INTEGER DEFAULT 0,
    target_profit INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_bet_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, bet_type, is_active)
);

CREATE TABLE IF NOT EXISTS system_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id),
    log_level VARCHAR(20) NOT NULL CHECK (log_level IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    log_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_user ON system_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(log_level, created_at DESC);

-- Timestamp trigger helper
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_bet_signals_updated_at'
    ) THEN
        CREATE TRIGGER update_bet_signals_updated_at BEFORE UPDATE ON bet_signals
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_profiles_updated_at'
    ) THEN
        CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_oiage_state_updated_at'
    ) THEN
        CREATE TRIGGER update_oiage_state_updated_at BEFORE UPDATE ON oiage_state
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
