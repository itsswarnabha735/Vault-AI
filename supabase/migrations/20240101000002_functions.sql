-- ============================================
-- Vault-AI Database Functions Migration
-- ============================================
-- This migration creates helper functions for analytics,
-- budgets, and data management.
-- ============================================

-- ============================================
-- Function: Get Spending by Category
-- ============================================
-- Returns spending breakdown by category for a date range

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
    -- Calculate total spending for percentage calculation
    SELECT COALESCE(SUM(ABS(t.amount)), 0)
    INTO total_spending
    FROM transactions t
    WHERE t.user_id = auth.uid()
        AND t.date BETWEEN start_date AND end_date
        AND t.is_deleted = FALSE
        AND t.amount < 0; -- Only expenses

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
        AND t.amount < 0 -- Only expenses
    WHERE c.user_id = auth.uid()
        AND c.is_deleted = FALSE
    GROUP BY c.id, c.name, c.icon, c.color
    ORDER BY total_amount DESC;
END;
$$;

-- ============================================
-- Function: Get Budget Status
-- ============================================
-- Returns current status of all active budgets

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
            -- Calculate period start based on budget type
            CASE b.period
                WHEN 'weekly' THEN date_trunc('week', current_date_val)::DATE
                WHEN 'monthly' THEN date_trunc('month', current_date_val)::DATE
                WHEN 'yearly' THEN date_trunc('year', current_date_val)::DATE
            END AS period_start_date,
            -- Calculate period end based on budget type
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
            -- Match category if specified, otherwise match all
            (bp.category_id IS NULL OR t.category_id = bp.category_id)
            AND t.user_id = auth.uid()
            AND t.date BETWEEN bp.period_start_date AND bp.period_end_date
            AND t.is_deleted = FALSE
            AND t.amount < 0 -- Only expenses
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

-- ============================================
-- Function: Get Monthly Trend
-- ============================================
-- Returns monthly spending trend for the last N months

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

-- ============================================
-- Function: Get Top Vendors
-- ============================================
-- Returns top spending vendors for a date range

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
        AND t.amount < 0 -- Only expenses
    GROUP BY t.vendor
    ORDER BY total_amount DESC
    LIMIT limit_count;
END;
$$;

-- ============================================
-- Function: Upsert Transaction (for sync)
-- ============================================
-- Handles insert or update with conflict resolution

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
    -- Check for existing record
    SELECT * INTO existing_record
    FROM transactions t
    WHERE t.id = p_id AND t.user_id = auth.uid();
    
    IF existing_record.id IS NOT NULL THEN
        -- Record exists - check for conflicts
        IF existing_record.client_updated_at > p_client_updated_at THEN
            -- Server has newer version - conflict
            result_conflict := TRUE;
            result_id := existing_record.id;
            result_version := existing_record.version;
            result_server_updated_at := existing_record.server_updated_at;
        ELSE
            -- Client has newer version - update
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
        -- New record - insert
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

-- ============================================
-- Function: Get Changes Since
-- ============================================
-- Returns all changes since a given timestamp for sync

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
    -- Get transaction changes
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
    
    -- Get category changes
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
    
    -- Get budget changes
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

-- ============================================
-- Function: Create Default Categories
-- ============================================
-- Creates default categories for a new user

CREATE OR REPLACE FUNCTION create_default_categories()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_id_val UUID := auth.uid();
BEGIN
    -- Check if user already has categories
    IF EXISTS (SELECT 1 FROM categories WHERE user_id = user_id_val) THEN
        RETURN;
    END IF;

    -- Insert default categories
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

-- ============================================
-- Function: Initialize User
-- ============================================
-- Sets up a new user with default data

CREATE OR REPLACE FUNCTION initialize_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_id_val UUID := auth.uid();
BEGIN
    -- Create default preferences if not exists
    INSERT INTO user_preferences (user_id)
    VALUES (user_id_val)
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Create default categories
    PERFORM create_default_categories();
END;
$$;

-- ============================================
-- Function: Delete User Data
-- ============================================
-- Soft deletes all user data (GDPR compliance)

CREATE OR REPLACE FUNCTION delete_user_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_id_val UUID := auth.uid();
BEGIN
    -- Soft delete all transactions
    UPDATE transactions 
    SET is_deleted = TRUE, vendor = '[DELETED]', note = ''
    WHERE user_id = user_id_val;
    
    -- Soft delete all categories
    UPDATE categories
    SET is_deleted = TRUE, name = '[DELETED]'
    WHERE user_id = user_id_val;
    
    -- Soft delete all budgets
    UPDATE budgets
    SET is_deleted = TRUE, name = '[DELETED]'
    WHERE user_id = user_id_val;
    
    -- Delete preferences
    DELETE FROM user_preferences WHERE user_id = user_id_val;
    
    -- Delete sync metadata
    DELETE FROM sync_metadata WHERE user_id = user_id_val;
    
    -- Log the deletion
    INSERT INTO audit_log (user_id, action, entity_type)
    VALUES (user_id_val, 'user_data_deleted', 'user');
END;
$$;

-- ============================================
-- Function: Get Dashboard Summary
-- ============================================
-- Returns summary data for the dashboard

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
        -- All-time totals
        (SELECT COUNT(*)::INTEGER FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE),
        (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE AND t.amount > 0),
        (SELECT COALESCE(SUM(ABS(amount)), 0)::NUMERIC FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE AND t.amount < 0),
        (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE),
        
        -- This month totals
        (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE 
         AND t.date BETWEEN month_start AND month_end AND t.amount > 0),
        (SELECT COALESCE(SUM(ABS(amount)), 0)::NUMERIC FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE 
         AND t.date BETWEEN month_start AND month_end AND t.amount < 0),
        (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM transactions t 
         WHERE t.user_id = auth.uid() AND t.is_deleted = FALSE 
         AND t.date BETWEEN month_start AND month_end),
        
        -- Budgets
        (SELECT COUNT(*)::INTEGER FROM budgets b 
         WHERE b.user_id = auth.uid() AND b.is_active = TRUE AND b.is_deleted = FALSE),
        (SELECT COUNT(*)::INTEGER FROM get_budget_status() WHERE is_exceeded = TRUE),
        
        -- Categories
        (SELECT COUNT(*)::INTEGER FROM categories c 
         WHERE c.user_id = auth.uid() AND c.is_deleted = FALSE);
END;
$$;

-- ============================================
-- Grant Execute Permissions
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
