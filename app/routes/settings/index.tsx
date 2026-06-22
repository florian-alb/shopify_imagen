import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Maximize2,
  Plus,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BusyIcon, PageHeader, StateBadge } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
});

const APP_NAME = "Shopify Image Studio";
const DEFAULT_PRODUCT_QUERY = "status:active,draft,archived";
const ADMIN_SCOPES = "read_products,write_products";

const settingFields = [
  "OPENAI_IMAGE_MODEL",
  "OPENAI_IMAGE_SIZE",
  "OPENAI_IMAGE_QUALITY",
  "OPENAI_IMAGE_OUTPUT_FORMAT",
  "OPENAI_IMAGE_REQUESTS_PER_MINUTE",
  "GEMINI_IMAGE_MODEL",
  "GEMINI_IMAGE_SIZE",
  "GEMINI_IMAGE_ASPECT_RATIO",
  "GEMINI_IMAGE_REQUESTS_PER_MINUTE",
  "VIBE_MODEL",
  "GENERATION_CONCURRENCY",
] as const;

type ShopRow = {
  _id: Id<"shops"> | null;
  domain: string;
  storeHandle: string;
  name: string;
  productQuery: string;
  hasClientCredentials: boolean;
  isActive: boolean;
  source: "database" | "environment";
};

type ShopForm = {
  name: string;
  domain: string;
  clientId: string;
  clientSecret: string;
  productQuery: string;
};

function normalizeShopDomain(value: string) {
  const cleaned = value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  if (!cleaned) return "";
  return cleaned.includes(".") ? cleaned : `${cleaned}.myshopify.com`;
}

function shopHandle(value: string) {
  return normalizeShopDomain(value).replace(/\.myshopify\.com$/, "");
}

