import {
  ConvexAuthProvider,
  useAuthActions,
  useConvexAuth,
} from "@convex-dev/auth/react";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { ConvexReactClient, useMutation, useQuery } from "convex/react";
import {
  Boxes,
  ChevronDown,
  CircleGauge,
  ImageIcon,
  ListChecks,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Settings,
  Store,
  Sun,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import appCss from "../styles.css?url";

const convexUrl =
  import.meta.env.VITE_CONVEX_URL || "https://placeholder.convex.cloud";
const convex = new ConvexReactClient(convexUrl);
const themeStorageKey = "image-studio-theme";

type ThemeMode = "light" | "dark";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Image Studio" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => <NotFound />,
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
    <html lang="fr" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Aller au contenu
        </a>
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
    } else if (!auth.isLoading && auth.isAuthenticated && isLogin) {
      void navigate({ to: "/products" });
    }
  }, [auth.isAuthenticated, auth.isLoading, isLogin, location.href, navigate]);

  if (isLogin) return <>{children}</>;

  if (auth.isLoading || !auth.isAuthenticated) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-4">
        <Card size="sm" className="rounded-lg border-white/10 bg-card/80">
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            Verification de la session
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <SidebarProvider className="min-h-screen bg-[var(--surface)] text-foreground">
      <DesktopNav />
      <SidebarInset className="min-w-0 bg-transparent">
        <MobileTopbar />
        <Topbar />
        <main id="main-content" className="studio-shell">
          <div className="studio-panel">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

const navGroups = [
  {
    label: "Navigation",
    items: [
      { to: "/products", label: "Produits", icon: Boxes },
      { to: "/jobs", label: "Generations", icon: ListChecks },
      { to: "/settings/prompts", label: "Prompts", icon: ImageIcon },
    ],
  },
] as const;

type ShopOption = {
  _id: Id<"shops"> | null;
  domain: string;
  name: string;
  storeHandle: string;
  isActive: boolean;
};

