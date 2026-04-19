// Hand-authored story data. All board positions are derived from a single
// legal-play sequence so that every "position" the reader sees respects
// Pogo's actual rules: 1 piece moves Manhattan d=1, 2 pieces d=2,
// 3 pieces d=1 or d=3, and stacks preserve pieces (6 W + 6 R always).

export type Piece = "W" | "R";
export type StoryCell = Piece[];
export type StoryBoard = StoryCell[];

const E = (): StoryCell => [];
const c = (...p: Piece[]): StoryCell => p;

/**
 * A single legal Pogo game, 12 half-moves from the opening, used as the
 * source of truth for every snapshot in the story.
 *
 *   Move 1  W  b1 → b2   (1 piece, d=1)     "post a sentinel in the middle"
 *   Move 2  R  b3 → b2   (1, d=1)           "R answers on the same cell"
 *   Move 3  W  a1 → a3   (2, d=2)           "W charges up the a-file"
 *   Move 4  R  c3 → c1   (2, d=2)           "R charges down the c-file"
 *   Move 5  W  b1 → a1   (1, d=1)           "W slides left"
 *   Move 6  R  b2 → c2   (1 R on top, d=1)  "R opens the middle"
 *   Move 7  W  a3 → c3   (2 W on top, d=2)  "W relocates his stack"
 *   Move 8  R  c1 → b1   (2 R on top, d=1 is illegal for 2; must be d=2)
 *            (actually let's route differently): c1 → a1 (2, d=2)
 *   Move 8  R  c1 → a1   (2 R on top, d=2)
 *   Move 9  W  b2 → a2   (1, d=1)
 *   Move 10 R  c2 → b2   (1, d=1)
 *   Move 11 W  c3 → c2   (1 W on top, d=1)
 *   Move 12 R  a1 → b1   (1 R on top, d=1)
 */
export const GAME_FRAMES: StoryBoard[] = [
  // F0 — initial position
  [
    c("R", "R"), c("R", "R"), c("R", "R"),
    E(),         E(),         E(),
    c("W", "W"), c("W", "W"), c("W", "W"),
  ],
  // F1 — after W b1→b2
  [
    c("R", "R"), c("R", "R"), c("R", "R"),
    E(),         c("W"),      E(),
    c("W", "W"), c("W"),      c("W", "W"),
  ],
  // F2 — after R b3→b2 (R lands on top of W)
  [
    c("R", "R"), c("R"),      c("R", "R"),
    E(),         c("W", "R"), E(),
    c("W", "W"), c("W"),      c("W", "W"),
  ],
  // F3 — after W a1→a3 (2 W over RR)
  [
    c("R", "R", "W", "W"), c("R"), c("R", "R"),
    E(),                    c("W", "R"), E(),
    E(),                    c("W"), c("W", "W"),
  ],
  // F4 — after R c3→c1 (2 R over WW)
  [
    c("R", "R", "W", "W"), c("R"), E(),
    E(),                    c("W", "R"), E(),
    E(),                    c("W"), c("W", "W", "R", "R"),
  ],
  // F5 — after W b1→a1
  [
    c("R", "R", "W", "W"), c("R"), E(),
    E(),                    c("W", "R"), E(),
    c("W"),                 E(),         c("W", "W", "R", "R"),
  ],
  // F6 — after R b2→c2 (R on top of b2 hops to c2)
  [
    c("R", "R", "W", "W"), c("R"), E(),
    E(),                    c("W"), c("R"),
    c("W"),                 E(),    c("W", "W", "R", "R"),
  ],
  // F7 — after W a3→c3 (2 W on top hop to c3)
  [
    c("R", "R"), c("R"), c("W", "W"),
    E(),         c("W"), c("R"),
    c("W"),      E(),    c("W", "W", "R", "R"),
  ],
  // F8 — after R c1→a1 (2 R on top hop to a1, landing on W)
  [
    c("R", "R"),     c("R"), c("W", "W"),
    E(),             c("W"), c("R"),
    c("W", "R", "R"), E(),    c("W", "W"),
  ],
  // F9 — after W b2→a2 (1 W, d=1)
  [
    c("R", "R"),     c("R"), c("W", "W"),
    c("W"),          E(),    c("R"),
    c("W", "R", "R"), E(),    c("W", "W"),
  ],
  // F10 — after R c2→b2 (1 R, d=1)
  [
    c("R", "R"),     c("R"), c("W", "W"),
    c("W"),          c("R"), E(),
    c("W", "R", "R"), E(),    c("W", "W"),
  ],
  // F11 — after W c3→c2 (1 W on top, d=1)
  [
    c("R", "R"),     c("R"), c("W"),
    c("W"),          c("R"), c("W"),
    c("W", "R", "R"), E(),    c("W", "W"),
  ],
  // F12 — after R a1→b1 (1 R, d=1)
  [
    c("R", "R"),  c("R"), c("W"),
    c("W"),       c("R"), c("W"),
    c("W", "R"),  c("R"), c("W", "W"),
  ],
];

