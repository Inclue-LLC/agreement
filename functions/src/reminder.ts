import nodemailer from "nodemailer";
import type { ContractDoc } from "./types.js";
import { effectiveEndDate, effectiveTitle } from "./types.js";
import { daysBetween } from "./dates.js";

/**
 * 今日リマインダを送るべきか。終了日の reminderDays 日前から当日までの間で、まだその終了日に対して送っていないもの。
 * 解約・更新拒絶の予告期間が reminderDays より長い契約は、予告期限に間に合うようその日数前から送る。
 */
export function needsReminder(doc: ContractDoc, today: string, reminderDays: number): boolean {
  if (doc.status !== "done") return false;
  const endDate = effectiveEndDate(doc);
  if (!endDate) return false;
  const window = Math.max(reminderDays, doc.analysis?.noticePeriodDays ?? 0);
  const daysLeft = daysBetween(today, endDate);
  return daysLeft >= 0 && daysLeft <= window && doc.reminderSentForEndDate !== endDate;
}

export interface MailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  to: string;
  appUrl: string;
}

export function buildReminderMail(id: string, doc: ContractDoc, today: string, appUrl: string) {
  const endDate = effectiveEndDate(doc)!;
  const daysLeft = daysBetween(today, endDate);
  const title = effectiveTitle(doc);
  const a = doc.analysis;
  const parties = a?.parties.map((p) => `${p.role}: ${p.name}`).join(" / ") || "—";
  const renewal =
    a?.autoRenewal === true ? "あり" : a?.autoRenewal === false ? "なし" : "不明";

  const lines = [
    `契約「${title}」の期間が ${endDate} に終了します（残り${daysLeft}日）。`,
    "更新・再契約・解約の要否をご確認ください。",
    "",
    `■ 契約の種類: ${a?.contractType ?? "—"}`,
    `■ 当事者: ${parties}`,
    `■ 契約期間: ${a?.startDate ?? "—"} 〜 ${endDate}`,
    `■ 自動更新: ${renewal}`,
    `■ 更新条件: ${a?.renewalTerms ?? "—"}`,
  ];
  if (a?.noticePeriodDays) {
    const late = a.noticePeriodDays > daysLeft ? "（予告期限を過ぎています。契約書をご確認ください）" : "";
    lines.push(`■ 解約・更新拒絶の予告期間: 終了日の${a.noticePeriodDays}日前まで${late}`);
  }
  lines.push("", `■ 概要: ${a?.summary ?? "—"}`, "", `詳細: ${appUrl.replace(/\/$/, "")}/contracts/${id}`);

  return {
    subject: `【契約更新リマインダ】${title}（${endDate} 終了・残り${daysLeft}日）`,
    text: lines.join("\n"),
  };
}

export async function sendMail(config: MailConfig, mail: { subject: string; text: string }) {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  });
  await transporter.sendMail({ from: config.from, to: config.to, ...mail });
}
