import type { CatalogMatchInput } from '@media-listing/catalog-match-input';
import type { CatalogMatchOrchestratorResult } from '@media-listing/catalog-match-orchestrator';
import type { CatalogMatchOutputResult } from '@media-listing/catalog-match-output';
import type { CatalogMatchSelectionResult } from '@media-listing/catalog-match-selection';
import type { CatalogMatcherResult } from '@media-listing/catalog-matcher';
import type { CatalogQueryPlan } from '@media-listing/catalog-query-plan';
import type { CatalogTitleMatcherResult } from '@media-listing/catalog-title-matcher';
import type { CatalogPipelineInput, CatalogPipelineOutput } from '@media-listing/catalog-pipeline';
import type { NormalizedCatalogRecord, RawCatalogRecord } from '@media-listing/catalog-normalization';
import type { IdentityResolutionResult, ResolveIdentityInput } from '@media-listing/core-identity';
import type {
  IdentityResolutionApplicationResult,
  IdentityResolutionRequest,
} from '@media-listing/identity-application';
import type { PublishableListingPayload } from '@media-listing/listing-assembly';
import type { ListingPreparationInput } from '@media-listing/listing-input';
import type { ListingOutputResult } from '@media-listing/listing-output';
import type { PreparedListingDraft } from '@media-listing/listing-preparation';
import type { PublicationAdapterPayloadResult } from '@media-listing/publication-adapter';
import type { PublicationBatchResult } from '@media-listing/publication-batch';
import type { PublicationExecutionIntentResult } from '@media-listing/publication-execution-intent';
import type { PublicationExecutionOutputResult } from '@media-listing/publication-execution-output';
import type { PublicationExecutionRequestResult } from '@media-listing/publication-execution-request';
import type { PublicationRequestInput } from '@media-listing/publication-input';
import type { PublicationRequestResult } from '@media-listing/publication-request';
import type { PublicationRunEnvelopeResult } from '@media-listing/publication-run-envelope';
import type { CandidateGenerationResult, ScanRecord } from '@media-listing/scan-ingestion';

/**
 * Operator and request fields for identity resolution; `candidateSet` is supplied by scan ingestion.
 */
export type MediaListingPipelineIdentityResolutionFields = Omit<
  IdentityResolutionRequest,
  'candidateSet'
>;

/**
 * Earliest real inputs for the full seam: raw scan plus operator identity request fields (without
 * candidate set) plus catalog rows for matching.
 */
export type MediaListingPipelineInput = {
  readonly scanRecord: ScanRecord;
  readonly identityResolution: MediaListingPipelineIdentityResolutionFields;
  readonly catalogRecords: readonly RawCatalogRecord[];
};

/**
 * Full stage-by-stage contract tree for the media listing pipeline (read-only composition).
 */
export type MediaListingPipelineResult = {
  readonly scanIngestion: CandidateGenerationResult;
  /** Core `resolveIdentity` input seam (same struct passed into `resolveIdentity` by identity-application). */
  readonly coreIdentity: {
    readonly resolveInput: ResolveIdentityInput;
    readonly resolution: IdentityResolutionResult;
  };
  readonly identityApplication: IdentityResolutionApplicationResult;
  readonly catalogQueryPlan: CatalogQueryPlan;
  readonly catalogNormalization: readonly NormalizedCatalogRecord[];
  readonly catalogMatchInput: CatalogMatchInput;
  readonly catalogMatcher: CatalogMatcherResult;
  readonly catalogTitleMatcher: CatalogTitleMatcherResult;
  readonly catalogMatchOrchestrator: CatalogMatchOrchestratorResult;
  readonly catalogMatchSelection: CatalogMatchSelectionResult;
  readonly catalogMatchOutput: CatalogMatchOutputResult;
  /** Typed catalog pipeline boundary: same output as `runCatalogPipeline` for this input. */
  readonly catalogPipeline: {
    readonly input: CatalogPipelineInput;
    readonly output: CatalogPipelineOutput;
  };
  readonly listingInput: ListingPreparationInput;
  readonly listingPreparation: PreparedListingDraft;
  readonly listingAssembly: PublishableListingPayload;
  readonly listingOutput: ListingOutputResult;
  readonly publicationInput: PublicationRequestInput;
  readonly publicationRequest: PublicationRequestResult;
  readonly publicationAdapter: PublicationAdapterPayloadResult;
  readonly publicationBatch: PublicationBatchResult;
  /**
   * Manifest seam into `publication-run-envelope`: there is no separate `@media-listing/publication-run-manifest`
   * package; upstream types the manifest as `unknown`, and the batch result is the manifest payload here.
   */
  readonly publicationRunManifest: PublicationBatchResult;
  readonly publicationRunEnvelope: PublicationRunEnvelopeResult;
  readonly publicationExecutionIntent: PublicationExecutionIntentResult;
  readonly publicationExecutionRequest: PublicationExecutionRequestResult;
  readonly publicationExecutionOutput: PublicationExecutionOutputResult;
};
