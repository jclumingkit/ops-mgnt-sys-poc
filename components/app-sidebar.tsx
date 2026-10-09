"use client"

import * as React from "react"

import { ClockOutWorkflow } from "@/components/clock-out/ClockOutWorkflow"
import { NavSecondary } from "@/components/nav-secondary"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Clock3Icon, CommandIcon, SparklesIcon, RadioIcon } from "lucide-react"

const data = {
  nav: [
    {
      title: "Lead Feed",
      url: "/",
      icon: <RadioIcon />,
    },
    {
      title: "AI extraction",
      url: "/ai-extraction",
      icon: <SparklesIcon />,
    },
    {
      title: "Clock Out",
      url: "#",
      icon: <Clock3Icon />,
    },
  ],
}
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [clockOutOpen, setClockOutOpen] = React.useState(false)
  const navItems = data.nav.map((item) =>
    item.title === "Clock Out"
      ? { ...item, onClick: () => setClockOutOpen(true) }
      : item,
  )

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<a href="#" />}
            >
              <CommandIcon className="size-5!" />
              <span className="text-base font-semibold">Acme Inc.</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavSecondary items={navItems} />
      </SidebarContent>
      <ClockOutWorkflow open={clockOutOpen} onOpenChange={setClockOutOpen} />
    </Sidebar>
  )
}
