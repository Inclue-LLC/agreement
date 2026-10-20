import { daysUntil } from "../types";

export default function RemainingBadge({ endDate }: { endDate: string | null }) {
  if (!endDate) return <span className="badge gray">終了日不明</span>;
  const days = daysUntil(endDate);
  if (days < 0) return <span className="badge gray">終了済み（{-days}日前）</span>;
  const tone = days <= 30 ? "red" : days <= 90 ? "yellow" : "green";
  return <span className={`badge ${tone}`}>残り{days}日</span>;
}
