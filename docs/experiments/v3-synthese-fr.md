# Pogofish, troisième tour : synthèse pour l’article

Matière première, pas l’article. Chaque chiffre renvoie à sa source ; rien n’est arrondi au-delà de ce qu’elle donne. Les comptes rendus détaillés, en anglais :

- `docs/experiments/v2-principles.md` : les principes stratégiques ;
- `docs/experiments/v3-repetition-outcome.md` : la répétition, nulle ou défaite ;
- `docs/experiments/v3-solve.md` : la résolution exacte du jeu ;
- `docs/experiments/v3-principles-perfect.md` : les principes du jeu parfait et l’ouverture ;
- `docs/experiments/v3-lc1-solve.md` : qui gagne sous lc1-2, non résolu.

---

## Ce qu’il faut retenir

1. **Le Pogo publié est une partie nulle.** Joué parfaitement des deux côtés, personne ne gagne. Ce n’est plus une intuition mais un calcul exact, sur les 232 792 560 positions possibles, en deux à trois minutes sur un Mac de 8 Go.
2. **Cette nulle est étroite.** Sur les 16 premiers coups des Blancs, six gardent la nulle, et tous restent sur la rangée de départ. Les dix autres perdent de force.
3. **L’IA vaut mieux qu’on ne pouvait le mesurer, et moins qu’elle n’en avait l’air.** Face au jeu parfait, elle joue un coup qui conserve le résultat théorique dans 86 % des cas, le joueur glouton dans 51 %, le hasard dans 31 %. Elle se trompe surtout dans l’ouverture.
4. **La règle de répétition que j’ai ajoutée change la nature du jeu.** Un jeu nul devient un jeu où l’un des deux camps gagne forcément, sans qu’on sache lequel, et ce gain passe par la gestion des répétitions. Faire de la répétition une nulle a été testé, et rejeté : les parties ne se tranchaient plus assez.
5. **Cinq principes, que l’on peut appliquer sans machine, rendent un joueur plus fort.** Mais regarder un coup plus loin vaut davantage que les cinq réunis.

---

## Un fil possible pour l’article

Le premier tour, j’avais cru la machine sur parole. Le second, j’avais mesuré, et j’avais perdu toutes mes parties contre elle au niveau « normal » (`v2-results.md`, section *Search depth*). Le troisième répond à la question que les deux premiers ne pouvaient pas poser : que vaut le jeu lui-même ?

Et la réponse a quelque chose d’ironique. Le jeu que la machine apprend depuis le début est nul ; si elle gagne, c’est que ses adversaires se trompent, et que j’ai moi-même ajouté une règle qui oblige quelqu’un à gagner. L’outil qui a tranché n’est pas l’intelligence artificielle, mais une méthode des années 1970, celle des tables de finales aux échecs (à vérifier, je cite de mémoire), qui ne fait que compter, patiemment, à rebours.

Deux autres pistes, plus courtes :

- **La machine sait jouer, pas expliquer.** Pour en tirer des principes, il a fallu la traiter comme un sujet d’expérience : formuler des hypothèses, puis les mettre à l’épreuve chez un joueur plus bête qu’elle.
- **L’échec du premier tour venait de l’outil, pas de la taille du jeu.** Il avait épuisé la mémoire au bout de six jours ; la bonne méthode a tout résolu en trois minutes.

---

## 1. Les principes du Pogo

**Méthode.**

- Le réseau joue 600 parties contre lui-même. On mesure, sur 21 637 positions, une quinzaine de caractéristiques : hauteur des piles, pièces prisonnières, mobilité, centre, coins, etc.
- Pour chacune, on regarde si elle explique ses choix.
- Chaque hypothèse devient une règle de départage pour le joueur glouton, celui qui maximise ses piles moins celles de l’adversaire. Elle doit alors le rendre plus fort que le glouton simple.
- Les poids sont choisis sur un premier tirage d’ouvertures, puis confirmés sur un second, jamais vu : 1 000 paires, couleurs échangées, intervalles de confiance à 95 %.
- Chaque principe est aussi testé à l’envers. S’il gagne dans les deux sens, ce n’est pas un principe, seulement un départage qui vaut mieux que le hasard.

**Les cinq principes retenus.** Le score est celui du glouton qui applique le principe, face au glouton simple. Chacun sert à choisir entre des coups qui laissent le même nombre de piles.

