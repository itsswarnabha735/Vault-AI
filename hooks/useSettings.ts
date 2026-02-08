/**
 * Settings Management Hook for Vault-AI
 *
 * Provides hooks for managing user settings including:
 * - Theme preferences
 * - Currency and timezone
 * - Sync settings
 * - Anomaly detection settings
 *
 * Settings are persisted to IndexedDB and optionally synced to cloud.
 * PRIVACY: Settings don't contain sensitive data and are safe to sync.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/lib/storage/db';
import type { UserSettings, UserId, Theme } from '@/types/database';
import { DEFAULT_USER_SETTINGS } from '@/types/database';

// ============================================
// Types
// ============================================

/**
 * Settings update payload.
 */
export type SettingsUpdate = Partial<
  Omit<UserSettings, 'id' | 'userId' | 'updatedAt'>
>;

/**
 * Return type for the useSettings hook.
 */
export interface UseSettingsReturn {
  /** Current user settings */
  settings: UserSettings;

  /** Whether settings are loading */
  isLoading: boolean;

  /** Error if loading failed */
  error: Error | null;

  /** Update settings */
  updateSettings: (updates: SettingsUpdate) => Promise<void>;

  /** Reset settings to defaults */
  resetSettings: () => Promise<void>;

  /** Whether settings are being saved */
  isSaving: boolean;
}

/**
 * Common currency options.
 */
export const CURRENCY_OPTIONS = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
] as const;

/**
 * Common timezone options grouped by region.
 */
export const TIMEZONE_OPTIONS = [
  // Americas
  {
    value: 'America/New_York',
    label: 'Eastern Time (US & Canada)',
    region: 'Americas',
  },
  {
    value: 'America/Chicago',
    label: 'Central Time (US & Canada)',
    region: 'Americas',
  },
  {
    value: 'America/Denver',
    label: 'Mountain Time (US & Canada)',
    region: 'Americas',
  },
  {
    value: 'America/Los_Angeles',
    label: 'Pacific Time (US & Canada)',
    region: 'Americas',
  },
  { value: 'America/Anchorage', label: 'Alaska', region: 'Americas' },
  { value: 'Pacific/Honolulu', label: 'Hawaii', region: 'Americas' },
  { value: 'America/Toronto', label: 'Toronto', region: 'Americas' },
  { value: 'America/Vancouver', label: 'Vancouver', region: 'Americas' },
  { value: 'America/Mexico_City', label: 'Mexico City', region: 'Americas' },
  { value: 'America/Sao_Paulo', label: 'Sao Paulo', region: 'Americas' },
  // Europe
  { value: 'Europe/London', label: 'London', region: 'Europe' },
  { value: 'Europe/Paris', label: 'Paris', region: 'Europe' },
  { value: 'Europe/Berlin', label: 'Berlin', region: 'Europe' },
  { value: 'Europe/Madrid', label: 'Madrid', region: 'Europe' },
  { value: 'Europe/Rome', label: 'Rome', region: 'Europe' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam', region: 'Europe' },
  { value: 'Europe/Moscow', label: 'Moscow', region: 'Europe' },
  // Asia
  { value: 'Asia/Tokyo', label: 'Tokyo', region: 'Asia' },
  { value: 'Asia/Shanghai', label: 'Beijing/Shanghai', region: 'Asia' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong', region: 'Asia' },
  { value: 'Asia/Singapore', label: 'Singapore', region: 'Asia' },
  { value: 'Asia/Seoul', label: 'Seoul', region: 'Asia' },
  { value: 'Asia/Kolkata', label: 'Mumbai/Kolkata', region: 'Asia' },
  { value: 'Asia/Dubai', label: 'Dubai', region: 'Asia' },
  // Oceania
  { value: 'Australia/Sydney', label: 'Sydney', region: 'Oceania' },
  { value: 'Australia/Melbourne', label: 'Melbourne', region: 'Oceania' },
  { value: 'Australia/Perth', label: 'Perth', region: 'Oceania' },
  { value: 'Pacific/Auckland', label: 'Auckland', region: 'Oceania' },
  // Other
  { value: 'UTC', label: 'UTC', region: 'Other' },
] as const;

/**
 * Date format options.
 */
export const DATE_FORMAT_OPTIONS = [
  { value: 'yyyy-MM-dd', label: '2024-12-31 (ISO)' },
  { value: 'MM/dd/yyyy', label: '12/31/2024 (US)' },
  { value: 'dd/MM/yyyy', label: '31/12/2024 (EU)' },
  { value: 'dd.MM.yyyy', label: '31.12.2024 (DE)' },
  { value: 'MMMM d, yyyy', label: 'December 31, 2024' },
  { value: 'd MMMM yyyy', label: '31 December 2024' },
] as const;

/**
 * Theme options.
 */
export const THEME_OPTIONS: Array<{
  value: Theme;
  label: string;
  icon: string;
}> = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'System', icon: '💻' },
];

