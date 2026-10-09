import { runExtraction } from "@/lib/ai-extraction/extraction-service"
import {
  hasOpenRouterApiKey,
} from "@/lib/ai-extraction/openrouter-client"
import {
  MAX_NOTES_LENGTH,
  type ExtractionRequest,
  type ExtractionStreamEvent,
} from "@/lib/ai-extraction/types"

const jsonHeaders = { "content-type": "application/json" }
const inputError = (message: string) =>
  Response.json(
    { error: "EXTRACTION_INPUT_INVALID", message },
    { status: 400, headers: jsonHeaders },
  )

const providerUnavailable = () =>
  Response.json(
    {
      error: "EXTRACTION_PROVIDER_UNAVAILABLE",
      message: "AI extraction is temporarily unavailable. Please try again later.",
    },
    { status: 503, headers: jsonHeaders },
  )

const encodeEvent = (event: ExtractionStreamEvent) => {
  const eventName = event.type
  let data: unknown

  switch (event.type) {
    case "extraction_started":
      data = { attempt: event.attempt, max_attempts: event.max_attempts }
      break
    case "output_delta":
      data = { text: event.text, attempt: event.attempt }
      break
    case "attempt_reset":
      data = { attempt: event.attempt }
      break
    case "extraction_retrying":
      data = { reason: event.reason, next_attempt: event.next_attempt }
      break
    case "extraction_complete":
      data = { result: event.result }
      break
    case "extraction_error":
      data = event.error
      break
    case "done":
      data = { success: event.success }
      break
  }

  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function POST(request: Request) {
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
            error: {
              code: "EXTRACTION_FAILED",
              message: "The details could not be extracted right now. Please try again.",
            },
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
