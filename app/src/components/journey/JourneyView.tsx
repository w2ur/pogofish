import sampleGames from "../../data/sample-games.json";
import { StageCard } from "./StageCard";
import { useGameContext } from "../../stores/GameContext";

type SampleGame = {
  moves: [number, number, number][];
  white: string;
  red: string;
  winner: string | null;
};

const games = sampleGames as SampleGame[];

function pickGame(whiteKey: string): SampleGame {
  const match = games.find((g) => g.white === whiteKey);
  return match ?? games[0]!;
}

const STAGES = [
  {
    key: "random",
    label: "Random",
    description: "No strategy. Pure chaos.",
    stat: null,
    game: pickGame("random"),
  },
  {
    key: "q-learning",
    label: "Q-Learning",
    description:
      "After 2 million games, it learned the basics — but only for positions it's seen.",
    stat: "99% accuracy, 2% coverage",
    game: pickGame("q-learning"),
  },
  {
    key: "dqn-tiny",
    label: "DQN",
    description:
      "A neural network generalizes to every position. It sees the whole board, but its judgment is rough.",
    stat: "100% coverage, 34% agreement",
    game: pickGame("dqn-tiny"),
  },
  {
    key: "alphazero-cnn",
    label: "AlphaZero",
    description: "Search + intuition. It thinks ahead before it moves.",
    stat: "81% value agreement",
    game: pickGame("alphazero-cnn"),
  },
  {
    key: "minimax",
    label: "Minimax",
    description:
      "The oracle. 10 million positions, all solved to depth 20.",
    stat: "975K proven positions",
    game: pickGame("minimax"),
  },
];

export function JourneyView() {
  const { setView } = useGameContext();

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => setView("home")}
            className="mb-4 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            How the AI learned
          </h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            Five stages of training, from random moves to perfect play.
          </p>
        </div>

        {/* Stage cards with progress dots */}
        <div className="flex flex-col">
          {STAGES.map((stage, i) => (
            <div key={stage.key}>
              <StageCard
                label={stage.label}
                description={stage.description}
                stat={stage.stat}
                game={stage.game}
              />
              {i < STAGES.length - 1 && (
                <div className="flex flex-col items-center py-2">
                  {[0, 1, 2].map((dot) => (
                    <div
                      key={dot}
                      className="my-0.5 h-1 w-1 rounded-full bg-zinc-300 dark:bg-zinc-700"
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
