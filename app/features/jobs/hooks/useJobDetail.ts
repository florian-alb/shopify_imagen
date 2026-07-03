import { useQuery } from "convex/react";
import { api, type Doc, type Id } from "@/lib/convex";

export type JobDetail = {
  job: Doc<"generationJobs">;
  images: Doc<"generatedImages">[];
  products: Doc<"products">[];
} | null;

export function useJobDetail(jobId: string) {
  const data = useQuery(api.jobs.get, { jobId: jobId as Id<"generationJobs"> }) as JobDetail | undefined;
  const shopInfo = useQuery(api.settings.shopInfo);

  return { data, shopInfo };
}
