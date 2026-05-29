import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { BusyIcon, PageHeader, StateBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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
  "GEMINI_IMAGE_MODEL",
  "GEMINI_IMAGE_SIZE",
  "GEMINI_IMAGE_ASPECT_RATIO",
  "GEMINI_IMAGE_REQUESTS_PER_MINUTE",
  "VIBE_MODEL",
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

  async function switchSetting(key: string, value: string) {
    setSaving(key);
    try {
      await setSetting({ key, value });
    } finally {
      setSaving(null);
    }
  }

  const provider = String(settings?.IMAGE_PROVIDER ?? "openai");
  const executionMode = String(settings?.GENERATION_EXECUTION_MODE ?? "realtime");
  const vibeAnalysis = String(settings?.VIBE_ANALYSIS ?? "on");

  return (
    <main className="page">
      <PageHeader eyebrow="Settings" title="Generation settings" />
      <Card className="mb-4 rounded-lg">
        <CardContent className="grid gap-4 pt-1 md:grid-cols-[270px_1fr] md:items-center">
          <div>
            <Label htmlFor="image-provider" className="font-medium">Image generation engine</Label>
            <p className="mt-1 text-sm text-muted-foreground">Applied to new background jobs.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={provider} onValueChange={(value) => void switchSetting("IMAGE_PROVIDER", value)} disabled={saving === "IMAGE_PROVIDER"}>
              <SelectTrigger id="image-provider" className="h-10 min-w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI Images</SelectItem>
                <SelectItem value="gemini">Nano Banana Pro (Gemini)</SelectItem>
              </SelectContent>
            </Select>
            <BusyIcon busy={saving === "IMAGE_PROVIDER"} />
            <StateBadge state={provider === "gemini" ? "success" : "neutral"}>
              {provider === "gemini" ? "Nano Banana Pro active" : "OpenAI active"}
            </StateBadge>
          </div>
          <Separator className="md:col-span-2" />
          <div>
            <Label htmlFor="execution-mode" className="font-medium">Execution mode</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Batch is ~50% cheaper but asynchronous (results can take up to ~24h).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={executionMode} onValueChange={(value) => void switchSetting("GENERATION_EXECUTION_MODE", value)} disabled={saving === "GENERATION_EXECUTION_MODE"}>
              <SelectTrigger id="execution-mode" className="h-10 min-w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="realtime">Real-time (instant, full price)</SelectItem>
                <SelectItem value="batch">Batch (~50% cheaper, async)</SelectItem>
              </SelectContent>
            </Select>
            <BusyIcon busy={saving === "GENERATION_EXECUTION_MODE"} />
            <StateBadge state={executionMode === "batch" ? "success" : "neutral"}>
              {executionMode === "batch" ? "Batch mode" : "Real-time mode"}
            </StateBadge>
          </div>
          <Separator className="md:col-span-2" />
          <div>
            <Label htmlFor="vibe-analysis" className="font-medium">Scene vibe analysis</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Analyzes the product image once with a low-cost vision model to steer the generated scene (e.g. kids room vs. living room).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={vibeAnalysis} onValueChange={(value) => void switchSetting("VIBE_ANALYSIS", value)} disabled={saving === "VIBE_ANALYSIS"}>
              <SelectTrigger id="vibe-analysis" className="h-10 min-w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on">On (recommended)</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
            <BusyIcon busy={saving === "VIBE_ANALYSIS"} />
            <StateBadge state={vibeAnalysis === "on" ? "success" : "neutral"}>
              {vibeAnalysis === "on" ? "Vibe analysis on" : "Vibe analysis off"}
            </StateBadge>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-lg py-0">
        {settingFields.map((key, index) => (
          <div key={key}>
            {index ? <Separator /> : null}
            <CardContent className="grid gap-3 py-4 md:grid-cols-[270px_1fr_auto] md:items-center">
              <div>
                <Label htmlFor={key} className="font-medium">{key}</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  {key.startsWith("GEMINI_") ? "Used when Nano Banana Pro is active." : key.startsWith("OPENAI_") ? "Used when OpenAI is active." : "Used by all generation actions."}
                </p>
              </div>
              <Input
                id={key}
                className="h-10"
                value={drafts[key] ?? String(settings?.[key] ?? "")}
                onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
              />
              <Button variant="outline" disabled={saving === key} onClick={() => void save(key)}>
                <BusyIcon busy={saving === key} />
                Save
              </Button>
            </CardContent>
          </div>
        ))}
      </Card>
    </main>
  );
}
