import { useGameContext, type View } from "../../stores/GameContext";
import { useSettings } from "../../stores/SettingsContext";

interface NavProps {
  minimaxProgress: number;
}

const NAV_LINKS: { label: string; view: View }[] = [
  { label: "Play", view: "game" },
  { label: "AI Journey", view: "journey" },
  { label: "About", view: "about" },
];

export function Nav({ minimaxProgress }: NavProps) {
  const { view, setView } = useGameContext();
  const { theme, setTheme } = useSettings();

  const showProgress = minimaxProgress > 0 && minimaxProgress < 1;

  return (
    <nav className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex items-center gap-6">
        <button
          onClick={() => setView("home")}
          className="text-lg font-bold tracking-tight text-zinc-900 hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-400"
        >
          pogofish
        </button>
        <div className="flex items-center gap-4">
          {NAV_LINKS.map(({ label, view: linkView }) => (
            <button
              key={linkView}
              onClick={() => setView(linkView)}
              className={
                view === linkView
                  ? "text-sm font-medium text-zinc-900 dark:text-zinc-100"
                  : "text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {showProgress && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Minimax {Math.round(minimaxProgress * 100)}%
          </span>
        )}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
          className="text-lg text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </nav>
  );
}
