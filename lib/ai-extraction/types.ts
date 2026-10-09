export const EXTRACTION_SENTINELS = {
  NOT_DEFINED: "Not defined in call notes",
  INSUFFICIENT: "Insufficient data",
} as const

export type ExtractionSentinel =
  (typeof EXTRACTION_SENTINELS)[keyof typeof EXTRACTION_SENTINELS]

export type ExtractionResult = {
  parent_name: string
  child_name: string
  payer: string
  follow_up_date: string
}

export type ExtractionRequest = {
  notes: string
}

export type ExtractionStreamEvent =
  | { type: "extraction_started"; attempt: number; max_attempts: number }
  | { type: "output_delta"; text: string; attempt: number }
  | { type: "attempt_reset"; attempt: number }
  | {
      type: "extraction_retrying"
      reason: ExtractionRetryReason
      next_attempt: number
    }
  | { type: "extraction_complete"; result: ExtractionResult }
  | { type: "extraction_error"; error: SafeExtractionError }
  | { type: "done"; success: boolean }

export type ExtractionRetryReason =
  | "timeout"
  | "provider_error"
  | "network_error"
  | "invalid_output"

export type SafeExtractionError = {
  code: "EXTRACTION_FAILED"
  message: "The details could not be extracted right now. Please try again."
}

export type ExtractionAttemptState =
  | "idle"
  | "running"
  | "retrying"
  | "complete"
  | "failed"

export type ExtractionStatus = {
  state: ExtractionAttemptState
  attempt: number
  max_attempts: number
}

export type ExtractionClientError = {
  error: "EXTRACTION_INPUT_INVALID" | "EXTRACTION_PROVIDER_UNAVAILABLE"
  message: string
}

export const EXTRACTION_FAILED_ERROR: SafeExtractionError = {
  code: "EXTRACTION_FAILED",
  message: "The details could not be extracted right now. Please try again.",
}

export const MAX_EXTRACTION_ATTEMPTS = 3
export const MAX_NOTES_LENGTH = 20_000
