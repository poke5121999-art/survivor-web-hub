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
    id: "repo2d-unity",
    title: "Ca Trực Đêm — Online",
    tagline: "Cùng một ca trực, nhưng có người khác trong nhà với bạn. Mở phòng, đọc mã cho bạn bè, rồi cả tổ cùng khuân đồ ra bệ trong bóng tối.",
    thumbnail: "assets/thumbnails/repo2d-unity.svg",
    path: "games/repo2d-unity/index.html",
    // The UNITY build of the same design, kept BESIDE the plain-JS one rather than replacing it:
    // the owner asked for the existing web build not to be overwritten, and the two are meant to
    // stay comparable anyway — a rule changed in one and not the other is a rule nobody can trust.
    // What this build has that the JS one does not: a menu, and a room you can open and share.
    // Co-op is a MIRRORED simulation (Unity Netcode + the multiplayer service, the same stack
    // client-survivor runs): every member builds the same house from the same seed and runs its own
    // monsters, and what crosses the wire is where the other workers are standing.
    // SEE: docs/proposals/repo-2d-topdown.md F15.
    status: "available",
    tags: ["Kinh dị", "Co-op", "Online", "Unity", "Prototype"]
  },
  {
    id: "stardew",
    title: "Thung Lũng Sao Rơi",
    tagline: "Nông trại ông để lại, một thung lũng đầy người quen chưa gặp. Trồng theo mùa, câu cá theo giờ, xuống mỏ khi đủ gan, và nhớ ngày sinh nhật của hàng xóm.",
    thumbnail: "assets/thumbnails/stardew.svg",
    path: "games/stardew/index.html",
    // available since 2026-08-23. Plain canvas/JS, no engine: ~9 files plus one
    // 764 KB data bundle. The data is the point — 222 pages of the official
    // wiki were pulled as raw source and extracted into 23 tables, then
    // compiled into the bundle the page loads: 46 crops with per-stage growth
    // days and the four-tier price ladder, 77 fish keyed on
    // location x season x hour x weather, 145 dishes, 151 crafting recipes,
    // 37 villagers carrying 623 schedule blocks / 3,069 movement steps /
    // 3,346 spoken lines / 1,137 gift entries, 31 bundles across all seven
    // rooms, 939 shop lines, 39 monsters with drop tables.
    // Controls depart from the original on purpose, per the brief: ONE tool
    // that decides its job from whatever is in front of you, every
    // interactable outlined with a floating icon, gifting and selling as
    // drop targets beside the bag, a build menu on every farm tile.
    // Ships with an in-game bot; docs/tests/browser/test_stardew.py drives it
    // through a full 112-day year and asserts the run survives (98 checks,
    // 0 console errors). Crop growth times are asserted against the wiki's
    // own numbers — Parsnip 4 days, Starfruit 13.
    // NOT yet eyes-on verified by a human across a long session.
    status: "available",
    tags: ["Nông trại", "Mô phỏng", "Solo", "RPG"]
  },
  {
    id: "hic",
    title: "Hắn Đang Tới",
    tagline: "Ba ngày để nhặt đồ, rồi hắn tới. Bạn không bấm được gì trong trận — thắng hay thua đã nằm trong đống đồ bạn chọn lúc còn sáng.",
    thumbnail: "assets/thumbnails/hic.svg",
    path: "games/hic/index.html",
    // available since 2026-08-23. Plain canvas/JS, no engine: 9 files plus one
    // 29 KB data bundle. All graphics are VECTOR drawn in code (curves, rounded
    // polygons, anti-aliased) — an earlier pixel-art pass was dropped because
    // the owner found it hard on the eyes. A clone of "He is Coming" (Chronocle / Hooded Horse) —
    // a roguelite auto-battler where the player never acts during a fight.
    // NO asset of that game is used or shipped here: every sprite is drawn in
    // code on an 8x8 grid. What was taken is DESIGN DATA, from the community
    // simulator github.com/eseidel/he_is_coming (demo build 0.3.5): 181 items
    // with their stats and effect text, 32 creatures across three tiers plus
    // 12 bosses, 9 weapon edges, 3 oils, 6 item sets — and, more importantly,
    // its combat resolution order, which this build re-implements trigger for
    // trigger (Battle Start / Initiative / turn / on-hit / exposed / wounded /
    // thorns / stun, armor absorbing before health, higher speed striking first
    // with ties going to the player). The overworld numbers come from the
    // published game: 50 steps a day, 30 a night, sight 5 then 3, three days
    // and three nights to a boss, item slots 5 -> 7 -> 9.
    // Controls depart from the original on purpose, since it is a PC game:
    // tap a tile to walk there, tap an adjacent monster to fight it, one d-pad
    // for single steps, everything else is a full-width button in a portrait
    // 9:16 frame.
    // Ships with an in-game bot; docs/tests/browser/test_hic.py drives it
    // through whole runs and also asserts the combat rules directly against the
    // original's (73 checks, 0 console errors).
    // Art/UX pass 2026-08-23 after the first play-test: ground and objects are
    // two layers with outlines and drop shadows, every interactable tile carries
    // a lit pedestal and a bobbing arrow, each item has its own code-drawn icon
    // (22 shapes across 123 base items), the equipment screen is an icon grid
    // with live set progress, map events survive being declined and only open on
    // arrival rather than when walked over, and the battle is an animated scene
    // (lunges, shaped hit flashes, floating numbers, screen shake) instead of a
    // text log.
    // NOT yet eyes-on verified by a human across a long session.
    status: "available",
    tags: ["Roguelite", "Auto-battler", "Chiến thuật", "Solo"]
  },
  {
    id: "voiddiver",
    title: "Void Diver",
    tagline: "Lặn xuống vực nhặt cổ vật rồi mang lên bán. Vấn đề: chính chỗ đồ bạn đang vác mới là thứ làm bạn phát điên — càng quý càng nhanh loạn. Mang thêm một món nữa, hay rút lên bây giờ?",
    thumbnail: "assets/thumbnails/voiddiver.svg",
    path: "games/voiddiver/index.html",
    // available since 2026-08-17, rebuilt 2026-08-23 (patch-28). Plain canvas/JS, no engine, no
    // build step, opens from file://. Built from the systems of VOID DIVER: Escape from the Abyss
    // (STUDIO NEMO, Steam demo appid 4347080) — a 2.5D co-op extraction RPG crossed with a shop
    // sim. NO art, audio or animation of that game is used or shipped here: everything on screen
    // is drawn in code. What was taken is design data read out of the installed build and written
    // up in docs/research/voiddiver/: the control scheme from its shipped InputActionAsset, the
    // stat and status vocabulary, the shipped sight-cone and stress post-processing tuning, and
    // 81 real dungeon rooms with the designer's own spawn points and subset-spawn rules. The
    // balance numbers are ours — the original's tables ship encrypted and are unreadable.
    // The rule that makes it the same game: corruption is the sum of the artifacts in your bag,
    // recomputed every time the bag changes, and it drives the stress that distorts the screen.
    // Darkness is a separate gauge (Brightness) that amplifies damage taken.
    // Single-player; the original's 1-3 player co-op is deliberately not implemented.
    // Ships with an in-game bot that plays the whole loop; docs/tests/browser/test_voiddiver.py
    // drives it and asserts the rules. Progress is local only - no hub save bridge yet.
    status: "available",
    tags: ["Kinh dị", "Roguelite", "Solo", "Prototype"]
  }
];
