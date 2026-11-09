# Pogofish, quatrième tour : synthèse pour l’article

Matière première, pas l’article. Tous les chiffres viennent de `docs/experiments/v4-evaluation.md` (en anglais), de ses tableaux générés ou de sa prose ; rien n’est recalculé ni arrondi au-delà de ce qu’il donne, sauf trois ordres de grandeur arrondis, signalés comme tels : « environ huit minutes » (474,8 à 484,8 s), « une minute environ » (61,0 à 61,7 s) et « dix fois moins » de parties (50 000 contre 500 000). Chaque réponse renvoie à une ligne de son tableau principal (« ligne n ») ou à son tableau de l’apprenant tabulaire. Les chiffres passent du point décimal à la virgule, sans autre changement.

Deux jeux, à ne pas confondre :

- **le jeu publié** (jeu A, sans règle d’arrêt) est résolu, et il est nul (`v3-solve.md`) ;
- **lc1-2** (jeu B, la troisième occurrence d’une position fait perdre celui qui l’a produite) n’est pas résolu, et il ne peut pas être nul : l’un des deux camps a forcément une stratégie gagnante (théorème de Zermelo, `v3-lc1-solve.md` et `v3-synthese-fr.md`, section 3).

Tous les joueurs appris l’ont été sous lc1-2, et toutes les parties de ce tour se jouent sous lc1-2. La table de référence, elle, est celle du jeu A.

---

## Ce qu’il faut retenir

1. **Pour la première fois, tous les joueurs sont mesurés de la même façon,** du hasard au jeu parfait : mêmes 20 000 positions, même adversaire (le glouton), mêmes 1 000 paires de parties. Les chiffres des tours précédents, mesurés chacun à sa manière, ne se comparent pas à ceux-ci.
2. **Le renforcement classique sans réseau de neurones, entraîné ici, ne vaut guère mieux que le hasard.** Il bat le hasard de peu (0,540 à 0,548) et perd presque tout contre le glouton (0,043 à 0,045). Son entraînement a été court : environ huit minutes par graine, au lieu de l’heure prévue.
3. **Un réseau de neurones qui juge la position après son propre coup, un demi-coup, sans regarder la réponse,** appris par différence temporelle, marque 0,764 à 0,779 contre le glouton, sans se distinguer du glouton qui calcule un demi-coup de plus (0,755). Mais l’écart avec le renforcement classique ne mesure pas le seul apport du réseau : la règle d’apprentissage et le nombre de parties changent en même temps.
4. **La recherche fait la différence chez AlphaZero.** Le même réseau, sans recherche, marque 0,578 ; avec 100 simulations avant chaque coup, 0,890.
5. **Le joueur parfait du jeu publié marque 0,919,** au-dessus de tous les AlphaZero (0,883 à 0,890). Mais il est parfait pour le jeu A, pas pour lc1-2 : l’écart n’est pas la distance au jeu parfait sous la règle de l’article.

---

## Un fil possible pour l’article

L’article oppose deux joueurs : le « joueur au réflexe » du renforcement classique, et AlphaZero, « le même joueur qui calcule quelques variantes ». Le quatrième tour les met sur une même échelle, et cette échelle compte un échelon de plus que l’article : entre le réflexe sans mémoire générale (une valeur par position) et le calcul, il y a le réflexe porté par un réseau de neurones, qui donne une valeur à des positions qu’il n’a jamais vues. L’écart entre ces deux échelons ne peut pas être attribué au seul réseau : la règle d’apprentissage et le nombre de parties changent aussi (section 3). Sur cette échelle, chaque marche se mesure contre le même adversaire :

| Joueur | Ligne | Contre le glouton |
|---|---|---|
| Hasard (prend un gain immédiat, évite une perte immédiate) | 2 | 0,031 [0,024 ; 0,038] |
| Renforcement classique, une valeur par position, trois graines | 5–7 | 0,043 à 0,045 |
| Glouton contre lui-même | 3 | 0,493 [0,474 ; 0,512] |
| AlphaZero sans recherche | 11 | 0,578 [0,558 ; 0,598] |
| Glouton qui calcule un demi-coup de plus | 4 | 0,755 [0,739 ; 0,772] |
| Réseau par différence temporelle, un demi-coup, sans regarder la réponse, trois graines | 8–10 | 0,764 à 0,779 |
| AlphaZero avec 100 simulations, quatre réseaux | 12–15 | 0,883 à 0,890 |
| Jeu parfait du jeu publié | 1 | 0,919 [0,908 ; 0,930] |

