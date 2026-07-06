import { BusyIcon, StateBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { settingIsActive, settingString } from "../lib/settingsHelpers";
import type { SettingDefinition, SettingsDrafts, SettingsMap } from "../types";

export function SettingTable({
  definitions,
  settings,
  drafts,
  saving,
  provider,
  onDraftChange,
  onSave,
}: {
  definitions: SettingDefinition[];
  settings: SettingsMap | undefined;
  drafts: SettingsDrafts;
  saving: string | null;
  provider: string;
  onDraftChange: (key: string, value: string) => void;
  onSave: (key: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table className="[&_td]:h-16 [&_th]:text-[0.72rem] [&_th]:font-medium [&_th]:text-muted-foreground">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Parametre</TableHead>
            <TableHead>Valeur</TableHead>
            <TableHead>Etat</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {definitions.map((definition) => {
            const currentValue = settingString(settings, definition.key);
            const value = drafts[definition.key] ?? currentValue;
            const dirty = drafts[definition.key] !== undefined;
            return (
              <TableRow key={definition.key}>
                <TableCell className="min-w-72">
                  <div>
                    <Label htmlFor={definition.key} className="font-medium">
                      {definition.label}
                    </Label>
                    <p className="mt-1 text-xs font-mono text-muted-foreground">
                      {definition.key}
                    </p>
                    <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                      {definition.description}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="min-w-64">
                  <Input
                    id={definition.key}
                    className="h-10 font-mono text-sm"
                    value={value}
                    onChange={(event) =>
                      onDraftChange(definition.key, event.target.value)
                    }
                  />
                </TableCell>
                <TableCell>
                  {dirty ? (
                    <StateBadge state="warning">Modifie</StateBadge>
                  ) : (
                    <StateBadge
                      state={
                        settingIsActive(definition, provider)
                          ? "success"
                          : "neutral"
                      }
                    >
                      {settingIsActive(definition, provider)
                        ? "Actif"
                        : "Disponible"}
                    </StateBadge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving === definition.key}
                    onClick={() => onSave(definition.key)}
                  >
                    <BusyIcon busy={saving === definition.key} />
                    Enregistrer
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
