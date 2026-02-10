/**
 * LLM Client for Vault-AI
 *
 * Provides a unified interface for LLM API calls.
 * On the client side, calls go through /api/chat route (server-side proxy).
 * On the server side, calls go directly to the Gemini API.
 *
 * PRIVACY: All prompts MUST be verified safe before calling this client.
 * Use prompt-builder.ts to construct privacy-safe prompts.
 */

import { VaultError } from '@/lib/errors';
import type { StructuredPrompt } from '@/lib/ai/prompt-builder';

// ============================================
// Types
// ============================================

/**
 * LLM provider types.
 */
export type LLMProvider = 'gemini' | 'openai' | 'anthropic';

/**
 * LLM response.
 */
export interface LLMResponse {
  /** Generated text content */
  text: string;

  /** Token usage information */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /** Model used for generation */
  model: string;

  /** Generation time in milliseconds */
  generationTimeMs: number;

  /** Whether the response was cut off */
  finishReason: 'stop' | 'length' | 'safety' | 'error';
}

/**
 * LLM configuration.
 */
export interface LLMConfig {
  /** API key (should be from environment) */
  apiKey: string;

  /** Model to use */
  model: string;

  /** Maximum tokens to generate */
  maxTokens: number;

  /** Temperature for randomness (0-1) */
  temperature: number;

  /** Top-p sampling */
  topP: number;

  /** Request timeout in milliseconds */
  timeoutMs: number;

  /** Number of retries on failure */
  maxRetries: number;

  /** Base delay between retries in milliseconds */
  retryDelayMs: number;
}

/**
 * Streaming callback for real-time text updates.
 */
export type StreamCallback = (chunk: string, done: boolean) => void;

/**
 * Per-call generation overrides.
 * Allows the caller to override temperature, topP, etc. for individual calls
 * (e.g., lower temperature for financial accuracy queries).
 */
export interface GenerationOverrides {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

/**
 * LLM client interface.
 */
export interface LLMClient {
  /** Generate a completion from a flat prompt string */
  generate(
    prompt: string,
    overrides?: GenerationOverrides
  ): Promise<LLMResponse>;

  /** Generate with streaming from a flat prompt string */
  generateStream(
    prompt: string,
    onChunk: StreamCallback,
    overrides?: GenerationOverrides
  ): Promise<LLMResponse>;

  /**
   * Generate a completion from a structured prompt (system_instruction + multi-turn).
   * Falls back to flat text if the provider doesn't support structured prompts.
   */
  generateStructured(
    structured: StructuredPrompt,
    overrides?: GenerationOverrides
  ): Promise<LLMResponse>;

  /**
   * Generate with streaming from a structured prompt (system_instruction + multi-turn).
   * Falls back to flat text if the provider doesn't support structured prompts.
   */
  generateStreamStructured(
    structured: StructuredPrompt,
    onChunk: StreamCallback,
    overrides?: GenerationOverrides
  ): Promise<LLMResponse>;

  /** Check if client is configured and ready */
  isReady(): boolean;

  /** Get the current provider */
  getProvider(): LLMProvider;

  /** Get the current model */
  getModel(): string;
}

// ============================================
// Errors
// ============================================

/**
 * LLM-specific error.
 */
export class LLMError extends VaultError {
  constructor(
    message: string,
    public statusCode?: number,
    recoverable: boolean = true
  ) {
    super(message, 'LLM_ERROR', recoverable);
    this.name = 'LLMError';
  }
}

/**
 * Rate limit error.
 */
export class RateLimitError extends LLMError {
  constructor(
    message: string = 'Rate limit exceeded. Please try again later.',
    public retryAfterMs?: number
  ) {
    super(message, 429, true);
    this.name = 'RateLimitError';
  }
}

/**
 * Configuration error.
 */
export class LLMConfigError extends LLMError {
  constructor(message: string) {
    super(message, undefined, false);
    this.name = 'LLMConfigError';
  }
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_GEMINI_CONFIG: LLMConfig = {
  apiKey: '',
  model: 'gemini-2.0-flash',
  maxTokens: 2048,
  temperature: 0.7,
  topP: 0.9,
  timeoutMs: 30000,
  maxRetries: 3,
  retryDelayMs: 1000,
};

// ============================================
// API Route Proxy Client (Browser-side)
// ============================================

/**
 * Client that proxies LLM calls through the /api/chat server route.
 * Used on the client side where API keys are not available.
 */
export class ApiRouteProxyClient implements LLMClient {
  private config: LLMConfig;

