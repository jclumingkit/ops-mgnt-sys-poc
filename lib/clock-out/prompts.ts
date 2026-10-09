import { PROMPT_KEYS, type PromptKey } from "./types"

export type PromptDefinition = {
  key: PromptKey
  label: string
}

const PROMPT_LABELS: Record<PromptKey, string> = {
  outstanding_items: "What items are currently outstanding?",
  waiting_on: "Who are you waiting on for response?",
  completed_summary: "Summary of work completed today.",
}

export const PROMPTS: readonly PromptDefinition[] = PROMPT_KEYS.map((key) => ({
  key,
  label: PROMPT_LABELS[key],
}))

export const getPromptIndex = (prompt: PromptKey) =>
  PROMPTS.findIndex((definition) => definition.key === prompt)

export const getPreviousPrompt = (prompt: PromptKey) => {
  const index = getPromptIndex(prompt)
  return index > 0 ? PROMPTS[index - 1]?.key : undefined
}
