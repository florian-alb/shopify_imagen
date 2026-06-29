import type { BackgroundRemovalProvider } from "../background";
import type { TokenUsage } from "../pricing";
import type { ProviderIds } from "./providerIds";

export type BackgroundPostProcessingMetadata = {
  transparentCutoutUrl?: string | null;
  backgroundRemovalProvider?: BackgroundRemovalProvider | null;
  backgroundRemovalCostUsd?: number;
  backgroundRemovalRequestId?: string | null;
};

export type GeneratedImage = {
  bytes: Buffer;
  contentType: string;
  extension: string;
  usage: TokenUsage;
} & ProviderIds &
  BackgroundPostProcessingMetadata;
