/**
 * SyncSettings Component
 *
 * Manages sync and privacy settings including:
 * - Sync status display
 * - Pause/resume sync
 * - Manual sync trigger
 * - Privacy information
 * - Anomaly detection settings
 */

'use client';

import React, { useState, useCallback } from 'react';
import {
  RefreshCw,
  Pause,
  Play,
  Shield,
  Cloud,
  CloudOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  AlertTriangle,
  Bell,
  Sliders,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { cn } from '@/lib/utils/index';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useSync, useSyncStatus } from '@/hooks/useSync';
import { useSyncSettings, useAnomalySettings } from '@/hooks/useSettings';

// ============================================
// Types
// ============================================

export interface SyncSettingsProps {
  /** Additional CSS class names */
  className?: string;
}

// ============================================
// Sub-components
// ============================================

function SyncStatusBadge({ state }: { state: string }) {
  const config: Record<
    string,
    {
      variant: 'default' | 'secondary' | 'destructive' | 'outline';
      icon: React.ElementType;
    }
  > = {
    synced: { variant: 'default', icon: CheckCircle2 },
    syncing: { variant: 'secondary', icon: RefreshCw },
    pending: { variant: 'outline', icon: Clock },
    error: { variant: 'destructive', icon: AlertCircle },
    paused: { variant: 'secondary', icon: Pause },
    offline: { variant: 'secondary', icon: CloudOff },
  };

  const { variant, icon: Icon } = config[state] || config.pending!;

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className={cn('h-3 w-3', state === 'syncing' && 'animate-spin')} />
      {state.charAt(0).toUpperCase() + state.slice(1)}
    </Badge>
  );
}

interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function SyncSettings({ className }: SyncSettingsProps) {
  const { syncNow, pauseSync, resumeSync } = useSync();
  const syncStatus = useSyncStatus();
  const { syncEnabled, setSyncEnabled } = useSyncSettings();
  const {
    enabled: anomalyEnabled,
    threshold: anomalyThreshold,
    setEnabled: setAnomalyEnabled,
    setThreshold: setAnomalyThreshold,
  } = useAnomalySettings();

  const [isSyncing, setIsSyncing] = useState(false);
  const [thresholdValue, setThresholdValue] = useState(anomalyThreshold);

  // Format last sync time
  const lastSyncText = syncStatus.lastSyncAt
    ? formatDistanceToNow(syncStatus.lastSyncAt, { addSuffix: true })
    : 'Never';

  /**
   * Handle manual sync.
   */
  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncNow();
    } finally {
      setIsSyncing(false);
    }
  }, [syncNow]);

  /**
   * Handle sync toggle.
   */
  const handleSyncToggle = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        await resumeSync();
      } else {
        await pauseSync();
      }
      await setSyncEnabled(enabled);
    },
    [pauseSync, resumeSync, setSyncEnabled]
  );

  /**
   * Handle threshold change commit.
   */
  const handleThresholdCommit = useCallback(
    async (value: number[]) => {
      await setAnomalyThreshold(value[0] || 20);
    },
    [setAnomalyThreshold]
  );

  const isPaused = syncStatus.state === 'paused';
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Sync & Cloud
          </CardTitle>
          <CardDescription>
            Control how your data syncs across devices
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sync Status Display */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-4">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full',
                  syncStatus.state === 'synced'
                    ? 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400'
                    : syncStatus.state === 'error'
                      ? 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {syncStatus.state === 'syncing' ? (
                  <RefreshCw className="h-6 w-6 animate-spin" />
                ) : syncStatus.state === 'synced' ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : syncStatus.state === 'error' ? (
                  <AlertCircle className="h-6 w-6" />
                ) : (
                  <Cloud className="h-6 w-6" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">Sync Status</p>
                  <SyncStatusBadge state={syncStatus.state} />
                </div>
                <p className="text-sm text-muted-foreground">
                  Last synced: {lastSyncText}
                </p>
              </div>
            </div>

            <Button
              onClick={handleSyncNow}
              disabled={isSyncing || !isOnline || isPaused}
              size="sm"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync Now
                </>
              )}
            </Button>
          </div>

          {/* Sync Error Display */}
          {syncStatus.state === 'error' && syncStatus.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Sync Error</AlertTitle>
              <AlertDescription>{syncStatus.error}</AlertDescription>
            </Alert>
          )}

          {/* Offline Warning */}
          {!isOnline && (
            <Alert>
              <CloudOff className="h-4 w-4" />
              <AlertTitle>Offline</AlertTitle>
              <AlertDescription>
                You&apos;re currently offline. Changes will sync when you
                reconnect.
              </AlertDescription>
            </Alert>
          )}

          <Separator />

          {/* Sync Enable/Disable */}
          <SettingRow
            label="Enable Cloud Sync"
            description="Sync sanitized transaction data across devices"
          >
            <Switch checked={syncEnabled} onCheckedChange={handleSyncToggle} />
          </SettingRow>

          {/* Pause Sync */}
          <SettingRow
            label="Pause Sync"
            description="Temporarily stop syncing to cloud"
          >
            <Switch
              checked={isPaused}
              onCheckedChange={(paused) =>
                paused ? pauseSync() : resumeSync()
              }
              disabled={!syncEnabled}
            />
          </SettingRow>
        </CardContent>
      </Card>

      {/* Privacy Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Privacy Protection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
            <Shield className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertTitle className="text-green-700 dark:text-green-300">
              Your Privacy is Protected
            </AlertTitle>
            <AlertDescription className="text-green-600 dark:text-green-400">
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>
                  <strong>Raw documents</strong> and text never leave your
                  device
                </li>
                <li>
                  <strong>Vector embeddings</strong> are processed and stored
                  locally
                </li>
                <li>
                  Only <strong>sanitized data</strong> (amounts, vendors, dates)
                  syncs to cloud
                </li>
                <li>
                  <strong>AI processing</strong> happens entirely on your device
                </li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Anomaly Detection Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Anomaly Detection
          </CardTitle>
          <CardDescription>
            Configure how unusual transactions are detected
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable/Disable */}
          <SettingRow
            label="Enable Anomaly Detection"
            description="Get alerts for unusual transactions and duplicates"
          >
            <Switch
              checked={anomalyEnabled}
              onCheckedChange={setAnomalyEnabled}
            />
          </SettingRow>

          {/* Sensitivity Threshold */}
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm font-medium">Unusual Amount Threshold</p>
              <p className="text-sm text-muted-foreground">
                Trigger alert when amount differs by this percentage from
                average
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Slider
                  value={[thresholdValue]}
                  onValueChange={(v) => setThresholdValue(v[0] || 20)}
                  onValueCommit={handleThresholdCommit}
                  min={5}
                  max={50}
                  step={5}
                  disabled={!anomalyEnabled}
                />
              </div>
              <Badge variant="secondary" className="w-16 justify-center">
                {thresholdValue}%
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Lower values = more sensitive (more alerts). Default: 20%
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SyncSettings;
