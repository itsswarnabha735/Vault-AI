/**
 * Settings Page for Vault-AI
 *
 * Comprehensive settings page with tabs for:
 * - Account settings
 * - Categories management
 * - Budgets management
 * - Sync & Privacy settings
 * - Export & Import data
 */

'use client';

import React from 'react';
import { Settings } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AccountSettings,
  CategorySettings,
  BudgetSettings,
  SyncSettings,
  ExportSettings,
} from '@/components/settings';

export default function SettingsPage() {
  return (
    <div className="container mx-auto max-w-3xl p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage your account and preferences
            </p>
          </div>
        </div>

        {/* Settings Tabs */}
        <Tabs defaultValue="account" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="budgets">Budgets</TabsTrigger>
            <TabsTrigger value="sync">Sync</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="account">
            <AccountSettings />
          </TabsContent>

          <TabsContent value="categories">
            <CategorySettings />
          </TabsContent>

          <TabsContent value="budgets">
            <BudgetSettings />
          </TabsContent>

          <TabsContent value="sync">
            <SyncSettings />
          </TabsContent>

          <TabsContent value="export">
            <ExportSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
