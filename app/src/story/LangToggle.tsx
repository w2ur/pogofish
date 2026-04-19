import { useLang } from "./LangContext";

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div
      className="fixed bottom-6 left-6 z-50 flex gap-1 rounded-full p-1 shadow-lg"
      style={{ background: "rgba(18,16,14,0.8)", backdropFilter: "blur(6px)" }}
    >
      {(["en", "fr"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`mono text-[10px] tracking-[0.2em] uppercase rounded-full px-3 py-2 transition-colors
            ${lang === l ? "bg-vermilion text-paper" : "text-paper-3 hover:text-paper"}`}
          aria-pressed={lang === l}
          aria-label={l === "en" ? "English" : "Français"}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
