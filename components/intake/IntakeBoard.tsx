"use client"

import {
  closestCorners,
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { RefreshCwIcon, RotateCcwIcon, WifiIcon } from "lucide-react"
import { startTransition, useEffect, useOptimistic, useRef, useState } from "react"

import { IntakeColumn } from "@/components/intake/IntakeColumn"
import {
  IntakeLeadDialog,
  type AuthorizationForm,
  type BlockedTransition,
} from "@/components/intake/IntakeLeadDialog"
import { IntakeLeadCard } from "@/components/intake/IntakeLeadCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkflowFeedback, type Feedback } from "@/components/WorkflowFeedback"
import {
  INTAKE_STATUSES,
  INTAKE_STATUS_LABELS,
  getNextIntakeStatus,
  isIntakeStatus,
  type IntakeStatus,
} from "@/lib/intake/statuses"
import type { IntakeLead, IntakeStreamEvent } from "@/lib/intake/types"

const collisionDetectionStrategy = (args: Parameters<typeof closestCorners>[0]) => {
  const pointerCollisions = pointerWithin(args)
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args)
}

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "error"

const emptyForm: AuthorizationForm = {
  authorization_number: "",
  approval_date: "",
  diagnostic_report_uploaded: false,
}

const upsertLead = (leads: IntakeLead[], updated: IntakeLead) =>
  leads.some((lead) => lead.id === updated.id)
    ? leads.map((lead) => lead.id === updated.id ? updated : lead)
    : [...leads, updated]

