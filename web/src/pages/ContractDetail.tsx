import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "../firebase";
import { type Contract, effectiveEndDate, effectiveTitle } from "../types";
import RemainingBadge from "../components/RemainingBadge";
import StatusBadge from "../components/StatusBadge";

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contract, setContract] = useState<Contract | null | undefined>(undefined);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(
    () =>
      onSnapshot(doc(db, "contracts", id!), (snap) =>
        setContract(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Contract, "id">) } : null),
      ),
    [id],
  );

  useEffect(() => {
    if (contract?.storagePath) {
      getDownloadURL(ref(storage, contract.storagePath)).then(setFileUrl, () => setFileUrl(null));
    }
  }, [contract?.storagePath, contract?.status]);

  if (contract === undefined) return <p>読み込み中…</p>;
  if (contract === null) return <p>契約書が見つかりません。</p>;

  const a = contract.analysis;
  const end = effectiveEndDate(contract);
  const start = contract.overrides?.startDate ?? a?.startDate ?? null;

  async function remove() {
    if (!confirm(`「${effectiveTitle(contract!)}」を削除しますか？`)) return;
    await deleteObject(ref(storage, contract!.storagePath)).catch(() => undefined);
    await deleteDoc(doc(db, "contracts", contract!.id));
    navigate("/");
  }

  async function reanalyze() {
    try {
      await updateDoc(doc(db, "contracts", contract!.id), { reanalyzeRequestedAt: serverTimestamp() });
    } catch (err) {
      alert(`再解析の依頼に失敗しました: ${err instanceof Error ? err.message : err}`);
    }
  }

  return (
    <article className="detail">
      <div className="detail-head">
        <div>
          <h1>{effectiveTitle(contract)}</h1>
          <div className="row">
            <StatusBadge status={contract.status} />
            {contract.status === "done" && <RemainingBadge endDate={end} />}
            {contract.reminderSentForEndDate && contract.reminderSentForEndDate === end && (
              <span className="badge blue">リマインダ送信済み</span>
            )}
          </div>
        </div>
        <div className="row">
          {fileUrl && (
            <a className="button" href={fileUrl} target="_blank" rel="noreferrer">
              原本を開く
            </a>
          )}
          {contract.status !== "analyzing" && <button onClick={reanalyze}>再解析</button>}
          <button className="danger" onClick={remove}>
            削除
          </button>
        </div>
      </div>

      {contract.status === "error" && <p className="error">解析に失敗しました: {contract.error}</p>}
      {contract.status === "analyzing" && <p className="muted">AIが契約書を読んでいます。1〜2分ほどお待ちください。</p>}

      {a && (
        <>
          <section className="card">
            <h3>概要</h3>
            <p>{a.summary}</p>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>契約期間・更新</h3>
              <button onClick={() => setEditing(true)}>期間・名称を修正</button>
            </div>
            <dl>
              <dt>契約期間</dt>
              <dd>
                {start ?? "—"} 〜 {end ?? "—"}
                {contract.overrides && <span className="muted">（手動修正あり）</span>}
              </dd>
              <dt>自動更新</dt>
              <dd>{a.autoRenewal === true ? "あり" : a.autoRenewal === false ? "なし" : "不明"}</dd>
              <dt>更新条件</dt>
              <dd>{a.renewalTerms ?? "—"}</dd>
              <dt>予告期間</dt>
              <dd>{a.noticePeriodDays ? `終了日の${a.noticePeriodDays}日前まで` : "—"}</dd>
            </dl>
          </section>

          <section className="card">
            <h3>基本情報</h3>
            <dl>
              <dt>種類</dt>
              <dd>{a.contractType}</dd>
              <dt>当事者</dt>
              <dd>
                {a.parties.map((p) => (
                  <div key={p.role + p.name}>
                    {p.role}: {p.name}
                  </div>
                ))}
              </dd>
              <dt>金額・支払</dt>
              <dd>{a.paymentTerms ?? "—"}</dd>
            </dl>
          </section>

          {a.keyTerms.length > 0 && (
            <section className="card">
              <h3>主要な条件</h3>
              <dl>
                {a.keyTerms.map((t) => (
                  <div key={t.label} className="dl-row">
                    <dt>{t.label}</dt>
                    <dd>{t.detail}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {a.cautions.length > 0 && (
            <section className="card caution">
              <h3>注意点</h3>
              <ul>
                {a.cautions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <MemoCard contract={contract} />
      <p className="muted small">
        {contract.fileName}（アップロード: {contract.uploadedByEmail}）。AIの読み取り結果は必ず原本で確認してください。
      </p>

      {editing && <EditDialog contract={contract} onClose={() => setEditing(false)} />}
    </article>
  );
}

function MemoCard({ contract }: { contract: Contract }) {
  const [memo, setMemo] = useState(contract.memo ?? "");
  const dirty = memo !== (contract.memo ?? "");
  return (
    <section className="card">
      <h3>メモ</h3>
      <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} placeholder="更新交渉の状況など" />
      {dirty && (
        <button
          className="primary"
          onClick={() => updateDoc(doc(db, "contracts", contract.id), { memo, updatedAt: serverTimestamp() })}
        >
          保存
        </button>
      )}
    </section>
  );
}

function EditDialog({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const [title, setTitle] = useState(effectiveTitle(contract));
  const [startDate, setStartDate] = useState(contract.overrides?.startDate ?? contract.analysis?.startDate ?? "");
  const [endDate, setEndDate] = useState(effectiveEndDate(contract) ?? "");

  async function save() {
    await updateDoc(doc(db, "contracts", contract.id), {
      overrides: { title, startDate: startDate || null, endDate: endDate || null },
      updatedAt: serverTimestamp(),
    });
    onClose();
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>期間・名称を修正</h3>
        <p className="muted small">契約を更新したときは終了日を新しい日付に変えてください。リマインダも新しい終了日で再設定されます。</p>
        <label>
          契約名
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          開始日
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          終了日
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <div className="row end">
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
