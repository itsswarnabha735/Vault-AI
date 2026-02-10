/**
 * Chat API Route for Vault-AI
 *
 * Server-side proxy for Gemini LLM API calls.
 * The API key is only available server-side for security.
 *
 * PRIVACY: Only receives sanitized prompts (no raw text, embeddings, or file data).
 * The client runs verifySafePayload() before sending any data here.
 *
 * Supports both standard and streaming responses.
 */

import { NextRequest, NextResponse } from 'next/server';

// ============================================
// Types
// ============================================

/** A single turn in the multi-turn conversation. */
interface ContentMessage {
  role: 'user' | 'model';
  text: string;
}

interface ChatRequestBody {
  /** The sanitized prompt to send to the LLM (flat string – legacy) */
  prompt?: string;

  /**
   * System instruction for Gemini's native system_instruction field.
   * When provided together with `contents`, the route uses the structured
   * prompt format for better context comprehension.
   */
  systemInstruction?: string;

  /**
   * Multi-turn conversation contents.
   * Each entry has a role ('user' | 'model') and text.
   */
  contents?: ContentMessage[];

  /** Whether to stream the response */
  stream?: boolean;

  /** Generation configuration */
  config?: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
}

// ============================================
// Constants
// ============================================

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.0-flash';

const DEFAULT_CONFIG = {
  temperature: 0.7,
  topP: 0.9,
  maxOutputTokens: 2048,
};

const SAFETY_SETTINGS = [
  {
    category: 'HARM_CATEGORY_HARASSMENT',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE',
  },
  {
    category: 'HARM_CATEGORY_HATE_SPEECH',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE',
  },
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE',
  },
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE',
  },
];

/**
 * Fields that MUST NEVER appear in prompts.
 * Double-check on the server side as a safety net.
 */
const FORBIDDEN_FIELDS = [
  'rawText',
  'embedding',
  'filePath',
  'fileSize',
  'mimeType',
  'ocrOutput',
  'confidence',
  'queryEmbedding',
];

// ============================================
// Server-side safety verification
// ============================================

function verifyPromptSafety(prompt: string): void {
  for (const field of FORBIDDEN_FIELDS) {
    const fieldPattern = new RegExp(`"${field}"\\s*:`, 'i');
    if (fieldPattern.test(prompt)) {
      throw new Error(
        `Privacy violation: prompt contains forbidden field '${field}'`
      );
    }
  }

  // Check for embedding-like patterns
  if (/\[\s*-?0\.\d+\s*,\s*-?0\.\d+\s*,/.test(prompt)) {
    throw new Error(
      'Privacy violation: prompt appears to contain embedding vector data'
    );
  }
}

// ============================================
// POST handler (non-streaming)
// ============================================

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured on server' },
        { status: 500 }
      );
    }

    const body = (await request.json()) as ChatRequestBody;

    // Determine if this is a structured prompt request
    const isStructured =
      typeof body.systemInstruction === 'string' &&
      Array.isArray(body.contents) &&
      body.contents.length > 0;

    // Validate: either structured or flat prompt must be provided
    if (!isStructured && (!body.prompt || typeof body.prompt !== 'string')) {
      return NextResponse.json(
        { error: 'Missing or invalid prompt' },
        { status: 400 }
      );
    }

    // Server-side safety check — inspect all text that will be sent to the LLM
    try {
      if (isStructured) {
        verifyPromptSafety(body.systemInstruction!);
        for (const msg of body.contents!) {
          verifyPromptSafety(msg.text);
        }
      } else {
        verifyPromptSafety(body.prompt!);
      }
    } catch (safetyError) {
      console.error('Privacy violation detected:', safetyError);
      return NextResponse.json(
        {
          error:
            safetyError instanceof Error
              ? safetyError.message
              : 'Privacy violation',
        },
        { status: 422 }
      );
    }

    const config = { ...DEFAULT_CONFIG, ...body.config };

    if (isStructured) {
      // Structured prompt path — uses Gemini's system_instruction + multi-turn
      if (body.stream) {
        return handleStructuredStreamingRequest(
          apiKey,
          body.systemInstruction!,
          body.contents!,
          config
        );
      }
      return handleStructuredStandardRequest(
        apiKey,
        body.systemInstruction!,
        body.contents!,
        config
      );
    }

    // Legacy flat prompt path
    if (body.stream) {
      return handleStreamingRequest(apiKey, body.prompt!, config);
    }

    // Non-streaming request
    return handleStandardRequest(apiKey, body.prompt!, config);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// ============================================
// Standard (non-streaming) request handler
// ============================================