1. **Empilez sur l’adversaire :** gardez une haute pile qui retient ses pièces prisonnières. 0,632 [0,613 ; 0,650] pour la hauteur de la plus haute pile.
2. **Gardez ses piles basses**, et vos pièces hors de dessous les siennes. 0,622 [0,603 ; 0,640].
3. **Ne laissez pas vos sommets là où il peut se poser**, et évitez les pièces isolées. 0,625 [0,607 ; 0,642].
4. **Préférez les positions où ses sommets sont des pièces seules**, qui n’avancent que d’une case. 0,601 [0,583 ; 0,619].
5. **Ne lui laissez jamais un coup qui prend votre dernier sommet.** 0,542 [0,522 ; 0,561]. Le principe inverse tombe à 0,192.

**Ce qui ne compte pas.**

- **Le centre :** 0,498, au hasard. L’intuition venue des échecs ne s’applique pas.
- **Se créer une menace de gain :** 0,497.
- **La préférence la plus nette du réseau,** revenir vers une position déjà vue une fois : 0,511, inutile à un joueur qui ne calcule pas. Elle pourrait tenir à la règle de répétition, qui ne s’exploite qu’avec une recherche derrière. C’est une supposition.

**La leçon de modestie.** Les principes s’additionnent : les quatorze termes retenus, moyennés, font 0,675 [0,658 ; 0,692]. Mais un glouton qui regarde un seul coup plus loin, sans aucun principe, fait 0,740 [0,723 ; 0,757]. Calculer un coup de plus vaut mieux que tout ce qu’on a su formuler.

**Face au jeu parfait** (`v3-solve.md`, section f). Dans les positions gagnées, et parmi les coups qui laissent le même nombre de piles, les coups gagnants suivent chacun des principes retenus plus souvent que les autres. Les proportions vont de 0,70 à 0,90 sur des positions tirées au hasard. Trois verdicts changent :

- « garder des pièces adverses prisonnières » ne départage rien dans les parties du réseau ;
- deux candidats rejetés contre le glouton, les coins et la solidité de ses propres piles, favorisent en réalité les coups gagnants.

Le centre reste indifférent dans les deux cas.

**Limites.**

- Les principes viennent d’un seul réseau. Les réseaux des graines 2 et 3 du second tour n’existent plus : ils avaient été entraînés dans un environnement en ligne temporaire.
- Trois nouveaux réseaux, entraînés sur le Mac, sont disponibles pour refaire l’analyse ; ce n’est pas encore fait.

---

## 2. La répétition : défaite ou nulle ?

**La question.** Sans règle, deux joueurs peuvent tourner en rond indéfiniment. L’exemple le plus simple : une pièce va sur une case vide, l’adversaire fait de même, puis chacun revient. Au second tour, plus les agents progressaient, plus leurs parties s’allongeaient, de 20 demi-coups en moyenne à 68–116. Jusqu’à 7 % atteignaient la limite de 1 000 demi-coups (`v2-az-uncapped.md`). La règle retenue alors, lc1-2 : la troisième occurrence d’une position fait perdre celui qui l’a produite. Elle n’avait pas été comparée à une nulle.

**Pourquoi la nulle aux échecs.**

- La répétition se fait à deux. Désigner un coupable, c’est trancher sur une question de parité, qui ferme la boucle en premier.
- L’échec perpétuel est une ressource de défense.
- Les échecs connaissent déjà la nulle.

D’autres jeux punissent celui qui force la répétition : l’échec perpétuel au shōgi et aux échecs chinois (de mémoire, à vérifier).

**L’expérience.** Trois réseaux par règle, entraînés sur le M2, avec des critères écrits avant les parties.

| | Répétition = nulle | Répétition = défaite (lc1-2) |
|---|---|---|
| Nulles depuis le départ, fin d’entraînement | **15,1 %** (seuil fixé : 10 %) | 0 |
| Parties tranchées par la règle | 15,1 % | 1,8 % |
| Le réseau final bat son ancêtre de l’itération 20 | oui, 0,787 à 0,820 | oui, 0,785 à 0,795 |

**Verdict : on garde la défaite.**