function SettingsPage() {
  const settings = useQuery(api.settings.list);
  const shops = useQuery(api.shops.list) as ShopRow[] | undefined;
  const setSetting = useMutation(api.settings.set);
  const connectShop = useMutation(api.shops.connect);
  const setActiveShop = useMutation(api.shops.setActive);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [appOrigin, setAppOrigin] = useState("https://your-app-domain.com");
  const [shopForm, setShopForm] = useState<ShopForm>({
    name: "",
    domain: "",
    clientId: "",
    clientSecret: "",
    productQuery: DEFAULT_PRODUCT_QUERY,
  });

  useEffect(() => {
    setAppOrigin(window.location.origin);
  }, []);

  const normalizedDomain = useMemo(
    () => normalizeShopDomain(shopForm.domain),
    [shopForm.domain],
  );
  const currentHandle = useMemo(
    () => shopHandle(shopForm.domain),
    [shopForm.domain],
  );

  async function save(key: string) {
    setSaving(key);
    const raw = drafts[key] ?? String(settings?.[key] ?? "");
    const value = /^\d+$/.test(raw) ? Number(raw) : raw;
    try {
      await setSetting({ key, value });
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      toast.success(`${key} saved`);
    } catch (error) {
      toast.error("Setting not saved", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(null);
    }
  }

  async function switchSetting(key: string, value: string) {
    setSaving(key);
    try {
      await setSetting({ key, value });
      toast.success(`${key} saved`);
    } catch (error) {
      toast.error("Setting not saved", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(null);
    }
  }

  async function submitShop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const domain = normalizeShopDomain(shopForm.domain);
    if (!domain) {
      setOnboardingStep(1);
      toast.error("Renseigne le domaine de la boutique.");
      return;
    }
    if (!shopForm.clientId.trim() || !shopForm.clientSecret.trim()) {
      setOnboardingStep(4);
      toast.error("Colle l'ID client et la clé secrète.");
      return;
    }

    setSaving("shop-connect");
    try {
      await connectShop({
        ...shopForm,
        name: shopForm.name.trim() || shopHandle(domain),
        domain,
        productQuery: shopForm.productQuery.trim() || DEFAULT_PRODUCT_QUERY,
      });
      setShopForm({
        name: "",
        domain: "",
        clientId: "",
        clientSecret: "",
        productQuery: DEFAULT_PRODUCT_QUERY,
      });
      setOnboardingStep(1);
      toast.success("Boutique connectée");
    } catch (error) {
      toast.error("Connexion impossible", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(null);
    }
  }

  async function useShop(shopId: Id<"shops">) {
    setSaving(shopId);
    try {
      await setActiveShop({ shopId });
      toast.success("Boutique active changée");
    } catch (error) {
      toast.error("Boutique non modifiée", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(null);
    }
  }

  const provider = String(settings?.IMAGE_PROVIDER ?? "openai");
  const executionMode = String(
    settings?.GENERATION_EXECUTION_MODE ?? "realtime",
  );
  const vibeAnalysis = String(settings?.VIBE_ANALYSIS ?? "on");

  return (
    <main className="page">
      <PageHeader eyebrow="Configuration" title="Settings">
        Boutiques, moteurs image et variables techniques par boutique active.
      </PageHeader>

      <Card className="studio-card mb-4 overflow-hidden rounded-lg">
        <CardContent className="grid gap-5 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Label className="font-medium">Boutiques connectées</Label>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Chaque boutique garde ses propres produits, prompts, jobs et
                réglages de génération.
              </p>
            </div>
            <StateBadge
              state={
                shops?.some((shop) => shop.isActive) ? "success" : "warning"
              }
            >
              {shops?.some((shop) => shop.isActive)
                ? "Boutique active"
                : "Aucune boutique"}
            </StateBadge>
          </div>

          {shops?.length ? (
            <div className="grid gap-2">
              {shops.map((shop) => (
                <div
                  key={shop._id ?? shop.domain}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Store className="size-4 text-muted-foreground" />
                      <span className="font-medium">
                        {shop.name || shop.storeHandle}
                      </span>
                      {shop.isActive ? (
                        <Badge variant="default">Active</Badge>
                      ) : null}
                      {shop.source === "environment" ? (
                        <Badge variant="outline">Env</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {shop.domain}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={!shop._id || shop.isActive || saving === shop._id}
                    onClick={() => shop._id && void useShop(shop._id)}
                  >
                    <BusyIcon busy={saving === shop._id} />
                    Utiliser
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <ShopOnboarding
            appOrigin={appOrigin}
            currentHandle={currentHandle}
            form={shopForm}
            normalizedDomain={normalizedDomain}
            saving={saving === "shop-connect"}
            step={onboardingStep}
            onFormChange={setShopForm}
            onStepChange={setOnboardingStep}
            onSubmit={submitShop}
          />
        </CardContent>
      </Card>

      <Card className="studio-card mb-4 rounded-lg">
        <CardContent className="grid gap-4 pt-1 md:grid-cols-[270px_1fr] md:items-center">
          <div>
            <Label htmlFor="image-provider" className="font-medium">
              Moteur image
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Applique aux nouveaux jobs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={provider}
              onValueChange={(value) =>
                void switchSetting("IMAGE_PROVIDER", value)
              }
              disabled={saving === "IMAGE_PROVIDER"}
            >
              <SelectTrigger id="image-provider" className="h-10 min-w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI Images</SelectItem>
                <SelectItem value="gemini">Nano Banana Pro</SelectItem>
              </SelectContent>
            </Select>
            <BusyIcon busy={saving === "IMAGE_PROVIDER"} />
            <StateBadge state={provider === "gemini" ? "success" : "neutral"}>
              {provider === "gemini" ? "Gemini actif" : "OpenAI actif"}
            </StateBadge>
          </div>

          <div>
            <Label htmlFor="execution-mode" className="font-medium">
              Mode d'execution
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Le batch coute moins cher et termine en asynchrone.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={executionMode}
              onValueChange={(value) =>
                void switchSetting("GENERATION_EXECUTION_MODE", value)
              }
              disabled={saving === "GENERATION_EXECUTION_MODE"}
            >
              <SelectTrigger id="execution-mode" className="h-10 min-w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="realtime">Temps reel</SelectItem>
                <SelectItem value="batch">Batch</SelectItem>
              </SelectContent>
            </Select>
            <BusyIcon busy={saving === "GENERATION_EXECUTION_MODE"} />
            <StateBadge
              state={executionMode === "batch" ? "success" : "neutral"}
            >
              {executionMode === "batch" ? "Mode batch" : "Temps reel"}
            </StateBadge>
          </div>

          <div>
            <Label htmlFor="vibe-analysis" className="font-medium">
              Analyse visuelle
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajoute du contexte depuis l'image Shopify de reference.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={vibeAnalysis}
              onValueChange={(value) =>
                void switchSetting("VIBE_ANALYSIS", value)
              }
              disabled={saving === "VIBE_ANALYSIS"}
            >
              <SelectTrigger id="vibe-analysis" className="h-10 min-w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on">On</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
            <BusyIcon busy={saving === "VIBE_ANALYSIS"} />
            <StateBadge state={vibeAnalysis === "on" ? "success" : "neutral"}>
              {vibeAnalysis === "on" ? "Analyse active" : "Analyse inactive"}
            </StateBadge>
          </div>
        </CardContent>
      </Card>

      <Card className="studio-card rounded-lg py-0">
        {settingFields.map((key, index) => (
          <div key={key}>
            {index ? <Separator /> : null}
            <CardContent className="grid gap-3 py-4 md:grid-cols-[270px_1fr_auto] md:items-center">
              <div>
                <Label htmlFor={key} className="font-medium">
                  {key}
                </Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  {key.startsWith("GEMINI_")
                    ? "Utilise quand Nano Banana Pro est actif."
                    : key.startsWith("OPENAI_")
                      ? "Utilise quand OpenAI est actif."
                      : "Utilise par les actions de generation."}
                </p>
              </div>
              <Input
                id={key}
                className="h-10"
                value={drafts[key] ?? String(settings?.[key] ?? "")}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
              <Button
                variant="outline"
                disabled={saving === key}
                onClick={() => void save(key)}
              >
                <BusyIcon busy={saving === key} />
                Enregistrer
              </Button>
            </CardContent>
          </div>
        ))}
      </Card>
    </main>
  );
}

function ShopOnboarding({
  appOrigin,
  currentHandle,
  form,
  normalizedDomain,
  saving,
  step,
  onFormChange,
  onStepChange,
  onSubmit,
}: {
  appOrigin: string;
  currentHandle: string;
  form: ShopForm;
  normalizedDomain: string;
  saving: boolean;
  step: number;
  onFormChange: (next: ShopForm | ((current: ShopForm) => ShopForm)) => void;
  onStepChange: (step: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const appUrl = appOrigin.replace(/\/$/, "");
  const redirectUrl = `${appUrl}/auth/shopify/callback`;
  const devDashboardUrl = currentHandle
    ? `https://admin.shopify.com/store/${currentHandle}/settings/apps/development`
    : "https://admin.shopify.com/";
  const canContinue =
    step === 1
      ? Boolean(normalizedDomain)
      : step === 4
        ? Boolean(form.clientId.trim() && form.clientSecret.trim())
        : true;

  function updateField<K extends keyof ShopForm>(key: K, value: ShopForm[K]) {
    onFormChange((current) => ({ ...current, [key]: value }));
  }

  function nextStep() {
    if (!canContinue) return;
    onStepChange(Math.min(step + 1, 4));
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg bg-[#f4f3f1] p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-lg border bg-background shadow-sm">
              <Store className="size-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Connecter une boutique Shopify
              </h2>
              <p className="text-sm text-muted-foreground">
                Temps estimé: 30s à 1 minute
              </p>
            </div>
          </div>
          <OnboardingProgress step={step} />
        </div>

        <div
          className={
            step === 1
              ? "mx-auto max-w-xl"
              : "grid gap-8 lg:grid-cols-[minmax(300px,0.95fr)_minmax(420px,1fr)] lg:items-center"
          }
        >
          {step > 1 ? (
            <div>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="group relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-[#070b0d] text-left shadow-sm ring-1 ring-black/10"
              >
                <OnboardingVisual step={step} />
                <span className="absolute bottom-4 left-4 inline-flex h-9 items-center gap-2 rounded-full border border-[#f8c600] bg-black/50 px-3 text-sm font-medium text-white backdrop-blur">
                  <Maximize2 className="size-4" />
                  Cliquez pour agrandir
                </span>
              </button>
              <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="border-white/10 bg-card sm:max-w-4xl">
                  <DialogHeader>
                    <DialogTitle>Aperçu de l'étape {step}</DialogTitle>
                  </DialogHeader>
                  <div className="overflow-hidden rounded-lg bg-[#070b0d]">
                    <OnboardingVisual step={step} large />
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          ) : null}

          <div className="min-w-0">
            <p className="mb-5 text-sm font-medium text-muted-foreground">
              Étape {step} sur 4
            </p>
            {step === 1 ? (
              <StepOne
                form={form}
                normalizedDomain={normalizedDomain}
                onFieldChange={updateField}
              />
            ) : step === 2 ? (
              <StepTwo appName={APP_NAME} dashboardUrl={devDashboardUrl} />
            ) : step === 3 ? (
              <StepThree appUrl={appUrl} redirectUrl={redirectUrl} />
            ) : (
              <StepFour
                form={form}
                normalizedDomain={normalizedDomain}
                onFieldChange={updateField}
              />
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  step === 1
                    ? onFormChange({
                        name: "",
                        domain: "",
                        clientId: "",
                        clientSecret: "",
                        productQuery: DEFAULT_PRODUCT_QUERY,
                      })
                    : onStepChange(step - 1)
                }
                disabled={saving}
              >
                {step > 1 ? <ChevronLeft data-icon="inline-start" /> : null}
                {step === 1 ? "Annuler" : "Retour"}
              </Button>
              {step < 4 ? (
                <Button
                  type="button"
                  onClick={nextStep}
                  disabled={!canContinue}
                >
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
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function OnboardingProgress({ step }: { step: number }) {
  return (
    <div className="flex items-center">
      {[1, 2, 3, 4].map((item) => {
        const complete = item < step;
        const active = item === step;
        return (
          <div key={item} className="flex items-center">
            <span
              className={[
                "grid size-9 place-items-center rounded-full border text-sm font-medium transition-colors",
                complete || active
                  ? "border-[#f8c600] bg-[#fff7d6] text-[#a57600]"
                  : "border-border bg-background text-muted-foreground",
              ].join(" ")}
            >
              {complete ? <Check className="size-4" /> : item}
            </span>
            {item < 4 ? <span className="h-px w-10 bg-border sm:w-16" /> : null}
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
    <div className="grid gap-5">
      <div>
        <h3 className="text-2xl font-semibold text-foreground">
          Renseigne le nom de ta boutique Shopify
        </h3>
      </div>
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <p className="font-medium">
          Dans Shopify, va dans Paramètres &gt; Domaines.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Exemple de domaine :
        </p>
      <code className="mt-3 block rounded-md bg-black/30 px-3 py-2 text-sm">
          q8r4mz-2x.myshopify.com
        </code>
        <p className="mt-2 text-xs text-muted-foreground">
          S'il y a plusieurs domaines en .myshopify.com, prends le premier de la
          liste.
        </p>
      </div>
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <Label htmlFor="shop-domain" className="font-medium">
          Nom de la boutique
        </Label>
        <p className="mt-3 text-sm text-muted-foreground">
          Entre le nom ou le domaine de la boutique.
        </p>
      <div className="mt-5 flex min-h-10 items-center overflow-hidden rounded-lg border border-white/10 bg-black/20 focus-within:ring-2 focus-within:ring-ring/50">
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
        <div className="mt-4 rounded-lg border border-dashed bg-muted/30 px-3 py-2 font-mono text-sm">
          {normalizedDomain || "q8r4mz-2x.myshopify.com"}
        </div>
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
    <div className="grid gap-5">
      <h3 className="text-2xl font-semibold text-foreground">
        Crée votre application Shopify personnalisée
      </h3>
      <ol className="grid gap-3 text-sm text-muted-foreground">
        <li className="grid grid-cols-[1.5rem_1fr] gap-2">
          <span className="font-semibold text-foreground">1.</span>
          <div className="rounded-lg border bg-background p-4 text-foreground shadow-sm">
            <p>
              Clique sur le bouton ci-dessous pour ouvrir les apps de
              développement Shopify.
            </p>
            <Button className="mt-3" asChild>
              <a href={dashboardUrl} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" />
                Ouvrir les paramètres de l'app Shopify
              </a>
            </Button>
          </div>
        </li>
        <li className="grid grid-cols-[1.5rem_1fr] gap-2">
          <span className="font-semibold text-foreground">2.</span>
          <span>
            Clique sur le bouton "Développer des applications" dans le Dev
            Dashboard.
          </span>
        </li>
        <li className="grid grid-cols-[1.5rem_1fr] gap-2">
          <span className="font-semibold text-foreground">3.</span>
          <span>Crée une nouvelle application personnalisée.</span>
        </li>
        <li className="grid grid-cols-[1.5rem_1fr] gap-2">
          <span className="font-semibold text-foreground">4.</span>
          <span>
            Colle le nom de l'application ci-dessous, puis valide la création.
          </span>
        </li>
      </ol>
      <CopyValue label="Nom de l'application" value={appName} />
    </div>
  );
}

function StepThree({
  appUrl,
  redirectUrl,
}: {
  appUrl: string;
  redirectUrl: string;
}) {
  return (
    <div className="grid gap-5">
      <div>
        <h3 className="text-2xl font-semibold text-foreground">
          Configure votre app Shopify
        </h3>
        <p className="mt-4 text-sm text-muted-foreground">
          Copie-colle ces valeurs dans les paramètres de ton app Shopify.
        </p>
      </div>
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
        <CopyRow label="URL de l'application" value={appUrl} />
      <div className="mx-3 rounded-md border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          Décoche la case "Intégrer l'application dans l'interface
          administrateur Shopify".
        </div>
        <CopyRow label="Champs d'accès" value={ADMIN_SCOPES} />
        <CopyRow label="URL de redirection autorisée" value={redirectUrl} />
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
    <div className="grid gap-5">
      <div>
        <h3 className="text-2xl font-semibold text-foreground">
          Collez les identifiants de l'app
        </h3>
        <p className="mt-3 text-sm text-muted-foreground">
          Copie l'ID client et la clé secrète de ton app Shopify pour finaliser
          la connexion.
        </p>
      </div>
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="shop-name-final">Nom interne</Label>
          <Input
            id="shop-name-final"
            value={form.name}
            onChange={(event) => onFieldChange("name", event.target.value)}
            placeholder={shopHandle(normalizedDomain) || "Rideau Design"}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="shop-client-id">ID client</Label>
          <Input
            id="shop-client-id"
            value={form.clientId}
            onChange={(event) => onFieldChange("clientId", event.target.value)}
            placeholder="ID client"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="shop-client-secret">Clé secrète API</Label>
          <Input
            id="shop-client-secret"
            type="password"
            value={form.clientSecret}
            onChange={(event) =>
              onFieldChange("clientSecret", event.target.value)
            }
            placeholder="Clé secrète API"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="shop-product-query">Filtre produits Shopify</Label>
          <Input
            id="shop-product-query"
            value={form.productQuery}
            onChange={(event) =>
              onFieldChange("productQuery", event.target.value)
            }
          />
        </div>
      </div>
    </div>
  );
}

function CopyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-background p-4 shadow-sm">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-sm text-foreground">{value}</p>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-3 border-b p-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 break-words font-mono text-sm text-foreground">
          {value}
        </p>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copié");
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
          {["Accueil", "Apps", "Catalogue", "Settings"].map((item, index) => (
            <div
              key={item}
              className={`mb-2 rounded px-2 py-1 ${index === step - 1 ? "bg-emerald-400/15 text-emerald-200" : "bg-white/5"}`}
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
          {step === 2 ? (
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

function VisualStepCreate() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-3">
        <div className="h-2 w-24 rounded bg-cyan-100/50" />
        <div className="mt-3 h-8 rounded bg-cyan-100/10" />
        <div className="mt-3 h-6 w-28 rounded bg-[#f8c600]" />
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
      <div className="rounded bg-white/5 p-3">
        <div className="h-2 w-20 rounded bg-white/30" />
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
      <div className="rounded bg-white/5 p-3">
        <div className="h-2 w-16 rounded bg-white/30" />
        <div className="mt-3 h-8 rounded bg-emerald-400/10" />
      </div>
      <div className="rounded bg-white/5 p-3">
        <div className="h-2 w-24 rounded bg-white/30" />
        <div className="mt-3 h-8 rounded bg-white/10" />
      </div>
    </div>
  );
}
