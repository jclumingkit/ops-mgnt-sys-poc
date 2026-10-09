import {
  getMockLeads,
  startMockLeadGenerator,
  subscribeToMockLeadGenerator,
} from "@/lib/gohighlevel/lead-generator"
import type { LeadFeedEvent } from "@/lib/gohighlevel/types"

const encoder = new TextEncoder()

const toSseMessage = (event: LeadFeedEvent) =>
  encoder.encode(`data: ${JSON.stringify(event)}\n\n`)

export function GET(request: Request) {
  startMockLeadGenerator()

  let cleanup = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
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

      const unsubscribe = subscribeToMockLeadGenerator((event) => {
        if (!closed) {
          controller.enqueue(toSseMessage(event))
        }
      })

      cleanup = close
      request.signal.addEventListener("abort", close)

      controller.enqueue(
        toSseMessage({
          type: "snapshot",
          source: "gohighlevel",
          emittedAt: new Date().toISOString(),
          leads: getMockLeads(),
        })
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
    },
  })
}
