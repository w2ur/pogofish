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
