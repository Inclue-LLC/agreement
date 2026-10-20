# 契約書管理ツール

契約書（PDF・画像）をアップロードすると、AI（Claude）が概要・当事者・主要な条件・契約期間・自動更新条件を読み取って一覧にします。
契約終了の1ヶ月前になると、更新リマインダをメール（既定: m_sato@inclue-llc.jp）で送ります。
Firebase（Hosting / Firestore / Storage / Cloud Functions）で動きます。

## 仕組み

```
ブラウザ (web/)                         Cloud Functions (functions/)
 ├ Googleログイン (@inclue-llc.jp のみ)
 ├ Firestore に contracts/{id} を作成
 └ Storage に contracts/{id}/ファイル ──▶ onContractUploaded
                                          └ Claude API で解析 → contracts/{id}.analysis に保存
                                        sendRenewalReminders（毎朝9:00 JST）
                                          └ 終了日まで30日以内の契約をメール通知
```

- **一覧**: 終了日が近い順に表示。残り30日以内は赤、90日以内は黄色。
- **詳細**: 概要、契約期間・更新条件、当事者、金額・支払、主要な条件、注意点、メモ。原本も開けます。
- **手動修正**: AIの読み取りが違うとき、または契約を更新したときは「期間・名称を修正」で終了日を直します。リマインダは新しい終了日で再設定されます。
- **リマインダ**: 終了日の30日前から当日までの間に1回だけ送ります。契約書に「終了の2ヶ月前までに申し出」のような予告期間がある場合は、その期限に間に合うよう予告期間の日数前から送ります。

## セットアップ

### 1. Firebase プロジェクト

1. [Firebase コンソール](https://console.firebase.google.com/)でプロジェクトを作成し、**Blaze（従量課金）プラン**にする（Cloud Functions と定期実行に必要）。
2. Authentication → ログイン方法 → **Google** を有効にする。
3. Firestore Database と Storage を作成する（リージョンは `asia-northeast1` 推奨）。
4. プロジェクトの設定 → マイアプリ → ウェブアプリを追加し、表示された設定値を控える。
5. `.firebaserc` の `YOUR_FIREBASE_PROJECT_ID` を自分のプロジェクトIDに書き換える。

### 2. APIキーとメール送信の設定

```bash
npm install -g firebase-tools
firebase login

# Claude API キー（https://console.anthropic.com/ で発行）
firebase functions:secrets:set ANTHROPIC_API_KEY

# メール送信用 SMTP パスワード
# Google Workspace / Gmail の場合は「アプリ パスワード」を発行して入れる
firebase functions:secrets:set SMTP_PASSWORD
```

`functions/.env` を作り、送信元などを書きます。

```
SMTP_USER=送信に使うアカウント@inclue-llc.jp
APP_URL=https://<プロジェクトID>.web.app
# 以下は省略時の既定値
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=465
# NOTIFY_EMAIL=m_sato@inclue-llc.jp
# REMINDER_DAYS=30
```

### 3. フロントエンドの設定

`web/.env.example` を `web/.env.local` にコピーし、手順1-4の値を入れます。

### 4. デプロイ

```bash
(cd functions && npm install)
(cd web && npm install && npm run build)
firebase deploy
```

`https://<プロジェクトID>.web.app` で使えます。

## 利用できる人を変える

既定では `@inclue-llc.jp` のGoogleアカウントだけがログイン・閲覧できます。変えるときは次の4か所を揃えて書き換えてください。

- `firestore.rules` / `storage.rules` の正規表現
- `web/src/App.tsx` の `ALLOWED_DOMAIN`、`web/src/firebase.ts` の `hd`
- `functions/src/index.ts` の `reanalyzeContract` 内のドメイン判定

## ローカル開発

```bash
# functions/.secret.local に ANTHROPIC_API_KEY=... と SMTP_PASSWORD=... を書く
firebase emulators:start --project demo-agreement
# 別のターミナルで（web/.env.local の VITE_USE_EMULATORS=true）
cd web && npm run dev
```

テスト（リマインダの判定・メール本文）:

```bash
cd functions && npm test
```

## 費用の目安

- Claude API（Claude Opus 5.5）: 入力 $4 / 出力 $20（100万トークンあたり）。10ページ程度の契約書1件で数十円程度です。
- Firebase: 社内利用の規模なら無料枠内に収まることがほとんどです（Cloud Scheduler は1ジョブ月$0.10程度）。

## 注意

AIの読み取り結果は誤ることがあります。特に終了日・自動更新条件は、登録後に原本と照らして確認してください。
