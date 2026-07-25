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
      title="Generation"
      description="Reglages appliques aux nouveaux jobs de la boutique active."
    >
      <div className="grid gap-0 overflow-hidden rounded-lg border border-border">
        <ChoiceSettingRow
          id="image-provider"
          label="Moteur image"
          description="Provider utilise pour les prochaines generations."
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
          label="Mode d'execution"
          description="Le batch termine en asynchrone, le temps reel repond tout de suite."
          value={executionMode}
          saving={saving === "GENERATION_EXECUTION_MODE"}
          badge={executionMode === "batch" ? "Mode batch" : "Temps reel"}
          badgeState={executionMode === "batch" ? "success" : "neutral"}
          onChange={(value) =>
            void onSwitchSetting("GENERATION_EXECUTION_MODE", value)
          }
          options={[
            { value: "realtime", label: "Temps reel" },
            { value: "batch", label: "Batch" },
          ]}
        />
      </div>
    </SettingsPanel>
  );
}
