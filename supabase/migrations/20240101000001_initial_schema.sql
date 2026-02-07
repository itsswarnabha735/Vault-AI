-- ============================================
-- Vault-AI Initial Schema Migration
-- ============================================
-- This migration creates the cloud-synced tables for Vault-AI.
-- 
-- PRIVACY NOTE: This schema only stores sanitized, structured data.
-- Raw document text, embeddings, and file paths are NEVER stored here.
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- Categories Table
-- ============================================
-- User-defined and default spending categories

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '📦',
    color TEXT NOT NULL DEFAULT '#6b7280',
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT categories_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
    CONSTRAINT categories_color_format CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
    CONSTRAINT categories_no_self_parent CHECK (id != parent_id)
);

-- Indexes for categories
CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_categories_parent_id ON categories(parent_id);
CREATE INDEX idx_categories_is_default ON categories(is_default) WHERE is_default = TRUE;
CREATE INDEX idx_categories_name_trgm ON categories USING gin(name gin_trgm_ops);

-- ============================================
-- Transactions Table
-- ============================================
-- Sanitized transaction data (NO raw text, embeddings, or file paths)

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Core transaction data (ONLY synced fields)
    date DATE NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    vendor TEXT NOT NULL DEFAULT 'Unknown',
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    note TEXT DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'USD',
    
    -- Metadata
    is_manually_edited BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Sync tracking
    client_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    server_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Version for conflict resolution
    version INTEGER NOT NULL DEFAULT 1,
    
    -- Constraints
    CONSTRAINT transactions_amount_reasonable CHECK (amount > -100000000 AND amount < 100000000),
    CONSTRAINT transactions_vendor_length CHECK (char_length(vendor) >= 1 AND char_length(vendor) <= 500),
    CONSTRAINT transactions_currency_format CHECK (char_length(currency) = 3)
);

-- Indexes for transactions
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_vendor_trgm ON transactions USING gin(vendor gin_trgm_ops);
CREATE INDEX idx_transactions_amount ON transactions(amount);
CREATE INDEX idx_transactions_not_deleted ON transactions(user_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_transactions_client_updated ON transactions(client_updated_at);

-- ============================================
-- Budgets Table
-- ============================================
-- User spending budgets per category or total

CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Budget',
    amount NUMERIC(15, 2) NOT NULL,
    period TEXT NOT NULL DEFAULT 'monthly',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT budgets_amount_positive CHECK (amount > 0),
    CONSTRAINT budgets_period_valid CHECK (period IN ('weekly', 'monthly', 'yearly')),
    CONSTRAINT budgets_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 100)
);

-- Indexes for budgets
CREATE INDEX idx_budgets_user_id ON budgets(user_id);
CREATE INDEX idx_budgets_category_id ON budgets(category_id);
CREATE INDEX idx_budgets_active ON budgets(user_id) WHERE is_active = TRUE AND is_deleted = FALSE;

-- ============================================
-- User Preferences Table
-- ============================================
-- User settings that sync to cloud

CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    theme TEXT NOT NULL DEFAULT 'system',
    default_currency TEXT NOT NULL DEFAULT 'USD',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    anomaly_detection_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    anomaly_threshold NUMERIC(5, 2) NOT NULL DEFAULT 20.0,
    date_format TEXT NOT NULL DEFAULT 'yyyy-MM-dd',
    number_locale TEXT NOT NULL DEFAULT 'en-US',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT preferences_theme_valid CHECK (theme IN ('light', 'dark', 'system')),
    CONSTRAINT preferences_currency_format CHECK (char_length(default_currency) = 3),
    CONSTRAINT preferences_anomaly_threshold_range CHECK (anomaly_threshold >= 0 AND anomaly_threshold <= 100)
);

-- Index for user preferences
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- ============================================
-- Sync Metadata Table
-- ============================================
-- Tracks sync state per device

CREATE TABLE sync_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT,
    last_sync_at TIMESTAMPTZ,
    last_sync_version INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique per user per device
    CONSTRAINT sync_metadata_user_device_unique UNIQUE (user_id, device_id)
);

-- Index for sync metadata
CREATE INDEX idx_sync_metadata_user_id ON sync_metadata(user_id);
CREATE INDEX idx_sync_metadata_device_id ON sync_metadata(device_id);

-- ============================================
-- Audit Log Table
-- ============================================
-- Tracks important user actions for debugging

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for audit log
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- ============================================
-- Updated At Trigger Function
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budgets_updated_at
    BEFORE UPDATE ON budgets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_metadata_updated_at
    BEFORE UPDATE ON sync_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Special trigger for transactions to update server_updated_at
CREATE OR REPLACE FUNCTION update_transaction_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    NEW.server_updated_at = NOW();
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_transactions_timestamps
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_transaction_timestamps();

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: Categories
-- ============================================

-- Users can only see their own categories
CREATE POLICY categories_select_policy ON categories
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only insert their own categories
CREATE POLICY categories_insert_policy ON categories
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can only update their own categories
CREATE POLICY categories_update_policy ON categories
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own categories
CREATE POLICY categories_delete_policy ON categories
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- RLS Policies: Transactions
-- ============================================

-- Users can only see their own transactions
CREATE POLICY transactions_select_policy ON transactions
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only insert their own transactions
CREATE POLICY transactions_insert_policy ON transactions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can only update their own transactions
CREATE POLICY transactions_update_policy ON transactions
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own transactions
CREATE POLICY transactions_delete_policy ON transactions
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- RLS Policies: Budgets
-- ============================================

-- Users can only see their own budgets
CREATE POLICY budgets_select_policy ON budgets
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only insert their own budgets
CREATE POLICY budgets_insert_policy ON budgets
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can only update their own budgets
CREATE POLICY budgets_update_policy ON budgets
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own budgets
CREATE POLICY budgets_delete_policy ON budgets
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- RLS Policies: User Preferences
-- ============================================

-- Users can only see their own preferences
CREATE POLICY user_preferences_select_policy ON user_preferences
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only insert their own preferences
CREATE POLICY user_preferences_insert_policy ON user_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can only update their own preferences
CREATE POLICY user_preferences_update_policy ON user_preferences
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own preferences
CREATE POLICY user_preferences_delete_policy ON user_preferences
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- RLS Policies: Sync Metadata
-- ============================================

-- Users can only see their own sync metadata
CREATE POLICY sync_metadata_select_policy ON sync_metadata
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only insert their own sync metadata
CREATE POLICY sync_metadata_insert_policy ON sync_metadata
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can only update their own sync metadata
CREATE POLICY sync_metadata_update_policy ON sync_metadata
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own sync metadata
CREATE POLICY sync_metadata_delete_policy ON sync_metadata
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- RLS Policies: Audit Log
-- ============================================

-- Users can only see their own audit logs
CREATE POLICY audit_log_select_policy ON audit_log
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own audit logs
CREATE POLICY audit_log_insert_policy ON audit_log
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- No update or delete allowed on audit logs (immutable)

-- ============================================
-- Grant Permissions
-- ============================================

-- Grant usage on schema to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant all operations on tables to authenticated users (RLS will handle access control)
GRANT ALL ON categories TO authenticated;
GRANT ALL ON transactions TO authenticated;
GRANT ALL ON budgets TO authenticated;
GRANT ALL ON user_preferences TO authenticated;
GRANT ALL ON sync_metadata TO authenticated;
GRANT INSERT, SELECT ON audit_log TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
