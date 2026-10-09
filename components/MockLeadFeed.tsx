"use client"

import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { LeadFeedEvent, MockLead } from "@/lib/gohighlevel/types"

type FeedState = LeadFeedEvent | {
  type: "connecting"
  source: "gohighlevel"
  emittedAt: null
  leads: MockLead[]
}

const initialFeed: FeedState = {
  type: "connecting",
  source: "gohighlevel",
  emittedAt: null,
  leads: [],
}

export function MockLeadFeed() {
  const [feed, setFeed] = useState<FeedState>(initialFeed)
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "reconnecting">("connecting")

  useEffect(() => {
    const source = new EventSource("/api/gohighlevel/leads")

    source.onopen = () => setConnectionState("connected")
    source.onmessage = (message) => {
      try {
        setFeed(JSON.parse(message.data) as LeadFeedEvent)
        setConnectionState("connected")
      } catch {
        setConnectionState("reconnecting")
      }
    }
    source.onerror = () => setConnectionState("reconnecting")

    return () => source.close()
  }, [])

  const statusLabel = {
    connecting: "Connecting",
    connected: "Live",
    reconnecting: "Reconnecting",
  }[connectionState]

  return (
    <Card className="mx-4 lg:mx-6">
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>GoHighLevel Lead Feed</CardTitle>
            <CardDescription>
              Mock leads arrive automatically through a server-sent event stream.
            </CardDescription>
          </div>
          <Badge variant={connectionState === "connected" ? "default" : "outline"}>
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <pre className="max-h-128 overflow-auto rounded-lg bg-muted/60 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {JSON.stringify(feed, null, 2)}
        </pre>
      </CardContent>
    </Card>
  )
}