// ============================================
// Default Settings
// ============================================

const DEFAULT_SETTINGS_ID = 'default';

function getDefaultSettings(): UserSettings {
  return {
    id: DEFAULT_SETTINGS_ID,
    ...DEFAULT_USER_SETTINGS,
    updatedAt: new Date(),
  };
}

// ============================================
// Main Hook
// ============================================

/**
 * Hook for managing user settings.
 *
 * @returns Settings state and update functions
 *
 * @example
 * ```tsx
 * const { settings, updateSettings, isSaving } = useSettings();
 *
 * // Update a single setting
 * await updateSettings({ theme: 'dark' });
 *
 * // Update multiple settings
 * await updateSettings({
 *   defaultCurrency: 'EUR',
 *   timezone: 'Europe/London',
 * });
 * ```
 */
export function useSettings(): UseSettingsReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Live query for settings
  const rawSettings = useLiveQuery(
    async () => {
      try {
        const settings = await db.settings.get(DEFAULT_SETTINGS_ID);
        return settings || null;
      } catch (err) {
        console.error('Failed to load settings:', err);
        return null;
      }
    },
    [],
    null
  );

  // Initialize settings if they don't exist
  useEffect(() => {
    const initSettings = async () => {
      try {
        const existing = await db.settings.get(DEFAULT_SETTINGS_ID);
        if (!existing) {
          // Create default settings
          await db.settings.add(getDefaultSettings());
        }
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize settings:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setIsLoading(false);
      }
    };

    initSettings();
  }, []);

  // Merge raw settings with defaults
  const settings = useMemo(() => {
    if (!rawSettings) {
      return getDefaultSettings();
    }
    return rawSettings;
  }, [rawSettings]);

  /**
   * Update settings.
   */
  const updateSettings = useCallback(async (updates: SettingsUpdate) => {
    setIsSaving(true);
    setError(null);

    try {
      await db.settings.update(DEFAULT_SETTINGS_ID, {
        ...updates,
        updatedAt: new Date(),
      });

      // Apply theme immediately if changed
      if (updates.theme) {
        applyTheme(updates.theme);
      }
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to update settings');
      setError(error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, []);

  /**
   * Reset settings to defaults.
   */
  const resetSettings = useCallback(async () => {
    setIsSaving(true);
    setError(null);

    try {
      await db.settings.put(getDefaultSettings());
      applyTheme('system');
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to reset settings');
      setError(error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, []);

  return {
    settings,
    isLoading,
    error,
    updateSettings,
    resetSettings,
    isSaving,
  };
}

// ============================================
// Theme Utilities
// ============================================

/**
 * Apply theme to the document.
 */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const systemPrefersDark = window.matchMedia(
    '(prefers-color-scheme: dark)'
  ).matches;

  if (theme === 'dark' || (theme === 'system' && systemPrefersDark)) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

/**
 * Hook to apply theme on mount and when system preference changes.
 */
export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => Promise<void>;
  resolvedTheme: 'light' | 'dark';
} {
  const { settings, updateSettings } = useSettings();
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Determine resolved theme
  useEffect(() => {
    const updateResolvedTheme = () => {
      const systemPrefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)'
      ).matches;

      if (settings.theme === 'system') {
        setResolvedTheme(systemPrefersDark ? 'dark' : 'light');
      } else {
        setResolvedTheme(settings.theme);
      }

      applyTheme(settings.theme);
    };

    updateResolvedTheme();

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', updateResolvedTheme);

    return () => {
      mediaQuery.removeEventListener('change', updateResolvedTheme);
    };
  }, [settings.theme]);

  const setTheme = useCallback(
    async (theme: Theme) => {
      await updateSettings({ theme });
    },
    [updateSettings]
  );

  return {
    theme: settings.theme,
    setTheme,
    resolvedTheme,
  };
}

// ============================================
// Convenience Hooks
// ============================================

/**
 * Get the current currency setting.
 */
export function useCurrency(): {
  currency: string;
  setCurrency: (currency: string) => Promise<void>;
  currencyInfo: (typeof CURRENCY_OPTIONS)[number] | undefined;
} {
  const { settings, updateSettings } = useSettings();

  const setCurrency = useCallback(
    async (currency: string) => {
      await updateSettings({ defaultCurrency: currency });
    },
    [updateSettings]
  );

  const currencyInfo = useMemo(
    () => CURRENCY_OPTIONS.find((c) => c.code === settings.defaultCurrency),
    [settings.defaultCurrency]
  );

  return {
    currency: settings.defaultCurrency,
    setCurrency,
    currencyInfo,
  };
}

/**
 * Get the current timezone setting.
 */
export function useTimezone(): {
  timezone: string;
  setTimezone: (timezone: string) => Promise<void>;
  timezoneInfo: (typeof TIMEZONE_OPTIONS)[number] | undefined;
} {
  const { settings, updateSettings } = useSettings();

  const setTimezone = useCallback(
    async (timezone: string) => {
      await updateSettings({ timezone });
    },
    [updateSettings]
  );

  const timezoneInfo = useMemo(
    () => TIMEZONE_OPTIONS.find((t) => t.value === settings.timezone),
    [settings.timezone]
  );

  return {
    timezone: settings.timezone,
    setTimezone,
    timezoneInfo,
  };
}

/**
 * Get anomaly detection settings.
 */
export function useAnomalySettings(): {
  enabled: boolean;
  threshold: number;
  setEnabled: (enabled: boolean) => Promise<void>;
  setThreshold: (threshold: number) => Promise<void>;
} {
  const { settings, updateSettings } = useSettings();

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      await updateSettings({ anomalyDetectionEnabled: enabled });
    },
    [updateSettings]
  );

  const setThreshold = useCallback(
    async (threshold: number) => {
      await updateSettings({ anomalyThreshold: threshold });
    },
    [updateSettings]
  );

  return {
    enabled: settings.anomalyDetectionEnabled,
    threshold: settings.anomalyThreshold,
    setEnabled,
    setThreshold,
  };
}

/**
 * Get sync settings.
 */
export function useSyncSettings(): {
  syncEnabled: boolean;
  setSyncEnabled: (enabled: boolean) => Promise<void>;
} {
  const { settings, updateSettings } = useSettings();

  const setSyncEnabled = useCallback(
    async (enabled: boolean) => {
      await updateSettings({ syncEnabled: enabled });
    },
    [updateSettings]
  );

  return {
    syncEnabled: settings.syncEnabled,
    setSyncEnabled,
  };
}

/**
 * Get date format settings.
 */
export function useDateFormat(): {
  dateFormat: string;
  setDateFormat: (format: string) => Promise<void>;
  formatInfo: (typeof DATE_FORMAT_OPTIONS)[number] | undefined;
} {
  const { settings, updateSettings } = useSettings();

  const setDateFormat = useCallback(
    async (format: string) => {
      await updateSettings({ dateFormat: format });
    },
    [updateSettings]
  );

  const formatInfo = useMemo(
    () => DATE_FORMAT_OPTIONS.find((f) => f.value === settings.dateFormat),
    [settings.dateFormat]
  );

  return {
    dateFormat: settings.dateFormat,
    setDateFormat,
    formatInfo,
  };
}
