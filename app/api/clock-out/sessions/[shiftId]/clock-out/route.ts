import { clockOut } from "@/lib/clock-out/session-store"
import { validateEmptyRequestBody } from "@/lib/clock-out/request-validation"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shiftId: string }> },
) {
  const { shiftId } = await params
  const body = await validateEmptyRequestBody(request)
  if (!body.ok) {
    return Response.json(
      {
        error: "INVALID_REQUEST",
        message: body.message,
      },
      { status: 400 },
    )
  }

  const result = clockOut(shiftId)

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

  if (result.kind === "blocked") {
    return Response.json(
      {
        error: "CLOCK_OUT_BLOCKED",
        message: "Complete all end-of-day prompts before clocking out.",
        missing_prompts: result.missingPrompts,
      },
      { status: 400 },
    )
  }

  return Response.json(result.session)
}
