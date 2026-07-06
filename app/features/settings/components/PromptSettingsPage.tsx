import { Plus } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePromptSettingsPage } from "../hooks/usePromptSettingsPage";
import { supportedVariables } from "../lib/promptTemplateDrafts";
import { MasterPromptPanel } from "./MasterPromptPanel";
import { NewPromptTemplateEditor } from "./NewPromptTemplateEditor";
import { PromptDeleteDialog } from "./PromptDeleteDialog";
import { PromptTabs } from "./PromptTabs";
import { PromptTemplateEditor } from "./PromptTemplateEditor";

export function PromptSettingsPage() {
  const page = usePromptSettingsPage();
  const { busy, master, masterPrompt, orderedPrompts, reorder, templates } =
    page;

  return (
    <main className="mx-auto w-full max-w-[96rem] p-4 md:p-5">
      <PageHeader eyebrow="Configuration" title="Prompts">
        Editeur des prompts utilises par les generations image.
      </PageHeader>

      <Card className="mb-4 rounded-lg">
        <CardHeader>
          <CardTitle>Variables disponibles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {supportedVariables.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className="h-6 border border-border bg-secondary px-2.5 font-mono text-[0.72rem] text-secondary-foreground"
            >
              {item}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <MasterPromptPanel
        busy={busy}
        masterPrompt={masterPrompt}
        masterPromptDirty={master.masterPromptDirty}
        masterPromptValue={master.masterPromptValue}
        onChangeMasterPrompt={master.updateMasterDraft}
        onDeleteReference={(key) => void master.deleteModelReference(key)}
        onSaveMasterPrompt={() => void master.saveMaster()}
        onUploadReference={(key, file) =>
          void master.uploadModelReference(key, file)
        }
      />

      {orderedPrompts === undefined ? (
        <EmptyState
          loading
          title="Chargement des prompts"
          body="Lecture des templates depuis Convex."
        />
      ) : orderedPrompts.length === 0 && !templates.newPromptDraft ? (
        <EmptyState
          title="Aucun prompt"
          body="Creez un template pour demarrer les generations."
          children={
            <Button size="sm" onClick={templates.startCreate}>
              <Plus data-icon="inline-start" />
              Nouveau template
            </Button>
          }
        />
      ) : (
        <PromptTabs
          currentTab={templates.currentTab}
          dragId={reorder.dragId}
          imageTypeDrafts={templates.imageTypeDrafts}
          newPromptDraft={templates.newPromptDraft}
          orderedPrompts={orderedPrompts}
          onCommitReorder={() => void reorder.commitReorder()}
          onReorderOver={reorder.reorderOver}
          onStartDrag={reorder.startDrag}
          onTabChange={templates.setActiveTab}
          onCreateTemplate={templates.startCreate}
        >
          {templates.newPromptDraft ? (
            <NewPromptTemplateEditor
              busy={busy}
              canCreatePrompt={templates.canCreatePrompt}
              newPromptDraft={templates.newPromptDraft}
              newPromptAiValue={templates.newPromptAiValue(
                templates.newPromptDraft,
              )}
              onCancel={templates.cancelCreate}
              onCreate={() => void templates.create()}
              onUpdateAiDraft={templates.updateNewPromptAiDraft}
              onUpdateDraft={templates.updateNewPromptDraft}
            />
          ) : null}

          {orderedPrompts.map((prompt) => (
            <PromptTemplateEditor
              key={prompt._id}
              busy={busy}
              editing={templates.editingPromptNameId === prompt._id}
              prompt={prompt}
              state={templates.getPromptEditorState(prompt)}
              onCancelNameEdit={templates.clearImageTypeDraft}
              onChangeAi={templates.updateAiDraft}
              onChangeBackground={templates.updateBackgroundDraft}
              onChangeContent={templates.updateContentDraft}
              onChangeImageType={templates.updateImageTypeDraft}
              onChangePromptKind={templates.updatePromptKindDraft}
              onDelete={templates.openDeletePrompt}
              onSave={(promptId) => void templates.savePrompt(promptId)}
              onStartNameEdit={templates.setEditingPromptNameId}
              onStopNameEdit={() => templates.setEditingPromptNameId(null)}
              onTogglePreset={(promptId, isPreset) =>
                void templates.togglePreset(promptId, isPreset)
              }
            />
          ))}
        </PromptTabs>
      )}

      <PromptDeleteDialog
        busy={busy}
        deleteTarget={templates.deleteTarget}
        onClose={templates.closeDeletePrompt}
        onDelete={() => {
          if (templates.deleteTarget) {
            void templates.deletePrompt(templates.deleteTarget._id);
          }
        }}
      />
    </main>
  );
}
