import { useAI } from "./hooks/useAI";
import { SettingsProvider } from "./stores/SettingsContext";
import { GameProvider, useGameContext } from "./stores/GameContext";
import { Layout } from "./components/shared/Layout";
import { GameView } from "./components/game/GameView";

function ViewSwitcher() {
  const { view } = useGameContext();
  const { minimaxProgress } = useAI();

  const content = (() => {
    switch (view) {
      case "home":
        return <div className="flex flex-1 items-center justify-center">Home — Coming Soon</div>;
      case "game":
        return <GameView />;
      case "journey":
        return <div className="flex flex-1 items-center justify-center">AI Journey — Coming Soon</div>;
      case "about":
        return <div className="flex flex-1 items-center justify-center">About — Coming Soon</div>;
    }
  })();

  return <Layout minimaxProgress={minimaxProgress}>{content}</Layout>;
}

export function App() {
  return (
    <SettingsProvider>
      <GameProvider>
        <ViewSwitcher />
      </GameProvider>
    </SettingsProvider>
  );
}
