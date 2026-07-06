import { useConvexAuth } from "@convex-dev/auth/react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "./AppShell";
import { LogoutButton } from "./LogoutButton";

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useConvexAuth();
  const access = useQuery(api.users.currentAccess);
  const location = useLocation();
  const navigate = useNavigate();
  const isLogin = location.pathname === "/login";

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && !isLogin) {
      void navigate({ to: "/login", search: { redirect: location.href } });
    } else if (
      !auth.isLoading &&
      auth.isAuthenticated &&
      access?.isApproved &&
      isLogin
    ) {
      void navigate({ to: "/products" });
    }
  }, [
    access?.isApproved,
    auth.isAuthenticated,
    auth.isLoading,
    isLogin,
    location.href,
    navigate,
  ]);

  if (isLogin) return <>{children}</>;

  if (auth.isLoading || !auth.isAuthenticated || access === undefined) {
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

  if (!access?.isApproved) {
    return <AccessBlocked status={access?.approvalStatus} />;
  }

  return <AppShell>{children}</AppShell>;
}

function AccessBlocked({ status }: { status?: string }) {
  const rejected = status === "rejected";

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-4">
      <Card className="w-full max-w-md rounded-lg">
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {rejected ? "Compte non autorise" : "Compte en attente"}
            </p>
            <p className="text-sm text-muted-foreground">
              {rejected
                ? "Ce compte n'a pas acces a l'application."
                : "Un admin doit approuver ce compte dans le backoffice Convex avant l'acces a l'application."}
            </p>
          </div>
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  );
}
