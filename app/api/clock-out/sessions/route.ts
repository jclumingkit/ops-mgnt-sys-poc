import { createSession } from "@/lib/clock-out/session-store"
import { validateEmptyRequestBody } from "@/lib/clock-out/request-validation"

export async function POST(request: Request) {
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

  return Response.json(createSession(), { status: 201 })
}
