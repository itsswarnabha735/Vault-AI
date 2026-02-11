/**
 * Embedding Backfill Service
 *
 * Generates real embeddings for transactions that currently have
 * zero-filled placeholder embeddings (from statement imports, CSV
 * imports, cloud sync, etc.).
 *
 * Extracted from ChatService.ensureVectorIndex() to allow eager
 * backfilling on app startup / dashboard load, rather than waiting
 * until the user opens chat.
 *
 * PRIVACY: All embedding generation happens locally via Transformers.js.
 * Embeddings never leave the device.
 */

import { db } from '@/lib/storage/db';
import { embeddingService } from '@/lib/ai/embedding-service';
import { isRealEmbedding } from '@/lib/ai/embedding-classifier';
import type { LocalTransaction, CategoryId } from '@/types/database';

// ============================================
// Helpers
// ============================================

/**
 * Get a currency symbol for formatting.
 */
function getCurrencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || currency;
  } catch {
    return currency;
  }
}

/**
 * Build a natural-language text string from a transaction's structured fields.
 * Produces sentence-form text that embeds well with MiniLM-L6-v2.
 */
function buildSearchText(
  tx: LocalTransaction,
  categoryNames: Map<CategoryId, string>
): string {
  const absAmount = Math.abs(tx.amount).toFixed(2);
  const categoryName = tx.category ? categoryNames.get(tx.category) || '' : '';

  let dateText = tx.date;
  try {
    const d = new Date(`${tx.date}T00:00:00`);
    dateText = d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    // Keep ISO format on failure
  }

  const symbol = getCurrencySymbol(tx.currency || 'INR');

  if (tx.amount < 0) {
    const vendorPart = tx.vendor ? `from ${tx.vendor}` : 'received';
    const catPart = categoryName ? ` categorized as ${categoryName}` : '';
    const notePart = tx.note ? `. ${tx.note}` : '';
    return `Income credit of ${symbol}${absAmount} ${vendorPart} on ${dateText}${catPart}${notePart}`;
  } else {
    const vendorPart = tx.vendor ? `at ${tx.vendor}` : '';
    const catPart = categoryName ? ` for ${categoryName}` : '';
    const notePart = tx.note ? `. ${tx.note}` : '';
    return `Expense payment of ${symbol}${absAmount} ${vendorPart} on ${dateText}${catPart}${notePart}`;
  }
}

// ============================================
// Configuration
// ============================================

/** Batch size for embedding generation */
const BATCH_SIZE = 20;

/** Session key to avoid redundant runs */
const SESSION_KEY = 'vault-ai-embedding-backfill-done';

// ============================================
// Backfill Service
// ============================================

export interface BackfillProgress {
  total: number;
  completed: number;
  status: 'idle' | 'initializing' | 'running' | 'done' | 'error';
}

class EmbeddingBackfillService {
  private running = false;

  /**
   * Find transactions that have zero-filled / missing embeddings.
   */
  async getTransactionsNeedingEmbeddings(): Promise<LocalTransaction[]> {
    const transactions = await db.transactions.toArray();
    return transactions.filter((tx) => !isRealEmbedding(tx.embedding));
  }

  /**
   * Run the backfill: generate real embeddings for all transactions
   * that currently have zero-filled placeholders.
   *
   * @param onProgress - Optional callback for progress updates
   * @returns Number of transactions that were backfilled
   */
  async run(
    onProgress?: (progress: BackfillProgress) => void
  ): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    const report = (p: Partial<BackfillProgress> & { status: BackfillProgress['status'] }) => {
      onProgress?.({ total: 0, completed: 0, ...p });
    };

    try {
      report({ status: 'initializing' });

      // 1. Ensure the embedding model is loaded
      if (!embeddingService.isReady()) {
        await embeddingService.initialize();
      }

      // 2. Find transactions needing embeddings
      const toBackfill = await this.getTransactionsNeedingEmbeddings();
      if (toBackfill.length === 0) {
        report({ status: 'done', total: 0, completed: 0 });
        this.running = false;
        return 0;
      }

      console.log(
        `[EmbeddingBackfill] Found ${toBackfill.length} transactions needing embeddings`
      );

      // 3. Build category name lookup
      const categories = await db.categories.toArray();
      const categoryNames = new Map<CategoryId, string>();
      for (const cat of categories) {
        categoryNames.set(cat.id, cat.name as string);
      }

      // 4. Process in batches
      let completed = 0;
      report({ status: 'running', total: toBackfill.length, completed: 0 });

      for (let i = 0; i < toBackfill.length; i += BATCH_SIZE) {
        const batch = toBackfill.slice(i, i + BATCH_SIZE);

        for (const tx of batch) {
          try {
            // Generate embedding from structured fields
            // (rawText may be empty for statement/CSV imports)
            const text = tx.rawText && tx.rawText.trim().length > 10
              ? tx.rawText
              : buildSearchText(tx, categoryNames);

            const embedding = await embeddingService.embedText(text);

            // Update the transaction in IndexedDB
            await db.transactions.update(tx.id, { embedding });
            completed++;
          } catch (error) {
            console.warn(
              `[EmbeddingBackfill] Failed for ${tx.id}:`,
              error
            );
          }
        }

        report({ status: 'running', total: toBackfill.length, completed });
      }

      report({ status: 'done', total: toBackfill.length, completed });

      console.log(
        `[EmbeddingBackfill] Completed: ${completed}/${toBackfill.length} transactions`
      );

      return completed;
    } catch (error) {
      console.error('[EmbeddingBackfill] Failed:', error);
      report({ status: 'error' });
      return 0;
    } finally {
      this.running = false;
    }
  }

  /**
   * Run backfill only once per session.
   * Returns true if it ran, false if skipped.
   */
  async runOncePerSession(
    onProgress?: (progress: BackfillProgress) => void
  ): Promise<boolean> {
    // Check if already run this session
    try {
      if (sessionStorage.getItem(SESSION_KEY)) {
        return false;
      }
    } catch {
      // sessionStorage unavailable
    }

    // Quick check: any transactions need backfill?
    const needing = await this.getTransactionsNeedingEmbeddings();
    if (needing.length === 0) {
      try {
        sessionStorage.setItem(SESSION_KEY, Date.now().toString());
      } catch {
        // ignore
      }
      return false;
    }

    const count = await this.run(onProgress);

    if (count > 0) {
      try {
        sessionStorage.setItem(SESSION_KEY, Date.now().toString());
      } catch {
        // ignore
      }
    }

    return count > 0;
  }

  /**
   * Check if backfill is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }
}

// ============================================
// Singleton Export
// ============================================

export const embeddingBackfill = new EmbeddingBackfillService();
