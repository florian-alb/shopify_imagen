import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, EmptyState, PageHeader } from "../../components/ui";
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
      <PageHeader eyebrow="Settings" title="Prompt templates" action={<Button variant="secondary" onClick={() => void seedDefaults({})}>Seed defaults</Button>} />

      <section className="panel mb-4 p-4">
        <div className="mb-2 text-sm font-semibold">Supported variables</div>
        <div className="flex flex-wrap gap-2">
          {supportedVariables.map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
        </div>
      </section>

      {error ? <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{error}</div> : null}

      {prompts === undefined ? (
        <EmptyState title="Loading prompts" body="Fetching prompt templates from Convex." />
      ) : prompts.length === 0 ? (
        <EmptyState title="No prompts yet" body="Seed default prompt templates to start generating images." />
      ) : (
        <section className="grid gap-4">
          {prompts.map((prompt) => (
            <article key={prompt._id} className="panel p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{prompt.label}</h2>
                  <p className="text-sm text-[var(--muted)]">{prompt.imageType}</p>
                </div>
                <Badge tone={prompt.isActive ? "success" : "warning"}>{prompt.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <textarea
                className="textarea"
                value={drafts[prompt._id] ?? prompt.content}
                onChange={(event) => setDrafts((current) => ({ ...current, [prompt._id]: event.target.value }))}
              />
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => void reset(prompt._id)} loading={busy === prompt._id}>
                  <RotateCcw size={16} />
                  Reset
                </Button>
                <Button onClick={() => void save(prompt._id)} loading={busy === prompt._id}>
                  <Save size={16} />
                  Save
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
