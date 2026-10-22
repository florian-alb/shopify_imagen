import { AlertCircle, CheckCircle2, Send } from "lucide-react";
import { BusyIcon } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { JobImagePublishRun } from "../hooks/useJobImagePublish";

export function JobPublishProgressCard({ run }: { run: JobImagePublishRun | null | undefined }) {
  if (!run) return null;

  const running = run.status === "running";
  const hasErrors = run.status === "failed" || run.failedProducts > 0;
  const progress = run.totalProducts
    ? (run.processedProducts / run.totalProducts) * 100
    : 0;

  return (
    <Card className="mb-5">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium" role="status">
              {running ? <BusyIcon busy /> : hasErrors ? (
                <AlertCircle className="size-4 text-destructive" />
              ) : <CheckCircle2 className="size-4 text-emerald-600" />}
              {running ? "Publication Shopify en arrière-plan" : hasErrors
                ? "Publication terminée avec des erreurs"
                : "Publication Shopify terminée"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {running
                ? "Vous pouvez quitter cette page. La progression reste enregistrée ici."
                : `${run.pushedImages} images sur ${run.totalImages} publiées sur Shopify.`}
            </p>
          </div>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Send className="size-3.5" />
            {run.processedProducts} / {run.totalProducts} produits traités
          </span>
        </div>
        <Progress value={progress} aria-label="Progression de la publication Shopify" />
        {run.failedProducts > 0 ? (
          <p className="text-xs text-destructive" role="status">
            {run.failedProducts} produit{run.failedProducts === 1 ? "" : "s"} en échec.
            {running ? " Le traitement des autres produits continue." : " Les images approuvées restantes peuvent être publiées à nouveau."}
          </p>
        ) : null}
        {run.errors.length ? (
          <details className="text-xs">
            <summary className="cursor-pointer font-medium">Voir les erreurs de publication</summary>
            <ul className="mt-2 space-y-2 text-muted-foreground">
              {run.errors.map((failure, index) => (
                <li key={index}>
                  <span className="font-medium text-foreground">{failure.productTitle}: </span>
                  {failure.error}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
