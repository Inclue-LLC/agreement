import type { ContractStatus } from "../types";

const LABELS: Record<ContractStatus, string> = {
  uploading: "アップロード中",
  analyzing: "AI解析中…",
  done: "解析済み",
  error: "解析エラー",
};

export default function StatusBadge({ status }: { status: ContractStatus }) {
  const tone = status === "done" ? "green" : status === "error" ? "red" : "blue";
  return <span className={`badge ${tone}`}>{LABELS[status]}</span>;
}
