"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { DEFAULT_MOCK_CALL_NOTES } from "@/lib/ai-extraction/mock-call-notes";

type WorkspaceStatus = "idle" | "pending" | "success" | "error";

const TERMINAL_ERROR_MESSAGE =
  "The details could not be extracted right now. Please try again.";

const streamErrorMessage =
  "The extraction stream ended before a result was available. Please try again.";

const parseSseRecord = (record: string) => {
  const lines = record.split(/\r?\n/);
  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLine = lines.find((line) => line.startsWith("data:"));

  if (!eventLine || !dataLine) {
    throw new Error("Malformed extraction stream event");
  }

  let data: unknown;
  try {
    data = JSON.parse(dataLine.slice(5).trim());
  } catch {
    throw new Error("Malformed extraction stream data");
  }

  return {
    name: eventLine.slice(6).trim(),
    data: data as Record<string, unknown>,
  };
};

const getHttpErrorMessage = (status: number, payload: unknown) => {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  if (status === 503) {
    return "AI extraction is temporarily unavailable. Please try again later.";
  }

  if (status === 400) {
    return "Enter call notes before starting extraction.";
  }

  return "The extraction request could not be started. Please try again.";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const yieldToBrowser = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

export function AIExtractionWorkspace() {
  const [notes, setNotes] = useState(DEFAULT_MOCK_CALL_NOTES);
  const [partialOutput, setPartialOutput] = useState("");
  const [status, setStatus] = useState<WorkspaceStatus>("idle");
  const [currentAttempt, setCurrentAttempt] = useState(1);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState(
    "Ready to extract mock call notes.",
  );
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const startExtraction = async () => {
    if (status === "pending") {
      return;
    }

    if (!notes.trim()) {
      const message = "Enter call notes before starting extraction.";
      setError(message);
      setStatus("error");
      setAnnouncement(message);
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setPartialOutput("");
    setError(null);
    setStatus("pending");
    setCurrentAttempt(1);
    setAnnouncement("Extraction started. Building the structured record.");

    let receivedTerminalEvent = false;
    let receivedDoneEvent = false;
    let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const applyEvent = (name: string, data: Record<string, unknown>) => {
      switch (name) {
        case "extraction_started": {
          const attempt = typeof data.attempt === "number" ? data.attempt : 1;
          const maximum =
            typeof data.max_attempts === "number" ? data.max_attempts : 3;
          setCurrentAttempt(attempt);
          setMaxAttempts(maximum);
          setAnnouncement(
            `Extraction started. Attempt ${attempt} of ${maximum}.`,
          );
          break;
        }
        case "output_delta":
          if (typeof data.text !== "string") {
            throw new Error("Malformed extraction output event");
          }
          flushSync(() => {
            setPartialOutput((current) => current + data.text);
          });
          break;
        case "attempt_reset":
          if (typeof data.attempt !== "number") {
            throw new Error("Malformed extraction retry event");
          }
          setPartialOutput("");
          setCurrentAttempt(data.attempt);
          break;
        case "extraction_retrying": {
          const nextAttempt =
            typeof data.next_attempt === "number"
              ? data.next_attempt
              : currentAttempt + 1;
          setCurrentAttempt(nextAttempt);
          setStatus("pending");
          setAnnouncement(
            `Retrying extraction (${nextAttempt} of ${maxAttempts}).`,
          );
          break;
        }
        case "extraction_complete":
          if (!isRecord(data.result)) {
            throw new Error("Malformed extraction result event");
          }
          receivedTerminalEvent = true;
          setStatus("success");
          setError(null);
          setAnnouncement("Extraction complete.");
          break;
        case "extraction_error":
          receivedTerminalEvent = true;
          setStatus("error");
          setError(TERMINAL_ERROR_MESSAGE);
          setAnnouncement(TERMINAL_ERROR_MESSAGE);
          break;
        case "done":
          if (typeof data.success !== "boolean") {
            throw new Error("Malformed extraction completion event");
          }
          receivedDoneEvent = true;
          break;
        default:
          throw new Error("Unknown extraction stream event");
      }
    };

    try {
      const response = await fetch("/api/ai-extraction/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes }),
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("text/event-stream")) {
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        throw new Error(getHttpErrorMessage(response.status, payload));
      }

      if (!response.body) {
        throw new Error(streamErrorMessage);
      }

      const reader = response.body.getReader();
      activeReader = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const decodedChunk = decoder.decode(value, { stream: true });
        console.log("[ai-extraction] client stream chunk", {
          at: new Date().toISOString(),
          bytes: value.byteLength,
          text: decodedChunk,
        });
        buffer += decodedChunk;
        const records = buffer.split(/\r?\n\r?\n/);
        buffer = records.pop() ?? "";
        for (const record of records) {
          if (record.trim()) {
            const event = parseSseRecord(record);
            console.log("[ai-extraction] client SSE event", {
              at: new Date().toISOString(),
              event: event.name,
              data: event.data,
            });
            applyEvent(event.name, event.data);
            await yieldToBrowser();
          }
        }
      }

      if (buffer.trim()) {
        const event = parseSseRecord(buffer);
        console.log("[ai-extraction] client SSE event", {
          at: new Date().toISOString(),
          event: event.name,
          data: event.data,
        });
        applyEvent(event.name, event.data);
      }

      if (!receivedDoneEvent || !receivedTerminalEvent) {
        throw new Error(streamErrorMessage);
      }
    } catch (caughtError) {
      if (controller.signal.aborted) {
        return;
      }

      const message =
        caughtError instanceof Error ? caughtError.message : streamErrorMessage;
      setStatus("error");
      setError(
        message === TERMINAL_ERROR_MESSAGE
          ? message
          : message || streamErrorMessage,
      );
      setAnnouncement(message || streamErrorMessage);
    } finally {
      await activeReader?.cancel().catch(() => undefined);
      activeReader?.releaseLock();
      activeReader = null;
      activeRequest.current = null;
      setStatus((current) => (current === "pending" ? "error" : current));
    }
  };

  const statusLabel =
    status === "pending"
      ? `Building extraction (attempt ${currentAttempt} of ${maxAttempts})`
      : status === "success"
        ? "Extraction complete"
        : status === "error"
          ? "Extraction needs attention"
          : "Ready to extract";

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="mx-auto w-full max-w-7xl space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Structured AI workspace
        </p>
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          AI Call Notes Extraction
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
          Extract a small, typed record from mock call notes. This demonstration
          uses an AI provider and is not intended for real patient information.
        </p>
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Call notes</CardTitle>
            <CardDescription>
              Edit the mock note before starting an explicit extraction request.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="raw-call-notes">Raw call notes</Label>
              <textarea
                id="raw-call-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={status === "pending"}
                className="min-h-64 w-full resize-y rounded-lg border bg-background px-3 py-3 text-sm leading-6 outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Mock data only. No notes are persisted.
              </p>
              <Button
                type="button"
                onClick={() => void startExtraction()}
                disabled={status === "pending"}
              >
                {status === "pending"
                  ? "Extracting..."
                  : error
                    ? "Try again"
                    : "Start extraction"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Extracting JSON data</h3>
            <Badge
              variant={
                status === "success"
                  ? "default"
                  : status === "error"
                    ? "destructive"
                    : "outline"
              }
            >
              {statusLabel}
            </Badge>
          </div>

          <div className="sr-only" role="status" aria-live="polite">
            {announcement}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {partialOutput ? (
            <pre
              aria-label="Streaming extraction JSON"
              className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/30 p-4 font-mono text-xs leading-6 whitespace-pre-wrap break-words"
            >
              {partialOutput}
            </pre>
          ) : status === "pending" ? (
            <div
              aria-label="Waiting for streamed JSON"
              className="rounded-lg border border-dashed p-8 text-center font-mono text-2xl tracking-[0.35em] text-muted-foreground animate-pulse"
            >
              ...
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Your extracted JSON will appear here.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