  constructor(config: Partial<LLMConfig> = {}) {
    this.config = { ...DEFAULT_GEMINI_CONFIG, ...config };
  }

  /**
   * The proxy client is always ready since the server handles the API key.
   */
  isReady(): boolean {
    return true;
  }

  getProvider(): LLMProvider {
    return 'gemini';
  }

  getModel(): string {
    return this.config.model;
  }

  /**
   * Generate a completion via the server API route.
   */
  async generate(
    prompt: string,
    overrides?: GenerationOverrides
  ): Promise<LLMResponse> {
    const startTime = performance.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            stream: false,
            config: {
              temperature: overrides?.temperature ?? this.config.temperature,
              topP: overrides?.topP ?? this.config.topP,
              maxOutputTokens: overrides?.maxTokens ?? this.config.maxTokens,
            },
          }),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            (errorData as { error?: string }).error ||
            `API error: ${response.status}`;

          if (response.status === 429) {
            const delay = this.config.retryDelayMs * Math.pow(2, attempt);
            await this.sleep(delay);
            continue;
          }

          throw new LLMError(
            errorMessage,
            response.status,
            response.status >= 500
          );
        }

        const data = await response.json();

        return {
          text: data.text,
          model: data.model || this.config.model,
          generationTimeMs: performance.now() - startTime,
          finishReason: data.finishReason || 'stop',
          usage: data.usage,
        };
      } catch (error) {
        lastError = error as Error;

        if (error instanceof LLMError && !error.recoverable) {
          throw error;
        }

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw (
      lastError || new LLMError('Failed to generate response after retries')
    );
  }

  /**
   * Generate with streaming via the server API route.
   */
  async generateStream(
    prompt: string,
    onChunk: StreamCallback,
    overrides?: GenerationOverrides
  ): Promise<LLMResponse> {
    const startTime = performance.now();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          stream: true,
          config: {
            temperature: overrides?.temperature ?? this.config.temperature,
            topP: overrides?.topP ?? this.config.topP,
            maxOutputTokens: overrides?.maxTokens ?? this.config.maxTokens,
          },
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          (errorData as { error?: string }).error ||
          `API error: ${response.status}`;
        throw new LLMError(errorMessage, response.status);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new LLMError('No response body for streaming');
      }

      const decoder = new TextDecoder();
      let fullText = '';
      let promptTokens = 0;
      let completionTokens = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          onChunk('', true);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim() === '[DONE]') {
              continue;
            }

            try {
              const data = JSON.parse(jsonStr);
              const text =
                data.candidates?.[0]?.content?.parts?.[0]?.text || '';

              if (text) {
                fullText += text;
                onChunk(text, false);
              }

              if (data.usageMetadata) {
                promptTokens = data.usageMetadata.promptTokenCount || 0;
                completionTokens = data.usageMetadata.candidatesTokenCount || 0;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      return {
        text: fullText,
        model: this.config.model,
        generationTimeMs: performance.now() - startTime,
        finishReason: 'stop',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      throw new LLMError(
        `Streaming generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate a completion using a structured prompt (system_instruction + multi-turn).
   * Sends the structured data to /api/chat which applies Gemini's native format.
   */
  async generateStructured(
    structured: StructuredPrompt,
    overrides?: GenerationOverrides
  ): Promise<LLMResponse> {
    const startTime = performance.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: structured.systemInstruction,
            contents: structured.contents,
            stream: false,
            config: {
              temperature: overrides?.temperature ?? this.config.temperature,
              topP: overrides?.topP ?? this.config.topP,
              maxOutputTokens: overrides?.maxTokens ?? this.config.maxTokens,
            },
          }),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            (errorData as { error?: string }).error ||
            `API error: ${response.status}`;

          if (response.status === 429) {
            const delay = this.config.retryDelayMs * Math.pow(2, attempt);
            await this.sleep(delay);
            continue;
          }

          throw new LLMError(
            errorMessage,
            response.status,
            response.status >= 500
          );
        }

        const data = await response.json();

        return {
          text: data.text,
          model: data.model || this.config.model,
          generationTimeMs: performance.now() - startTime,
          finishReason: data.finishReason || 'stop',
          usage: data.usage,
        };
      } catch (error) {
        lastError = error as Error;

        if (error instanceof LLMError && !error.recoverable) {
          throw error;
        }

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw (
      lastError || new LLMError('Failed to generate response after retries')
    );
  }

  /**
   * Stream a completion using a structured prompt (system_instruction + multi-turn).
   */
  async generateStreamStructured(
    structured: StructuredPrompt,
    onChunk: StreamCallback,
    overrides?: GenerationOverrides
  ): Promise<LLMResponse> {
    const startTime = performance.now();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: structured.systemInstruction,
          contents: structured.contents,
          stream: true,
          config: {
            temperature: overrides?.temperature ?? this.config.temperature,
            topP: overrides?.topP ?? this.config.topP,
            maxOutputTokens: overrides?.maxTokens ?? this.config.maxTokens,
          },
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          (errorData as { error?: string }).error ||
          `API error: ${response.status}`;
        throw new LLMError(errorMessage, response.status);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new LLMError('No response body for streaming');
      }

      const decoder = new TextDecoder();
      let fullText = '';
      let promptTokens = 0;
      let completionTokens = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          onChunk('', true);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim() === '[DONE]') {
              continue;
            }

            try {
              const data = JSON.parse(jsonStr);
              const text =
                data.candidates?.[0]?.content?.parts?.[0]?.text || '';

              if (text) {
                fullText += text;
                onChunk(text, false);
              }

              if (data.usageMetadata) {
                promptTokens = data.usageMetadata.promptTokenCount || 0;
                completionTokens = data.usageMetadata.candidatesTokenCount || 0;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      return {
        text: fullText,
        model: this.config.model,
        generationTimeMs: performance.now() - startTime,
        finishReason: 'stop',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      throw new LLMError(
        `Streaming generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================
// Gemini Direct Client (Server-side)
// ============================================

/**
 * Google Gemini API client for direct server-side calls.
 */
export class GeminiClient implements LLMClient {
  private config: LLMConfig;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(config: Partial<LLMConfig> = {}) {
    this.config = { ...DEFAULT_GEMINI_CONFIG, ...config };
  }

  isReady(): boolean {
    return Boolean(this.config.apiKey);
  }

  getProvider(): LLMProvider {
    return 'gemini';
  }

  getModel(): string {
    return this.config.model;
  }

  async generate(
    prompt: string,
    overrides?: GenerationOverrides
  ): Promise<LLMResponse> {
    if (!this.isReady()) {
      throw new LLMConfigError('Gemini API key not configured');
    }

    const startTime = performance.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest(prompt, overrides);
        return {
          ...response,
          generationTimeMs: performance.now() - startTime,
        };
      } catch (error) {
        lastError = error as Error;

        if (error instanceof LLMError && !error.recoverable) {
          throw error;
        }

        if (error instanceof RateLimitError) {
          const delay =
            error.retryAfterMs ||
            this.config.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw (
      lastError || new LLMError('Failed to generate response after retries')
    );
  }

  async generateStream(
    prompt: string,
    onChunk: StreamCallback,
    overrides?: GenerationOverrides
  ): Promise<LLMResponse> {
    if (!this.isReady()) {
      throw new LLMConfigError('Gemini API key not configured');
    }

    const startTime = performance.now();

    try {
      const url = `${this.baseUrl}/models/${this.config.model}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: overrides?.temperature ?? this.config.temperature,
            topP: overrides?.topP ?? this.config.topP,
            maxOutputTokens: overrides?.maxTokens ?? this.config.maxTokens,
          },
          safetySettings: [
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
          ],
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        throw await this.handleErrorResponse(response);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new LLMError('No response body for streaming');
      }

      const decoder = new TextDecoder();
      let fullText = '';
      let promptTokens = 0;
      let completionTokens = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          onChunk('', true);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim() === '[DONE]') {
              continue;
            }

            try {
              const data = JSON.parse(jsonStr);
              const text =
                data.candidates?.[0]?.content?.parts?.[0]?.text || '';

              if (text) {
                fullText += text;
                onChunk(text, false);
              }

              if (data.usageMetadata) {
                promptTokens = data.usageMetadata.promptTokenCount || 0;
                completionTokens = data.usageMetadata.candidatesTokenCount || 0;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      return {
        text: fullText,
        model: this.config.model,
        generationTimeMs: performance.now() - startTime,
        finishReason: 'stop',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      throw new LLMError(
        `Streaming generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate a completion using a structured prompt with native system_instruction.
   */
  async generateStructured(
    structured: StructuredPrompt,
    overrides?: GenerationOverrides
  ): Promise<LLMResponse> {
    if (!this.isReady()) {
      throw new LLMConfigError('Gemini API key not configured');
    }

    const startTime = performance.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.makeStructuredRequest(
          structured,
          overrides
        );
        return {
          ...response,
          generationTimeMs: performance.now() - startTime,
        };
      } catch (error) {
        lastError = error as Error;

        if (error instanceof LLMError && !error.recoverable) {
          throw error;
        }

        if (error instanceof RateLimitError) {
          const delay =
            error.retryAfterMs ||
            this.config.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw (
      lastError || new LLMError('Failed to generate response after retries')
    );
  }

  /**
   * Stream a completion using a structured prompt with native system_instruction.
   */
  async generateStreamStructured(
    structured: StructuredPrompt,
    onChunk: StreamCallback,
    overrides?: GenerationOverrides
  ): Promise<LLMResponse> {
    if (!this.isReady()) {
      throw new LLMConfigError('Gemini API key not configured');
    }

    const startTime = performance.now();

    try {
      const url = `${this.baseUrl}/models/${this.config.model}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;

      // Build multi-turn contents
      const contents = structured.contents.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      }));

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: structured.systemInstruction }],
          },
          contents,
          generationConfig: {
            temperature: overrides?.temperature ?? this.config.temperature,
            topP: overrides?.topP ?? this.config.topP,
            maxOutputTokens: overrides?.maxTokens ?? this.config.maxTokens,
          },
          safetySettings: [
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
          ],
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        throw await this.handleErrorResponse(response);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new LLMError('No response body for streaming');
      }

      const decoder = new TextDecoder();
      let fullText = '';
      let promptTokens = 0;
      let completionTokens = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          onChunk('', true);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim() === '[DONE]') {
              continue;
            }

            try {
              const data = JSON.parse(jsonStr);
              const text =
                data.candidates?.[0]?.content?.parts?.[0]?.text || '';

              if (text) {
                fullText += text;
                onChunk(text, false);
              }

              if (data.usageMetadata) {
                promptTokens = data.usageMetadata.promptTokenCount || 0;
                completionTokens = data.usageMetadata.candidatesTokenCount || 0;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      return {
        text: fullText,
        model: this.config.model,
        generationTimeMs: performance.now() - startTime,
        finishReason: 'stop',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      throw new LLMError(
        `Streaming generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Make a structured Gemini API request using system_instruction + multi-turn contents.
   */
  private async makeStructuredRequest(
    structured: StructuredPrompt,
    overrides?: GenerationOverrides
  ): Promise<Omit<LLMResponse, 'generationTimeMs'>> {
    const url = `${this.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    // Build multi-turn contents
    const contents = structured.contents.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: structured.systemInstruction }],
        },
        contents,
        generationConfig: {
          temperature: overrides?.temperature ?? this.config.temperature,
          topP: overrides?.topP ?? this.config.topP,
          maxOutputTokens: overrides?.maxTokens ?? this.config.maxTokens,
        },
        safetySettings: [
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
        ],
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const data = await response.json();

    if (data.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new LLMError(
        'Response blocked by safety filters',
        undefined,
        false
      );
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      throw new LLMError('Empty response from Gemini API');
    }

    const usage = data.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount || 0,
          completionTokens: data.usageMetadata.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata.totalTokenCount || 0,
        }
      : undefined;

    const finishReason = this.mapFinishReason(
      data.candidates?.[0]?.finishReason
    );

    return { text, model: this.config.model, finishReason, usage };
  }

  private async makeRequest(
    prompt: string,
    overrides?: GenerationOverrides
  ): Promise<Omit<LLMResponse, 'generationTimeMs'>> {
    const url = `${this.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: overrides?.temperature ?? this.config.temperature,
          topP: overrides?.topP ?? this.config.topP,
          maxOutputTokens: overrides?.maxTokens ?? this.config.maxTokens,
        },
        safetySettings: [
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
        ],
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const data = await response.json();

    if (data.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new LLMError(
        'Response blocked by safety filters',
        undefined,
        false
      );
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      throw new LLMError('Empty response from Gemini API');
    }

    const usage = data.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount || 0,
          completionTokens: data.usageMetadata.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata.totalTokenCount || 0,
        }
      : undefined;

    const finishReason = this.mapFinishReason(
      data.candidates?.[0]?.finishReason
    );

    return { text, model: this.config.model, finishReason, usage };
  }

  private async handleErrorResponse(response: Response): Promise<LLMError> {
    let errorMessage = `API error: ${response.status}`;

    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || errorMessage;
    } catch {
      // Use default message
    }

    switch (response.status) {
      case 429: {
        const retryAfter = response.headers.get('Retry-After');
        return new RateLimitError(
          errorMessage,
          retryAfter ? parseInt(retryAfter) * 1000 : undefined
        );
      }
      case 401:
        return new LLMConfigError('Invalid API key');
      case 403:
        return new LLMConfigError(
          'API access forbidden. Check your API key permissions.'
        );
      case 400:
        return new LLMError(errorMessage, 400, false);
      case 500:
      case 502:
      case 503:
      case 504:
        return new LLMError(errorMessage, response.status, true);
      default:
        return new LLMError(errorMessage, response.status);
    }
  }

  private mapFinishReason(
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================
// Fallback Response Generator
// ============================================

/**
 * Generate a fallback response when LLM is unavailable.
 * Used for offline mode or when API calls fail.
 */
export function generateFallbackResponse(
  query: string,
  hasData: boolean
): LLMResponse {
  let text: string;

  if (!hasData) {
    text =
      `I couldn't find any transactions matching your query "${query}". ` +
      'Please try a different search term, or make sure you have imported some documents.';
  } else {
    text =
      "I'm having trouble connecting to the AI service right now. " +
      'However, I found some relevant transactions in your data. ' +
      'Please check the citations below for details.';
  }

  return {
    text,
    model: 'fallback',
    generationTimeMs: 0,
    finishReason: 'stop',
  };
}

/**
 * Generate suggested follow-ups without LLM.
 */
export function generateFallbackFollowups(query: string): string[] {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes('spend') || lowerQuery.includes('spent')) {
    return [
      'Show me spending by category',
      'What were my largest expenses?',
      'Compare this month to last month',
    ];
  }

  if (
    lowerQuery.includes('income') ||
    lowerQuery.includes('earn') ||
    lowerQuery.includes('credit') ||
    lowerQuery.includes('salary') ||
    lowerQuery.includes('deposit')
  ) {
    return [
      'Show me my income this month',
      'What were my largest deposits?',
      'How does my income compare to expenses?',
    ];
  }

  if (lowerQuery.includes('budget')) {
    return [
      'How much is left in my budget?',
      'Which categories are over budget?',
      'Show me my spending this month',
    ];
  }

  if (lowerQuery.includes('find') || lowerQuery.includes('search')) {
    return [
      'Show me all transactions this month',
      'Find my largest purchases',
      'Search for recent expenses',
    ];
  }

  // Default suggestions
  return [
    'What did I spend this month?',
    'How much did I earn this month?',
    "What's my budget status?",
  ];
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create an LLM client based on environment.
 * On the client (browser), returns ApiRouteProxyClient.
 * On the server, returns GeminiClient with API key.
 */
export function createLLMClient(
  provider: LLMProvider = 'gemini',
  config: Partial<LLMConfig> = {}
): LLMClient {
  const isBrowser = typeof window !== 'undefined';

  if (isBrowser) {
    // Client-side: use the API route proxy
    return new ApiRouteProxyClient(config);
  }

  // Server-side: use direct Gemini client with API key
  const apiKey = config.apiKey || getApiKeyFromEnv(provider);

  switch (provider) {
    case 'gemini':
      return new GeminiClient({ ...config, apiKey });
    default:
      return new GeminiClient({ ...config, apiKey });
  }
}

/**
 * Get API key from environment variables (server-side only).
 */
function getApiKeyFromEnv(provider: LLMProvider): string {
  if (typeof window !== 'undefined') {
    return '';
  }

  switch (provider) {
    case 'gemini':
      return process.env.GOOGLE_GEMINI_API_KEY || '';
    case 'openai':
      return process.env.OPENAI_API_KEY || '';
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY || '';
    default:
      return '';
  }
}

// ============================================
// Singleton Instance
// ============================================

let defaultClient: LLMClient | null = null;

/**
 * Get the default LLM client.
 * Returns ApiRouteProxyClient on client, GeminiClient on server.
 */
export function getLLMClient(): LLMClient {
  if (!defaultClient) {
    defaultClient = createLLMClient('gemini');
  }
  return defaultClient;
}

/**
 * Check if LLM is available.
 * On client side, always true (API route proxy handles the key).
 * On server side, checks for API key.
 */
export function isLLMAvailable(): boolean {
  return getLLMClient().isReady();
}

// GeminiClient, ApiRouteProxyClient, and types are exported inline above
