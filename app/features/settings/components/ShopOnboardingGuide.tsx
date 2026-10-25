import { useQuery } from "convex/react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { APP_NAME, SHOPIFY_ONBOARDING_SCOPES } from "../settingsData";

export function ShopAppGuide({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="space-y-5">
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>Ouvrez le Dev Dashboard Shopify et choisissez votre organisation.</li>
        <li>
          Dans <strong className="text-foreground">Apps</strong>, cliquez sur{" "}
          <strong className="text-foreground">Create app</strong>, puis{" "}
          <strong className="text-foreground">Start from Dev Dashboard</strong>.
        </li>
        <li>Nommez l’application et créez-la. Vous configurerez ses accès à l’étape suivante.</li>
      </ol>
      <CopyConfiguration label="Nom proposé pour l’application" value={APP_NAME} />
      <Button variant="outline" asChild>
        <a href="https://dev.shopify.com/dashboard" target="_blank" rel="noreferrer">
          <ExternalLink />
          Ouvrir le Dev Dashboard
        </a>
      </Button>
      <div className="border-t pt-4">
        <p className="mb-2 text-sm text-muted-foreground">
          L’application et ses autorisations sont déjà configurées ?
        </p>
        <Button type="button" variant="ghost" className="-ml-3" onClick={onSkip}>
          J’ai déjà mes clés
        </Button>
      </div>
      <a
        className="inline-block text-xs text-muted-foreground underline underline-offset-4"
        href="https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard"
        target="_blank"
        rel="noreferrer"
      >
        Consulter le guide Shopify
      </a>
    </div>
  );
}

export function ShopAccessGuide({ appUrl }: { appUrl: string }) {
  const config = useQuery(api.settings.shopifyOnboarding);
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Dans la version de l’application, renseignez ces URL et accès Admin API, puis publiez la
        version. Conservez l’installation gérée par Shopify.
      </p>
      <div className="divide-y overflow-hidden rounded-xl border">
        <CopyConfiguration label="URL de l’application" value={appUrl} embedded />
        {config?.redirectUrl ? (
          <CopyConfiguration
            label="URL de redirection OAuth autorisée"
            value={config.redirectUrl}
            embedded
          />
        ) : (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            {config === undefined
              ? "Chargement de l’URL de redirection…"
              : "URL de redirection indisponible. Vérifiez la configuration OAuth de l’application."}
          </p>
        )}
        <CopyConfiguration label="Scopes Admin API" value={SHOPIFY_ONBOARDING_SCOPES} embedded />
      </div>
      <details className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">Détails de configuration</summary>
        <p className="mt-2">
          Le flux existant utilise <code>use_legacy_install_flow = false</code>. L’URL de
          redirection est résolue côté serveur via SHOPIFY_OAUTH_REDIRECT_URL ou CONVEX_SITE_URL.
        </p>
      </details>
      <p className="text-sm text-muted-foreground">
        À l’étape suivante, copiez l’ID client et la clé secrète depuis les réglages de
        l’application Shopify. Après enregistrement, « Vérifier l’accès » permet de terminer
        l’autorisation.
      </p>
    </div>
  );
}

function CopyConfiguration({
  label,
  value,
  embedded = false,
}: {
  label: string;
  value: string;
  embedded?: boolean;
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copié`);
    } catch {
      toast.error("Copie impossible", {
        description: "Sélectionnez et copiez la valeur manuellement.",
      });
    }
  }
  return (
    <div className={`flex min-w-0 items-start gap-3 p-4 ${embedded ? "" : "rounded-xl border"}`}>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 select-text break-all font-mono text-sm">{value}</p>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={`Copier ${label.toLowerCase()}`}
        onClick={() => void copy()}
        disabled={!value}
      >
        <Copy />
      </Button>
    </div>
  );
}
