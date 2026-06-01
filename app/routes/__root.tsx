import { ConvexAuthProvider, useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useLocation,
  useNavigate
} from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import { Boxes, ImageIcon, ListChecks, LogOut, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import appCss from "../styles.css?url";

const convexUrl = import.meta.env.VITE_CONVEX_URL || "https://placeholder.convex.cloud";
const convex = new ConvexReactClient(convexUrl);

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Shopify Image Studio" }
    ],
    links: [{ rel: "stylesheet", href: appCss }]
  }),
  component: RootComponent,
  notFoundComponent: () => <NotFound />
});

function RootComponent() {
  return (
    <RootDocument>
      <ConvexAuthProvider client={convex}>
        <TooltipProvider>
          <AuthShell>
            <Outlet />
          </AuthShell>
        </TooltipProvider>
      </ConvexAuthProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster richColors closeButton />
        <Scripts />
      </body>
    </html>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  const auth = useConvexAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isLogin = location.pathname === "/login";

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && !isLogin) {
      void navigate({ to: "/login", search: { redirect: location.href } });
    }
    if (!auth.isLoading && auth.isAuthenticated && isLogin) {
      void navigate({ to: "/products" });
    }
  }, [auth.isAuthenticated, auth.isLoading, isLogin, location.href, navigate]);

  if (isLogin) return <>{children}</>;

  if (auth.isLoading || !auth.isAuthenticated) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-4">
        <Card size="sm" className="rounded-lg">
          <CardContent className="text-sm text-muted-foreground">Checking session...</CardContent>
        </Card>
      </main>
    );
  }

  return (
    <SidebarProvider className="bg-[var(--surface)]">
      <DesktopNav />
      <div className="min-w-0 flex-1 pb-20 md:pb-0">{children}</div>
      <MobileNav />
    </SidebarProvider>
  );
}

const navItems = [
  { to: "/products", label: "Products", icon: Boxes },
  { to: "/jobs", label: "Jobs", icon: ListChecks },
  { to: "/settings/prompts", label: "Prompts", icon: ImageIcon },
  { to: "/settings", label: "Settings", icon: Settings }
] as const;

function DesktopNav() {
  return (
    <Sidebar collapsible="icon" className="border-r bg-white">
      <SidebarHeader className="px-4 pb-5 pt-7 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <div className="flex items-start justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <Link to="/products" className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Shopify</p>
            <p className="mt-1 whitespace-nowrap text-xl font-semibold">Image Studio</p>
          </Link>
          <SidebarTrigger className="mt-0.5 shrink-0 text-muted-foreground" />
        </div>
      </SidebarHeader>
      <SidebarContent className="px-3 group-data-[collapsible=icon]:px-0">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.label}
                      className="h-11 gap-3 text-muted-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                    >
                      <Link to={item.to} activeProps={{ "data-active": true }}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-3 pb-4 group-data-[collapsible=icon]:px-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <LogoutButton desktop />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-sm backdrop-blur md:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Button key={item.to} variant="ghost" className="h-12 px-1 text-muted-foreground" asChild>
            <Link to={item.to} className="flex flex-col gap-0.5 text-[11px] [&.active]:bg-muted [&.active]:text-foreground">
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          </Button>
        );
      })}
      <LogoutButton />
    </nav>
  );
}

function LogoutButton({ desktop = false }: { desktop?: boolean }) {
  const { signOut } = useAuthActions();
  const [signingOut, setSigningOut] = useState(false);

  async function logout() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  if (desktop) {
    return (
      <SidebarMenuButton
        tooltip="Log out"
        className="h-11 gap-3 text-muted-foreground hover:text-destructive"
        disabled={signingOut}
        onClick={() => void logout()}
      >
        <LogOut />
        <span>{signingOut ? "Logging out..." : "Log out"}</span>
      </SidebarMenuButton>
    );
  }

  return (
    <Button
      variant="ghost"
      className="h-12 px-1 text-muted-foreground hover:text-destructive"
      disabled={signingOut}
      onClick={() => void logout()}
    >
      <span className="flex flex-col items-center gap-0.5 text-[11px]">
        <LogOut className="size-4" />
        {signingOut ? "Logging out..." : "Log out"}
      </span>
    </Button>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Button variant="outline" className="mt-4" asChild>
        <Link to="/products">Back to products</Link>
      </Button>
    </main>
  );
}
