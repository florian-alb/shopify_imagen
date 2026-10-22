import { Layers3, SlidersHorizontal, Sparkles, Store } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader, pageContentClass } from "@/components/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettingsPage } from "../hooks/useSettingsPage";
import type { SettingsSearch } from "../lib/settingsSearch";
import type { SettingsTab } from "../types";
import { ActiveShopBanner } from "./ActiveShopBanner";
import { AdvancedSettingsTab } from "./AdvancedSettingsTab";
import { GenerationSettingsTab } from "./GenerationSettingsTab";
import { ModelSettingsTab } from "./ModelSettingsTab";
import { ShopSettingsTab } from "./ShopSettingsTab";

export function SettingsPage({ search = {} }: { search?: SettingsSearch }) {
  const page = useSettingsPage();
  const navigate = useNavigate();
  const tab = search.tab ?? "boutique";
  function setTab(next: SettingsTab) {
    void navigate({ to: "/settings", search: { tab: next }, replace: true, resetScroll: false });
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("shopify_oauth");
    if (status === "success")
      toast.success("Accès Shopify mis à jour", {
        description: "La boutique peut maintenant publier les images.",
      });
    else if (status === "error")
      toast.error("Autorisation Shopify non finalisée", {
        description: "Vérifiez l’URL de callback autorisée dans Shopify, puis réessayez.",
      });
    if (status === "success" || status === "error") {
      url.searchParams.delete("shopify_oauth");
      window.history.replaceState(window.history.state, "", url);
    }
  }, []);

  return (
    <main className={pageContentClass}>
      <PageHeader title="Réglages" eyebrow="Votre espace de travail">
        Gérez vos boutiques et les paramètres de vos prochaines générations.
      </PageHeader>
      <Tabs value={tab} onValueChange={(value) => setTab(value as SettingsTab)} className="gap-5">
        <div className="overflow-x-auto pb-1">
          <TabsList aria-label="Rubriques des réglages" className="h-11 w-max">
            <TabsTrigger value="boutique" className="px-2 text-xs sm:px-3 sm:text-sm">
              <Store className="hidden sm:block" />
              Boutiques
            </TabsTrigger>
            <TabsTrigger value="generation" className="px-2 text-xs sm:px-3 sm:text-sm">
              <Sparkles className="hidden sm:block" />
              Génération
            </TabsTrigger>
            <TabsTrigger value="modeles" className="px-2 text-xs sm:px-3 sm:text-sm">
              <Layers3 className="hidden sm:block" />
              Modèles IA
            </TabsTrigger>
            <TabsTrigger value="avance" className="px-2 text-xs sm:px-3 sm:text-sm">
              <SlidersHorizontal className="hidden sm:block" />
              Avancé
            </TabsTrigger>
          </TabsList>
        </div>
        {tab !== "boutique" && (
          <ActiveShopBanner
            shop={page.activeShop}
            loading={page.shops === undefined}
            onChange={() => setTab("boutique")}
          />
        )}
        <TabsContent
          value="boutique"
          forceMount
          hidden={tab !== "boutique"}
          className="data-[state=inactive]:hidden"
        >
          <ShopSettingsTab
            connection={page.connection}
            saving={page.saving}
            shops={page.shops}
            activeShop={page.activeShop}
            syncing={page.syncing}
            onSync={() => void page.runSync()}
            onUseShop={page.useShop}
          />
        </TabsContent>
        <TabsContent
          value="generation"
          forceMount
          hidden={tab !== "generation"}
          className="data-[state=inactive]:hidden"
        >
          <GenerationSettingsTab
            executionMode={page.executionMode}
            provider={page.provider}
            saving={page.saving}
            onSwitchSetting={page.switchSetting}
          />
        </TabsContent>
        <TabsContent
          value="modeles"
          forceMount
          hidden={tab !== "modeles"}
          className="data-[state=inactive]:hidden"
        >
          <ModelSettingsTab
            drafts={page.drafts}
            provider={page.provider}
            saving={page.saving}
            settings={page.settings}
            onDraftChange={page.updateDraft}
            onSave={page.save}
          />
        </TabsContent>
        <TabsContent
          value="avance"
          forceMount
          hidden={tab !== "avance"}
          className="data-[state=inactive]:hidden"
        >
          <AdvancedSettingsTab
            drafts={page.drafts}
            provider={page.provider}
            saving={page.saving}
            settings={page.settings}
            onDraftChange={page.updateDraft}
            onSave={page.save}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
