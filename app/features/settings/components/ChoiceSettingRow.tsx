import { BusyIcon, StateBadge } from "@/components/page";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ChoiceSettingRow({
  id,
  label,
  description,
  value,
  options,
  saving,
  badge,
  badgeState,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  saving: boolean;
  badge: string;
  badgeState: "neutral" | "success" | "warning" | "danger";
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 border-b border-white/10 p-4 last:border-b-0 md:grid-cols-[minmax(12rem,18rem)_1fr] md:items-center">
      <div>
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={value} onValueChange={onChange} disabled={saving}>
          <SelectTrigger id={id} className="h-10 min-w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <BusyIcon busy={saving} />
        <StateBadge state={badgeState}>{badge}</StateBadge>
      </div>
    </div>
  );
}
