import type { IdentityCandidate } from '../model/identity-candidate';

export function isDiscCountValid(discCount: number): boolean {
  return Number.isInteger(discCount) && discCount >= 1;
}

export function isNonBlankString(value: string): boolean {
  return value.trim().length > 0;
}

export function candidateStructurallyPlausible(candidate: IdentityCandidate): boolean {
  return (
    isNonBlankString(candidate.candidateId) &&
    isNonBlankString(candidate.productId) &&
    isNonBlankString(candidate.title) &&
    isDiscCountValid(candidate.discCount)
  );
}
