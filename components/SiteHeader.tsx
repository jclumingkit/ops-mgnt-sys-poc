import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export const SiteHeader = ({ title }: { title: string }) => {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center border-b bg-card">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-8">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <span className="text-sm font-medium">{title}</span>
        <span className="ml-auto flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          Demo environment
        </span>
      </div>
    </header>
  )
}
