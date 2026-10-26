import { useQuery } from "convex/react"
import type { ReactNode } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/convex"
import type { FeedView } from "../types"
import { GoogleFeedDataBoundary } from "./GoogleFeedDataBoundary"

const views = [
  { value: "review", label: "À vérifier" },
  { value: "ready", label: "Prêts à publier" },
  { value: "errors", label: "Erreurs Shopify" },
] as const

export function GoogleFeedWorkspaceViews({
  view,
  onChange,
  children,
}: {
  view: FeedView
  onChange: (value: FeedView) => void
  children: ReactNode
}) {
  return (
    <Tabs
      value={view}
      onValueChange={(value) => onChange(value as FeedView)}
      className="mb-0 min-w-0 gap-0"
    >
      <TabsList
        variant="line"
        aria-label="Vues du flux Google"
        className="h-auto! w-full! max-w-full flex-wrap justify-start gap-x-2 border-b p-0 sm:gap-x-6"
      >
        {views.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className="min-h-12 flex-none rounded-none px-1 py-3 text-xs after:bg-primary! data-[state=active]:text-primary! data-[state=active]:after:opacity-100 sm:text-sm"
          >
            {item.label}
            <span
              className={
                item.value === "errors"
                  ? "ml-1 rounded-full bg-danger-subtle px-2 py-0.5 text-xs tabular-nums text-destructive"
                  : "ml-1 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums"
              }
            >
              <GoogleFeedDataBoundary compact>
                <ViewCount view={item.value} />
              </GoogleFeedDataBoundary>
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={view} className="mt-0">
        {children}
      </TabsContent>
    </Tabs>
  )
}

function ViewCount({ view }: { view: FeedView }) {
  const result = useQuery(api.googleFeedWorkspace.countProducts, { view })
  return (
    <span title={result?.hasMore ? "Nombre minimum de produits" : "Produits"}>
      {result ? `${result.count}${result.hasMore ? "+" : ""}` : "…"}
    </span>
  )
}
