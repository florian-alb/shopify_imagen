import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { pageContentClass } from "@/components/page";
import { api } from "@/lib/convex";
import type { FeedSearch } from "../lib/workspace-search";
import { GoogleFeedDataBoundary } from "./GoogleFeedDataBoundary";
import { GoogleFeedWorkspaceResults } from "./GoogleFeedWorkspaceResults";
import { GoogleFeedPublishButton } from "./GoogleFeedPublishButton";
import { GoogleFeedWorkspaceHeader } from "./GoogleFeedWorkspaceHeader";
import { GoogleFeedWorkspaceViews } from "./GoogleFeedWorkspaceViews";

export function GoogleFeedWorkspacePage({ search }: { search: FeedSearch }) {
  const navigate = useNavigate();
  function update(patch: Partial<FeedSearch>, replace = false) {
    void navigate({
      to: "/google-feed",
      search: { ...search, ...patch },
      replace,
    });
  }
  return (
    <main className={`${pageContentClass} bg-card`}>
      <GoogleFeedWorkspaceHeader backSearch={search}>
        {search.view === "ready" ? (
          <GoogleFeedDataBoundary compact>
            <GoogleFeedPublishButton
              onDone={(failed) =>
                update({
                  view: failed ? "errors" : "ready",
                  after: undefined,
                  trail: undefined,
                  product: undefined,
                })
              }
            />
          </GoogleFeedDataBoundary>
        ) : null}
      </GoogleFeedWorkspaceHeader>
      <GoogleFeedWorkspaceViews
        view={search.view}
        onChange={(view) =>
          update({
            view,
            product: undefined,
            after: undefined,
            trail: undefined,
          })
        }
      >
        <GoogleFeedDataBoundary compact>
          <FeedActivity />
        </GoogleFeedDataBoundary>
        <GoogleFeedDataBoundary
          key={search.view}
          resetKey={`${search.q ?? ""}:${search.after ?? ""}`}
        >
          <GoogleFeedWorkspaceResults search={search} update={update} />
        </GoogleFeedDataBoundary>
      </GoogleFeedWorkspaceViews>
    </main>
  );
}

function FeedActivity() {
  const run = useQuery(api.googleFeedWorkspace.activity);
  if (!run) return null;
  return (
    <p
      className="flex flex-wrap items-center gap-2 border-b py-3 text-sm"
      role="status"
    >
      <span>
        {run.kind === "publication"
          ? "Publication en cours"
          : "Analyse en cours"}
      </span>
      <span className="text-muted-foreground">
        · {run.succeeded} réussies{run.failed ? ` · ${run.failed} erreurs` : ""}
      </span>
      <Link
        to="/google-feed/history"
        className="ml-auto text-primary underline-offset-4 hover:underline"
      >
        Historique
      </Link>
    </p>
  );
}
