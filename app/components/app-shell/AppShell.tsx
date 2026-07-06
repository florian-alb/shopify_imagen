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
          className="min-h-[calc(100dvh-4rem)] bg-background max-md:min-h-[calc(100dvh-3.5rem)]"
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
