import { Check, ChevronLeft, ChevronRight, Plus, Store } from "lucide-react";
import { BusyIcon } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { useShopConnection } from "../hooks/useShopConnection";
import type { ShopRow } from "../types";
import { ShopIdentityFields, ShopCredentialsFields } from "./ShopOnboardingFields";
import { ShopAccessGuide, ShopAppGuide } from "./ShopOnboardingGuide";

const steps = [
  {
    title: "Votre boutique",
    description: "Identifiez le domaine Shopify à connecter.",
    short: "Boutique",
  },
  {
    title: "L’application Shopify",
    description: "Créez une application pour relier votre boutique à Image Studio.",
    short: "Application",
  },
  {
    title: "Configurer les accès",
    description: "Préparez les URL et les autorisations de l’application.",
    short: "Accès",
  },
  {
    title: "Enregistrer les clés",
    description: "Ajoutez les identifiants de votre application Shopify.",
    short: "Clés",
  },
];

export function ShopOnboarding({
  connection: flow,
  shops,
  disabled,
}: {
  connection: ReturnType<typeof useShopConnection>;
  shops: ShopRow[];
  disabled: boolean;
}) {
  const current = steps[flow.step - 1];
  const canContinue =
    flow.step === 1
      ? Boolean(flow.normalizedDomain)
      : flow.step === 4
        ? Boolean(flow.form.clientId.trim() && flow.form.clientSecret.trim())
        : true;
  return (
    <Dialog open={flow.open} onOpenChange={flow.changeOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus />
          {flow.hasDraft ? "Reprendre l’ajout" : "Ajouter une boutique"}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <Store className="size-4 text-muted-foreground" />
            Connecter une boutique
          </DialogTitle>
          <DialogDescription>
            Étape {flow.step} sur 4 · {current.short}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col overflow-hidden"
          onSubmit={(event) => {
            if (flow.step < 4) {
              event.preventDefault();
              if (canContinue) flow.setStep(flow.step + 1);
            } else {
              void flow.submit(event);
            }
          }}
        >
          <div className="grid min-h-0 overflow-y-auto sm:grid-cols-[11rem_minmax(0,1fr)]">
            <nav
              aria-label="Étapes de connexion"
              className="border-b px-5 py-3 sm:border-b-0 sm:border-r sm:bg-muted/30 sm:p-4"
            >
              <ol className="flex gap-2 sm:flex-col sm:gap-1">
                {steps.map((item, index) => (
                  <li key={item.short} className="min-w-0 flex-1">
                    <button
                      type="button"
                      disabled={index + 1 > flow.step || flow.saving}
                      onClick={() => flow.setStep(index + 1)}
                      aria-current={flow.step === index + 1 ? "step" : undefined}
                      aria-label={`Étape ${index + 1} : ${item.short}`}
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground aria-[current=step]:bg-primary/10 aria-[current=step]:text-primary disabled:opacity-50"
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-current text-xs">
                        {index + 1 < flow.step ? <Check className="size-3" /> : index + 1}
                      </span>
                      <span className="hidden sm:inline">{item.short}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="mt-5 hidden break-words text-xs text-muted-foreground sm:block" title={flow.normalizedDomain}>
                {flow.form.name.trim() || flow.normalizedDomain.split(".")[0] || "Votre boutique Shopify"}
              </p>
            </nav>
            <fieldset disabled={flow.saving} className="min-w-0 space-y-5 p-5 sm:min-h-80 sm:p-6">
              <div aria-live="polite">
                <h2 key={flow.step} className="text-xl font-semibold tracking-tight">
                  {current.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {current.description}
                </p>
              </div>
              {flow.step === 1 && (
                <ShopIdentityFields
                  form={flow.form}
                  normalizedDomain={flow.normalizedDomain}
                  onChange={flow.updateField}
                />
              )}
              {flow.step === 2 && <ShopAppGuide onSkip={() => flow.setStep(4)} />}
              {flow.step === 3 && <ShopAccessGuide appUrl={flow.appOrigin} />}
              {flow.step === 4 && (
                <ShopCredentialsFields
                  form={flow.form}
                  normalizedDomain={flow.normalizedDomain}
                  onChange={flow.updateField}
                  existingShop={shops.find((shop) => shop.domain === flow.normalizedDomain)}
                />
              )}
              {flow.error && (
                <p
                  role="alert"
                  className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {flow.error}
                </p>
              )}
            </fieldset>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              disabled={flow.saving}
              onClick={() => (flow.step > 1 ? flow.setStep(flow.step - 1) : flow.changeOpen(false))}
            >
              {flow.step > 1 ? (
                <>
                  <ChevronLeft />
                  Retour
                </>
              ) : (
                "Fermer"
              )}
            </Button>
            <Button type="submit" className="min-h-11" disabled={!canContinue || flow.saving}>
              <BusyIcon busy={flow.saving} />
              {flow.step === 4 ? "Enregistrer la boutique" : "Continuer"}
              {flow.step < 4 && <ChevronRight />}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
