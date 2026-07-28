/*
 * Game registry — the catalog the hub renders.
 *
 * This is the ONLY file you edit to add/remove/update a game. hub.js reads
 * window.HUB_GAMES generically and builds one card per entry.
 *
 * WHY a .js file (a global) instead of a .json fetched at runtime:
 * ROOT-CAUSE: browsers block fetch()/XMLHttpRequest of local files under the
 *   file:// "null" origin, so a JSON registry makes the page blank on direct
 *   open. Loading the registry via <script> sidesteps that entirely.
 * SEE: docs/patches/phase-5.1-patch-1-web-game-hub.md (Options Considered A vs B)
 *
 * Entry shape:
 *   {
 *     id:        stable slug (folder name under games/)          e.g. "survivor"
 *     title:     display name
 *     tagline:   one-line pitch
 *     thumbnail: relative path to a committed image (no external URL)
 *     path:      relative launch path                            e.g. "games/survivor/index.html"
 *     status:    "available" | "build-pending" | "coming-soon"
 *     tags:      string[]
 *   }
 *
 * status controls WHO sees the game:
 *   - "available"     → shown on the public hub (index.html). Use ONLY when a real
 *                       build is present in games/<id>/. This is the flag a player sees.
 *   - "build-pending" → hidden from players; visible to the dev on admin.html.
 *                       The game is listed but its build has not been dropped in yet.
 *   - "coming-soon"   → hidden from players; a teaser tracked on admin.html.
 *
 * To add a game: append an entry below (or use the "Add game" form on admin.html
 * and Export), create web-hub/games/<id>/, drop its WebGL build, add a thumbnail,
 * then flip status to "available". Publish = commit + push to the survivor-web-hub
 * repo's main branch (GitHub Pages rebuilds automatically). No code change needed.
 */
window.HUB_GAMES = [
  {
    id: "survivor",
    title: "Survivor",
    tagline: "Vampire-Survivors-style auto-shooter. Move to dodge, weapons fire themselves, survive escalating waves.",
    thumbnail: "assets/thumbnails/survivor.svg",
    path: "games/survivor/index.html",
    // build-pending: the game exists but its WebGL build has not been dropped in
    // web-hub/games/survivor/ yet. Flip to "available" once the build is present.
    status: "build-pending",
    tags: ["Action", "Roguelite", "Solo"]
  }
];
