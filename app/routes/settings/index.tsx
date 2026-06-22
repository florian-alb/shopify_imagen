import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  KeyRound,
  Layers3,
  Maximize2,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type SettingKey = (typeof settingFields)[number];

type SettingsMap = Record<string, unknown>;

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

type SettingsTab = "boutique" | "generation" | "modeles" | "avance";

type SettingDefinition = {
  key: SettingKey;
  label: string;
  description: string;
  scope: "openai" | "gemini" | "vibe" | "shared";
};

const modelSettings: SettingDefinition[] = [
  {
    key: "OPENAI_IMAGE_MODEL",
    label: "Modele image OpenAI",
    description: "Modele utilise quand le moteur OpenAI est actif.",
    scope: "openai",
  },
  {
    key: "OPENAI_IMAGE_SIZE",
    label: "Taille OpenAI",
    description: "Resolution demandee aux generations OpenAI.",
    scope: "openai",
  },
  {
    key: "OPENAI_IMAGE_QUALITY",
    label: "Qualite OpenAI",
    description: "Niveau de qualite envoye au provider OpenAI.",
    scope: "openai",
  },
  {
    key: "OPENAI_IMAGE_OUTPUT_FORMAT",
    label: "Format OpenAI",
    description: "Format de sortie des images OpenAI.",
    scope: "openai",
  },
  {
    key: "GEMINI_IMAGE_MODEL",
    label: "Modele image Gemini",
    description: "Modele utilise quand le moteur Gemini est actif.",
    scope: "gemini",
  },
  {
    key: "GEMINI_IMAGE_SIZE",
    label: "Taille Gemini",
    description: "Resolution demandee aux generations Gemini.",
    scope: "gemini",
  },
  {
    key: "GEMINI_IMAGE_ASPECT_RATIO",
    label: "Ratio Gemini",
    description: "Ratio transmis aux generations Gemini.",
    scope: "gemini",
  },
  {
    key: "VIBE_MODEL",
    label: "Modele d'analyse visuelle",
    description: "Modele charge de lire l'image Shopify de reference.",
    scope: "vibe",
  },
];

const advancedSettings: SettingDefinition[] = [
  {
    key: "OPENAI_IMAGE_REQUESTS_PER_MINUTE",
    label: "Limite OpenAI par minute",
    description: "Cadence maximale pour les appels image OpenAI.",
    scope: "openai",
  },
  {
    key: "GEMINI_IMAGE_REQUESTS_PER_MINUTE",
    label: "Limite Gemini par minute",
    description: "Cadence maximale pour les appels image Gemini.",
    scope: "gemini",
  },
  {
    key: "GENERATION_CONCURRENCY",
    label: "Concurrence generation",
    description: "Nombre de generations executees en parallele.",
    scope: "shared",
  },
];

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

function shopDisplayName(shop: ShopRow) {
  return shop.name || shop.storeHandle || shop.domain;
}

function settingString(
  settings: SettingsMap | undefined,
  key: string,
  fallback = "",
) {
  const value = settings?.[key];
  return value === undefined || value === null ? fallback : String(value);
}

