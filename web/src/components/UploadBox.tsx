import { useRef, useState } from "react";
import type { User } from "firebase/auth";
import { collection, deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/gif";
const MAX_BYTES = 25 * 1024 * 1024;

export default function UploadBox({ user }: { user: User }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage(null);
    try {
      for (const file of Array.from(files)) {
        if (!ACCEPT.split(",").includes(file.type)) {
          setMessage(`${file.name}: PDFか画像ファイルを選んでください`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          setMessage(`${file.name}: 25MB以下のファイルにしてください`);
          continue;
        }
        const contractRef = doc(collection(db, "contracts"));
        const storagePath = `contracts/${contractRef.id}/${file.name.replace(/[\\/]/g, "_")}`;
        await setDoc(contractRef, {
          fileName: file.name,
          storagePath,
          contentType: file.type,
          uploadedBy: user.uid,
          uploadedByEmail: user.email,
          status: "uploading",
          createdAt: serverTimestamp(),
        });
        try {
          await uploadBytes(ref(storage, storagePath), file, { contentType: file.type });
        } catch (err) {
          await deleteDoc(contractRef);
          throw err;
        }
      }
    } catch (err) {
      setMessage(`アップロードに失敗しました: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div
      className={`upload ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        upload(e.dataTransfer.files);
      }}
      onClick={() => !busy && input.current?.click()}
    >
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
      <strong>{busy ? "アップロード中…" : "契約書をドロップ、またはクリックして選択"}</strong>
      <span className="muted">PDF・画像（25MBまで）。アップロード後、AIが自動で内容を読み取ります。</span>
      {message && <span className="error">{message}</span>}
    </div>
  );
}
