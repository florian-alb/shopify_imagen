import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DesktopNav } from "./DesktopNav";
import { DesktopTopbar } from "./DesktopTopbar";
import { MobileTopbar } from "./MobileTopbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider className="min-h-screen bg-background text-foreground">
      <DesktopNav />
      <SidebarInset className="min-w-0 bg-transparent">
        <MobileTopbar />
        <DesktopTopbar />
        <main
          id="main-content"
          className="min-h-[calc(100dvh-4rem)] px-4 pb-4 max-md:min-h-[calc(100dvh-3.5rem)] max-md:px-0 max-md:pb-0"
        >
          <div className="min-h-[calc(100dvh-5rem)] overflow-clip rounded-xl border bg-background max-md:min-h-[calc(100dvh-3.5rem)] max-md:rounded-none max-md:border-x-0 max-md:border-b-0">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
