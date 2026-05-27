/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminBilling from "../adminBilling.js";
import type * as ai from "../ai.js";
import type * as aiQueries from "../aiQueries.js";
import type * as appointments from "../appointments.js";
import type * as assistants from "../assistants.js";
import type * as auth from "../auth.js";
import type * as authHelpers from "../authHelpers.js";
import type * as billing from "../billing.js";
import type * as billingCrons from "../billingCrons.js";
import type * as channels from "../channels.js";
import type * as chats from "../chats.js";
import type * as clientMembers from "../clientMembers.js";
import type * as clients from "../clients.js";
import type * as contactForms from "../contactForms.js";
import type * as contacts from "../contacts.js";
import type * as conversationStates from "../conversationStates.js";
import type * as crons from "../crons.js";
import type * as currencyUtils from "../currencyUtils.js";
import type * as debug from "../debug.js";
import type * as deleteClient from "../deleteClient.js";
import type * as deleteClientInternal from "../deleteClientInternal.js";
import type * as emailUtils from "../emailUtils.js";
import type * as excelImports from "../excelImports.js";
import type * as faq from "../faq.js";
import type * as faqAI from "../faqAI.js";
import type * as googleCalendar from "../googleCalendar.js";
import type * as googleCalendarDb from "../googleCalendarDb.js";
import type * as googleDrive from "../googleDrive.js";
import type * as googleDriveDb from "../googleDriveDb.js";
import type * as http from "../http.js";
import type * as impersonation from "../impersonation.js";
import type * as invites from "../invites.js";
import type * as invoices from "../invoices.js";
import type * as knowledgeBases from "../knowledgeBases.js";
import type * as knowledgeChunks from "../knowledgeChunks.js";
import type * as knowledgeChunksHelpers from "../knowledgeChunksHelpers.js";
import type * as leads from "../leads.js";
import type * as onboarding from "../onboarding.js";
import type * as orders from "../orders.js";
import type * as phoneUtils from "../phoneUtils.js";
import type * as planCrons from "../planCrons.js";
import type * as plans from "../plans.js";
import type * as privacy from "../privacy.js";
import type * as products from "../products.js";
import type * as profiles from "../profiles.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";
import type * as sengrid from "../sengrid.js";
import type * as systemConfig from "../systemConfig.js";
import type * as terms from "../terms.js";
import type * as tickets from "../tickets.js";
import type * as tokenUsageLogs from "../tokenUsageLogs.js";
import type * as webhooks from "../webhooks.js";
import type * as whapiActions from "../whapiActions.js";
import type * as whatsapp from "../whatsapp.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminBilling: typeof adminBilling;
  ai: typeof ai;
  aiQueries: typeof aiQueries;
  appointments: typeof appointments;
  assistants: typeof assistants;
  auth: typeof auth;
  authHelpers: typeof authHelpers;
  billing: typeof billing;
  billingCrons: typeof billingCrons;
  channels: typeof channels;
  chats: typeof chats;
  clientMembers: typeof clientMembers;
  clients: typeof clients;
  contactForms: typeof contactForms;
  contacts: typeof contacts;
  conversationStates: typeof conversationStates;
  crons: typeof crons;
  currencyUtils: typeof currencyUtils;
  debug: typeof debug;
  deleteClient: typeof deleteClient;
  deleteClientInternal: typeof deleteClientInternal;
  emailUtils: typeof emailUtils;
  excelImports: typeof excelImports;
  faq: typeof faq;
  faqAI: typeof faqAI;
  googleCalendar: typeof googleCalendar;
  googleCalendarDb: typeof googleCalendarDb;
  googleDrive: typeof googleDrive;
  googleDriveDb: typeof googleDriveDb;
  http: typeof http;
  impersonation: typeof impersonation;
  invites: typeof invites;
  invoices: typeof invoices;
  knowledgeBases: typeof knowledgeBases;
  knowledgeChunks: typeof knowledgeChunks;
  knowledgeChunksHelpers: typeof knowledgeChunksHelpers;
  leads: typeof leads;
  onboarding: typeof onboarding;
  orders: typeof orders;
  phoneUtils: typeof phoneUtils;
  planCrons: typeof planCrons;
  plans: typeof plans;
  privacy: typeof privacy;
  products: typeof products;
  profiles: typeof profiles;
  pushNotifications: typeof pushNotifications;
  pushSubscriptions: typeof pushSubscriptions;
  sengrid: typeof sengrid;
  systemConfig: typeof systemConfig;
  terms: typeof terms;
  tickets: typeof tickets;
  tokenUsageLogs: typeof tokenUsageLogs;
  webhooks: typeof webhooks;
  whapiActions: typeof whapiActions;
  whatsapp: typeof whatsapp;
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
