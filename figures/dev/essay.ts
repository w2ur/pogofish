// The essay's figures in page order, with the paragraph the reader has just read
// above each and the author's own caption under it, copied from the hub's récit
// (william-revah-paris, src/content/stories-{fr,en}/pogofish.mdx) for the harness only.
export interface EssayFigure {
  tag: string;
  attrs: Record<string, string>;
  fr: { para: string; caption: string; fallback: string };
  en: { para: string; caption: string; fallback: string };
}

export const ESSAY: EssayFigure[] = [
  {
    "tag": "pogo-moves",
    "attrs": {
      "view": "start"
    },
    "fr": {
      "para": "Au départ, six pièces de chaque couleur sont disposées de part et d’autre d’un plateau de trois par trois cases, empilées deux par deux, comme illustré ci-dessous.",
      "caption": "Position de départ du Pogo.",
      "fallback": "Le plateau de trois cases sur trois au départ. Chaque joueur a une pile de deux pièces de sa couleur sur chacune des trois cases de sa rangée."
    },
    "en": {
      "para": "At the start, six pieces of each colour are placed on either side of a board of three by three squares, stacked two by two, as illustrated below.",
      "caption": "The starting position in Pogo.",
      "fallback": "The three-by-three board at the start. Each player has a stack of two pieces of their colour on each of the three squares of their row."
    }
  },
  {
    "tag": "pogo-moves",
    "attrs": {
      "view": "moves"
    },
    "fr": {
      "para": "Voici une illustration de ces quelques mouvements.",
      "caption": "Les différents coups possibles au Pogo.",
      "fallback": "Les déplacements possibles depuis une pile : autant de mouvements que de pièces saisies, une, deux ou trois, chaque mouvement étant un déplacement orthogonal d’une case."
    },
    "en": {
      "para": "Here is an illustration of these few moves.",
      "caption": "The different possible moves in Pogo.",
      "fallback": "The possible moves from a stack: as many steps as pieces picked up, one, two or three, each step being an orthogonal move of one square."
    }
  },
  {
    "tag": "pogo-line",
    "attrs": {
      "line": "shortestWin",
      "rules": "A"
    },
    "fr": {
      "para": "Le joueur qui l’emporte est celui qui a une pièce de sa couleur au sommet de toutes les piles du plateau, comme sur l’illustration ci-dessous, où les Rouges jouent très mal et les Blancs l’emportent.",
      "caption": "Toute ressemblance avec une partie réelle serait purement fortuite.",
      "fallback": "Une partie courte, coup par coup, jusqu’à ce que les Blancs aient une pièce au sommet de chaque pile."
    },
    "en": {
      "para": "The winner is the player who has a piece of their colour on top of every stack on the board, as in the illustration below, where Red plays very badly and White wins.",
      "caption": "Any resemblance to a real game would be purely coincidental.",
      "fallback": "A short game, move by move, until White has a piece on top of every stack."
    }
  },
  {
    "tag": "pogo-board",
    "attrs": {
      "mode": "inline"
    },
    "fr": {
      "para": "Pour vous faire la main et appréhender les règles, vous pouvez jouer ici.",
      "caption": "",
      "fallback": "Ici, un plateau de Pogo pour jouer une partie contre l’ordinateur ; il demande JavaScript."
    },
    "en": {
      "para": "To get the hang of it and grasp the rules, you can play here.",
      "caption": "",
      "fallback": "Here, a Pogo board to play a game against the computer; it needs JavaScript."
    }
  },
  {
    "tag": "pogo-line",
    "attrs": {
      "line": "loop",
      "rules": "A"
    },
    "fr": {
      "para": "Et ça, j’aurais pu m’en rendre compte si je ne m’étais pas lancé bille en tête et avais fait quelques parties à la main, moi-même. Que l’on peut atteindre une boucle, ça se voit assez bien depuis la position initiale : chaque joueur peut déplacer à tour de rôle une de ses pièces d’avant en arrière, ce qu’illustre la figure suivante.",
      "caption": "Refuser le jeu engendre une partie sans fin.",
      "fallback": "Une partie où chaque joueur déplace une de ses pièces d’une case puis la ramène, et ainsi de suite sans fin."
    },
    "en": {
      "para": "And that I could have realised if I had not charged in headlong, and had played a few games by hand, myself. That a loop can be reached is fairly easy to see from the initial position: each player can in turn move one of their pieces back and forth, as the following figure shows.",
      "caption": "Refusing to play makes for an endless game.",
      "fallback": "A game in which each player moves one of their pieces one square, then brings it back, and so on without end."
    }
  },
  {
    "tag": "pogo-count",
    "attrs": {},
    "fr": {
      "para": "Le total est donc de 924 × 125 970 × 2 = 232 792 560. Ce qui confirme l’intuition initiale : le Pogo est un jeu aux dimensions « raisonnables », et le souci, ce n’est pas le nombre d’états possibles, mais les boucles. Ce calcul n’avait pas été fait correctement au moment de mes premiers essais, et encore une fois, il a manqué.",
      "caption": "",
      "fallback": "Le décompte des positions du Pogo, étape par étape, jusqu’au total de 232 792 560."
    },
    "en": {
      "para": "The total is therefore 924 × 125,970 × 2 = 232,792,560. Which confirms the initial intuition: Pogo is a game of “reasonable” dimensions, and the trouble is not the number of possible states, but the loops. This calculation had not been done properly at the time of my first attempts, and once again, it was missing.",
      "caption": "",
      "fallback": "The count of Pogo positions, step by step, up to the total of 232,792,560."
    }
  },
  {
    "tag": "pogo-reach",
    "attrs": {},
    "fr": {
      "para": "Cette méthode termine parce qu’elle ne s’intéresse pas aux chemins, infinis parce que l’on peut tourner en rond, seulement aux positions, nombreuses mais finies.",
      "caption": "",
      "fallback": "L’exploration en largeur, niveau par niveau : les positions nouvelles atteintes à chaque coup, jusqu’au quinzième."
    },
    "en": {
      "para": "This method terminates because it is not interested in paths, infinite because one can go round in circles, only in positions, numerous but finite.",
      "caption": "",
      "fallback": "The breadth-first exploration, level by level: the new positions reached at each move, up to the fifteenth."
    }
  },
  {
    "tag": "pogo-retrograde",
    "attrs": {},
    "fr": {
      "para": "Voici une illustration qui aidera, je l’espère, à mieux comprendre le principe.",
      "caption": "Illustration animée de l’analyse rétrograde.",
      "fallback": "L’analyse rétrograde : en partant des fins de partie, les positions sont marquées gagnées ou perdues, tour après tour, en remontant vers le départ."
    },
    "en": {
      "para": "Here is an illustration which will, I hope, help to understand the principle better.",
      "caption": "Animated illustration of retrograde analysis.",
      "fallback": "Retrograde analysis: starting from the ends of games, positions are marked won or lost, pass after pass, working back towards the start."
    }
  },
  {
    "tag": "pogo-line",
    "attrs": {
      "line": "centreLoss",
      "rules": "A"
    },
    "fr": {
      "para": "Arrivé à ce stade du récit, un bilan s’impose. Le Pogo est en fait si petit qu’il n’est nul besoin d’apprentissage par renforcement pour le « résoudre » ou trouver la bonne stratégie. Une analyse déterministe complète est tout à fait possible, et un joueur qui apprend tous les bons mouvements ne peut pas perdre : soit il se lance dans une partie sans fin parce que son adversaire les connaît aussi, soit son adversaire ne les connaît pas, fait une erreur, et perd. Illustration ci-dessous : les Blancs commettent l’erreur de jouer au centre pour démarrer, les Rouges forcent la victoire.",
      "caption": "Nous ne sommes pas aux échecs, il ne faut surtout pas prendre le centre.",
      "fallback": "Une partie où les Blancs jouent au centre au premier coup et où les Rouges forcent la victoire."
    },
    "en": {
      "para": "Having reached this point in the story, some stock-taking is in order. Pogo is in fact so small that there is no need whatsoever for reinforcement learning to “solve” it or to find the right strategy. A complete deterministic analysis is entirely possible, and a player who learns all the right moves cannot lose: either they embark on an endless game because their opponent knows them too, or their opponent does not know them, makes a mistake, and loses. Illustration below: White makes the mistake of playing to the centre to start, Red forces the win.",
      "caption": "This is not chess, whatever you do, do not take the centre.",
      "fallback": "A game in which White plays to the centre on the first move and Red forces the win."
    }
  },
  {
    "tag": "pogo-openings",
    "attrs": {},
    "fr": {
      "para": "Et faire attention à ne surtout pas suivre ces principes au premier coup, pour lequel il vaut mieux rester chez soi. Sur les seize premiers coups possibles, seuls les six qui consistent à jouer sur sa propre rangée évitent la défaite, comme le montrent les deux illustrations qui suivent.",
      "caption": "Ne perdez presque plus jamais au Pogo avec les Rouges.",
      "fallback": "Les seize premiers coups possibles et leur issue : seuls les six qui restent sur la rangée de départ évitent la défaite."
    },
    "en": {
      "para": "And of taking great care not to follow these principles on the first move, for which it is better to stay at home. Of the sixteen possible first moves, only the six that consist of playing on your own row avoid defeat, as the two illustrations that follow show.",
      "caption": "Hardly ever lose at Pogo with Red again.",
      "fallback": "The sixteen possible first moves and their outcome: only the six that stay on the starting row avoid defeat."
    }
  },
  {
    "tag": "pogo-line",
    "attrs": {
      "line": "openingWin",
      "rules": "A"
    },
    "fr": {
      "para": "Et faire attention à ne surtout pas suivre ces principes au premier coup, pour lequel il vaut mieux rester chez soi. Sur les seize premiers coups possibles, seuls les six qui consistent à jouer sur sa propre rangée évitent la défaite, comme le montrent les deux illustrations qui suivent.",
      "caption": "Une belle victoire des Blancs, parce que les Rouges font une erreur fatale dans l’ouverture.",
      "fallback": "Une partie où les Rouges font une erreur dans l’ouverture et où les Blancs gagnent."
    },
    "en": {
      "para": "And of taking great care not to follow these principles on the first move, for which it is better to stay at home. Of the sixteen possible first moves, only the six that consist of playing on your own row avoid defeat, as the two illustrations that follow show.",
      "caption": "A fine win for White, because Red makes a fatal mistake in the opening.",
      "fallback": "A game in which Red makes a mistake in the opening and White wins."
    }
  },
  {
    "tag": "pogo-greedy",
    "attrs": {},
    "fr": {
      "para": "- Le hasard : le programme joue des coups aléatoires (ou presque : s’il y a un gain immédiat, il le joue, une défaite immédiate, il l’évite).\n- Le glouton : le programme applique un algorithme simple. Il explore tous les coups et en choisit un qui maximise l’écart entre son nombre de piles et celui de son adversaire. Voici ci-dessous une partie glouton contre glouton.",
      "caption": "On a faim !",
      "fallback": "Une partie entre deux programmes gloutons, chacun choisissant le coup qui maximise l’écart entre son nombre de piles et celui de son adversaire."
    },
    "en": {
      "para": "- Random: the program plays random moves (or almost: if there is an immediate win, it plays it, an immediate loss, it avoids it).\n- Greedy: the program applies a simple algorithm. It explores every move and picks one that maximises the gap between its number of stacks and its opponent’s. Below is a game of greedy against greedy.",
      "caption": "We’re hungry!",
      "fallback": "A game between two greedy programs, each choosing the move that maximises the gap between its number of stacks and its opponent’s."
    }
  },
  {
    "tag": "pogo-qsteps",
    "attrs": {},
    "fr": {
      "para": "Ainsi, au début de l’apprentissage, tous les coups sont joués au hasard. Au fur et à mesure de l’apprentissage, seuls 5 % des coups le sont encore, et la valeur des positions gagnantes s’est propagée vers les positions qui y mènent. Voici une tentative d’illustration.",
      "caption": "Tentative d’épuisement d’un lieu d’explication.",
      "fallback": "Le Q-learning pas à pas : les notes des positions, toutes à 0 au départ, mises à jour coup après coup."
    },
    "en": {
      "para": "So, at the start of learning, every move is played at random. As learning goes on, only 5% of moves still are, and the value of the winning positions has spread back to the positions that lead to them. Here is an attempt at an illustration.",
      "caption": "An attempt at exhausting a place of explanation.",
      "fallback": "Q-learning step by step: the scores of the positions, all at 0 to begin with, updated move after move."
    }
  },
  {
    "tag": "pogo-stages",
    "attrs": {
      "program": "qtab"
    },
    "fr": {
      "para": "Pour aller au bout de la démarche de machine learning, qu’apprenons-nous de l’apprentissage du Q-learning ? Déjà, qu’il est assez lent. Un Q-learning débutant, qui est donc un joueur quasi aléatoire, gagne environ 3 % de ses parties contre le glouton, 48 % contre un autre joueur aléatoire. Après 1 h 45 et 5 millions de parties, il en remporte presque 18 % contre le glouton, 78 % contre le hasard. Il a donc indéniablement progressé, mais en ne visitant qu’un peu plus de 45 % des positions atteignables. Avec plus de temps, et donc davantage de parties, il apprendrait peut-être davantage. Il apprendrait peut-être plus rapidement avec une autre formule de score. Autant de raffinements dont nous allons nous passer pour nous concentrer sur l’étape suivante, les méthodes qui utilisent des réseaux de neurones. Mais avant cela, une illustration des progrès du Q-learning.",
      "caption": "",
      "fallback": "Des parties du Q-learning à plusieurs étapes de son apprentissage."
    },
    "en": {
      "para": "To see the machine learning approach through to the end, what do we learn from Q-learning’s learning? First, that it is rather slow. A beginner Q-learning agent, which is therefore an almost random player, wins about 3% of its games against the greedy player, 48% against another random player. After 1 hour 45 minutes and 5 million games, it wins almost 18% of them against the greedy player, 78% against the random one. So it has undeniably progressed, but while visiting only a little over 45% of the reachable positions. With more time, and therefore more games, it might learn more. It might learn faster with another scoring formula. So many refinements we will do without, in order to concentrate on the next step, the methods that use neural networks. But before that, an illustration of Q-learning’s progress.",
      "caption": "",
      "fallback": "Games played by Q-learning at several stages of its training."
    }
  },
  {
    "tag": "pogo-net",
    "attrs": {
      "kind": "td"
    },
    "fr": {
      "para": "Passons maintenant aux réseaux de neurones. Qu’est-ce que c’est, un réseau de neurones ? C’est ça :",
      "caption": "",
      "fallback": "Un réseau de neurones : une position à gauche, ses 127 valeurs d’entrée, deux couches de 128 et 64 neurones, et un neurone de sortie qui donne la note de la position."
    },
    "en": {
      "para": "Let us now move on to neural networks. What is it, a neural network? It’s this:",
      "caption": "",
      "fallback": "A neural network: a position on the left, its 127 input values, two layers of 128 and 64 neurons, and an output neuron that gives the position’s score."
    }
  },
  {
    "tag": "pogo-encoding",
    "attrs": {},
    "fr": {
      "para": "Ce qui fait un total de 9 × 14 = 126. Le 127ᵉ, c’est le nombre de répétitions de la position. Voilà ce que ça donne avec la position ci-dessus.",
      "caption": "C’est fou tout ce qu’il se passe dans la tête d’une machine !",
      "fallback": "La même position traduite en 127 nombres : 14 pour chacune des neuf cases, puis le nombre de répétitions de la position."
    },
    "en": {
      "para": "Which makes a total of 9 × 14 = 126. The 127th is the number of repetitions of the position. Here is what that gives with the position above.",
      "caption": "It’s crazy, everything that goes on in a machine’s head!",
      "fallback": "The same position translated into 127 numbers: 14 for each of the nine squares, then the number of repetitions of the position."
    }
  },
  {
    "tag": "pogo-td-targets",
    "attrs": {},
    "fr": {
      "para": "Voici comment l’algorithme dit de Temporal Difference tire profit de ce réseau. D’abord, les poids sont initialisés au hasard, ce qui permet au réseau de calculer une note finale pour n’importe quelle position. L’algorithme peut donc jouer en demandant au réseau la note des positions issues de chaque coup possible et en choisissant le coup qui mène à la position ayant la meilleure note. Arrivé à la fin d’une partie, on connait le résultat. On peut donc comparer, position par position de la partie, le résultat donné par le réseau au résultat qu’il aurait dû lui donner, note que l’on appelle « la cible » et qu’il s’agit donc de calculer. Pour ce faire, l’algorithme attribue le score cible suivant : 30 % de la note par le réseau de la position suivante + 70 % de la cible suivante. C’est à cela que correspond le paramètre λ dans TD(λ) : le pourcentage de la cible suivante qui remonte. Les poids du réseau sont ajustés pour rapprocher les valeurs calculées des valeurs cibles, ce qui a le bon gout de se propager à des positions encore non explorées et donc d’accélérer l’apprentissage. Ce qui se constate assez bien : en une minute et 50 000 parties, il passe de 7 à plus de 78 % de victoires contre le glouton. Voyez les valeurs cibles remonter, et mirez son apprentissage.",
      "caption": "Pour ceux qui ont du mal avec le calcul mental.",
      "fallback": "Les valeurs cibles d’une partie, calculées depuis la fin et remontant position par position."
    },
    "en": {
      "para": "Here is how the so-called Temporal Difference algorithm makes use of this network. First, the weights are initialised at random, which allows the network to compute a final score for any position. The algorithm can therefore play by asking the network for the score of the positions resulting from each possible move and choosing the move that leads to the position with the best score. At the end of a game, we know the result. We can therefore compare, position by position through the game, the result given by the network with the result it should have given, a score we call “the target” and which therefore has to be calculated. To do so, the algorithm assigns the following target score: 30% of the network’s score for the next position + 70% of the next target. That is what the λ parameter in TD(λ) corresponds to: the percentage of the next target that flows back. The network’s weights are adjusted to bring the computed values closer to the target values, which has the good grace to spread to positions not yet explored and so to speed up learning. Which can be seen quite clearly: in one minute and 50,000 games, it goes from 7 to more than 78% wins against the greedy player. See the target values flow back, and behold its learning.",
      "caption": "For those who struggle with mental arithmetic.",
      "fallback": "The target values of a game, calculated from the end and flowing back position by position."
    }
  },
  {
    "tag": "pogo-stages",
    "attrs": {
      "program": "td"
    },
    "fr": {
      "para": "Voici comment l’algorithme dit de Temporal Difference tire profit de ce réseau. D’abord, les poids sont initialisés au hasard, ce qui permet au réseau de calculer une note finale pour n’importe quelle position. L’algorithme peut donc jouer en demandant au réseau la note des positions issues de chaque coup possible et en choisissant le coup qui mène à la position ayant la meilleure note. Arrivé à la fin d’une partie, on connait le résultat. On peut donc comparer, position par position de la partie, le résultat donné par le réseau au résultat qu’il aurait dû lui donner, note que l’on appelle « la cible » et qu’il s’agit donc de calculer. Pour ce faire, l’algorithme attribue le score cible suivant : 30 % de la note par le réseau de la position suivante + 70 % de la cible suivante. C’est à cela que correspond le paramètre λ dans TD(λ) : le pourcentage de la cible suivante qui remonte. Les poids du réseau sont ajustés pour rapprocher les valeurs calculées des valeurs cibles, ce qui a le bon gout de se propager à des positions encore non explorées et donc d’accélérer l’apprentissage. Ce qui se constate assez bien : en une minute et 50 000 parties, il passe de 7 à plus de 78 % de victoires contre le glouton. Voyez les valeurs cibles remonter, et mirez son apprentissage.",
      "caption": "",
      "fallback": "Des parties du programme TD(λ) à plusieurs étapes de son apprentissage."
    },
    "en": {
      "para": "Here is how the so-called Temporal Difference algorithm makes use of this network. First, the weights are initialised at random, which allows the network to compute a final score for any position. The algorithm can therefore play by asking the network for the score of the positions resulting from each possible move and choosing the move that leads to the position with the best score. At the end of a game, we know the result. We can therefore compare, position by position through the game, the result given by the network with the result it should have given, a score we call “the target” and which therefore has to be calculated. To do so, the algorithm assigns the following target score: 30% of the network’s score for the next position + 70% of the next target. That is what the λ parameter in TD(λ) corresponds to: the percentage of the next target that flows back. The network’s weights are adjusted to bring the computed values closer to the target values, which has the good grace to spread to positions not yet explored and so to speed up learning. Which can be seen quite clearly: in one minute and 50,000 games, it goes from 7 to more than 78% wins against the greedy player. See the target values flow back, and behold its learning.",
      "caption": "",
      "fallback": "Games played by the TD(λ) program at several stages of its training."
    }
  },
  {
    "tag": "pogo-net",
    "attrs": {
      "kind": "az"
    },
    "fr": {
      "para": "Vient ensuite AlphaZero, qui utilise lui aussi un réseau de neurones, avec pour notable différence de produire deux sorties : une note de la position, comme le TD(λ), mais aussi une liste de préférences par coup (de telle façon qu’un coup illégal a une valeur nulle, et que les coups légaux se voient tous attribuer un pourcentage dont la somme fait 1). En voici une illustration.",
      "caption": "Plus de neurones, plus d’intelligence ?",
      "fallback": "Le réseau d’AlphaZero et ses deux sorties : une note de la position et une préférence pour chaque coup."
    },
    "en": {
      "para": "Next comes AlphaZero, which also uses a neural network, with the notable difference that it produces two outputs: a score for the position, like TD(λ), but also a list of preferences per move (in such a way that an illegal move has a value of zero, and that legal moves are each given a percentage, all of which add up to 1). Here is an illustration.",
      "caption": "More neurons, more intelligence?",
      "fallback": "AlphaZero’s network and its two outputs: a score for the position and a preference for each move."
    }
  },
  {
    "tag": "pogo-search",
    "attrs": {
      "position": "puzzle5"
    },
    "fr": {
      "para": "Avec ces deux sorties, AlphaZero suit tout un protocole pour choisir un coup, qui consiste grosso modo à lancer 100 simulations de partie (la recherche), en les arrêtant à chaque fois qu’il arrive à une position encore jamais simulée à ce tour. Pour choisir le coup suivant à chaque étape de simulation, il choisit le coup qui maximise la note moyenne déjà attribuée à ce coup et un bonus issu des préférences du réseau. À la fin, l’algorithme note l’évaluation de cette position finale (ou bien le résultat si c’est une victoire ou une défaite). Au cours de ces simulations, il compte le nombre de passages par chaque coup, et la note moyenne attribuée aux positions finales qui passent par ce coup. À la fin, il joue le coup qu’il a le plus visité.",
      "caption": "Est-ce plus clair ainsi ?",
      "fallback": "La recherche d’AlphaZero sur une position : ses simulations, le nombre de passages par chaque coup et le coup qu’il joue."
    },
    "en": {
      "para": "With these two outputs, AlphaZero follows a whole protocol to choose a move, which roughly consists of launching 100 simulated games (the search), stopping them each time it reaches a position not yet simulated on this turn. To choose the next move at each step of a simulation, it picks the move that maximises the average score already given to that move and a bonus drawn from the network’s preferences. At the end, the algorithm records the evaluation of this final position (or else the result if it is a win or a loss). Over the course of these simulations, it counts the number of visits to each move, and the average score given to the final positions that go through that move. At the end, it plays the move it has visited most.",
      "caption": "Is it clearer like this?",
      "fallback": "AlphaZero’s search on a position: its simulations, the number of visits to each move and the move it plays."
    }
  },
  {
    "tag": "pogo-stages",
    "attrs": {
      "program": "az100"
    },
    "fr": {
      "para": "Avec cette méthode, en 10 000 parties, il passe d’un peu plus de 20 % de parties gagnées contre le glouton à 89 %, par contre cela prend bien plus de temps, à cause de toutes les simulations. Lui aussi a droit à sa petite figure.",
      "caption": "",
      "fallback": "Des parties d’AlphaZero à plusieurs étapes de son apprentissage."
    },
    "en": {
      "para": "With this method, in 10,000 games, it goes from a little over 20% of games won against the greedy player to 89%, though it takes much longer, because of all the simulations. It too gets its own little figure.",
      "caption": "",
      "fallback": "Games played by AlphaZero at several stages of its training."
    }
  },
  {
    "tag": "pogo-race",
    "attrs": {},
    "fr": {
      "para": "Au final, combien de parties d’entrainement faut-il à chaque algorithme pour surpasser le glouton ? La figure suivante va nous l’apprendre.",
      "caption": "",
      "fallback": "Le nombre de parties d’entrainement qu’il faut à chaque programme pour dépasser le glouton."
    },
    "en": {
      "para": "In the end, how many training games does each algorithm need to beat the greedy player? The next figure will tell us.",
      "caption": "",
      "fallback": "The number of training games each program needs to overtake the greedy player."
    }
  },
  {
    "tag": "pogo-mosaic",
    "attrs": {},
    "fr": {
      "para": "Et les mosaïques ci-dessous le montrent très visuellement.",
      "caption": "Elles ne sont pas belles, ces mosaïques ?",
      "fallback": "Des mosaïques qui montrent, pour chaque programme, l’évolution de ses résultats au fil de l’entrainement."
    },
    "en": {
      "para": "And the mosaics below show it very visually.",
      "caption": "Aren’t they beautiful, these mosaics?",
      "fallback": "Mosaics showing, for each program, how its results evolve over the course of training."
    }
  }
];
