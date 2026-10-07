import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, type Doc, type Id } from "@/lib/convex";
import { errorMessage } from "@/lib/errors";

type PushApprovedOptions = {
  pushableImages: Doc<"generatedImages">[];
};

export type JobImagePublishRun = NonNullable<
  FunctionReturnType<typeof api.jobImagePublishing.latest>
>;

export function useJobImagePublish(jobId: Id<"generationJobs">) {
  const startPublish = useMutation(api.jobImagePublishing.start);
  const publishRun = useQuery(api.jobImagePublishing.latest, { jobId });
  const [pushOpen, setPushOpen] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [starting, setStarting] = useState(false);
  const startPending = useRef(false);
  const [startedRun, setStartedRun] = useState<Id<"imagePublishRuns"> | null>(null);
  const notifiedRun = useRef<Id<"imagePublishRuns"> | null>(null);
  const pushing = starting || publishRun?.status === "running";

  useEffect(() => {
    if (
      !publishRun || publishRun.status === "running" ||
      publishRun._id !== startedRun || publishRun._id === notifiedRun.current
    ) return;
    notifiedRun.current = publishRun._id;
    if (publishRun.status === "completed") {
      toast.success(`${publishRun.pushedImages} images pushed to Shopify`);
    } else {
      toast.error("Shopify push finished with errors", {
        description: `${publishRun.pushedImages} images pushed. Check the job's publication progress for details.`,
      });
    }
  }, [publishRun, startedRun]);

  async function pushApproved({ pushableImages }: PushApprovedOptions) {
    if (startPending.current || pushing || publishRun === undefined || !pushableImages.length) return false;

    startPending.current = true;
    setStarting(true);
    try {
      const runId = await startPublish({
        jobId,
        imageIds: pushableImages.map((image) => image._id),
        replaceExisting,
      });
      setStartedRun(runId);
      setPushOpen(false);
      toast.info("Shopify push started in the background", {
        description: "You can leave this page. Progress is saved on this job.",
      });
      return true;
    } catch (error) {
      toast.error("Could not start Shopify push", { description: errorMessage(error) });
      return false;
    } finally {
      startPending.current = false;
      setStarting(false);
    }
  }

  return {
    pushOpen,
    setPushOpen,
    replaceExisting,
    setReplaceExisting,
    pushing,
    starting,
    publishRun,
    publishDisabled: pushing || publishRun === undefined,
    pushApproved,
  };
}
