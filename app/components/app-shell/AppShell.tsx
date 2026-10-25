import type { CSSProperties, ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DesktopNav } from "./DesktopNav";
import { DesktopTopbar } from "./DesktopTopbar";
import { MobileTopbar } from "./MobileTopbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider className="min-h-screen bg-background text-foreground" style={{ "--sidebar-width": "15rem" } as CSSProperties}>
      <DesktopNav />
      <SidebarInset className="min-w-0 bg-transparent">
        <MobileTopbar />
        <DesktopTopbar />
        <div
          id="main-content"
          tabIndex={-1}
          className="min-h-[calc(100dvh-3.5rem)] bg-background outline-none"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