Deux surprises se lisent dans ce tableau, et l’article peut s’appuyer sur l’une ou l’autre :

- **le réseau d’AlphaZero, privé de sa recherche, marque moins contre le glouton qu’un simple glouton qui calcule un demi-coup de plus.** Chez AlphaZero, l’intuition seule ne suffit pas ; c’est le calcul qui porte ;
- **le renforcement classique, tel qu’entraîné ici, n’a presque rien appris.** C’est un résultat sur des entraînements courts, pas sur la méthode en général.

---

## 1. Le protocole commun

**Ce qu’on mesure, pour chaque joueur, de deux façons.**

- **La valeur conservée.** Sur 10 000 positions gagnées et 10 000 positions nulles du jeu publié, tirées au hasard parmi les positions atteignables (l’échantillon de contrôle du troisième tour), on calcule la probabilité que le coup du joueur conserve le résultat théorique : d’une position gagnée, aller vers une position perdue pour l’adversaire ; d’une position nulle, vers une position que l’adversaire ne gagne pas. Intervalle de confiance à 95 % sur les positions.
- **Le score contre le glouton,** le joueur qui choisit le coup laissant, après lui, le plus de sommets à sa couleur par rapport à l’adversaire. Règle lc1-2, 1 000 paires ; chaque paire est une ouverture de quatre demi-coups tirée au hasard, jouée deux fois en échangeant les couleurs. Gain 1, nulle ½, défaite 0, moyenne sur les paires, intervalle de confiance à 95 % sur les paires.

**Contrôles.** Avant toute mesure, le programme vérifie que la table conserve la valeur à 1,000 / 1,000 et que le hasard reproduit les 0,360 / 0,112 du troisième tour ; sinon il s’arrête sans rien écrire. Les chiffres du troisième tour pour le hasard, le glouton, le glouton à deux demi-coups et le jeu parfait sont reproduits.

**Aucune partie inachevée.** Aucune partie de mesure n’a atteint la limite de 1 000 demi-coups, aucune n’a été nulle ; chaque score porte sur les 1 000 paires.

**Trois limites, qui valent pour tout ce qui suit.**

- **Le décalage entre les deux jeux.** La valeur conservée se lit dans la table du jeu A, qui ignore la répétition ; les joueurs ont appris le jeu B et le score se joue sous le jeu B. Les taux concernés portent une croix (†), comme dans `v4-evaluation.md`.
- **Des positions sans histoire.** Les positions de l’échantillon sont reconstruites à partir de leur seul numéro : elles n’ont pas de passé. Un réseau qui lit les répétitions les voit toutes comme jamais rencontrées, ce qui n’arrive pas en partie. Les taux de valeur conservée ne sont donc pas une mesure en partie ; les scores, eux, le sont.
- **Des positions qu’on ne rencontre pas forcément en jouant.** Chaque position atteignable pèse le même poids ; le troisième tour avait montré que ce ne sont pas celles que visitent les parties.

---

## 2. Que vaut le renforcement classique sans réseau ?

**Le joueur.** Un apprenant tabulaire, nouveau à ce tour : une valeur par position, dans un tableau de 232 792 560 cases (931 Mo), mise à jour par Q-learning, l’algorithme que l’article présente comme le renforcement classique. Comme le jeu est déterministe, une valeur par position suffit à estimer chaque coup : la valeur d’un coup est l’opposé de la valeur de la position où il mène. Pour jouer, il prend le coup de meilleure estimation : il juge la position après son propre coup, un demi-coup, sans regarder la réponse ni chercher plus loin. À l’entraînement, il joue au hasard une fraction ε de ses coups, qui décroît de 1,0 au début à 0,05 à la fin. Trois graines, sous lc1-2.

**Les critères, écrits avant tout entraînement** (section *Tabular learner — pre-registration*) :

| Critère | Résultat (tableau de l’apprenant tabulaire) |
|---|---|
| 1. Battre le hasard, borne basse > 0,5 | **atteint** : 0,540 [0,519 ; 0,562], 0,545 [0,524 ; 0,567], 0,548 [0,527 ; 0,569] |
| 2. Battre le glouton, borne basse > 0,5 | **échoué** : 0,045 [0,037 ; 0,054], 0,043 [0,034 ; 0,052], 0,045 [0,036 ; 0,054] (lignes 5–7) |
| 3. Conserver la valeur mieux que le hasard | **échoué** : 0,360† gagnées, 0,113† nulles, sur chaque graine, contre 0,360 / 0,112 au hasard (lignes 2 et 5–7) |

