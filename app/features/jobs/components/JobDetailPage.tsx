import { ImageRetouchDialog } from "@/components/image-retouch-dialog";
import { EmptyState, pageContentClass } from "@/components/page";
import { JobDetailHeader } from "./JobDetailHeader";
import { JobImagePreviewDialog } from "./JobImagePreviewDialog";
import { JobProductReviewGrid } from "./JobProductReviewGrid";
import { JobProgressCard } from "./JobProgressCard";
import { JobPublishApprovedDialog } from "./JobPublishApprovedDialog";
import { JobRegenerateImageDialog } from "./JobRegenerateImageDialog";
import { JobReviewToolbar } from "./JobReviewToolbar";
import { JobStickyPublishBar } from "./JobStickyPublishBar";
import { JobTechnicalDetails } from "./JobTechnicalDetails";
import { useJobDetailPage } from "../hooks/useJobDetailPage";

export function JobDetailPage({ jobId }: { jobId: string }) {
  const page = useJobDetailPage(jobId);

  if (page.data === undefined) {
    return (
      <main className={pageContentClass}>
        <EmptyState
          loading
          title="Loading job"
          body="Realtime job progress is coming from Convex."
        />
      </main>
    );
  }

  if (!page.job || !page.viewModel) {
    return (
      <main className={pageContentClass}>
        <EmptyState
          title="Job not found"
          body="It may have been deleted or belongs to another shop."
        />
      </main>
    );
  }

  return (
    <main className={pageContentClass}>
      <JobDetailHeader
        job={page.job}
        jobState={page.viewModel.jobState}
        reviewBadge={page.reviewBadge}
        canForcePoll={page.viewModel.canForcePoll}
        canCancelJob={page.viewModel.canCancelJob}
        polling={page.polling}
        cancelling={page.cancelling}
        retrying={page.retrying}
        onForcePoll={() => void page.actions.forcePoll()}
        onCancel={() => void page.actions.cancel()}
        onRetry={() => void page.actions.retry()}
      />

      <JobProgressCard
        job={page.job}
        progress={page.viewModel.jobProgressPercent}
        jobCost={page.viewModel.jobCost}
      />

      <JobReviewToolbar
        executionMode={page.job.executionMode}
        images={page.images}
        filter={page.filter}
        visibleReviewableCount={page.viewModel.visibleReviewable.length}
        reviewing={page.review.reviewing}
        counts={page.viewModel.reviewCounts}
        onFilterChange={page.setFilter}
        onApproveVisible={page.actions.reviewVisible}
      />

      <JobProductReviewGrid
        productRows={page.viewModel.productRows}
        reviewing={page.review.reviewing}
        retrying={page.retrying}
        publishing={page.publish.pushing}
        pushTargetProductId={page.pushTargetProductId}
        regeneratingId={page.regeneration.regeneratingId}
        onPreview={page.setPreviewId}
        onReview={(imageIds, reviewStatus) =>
          void page.review.setReview(imageIds, reviewStatus)
        }
        onPublishApproved={page.actions.openProductPublish}
        onRegenerate={page.regeneration.openRegeneration}
        onRetouch={page.retouch.openRetouch}
        onRetry={page.actions.retryImage}
      />

      <JobTechnicalDetails images={page.images} job={page.job} />

      <JobStickyPublishBar
        reviewableCount={page.viewModel.reviewableImages.length}
        approvedCount={page.viewModel.approvedImages.length}
        pendingCount={page.viewModel.pendingCount}
        rejectedCount={page.viewModel.rejectedCount}
        pushableCount={page.viewModel.pushableImages.length}
        onPublish={page.actions.openGlobalPublish}
        onApproveVisible={page.actions.reviewVisible}
        visibleReviewableCount={page.viewModel.visibleReviewable.length}
        reviewing={page.review.reviewing}
      />

      <JobImagePreviewDialog
        image={page.previewImage}
        index={page.previewIndex}
        total={page.viewModel.previewImages.length}
        reviewing={page.review.reviewing}
        regenerating={
          page.previewImage?._id === page.regeneration.regeneratingId
        }
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
          page.regeneration.regenerationTarget?._id ===
          page.regeneration.regeneratingId
        }
        onInstructionsChange={page.regeneration.setRegenerationInstructions}
        onClose={page.regeneration.closeRegeneration}
        onRegenerate={() => void page.regeneration.regenerate()}
      />

      <JobPublishApprovedDialog
        open={page.publish.pushOpen}
        targetProduct={page.pushTargetProduct}
        selectedPushableImages={page.viewModel.selectedPushableImages}
        selectedPushProductCount={page.viewModel.selectedPushProductCount}
        replaceExisting={page.publish.replaceExisting}
        pushing={page.publish.pushing}
        pushedProducts={page.publish.pushedProducts}
        onOpenChange={page.actions.onPublishOpenChange}
        onReplaceExistingChange={page.publish.setReplaceExisting}
        onPush={() => void page.actions.pushApproved()}
      />
    </main>
  );
}
