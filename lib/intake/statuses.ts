export const INTAKE_STATUSES = [
  "new_lead",
  "benefits_verification",
  "authorization_pending",
  "schedule_assessment",
] as const

export type IntakeStatus = (typeof INTAKE_STATUSES)[number]

export const INTAKE_STATUS_LABELS: Record<IntakeStatus, string> = {
  new_lead: "New Lead",
  benefits_verification: "Benefits Verification",
  authorization_pending: "Authorization Pending",
  schedule_assessment: "Schedule Assessment",
}

export const NEXT_INTAKE_STATUS: Partial<Record<IntakeStatus, IntakeStatus>> = {
  new_lead: "benefits_verification",
  benefits_verification: "authorization_pending",
  authorization_pending: "schedule_assessment",
}

export const isIntakeStatus = (value: unknown): value is IntakeStatus =>
  typeof value === "string" && INTAKE_STATUSES.includes(value as IntakeStatus)

export const getNextIntakeStatus = (status: IntakeStatus) =>
  NEXT_INTAKE_STATUS[status]
