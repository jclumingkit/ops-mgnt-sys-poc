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

const getErrorName = (error: unknown) =>
  error &&
  typeof error === "object" &&
  "name" in error &&
  typeof error.name === "string"
    ? error.name
    : "";

const getStatusCode = (error: unknown) =>
  error &&
  typeof error === "object" &&
  "statusCode" in error &&
  typeof error.statusCode === "number"
    ? error.statusCode
    : undefined;

const getSdkErrorReason = (error: unknown): ExtractionRetryReason => {
  const name = getErrorName(error);
  const statusCode = getStatusCode(error);

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

const requestOptions = () => ({
  timeoutMs: getTimeoutMs(),
  retries: { strategy: "none" as const },
});

const throwProviderError = (error: unknown): never => {
  if (error instanceof OpenRouterClientError) {
    throw error;
  }

  throw new OpenRouterClientError(getSdkErrorReason(error));
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
  const extractionPrompt = buildExtractionPrompt(notes);

  let finalResult: ReturnType<OpenRouter["callModel"]> | undefined;
  try {
    finalResult = client.callModel(
      {
        model: OPENROUTER_MODEL,
        input: extractionPrompt,
        text: {
          format: {
            type: "json_schema",
            name: "call_notes_extraction",
            strict: true,
            schema: extractionJsonSchema as unknown as Record<string, unknown>,
          },
        },
      },
      requestOptions(),
    );
  } catch (error) {
    throwProviderError(error);
  }

  if (!finalResult) {
    throw new OpenRouterClientError("provider_error");
  }

  let content = "";
  try {
    for await (const delta of finalResult.getTextStream()) {
      if (delta) {
        content += delta;
        onDelta(delta);
      }
    }
  } catch (error) {
    await finalResult.cancel().catch(() => undefined);
    throwProviderError(error);
  }

  if (!content) {
    throw new OpenRouterClientError("invalid_output");
  }

  return content;
};
