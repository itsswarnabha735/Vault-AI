/**
 * Ingest Components
 *
 * Components for document import and ingestion flow.
 */

// Main modal
export { ImportModal, ImportTrigger } from './ImportModal';
export type {
  ImportModalProps,
  ImportTriggerProps,
  ImportStage,
} from './ImportModal';

// Drop zone
export { DropZone, CompactDropZone } from './DropZone';
export type { DropZoneProps, CompactDropZoneProps } from './DropZone';

// Progress components
export { ProcessingProgress, ProcessingSummary } from './ProcessingProgress';
export type {
  ProcessingProgressProps,
  ProcessingSummaryProps,
} from './ProcessingProgress';

export { FileProgress, FileListProgress } from './FileProgress';
export type { FileProgressProps, FileListProgressProps } from './FileProgress';

// Review components
export { ExtractionReview, QuickActionsBar } from './ExtractionReview';
export type {
  ExtractionReviewProps,
  QuickActionsBarProps,
} from './ExtractionReview';

export { ExtractionCard } from './ExtractionCard';
export type { ExtractionCardProps, EditableDocument } from './ExtractionCard';

// Statement review
export { StatementReview } from './StatementReview';
export type { StatementReviewProps } from './StatementReview';

// Complete state
export { ImportComplete } from './ImportComplete';
export type { ImportCompleteProps } from './ImportComplete';
