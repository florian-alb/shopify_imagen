import { useState, type FormEvent, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  KeyRound,
  Maximize2,
} from "lucide-react";
import { toast } from "sonner";
import { BusyIcon } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME, SHOPIFY_ONBOARDING_SCOPES } from "../settingsData";
import type { ShopForm } from "../types";

export function ShopOnboarding({
  appOrigin,
  currentHandle,
  form,
  normalizedDomain,
  saving,
  step,
  onFieldChange,
  onResetForm,
  onStepChange,
  onSubmit,
}: {
  appOrigin: string;
  currentHandle: string;
  form: ShopForm;
  normalizedDomain: string;
  saving: boolean;
  step: number;
  onFieldChange: <K extends keyof ShopForm>(
    key: K,
    value: ShopForm[K],
  ) => void;
  onResetForm: () => void;
  onStepChange: (step: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const appUrl = appOrigin.replace(/\/$/, "");
  const devDashboardUrl = currentHandle
    ? `https://admin.shopify.com/store/${currentHandle}/settings/apps/development`
    : "https://admin.shopify.com/";
  const canContinue =
    step === 1
      ? Boolean(normalizedDomain)
      : step === 4
        ? Boolean(form.clientId.trim() && form.clientSecret.trim())
        : true;

  function nextStep() {
    if (!canContinue) return;
    onStepChange(Math.min(step + 1, 4));
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
            <KeyRound className="size-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold">
              Connecter une boutique Shopify
            </h3>
            <p className="text-sm text-muted-foreground">
              Assistant compact en quatre etapes.
            </p>
          </div>
        </div>
        <OnboardingProgress step={step} />
      </div>

      <div className="grid gap-4">
        <div className="min-w-0 rounded-lg border border-border bg-muted p-4">
          <p className="mb-4 text-xs font-medium text-muted-foreground">
            Etape {step} sur 4
          </p>
          {step === 1 ? (
            <StepOne
              form={form}
              normalizedDomain={normalizedDomain}
              onFieldChange={onFieldChange}
            />
          ) : step === 2 ? (
            <StepTwo appName={APP_NAME} dashboardUrl={devDashboardUrl} />
          ) : step === 3 ? (
            <StepThree appUrl={appUrl} />
          ) : (
            <StepFour
              form={form}
              normalizedDomain={normalizedDomain}
              onFieldChange={onFieldChange}
            />
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                step === 1 ? onResetForm() : onStepChange(step - 1)
              }
              disabled={saving}
            >
              {step > 1 ? <ChevronLeft data-icon="inline-start" /> : null}
              {step === 1 ? "Annuler" : "Retour"}
            </Button>
            {step < 4 ? (
              <Button type="button" onClick={nextStep} disabled={!canContinue}>
                Continuer
                <ChevronRight data-icon="inline-end" />
              </Button>
            ) : (
              <Button type="submit" disabled={!canContinue || saving}>
                <BusyIcon busy={saving} />
                {!saving ? <ExternalLink data-icon="inline-start" /> : null}
                Connecter la boutique
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="lg:hidden"
              onClick={() => setPreviewOpen(true)}
            >
              <Maximize2 data-icon="inline-start" />
              Apercu
            </Button>
          </div>
        </div>
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="border-border bg-card sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Apercu de l'etape {step}</DialogTitle>
          </DialogHeader>
          <div className="overflow-hidden rounded-lg bg-[#070b0d]">
            <OnboardingVisual step={step} large />
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function OnboardingProgress({ step }: { step: number }) {
  return (
    <div className="flex items-center overflow-x-auto">
      {[1, 2, 3, 4].map((item) => {
        const complete = item < step;
        const active = item === step;
        return (
          <div key={item} className="flex items-center">
            <span
              className={[
                "grid size-8 place-items-center rounded-full border text-xs font-medium transition-colors",
                complete || active
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground",
              ].join(" ")}
            >
              {complete ? <Check className="size-4" /> : item}
            </span>
            {item < 4 ? <span className="h-px w-8 bg-border sm:w-12" /> : null}
          </div>
        );
      })}
    </div>
  );
}

function StepOne({
  form,
  normalizedDomain,
  onFieldChange,
}: {
  form: ShopForm;
  normalizedDomain: string;
  onFieldChange: <K extends keyof ShopForm>(key: K, value: ShopForm[K]) => void;
}) {
  const showSuffix = !form.domain.includes(".");
  return (
    <div className="grid gap-4">
      <div>
        <h4 className="font-medium">Domaine Shopify</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Utilise le domaine principal en .myshopify.com.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <div>
          <Label htmlFor="shop-name">Nom interne</Label>
          <Input
            id="shop-name"
            className="mt-2 h-10"
            value={form.name}
            onChange={(event) => onFieldChange("name", event.target.value)}
            placeholder="Rideau Design"
          />
        </div>
        <div>
          <Label htmlFor="shop-domain">Domaine</Label>
          <div className="mt-2 flex min-h-10 items-center overflow-hidden rounded-lg border border-border bg-muted focus-within:ring-2 focus-within:ring-ring/50">
            <Input
              id="shop-domain"
              className="h-10 flex-1 border-0 shadow-none focus-visible:ring-0"
              value={form.domain}
              onChange={(event) => onFieldChange("domain", event.target.value)}
              placeholder="q8r4mz-2x"
              required
            />
            {showSuffix ? (
              <span className="shrink-0 px-3 text-sm text-muted-foreground">
                .myshopify.com
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-dashed border-border bg-muted px-3 py-2 font-mono text-sm">
        {normalizedDomain || "q8r4mz-2x.myshopify.com"}
      </div>
    </div>
  );
}

function StepTwo({
  appName,
  dashboardUrl,
}: {
  appName: string;
  dashboardUrl: string;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <h4 className="font-medium">Application Shopify personnalisée</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Ouvre les apps de développement puis crée une app avec ce nom.
        </p>
      </div>
      <div className="grid gap-2 text-sm text-muted-foreground">
        <InstructionLine index={1}>
          Ouvre les paramètres des apps de développement Shopify.
        </InstructionLine>
        <InstructionLine index={2}>
          Clique sur Developper des applications.
        </InstructionLine>
        <InstructionLine index={3}>
          Cree une nouvelle application personnalisee.
        </InstructionLine>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" asChild>
          <a href={dashboardUrl} target="_blank" rel="noreferrer">
            <ExternalLink data-icon="inline-start" />
            Ouvrir Shopify
          </a>
        </Button>
        <CopyValue label="Nom de l'application" value={appName} />
      </div>
    </div>
  );
}

function StepThree({ appUrl }: { appUrl: string }) {
  return (
    <div className="grid gap-4">
      <div>
        <h4 className="font-medium">Version et autorisations Shopify</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Shopify gère l’installation de l’application et la demande des
          autorisations publiées.
        </p>
      </div>
      <div className="grid gap-2 text-sm text-muted-foreground">
        <InstructionLine index={1}>
          Configure les scopes Admin API indiqués ci-dessous et publie une
          nouvelle version de l’application.
        </InstructionLine>
        <InstructionLine index={2}>
          Garde le flux d’installation géré par Shopify avec{" "}
          <code className="font-mono text-foreground">
            use_legacy_install_flow = false
          </code>
          .
        </InstructionLine>
        <InstructionLine index={3}>
          Après avoir enregistré les clés à l’étape suivante, utilise Accès
          Shopify dans le tableau pour vérifier et, si nécessaire, autoriser la
          boutique.
        </InstructionLine>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <CopyRow label="URL de l'application" value={appUrl} />
        <CopyRow
          label="Scopes Admin API à publier"
          value={SHOPIFY_ONBOARDING_SCOPES}
        />
      </div>
    </div>
  );
}

function StepFour({
  form,
  normalizedDomain,
  onFieldChange,
}: {
  form: ShopForm;
  normalizedDomain: string;
  onFieldChange: <K extends keyof ShopForm>(key: K, value: ShopForm[K]) => void;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <h4 className="font-medium">Clés et filtre catalogue</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Les clés sont envoyées à Convex et ne sont pas réaffichées après
          sauvegarde.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="shop-client-id">ID client</Label>
          <Input
            id="shop-client-id"
            className="mt-2 h-10"
            value={form.clientId}
            onChange={(event) => onFieldChange("clientId", event.target.value)}
            autoComplete="off"
            required
          />
        </div>
        <div>
          <Label htmlFor="shop-client-secret">Clé secrète</Label>
          <Input
            id="shop-client-secret"
            className="mt-2 h-10"
            type="password"
            value={form.clientSecret}
            onChange={(event) =>
              onFieldChange("clientSecret", event.target.value)
            }
            autoComplete="off"
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor="shop-product-query">Filtre produits Shopify</Label>
        <Input
          id="shop-product-query"
          className="mt-2 h-10 font-mono text-sm"
          value={form.productQuery}
          onChange={(event) =>
            onFieldChange("productQuery", event.target.value)
          }
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Boutique cible: {normalizedDomain || "domaine non renseigné"}
        </p>
      </div>
    </div>
  );
}

function InstructionLine({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr] gap-2">
      <span className="font-medium text-foreground">{index}.</span>
      <span>{children}</span>
    </div>
  );
}

function CopyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-sm">{value}</p>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-border p-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 break-words font-mono text-sm">{value}</p>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copie");
    } catch (error) {
      toast.error("Copie impossible", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      onClick={() => void copy()}
      aria-label="Copier"
    >
      <Copy className="size-4" />
    </Button>
  );
}

function OnboardingVisual({
  step,
  large = false,
}: {
  step: number;
  large?: boolean;
}) {
  return (
    <div
      className={large ? "aspect-[16/9] w-full p-5" : "absolute inset-0 p-4"}
    >
      <div className="grid h-full grid-cols-[72px_1fr] gap-4 rounded-lg bg-[#080d0f] text-white">
        <aside className="rounded-l-lg bg-[#101719] p-3 text-[9px] text-white/45">
          <div className="mb-5 h-4 w-14 rounded bg-white/10" />
          {["Domaines", "Apps", "Version", "Cles"].map((item, index) => (
            <div
              key={item}
              className={`mb-2 rounded px-2 py-1 ${
                index === step - 1
                  ? "bg-emerald-400/15 text-emerald-200"
                  : "bg-muted"
              }`}
            >
              {item}
            </div>
          ))}
        </aside>
        <section className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="h-3 w-28 rounded bg-white/20" />
              <div className="mt-2 h-2 w-20 rounded bg-white/10" />
            </div>
            <div className="h-6 w-16 rounded bg-white/10" />
          </div>
          {step === 1 ? (
            <VisualStepDomain />
          ) : step === 2 ? (
            <VisualStepCreate />
          ) : step === 3 ? (
            <VisualStepConfig />
          ) : (
            <VisualStepCredentials />
          )}
        </section>
      </div>
    </div>
  );
}

function VisualStepDomain() {
  return (
    <div className="grid gap-3">
      <div className="rounded bg-muted p-3">
        <div className="h-2 w-24 rounded bg-muted-foreground/30" />
        <div className="mt-3 h-8 rounded bg-emerald-400/10" />
      </div>
      <div className="rounded bg-muted p-3">
        <div className="h-2 w-20 rounded bg-muted-foreground/30" />
        <div className="mt-3 h-6 rounded bg-white/10" />
      </div>
    </div>
  );
}

function VisualStepCreate() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-3">
        <div className="h-2 w-24 rounded bg-cyan-100/50" />
        <div className="mt-3 h-8 rounded bg-cyan-100/10" />
        <div className="mt-3 h-6 w-28 rounded bg-primary" />
      </div>
      <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3">
        <div className="h-2 w-20 rounded bg-emerald-100/50" />
        <div className="mt-3 h-8 rounded bg-emerald-100/10" />
        <div className="mt-3 h-6 w-20 rounded bg-white/20" />
      </div>
    </div>
  );
}

function VisualStepConfig() {
  return (
    <div className="grid gap-3">
      <div className="rounded bg-emerald-400/10 p-3">
        <div className="h-2 w-28 rounded bg-emerald-100/50" />
        <div className="mt-3 h-7 rounded bg-white/10" />
      </div>
      <div className="rounded bg-muted p-3">
        <div className="h-2 w-20 rounded bg-muted-foreground/30" />
        <div className="mt-3 grid gap-2">
          <div className="h-5 rounded bg-white/10" />
          <div className="h-5 rounded bg-white/10" />
          <div className="h-5 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

function VisualStepCredentials() {
  return (
    <div className="grid gap-3">
      <div className="rounded bg-muted p-3">
        <div className="h-2 w-16 rounded bg-muted-foreground/30" />
        <div className="mt-3 h-8 rounded bg-emerald-400/10" />
      </div>
      <div className="rounded bg-muted p-3">
        <div className="h-2 w-24 rounded bg-muted-foreground/30" />
        <div className="mt-3 h-8 rounded bg-white/10" />
      </div>
    </div>
  );
}