- **Avec la nulle, les réseaux apprennent à la chercher.** Pour la graine 1, on passe de 23 nulles sur les 2 000 premières parties à 370 sur les 2 000 dernières. L’explication par l’apprentissage de la nulle est une lecture faite après coup, non testée.
- **Avec la défaite, la règle reste un garde-fou.** Elle ne tranche que 1,8 % des parties, le reste se joue sur le plateau.

**Une découverte en passant.** Entre réseaux finaux, après une ouverture de quatre demi-coups au hasard, les Blancs gagnent environ trois parties sur quatre : 0,748 sous lc1-2. Ce n’est pas une contradiction avec la nulle théorique, puisqu’une ouverture au hasard sort souvent de la nulle, et que dix premiers coups sur seize perdent.

**Temps mesurés.** Environ 19 minutes par réseau avec la nulle, 38 minutes avec la défaite. Le second lot partageait la machine avec le solveur.

---

## 3. Résoudre le jeu

**La méthode.** C’est l’analyse rétrograde, celle des tables de finales aux échecs :

1. on part de toutes les positions perdues ;
2. une position d’où un coup mène à une position perdue pour l’adversaire est gagnée ;
3. une position dont tous les coups mènent à des positions gagnées pour l’adversaire est perdue ;
4. on recommence jusqu’à ce que plus rien ne bouge.

Ce qui reste, ce sont les positions où personne ne peut forcer le gain : les nulles. La méthode gère les cycles par construction, ce que le Minimax du premier tour ne savait pas faire. Limité en profondeur, il confondait « nulle » et « pas encore calculé », et stockait chaque position dans une table coûteuse en mémoire.

**Les nombres (mesurés).**

- **232 792 560 positions possibles** : 924 ordres des couleurs, × 125 970 façons de répartir 12 pièces en 9 piles, × 2 joueurs au trait.
- **230 015 628 sont atteignables depuis le départ**, toutes en 15 demi-coups au plus.
- **La résolution a pris deux à trois minutes et moins de 600 Mo.** Le premier tour avait épuisé la mémoire au bout de six jours.

**Les réponses.**

- **Départ : nulle.**
- **Les six premiers coups qui gardent la nulle :** a1-1-b1, a1-2-c1, b1-1-a1, b1-1-c1, c1-1-b1, c1-2-a1. Tous restent sur la rangée de départ.
- **Les dix autres perdent de force,** en 12 à 22 demi-coups. Avancer au centre dès le premier coup (a1-2-b2, c1-2-b2) perd en 12.
- **Les positions atteignables,** pour le joueur au trait : 70,9 % gagnées, 25,8 % perdues, 1,2 % déjà finies, 2,1 % nulles. Le gain le plus long demande 51 demi-coups ; le gain médian, 5.
- **Aucune phase irréversible.** Toute position non terminée peut revenir à la position de départ. Il n’y a donc pas d’équivalent naturel de la règle des 50 coups sans prise : aucun événement ne prouve que la partie avance.
- **Mais la nulle est un fil.** Si les deux camps ne jouent que des coups qui gardent la nulle, on n’atteint que 289 536 positions, dont 11 736 seulement peuvent revenir au départ. Dans 45 % d’entre elles, un seul coup garde la nulle.

**Ce que vaut vraiment l’IA.** Sur 400 parties du réseau contre lui-même, on compte la part des coups qui conservent le résultat théorique. On n’a gardé que les positions où aucune répétition n’est encore en jeu.

| Positions | Réseau | Glouton | Hasard |
|---|---|---|---|
| Gagnées | 0,877 | 0,657 | 0,358 |
| Nulles | 0,809 | 0,158 | 0,211 |
| Toutes | 0,856 | 0,506 | 0,314 |

Trois lectures :

- **En position nulle, le glouton fait pire que le hasard.** Prendre des piles est exactement ce qu’il ne faut pas faire quand le jeu est équilibré.
- **Les erreurs du réseau se concentrent dans l’ouverture :** 0,819 avant le dixième demi-coup, 0,905 ou plus ensuite.
- **Son premier coup, c1-1-b1, garde la nulle.**

**Ce que cela dit de la règle de répétition.** Le départ étant nul, la règle lc1-2 rend le jeu fini et sans nulle. Par le théorème de Zermelo (1913), l’un des deux camps a alors un gain forcé. Lequel, on ne sait pas : il faudrait une résolution qui tienne compte de l’historique de la partie, non tentée. Ce gain, s’il existe pour les Blancs ou pour les Rouges, passe par la gestion des répétitions. J’ai inventé la règle qui décide du vainqueur d’un jeu nul.

