"use client"

import * as React from "react"

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
      title: "AI Extraction",
      url: "#",
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
        <NavSecondary items={data.nav} />
      </SidebarContent>
    </Sidebar>
  )
}
