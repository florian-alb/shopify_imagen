import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { BusyIcon } from "@/components/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authorizationRelevantScopes } from "../lib/shopAuthorization";
import type { ShopAuthorizationState } from "../types";

const SCOPE_LABELS: Record<string, string> = {
  write_files: "Importer et gérer les fichiers",
  write_products: "Modifier les produits",
};

const CHECKED_AT_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

function scopeLabel(scope: string) {
  return SCOPE_LABELS[scope] ?? scope;
}

function ScopeList({ scopes }: { scopes: string[] }) {
  if (!scopes.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Autorisations Shopify">
      {scopes.map((scope) => (
        <li key={scope}>
          <Badge variant="outline">{scopeLabel(scope)}</Badge>
        </li>
      ))}
    </ul>
  );
}

function CheckedAt({ value }: { value: number }) {
  return (
    <p className="text-xs text-muted-foreground">
      Vérifié le {CHECKED_AT_FORMATTER.format(value)}
    </p>
  );
}

function AuthorizationDialogBody({ state }: { state: ShopAuthorizationState }) {
  switch (state.status) {
    case "closed":
      return null;
    case "checking":
      return (
        <div
          role="status"
          aria-live="polite"
          className="flex min-h-32 items-center justify-center gap-3 rounded-lg border border-border bg-muted/50 p-5 text-sm text-muted-foreground"
        >
          <BusyIcon busy />
          Vérification auprès de Shopify…
        </div>
      );
    case "authorization_required": {
      const isConfigured = state.authorization.status === "requested";
      return (
        <Alert role="status">
          {isConfigured ? <ShieldAlert /> : <AlertTriangle />}
          <AlertTitle>
            {isConfigured
              ? "Autorisation requise"
              : "Configuration Shopify à publier"}
          </AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>
              {isConfigured
                ? "Les accès sont demandés par l’application, mais cette boutique ne les a pas encore accordés."
                : "La version Shopify active ne demande pas encore tous les accès nécessaires. Publie la configuration, puis vérifie à nouveau."}
            </p>
            <ScopeList
              scopes={authorizationRelevantScopes(state.authorization)}
            />
            <CheckedAt value={state.authorization.checkedAt} />
          </AlertDescription>
        </Alert>
      );
    }
    case "awaiting_approval":
      return (
        <Alert role="status">
          <ShieldAlert />
          <AlertTitle>Autorisation en attente</AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>
              Termine l’autorisation dans l’onglet Shopify. L’ouverture de cet
              onglet ne valide aucun accès dans l’application.
            </p>
            <ScopeList
              scopes={authorizationRelevantScopes(state.authorization)}
            />
          </AlertDescription>
        </Alert>
      );
    case "granted":
      return (
        <Alert role="status">
          <CheckCircle2 className="text-primary" />
          <AlertTitle>Accès Shopify à jour</AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>
              Cette boutique peut publier et remplacer les images produits.
            </p>
            <ScopeList
              scopes={authorizationRelevantScopes(state.authorization)}
            />
            <CheckedAt value={state.authorization.checkedAt} />
          </AlertDescription>
        </Alert>
      );
    case "error":
      return (
        <Alert role="alert" variant="destructive">
          <AlertTriangle />
          <AlertTitle>Vérification impossible</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      );
  }
}

function AuthorizationDialogAction({
  state,
  isAuthorizing,
  onAuthorize,
  onVerify,
}: {
  state: ShopAuthorizationState;
  isAuthorizing: boolean;
  onAuthorize: () => void;
  onVerify: () => void;
}) {
  if (
    state.status === "authorization_required" &&
    state.authorization.status === "requested"
  ) {
    return (
      <>
        <Button type="button" variant="outline" onClick={onVerify}>
          Vérifier à nouveau
        </Button>
        <Button type="button" onClick={onAuthorize} disabled={isAuthorizing}>
          <BusyIcon busy={isAuthorizing} />
          {!isAuthorizing ? <ExternalLink data-icon="inline-start" /> : null}
          {isAuthorizing ? "Redirection…" : "Autoriser dans Shopify"}
        </Button>
      </>
    );
  }
  if (state.status === "awaiting_approval") {
    return (
      <Button type="button" onClick={onVerify}>
        J’ai autorisé — vérifier
      </Button>
    );
  }
  if (state.status === "authorization_required" || state.status === "error") {
    return (
      <Button type="button" onClick={onVerify}>
        Vérifier à nouveau
      </Button>
    );
  }
  return null;
}

export function ShopAuthorizationDialog({
  state,
  open,
  onOpenChange,
  onClose,
  isAuthorizing,
  onAuthorize,
  onVerify,
}: {
  state: ShopAuthorizationState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  isAuthorizing: boolean;
  onAuthorize: () => void;
  onVerify: () => void;
}) {
  const shop = state.status === "closed" ? null : state.shop;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Accès Shopify</DialogTitle>
          <DialogDescription>
            {shop
              ? `Vérifie les autorisations de ${shop.name || shop.domain}.`
              : "Vérifie les autorisations de cette boutique."}
          </DialogDescription>
        </DialogHeader>
        <AuthorizationDialogBody state={state} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <AuthorizationDialogAction
            state={state}
            isAuthorizing={isAuthorizing}
            onAuthorize={onAuthorize}
            onVerify={onVerify}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
