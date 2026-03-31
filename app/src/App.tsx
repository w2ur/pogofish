import { useAI } from "./hooks/useAI";
import { SettingsProvider } from "./stores/SettingsContext";
import { GameProvider, useGameContext } from "./stores/GameContext";
import { Layout } from "./components/shared/Layout";
import { HomeView } from "./components/home/HomeView";
import { GameView } from "./components/game/GameView";
import { JourneyView } from "./components/journey/JourneyView";
import { AboutView } from "./components/about/AboutView";

function ViewSwitcher() {
  const { view } = useGameContext();
  const { minimaxProgress } = useAI();

  const content = (() => {
    switch (view) {
      case "home":
        return <HomeView />;
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
