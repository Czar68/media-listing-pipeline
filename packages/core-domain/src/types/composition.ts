/**
 * Completeness templates describe required evidence and inspection gates (identifiers only in domain).
 */

export interface CompletenessTemplate {
  readonly templateId: string;
  readonly templateVersion: string;
  readonly label: string;
  /** Keys that must have at least one evidence ref when conditions require evidence. */
  readonly requiredEvidenceKeys: readonly string[];
  /** Declarative keys that must be present on the condition record for this template. */
  readonly requiredRecordKeys: readonly string[];
}
