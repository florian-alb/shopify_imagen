import { Link } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { Eye, RefreshCw } from "lucide-react"
import type { ReactNode } from "react"

import { BusyIcon, PageHeader, pageContentClass } from "@/components/page"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/convex"

import { useGoogleFeedSync } from "../hooks/use-google-feed-sync"
import { GoogleFeedDiagnosticBar } from "./GoogleFeedDiagnosticBar"
import { GoogleFeedTabs, type GoogleFeedTab } from "./GoogleFeedTabs"

export function GoogleFeedPageFrame({
  active,
  children,
}: {
  active: GoogleFeedTab
  children: ReactNode
}) {
  const overview = useQuery(api.googleFeed.overview)
  const sync = useGoogleFeedSync()

  return (
    <main className={pageContentClass}>
      <PageHeader
        title="Flux Google"
        eyebrow={
          overview
            ? `${overview.productCount} produits · ${overview.variantCount} variantes`
            : "Catalogue Google Merchant Center"
        }
        action={
          <>
            <Button type="button" variant="outline" disabled={sync.busy} onClick={() => void sync.sync()}>
              <BusyIcon busy={sync.busy} />
              {!sync.busy ? <RefreshCw data-icon="inline-start" /> : null}
              Synchroniser
            </Button>
            {overview && overview.draftCount > 0 ? (
              <Button asChild>
                <Link to="/google-feed/preview" search={{ status: "all", page: 1 }}>
                  <Eye data-icon="inline-start" />
                  Prévisualiser {overview.draftCount}
                </Link>
              </Button>
            ) : null}
          </>
        }
      >
        Attributs Google, règles d’attribution et publication Shopify.
      </PageHeader>
      <GoogleFeedDiagnosticBar
        diagnostic={overview?.config}
        busy={sync.busy}
        onCheck={() => void sync.sync()}
      />
      <GoogleFeedTabs active={active} />
      {children}
    </main>
  )
}
