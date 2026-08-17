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
    // the mmorpg_survivor fork at 169509c34. No match clock, no win/lose, no level-up skill
    // choice, no co-op; a level grants +1 ATK / +1 HP; gear drops from kills with its own
    // rolled stats. Progress uses the same hub-account save contract as the other two games.
    // NOT yet eyes-on verified: nobody has played a match. Everything claimed above is a
    // green compile plus 905 passing unit tests, which is exactly the evidence that has
    // missed build-only breakage on this hub before (see Kingfall, patch-16).
    status: "available",
    tags: ["MMORPG", "Action", "Solo"]
  },
  {
    id: "rung-toi",
    title: "Rừng Tối",
    tagline: "Kinh dị sinh tồn nhìn từ trên xuống: bạn chỉ thấy thứ trước mặt, tường và cây chặn tầm nhìn, và đêm xuống thì cái đèn pin vừa cứu vừa bán đứng bạn.",
    thumbnail: "assets/thumbnails/rung-toi.svg",
    path: "games/rung-toi/index.html",
    // available since 2026-08-16. NOT a Unity build — a single 41 KB HTML page of plain
    // canvas/JS, so unlike the other three it loads instantly, runs from file:// as well as
    // over HTTP, and carries no Addressables content. It is a PROTOTYPE built to answer
    // "can we do a Darkwood-style game": raycast visibility polygons for the sight cone,
    // hand-authored room tiles shuffled into a 3x3 grid per run, a day/night clock, and a
    // torch that trades sight radius against the radius at which enemies notice you.
    // Verified in real Chrome before publishing: 0 console errors, 60 fps, world reseeds,
    // damage and death work. It stores nothing, so it does not use the hub save bridge.
    status: "available",
    tags: ["Kinh dị", "Sinh tồn", "Solo", "Prototype"]
  },
  {
    id: "repo2d",
    title: "Ca Trực Đêm",
    tagline: "Vào nhà, khuân đồ giá trị ra bệ giao hàng cho đủ chỉ tiêu, rồi tìm bệ tiếp theo. Càng nặng càng đắt, và càng dễ vỡ khi bạn đâm vào tường — trong đó có thứ khác đang đi lại.",
    thumbnail: "assets/thumbnails/repo2d.svg",
    path: "games/repo2d/index.html",
    // available since 2026-08-16. Plain canvas/JS, no engine, ~100 KB across three files.
    // This is the playable build of docs/proposals/repo-2d-topdown.md: quota derived from
    // scattered loot value, extraction pads, impulse-based loot breakage, sight- and
    // sound-based monsters, weight that costs speed and vision, and a between-level shop.
    // SINGLE PLAYER on purpose — the doc targets 1-6, but co-carry and object authority
    // belong on a server (realm-server/), not in a page.
    // Ships with an in-game bot that plays the whole loop; docs/tests/browser/test_repo2d.py
    // drives it at 8x and asserts the level actually completes (32 checks, 0 console errors).
    status: "available",
    tags: ["Kinh dị", "Co-op", "Khuân đồ", "Prototype"]
  },
  {
    id: "voiddiver",
    title: "Void Diver",
    tagline: "Lặn xuống vực nhặt di vật. Càng sâu đồ càng ngon, nhưng đèn thì cạn dần, đứng trong tối lâu thì đầu bắt đầu nhiễm — và muốn rút lên là phải trả tiền bằng chính chỗ đồ đang mang.",
    thumbnail: "assets/thumbnails/voiddiver.svg",
    path: "games/voiddiver/index.html",
    // available since 2026-08-17. Plain canvas/JS, no engine, ~85 KB across three
    // files. Built from the systems of the VOID DIVER: Escape from the Abyss demo
    // (Steam appid 4347080) — an extraction RPG. NO asset of that game is used or
    // shipped here: everything is drawn in code. What was taken is design data read
    // out of the installed build — the stat schema (CurrentDepth / CurrentLightFuel /
    // Corruption), the four-state corruption sequence table, the stress screen-effect
    // factors, and the table schema (ExitCostTable, DropRewardTable, ArtifactPrefix...).
    // Line-of-sight rendering follows rung-toi's approach; the light-as-a-liability
    // idea is Darkwood's, applied to a stat the original game already tracks.
    // Ships with an in-game bot that plays the whole loop; the agent test at
    // docs/tests/browser/test_voiddiver.py drives it at 8x and asserts the run closes
    // (49 checks, 0 console errors). Progress is local only — it does not use the hub
    // save bridge yet.
    status: "available",
    tags: ["Kinh dị", "Roguelite", "Solo", "Prototype"]
  }
];
