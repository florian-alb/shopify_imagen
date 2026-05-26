import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  children,
  variant = "primary",
  loading,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
}) {
  const variantClass =
    variant === "secondary" ? "btn-secondary" : variant === "danger" ? "btn-danger" : "btn-primary";
  return (
    <button className={`btn ${variantClass} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <Loader2 className="animate-spin" size={16} /> : null}
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "default"
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = tone === "default" ? "" : `badge-${tone}`;
  return <span className={`badge ${toneClass}`}>{children}</span>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel grid min-h-48 place-items-center px-6 py-10 text-center">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 max-w-md text-sm text-[var(--muted)]">{body}</p>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  eyebrow,
  action
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        {eyebrow ? <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}
