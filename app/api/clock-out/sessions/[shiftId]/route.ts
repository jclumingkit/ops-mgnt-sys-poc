import { getSession } from "@/lib/clock-out/session-store"

export async function GET(
  _request: Request,
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

  return Response.json(session)
}
