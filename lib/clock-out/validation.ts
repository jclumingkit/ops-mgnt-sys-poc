import { getPreviousPrompt } from "./prompts"
import { PROMPT_KEYS, type PromptKey, type PromptResponses } from "./types"

export const isNonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

export const getCompletedPrompts = (responses: PromptResponses): PromptKey[] =>
  PROMPT_KEYS.filter((prompt) => isNonBlank(responses[prompt]))

export const getMissingPrompts = (responses: PromptResponses): PromptKey[] =>
  PROMPT_KEYS.filter((prompt) => !isNonBlank(responses[prompt]))

export const validatePromptResponse = (response: unknown) => {
  if (!isNonBlank(response)) {
    return {
      ok: false as const,
      message: "Enter a response before continuing.",
    }
  }

  return {
    ok: true as const,
    value: response.trim(),
  }
}

export const validatePromptSequence = (
  prompt: PromptKey,
  responses: PromptResponses,
) => {
  const previousPrompt = getPreviousPrompt(prompt)
  if (previousPrompt && !isNonBlank(responses[previousPrompt])) {
    return {
      ok: false as const,
      previousPrompt,
    }
  }

  return { ok: true as const }
}

export const validateClockOut = (responses: PromptResponses) => {
  const missingPrompts = getMissingPrompts(responses)
  return missingPrompts.length === 0
    ? { ok: true as const }
    : { ok: false as const, missingPrompts }
}
