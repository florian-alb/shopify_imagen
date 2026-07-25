import { ConvexAuthProvider } from "@convex-dev/auth/react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/app-shell/AuthGate";
import { NotFound } from "@/components/app-shell/NotFound";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import appCss from "../styles.css?url";

function getConvexUrl() {
  const url = import.meta.env.VITE_CONVEX_URL;

  if (!url) {
    throw new Error(
      "Missing VITE_CONVEX_URL. Set it in .env.local or your deployment environment.",
    );
  }

  return url;
}

const convex = new ConvexReactClient(getConvexUrl());

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
          <AuthGate>
            <Outlet />
          </AuthGate>
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
        <a href="#main-content" className="fixed left-4 top-4 z-50 -translate-y-[160%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground transition-transform duration-150 focus:translate-y-0">
          Aller au contenu
        </a>
        {children}
        <Toaster richColors closeButton />
        <Scripts />
      </body>
    </html>
  );
}
