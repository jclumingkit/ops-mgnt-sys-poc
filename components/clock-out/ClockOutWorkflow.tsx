"use client"

import { useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { PROMPTS } from "@/lib/clock-out/prompts"
import type { ClockOutApiError, PromptKey, ShiftSession } from "@/lib/clock-out/types"

type Feedback = {
  tone: "error" | "success"
  message: string
}

type Answers = Record<PromptKey, string>

const emptyAnswers = (): Answers => ({
  outstanding_items: "",
  waiting_on: "",
  completed_summary: "",
})

const answersFromSession = (session: ShiftSession): Answers => ({
  outstanding_items: session.responses.outstanding_items ?? "",
  waiting_on: session.responses.waiting_on ?? "",
  completed_summary: session.responses.completed_summary ?? "",
})

const getApiErrorMessage = (payload: unknown, fallback: string) => {
  const errorMessages: Record<string, string> = {
    CLOCK_OUT_BLOCKED: "Complete all end-of-day prompts before clocking out.",
    INVALID_REQUEST: "The request could not be understood. Please try again.",
    PROMPT_RESPONSE_INVALID: "Enter a response before continuing.",
    PROMPT_SEQUENCE_BLOCKED: "Complete the previous prompt before continuing.",
    SHIFT_ALREADY_CLOCKED_OUT: "This shift has already been clocked out.",
    SHIFT_NOT_FOUND: "This shift session is no longer available. Start a new shift.",
  }

  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string" &&
    errorMessages[payload.error]
  ) {
    return errorMessages[payload.error]
  }

  if (payload && typeof payload === "object" && "error" in payload) {
    return fallback
  }

  return fallback
}

