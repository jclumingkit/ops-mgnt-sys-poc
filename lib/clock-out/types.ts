export const PROMPT_KEYS = [
  "outstanding_items",
  "waiting_on",
  "completed_summary",
] as const

export type PromptKey = (typeof PROMPT_KEYS)[number]
export type ShiftStatus = "active" | "clocked_out"

export const isPromptKey = (value: unknown): value is PromptKey =>
  typeof value === "string" && PROMPT_KEYS.includes(value as PromptKey)

export type PromptResponses = Record<PromptKey, string | null>

export type ShiftSession = {
  shift_id: string
  status: ShiftStatus
  responses: PromptResponses
  completed_prompts: PromptKey[]
  created_at: string
  clocked_out_at: string | null
}

export type SaveResponseRequest = {
  prompt: PromptKey
  response: string
}

export type ClockOutErrorCode =
  | "PROMPT_RESPONSE_INVALID"
  | "PROMPT_SEQUENCE_BLOCKED"
  | "SHIFT_NOT_FOUND"
  | "SHIFT_ALREADY_CLOCKED_OUT"
  | "CLOCK_OUT_BLOCKED"
  | "INVALID_REQUEST"

export type ClockOutApiError = {
  error: ClockOutErrorCode
  message: string
  prompt?: PromptKey
  required_previous_prompt?: PromptKey
  missing_prompts?: PromptKey[]
}
