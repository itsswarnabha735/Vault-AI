/**
 * AccountSettings Component
 *
 * Manages user account settings including:
 * - Email display
 * - Display name edit
 * - Timezone selector
 * - Currency preference
 * - Sign out button
 * - Delete account (with confirmation)
 */

'use client';

import React, { useState, useCallback } from 'react';
import {
  User,
  Mail,
  Globe,
  Clock,
  DollarSign,
  LogOut,
  Trash2,
  Loader2,
  Check,
  AlertTriangle,
} from 'lucide-react';

import { cn } from '@/lib/utils/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import {
  useSettings,
  useCurrency,
  useTimezone,
  useTheme,
  useDateFormat,
  CURRENCY_OPTIONS,
  TIMEZONE_OPTIONS,
  DATE_FORMAT_OPTIONS,
  THEME_OPTIONS,
} from '@/hooks/useSettings';

// ============================================
// Types
// ============================================

export interface AccountSettingsProps {
  /** Additional CSS class names */
  className?: string;
}

// ============================================
// Sub-components
// ============================================

function SettingRow({
  label,
  description,
  icon: Icon,
  children,
}: {
  label: string;
  description?: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-1 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">{label}</p>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function AccountSettings({ className }: AccountSettingsProps) {
  const { user, signOut, isLoading: authLoading } = useAuth();
  const { settings, isSaving } = useSettings();
  const { currency, setCurrency, currencyInfo } = useCurrency();
  const { timezone, setTimezone, timezoneInfo } = useTimezone();
  const { theme, setTheme } = useTheme();
  const { dateFormat, setDateFormat, formatInfo } = useDateFormat();

  const [displayName, setDisplayName] = useState(
    user?.user_metadata?.name || ''
  );
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  /**
   * Handle sign out.
   */
  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  }, [signOut]);

  /**
   * Handle delete account.
   */
  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmation !== 'delete my account') {
      return;
    }

    // TODO: Implement account deletion
    // This would:
    // 1. Delete all local data
    // 2. Delete cloud data
    // 3. Delete auth account
    console.log('Account deletion requested');
    setShowDeleteDialog(false);
  }, [deleteConfirmation]);

  // Group timezones by region
  const groupedTimezones = TIMEZONE_OPTIONS.reduce(
    (acc, tz) => {
      if (!acc[tz.region]) {
        acc[tz.region] = [];
      }
      acc[tz.region]!.push(tz);
      return acc;
    },
    {} as Record<string, (typeof TIMEZONE_OPTIONS)[number][]>
  );

  return (
    <div className={cn('space-y-6', className)}>
      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Account Information
          </CardTitle>
          <CardDescription>
            Manage your personal account details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0">
          {/* Email */}
          <SettingRow
            label="Email Address"
            description="Your login email"
            icon={Mail}
          >
            <p className="text-sm font-medium">
              {user?.email || 'Not signed in'}
            </p>
          </SettingRow>

          {/* Display Name */}
          <SettingRow
            label="Display Name"
            description="How you appear in the app"
            icon={User}
          >
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              className="w-48"
            />
          </SettingRow>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Preferences
          </CardTitle>
          <CardDescription>Customize your experience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0">
          {/* Theme */}
          <SettingRow
            label="Theme"
            description="Choose your preferred color scheme"
            icon={Globe}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-36 justify-between">
                  {THEME_OPTIONS.find((t) => t.value === theme)?.icon}{' '}
                  {THEME_OPTIONS.find((t) => t.value === theme)?.label ||
                    'System'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {THEME_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                  >
                    <span className="mr-2">{option.icon}</span>
                    {option.label}
                    {theme === option.value && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SettingRow>

          {/* Currency */}
          <SettingRow
            label="Currency"
            description="Default currency for transactions"
            icon={DollarSign}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-48 justify-between">
                  {currencyInfo?.symbol || '$'} {currency}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-64 overflow-y-auto"
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.code}
                    onClick={() => setCurrency(option.code)}
                  >
                    <span className="mr-2 w-8 text-muted-foreground">
                      {option.symbol}
                    </span>
                    {option.code} - {option.name}
                    {currency === option.code && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SettingRow>

          {/* Timezone */}
          <SettingRow
            label="Timezone"
            description="Your local timezone"
            icon={Clock}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-48 justify-between text-left"
                >
                  <span className="truncate">
                    {timezoneInfo?.label || timezone}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-80 overflow-y-auto"
              >
                {Object.entries(groupedTimezones).map(([region, timezones]) => (
                  <React.Fragment key={region}>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      {region}
                    </DropdownMenuLabel>
                    {timezones.map((tz) => (
                      <DropdownMenuItem
                        key={tz.value}
                        onClick={() => setTimezone(tz.value)}
                      >
                        {tz.label}
                        {timezone === tz.value && (
                          <Check className="ml-auto h-4 w-4" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </React.Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SettingRow>

          {/* Date Format */}
          <SettingRow
            label="Date Format"
            description="How dates are displayed"
            icon={Clock}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-48 justify-between">
                  {formatInfo?.label || dateFormat}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {DATE_FORMAT_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setDateFormat(option.value)}
                  >
                    {option.label}
                    {dateFormat === option.value && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SettingRow>
        </CardContent>
        <CardFooter>
          {isSaving && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </p>
          )}
        </CardFooter>
      </Card>

      {/* Session */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5" />
            Session
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={handleSignOut}
            disabled={isSigningOut || authLoading}
            className="w-full"
          >
            {isSigningOut ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing out...
              </>
            ) : (
              <>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions that affect your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              Deleting your account will permanently remove all your data from
              both your device and the cloud. This action cannot be undone.
            </AlertDescription>
          </Alert>

          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Account</DialogTitle>
                <DialogDescription>
                  This will permanently delete your account and all associated
                  data. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    All your transactions, documents, and settings will be
                    permanently deleted.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="delete-confirmation">
                    Type <strong>delete my account</strong> to confirm
                  </Label>
                  <Input
                    id="delete-confirmation"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder="delete my account"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmation !== 'delete my account'}
                >
                  Delete Account
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}

export default AccountSettings;