**Les contrôles.** La table a été soumise à des contrôles qu’on a d’abord vus échouer, pour s’assurer qu’ils savaient échouer :

- la cohérence locale sur toutes les positions : 0 violation, ce qui, avec des coups corrects, constitue une preuve ;
- l’invariance par les symétries du plateau et par l’échange des couleurs : 0 écart ;
- 1 100 accords sur 1 100 avec une recherche indépendante ;
- cinq erreurs introduites exprès, toutes détectées ;
- une règle faussée exprès, rejetée.

---

## 4. Trois problèmes, pour le lecteur

Les Blancs ont le trait. Chaque case se lit de bas en haut (`WRR` : une pièce blanche sous deux rouges) ; la rangée 1 est en haut. Le glouton ne trouve aucune des trois solutions.

**Gain en 3 demi-coups.** a1 W · a2 WWRRRR · b2 R · c2 WW · b3 RW.
Solution : **a1-1-a2**, la pièce blanche couvre la pile de six. Il reste aux Rouges une seule pièce, en b2 : où qu’elle aille, deux pièces blanches sautent dessus. Le glouton préfère prendre la pièce isolée (c2-1-b2) et laisse les Rouges sur la haute pile.

**Gain en 5.** a1 WRRRR · c1 R · a2 W · b2 R · c2 WW · c3 WW.
Solution : **a2-1-a1**, une pièce blanche enferme quatre rouges. Le glouton préfère prendre une pièce isolée, ce qui lui donne plus de piles et laisse aux Rouges leur pile de quatre.

**Gain en 7.** b1 WRRW · c1 WWRR · a2 RWR · c2 W.
Solution : **c2-1-c1**, on cède une pile pour en couvrir une autre. La plupart des défenses perdent aussitôt sur un saut de trois pièces depuis b1.

Le premier principe, empiler sur l’adversaire, se lit dans les deux premiers problèmes. Le troisième montre qu’on gagne parfois en rendant une pile.

---

## 5. Les principes du jeu parfait, et l’ouverture

Source : `docs/experiments/v3-principles-perfect.md`. Cette fois, les principes ne viennent plus d’un réseau imparfait mais de la table exacte. Sur 20 000 positions gagnées ou nulles, on compare les coups qui conservent le résultat aux autres, à nombre de piles contrôlées égal.

**Les quatre principes du jeu parfait.**

1. **Enterrer des pièces adverses.** C’est le premier critère, avant même le nombre de piles : le bon coup en enterre davantage que les autres dans 88 % des positions gagnées et 74 % des nulles. Le réseau le plaçait seulement cinquième.
2. **Prendre un sommet adverse en y déplaçant toute sa pile, sur une pile déjà haute.** On finit avec moins de piles, mais plus hautes. C’est l’inverse exact de l’instinct du glouton.
3. **Laisser peu de coups à l’adversaire**, et des sommets adverses faits d’une pièce seule.
4. **Garder ses propres sommets hors de sa portée.**

Le centre, le fait d’avancer et le nombre de pièces déplacées ne comptent pas. Tous les principes tirés du réseau sont confirmés dans leur direction.

**En partie,** contre le glouton, sous lc1-2, sur 2 000 parties :

- chaque principe améliore le score, entre 0,590 et 0,643 ;
- le joueur parfait de la table obtient 0,919 [0,908 ; 0,930] ;
- le glouton qui regarde un coup plus loin reste devant toutes les règles, à 0,756.

Les listes de règles apprises, meilleures sur des positions tirées au hasard, jouent moins bien en partie qu’un simple départage. Encore une fois, calculer bat le savoir formulé.

**L’ouverture : les principes s’inversent. Il faut rester chez soi.**

- Les six premiers coups qui gardent la nulle, et 22 des 24 réponses rouges qui la gardent, font glisser une ou deux pièces le long de sa propre rangée.
- Au premier coup, avancer, prendre, aller au centre ou suivre le glouton perd. Tous les joueurs fondés sur des règles jouent un premier coup perdant.
- La nulle se resserre vite. Dès le demi-coup 4, certaines positions n’ont plus qu’un seul coup qui la garde ; c’est le cas de 37 % des positions au demi-coup 12.
- L’ouverture la plus étroite est a1-1-b1, ou son symétrique c1-1-b1, celle que joue le réseau. Les Rouges n’ont alors que 2 réponses sur 16 : a3-1-b3 ou c3-1-b3.

