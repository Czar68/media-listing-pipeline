import type { EbayInventoryItem, EbayListingCondition } from "../ebayMapper";
import type { ExecutionFailed, ExecutionResult, ExecutionSuccess } from "../execution/types";
import {
  PipelineStageValidationError,
  type EnrichedInventoryItem,
  type ExecutionInput,
  type ExecutionListingItem,
  type IngestItem,
  type NormalizedInventoryItem,
} from "../contracts/pipelineStageContracts";

const MEDIA_TYPES = new Set<IngestItem["mediaType"]>(["image", "video", "audio", "unknown"]);
const NORMALIZED_CONDITIONS = new Set<NormalizedInventoryItem["condition"]>(["NEW", "USED", "UNSPECIFIED"]);
const EBAY_CONDITIONS = new Set<EbayListingCondition>(["NEW", "USED"]);

function throwStage(stage: string, error: string, payload: unknown): never {
  throw new PipelineStageValidationError({ stage, error, payload });
}

export function validateIngestItem(payload: unknown): asserts payload is IngestItem {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throwStage("ingest", "Ingest item must be a non-null object", payload);
  }
  const o = payload as Record<string, unknown>;
  if (typeof o.source !== "string" || o.source.trim().length === 0) {
    throwStage("ingest", "source must be a non-empty string", payload);
  }
  if (typeof o.title !== "string" || o.title.trim().length === 0) {
    throwStage("ingest", "title must be a non-empty string", payload);
  }
  if (o.description !== undefined && typeof o.description !== "string") {
    throwStage("ingest", "description must be a string when present", payload);
  }
  if (o.externalId !== undefined && typeof o.externalId !== "string") {
    throwStage("ingest", "externalId must be a string when present", payload);
  }
  if (typeof o.mediaType !== "string" || !MEDIA_TYPES.has(o.mediaType as IngestItem["mediaType"])) {
    throwStage("ingest", "mediaType must be one of: image | video | audio | unknown", payload);
  }
  if (!Array.isArray(o.files)) {
    throwStage("ingest", "files must be an array", payload);
  }
  for (const f of o.files) {
    if (typeof f !== "string") {
      throwStage("ingest", "each files entry must be a string", payload);
    }
  }
  if (o.metadata !== undefined && (o.metadata === null || typeof o.metadata !== "object" || Array.isArray(o.metadata))) {
    throwStage("ingest", "metadata must be a plain object when present", payload);
  }
  if (typeof o.capturedAt !== "string" || o.capturedAt.length === 0) {
    throwStage("ingest", "capturedAt must be a non-empty string", payload);
  }
}

export function validateNormalizedInventoryItem(payload: unknown): asserts payload is NormalizedInventoryItem {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throwStage("normalize", "Normalized item must be a non-null object", payload);
  }
  const o = payload as Record<string, unknown>;
  if (typeof o.sku !== "string" || o.sku.length === 0) {
    throwStage("normalize", "sku must be a non-empty string", payload);
  }
  if (typeof o.title !== "string" || o.title.trim().length === 0) {
    throwStage("normalize", "title must be a non-empty string", payload);
  }
  if (typeof o.description !== "string") {
    throwStage("normalize", "description must be a string", payload);
  }
  if (o.media === null || typeof o.media !== "object" || Array.isArray(o.media)) {
    throwStage("normalize", "media must be an object", payload);
  }
  const m = o.media as Record<string, unknown>;
  if (!Array.isArray(m.images)) {
    throwStage("normalize", "media.images must be an array", payload);
  }
  for (const u of m.images) {
    if (typeof u !== "string") {
      throwStage("normalize", "each media.images entry must be a string", payload);
    }
  }
  if (!Array.isArray(m.videos)) {
    throwStage("normalize", "media.videos must be an array", payload);
  }
  for (const u of m.videos) {
    if (typeof u !== "string") {
      throwStage("normalize", "each media.videos entry must be a string", payload);
    }
  }
  if (o.category !== undefined && typeof o.category !== "string") {
    throwStage("normalize", "category must be a string when present", payload);
  }
  if (typeof o.condition !== "string" || !NORMALIZED_CONDITIONS.has(o.condition as NormalizedInventoryItem["condition"])) {
    throwStage("normalize", "condition must be NEW | USED | UNSPECIFIED", payload);
  }
  if (o.source === null || typeof o.source !== "object" || Array.isArray(o.source)) {
    throwStage("normalize", "source must be an object", payload);
  }
  const s = o.source as Record<string, unknown>;
  if (s.system !== "media-listing-pipeline") {
    throwStage("normalize", 'source.system must be literal "media-listing-pipeline"', payload);
  }
  if (typeof s.origin !== "string") {
    throwStage("normalize", "source.origin must be a string", payload);
  }
  if (s.externalId !== undefined && typeof s.externalId !== "string") {
    throwStage("normalize", "source.externalId must be a string when present", payload);
  }
  if (o.timestamps === null || typeof o.timestamps !== "object" || Array.isArray(o.timestamps)) {
    throwStage("normalize", "timestamps must be an object", payload);
  }
  const t = o.timestamps as Record<string, unknown>;
  if (typeof t.capturedAt !== "string" || t.capturedAt.length === 0) {
    throwStage("normalize", "timestamps.capturedAt must be a non-empty string", payload);
  }
  if (typeof t.normalizedAt !== "string" || t.normalizedAt.length === 0) {
    throwStage("normalize", "timestamps.normalizedAt must be a non-empty string", payload);
  }
  if (o.metadata !== undefined && (o.metadata === null || typeof o.metadata !== "object" || Array.isArray(o.metadata))) {
    throwStage("normalize", "metadata must be a plain object when present", payload);
  }
}

