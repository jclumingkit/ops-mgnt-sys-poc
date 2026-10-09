"use client"

import { useDroppable } from "@dnd-kit/core"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

const columnStyles: Record<IntakeStatus, string> = {
  new_lead: "border-sky-200/80 bg-sky-50/70 dark:border-sky-900/70 dark:bg-sky-950/20",
  benefits_verification: "border-amber-200/80 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/20",
  authorization_pending: "border-violet-200/80 bg-violet-50/70 dark:border-violet-900/70 dark:bg-violet-950/20",
  schedule_assessment: "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/20",
}

export function IntakeColumn({
  status,
  label,
  leads,
  onMoveNext,
}: IntakeColumnProps) {
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
        "flex min-h-72 flex-col rounded-2xl border p-3 transition-colors",
        columnStyles[status],
        isOver && "border-primary bg-primary/5 ring-2 ring-primary/20",
      )}
    >
      <CardHeader className="p-1 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle id={`${status}-heading`} className="text-sm">
            {label}
          </CardTitle>
          <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border/70">
            {leads.length}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 p-0">
        {leads.length > 0 ? (
          leads.map((lead) => (
            <IntakeLeadCard
              key={lead.id}
              lead={lead}
              onMoveNext={onMoveNext}
            />
          ))
        ) : (
          <Card className="flex min-h-28 flex-1 items-center justify-center border-dashed bg-transparent py-4 shadow-none">
            <p className="text-center text-xs text-muted-foreground">
              No leads in this stage
            </p>
          </Card>
        )}
      </CardContent>
    </section>
  )
}
