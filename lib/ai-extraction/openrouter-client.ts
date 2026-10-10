import "server-only";

import { OpenRouter } from "@openrouter/agent";

import { buildExtractionPrompt } from "./prompt";
import { extractionJsonSchema } from "./schema";
import type { ExtractionRetryReason } from "./types";

export const OPENROUTER_MODEL = "deepseek/deepseek-v4.1-flash";
const DEFAULT_TIMEOUT_MS = 30_000;

export class OpenRouterClientError extends Error {
  readonly reason: ExtractionRetryReason;

  constructor(reason: ExtractionRetryReason) {
    super(reason);
    this.name = "OpenRouterClientError";
    this.reason = reason;
  }
}

export const hasOpenRouterApiKey = () =>
  Boolean(process.env.OPENROUTER_API_KEY?.trim());

const getTimeoutMs = () => {
  const configuredTimeout = Number(process.env.AI_EXTRACTION_TIMEOUT_MS);
  return Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_TIMEOUT_MS;
};

const getSdkErrorReason = (error: unknown): ExtractionRetryReason => {
  const details = error as { name?: string; statusCode?: number } | null;
  const name = typeof details?.name === "string" ? details.name : "";
  const statusCode = details?.statusCode;

  if (name.includes("Timeout") || statusCode === 408 || statusCode === 524) {
    return "timeout";
  }

  if (name.includes("Connection") || name.includes("Network")) {
    return "network_error";
  }

  if (name.includes("Validation") || name.includes("Malformed")) {
    return "invalid_output";
  }

  return "provider_error";
};

export const runOpenRouterExtraction = async ({
  notes,
  onDelta,
}: {
  notes: string;
  onDelta: (text: string) => void;
}) => {
  if (!hasOpenRouterApiKey()) {
    throw new OpenRouterClientError("provider_error");
  }

  const client = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  let result: ReturnType<OpenRouter["callModel"]> | undefined;
  try {
    result = client.callModel(
      {
        model: OPENROUTER_MODEL,
        input: buildExtractionPrompt(notes),
        text: {
          format: {
            type: "json_schema",
            name: "call_notes_extraction",
            strict: true,
            schema: extractionJsonSchema,
          },
        },
      },
      { timeoutMs: getTimeoutMs(), retries: { strategy: "none" } },
    );

    let content = "";
    for await (const delta of result.getTextStream()) {
      if (delta) {
        content += delta;
        onDelta(delta);
      }
    }
    if (!content) throw new OpenRouterClientError("invalid_output");
    return content;
  } catch (error) {
    await result?.cancel().catch(() => undefined);
    throw error instanceof OpenRouterClientError
      ? error
      : new OpenRouterClientError(getSdkErrorReason(error));
  }
};
