/**
 * Thumbnail Generator for Vault-AI
 *
 * Generates thumbnails for PDFs and images for display in the UI.
 * Outputs WebP format for optimal size.
 *
 * PRIVACY: All thumbnail generation happens locally in the browser.
 * No images are ever transmitted to external servers.
 */

// ============================================
// Types
// ============================================

/**
 * Thumbnail generation result.
 */
export interface ThumbnailResult {
  /** Thumbnail as Blob */
  blob: Blob;

  /** Thumbnail as data URL */
  dataUrl: string;

  /** Width of thumbnail */
  width: number;

  /** Height of thumbnail */
  height: number;

  /** Size in bytes */
  size: number;

  /** Format of the thumbnail */
  format: 'webp' | 'jpeg' | 'png';

  /** Generation time in milliseconds */
  generationTimeMs: number;
}

/**
 * Thumbnail generation options.
 */
export interface ThumbnailOptions {
  /** Maximum width (default: 200) */
  maxWidth?: number;

  /** Maximum height (default: 200) */
  maxHeight?: number;

  /** Quality for lossy formats (0-1, default: 0.8) */
  quality?: number;

  /** Output format preference (default: webp) */
  format?: 'webp' | 'jpeg' | 'png';

  /** Background color for PDFs (default: white) */
  backgroundColor?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MAX_WIDTH = 200;
const DEFAULT_MAX_HEIGHT = 200;
const DEFAULT_QUALITY = 0.8;
const DEFAULT_FORMAT = 'webp';
const DEFAULT_BACKGROUND_COLOR = '#FFFFFF';

// ============================================
// ThumbnailGenerator Class
// ============================================

/**
 * Thumbnail generation service.
 */
class ThumbnailGeneratorService {
  /**
   * Generate a thumbnail from an image file.
   */
  async generateFromImage(
    file: File | Blob,
    options: ThumbnailOptions = {}
  ): Promise<ThumbnailResult> {
    const startTime = performance.now();

    const {
      maxWidth = DEFAULT_MAX_WIDTH,
      maxHeight = DEFAULT_MAX_HEIGHT,
      quality = DEFAULT_QUALITY,
      format = DEFAULT_FORMAT,
    } = options;

    // Load image
    const img = await this.loadImage(file);

    // Calculate dimensions
    const { width, height } = this.calculateDimensions(
      img.width,
      img.height,
      maxWidth,
      maxHeight
    );

    // Create canvas and draw
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new ThumbnailError('Failed to get canvas context');
    }

    // Draw image with high-quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    // Convert to blob
    const blob = await this.canvasToBlob(canvas, format, quality);
    const dataUrl = await this.blobToDataUrl(blob);

    return {
      blob,
      dataUrl,
      width,
      height,
      size: blob.size,
      format,
      generationTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Generate a thumbnail from a PDF file (first page).
   */
  async generateFromPDF(
    file: File | ArrayBuffer,
    options: ThumbnailOptions = {}
  ): Promise<ThumbnailResult> {
    const startTime = performance.now();

    const {
      maxWidth = DEFAULT_MAX_WIDTH,
      maxHeight = DEFAULT_MAX_HEIGHT,
      quality = DEFAULT_QUALITY,
      format = DEFAULT_FORMAT,
      backgroundColor = DEFAULT_BACKGROUND_COLOR,
    } = options;

    // Import PDF.js
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

    // Load PDF
    const arrayBuffer =
      file instanceof ArrayBuffer ? file : await file.arrayBuffer();

    interface PDFLoadingTask {
      promise: Promise<{
        numPages: number;
        getPage(num: number): Promise<{
          getViewport(opts: { scale: number }): {
            width: number;
            height: number;
          };
          render(params: {
            canvasContext: CanvasRenderingContext2D;
            viewport: { width: number; height: number };
          }): { promise: Promise<void> };
        }>;
        destroy(): Promise<void>;
      }>;
    }

    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
    }) as unknown as PDFLoadingTask;

    const pdfDoc = await loadingTask.promise;

    try {
      // Get first page
      const page = await pdfDoc.getPage(1);

      // Calculate scale to fit within max dimensions
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        maxWidth / viewport.width,
        maxHeight / viewport.height
      );

      const scaledViewport = page.getViewport({ scale });

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(scaledViewport.width);
      canvas.height = Math.round(scaledViewport.height);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new ThumbnailError('Failed to get canvas context');
      }

