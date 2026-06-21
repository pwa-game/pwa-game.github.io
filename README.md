# PWA Games

GitHub Pages game hub for `https://pwa-game.github.io/`.

## Structure

- `hub/`: root Game Hub PWA source, deployed to `/`.
- `cards/`: poker collection PWA source, deployed to `/games/cards/`.
- `games/2048/`, `games/tetris/`, `games/flappy/`, `games/snake/`, `games/minesweeper/`: standalone static PWA games.
- `games/depth-drop/`, `games/helicopter/`, `games/brick-breaker/`, `games/sokoban/`, `games/space-shooter/`: retro phone-style standalone PWA games.
- `games/shared/`: shared static styling for the lightweight arcade games.
- `.github/workflows/pages.yml`: builds and deploys the site with GitHub Pages Actions.
- Root `index.html` and `games/`: static fallback output for the current branch-based Pages setting.

The preferred long-term Pages source is **GitHub Actions**. The committed fallback output keeps the site live while the repository is still configured as **Deploy from a branch**.

## Local Checks

```sh
cd cards
npm ci
npm test
npm run build
```

To preview the assembled Pages output locally:

```sh
rm -rf _site
mkdir -p _site/games
cp -R hub/. _site/
cp -R games/. _site/games/
rm -rf _site/games/cards
mkdir -p _site/games/cards
cp -R cards/dist/. _site/games/cards/
find _site -name '.DS_Store' -delete
python3 -m http.server 4173 --directory _site
```

Then open `http://localhost:4173/` and any game under `http://localhost:4173/games/.../`.
