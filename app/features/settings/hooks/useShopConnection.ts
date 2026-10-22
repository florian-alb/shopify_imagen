import { useMutation } from "convex/react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@/lib/convex";
import { DEFAULT_PRODUCT_QUERY } from "../settingsData";
import { normalizeShopDomain, shopHandle } from "../lib/settingsHelpers";
import type { ShopForm } from "../types";

function emptyForm(): ShopForm {
  return { name: "", domain: "", clientId: "", clientSecret: "", productQuery: DEFAULT_PRODUCT_QUERY };
}

export function useShopConnection() {
  const connectShop = useMutation(api.shops.connect);
  const [form, setForm] = useState<ShopForm>(emptyForm);
  const [step, setStep] = useState(1);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const normalizedDomain = normalizeShopDomain(form.domain);
  const appOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const hasDraft = Boolean(form.name || form.domain || form.clientId || form.clientSecret || form.productQuery !== DEFAULT_PRODUCT_QUERY);

  function updateField<K extends keyof ShopForm>(key: K, value: ShopForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
    setError(null);
  }
  function reset() {
    if (pending.current) return;
    setForm(emptyForm());
    setStep(1);
    setError(null);
  }
  function changeOpen(next: boolean) {
    if (!pending.current) setOpen(next);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!normalizedDomain) { setStep(1); setError("Renseignez un domaine Shopify valide."); return; }
    if (!form.clientId.trim() || !form.clientSecret.trim()) { setStep(4); setError("Renseignez l’ID client et la clé secrète."); return; }
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      await connectShop({ ...form, name: form.name.trim() || shopHandle(normalizedDomain), domain: normalizedDomain, productQuery: form.productQuery.trim() || DEFAULT_PRODUCT_QUERY });
      setForm(emptyForm());
      setStep(1);
      setOpen(false);
      toast.success("Boutique enregistrée et activée", { description: "Utilisez « Vérifier l’accès » pour contrôler ses autorisations Shopify." });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      toast.error("Connexion impossible", { description: message });
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return { form, step, open, saving, error, appOrigin, normalizedDomain, hasDraft, updateField, reset, setStep, changeOpen, submit };
}
