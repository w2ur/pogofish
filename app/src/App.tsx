import { SettingsProvider } from "./stores/SettingsContext";
import { GameProvider } from "./stores/GameContext";
import { StoryView } from "./story/StoryView";
import { LangProvider } from "./story/LangContext";
import { LenisProvider } from "./story/stage/LenisProvider";

export function App() {
  return (
    <LangProvider>
      <SettingsProvider>
        <GameProvider>
          <LenisProvider>
            <StoryView />
          </LenisProvider>
        </GameProvider>
      </SettingsProvider>
    </LangProvider>
  );
}
