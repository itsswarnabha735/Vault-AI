-- ============================================
-- Vault-AI Seed Data
-- ============================================
-- This file contains sample data for development and demo purposes.
-- DO NOT run this in production with real users.
-- ============================================

-- Note: In Supabase, seed data runs after all migrations.
-- Since we use RLS, we need to run this as a specific user.
-- For demo purposes, we create a demo user if it doesn't exist.

-- ============================================
-- Demo Categories (for new user onboarding)
-- ============================================
-- Default categories are created via the create_default_categories() function
-- when a user first signs up. This seed is for demo/testing purposes.

-- Create a demo function to seed data for a specific user
CREATE OR REPLACE FUNCTION seed_demo_data(demo_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cat_food_id UUID;
    cat_transport_id UUID;
    cat_shopping_id UUID;
    cat_entertainment_id UUID;
    cat_healthcare_id UUID;
    cat_utilities_id UUID;
    cat_travel_id UUID;
    cat_income_id UUID;
    cat_other_id UUID;
BEGIN
    -- Check if user already has data
    IF EXISTS (SELECT 1 FROM transactions WHERE user_id = demo_user_id) THEN
        RAISE NOTICE 'User already has data, skipping seed';
        RETURN;
    END IF;

    -- ========================================
    -- Insert Categories
    -- ========================================
    INSERT INTO categories (id, user_id, name, icon, color, sort_order, is_default) VALUES
        (gen_random_uuid(), demo_user_id, 'Food & Dining', '🍽️', '#f59e0b', 1, TRUE)
        RETURNING id INTO cat_food_id;
    
    INSERT INTO categories (id, user_id, name, icon, color, sort_order, is_default) VALUES
        (gen_random_uuid(), demo_user_id, 'Transportation', '🚗', '#3b82f6', 2, TRUE)
        RETURNING id INTO cat_transport_id;
    
    INSERT INTO categories (id, user_id, name, icon, color, sort_order, is_default) VALUES
        (gen_random_uuid(), demo_user_id, 'Shopping', '🛍️', '#ec4899', 3, TRUE)
        RETURNING id INTO cat_shopping_id;
    
    INSERT INTO categories (id, user_id, name, icon, color, sort_order, is_default) VALUES
        (gen_random_uuid(), demo_user_id, 'Entertainment', '🎬', '#8b5cf6', 4, TRUE)
        RETURNING id INTO cat_entertainment_id;
    
    INSERT INTO categories (id, user_id, name, icon, color, sort_order, is_default) VALUES
        (gen_random_uuid(), demo_user_id, 'Healthcare', '🏥', '#ef4444', 5, TRUE)
        RETURNING id INTO cat_healthcare_id;
    
    INSERT INTO categories (id, user_id, name, icon, color, sort_order, is_default) VALUES
        (gen_random_uuid(), demo_user_id, 'Utilities', '💡', '#22c55e', 6, TRUE)
        RETURNING id INTO cat_utilities_id;
    
    INSERT INTO categories (id, user_id, name, icon, color, sort_order, is_default) VALUES
        (gen_random_uuid(), demo_user_id, 'Travel', '✈️', '#06b6d4', 7, TRUE)
        RETURNING id INTO cat_travel_id;
    
    INSERT INTO categories (id, user_id, name, icon, color, sort_order, is_default) VALUES
        (gen_random_uuid(), demo_user_id, 'Income', '💰', '#10b981', 8, TRUE)
        RETURNING id INTO cat_income_id;
    
    INSERT INTO categories (id, user_id, name, icon, color, sort_order, is_default) VALUES
        (gen_random_uuid(), demo_user_id, 'Other', '📦', '#6b7280', 99, TRUE)
        RETURNING id INTO cat_other_id;

    -- ========================================
    -- Insert Sample Transactions (Last 3 months)
    -- ========================================
    
    -- Income
    INSERT INTO transactions (user_id, date, amount, vendor, category_id, note, currency) VALUES
        (demo_user_id, CURRENT_DATE - 60, 5000.00, 'Salary', cat_income_id, 'Monthly salary', 'USD'),
        (demo_user_id, CURRENT_DATE - 30, 5000.00, 'Salary', cat_income_id, 'Monthly salary', 'USD'),
        (demo_user_id, CURRENT_DATE, 5000.00, 'Salary', cat_income_id, 'Monthly salary', 'USD');

    -- Food & Dining
    INSERT INTO transactions (user_id, date, amount, vendor, category_id, note, currency) VALUES
        (demo_user_id, CURRENT_DATE - 1, -45.99, 'Whole Foods Market', cat_food_id, 'Weekly groceries', 'USD'),
        (demo_user_id, CURRENT_DATE - 3, -32.50, 'Chipotle', cat_food_id, 'Lunch', 'USD'),
        (demo_user_id, CURRENT_DATE - 5, -78.00, 'Trader Joe''s', cat_food_id, 'Groceries', 'USD'),
        (demo_user_id, CURRENT_DATE - 8, -25.00, 'Starbucks', cat_food_id, 'Coffee and snacks', 'USD'),
        (demo_user_id, CURRENT_DATE - 12, -95.00, 'The Italian Place', cat_food_id, 'Dinner with friends', 'USD'),
        (demo_user_id, CURRENT_DATE - 15, -42.00, 'Safeway', cat_food_id, 'Groceries', 'USD'),
        (demo_user_id, CURRENT_DATE - 20, -18.50, 'Subway', cat_food_id, 'Lunch', 'USD'),
        (demo_user_id, CURRENT_DATE - 25, -65.00, 'Costco', cat_food_id, 'Bulk groceries', 'USD');

    -- Transportation
    INSERT INTO transactions (user_id, date, amount, vendor, category_id, note, currency) VALUES
        (demo_user_id, CURRENT_DATE - 2, -55.00, 'Shell Gas Station', cat_transport_id, 'Gas refill', 'USD'),
        (demo_user_id, CURRENT_DATE - 10, -15.00, 'Uber', cat_transport_id, 'Ride to airport', 'USD'),
        (demo_user_id, CURRENT_DATE - 18, -60.00, 'Shell Gas Station', cat_transport_id, 'Gas refill', 'USD'),
        (demo_user_id, CURRENT_DATE - 28, -45.00, 'Jiffy Lube', cat_transport_id, 'Oil change', 'USD');

    -- Shopping
    INSERT INTO transactions (user_id, date, amount, vendor, category_id, note, currency) VALUES
        (demo_user_id, CURRENT_DATE - 4, -129.99, 'Amazon', cat_shopping_id, 'Electronics', 'USD'),
        (demo_user_id, CURRENT_DATE - 11, -89.00, 'Target', cat_shopping_id, 'Home essentials', 'USD'),
        (demo_user_id, CURRENT_DATE - 22, -156.00, 'Nordstrom', cat_shopping_id, 'New shoes', 'USD');

    -- Entertainment
    INSERT INTO transactions (user_id, date, amount, vendor, category_id, note, currency) VALUES
        (demo_user_id, CURRENT_DATE - 6, -15.99, 'Netflix', cat_entertainment_id, 'Monthly subscription', 'USD'),
        (demo_user_id, CURRENT_DATE - 9, -35.00, 'AMC Theaters', cat_entertainment_id, 'Movie night', 'USD'),
        (demo_user_id, CURRENT_DATE - 14, -12.99, 'Spotify', cat_entertainment_id, 'Monthly subscription', 'USD');

    -- Healthcare
    INSERT INTO transactions (user_id, date, amount, vendor, category_id, note, currency) VALUES
        (demo_user_id, CURRENT_DATE - 7, -25.00, 'CVS Pharmacy', cat_healthcare_id, 'Prescriptions', 'USD'),
        (demo_user_id, CURRENT_DATE - 21, -150.00, 'Dr. Smith', cat_healthcare_id, 'Annual checkup copay', 'USD');

    -- Utilities
    INSERT INTO transactions (user_id, date, amount, vendor, category_id, note, currency) VALUES
        (demo_user_id, CURRENT_DATE - 1, -120.00, 'Pacific Gas & Electric', cat_utilities_id, 'Monthly bill', 'USD'),
        (demo_user_id, CURRENT_DATE - 1, -85.00, 'Comcast', cat_utilities_id, 'Internet', 'USD'),
        (demo_user_id, CURRENT_DATE - 1, -45.00, 'AT&T', cat_utilities_id, 'Phone bill', 'USD');

    -- Travel
    INSERT INTO transactions (user_id, date, amount, vendor, category_id, note, currency) VALUES
        (demo_user_id, CURRENT_DATE - 45, -450.00, 'Delta Airlines', cat_travel_id, 'Flight to NYC', 'USD'),
        (demo_user_id, CURRENT_DATE - 43, -180.00, 'Hilton Hotels', cat_travel_id, 'Hotel stay', 'USD');

    -- ========================================
    -- Insert Sample Budgets
    -- ========================================
    INSERT INTO budgets (user_id, category_id, name, amount, period, start_date) VALUES
        (demo_user_id, cat_food_id, 'Food Budget', 500.00, 'monthly', date_trunc('month', CURRENT_DATE)::DATE),
        (demo_user_id, cat_transport_id, 'Transport Budget', 200.00, 'monthly', date_trunc('month', CURRENT_DATE)::DATE),
        (demo_user_id, cat_entertainment_id, 'Entertainment Budget', 100.00, 'monthly', date_trunc('month', CURRENT_DATE)::DATE),
        (demo_user_id, cat_shopping_id, 'Shopping Budget', 300.00, 'monthly', date_trunc('month', CURRENT_DATE)::DATE),
        (demo_user_id, NULL, 'Total Monthly Budget', 2500.00, 'monthly', date_trunc('month', CURRENT_DATE)::DATE);

    -- ========================================
    -- Insert User Preferences
    -- ========================================
    INSERT INTO user_preferences (user_id) VALUES (demo_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    RAISE NOTICE 'Demo data seeded successfully for user %', demo_user_id;
END;
$$;

-- ============================================
-- Cleanup function
-- ============================================
-- Function to clean up demo data

CREATE OR REPLACE FUNCTION cleanup_demo_data(demo_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM transactions WHERE user_id = demo_user_id;
    DELETE FROM budgets WHERE user_id = demo_user_id;
    DELETE FROM categories WHERE user_id = demo_user_id;
    DELETE FROM user_preferences WHERE user_id = demo_user_id;
    DELETE FROM sync_metadata WHERE user_id = demo_user_id;
    DELETE FROM audit_log WHERE user_id = demo_user_id;
    
    RAISE NOTICE 'Demo data cleaned up for user %', demo_user_id;
END;
$$;

-- Grant execute to authenticated users (admin only in practice)
GRANT EXECUTE ON FUNCTION seed_demo_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_demo_data(UUID) TO authenticated;

-- ============================================
-- Instructions for Seeding
-- ============================================
-- To seed data for a specific user, run:
-- SELECT seed_demo_data('your-user-uuid-here');
--
-- To clean up demo data for a user, run:
-- SELECT cleanup_demo_data('your-user-uuid-here');
-- ============================================
