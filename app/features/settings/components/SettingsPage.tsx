import {
  Layers3,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Store,
} from "lucide-react";
import { BusyIcon, PageHeader, StateBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettingsPage } from "../hooks/useSettingsPage";
import type { SettingsTab } from "../types";
import { ActiveShopBanner } from "./ActiveShopBanner";
import { AdvancedSettingsTab } from "./AdvancedSettingsTab";
import { GenerationSettingsTab } from "./GenerationSettingsTab";
import { ModelSettingsTab } from "./ModelSettingsTab";
import { ShopSettingsTab } from "./ShopSettingsTab";

export function SettingsPage() {
  const page = useSettingsPage();

  return (
    <main className="mx-auto w-full max-w-[96rem] p-4 md:p-5">
      <PageHeader
        title="Parametres"
        eyebrow="Configuration"
        action={
          <>
            <StateBadge state={page.provider === "gemini" ? "success" : "neutral"}>
              {page.provider === "gemini" ? "Gemini" : "OpenAI"}
            </StateBadge>
            <StateBadge
              state={page.executionMode === "batch" ? "success" : "neutral"}
            >
              {page.executionMode === "batch" ? "Batch" : "Temps reel"}
            </StateBadge>
            <Button
              type="button"
              variant="outline"
              onClick={() => void page.runSync()}
              disabled={page.syncing || page.shops === undefined || !page.activeShop}
            >
              <BusyIcon busy={page.syncing} />
              {!page.syncing ? <RefreshCw data-icon="inline-start" /> : null}
              Synchroniser
            </Button>
          </>
        }
      >
        {page.headerSubtitle}
      </PageHeader>

      <ActiveShopBanner
        shop={page.activeShop}
        loading={page.shops === undefined}
        onChange={() => page.setTab("boutique")}
      />

      <Tabs
        value={page.tab}
        onValueChange={(value) => page.setTab(value as SettingsTab)}
      >
        <div className="mb-4 overflow-x-auto pb-1">
          <TabsList className="w-max border border-border bg-card">
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
          <ShopSettingsTab
            appOrigin={page.appOrigin}
            currentHandle={page.currentHandle}
            normalizedDomain={page.normalizedDomain}
            onboardingStep={page.onboardingStep}
            saving={page.saving}
            shopForm={page.shopForm}
            shops={page.shops}
            onFieldChange={page.updateShopFormField}
            onResetForm={page.resetShopForm}
            onStepChange={page.setOnboardingStep}
            onSubmit={page.submitShop}
            onUseShop={page.useShop}
          />
        </TabsContent>

        <TabsContent value="generation">
          <GenerationSettingsTab
            executionMode={page.executionMode}
            provider={page.provider}
            saving={page.saving}
            onSwitchSetting={page.switchSetting}
          />
        </TabsContent>

        <TabsContent value="modeles">
          <ModelSettingsTab
            drafts={page.drafts}
            provider={page.provider}
            saving={page.saving}
            settings={page.settings}
            onDraftChange={page.updateDraft}
            onSave={page.save}
          />
        </TabsContent>

        <TabsContent value="avance">
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
