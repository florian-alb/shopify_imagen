import { AlertCircle, Check, LoaderCircle } from "lucide-react"
import { StateBadge } from "@/components/page"
import { Button } from "@/components/ui/button"
import { statusLabels } from "../lib/labels"

export function OperationBadge({ status }: { status: string }) {
  return (
    <StateBadge
      state={
        status === "completed"
          ? "success"
          : ["partial", "interrupted"].includes(status)
            ? "warning"
            : "neutral"
      }
    >
      {statusLabels[status] ?? status}
    </StateBadge>
  )
}
export function CatalogError({
  message,
  retry,
}: {
  message: string
  retry?: () => void
}) {
  return (
    <div
      role="alert"
      className="my-4 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
    >
      <AlertCircle className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 break-words">{message}</p>
      {retry && (
        <Button variant="outline" onClick={retry}>
          Réessayer
        </Button>
      )}
    </div>
  )
}
export function SourceStatus({
  complete,
  label,
}: {
  complete: boolean
  label: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${complete ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}
    >
      {complete ? (
        <Check className="size-3" />
      ) : (
        <AlertCircle className="size-3" />
      )}
      {label}
    </span>
  )
}
export function Working({ label = "Chargement…" }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 py-6 text-sm">
      <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
      {label}
    </p>
  )
}
