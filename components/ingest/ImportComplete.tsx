/**
 * ImportComplete Component
 *
 * Success state after documents are imported.
 * Shows summary and navigation options.
 */

'use client';

import { useEffect, useState } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ============================================
// Types
// ============================================

/**
 * Retroactive re-categorization suggestion from the import flow.
 */
export interface RetroactiveSuggestionInfo {
  /** Total number of existing transactions that could be re-categorized */
  totalCount: number;

  /** Number of unique vendors involved */
  vendorCount: number;

  /** Apply the re-categorization */
  onApply: () => Promise<number>;

  /** Dismiss the suggestion */
  onDismiss: () => void;
}

export interface ImportCompleteProps {
  /** Number of documents imported */
  count: number;

  /** Total amount of all transactions */
  totalAmount?: number;

  /** Close handler */
  onClose: () => void;

  /** View in vault handler */
  onViewVault?: () => void;

  /** Import more handler */
  onImportMore?: () => void;

  /** Optional retroactive re-categorization suggestion */
  retroactiveSuggestion?: RetroactiveSuggestionInfo | null;

  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * Import complete success screen.
 *
 * @example
 * ```tsx
 * <ImportComplete
 *   count={5}
 *   totalAmount={1250.50}
 *   onClose={() => setOpen(false)}
 *   onViewVault={() => router.push('/vault')}
 * />
 * ```
 */
export function ImportComplete({
  count,
  totalAmount,
  onClose,
  onViewVault,
  onImportMore,
  retroactiveSuggestion,
  className,
}: ImportCompleteProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [retroApplied, setRetroApplied] = useState(false);
  const [retroAppliedCount, setRetroAppliedCount] = useState(0);
  const [retroApplying, setRetroApplying] = useState(false);

  // Trigger confetti animation
  useEffect(() => {
    setShowConfetti(true);
    const timer = setTimeout(() => setShowConfetti(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Handle retroactive re-categorization
  const handleRetroApply = async () => {
    if (!retroactiveSuggestion) {
      return;
    }
    setRetroApplying(true);
    try {
      const updated = await retroactiveSuggestion.onApply();
      setRetroAppliedCount(updated);
      setRetroApplied(true);
    } finally {
      setRetroApplying(false);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-8 text-center',
        className
      )}
    >
      {/* Success animation */}
      <div className="relative">
        <div
          className={cn(
            'flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30',
            'duration-300 animate-in zoom-in-50'
          )}
        >
          <CheckIcon className="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>

        {/* Confetti particles */}
        {showConfetti && <ConfettiParticles />}
      </div>

      {/* Title */}
      <h2 className="mt-6 text-2xl font-bold text-foreground">
        Import Complete!
      </h2>

      {/* Summary */}
      <p className="mt-2 text-muted-foreground">
        Successfully imported{' '}
        <span className="font-semibold text-foreground">{count}</span> document
        {count !== 1 ? 's' : ''}
        {totalAmount !== undefined && (
          <>
            {' '}
            totaling{' '}
            <span className="font-semibold text-foreground">
              {formatCurrency(totalAmount)}
            </span>
          </>
        )}
      </p>

      {/* Stats */}
      <div className="mt-6 flex items-center gap-6">
        <StatItem
          icon={<FileIcon className="h-5 w-5" />}
          value={count}
          label="Documents"
        />
        {totalAmount !== undefined && (
          <StatItem
            icon={<CurrencyIcon className="h-5 w-5" />}
            value={formatCurrency(totalAmount)}
            label="Total"
          />
        )}
      </div>

      {/* Privacy note */}
      <div className="mt-6 flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <ShieldIcon className="h-4 w-4" />
        <span>All documents stored securely on your device</span>
      </div>

      {/* Retroactive re-categorization suggestion */}
      {retroactiveSuggestion &&
        retroactiveSuggestion.totalCount > 0 &&
        !retroApplied && (
          <div className="mt-6 w-full max-w-sm rounded-lg border border-blue-200 bg-blue-50 p-4 text-left dark:border-blue-800 dark:bg-blue-950/30">
            <div className="flex items-start gap-3">
              <TagIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                  Update existing transactions?
                </p>
                <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
                  Found{' '}
                  <span className="font-semibold">
                    {retroactiveSuggestion.totalCount}
                  </span>{' '}
                  older transaction
                  {retroactiveSuggestion.totalCount !== 1 ? 's' : ''} from{' '}
                  <span className="font-semibold">
                    {retroactiveSuggestion.vendorCount}
                  </span>{' '}
                  vendor{retroactiveSuggestion.vendorCount !== 1 ? 's' : ''}{' '}
                  that can be re-categorized to match your corrections.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleRetroApply}
                    disabled={retroApplying}
                    className="h-7 text-xs"
                  >
                    {retroApplying ? 'Updating...' : 'Update All'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={retroactiveSuggestion.onDismiss}
                    disabled={retroApplying}
                    className="h-7 text-xs"
                  >
                    Skip
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Retroactive applied confirmation */}
      {retroApplied && retroAppliedCount > 0 && (
        <div className="mt-6 flex items-center gap-2 rounded-full bg-blue-100 px-4 py-2 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          <CheckIcon className="h-4 w-4" />
          <span>
            Updated {retroAppliedCount} existing transaction
            {retroAppliedCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {onViewVault && (
          <Button onClick={onViewVault}>
            <FolderIcon className="mr-2 h-4 w-4" />
            View in Vault
          </Button>
        )}
        {onImportMore && (
          <Button variant="outline" onClick={onImportMore}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Import More
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

// ============================================
// Stat Item
// ============================================

interface StatItemProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
}

function StatItem({ icon, value, label }: StatItemProps) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-2xl font-bold text-foreground">{value}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ============================================
// Confetti Particles
// ============================================

function ConfettiParticles() {
  const particles = Array.from({ length: 20 }).map((_, i) => ({
    id: i,
    x: Math.random() * 100 - 50,
    y: Math.random() * -80 - 20,
    size: Math.random() * 6 + 4,
    color: ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899'][
      Math.floor(Math.random() * 5)
    ],
    delay: Math.random() * 0.3,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            transform: `translate(${p.x}px, ${p.y}px)`,
            animation: `confetti 1s ease-out ${p.delay}s forwards`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti {
          0% {
            opacity: 1;
            transform: translate(var(--x, 0), var(--y, 0)) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(
                calc(var(--x, 0) * 2),
                calc(var(--y, 0) + 100px)
              )
              scale(0.5);
          }
        }
      `}</style>
    </div>
  );
}

// ============================================
// Icons
// ============================================

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}

function CurrencyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 6h.008v.008H6V6z"
      />
    </svg>
  );
}

export default ImportComplete;
