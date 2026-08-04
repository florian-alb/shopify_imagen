import { AlertCircle, CheckCircle2, ChevronRight, CircleDashed } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { StateBadge } from "@/components/page"
import { cn } from "@/lib/utils"

import { attributeLabels } from "../constants"

type Diagnostic = {
  status: "ready" | "partial" | "blocked"
  googleAppStatus: "unverified"
  checkedAt: number
  attributes: Array<{
    attribute: "google_product_category" | "gender" | "age_group"
    status: "ready" | "missing" | "ambiguous" | "incompatible"
    coordinate: {
      namespace: string
      key: string
      type: string
      ownerType: "PRODUCT" | "PRODUCTVARIANT"
    } | null
    message: string
  }>
}

export function GoogleFeedDiagnosticBar({
  diagnostic,
  busy,
  onCheck,
}: {
  diagnostic: Diagnostic | null | undefined
  busy: boolean
  onCheck: () => void
}) {
  const readyCount =
    diagnostic?.attributes.filter((attribute) => attribute.status === "ready").length ?? 0
  const tone =
    diagnostic?.status === "ready"
      ? "success"
      : diagnostic?.status === "partial"
        ? "warning"
        : "danger"
  const Icon =
    diagnostic?.status === "ready"
      ? CheckCircle2
      : diagnostic
        ? AlertCircle
        : CircleDashed

  return (
    <div
      className={cn(
        "mb-4 flex min-h-11 flex-wrap items-center gap-2 border-y px-1 py-2 text-sm",
        diagnostic?.status === "blocked" && "text-destructive",
      )}
      role="status"
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="font-medium">
        {diagnostic
          ? `${readyCount}/3 attributs valides`
          : "Diagnostic Shopify non effectué"}
      </span>
      {diagnostic ? (
        <>
          <span className="text-muted-foreground" aria-hidden="true">·</span>
          <StateBadge state={tone}>
            {diagnostic.status === "ready"
              ? "Prêt"
              : diagnostic.status === "partial"
                ? "Partiellement prêt"
                : "Bloqué"}
          </StateBadge>
          <span className="text-xs text-muted-foreground">
            Vérifié {new Date(diagnostic.checkedAt).toLocaleString("fr-FR")}
          </span>
        </>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        {diagnostic ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                Voir le diagnostic
                <ChevronRight data-icon="inline-end" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[min(28rem,calc(100vw-2rem))] border border-border p-0"
            >
              <div className="border-b p-4">
                <p className="font-medium">Définitions Shopify</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Google & YouTube n’est pas déduit. Les définitions et leurs droits
                  sont la source de vérité.
                </p>
              </div>
              <div className="divide-y">
                {diagnostic.attributes.map((attribute) => (
                  <div key={attribute.attribute} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">
                        {attributeLabels[attribute.attribute]}
                      </p>
                      <StateBadge state={attribute.status === "ready" ? "success" : "danger"}>
                        {attribute.status === "ready" ? "Valide" : "À corriger"}
                      </StateBadge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {attribute.message}
                    </p>
                    {attribute.coordinate ? (
                      <code className="mt-2 block break-all text-xs">
                        {attribute.coordinate.namespace}.{attribute.coordinate.key} · {attribute.coordinate.type} · {attribute.coordinate.ownerType}
                      </code>
                    ) : null}
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCheck}>
          {busy ? "Vérification…" : diagnostic ? "Revérifier" : "Diagnostiquer"}
        </Button>
      </div>
    </div>
  )
}
