import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { phaseLabels } from "../../../../convex/catalogue/model";
import type { Catalogue } from "../types";

type CatalogWorkStatusProps = {
  c: Catalogue;
  error: string;
  busy: boolean;
  onRetry: () => void;
};

export function CatalogWorkStatus({
  c,
  error,
  busy,
  onRetry,
}: CatalogWorkStatusProps) {
  const work = c.work;
  const waiting = c.status === "working" && !!work?.retryAt;
  const canRetry =
    c.status === "working"
      ? waiting && !!c.error && !c.lease
      : c.status === "blocked" || !!c.resumeWork;
  const discovering =
    work?.kind === "discover" &&
    ["menu", "sitemap", "ranking", "members"].includes(c.phase);
  const collection = c.structure.collections[work?.collection ?? 0];

  return (
    <>
      {work && (
        <Alert className="mt-4" role="status">
          <AlertTitle>
            {phaseLabels[c.phase] ?? c.phase}
            {work.phase === "collect" && collection
              ? ` · ${collection.title}`
              : ""}
          </AlertTitle>
          <AlertDescription>
            <div>
              {discovering
                ? `${c.sourceCount} produits repérés · ${c.structure.collections.length} collections`
                : `${c.complete} / ${c.total || "…"} fiches complètes`}
              {c.failed ? ` · ${c.failed} en échec` : ""}
              {c.status === "blocked" && " · En attente de reprise"}
              {c.status !== "blocked" &&
                work.kind === "import" &&
                " · Catalogue verrouillé pendant l’import"}
            </div>
            {waiting && (
              <div>
                {c.lease ? (
                  "Nouvelle tentative en cours…"
                ) : (
                  <>
                    Reprise à{" "}
                    {new Date(work.retryAt!).toLocaleTimeString("fr-FR")}
                    {work.attempts ? ` · tentative ${work.attempts + 1}/3` : ""}
                  </>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
      {(error || c.error || canRetry) && (
        <div className="mt-3 flex items-center gap-3">
          {canRetry && (
            <Button variant="outline" disabled={busy} onClick={onRetry}>
              {busy ? "Relance…" : "Relancer"}
            </Button>
          )}
          {(error || c.error) && (
            <p
              role="alert"
              className="min-w-0 break-words text-sm text-destructive"
            >
              {error || c.error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
