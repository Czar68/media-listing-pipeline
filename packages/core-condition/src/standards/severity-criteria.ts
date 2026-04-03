/**
 * Severity criteria metadata versioned alongside grading (orthogonal axis for reporting).
 */

export const SEVERITY_CRITERIA_VERSION = '2026.1.0' as const;

export const SEVERITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];