Les échecs restent des échecs : aucune constante n’a été retouchée, aucun entraînement n’a été refait.

**Contre le glouton, il ne se distingue pas du hasard.** Le hasard marque 0,031 [0,024 ; 0,038] (ligne 2), un intervalle qui chevauche celui de l’apprenant (graine 1 : [0,037 ; 0,054], ligne 5), alors que l’apprenant bat le hasard en face à face.

**Des entraînements courts.** Le budget, extrapolé d’un essai pilote, visait environ une heure par graine (500 000 parties). Les 500 000 parties ont pris 483,3 s, 474,8 s et 484,8 s, soit environ huit minutes : le pilote avait surestimé la durée d’environ 7,4 fois, parce que ses parties, jouées presque au hasard, duraient 133 demi-coups en moyenne contre 41 sur l’ensemble de l’entraînement, et parce que l’entraînement a joué 42 000 à 43 000 demi-coups par seconde contre 18 860 dans le pilote. La durée prévue en parties n’a pas été allongée. L’apprenant a visité 6,87 à 6,88 % des positions atteignables.

**La prédiction a tenu, pas sa raison.** Il avait été prédit, par écrit, que l’apprenant conserverait la valeur à peu près comme le hasard, *parce que* la plupart des positions de l’échantillon n’auraient aucun coup menant à une position visitée. Le taux est bien celui du hasard. Mais la raison est fausse : sur la graine 1, 6 536 des 10 000 positions gagnées et 5 572 des 10 000 positions nulles ont au moins un coup vers une position visitée. Sur celles-là, l’apprenant conserve 0,377† [0,371 ; 0,383] et 0,108† [0,106 ; 0,110] ; le taux du hasard sur ces mêmes positions n’a pas été mesuré, ces chiffres ne montrent donc ni qu’il fait mieux que le hasard là où il a des valeurs, ni qu’il fait moins bien. Pourquoi il joue comme le hasard reste inexpliqué.

---

## 3. Qu’ajoute un réseau de neurones ?

**Le joueur.** Un réseau de neurones qui estime la valeur d’une position, appris par différence temporelle (TD(λ), *temporal difference* en anglais), réentraîné à ce tour sous lc1-2, trois graines de 50 000 parties chacune, une minute environ par graine (61,0 à 61,7 s). Il choisit son coup comme l’apprenant tabulaire : il juge la position après son propre coup, un demi-coup, sans regarder la réponse, sans arbre de recherche. La différence est qu’un réseau donne une valeur à une position qu’il n’a jamais vue.

**Ce qu’il vaut** (lignes 8–10).

| Graine | Gagnées | Nulles | Contre le glouton |
|---|---|---|---|
| 1 | 0,844† [0,837 ; 0,851] | 0,483† [0,473 ; 0,492] | 0,779 [0,763 ; 0,796] |
| 2 | 0,828† [0,820 ; 0,835] | 0,457† [0,447 ; 0,467] | 0,764 [0,747 ; 0,781] |
| 3 | 0,828† [0,821 ; 0,835] | 0,447† [0,437 ; 0,457] | 0,771 [0,754 ; 0,788] |

**Face au glouton à deux demi-coups** (ligne 4 : 0,755 [0,739 ; 0,772], 0,824 / 0,448), il n’est pas départagé en partie : chaque intervalle chevauche le sien. Sur l’échantillon, la graine 1 conserve plus souvent la valeur, les graines 2 et 3 non, aux intervalles près.

**Face au renforcement classique** (lignes 5–7), l’écart est grand : 0,764 à 0,779 contre 0,043 à 0,045. Mais trois choses changent à la fois, et ce tour ne les sépare pas :

- la représentation : un réseau au lieu d’une valeur par position ;
- la règle d’apprentissage et la manière d’explorer : TD(λ) d’un côté, Q-learning à un pas de l’autre ;
- le nombre de parties : 500 000 par graine pour l’apprenant tabulaire, 50 000 pour le réseau, dix fois moins.

**Une question ouverte, pas une conclusion.** Le plan lisait cet écart comme « ce qu’apporte la généralisation ». Ce tour ne sépare pas les trois facteurs, et cela reste vrai quelle que soit ta décision. La lecture proposée par le plan attend ta décision (décision 5 de `v4-evaluation.md`). Dans tous les cas, l’article ne peut pas dire que le réseau, à lui seul, fait passer de 0,043–0,045 à 0,764–0,779.

