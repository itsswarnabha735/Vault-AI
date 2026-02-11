/**
 * API Route: LLM-Assisted Transaction Categorization
 *
 * Server-side endpoint that uses Google Gemini to suggest categories
 * for transactions when the local auto-categorizer has low confidence.
 *
 * Supports both single-transaction and batch categorization (up to 50
 * transactions per request) for efficiency.
 *
 * PRIVACY NOTE:
 * Only structured financial data (vendor, amount, date, type) is sent
 * to the LLM — all within the SYNCABLE_FIELDS whitelist. No raw text,
 * embeddings, or documents are transmitted.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  buildLLMCategoryBlock,
  getAllCategoryNames,
} from '@/lib/categories/category-registry';

// ============================================
// Types
// ============================================

interface TransactionInput {
  /** Unique client-side id (returned as-is in the response) */
  id: string;
  /** Vendor / merchant name */
  vendor: string;
  /** Transaction amount (positive = debit, negative = credit) */
  amount: number;
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Transaction type */
  type?: 'debit' | 'credit' | 'fee' | 'refund' | 'payment' | 'interest';
}

interface CategorizeRequest {
  /** Array of transactions to categorize (max 50) */
  transactions: TransactionInput[];
}

interface CategorizeResult {
  /** Matches input id */
  id: string;
  /** Suggested category name (from the canonical list) */
  category: string;
  /** LLM's confidence estimate (0-1) */
  confidence: number;
  /** Brief reasoning (optional, for UI tooltip) */
  reason?: string;
}

interface CategorizeResponse {
  results: CategorizeResult[];
  /** Model used */
  model: string;
  /** Processing time in ms */
  processingTimeMs: number;
}

// ============================================
// Configuration
// ============================================

const MODEL = 'gemini-2.0-flash-lite';
const MAX_OUTPUT_TOKENS = 4096;
const TEMPERATURE = 0.05;
const TIMEOUT_MS = 30_000;
const MAX_BATCH_SIZE = 50;

// ============================================
// Helpers
// ============================================

/**
 * Build the prompt for Gemini to categorise transactions.
 */
function buildCategorizationPrompt(transactions: TransactionInput[]): string {
  const txList = transactions
    .map(
      (tx, i) =>
        `${i + 1}. id="${tx.id}" | vendor="${tx.vendor}" | amount=${tx.amount} | date=${tx.date} | type=${tx.type || 'debit'}`
    )
    .join('\n');

  return `You are an expert financial categorisation engine. Assign the most appropriate spending category to each transaction below.

${buildLLMCategoryBlock()}

Transactions to categorise:
${txList}

Respond with a JSON array (no markdown fences). Each element must be:
{
  "id": "<matching input id>",
  "category": "<exact category name from the allowed list>",
  "confidence": <0.0 to 1.0>,
  "reason": "<one short phrase explaining why>"
}

Rules:
- Use ONLY category names from the allowed list above.
- confidence should reflect how sure you are (0.9+ = very sure, 0.5-0.8 = plausible, <0.5 = unsure).
- If truly uncertain, use "Other" with low confidence.
- Return results for ALL transactions, in the same order.
- Respond ONLY with the JSON array, nothing else.`;
}

/**
 * Parse the LLM response JSON.
 */
function parseLLMResponse(
  text: string,
  validCategories: Set<string>
): CategorizeResult[] {
  // Strip markdown fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error('LLM response is not an array');
  }

  return parsed.map((item: Record<string, unknown>) => {
    const category = String(item.category || 'Other');
    return {
      id: String(item.id || ''),
      category: validCategories.has(category) ? category : 'Other',
      confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0.5)),
      reason: item.reason ? String(item.reason) : undefined,
    };
  });
}

// ============================================
// Route Handler
// ============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = (await request.json()) as CategorizeRequest;

    // Validate
    if (!body.transactions || !Array.isArray(body.transactions)) {
      return NextResponse.json(
        { error: 'Missing or invalid "transactions" array' },
        { status: 400 }
      );
    }

    if (body.transactions.length === 0) {
      return NextResponse.json(
        { results: [], model: MODEL, processingTimeMs: 0 },
        { status: 200 }
      );
    }

    if (body.transactions.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum batch size is ${MAX_BATCH_SIZE} transactions` },
        { status: 400 }
      );
    }

    // Get API key
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_GEMINI_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Build prompt
    const prompt = buildCategorizationPrompt(body.transactions);

    // Call Gemini API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              temperature: TEMPERATURE,
              responseMimeType: 'application/json',
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          '[categorize-transaction] Gemini API error:',
          response.status,
          errorText
        );
        return NextResponse.json(
          { error: `Gemini API error: ${response.status}` },
          { status: 502 }
        );
      }

      const geminiResponse = await response.json();
      const responseText =
        geminiResponse?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!responseText) {
        console.error(
          '[categorize-transaction] Empty Gemini response:',
          JSON.stringify(geminiResponse).slice(0, 500)
        );
        return NextResponse.json(
          { error: 'Empty response from Gemini' },
          { status: 502 }
        );
      }

      // Parse response
      const validCategories = new Set(getAllCategoryNames());
      const results = parseLLMResponse(responseText, validCategories);

      const processingTimeMs = Date.now() - startTime;

      return NextResponse.json({
        results,
        model: MODEL,
        processingTimeMs,
      } satisfies CategorizeResponse);
    } catch (fetchError: unknown) {
      clearTimeout(timeout);

      if (
        fetchError instanceof DOMException &&
        fetchError.name === 'AbortError'
      ) {
        return NextResponse.json(
          { error: 'Request timed out' },
          { status: 504 }
        );
      }

      throw fetchError;
    }
  } catch (error) {
    console.error('[categorize-transaction] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
