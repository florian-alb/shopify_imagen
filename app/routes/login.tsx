import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ImageIcon, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { BusyIcon } from "@/components/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../../convex/_generated/api";

function safeRedirect(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/products";
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect)
  }),
  component: LoginPage
});

function LoginPage() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const hasUsers = useQuery(api.users.hasUsers);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFirstUser = hasUsers === false;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn("password", {
        email,
        name: name || email,
        password,
        setupSecret,
        flow: isFirstUser ? "signUp" : "signIn"
      });
      await navigate({ to: redirect });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : String(loginError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-4 py-10">
      <Card className="w-full max-w-md rounded-lg">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="grid size-11 place-items-center rounded-md bg-primary text-primary-foreground">
            <ImageIcon className="size-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Shopify</p>
            <h1 className="text-xl font-semibold">Image Studio</h1>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <Alert className="mb-5 bg-muted/50">
              <AlertDescription>
                {isFirstUser ? "Create the first admin account for this deployment." : "Sign in to continue."}
              </AlertDescription>
            </Alert>
            <div className="space-y-4">
              {isFirstUser ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="login-name">Name</Label>
                    <Input id="login-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-setup-secret">Setup secret</Label>
                    <Input
                      id="login-setup-secret"
                      type="password"
                      value={setupSecret}
                      onChange={(event) => setSetupSecret(event.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                </>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isFirstUser ? "new-password" : "current-password"}
                  minLength={8}
                  required
                />
              </div>
            </div>
            {error ? (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button className="mt-5 w-full" type="submit" disabled={submitting || hasUsers === undefined}>
              <BusyIcon busy={submitting || hasUsers === undefined} />
              {!submitting && hasUsers !== undefined ? <LockKeyhole data-icon="inline-start" /> : null}
              {isFirstUser ? "Create admin" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
