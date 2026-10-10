import {
  runOpenRouterExtraction,
  OpenRouterClientError,
} from "./openrouter-client"
import { validateExtractionResult } from "./schema"
import {
  EXTRACTION_FAILED_ERROR,
  MAX_EXTRACTION_ATTEMPTS,
  type ExtractionRetryReason,
  type ExtractionResult,
  type ExtractionStreamEvent,
} from "./types"

type ExtractionServiceOptions = {
  onEvent: (event: ExtractionStreamEvent) => void
}

const getRetryReason = (error: unknown): ExtractionRetryReason => {
  if (error instanceof OpenRouterClientError) {
    return error.reason
  }

  return "invalid_output"
}

const parseFinalContent = (content: string): ExtractionResult => {
  try {
    return validateExtractionResult(JSON.parse(content))
  } catch {
    throw new OpenRouterClientError("invalid_output")
  }
}

export const runExtraction = async (
  notes: string,
  { onEvent }: ExtractionServiceOptions,
): Promise<ExtractionResult | null> => {
  onEvent({
    type: "extraction_started",
    attempt: 1,
    max_attempts: MAX_EXTRACTION_ATTEMPTS,
  })

  for (let attempt = 1; attempt <= MAX_EXTRACTION_ATTEMPTS; attempt += 1) {
    try {
      const content = await runOpenRouterExtraction({
        notes,
        onDelta: (text) => {
          onEvent({ type: "output_delta", text, attempt })
        },
      })
      const result = parseFinalContent(content)
      onEvent({ type: "extraction_complete", result })
      onEvent({ type: "done", success: true })
      return result
    } catch (error) {
      if (attempt === MAX_EXTRACTION_ATTEMPTS) {
        onEvent({ type: "extraction_error", error: EXTRACTION_FAILED_ERROR })
        onEvent({ type: "done", success: false })
        return null
      }

      const reason = getRetryReason(error)
      onEvent({ type: "attempt_reset", attempt: attempt + 1 })
      onEvent({
        type: "extraction_retrying",
        reason,
        next_attempt: attempt + 1,
      })
    }
  }

  return null
}
