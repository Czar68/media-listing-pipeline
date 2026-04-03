/**
 * Pipeline item lifecycle — identity conflicts and authenticity blocks are explicit terminal states.
 */

export const ITEM_STATES = [
  'INTAKE',
  'IDENTITY_PENDING',
  'IDENTITY_CONFLICT',
  'CONDITION_IN_PROGRESS',
  'BLOCKED_AUTHENTICITY',
  'CONDITION_READY_FOR_SIGNATURE',
  'READY',
] as const;

export type ItemState = (typeof ITEM_STATES)[number];