function SettingsPage() {
  const settings = useQuery(api.settings.list) as SettingsMap | undefined;
  const shops = useQuery(api.shops.list) as ShopRow[] | undefined;
  const setSetting = useMutation(api.settings.set);
  const connectShop = useMutation(api.shops.connect);
  const setActiveShop = useMutation(api.shops.setActive);
  const syncProducts = useAction(api.shopify.syncProducts);
  const [saving, setSaving] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<SettingsTab>("boutique");
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
  const activeShop = shops?.find((shop) => shop.isActive) ?? null;
  const provider = settingString(settings, "IMAGE_PROVIDER", "openai");
  const executionMode = settingString(
    settings,
    "GENERATION_EXECUTION_MODE",
    "realtime",
  );
  const vibeAnalysis = settingString(settings, "VIBE_ANALYSIS", "on");
  const headerSubtitle = activeShop
    ? `${shopDisplayName(activeShop)} - ${activeShop.domain}`
    : shops === undefined
      ? "Chargement de la boutique active"
      : "Aucune boutique active";

  async function save(key: string) {
    setSaving(key);
    const raw = drafts[key] ?? settingString(settings, key);
    const value = /^\d+$/.test(raw) ? Number(raw) : raw;
    try {
      await setSetting({ key, value });
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      toast.success("Parametre enregistre", { description: key });
    } catch (error) {
      toast.error("Parametre non enregistre", {
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
      toast.success("Parametre enregistre", { description: key });
    } catch (error) {
      toast.error("Parametre non enregistre", {
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
      toast.error("Colle l'ID client et la cle secrete.");
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
      toast.success("Boutique connectee");
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
      toast.success("Boutique active changee");
    } catch (error) {
      toast.error("Boutique non modifiee", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(null);
    }
  }

  async function runSync() {
    setSyncing(true);
    try {
      await syncProducts({ limit: 1000 });
      toast.success("Catalogue Shopify synchronise");
    } catch (error) {
      toast.error("Synchronisation impossible", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="page">
      <PageHeader
        eyebrow="Configuration"
        title="Parametres"
        action={
          <>
            <StateBadge state={provider === "gemini" ? "success" : "neutral"}>
              {provider === "gemini" ? "Gemini" : "OpenAI"}
            </StateBadge>
            <StateBadge
              state={executionMode === "batch" ? "success" : "neutral"}
            >
              {executionMode === "batch" ? "Batch" : "Temps reel"}
            </StateBadge>
            <Button
              type="button"
              variant="outline"
              onClick={() => void runSync()}
              disabled={syncing || shops === undefined || !activeShop}
            >
              <BusyIcon busy={syncing} />
              {!syncing ? <RefreshCw data-icon="inline-start" /> : null}
              Synchroniser
            </Button>
          </>
        }
      >
        {headerSubtitle}
      </PageHeader>

      <ActiveShopBanner
        shop={activeShop}
        loading={shops === undefined}
        onChange={() => setTab("boutique")}
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as SettingsTab)}>
        <div className="mb-4 overflow-x-auto pb-1">
          <TabsList className="w-max border border-white/10 bg-white/[0.03]">
            <TabsTrigger value="boutique">
              <Store className="size-4" />
              Boutique
            </TabsTrigger>
            <TabsTrigger value="generation">
              <Sparkles className="size-4" />
              Generation
            </TabsTrigger>
            <TabsTrigger value="modeles">
              <Layers3 className="size-4" />
              Modeles
            </TabsTrigger>
            <TabsTrigger value="avance">
              <SlidersHorizontal className="size-4" />
              Avance
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="boutique">
          <SettingsPanel
            title="Boutiques connectees"
            description="Chaque boutique garde ses produits, prompts, jobs et reglages de generation."
          >
            <ShopTable shops={shops} saving={saving} onUseShop={useShop} />
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
          </SettingsPanel>
        </TabsContent>

        <TabsContent value="generation">
          <SettingsPanel
            title="Generation"
            description="Reglages appliques aux nouveaux jobs de la boutique active."
          >
            <div className="grid gap-0 overflow-hidden rounded-lg border border-white/10">
              <ChoiceSettingRow
                id="image-provider"
                label="Moteur image"
                description="Provider utilise pour les prochaines generations."
                value={provider}
                saving={saving === "IMAGE_PROVIDER"}
                badge={provider === "gemini" ? "Gemini actif" : "OpenAI actif"}
                badgeState={provider === "gemini" ? "success" : "neutral"}
                onChange={(value) =>
                  void switchSetting("IMAGE_PROVIDER", value)
                }
                options={[
                  { value: "openai", label: "OpenAI" },
                  { value: "gemini", label: "Gemini" },
                ]}
              />
              <ChoiceSettingRow
                id="execution-mode"
                label="Mode d'execution"
                description="Le batch termine en asynchrone, le temps reel repond tout de suite."
                value={executionMode}
                saving={saving === "GENERATION_EXECUTION_MODE"}
                badge={executionMode === "batch" ? "Mode batch" : "Temps reel"}
                badgeState={executionMode === "batch" ? "success" : "neutral"}
                onChange={(value) =>
                  void switchSetting("GENERATION_EXECUTION_MODE", value)
                }
                options={[
                  { value: "realtime", label: "Temps reel" },
                  { value: "batch", label: "Batch" },
                ]}
              />
              <ChoiceSettingRow
                id="vibe-analysis"
                label="Analyse visuelle"
                description="Ajoute du contexte depuis l'image Shopify de reference."
                value={vibeAnalysis}
                saving={saving === "VIBE_ANALYSIS"}
                badge={
                  vibeAnalysis === "on" ? "Analyse active" : "Analyse inactive"
                }
                badgeState={vibeAnalysis === "on" ? "success" : "neutral"}
                onChange={(value) => void switchSetting("VIBE_ANALYSIS", value)}
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
              />
            </div>
          </SettingsPanel>
        </TabsContent>

        <TabsContent value="modeles">
          <SettingsPanel
            title="Modeles"
            description="Parametres de modeles et formats par provider."
          >
            <SettingTable
              definitions={modelSettings}
              drafts={drafts}
              provider={provider}
              saving={saving}
              settings={settings}
              vibeAnalysis={vibeAnalysis}
              onDraftChange={setDrafts}
              onSave={save}
            />
          </SettingsPanel>
        </TabsContent>

        <TabsContent value="avance">
          <SettingsPanel
            title="Avance"
            description="Limites techniques et concurrence des generations."
          >
            <SettingTable
              definitions={advancedSettings}
              drafts={drafts}
              provider={provider}
              saving={saving}
              settings={settings}
              vibeAnalysis={vibeAnalysis}
              onDraftChange={setDrafts}
              onSave={save}
            />
          </SettingsPanel>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function ActiveShopBanner({
  shop,
  loading,
  onChange,
}: {
  shop: ShopRow | null;
  loading: boolean;
  onChange: () => void;
}) {
  return (
    <section className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20">
              <Store className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {loading
                  ? "Chargement de la boutique"
                  : shop
                    ? shopDisplayName(shop)
                    : "Aucune boutique active"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {shop?.domain ??
                  "Connecte une boutique pour synchroniser Shopify."}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {shop?.isActive ? <Badge>Active</Badge> : null}
          {shop?.source === "environment" ? (
            <Badge variant="outline">Env</Badge>
          ) : null}
          {shop ? (
            <Badge variant="outline">
              {shop.hasClientCredentials ? "Cles presentes" : "Cles absentes"}
            </Badge>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onChange}>
            Changer
          </Button>
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="studio-card rounded-lg py-0">
      <CardContent className="grid gap-4 p-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function ShopTable({
  shops,
  saving,
  onUseShop,
}: {
  shops: ShopRow[] | undefined;
  saving: string | null;
  onUseShop: (shopId: Id<"shops">) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <Table className="table-studio">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Boutique</TableHead>
            <TableHead>Domaine</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Etat</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shops === undefined ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                Chargement des boutiques...
              </TableCell>
            </TableRow>
          ) : shops.length ? (
            shops.map((shop) => (
              <TableRow key={shop._id ?? shop.domain}>
                <TableCell className="min-w-52">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-white/[0.04] text-muted-foreground ring-1 ring-white/10">
                      <Store className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {shopDisplayName(shop)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {shop.productQuery || DEFAULT_PRODUCT_QUERY}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="min-w-56 font-mono text-xs">
                  {shop.domain}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {shop.source === "environment" ? "Env" : "Connectee"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {shop.isActive ? <Badge>Active</Badge> : null}
                    <Badge variant="outline">
                      {shop.hasClientCredentials
                        ? "Cles presentes"
                        : "Cles absentes"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!shop._id || shop.isActive || saving === shop._id}
                    onClick={() => shop._id && onUseShop(shop._id)}
                  >
                    <BusyIcon busy={saving === shop._id} />
                    Utiliser
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                Aucune boutique connectee.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ChoiceSettingRow({
  id,
  label,
  description,
  value,
  options,
  saving,
  badge,
  badgeState,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  saving: boolean;
  badge: string;
  badgeState: "neutral" | "success" | "warning" | "danger";
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 border-b border-white/10 p-4 last:border-b-0 md:grid-cols-[minmax(12rem,18rem)_1fr] md:items-center">
      <div>
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={value} onValueChange={onChange} disabled={saving}>
          <SelectTrigger id={id} className="h-10 min-w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <BusyIcon busy={saving} />
        <StateBadge state={badgeState}>{badge}</StateBadge>
      </div>
    </div>
  );
}

function SettingTable({
  definitions,
  settings,
  drafts,
  saving,
  provider,
  vibeAnalysis,
  onDraftChange,
  onSave,
}: {
  definitions: SettingDefinition[];
  settings: SettingsMap | undefined;
  drafts: Record<string, string>;
  saving: string | null;
  provider: string;
  vibeAnalysis: string;
  onDraftChange: (
    next:
      | Record<string, string>
      | ((current: Record<string, string>) => Record<string, string>),
  ) => void;
  onSave: (key: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <Table className="table-studio">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Parametre</TableHead>
            <TableHead>Valeur</TableHead>
            <TableHead>Etat</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {definitions.map((definition) => {
            const currentValue = settingString(settings, definition.key);
            const value = drafts[definition.key] ?? currentValue;
            const dirty = drafts[definition.key] !== undefined;
            return (
              <TableRow key={definition.key}>
                <TableCell className="min-w-72">
                  <div>
                    <Label htmlFor={definition.key} className="font-medium">
                      {definition.label}
                    </Label>
                    <p className="mt-1 text-xs font-mono text-muted-foreground">
                      {definition.key}
                    </p>
                    <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                      {definition.description}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="min-w-64">
                  <Input
                    id={definition.key}
                    className="h-10 font-mono text-sm"
                    value={value}
                    onChange={(event) =>
                      onDraftChange((current) => ({
                        ...current,
                        [definition.key]: event.target.value,
                      }))
                    }
                  />
                </TableCell>
                <TableCell>
                  {dirty ? (
                    <StateBadge state="warning">Modifie</StateBadge>
                  ) : (
                    <StateBadge
                      state={
                        settingIsActive(definition, provider, vibeAnalysis)
                          ? "success"
                          : "neutral"
                      }
                    >
                      {settingIsActive(definition, provider, vibeAnalysis)
                        ? "Actif"
                        : "Disponible"}
                    </StateBadge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving === definition.key}
                    onClick={() => onSave(definition.key)}
                  >
                    <BusyIcon busy={saving === definition.key} />
                    Enregistrer
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function settingIsActive(
  definition: SettingDefinition,
  provider: string,
  vibeAnalysis: string,
) {
  if (definition.scope === "shared") return true;
  if (definition.scope === "vibe") return vibeAnalysis !== "off";
  return definition.scope === provider;
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
    <form
      onSubmit={onSubmit}
      className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg border border-white/10 bg-black/20 text-muted-foreground">
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
        <div className="min-w-0 rounded-lg border border-white/10 bg-black/10 p-4">
          <p className="mb-4 text-xs font-medium text-muted-foreground">
            Etape {step} sur 4
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

          <div className="mt-5 flex flex-wrap items-center gap-3">
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
        <DialogContent className="border-white/10 bg-card sm:max-w-4xl">
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
                  : "border-white/10 bg-white/[0.03] text-muted-foreground",
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
          <div className="mt-2 flex min-h-10 items-center overflow-hidden rounded-lg border border-white/10 bg-black/20 focus-within:ring-2 focus-within:ring-ring/50">
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
      <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-3 py-2 font-mono text-sm">
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

function StepThree({
  appUrl,
  redirectUrl,
}: {
  appUrl: string;
  redirectUrl: string;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <h4 className="font-medium">Configuration OAuth</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Colle ces valeurs dans l'app Shopify avant de créer les clés.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-white/10">
        <CopyRow label="URL de l'application" value={appUrl} />
        <CopyRow label="URL de redirection" value={redirectUrl} />
        <CopyRow label="Scopes Admin API" value={ADMIN_SCOPES} />
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
  children: React.ReactNode;
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
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
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
    <div className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-white/10 p-3 last:border-b-0">
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
          {["Domaines", "Apps", "OAuth", "Cles"].map((item, index) => (
            <div
              key={item}
              className={`mb-2 rounded px-2 py-1 ${
                index === step - 1
                  ? "bg-emerald-400/15 text-emerald-200"
                  : "bg-white/5"
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
      <div className="rounded bg-white/5 p-3">
        <div className="h-2 w-24 rounded bg-white/30" />
        <div className="mt-3 h-8 rounded bg-emerald-400/10" />
      </div>
      <div className="rounded bg-white/5 p-3">
        <div className="h-2 w-20 rounded bg-white/30" />
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