---

## 6. Qui gagne sous lc1-2 ? Pas encore de réponse

Source : `docs/experiments/v3-lc1-solve.md`.

**La question se réduit, et la réduction est démontrée.** Tant que la partie reste dans la zone nulle, en sortir revient à perdre, exactement. Le jeu se ramène donc à une course dans un graphe de 289 536 positions nulles, où chacune ne peut être jouée que deux fois. Le premier qui n’a plus de coup neuf perd.

**Mais ce graphe résiste.**

- Sa plus grande composante, celle où l’on peut tourner en rond, compte 233 472 positions. La composante du départ en compte 11 736.
- Aucune des deux n’a été résolue en dix millions d’états de recherche, sur des lignes de plus de 4 000 coups.
- Seul acquis : aucun camp ne peut acculer l’autre en 27 coups ou moins.

Il faudrait une autre méthode de recherche (par nombres de preuve, ou exploitant le fait que chaque camp déplace son propre jeton). Ni l’une ni l’autre n’a été essayée.

**L’allure de ce jeu caché.** Une petite composante de 40 positions est une poursuite entre deux pions, une pile de deux de chaque camp, autour d’une haute pile figée.

---

## 7. Ce qu’on ne sait pas

- Quel camp gagne sous lc1-2 (section 6).
- Si les principes tirés du réseau valent au-delà de la graine 1. Ceux tirés de la table, en revanche, ne dépendent d’aucun réseau.
- La force de l’IA contre des humains, au-delà de ma propre expérience : les dix parties prévues au second tour ont été abandonnées.
- Tout ce qui précède porte sur le jeu publié et sur lc1-2. Les variantes LC2 et LC3 du premier tour, qui limitaient le nombre de coups, n’ont pas été résolues.

---

## Amorce possible, dans ma voix

*Proposition à reprendre ou à jeter. Elle n’invente rien : chaque fait vient d’un compte rendu.*

> Le Pogo est un jeu nul. Je ne dis pas qu’il est mauvais, quoique, mais qu’à le jouer parfaitement des deux côtés, personne ne gagne jamais. J’aurais pu le deviner, puisque les machines que j’entraînais depuis des mois apprenaient surtout à tourner en rond. Il m’a fallu trois tours pour le savoir, et ce n’est pas l’intelligence artificielle qui me l’a appris : c’est une méthode qui ne fait que compter, à rebours, deux cent trente-deux millions de positions, en trois minutes sur mon Mac. Le premier tour, j’avais cru la machine sur parole. Le second, je l’avais mesurée, et elle m’avait battu à chaque partie. Le troisième, j’ai découvert que la règle que j’avais ajoutée pour que les parties finissent était celle-là même qui désigne le vainqueur. Dit autrement, j’ai inventé le gagnant d’un jeu qui n’en avait pas.


---

## Premier jet de l’article, dans ma voix

*Premier jet complet, à reprendre ou à jeter. Les sections qui précèdent restent la référence pour les faits. Ce qui n’en vient pas est listé à la fin, sous « Éléments à valider ».*

# J’ai inventé le gagnant d’un jeu qui n’en avait pas

Le Pogo est un jeu nul. Je ne dis pas qu’il est mauvais, quoique, mais qu’à le jouer parfaitement des deux côtés, personne ne gagne jamais (pardonnez-moi la facilité, le français me l’offrait sur un plateau, de neuf cases qui plus est). Ce n’est plus une intuition. Il s’agit d’un calcul exact, mené sur les 232 792 560 positions que le jeu peut prendre, et il a tourné en deux à trois minutes sur mon Mac de 8 Go.

Pour qui arrive en cours de route, un résumé des épisodes précédents. Le premier tour, j’avais cru la machine sur parole. Le second, je l’avais mesurée, ce qui est moins glorieux mais plus honnête, et elle m’avait battu à chaque partie au niveau « normal ». Le troisième, celui-ci, répond à une question que les deux premiers ne pouvaient pas poser : que vaut le jeu lui-même, indépendamment de ceux qui le jouent ?

Et la réponse a quelque chose de vexant, pour la machine comme pour moi.

