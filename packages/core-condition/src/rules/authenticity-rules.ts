import type { DiscConditionComponent } from '@media-listing/core-domain';

export type AuthenticityBlockReason = 'BURNED_DISC';

export function evaluateDiscAuthenticity(
  disc: DiscConditionComponent,
): AuthenticityBlockReason | undefined {
  if (disc.burned) {
    return 'BURNED_DISC';
  }
  return undefined;
}
