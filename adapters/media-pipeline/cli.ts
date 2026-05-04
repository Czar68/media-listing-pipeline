import path from "path";
import { runPipelineForCliConfig } from "./run_pipeline";

export type PipelineRunCliConfig = {
  readonly command: "pipeline";
  readonly subcommand: "run";
  readonly mode: string;
  readonly input: string;
};

export type CliParseSuccess = {
  readonly ok: true;
  readonly config: PipelineRunCliConfig;
};

export type CliParseFailure = {
  readonly ok: false;
  readonly error: string;
};

export type CliParseResult = CliParseSuccess | CliParseFailure;

/**
 * Parses argv for: pipeline run --mode <mode> --input <file>
 * Does not execute the pipeline.
 */
export function parsePipelineCliArgs(argv: readonly string[]): CliParseResult {
  if (argv.length < 2 || argv[0] !== "pipeline" || argv[1] !== "run") {
    return {
      ok: false,
      error: 'Expected command "pipeline run" followed by --mode and --input',
    };
  }

  let mode: string | undefined;
  let input: string | undefined;
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--mode") {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        return { ok: false, error: "--mode requires a value" };
      }
      mode = next;
      i++;
      continue;
    }
    if (token === "--input") {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        return { ok: false, error: "--input requires a file path" };
      }
      input = next;
      i++;
      continue;
    }
    return { ok: false, error: `Unexpected argument: ${token}` };
  }

  if (mode === undefined) {
    return { ok: false, error: "Missing required flag: --mode" };
  }
  if (input === undefined) {
    return { ok: false, error: "Missing required flag: --input" };
  }

  const resolvedInput = path.resolve(process.cwd(), input);

  return {
    ok: true,
    config: {
      command: "pipeline",
      subcommand: "run",
      mode,
      input: resolvedInput,
    },
  };
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const result = parsePipelineCliArgs(argv);
  if (!result.ok) {
    printJson({ ok: false, error: result.error });
    process.exitCode = 1;
    return;
  }
  try {
    const pipelineResult = await runPipelineForCliConfig(result.config);
    printJson(pipelineResult);
  } catch (err) {
    printJson({ ok: false, error: err instanceof Error ? err.message : String(err) });
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