/** Hero autoplay: early-game sequence, 1.8-second cadence. */
export const HERO_SEQUENCE: StoryBoard[] = [
  GAME_FRAMES[0]!,
  GAME_FRAMES[1]!,
  GAME_FRAMES[2]!,
  GAME_FRAMES[3]!,
  GAME_FRAMES[4]!,
  GAME_FRAMES[5]!,
  GAME_FRAMES[6]!,
];

/**
 * Chapter titles the reader actually sees. Twelve scenes in total.
 * Indices map 1:1 to the narrative order in StoryView.
 */
export const CHAPTERS: { numeral: string; kicker: string }[] = [
  { numeral: "I",    kicker: "Before a single line of code" },            // 0 — Hook
  { numeral: "II",   kicker: "Five moves to feel the rules" },            // 1 — TryYourself
  { numeral: "III",  kicker: "Nine cells, a game I did not invent" },     // 2 — Pinned: what is Pogo
  { numeral: "IV",   kicker: "\u201CNo more than a million.\u201D" },     // 3 — Pinned: the claim
  { numeral: "V",    kicker: "Thirty-six gigabytes at dawn" },            // 4 — Pinned: minimax wall
  { numeral: "VI",   kicker: "The tree had no leaves" },                  // 5 — Pinned: DQN
  { numeral: "VII",  kicker: "The rules became the variable" },           // 6 — Pinned: AlphaZero
  { numeral: "VIII", kicker: "Five candidate endings" },                  // 7 — Experiments
  { numeral: "IX",   kicker: "One survives all three axes" },             // 8 — Verdict
  { numeral: "X",    kicker: "Now it is your move" },                     // 9 — Play
  { numeral: "XI",   kicker: "What it learned about winning" },           // 10 — Learnings
  { numeral: "XII",  kicker: "Keep the problem in your head" },           // 11 — Epilogue
];

/** Boards pinned beside the narrative panels (scenes 2–6). */
export const PINNED_BOARDS: StoryBoard[] = [
  GAME_FRAMES[0]!,   // II · opening
  GAME_FRAMES[2]!,   // III · the claim (2 half-moves in)
  GAME_FRAMES[8]!,   // IV · six days (mid-game chaos)
  GAME_FRAMES[11]!,  // V · repetition-friendly position
  GAME_FRAMES[10]!,  // VI · balanced equilibrium
];

export const PINNED_LABELS = [
  "opening",
  "the claim",
  "six days",
  "the rules",
  "equilibrium",
];

/** Scene 7 variant cards: each gets a distinct mid-game snapshot. */
export const VARIANTS = [
  {
    id: "LC1-2",
    label: "Sudden Death",
    rule: "Repeat a position twice \u2192 you lose.",
    glyph: "\u21BB",
    board: GAME_FRAMES[11]!,
  },
  {
    id: "LC1-3",
    label: "Triple Repeat",
    rule: "Three-fold repetition ends the game.",
    glyph: "\u21BB\u21BB",
    board: GAME_FRAMES[9]!,
  },
  {
    id: "LC2-30",
    label: "Hard Cap",
    rule: "30 moves. Parity picks the winner.",
    glyph: "\u25A0",
    board: GAME_FRAMES[8]!,
  },
  {
    id: "LC3-29",
    label: "Classic",
    rule: "29 moves. Most towers wins. Ties draw.",
    glyph: "\u2261",
    board: GAME_FRAMES[12]!,
  },
  {
    id: "LC3-40",
    label: "Long Soft Cap",
    rule: "40 moves. Draws get earned.",
    glyph: "\u2248",
    board: GAME_FRAMES[7]!,
  },
];

