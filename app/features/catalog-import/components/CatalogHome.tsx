import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/convex";
import { PageHeader, pageContentClass } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TagLanguageSelect } from "./TagLanguageSelect";
import type { TagLanguage } from "../../../../convex/catalogue/tags";

type Summary = {
  id: string;
  origin: string;
  mode: string;
  topN?: number;
  status: string;
  complete: number;
  total: number;
  updatedAt: number;
};
const labels: Record<string, string> = {
  working: "En cours",
  tags: "Tags à valider",
  ready: "Disponible",
  partial: "Partiel",
  blocked: "À relancer",
};
export function CatalogHome() {
  const raw = useQuery(api.catalogues.list),
    rows: Summary[] = raw ? JSON.parse(raw) : [];
  const create = useMutation(api.catalogues.create),
    navigate = useNavigate();
  const [url, setUrl] = useState(""),
    [mode, setMode] = useState<"ALL" | "TOP_N">("ALL"),
    [n, setN] = useState("25"),
    [tagLanguage, setTagLanguage] = useState<TagLanguage>("en"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className={pageContentClass}>
      <PageHeader eyebrow="Catalogue" title="Imports">
        Récupérez le menu, les collections et les produits d’une boutique.
      </PageHeader>
      <form
        className="studio-panel max-w-3xl space-y-6 p-5 sm:p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (mode === "TOP_N" && !/^[1-9]\d*$/.test(n))
              throw new Error("Indiquez un entier strictement positif.");
            const id = await create({
              url,
              mode,
              tagLanguage,
              ...(mode === "TOP_N" ? { topN: Number(n) } : {}),
            });
            await navigate({
              to: "/catalog-import/$exportId",
              params: { exportId: id },
            });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Analyse impossible.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="grid gap-2 text-sm font-medium">
          Boutique source
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.site.com"
            required
            autoComplete="url"
          />
        </label>
        <div className="max-w-xs space-y-2">
          <TagLanguageSelect value={tagLanguage} onChange={setTagLanguage} disabled={busy} />
          <p className="text-sm text-muted-foreground">
            Modifiable pendant l’analyse et après la découverte. Le contenu des fiches conserve sa langue d’origine.
          </p>
        </div>
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-medium">
            Produits à récupérer
          </legend>
          <label className="flex items-center gap-3 text-sm">
            <input
              className="size-4 accent-primary"
              type="radio"
              name="catalogue-mode"
              checked={mode === "ALL"}
              onChange={() => setMode("ALL")}
            />
            Tout le catalogue
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-3 text-sm">
              <input
                className="size-4 accent-primary"
                type="radio"
                name="catalogue-mode"
                checked={mode === "TOP_N"}
                onChange={() => setMode("TOP_N")}
              />
              Les meilleures ventes
            </label>
            {mode === "TOP_N" && (
              <label className="flex items-center gap-2 text-sm">
                Nombre de produits
                <Input
                  className="w-24"
                  type="number"
                  min="1"
                  step="1"
                  value={n}
                  onChange={(e) => setN(e.target.value)}
                  required
                />
              </label>
            )}
          </div>
        </fieldset>
        <p className="text-sm text-muted-foreground">
          Le menu et toutes les collections sont conservés dans les deux modes.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button disabled={busy}>
          {busy ? "Lancement…" : "Analyser la boutique"}
          <ArrowRight className="size-4" />
        </Button>
      </form>
      <section className="mt-10 max-w-5xl">
        <h2 className="mb-4 text-lg font-semibold">Catalogues précédents</h2>
        {raw === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : !rows.length ? (
          <p className="text-sm text-muted-foreground">
            Vos catalogues apparaîtront ici après une première analyse.
          </p>
        ) : (
          <div className="studio-panel divide-y overflow-hidden">
            {rows.map((c) => (
              <Link
                key={c.id}
                to="/catalog-import/$exportId"
                params={{ exportId: c.id }}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div>
                  <p className="font-medium">{new URL(c.origin).hostname}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.mode === "ALL" ? "Tout le catalogue" : `Top ${c.topN}`} ·{" "}
                    {c.complete}/{c.total} fiches
                  </p>
                </div>
                <span className="text-sm">{labels[c.status]}</span>
                <time className="text-sm text-muted-foreground">
                  {new Date(c.updatedAt).toLocaleString("fr-FR")}
                </time>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