---

## 4. Qu’ajoute la recherche ?

**Le joueur.** AlphaZero : un réseau de neurones qui donne, pour une position, une estimation de qui gagne et une préférence entre les coups ; avant de jouer, une recherche de 100 simulations guidée par ces deux avis, puis le coup le plus visité. Sans recherche, on prend directement le coup préféré du réseau. C’est le réseau du jeu en terminal et du site (`az-lc1-s1`), plus trois réseaux de la même configuration réentraînés au troisième tour.

**Le même réseau, avec et sans recherche** (lignes 11 et 12).

| | Gagnées | Nulles | Contre le glouton |
|---|---|---|---|
| Sans recherche | 0,817† [0,809 ; 0,824] | 0,467† [0,457 ; 0,477] | 0,578 [0,558 ; 0,598] |
| 100 simulations | 0,953† [0,949 ; 0,957] | 0,689† [0,680 ; 0,698] | 0,890 [0,878 ; 0,903] |

Le réseau ne change pas : pour ce réseau, l’écart est ce qu’ajoutent 100 simulations de recherche.

**Les quatre réseaux avec recherche** (lignes 12–15) : 0,883 à 0,890 contre le glouton, 0,952 à 0,953† des positions gagnées et 0,689 à 0,697† des nulles. Les trois réseaux réentraînés (lignes 13–15) donnent 0,883 [0,870 ; 0,897], 0,887 [0,875 ; 0,900] et 0,887 [0,874 ; 0,900].

**Une énigme.** Sans recherche, AlphaZero conserve la valeur à peu près aussi souvent que le glouton à deux demi-coups sur les positions gagnées (0,817† contre 0,824), et plus souvent sur les nulles, avec des intervalles disjoints (0,467† [0,457 ; 0,477] contre 0,448 [0,440 ; 0,456]). Pourtant il marque bien moins contre le glouton (0,578 contre 0,755). Sur cet échantillon, le taux de valeur conservée et le jeu ne classent pas ces deux joueurs dans le même ordre, comme le troisième tour l’avait vu pour ses listes apprises. Pourquoi, ce tour ne le dit pas.

**Calculer un coup de plus, en général.** Le glouton contre lui-même marque 0,493 [0,474 ; 0,512] (ligne 3) ; le même compte, un demi-coup plus loin, vaut 0,26 de plus (ligne 4 : 0,755).

---

## 5. Que vaut la table ?

**Le joueur.** Le jeu parfait du jeu publié, lu dans la table de 466 Mo. La table ignore la répétition ; le joueur écarte donc d’abord les coups qui perdent sur-le-champ sous lc1-2 (une troisième occurrence), puis, d’une position gagnée, prend le gain le plus rapide, d’une position nulle un coup que l’adversaire ne gagne pas, d’une position perdue la défaite la plus lente.

**Ce qu’il vaut** (ligne 1) : 0,919 [0,908 ; 0,930] contre le glouton. Ses taux de valeur conservée, 1,000, sont vrais par construction : la table est la référence.

**Ce que cela ne dit pas.** La borne basse de la table, 0,908, est au-dessus de la borne haute de chaque AlphaZero (0,897 à 0,903). Mais la table joue parfaitement le jeu A, pas le jeu B : l’écart n’est pas la distance au jeu parfait sous lc1-2, qui reste inconnue puisque lc1-2 n’est pas résolu.

**La table refaite à neuf.** Reconstruite de zéro, elle est identique octet pour octet à celle du troisième tour (empreinte cryptographique SHA-256, *Secure Hash Algorithm*, dans `v4-evaluation.md`), en 15,9 s pour l’exploration et 61,3 s pour la résolution.

---

## 6. À vérifier dans l’article

Phrases de `source.md` que les chiffres du quatrième tour contredisent, nuancent ou ne permettent pas d’affirmer. Rien n’est réécrit ici.

