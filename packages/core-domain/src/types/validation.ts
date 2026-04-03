/**
 * Structured validation outcomes — no vague booleans.
 */

export interface ValidationFailure {
  readonly code: string;
  readonly message: string;
  readonly path?: readonly string[];
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failures: readonly ValidationFailure[] };

export function validationOk<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

export function validationFail(
  failures: readonly ValidationFailure[],
): ValidationResult<never> {
  return { ok: false, failures };
}
