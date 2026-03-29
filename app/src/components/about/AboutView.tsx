import { useGameContext } from "../../stores/GameContext";

const TERMINAL_COMMANDS = `git clone https://github.com/w2ur/pogofish.git
cd pogofish/training
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. python -m pogofish`;

const AI_LEVELS = [
  { name: "Random", description: "Picks a legal move at random" },
  { name: "DQN", description: "Deep Q-Network trained on 500K episodes" },
  { name: "AlphaZero", description: "Neural network trained via MCTS self-play" },
  {
    name: "AlphaZero + MCTS",
    description: "Same net with adjustable tree search at inference time — strongest AI",
  },
];

export function AboutView() {
  const { setView } = useGameContext();

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        {/* Back */}
        <button
          onClick={() => setView("home")}
          className="mb-6 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← Back
        </button>

        <div className="flex flex-col gap-8">
          {/* What is Pogo? */}
          <section>
            <h2 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
              What is Pogo?
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              A strategy board game played on a 3×3 grid with stackable pieces.
              Two players (White and Red) compete to control the board by moving
              and stacking pieces according to distance rules.
            </p>
          </section>

          {/* How it works */}
          <section>
            <h2 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
              How it works
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              4 AI opponents trained through reinforcement learning, plus a
              depth-20 minimax oracle for analysis. All inference runs in your
              browser — no server, no account, no data collection.
            </p>
          </section>

          {/* AI levels */}
          <section>
            <h2 className="mb-3 text-xl font-bold text-zinc-900 dark:text-zinc-100">
              The AI levels
            </h2>
            <ul className="flex flex-col gap-2">
              {AI_LEVELS.map((level) => (
                <li key={level.name} className="flex gap-2">
                  <span className="shrink-0 font-semibold text-zinc-800 dark:text-zinc-200">
                    {level.name}:
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {level.description}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Play in your terminal */}
          <section>
            <h2 className="mb-3 text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Play in your terminal
            </h2>
            <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-4 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              <code>{TERMINAL_COMMANDS}</code>
            </pre>
          </section>

          {/* Tech */}
          <section>
            <h2 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Tech
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Python training pipeline (PyTorch, MCTS, minimax solver).
              React/TypeScript web app. ONNX Runtime Web for client-side
              inference. Deployed on Netlify.
            </p>
          </section>

          {/* GitHub link */}
          <div>
            <a
              href="https://github.com/w2ur/pogofish"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              View on GitHub →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