* * *

Commençons par l’outil, parce qu’il n’a rien d’intelligent, et c’est ce qui me plaît. On l’appelle l’analyse rétrograde, c’est la méthode des tables de finales aux échecs, et elle est bête comme chou. On part de toutes les positions perdues, celles où le joueur au trait n’a plus aucune pile à lui. Une position d’où un coup mène à l’une d’elles est gagnée. Une position dont tous les coups mènent à des positions gagnées pour l’adversaire est perdue. On recommence, encore et encore, jusqu’à ce que plus rien ne bouge. Ce qui reste, ce que personne n’a pu étiqueter, ce sont les positions où nul ne peut forcer le gain : les nulles.

Il n’y a là ni réseau de neurones ni apprentissage, seulement de la comptabilité, patiente, à rebours. Au premier tour, j’avais tenté la même chose par l’autre bout, avec un Minimax qui cherchait en avant, limité en profondeur, et qui confondait « nulle » et « pas encore calculé ». Il avait épuisé la mémoire au bout de six jours. La bonne méthode a tout résolu en trois minutes, avec moins de 600 Mo. J’en déduis, avec l’aplomb de celui qui a mis trois tours à s’en apercevoir, que l’échec du premier tour venait de l’outil et non de la taille du jeu. Je réalise en l’écrivant que c’est à peu près ce que l’on m’aurait répondu si j’avais posé la question à quelqu’un, au lieu de la poser à mon ordinateur.

* * *

Le départ est donc nul. Mais cette nulle est un fil, et un fil étroit.

Les Blancs ont seize premiers coups possibles. Six seulement gardent la nulle, et tous restent sur la rangée de départ : une pièce, ou deux, qui glissent le long de sa propre ligne, sans avancer d’une case. Les dix autres perdent, de force, en 12 à 22 demi-coups. Avancer au centre dès le premier coup, ce que tout joueur d’échecs ferait par réflexe, et je suis de ceux-là, perd en 12. Côté rouge, sur les 24 réponses qui gardent la nulle, 22 font la même chose : on reste chez soi.

Aux échecs, que je connais un peu mieux, le centre est la première chose qu’on apprend. Au Pogo, il ne vaut rien. Je l’ai mesuré de deux manières, et les deux disent la même chose : un joueur qui préfère le centre gagne une partie sur deux contre un joueur qui l’ignore, 0,498 pour être exact, c’est-à-dire le hasard. Mon intuition de joueur d’échecs, transplantée ici, était au mieux inutile, au pire suicidaire.

Le fil se resserre vite. Dès le quatrième demi-coup, certaines positions n’ont plus qu’un seul coup qui garde la nulle ; au douzième, c’est le cas de 37 % d’entre elles. Si les deux camps ne jouent que des coups qui la gardent, on ne visite plus que 289 536 positions sur 230 millions, et dans 45 % de celles-là, un seul coup est juste. Partout ailleurs, l’un des deux gagne : parmi les positions qu’on peut atteindre depuis le départ, 70,9 % sont gagnées pour le joueur au trait, et 2,1 % seulement sont nulles. Le gain médian prend cinq demi-coups. Dit autrement, le Pogo est un jeu nul entouré d’un océan de positions décisives, et l’on y tombe au premier pas de travers.

* * *

Venons-en à la machine, puisque c’était tout de même le sujet de départ.

Avec la table exacte, on peut enfin noter chacun de ses coups. Sur 400 parties de mon réseau contre lui-même, j’ai compté la part de ses coups qui conservent le résultat théorique de la position : 86 %. Le joueur glouton, celui qui prend à chaque coup le plus de piles possible, en conserve 51 %, et le hasard 31 %. L’IA vaut donc mieux qu’on ne pouvait le mesurer jusqu’ici, puisqu’on n’avait que des adversaires imparfaits pour l’étalonner, et moins qu’elle n’en avait l’air, puisqu’elle se trompe encore un coup sur sept.