function ShopSwitcher({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const shops = useQuery(api.shops.list) as ShopOption[] | undefined;
  const setActiveShop = useMutation(api.shops.setActive);
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const activeShop = shops?.find((shop) => shop.isActive) ?? shops?.[0];

  if (shops === undefined) {
    return <div className="h-24 animate-pulse rounded-lg bg-white/5" />;
  }

  if (!shops.length || !activeShop) {
    return (
      <Button
        variant="outline"
        className="h-auto w-full justify-start gap-3 rounded-lg border-white/10 bg-white/[0.03] p-3"
        asChild
      >
        <Link to="/settings" onClick={onNavigate}>
          <ShopIcon />
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm font-medium">
              Connecter Shopify
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              Aucune boutique active
            </span>
          </span>
        </Link>
      </Button>
    );
  }

  const activeValue = activeShop._id ?? "env";
  const activeLabel = shopDisplayName(activeShop);

  async function changeShop(value: string) {
    if (value === "settings") {
      onNavigate?.();
      void navigate({ to: "/settings" });
      return;
    }
    if (value === "env" || value === activeValue) return;

    setSwitching(true);
    try {
      await setActiveShop({ shopId: value as Id<"shops"> });
      toast.success("Boutique active changee");
    } catch (error) {
      toast.error("Impossible de changer de boutique", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div
      className={
        compact
          ? "rounded-lg border border-white/10 bg-white/[0.03] p-3"
          : "rounded-lg border border-white/10 bg-white/[0.035] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <ShopIcon loading={switching} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{activeLabel}</p>
            <p className="truncate text-xs text-muted-foreground">
              {activeShop.domain ||
                activeShop.storeHandle ||
                `${shops.length} boutiques`}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          asChild
        >
          <Link
            to="/settings"
            onClick={onNavigate}
            aria-label="Parametres boutique"
          >
            <Settings className="size-4" />
          </Link>
        </Button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between border-white/10 bg-black/20"
          >
            {switching ? "Changement..." : "Changer"}
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Boutiques</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {shops.map((shop) => (
            <DropdownMenuItem
              key={shop._id ?? shop.domain}
              disabled={!shop._id || switching}
              onSelect={() =>
                shop._id ? void changeShop(shop._id) : undefined
              }
            >
              <span className="min-w-0">
                <span className="block truncate">{shopDisplayName(shop)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {shop.domain || shop.storeHandle}
                </span>
              </span>
              {shop._id === activeShop._id ? (
                <Badge variant="outline" className="ml-auto">
                  Active
                </Badge>
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void changeShop("settings")}>
            Gerer les boutiques
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ShopIcon({ loading = false }: { loading?: boolean }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20">
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Store className="size-4" />
      )}
    </span>
  );
}

function shopDisplayName(shop: ShopOption) {
  return shop.name || shop.storeHandle || shop.domain;
}

function AppLogo({ size = "md" }: { size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "size-7 rounded-md" : "size-10 rounded-lg";

  return (
    <img
      src="/app-logo.svg"
      alt=""
      aria-hidden="true"
      className={`shrink-0 ${sizeClass}`}
    />
  );
}

function DesktopNav() {
  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-white/10 bg-sidebar text-sidebar-foreground"
    >
      <SidebarHeader className="gap-5 px-4 pb-5 pt-6 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <div className="flex items-start justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <Link
            to="/products"
            className="flex min-w-0 items-center gap-3 group-data-[collapsible=icon]:hidden"
          >
            <AppLogo />
            <span className="min-w-0">
              <span className="mt-1 block whitespace-nowrap text-xl font-semibold">
                Image Studio
              </span>
            </span>
          </Link>
          <SidebarTrigger className="mt-0.5 shrink-0 text-muted-foreground" />
        </div>
        <div className="group-data-[collapsible=icon]:hidden">
          <ShopSwitcher />
        </div>
      </SidebarHeader>
      <SidebarContent className="px-3 group-data-[collapsible=icon]:px-0">
        {navGroups.map((group) => (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.label}
                        className="h-10 gap-3 rounded-lg text-muted-foreground transition data-[active=true]:bg-primary/15 data-[active=true]:text-primary hover:bg-white/5"
                      >
                        <Link
                          to={item.to}
                          activeProps={{ "data-active": true }}
                        >
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
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-3 px-3 pb-4 group-data-[collapsible=icon]:px-0">
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

function Topbar() {
  const location = useLocation();

  return (
    <header className="hidden h-16 items-center justify-between gap-4 px-5 md:flex">
      <div className="flex items-center gap-2 w-full justify-end">
        <Badge
          variant="outline"
          className="border-primary/25 bg-primary/10 text-primary"
        >
          <CircleGauge className="mr-1 size-3" />
          Cles API serveur
        </Badge>
        <Badge
          variant="outline"
          className="hidden border-white/10 bg-white/[0.03] tabular-nums lg:inline-flex"
        >
          Cout suivi par job
        </Badge>
        <ThemeToggle />
      </div>
    </header>
  );
}

function MobileTopbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-background/90 px-3 backdrop-blur md:hidden">
      <Link to="/products" className="flex items-center gap-2 font-medium">
        <AppLogo size="sm" />
        <span>Image Studio</span>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Ouvrir la navigation"
            >
              <Menu className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[19rem] border-white/10 bg-sidebar p-0"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-full flex-col gap-5 p-4">
              <div className="flex items-center gap-3">
                <AppLogo />
                <div>
                  <p className="mt-1 text-lg font-semibold">Image Studio</p>
                </div>
              </div>
              <ShopSwitcher compact onNavigate={() => setOpen(false)} />
              <nav className="grid gap-4">
                {navGroups.map((group) => (
                  <div key={group.label}>
                    <p className="mb-2 text-xs text-muted-foreground">
                      {group.label}
                    </p>
                    <div className="grid gap-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Button
                            key={item.to}
                            variant="ghost"
                            className="justify-start gap-3"
                            asChild
                          >
                            <Link to={item.to} onClick={() => setOpen(false)}>
                              <Icon className="size-4" />
                              {item.label}
                            </Link>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
              <div className="mt-auto">
                <LogoutButton />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(themeStorageKey);
    const initialTheme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(themeStorageKey, nextTheme);
  }

  const label =
    theme === "dark" ? "Passer au theme clair" : "Passer au theme sombre";

  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
    >
      {theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  );
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
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
        tooltip="Deconnexion"
        className="h-10 gap-3 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        disabled={signingOut}
        onClick={() => void logout()}
      >
        <Avatar size="sm" className="rounded-md">
          <AvatarFallback className="rounded-md">
            <UserRound className="size-3.5" />
          </AvatarFallback>
        </Avatar>
        <span>{signingOut ? "Deconnexion..." : "Compte"}</span>
        <LogOut className="ml-auto size-4" />
      </SidebarMenuButton>
    );
  }

  return (
    <Button
      variant="outline"
      className="w-full justify-start gap-3"
      disabled={signingOut}
      onClick={() => void logout()}
    >
      <LogOut className="size-4" />
      {signingOut ? "Deconnexion..." : "Se deconnecter"}
    </Button>
  );
}

function NotFound() {
  return (
    <main className="mx-auto grid min-h-screen max-w-3xl place-items-center px-4 py-8">
      <Card className="w-full border-white/10 bg-card/80">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">404</p>
          <h1 className="mt-2 text-2xl font-semibold">Page introuvable</h1>
          <Button variant="outline" className="mt-5" asChild>
            <Link to="/products">Retour aux produits</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
