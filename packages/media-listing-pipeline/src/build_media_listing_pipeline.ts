import { buildCatalogMatchInput } from '@media-listing/catalog-match-input';
import { matchCatalog } from '@media-listing/catalog-match-orchestrator';
import { buildCatalogMatchOutput } from '@media-listing/catalog-match-output';
import { selectMatch } from '@media-listing/catalog-match-selection';
import { matchCatalogByUpc } from '@media-listing/catalog-matcher';
import { buildCatalogQueryPlan } from '@media-listing/catalog-query-plan';
import { matchCatalogByTitle } from '@media-listing/catalog-title-matcher';
import { runCatalogPipeline } from '@media-listing/catalog-pipeline';
import { normalizeCatalogRecord } from '@media-listing/catalog-normalization';
import { resolveIdentity } from '@media-listing/core-identity';
import type { ResolveIdentityInput } from '@media-listing/core-identity';
import { applyIdentityResolution } from '@media-listing/identity-application';
import type { IdentityResolutionRequest } from '@media-listing/identity-application';
import { buildListingPayload } from '@media-listing/listing-assembly';
import { buildListingInput } from '@media-listing/listing-input';
import { buildListingOutput } from '@media-listing/listing-output';
import { buildPreparedListing } from '@media-listing/listing-preparation';
import { buildPublicationAdapterPayload } from '@media-listing/publication-adapter';
import { buildPublicationBatch } from '@media-listing/publication-batch';
import { buildPublicationExecutionIntent } from '@media-listing/publication-execution-intent';
import { buildPublicationExecutionOutput } from '@media-listing/publication-execution-output';
import { buildPublicationExecutionRequest } from '@media-listing/publication-execution-request';
import { buildPublicationInput } from '@media-listing/publication-input';
import { buildPublicationRequest } from '@media-listing/publication-request';
import { buildPublicationRunEnvelope } from '@media-listing/publication-run-envelope';
import { generateCandidatesFromScan } from '@media-listing/scan-ingestion';

import type { MediaListingPipelineInput, MediaListingPipelineResult } from './types';

function mergeIdentityRequest(
  input: MediaListingPipelineInput,
  candidateSet: IdentityResolutionRequest['candidateSet'],
): IdentityResolutionRequest {
  return {
    ...input.identityResolution,
    candidateSet,
  };
}

/**
 * Deterministic read-only composition of the full media listing declaration chain.
 */
export function buildMediaListingPipeline(
  input: MediaListingPipelineInput,
): MediaListingPipelineResult {
  const scanIngestion = generateCandidatesFromScan(input.scanRecord);
  if (scanIngestion.kind === 'FAILURE') {
    throw new Error(
      `SCAN_INGESTION_FAILURE:${scanIngestion.reasons.join(',')}`,
    );
  }

  const identityRequest = mergeIdentityRequest(input, scanIngestion.candidateSet);

  const resolveInput: ResolveIdentityInput = {
    candidateSet: identityRequest.candidateSet,
    selectedCandidateId: identityRequest.selectedCandidateId ?? undefined,
    operatorId: identityRequest.operatorId,
    rationale: identityRequest.rationale ?? undefined,
    resolvedAt: identityRequest.requestedAt,
    alignment: identityRequest.alignmentProbe ?? undefined,
  };

  const coreIdentity = {
    resolveInput,
    resolution: resolveIdentity(resolveInput),
  };

  const identityApplication = applyIdentityResolution(identityRequest);

  const catalogPipelineInput = {
    identity: identityApplication,
    catalogRecords: input.catalogRecords,
  };

  const catalogQueryPlan = buildCatalogQueryPlan(identityApplication);
  const catalogNormalization = input.catalogRecords.map((record) =>
    normalizeCatalogRecord(record),
  );
  const catalogMatchInput = buildCatalogMatchInput(
    identityApplication,
    catalogQueryPlan,
    catalogNormalization,
  );

  const catalogMatcher = matchCatalogByUpc(catalogMatchInput);
  const catalogTitleMatcher = matchCatalogByTitle(catalogMatchInput);
  const catalogMatchOrchestrator = matchCatalog(catalogMatchInput);
  const catalogMatchSelection = selectMatch(catalogMatchOrchestrator);
  const catalogMatchOutput = buildCatalogMatchOutput(catalogMatchSelection);

  const catalogPipelineOutput = runCatalogPipeline(catalogPipelineInput);

  const listingInput = buildListingInput(catalogPipelineOutput);
  const listingPreparation = buildPreparedListing(listingInput);
  const listingAssembly = buildListingPayload(listingPreparation);
  const listingOutput = buildListingOutput(listingAssembly);

  const publicationInput = buildPublicationInput(listingOutput);
  const publicationRequest = buildPublicationRequest(publicationInput);
  const publicationAdapter = buildPublicationAdapterPayload(publicationRequest);
  const publicationBatch = buildPublicationBatch([publicationAdapter]);
  const publicationRunManifest = publicationBatch;
  const publicationRunEnvelope = buildPublicationRunEnvelope(publicationRunManifest);
  const publicationExecutionIntent = buildPublicationExecutionIntent(publicationRunEnvelope);
  const publicationExecutionRequest = buildPublicationExecutionRequest(
    publicationExecutionIntent,
  );
  const publicationExecutionOutput = buildPublicationExecutionOutput(
    publicationExecutionRequest,
  );

  return {
    scanIngestion,
    coreIdentity,
    identityApplication,
    catalogQueryPlan,
    catalogNormalization,
    catalogMatchInput,
    catalogMatcher,
    catalogTitleMatcher,
    catalogMatchOrchestrator,
    catalogMatchSelection,
    catalogMatchOutput,
    catalogPipeline: {
      input: catalogPipelineInput,
      output: catalogPipelineOutput,
    },
    listingInput,
    listingPreparation,
    listingAssembly,
    listingOutput,
    publicationInput,
    publicationRequest,
    publicationAdapter,
    publicationBatch,
    publicationRunManifest,
    publicationRunEnvelope,
    publicationExecutionIntent,
    publicationExecutionRequest,
    publicationExecutionOutput,
  };
}
