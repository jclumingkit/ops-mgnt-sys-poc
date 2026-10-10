import { runExtraction } from "@/lib/ai-extraction/extraction-service"
import {
  hasOpenRouterApiKey,
} from "@/lib/ai-extraction/openrouter-client"
import {
  MAX_NOTES_LENGTH,
  EXTRACTION_FAILED_ERROR,
  type ExtractionRequest,
  type ExtractionStreamEvent,
} from "@/lib/ai-extraction/types"

const inputError = (message: string) =>
  Response.json(
    { error: "EXTRACTION_INPUT_INVALID", message },
    { status: 400 },
  )

const providerUnavailable = () =>
  Response.json(
    {
      error: "EXTRACTION_PROVIDER_UNAVAILABLE",
      message: "AI extraction is temporarily unavailable. Please try again later.",
    },
    { status: 503 },
  )

const encodeEvent = (event: ExtractionStreamEvent) => {
  const { type, ...payload } = event
  const data = event.type === "extraction_error" ? event.error : payload
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
}

export const POST = async (request: Request) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return inputError("Enter call notes before starting extraction.")
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("notes" in body) ||
    typeof (body as Partial<ExtractionRequest>).notes !== "string"
  ) {
    return inputError("Enter call notes before starting extraction.")
  }

  const notes = (body as ExtractionRequest).notes
  if (!notes.trim()) {
    return inputError("Enter call notes before starting extraction.")
  }

  if (notes.length > MAX_NOTES_LENGTH) {
    return inputError("Call notes are too long. Shorten them and try again.")
  }

  if (!hasOpenRouterApiKey()) {
    return providerUnavailable()
  }

  let cancelled = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()

      const send = (event: ExtractionStreamEvent) => {
        if (cancelled) {
          return
        }

        try {
          const encodedEvent = encodeEvent(event)
          controller.enqueue(encoder.encode(encodedEvent))
        } catch {
          cancelled = true
        }
      }

      try {
        await runExtraction(notes.trim(), {
          onEvent: send,
        })
      } catch {
        if (!cancelled) {
          send({
            type: "extraction_error",
            error: EXTRACTION_FAILED_ERROR,
          })
          send({ type: "done", success: false })
        }
      } finally {
        if (!cancelled) {
          try {
            controller.close()
          } catch {
            cancelled = true
          }
        }
      }
    },
    cancel() {
      cancelled = true
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
