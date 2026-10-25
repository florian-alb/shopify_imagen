import { ImageRetouchDialog } from "@/components/image-retouch-dialog";
import { JobImagePreviewDialog } from "./JobImagePreviewDialog";
import { JobPublishApprovedDialog } from "./JobPublishApprovedDialog";
import { JobRegenerateImageDialog } from "./JobRegenerateImageDialog";
import type { useJobDetailPage } from "../hooks/useJobDetailPage";

export function JobDetailDialogs({ page }: { page: ReturnType<typeof useJobDetailPage> }) {
  if (!page.viewModel) return null;
  return (
    <>
      <JobImagePreviewDialog
        image={page.previewImage}
        index={page.previewIndex}
        total={page.viewModel.previewImages.length}
        reviewing={page.review.reviewing}
        regenerating={page.previewImage?._id === page.regeneration.regeneratingId}
        onClose={() => page.setPreviewId(null)}
        onMove={page.actions.movePreview}
        onReview={page.actions.reviewPreview}
        onRegenerate={page.actions.regeneratePreview}
        onRetouch={page.actions.retouchPreview}
      />

      <ImageRetouchDialog
        target={page.retouch.target}
        saving={page.retouch.saving}
        onOpenChange={(open) => {
          if (!open) page.retouch.closeRetouch();
        }}
        onPrepareSource={(target) =>
          page.retouch.prepareRetouchSource({ sourceImageId: target.id })
        }
        onSave={page.retouch.saveRetouch}
      />

      <JobRegenerateImageDialog
        image={page.regeneration.regenerationTarget}
        instructions={page.regeneration.regenerationInstructions}
        regenerating={
          page.regeneration.regenerationTarget?._id === page.regeneration.regeneratingId
        }
        onInstructionsChange={page.regeneration.setRegenerationInstructions}
        onClose={page.regeneration.closeRegeneration}
        onRegenerate={() => void page.regeneration.regenerate()}
      />

      <JobPublishApprovedDialog
        destination={page.shopInfo?.domain ?? "Boutique active"}
        open={page.publish.pushOpen}
        targetProduct={page.pushTargetProduct}
        selectedPushableImages={page.viewModel.selectedPushableImages}
        selectedPushProductCount={page.viewModel.selectedPushProductCount}
        replaceExisting={page.publish.replaceExisting}
        starting={page.publish.starting}
        publishDisabled={page.publish.publishDisabled}
        onOpenChange={page.actions.onPublishOpenChange}
        onReplaceExistingChange={page.publish.setReplaceExisting}
        onPush={() => void page.actions.pushApproved()}
      />
    </>
  );
}
