# Supabase Configuration for Vault-AI

This directory contains all Supabase-related configuration, migrations, and seed data.

## Directory Structure

```
supabase/
├── migrations/              # Database migrations
│   ├── 20240101000001_initial_schema.sql
│   └── 20240101000002_functions.sql
├── config.toml             # Local development configuration
├── seed.sql                # Seed data for development/demo
└── README.md               # This file
```

## Quick Start

### Prerequisites

1. Install Supabase CLI:

   ```bash
   npm install -g supabase
   # or
   brew install supabase/tap/supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

### Local Development

1. Start local Supabase:

   ```bash
   supabase start
   ```

2. The CLI will output local credentials. Add them to `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
   ```

3. Access local services:
   - **API**: http://localhost:54321
   - **Studio**: http://localhost:54323
   - **Inbucket (Email)**: http://localhost:54324

### Production Deployment

1. Create a project at [supabase.com](https://supabase.com)

2. Link your project:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

3. Deploy migrations:

   ```bash
   supabase db push
   ```

4. Update `.env.local` with production credentials from Supabase Dashboard.

## Database Schema

### Tables

| Table              | Description                               |
| ------------------ | ----------------------------------------- |
| `categories`       | User spending categories                  |
| `transactions`     | Sanitized transaction data (no raw text!) |
| `budgets`          | Spending budget configurations            |
| `user_preferences` | User settings and preferences             |
| `sync_metadata`    | Device sync tracking                      |
| `audit_log`        | Action audit trail                        |

### Privacy Notes

⚠️ **CRITICAL**: The Supabase database only stores sanitized, structured data.

The following data is NEVER stored in Supabase:

- Raw document text (`rawText`)
- Vector embeddings (`embedding`)
- File paths (`filePath`)
- File sizes (`fileSize`)
- MIME types (`mimeType`)
- OCR output (`ocrOutput`)
- Confidence scores (`confidence`)

All of the above remain in the user's browser (IndexedDB + OPFS).

### Row Level Security (RLS)

All tables have RLS enabled with policies ensuring users can only access their own data:

```sql
-- Example policy
CREATE POLICY transactions_select_policy ON transactions
    FOR SELECT
    USING (auth.uid() = user_id);
```

## Database Functions

### Analytics Functions

| Function                                             | Description                          |
| ---------------------------------------------------- | ------------------------------------ |
| `get_spending_by_category(start_date, end_date)`     | Spending breakdown by category       |
| `get_budget_status()`                                | Current status of all active budgets |
| `get_monthly_trend(months_back)`                     | Monthly income/expense trend         |
| `get_top_vendors(start_date, end_date, limit_count)` | Top spending vendors                 |
| `get_dashboard_summary()`                            | Dashboard summary statistics         |

### Sync Functions

| Function                             | Description                           |
| ------------------------------------ | ------------------------------------- |
| `upsert_transaction(...)`            | Insert/update with conflict detection |
| `get_changes_since(since_timestamp)` | Get all changes for sync              |

### User Management Functions

| Function                      | Description                   |
| ----------------------------- | ----------------------------- |
| `initialize_user()`           | Set up new user with defaults |
| `create_default_categories()` | Create default category set   |
| `delete_user_data()`          | GDPR-compliant data deletion  |

### Demo Functions

| Function                     | Description                |
| ---------------------------- | -------------------------- |
| `seed_demo_data(user_id)`    | Seed demo data for testing |
| `cleanup_demo_data(user_id)` | Remove demo data           |

## Migrations

### Creating New Migrations

1. Create a new SQL file in `migrations/`:

   ```bash
   touch supabase/migrations/$(date +%Y%m%d%H%M%S)_description.sql
   ```

2. Write your SQL changes

3. Test locally:

   ```bash
   supabase db reset  # Reapplies all migrations
   ```

4. Deploy to production:
   ```bash
   supabase db push
   ```

### Migration Naming Convention

Format: `YYYYMMDDHHMMSS_description.sql`

Examples:

- `20240101000001_initial_schema.sql`
- `20240215143022_add_tags_table.sql`
- `20240301120000_create_reporting_views.sql`

## Type Generation

Generate TypeScript types from the database schema:

```bash
# From linked project
supabase gen types typescript --linked > types/supabase.ts

# From local database
supabase gen types typescript --local > types/supabase.ts
```

## Authentication

Vault-AI uses Supabase Auth with magic link authentication:

1. **Enable Email Provider** in Supabase Dashboard > Authentication > Providers

2. **Configure Email Templates** in Authentication > Email Templates:
   - Magic Link template
   - Confirm signup template

3. **Set Site URL** in Authentication > URL Configuration:

   ```
   http://localhost:3000 (development)
   https://your-domain.com (production)
   ```

4. **Add Redirect URLs**:
   ```
   http://localhost:3000/auth/callback
   https://your-domain.com/auth/callback
   ```

## Troubleshooting

### Common Issues

**RLS blocking access:**

```sql
-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'transactions';
```

**Function not found:**

```sql
-- Check function exists
SELECT proname FROM pg_proc WHERE proname = 'get_spending_by_category';
```

**Connection issues:**

- Verify credentials in `.env.local`
- Check Supabase project status at supabase.com

### Useful Commands

```bash
# Check local status
supabase status

# View logs
supabase logs

# Reset local database
supabase db reset

# Diff remote vs local
supabase db diff
```

## Security Checklist

- [ ] RLS enabled on all tables
- [ ] RLS policies reviewed and tested
- [ ] Service role key not exposed to client
- [ ] Anon key used only for public operations
- [ ] Sensitive fields not stored in database
- [ ] HTTPS enabled in production
- [ ] Rate limiting configured
- [ ] Audit logging enabled

## Support

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Discord](https://discord.supabase.com)
- [Vault-AI Issues](https://github.com/your-repo/vault-ai/issues)