export function validateEnrichedInventoryItem(payload: unknown): asserts payload is EnrichedInventoryItem {
  validateNormalizedInventoryItem(payload);
  const o = payload as unknown as Record<string, unknown>;
  if (typeof o.epid !== "string" || o.epid.trim().length === 0) {
    throwStage("enrich", "epid must be a non-empty string after enrich", payload);
  }
  if (o.epidSource !== undefined && o.epidSource !== "observability_only") {
    throwStage("enrich", "epidSource must be observability_only when present", payload);
  }
  if (o.categoryId !== undefined && typeof o.categoryId !== "string") {
    throwStage("enrich", "categoryId must be a string when present", payload);
  }
  if (o.itemAspects !== undefined) {
    if (o.itemAspects === null || typeof o.itemAspects !== "object" || Array.isArray(o.itemAspects)) {
      throwStage("enrich", "itemAspects must be a plain object when present", payload);
    }
  }
  if (o.matchConfidence !== undefined && (typeof o.matchConfidence !== "number" || !Number.isFinite(o.matchConfidence))) {
    throwStage("enrich", "matchConfidence must be a finite number when present", payload);
  }
}

export function validateListingItem(payload: unknown): asserts payload is ExecutionListingItem {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throwStage("listing", "Listing payload must be a non-null object", payload);
  }
  const o = payload as Record<string, unknown>;
  if (typeof o.sku !== "string" || o.sku.length === 0) {
    throwStage("listing", "sku must be a non-empty string", payload);
  }
  if (typeof o.condition !== "string" || !EBAY_CONDITIONS.has(o.condition as EbayListingCondition)) {
    throwStage("listing", "condition must be NEW | USED", payload);
  }
  if (o.product === null || typeof o.product !== "object" || Array.isArray(o.product)) {
    throwStage("listing", "product must be an object", payload);
  }
  const p = o.product as Record<string, unknown>;
  if (typeof p.title !== "string") {
    throwStage("listing", "product.title must be a string", payload);
  }
  if (typeof p.description !== "string") {
    throwStage("listing", "product.description must be a string", payload);
  }
  if (!Array.isArray(p.imageUrls)) {
    throwStage("listing", "product.imageUrls must be an array", payload);
  }
  for (const u of p.imageUrls) {
    if (typeof u !== "string") {
      throwStage("listing", "each product.imageUrls entry must be a string", payload);
    }
  }
  if (o.sourceMetadata === null || typeof o.sourceMetadata !== "object" || Array.isArray(o.sourceMetadata)) {
    throwStage("listing", "sourceMetadata must be an object", payload);
  }
  const sm = o.sourceMetadata as Record<string, unknown>;
  if (typeof sm.system !== "string" || sm.system.length === 0) {
    throwStage("listing", "sourceMetadata.system must be a non-empty string", payload);
  }
  if (typeof sm.origin !== "string") {
    throwStage("listing", "sourceMetadata.origin must be a string", payload);
  }
  if (sm.externalId !== undefined && typeof sm.externalId !== "string") {
    throwStage("listing", "sourceMetadata.externalId must be a string when present", payload);
  }
  if (typeof sm.capturedAt !== "string" || sm.capturedAt.length === 0) {
    throwStage("listing", "sourceMetadata.capturedAt must be a non-empty string", payload);
  }
  if (typeof sm.normalizedAt !== "string" || sm.normalizedAt.length === 0) {
    throwStage("listing", "sourceMetadata.normalizedAt must be a non-empty string", payload);
  }
  if (sm.category !== undefined && typeof sm.category !== "string") {
    throwStage("listing", "sourceMetadata.category must be a string when present", payload);
  }
  if (sm.epid !== undefined && typeof sm.epid !== "string") {
    throwStage("listing", "sourceMetadata.epid must be a string when present", payload);
  }
  if (
    sm.matchConfidence !== undefined &&
    (typeof sm.matchConfidence !== "number" || !Number.isFinite(sm.matchConfidence))
  ) {
    throwStage("listing", "sourceMetadata.matchConfidence must be a finite number when present", payload);
  }
}