/** Minimax run growth — the six days before it was killed. */
export const FAILED_RUN_DAYS = [
  { day: 1, states: 1_200_000 },
  { day: 2, states: 4_800_000 },
  { day: 3, states: 11_500_000 },
  { day: 4, states: 22_000_000 },
  { day: 5, states: 36_000_000 },
  { day: 6, states: 49_000_000 },
];

/** Scene 8 verdict rows. */
export const VERDICT = [
  {
    id: "LC1-2",
    label: "Sudden Death",
    balance: 0.52,
    skill: 0.82,
    draws: 0.0,
    verdict: "pass",
    winner: true,
  },
  {
    id: "LC2-30",
    label: "Hard Cap \u00B7 30",
    balance: 0.58,
    skill: 0.61,
    draws: 0.0,
    verdict: "fail",
    failReason: "Parity of cap decides winner \u2014 skill barely matters.",
  },
  {
    id: "LC3-29",
    label: "Classic \u00B7 29",
    balance: 0.5,
    skill: 0.77,
    draws: 0.055,
    verdict: "pass",
    winner: true,
  },
  {
    id: "LC3-40",
    label: "Long Soft Cap",
    balance: 0.51,
    skill: 0.72,
    draws: 0.14,
    verdict: "warn",
    failReason: "Draw rate creeps. Readable but flat.",
  },
  {
    id: "LC1-3",
    label: "Triple Repeat",
    balance: 0.48,
    skill: 0.69,
    draws: 0.0,
    verdict: "warn",
    failReason: "Balanced, but defensive play dominates.",
  },
];

/**
 * Glossary terms. Every Term used in the narrative should be listed here.
 * The definitions are deliberately short \u2014 one sentence where possible,
 * two where the first sentence would lie by omission.
 */
