import type { ProviderIds } from "./providerIds";

export class ProviderGenerationError extends Error {
  providerIds: ProviderIds;

  constructor(message: string, providerIds: ProviderIds) {
    super(message);
    this.providerIds = providerIds;
  }
}