export function validateExecutionInput(payload: unknown): asserts payload is ExecutionInput {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throwStage("execution_input", "Execution input must be a non-null object", payload);
  }
  const o = payload as Record<string, unknown>;
  if (!("item" in o) || !("listing" in o)) {
    throwStage("execution_input", "Execution input must include item and listing", payload);
  }
  validateEnrichedInventoryItem(o.item);
  validateListingItem(o.listing);
  const item = o.item as EnrichedInventoryItem;
  const listing = o.listing as EbayInventoryItem;
  if (item.sku !== listing.sku) {
    throwStage("execution_input", "item.sku must equal listing.sku", payload);
  }
}

function isPublishResult(v: unknown): v is ExecutionSuccess["publishResult"] {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  if (typeof p.offerId !== "string" || p.offerId.length === 0) return false;
  if (p.status !== "PUBLISHED" && p.status !== "FAILED") return false;
  if (typeof p.httpStatus !== "number" || !Number.isFinite(p.httpStatus)) return false;
  if (p.listingId !== undefined && typeof p.listingId !== "string") return false;
  if (p.errorCode !== undefined && typeof p.errorCode !== "string") return false;
  if (p.errorMessage !== undefined && typeof p.errorMessage !== "string") return false;
  return true;
}

function validateExecutionSuccessRow(row: unknown): asserts row is ExecutionSuccess {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throwStage("execution", "success row must be an object", row);
  }
  const o = row as Record<string, unknown>;
  validateNormalizedInventoryItem(o.item);
  validateListingItem(o.ebayPayload);
  if (o.response === null || typeof o.response !== "object" || Array.isArray(o.response)) {
    throwStage("execution", "success.response must be an object", row);
  }
  if (!isPublishResult(o.publishResult)) {
    throwStage("execution", "success.publishResult has invalid shape", row);
  }
}

function validateExecutionFailedRow(row: unknown): asserts row is ExecutionFailed {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throwStage("execution", "failed row must be an object", row);
  }
  const o = row as Record<string, unknown>;
  validateNormalizedInventoryItem(o.item);
  validateListingItem(o.ebayPayload);
  const err = o.error;
  if (err === null || typeof err !== "object" || Array.isArray(err)) {
    throwStage("execution", "failed.error must be an object", row);
  }
  const e = err as Record<string, unknown>;
  if (typeof e.type !== "string" || e.type.length === 0) {
    throwStage("execution", "failed.error.type must be a non-empty string", row);
  }
  if (typeof e.message !== "string") {
    throwStage("execution", "failed.error.message must be a string", row);
  }
  if (o.publishResult !== undefined && !isPublishResult(o.publishResult)) {
    throwStage("execution", "failed.publishResult has invalid shape when present", row);
  }
}

export function validateExecutionResult(payload: unknown): asserts payload is ExecutionResult {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throwStage("execution", "Execution result must be a non-null object", payload);
  }
  const o = payload as Record<string, unknown>;
  if (!Array.isArray(o.success)) {
    throwStage("execution", "success must be an array", payload);
  }
  if (!Array.isArray(o.failed)) {
    throwStage("execution", "failed must be an array", payload);
  }
  for (const row of o.success) {
    validateExecutionSuccessRow(row);
  }
  for (const row of o.failed) {
    validateExecutionFailedRow(row);
  }
}
