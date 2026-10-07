/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as background from "../background.js";
import type * as bulkOperations from "../bulkOperations.js";
import type * as bulkReorders from "../bulkReorders.js";
import type * as bulkReorders_model from "../bulkReorders/model.js";
import type * as bulkTransforms from "../bulkTransforms.js";
import type * as bulkTransforms_image from "../bulkTransforms/image.js";
import type * as bulkTransforms_model from "../bulkTransforms/model.js";
import type * as bulkTransformsNode from "../bulkTransformsNode.js";
import type * as catalogue_ai from "../catalogue/ai.js";
import type * as catalogue_extract from "../catalogue/extract.js";
import type * as catalogue_graphql from "../catalogue/graphql.js";
import type * as catalogue_model from "../catalogue/model.js";
import type * as catalogue_network from "../catalogue/network.js";
import type * as catalogue_shopify from "../catalogue/shopify.js";
import type * as catalogue_shopifyModel from "../catalogue/shopifyModel.js";
import type * as catalogue_source from "../catalogue/source.js";
import type * as catalogue_storage from "../catalogue/storage.js";
import type * as catalogueActions from "../catalogueActions.js";
import type * as catalogues from "../catalogues.js";
import type * as crons from "../crons.js";
import type * as generation from "../generation.js";
import type * as generation_backgroundPostProcessing from "../generation/backgroundPostProcessing.js";
import type * as generation_backgroundRemoval from "../generation/backgroundRemoval.js";
import type * as generation_batchIngestion from "../generation/batchIngestion.js";
import type * as generation_batchPollingRules from "../generation/batchPollingRules.js";
import type * as generation_batchTypes from "../generation/batchTypes.js";
import type * as generation_concurrency from "../generation/concurrency.js";
import type * as generation_download from "../generation/download.js";
import type * as generation_errors from "../generation/errors.js";
import type * as generation_formats from "../generation/formats.js";
import type * as generation_gemini from "../generation/gemini.js";
import type * as generation_geminiBatch from "../generation/geminiBatch.js";
import type * as generation_geminiBatchClient from "../generation/geminiBatchClient.js";
import type * as generation_geminiStream from "../generation/geminiStream.js";
import type * as generation_images from "../generation/images.js";
import type * as generation_openAi from "../generation/openAi.js";
import type * as generation_openAiBatch from "../generation/openAiBatch.js";
import type * as generation_openAiDurableClient from "../generation/openAiDurableClient.js";
import type * as generation_providerIds from "../generation/providerIds.js";
import type * as generation_requestTimeout from "../generation/requestTimeout.js";
import type * as generation_runtime from "../generation/runtime.js";
import type * as generation_storage from "../generation/storage.js";
import type * as generation_types from "../generation/types.js";
import type * as generation_vibe from "../generation/vibe.js";
import type * as generationTargets from "../generationTargets.js";
import type * as googleFeed from "../googleFeed.js";
import type * as googleFeed_graphql from "../googleFeed/graphql.js";
import type * as googleFeed_model from "../googleFeed/model.js";
import type * as googleFeed_shopify from "../googleFeed/shopify.js";
import type * as googleFeed_validators from "../googleFeed/validators.js";
import type * as googleFeedActions from "../googleFeedActions.js";
import type * as http from "../http.js";
import type * as jobImagePublishing from "../jobImagePublishing.js";
import type * as jobs from "../jobs.js";
import type * as jobs_engine from "../jobs/engine.js";
import type * as jobs_lifecycle from "../jobs/lifecycle.js";
import type * as jobs_listing from "../jobs/listing.js";
import type * as jobs_planning from "../jobs/planning.js";
import type * as jobs_prepare from "../jobs/prepare.js";
import type * as jobs_summaries from "../jobs/summaries.js";
import type * as jobs_targets from "../jobs/targets.js";
import type * as jobs_validators from "../jobs/validators.js";
import type * as lib from "../lib.js";
import type * as openAiDurable from "../openAiDurable.js";
import type * as openAiDurableActions from "../openAiDurableActions.js";
import type * as pricing from "../pricing.js";
import type * as productVisualContext from "../productVisualContext.js";
import type * as products from "../products.js";
import type * as products_catalog from "../products/catalog.js";
import type * as promptConditions from "../promptConditions.js";
import type * as promptRuntime from "../promptRuntime.js";
import type * as prompts from "../prompts.js";
import type * as prompts_access from "../prompts/access.js";
import type * as prompts_repository from "../prompts/repository.js";
import type * as retouch from "../retouch.js";
import type * as settings from "../settings.js";
import type * as settings_scope from "../settings/scope.js";
import type * as shared_productWorkflow from "../shared/productWorkflow.js";
import type * as shopScope from "../shopScope.js";
import type * as shopify from "../shopify.js";
import type * as shopify_authorization from "../shopify/authorization.js";
import type * as shopify_client from "../shopify/client.js";
import type * as shopify_graphql from "../shopify/graphql.js";
import type * as shopify_media from "../shopify/media.js";
import type * as shopify_oauth from "../shopify/oauth.js";
import type * as shopify_productMapping from "../shopify/productMapping.js";
import type * as shopify_productQuery from "../shopify/productQuery.js";
import type * as shopify_publicationIdentity from "../shopify/publicationIdentity.js";
import type * as shopify_publicationSchema from "../shopify/publicationSchema.js";
import type * as shopify_publicationTargets from "../shopify/publicationTargets.js";
import type * as shopify_reorder from "../shopify/reorder.js";
import type * as shopify_scopes from "../shopify/scopes.js";
import type * as shopify_variantMedia from "../shopify/variantMedia.js";
import type * as shopifyPublications from "../shopifyPublications.js";
import type * as shops from "../shops.js";
import type * as userAccess from "../userAccess.js";
import type * as users from "../users.js";
import type * as visualGroupAnalysis from "../visualGroupAnalysis.js";
import type * as visualGroupAnalysis_model from "../visualGroupAnalysis/model.js";
import type * as visualGroups from "../visualGroups.js";
import type * as visualGroups_model from "../visualGroups/model.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authz: typeof authz;
  background: typeof background;
  bulkOperations: typeof bulkOperations;
  bulkReorders: typeof bulkReorders;
  "bulkReorders/model": typeof bulkReorders_model;
  bulkTransforms: typeof bulkTransforms;
  "bulkTransforms/image": typeof bulkTransforms_image;
  "bulkTransforms/model": typeof bulkTransforms_model;
  bulkTransformsNode: typeof bulkTransformsNode;
  "catalogue/ai": typeof catalogue_ai;
  "catalogue/extract": typeof catalogue_extract;
  "catalogue/graphql": typeof catalogue_graphql;
  "catalogue/model": typeof catalogue_model;
  "catalogue/network": typeof catalogue_network;
  "catalogue/shopify": typeof catalogue_shopify;
  "catalogue/shopifyModel": typeof catalogue_shopifyModel;
  "catalogue/source": typeof catalogue_source;
  "catalogue/storage": typeof catalogue_storage;
  catalogueActions: typeof catalogueActions;
  catalogues: typeof catalogues;
  crons: typeof crons;
  generation: typeof generation;
  "generation/backgroundPostProcessing": typeof generation_backgroundPostProcessing;
  "generation/backgroundRemoval": typeof generation_backgroundRemoval;
  "generation/batchIngestion": typeof generation_batchIngestion;
  "generation/batchPollingRules": typeof generation_batchPollingRules;
  "generation/batchTypes": typeof generation_batchTypes;
  "generation/concurrency": typeof generation_concurrency;
  "generation/download": typeof generation_download;
  "generation/errors": typeof generation_errors;
  "generation/formats": typeof generation_formats;
  "generation/gemini": typeof generation_gemini;
  "generation/geminiBatch": typeof generation_geminiBatch;
  "generation/geminiBatchClient": typeof generation_geminiBatchClient;
  "generation/geminiStream": typeof generation_geminiStream;
  "generation/images": typeof generation_images;
  "generation/openAi": typeof generation_openAi;
  "generation/openAiBatch": typeof generation_openAiBatch;
  "generation/openAiDurableClient": typeof generation_openAiDurableClient;
  "generation/providerIds": typeof generation_providerIds;
  "generation/requestTimeout": typeof generation_requestTimeout;
  "generation/runtime": typeof generation_runtime;
  "generation/storage": typeof generation_storage;
  "generation/types": typeof generation_types;
  "generation/vibe": typeof generation_vibe;
  generationTargets: typeof generationTargets;
  googleFeed: typeof googleFeed;
  "googleFeed/graphql": typeof googleFeed_graphql;
  "googleFeed/model": typeof googleFeed_model;
  "googleFeed/shopify": typeof googleFeed_shopify;
  "googleFeed/validators": typeof googleFeed_validators;
  googleFeedActions: typeof googleFeedActions;
  http: typeof http;
  jobImagePublishing: typeof jobImagePublishing;
  jobs: typeof jobs;
  "jobs/engine": typeof jobs_engine;
  "jobs/lifecycle": typeof jobs_lifecycle;
  "jobs/listing": typeof jobs_listing;
  "jobs/planning": typeof jobs_planning;
  "jobs/prepare": typeof jobs_prepare;
  "jobs/summaries": typeof jobs_summaries;
  "jobs/targets": typeof jobs_targets;
  "jobs/validators": typeof jobs_validators;
  lib: typeof lib;
  openAiDurable: typeof openAiDurable;
  openAiDurableActions: typeof openAiDurableActions;
  pricing: typeof pricing;
  productVisualContext: typeof productVisualContext;
  products: typeof products;
  "products/catalog": typeof products_catalog;
  promptConditions: typeof promptConditions;
  promptRuntime: typeof promptRuntime;
  prompts: typeof prompts;
  "prompts/access": typeof prompts_access;
  "prompts/repository": typeof prompts_repository;
  retouch: typeof retouch;
  settings: typeof settings;
  "settings/scope": typeof settings_scope;
  "shared/productWorkflow": typeof shared_productWorkflow;
  shopScope: typeof shopScope;
  shopify: typeof shopify;
  "shopify/authorization": typeof shopify_authorization;
  "shopify/client": typeof shopify_client;
  "shopify/graphql": typeof shopify_graphql;
  "shopify/media": typeof shopify_media;
  "shopify/oauth": typeof shopify_oauth;
  "shopify/productMapping": typeof shopify_productMapping;
  "shopify/productQuery": typeof shopify_productQuery;
  "shopify/publicationIdentity": typeof shopify_publicationIdentity;
  "shopify/publicationSchema": typeof shopify_publicationSchema;
  "shopify/publicationTargets": typeof shopify_publicationTargets;
  "shopify/reorder": typeof shopify_reorder;
  "shopify/scopes": typeof shopify_scopes;
  "shopify/variantMedia": typeof shopify_variantMedia;
  shopifyPublications: typeof shopifyPublications;
  shops: typeof shops;
  userAccess: typeof userAccess;
  users: typeof users;
  visualGroupAnalysis: typeof visualGroupAnalysis;
  "visualGroupAnalysis/model": typeof visualGroupAnalysis_model;
  visualGroups: typeof visualGroups;
  "visualGroups/model": typeof visualGroups_model;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
