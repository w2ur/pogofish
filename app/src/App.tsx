import { useAI } from "./hooks/useAI";
import { SettingsProvider } from "./stores/SettingsContext";
import { GameProvider, useGameContext } from "./stores/GameContext";
import { Layout } from "./components/shared/Layout";
import { GameView } from "./components/game/GameView";
import { JourneyView } from "./components/journey/JourneyView";
import { AboutView } from "./components/about/AboutView";
import { StoryView } from "./story/StoryView";

function ViewSwitcher() {
  const { view } = useGameContext();
  const { minimaxProgress } = useAI();

  if (view === "home") {
    return <StoryView />;
  }

  const content = (() => {
    switch (view) {
      case "game":
        return <GameView />;
      case "journey":
        return <JourneyView />;
      case "about":
        return <AboutView />;
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
