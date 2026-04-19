import type { ReactNode } from "react";
import { useLang } from "./LangContext";

export function EnFr({ en, fr }: { en: ReactNode; fr: ReactNode }) {
  const { lang } = useLang();
  return <>{lang === "en" ? en : fr}</>;
}
