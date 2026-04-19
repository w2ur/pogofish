import { SettingsProvider } from "./stores/SettingsContext";
import { GameProvider } from "./stores/GameContext";
import { StoryView } from "./story/StoryView";
import { LangProvider } from "./story/LangContext";

export function App() {
  return (
    <LangProvider>
      <SettingsProvider>
        <GameProvider>
          <StoryView />
        </GameProvider>
      </SettingsProvider>
    </LangProvider>
  );
}
