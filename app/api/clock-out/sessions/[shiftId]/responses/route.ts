import { getSession, saveResponse } from "@/lib/clock-out/session-store"
import { isPromptKey } from "@/lib/clock-out/types"

const invalidRequest = (message: string) =>
  Response.json(
    {
      error: "INVALID_REQUEST",
      message,
    },
    { status: 400 },
  )

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ shiftId: string }> },
) {
  const { shiftId } = await params
  const session = getSession(shiftId)
  if (!session) {
    return Response.json(
      {
        error: "SHIFT_NOT_FOUND",
        message: `Shift ${shiftId} was not found.`,
      },
      { status: 404 },
    )
  }

  if (session.status === "clocked_out") {
    return Response.json(
      {
        error: "SHIFT_ALREADY_CLOCKED_OUT",
        message: "This shift has already been clocked out.",
      },
      { status: 409 },
    )
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return invalidRequest("The request body must contain valid JSON.")
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return invalidRequest("The request body must be a JSON object.")
  }

  const parsedBody = body as Record<string, unknown>
  const bodyKeys = Object.keys(parsedBody)
  if (bodyKeys.length !== 2 || !bodyKeys.includes("prompt") || !bodyKeys.includes("response")) {
    return invalidRequest("The request must contain only one prompt and response.")
  }

  if (!isPromptKey(parsedBody.prompt)) {
    return invalidRequest("The request must contain a supported prompt key.")
  }

  if (typeof parsedBody.response !== "string") {
    return invalidRequest("The response must be a string.")
  }

  const result = saveResponse(shiftId, parsedBody.prompt, parsedBody.response)
  if (result.kind === "not_found") {
    return Response.json(
      {
        error: "SHIFT_NOT_FOUND",
        message: `Shift ${shiftId} was not found.`,
      },
      { status: 404 },
    )
  }

  if (result.kind === "already_clocked_out") {
    return Response.json(
      {
        error: "SHIFT_ALREADY_CLOCKED_OUT",
        message: "This shift has already been clocked out.",
      },
      { status: 409 },
    )
  }

  if (result.kind === "invalid_response") {
    return Response.json(
      {
        error: "PROMPT_RESPONSE_INVALID",
        message: result.message,
        prompt: result.prompt,
      },
      { status: 400 },
    )
  }

  if (result.kind === "sequence_blocked") {
    return Response.json(
      {
        error: "PROMPT_SEQUENCE_BLOCKED",
        message: "Complete the previous prompt before continuing.",
        prompt: result.prompt,
        required_previous_prompt: result.requiredPreviousPrompt,
      },
      { status: 400 },
    )
  }

  return Response.json(result.session)
}
