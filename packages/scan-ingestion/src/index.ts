export * from './model/candidate-generation-result';
export * from './model/normalized-scan';
export * from './model/scan-record';

export { normalizeScan } from './normalize/normalize-scan';
export type { NormalizeScanOutput } from './normalize/normalize-scan';

export { generateCandidatesFromScan } from './generate/generate-candidates';
export { matchUpcCandidates } from './generate/upc-matcher';
export { matchTitleCandidates, catalogTitleFromStructured } from './generate/title-matcher';
export { matchManualCandidates } from './generate/manual-candidate';

export { validateScanRecord } from './validators/validate-scan-record';
