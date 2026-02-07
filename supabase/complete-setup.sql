-- ============================================
-- VAULT-AI COMPLETE DATABASE SETUP
-- ============================================
-- Run this script in your Supabase SQL Editor
-- Project: uxtptcxpcvnshscgyhhv
-- 
-- This combines all migrations into a single script
-- ============================================

-- ============================================
-- PART 1: Enable Extensions
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- PART 2: Create Tables
-- ============================================

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
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
    
    CONSTRAINT categories_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
    CONSTRAINT categories_color_format CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
    CONSTRAINT categories_no_self_parent CHECK (id != parent_id)
);

-- Transactions Table (NO raw text, embeddings, or file paths - privacy first!)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    vendor TEXT NOT NULL DEFAULT 'Unknown',
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    note TEXT DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'USD',
    is_manually_edited BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    client_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    server_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    
    CONSTRAINT transactions_amount_reasonable CHECK (amount > -100000000 AND amount < 100000000),
    CONSTRAINT transactions_vendor_length CHECK (char_length(vendor) >= 1 AND char_length(vendor) <= 500),
    CONSTRAINT transactions_currency_format CHECK (char_length(currency) = 3)
);

-- Budgets Table
CREATE TABLE IF NOT EXISTS budgets (
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
    
    CONSTRAINT budgets_amount_positive CHECK (amount > 0),
    CONSTRAINT budgets_period_valid CHECK (period IN ('weekly', 'monthly', 'yearly')),
    CONSTRAINT budgets_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 100)
);

-- User Preferences Table
CREATE TABLE IF NOT EXISTS user_preferences (
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
    
    CONSTRAINT preferences_theme_valid CHECK (theme IN ('light', 'dark', 'system')),
    CONSTRAINT preferences_currency_format CHECK (char_length(default_currency) = 3),
    CONSTRAINT preferences_anomaly_threshold_range CHECK (anomaly_threshold >= 0 AND anomaly_threshold <= 100)
);

-- Sync Metadata Table
CREATE TABLE IF NOT EXISTS sync_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT,
    last_sync_at TIMESTAMPTZ,
    last_sync_version INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT sync_metadata_user_device_unique UNIQUE (user_id, device_id)
);

