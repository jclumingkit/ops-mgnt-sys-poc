"use client";

import { useEffect, useRef, useState } from "react";
import { BracesIcon, SparklesIcon, ArrowRightIcon } from "lucide-react";

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
import { readExtractionStream } from "@/lib/ai-extraction/read-stream";
import { validateExtractionResult } from "@/lib/ai-extraction/schema";
import { EXTRACTION_FAILED_ERROR } from "@/lib/ai-extraction/types";
import { WorkflowFeedback } from "@/components/WorkflowFeedback";

type WorkspaceStatus = "idle" | "pending" | "success" | "error";

const TERMINAL_ERROR_MESSAGE = EXTRACTION_FAILED_ERROR.message;

const streamErrorMessage =
  "The extraction stream ended before a result was available. Please try again.";

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

export const AIExtractionWorkspace = () => {
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
          const text = data.text;
          setPartialOutput((current) => current + text);
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
          validateExtractionResult(data.result);
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

      for await (const event of readExtractionStream(response.body)) {
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
      setError(message || streamErrorMessage);
      setAnnouncement(message || streamErrorMessage);
    } finally {
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
    <main className="flex flex-1 flex-col gap-8 p-4 md:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-7xl space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Structured AI workspace
        </p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          AI Call Notes Extraction
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Turn call notes into a consistent record, ready for the next step in intake.
        </p>
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader className="px-6 pt-2">
            <CardTitle className="flex items-center gap-2"><SparklesIcon className="size-4 text-primary" />Call notes</CardTitle>
            <CardDescription>
              Review the sample or enter your own mock call notes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 px-6 pb-2">
            <div className="space-y-2">
              <Label htmlFor="raw-call-notes">Raw call notes</Label>
              <textarea
                id="raw-call-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={status === "pending"}
                className="workflow-textarea min-h-72"
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
                <ArrowRightIcon />
              </Button>
            </div>
          </CardContent>
        </Card>

        <section className="min-w-0 space-y-5 rounded-xl border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-medium"><BracesIcon className="size-4 text-primary" />Structured record</h2>
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

          <WorkflowFeedback id="ai-extraction-feedback" feedback={error ? { tone: "error", message: error } : null} />

          {partialOutput ? (
            <pre
              aria-label="Streaming extraction JSON"
              className="min-h-72 max-h-[32rem] overflow-auto rounded-lg border bg-background p-5 font-mono text-xs leading-7 whitespace-pre-wrap break-words"
            >
              {partialOutput}
            </pre>
          ) : status === "pending" ? (
            <div
              aria-label="Waiting for streamed JSON"
              className="flex min-h-72 items-center justify-center rounded-lg border border-dashed text-center font-mono text-2xl tracking-[0.35em] text-muted-foreground animate-pulse"
            >
              ...
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
              <BracesIcon className="size-8 text-primary/40" />
              <p>Your extracted JSON will appear here.</p>
              <p className="max-w-60 text-xs leading-5">Parent, child, payer, and follow-up date in one validated record.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
