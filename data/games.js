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
    // available since 2026-07-30: a real WebGL build (68 MB) lives in
    // web-hub/games/survivor/ and was play-tested end-to-end in a browser with no
    // backend. See docs/plans/roadmap.md Phase 1.1 / 5.2.
    status: "available",
    tags: ["Action", "Roguelite", "Solo"]
  },
  {
    id: "kingfall",
    title: "Kingfall: The Last Citadel TD",
    tagline: "Tower-defense siege: raise the citadel, place your defenders, and hold the last gate against waves of mobs and bosses.",
    thumbnail: "assets/thumbnails/kingfall.svg",
    path: "games/kingfall/index.html",
    // available since 2026-08-05: a real WebGL build sits in web-hub/games/kingfall/
    // (68 MB, Unity 6000.0.59f2) with its Addressables content bundles, and the online
    // stack it shipped with — Firebase cloud save, LevelPlay ads, real-money purchasing,
    // platform sign-in — is compiled out. Progress follows the hub account through the
    // same save contract Survivor uses. See docs/plans/roadmap.md Milestone 7.
    // NOT yet eyes-on verified: the two-generation editor jump can break rendering
    // (shaders, particles, lighting) without breaking the build.
    status: "available",
    tags: ["Tower Defense", "Strategy", "Solo"]
  },
  {
    id: "mmorpg",
    // WORKING TITLE — the owner has not named this game yet; only the folder name
    // (mmorpg_survivor) is settled. Change `title` here when they do; `id` is the
    // folder under games/ and should stay put.
    title: "Survivor MMO",
    tagline: "A persistent world with the same auto-shooter combat: walk up an arena corridor, clear mob camps that hold their ground and respawn on their own timers, and leave whenever you have farmed enough.",
    thumbnail: "assets/thumbnails/mmorpg.svg",
    path: "games/mmorpg/index.html",
    // available since 2026-08-08: a real WebGL build (69 MB, Unity 6000.0.59f2) built from
    // the mmorpg_survivor fork at e28c7001a. No match clock, no win/lose, no level-up skill
    // choice, no co-op; a level grants +1 ATK / +1 HP; gear drops from kills with its own
    // rolled stats. Progress uses the same hub-account save contract as the other two games.
    // NOT yet eyes-on verified: nobody has played a match. Everything claimed above is a
    // green compile plus 905 passing unit tests, which is exactly the evidence that has
    // missed build-only breakage on this hub before (see Kingfall, patch-16).
    status: "available",
    tags: ["MMORPG", "Action", "Solo"]
  }
];
