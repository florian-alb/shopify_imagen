import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Button, PageHeader } from "../../components/ui";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/settings/")({
  component: SettingsPage
});

const settingFields = [
  "OPENAI_IMAGE_MODEL",
  "OPENAI_IMAGE_SIZE",
  "OPENAI_IMAGE_QUALITY",
  "OPENAI_IMAGE_OUTPUT_FORMAT",
  "OPENAI_IMAGE_REQUESTS_PER_MINUTE",
  "GENERATION_CONCURRENCY"
] as const;

function SettingsPage() {
  const settings = useQuery(api.settings.list);
  const setSetting = useMutation(api.settings.set);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function save(key: string) {
    setSaving(key);
    const raw = drafts[key] ?? String(settings?.[key] ?? "");
    const value = /^\d+$/.test(raw) ? Number(raw) : raw;
    try {
      await setSetting({ key, value });
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="page">
      <PageHeader eyebrow="Settings" title="Generation settings" />
      <section className="panel divide-y divide-[var(--border)]">
        {settingFields.map((key) => (
          <div key={key} className="grid gap-3 p-4 md:grid-cols-[260px_1fr_auto] md:items-center">
            <div>
              <div className="font-semibold">{key}</div>
              <div className="text-sm text-[var(--muted)]">Used by Convex generation actions.</div>
            </div>
            <input
              className="input"
              value={drafts[key] ?? String(settings?.[key] ?? "")}
              onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
            />
            <Button variant="secondary" loading={saving === key} onClick={() => void save(key)}>
              Save
            </Button>
          </div>
        ))}
      </section>
    </main>
  );
}
