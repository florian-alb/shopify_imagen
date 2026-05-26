import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ImageIcon, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/products"
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
        flow: isFirstUser ? "signUp" : "signIn"
      });
      await navigate({ to: redirect || "/products" });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : String(loginError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-4 py-10">
      <form onSubmit={submit} className="panel w-full max-w-md p-5 md:p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-md bg-[var(--ink)] text-white">
            <ImageIcon size={22} />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Shopify</div>
            <h1 className="text-xl font-semibold">Image Studio</h1>
          </div>
        </div>

        <div className="mb-5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
          {isFirstUser ? "Create the first admin account for this deployment." : "Sign in to continue."}
        </div>

        <div className="space-y-3">
          {isFirstUser ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Name</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
            </label>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isFirstUser ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </label>
        </div>

        {error ? <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{error}</div> : null}

        <Button className="mt-5 w-full" loading={submitting || hasUsers === undefined}>
          <LockKeyhole size={16} />
          {isFirstUser ? "Create admin" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
