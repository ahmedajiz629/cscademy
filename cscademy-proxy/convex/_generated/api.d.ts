/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as csacademyAccounts from "../csacademyAccounts.js";
import type * as leaderboards from "../leaderboards.js";
import type * as notificationHelpers from "../notificationHelpers.js";
import type * as notifications from "../notifications.js";
import type * as offlineProblemSessions from "../offlineProblemSessions.js";
import type * as platformSettings from "../platformSettings.js";
import type * as programmingLanguages from "../programmingLanguages.js";
import type * as scores from "../scores.js";
import type * as trackProblems from "../trackProblems.js";
import type * as trackSettings from "../trackSettings.js";
import type * as tracks from "../tracks.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  csacademyAccounts: typeof csacademyAccounts;
  leaderboards: typeof leaderboards;
  notificationHelpers: typeof notificationHelpers;
  notifications: typeof notifications;
  offlineProblemSessions: typeof offlineProblemSessions;
  platformSettings: typeof platformSettings;
  programmingLanguages: typeof programmingLanguages;
  scores: typeof scores;
  trackProblems: typeof trackProblems;
  trackSettings: typeof trackSettings;
  tracks: typeof tracks;
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
