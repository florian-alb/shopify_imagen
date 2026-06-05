import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { GenerationStatus } from "@/lib/status";

const statusClasses: Record<GenerationStatus, string> = {
  not_started: "border-border bg-muted text-muted-foreground",
  generating: "border-amber-200 bg-amber-50 text-amber-700",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pushed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  canceled: "border-red-200 bg-red-50 text-red-700",
  failed: "border-red-200 bg-red-50 text-red-700"
};

export function PageHeader({
  title,
  eyebrow,
  action,
  children
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="truncate text-2xl font-semibold sm:text-3xl">{title}</h1>
        {children}
      </div>
      {action}
    </header>
  );
}

export function StatusBadge({ status, label }: { status: GenerationStatus; label: string }) {
  return (
    <Badge variant="outline" className={statusClasses[status]}>
      {label}
    </Badge>
  );
}

export function StateBadge({
  children,
  state = "neutral"
}: {
  children: ReactNode;
  state?: "neutral" | "success" | "warning" | "danger";
}) {
  const className =
    state === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : state === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : state === "danger"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-border bg-muted/60 text-muted-foreground";
  return (
    <Badge variant="outline" className={className}>
      {children}
    </Badge>
  );
}

export function EmptyState({ title, body, loading = false }: { title: string; body: string; loading?: boolean }) {
  return (
    <Card className="min-h-48 justify-center rounded-lg">
      <CardContent className="mx-auto max-w-md text-center">
        {loading ? <Skeleton className="mx-auto mb-4 h-5 w-32" /> : null}
        <h2 className="text-base font-medium">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

export function BusyIcon({ busy }: { busy: boolean }) {
  return busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : null;
}
