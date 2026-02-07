/**
 * BudgetSettings Component
 *
 * Manages budget configurations including:
 * - Budget list by category
 * - Add/edit/delete budgets
 * - Period selection (weekly/monthly/yearly)
 * - Start date picker
 * - Budget amount input
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Wallet,
  CalendarDays,
  DollarSign,
  TrendingUp,
  Check,
} from 'lucide-react';
import { format } from 'date-fns';

import { cn } from '@/lib/utils/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBudgets,
  useBudgetActions,
  useCategories,
  type BudgetWithStatus,
} from '@/hooks/useLocalDB';
import { useCurrency } from '@/hooks/useSettings';
import type { Budget, BudgetPeriod, CategoryId } from '@/types/database';

// ============================================
// Types
// ============================================

export interface BudgetSettingsProps {
  /** Additional CSS class names */
  className?: string;
}

interface BudgetFormData {
  categoryId: CategoryId | null;
  amount: number;
  period: BudgetPeriod;
  startDate: string;
}

// ============================================
// Constants
// ============================================

const PERIOD_OPTIONS: Array<{
  value: BudgetPeriod;
  label: string;
  description: string;
}> = [
  { value: 'weekly', label: 'Weekly', description: 'Resets every week' },
  { value: 'monthly', label: 'Monthly', description: 'Resets every month' },
  { value: 'yearly', label: 'Yearly', description: 'Resets every year' },
];

// ============================================
// Sub-components
// ============================================

interface BudgetRowProps {
  budget: BudgetWithStatus;
  categoryName: string;
  categoryIcon: string;
  currencySymbol: string;
  onEdit: (budget: Budget) => void;
  onDelete: (budget: Budget) => void;
}

function BudgetRow({
  budget,
  categoryName,
  categoryIcon,
  currencySymbol,
  onEdit,
  onDelete,
}: BudgetRowProps) {
  const percentUsed = Math.min(budget.percentUsed, 100);
  const isExceeded = budget.isExceeded;

  // Calculate days remaining in the budget period
  const daysRemaining = (() => {
    const now = new Date();
    const endOfPeriod = new Date();
    switch (budget.budget.period) {
      case 'weekly':
        endOfPeriod.setDate(now.getDate() + (7 - now.getDay()));
        break;
      case 'monthly':
        endOfPeriod.setMonth(now.getMonth() + 1, 0);
        break;
      case 'yearly':
        endOfPeriod.setFullYear(now.getFullYear(), 11, 31);
        break;
    }
    return Math.max(
      0,
      Math.ceil((endOfPeriod.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );
  })();

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">{categoryIcon}</span>
          <div>
            <p className="font-medium">{categoryName}</p>
            <p className="text-sm capitalize text-muted-foreground">
              {budget.budget.period} budget
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Badge variant={budget.budget.isActive ? 'default' : 'secondary'}>
            {budget.budget.isActive ? 'Active' : 'Inactive'}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(budget.budget)}
            aria-label="Edit budget"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(budget.budget)}
            aria-label="Delete budget"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span>
            {currencySymbol}
            {budget.spent.toFixed(2)} spent
          </span>
          <span className="text-muted-foreground">
            of {currencySymbol}
            {budget.budget.amount.toFixed(2)}
          </span>
        </div>
        <Progress
          value={percentUsed}
          className={cn('h-2', isExceeded && '[&>div]:bg-destructive')}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span
            className={cn(
              'font-medium',
              isExceeded ? 'text-destructive' : 'text-green-600'
            )}
          >
            {isExceeded
              ? `-${currencySymbol}${Math.abs(budget.remaining).toFixed(2)} over`
              : `${currencySymbol}${budget.remaining.toFixed(2)} left`}
          </span>
        </div>
        <span className="text-muted-foreground">
          {daysRemaining} days remaining
        </span>
      </div>
    </div>
  );
}

function BudgetRowSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
      <Skeleton className="h-2 w-full" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

interface BudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: Budget | null;
  categories: Array<{ id: CategoryId; name: string; icon: string }>;
  currencySymbol: string;
  onSave: (data: BudgetFormData) => Promise<void>;
  isSaving: boolean;
}

