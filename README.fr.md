[English](README.md) · **Français**

# Pogofish

J’ai appris à une machine un jeu que plus personne ne joue. La première fois, je l’ai crue sur parole. La seconde, j’ai mesuré.

**Statut :** maintenu · public · [jouer dans le navigateur](https://william.revah.paris/stories/pogofish/#à-vous-de-jouer)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/board-play-dark.gif">
  <img src="docs/media/board-play-light.gif" width="480" alt="Le plateau de Pogo dans un navigateur : l’humain joue les Blancs, déplace un pion d’une pile de deux, la ligne d’état indique que le réseau réfléchit, puis l’IA répond en empilant ses pions rouges.">
</picture>

## Pourquoi

La question que je voulais poser était simple, presque naïve : une machine qui apprend seule, en jouant contre elle-même, apprend-elle vraiment quelque chose, et comment le saurais-je ? Au printemps, j’avais publié un long article sur ce même projet ; tout avait l’air de marcher, ce qui aurait dû m’alerter. Pour le second tour, j’ai donc écrit avant l’entraînement ce qui compterait comme un succès, puis je me suis interdit d’y toucher.

## Ce que c’est

Un AlphaZero écrit en Rust qui apprend seul le Pogo, un jeu de plateau à neuf cases ; une arène qui le mesure sur des ouvertures tirées au hasard, couleurs échangées, avec des intervalles de confiance à 95 % ; et un jeu en terminal qui fait jouer le réseau entraîné, avec une inférence en Rust pur.

Contre un joueur glouton, le réseau du second tour obtient entre 0,855 et 0,887 sur 400 parties selon la graine d’entraînement (trois graines). Des quatre critères fixés d’avance, deux sont atteints, un ne l’est pas tel qu’il était écrit, et le quatrième (dix parties jouées à la main) est en attente : [`docs/experiments/v2-results.md`](docs/experiments/v2-results.md), en anglais. L’évaluation du premier tour ne tenait pas : [`docs/experiments/v1-verdict.md`](docs/experiments/v1-verdict.md).

## Liens

- Le récit et le plateau jouable : [en français](https://william.revah.paris/stories/pogofish/) · [en anglais](https://william.revah.paris/en/stories/pogofish/).
- Le jeu en terminal pour macOS : [dernière version](https://github.com/w2ur/pogofish/releases/latest) ; installation, exécution locale et documentation dans le [README anglais](README.md).
- Licence MIT, voir [LICENSE](LICENSE).

---

Made with care by [William](https://william.revah.paris).
