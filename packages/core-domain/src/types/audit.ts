/**
 * Audit trail entries for pipeline actions (marketplace-agnostic).
 */

export const AUDIT_EVENT_KINDS = [
  'CONDITION_EVALUATION',
  'IDENTITY_ALIGNMENT',
  'SIGNATURE_CREATED',
  'SIGNATURE_REJECTED',
] as const;

export type AuditEventKind = (typeof AUDIT_EVENT_KINDS)[number];

export interface AuditEvent {
  readonly eventId: string;
  readonly occurredAtIso: string;
  readonly kind: AuditEventKind;
  readonly subjectId: string;
  readonly detail: string;
}
