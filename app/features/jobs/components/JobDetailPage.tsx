import { useNavigate } from "@tanstack/react-router";
import { EmptyState, pageContentClass } from "@/components/page";
import { JobDetailDialogs } from "./JobDetailDialogs";
import type { JobDetailSearch } from "../lib/jobDetailSearch";
import { validateJobSearch } from "../lib/jobSearch";
import { JobDetailHeader } from "./JobDetailHeader";
import { JobProductReviewGrid } from "./JobProductReviewGrid";
import { JobProgressCard } from "./JobProgressCard";
import { JobPublishProgressCard } from "./JobPublishProgressCard";
import { JobReviewToolbar } from "./JobReviewToolbar";
import { JobStickyPublishBar } from "./JobStickyPublishBar";
import { JobTechnicalDetails } from "./JobTechnicalDetails";
import { useJobDetailPage } from "../hooks/useJobDetailPage";
import { useJobHistoryActions } from "../hooks/useJobHistoryActions";
import { DeleteJobDialog } from "./DeleteJobDialog";

export function JobDetailPage({ jobId, search }: { jobId: string; search: JobDetailSearch }) {
  const page = useJobDetailPage(jobId, search.images ?? "all");
  const navigate = useNavigate();
  const history = useJobHistoryActions({ onRemoved: () => void navigate({ to: "/jobs", search: validateJobSearch(search) }) });

  if (page.data === undefined) {
    return (
      <main className={pageContentClass}>
        <EmptyState
          loading
          title="Chargement du lot"
          body="Lecture des images et de la progression."
        />
      </main>
    );
  }

  if (!page.job || !page.viewModel) {
    return (
      <main className={pageContentClass}>
        <EmptyState
          title="Génération introuvable"
          body="Elle a peut-être été supprimée ou appartient à une autre boutique."
        />
      </main>
    );
  }

  return (
    <main className={pageContentClass}>
      <JobDetailHeader
        search={search}
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
        historyBusy={history.busyJobId !== null || page.publish.pushing}
        onArchive={() => { if (page.job) void history.toggleArchived(page.job); }}
        onDelete={() => history.setDeleteTarget(page.job)}
      />

      <DeleteJobDialog target={history.deleteTarget} busy={history.busyJobId !== null}
        onOpenChange={history.onDeleteOpenChange} onConfirm={() => void history.confirmRemoval()} />

      <JobProgressCard
        job={page.job}
        progress={page.viewModel.jobProgressPercent}
        jobCost={page.viewModel.jobCost}
        batchProgress={page.viewModel.batchProgress}
      />

      <JobReviewToolbar
        executionMode={page.job.executionMode}
        images={page.images}
        filter={page.filter}
        visibleReviewableCount={page.viewModel.visibleReviewable.length}
        reviewing={page.review.reviewing}
        counts={page.viewModel.reviewCounts}
        onFilterChange={images => { void navigate({ to: "/jobs/$jobId", params: { jobId }, search: { ...search, images }, replace: true, resetScroll: false }); }}
        onApproveVisible={page.actions.reviewVisible}
      />

      <JobPublishProgressCard run={page.publish.publishRun} />

      <JobProductReviewGrid
        productRows={page.viewModel.productRows}
        reviewing={page.review.reviewing}
        retrying={page.retrying}
        publishing={page.publish.publishDisabled}
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

      <JobTechnicalDetails images={page.images} job={page.job} segments={page.segments} />

      <JobStickyPublishBar
        publishing={page.publish.publishDisabled}
        publishRun={page.publish.publishRun}
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

      <JobDetailDialogs page={page} />

    </main>
  );
}
