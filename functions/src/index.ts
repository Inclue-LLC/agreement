import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { defineInt, defineSecret, defineString } from "firebase-functions/params";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { analyzeContract, isSupportedMediaType } from "./analyze.js";
import { todayInJapan } from "./dates.js";
import { buildReminderMail, needsReminder, sendMail } from "./reminder.js";
import { effectiveEndDate, type ContractDoc } from "./types.js";

initializeApp();
// 社内利用なので同時実行数を絞り、想定外のアクセスで費用が膨らまないようにする
setGlobalOptions({ region: "asia-northeast1", maxInstances: 3 });

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const smtpPassword = defineSecret("SMTP_PASSWORD");
const smtpHost = defineString("SMTP_HOST", { default: "smtp.gmail.com" });
const smtpPort = defineInt("SMTP_PORT", { default: 465 });
const smtpUser = defineString("SMTP_USER");
const notifyEmail = defineString("NOTIFY_EMAIL", { default: "m_sato@inclue-llc.jp" });
const reminderDays = defineInt("REMINDER_DAYS", { default: 30 });
const appUrl = defineString("APP_URL", { description: "Hosting のURL（メール内リンク用）" });

const db = getFirestore();

async function runAnalysis(contractId: string, storagePath: string, contentType: string) {
  const ref = db.collection("contracts").doc(contractId);
  if (!isSupportedMediaType(contentType)) {
    await ref.update({ status: "error", error: `未対応のファイル形式です: ${contentType}` });
    return;
  }
  await ref.update({ status: "analyzing", error: FieldValue.delete() });
  try {
    const [file] = await getStorage().bucket().file(storagePath).download();
    const analysis = await analyzeContract(anthropicApiKey.value(), file, contentType);
    await ref.update({ status: "done", analysis, analyzedAt: FieldValue.serverTimestamp() });
  } catch (err) {
    logger.error("contract analysis failed", { contractId, err });
    await ref.update({ status: "error", error: err instanceof Error ? err.message : String(err) });
  }
}

/** contracts/{contractId}/{fileName} にファイルが上がったらAIで解析する */
export const onContractUploaded = onObjectFinalized(
  { secrets: [anthropicApiKey], timeoutSeconds: 540, memory: "1GiB" },
  async (event) => {
    const match = /^contracts\/([^/]+)\/[^/]+$/.exec(event.data.name);
    if (!match) return;
    const contractId = match[1];
    const snap = await db.collection("contracts").doc(contractId).get();
    if (!snap.exists) {
      logger.warn("upload without contract document", { path: event.data.name });
      return;
    }
    await runAnalysis(contractId, event.data.name, event.data.contentType ?? "");
  },
);

/**
 * 画面の「再解析」ボタンは reanalyzeRequestedAt を書き換える。それを検知して解析し直す。
 * （ブラウザから関数を直接呼ぶ方式は、組織のポリシーで公開呼び出しが禁止されていると使えないため）
 */
export const onReanalyzeRequested = onDocumentUpdated(
  { document: "contracts/{contractId}", secrets: [anthropicApiKey], timeoutSeconds: 540, memory: "1GiB" },
  async (event) => {
    const before = event.data?.before.data() as (ContractDoc & { reanalyzeRequestedAt?: unknown }) | undefined;
    const after = event.data?.after.data() as (ContractDoc & { reanalyzeRequestedAt?: unknown }) | undefined;
    if (!before || !after || !after.reanalyzeRequestedAt) return;
    if (String(before.reanalyzeRequestedAt) === String(after.reanalyzeRequestedAt)) return;
    await runAnalysis(event.params.contractId, after.storagePath, after.contentType);
  },
);

/** 毎朝9時（日本時間）に、終了日が近い契約のリマインダをメールで送る */
export const sendRenewalReminders = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Asia/Tokyo", secrets: [smtpPassword] },
  async () => {
    const today = todayInJapan();
    const snaps = await db.collection("contracts").where("status", "==", "done").get();
    const config = {
      host: smtpHost.value(),
      port: smtpPort.value(),
      user: smtpUser.value(),
      password: smtpPassword.value(),
      from: `契約書管理 <${smtpUser.value()}>`,
      to: notifyEmail.value(),
      appUrl: appUrl.value(),
    };

    for (const snap of snaps.docs) {
      const doc = snap.data() as ContractDoc;
      if (!needsReminder(doc, today, reminderDays.value())) continue;
      try {
        await sendMail(config, buildReminderMail(snap.id, doc, today, config.appUrl));
        await snap.ref.update({
          reminderSentForEndDate: effectiveEndDate(doc),
          reminderSentAt: FieldValue.serverTimestamp(),
        });
        logger.info("reminder sent", { contractId: snap.id });
      } catch (err) {
        logger.error("reminder failed", { contractId: snap.id, err });
      }
    }
  },
);
