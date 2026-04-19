import type { ImageFolder } from "./imageIngest";
import type { CanonicalMarket } from "./types";

export type MediaPipelineInput = {
  readonly markets: readonly CanonicalMarket[];
  readonly imageFolders?: readonly ImageFolder[];
};

export function validateMediaPipelineInput(input: unknown): asserts input is MediaPipelineInput {
  if (input === null || typeof input !== "object") {
    throw new Error("Media pipeline input must be an object");
  }
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.markets)) {
    throw new Error("Media pipeline input must include a markets array");
  }
  if (o.imageFolders !== undefined && !Array.isArray(o.imageFolders)) {
    throw new Error("Media pipeline input imageFolders must be an array when provided");
  }
}

export function runPipeline(input: MediaPipelineInput): {
  pipeline: { markets: CanonicalMarket[] };
} {
  return {
    pipeline: {
      markets: [...input.markets],
    },
  };
}