      // Fill background
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render page
      await page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
      }).promise;

      // Convert to blob
      const blob = await this.canvasToBlob(canvas, format, quality);
      const dataUrl = await this.blobToDataUrl(blob);

      return {
        blob,
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        size: blob.size,
        format,
        generationTimeMs: performance.now() - startTime,
      };
    } finally {
      await pdfDoc.destroy();
    }
  }

  /**
   * Generate a thumbnail from ImageData.
   */
  async generateFromImageData(
    imageData: ImageData,
    options: ThumbnailOptions = {}
  ): Promise<ThumbnailResult> {
    const startTime = performance.now();

    const {
      maxWidth = DEFAULT_MAX_WIDTH,
      maxHeight = DEFAULT_MAX_HEIGHT,
      quality = DEFAULT_QUALITY,
      format = DEFAULT_FORMAT,
    } = options;

    // Calculate dimensions
    const { width, height } = this.calculateDimensions(
      imageData.width,
      imageData.height,
      maxWidth,
      maxHeight
    );

    // Create source canvas with original image
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = imageData.width;
    srcCanvas.height = imageData.height;

    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) {
      throw new ThumbnailError('Failed to get source canvas context');
    }

    srcCtx.putImageData(imageData, 0, 0);

    // Create destination canvas with scaled size
    const destCanvas = document.createElement('canvas');
    destCanvas.width = width;
    destCanvas.height = height;

    const destCtx = destCanvas.getContext('2d');
    if (!destCtx) {
      throw new ThumbnailError('Failed to get destination canvas context');
    }

    // Draw with high-quality scaling
    destCtx.imageSmoothingEnabled = true;
    destCtx.imageSmoothingQuality = 'high';
    destCtx.drawImage(srcCanvas, 0, 0, width, height);

    // Convert to blob
    const blob = await this.canvasToBlob(destCanvas, format, quality);
    const dataUrl = await this.blobToDataUrl(blob);

    return {
      blob,
      dataUrl,
      width,
      height,
      size: blob.size,
      format,
      generationTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Generate a thumbnail from any supported file type.
   */
  async generate(
    file: File,
    options: ThumbnailOptions = {}
  ): Promise<ThumbnailResult> {
    const mimeType = file.type.toLowerCase();

    if (mimeType === 'application/pdf') {
      return this.generateFromPDF(file, options);
    }

    if (mimeType.startsWith('image/')) {
      return this.generateFromImage(file, options);
    }

    throw new ThumbnailError(`Unsupported file type: ${mimeType}`);
  }

  /**
   * Load an image from a file or blob.
   */
  private loadImage(source: File | Blob | string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        resolve(img);
      };

      img.onerror = () => {
        reject(new ThumbnailError('Failed to load image'));
      };

      if (typeof source === 'string') {
        img.src = source;
      } else {
        img.src = URL.createObjectURL(source);
      }
    });
  }

  /**
   * Calculate scaled dimensions while maintaining aspect ratio.
   */
  private calculateDimensions(
    originalWidth: number,
    originalHeight: number,
    maxWidth: number,
    maxHeight: number
  ): { width: number; height: number } {
    const aspectRatio = originalWidth / originalHeight;

    let width = originalWidth;
    let height = originalHeight;

    // Scale down to fit within max dimensions
    if (width > maxWidth) {
      width = maxWidth;
      height = Math.round(width / aspectRatio);
    }

    if (height > maxHeight) {
      height = maxHeight;
      width = Math.round(height * aspectRatio);
    }

    return { width: Math.max(1, width), height: Math.max(1, height) };
  }

  /**
   * Convert canvas to blob.
   */
  private canvasToBlob(
    canvas: HTMLCanvasElement,
    format: 'webp' | 'jpeg' | 'png',
    quality: number
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const mimeType =
        format === 'webp'
          ? 'image/webp'
          : format === 'jpeg'
            ? 'image/jpeg'
            : 'image/png';

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            // Fallback to JPEG if WebP not supported
            if (format === 'webp') {
              canvas.toBlob(
                (jpegBlob) => {
                  if (jpegBlob) {
                    resolve(jpegBlob);
                  } else {
                    reject(
                      new ThumbnailError('Failed to create thumbnail blob')
                    );
                  }
                },
                'image/jpeg',
                quality
              );
            } else {
              reject(new ThumbnailError('Failed to create thumbnail blob'));
            }
          }
        },
        mimeType,
        format === 'png' ? undefined : quality
      );
    });
  }

  /**
   * Convert blob to data URL.
   */
  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        reject(new ThumbnailError('Failed to convert blob to data URL'));
      };
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Check if WebP is supported.
   */
  async isWebPSupported(): Promise<boolean> {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          resolve(blob !== null);
        },
        'image/webp',
        0.5
      );
    });
  }
}

// ============================================
// Error Class
// ============================================

/**
 * Custom error for thumbnail generation failures.
 */
export class ThumbnailError extends Error {
  constructor(
    message: string,
    public code: string = 'THUMBNAIL_ERROR',
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'ThumbnailError';
    Object.setPrototypeOf(this, ThumbnailError.prototype);
  }
}

// ============================================
// Singleton Export
// ============================================

/**
 * Singleton instance of the thumbnail generator.
 */
export const thumbnailGenerator = new ThumbnailGeneratorService();

/**
 * Convenience function to generate a thumbnail.
 */
export async function generateThumbnail(
  file: File,
  options?: ThumbnailOptions
): Promise<ThumbnailResult> {
  return thumbnailGenerator.generate(file, options);
}
