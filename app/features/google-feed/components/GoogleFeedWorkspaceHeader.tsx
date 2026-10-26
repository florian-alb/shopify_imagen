import { Link } from "@tanstack/react-router"
import { useAction, useQuery } from "convex/react"
import { ArrowLeft, MoreHorizontal, Settings2 } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { api } from "@/lib/convex"
import type { FeedSearch } from "../lib/workspace-search"
import { useGoogleFeedSync } from "../hooks/use-google-feed-sync"
import { GoogleFeedDiagnosticBar } from "./GoogleFeedDiagnosticBar"
import { GoogleFeedDataBoundary } from "./GoogleFeedDataBoundary"

export function GoogleFeedWorkspaceHeader({
  active,
  backSearch,
  children,
}: {
  active?: "rules" | "history"
  backSearch?: FeedSearch
  children?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {active ? (
          <Button asChild size="icon" variant="ghost">
            <Link
              to="/google-feed"
              search={backSearch ?? { view: "review" }}
              aria-label="Retour aux produits"
            >
              <ArrowLeft />
            </Link>
          </Button>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">
          {active === "rules" ? "Règles" : active === "history" ? "Historique" : "Flux Google"}
        </h1>
      </div>
      <nav aria-label="Flux Google" className="flex flex-wrap items-center gap-1">
        <Button asChild variant="ghost">
          <Link
            to="/google-feed/rules"
            search={{ returnTo: backSearch ? JSON.stringify(backSearch) : undefined }}
            aria-current={active === "rules" ? "page" : undefined}
          >
            Règles
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link
            to="/google-feed/history"
            search={{ returnTo: backSearch ? JSON.stringify(backSearch) : undefined }}
            aria-current={active === "history" ? "page" : undefined}
          >
            Historique
          </Link>
        </Button>
        {children}
        <GoogleFeedDataBoundary>
          <FeedTools />
        </GoogleFeedDataBoundary>
      </nav>
    </header>
  )
}

function FeedTools() {
  const config = useQuery(api.googleFeedWorkspace.configuration)
  const evaluate = useAction(api.googleFeedActions.evaluateRules)
  const diagnostic = useAction(api.googleFeedActions.runDiagnostic)
  const sync = useGoogleFeedSync()
  const [busy, setBusy] = useState(false)
  async function run(kind: "rules" | "diagnostic") {
    setBusy(true)
    try {
      if (kind === "rules") {
        const result = await evaluate({})
        toast.success(`${result.proposed} propositions préparées`)
      } else {
        await diagnostic({})
        toast.success("Diagnostic actualisé")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Configuration Shopify">
            <Settings2 />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(34rem,calc(100vw-2rem))]">
          <GoogleFeedDiagnosticBar
            diagnostic={config}
            busy={busy}
            onCheck={() => void run("diagnostic")}
          />
        </PopoverContent>
      </Popover>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Actions du flux Google">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={busy || sync.busy} onSelect={() => void run("rules")}>
            Analyser les règles
          </DropdownMenuItem>
          <DropdownMenuItem disabled={busy || sync.busy} onSelect={() => void sync.sync()}>
            Synchroniser Shopify
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
