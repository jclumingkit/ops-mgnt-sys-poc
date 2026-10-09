import {
  getIntakeLead,
  updateIntakeLead,
} from "@/lib/intake/lead-generator"
import { validateTransition } from "@/lib/intake/transition-validation"
import { isIntakeStatus } from "@/lib/intake/statuses"
import type { TransitionRequest } from "@/lib/intake/types"

const invalidRequest = (message: string) =>
  Response.json(
    {
      error: "INVALID_TRANSITION",
      message,
    },
    { status: 400 },
  )

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params
  let body: TransitionRequest

  try {
    const parsedBody: unknown = await request.json()
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return invalidRequest("The request body must be a JSON object.")
    }
    body = parsedBody as TransitionRequest
  } catch {
    return invalidRequest("The request body must contain valid JSON.")
  }

  const lead = getIntakeLead(leadId)
  if (!lead) {
    return Response.json(
      {
        error: "LEAD_NOT_FOUND",
        message: `Lead ${leadId} was not found.`,
      },
      { status: 404 },
    )
  }

  if (!isIntakeStatus(body.status)) {
    return invalidRequest("The request must contain a supported status.")
  }

  const result = validateTransition(lead.status, body)
  if (!result.ok) {
    if (result.kind === "blocked") {
      return Response.json(
        {
          error: "INTAKE_TRANSITION_BLOCKED",
          message: result.message,
          from_status: lead.status,
          to_status: body.status,
          missing_fields: result.missing_fields,
        },
        { status: 400 },
      )
    }

    return invalidRequest(result.message)
  }

  const updatedLead = updateIntakeLead(leadId, {
    status: result.status,
    ...result.authorization,
  })

  if (!updatedLead) {
    return Response.json(
      {
        error: "LEAD_NOT_FOUND",
        message: `Lead ${leadId} was not found.`,
      },
      { status: 404 },
    )
  }

  return Response.json(updatedLead)
}
