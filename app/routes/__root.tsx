import { ConvexAuthProvider, useConvexAuth } from "@convex-dev/auth/react";
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
import { Boxes, ImageIcon, ListChecks, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
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
        <AuthShell>
          <Outlet />
        </AuthShell>
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
        <div className="rounded-lg border border-[var(--border)] bg-white px-5 py-4 text-sm text-[var(--muted)] shadow-sm">
          Checking session...
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      <DesktopNav />
      <div className="pb-20 md:ml-64 md:pb-0">{children}</div>
      <MobileNav />
    </div>
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
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[var(--border)] bg-white px-4 py-5 md:block">
      <Link to="/products" className="mb-6 block">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Shopify</div>
        <div className="text-xl font-semibold">Image Studio</div>
      </Link>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] [&.active]:bg-[var(--ink)] [&.active]:text-white"
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-[var(--border)] bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className="flex flex-col items-center gap-1 rounded-md px-2 py-2 text-[11px] font-medium text-[var(--muted)] [&.active]:bg-[var(--ink)] [&.active]:text-white"
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link to="/products" className="mt-4 inline-flex text-sm font-medium text-[var(--accent)]">
        Back to products
      </Link>
    </main>
  );
}
