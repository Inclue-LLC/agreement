import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { User } from "firebase/auth";
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { type Contract, daysUntil, effectiveEndDate, effectiveTitle } from "../types";
import UploadBox from "../components/UploadBox";
import RemainingBadge from "../components/RemainingBadge";
import StatusBadge from "../components/StatusBadge";

export default function ContractList({ user }: { user: User }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(
    () =>
      onSnapshot(query(collection(db, "contracts"), orderBy("createdAt", "desc")), (snap) =>
        setContracts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Contract, "id">) }))),
      ),
    [],
  );

  // 終了日が近い順。終了日不明・終了済みは後ろへ
  const rows = useMemo(() => {
    const key = (c: Contract) => {
      const end = effectiveEndDate(c);
      if (!end) return "9999-99-99";
      return daysUntil(end) < 0 ? `9999-${end}` : end;
    };
    const q = filter.trim().toLowerCase();
    return contracts
      .filter((c) => {
        if (!q) return true;
        const hay = [effectiveTitle(c), c.analysis?.contractType, ...(c.analysis?.parties.map((p) => p.name) ?? [])];
        return hay.some((s) => s?.toLowerCase().includes(q));
      })
      .sort((a, b) => key(a).localeCompare(key(b)));
  }, [contracts, filter]);

  const stuck = contracts.filter((c) => c.status === "uploading" || c.status === "error");

  async function reanalyzeStuck() {
    if (!confirm(`解析が終わっていない${stuck.length}件を解析し直しますか？`)) return;
    await Promise.all(
      stuck.map((c) => updateDoc(doc(db, "contracts", c.id), { reanalyzeRequestedAt: serverTimestamp() })),
    );
  }

  return (
    <>
      <UploadBox user={user} />
      <div className="toolbar">
        <h2>契約一覧（{contracts.length}件）</h2>
        <div className="row">
          {stuck.length > 0 && <button onClick={reanalyzeStuck}>未解析の{stuck.length}件を再解析</button>}
          <input placeholder="契約名・相手先で検索" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>契約名</th>
              <th>相手先</th>
              <th>種類</th>
              <th>契約期間</th>
              <th>残り</th>
              <th>自動更新</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const end = effectiveEndDate(c);
              const start = c.overrides?.startDate ?? c.analysis?.startDate;
              return (
                <tr key={c.id}>
                  <td>
                    <Link to={`/contracts/${c.id}`}>{effectiveTitle(c)}</Link>
                  </td>
                  <td>{c.analysis?.parties.map((p) => p.name).join("、") ?? "—"}</td>
                  <td>{c.analysis?.contractType ?? "—"}</td>
                  <td className="nowrap">
                    {start ?? "—"} 〜 {end ?? "—"}
                  </td>
                  <td>{c.status === "done" && <RemainingBadge endDate={end} />}</td>
                  <td>
                    {c.analysis?.autoRenewal === true ? "あり" : c.analysis?.autoRenewal === false ? "なし" : "—"}
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted center-text">
                  まだ契約書がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