function BudgetDialog({
  open,
  onOpenChange,
  budget,
  categories,
  currencySymbol,
  onSave,
  isSaving,
}: BudgetDialogProps) {
  const [formData, setFormData] = useState<BudgetFormData>({
    categoryId: budget?.categoryId || null,
    amount: budget?.amount || 0,
    period: budget?.period || 'monthly',
    startDate: budget?.startDate || format(new Date(), 'yyyy-MM-dd'),
  });

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setFormData({
        categoryId: budget?.categoryId || null,
        amount: budget?.amount || 0,
        period: budget?.period || 'monthly',
        startDate: budget?.startDate || format(new Date(), 'yyyy-MM-dd'),
      });
    }
  }, [open, budget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(formData);
  };

  const isEditing = budget !== null;
  const selectedCategory = categories.find((c) => c.id === formData.categoryId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Budget' : 'Add Budget'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the budget details below.'
              : 'Create a new budget to track your spending.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div className="space-y-2">
            <Label>Category</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  type="button"
                >
                  {selectedCategory ? (
                    <>
                      <span className="mr-2">{selectedCategory.icon}</span>
                      {selectedCategory.name}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      Total Budget (All Categories)
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full">
                <DropdownMenuItem
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, categoryId: null }))
                  }
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Total Budget (All Categories)
                  {formData.categoryId === null && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </DropdownMenuItem>
                {categories.map((category) => (
                  <DropdownMenuItem
                    key={category.id}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        categoryId: category.id,
                      }))
                    }
                  >
                    <span className="mr-2">{category.icon}</span>
                    {category.name}
                    {formData.categoryId === category.id && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="budget-amount">Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {currencySymbol}
              </span>
              <Input
                id="budget-amount"
                type="number"
                min="0"
                step="0.01"
                value={formData.amount || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    amount: parseFloat(e.target.value) || 0,
                  }))
                }
                className="pl-8"
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {/* Period */}
          <div className="space-y-2">
            <Label>Period</Label>
            <div className="grid grid-cols-3 gap-2">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors',
                    formData.period === option.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted'
                  )}
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, period: option.value }))
                  }
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Start Date */}
          <div className="space-y-2">
            <Label htmlFor="budget-start-date">Start Date</Label>
            <Input
              id="budget-start-date"
              type="date"
              value={formData.startDate}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, startDate: e.target.value }))
              }
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || formData.amount <= 0}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? 'Saving...' : 'Creating...'}
                </>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Create Budget'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Budget</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this budget? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Budget
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Main Component
// ============================================

export function BudgetSettings({ className }: BudgetSettingsProps) {
  const budgets = useBudgets();
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { addBudget, updateBudget, deleteBudget } = useBudgetActions();
  const { currencyInfo } = useCurrency();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isLoading = budgets === undefined || categoriesLoading;
  const currencySymbol = currencyInfo?.symbol || '$';

  // Map categories by ID for quick lookup
  const categoryMap = useMemo(() => {
    if (!categories || categories.length === 0) {
      return new Map();
    }
    return new Map(categories.map((c) => [c.id, c]));
  }, [categories]);

  // Category options for dropdown
  const categoryOptions = useMemo(() => {
    if (!categories || categories.length === 0) {
      return [];
    }
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
    }));
  }, [categories]);

  /**
   * Open add dialog.
   */
  const handleAdd = useCallback(() => {
    setSelectedBudget(null);
    setDialogOpen(true);
  }, []);

  /**
   * Open edit dialog.
   */
  const handleEdit = useCallback((budget: Budget) => {
    setSelectedBudget(budget);
    setDialogOpen(true);
  }, []);

  /**
   * Open delete dialog.
   */
  const handleDelete = useCallback((budget: Budget) => {
    setSelectedBudget(budget);
    setDeleteDialogOpen(true);
  }, []);

  /**
   * Save budget.
   */
  const handleSave = useCallback(
    async (data: BudgetFormData) => {
      setIsSaving(true);
      try {
        if (selectedBudget) {
          await updateBudget(selectedBudget.id, {
            categoryId: data.categoryId,
            amount: data.amount,
            period: data.period,
            startDate: data.startDate,
          });
        } else {
          await addBudget({
            categoryId: data.categoryId,
            amount: data.amount,
            period: data.period,
            startDate: data.startDate,
            userId: '' as import('@/types/database').UserId, // Will be set by the hook
            isActive: true,
          });
        }
        setDialogOpen(false);
      } catch (err) {
        console.error('Failed to save budget:', err);
      } finally {
        setIsSaving(false);
      }
    },
    [selectedBudget, addBudget, updateBudget]
  );

  /**
   * Confirm delete.
   */
  const handleConfirmDelete = useCallback(async () => {
    if (!selectedBudget) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteBudget(selectedBudget.id);
      setDeleteDialogOpen(false);
    } catch (err) {
      console.error('Failed to delete budget:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [selectedBudget, deleteBudget]);

  return (
    <div className={cn('space-y-6', className)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Budgets
          </CardTitle>
          <CardDescription>
            Set spending limits for categories or your total spending
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Budget List */}
          {isLoading ? (
            <>
              <BudgetRowSkeleton />
              <BudgetRowSkeleton />
            </>
          ) : budgets && budgets.length > 0 ? (
            budgets.map((budget) => {
              const category = budget.budget.categoryId
                ? categoryMap.get(budget.budget.categoryId)
                : null;
              return (
                <BudgetRow
                  key={budget.budget.id}
                  budget={budget}
                  categoryName={category?.name || 'Total Budget'}
                  categoryIcon={category?.icon || '💰'}
                  currencySymbol={currencySymbol}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              );
            })
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Wallet className="mx-auto mb-2 h-8 w-8" />
              <p>No budgets yet</p>
              <p className="text-sm">
                Create your first budget to track spending
              </p>
            </div>
          )}

          {/* Add Button */}
          <Button variant="outline" className="w-full" onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Budget
          </Button>
        </CardContent>
      </Card>

      {/* Budget Tips Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Budget Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5">•</span>
              Start with a monthly total budget, then add category-specific
              limits
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5">•</span>
              The 50/30/20 rule: 50% needs, 30% wants, 20% savings
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5">•</span>
              Review and adjust budgets monthly based on actual spending
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <BudgetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        budget={selectedBudget}
        categories={categoryOptions}
        currencySymbol={currencySymbol}
        onSave={handleSave}
        isSaving={isSaving}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}

export default BudgetSettings;
