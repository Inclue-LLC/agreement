const TIME_ZONE = "Asia/Tokyo";

/** 日本時間での今日の日付（YYYY-MM-DD） */
export function todayInJapan(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

/** from から to までの日数（YYYY-MM-DD同士）。to が過去なら負になる */
export function daysBetween(from: string, to: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}
