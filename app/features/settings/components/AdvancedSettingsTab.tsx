import { advancedSettings } from "../settingsData";
import type { SettingsDrafts, SettingsMap } from "../types";
import { SettingTable } from "./SettingTable";
import { SettingsPanel } from "./SettingsPanel";

export function AdvancedSettingsTab({
  drafts,
  provider,
  saving,
  settings,
  onDraftChange,
  onSave,
}: {
  drafts: SettingsDrafts;
  provider: string;
  saving: string | null;
  settings: SettingsMap | undefined;
  onDraftChange: (key: string, value: string) => void;
  onSave: (key: string) => void;
}) {
  return (
    <SettingsPanel
      title="Avance"
      description="Limites techniques et concurrence des generations."
    >
      <SettingTable
        definitions={advancedSettings}
        drafts={drafts}
        provider={provider}
        saving={saving}
        settings={settings}
        onDraftChange={onDraftChange}
        onSave={onSave}
      />
    </SettingsPanel>
  );
}
