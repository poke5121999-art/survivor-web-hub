# Web Game Hub

A local, no-backend web portal that lists games as cards and launches them. Everything runs in the
browser — no server, no login, no ads, no external CDN/fonts. Survivor is the first game; the hub is
built as an extensible catalog so more games can be added later.

## Layout

```
web-hub/
├── index.html              # landing page (loads css + registry + hub.js)
├── css/style.css           # dark, theme-aware, responsive, no-network styling
├── js/hub.js               # renders one card per registry entry
├── data/games.js           # THE REGISTRY — the only file you edit to add a game
├── assets/
│   ├── favicon.svg
│   └── thumbnails/         # one committed image per game (no external URLs)
└── games/
    ├── survivor/           # each game's own build lives in its own folder
    │   └── index.html      # placeholder until the real WebGL build is dropped
    └── kingfall/
        └── index.html      # placeholder (source: thronefall-client submodule)
```

## Games in the registry

| id | Title | Source module | Status |
|----|-------|---------------|--------|
| `survivor` | Survivor | `client-survivor/` | `build-pending` — offline conversion in progress |
| `kingfall` | Kingfall: The Last Citadel TD | `thronefall-client/` | `build-pending` — still on its original online stack |

## Run locally

The hub landing page opens directly via `file://` (double-click `index.html`). But a real Unity **WebGL
build cannot** run from `file://` — it must be served over HTTP. So serve the folder:

```bash
cd web-hub
python -m http.server 8000
# open http://localhost:8000
```

Any static server works (`npx serve`, VS Code Live Server, etc.).

## Add a game

1. Append an entry to `data/games.js` (`window.HUB_GAMES`):
   ```js
   {
     id: "my-game",
     title: "My Game",
     tagline: "One-line pitch.",
     thumbnail: "assets/thumbnails/my-game.svg",
     path: "games/my-game/index.html",
     status: "available",            // or "build-pending" / "coming-soon"
     tags: ["Puzzle"]
   }
   ```
2. Create `games/my-game/` and drop the game's build there (its `index.html` is the entry point).
3. Add `assets/thumbnails/my-game.svg` (or `.png`) — keep it local, no external URL.

No change to `index.html`, `hub.js`, or `style.css` is needed.

**Status values**
- `available` — clickable, launches the build.
- `build-pending` — clickable, launches a placeholder page; shows a "Cần thả build" badge (use while the
  build folder is not populated yet).
- `coming-soon` — shown disabled, not clickable.

## Drop the Survivor WebGL build

1. In Unity, build the project for **WebGL**.
2. Copy the build output (its `index.html`, `Build/`, `TemplateData/`, …) into `games/survivor/`,
   replacing the placeholder `index.html`.
3. In `data/games.js`, change the Survivor entry's `status` from `"build-pending"` to `"available"`.

> WebGL builds are large (tens of MB). Decide whether to commit the build into this repo (needed if you
> deploy this repo via GitHub Pages) or keep it out of git and deploy the assembled folder separately.

## Deploy to GitHub Pages

This hub is published as its own dedicated GitHub repository.

```bash
# from the web-hub/ contents (already pushed to the dedicated repo's default branch)
# On GitHub: Settings → Pages → Source: "Deploy from a branch" → branch = main, folder = / (root)
```

Once Pages is enabled, the hub is live at `https://<user>.github.io/<repo>/`. Because all paths are
relative, the game folders (`games/<id>/`) resolve correctly under the Pages sub-path.
