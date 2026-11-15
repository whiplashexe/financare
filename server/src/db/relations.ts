import { defineRelations } from "drizzle-orm";
import * as schema from "./schema/index.js";

export const relations = defineRelations(schema, (r) => ({
  // ───────────── user ─────────────
  users: {
    accounts: r.many.accounts(),
    categories: r.many.categories(),
    transactions: r.many.transactions(),
    recurringPlans: r.many.recurringPlans(),
    oneTimePlans: r.many.oneTimePlans(),
    reminders: r.many.reminders(),
    templates: r.many.transactionTemplates(),
    refreshTokens: r.many.refreshTokens(),
    passwordResetTokens: r.many.passwordResetTokens(),
    deviceTokens: r.many.deviceTokens(),
    idempotencyKeys: r.many.idempotencyKeys(),
  },

  // ───────────── account ─────────────
  accounts: {
    user: r.one.users({
      from: r.accounts.userId,
      to: r.users.id,
      optional: false,
    }),
    // sumber (income, outcome, transfer keluar)
    transactions: r.many.transactions({ alias: "transaction_source" }),
    // tujuan transfer
    incomingTransfers: r.many.transactions({
      alias: "transaction_destination",
    }),
    recurringPlans: r.many.recurringPlans(),
    oneTimePlans: r.many.oneTimePlans(),
    templates: r.many.transactionTemplates({ alias: "template_source" }),
    incomingTemplates: r.many.transactionTemplates({
      alias: "template_destination",
    }),
  },

  // ───────────── category ─────────────
  categories: {
    user: r.one.users({
      from: r.categories.userId,
      to: r.users.id,
      optional: false,
    }),
    transactions: r.many.transactions(),
    recurringPlans: r.many.recurringPlans(),
    templates: r.many.transactionTemplates(),
  },

  // ───────────── transaction ─────────────
  transactions: {
    user: r.one.users({
      from: r.transactions.userId,
      to: r.users.id,
      optional: false,
    }),
    account: r.one.accounts({
      from: r.transactions.accountId,
      to: r.accounts.id,
      alias: "transaction_source",
      optional: false,
    }),
    toAccount: r.one.accounts({
      from: r.transactions.toAccountId,
      to: r.accounts.id,
      alias: "transaction_destination",
    }),
    category: r.one.categories({
      from: r.transactions.categoryId,
      to: r.categories.id,
    }),

    // biaya admin -> transfer induknya
    parent: r.one.transactions({
      from: r.transactions.parentTransactionId,
      to: r.transactions.id,
      alias: "transaction_admin_fee",
    }),
    adminFees: r.many.transactions({ alias: "transaction_admin_fee" }),

    // asal plan (kosong untuk transaksi manual)
    recurringPlan: r.one.recurringPlans({
      from: r.transactions.recurringPlanId,
      to: r.recurringPlans.id,
    }),
    oneTimePlan: r.one.oneTimePlans({
      from: r.transactions.oneTimePlanId,
      to: r.oneTimePlans.id,
    }),
    occurrences: r.many.planOccurrences(),

    images: r.many.transactionImages(),
    items: r.many.transactionItems(),
  },

  transactionImages: {
    transaction: r.one.transactions({
      from: r.transactionImages.transactionId,
      to: r.transactions.id,
      optional: false,
    }),
  },

  transactionItems: {
    transaction: r.one.transactions({
      from: r.transactionItems.transactionId,
      to: r.transactions.id,
      optional: false,
    }),
  },

  // ───────────── recurring plan ─────────────
  recurringPlans: {
    user: r.one.users({
      from: r.recurringPlans.userId,
      to: r.users.id,
      optional: false,
    }),
    account: r.one.accounts({
      from: r.recurringPlans.accountId,
      to: r.accounts.id,
      optional: false,
    }),
    category: r.one.categories({
      from: r.recurringPlans.categoryId,
      to: r.categories.id,
    }),
    occurrences: r.many.planOccurrences(),
    reminders: r.many.reminders(),
    transactions: r.many.transactions(),
  },

  planOccurrences: {
    recurringPlan: r.one.recurringPlans({
      from: r.planOccurrences.recurringPlanId,
      to: r.recurringPlans.id,
      optional: false,
    }),
    // kosong jika SKIPPED atau transaksinya sudah dihapus permanen
    transaction: r.one.transactions({
      from: r.planOccurrences.transactionId,
      to: r.transactions.id,
    }),
  },

  // ───────────── one-time plan ─────────────
  oneTimePlans: {
    user: r.one.users({
      from: r.oneTimePlans.userId,
      to: r.users.id,
      optional: false,
    }),
    sourceAccount: r.one.accounts({
      from: r.oneTimePlans.sourceAccountId,
      to: r.accounts.id,
    }),
    reminders: r.many.reminders(),
    transactions: r.many.transactions(),
  },

  // ───────────── reminder ─────────────
  reminders: {
    user: r.one.users({
      from: r.reminders.userId,
      to: r.users.id,
      optional: false,
    }),
    // tepat satu dari dua ini terisi
    recurringPlan: r.one.recurringPlans({
      from: r.reminders.recurringPlanId,
      to: r.recurringPlans.id,
    }),
    oneTimePlan: r.one.oneTimePlans({
      from: r.reminders.oneTimePlanId,
      to: r.oneTimePlans.id,
    }),
  },

  // ───────────── template ─────────────
  transactionTemplates: {
    user: r.one.users({
      from: r.transactionTemplates.userId,
      to: r.users.id,
      optional: false,
    }),
    account: r.one.accounts({
      from: r.transactionTemplates.accountId,
      to: r.accounts.id,
      alias: "template_source",
    }),
    toAccount: r.one.accounts({
      from: r.transactionTemplates.toAccountId,
      to: r.accounts.id,
      alias: "template_destination",
    }),
    category: r.one.categories({
      from: r.transactionTemplates.categoryId,
      to: r.categories.id,
    }),
  },

  // ───────────── auth & pendukung ─────────────
  refreshTokens: {
    user: r.one.users({
      from: r.refreshTokens.userId,
      to: r.users.id,
      optional: false,
    }),
    // token pengganti (rotasi) dan token yang digantikannya
    replacedByToken: r.one.refreshTokens({
      from: r.refreshTokens.replacedBy,
      to: r.refreshTokens.id,
      alias: "refresh_token_rotation",
    }),
    replacedTokens: r.many.refreshTokens({ alias: "refresh_token_rotation" }),
  },

  passwordResetTokens: {
    user: r.one.users({
      from: r.passwordResetTokens.userId,
      to: r.users.id,
      optional: false,
    }),
  },

  deviceTokens: {
    user: r.one.users({
      from: r.deviceTokens.userId,
      to: r.users.id,
      optional: false,
    }),
  },

  idempotencyKeys: {
    user: r.one.users({
      from: r.idempotencyKeys.userId,
      to: r.users.id,
      optional: false,
    }),
  },
}));
