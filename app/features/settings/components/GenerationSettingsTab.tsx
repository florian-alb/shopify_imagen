import { ChoiceSettingRow } from "./ChoiceSettingRow";
import { SettingsPanel } from "./SettingsPanel";

export function GenerationSettingsTab({
  executionMode,
  provider,
  saving,
  onSwitchSetting,
}: {
  executionMode: string;
  provider: string;
  saving: string | null;
  onSwitchSetting: (key: string, value: string) => void;
}) {
  return (
    <SettingsPanel
      title="Génération par défaut"
      description="Ces choix sont enregistrés immédiatement pour les prochaines générations de la boutique active."
    >
      <div className="grid gap-0 overflow-hidden rounded-lg border border-border">
        <ChoiceSettingRow
          id="image-provider"
          label="Moteur image"
          description="Fournisseur utilisé pour créer les images."
          value={provider}
          saving={saving === "IMAGE_PROVIDER"}
          badge={provider === "gemini" ? "Gemini actif" : "OpenAI actif"}
          badgeState={provider === "gemini" ? "success" : "neutral"}
          onChange={(value) => void onSwitchSetting("IMAGE_PROVIDER", value)}
          options={[
            { value: "openai", label: "OpenAI" },
            { value: "gemini", label: "Gemini" },
          ]}
        />
        <ChoiceSettingRow
          id="execution-mode"
          label="Mode d’exécution"
          description="Le batch traite les demandes en différé. Le temps réel lance leur traitement immédiatement."
          value={executionMode}
          saving={saving === "GENERATION_EXECUTION_MODE"}
          badge={executionMode === "batch" ? "Mode batch" : "Temps réel"}
          badgeState={executionMode === "batch" ? "success" : "neutral"}
          onChange={(value) =>
            void onSwitchSetting("GENERATION_EXECUTION_MODE", value)
          }
          options={[
            { value: "realtime", label: "Temps réel" },
            { value: "batch", label: "Batch" },
          ]}
        />
      </div>
    </SettingsPanel>
  );
}
