import { randomUUID } from "node:crypto"

import { getCompletedPrompts } from "./validation"
import {
  PROMPT_KEYS,
  type PromptKey,
  type PromptResponses,
  type ShiftSession,
} from "./types"
import { validateClockOut, validatePromptResponse, validatePromptSequence } from "./validation"

type SaveResponseResult =
  | { kind: "ok"; session: ShiftSession }
  | { kind: "not_found" }
  | { kind: "already_clocked_out" }
  | { kind: "invalid_response"; prompt: PromptKey; message: string }
  | { kind: "sequence_blocked"; prompt: PromptKey; requiredPreviousPrompt: PromptKey }

type ClockOutResult =
  | { kind: "ok"; session: ShiftSession }
  | { kind: "not_found" }
  | { kind: "already_clocked_out" }
  | { kind: "blocked"; missingPrompts: PromptKey[] }

const globalForClockOut = globalThis as typeof globalThis & {
  clockOutSessions?: Map<string, ShiftSession>
}

const sessions = globalForClockOut.clockOutSessions ?? new Map<string, ShiftSession>()
globalForClockOut.clockOutSessions = sessions

const copySession = (session: ShiftSession): ShiftSession => ({
  ...session,
  responses: { ...session.responses },
  completed_prompts: [...session.completed_prompts],
})

const emptyResponses = (): PromptResponses => ({
  outstanding_items: null,
  waiting_on: null,
  completed_summary: null,
})

export const createSession = () => {
  const session: ShiftSession = {
    shift_id: `shift-${randomUUID()}`,
    status: "active",
    responses: emptyResponses(),
    completed_prompts: [],
    created_at: new Date().toISOString(),
    clocked_out_at: null,
  }

  sessions.set(session.shift_id, session)
  return copySession(session)
}

export const getSession = (shiftId: string) => {
  const session = sessions.get(shiftId)
  return session ? copySession(session) : null
}

export const saveResponse = (
  shiftId: string,
  prompt: PromptKey,
  response: unknown,
): SaveResponseResult => {
  const session = sessions.get(shiftId)
  if (!session) {
    return { kind: "not_found" }
  }

  if (session.status === "clocked_out") {
    return { kind: "already_clocked_out" }
  }

  const validatedResponse = validatePromptResponse(response)
  if (!validatedResponse.ok) {
    return { kind: "invalid_response", prompt, message: validatedResponse.message }
  }

  const sequence = validatePromptSequence(prompt, session.responses)
  if (!sequence.ok) {
    return {
      kind: "sequence_blocked",
      prompt,
      requiredPreviousPrompt: sequence.previousPrompt,
    }
  }

  const responses = {
    ...session.responses,
    [prompt]: validatedResponse.value,
  }
  const updatedSession: ShiftSession = {
    ...session,
    responses,
    completed_prompts: getCompletedPrompts(responses),
  }

  sessions.set(shiftId, updatedSession)
  return { kind: "ok", session: copySession(updatedSession) }
}

export const clockOut = (shiftId: string): ClockOutResult => {
  const session = sessions.get(shiftId)
  if (!session) {
    return { kind: "not_found" }
  }

  if (session.status === "clocked_out") {
    return { kind: "already_clocked_out" }
  }

  const validation = validateClockOut(session.responses)
  if (!validation.ok) {
    return { kind: "blocked", missingPrompts: validation.missingPrompts }
  }

  const updatedSession: ShiftSession = {
    ...session,
    status: "clocked_out",
    completed_prompts: [...PROMPT_KEYS],
    clocked_out_at: new Date().toISOString(),
  }

  sessions.set(shiftId, updatedSession)
  return { kind: "ok", session: copySession(updatedSession) }
}
