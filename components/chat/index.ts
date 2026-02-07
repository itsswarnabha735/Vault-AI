/**
 * Chat Components Index
 *
 * Exports all chat-related components for Vault-AI.
 */

// Main container
export { ChatContainer, CompactChatContainer } from './ChatContainer';
export type {
  ChatContainerProps,
  CompactChatContainerProps,
} from './ChatContainer';

// Message components
export { ChatMessage, CompactMessage, SystemMessage } from './ChatMessage';
export type { ChatMessageProps } from './ChatMessage';

export { MessageThread } from './MessageThread';
export type { MessageThreadProps } from './MessageThread';

// Input components
export { ChatInput, CompactChatInput } from './ChatInput';
export type { ChatInputProps } from './ChatInput';

// Citation components
export { CitationChip, CitationNumber, CitationList } from './CitationChip';
export type { CitationChipProps, CitationListProps } from './CitationChip';

export { CitationPanel, InlineCitationPreview } from './CitationPanel';
export type {
  CitationPanelProps,
  InlineCitationPreviewProps,
} from './CitationPanel';

export { CitationPreview, CitationPreviewList } from './CitationPreview';
export type {
  CitationPreviewProps,
  CitationPreviewListProps,
} from './CitationPreview';

// Document components
export { DocumentThumbnail, ThumbnailPlaceholder } from './DocumentThumbnail';
export type {
  DocumentThumbnailProps,
  ThumbnailPlaceholderProps,
} from './DocumentThumbnail';

export { DocumentViewer } from './DocumentViewer';
export type { DocumentViewerProps } from './DocumentViewer';

// Loading indicators
export {
  TypingIndicator,
  InlineTypingIndicator,
  MessageTypingIndicator,
} from './TypingIndicator';
export type { TypingIndicatorProps } from './TypingIndicator';

// Sidebar components
export { QuickQueriesSidebar, InlineQuickQueries } from './QuickQueriesSidebar';
export type {
  QuickQueriesSidebarProps,
  InlineQuickQueriesProps,
} from './QuickQueriesSidebar';
