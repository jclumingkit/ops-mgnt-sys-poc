import type { LeadFeedEvent, MockLead } from "./types"

const FIRST_THREE_INTERVAL_MS = 10_000
const FOLLOWING_INTERVAL_MS = 60_000

const leadProfiles = [
  { name: "Demo Lead 001", email: "lead001@example.test", phone: "+1 555 010 1001", payer: "BCBS" },
  { name: "Demo Lead 002", email: "lead002@example.test", phone: "+1 555 010 1002", payer: "Aetna" },
  { name: "Demo Lead 003", email: "lead003@example.test", phone: "+1 555 010 1003", payer: "UnitedHealthcare" },
  { name: "Demo Lead 004", email: "lead004@example.test", phone: "+1 555 010 1004", payer: "Cigna" },
  { name: "Demo Lead 005", email: "lead005@example.test", phone: "+1 555 010 1005", payer: "Humana" },
] as const

type LeadListener = (event: LeadFeedEvent) => void

type LeadGenerator = {
  start: () => void
  subscribe: (listener: LeadListener) => () => void
  getLeads: () => MockLead[]
}

type GeneratorGlobal = typeof globalThis & {
  __mockGoHighLevelLeadGenerator?: LeadGenerator
}

const createLeadGenerator = (): LeadGenerator => {
  let leads: MockLead[] = []
  let nextSequence = 1
  let started = false
  const listeners = new Set<LeadListener>()

  const getLeads = () => leads.map((lead) => ({ ...lead, contact: { ...lead.contact } }))

  const publish = (event: Omit<LeadFeedEvent, "emittedAt" | "leads">) => {
    const payload: LeadFeedEvent = {
      ...event,
      emittedAt: new Date().toISOString(),
      leads: getLeads(),
    }

    listeners.forEach((listener) => listener(payload))
  }

  const generateLead = () => {
    const sequence = nextSequence
    const profile = leadProfiles[(sequence - 1) % leadProfiles.length]
    const lead: MockLead = {
      id: `ghl-lead-${String(sequence).padStart(3, "0")}`,
      source: "gohighlevel",
      sequence,
      createdAt: new Date().toISOString(),
      status: "new_lead",
      contact: { ...profile },
      payer: profile.payer,
    }

    leads = [...leads, lead]
    nextSequence += 1
    publish({ type: "lead.created", source: "gohighlevel", lead })
  }

  const scheduleNextLead = () => {
    const delay = nextSequence <= 3 ? FIRST_THREE_INTERVAL_MS : FOLLOWING_INTERVAL_MS
    setTimeout(() => {
      generateLead()
      scheduleNextLead()
    }, delay)
  }

  const start = () => {
    if (started) {
      return
    }

    started = true
    generateLead()
    scheduleNextLead()
  }

  return {
    start,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getLeads,
  }
}

const globalGenerator = globalThis as GeneratorGlobal
const generator = globalGenerator.__mockGoHighLevelLeadGenerator ?? createLeadGenerator()

globalGenerator.__mockGoHighLevelLeadGenerator = generator

export const startMockLeadGenerator = () => generator.start()

export const subscribeToMockLeadGenerator = (listener: LeadListener) =>
  generator.subscribe(listener)

export const getMockLeads = () => generator.getLeads()
