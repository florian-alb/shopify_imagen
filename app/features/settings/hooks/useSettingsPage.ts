import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useShopConnection } from "./useShopConnection";
import { toast } from "sonner";
import { api, type Id } from "@/lib/convex";
import {
  settingString,
  shopDisplayName,
} from "../lib/settingsHelpers";
import type {
  SettingsDrafts,
  SettingsMap,
  ShopRow,
} from "../types";

export function useSettingsPage() {
  const settings = useQuery(api.settings.list) as SettingsMap | undefined;
  const shops = useQuery(api.shops.list) as ShopRow[] | undefined;
  const setSetting = useMutation(api.settings.set);
  const setActiveShop = useMutation(api.shops.setActive);
  const syncProducts = useAction(api.shopify.syncProducts);
  const [saving, setSaving] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [drafts, setDrafts] = useState<SettingsDrafts>({});
  const connection = useShopConnection();
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
      toast.success("Paramètre enregistré", { description: key });
    } catch (error) {
      toast.error("Paramètre non enregistré", {
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

  async function switchSetting(key: string, value: string) {
    setSaving(key);
    try {
      await setSetting({ key, value });
      toast.success("Paramètre enregistré", { description: key });
    } catch (error) {
      toast.error("Paramètre non enregistré", {
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

  async function runSync() {
    setSyncing(true);
    try {
      const { synced } = await syncProducts({});
      toast.success("Catalogue Shopify synchronisé", {
        description: `${synced.toLocaleString("fr-FR")} produit${synced === 1 ? "" : "s"} synchronisé${synced === 1 ? "" : "s"}.`,
      });
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
    connection,
    drafts,
    executionMode,
    headerSubtitle,
    provider,
    saving,
    settings,
    shops,
    syncing,
    runSync,
    save,
    switchSetting,
    updateDraft,
    useShop,
  };
}
