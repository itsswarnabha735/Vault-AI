/**
 * Anomaly Detection Module for Vault-AI
 *
 * Provides detection for:
 * - Duplicate transactions
 * - Unusual amounts (price increases)
 * - New/unknown vendors
 *
 * PRIVACY: All detection runs locally on the device.
 */

// Re-export duplicate detector
export {
  duplicateDetector,
  checkForDuplicates,
  findDuplicates,
  resolveDuplicateAlert,
  deleteAndResolve,
  getUnresolvedDuplicateAlerts,
  getDuplicateAlertForTransaction,
  DEFAULT_DUPLICATE_CONFIG,
  type DuplicateDetector,
  type DuplicateResult,
  type DuplicateMatchDetails,
  type DuplicatePair,
  type DuplicateConfig,
} from './duplicate-detector';

// Re-export amount anomaly detector
export {
  amountAnomalyDetector,
  checkAmountAnomaly,
  getVendorStats,
  getUnresolvedAmountAlerts,
  resolveAmountAlert,
  checkMultipleAmounts,
  DEFAULT_AMOUNT_ANOMALY_CONFIG,
  type AmountAnomalyDetector,
  type AmountAnomalyResult,
  type AmountAnomalyType,
  type AmountComparison,
  type VendorStats,
  type AmountAnomalyConfig,
} from './amount-detector';

// Re-export utility functions
export {
  levenshteinDistance,
  stringSimilarity,
  parseDate,
  formatDate,
  addDays,
  subtractDays,
  daysDifference,
  isDateInRange,
  normalizeVendor,
  vendorSimilarity,
  amountsMatch,
  percentageDifference,
  calculateDuplicateConfidence,
  formatCurrency,
} from './utils';
