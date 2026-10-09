"use client"

import { useDraggable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { ArrowRightIcon, GripVerticalIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { IntakeLead } from "@/lib/intake/types"
import { getNextIntakeStatus, INTAKE_STATUS_LABELS } from "@/lib/intake/statuses"

type IntakeLeadCardProps = {
  lead: IntakeLead
  onMoveNext: (lead: IntakeLead) => void
  isDragOverlay?: boolean
}

export function IntakeLeadCard({ lead, onMoveNext, isDragOverlay = false }: IntakeLeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { status: lead.status, lead },
    disabled: isDragOverlay,
    attributes: {
      role: "group",
      roleDescription: "draggable lead card",
      tabIndex: 0,
    },
  })
  const nextStatus = getNextIntakeStatus(lead.status)
  const requirementCount = [
    lead.authorization_number,
    lead.approval_date,
    lead.diagnostic_report_uploaded,
  ].filter(Boolean).length

  return (
    <Card
      ref={setNodeRef}
      data-testid={`intake-lead-card-${lead.id}`}
      style={{ transform: isDragOverlay ? undefined : CSS.Translate.toString(transform) }}
      className={
        isDragOverlay
          ? "w-[min(20rem,calc(100vw-2rem))] rotate-2 opacity-90 shadow-xl"
          : isDragging
            ? "cursor-grabbing opacity-0"
            : "cursor-grab shadow-sm"
      }
      {...(isDragOverlay ? {} : attributes)}
      {...(isDragOverlay ? {} : listeners)}
      aria-label={isDragOverlay ? undefined : `Drag ${lead.display_name}`}
      aria-hidden={isDragOverlay}
    >
      <CardHeader className="gap-2 p-3 pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 text-muted-foreground" aria-hidden="true">
              <GripVerticalIcon aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-sm">{lead.display_name}</CardTitle>
              <p className="mt-1 truncate text-xs text-muted-foreground">{lead.payer}</p>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0">
            #{lead.sequence}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3">
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="truncate">{lead.email}</p>
          <p>{lead.phone}</p>
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <span className="text-xs text-muted-foreground">
            Authorization {requirementCount}/3
          </span>
          {nextStatus && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation()
                onMoveNext(lead)
              }}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label={`Move ${lead.display_name} to ${INTAKE_STATUS_LABELS[nextStatus]}`}
            >
              <span className="hidden sm:inline">Move next</span>
              <ArrowRightIcon />
            </Button>
          )}
        </div>
        {(lead.authorization_number || lead.approval_date || lead.diagnostic_report_uploaded) && (
          <div className="rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
            {lead.authorization_number && <p>Auth: {lead.authorization_number}</p>}
            {lead.approval_date && <p>Approved: {lead.approval_date}</p>}
            {lead.diagnostic_report_uploaded && <p>Diagnostic report uploaded</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
