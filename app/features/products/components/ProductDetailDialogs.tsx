import { Lightbox, type UseLightboxResult } from "@/components/common/Lightbox";
import { ImageRetouchDialog } from "@/components/image-retouch-dialog";
import type { useGeneratedImageRetouch } from "@/features/images/hooks/useGeneratedImageRetouch";
import type { Doc } from "@/lib/convex";
import type { useProductImageGeneration } from "../hooks/useProductImageGeneration";
import type { useProductImageDelete } from "../hooks/useProductImageDelete";
import type { VisualGroupsData, VisualGroupWithRows } from "../types";
import { ImageTypeSelectionDialog } from "./ImageTypeSelectionDialog";
import { DeleteImageDialog } from "./DeleteImageDialog";

export function ProductDetailDialogs({ generation, retouch, deletion, lightbox, availableTypes, visualGroupsData, activeGroup }: {
  generation: ReturnType<typeof useProductImageGeneration>;
  retouch: ReturnType<typeof useGeneratedImageRetouch>;
  deletion: ReturnType<typeof useProductImageDelete>;
  lightbox: UseLightboxResult;
  availableTypes: Doc<"promptTemplates">[];
  visualGroupsData: VisualGroupsData | null | undefined;
  activeGroup: VisualGroupWithRows | null;
}) {
  return <>
      <ImageTypeSelectionDialog
        open={generation.open}
        onOpenChange={generation.setOpen}
        types={availableTypes}
        selectedTypes={generation.selectedTypes}
        variants={generation.variants}
        visualGroupsData={visualGroupsData}
        selectedGroupIds={generation.selectedGroupIds}
        textOnlyGroupIds={generation.textOnlyGroupIds}
        focusedGroupId={generation.focusedGroupId}
        onToggleGroup={generation.toggleGroup}
        onToggleGroupReferences={generation.toggleGroupReferences}
        busy={generation.busy}
        onGenerate={() => void generation.generate()}
        title={
          activeGroup
            ? `Générer · ${activeGroup.label}`
            : "Générer les images"
        }
        description={
          activeGroup
            ? "Choisissez les types d’image à générer pour cette déclinaison."
            : "Choisissez les déclinaisons et les types d’image à générer."
        }
        submitLabel="Lancer la génération"
        onToggleType={generation.toggleType}
      />

      <ImageRetouchDialog
        target={retouch.target}
        saving={retouch.saving}
        onOpenChange={(open) => {
          if (!open) retouch.closeRetouch();
        }}
        onPrepareSource={(target) =>
          retouch.prepareRetouchSource({ sourceImageId: target.id })
        }
        onSave={retouch.saveRetouch}
      />

      <Lightbox
        state={lightbox.state}
        onIndexChange={lightbox.setIndex}
        onClose={lightbox.close}
      />

      <DeleteImageDialog
        target={deletion.target}
        busy={deletion.busy}
        onOpenChange={deletion.onOpenChange}
        onConfirm={deletion.confirmDelete}
      />
  </>;
}
