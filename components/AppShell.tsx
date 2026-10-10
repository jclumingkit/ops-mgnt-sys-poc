import type { CSSProperties, ReactNode } from "react"

import { AppSidebar } from "@/components/AppSidebar"
import { SiteHeader } from "@/components/SiteHeader"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const AppShell = ({ children, title }: { children: ReactNode; title: string }) => (
  <SidebarProvider
    style={{ "--sidebar-width": "15rem", "--header-height": "4rem" } as CSSProperties}
  >
    <AppSidebar />
    <SidebarInset>
      <SiteHeader title={title} />
      {children}
    </SidebarInset>
  </SidebarProvider>
)
