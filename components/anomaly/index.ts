/**
 * Anomaly Components for Vault-AI
 *
 * Components for displaying and handling anomaly alerts,
 * including duplicate transactions, unusual amounts, etc.
 */

// Duplicate Alert Component
export {
  DuplicateAlert,
  DuplicateAlertCompact,
  DuplicateAlertList,
  type DuplicateAlertProps,
  type DuplicateAlertCompactProps,
  type DuplicateAlertListProps,
  type DuplicateResolution,
} from './DuplicateAlert';

// Transaction Mini Component
export {
  TransactionMini,
  TransactionMiniSkeleton,
  type TransactionMiniProps,
} from './TransactionMini';

// Amount Anomaly Alert Component
export {
  AmountAnomalyAlert,
  AmountAnomalyBadge,
  AmountAnomalyAlertList,
  type AmountAnomalyAlertProps,
  type AmountAnomalyBadgeProps,
  type AmountAnomalyAlertListProps,
  type AmountAnomalyResolution,
} from './AmountAnomalyAlert';

// Anomaly Center Dashboard Component
export {
  AnomalyCenter,
  AnomalyWidget,
  type AnomalyCenterProps,
  type AnomalyWidgetProps,
  type AnomalyFilter,
  type AnomalyStats,
} from './AnomalyCenter';
