/**
 * Legacy vs canonical pipeline isolation.
 *
 * Canonical execution path: `runBatch` → `enrichWithEpid` → `ebayMapper` → `executeBatchListings`.
 * Legacy: `runMediaPipeline`, `runPipeline`, and listing-builder modules — not wired from repo scripts.
 */

let legacyInvocationCount = 0;

/**
 * Non-blocking: logs when legacy entrypoints run (`runMediaPipeline`), only if
 * `NODE_ENV=development` or `MEDIA_LISTING_LEGACY_GUARD=1`.
 */
export function notifyLegacyPipelineInvocation(entryPoint: string): void {
  const warn =
    process.env.MEDIA_LISTING_LEGACY_GUARD === "1" ||
    process.env.NODE_ENV === "development";
  if (!warn) return;
  legacyInvocationCount += 1;
  console.warn(
    `[legacy-guard] Legacy pipeline invoked: "${entryPoint}" (#${legacyInvocationCount}). ` +
      "Use runBatch for canonical execution."
  );
}

/**
 * Marker for documentation / future static checks. Does not throw and does not log by default.
 * Call from canonical `runBatch` to document intent (no-op).
 */
export function assertNoLegacyPipelineUsage(): void {
  // Canonical path is runBatch-only; legacy modules remain exported but are not used by scripts.
}
