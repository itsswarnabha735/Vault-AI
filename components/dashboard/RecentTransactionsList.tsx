/**
 * Recent Transactions List Component
 *
 * Displays the most recent transactions with category badges.
 */

'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ArrowRight, FileText } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecentTransactions } from '@/hooks/useDashboardData';
import { formatCurrency, cn } from '@/lib/utils';
import type { Category } from '@/types/database';

interface TransactionWithCategory {
  id: string;
  date: string;
  amount: number;
  vendor: string;
  note: string;
  categoryData?: Category;
}

interface RecentTransactionsListProps {
  /** Selected month to filter transactions to */
  selectedMonth?: Date;
}

/**
 * Recent Transactions List showing the last 10 transactions.
 */
export function RecentTransactionsList({ selectedMonth }: RecentTransactionsListProps = {}) {
  const { data, isLoading } = useRecentTransactions(10, selectedMonth);

  if (isLoading) {
    return <RecentTransactionsListSkeleton />;
  }

  const transactions = data as TransactionWithCategory[];
  const hasData = transactions.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">
          Recent Transactions
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/vault" className="text-vault-gold">
            View All
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="space-y-1">
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} transaction={tx} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Single transaction row component.
 */
interface TransactionRowProps {
  transaction: TransactionWithCategory;
}

function TransactionRow({ transaction }: TransactionRowProps) {
  const { id, date, amount, vendor, categoryData } = transaction;
  const isExpense = amount > 0;

  return (
    <Link
      href={`/vault?transaction=${id}`}
      className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-vault-bg-surface"
    >
      <div className="flex items-center gap-3">
        {/* Category Icon */}
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
          style={{
            backgroundColor: categoryData?.color
              ? `${categoryData.color}20`
              : '#242938',
          }}
        >
          {categoryData?.icon ?? (
            <FileText className="h-5 w-5 text-vault-text-tertiary" />
          )}
        </div>

        {/* Transaction Details */}
        <div>
          <p className="font-medium text-vault-text-primary">
            {vendor || 'Unknown Vendor'}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-vault-text-secondary">
              {formatTransactionDate(date)}
            </span>
            {categoryData && (
              <Badge
                variant="secondary"
                className="text-xs"
                style={{
                  backgroundColor: `${categoryData.color}20`,
                  color: categoryData.color,
                }}
              >
                {categoryData.name}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Amount */}
      <div
        className={cn(
          'font-mono text-sm font-semibold',
          isExpense ? 'text-vault-danger-text' : 'text-vault-success-text'
        )}
      >
        {isExpense ? '-' : '+'}
        {formatCurrency(Math.abs(amount))}
      </div>
    </Link>
  );
}

/**
 * Format transaction date for display.
 */
function formatTransactionDate(dateStr: string): string {
  try {
    const date = parseISO(dateStr);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
      return 'Today';
    }
    if (diffDays === 1) {
      return 'Yesterday';
    }
    if (diffDays < 7) {
      return format(date, 'EEEE');
    }
    return format(date, 'MMM d');
  } catch {
    return dateStr;
  }
}

/**
 * Empty state component.
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <svg
        className="h-12 w-12 text-vault-text-secondary/40"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <p className="mt-3 text-sm font-medium text-vault-text-secondary">
        No transactions yet
      </p>
      <p className="mt-1 text-xs text-vault-text-secondary/70">
        Import documents or add transactions to get started
      </p>
      <Button variant="outline" size="sm" className="mt-4" asChild>
        <Link href="/vault?action=add">Add Transaction</Link>
      </Button>
    </div>
  );
}

/**
 * Skeleton loader for recent transactions list.
 */
function RecentTransactionsListSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-20" />
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg p-3"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-1 h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default RecentTransactionsList;