Deux détails m’ont arrêté. Le premier : dans les positions nulles, le glouton fait pire que le hasard, 16 % contre 21 %. Prendre des piles, ce qui ressemble pourtant à la définition même de bien jouer, est exactement ce qu’il ne faut pas faire quand le jeu est équilibré. Le second : les erreurs du réseau se concentrent dans l’ouverture, 82 % de bons coups avant le dixième demi-coup, plus de 90 % ensuite. Et pourtant son premier coup, une pièce de c1 vers b1, est juste. C’est même l’ouverture la plus étroite des six, celle après laquelle les Rouges n’ont plus que deux réponses sur seize. Elle a choisi, sans le savoir, l’ouverture la plus exigeante pour l’adversaire, ce qui ressemble à du génie, et je pense que c’est surtout de la chance.

* * *

Je ne suis pas un grand joueur de Pogo. Personne ne l’est, à vrai dire, il n’existe ni théorie ni manuel, seulement des règles d’une demi-page. J’avais donc demandé à la machine ce qu’elle avait compris, à la manière des grands principes que les programmes d’échecs ont, paraît-il, fait émerger.

Le problème, c’est qu’une machine sait jouer et ne sait pas expliquer. Il a fallu la traiter comme un sujet d’expérience : observer ses choix sur 21 637 positions, formuler des hypothèses, puis les mettre à l’épreuve chez un joueur plus bête qu’elle, le glouton, en vérifiant que chaque hypothèse le rend plus fort, et que son contraire le rend plus faible. Une règle qui gagne dans les deux sens n’est pas un principe, seulement un départage qui vaut mieux qu’une pièce de monnaie.

Il en est sorti cinq principes, que l’on peut appliquer sans machine. Empiler sur l’adversaire, et garder une haute pile qui retient ses pièces prisonnières. Garder ses piles à lui basses. Ne pas laisser ses sommets là où il peut se poser. Préférer les positions où ses sommets sont des pièces seules, qui n’avancent que d’une case. Et ne jamais lui laisser un coup qui prend son dernier sommet, ce qui, j’en conviens, relève moins du principe que du bon sens, mais le bon sens se mesure aussi : celui qui fait l’inverse tombe à 19 %.

Puis la table exacte est arrivée, et elle a remis de l’ordre. Le premier critère du jeu parfait, avant même le nombre de piles, est d’enterrer des pièces adverses : le bon coup en enterre davantage que les autres dans 88 % des positions gagnées. Mon réseau le plaçait cinquième. Le deuxième critère est plus étrange : prendre un sommet adverse en y déplaçant toute sa pile, sur une pile déjà haute. On finit avec moins de piles, mais plus hautes, soit l’inverse exact de l’instinct du glouton, qui porte bien son nom et se goinfre de piles comme d’autres de petits fours.

Et puis il y a le résultat qui m’a le plus contrarié, et que je donne pour ce qu’il est. Les principes s’additionnent ; tous réunis, ils donnent au glouton 67,5 % des points contre sa version simple. Mais un glouton qui regarde un seul coup plus loin, sans aucun principe, en fait 74 %. Calculer un coup de plus vaut davantage que tout ce que j’ai su formuler. Pour quelqu’un qui écrit des articles précisément pour formuler des choses, la nouvelle est vexante, et je n’ai pas trouvé comment la retourner à mon avantage.

* * *

Reste la question qui m’occupait au départ, et qui, je m’en aperçois, était la mauvaise.

Sans règle d’arrêt, on peut tourner en rond au Pogo dès le premier coup : je pose une pièce sur une case vide, l’adversaire fait de même, je la remets sur sa pile, il fait pareil, et ainsi de suite, comme deux joueurs d’échecs qui feraient faire des allers-retours à leur cavalier. Au second tour, plus mes réseaux progressaient, plus leurs parties s’allongeaient, jusqu’à ce que 7 % d’entre elles atteignent la limite de mille demi-coups. J’avais donc ajouté une règle : la troisième occurrence d’une même position fait perdre celui qui l’a produite. Répéter est un choix délibéré, il m’avait semblé juste de le faire payer.

Aux échecs pourtant, la répétition fait nulle, pour au moins trois raisons. La répétition se fait à deux, et désigner un coupable revient à trancher sur une question de parité, à savoir qui ferme la boucle le premier. L’échec perpétuel est une ressource de défense, il serait cruel de la punir. Et les échecs connaissent déjà la nulle, ils n’ont pas besoin d’en inventer une. Je me suis donc demandé si je n’avais pas choisi la mauvaise sanction.