export function ClockOutWorkflow({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [session, setSession] = useState<ShiftSession | null>(null)
  const [answers, setAnswers] = useState<Answers>(emptyAnswers)
  const [isCreating, setIsCreating] = useState(true)
  const [isClockingOut, setIsClockingOut] = useState(false)
  const [savingPrompt, setSavingPrompt] = useState<PromptKey | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [announcement, setAnnouncement] = useState("Preparing the end-of-day check-in.")
  const [focusPrompt, setFocusPrompt] = useState<PromptKey | null>(null)
  const [editingPrompt, setEditingPrompt] = useState<PromptKey | null>(null)
  const [needsNewShift, setNeedsNewShift] = useState(false)
  const fieldRefs = useRef<Partial<Record<PromptKey, HTMLTextAreaElement | null>>>({})
  const isInitializing = useRef(false)

  const startNewShift = async () => {
    if (isInitializing.current) {
      return
    }

    isInitializing.current = true
    setIsCreating(true)
    setNeedsNewShift(false)
    setSession(null)
    setAnswers(emptyAnswers())
    setIsClockingOut(false)
    setSavingPrompt(null)
    setFeedback(null)
    setAnnouncement("Starting a new shift.")
    setFocusPrompt(null)
    setEditingPrompt(null)

    try {
      const response = await fetch("/api/clock-out/sessions", { method: "POST" })
      if (!response.ok) {
        throw new Error("A new shift could not be started.")
      }

      const newSession = (await response.json()) as ShiftSession
      setSession(newSession)
      setAnswers(answersFromSession(newSession))
      setAnnouncement("New shift started. Complete the first prompt to continue.")
    } catch {
      const message = "A new shift could not be started. Please try again."
      setFeedback({ tone: "error", message })
      setAnnouncement(message)
    } finally {
      isInitializing.current = false
      setIsCreating(false)
    }
  }

  useEffect(() => {
    if (session || needsNewShift || isInitializing.current) {
      return
    }

    isInitializing.current = true

    const initialize = async () => {
      try {
        const response = await fetch("/api/clock-out/sessions", { method: "POST" })
        if (!response.ok) {
          throw new Error("The end-of-day check-in could not be started.")
        }

        const newSession = (await response.json()) as ShiftSession
        setSession(newSession)
        setAnswers(answersFromSession(newSession))
        setAnnouncement("End-of-day check-in ready. Complete the first prompt to continue.")
      } catch {
        const message = "The end-of-day check-in could not be started. Please try again."
        setFeedback({ tone: "error", message })
        setAnnouncement(message)
      } finally {
        isInitializing.current = false
        setIsCreating(false)
      }
    }

    void initialize()
  }, [needsNewShift, session])

  useEffect(() => {
    if (!focusPrompt || savingPrompt || isClockingOut) {
      return
    }

    const prompt = focusPrompt
    requestAnimationFrame(() => {
      fieldRefs.current[prompt]?.focus()
      setFocusPrompt(null)
    })
  }, [focusPrompt, isClockingOut, savingPrompt])

  const submitPrompt = async (prompt: PromptKey) => {
    if (!session || session.status === "clocked_out") {
      return
    }

    setSavingPrompt(prompt)
    setFeedback(null)

    try {
      const response = await fetch(`/api/clock-out/sessions/${session.shift_id}/responses`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, response: answers[prompt] }),
      })
      const payload: unknown = await response.json()

      if (!response.ok) {
        const errorPayload = payload as Partial<ClockOutApiError>
        const message = getApiErrorMessage(payload, "This response could not be saved.")
        setFeedback({ tone: "error", message })
        setAnnouncement(message)
        if (
          errorPayload.error === "SHIFT_NOT_FOUND" ||
          errorPayload.error === "SHIFT_ALREADY_CLOCKED_OUT"
        ) {
          setNeedsNewShift(true)
          setSession(null)
          setAnswers(emptyAnswers())
          setEditingPrompt(null)
          setFocusPrompt(null)
          return
        }
        setFocusPrompt(errorPayload.prompt ?? prompt)
        return
      }

      const updatedSession = payload as ShiftSession
      setSession(updatedSession)
      setAnswers(answersFromSession(updatedSession))
      if (editingPrompt === prompt) {
        setEditingPrompt(null)
        setAnnouncement(`${PROMPTS.find((definition) => definition.key === prompt)?.label} updated.`)
        setFocusPrompt(null)
      } else {
        setAnnouncement(`${PROMPTS.find((definition) => definition.key === prompt)?.label} saved.`)
        const nextPrompt = PROMPTS[PROMPTS.findIndex((definition) => definition.key === prompt) + 1]
        setFocusPrompt(nextPrompt?.key ?? null)
      }
    } catch {
      const message = "The response could not be saved. Please try again."
      setFeedback({ tone: "error", message })
      setAnnouncement(message)
    } finally {
      setSavingPrompt(null)
    }
  }

  const clockOutSession = async () => {
    if (!session || session.status === "clocked_out") {
      return
    }

    setIsClockingOut(true)
    setFeedback(null)

    try {
      const response = await fetch(`/api/clock-out/sessions/${session.shift_id}/clock-out`, {
        method: "POST",
      })
      const payload: unknown = await response.json()

      if (!response.ok) {
        const errorPayload = payload as Partial<ClockOutApiError>
        const message = getApiErrorMessage(payload, "Clock out could not be completed.")
        setFeedback({ tone: "error", message })
        setAnnouncement(message)
        if (
          errorPayload.error === "SHIFT_NOT_FOUND" ||
          errorPayload.error === "SHIFT_ALREADY_CLOCKED_OUT"
        ) {
          setNeedsNewShift(true)
          setSession(null)
          setAnswers(emptyAnswers())
          setEditingPrompt(null)
          setFocusPrompt(null)
          return
        }
        const missingPrompt = errorPayload.missing_prompts?.[0]
        if (missingPrompt) {
          setEditingPrompt(missingPrompt)
          setFocusPrompt(missingPrompt)

          const latestResponse = await fetch(`/api/clock-out/sessions/${session.shift_id}`)
          if (latestResponse.ok) {
            const latestSession = (await latestResponse.json()) as ShiftSession
            setSession(latestSession)
            setAnswers(answersFromSession(latestSession))
          }
        }
        return
      }

      const clockedOutSession = payload as ShiftSession
      setSession(clockedOutSession)
      setAnswers(answersFromSession(clockedOutSession))
      setEditingPrompt(null)
      setFocusPrompt(null)
      setFeedback({ tone: "success", message: "Clocked out successfully." })
      setAnnouncement("Clocked out successfully.")
    } catch {
      const message = "Clock out could not be completed. Please try again."
      setFeedback({ tone: "error", message })
      setAnnouncement(message)
    } finally {
      setIsClockingOut(false)
    }
  }

  const completedCount = session?.completed_prompts.length ?? 0
  const isComplete = session?.status === "clocked_out"
  const canClockOut = completedCount === PROMPTS.length && !isComplete
  const firstIncompletePrompt = session && !isComplete
    ? PROMPTS.find((definition) => !session.completed_prompts.includes(definition.key))
    : undefined
  const activePrompt = editingPrompt
    ? PROMPTS.find((definition) => definition.key === editingPrompt)
    : firstIncompletePrompt
  const savedPrompts = session
    ? PROMPTS.filter((definition) => session.completed_prompts.includes(definition.key))
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto p-0">
        <Card className="border-0 shadow-none ring-0">
          <CardHeader className="gap-3 border-b">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  End of shift
                </p>
                <DialogTitle className="text-2xl md:text-3xl">
                  End-of-Day Check-In
                </DialogTitle>
                <DialogDescription className="mt-2 max-w-2xl">
                  Complete each prompt in order. All three responses are required before you can clock out.
                </DialogDescription>
              </div>
              <Badge variant={isComplete ? "default" : "outline"} className="h-7 px-3">
                {completedCount}/{PROMPTS.length} complete
              </Badge>
            </div>
          </CardHeader>

          {feedback && (
            <div
              role={feedback.tone === "error" ? "alert" : "status"}
              id="clock-out-feedback"
              className={
                feedback.tone === "error"
                  ? "mx-6 mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                  : "mx-6 mt-6 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary"
              }
            >
              {feedback.message}
            </div>
          )}

          <div className="sr-only" role="status" aria-live="polite">
            {announcement}
          </div>

          <CardContent className="space-y-6 pt-6">
            {isCreating ? (
              <div className="space-y-3" aria-label="Loading end-of-day check-in" role="status">
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                <div className="h-28 animate-pulse rounded-lg bg-muted" />
              </div>
            ) : session && activePrompt ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={`clock-out-${activePrompt.key}`}>
                    <span className="text-muted-foreground">{editingPrompt ? "Edit" : `${completedCount + 1}.`}</span>{" "}
                    {activePrompt.label}
                  </Label>
                </div>
                <textarea
                  ref={(element) => {
                    fieldRefs.current[activePrompt.key] = element
                  }}
                  id={`clock-out-${activePrompt.key}`}
                  value={answers[activePrompt.key]}
                  autoFocus={
                    focusPrompt === activePrompt.key && savingPrompt === null && !isClockingOut
                  }
                  onChange={(event) =>
                    setAnswers((current) => ({ ...current, [activePrompt.key]: event.target.value }))
                  }
                  disabled={savingPrompt !== null || isClockingOut}
                  aria-describedby={focusPrompt === activePrompt.key ? "clock-out-feedback" : undefined}
                  className="min-h-28 w-full resize-y rounded-lg border bg-background px-3 py-3 text-sm leading-6 outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => void submitPrompt(activePrompt.key)}
                    disabled={savingPrompt !== null || isClockingOut}
                  >
                    {savingPrompt === activePrompt.key
                      ? "Saving..."
                      : editingPrompt
                        ? "Save changes"
                        : completedCount < PROMPTS.length - 1
                        ? "Continue"
                        : "Save response"}
                  </Button>
                </div>
              </div>
            ) : session ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-primary" role="status">
                All prompts are complete. You can clock out when you are ready.
              </div>
            ) : (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                The shift session is unavailable. Start a new shift to try again.
              </div>
            )}

            {session && savedPrompts.length > 0 && (
              <section aria-labelledby="saved-responses-heading" className="space-y-3 border-t pt-6">
                <h3 id="saved-responses-heading" className="text-sm font-semibold">
                  Saved responses
                </h3>
                <div className="space-y-3">
                  {savedPrompts.map((prompt) => (
                    <div
                      key={prompt.key}
                      className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium">{prompt.label}</p>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {answers[prompt.key]}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditingPrompt(prompt.key)
                          setFeedback(null)
                          setFocusPrompt(prompt.key)
                        }}
                        disabled={isComplete || savingPrompt !== null || isClockingOut}
                      >
                        Edit
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </CardContent>

          {!isCreating && session && (
            <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {isComplete ? "This shift is complete." : "Responses are saved only when you continue."}
              </p>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button
                  type="button"
                  onClick={() => void clockOutSession()}
                  disabled={!canClockOut || isClockingOut || savingPrompt !== null}
                >
                  {isClockingOut ? "Clocking out..." : isComplete ? "Clocked out" : "Clock Out"}
                </Button>
              </div>
            </CardFooter>
          )}

          {!isCreating && !session && (
            <CardFooter>
              <Button type="button" onClick={() => void startNewShift()}>
                Start new shift
              </Button>
            </CardFooter>
          )}
        </Card>
      </DialogContent>
    </Dialog>
  )
}
