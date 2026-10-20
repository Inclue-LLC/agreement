import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, todayInJapan } from "./dates.js";
import { buildReminderMail, needsReminder } from "./reminder.js";
import type { ContractDoc } from "./types.js";

const base: ContractDoc = {
  fileName: "nda.pdf",
  storagePath: "contracts/x/nda.pdf",
  contentType: "application/pdf",
  uploadedBy: "u",
  uploadedByEmail: "a@inclue-llc.jp",
  status: "done",
  analysis: {
    title: "秘密保持契約書",
    contractType: "秘密保持契約",
    parties: [{ name: "株式会社A", role: "甲" }],
    summary: "概要",
    startDate: "2025-12-01",
    endDate: "2026-11-30",
    autoRenewal: true,
    renewalTerms: "1年ごとに自動更新",
    noticePeriodDays: 60,
    paymentTerms: null,
    keyTerms: [],
    cautions: [],
  },
};

test("daysBetween / todayInJapan", () => {
  assert.equal(daysBetween("2026-10-31", "2026-11-30"), 30);
  assert.equal(daysBetween("2026-12-01", "2026-11-30"), -1);
  // 2026-10-20 15:30 UTC は日本時間で 10-21
  assert.equal(todayInJapan(new Date("2026-10-20T15:30:00Z")), "2026-10-21");
});

test("needsReminder: 30日前から当日まで、未送信のときだけ", () => {
  const noNotice = { ...base, analysis: { ...base.analysis!, noticePeriodDays: null } };
  assert.equal(needsReminder(noNotice, "2026-10-30", 30), false);
  assert.equal(needsReminder(noNotice, "2026-10-31", 30), true);
  assert.equal(needsReminder(base, "2026-11-30", 30), true);
  assert.equal(needsReminder(base, "2026-12-01", 30), false);
  assert.equal(needsReminder({ ...base, reminderSentForEndDate: "2026-11-30" }, "2026-11-10", 30), false);
});

test("needsReminder: 手動で終了日を直したら新しい終了日で判定", () => {
  const renewed = { ...base, reminderSentForEndDate: "2026-11-30", overrides: { endDate: "2027-11-30" } };
  assert.equal(needsReminder(renewed, "2026-11-10", 30), false);
  assert.equal(needsReminder(renewed, "2027-11-01", 30), true);
});

test("needsReminder: 予告期間が30日より長ければその日数前から", () => {
  // noticePeriodDays: 60 → 2026-10-01 から対象
  assert.equal(needsReminder(base, "2026-09-30", 30), false);
  assert.equal(needsReminder(base, "2026-10-01", 30), true);
});

test("buildReminderMail", () => {
  const mail = buildReminderMail("abc", base, "2026-11-10", "https://example.web.app/");
  assert.match(mail.subject, /秘密保持契約書.*残り20日/);
  assert.match(mail.text, /予告期限を過ぎています/);
  assert.match(mail.text, /https:\/\/example\.web\.app\/contracts\/abc/);
});
