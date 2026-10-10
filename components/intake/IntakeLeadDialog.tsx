"use client"

import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { IntakeLead } from "@/lib/intake/types"

export type AuthorizationForm = {
  authorization_number: string
  approval_date: string
  diagnostic_report_uploaded: boolean
}

export type BlockedTransition = {
  missing_fields: string[]
  message: string
}

type IntakeLeadDialogProps = {
  lead: IntakeLead | null
  open: boolean
  form: AuthorizationForm
  blockedTransition: BlockedTransition | null
  isSubmitting: boolean
  onOpenChange: (open: boolean) => void
  onFormChange: (form: AuthorizationForm) => void
  onSubmit: () => void
}

const fieldLabels = {
  authorization_number: "Authorization number",
  approval_date: "Approval date",
  diagnostic_report_uploaded: "Diagnostic report uploaded",
} as const

export const IntakeLeadDialog = ({
  lead,
  open,
  form,
  blockedTransition,
  isSubmitting,
  onOpenChange,
  onFormChange,
  onSubmit,
}: IntakeLeadDialogProps) => {
  useEffect(() => {
    const firstMissingField = blockedTransition?.missing_fields[0]
    if (!firstMissingField) {
      return
    }

    const fieldId = {
      authorization_number: "authorization-number",
      approval_date: "approval-date",
      diagnostic_report_uploaded: "diagnostic-report-uploaded",
    }[firstMissingField as keyof typeof fieldLabels]

    const focusTimer = window.setTimeout(() => {
      document.getElementById(fieldId)?.focus()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [blockedTransition])

  const completedCount = [
    form.authorization_number.trim(),
    form.approval_date,
    form.diagnostic_report_uploaded,
  ].filter(Boolean).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {blockedTransition
              ? "This lead cannot move forward yet"
              : "Complete authorization requirements"}
          </DialogTitle>
          <DialogDescription>
            {blockedTransition
              ? "Complete the requirements below before scheduling an assessment."
              : `Confirm the authorization details before moving ${lead?.display_name ?? "this lead"} to Schedule Assessment.`}
          </DialogDescription>
        </DialogHeader>

        {blockedTransition && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              <span>{blockedTransition.message}</span>
            </div>
            <ul className="mt-3 space-y-2 text-muted-foreground">
              {blockedTransition.missing_fields.map((field) => (
                <li key={field} className="flex items-center gap-2">
                  <Checkbox
                    checked={false}
                    disabled
                  />
                  <span>{fieldLabels[field as keyof typeof fieldLabels] ?? field}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="authorization-number">Authorization number</Label>
            <Input
              id="authorization-number"
              value={form.authorization_number}
              onChange={(event) =>
                onFormChange({
                  ...form,
                  authorization_number: event.target.value,
                })
              }
              autoComplete="off"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="approval-date">Approval date</Label>
            <Input
              id="approval-date"
              type="date"
              value={form.approval_date}
              onChange={(event) =>
                onFormChange({
                  ...form,
                  approval_date: event.target.value,
                })
              }
              disabled={isSubmitting}
            />
          </div>

          <Label
            htmlFor="diagnostic-report-uploaded"
            className="rounded-lg border p-3"
          >
            <Checkbox
              id="diagnostic-report-uploaded"
              checked={form.diagnostic_report_uploaded}
              onCheckedChange={(checked) =>
                onFormChange({
                  ...form,
                  diagnostic_report_uploaded: checked === true,
                })
              }
              disabled={isSubmitting}
            />
            <span>Diagnostic report uploaded</span>
          </Label>

          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm"
          >
            <span>Requirements complete</span>
            <span className="font-medium">{completedCount} of 3</span>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !lead}>
              {isSubmitting ? "Checking requirements..." : "Confirm transition"}
            </Button>
          </DialogFooter>
        </form>

        {blockedTransition && completedCount === 3 && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2Icon className="size-4 text-primary" />
            All requirements are filled in. Confirm the transition again to retry.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