-- Audit Log Table
CREATE TABLE IF NOT EXISTS audit_log (
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

-- ============================================
-- PART 3: Create Indexes
-- ============================================

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_is_default ON categories(is_default) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS idx_categories_name_trgm ON categories USING gin(name gin_trgm_ops);

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor_trgm ON transactions USING gin(vendor gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount);
CREATE INDEX IF NOT EXISTS idx_transactions_not_deleted ON transactions(user_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_transactions_client_updated ON transactions(client_updated_at);

-- Budgets indexes
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_category_id ON budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_active ON budgets(user_id) WHERE is_active = TRUE AND is_deleted = FALSE;

-- User preferences index
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Sync metadata indexes
CREATE INDEX IF NOT EXISTS idx_sync_metadata_user_id ON sync_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_metadata_device_id ON sync_metadata(device_id);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- ============================================
-- PART 4: Create Trigger Functions
-- ============================================

-- Updated At Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Transaction Timestamps Trigger Function
CREATE OR REPLACE FUNCTION update_transaction_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    NEW.server_updated_at = NOW();
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 5: Create Triggers
-- ============================================

-- Drop existing triggers if they exist (to avoid conflicts)
DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
DROP TRIGGER IF EXISTS update_budgets_updated_at ON budgets;
DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
DROP TRIGGER IF EXISTS update_sync_metadata_updated_at ON sync_metadata;
DROP TRIGGER IF EXISTS update_transactions_timestamps ON transactions;

-- Create triggers
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

CREATE TRIGGER update_transactions_timestamps
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_transaction_timestamps();

-- ============================================
-- PART 6: Enable Row Level Security
-- ============================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 7: Create RLS Policies
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS categories_select_policy ON categories;
DROP POLICY IF EXISTS categories_insert_policy ON categories;
DROP POLICY IF EXISTS categories_update_policy ON categories;
DROP POLICY IF EXISTS categories_delete_policy ON categories;

DROP POLICY IF EXISTS transactions_select_policy ON transactions;
DROP POLICY IF EXISTS transactions_insert_policy ON transactions;
DROP POLICY IF EXISTS transactions_update_policy ON transactions;
DROP POLICY IF EXISTS transactions_delete_policy ON transactions;

DROP POLICY IF EXISTS budgets_select_policy ON budgets;
DROP POLICY IF EXISTS budgets_insert_policy ON budgets;
DROP POLICY IF EXISTS budgets_update_policy ON budgets;
DROP POLICY IF EXISTS budgets_delete_policy ON budgets;

DROP POLICY IF EXISTS user_preferences_select_policy ON user_preferences;
DROP POLICY IF EXISTS user_preferences_insert_policy ON user_preferences;
DROP POLICY IF EXISTS user_preferences_update_policy ON user_preferences;
DROP POLICY IF EXISTS user_preferences_delete_policy ON user_preferences;

DROP POLICY IF EXISTS sync_metadata_select_policy ON sync_metadata;
DROP POLICY IF EXISTS sync_metadata_insert_policy ON sync_metadata;
DROP POLICY IF EXISTS sync_metadata_update_policy ON sync_metadata;
DROP POLICY IF EXISTS sync_metadata_delete_policy ON sync_metadata;

DROP POLICY IF EXISTS audit_log_select_policy ON audit_log;
DROP POLICY IF EXISTS audit_log_insert_policy ON audit_log;

-- Categories Policies
CREATE POLICY categories_select_policy ON categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY categories_insert_policy ON categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY categories_update_policy ON categories FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY categories_delete_policy ON categories FOR DELETE USING (auth.uid() = user_id);

-- Transactions Policies
CREATE POLICY transactions_select_policy ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY transactions_insert_policy ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY transactions_update_policy ON transactions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY transactions_delete_policy ON transactions FOR DELETE USING (auth.uid() = user_id);

-- Budgets Policies
CREATE POLICY budgets_select_policy ON budgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY budgets_insert_policy ON budgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY budgets_update_policy ON budgets FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY budgets_delete_policy ON budgets FOR DELETE USING (auth.uid() = user_id);

-- User Preferences Policies
CREATE POLICY user_preferences_select_policy ON user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_preferences_insert_policy ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_preferences_update_policy ON user_preferences FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_preferences_delete_policy ON user_preferences FOR DELETE USING (auth.uid() = user_id);

-- Sync Metadata Policies
CREATE POLICY sync_metadata_select_policy ON sync_metadata FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY sync_metadata_insert_policy ON sync_metadata FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY sync_metadata_update_policy ON sync_metadata FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY sync_metadata_delete_policy ON sync_metadata FOR DELETE USING (auth.uid() = user_id);

-- Audit Log Policies (read and insert only - logs are immutable)
CREATE POLICY audit_log_select_policy ON audit_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY audit_log_insert_policy ON audit_log FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- PART 8: Grant Permissions
-- ============================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON categories TO authenticated;
GRANT ALL ON transactions TO authenticated;
GRANT ALL ON budgets TO authenticated;
GRANT ALL ON user_preferences TO authenticated;
GRANT ALL ON sync_metadata TO authenticated;
GRANT INSERT, SELECT ON audit_log TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================
-- PART 9: Create Helper Functions
-- ============================================

-- Function: Get Spending by Category
CREATE OR REPLACE FUNCTION get_spending_by_category(
    start_date DATE,
    end_date DATE
)
RETURNS TABLE (
    category_id UUID,
    category_name TEXT,
    category_icon TEXT,
    category_color TEXT,
    total_amount NUMERIC,
    transaction_count INTEGER,
    average_amount NUMERIC,
    percentage_of_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    total_spending NUMERIC;
BEGIN
    SELECT COALESCE(SUM(ABS(t.amount)), 0)
    INTO total_spending
    FROM transactions t
    WHERE t.user_id = auth.uid()
        AND t.date BETWEEN start_date AND end_date
        AND t.is_deleted = FALSE
        AND t.amount < 0;

    RETURN QUERY
    SELECT 
        c.id AS category_id,
        c.name AS category_name,
        c.icon AS category_icon,
        c.color AS category_color,
        COALESCE(SUM(ABS(t.amount)), 0)::NUMERIC AS total_amount,
        COUNT(t.id)::INTEGER AS transaction_count,
        CASE 
            WHEN COUNT(t.id) > 0 THEN (COALESCE(SUM(ABS(t.amount)), 0) / COUNT(t.id))::NUMERIC
            ELSE 0
        END AS average_amount,
        CASE 
            WHEN total_spending > 0 THEN (COALESCE(SUM(ABS(t.amount)), 0) / total_spending * 100)::NUMERIC
            ELSE 0
        END AS percentage_of_total
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id
        AND t.user_id = auth.uid()
        AND t.date BETWEEN start_date AND end_date
        AND t.is_deleted = FALSE
        AND t.amount < 0
    WHERE c.user_id = auth.uid()
        AND c.is_deleted = FALSE
    GROUP BY c.id, c.name, c.icon, c.color
    ORDER BY total_amount DESC;
END;
$$;

-- Function: Get Budget Status
CREATE OR REPLACE FUNCTION get_budget_status()
RETURNS TABLE (
    budget_id UUID,
    budget_name TEXT,
    category_id UUID,
    category_name TEXT,
    budget_amount NUMERIC,
    spent_amount NUMERIC,
    remaining_amount NUMERIC,
    percentage_used NUMERIC,
    period TEXT,
    period_start DATE,
    period_end DATE,
    days_remaining INTEGER,
    daily_allowance NUMERIC,
    is_exceeded BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_date_val DATE := CURRENT_DATE;
BEGIN
    RETURN QUERY
    WITH budget_periods AS (
        SELECT
            b.id,
            b.name,
            b.category_id,
            b.amount,
            b.period,
            CASE b.period
                WHEN 'weekly' THEN date_trunc('week', current_date_val)::DATE
                WHEN 'monthly' THEN date_trunc('month', current_date_val)::DATE
                WHEN 'yearly' THEN date_trunc('year', current_date_val)::DATE
            END AS period_start_date,
            CASE b.period
                WHEN 'weekly' THEN (date_trunc('week', current_date_val) + INTERVAL '6 days')::DATE
                WHEN 'monthly' THEN (date_trunc('month', current_date_val) + INTERVAL '1 month' - INTERVAL '1 day')::DATE
                WHEN 'yearly' THEN (date_trunc('year', current_date_val) + INTERVAL '1 year' - INTERVAL '1 day')::DATE
            END AS period_end_date
        FROM budgets b
        WHERE b.user_id = auth.uid()
            AND b.is_active = TRUE
            AND b.is_deleted = FALSE
    ),
    budget_spending AS (
        SELECT
            bp.id,
            COALESCE(SUM(ABS(t.amount)), 0)::NUMERIC AS spent
        FROM budget_periods bp
        LEFT JOIN transactions t ON (
            (bp.category_id IS NULL OR t.category_id = bp.category_id)
            AND t.user_id = auth.uid()
            AND t.date BETWEEN bp.period_start_date AND bp.period_end_date
            AND t.is_deleted = FALSE
            AND t.amount < 0
        )
        GROUP BY bp.id
    )
    SELECT
        bp.id AS budget_id,
        bp.name AS budget_name,
        bp.category_id,
        COALESCE(c.name, 'All Categories') AS category_name,
        bp.amount AS budget_amount,
        bs.spent AS spent_amount,
        (bp.amount - bs.spent)::NUMERIC AS remaining_amount,
        (bs.spent / bp.amount * 100)::NUMERIC AS percentage_used,
        bp.period,
        bp.period_start_date AS period_start,
        bp.period_end_date AS period_end,
        (bp.period_end_date - current_date_val)::INTEGER AS days_remaining,
        CASE
            WHEN (bp.period_end_date - current_date_val) > 0 
            THEN ((bp.amount - bs.spent) / (bp.period_end_date - current_date_val + 1))::NUMERIC
            ELSE 0
        END AS daily_allowance,
        bs.spent > bp.amount AS is_exceeded
    FROM budget_periods bp
    JOIN budget_spending bs ON bs.id = bp.id
    LEFT JOIN categories c ON c.id = bp.category_id
    ORDER BY percentage_used DESC;
END;
$$;

-- Function: Get Monthly Trend
CREATE OR REPLACE FUNCTION get_monthly_trend(
    months_back INTEGER DEFAULT 12
)
RETURNS TABLE (
    month DATE,
    total_income NUMERIC,
    total_expenses NUMERIC,
    net_amount NUMERIC,
    transaction_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        date_trunc('month', t.date)::DATE AS month,
        COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0)::NUMERIC AS total_income,
        COALESCE(SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END), 0)::NUMERIC AS total_expenses,
        COALESCE(SUM(t.amount), 0)::NUMERIC AS net_amount,
        COUNT(*)::INTEGER AS transaction_count
    FROM transactions t
    WHERE t.user_id = auth.uid()
        AND t.is_deleted = FALSE
        AND t.date >= date_trunc('month', CURRENT_DATE - (months_back || ' months')::INTERVAL)::DATE
    GROUP BY date_trunc('month', t.date)
    ORDER BY month ASC;
END;
$$;

-- Function: Get Top Vendors
CREATE OR REPLACE FUNCTION get_top_vendors(
    start_date DATE,
    end_date DATE,
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    vendor TEXT,
    total_amount NUMERIC,
    transaction_count INTEGER,
    average_amount NUMERIC,
    last_transaction_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.vendor,
        COALESCE(SUM(ABS(t.amount)), 0)::NUMERIC AS total_amount,
        COUNT(*)::INTEGER AS transaction_count,
        (COALESCE(SUM(ABS(t.amount)), 0) / COUNT(*))::NUMERIC AS average_amount,
        MAX(t.date)::DATE AS last_transaction_date
    FROM transactions t
    WHERE t.user_id = auth.uid()
        AND t.is_deleted = FALSE
        AND t.date BETWEEN start_date AND end_date
        AND t.amount < 0
    GROUP BY t.vendor
    ORDER BY total_amount DESC
    LIMIT limit_count;
END;
$$;

-- Function: Upsert Transaction (for sync)
CREATE OR REPLACE FUNCTION upsert_transaction(
    p_id UUID,
    p_date DATE,
    p_amount NUMERIC,
    p_vendor TEXT,
    p_category_id UUID,
    p_note TEXT,
    p_currency TEXT,
    p_is_manually_edited BOOLEAN,
    p_client_created_at TIMESTAMPTZ,
    p_client_updated_at TIMESTAMPTZ
)
RETURNS TABLE (
    id UUID,
    version INTEGER,
    server_updated_at TIMESTAMPTZ,
    conflict_detected BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    existing_record transactions%ROWTYPE;
    result_id UUID;
    result_version INTEGER;
    result_server_updated_at TIMESTAMPTZ;
    result_conflict BOOLEAN := FALSE;
BEGIN
    SELECT * INTO existing_record
    FROM transactions t
    WHERE t.id = p_id AND t.user_id = auth.uid();
    
    IF existing_record.id IS NOT NULL THEN
        IF existing_record.client_updated_at > p_client_updated_at THEN
            result_conflict := TRUE;
            result_id := existing_record.id;
            result_version := existing_record.version;
            result_server_updated_at := existing_record.server_updated_at;
        ELSE
            UPDATE transactions
            SET 
                date = p_date,
                amount = p_amount,
                vendor = p_vendor,
                category_id = p_category_id,
                note = p_note,
                currency = p_currency,
                is_manually_edited = p_is_manually_edited,
                client_updated_at = p_client_updated_at
            WHERE transactions.id = p_id AND transactions.user_id = auth.uid()
            RETURNING transactions.id, transactions.version, transactions.server_updated_at
            INTO result_id, result_version, result_server_updated_at;
        END IF;
    ELSE
        INSERT INTO transactions (
            id, user_id, date, amount, vendor, category_id, note, currency,
            is_manually_edited, client_created_at, client_updated_at
        ) VALUES (
            p_id, auth.uid(), p_date, p_amount, p_vendor, p_category_id, p_note, p_currency,
            p_is_manually_edited, p_client_created_at, p_client_updated_at
        )
        RETURNING transactions.id, transactions.version, transactions.server_updated_at
        INTO result_id, result_version, result_server_updated_at;
    END IF;
    
    RETURN QUERY SELECT result_id, result_version, result_server_updated_at, result_conflict;
END;
$$;

-- Function: Get Changes Since (for sync)
CREATE OR REPLACE FUNCTION get_changes_since(
    since_timestamp TIMESTAMPTZ
)
RETURNS TABLE (
    entity_type TEXT,
    entity_id UUID,
    operation TEXT,
    data JSONB,
    server_updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        'transaction'::TEXT AS entity_type,
        t.id AS entity_id,
        CASE WHEN t.is_deleted THEN 'delete' ELSE 'upsert' END AS operation,
        jsonb_build_object(
            'id', t.id,
            'date', t.date,
            'amount', t.amount,
            'vendor', t.vendor,
            'category_id', t.category_id,
            'note', t.note,
            'currency', t.currency,
            'is_manually_edited', t.is_manually_edited,
            'is_deleted', t.is_deleted,
            'version', t.version,
            'client_created_at', t.client_created_at,
            'client_updated_at', t.client_updated_at
        ) AS data,
        t.server_updated_at
    FROM transactions t
    WHERE t.user_id = auth.uid()
        AND t.server_updated_at > since_timestamp
    
    UNION ALL
    
    SELECT
        'category'::TEXT AS entity_type,
        c.id AS entity_id,
        CASE WHEN c.is_deleted THEN 'delete' ELSE 'upsert' END AS operation,
        jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'icon', c.icon,
            'color', c.color,
            'parent_id', c.parent_id,
            'sort_order', c.sort_order,
            'is_default', c.is_default,
            'is_deleted', c.is_deleted
        ) AS data,
        c.updated_at
    FROM categories c
    WHERE c.user_id = auth.uid()
        AND c.updated_at > since_timestamp
    
    UNION ALL
    
    SELECT
        'budget'::TEXT AS entity_type,
        b.id AS entity_id,
        CASE WHEN b.is_deleted THEN 'delete' ELSE 'upsert' END AS operation,
        jsonb_build_object(
            'id', b.id,
            'category_id', b.category_id,
            'name', b.name,
            'amount', b.amount,
            'period', b.period,
            'start_date', b.start_date,
            'is_active', b.is_active,
            'is_deleted', b.is_deleted
        ) AS data,
        b.updated_at
    FROM budgets b
    WHERE b.user_id = auth.uid()
        AND b.updated_at > since_timestamp
    
    ORDER BY server_updated_at ASC;
END;
$$;

-- Function: Create Default Categories
CREATE OR REPLACE FUNCTION create_default_categories()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_id_val UUID := auth.uid();
BEGIN
    IF EXISTS (SELECT 1 FROM categories WHERE user_id = user_id_val) THEN
        RETURN;
    END IF;

    INSERT INTO categories (user_id, name, icon, color, sort_order, is_default) VALUES
        (user_id_val, 'Food & Dining', '🍽️', '#f59e0b', 1, TRUE),
        (user_id_val, 'Transportation', '🚗', '#3b82f6', 2, TRUE),
        (user_id_val, 'Shopping', '🛍️', '#ec4899', 3, TRUE),
        (user_id_val, 'Entertainment', '🎬', '#8b5cf6', 4, TRUE),
        (user_id_val, 'Healthcare', '🏥', '#ef4444', 5, TRUE),
        (user_id_val, 'Utilities', '💡', '#22c55e', 6, TRUE),
        (user_id_val, 'Travel', '✈️', '#06b6d4', 7, TRUE),
        (user_id_val, 'Income', '💰', '#10b981', 8, TRUE),
        (user_id_val, 'Other', '📦', '#6b7280', 99, TRUE);
END;
$$;

-- Function: Initialize User
CREATE OR REPLACE FUNCTION initialize_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_id_val UUID := auth.uid();
BEGIN
    INSERT INTO user_preferences (user_id)
    VALUES (user_id_val)
    ON CONFLICT (user_id) DO NOTHING;
    
    PERFORM create_default_categories();
END;
$$;

-- Function: Delete User Data (GDPR compliance)
CREATE OR REPLACE FUNCTION delete_user_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_id_val UUID := auth.uid();
BEGIN
    UPDATE transactions 
    SET is_deleted = TRUE, vendor = '[DELETED]', note = ''
    WHERE user_id = user_id_val;
    
    UPDATE categories
    SET is_deleted = TRUE, name = '[DELETED]'
    WHERE user_id = user_id_val;
    
    UPDATE budgets
    SET is_deleted = TRUE, name = '[DELETED]'
    WHERE user_id = user_id_val;
    
    DELETE FROM user_preferences WHERE user_id = user_id_val;
    DELETE FROM sync_metadata WHERE user_id = user_id_val;
    
    INSERT INTO audit_log (user_id, action, entity_type)
    VALUES (user_id_val, 'user_data_deleted', 'user');
END;
$$;

-- Function: Get Dashboard Summary
CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS TABLE (
    total_transactions INTEGER,
    total_income NUMERIC,
    total_expenses NUMERIC,
    net_balance NUMERIC,
    this_month_income NUMERIC,
    this_month_expenses NUMERIC,
    this_month_net NUMERIC,
    active_budgets INTEGER,
    exceeded_budgets INTEGER,
    categories_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    month_start DATE := date_trunc('month', CURRENT_DATE)::DATE;
    month_end DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*)::INTEGER FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE),
        (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE AND t.amount > 0),
        (SELECT COALESCE(SUM(ABS(amount)), 0)::NUMERIC FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE AND t.amount < 0),
        (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE),
        (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE 
         AND t.date BETWEEN month_start AND month_end AND t.amount > 0),
        (SELECT COALESCE(SUM(ABS(amount)), 0)::NUMERIC FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE 
         AND t.date BETWEEN month_start AND month_end AND t.amount < 0),
        (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE 
         AND t.date BETWEEN month_start AND month_end),
        (SELECT COUNT(*)::INTEGER FROM budgets b 
         WHERE b.user_id = auth.uid() AND b.is_active = TRUE AND b.is_deleted = FALSE),
        (SELECT COUNT(*)::INTEGER FROM get_budget_status() WHERE is_exceeded = TRUE),
        (SELECT COUNT(*)::INTEGER FROM categories c 
         WHERE c.user_id = auth.uid() AND c.is_deleted = FALSE);
END;
$$;

-- ============================================
-- PART 10: Grant Function Permissions
-- ============================================

GRANT EXECUTE ON FUNCTION get_spending_by_category(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_budget_status() TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_trend(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_vendors(DATE, DATE, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_transaction(UUID, DATE, NUMERIC, TEXT, UUID, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_changes_since(TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION create_default_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_user() TO authenticated;
GRANT EXECUTE ON FUNCTION delete_user_data() TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_summary() TO authenticated;

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- Your Vault-AI database is now ready.
-- 
-- Tables created:
--   - categories (with RLS)
--   - transactions (with RLS)
--   - budgets (with RLS)
--   - user_preferences (with RLS)
--   - sync_metadata (with RLS)
--   - audit_log (with RLS)
--
-- Functions created:
--   - get_spending_by_category()
--   - get_budget_status()
--   - get_monthly_trend()
--   - get_top_vendors()
--   - upsert_transaction()
--   - get_changes_since()
--   - create_default_categories()
--   - initialize_user()
--   - delete_user_data()
--   - get_dashboard_summary()
-- ============================================
