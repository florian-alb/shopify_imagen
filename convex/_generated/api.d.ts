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
import type * as crons from "../crons.js";
import type * as generation from "../generation.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as lib from "../lib.js";
import type * as pricing from "../pricing.js";
import type * as products from "../products.js";
import type * as promptDefaults from "../promptDefaults.js";
import type * as prompts from "../prompts.js";
import type * as settings from "../settings.js";
import type * as shopScope from "../shopScope.js";
import type * as shopify from "../shopify.js";
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
  crons: typeof crons;
  generation: typeof generation;
  http: typeof http;
  jobs: typeof jobs;
  lib: typeof lib;
  pricing: typeof pricing;
  products: typeof products;
  promptDefaults: typeof promptDefaults;
  prompts: typeof prompts;
  settings: typeof settings;
  shopScope: typeof shopScope;
  shopify: typeof shopify;
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