export type GlossaryEntry = {
  term: string;
  short: string; // inline popover
  long: string;  // glossary section
  group: "AI" | "Pogo" | "Infra";
};

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Minimax",
    group: "AI",
    short: "A search that plays optimally by assuming the opponent does too.",
    long: "A classical search algorithm: build the game tree, assume each side picks the move that is best for them and worst for the other, back up the values from the leaves. It is optimal on finite games but needs every branch to eventually end \u2014 the thing Pogo, in its original form, does not do.",
  },
  {
    term: "Alpha-beta pruning",
    group: "AI",
    short: "A shortcut that skips branches proven worse than one you've already seen.",
    long: "An upgrade to minimax. As you search, you keep track of the best value each player has already guaranteed; when a branch can no longer beat that bound you stop exploring it. In a well-ordered tree it roughly halves the exponent of the search cost.",
  },
  {
    term: "Transposition table",
    group: "AI",
    short: "A hash map of positions already evaluated, so you don't redo the work.",
    long: "Game search algorithms revisit the same position through different move orders (\u201Ctranspositions\u201D). Caching the result keyed by the position itself turns an exponential blow-up into something manageable \u2014 at the cost of memory, which is exactly how six days ended in 36 GB and an OOM.",
  },
  {
    term: "RL",
    group: "AI",
    short: "Reinforcement learning \u2014 learning from rewards and punishments, not labels.",
    long: "Reinforcement learning. A branch of machine learning where an agent picks actions, observes a reward signal, and updates its strategy to get more reward over time. No teacher says \u201Cthis move is correct\u201D; the only signal is wins and losses accumulated over many games.",
  },
  {
    term: "Q-learning",
    group: "AI",
    short: "The simplest RL method \u2014 a table of \u201Cexpected reward\u201D per move per state.",
    long: "The entry-level RL algorithm. Keep a table of numbers Q(state, action) estimating the long-term reward of taking an action from a state, and update it using the Bellman equation after each transition. It is exact on small problems and utterly impractical on large ones \u2014 the table becomes bigger than RAM.",
  },
  {
    term: "DQN",
    group: "AI",
    short: "Deep Q-Network: Q-learning with a neural net instead of a table.",
    long: "Deep Q-Network. DeepMind's 2013 result: replace the Q-table with a neural network that takes a position as input and outputs a value for each legal move. The network generalises, so you are no longer bounded by RAM. In this project DQN was the second opponent I trained \u2014 it beat random play handily and lost to AlphaZero.",
  },
  {
    term: "AlphaZero",
    group: "AI",
    short: "DeepMind 2017 \u2014 one network, self-play, guided tree search, no human games.",
    long: "A training recipe. A single neural network outputs both a move policy and a position value. The agent plays against itself thousands of times, each move guided by Monte Carlo Tree Search that consults the network. Training uses only the outcomes of those games \u2014 no human examples required. It is the strongest opponent in this project.",
  },
  {
    term: "MCTS",
    group: "AI",
    short: "Monte Carlo Tree Search \u2014 expand a tree toward moves that look promising.",
    long: "Monte Carlo Tree Search. Instead of exhaustively searching, repeatedly simulate playouts from the current position, grow the tree toward moves that did well, and return the most-visited action. Combined with a neural-network prior it becomes the core of AlphaZero.",
  },
  {
    term: "PUCT",
    group: "AI",
    short: "The MCTS scoring rule that balances exploring new moves against exploiting known good ones.",
    long: "The formula MCTS uses to pick which node to expand next. It adds a bonus for rarely-visited moves that the policy network believes are good, so the tree grows toward promising-but-under-explored branches. The letters stand for Polynomial Upper Confidence Trees.",
  },
  {
    term: "Self-play",
    group: "AI",
    short: "The AI plays itself to generate its own training data.",
    long: "Training data made by pitting the current network against itself. No humans required. Each game produces a trajectory of (state, policy, outcome) triples used to nudge the network toward better moves. The quality of the training data improves as the network does \u2014 a virtuous loop.",
  },
  {
    term: "Gatekeeper",
    group: "AI",
    short: "A match between the new candidate and the current best \u2014 promote only if it wins enough.",
    long: "A gate that keeps training honest. When a new candidate network is produced, it plays a batch of games against the current champion. If it wins above a threshold (here: 55%), it becomes the new champion. Otherwise the candidate is discarded. Stops fluke training runs from being called progress.",
  },
  {
    term: "Policy / value network",
    group: "AI",
    short: "Two outputs from the same network: which move is good, and who is winning.",
    long: "An AlphaZero-style network has two heads. The policy head outputs a probability distribution over legal moves; the value head outputs a single number estimating the outcome for the current player. Both are trained jointly from self-play data.",
  },
  {
    term: "ONNX",
    group: "Infra",
    short: "A neural network file format different frameworks can load.",
    long: "Open Neural Network Exchange. A portable serialisation for trained models. Here a Python script exports the PyTorch checkpoint into ONNX, and the browser loads the same file through onnxruntime-web \u2014 the network trained on my iMac runs unchanged on your phone.",
  },
  {
    term: "WASM",
    group: "Infra",
    short: "WebAssembly \u2014 compiled code that runs in the browser near-native speed.",
    long: "WebAssembly. A portable binary format for code running inside the browser. The Rust engine that drives training on the server is compiled to WASM and shipped to your browser, which is how your opponent uses exactly the same move generator the training loop did.",
  },
  {
    term: "Rust",
    group: "Infra",
    short: "A systems language that eliminates a whole class of memory bugs at compile time.",
    long: "A programming language designed by Mozilla. Memory-safe without a garbage collector, fast enough for compilers and game engines, compiles to both native binaries and WebAssembly. In this project it replaces a Python+TypeScript combination that used to drift between training and production.",
  },
  {
    term: "Manhattan distance",
    group: "Pogo",
    short: "How many orthogonal steps between two cells \u2014 no diagonals.",
    long: "For two cells at (x1,y1) and (x2,y2), the value |x1\u2212x2| + |y1\u2212y2|. It is how a taxi would measure distance on a grid of streets. In Pogo, a 1-piece move travels distance 1, a 2-piece move distance 2, a 3-piece move distance 1 or 3.",
  },
  {
    term: "Lazy equilibrium",
    group: "Pogo",
    short: "A stable position where neither side is forced to take a risk.",
    long: "Not a standard term \u2014 my shorthand for a Pogo state where the two players can keep shuffling pieces between the same three cells without ever forming a tower. Neither is losing, neither is winning, and the game, under natural rules, does not end.",
  },
  {
    term: "Round robin",
    group: "AI",
    short: "A tournament where every opponent plays every other opponent.",
    long: "Each opponent plays every other opponent a fixed number of games, half as White and half as Red. The resulting win-rate matrix tells you not just who is strongest but how the rule variant behaves at every skill tier \u2014 important because a rule that works for strong players can fail for weak ones, and vice versa.",
  },
];

export const FMT = {
  compact(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
    return String(n);
  },
  pct(n: number, digits = 0): string {
    return (n * 100).toFixed(digits) + "%";
  },
};
