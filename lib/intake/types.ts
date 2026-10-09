import type { IntakeStatus } from "./statuses"

export type { IntakeStatus } from "./statuses"

export type IntakeLead = {
  id: string
  source: "gohighlevel"
  sequence: number
  created_at: string
  display_name: string
  email: string
  phone: string
  payer: string
  status: IntakeStatus
  authorization_number: string
  approval_date: string
  diagnostic_report_uploaded: boolean
}

export type TransitionRequest = {
  status: IntakeStatus
  authorization_number?: string
  approval_date?: string
  diagnostic_report_uploaded?: boolean
}

export type GeneratorState = {
  running: boolean
  next_sequence: number
  lead_count: number
}

export type IntakeSnapshotEvent = {
  type: "snapshot"
  leads: IntakeLead[]
}

export type IntakeLeadCreatedEvent = {
  type: "lead_created"
  lead: IntakeLead
}

export type IntakeLeadUpdatedEvent = {
  type: "lead_updated"
  lead: IntakeLead
}

export type IntakeDemoResetEvent = {
  type: "demo_reset"
  leads: IntakeLead[]
  generator: GeneratorState
}

export type IntakeStreamEvent =
  | IntakeSnapshotEvent
  | IntakeLeadCreatedEvent
  | IntakeLeadUpdatedEvent
  | IntakeDemoResetEvent