async function handleStandardRequest(
  apiKey: string,
  prompt: string,
  config: typeof DEFAULT_CONFIG
) {
  const url = `${GEMINI_API_BASE}/models/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: config.temperature,
        topP: config.topP,
        maxOutputTokens: config.maxOutputTokens,
      },
      safetySettings: SAFETY_SETTINGS,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as Record<string, Record<string, string>>)?.error?.message ||
      `Gemini API error: ${response.status}`;
    return NextResponse.json(
      { error: errorMessage },
      { status: response.status }
    );
  }

  const data = await response.json();

  // Check for safety blocking
  if (data.candidates?.[0]?.finishReason === 'SAFETY') {
    return NextResponse.json(
      { error: 'Response blocked by safety filters' },
      { status: 422 }
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (!text) {
    return NextResponse.json(
      { error: 'Empty response from Gemini API' },
      { status: 502 }
    );
  }

  const usage = data.usageMetadata
    ? {
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        completionTokens: data.usageMetadata.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata.totalTokenCount || 0,
      }
    : undefined;

  return NextResponse.json({
    text,
    model: DEFAULT_MODEL,
    finishReason: mapFinishReason(data.candidates?.[0]?.finishReason),
    usage,
  });
}

// ============================================
// Structured standard request (system_instruction + multi-turn)
// ============================================

async function handleStructuredStandardRequest(
  apiKey: string,
  systemInstruction: string,
  contents: ContentMessage[],
  config: typeof DEFAULT_CONFIG
) {
  const url = `${GEMINI_API_BASE}/models/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;

  const geminiContents = contents.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.text }],
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: geminiContents,
      generationConfig: {
        temperature: config.temperature,
        topP: config.topP,
        maxOutputTokens: config.maxOutputTokens,
      },
      safetySettings: SAFETY_SETTINGS,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as Record<string, Record<string, string>>)?.error?.message ||
      `Gemini API error: ${response.status}`;
    return NextResponse.json(
      { error: errorMessage },
      { status: response.status }
    );
  }

  const data = await response.json();

  if (data.candidates?.[0]?.finishReason === 'SAFETY') {
    return NextResponse.json(
      { error: 'Response blocked by safety filters' },
      { status: 422 }
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (!text) {
    return NextResponse.json(
      { error: 'Empty response from Gemini API' },
      { status: 502 }
    );
  }

  const usage = data.usageMetadata
    ? {
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        completionTokens: data.usageMetadata.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata.totalTokenCount || 0,
      }
    : undefined;

  return NextResponse.json({
    text,
    model: DEFAULT_MODEL,
    finishReason: mapFinishReason(data.candidates?.[0]?.finishReason),
    usage,
  });
}

// ============================================
// Structured streaming request (system_instruction + multi-turn)
// ============================================

async function handleStructuredStreamingRequest(
  apiKey: string,
  systemInstruction: string,
  contents: ContentMessage[],
  config: typeof DEFAULT_CONFIG
) {
  const url = `${GEMINI_API_BASE}/models/${DEFAULT_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const geminiContents = contents.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.text }],
  }));

  const geminiResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: geminiContents,
      generationConfig: {
        temperature: config.temperature,
        topP: config.topP,
        maxOutputTokens: config.maxOutputTokens,
      },
      safetySettings: SAFETY_SETTINGS,
    }),
  });

  if (!geminiResponse.ok) {
    const errorData = await geminiResponse.json().catch(() => ({}));
    const errorMessage =
      (errorData as Record<string, Record<string, string>>)?.error?.message ||
      `Gemini API error: ${geminiResponse.status}`;
    return NextResponse.json(
      { error: errorMessage },
      { status: geminiResponse.status }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = geminiResponse.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        console.error('Stream error:', error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ============================================
// Legacy streaming request handler (flat prompt)
// ============================================

async function handleStreamingRequest(
  apiKey: string,
  prompt: string,
  config: typeof DEFAULT_CONFIG
) {
  const url = `${GEMINI_API_BASE}/models/${DEFAULT_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const geminiResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: config.temperature,
        topP: config.topP,
        maxOutputTokens: config.maxOutputTokens,
      },
      safetySettings: SAFETY_SETTINGS,
    }),
  });

  if (!geminiResponse.ok) {
    const errorData = await geminiResponse.json().catch(() => ({}));
    const errorMessage =
      (errorData as Record<string, Record<string, string>>)?.error?.message ||
      `Gemini API error: ${geminiResponse.status}`;
    return NextResponse.json(
      { error: errorMessage },
      { status: geminiResponse.status }
    );
  }

  // Create a ReadableStream that forwards the SSE from Gemini
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = geminiResponse.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Send done signal
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          // Forward the SSE data directly
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        console.error('Stream error:', error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ============================================
// Helpers
// ============================================

function mapFinishReason(
  reason?: string
): 'stop' | 'length' | 'safety' | 'error' {
  switch (reason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
      return 'safety';
    default:
      return 'stop';
  }
}