Je l’ai testé, avec trois réseaux par règle et des critères écrits avant les parties, pour ne pas être tenté de les ajuster après. Avec la nulle, les réseaux apprennent à la chercher : pour l’un d’eux, on passe de 23 nulles sur ses 2 000 premières parties à 370 sur les 2 000 dernières, et en fin d’entraînement, 15 % des parties se terminent ainsi, au-delà du seuil de 10 % que je m’étais fixé. Je lis cela comme un apprentissage de la nulle, lecture faite après coup et que je n’ai pas testée. Avec la défaite, la règle reste un garde-fou, elle ne tranche que 1,8 % des parties, et le reste se joue sur le plateau. J’ai gardé la défaite.

C’est ici que la table exacte me renvoie mon choix à la figure. Le départ est nul. Ma règle rend le jeu fini et sans nulle possible. Or un théorème de Zermelo, de 1913, dit d’un tel jeu que l’un des deux camps a forcément une stratégie gagnante[^1]. J’ai donc, en démiurge de sous-préfecture, fabriqué un vainqueur pour un jeu qui n’en avait pas, et ce vainqueur, quel qu’il soit, gagnera par la gestion des répétitions, c’est-à-dire par ma règle, pas par celles du jeu.

Lequel ? Je ne sais pas. J’ai essayé. La question se réduit, et la réduction est démontrée : tant que la partie reste dans la zone nulle, en sortir revient à perdre, si bien que le jeu devient une course dans un graphe de 289 536 positions nulles, où chacune ne peut être jouée que deux fois, et où le premier qui n’a plus de coup neuf perd. Ça a l’air simple. Ça ne l’est pas. Le cœur de ce graphe compte 233 472 positions qui communiquent toutes entre elles, et aucune recherche n’en est venue à bout en dix millions d’états, sur des lignes de plus de 4 000 coups. Seul acquis : aucun camp ne peut acculer l’autre en 27 coups ou moins.

Il y a, dans un recoin de ce graphe, une petite composante de quarante positions que je trouve assez jolie : une pile de deux de chaque camp qui se poursuivent autour d’une haute pile figée, chacune cherchant à ne pas être la première à repasser par le même chemin. C’est, je crois, le meilleur résumé de ce que j’ai fait du Pogo. Un jeu calme et nul, où j’ai ajouté une règle pour que ça finisse, et qui, depuis, est devenu une course-poursuite dont je ne connais pas le vainqueur.

Je ne sais pas si c’est un défaut de ma règle ou ce qui rend le jeu intéressant. Vous avez un avis ?

P.S. Pour ceux qui voudraient se mesurer au glouton, qui échoue sur ce problème. Les Blancs ont le trait ; chaque case se lit de bas en haut, la rangée 1 est en haut. a1 : W · a2 : WWRRRR · b2 : R · c2 : WW · b3 : RW. Les Blancs gagnent en trois demi-coups[^2].

[^1]: Pour être précis, le théorème dit qu’un des deux camps peut forcer le gain ou, à défaut, la nulle. Ma règle supprimant la nulle, il ne reste que le gain. Je simplifie, mais pas au point de mentir.

[^2]: a1-1-a2 : la pièce blanche couvre la pile de six. Il ne reste aux Rouges qu’une pièce, en b2, et où qu’elle aille, deux pièces blanches sautent dessus. Le glouton, lui, prend la pièce isolée de b2 et laisse aux Rouges leur haute pile.

### Éléments à valider ou à remplacer

- « je suis de ceux-là » (avancer au centre par réflexe aux échecs) et « que je connais un peu mieux » : tirés de ce que tu m’as dit de ton rapport aux échecs, pas d’un texte. À confirmer.
- « elle m’avait battu à chaque partie au niveau "normal" » : vient de `v2-results.md`, section *Search depth*. Vérifie que la formule correspond à ce que tu as vécu.
- « les grands principes que les programmes d’échecs ont, paraît-il, fait émerger » : formulation prudente de ton parallèle, sans exemple. Ajoute-en un précis ou coupe.
- La note 1 sur Zermelo : l’énoncé est celui du théorème pour les jeux finis à information parfaite. Relis-la si tu veux une formulation plus exacte.
- Les 86 % et autres taux viennent de positions où aucune répétition n’est encore en jeu (section 3) ; l’article ne le précise pas.
- La pointe sur les petits fours, le démiurge de sous-préfecture, le jeu de mots sur « nul » : trois traits d’esprit. Probablement un de trop.
