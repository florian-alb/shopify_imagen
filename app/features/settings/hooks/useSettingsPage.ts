import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, type Id } from "@/lib/convex";
import { DEFAULT_PRODUCT_QUERY } from "../settingsData";
import {
  normalizeShopDomain,
  settingString,
  shopDisplayName,
  shopHandle,
} from "../lib/settingsHelpers";
import type {
  SettingsDrafts,
  SettingsMap,
  SettingsTab,
  ShopForm,
  ShopRow,
} from "../types";

function createShopForm(): ShopForm {
  return {
    name: "",
    domain: "",
    clientId: "",
    clientSecret: "",
    productQuery: DEFAULT_PRODUCT_QUERY,
  };
}

function getInitialAppOrigin() {
  return typeof window === "undefined"
    ? "https://your-app-domain.com"
    : window.location.origin;
}

export function useSettingsPage() {
  const settings = useQuery(api.settings.list) as SettingsMap | undefined;
  const shops = useQuery(api.shops.list) as ShopRow[] | undefined;
  const setSetting = useMutation(api.settings.set);
  const connectShop = useMutation(api.shops.connect);
  const setActiveShop = useMutation(api.shops.setActive);
  const syncProducts = useAction(api.shopify.syncProducts);
  const [saving, setSaving] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [drafts, setDrafts] = useState<SettingsDrafts>({});
  const [tab, setTab] = useState<SettingsTab>("boutique");
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [appOrigin] = useState(() => getInitialAppOrigin());
  const [shopForm, setShopForm] = useState<ShopForm>(() => createShopForm());

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
  const headerSubtitle = activeShop
    ? shopDisplayName(activeShop) + " - " + activeShop.domain
    : shops === undefined
      ? "Chargement de la boutique active"
      : "Aucune boutique active";

  async function save(key: string) {
    setSaving(key);
    const raw = drafts[key] ?? settingString(settings, key);
    const value = /^d+$/.test(raw) ? Number(raw) : raw;
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

  function updateDraft(key: string, value: string) {
    setDrafts((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateShopFormField<K extends keyof ShopForm>(
    key: K,
    value: ShopForm[K],
  ) {
    setShopForm((current) => ({ ...current, [key]: value }));
  }

  function resetShopForm() {
    setShopForm(createShopForm());
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
      resetShopForm();
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

  return {
    activeShop,
    appOrigin,
    currentHandle,
    drafts,
    executionMode,
    headerSubtitle,
    normalizedDomain,
    onboardingStep,
    provider,
    saving,
    settings,
    shopForm,
    shops,
    syncing,
    tab,
    runSync,
    save,
    resetShopForm,
    setOnboardingStep,
    setTab,
    submitShop,
    switchSetting,
    updateDraft,
    updateShopFormField,
    useShop,
  };
}
