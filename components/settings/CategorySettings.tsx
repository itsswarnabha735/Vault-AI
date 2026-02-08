/**
 * CategorySettings Component
 *
 * Manages spending categories including:
 * - View all categories
 * - Add new categories
 * - Edit existing categories
 * - Delete categories (with transaction reassignment)
 */

'use client';

import React, { useState, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  GripVertical,
  Tag,
  Check,
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
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategories, useCategoryActions } from '@/hooks/useLocalDB';
import { useAuthContext } from '@/components/providers/AuthProvider';
import type { Category, UserId } from '@/types/database';

// ============================================
// Types
// ============================================

export interface CategorySettingsProps {
  /** Additional CSS class names */
  className?: string;
}

interface CategoryFormData {
  name: string;
  icon: string;
  color: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_ICONS = [
  '📦',
  '🍽️',
  '🚗',
  '🛍️',
  '🎬',
  '🏥',
  '💡',
  '✈️',
  '🏠',
  '💳',
  '📱',
  '🎮',
  '📚',
  '🏋️',
  '🐕',
  '🎁',
  '💼',
  '🔧',
];

const DEFAULT_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#6b7280', // gray
];

// ============================================
// Sub-components
// ============================================

interface CategoryRowProps {
  category: Category;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}

function CategoryRow({ category, onEdit, onDelete }: CategoryRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50">
      {/* Drag Handle (placeholder) */}
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Icon and Color */}
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg text-xl"
        style={{ backgroundColor: `${category.color}20` }}
      >
        {category.icon}
      </div>

      {/* Name */}
      <div className="flex-1">
        <p className="font-medium">{category.name}</p>
        {category.isDefault && (
          <p className="text-xs text-muted-foreground">Default category</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(category)}
          aria-label="Edit category"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(category)}
          disabled={category.isDefault}
          aria-label="Delete category"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function CategoryRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-10 w-10 rounded-lg" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-8 w-8" />
      <Skeleton className="h-8 w-8" />
    </div>
  );
}

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
  onSave: (data: CategoryFormData) => Promise<void>;
  isSaving: boolean;
}

function CategoryDialog({
  open,
  onOpenChange,
  category,
  onSave,
  isSaving,
}: CategoryDialogProps) {
  const [formData, setFormData] = useState<CategoryFormData>({
    name: category?.name || '',
    icon: category?.icon || '📦',
    color: category?.color || '#3b82f6',
  });

  // Reset form when dialog opens with new category
  React.useEffect(() => {
    if (open) {
      setFormData({
        name: category?.name || '',
        icon: category?.icon || '📦',
        color: category?.color || '#3b82f6',
      });
    }
  }, [open, category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(formData);
  };

  const isEditing = category !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Category' : 'Add Category'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the category details below.'
              : 'Create a new category for organizing your transactions.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., Groceries"
              required
            />
          </div>

          {/* Icon Picker */}
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg border text-xl transition-colors',
                    formData.icon === icon
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted'
                  )}
                  onClick={() => setFormData((prev) => ({ ...prev, icon }))}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Color Picker */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform',
                    formData.color === color
                      ? 'scale-110 border-foreground'
                      : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData((prev) => ({ ...prev, color }))}
                >
                  {formData.color === color && (
                    <Check className="h-4 w-4 text-white" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg text-xl"
                style={{ backgroundColor: `${formData.color}20` }}
              >
                {formData.icon}
              </div>
              <p className="font-medium">{formData.name || 'Category Name'}</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !formData.name.trim()}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? 'Saving...' : 'Creating...'}
                </>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Create Category'
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
  category: Category | null;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

function DeleteConfirmDialog({
  open,
  onOpenChange,
  category,
  onConfirm,
  isDeleting,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Category</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{category?.name}&rdquo;?
            Transactions in this category will be moved to &ldquo;Other&rdquo;.
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
                Delete Category
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

export function CategorySettings({ className }: CategorySettingsProps) {
  const { user } = useAuthContext();
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { addCategory, updateCategory, deleteCategory } = useCategoryActions();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isLoading = categoriesLoading;

  /**
   * Open add dialog.
   */
  const handleAdd = useCallback(() => {
    setSelectedCategory(null);
    setDialogOpen(true);
  }, []);

  /**
   * Open edit dialog.
   */
  const handleEdit = useCallback((category: Category) => {
    setSelectedCategory(category);
    setDialogOpen(true);
  }, []);

  /**
   * Open delete dialog.
   */
  const handleDelete = useCallback((category: Category) => {
    setSelectedCategory(category);
    setDeleteDialogOpen(true);
  }, []);

  /**
   * Save category (add or update).
   */
  const handleSave = useCallback(
    async (data: CategoryFormData) => {
      setIsSaving(true);
      try {
        if (selectedCategory) {
          // Update existing
          await updateCategory(selectedCategory.id, {
            name: data.name,
            icon: data.icon,
            color: data.color,
          });
        } else {
          // Add new
          await addCategory({
            userId: (user?.id ?? '') as UserId,
            name: data.name,
            icon: data.icon,
            color: data.color,
            parentId: null,
            sortOrder: categories.length,
            isDefault: false,
          });
        }
        setDialogOpen(false);
      } catch (err) {
        console.error('Failed to save category:', err);
      } finally {
        setIsSaving(false);
      }
    },
    [selectedCategory, addCategory, updateCategory]
  );

  /**
   * Confirm delete.
   */
  const handleConfirmDelete = useCallback(async () => {
    if (!selectedCategory) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteCategory(selectedCategory.id);
      setDeleteDialogOpen(false);
    } catch (err) {
      console.error('Failed to delete category:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [selectedCategory, deleteCategory]);

  return (
    <div className={cn('space-y-6', className)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Spending Categories
          </CardTitle>
          <CardDescription>
            Customize categories for organizing your transactions. Drag to
            reorder.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Category List */}
          {isLoading ? (
            <>
              <CategoryRowSkeleton />
              <CategoryRowSkeleton />
              <CategoryRowSkeleton />
            </>
          ) : categories && categories.length > 0 ? (
            categories.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Tag className="mx-auto mb-2 h-8 w-8" />
              <p>No categories yet</p>
              <p className="text-sm">Create your first category below</p>
            </div>
          )}

          {/* Add Button */}
          <Button variant="outline" className="w-full" onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={selectedCategory}
        onSave={handleSave}
        isSaving={isSaving}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        category={selectedCategory}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}

export default CategorySettings;
