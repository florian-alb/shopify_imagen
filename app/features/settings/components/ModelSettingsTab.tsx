import { modelSettings } from "../settingsData";
import type { SettingsDrafts, SettingsMap } from "../types";
import { SettingTable } from "./SettingTable";
import { SettingsPanel } from "./SettingsPanel";

export function ModelSettingsTab({
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
      title="Modeles"
      description="Parametres de modeles et formats par provider."
    >
      <SettingTable
        definitions={modelSettings}
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