- **« ajuste une estimation : “ce coup, dans cette position, rapporte tant” ».** L’apprenant mesuré ici garde une valeur par position, non par coup ; la valeur d’un coup s’en déduit (section 2). Pas une contradiction, une précision possible.
- **« C’est un joueur au réflexe : il ne vaut que ce que vaut son intuition. »** L’image vaut aussi pour le réseau par différence temporelle, qui juge lui aussi la position après son propre coup, un demi-coup, sans regarder la réponse (section 3). Entre les deux « joueurs au réflexe », l’écart va de 0,043–0,045 à 0,764–0,779 contre le glouton (lignes 5–10). Et le joueur au réflexe sans réseau entraîné ici ne fait guère mieux que le hasard (section 2) : le lecteur pourrait croire à un joueur passable.
- **« Il explore quelques centaines de suites possibles ».** Le quatrième tour mesure AlphaZero à 100 simulations (lignes 12–15). Le nombre de simulations à l’entraînement n’est pas dans le document v4 : à vérifier dans `v2-results.md` ou la configuration d’entraînement. Qu’une simulation soit une « suite » complète n’est pas établi par v4 ; c’est un point à vérifier, pas une correction.
- **« Le calcul améliore l’intuition, et l’intuition rend le calcul plus efficace au coup suivant. »** Non mesuré par le quatrième tour. Ce qu’il mesure : en fin d’entraînement, l’intuition seule (0,578, ligne 11) reste loin derrière l’intuition avec calcul (0,890, ligne 12).
- **« AlphaZero, c’est le même joueur qui, avant chaque coup, calcule quelques variantes ».** Vrai entre les lignes 11 et 12, qui sont le même réseau. Faux si « le même joueur » désigne le renforcement classique : celui-ci n’est pas le réseau d’AlphaZero sans recherche, et les deux ne valent pas la même chose (0,043–0,045 contre 0,578). Le réseau par différence temporelle, sans calcul, marque bien plus contre le glouton qu’AlphaZero sans recherche (0,764–0,779 contre 0,578, lignes 8–11) ; les deux ne se sont pas affrontés.
- **« Sur cette base, on a pu entrainer réellement un AlphaZéro […] On a pu aussi résoudre réellement le jeu »** et **« L’analyse rétrograde montre que sur un jeu parfait, personne ne gagne ».** Mélange du jeu A et du jeu B : la résolution porte sur le jeu publié ; AlphaZero a appris lc1-2, qui n’est pas résolu et ne peut pas être nul (section 5).
- **« il n’est nul besoin d’apprentissage par renforcement pour le “résoudre” ».** Vrai pour le jeu publié seulement ; lc1-2 reste non résolu.
- **« Et surtout, calculez un coup plus loin. »** Soutenu, à une nuance près : le gain mesuré porte sur un demi-coup de plus, au sens de l’article, pas sur un coup complet. Le glouton qui calcule un demi-coup de plus marque 0,26 de plus (lignes 3 et 4), et la recherche fait passer AlphaZero de 0,578 à 0,890 (lignes 11 et 12).

L’article ne mentionne pas l’échelon intermédiaire, le réseau par différence temporelle. Les remarques sur AlphaGo et Stockfish sont hors du champ de v4 ; elles sont déjà dans `notes-pogo.md`.

---

## 7. Ce qu’on ne sait pas

- **Pourquoi l’apprenant tabulaire joue comme le hasard,** alors que la plupart des positions de l’échantillon ont un coup vers une position visitée. La raison prédite est réfutée ; aucune autre n’a été testée. Ni le nombre de mises à jour par position, ni le taux du hasard sur les positions visitées n’ont été mesurés.
- **Ce que donnerait un entraînement tabulaire plus long.** Les trois graines ont duré environ huit minutes chacune (474,8 à 484,8 s), pas l’heure prévue. Ce qu’une heure aurait changé n’est pas mesuré.
- **Si l’écart entre l’apprenant tabulaire et le réseau mesure la généralisation.** La représentation, la règle d’apprentissage et le nombre de parties changent ensemble. La lecture « ce qu’apporte la généralisation » attend ta décision.
- **Comment les joueurs conservent la valeur en partie.** Aucun taux n’est mesuré sur des positions rencontrées en jouant, ni avec leur histoire.
- **La distance au jeu parfait sous lc1-2.** lc1-2 n’est pas résolu depuis le départ ; le joueur parfait de ce tour l’est pour le jeu publié.
- **Pourquoi AlphaZero sans recherche conserve la valeur aussi souvent que le glouton à deux demi-coups, et marque pourtant bien moins.**
- **D’autres budgets de recherche, adversaires et graines.** AlphaZero n’est mesuré qu’à 0 et 100 simulations, contre le seul glouton, sur un seul tirage d’ouvertures ; les réseaux des graines 2 et 3 du second tour ne sont pas mesurés.
