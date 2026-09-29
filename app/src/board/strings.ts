import type { Lang, Level } from "./embed";

export interface BoardStrings {
  title: string;
  youPlay: string;
  white: string;
  red: string;
  level: string;
  levels: Record<Level, string>;
  levelNote: string;
  newGame: string;
  yourTurn: string;
  thinking: string;
  loading: string;
  youWin: string;
  youLose: string;
  failed: string;
}

export const STRINGS: Record<Lang, BoardStrings> = {
  fr: {
    title: "Pogo",
    youPlay: "Vous jouez",
    white: "Blancs",
    red: "Rouges",
    level: "Niveau",
    levels: { easy: "facile", normal: "normal", hard: "difficile" },
    levelNote:
      "Seul « normal » est le niveau mesuré ; facile et difficile ne portent aucune affirmation de force.",
    newGame: "Nouvelle partie",
    yourTurn: "À vous de jouer",
    thinking: "Le réseau réfléchit…",
    loading: "Chargement du réseau…",
    youWin: "Vous gagnez.",
    youLose: "Vous perdez.",
    failed: "Le réseau n’a pas pu se charger.",
  },
  en: {
    title: "Pogo",
    youPlay: "You play",
    white: "White",
    red: "Red",
    level: "Level",
    levels: { easy: "easy", normal: "normal", hard: "hard" },
    levelNote: "Only “normal” is the measured level; easy and hard carry no strength claim.",
    newGame: "New game",
    yourTurn: "Your turn",
    thinking: "The net is thinking…",
    loading: "Loading the net…",
    youWin: "You win.",
    youLose: "You lose.",
    failed: "The net could not be loaded.",
  },
};
