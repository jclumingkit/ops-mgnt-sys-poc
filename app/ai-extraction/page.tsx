import { AppSidebar } from "@/components/app-sidebar"
import { AIExtractionWorkspace } from "@/components/ai-extraction/AIExtractionWorkspace"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function AIExtractionPage() {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 48)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader title="AI extraction" />
        <AIExtractionWorkspace />
      </SidebarInset>
    </SidebarProvider>
  )
}
