import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { BusyIcon, EmptyState, PageHeader, StateBadge } from "@/components/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/settings/prompts")({
  component: PromptSettingsPage
});

const supportedVariables = ["{{PRODUCT_TITLE}}", "{{PRODUCT_HANDLE}}", "{{IMAGE_TYPE}}", "{{FIXATION_TYPE}}"];

function PromptSettingsPage() {
  const prompts = useQuery(api.prompts.list) as Doc<"promptTemplates">[] | undefined;
  const seedDefaults = useMutation(api.prompts.seedDefaults);
  const updatePrompt = useMutation(api.prompts.update);
  const resetPrompt = useMutation(api.prompts.reset);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prompts && prompts.length === 0) void seedDefaults({});
  }, [prompts, seedDefaults]);

  async function save(promptId: Id<"promptTemplates">) {
    const content = drafts[promptId]?.trim();
    if (!content) {
      setError("Prompt content cannot be empty.");
      return;
    }
    setBusy(promptId);
    setError(null);
    try {
      await updatePrompt({ promptId, content });
      setDrafts((current) => {
        const next = { ...current };
        delete next[promptId];
        return next;
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(null);
    }
  }

  async function reset(promptId: Id<"promptTemplates">) {
    setBusy(promptId);
    setError(null);
    try {
      await resetPrompt({ promptId });
      setDrafts((current) => {
        const next = { ...current };
        delete next[promptId];
        return next;
      });
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : String(resetError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page">
      <PageHeader
        eyebrow="Settings"
        title="Prompt templates"
        action={<Button variant="outline" size="lg" onClick={() => void seedDefaults({})}>Seed defaults</Button>}
      />

      <Card className="mb-4 rounded-lg">
        <CardHeader>
          <CardTitle>Supported variables</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {supportedVariables.map((item) => (
            <Badge key={item} variant="outline">{item}</Badge>
          ))}
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {prompts === undefined ? (
        <EmptyState loading title="Loading prompts" body="Fetching prompt templates from Convex." />
      ) : prompts.length === 0 ? (
        <EmptyState title="No prompts yet" body="Seed default prompt templates to start generating images." />
      ) : (
        <section className="grid gap-4">
          {prompts.map((prompt) => (
            <Card key={prompt._id} className="rounded-lg">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">{prompt.label}</CardTitle>
                  <p className="text-sm text-muted-foreground">{prompt.imageType}</p>
                </div>
                <StateBadge state={prompt.isActive ? "success" : "warning"}>
                  {prompt.isActive ? "Active" : "Inactive"}
                </StateBadge>
              </CardHeader>
              <CardContent>
                <Textarea
                  className="min-h-56 font-mono text-xs leading-relaxed"
                  value={drafts[prompt._id] ?? prompt.content}
                  onChange={(event) => setDrafts((current) => ({ ...current, [prompt._id]: event.target.value }))}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => void reset(prompt._id)} disabled={busy === prompt._id}>
                    <BusyIcon busy={busy === prompt._id} />
                    {busy !== prompt._id ? <RotateCcw data-icon="inline-start" /> : null}
                    Reset
                  </Button>
                  <Button onClick={() => void save(prompt._id)} disabled={busy === prompt._id}>
                    <BusyIcon busy={busy === prompt._id} />
                    {busy !== prompt._id ? <Save data-icon="inline-start" /> : null}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </main>
  );
}
