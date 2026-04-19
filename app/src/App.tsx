import { SettingsProvider } from "./stores/SettingsContext";
import { GameProvider } from "./stores/GameContext";
import { StoryView } from "./story/StoryView";

export function App() {
  return (
    <SettingsProvider>
      <GameProvider>
        <StoryView />
      </GameProvider>
    </SettingsProvider>
  );
}
