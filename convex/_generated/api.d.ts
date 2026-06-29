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
import type * as generation_providerIds from "../generation/providerIds.js";
import type * as generation_runtime from "../generation/runtime.js";
import type * as generation_storage from "../generation/storage.js";
import type * as generation_types from "../generation/types.js";
import type * as generation_vibe from "../generation/vibe.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as jobs_engine from "../jobs/engine.js";
import type * as jobs_lifecycle from "../jobs/lifecycle.js";
import type * as jobs_planning from "../jobs/planning.js";
import type * as jobs_summaries from "../jobs/summaries.js";
import type * as jobs_validators from "../jobs/validators.js";
import type * as lib from "../lib.js";
import type * as pricing from "../pricing.js";
import type * as products from "../products.js";
import type * as products_catalog from "../products/catalog.js";
import type * as promptDefaults from "../promptDefaults.js";
import type * as promptRuntime from "../promptRuntime.js";
import type * as prompts from "../prompts.js";
import type * as prompts_access from "../prompts/access.js";
import type * as prompts_repository from "../prompts/repository.js";
import type * as settings from "../settings.js";
import type * as settings_scope from "../settings/scope.js";
import type * as shared_productWorkflow from "../shared/productWorkflow.js";
import type * as shopScope from "../shopScope.js";
import type * as shopify from "../shopify.js";
import type * as shopify_client from "../shopify/client.js";
import type * as shopify_graphql from "../shopify/graphql.js";
import type * as shopify_media from "../shopify/media.js";
import type * as shopify_productMapping from "../shopify/productMapping.js";
import type * as shops from "../shops.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authz: typeof authz;
  background: typeof background;
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
  "generation/providerIds": typeof generation_providerIds;
  "generation/runtime": typeof generation_runtime;
  "generation/storage": typeof generation_storage;
  "generation/types": typeof generation_types;
  "generation/vibe": typeof generation_vibe;
  http: typeof http;
  jobs: typeof jobs;
  "jobs/engine": typeof jobs_engine;
  "jobs/lifecycle": typeof jobs_lifecycle;
  "jobs/planning": typeof jobs_planning;
  "jobs/summaries": typeof jobs_summaries;
  "jobs/validators": typeof jobs_validators;
  lib: typeof lib;
  pricing: typeof pricing;
  products: typeof products;
  "products/catalog": typeof products_catalog;
  promptDefaults: typeof promptDefaults;
  promptRuntime: typeof promptRuntime;
  prompts: typeof prompts;
  "prompts/access": typeof prompts_access;
  "prompts/repository": typeof prompts_repository;
  settings: typeof settings;
  "settings/scope": typeof settings_scope;
  "shared/productWorkflow": typeof shared_productWorkflow;
  shopScope: typeof shopScope;
  shopify: typeof shopify;
  "shopify/client": typeof shopify_client;
  "shopify/graphql": typeof shopify_graphql;
  "shopify/media": typeof shopify_media;
  "shopify/productMapping": typeof shopify_productMapping;
  shops: typeof shops;
  users: typeof users;
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

export declare const components: {};
