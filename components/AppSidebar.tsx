"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"

import { ClockOutWorkflow } from "@/components/clock-out/ClockOutWorkflow"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Clock3Icon, LayersIcon, SparklesIcon, RadioIcon, ArrowUpRightIcon } from "lucide-react"

const navigation = [
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
]

export const AppSidebar = () => {
  const [clockOutOpen, setClockOutOpen] = useState(false)
  const pathname = usePathname()

  return (
    <Sidebar collapsible="offcanvas" className="border-r">
      <SidebarHeader className="px-5 py-6">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-auto gap-3 p-0 hover:bg-transparent"
              render={<Link href="/" />}
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <LayersIcon className="size-5!" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-semibold tracking-tight">Operations</span>
                <span className="text-xs font-normal text-muted-foreground">Management workspace</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-3">
          <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-widest">Workspace</SidebarGroupLabel>
          <SidebarMenu className="gap-1.5">
            {navigation.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  render={<Link href={item.url} />}
                  isActive={pathname === item.url || (item.url === "/" && pathname === "/dashboard")}
                  className="h-11 gap-3 rounded-lg px-3 data-active:bg-primary/8 data-active:text-primary"
                >
                  {item.icon}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setClockOutOpen(true)} className="h-11 gap-3 rounded-lg px-3">
                <Clock3Icon />
                <span>Clock Out</span>
                <ArrowUpRightIcon className="ml-auto size-3.5 text-muted-foreground" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">OP</span>
          <div>
            <p className="text-xs font-medium">Demo workspace</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Simulated data · PoC</p>
          </div>
        </div>
      </SidebarFooter>
      <ClockOutWorkflow open={clockOutOpen} onOpenChange={setClockOutOpen} />
    </Sidebar>
  )
}
