/**
 * Custom Error Classes for Vault AI
 *
 * Standardized error handling across the application.
 */

export class VaultError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'VaultError';
    Object.setPrototypeOf(this, VaultError.prototype);
  }
}

export class ProcessingError extends VaultError {
  constructor(message: string, recoverable: boolean = true) {
    super(message, 'PROCESSING_ERROR', recoverable);
    this.name = 'ProcessingError';
  }
}

export class StorageError extends VaultError {
  constructor(message: string, recoverable: boolean = true) {
    super(message, 'STORAGE_ERROR', recoverable);
    this.name = 'StorageError';
  }
}

export class SyncError extends VaultError {
  constructor(message: string, recoverable: boolean = true) {
    super(message, 'SYNC_ERROR', recoverable);
    this.name = 'SyncError';
  }
}

export class AuthError extends VaultError {
  constructor(message: string, recoverable: boolean = false) {
    super(message, 'AUTH_ERROR', recoverable);
    this.name = 'AuthError';
  }
}

export class EmbeddingError extends VaultError {
  constructor(
    message: string,
    code: string = 'EMBEDDING_ERROR',
    recoverable: boolean = true
  ) {
    super(message, code, recoverable);
    this.name = 'EmbeddingError';
  }
}

export class ModelNotReadyError extends EmbeddingError {
  constructor(
    message: string = 'Model not initialized. Call initialize() first.'
  ) {
    super(message, 'MODEL_NOT_READY', true);
    this.name = 'ModelNotReadyError';
  }
}

export class ModelLoadError extends EmbeddingError {
  constructor(message: string, recoverable: boolean = true) {
    super(message, 'MODEL_LOAD_ERROR', recoverable);
    this.name = 'ModelLoadError';
  }
}

export class InferenceError extends EmbeddingError {
  constructor(message: string, recoverable: boolean = true) {
    super(message, 'INFERENCE_ERROR', recoverable);
    this.name = 'InferenceError';
  }
}

/**
 * Handles errors in a standardized way
 */
export function handleError(error: unknown): string {
  if (error instanceof VaultError) {
    return error.message;
  }

  if (error instanceof Error) {
    console.error('Unknown error:', error);
    return 'Something went wrong. Please try again.';
  }

  console.error('Unknown error:', error);
  return 'An unexpected error occurred.';
}
