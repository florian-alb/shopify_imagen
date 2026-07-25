import type { FormEvent } from "react";
import { type Id } from "@/lib/convex";
import { useShopAuthorization } from "../hooks/useShopAuthorization";
import type { ShopForm, ShopRow } from "../types";
import { SettingsPanel } from "./SettingsPanel";
import { ShopAuthorizationDialog } from "./ShopAuthorizationDialog";
import { ShopOnboarding } from "./ShopOnboarding";
import { ShopTable } from "./ShopTable";

export function ShopSettingsTab({
  appOrigin,
  currentHandle,
  normalizedDomain,
  onboardingStep,
  saving,
  shopForm,
  shops,
  onFieldChange,
  onResetForm,
  onStepChange,
  onSubmit,
  onUseShop,
}: {
  appOrigin: string;
  currentHandle: string;
  normalizedDomain: string;
  onboardingStep: number;
  saving: string | null;
  shopForm: ShopForm;
  shops: ShopRow[] | undefined;
  onFieldChange: <K extends keyof ShopForm>(
    key: K,
    value: ShopForm[K],
  ) => void;
  onResetForm: () => void;
  onStepChange: (step: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUseShop: (shopId: Id<"shops">) => void;
}) {
  const shopAuthorization = useShopAuthorization();

  return (
    <SettingsPanel
      title="Boutiques connectees"
      description="Chaque boutique garde ses produits, prompts, jobs et reglages de generation."
    >
      <ShopTable
        shops={shops}
        saving={saving}
        onCheckAuthorization={shopAuthorization.open}
        onUseShop={onUseShop}
      />
      <ShopOnboarding
        appOrigin={appOrigin}
        currentHandle={currentHandle}
        form={shopForm}
        normalizedDomain={normalizedDomain}
        saving={saving === "shop-connect"}
        step={onboardingStep}
        onFieldChange={onFieldChange}
        onResetForm={onResetForm}
        onStepChange={onStepChange}
        onSubmit={onSubmit}
      />
      <ShopAuthorizationDialog
        state={shopAuthorization.state}
        open={shopAuthorization.isOpen}
        onOpenChange={shopAuthorization.handleOpenChange}
        onClose={shopAuthorization.close}
        isAuthorizing={shopAuthorization.isAuthorizing}
        onAuthorize={() => void shopAuthorization.authorize()}
        onVerify={shopAuthorization.verify}
      />
    </SettingsPanel>
  );
}
