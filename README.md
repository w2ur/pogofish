<!-- portfolio
name: "Pogofish"
tagline_fr: "Entraîner une IA à un jeu de plateau oublié, et mesurer ce qu'elle vaut vraiment."
tagline_en: "Training an AI to play a forgotten board game, and measuring what it is really worth."
facts_fr: "AlphaZero en Rust : gagne 85,5 à 88,7 % de 400 parties contre un joueur glouton, sur trois entraînements (borne basse à 95 % : 82,3 %). Inférence en Rust pur, jeu en terminal."
facts_en: "AlphaZero in Rust: wins 85.5–88.7 % of 400 games against a greedy player, over three training runs (lowest 95 % bound: 82.3 %). Pure-Rust inference, terminal game."
-->

**English** · [Français](README.fr.md)

# Pogofish

I taught a machine a game nobody plays any more. The first time, I took its word for it. The second time, I measured.

**Status:** maintained · public · [play it in the browser](https://william.revah.paris/en/stories/pogofish/#your-move)

[![Latest CLI release](https://img.shields.io/github/v/release/w2ur/pogofish?filter=cli-v*&label=terminal%20game)](https://github.com/w2ur/pogofish/releases/latest)
[![release-cli](https://github.com/w2ur/pogofish/actions/workflows/release-cli.yml/badge.svg)](https://github.com/w2ur/pogofish/actions/workflows/release-cli.yml)
[![Story online](https://img.shields.io/website?url=https%3A%2F%2Fwilliam.revah.paris%2Fen%2Fstories%2Fpogofish%2F&label=story)](https://william.revah.paris/en/stories/pogofish/)
[![License](https://img.shields.io/github/license/w2ur/pogofish)](LICENSE)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/board-play-dark.gif">
  <img src="docs/media/board-play-light.gif" width="480" alt="The Pogo board in a browser: the human plays White, moves one piece from a stack of two, the status line reads 'The net is thinking', then the AI answers by stacking its red pieces.">
</picture>

## Why

The question I wanted to ask was simple, almost naive: does a machine that learns alone, by playing against itself, really learn anything, and how would I know? In the spring I had published a long article on this project; everything seemed to work, which should have set off an alarm. So for the second round I wrote down before training what would count as success, then forbade myself from touching it.

## What it is

Pogo is played on nine squares: you move one, two or three pieces from the top of a stack, and a stack belongs to whoever's piece is on top. Pogofish is an AlphaZero written in Rust that learns it alone, an arena that measures it over colour-swapped random openings with 95 % confidence intervals, and a terminal game that plays the trained net with pure-Rust inference.

Against a greedy player, the round-2 net scores between 0.855 and 0.887 over 400 games, depending on the training seed (three seeds). Of the four criteria fixed in advance, two are met, one is not met as pre-registered, and the fourth (ten games played by hand) is pending: [`docs/experiments/v2-results.md`](docs/experiments/v2-results.md).

The first round's evaluation did not hold. What went wrong, and which results it invalidates, is in [`docs/experiments/v1-verdict.md`](docs/experiments/v1-verdict.md).

## Play

- **In the browser:** the board is at the end of the story, [in English](https://william.revah.paris/en/stories/pogofish/#your-move) and [in French](https://william.revah.paris/stories/pogofish/#à-vous-de-jouer).
- **In a terminal (macOS):** download the latest `cli-v*` release for your chip. The binary is unsigned.

  ```bash
  # Apple silicon; swap in x86_64-apple-darwin on Intel
  gh release download -R w2ur/pogofish -p '*aarch64-apple-darwin*'
  shasum -a 256 -c pogofish-*-aarch64-apple-darwin.tar.gz.sha256   # must print: OK
  tar xzf pogofish-*-aarch64-apple-darwin.tar.gz
  ./pogofish-*-aarch64-apple-darwin/pogofish --help
  ```

  A browser download is quarantined by macOS and Gatekeeper refuses the unsigned binary; clear the flag once with `xattr -d com.apple.quarantine pogofish`. Downloads through `gh` or `curl` are not quarantined.

## Run locally

Needs a Rust toolchain (`rust-toolchain.toml`) and Node for the web app. No environment variables.

```bash
cargo test --workspace                                              # engine, inference, search, training
cargo run --release -p pogofish-cli -- --colour red --level normal  # the terminal game, from source
cd app && npm install && npx vitest run && npm run build:board      # the board the hub embeds → app/dist-board/
```

Or install the terminal game without cloning (self-contained binary, the net is embedded, no libtorch): `cargo install --git https://github.com/w2ur/pogofish pogofish-cli`.

## Deploy

The board is served by the hub, william.revah.paris, which copies `app/dist-board/` into its own `public/pogofish/`. The terminal game ships by pushing a `cli-vX.Y.Z` tag, which builds and attaches the binaries to a GitHub release. The round-1 article's subdomain, `pogofish.revah.paris`, is retired and redirects to the story.

## Documentation

- [Development](docs/development.md): the workspace crates, the web app and the board build, every training, measurement and export command, the round-1 article, deployment detail.
- [Rules](docs/rules.md): each rule, the engine line that implements it, and the test that pins it.
- [Round-2 results](docs/experiments/v2-results.md) and [round-1 verdict](docs/experiments/v1-verdict.md).
- The story: [English](https://william.revah.paris/en/stories/pogofish/) · [French](https://william.revah.paris/stories/pogofish/).

## License

MIT, see [LICENSE](LICENSE).

---

Made with care by [William](https://william.revah.paris).
