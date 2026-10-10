"use client"

import { useDroppable } from "@dnd-kit/core"

import { cn } from "cn"
import type { IntakeLead } from "@/lib/intake/types"
import type { IntakeStatus } from "@/lib/intake/statuses"
import { IntakeLeadCard } from "./IntakeLeadCard"

type IntakeColumnProps = {
  status: IntakeStatus
  label: string
  leads: IntakeLead[]
  onMoveNext: (lead: IntakeLead) => void
}

const statusColors: Record<IntakeStatus, string> = {
  new_lead: "bg-sky-500",
  benefits_verification: "bg-amber-500",
  authorization_pending: "bg-violet-500",
  schedule_assessment: "bg-primary",
}

export const IntakeColumn = ({
  status,
  label,
  leads,
  onMoveNext,
}: IntakeColumnProps) => {
  const { isOver, setNodeRef } = useDroppable({
    id: status,
    data: { status },
  })

  return (
    <section
      ref={setNodeRef}
      role="region"
      aria-labelledby={`${status}-heading`}
      data-testid={`intake-column-${status}`}
      className={cn(
        "flex min-h-80 flex-col rounded-xl border border-transparent bg-muted/60 p-3 transition-colors",
        isOver && "border-primary bg-primary/5 ring-2 ring-primary/20",
      )}
    >
      <div className="p-1 pb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${status}-heading`} className="flex items-center gap-2 text-xs font-semibold">
            <span className={cn("size-2 shrink-0 rounded-full", statusColors[status])} />
            {label}
          </h2>
          <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border/70">
            {leads.length}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3">
        {leads.length > 0 ? (
          leads.map((lead) => (
            <IntakeLeadCard
              key={lead.id}
              lead={lead}
              onMoveNext={onMoveNext}
            />
          ))
        ) : (
          <div className="flex min-h-52 flex-1 items-center justify-center rounded-lg border border-dashed border-border/80 py-4">
            <p className="text-center text-xs text-muted-foreground">
              No leads in this stage
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
