import { Check, Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ShopForm, ShopRow } from "../types";

type FieldsProps = {
  form: ShopForm;
  normalizedDomain: string;
  onChange: <K extends keyof ShopForm>(key: K, value: ShopForm[K]) => void;
};

export function ShopIdentityFields({ form, normalizedDomain, onChange }: FieldsProps) {
  const invalid = Boolean(form.domain.trim() && !normalizedDomain);
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="shop-domain">Domaine Shopify</Label>
        <Input
          id="shop-domain"
          className="mt-2 h-11"
          value={form.domain}
          onChange={(event) => onChange("domain", event.target.value)}
          placeholder="ma-boutique.myshopify.com"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby="shop-domain-help"
          required
          autoFocus
        />
        <p
          id="shop-domain-help"
          className={`mt-2 text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}
        >
          {invalid
            ? "Utilisez le domaine en .myshopify.com ou son identifiant, sans chemin d’administration."
            : "L’identifiant seul suffit aussi. Exemple : ma-boutique."}
        </p>
      </div>
      <div>
        <Label htmlFor="shop-name">
          Nom dans Image Studio{" "}
          <span className="font-normal text-muted-foreground">· facultatif</span>
        </Label>
        <Input
          id="shop-name"
          className="mt-2 h-11"
          value={form.name}
          onChange={(event) => onChange("name", event.target.value)}
          placeholder="Maison Atelier"
        />
      </div>
      {normalizedDomain && (
        <div role="status" className="flex items-start gap-3 rounded-xl bg-muted p-4">
          <Store className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Boutique à connecter</p>
            <p className="mt-1 break-all font-medium">{normalizedDomain}</p>
          </div>
          <Check className="ml-auto mt-1 size-4 shrink-0 text-primary" />
        </div>
      )}
    </div>
  );
}

export function ShopCredentialsFields({
  form,
  normalizedDomain,
  onChange,
  existingShop,
}: FieldsProps & { existingShop?: ShopRow }) {
  return (
    <div className="space-y-5">
      <div className="space-y-1 rounded-xl bg-muted p-4 text-sm">
        <p className="break-all font-medium">{normalizedDomain}</p>
        <p className="text-muted-foreground">
          {existingShop
            ? "Cette boutique existe déjà. L’enregistrement mettra à jour ses clés et la rendra active."
            : "Après l’enregistrement, cette boutique deviendra la boutique active."}
        </p>
      </div>
      <div>
        <Label htmlFor="shop-client-id">ID client</Label>
        <Input
          id="shop-client-id"
          className="mt-2 h-11 font-mono"
          value={form.clientId}
          onChange={(event) => onChange("clientId", event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
        />
      </div>
      <div>
        <Label htmlFor="shop-client-secret">Clé secrète</Label>
        <Input
          id="shop-client-secret"
          className="mt-2 h-11 font-mono"
          type="password"
          value={form.clientSecret}
          onChange={(event) => onChange("clientSecret", event.target.value)}
          autoComplete="off"
          spellCheck={false}
          required
          aria-describedby="shop-secret-help"
        />
        <p id="shop-secret-help" className="mt-2 text-xs text-muted-foreground">
          Enregistrée côté serveur. Elle ne sera pas réaffichée après sauvegarde.
        </p>
      </div>
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Filtre du catalogue Shopify
        </summary>
        <div className="pt-3">
          <Label htmlFor="shop-product-query">Produits à synchroniser</Label>
          <Input
            id="shop-product-query"
            className="mt-2 font-mono text-xs"
            value={form.productQuery}
            onChange={(event) => onChange("productQuery", event.target.value)}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Conservez le filtre proposé pour inclure les produits actifs, brouillons et archivés.
          </p>
        </div>
      </details>
      <p className="text-sm text-muted-foreground">
        L’enregistrement des clés ne vérifie pas les autorisations. Vous pourrez les contrôler
        ensuite avec « Vérifier l’accès ».
      </p>
    </div>
  );
}
