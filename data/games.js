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
 * To add a game: append an entry below, create web-hub/games/<id>/, drop its
 * WebGL build (or an index.html), add a thumbnail. No code change needed.
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
