import {
  getIntakeGeneratorState,
  listIntakeLeads,
  startIntakeGenerator,
  subscribeToIntake,
} from "@/lib/intake/lead-generator"
import type { IntakeStreamEvent } from "@/lib/intake/types"

const encoder = new TextEncoder()

const toSseMessage = (event: IntakeStreamEvent) =>
  encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)

export function GET(request: Request) {
  startIntakeGenerator()

  let cleanup = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let unsubscribe = () => {}
      const heartbeat = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(": heartbeat\n\n"))
        }
      }, 15_000)

      const close = () => {
        if (closed) {
          return
        }

        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        request.signal.removeEventListener("abort", close)

        try {
          controller.close()
        } catch {
          // The client may have already cancelled the stream.
        }
      }

      unsubscribe = subscribeToIntake((event) => {
        if (!closed) {
          controller.enqueue(toSseMessage(event))
        }
      })
      cleanup = close
      request.signal.addEventListener("abort", close)

      controller.enqueue(
        toSseMessage({
          type: "snapshot",
          leads: listIntakeLeads(),
        }),
      )
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
      "X-Intake-Generator": JSON.stringify(getIntakeGeneratorState()),
    },
  })
}
