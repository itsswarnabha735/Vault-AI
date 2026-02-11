/**
 * useHierarchicalCategories Hook
 *
 * Provides categories organized into a two-level hierarchy:
 * parent categories with their children (sub-categories).
 *
 * Usage:
 * ```tsx
 * const { groups, flatList } = useHierarchicalCategories();
 * // groups: [{ parent, children: [...] }, ...]
 * // flatList: all categories (parent + children) in display order
 * ```
 */

import { useMemo } from 'react';
import { useCategories } from '@/hooks/useLocalDB';
import type { CategoryId } from '@/types/database';

export interface CategoryOption {
  id: CategoryId;
  name: string;
  icon: string;
  color: string;
  parentId: CategoryId | null;
  sortOrder: number;
  /** Depth level: 0 = root, 1 = sub-category */
  depth: number;
}

export interface CategoryGroup {
  /** Parent category */
  parent: CategoryOption;
  /** Child sub-categories */
  children: CategoryOption[];
}

export interface UseHierarchicalCategoriesReturn {
  /** Categories grouped by parent → children */
  groups: CategoryGroup[];
  /** Flat list of all categories in display order (parents + children interleaved) */
  flatList: CategoryOption[];
  /** Loading state */
  isLoading: boolean;
}

export function useHierarchicalCategories(): UseHierarchicalCategoriesReturn {
  const { data: categories, isLoading } = useCategories();

  const { groups, flatList } = useMemo(() => {
    if (categories.length === 0) {
      return {
        groups: [] as CategoryGroup[],
        flatList: [] as CategoryOption[],
      };
    }

    // Separate root and child categories
    const roots: CategoryOption[] = [];
    const childMap = new Map<string, CategoryOption[]>(); // parentId → children

    for (const cat of categories) {
      const option: CategoryOption = {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        parentId: cat.parentId,
        sortOrder: cat.sortOrder,
        depth: cat.parentId ? 1 : 0,
      };

      if (!cat.parentId) {
        roots.push(option);
      } else {
        const parentKey = cat.parentId as string;
        if (!childMap.has(parentKey)) {
          childMap.set(parentKey, []);
        }
        childMap.get(parentKey)!.push(option);
      }
    }

    // Sort roots by sortOrder
    roots.sort((a, b) => a.sortOrder - b.sortOrder);

    // Build groups and flat list
    const builtGroups: CategoryGroup[] = [];
    const builtFlat: CategoryOption[] = [];

    for (const parent of roots) {
      const children = (childMap.get(parent.id as string) || []).sort(
        (a, b) => a.sortOrder - b.sortOrder
      );

      builtGroups.push({ parent, children });
      builtFlat.push(parent);
      builtFlat.push(...children);
    }

    return { groups: builtGroups, flatList: builtFlat };
  }, [categories]);

  return { groups, flatList, isLoading };
}
