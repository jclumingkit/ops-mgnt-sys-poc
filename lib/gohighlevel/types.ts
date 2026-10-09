export type MockLead = {
  id: string
  source: "gohighlevel"
  sequence: number
  createdAt: string
  status: "new_lead"
  contact: {
    name: string
    email: string
    phone: string
  }
  payer: string
}

export type LeadFeedEvent = {
  type: "snapshot" | "lead.created"
  source: "gohighlevel"
  emittedAt: string
  leads: MockLead[]
  lead?: MockLead
}
