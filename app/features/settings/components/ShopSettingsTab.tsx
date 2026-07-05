import type { FormEvent } from "react";
import { type Id } from "@/lib/convex";
import type { ShopForm, ShopRow } from "../types";
import { SettingsPanel } from "./SettingsPanel";
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
  return (
    <SettingsPanel
      title="Boutiques connectees"
      description="Chaque boutique garde ses produits, prompts, jobs et reglages de generation."
    >
      <ShopTable shops={shops} saving={saving} onUseShop={onUseShop} />
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
    </SettingsPanel>
  );
}
