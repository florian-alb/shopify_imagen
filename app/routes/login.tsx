import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ImageIcon, LockKeyhole, UserPlus } from "lucide-react";
import { useState } from "react";
import { BusyIcon } from "@/components/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../../convex/_generated/api";

type LoginMode = "signIn" | "signUp";

function safeRedirect(value: unknown) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : "/products";
}

function isApprovalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("approval");
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const hasUsers = useQuery(api.users.hasUsers);
  const [mode, setMode] = useState<LoginMode>("signIn");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFirstUser = hasUsers === false;
  const isSignUp = isFirstUser || mode === "signUp";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setRequestSent(false);

    try {
      const params: Record<string, string> = {
        email,
        password,
        flow: isSignUp ? "signUp" : "signIn",
      };
      if (isSignUp) params.name = name || email;
      if (isFirstUser) params.setupSecret = setupSecret;

      await signIn("password", params);

      if (isSignUp && !isFirstUser) {
        setRequestSent(true);
        setPassword("");
        return;
      }

      await navigate({ to: redirect });
    } catch (loginError) {
      if (isSignUp && !isFirstUser && isApprovalError(loginError)) {
        setRequestSent(true);
        setPassword("");
        return;
      }
      setError(
        loginError instanceof Error ? loginError.message : String(loginError),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode);
    setError(null);
    setRequestSent(false);
    setPassword("");
  }

  const description = requestSent
    ? "Demande envoyee. Un admin doit approuver ce compte avant la connexion."
    : isFirstUser
      ? "Cree le premier compte admin pour ce deploiement."
      : isSignUp
        ? "Cree ton compte. Il restera bloque tant qu'un admin ne l'a pas approuvé."
        : "Connecte-toi pour continuer.";

  return (
    <main className="grid min-h-screen place-items-center bg-(--surface)] px-4 py-10">
      <Card className="w-full max-w-md rounded-lg">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="grid size-11 place-items-center rounded-md bg-primary text-primary-foreground">
            <ImageIcon className="size-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Shopify
            </p>
            <h1 className="text-xl font-semibold">Image Studio</h1>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <Alert className="mb-5 bg-muted/50">
              <AlertDescription>{description}</AlertDescription>
            </Alert>
            <div className="space-y-4">
              {isSignUp ? (
                <div className="space-y-2">
                  <Label htmlFor="login-name">Nom</Label>
                  <Input
                    id="login-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                  />
                </div>
              ) : null}
              {isFirstUser ? (
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
                <Label htmlFor="login-password">Mot de passe</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
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
            <Button
              className="mt-5 w-full"
              type="submit"
              disabled={submitting || hasUsers === undefined}
            >
              <BusyIcon busy={submitting || hasUsers === undefined} />
              {!submitting && hasUsers !== undefined ? (
                isSignUp ? (
                  <UserPlus data-icon="inline-start" />
                ) : (
                  <LockKeyhole data-icon="inline-start" />
                )
              ) : null}
              {isFirstUser
                ? "Creer l'admin"
                : isSignUp
                  ? "Envoyer la demande"
                  : "Se connecter"}
            </Button>
            {!isFirstUser ? (
              <Button
                className="mt-3 w-full"
                type="button"
                variant="ghost"
                disabled={submitting || hasUsers === undefined}
                onClick={() => switchMode(isSignUp ? "signIn" : "signUp")}
              >
                {isSignUp ? "J'ai deja un compte" : "Demander un acces"}
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