export const IntakeBoard = () => {
  const [leads, setLeads] = useState<IntakeLead[]>([])
  const [optimisticLeads, moveOptimisticLead] = useOptimistic(
    leads,
    (currentLeads, action: { leadId: string; status: IntakeStatus }) =>
      currentLeads.map((lead) =>
        lead.id === action.leadId ? { ...lead, status: action.status } : lead,
      ),
  )
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting")
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [announcement, setAnnouncement] = useState("Initializing the intake demo.")
  const [activeLead, setActiveLead] = useState<IntakeLead | null>(null)
  const [selectedLead, setSelectedLead] = useState<IntakeLead | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [authorizationForm, setAuthorizationForm] = useState<AuthorizationForm>(emptyForm)
  const [blockedTransition, setBlockedTransition] = useState<BlockedTransition | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const notify = (tone: Feedback["tone"], message: string) => {
    setFeedback({ tone, message })
    setAnnouncement(message)
  }

  const resetDemo = async () => {
    setIsResetting(true)
    setFeedback(null)
    setBlockedTransition(null)
    setDialogOpen(false)

    try {
      const response = await fetch("/api/intake/demo/reset", { method: "POST" })
      if (!response.ok) {
        throw new Error("The demo could not be reset.")
      }

      const payload = (await response.json()) as { leads: IntakeLead[] }
      setLeads(payload.leads)
      setAnnouncement("Demo reset. Listening for new leads from the beginning.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "The demo could not be reset."
      notify("error", message)
    } finally {
      setIsResetting(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const connectToStream = () => {
      eventSourceRef.current?.close()
      const source = new EventSource("/api/intake/leads/stream")
      eventSourceRef.current = source

      const handleEvent = (event: Event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as IntakeStreamEvent
          if (payload.type === "snapshot" || payload.type === "demo_reset") {
            setLeads(payload.leads)
          } else {
            setLeads((currentLeads) => upsertLead(currentLeads, payload.lead))
          }

          if (payload.type === "lead_created") {
            setAnnouncement(`${payload.lead.display_name} arrived in New Lead.`)
          }
          if (payload.type === "lead_updated") {
            setAnnouncement(`${payload.lead.display_name} was updated.`)
          }
        } catch {
          setConnectionStatus("reconnecting")
        }
      }

      source.addEventListener("snapshot", handleEvent)
      source.addEventListener("lead_created", handleEvent)
      source.addEventListener("lead_updated", handleEvent)
      source.addEventListener("demo_reset", handleEvent)
      source.onopen = () => {
        setConnectionStatus("connected")
        setAnnouncement("Listening for new leads from the simulated GoHighLevel integration.")
      }
      source.onerror = () => setConnectionStatus("reconnecting")
    }

    const initialize = async () => {
      setConnectionStatus("connecting")
      try {
        const response = await fetch("/api/intake/demo/reset", { method: "POST" })
        if (!response.ok) {
          throw new Error("The intake demo could not be initialized.")
        }

        const payload = (await response.json()) as { leads: IntakeLead[] }
        if (cancelled) {
          return
        }

        setLeads(payload.leads)
        connectToStream()
      } catch (error) {
        if (cancelled) {
          return
        }
        const message = error instanceof Error
          ? error.message
          : "The intake demo could not be initialized."
        setConnectionStatus("error")
        setFeedback({ tone: "error", message })
        setAnnouncement(message)
      }
    }

    void initialize()

    return () => {
      cancelled = true
      eventSourceRef.current?.close()
    }
  }, [])

  const submitTransition = (
    lead: IntakeLead,
    status: IntakeStatus,
    form: AuthorizationForm = emptyForm,
  ) => {
    setIsSubmitting(true)
    const performTransition = async () => {
      try {
        const response = await fetch(`/api/intake/leads/${lead.id}/status`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status, ...form }),
        })
        const payload: unknown = await response.json()

        if (!response.ok) {
          if (
            payload &&
            typeof payload === "object" &&
            "error" in payload &&
            payload.error === "INTAKE_TRANSITION_BLOCKED"
          ) {
            const blockedPayload = payload as {
              missing_fields?: string[]
              message?: string
            }
            const blockedMessage = "Complete the requirements below before scheduling an assessment."
            setBlockedTransition({
              missing_fields: blockedPayload.missing_fields ?? [],
              message: blockedMessage,
            })
            setFeedback({ tone: "error", message: "This lead cannot move forward yet." })
            setAnnouncement(`This lead cannot move forward yet. ${blockedMessage}`)
            return
          }

          const errorPayload = payload as { message?: string }
          const message = errorPayload.message ?? "The lead could not be moved to the next stage."
          setFeedback({ tone: "error", message })
          setAnnouncement(message)
          return
        }

        if (!payload || typeof payload !== "object" || !("id" in payload)) {
          throw new Error("The transition response was invalid.")
        }
        const updatedLead = payload as IntakeLead

        setLeads((currentLeads) => upsertLead(currentLeads, updatedLead))
        notify("success",
          updatedLead.status === "schedule_assessment"
            ? "Lead advanced to Schedule Assessment"
            : `${updatedLead.display_name} advanced to ${INTAKE_STATUS_LABELS[updatedLead.status]}`,
        )

        if (updatedLead.status === "schedule_assessment") {
          setDialogOpen(false)
          setSelectedLead(null)
          setBlockedTransition(null)
        }
      } catch {
        const message = "The lead transition could not be completed. Please try again."
        notify("error", message)
      } finally {
        setIsSubmitting(false)
      }
    }

    if (status === "schedule_assessment") {
      void performTransition()
      return
    }

    startTransition(async () => {
      moveOptimisticLead({ leadId: lead.id, status })
      await performTransition()
    })
  }

  const openAuthorizationDialog = (lead: IntakeLead) => {
    const form = {
      authorization_number: lead.authorization_number,
      approval_date: lead.approval_date,
      diagnostic_report_uploaded: lead.diagnostic_report_uploaded,
    }
    setSelectedLead(lead)
    setAuthorizationForm(form)
    setBlockedTransition(null)
    setDialogOpen(true)
    void submitTransition(lead, "schedule_assessment", form)
  }

  const moveToNextStage = (lead: IntakeLead) => {
    const nextStatus = getNextIntakeStatus(lead.status)
    if (!nextStatus) {
      return
    }

    if (nextStatus === "schedule_assessment") {
      openAuthorizationDialog(lead)
      return
    }

    void submitTransition(lead, nextStatus)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveLead(null)
    if (!over) {
      return
    }

    const lead = optimisticLeads.find((candidate) => candidate.id === active.id)
    const destination = over.id.toString()
    if (!lead || !isIntakeStatus(destination) || destination === lead.status) {
      return
    }

    const nextStatus = getNextIntakeStatus(lead.status)
    if (destination !== nextStatus) {
      const destinationLabel = INTAKE_STATUS_LABELS[destination]
      const message = `${lead.display_name} must move to ${nextStatus ? INTAKE_STATUS_LABELS[nextStatus] : "the next stage"} before ${destinationLabel}.`
      notify("error", message)
      return
    }

    if (destination === "schedule_assessment") {
      openAuthorizationDialog(lead)
      return
    }

    void submitTransition(lead, destination)
  }

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      setSelectedLead(null)
      setBlockedTransition(null)
    }
  }

  const connectionLabel = {
    connecting: "Connecting",
    connected: "Listening for new leads",
    reconnecting: "Reconnecting",
    error: "Connection error",
  }[connectionStatus]

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Operations intake
            </p>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Intake pipeline
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Manage incoming leads, verify benefits, and prepare cases for assessment.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              role="status"
              aria-live="polite"
              variant="outline"
              className={`h-8 gap-2 bg-card px-3 ${connectionStatus === "connected" ? "text-primary" : "text-muted-foreground"}`}
            >
              <WifiIcon className="size-3.5" />
              {connectionLabel}
            </Badge>
            <Button type="button" variant="outline" onClick={() => void resetDemo()} disabled={isResetting}>
              {isResetting ? <RefreshCwIcon className="animate-spin" /> : <RotateCcwIcon />}
              Reset demo
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-3 divide-x rounded-xl border bg-card py-4">
          {[
            { label: "Total leads", count: optimisticLeads.length },
            { label: "Awaiting authorization", count: optimisticLeads.filter((lead) => lead.status === "authorization_pending").length },
            { label: "Ready to schedule", count: optimisticLeads.filter((lead) => lead.status === "schedule_assessment").length },
          ].map((metric) => (
            <div key={metric.label} className="px-4 md:px-6">
              <p className="text-[11px] text-muted-foreground md:text-xs">{metric.label}</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{metric.count}</p>
            </div>
          ))}
        </div>

        <div className="sr-only" role="status" aria-live="polite">
          {announcement}
        </div>

        <WorkflowFeedback feedback={feedback} />

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={({ active }) => {
            setActiveLead(optimisticLeads.find((lead) => lead.id === active.id) ?? null)
          }}
          onDragCancel={() => setActiveLead(null)}
          onDragEnd={handleDragEnd}
        >
          <div className="grid flex-1 grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
            {INTAKE_STATUSES.map((status) => (
              <IntakeColumn
                key={status}
                status={status}
                label={INTAKE_STATUS_LABELS[status]}
                leads={optimisticLeads.filter((lead) => lead.status === status)}
                onMoveNext={moveToNextStage}
              />
            ))}
          </div>
          <DragOverlay>
            {activeLead ? (
              <IntakeLeadCard lead={activeLead} onMoveNext={() => {}} isDragOverlay />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <IntakeLeadDialog
        lead={selectedLead}
        open={dialogOpen}
        form={authorizationForm}
        blockedTransition={blockedTransition}
        isSubmitting={isSubmitting}
        onOpenChange={handleDialogChange}
        onFormChange={setAuthorizationForm}
        onSubmit={() => {
          if (selectedLead) {
            void submitTransition(selectedLead, "schedule_assessment", authorizationForm)
          }
        }}
      />
    </main>
  )
}
