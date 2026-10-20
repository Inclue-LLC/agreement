import Anthropic from "@anthropic-ai/sdk";
import type { ContractAnalysis } from "./types.js";

const MODEL = "claude-opus-5-5";

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "contractType",
    "parties",
    "summary",
    "startDate",
    "endDate",
    "autoRenewal",
    "renewalTerms",
    "noticePeriodDays",
    "paymentTerms",
    "keyTerms",
    "cautions",
  ],
  properties: {
    title: { type: "string", description: "契約書の表題" },
    contractType: { type: "string", description: "業務委託、秘密保持、売買、賃貸借など契約の種類" },
    parties: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "role"],
        properties: {
          name: { type: "string" },
          role: { type: "string", description: "甲・乙、委託者・受託者など" },
        },
      },
    },
    summary: { type: "string", description: "契約の概要を3〜5文で" },
    startDate: { ...nullableString, description: "契約開始日 YYYY-MM-DD" },
    endDate: { ...nullableString, description: "現在の契約期間の終了日 YYYY-MM-DD" },
    autoRenewal: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    renewalTerms: { ...nullableString, description: "更新条件の要約" },
    noticePeriodDays: {
      anyOf: [{ type: "integer" }, { type: "null" }],
      description: "解約・更新拒絶の予告期間を日数に換算（1ヶ月=30日）",
    },
    paymentTerms: { ...nullableString, description: "金額・支払条件の要約" },
    keyTerms: {
      type: "array",
      description: "主要な条件（業務範囲、納期、秘密保持、損害賠償、解除、知財、管轄など）",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "detail"],
        properties: {
          label: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
    cautions: {
      type: "array",
      items: { type: "string" },
      description: "当社にとって注意すべき点や不利な条項",
    },
  },
} as const;

const SYSTEM_PROMPT = `あなたは企業法務の担当者として、アップロードされた契約書を読み、契約管理台帳に登録する情報を抽出します。
出力はすべて日本語で書いてください。
日付は YYYY-MM-DD 形式にしてください。和暦は西暦に直してください。
終了日が「締結日から1年間」のように相対的に書かれている場合は、開始日から計算してください。
自動更新条項があり、すでに更新済みと判断できる場合でも、契約書に書かれている最初の期間の終了日を endDate にしてください。
契約書に書かれていない項目は推測せず null（配列なら空配列）にしてください。`;

type SupportedMediaType = "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export function isSupportedMediaType(contentType: string): contentType is SupportedMediaType {
  return ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"].includes(contentType);
}

export async function analyzeContract(
  apiKey: string,
  file: Buffer,
  mediaType: SupportedMediaType,
): Promise<ContractAnalysis> {
  const client = new Anthropic({ apiKey });
  const data = file.toString("base64");
  const source: Anthropic.Beta.BetaContentBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mediaType, data } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data } };

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: ANALYSIS_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [source, { type: "text", text: "この契約書の内容を抽出してください。" }],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("AIがこの文書の解析を拒否しました");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("解析結果が長すぎて途中で切れました");
  }
  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  return normalize(JSON.parse(text) as ContractAnalysis);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalize(analysis: ContractAnalysis): ContractAnalysis {
  return {
    ...analysis,
    startDate: analysis.startDate && DATE_RE.test(analysis.startDate) ? analysis.startDate : null,
    endDate: analysis.endDate && DATE_RE.test(analysis.endDate) ? analysis.endDate : null,
  };
}
