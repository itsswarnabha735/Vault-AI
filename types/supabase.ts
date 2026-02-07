/**
 * Supabase Database Types
 *
 * This file contains TypeScript types generated from the Supabase schema.
 * Regenerate this file after schema changes using:
 *
 *   supabase gen types typescript --linked > types/supabase.ts
 *
 * Or for local development:
 *
 *   supabase gen types typescript --local > types/supabase.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      vault_categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          icon: string;
          color: string;
          parent_id: string | null;
          sort_order: number;
          is_default: boolean;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          icon?: string;
          color?: string;
          parent_id?: string | null;
          sort_order?: number;
          is_default?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          icon?: string;
          color?: string;
          parent_id?: string | null;
          sort_order?: number;
          is_default?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vault_categories_parent_id_fkey';
            columns: ['parent_id'];
            referencedRelation: 'vault_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vault_categories_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      vault_transactions: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          amount: number;
          vendor: string;
          category_id: string | null;
          note: string;
          currency: string;
          is_manually_edited: boolean;
          is_deleted: boolean;
          client_created_at: string;
          client_updated_at: string;
          server_created_at: string;
          server_updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          amount: number;
          vendor?: string;
          category_id?: string | null;
          note?: string;
          currency?: string;
          is_manually_edited?: boolean;
          is_deleted?: boolean;
          client_created_at?: string;
          client_updated_at?: string;
          server_created_at?: string;
          server_updated_at?: string;
          version?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          amount?: number;
          vendor?: string;
          category_id?: string | null;
          note?: string;
          currency?: string;
          is_manually_edited?: boolean;
          is_deleted?: boolean;
          client_created_at?: string;
          client_updated_at?: string;
          server_created_at?: string;
          server_updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'vault_transactions_category_id_fkey';
            columns: ['category_id'];
            referencedRelation: 'vault_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vault_transactions_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      vault_budgets: {
        Row: {
          id: string;
          user_id: string;
          category_id: string | null;
          name: string;
          amount: number;
          period: string;
          start_date: string;
          is_active: boolean;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id?: string | null;
          name?: string;
          amount: number;
          period?: string;
          start_date?: string;
          is_active?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category_id?: string | null;
          name?: string;
          amount?: number;
          period?: string;
          start_date?: string;
          is_active?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vault_budgets_category_id_fkey';
            columns: ['category_id'];
            referencedRelation: 'vault_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vault_budgets_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      vault_user_preferences: {
        Row: {
          id: string;
          user_id: string;
          theme: string;
          default_currency: string;
          timezone: string;
          sync_enabled: boolean;
          anomaly_detection_enabled: boolean;
          anomaly_threshold: number;
          date_format: string;
          number_locale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          theme?: string;
          default_currency?: string;
          timezone?: string;
          sync_enabled?: boolean;
          anomaly_detection_enabled?: boolean;
          anomaly_threshold?: number;
          date_format?: string;
          number_locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          theme?: string;
          default_currency?: string;
          timezone?: string;
          sync_enabled?: boolean;
          anomaly_detection_enabled?: boolean;
          anomaly_threshold?: number;
          date_format?: string;
          number_locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vault_user_preferences_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      vault_sync_metadata: {
        Row: {
          id: string;
          user_id: string;
          device_id: string;
          device_name: string | null;
          last_sync_at: string | null;
          last_sync_version: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          device_id: string;
          device_name?: string | null;
          last_sync_at?: string | null;
          last_sync_version?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          device_id?: string;
          device_name?: string | null;
          last_sync_at?: string | null;
          last_sync_version?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vault_sync_metadata_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      // Legacy tables (from other project, kept for compatibility)
      audit_log: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          entity_type: string;
          entity_id: string | null;
          old_values: Json | null;
          new_values: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      budgets: {
        Row: {
          id: string;
          user_id: string;
          category_id: string | null;
          name: string;
          amount: number;
          period: string;
          start_date: string;
          is_active: boolean;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id?: string | null;
          name?: string;
          amount: number;
          period?: string;
          start_date?: string;
          is_active?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category_id?: string | null;
          name?: string;
          amount?: number;
          period?: string;
          start_date?: string;
          is_active?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'budgets_category_id_fkey';
            columns: ['category_id'];
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'budgets_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          icon: string;
          color: string;
          parent_id: string | null;
          sort_order: number;
          is_default: boolean;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          icon?: string;
          color?: string;
          parent_id?: string | null;
          sort_order?: number;
          is_default?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          icon?: string;
          color?: string;
          parent_id?: string | null;
          sort_order?: number;
          is_default?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'categories_parent_id_fkey';
            columns: ['parent_id'];
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'categories_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      sync_metadata: {
        Row: {
          id: string;
          user_id: string;
          device_id: string;
          device_name: string | null;
          last_sync_at: string | null;
          last_sync_version: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          device_id: string;
          device_name?: string | null;
          last_sync_at?: string | null;
          last_sync_version?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          device_id?: string;
          device_name?: string | null;
          last_sync_at?: string | null;
          last_sync_version?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sync_metadata_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          amount: number;
          vendor: string;
          category_id: string | null;
          note: string;
          currency: string;
          is_manually_edited: boolean;
          is_deleted: boolean;
          client_created_at: string;
          client_updated_at: string;
          server_created_at: string;
          server_updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          amount: number;
          vendor?: string;
          category_id?: string | null;
          note?: string;
          currency?: string;
          is_manually_edited?: boolean;
          is_deleted?: boolean;
          client_created_at?: string;
          client_updated_at?: string;
          server_created_at?: string;
          server_updated_at?: string;
          version?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          amount?: number;
          vendor?: string;
          category_id?: string | null;
          note?: string;
          currency?: string;
          is_manually_edited?: boolean;
          is_deleted?: boolean;
          client_created_at?: string;
          client_updated_at?: string;
          server_created_at?: string;
          server_updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_category_id_fkey';
            columns: ['category_id'];
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      user_preferences: {
        Row: {
          id: string;
          user_id: string;
          theme: string;
          default_currency: string;
          timezone: string;
          sync_enabled: boolean;
          anomaly_detection_enabled: boolean;
          anomaly_threshold: number;
          date_format: string;
          number_locale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          theme?: string;
          default_currency?: string;
          timezone?: string;
          sync_enabled?: boolean;
          anomaly_detection_enabled?: boolean;
          anomaly_threshold?: number;
          date_format?: string;
          number_locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          theme?: string;
          default_currency?: string;
          timezone?: string;
          sync_enabled?: boolean;
          anomaly_detection_enabled?: boolean;
          anomaly_threshold?: number;
          date_format?: string;
          number_locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_preferences_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      cleanup_demo_data: {
        Args: {
          demo_user_id: string;
        };
        Returns: undefined;
      };
      create_default_categories: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      delete_user_data: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      get_budget_status: {
        Args: Record<PropertyKey, never>;
        Returns: {
          budget_id: string;
          budget_name: string;
          category_id: string | null;
          category_name: string;
          budget_amount: number;
          spent_amount: number;
          remaining_amount: number;
          percentage_used: number;
          period: string;
          period_start: string;
          period_end: string;
          days_remaining: number;
          daily_allowance: number;
          is_exceeded: boolean;
        }[];
      };
      get_changes_since: {
        Args: {
          since_timestamp: string;
        };
        Returns: {
          entity_type: string;
          entity_id: string;
          operation: string;
          data: Json;
          server_updated_at: string;
        }[];
      };
      get_dashboard_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          total_transactions: number;
          total_income: number;
          total_expenses: number;
          net_balance: number;
          this_month_income: number;
          this_month_expenses: number;
          this_month_net: number;
          active_budgets: number;
          exceeded_budgets: number;
          categories_count: number;
        }[];
      };
      get_monthly_trend: {
        Args: {
          months_back?: number;
        };
        Returns: {
          month: string;
          total_income: number;
          total_expenses: number;
          net_amount: number;
          transaction_count: number;
        }[];
      };
      get_spending_by_category: {
        Args: {
          start_date: string;
          end_date: string;
        };
        Returns: {
          category_id: string;
          category_name: string;
          category_icon: string;
          category_color: string;
          total_amount: number;
          transaction_count: number;
          average_amount: number;
          percentage_of_total: number;
        }[];
      };
      get_top_vendors: {
        Args: {
          start_date: string;
          end_date: string;
          limit_count?: number;
        };
        Returns: {
          vendor: string;
          total_amount: number;
          transaction_count: number;
          average_amount: number;
          last_transaction_date: string;
        }[];
      };
      initialize_user: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      seed_demo_data: {
        Args: {
          demo_user_id: string;
        };
        Returns: undefined;
      };
      upsert_transaction: {
        Args: {
          p_id: string;
          p_date: string;
          p_amount: number;
          p_vendor: string;
          p_category_id: string | null;
          p_note: string;
          p_currency: string;
          p_is_manually_edited: boolean;
          p_client_created_at: string;
          p_client_updated_at: string;
        };
        Returns: {
          id: string;
          version: number;
          server_updated_at: string;
          conflict_detected: boolean;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// ============================================
// Helper Types
// ============================================

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Functions<T extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][T];

// ============================================
// Convenience Aliases
// ============================================

export type VaultTransaction = Tables<'vault_transactions'>;
export type VaultTransactionInsert = InsertTables<'vault_transactions'>;
export type VaultTransactionUpdate = UpdateTables<'vault_transactions'>;

export type VaultCategory = Tables<'vault_categories'>;
export type VaultCategoryInsert = InsertTables<'vault_categories'>;
export type VaultCategoryUpdate = UpdateTables<'vault_categories'>;

export type VaultBudget = Tables<'vault_budgets'>;
export type VaultBudgetInsert = InsertTables<'vault_budgets'>;
export type VaultBudgetUpdate = UpdateTables<'vault_budgets'>;

export type VaultUserPreferences = Tables<'vault_user_preferences'>;
export type VaultUserPreferencesInsert = InsertTables<'vault_user_preferences'>;
export type VaultUserPreferencesUpdate = UpdateTables<'vault_user_preferences'>;

export type VaultSyncMetadata = Tables<'vault_sync_metadata'>;
export type VaultSyncMetadataInsert = InsertTables<'vault_sync_metadata'>;
export type VaultSyncMetadataUpdate = UpdateTables<'vault_sync_metadata'>;

// Legacy aliases (for backwards compatibility)
export type Transaction = VaultTransaction;
export type TransactionInsert = VaultTransactionInsert;
export type TransactionUpdate = VaultTransactionUpdate;

export type Category = VaultCategory;
export type CategoryInsert = VaultCategoryInsert;
export type CategoryUpdate = VaultCategoryUpdate;

export type Budget = VaultBudget;
export type BudgetInsert = VaultBudgetInsert;
export type BudgetUpdate = VaultBudgetUpdate;

export type UserPreferences = VaultUserPreferences;
export type UserPreferencesInsert = VaultUserPreferencesInsert;
export type UserPreferencesUpdate = VaultUserPreferencesUpdate;

export type SyncMetadata = VaultSyncMetadata;
export type SyncMetadataInsert = VaultSyncMetadataInsert;
export type SyncMetadataUpdate = VaultSyncMetadataUpdate;

export type AuditLog = Tables<'audit_log'>;
export type AuditLogInsert = InsertTables<'audit_log'>;

// ============================================
// Function Return Types
// ============================================

export type SpendingByCategory = Functions<'get_spending_by_category'>['Returns'][number];
export type BudgetStatus = Functions<'get_budget_status'>['Returns'][number];
export type MonthlyTrend = Functions<'get_monthly_trend'>['Returns'][number];
export type TopVendor = Functions<'get_top_vendors'>['Returns'][number];
export type DashboardSummary = Functions<'get_dashboard_summary'>['Returns'][number];
export type ChangesResult = Functions<'get_changes_since'>['Returns'][number];
export type UpsertResult = Functions<'upsert_transaction'>['Returns'][number];
