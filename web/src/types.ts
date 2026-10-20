// functions/src/types.ts と同じ内容。変更するときは両方を揃える。
/** AIが契約書から抽出する内容。Firestore の contracts/{id}.analysis に入る。 */
export interface ContractAnalysis {
  title: string;
  contractType: string;
  parties: { name: string; role: string }[];
  summary: string;
  /** YYYY-MM-DD。記載がなければ null */
  startDate: string | null;
  /** YYYY-MM-DD。記載がなければ null */
  endDate: string | null;
  autoRenewal: boolean | null;
  renewalTerms: string | null;
  /** 解約・更新拒絶の予告期間（日数換算）。記載がなければ null */
  noticePeriodDays: number | null;
  paymentTerms: string | null;
  keyTerms: { label: string; detail: string }[];
  cautions: string[];
}

/** 人が画面から手で直した値。AIの抽出結果より優先する。 */
export interface ContractOverrides {
  title?: string;
  startDate?: string | null;
  endDate?: string | null;
}

export type ContractStatus = "uploading" | "analyzing" | "done" | "error";

export interface ContractDoc {
  fileName: string;
  storagePath: string;
  contentType: string;
  uploadedBy: string;
  uploadedByEmail: string;
  status: ContractStatus;
  error?: string;
  analysis?: ContractAnalysis;
  overrides?: ContractOverrides;
  memo?: string;
  /** どの終了日に対してリマインダを送ったか。終了日が変われば再送対象になる */
  reminderSentForEndDate?: string;
}

export function effectiveEndDate(doc: ContractDoc): string | null {
  if (doc.overrides && doc.overrides.endDate !== undefined) return doc.overrides.endDate;
  return doc.analysis?.endDate ?? null;
}

export function effectiveTitle(doc: ContractDoc): string {
  return doc.overrides?.title || doc.analysis?.title || doc.fileName;
}

export type Contract = ContractDoc & { id: string };

export function daysUntil(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}
