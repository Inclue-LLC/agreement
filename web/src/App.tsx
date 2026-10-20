import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import ContractList from "./pages/ContractList";
import ContractDetail from "./pages/ContractDetail";

const ALLOWED_DOMAIN = "@inclue-llc.jp";

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <div className="center">読み込み中…</div>;

  if (!user) {
    return (
      <div className="center login">
        <h1>契約書管理</h1>
        <p>契約書をアップロードすると、AIが概要・条件・契約期間を読み取ります。</p>
        <button className="primary" onClick={() => signInWithPopup(auth, googleProvider)}>
          Googleでログイン
        </button>
      </div>
    );
  }

  if (!user.email?.endsWith(ALLOWED_DOMAIN)) {
    return (
      <div className="center login">
        <p>{user.email} では利用できません。{ALLOWED_DOMAIN} のアカウントでログインしてください。</p>
        <button onClick={() => signOut(auth)}>ログアウト</button>
      </div>
    );
  }

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">契約書管理</Link>
        <span className="spacer" />
        <span className="muted">{user.email}</span>
        <button onClick={() => signOut(auth)}>ログアウト</button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<ContractList user={user} />} />
          <Route path="/contracts/:id" element={<ContractDetail />} />
        </Routes>
      </main>
    </>
  );
}
