import type {
  GeneratorState,
  IntakeLead,
  IntakeStreamEvent,
} from "./types"

const DEFAULT_FIRST_THREE_INTERVAL_MS = 10_000
const DEFAULT_FOLLOWING_INTERVAL_MS = 60_000

const leadProfiles = [
  { display_name: "Demo Lead 001", email: "lead001@example.test", phone: "+1 555 010 1001", payer: "BCBS" },
  { display_name: "Demo Lead 002", email: "lead002@example.test", phone: "+1 555 010 1002", payer: "Aetna" },
  { display_name: "Demo Lead 003", email: "lead003@example.test", phone: "+1 555 010 1003", payer: "UnitedHealthcare" },
  { display_name: "Demo Lead 004", email: "lead004@example.test", phone: "+1 555 010 1004", payer: "Cigna" },
  { display_name: "Demo Lead 005", email: "lead005@example.test", phone: "+1 555 010 1005", payer: "Humana" },
] as const

type IntakeListener = (event: IntakeStreamEvent) => void
type IntakeGenerator = {
  start: () => void
  stop: () => void
  reset: () => void
  listLeads: () => IntakeLead[]
  getLead: (leadId: string) => IntakeLead | undefined
  updateLead: (
    leadId: string,
    update: Partial<Pick<IntakeLead, "status" | "authorization_number" | "approval_date" | "diagnostic_report_uploaded">>,
  ) => IntakeLead | undefined
  subscribe: (listener: IntakeListener) => () => void
  getState: () => GeneratorState
}

type IntakeGlobal = typeof globalThis & {
  __intakeGenerator?: IntakeGenerator
}

const cloneLead = (lead: IntakeLead): IntakeLead => ({ ...lead })

const parseInterval = (name: string, fallback: number) => {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const createGenerator = (): IntakeGenerator => {
  let leads: IntakeLead[] = []
  let nextSequence = 1
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  const listeners = new Set<IntakeListener>()

  const listLeads = () => leads.map(cloneLead)

  const getState = (): GeneratorState => ({
    running,
    next_sequence: nextSequence,
    lead_count: leads.length,
  })

  const publish = (event: IntakeStreamEvent) => {
    listeners.forEach((listener) => listener(event))
  }

  const generateLead = () => {
    const sequence = nextSequence
    const profile = leadProfiles[(sequence - 1) % leadProfiles.length]
    const sequenceLabel = String(sequence).padStart(3, "0")
    const lead: IntakeLead = {
      id: `intake-lead-${sequenceLabel}`,
      source: "gohighlevel",
      sequence,
      created_at: new Date().toISOString(),
      ...profile,
      display_name: `Demo Lead ${sequenceLabel}`,
      email: `lead${sequenceLabel}@example.test`,
      phone: `+1 555 010 ${String(1000 + sequence).padStart(4, "0")}`,
      payer: sequence <= leadProfiles.length ? profile.payer : `${profile.payer} ${sequenceLabel}`,
      status: "new_lead",
      authorization_number: "",
      approval_date: "",
      diagnostic_report_uploaded: false,
    }

    leads = [...leads, lead]
    nextSequence += 1
    publish({ type: "lead_created", lead: cloneLead(lead) })
  }

  const scheduleNextLead = () => {
    const interval = nextSequence <= 3
      ? parseInterval("INTAKE_FIRST_THREE_INTERVAL_MS", DEFAULT_FIRST_THREE_INTERVAL_MS)
      : parseInterval("INTAKE_FOLLOWING_INTERVAL_MS", DEFAULT_FOLLOWING_INTERVAL_MS)

    timer = setTimeout(() => {
      timer = undefined
      if (!running) {
        return
      }
      generateLead()
      scheduleNextLead()
    }, interval)
  }

  const stop = () => {
    running = false
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const start = () => {
    if (running) {
      return
    }

    running = true
    if (leads.length === 0) {
      generateLead()
    }
    scheduleNextLead()
  }

  const reset = () => {
    stop()
    leads = []
    nextSequence = 1
    publish({
      type: "demo_reset",
      leads: [],
      generator: getState(),
    })
    start()
  }

  const updateLead = (
    leadId: string,
    update: Partial<Pick<IntakeLead, "status" | "authorization_number" | "approval_date" | "diagnostic_report_uploaded">>,
  ) => {
    const index = leads.findIndex((lead) => lead.id === leadId)
    if (index === -1) {
      return undefined
    }

    const updatedLead = { ...leads[index], ...update }
    leads = leads.map((lead, leadIndex) => (leadIndex === index ? updatedLead : lead))
    publish({ type: "lead_updated", lead: cloneLead(updatedLead) })
    return cloneLead(updatedLead)
  }

  return {
    start,
    stop,
    reset,
    listLeads,
    getLead: (leadId) => {
      const lead = leads.find((candidate) => candidate.id === leadId)
      return lead ? cloneLead(lead) : undefined
    },
    updateLead,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getState,
  }
}

const globalIntake = globalThis as IntakeGlobal
const generator = globalIntake.__intakeGenerator ?? createGenerator()
globalIntake.__intakeGenerator = generator

export const startIntakeGenerator = () => generator.start()
export const stopIntakeGenerator = () => generator.stop()
export const resetIntakeGenerator = () => generator.reset()
export const listIntakeLeads = () => generator.listLeads()
export const getIntakeLead = (leadId: string) => generator.getLead(leadId)
export const updateIntakeLead = (
  leadId: string,
  update: Partial<Pick<IntakeLead, "status" | "authorization_number" | "approval_date" | "diagnostic_report_uploaded">>,
) => generator.updateLead(leadId, update)
export const subscribeToIntake = (listener: IntakeListener) => generator.subscribe(listener)
export const getIntakeGeneratorState = () => generator.getState()
