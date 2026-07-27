export const DEFAULT_PROJECT_LOCALES = [
  "zh-CN",
  "zh-TW",
  "en-US",
  "ja-JP",
  "ko-KR",
] as const;

export function localeName(locale: string) {
  if (locale === "zh-CN") return "简体中文";
  if (locale === "zh-TW") return "繁体中文";
  if (locale === "en-US") return "English";
  if (locale === "ja-JP") return "日本語";
  if (locale === "ko-KR") return "한국어";
  return locale;
}
