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
 *     tagline:   one-line hook on the card, ≤ 80 chars
 *     desc:      2-4 sentences in the "Giới thiệu" dialog, ≤ 330 chars
 *     genre:     filter chip key, one of GENRES in js/hub.js
 *                ("hanh-dong" | "kinh-di" | "nhap-vai" | "chien-thuat" | "thu-gian" | "khac")
 *     accent:    card glow / border colour, e.g. "#f59e0b"
 *     thumbnail: relative path to a committed 640x360 image (no external URL);
 *                capture it from the real game with games/<id>/tools/thumb.js (tools/thumb-lib.js)
 *     path:      relative launch path                            e.g. "games/survivor/index.html"
 *     rev:       "YYYYMMDD<letter>" cache-bust stamp; the newest one is the hub's featured game
 *     status:    "available" | "build-pending" | "coming-soon"
 *     tags:      string[] (the card shows the first 3)
 *   }
 * test/hub-ui.js checks the tagline/desc lengths and genre keys.
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
    tagline: "Chỉ việc chạy né, vũ khí tự bắn. Sống sót qua từng đợt quái.",
    desc: "Kiểu Vampire Survivors. Bạn chỉ lo hướng chạy, mọi vũ khí tự khai hoả. Quái kéo tới từng đợt, đợt sau đông và khó hơn đợt trước.",
    genre: "hanh-dong",
    accent: "#a78bfa",
    en: { title: "Survivor", tagline: "Just run and dodge, your weapons fire themselves. Survive wave after wave.", desc: "In the style of Vampire Survivors. You only steer, every weapon fires on its own. Enemies come in waves, each one bigger and harder than the last." },
    thumbnail: "assets/thumbnails/survivor.svg",
    path: "games/survivor/index.html",
    // available since 2026-07-30: a real WebGL build (68 MB) lives in
    // web-hub/games/survivor/ and was play-tested end-to-end in a browser with no
    // backend. See docs/plans/roadmap.md Phase 1.1 / 5.2.
    status: "available",
    tags: ["Roguelite", "Tự bắn", "Solo"]
  },
  {
    id: "kingfall",
    title: "Kingfall: The Last Citadel TD",
    tagline: "Thủ thành: dựng thành, đặt quân, giữ cổng cuối trước quái và trùm.",
    desc: "Thủ thành kiểu tower defense. Xây toà thành, đặt quân phòng thủ và giữ cánh cổng cuối cùng qua từng đợt quái, xen giữa là trùm.",
    genre: "chien-thuat",
    accent: "#fb923c",
    en: { title: "Kingfall: The Last Citadel TD", tagline: "Raise the citadel, place defenders, hold the last gate against mobs and bosses.", desc: "Tower defense siege. Build the citadel, place your defenders and hold the final gate through wave after wave of mobs, with bosses in between." },
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
    tags: ["Thủ thành", "Đánh trùm", "Solo"]
  },
  {
    id: "rung-toi",
    title: "Rừng Tối",
    tagline: "Kinh dị nhìn từ trên xuống. Chỉ thấy thứ trước mặt, và đèn pin làm lộ bạn.",
    desc: "Sinh tồn trong rừng đêm. Tường và cây chặn tầm nhìn nên bạn chỉ thấy thứ ở trước mặt. Đêm xuống, cái đèn pin vừa cứu bạn vừa bán đứng bạn.",
    genre: "kinh-di",
    accent: "#84cc16",
    en: { title: "Dark Forest", tagline: "Top-down horror. You only see what is in front of you, and your flashlight gives you away.", desc: "Survive a forest at night. Walls and trees block your view, so you only see what is ahead. After dark, your flashlight both saves you and betrays you." },
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
    // 2026-09-15: chủ dự án tắt bản web, thay bằng bản Unity (repo2d-unity).
    status: "build-pending",
    tags: ["Kinh dị", "Co-op", "Khuân đồ", "Prototype"]
  },
  {
    id: "repo2d-unity",
    title: "Ca Trực Đêm: Biệt Đội",
    tagline: "Kinh dị co-op năm người. Trực ca vô tận tới khi cả tổ gục.",
    desc: "Bản Unity của Ca Trực Đêm. Tổ năm người, 14 nhân vật, gacha, trang bị và 9 màn. Chế độ Co-op Ca vô tận cho năm người thật, mỗi người mang nhân vật của mình vào, chơi tới khi cả tổ gục.",
    genre: "kinh-di",
    accent: "#2dd4bf",
    en: { title: "Night Shift: Squad", tagline: "Five-player co-op horror. Work the endless shift until the whole crew falls.", desc: "The Unity build of Night Shift. A five-person crew, 14 characters, gacha, gear and 9 levels. Endless Co-op Shift is for five real players, each bringing their own character, playing until the whole crew falls." },
    thumbnail: "assets/thumbnails/repo2d-unity.svg",
    path: "games/boohaul/index.html",
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
    id: "repo-squad",
    title: "Ca Trực Đêm: Biệt Đội",
    tagline: "Bản REPO thứ hai, làm cho người thích nạp: một tổ năm người — bạn cầm một xác, bốn xác còn lại chạy theo chiến thuật bạn giao. Mỗi xác một kỹ năng bấm tay, và cả một tầng gacha phía sau.",
    thumbnail: "assets/thumbnails/repo-squad.svg",
    path: "games/repo-squad/index.html",
    // available since 2026-08-27. KHÔNG đè lên games/repo2d — bản cũ giữ nguyên, đây là
    // một game riêng dùng lại luật khuân đồ của nó. Plain canvas/JS, 8 file, không engine,
    // mở được từ file://.
    // Khác bản cũ ở chỗ: một ca là NĂM người (1 người chơi + 4 bot), mỗi bot chạy một trong
    // 8 chiến thuật (khuân đồ / thủ bệ / soi map / bảo kê / giải cứu / nhử mồi / săn quái /
    // tiếp tế); 14 xác, mỗi xác đúng một kỹ năng chủ động có hồi chiêu (chớp, vòng hồi,
    // tàng hình, xung chấn, mồi nhử, lồng sắt, đóng băng, thấu thị, kéo đồ, thiên thần...);
    // meta đầy đủ kiểu game gacha: vàng + ngọc, tiến hoá (nâng chỉ số cho CẢ TỔ), trang bị
    // sáu ô lắp cho từng xác kèm bộ đồ 2/4 món, hai băng gacha (xác + trang bị) có bảo hiểm,
    // cửa hàng nạp GIẢ (bấm là có ngọc, không có cổng thanh toán), nhiệm vụ ngày/tuần/thành tựu.
    // Từ 2026-09-15 (chép ngược từ bản Unity): KHÔNG còn 9 map. Một ca là MỘT ải 5 nhà khó dần —
    // rừng, băng, di tích, đầm lầy, hầm tối — mỗi nhà vỏ Soul Knight, loot/bẫy/quái riêng; qua nhà
    // 5 là thắng ca, ca sau lại từ nhà 1. Có 7 loài quái mới (hồn ma, bàn tay quỷ dị, xác ướp, con nít
    // ranh, kẻ ném đầu, kẻ gài mìn, kẻ giả mạo), tiếng thật R.E.P.O. và nhạc theo nhà.
    // SEE: games/repo2d/AI-5-NHA.md
    // Câu này từng hứa thêm ba giống quái riêng cho bản này — Nhện Trần, Quản Ca, Bóng Đen.
    // Ba con đó (và bốn con nữa) có trong một bảng dữ liệu mà KHÔNG CHỖ NÀO nạp vào bộ máy,
    // nên chúng chưa từng sinh ra trong một ván nào — chúng chỉ là chữ trong sổ tay. Đã xoá cả
    // bảng, 2026-09-04. Hai bản dùng chung đúng MỘT bảng quái: bốn cái thân (Kẻ bắn, Kẻ húc,
    // Bom con, Gnome) cộng hai sự kiện của căn nhà (Tượng, cặp Gương).
    // Ships with an in-game bot; docs/tests/browser/test_repo_squad.py lái nó qua đúng cử chỉ
    // người chơi (kéo cần gạt, bấm nút kỹ năng, bấm nút trong menu) và kiểm luật — 50 checks,
    // 0 console errors, có một ván phá đảo trọn vẹn map 3 tầng.
    // CHƯA có người thật ngồi chơi lâu.
    // 2026-09-15: chủ dự án tắt bản web, thay bằng bản Unity (repo2d-unity).
    status: "build-pending",
    tags: ["Kinh dị", "Gacha", "Biệt đội", "Khuân đồ", "Solo"]
  },
  {
    id: "stardew",
    title: "Quần Đảo Sao Rơi",
    tagline: "Ông ngoại để lại một hòn đảo. Còn 24 hòn nữa đang chờ bạn mua.",
    desc: "Làm nông, khám phá và bắt quái. Biển quanh đảo của bạn còn hai mươi bốn hòn nữa để mua dần từng hòn. Trong đám cỏ cao trên vài hòn có thứ đang trốn.",
    genre: "thu-gian",
    accent: "#4ade80",
    en: { title: "Fallen Star Isles", tagline: "Grandpa left you an island. 24 more are waiting for you to buy them.", desc: "Farm, explore and catch monsters. The sea around your island holds twenty-four more to buy one at a time. Something hides in the tall grass on a few of them." },
    thumbnail: "assets/thumbnails/stardew.png",
    path: "games/stardew/index.html",
    // Bumped on every redeploy. js/hub.js appends it to the card's href so the
    // browser cannot serve a stale index.html out of the ten-minute Pages cache.
    rev: "20260827d",
    // REBUILT 2026-08-27, and it replaces the valley build that used to live
    // here rather than sitting beside it. Three things changed and each one
    // was the owner's call:
    //
    //  1. NO INTERIORS. The old build carried 52 extracted Stardew maps and a
    //     warp table, and put a load screen between the player and every shop
    //     counter. There is ONE map now - a 160x126 sea with 25 islands on it -
    //     and a shop is not a door, it is an island. Nothing in the game is
    //     entered; it is walked to.
    //  2. LAND IS BOUGHT, one island at a time, gated on an Island Rank fed by
    //     every activity in the game plus a price, and only ever adjacent to
    //     land already owned. The complaint that produced this was exact:
    //     "vô unlock full làng làm ngợp".
    //  3. POKEMON ARE FARM LABOUR. Ten of the islands have tall grass with real
    //     encounter tables; a caught Pokemon does chores - waters a field,
    //     tills a plot, harvests, hauls - and those cost the POKEMON's daily
    //     Work Points, not the player's energy. Type decides the job, so team
    //     building is a farming decision.
    //
    // The Pokemon layer is Generation 3 arithmetic, not a nod at it: 32-bit
    // personality values driving nature/gender/shininess, IVs 0-31, EVs to the
    // 510 cap, the real damage formula with STAB and the 17-type Gen 3 chart,
    // and the real four-shake capture maths. 151 species and 273 moves pulled
    // from PokeAPI's FireRed/LeafGreen tables.
    //
    // Art is PLACEHOLDER and cannot ship - island sprites extracted from a
    // retail Pickaxe King Island APK, Pokemon sprites from the PokeAPI archive.
    // See games/stardew/art/CREDITS.txt for what has to be replaced and how.
    //
    // FOUR headless suites, all green: tools/smoke.js drives a full playthrough
    // (a farm cycle, all 24 island purchases, twelve mine floors, a capture,
    // Pokemon labour, a save round trip); tools/uicrawl.js taps all 407 buttons
    // in all 40 panels and reports every gold/item/party delta, which is how an
    // item-duplication bug shows itself; tools/regress.js holds one assertion
    // per bug found and fixed; tools/check_art.js resolves every atlas frame
    // name. A bug-hunt pass over the whole codebase found and fixed 36 real
    // defects, including five separate gold-duplication paths that all came
    // from one line, a battle panel whose X permanently soft-locked the game,
    // and a 12,000v island whose only building had no verb wired to it. The
    // Pokemon tables were also rolled back from PokeAPI's modern values to the
    // real Generation 3 ones. NOT yet eyes-on verified by a human across a long
    // session.
    status: "available",
    tags: ["Nông trại", "Bắt quái", "Khám phá", "Mô phỏng", "Solo"]
  },
  {
    id: "hic",
    title: "Hắn Đang Tới",
    tagline: "Ba ngày nhặt đồ, rồi hắn tới. Trận đánh tự diễn theo đồ bạn chọn.",
    desc: "Roguelite auto-battler. Bạn có ba ngày để nhặt đồ. Khi hắn tới thì không bấm được gì nữa, thắng hay thua đã nằm trong đống đồ bạn chọn lúc trời còn sáng.",
    genre: "chien-thuat",
    accent: "#ef4444",
    en: { title: "He Is Coming", tagline: "Three days to scavenge, then he arrives. The fight plays out from the gear you picked.", desc: "Roguelite auto-battler. You have three days to gather gear. Once he arrives you cannot press anything, the win or loss was decided by what you packed while it was still light." },
    thumbnail: "assets/thumbnails/hic.png",
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
    // Polish pass 2026-09-15 (owner asked for Soul Knight art, smooth motion,
    // juicy fights, mobile-friendly landscape UI like the Steam version):
    // - LANDSCAPE layout: day/night clock with a skull at the top, an
    //   always-visible gear column on the left, and the map filling the rest.
    //   Portrait screens get the column as a bottom bar instead.
    // - Every sprite, tile, icon and VFX now comes from ONE Soul Knight atlas
    //   (games/hic/art/sk/, 441 frames). Deleting that folder falls back to
    //   the vector art. See art/sk/README.md for the licence note.
    // - The hero glides between tiles, the camera follows, the fog fades in
    //   and out, night brings a lantern glow, and monsters breathe and pop a
    //   "!" when they spot you.
    // - Fights play wind-up -> dash -> hit-stop -> knockback, with slash/crit
    //   sprites and floating numbers. The gear slot that triggered lights up,
    //   which needed a `src` field added to the combat log.
    // - Synthesized WebAudio SFX and music, plus toggles for sound, music,
    //   screen shake and the d-pad.
    // - Combat rules are unchanged: the bot reaches the same week, phase and
    //   step count for seeds 1000-1004 before and after this pass.
    rev: "20260915a",
    status: "available",
    tags: ["Roguelite", "Auto-battler", "Chiến thuật", "Solo"]
  },
  {
    id: "voiddiver",
    title: "Void Diver",
    tagline: "Lặn xuống hầm ngục giữa thành phố, nhặt cổ vật trước khi đèn pin cạn.",
    desc: "Tiệm đồ cổ Balusha cử bạn xuống hầm ngục nhặt cổ vật. Chém, bắn, lướt dưới ánh đèn pin sắp cạn, càng căng thẳng thì bóng tối càng sinh quái. Mang đồ về bốt điện thoại để bán, chế đồ và học kỹ năng. Bốn Diver để chọn.",
    genre: "hanh-dong",
    accent: "#c084fc",
    en: { title: "Void Diver", tagline: "Dive into the dungeon under the city and grab relics before your flashlight dies.", desc: "The Balusha antique shop sends you into the dungeon to collect relics. Slash, shoot and dash under a dying flashlight, and the higher the tension, the more monsters the dark spawns. Bring loot back to the phone booth to sell, craft and learn skills. Four Divers to choose from." },
    thumbnail: "assets/thumbnails/voiddiver.png",
    // Bản Unity WebGL (dựng lại bằng Unity 6000.0.77f1 bên linux) host ở repo Pages riêng
    // poke5121999-art/voiddiver-webgl, vì build nặng ~636MB không nhét vào hub chính (đã 1,4GB).
    // Bản three.js cũ còn ở games/voiddiver/ (orphan, có thể dọn sau).
    path: "https://poke5121999-art.github.io/voiddiver-webgl/",
    rev: "20261030a",
    // Dựng lại hoàn toàn 2026-09-25 từ chính bản demo Steam VOID DIVER: Escape from the Abyss
    // (Studio Nemo, appid 4347080) cài trên máy chủ dự án. Bản 2026-08 (vẽ bằng code, số tự chế) đã xoá.
    // Bảng số gốc: TableEncrypted là CSV XOR 0xCC, Lua XOR 0xF4 (bản cũ ghi "mã hoá, không đọc được" là sai).
    // Art/anim/map/tiếng/VFX gốc: Spine 4.2 (spine-threejs 4.2.43), sector 3D glb, AudioClip, hệ hạt Shuriken
    // phát lại bằng shader dịch từ bản gốc. Skill chạy bằng bộ thông dịch cây RootActionNode gốc; tutorial,
    // quest, thoại NPC chạy nguyên văn Lua gốc bằng fengari. Chữ tiếng Việt lấy từ bản dịch gốc.
    // Chơi đơn; co-op của bản gốc không làm. Kiến trúc: games/voiddiver/ARCH.md; quyết định: docs/decisions.tsv.
    // Kiểm: test/voiddiver-{combat,ai,dive,lounge,vfx,input,loot,fx-contract,tutorial-walk}.js.
    status: "available",
    tags: ["Hành động", "Extraction", "Kinh dị", "Solo"]
  },
  {
    id: "chuyen-tau",
    title: "Chuyến Tàu Cuối",
    tagline: "Giữ đoàn tàu hơi nước sống sót qua sa mạc Viễn Tây đầy xác sống.",
    desc: "Tàu chạy thì bạn đứng trên nóc toa mà thủ. Tàu dừng ga thì xuống lục nhà với đồng hồ đếm ngược trên đầu, và tàu chạy tiếp dù có bạn hay không. Mười nhân vật, mỗi người một chiêu riêng. Chín chuyến, bốn kiểu đêm.",
    genre: "hanh-dong",
    accent: "#fbbf24",
    en: { title: "The Last Train", tagline: "Keep a steam train alive across a Wild West desert full of zombies.", desc: "While the train runs you defend from the roof. At a station you search houses with a countdown overhead, and the train leaves with or without you. Ten characters, each with a unique ability. Nine journeys, four kinds of night." },
    thumbnail: "assets/thumbnails/chuyen-tau.png",
    path: "games/chuyen-tau/index.html",
    rev: "20260907e",
    // Dựng lại Dead Rails (RCM Games, Roblox 2025) ở dạng 2D nhìn từ trên xuống. KHÔNG
    // lấy một tệp ảnh hay âm thanh nào của bản gốc; cái được lấy là LUẬT CHƠI, tra từ
    // wiki chính thức của game (qua api.php, vì fandom chặn tải trang thường).
    //
    // Bốn luật chép nguyên vì chúng là phần hay nhất của bản gốc:
    //   1. Ban ngày KHÔNG spawn một con quái nào. Áp lực ban ngày do lòng tham người chơi
    //      tự tạo; áp lực ban đêm do hệ thống áp đặt. Đây là nhịp tim của cả game.
    //   2. Nhiên liệu tiêu theo THỜI GIAN chứ không theo quãng đường — nên đi chậm là đốt
    //      tiền, và "dừng lại lục soát" thành một quyết định có giá thật.
    //   3. Xác quái vừa là nhiên liệu vừa là tiền, nên giết quái không bao giờ công cốc,
    //      và hết than giữa sa mạc là một cú sợ chứ không phải một ngõ cụt.
    //   4. Quái sinh ra ở trạng thái ĐANG NGỦ, thức theo bán kính tiếng động tăng dần, và
    //      đánh cận chiến không đánh thức con nào khác — cả một lớp chơi lén miễn phí.
    //      NGOẠI TRỪ quái của đợt ban đêm: wiki bản gốc ghi "they will spawn in sleeping
    //      (unless spawned by the Cloudy Night)", nên quái đổ ra lúc trời tối thì xông
    //      thẳng tới, còn quái nằm quanh nhà ở ga mới là quái ngủ.
    //   5. Quái LEO ĐƯỢC LÊN TÀU đang chạy: "They are able to climb onto the Train...
    //      It takes a short moment for them to fully climb onto or drop down from
    //      something", và "All enemies ... have a high chance of falling off". Bảng
    //      count trong CT.NIGHTS là TỔNG QUÂN CỦA CẢ ĐÊM (6/12/18/24/30 con cho Đêm
    //      Mây), thả thành ba đợt — không phải một cái trần đồng thời rồi rỉ giọt tới
    //      sáng. Và đầu tàu CÁN chết thứ đứng chắn đường ray ("can run over entities,
    //      dealing rapid damage to them until they die"), nên muốn lên tàu phải lên từ
    //      bên hông. Tốc độ bản gốc: tàu 65 stud/s, Walker 12, Runner 18 — quái không
    //      bao giờ đuổi kịp tàu, chúng đứng sẵn trên đường và tàu lao tới chỗ chúng.
    //
    // Chỗ CỐ Ý lệch bản gốc: bản gốc đo 80 km và một ván 30-45 phút (chính tác giả đã phải
    // làm chế độ Bite-Sized nén còn 40 km). Ở đây KHÔNG đo bằng km mà bằng CHẶNG — 3/4/5
    // chặng theo vòng, một ván 5-10 phút, và vòng sau không dài hơn, chỉ nặng hơn. Km vẫn
    // hiện lên đồng hồ vì đó là con số người chơi khoe với nhau.
    //
    // ART: dùng chung bộ hình của repo2d (charset 288x576, 3x4, bốn hướng) cho người và
    // quái — `foe/gunner.png` vốn đã là một tay súng đội mũ vành rộng cầm khẩu lục, đúng
    // bài không sửa gì. Nền sa mạc, xương rồng, cây khô mượn dragonproj. Hiệu ứng là bộ
    // PVFX Foundry Thirteen (CC0). ĐOÀN TÀU thì vẽ 100% bằng mã: tra cả 710 tệp ảnh của
    // kho, 3.363 sprite HoloCure và 1.178 khung atlas bên stardew đều không có lấy một
    // tấm tàu hoả nào. Nguồn của từng con số nằm ngay tại chỗ dùng nó trong
    // games/chuyen-tau/data/content.js, gắn nhãn [DR] (tra từ wiki bản gốc) hoặc
    // [ĐỀ XUẤT] / [ĐO TRONG REPO] (tự cân, có ghi cách tính).
    //
    // Kiểm: node test/chuyen-tau-suite.js
    status: "available",
    tags: ["Bắn súng", "Nhìn từ trên xuống", "Màn ngang", "Roguelite", "Gacha", "Viễn Tây"]
  },
  {
    id: "ghe-nong",
    title: "Ghế Nóng",
    tagline: "Làm huấn luyện viên esport: tập luyện, cấm chọn tướng, xem đội đánh 5v5.",
    desc: "Nuôi tuyển thủ kiểu Uma Musume qua một mùa 24 lượt, có thể lực, tâm trạng và độ thân thiết. Vào giải thì cấm chọn trong 20 tướng, rồi xem trận 5v5 tự đánh trên bản đồ của Teamfight Manager 2. 24 đội máy tranh hạng song song tới chung kết thế giới.",
    genre: "chien-thuat",
    accent: "#f43f5e",
    en: { title: "Hot Seat", tagline: "Coach an esports team: train players, draft heroes, watch your team fight 5v5.", desc: "Raise players Uma Musume style over a 24-turn season, with stamina, mood and bonds. At tournaments you ban and pick from 20 heroes, then watch the 5v5 play out on the Teamfight Manager 2 map. 24 AI teams climb the ladder alongside you up to the world finals." },
    thumbnail: "assets/thumbnails/ghe-nong.png",
    path: "games/ghe-nong/index.html",
    rev: "20260925l",
    // Nuôi quân theo Uma Musume (Cygames 2021), thi đấu theo Teamfight Manager 2 (Early Access
    // 2026-05-25). Từ rev 20260925a, tướng, lính, trụ, quái trong trận là sprite TFM2 bóc từ
    // bundle.game_data bằng games/ghe-nong/_tools/build_tfm.py (RESEARCH.md §12). Từ 20260925b
    // tiếng và nhạc nền là tệp thật: TFM2 trong trận và cấm chọn, Uma ngoài trận (build_tieng.py).
    // Từ 20260925f, trận đánh trên bản đồ 5v5 của TFM2: lớp ảnh, tường, bụi, toạ độ trụ/bãi từ
    // map_setting (_tools/build_bando.py, RESEARCH.md §13).
    // Phần còn lại lấy DỮ LIỆU THIẾT KẾ, đọc từ ảnh chụp trong game: 7 ảnh Steam của TFM2, 4 ảnh Umamusume, ba trailer,
    // và 35 phút gameplay YouTube ghép thành 44 bảng ảnh liên hoàn bằng ffmpeg (fps=1/10 +
    // tile=4x3) để duyệt hết bằng mắt. Mỗi con số trong games/ghe-nong/RESEARCH.md đều ghi rõ
    // đọc từ tệp ảnh nào: mood 5 bậc ±20%, trần chỉ số 1200, tỉ lệ gacha 3/18/79 + pity 200 vé,
    // 12 nhóm chiến thuật, buff theo vị trí (đường trên hồi 1% máu/giây, xạ thủ +20% vàng,
    // hỗ trợ −30% kinh nghiệm...), bảng xếp hạng 6 cột Rankings + khung đọc News, và bảng kết
    // quả có biểu đồ chênh lệch vàng.
    //
    // BA CHỖ CỐ Ý KHÁC BẢN GỐC:
    //   1. VỊ TRÍ VÀ CHẤT CHƠI CỦA TUYỂN THỦ LÀ KHOÁ CỨNG. Không kéo xạ thủ lên đường trên,
    //      không bắt người thích đẩy lẻ đi tụ. Chiến thuật của huấn luyện viên chỉ là lời
    //      khuyên: nghe_lệnh = 0.55 + 0.40×(NÃO/1200) − 0.35×(cái tôi/100). Đội hình vì thế
    //      là bài toán GHÉP CHẤT, không phải xếp năm người mạnh nhất.
    //   2. KHÔNG AI CHỌN ĐỒ HỘ. Trong trận mỗi tuyển thủ tự đọc đội địch đánh bằng gì, mình
    //      đang thắng hay bị dí, chất chơi của mình, rồi mua (G.nghiDo trong data-trangbi.js).
    //   3. Một mùa gọn 24 lượt thay vì 70 lượt như Uma — một phiên trên điện thoại không
    //      chứa nổi 70 lượt. Bù lại giáo án ăn dày gấp đôi Uma, và bảng xếp hạng của 24 đội
    //      máy chạy một vòng đấu mỗi ba lượt nên hết mùa mọi đội đều đá 7–8 trận, so được
    //      với 8 giải của người chơi.
    //
    // CÂN BẰNG ĐO BẰNG MÁY, KHÔNG ĐOÁN. Bốn bộ đo trong games/ghe-nong/_tools/: lai.js lái
    // Chrome headless bằng CDP, tuchoi.js tự chơi hết một mùa qua giao diện thật, duongcong.js
    // đo đường cong chỉ số theo ba lối chơi, tileThang.js đo tỉ lệ thắng từng giải, canbang.js
    // chạy 500 trận không vẽ để in tỉ lệ thắng từng tướng (đúng kiểu bảng Champ Stats mà TFM2
    // dùng để tự buff/nerf mỗi mùa). Lần tự chơi đầu tiên trên bản Pages thua 0/40 ở cả tám
    // giải, và hoá ra là năm lỗi cộng lại, không lỗi nào nhìn ảnh mà thấy được: bản đồ trong
    // sim.js không đối xứng nên kèo hoàn toàn cân mà bên xanh chỉ thắng 8/30; LỰC và BỀN
    // không xuất hiện một lần nào trong bộ mô phỏng, tức hai trong năm giáo án là tập không
    // công; bùa Chúa Hang ghi mốc hết hạn nhưng chỗ đọc chỉ xem có hay không nên đội ăn Chúa
    // đầu tiên có lính mạnh 1.4× tới hết trận; mọi đội máy đều có bốn người thông thạo UR kể
    // cả đội yếu nhất giải đầu; và thang thông thạo cũ 0.82…1.22 ăn trùm cả 24 lượt huấn
    // luyện. Sau khi chữa: 20 phút/trận, ~92 mạng, 20 tướng đều nằm trong 41–58%, và tỉ lệ
    // thắng tám giải đi đúng đường 75/85/73/85/55/60/33/30% (đo với năm thẻ khởi đầu, không
    // gacha, không mua kỹ năng, không kế thừa).
    status: "available",
    tags: ["Quản lý", "Nuôi quân", "Gacha", "Esport", "MOBA", "Mô phỏng", "Bảng xếp hạng", "Màn ngang"]
  },
  {
    id: "xuoi-dong",
    title: "Xuôi Dòng",
    tagline: "Lái nhà thuyền xuôi dòng ra biển, câu cá và ngắm ngày đêm. Không có thua.",
    desc: "Xuôi từ hẻm đá qua rừng thông, đầm lầy, hang đá rồi ra biển. Có mưa có giông, đêm xuống thì cabin sáng đèn và đom đóm bay dọc bờ. Kéo lưới bắt cá, vớt thùng trôi, chín loài cá ghi vào sổ.",
    genre: "thu-gian",
    accent: "#fb7185",
    en: { title: "Downstream", tagline: "Pilot a houseboat down the river to the sea, fish and watch day turn to night. No losing.", desc: "Drift from a rocky gorge through pine forest, swamp and caves out to the sea. Rain and storms come and go, at night the cabin windows glow and fireflies line the banks. Net fish, salvage floating crates, and log nine species in your book." },
    thumbnail: "assets/thumbnails/xuoi-dong.png",
    path: "games/xuoi-dong/index.html",
    rev: "20260924b",
    // Plain canvas/JS, không engine, mở được từ file:// (khi đó im tiếng vì fetch bị chặn).
    // ART + ÂM THANH: toàn bộ lấy từ Farming Camp Demo (Innerfire Studios / SOEDESCO), rút
    // thẳng từ bản cài Steam trên máy chủ dự án bằng games/xuoi-dong/tools/rip.py (UnityPy +
    // vgmstream + ffmpeg), dùng theo yêu cầu của chủ dự án ngày 2026-09-24. Bờ sông là bốn
    // khúc P_*RiverGen_A nướng lại từ scene level9 (minigame lái thuyền của demo), đáy sông
    // là tilemap WaterTilemap, nhạc là "Sail On" 1–3 và "Main Menu - Noite". Tên cá lấy từ
    // bảng chữ tiếng Anh của demo khi có (Salmon, Trout, Tiger Barb, Bass, Grouper, Golden
    // Trout). Đây không phải tài sản của repo: muốn gỡ thì xoá games/xuoi-dong/art và
    // games/xuoi-dong/audio. Bẫy đã gặp và số đo: games/xuoi-dong/README.md.
    //
    // Kiểm: node test/xuoi-dong-suite.js
    status: "available",
    tags: ["Thư giãn", "Lái thuyền", "Câu cá", "Ngày đêm", "Pixel art", "Màn ngang"]
  },
  {
    id: "ho-xanh",
    title: "Hố Xanh",
    tagline: "Lặn bắt cá bằng súng xiên như Dave the Diver, tối về mở quán sushi.",
    desc: "Ngắm bằng chuột, bắn trúng thì dây kéo cá về, cá to thì bấm liên tục để kéo co. Dưỡng khí vừa là máu. Lặn từ vùng nông xuống vực sâu 250 m với 65 loài cá, rồi về quán Bancho làm sushi và lấy tiền nâng cấp.",
    genre: "thu-gian",
    accent: "#38bdf8",
    en: { title: "Blue Hole", tagline: "Harpoon fishing like Dave the Diver, then run a sushi bar at night.", desc: "Aim with the mouse, hit a fish and the line reels it in, big ones need rapid clicks to win the tug of war. Oxygen is your health. Dive from the shallows to a 250 m abyss with 65 species, then head to Bancho to serve sushi and earn upgrades." },
    thumbnail: "assets/thumbnails/ho-xanh.png",
    path: "games/ho-xanh/index.html",
    rev: "20260925e",
    // three.js r140 + spine-threejs 4.0.31, vendor sẵn trong games/ho-xanh/vendor, không có bước build.
    // ART + ANIM + VFX + TIẾNG + BẢN ĐỒ: toàn bộ rút từ bản cài Steam của Dave the Diver
    // (Mintrocket) trên máy chủ dự án, theo yêu cầu của chủ dự án ngày 2026-09-24, bằng
    // games/ho-xanh/tools/rip.py (sprite Dave, Spine cá và rong, VFX, UI, tiếng) và level.py
    // (sáu map vùng nông A01–A06: mesh 3D ra .glb nén meshopt, va chạm là PolygonCollider2D
    // của scene gốc). Máu, sát thương, độ hung của cá lấy từ DR_GameData_Fish của bản gốc.
    // Đây không phải tài sản của repo: muốn gỡ thì xoá games/ho-xanh/art, games/ho-xanh/audio,
    // data/assets.js và data/levels.js. Cách bóc và các bẫy: games/ho-xanh/tools/README.md.
    //
    // Kiểm: node test/ho-xanh-suite.js (cần server tĩnh ở cổng 8765 tại gốc repo)
    status: "available",
    tags: ["Lặn biển", "Bắt cá", "Súng xiên", "Lái cano", "Quán sushi", "Nâng cấp", "Pixel art", "3D", "Màn ngang"]
  },
  {
    id: "biet-doi-lan",
    title: "Biệt Đội Lặn",
    tagline: "Dave the Diver gặp R.E.P.O.: kéo đồ cổ từ đáy biển lên cho đủ chỉ tiêu.",
    desc: "Mỗi ca là năm chuyến lặn, chuyến sau sâu hơn và chỉ tiêu cao hơn. Bắn móc vào đồ cổ rồi vừa bơi vừa kéo lên cano, va đập là mất giá, kéo nặng quá thì đứt dây. Cá mập ngủ, nghe tiếng động rồi rượt theo bạn.",
    genre: "hanh-dong",
    accent: "#22d3ee",
    en: { title: "Dive Squad", tagline: "Dave the Diver meets R.E.P.O.: haul relics up from the seabed to hit your quota.", desc: "Each shift is five dives, each deeper with a higher quota. Hook a relic and swim it up to the boat, bumps lower its value and too much weight snaps the line. Sharks sleep, hear noise, then come after you." },
    thumbnail: "assets/thumbnails/biet-doi-lan.png",
    path: "games/biet-doi-lan/index.html",
    rev: "20261002d",
    // Game mới 2026-10-01, không đè lên Hố Xanh hay Biệt Đội. Bộ máy lặn fork từ games/ho-xanh/js vào
    // games/biet-doi-lan/js/engine; art, tiếng, map, vendor đọc thẳng từ ../ho-xanh/ (HX_ROOT), không chép.
    // Sảnh REPO chép từ games/repo-squad với số của bản Unity (D:\REPO_Meta\gamespark-config).
    // Đồ cổ và icon đồ nghề bóc từ Dave the Diver bằng games/biet-doi-lan/tools/rip_loot.py.
    // Bốn đồng đội lặn cùng: sprite sinh từ sheet Dave (đổi màu + chi tiết), làm việc theo chiến thuật giao ở sảnh.
    // SEE: games/biet-doi-lan/README.md, brain/plans/biet-doi-lan.md
    //
    // Kiểm: node test/biet-doi-lan-flow.js (đường người chơi thật), -suite, -lobby, -ship, -tether, -foes, -shop, -hud, -items, -mates
    status: "available",
    tags: ["Lặn biển", "Kéo đồ", "Kiểu REPO", "Gacha", "Crew", "Pixel art", "3D", "Màn ngang"]
  },
  {
    id: "gia-pha",
    title: "Cây Gia Phả",
    tagline: "Dựng cây gia phả dòng họ, có nhạc nền, tủ truyện gia đình và chế độ cây tự kể chuyện.",
    desc: "Bấm quanh thẻ để thêm con, vợ chồng, cha mẹ, kéo thả để chuyển cả nhánh. Tải lên chuyện nhà (Word, văn bản, PDF, ảnh xưa, băng ghi âm) và gắn với người được kể tới. Có sẵn một bài ru làm nhạc nền, tải thêm nhạc của mình; nhạc phát thì nhánh cây có nhựa sống chảy. Xuất ra tệp để chép sang máy khác.",
    genre: "khac",
    accent: "#d4a373",
    en: { title: "Family Tree", tagline: "Build your family tree with background music, a family story shelf, and a guided story tour.", desc: "Tap around a card to add children, spouses or parents, and drag to move a whole branch. Upload family stories (Word, text, PDF, old photos, voice recordings) and tag the people they are about. A lullaby plays by default and you can upload your own playlist; while music plays, light flows down the branches. Export to a file for another device." },
    thumbnail: "assets/thumbnails/gia-pha.svg",
    path: "games/gia-pha/index.html",
    rev: "20261011a",
    // Plain DOM + SVG, không engine, không bước build. Dữ liệu (người, cặp vợ chồng, ghi chú) và tài liệu
    // đính kèm (Blob) nằm trong IndexedDB của máy người dùng, không lên máy chủ nào. Đọc .docx bằng
    // mammoth 1.8.0 (BSD-2) vendor ở games/gia-pha/vendor, chỉ tải khi cần. Mô hình và bất biến:
    // games/gia-pha/README.md.
    //
    // Kiểm: node test/gia-pha-suite.js && node test/gia-pha-truyen-nhac.js
    status: "available",
    tags: ["Công cụ", "Gia phả", "Truyện", "Nhạc nền", "Kéo thả"]
  },
  {
    id: "sprite-cutter",
    title: "Bàn Cắt Sprite",
    tagline: "Cắt sprite sheet thành từng frame PNG, canh khung và xem chạy thử ngay.",
    desc: "Nhập hoặc dán sprite sheet, chia lưới, kéo từng khung cho khớp, xếp chồng các frame để canh tâm. Xoá nền màu đặc, tẩy tay bằng cọ tròn hoặc vuông, vá chấm trắng lạc bằng màu xung quanh, chấm điểm mốc. Cắt ra .zip gồm PNG từng frame, sheet mới và tệp JSON toạ độ. Chế độ Đặt tên file: kéo thư mục hoặc hình vào, sửa tên từng tệp rồi lưu lại.",
    genre: "cong-cu",
    accent: "#3a55e0",
    en: { title: "Sprite Cutter", tagline: "Slice a sprite sheet into PNG frames, align them and preview the animation.", desc: "Import or paste a sprite sheet, set the grid, drag each frame into place and onion-skin the frames to align them. Remove a flat background, erase by hand with a round or square brush, heal stray white specks with the surrounding colour, and drop anchor points. Export a .zip of per-frame PNGs, a repacked sheet and a JSON of frame rects. A Rename files mode lets you drop a folder or images, edit each file name and save them back." },
    thumbnail: "assets/thumbnails/sprite-cutter.png",
    path: "games/sprite-cutter/index.html",
    rev: "20261104a",
    // Một trang HTML thuần, không bước build. Nguồn ở ~/REPO_MOBI/notes/sprite-cutter/index.html (cũng là
    // artifact claude.ai 5DtELwnoaDC6ZA5WrSxzQy); chép sang đây bằng `sh build-hub.sh <rev>` trong thư mục đó,
    // nhớ tăng `rev` ở đây cho trùng. JSZip 3.10.1 (MIT) vendor ở games/sprite-cutter/vendor.
    //
    // Kiểm: sh ~/REPO_MOBI/notes/sprite-cutter/run-test.sh
    status: "available",
    tags: ["Công cụ", "Cắt sprite", "Xoá nền", "Đổi tên tệp", "Pixel art"]
  },
  {
    id: "dredge",
    title: "Biển Mù",
    tagline: "Câu cá trên quần đảo sương mù. Đừng ở ngoài khơi khi trời tối.",
    desc: "Làm lại DREDGE trên web. Mượn chiếc thuyền cũ kèm món nợ $50, câu cá quanh The Marrows và bán cho người buôn. Mỗi loài cá có minigame riêng, xếp cá vào khoang theo đúng hình dáng. Trời tối thì sương dày lên và nỗi hoảng loạn tăng dần.",
    genre: "kinh-di",
    accent: "#93c5fd",
    en: { title: "Fogbound", tagline: "Fish the islands in the fog. Do not stay out after dark.", desc: "DREDGE remade for the web. Borrow an old boat along with a $50 debt, fish around The Marrows and sell to the fishmonger. Every species has its own minigame, and fish fill the hold in their real shapes. After dark the fog thickens and panic sets in." },
    thumbnail: "assets/thumbnails/dredge.png",
    path: "games/dredge/index.html",
    rev: "20261012a",
    // three.js r140 vendor trong games/dredge/vendor, không bước build. Dựng lại DREDGE 1.5.3 (Black Salt
    // Games, 2023) theo yêu cầu của chủ dự án ngày 2026-10-07, từ bản cài trên máy (D:\dredge-ref).
    // Toàn bộ thế giới (scene Game.unity: 8.583 instance, landmask từ collider, bản đồ độ sâu
    // waveHeightMask), thuyền 5 bậc thân, 420 item với giá trong blob Odin, lưới khoang, cấu hình
    // GameConfigData, 259 đoạn tiếng, sprite UI và phông chữ đều bóc bằng games/dredge/tools/*.py.
    // Công thức chép từ mã C# dịch ngược (D:\dredge-ref\notes\CODE.md). Cách bóc và bẫy:
    // games/dredge/tools/README.md. Kế hoạch theo pha: brain/plans/dredge-web.md.
    // Đây không phải tài sản của repo: muốn gỡ thì xoá games/dredge/art, games/dredge/audio và data/*.js sinh ra.
    //
    // Kiểm: node test/dredge-rules.js, test/dredge-suite.js (DR_URL để chạy trên Pages), test/dredge-sea.js, dredge-env.js,
    // dredge-fishing.js, dredge-cargo.js, dredge-story.js. Prefab, material, UI và bytecode Yarn đọc từ bản xuất AssetRipper
    // (D:\dredge-ref\ripped); hợp đồng giao việc ở D:\dredge-ref\notes\DELEGATE.md.
    status: "available",
    tags: ["Câu cá", "Kinh dị", "Lái thuyền", "Thế giới mở", "Xếp khoang", "3D"]
  },
  {
    id: "vuc-san",
    title: "Vực Săn",
    tagline: "4 thợ lặn đấu 2 cá mập trong vực tối. Chọn phe, soi đèn, sống sót.",
    desc: "Thợ lặn chỉ thấy chỗ đèn pin soi và phải mang đồ cổ về khoang cứu hộ trước khi hết 4 phút. Cá mập thấy người bật đèn từ xa nhưng không chui được khe hẹp. 12 loài cá mập, 10 thợ lặn, mỗi người một kỹ năng. Bot lấp ghế trống, chơi được bằng cảm ứng.",
    genre: "hanh-dong",
    accent: "#06b6d4",
    en: { title: "The Hunting Deep", tagline: "4 divers versus 2 sharks in a dark abyss. Pick a side, light the way, survive.", desc: "Divers only see what their flashlight hits and must bring relics back to the rescue pod within 4 minutes. Sharks spot lit divers from afar but cannot squeeze through narrow gaps. 12 sharks and 10 divers, each with a skill. Bots fill empty seats, and touch controls work." },
    thumbnail: "assets/thumbnails/vuc-san.png",
    path: "games/vuc-san/index.html",
    rev: "20261008a",
    // three.js r140 dùng chung với games/ho-xanh (HX_ROOT = '../ho-xanh/'), không bước build. Lấy cảm hứng từ Depth
    // (Digital Confectioners, 2014) theo yêu cầu của chủ dự án ngày 2026-10-08. Cá mập GLB, sprite Dave, bản đồ, tiếng
    // đọc thẳng từ bản rip Dave the Diver trong games/ho-xanh, đồ cổ từ games/biet-doi-lan; game không chép art.
    // Mô phỏng trận là JS thuần chạy được cả trong Node (tools/sim.js đấu bot với bot). Hợp đồng giữa các tầng:
    // games/vuc-san/README.md. Kế hoạch theo pha: brain/plans/vuc-san.md. Ảnh thẻ: node games/vuc-san/tools/thumb.js.
    //
    // Kiểm: node test/vuc-san-sim.js, vuc-san-skills-shark.js, vuc-san-skills-diver.js, vuc-san-bots.js, vuc-san-meta.js (Node);
    // vuc-san-smoke.js, vuc-san-lobby.js, vuc-san-view.js, vuc-san-flow.js, vuc-san-play.js (VS_URL để chạy trên Pages).
    status: "available",
    tags: ["Đối kháng", "Lặn biển", "Cá mập", "Đèn pin", "Gacha", "Bot", "3D", "Màn ngang"]
  },
  {
    id: "bazaar",
    title: "Chợ Phiên",
    tagline: "The Bazaar trên web: xếp đồ lên thảm, đồ tự đánh theo cooldown.",
    desc: "Chọn 1 trong 7 hero (Vanessa, Pygmalien, Dooley, Mak, Stelle, Jules, Karnok), mỗi người một bàn riêng, rồi sống qua 10 ngày ở chợ. Mỗi giờ chọn một trong ba nơi ghé: thương nhân, sự kiện hay quái. Kéo đồ từ quầy xuống thảm để mua, kéo lên quầy để bán, đổi hàng khi chưa ưng. Đồ trên thảm tự đánh theo cooldown: chém, bắn, dựng khiên, đốt, tẩm độc, đóng băng. Thắng quái thì nhặt đồ của nó, lên cấp mở thêm ô, cuối ngày đấu PvP với bóng của người chơi khác; thua mất uy tín, hết uy tín lần đầu còn được Số phận cứu. Có rương thưởng ở 4/7/10 trận thắng và nhiệm vụ trên thẻ. Thẻ, quái, art và tiếng lấy từ bản demo Steam.",
    genre: "chien-thuat",
    accent: "#e0a84b",
    en: { title: "Market Day", tagline: "The Bazaar on the web: lay items on your rug and they fight on their own cooldowns.", desc: "Pick one of 7 heroes (Vanessa, Pygmalien, Dooley, Mak, Stelle, Jules, Karnok), each with their own board, and survive 10 days at the market. Each hour choose one of three stops: a merchant, an event or a monster. Drag items from the stall onto your rug to buy, drag them back to sell, reroll when you don't like the stock. Items on the rug fight on their own cooldowns: slash, shoot, shield, burn, poison, freeze. Beat monsters to take their loot, level up to open more slots, and face another player's ghost in PvP at the end of each day; losing costs prestige, and Fate saves you once. Chests at 4/7/10 wins and quests on cards. Cards, monsters, art and sound come from the Steam demo." },
    thumbnail: "assets/thumbnails/bazaar.png",
    path: "games/bazaar/index.html",
    rev: "20261023f",
    // Plain JS, không bước build. Dựng lại The Bazaar (Tempo Storm) theo yêu cầu của chủ dự án ngày 2026-10-09,
    // từ bản The Bazaar Demo trên Steam (D:\bazaar-ref). Dữ liệu thẻ/quái lấy từ GameData.db (SQLite, mỗi dòng là JSON),
    // sim combat thông dịch DSL thẻ theo $type (games/bazaar/js/sim, luật ở D:\bazaar-ref\notes\CODE-COMBAT.md).
    // Art, khung thẻ, VFX và tiếng (render từng event FMOD) bóc bằng games/bazaar/tools/*.py, xem tools/README.md.
    // Kế hoạch theo pha: brain/plans/bazaar-web.md. Muốn gỡ: xoá games/bazaar/art, games/bazaar/audio và data/*.js sinh ra.
    //
    // Kiểm: node test/bazaar-sim.js (luật, Node), node test/bazaar-view.js (BZ_URL để chạy trên Pages).
    status: "available",
    tags: ["Tự đấu", "Thẻ bài", "Xây đội hình", "Quái", "Combat tự động"]
  },
  {
    id: "toc-do",
    title: "Tốc Độ",
    tagline: "Zing Speed trên web: drift lấy nitro, đua 6 xe, đạo cụ, xếp hạng và cốt truyện.",
    desc: "Đua kart với 5 bot trên 10 đường gốc của Zing Speed Mobile. Drift để nạp nitro, thả drift rồi bấm phun ngay để có phun nhỏ. Có đua tốc độ, đạo cụ, đua đội, xếp hạng theo mùa, 22 ải Cốt Truyện, 4 chế độ sự kiện, 18 xe, PET, thời trang và Xưởng quay xe. Chơi bằng phím hoặc cảm ứng.",
    genre: "hanh-dong",
    accent: "#2f8cff",
    en: { title: "Top Speed", tagline: "Zing Speed on the web: drift for nitro, 6-kart races, items, ranked and story.", desc: "Kart races against 5 bots on 10 original Zing Speed Mobile tracks, including point-to-point ones like Sichuan and Reno. Drift to charge nitro, release and hit boost right away for a mini boost. Speed races, item races, team races, monthly ranked seasons, 22 story levels, 4 event modes, 18 karts, pets, outfits and a kart gacha. Plays with keyboard or touch." },
    thumbnail: "assets/thumbnails/toc-do.png",
    path: "games/toc-do/index.html",
    rev: "20261010b",
    // three.js r140 vendor trong games/toc-do/vendor, không bước build. Dựng lại Zing Speed Mobile 1.55.0.27413 (VNG, bản Việt
    // của QQ Speed Mobile) theo yêu cầu của chủ dự án ngày 2026-10-09, từ XAPK tải về ~/zingspeed-ref (ngoài git, 13.769 bundle
    // Unity 2019.4 không mã hoá). Đường đua (scene + lightmap), dữ liệu checkpoint và đường chuẩn của người chơi giỏi, xe kart,
    // tay đua kèm hoạt ảnh, tham số vật lý (carparams), VFX (ParticleSystem gốc), HUD NGUI và tiếng đều bóc bằng
    // games/toc-do/tools/*.py. Bank tiếng xe gốc không có trong APK nên tiếng máy và lốp rít là tổng hợp WebAudio.
    // Hợp đồng dữ liệu: games/toc-do/README.md. Kế hoạch: brain/plans/toc-do.md.
    // Muốn gỡ: xoá games/toc-do/art, games/toc-do/audio và data/*.js sinh ra.
    //
    // Kiểm: node test/toc-do-sim.js, node test/toc-do-assets.js (Node); node test/toc-do-ui.js (TD_URL để chạy trên Pages).
    status: "available",
    tags: ["Đua xe", "Drift", "Kart", "Phun nitro", "Bot", "3D", "Màn ngang"]
  },
  {
    id: "casual-farm",
    title: "My Mini Mart",
    tagline: "Trồng rau, nuôi gà bò, xếp kệ, đứng quầy, thuê nhân viên rồi lái xe van mở 14 siêu thị.",
    desc: "Làm lại My Mini Mart (Kiseki Games / Supersonic) từ bản Android 1.89.5, chạy thẳng trên web: mỗi lần chỉ nạp khoảng 4 MB thay vì 150 MB, vào là thấy cửa hàng, hình mờ rồi rõ dần. Đủ 14 siêu thị nối nhau bằng xe van, từ Grocer Mart tới Campsite Mart: luống rau, chuồng gà bò, máy xay, lò, máy làm burger, xe tải chở bột, xếp kệ, thu tiền, thuê và nâng cấp nhân viên, nâng cấp máy, đuổi bắt kẻ trộm, giao hàng cho khách đi xe, booster và tiền thưởng (bấm là nhận, không quảng cáo), bản đồ mart để quay lại mart cũ và thu tiền để không. Có tiếng và nhạc gốc, camera lia tới đồ vừa mở, hướng dẫn từng bước như bản gốc. Kéo để đi, lưu trong trình duyệt. Bản Unity cũ vẫn mở được ở unity.html.",
    genre: "thu-gian",
    accent: "#8bd450",
    en: { title: "My Mini Mart", tagline: "Grow produce, raise chickens and cows, stock shelves, run the till, hire staff and drive the van through 14 marts.", desc: "My Mini Mart (Kiseki Games / Supersonic) remade from the Android 1.89.5 release to run straight in the browser: about 4 MB per load instead of 150 MB, the store shows at once and sharpens as it loads. All 14 marts, linked by the van, from Grocer Mart to Campsite Mart: crop beds, chicken and cow pens, blenders, ovens, the burger maker, the flour truck, shelves, the till, hiring and upgrading staff, machine upgrades, chasing the thief, filling car orders, boosters and bonus cash (free, no ads), and a mart map to go back and collect idle income. Original sounds and music, the camera pans to what you unlock, and the original step-by-step tutorial. Drag to walk, saved in the browser. The old Unity build is still at unity.html." },
    thumbnail: "assets/thumbnails/casual-farm.png",
    path: "games/casual-farm/index.html",
    rev: "20261029c",
    // three.js r160 vendor, no build step; all 14 marts of RC_MartOrder rebuilt from the APK (D:/minimart-ref) by
    // games/casual-farm/tools (export_marts.py, export_audio.py). Bump rev with: node games/casual-farm/tools/stamp.js <rev>.
    // Kiểm: node test/casual-farm-play.js (MM_URL=<Pages>), MM_STORE=storeN node test/casual-farm-sim.js.
    // The old 150 MB Unity build stays in its own Pages repo (poke5121999-art/my-mini-mart-web), opened by unity.html.
    status: "available",
    tags: ["Nông trại", "Quản lý", "Màn dọc"]
  },
  {
    id: "cho-viet",
    title: "Chợ Việt",
    tagline: "Tạp hóa chợ quê: trồng cà chua, nuôi gà bò, bày hàng, tính tiền cho khách đội nón lá.",
    desc: "Một tiệm tạp hóa chợ quê Việt Nam chạy trên bộ máy của My Mini Mart. Hái cà chua, cho gà ăn nhặt trứng, gặt lúa, xay bột, nướng bánh mì, vắt sữa bò, xay tương cà; bày hàng lên kệ, đứng quầy tính tiền, thuê nhân viên, đuổi trộm, giao đơn cho khách đi xe. Khách và nhân viên mặc đồ Việt: nón lá, áo dài, áo bà ba, mũ bảo hiểm, khăn rằn; ngoài sân có dừa, tre, chòi, sạp chợ, trâu gặm cỏ, cờ đỏ sao vàng và bảng TẠP HÓA CHỢ VIỆT. Chữ trong game là tiếng Việt. Một chợ, chơi một mình, lưu riêng (không đụng bản lưu My Mini Mart). Kéo để đi.",
    genre: "thu-gian",
    accent: "#da251d",
    en: { title: "Cho Viet", tagline: "A Vietnamese village grocery: grow tomatoes, raise chickens and cows, stock shelves, serve customers in conical hats.", desc: "A Vietnamese village market shop running on the My Mini Mart engine. Pick tomatoes, feed the chickens for eggs, harvest rice, mill flour, bake bánh mì, milk the cow, blend tomato sauce; stock the shelves, run the till, hire staff, chase the thief, fill car orders. Customers and staff wear Vietnamese clothes (nón lá, áo dài, áo bà ba, helmets, khăn rằn); the yard has coconut palms, bamboo, a hut, market stalls, a grazing buffalo, flags and a TẠP HÓA CHỢ VIỆT sign. In Vietnamese. One market, single player, its own save (My Mini Mart's save is untouched). Drag to walk." },
    thumbnail: "assets/thumbnails/cho-viet.png",
    path: "games/cho-viet/index.html",
    rev: "20261029c",
    // My Mini Mart's engine (games/casual-farm/js) with window.MM_THEME from games/cho-viet/js/theme.js: Store 1's
    // scene and progression, Vietnamese names, clothes and props. Stamped with the engine's rev by
    // node games/casual-farm/tools/stamp.js <rev>. Kiểm: node test/cho-viet-play.js (MM_URL=<Pages>).
    status: "available",
    tags: ["Việt Nam", "Quản lý", "Màn dọc"]
  },
  {
    id: "lumber-inc",
    title: "Lumber Inc",
    tagline: "Chặt cây, bóc vỏ, cắt gỗ vuông rồi bán cho xe tải để mở rộng xưởng gỗ.",
    desc: "Làm lại Lumber Inc (Seikami) từ bản Android 0.6.5, chạy thẳng trên web bằng asset gốc. Có hướng dẫn tân thủ theo bản gốc: nhặt vốn, mở máy bóc vỏ và cổng rừng, chặt cây, mang gỗ vào máy lấy tiền, cắt gỗ vuông rồi bán cho xe tải. Thuê thợ chặt và thợ khuân, nâng ba lô và tốc độ, nâng sao máy để đổi sang máy xịn. Đổ xăng cho máy chạy nhanh, thuê xe máy và UAV, nhận đơn hàng đặc biệt, thuê thợ siêu cấp. Xe tải chở gỗ vuông về kho xây dựng; xây 23 ngôi nhà của thị trấn, chọn cư dân để tăng doanh thu, tốc độ máy và tốc độ thợ. Lên cấp 15 thì mở map 2 Window to World, rồi map 3 Sunny Island, mỗi map có tiền riêng. Điện thoại có điểm danh 8 ngày, máy gacha ra mảnh skin, nhiệm vụ ngày, thành tựu, cửa hàng và chat với cư dân (kết thúc tốt cho ảnh vào album, đủ album thì tăng thu nhập). Hộp quảng cáo rơi trên map cho tiền, xăng hoặc buff; vắng 5 phút trở lên thì nhận tiền offline. Kéo để đi, lưu trong trình duyệt.",
    genre: "thu-gian",
    accent: "#c2853a",
    en: { title: "Lumber Inc", tagline: "Chop trees, debark and square the logs, then sell to the trucks to grow your sawmill.", desc: "Lumber Inc (Seikami) remade from the Android 0.6.5 release, running straight in the browser on the original assets. The original tutorial walks you through grabbing the startup cash, unlocking the peeler and the forest, chopping, feeding the machines and selling squares to the trucks. Hire lumberjacks and porters, upgrade your pack and speed, star up machines into senior ones, fuel machines with gas, rent the motorbike and the drone, fill special orders and hire super workers. Trucks also bring squares to the build store: build the 23 houses of the town and pick residents that boost revenue, machine speed and worker speed. Level 15 opens map 2, Window to World, then map 3, Sunny Island, each with its own coin. The phone holds an 8-day sign-in, a gacha machine for skin pieces, daily tasks, achievements, a shop and chats with residents (good endings add photos; full albums raise income). Ad boxes drop coins, gas or buffs on the map, and time away pays offline income. Drag to walk, saved in the browser." },
    thumbnail: "assets/thumbnails/lumber-inc.png",
    path: "games/lumber-inc/index.html",
    rev: "20261101a",
    // three.js r160 vendor, no build step; map 1 rebuilt from the APK (D:/lumber-ref) by games/lumber-inc/tools.
    // Bump rev with: node games/lumber-inc/tools/stamp.js <rev>. Kiểm: node test/lumber-inc-sim.js, test/lumber-inc-play.js.
    status: "available",
    tags: ["Quản lý", "Nhàn rỗi", "Màn dọc"]
  },
  {
    id: "mini-mart-coop",
    title: "My Mini Mart Together",
    tagline: "My Mini Mart chơi chung tới 4 người: cùng trồng, xếp kệ, đứng quầy, chung một túi tiền.",
    desc: "Bản co-op của My Mini Mart, nối qua Unity Relay. Menu như Supermarket Together: mở cửa hàng mới (đặt tên, riêng tư hoặc công khai, độ khó, chọn vùng máy chủ trên bản đồ, chọn 1 trong 14 mart), tải cửa hàng đã lưu, hoặc vào cửa hàng của bạn bè từ danh sách phòng hay bằng mã 6 chữ. Mỗi người tự đi, tự mang hàng, mặc đồ và dắt thú cưng riêng; tiền, ô mua, máy và nhân viên là của chung, ai cũng bắt được trộm. Cả phòng lái xe van qua 14 mart (thêm 6 mart theo mùa), chủ phòng có bản đồ mart, tiền lúc vắng, prestige, shop và vòng quay. Lưu theo tài khoản hub, rớt mạng tự nối lại. Menu hiện ngay, cửa hàng tải sau và rõ dần. Bản chơi một mình vẫn ở My Mini Mart.",
    genre: "thu-gian",
    accent: "#8b5cf6",
    en: { title: "My Mini Mart Together", tagline: "My Mini Mart for up to 4 players: farm, stock shelves and run the till together, one shared wallet.", desc: "The co-op version of My Mini Mart, connected through Unity Relay. A Supermarket Together style menu: open a new store (name it, private or public, difficulty, pick the server region on the world map, pick one of 14 marts), load a saved store, or join a friend's store from the room list or with a 6-letter code. Everyone walks, carries, dresses up and walks a pet of their own; cash, pads, machines and staff are shared, and anyone can catch the thief. The whole room drives the van through 14 marts (plus 6 seasonal ones), and the host gets the mart map, idle income, prestige, the shop and the daily spin. Saved to your hub account, and a dropped player reconnects. The menu shows at once, the store loads behind it and sharpens. The solo game is still My Mini Mart." },
    thumbnail: "assets/thumbnails/mini-mart-coop.png",
    path: "games/mini-mart-coop/index.html",
    rev: "20261029a",
    // Co-op on top of the solo game (games/casual-farm, imported as is, not copied). Unity Relay + Lobby over plain
    // REST/WebSocket (games/mini-mart-coop/js/net), same UGS project as D:/REPO_Meta (Boo Haul). Bump rev with:
    // node games/mini-mart-coop/tools/stamp.js <rev>. Kiểm: test/mini-mart-coop-{relay,sim,play}.js (MMC_URL=<Pages>).
    status: "available",
    tags: ["Nông trại", "Quản lý", "Chơi chung"]
  },
  {
    id: "world-of-slime",
    title: "Thế Giới Slime",
    tagline: "Tỉnh dậy ở làng chài Larus cùng slime đồng hành, đánh và thuần phục slime hoang.",
    desc: "Làm lại bản demo World of Slime trên web. Tạo nhân vật, chọn ba lô có slime đầu tiên, làm nhiệm vụ cho dân làng Larus. Ra rừng Shadow Forest, slime của bạn tự đánh slime hoang. Đánh yếu rồi ném Cube để thuần phục, xếp đội tới 6 con. Có bản PC và bản mobile.",
    genre: "nhap-vai",
    accent: "#38bdf8",
    en: { title: "World of Slime", tagline: "Wake up in the fishing village of Larus with a partner slime, fight and tame wild ones.", desc: "The World of Slime demo remade for the web. Create your character, pick the backpack with your first slime and help the villagers of Larus. Out in Shadow Forest your slime fights wild slimes on its own. Wear them down, throw a Cube to tame them and build a team of up to six. PC and mobile versions." },
    thumbnail: "assets/thumbnails/world-of-slime.png",
    path: "games/world-of-slime/index.html",
    rev: "20261022f",
    // three.js r160 vendor trong games/world-of-slime/vendor, không bước build. Dựng lại World of Slime Demo (TEAM42,
    // Steam appid 4793900) theo yêu cầu của chủ dự án ngày 2026-10-21, từ bản cài trên máy (Unity IL2CPP, Addressables).
    // Asset (477 MB GLB/webp/ogg) ở repo Pages riêng poke5121999-art/world-of-slime-assets, sinh bằng
    // games/world-of-slime/tools/. Bản mobile: games/world-of-slime/mobile.html (cần ảo, chạm).
    // Game gốc là MMO: số liệu và bản đồ do server gửi. Ba bản đồ Larus (quán trọ 257, làng 110, kho 478) và 10 bảng
    // meta là dữ liệu thật lấy từ đệm của game khi chơi thử 2026-10-21. Rừng Shadow Forest Entrance và sân đấu Rudga
    // DỰNG THEO CLIP (DcGavHFwqtk) bằng mảnh gốc, có nhãn trên màn. Chuỗi nhiệm vụ 1-14 chép thoại từ clip
    // (games/world-of-slime/docs/research/QUESTLINE.md). Số không có trong client gom ở js/combat/rules.js, nhãn [ĐỀ XUẤT].
    // Chơi đơn: không PvP, không chat. Kiến trúc + bẫy: games/world-of-slime/ARCH.md.
    // Kiểm: test/world-of-slime-{intro,quest,quest2,combat,tame,larus,mobile,hud,slice}.js (WOS_BASE=<url game> WOS_ASSETS=).
    status: "available",
    tags: ["Nhập vai", "Bắt quái", "Nhìn từ trên xuống"]
  },
  {
    id: "restaurant-city",
    title: "Restaurant City",
    tagline: "Quán ăn Playfish 2009 chơi online: nấu, bày quán, thuê bạn hub làm nhân viên.",
    desc: "Bản Flash gốc chạy bằng Ruffle, lưu online theo tài khoản hub. Mở quán, xếp bàn ghế, trồng rau, học món mới, thuê người chơi khác làm bồi bàn và đầu bếp. Ghé quán nhau, gửi thư, tặng quà và đổi nguyên liệu với người thật. Cần đăng nhập để chơi.",
    genre: "thu-gian",
    accent: "#f2a516",
    en: { title: "Restaurant City", tagline: "Playfish's 2009 restaurant game, online: cook, decorate, hire hub players as staff.", desc: "The original Flash game running in Ruffle, saved online to your hub account. Open a restaurant, lay out tables, grow ingredients, learn dishes and hire other players as waiters and chefs. Visit each other, send mail and gifts, and trade ingredients with real people. Sign-in required." },
    thumbnail: "assets/thumbnails/restaurant-city.png",
    path: "games/restaurant-city/index.html",
    rev: "20261027f",
    // game.swf build lại từ AS3 decompile của Dippys/Restaurant-City-client (gỡ khoá tên miền + nút Discord của
    // RC Reborn: games/restaurant-city/tools/patches). Server là mã gốc Dippys/Restaurant-City-Server chạy trong Edge
    // Function rc-rpc trên Postgres của hub (schema rc): supabase/functions/rc-rpc/README.md.
    // Kiểm: node test/restaurant-city-rpc.js (RPC thật, 2 bot gửi thư cho nhau) và node test/restaurant-city-play.js (RC_URL=<gốc hub>).
    status: "available",
    tags: ["Quản lý", "Online", "Flash"]
  },
  {
    id: "stickman-hook",
    title: "Stickman Hook",
    tagline: "Giữ để móc dây, thả ra để bay. Đu qua từng màn tới vạch caro.",
    desc: "Làm lại Stickman Hook (Madbox) từ bản Android 9.9.60, chạy thẳng trên web: nạp khoảng 250 KB thay vì 848 MB. Đủ 64 màn gốc, từ màn 65 ghép ngẫu nhiên như bản gốc nên chơi không hết. Dây lò xo, bumper nảy và cú về đích theo mã gốc. Giữ chuột, chạm hoặc giữ Space để móc, thả ra để bay.",
    genre: "hanh-dong",
    accent: "#ff4d4d",
    en: { title: "Stickman Hook", tagline: "Hold to hook, let go to fly. Swing through every level to the checkered line.", desc: "Stickman Hook (Madbox) remade from the Android 9.9.60 release to run straight in the browser: about 250 KB instead of 848 MB. All 64 original levels, then endless levels from 65 on, stitched at random exactly like the original. Spring rope, bouncy bumpers and the finish follow the original code. Hold the mouse, touch or hold Space to hook, let go to fly." },
    thumbnail: "assets/thumbnails/stickman-hook.png",
    path: "games/stickman-hook/index.html",
    rev: "20261028p",
    // Canvas 2D, không engine. Màn, hình, font, tiếng bóc từ APK Android 9.9.60 (D:/stickman-hook-ref); luật đọc từ
    // libil2cpp ARMv7 dịch ngược (games/stickman-hook/docs/GAMEPLAY.md). Dựng dữ liệu: games/stickman-hook/tools.
    // Kiểm: node test/stickman-hook-sim.js (bot qua 64 màn + 30 màn ngẫu nhiên) và node test/stickman-hook-play.js (SH_URL=<Pages>).
    status: "available",
    tags: ["Hành động", "Một ngón", "Màn dọc"]
  },
  {
    id: "petshop",
    title: "Pet Shop",
    tagline: "Mở tiệm thú cưng: nhập hàng, xếp kệ, đặt giá rồi tự đứng quầy quét mã, thối tiền cho khách.",
    desc: "Mô phỏng tiệm thú cưng 3D chạy thẳng trên web. Đặt hàng trên laptop, chờ giao, bê thùng lên kệ, đặt giá so với giá thị trường, mở cửa đón khách, quét từng món ở quầy, thối tiền mặt hoặc quẹt thẻ, cuối ngày xem báo cáo lãi lỗ (trừ 5% thuế) rồi lên cấp mở thêm license và khu vực. Thú cưng (mèo Xiêm, Husky) bán từ chuồng. Luật và giá lấy từ dữ liệu game gốc. Bàn phím hoặc kéo để đi, nhắm + E để tương tác, lưu trong trình duyệt.",
    genre: "thu-gian",
    accent: "#8a63d2",
    en: { title: "Pet Shop", tagline: "Run a pet store: order stock, fill shelves, set prices and work the till — scan and give change.", desc: "A 3D pet-shop sim straight in the browser. Order on the laptop, wait for delivery, carry boxes to shelves, price against the market, open for customers, scan each item at the till, give cash change or take card, and read the profit report (minus 5% tax) at closing, then level up to unlock licenses and new sections. Pets (Siamese, Husky) sell from the cage. Rules and prices from the original game's data. Keys or drag to walk, aim + E to interact, saved in the browser." },
    thumbnail: "assets/thumbnails/petshop.png",
    path: "games/petshop/index.html",
    rev: "20261113a",
    status: "available",
    tags: ["Thư giãn", "Mô phỏng", "Quản lý"]
  },
  {
    id: "dragon-storm",
    title: "Dragon Storm",
    tagline: "Hiệp sĩ thủ làng: chạm để chém, né và tung chiêu chặn quái tràn vào từng màn.",
    desc: "Làm lại Dragon Storm (com.spcomes.dstorm) - action RPG thủ làng - chạy thẳng trên web bằng Canvas 2D, không engine. Hiệp sĩ dựng từ art gốc trong APK: thân giáp theo cấp nâng cấp chồng lớp kiếm, đòn chém khớp clip gốc. Có bản đồ thế giới chọn màn, màn chuẩn bị nâng cấp kiếm và giáp bằng vàng kiếm được trong trận (giá lấy đúng từ game gốc), và cửa hàng. Chơi được Stage 1-2: ra trận, chém quái, né, dùng chiêu, thắng thua; nâng cấp đổi cả tạo hình lẫn chỉ số. Tiến trình lưu trong trình duyệt. Còn thiếu: số cân bằng combat là tạm, boss và các màn sau đang dựng.",
    genre: "hanh-dong",
    accent: "#d9532b",
    en: { title: "Dragon Storm", tagline: "A knight defends the village: tap to slash, dodge and cast to stop each wave of monsters.", desc: "Dragon Storm (com.spcomes.dstorm), a lane-defense action RPG, remade in plain Canvas 2D on the web, no engine. The knight is built from the original APK art: an armor body per upgrade tier with the sword layered on top, the slash matched to the source clip. It has a world map to pick stages, a stage-prep panel that upgrades the sword and armor with gold earned in battle (prices taken from the original game), and a shop. Stage 1-2 are playable: enter a stage, slash, dodge, cast, win or lose, and upgrades change the knight look and stats. Progress saves in the browser. Not yet built: combat balance numbers are placeholders, and the boss and later stages are in progress." },
    thumbnail: "assets/thumbnails/dragon-storm.png",
    path: "games/dragon-storm/index.html",
    rev: "20261104h",
    status: "available",
    tags: ["Hành động", "Nhập vai", "Thủ làng"]
  },
  {
    id: "food-gang",
    title: "Food Gang",
    tagline: "Đội đồ ăn đấu súng: chạy, nhảy, bắn nhau trên bếp, bàn ăn và kho bếp.",
    desc: "Làm lại Food Gang (Bloop) từ bản Android 2.2.4, chạy thẳng trên web bằng JS, không cần Unity: vào trận chỉ tải khoảng 5 MB. Map, nhân vật, hoạt ảnh, hiệu ứng và HUD dựng lại từ dữ liệu gốc; luật trận, sát thương, bot và phần thưởng theo mã gốc dịch ngược. Đánh với bot ở 3 map và 5 kiểu đấu (đội 2v2, tay đôi, hạ 5 mạng, người sống cuối, diệt boss). Phím A/D hoặc mũi tên để chạy, W/Space nhảy, J bắn, K tung chiêu; điện thoại dùng cần và nút trên màn.",
    genre: "hanh-dong",
    accent: "#2ec4e6",
    en: { title: "Food Gang", tagline: "Food fighters shoot it out: run, jump and blast across the kitchen, the dining table and the pantry.", desc: "Food Gang (Bloop) remade from the Android 2.2.4 release in plain JS, no Unity: about 5 MB to the first match. Maps, characters, animations, effects and HUD rebuilt from the original data; match rules, damage, bots and rewards follow the decompiled original code. Fight bots on 3 maps in 5 modes (2v2 team, 1v1, first to 5 kills, last survivor, kill the boss). A/D or arrows to run, W/Space to jump, J to shoot, K for the special; on phones use the on-screen stick and buttons." },
    thumbnail: "assets/thumbnails/food-gang.png",
    path: "games/food-gang/index.html",
    rev: "20261103a",
    // JS + WebGL2, không engine ngoài. Scene/prefab/anim/particle/UI xuất từ project AssetRipper D:/foodgang-ref/fg-unity bằng
    // games/food-gang/tools/export_unity.py, runtime ở js/engine. Lõi trận js/sim và meta js/meta là bản port khớp từng bit/byte
    // với lõi C# (D:/foodgang-ref/fg-unity/Assets/FG). Plan: brain/plans/food-gang.md.
    // Kiểm: node test/food-gang-sim.js, node test/food-gang-meta.js, node test/food-gang-render.js, node test/food-gang-play.js (FG_URL=<Pages>).
    status: "available",
    tags: ["Hành động", "Bắn súng", "Màn ngang"]
  },
  {
    id: "fish-bowl",
    title: "Cá Vàng Trong Bể",
    tagline: "Làm chú cá vàng trong bể: dọn rêu, giành thức ăn, nhảy khỏi bể rồi tìm đường về.",
    desc: "Làm lại Aquarium Land: My Fish Bowl 3D từ bản Android 1.10 bằng asset gốc. Cậu chủ Timmy đi vắng: kéo rêu khỏi máy bơm, đuổi máy cho ăn, canh mũi tên nhảy khỏi bể tới hũ thức ăn, giãy trên sàn về bể trước khi cạn sức, rồi vẽ hình làm quen cô cá mới. Năm màn có phim cắt cảnh, lưu trong trình duyệt.",
    genre: "thu-gian",
    accent: "#f59e0b",
    en: { title: "Fish Bowl", tagline: "Be the goldfish: clear the moss, chase the food, leap out and find your way back.", desc: "Aquarium Land: My Fish Bowl 3D remade from the Android 1.10 release with its original assets. Timmy is away: pull moss out of the air pump, chase the feeder, leap out of the tank on the arrow's cue to the food jar, flop back to the tank before your strength runs out, then draw shapes to win over a new friend. Five levels with cutscenes." },
    thumbnail: "assets/thumbnails/fish-bowl.png",
    path: "games/fish-bowl/index.html",
    rev: "20261031c",
    // three.js r160 vendor, no build step; scene, timelines, cameras and gameplay data exported from the APK (D:/fishlife-ref) by
    // games/fish-bowl/tools (README). Bump rev with: node games/fish-bowl/tools/stamp.js <rev>. Kiểm: node test/fish-bowl-play.js <1..5>.
    status: "available",
    tags: ["Mô phỏng", "Khám phá", "Màn ngang"]
  },
  {
    id: "battle-cats",
    title: "The Battle Cats",
    tagline: "Thả mèo tràn qua sân phá căn cứ địch; nuôi ví tiền để tung quân mạnh dần.",
    desc: "Làm lại The Battle Cats (bản EN 15.7) bằng JS thuần, không Unity, dùng sprite và số liệu gốc bóc từ APK. Thả mèo từ căn cứ tràn qua sân phá tháp địch; tiền tự hồi và rơi ra từ quái bị diệt. Sưu tầm 60 mèo qua gacha, nâng cấp từng con và Cat Base, chơi 24 màn ba chương có trùm. Có Cat Cannon và Worker như bản gốc.",
    genre: "chien-thuat",
    accent: "#ff8c1a",
    en: { title: "The Battle Cats", tagline: "Send cats swarming across the field to smash the enemy base; grow your wallet to field stronger units.", desc: "The Battle Cats (EN 15.7) remade in plain JS, no Unity, using original sprites and stats ripped from the APK. Send cats from your base across the field to break the enemy tower; money regenerates and drops from slain foes. Collect 60 cats via gacha, level each one and the Cat Base, clear 24 stages across three chapters with bosses. Cat Cannon and Worker as in the original." },
    thumbnail: "assets/thumbnails/battle-cats.png",
    path: "games/battle-cats/index.html",
    rev: "20261102a",
    // JS thuan (khong Unity WebGL), solo. Sprite + so lieu goc boc tu APK EN 15.7 o D:/battlecats-ref (DECODE.md).
    // Engine: js/sim.js (lane battle 30fps), js/sprite.js (mamodel+maanim), js/render.js, js/save.js (localStorage).
    // Noi dung: tools/export_data.py + rebalance -> data/{cats,enemies,stages,roster}.json. Plan: brain/plans/battle-cats.md.
    // Kiem: node games/battle-cats/test/sim-smoke.js ; node games/battle-cats/test/flow-shot.js (BC_URL=<Pages>).
    status: "available",
    tags: ["Chiến thuật", "Thủ thành", "Sưu tầm"]
  },
  {
    id: "farmland",
    title: "Farm Land",
    tagline: "Đi khắp nông trại: trồng trọt, nuôi thú, thuê thợ, mở khoá đất rồi bay sang đảo mới.",
    desc: "Làm lại Farm Land (LolTap) từ bản Android 3.28.12, chạy thẳng trên web bằng asset gốc. Đi bộ quanh nông trại: gieo hạt và tưới nước cho ruộng, nuôi bò, cừu và gà, chặt cây, mang nông sản bán cho thương lái lấy xu. Dùng xu mở khoá từng ô đất để mở rộng, thuê thợ cho kho và ruộng, nâng ba lô. Qua cầu ra bến thủy phi cơ bay sang các đảo mới: Nhật Bản, Savana và Mùa Đông, mỗi đảo một bảng màu và loại tiền riêng. Lưu lên tài khoản hub để chơi tiếp trên máy khác. Có thú cưng (mèo, chó) đi theo, xe đạp tăng tốc, heo đất, kim cương và máy gacha mở 33 skin; thú vật có hoạt ảnh riêng. Kéo để đi, màn dọc cho điện thoại.",
    genre: "thu-gian",
    accent: "#7cb342",
    en: { title: "Farm Land", tagline: "Walk your farm: plant, raise animals, hire workers, unlock land and fly to new islands.", desc: "Farm Land (LolTap) remade from the Android 3.28.12 release, running straight in the browser on the original assets. Walk around the farm: seed and water the fields, raise cows, sheep and chickens, chop trees, and sell crops to the merchant for coins. Spend coins to unlock parcels and expand, hire workers for the barn and fields, and upgrade your pack. Cross the bridge to the seaplane and fly to new islands, Japan, Savana and Winter, each with its own palette and currency. Saved to your hub account to continue on another device. Drag to walk, portrait for phones. Pets that follow you, a speed bike, a piggy bank, diamonds and a 33-skin gacha, with animals on their own clips." },
    thumbnail: "assets/thumbnails/farmland.png",
    path: "games/farmland/index.html",
    rev: "20261101f",
    // three.js r160 vendor, no build step; rebuilt from the Android XAPK (com.loltap.farmland 3.28.12, Unity 6000.3.9f1
    // IL2CPP) by games/farmland/tools. Humanoid Mecanim clips retargeted offline; cloud save via the hub js/ scripts like
    // casual-farm. Bump rev: node games/farmland/tools/stamp.js <rev>. Kiem: farmland-sim.js, farmland-play.js, farmland-meta.js, farmland-cloud.js.
    status: "available",
    tags: ["Nông trại", "Quản lý", "Màn dọc"]
  },
  {
    id: "burger",
    title: "Burger Please!",
    tagline: "Mở quán burger: nấu, giao khách tại quầy, drive-thru và kiosk, nâng cấp rồi mở rộng.",
    desc: "Làm lại Burger Please! (Supercent) từ bản Android 31.8.0, chạy thẳng trên web bằng asset gốc. Nhặt vốn, mở cửa, nướng burger rồi giao cho khách ở quầy. Mở drive-thru cho xe mua theo hộp, bàn đóng gói gộp burger thành hộp, và kiosk bán mang đi; bong bóng trên đầu khách báo đơn. Thuê nhân viên đứng quầy, đóng gói và thu ngân, nâng sức chứa, tốc độ và giá bán, mở thêm quận để lên sao. Nhận tiền lúc vắng mặt. Đủ 10 màn, mỗi màn có món, giá, quận và mức sao riêng; thêm khách VIP (trả gấp đôi), nhà vệ sinh, robot dọn và phòng skin 10 bộ đồng phục. Màn 1 có hướng dẫn tân thủ. Kéo để đi, màn dọc cho điện thoại.",
    genre: "thu-gian",
    accent: "#e8a33d",
    en: { title: "Burger Please!", tagline: "Run a burger shop: cook, serve at the counter, drive-thru and kiosk, upgrade and expand.", desc: "Burger Please! (Supercent) remade from the Android 31.8.0 release, running straight in the browser on the original assets. Grab the startup cash, open up, grill burgers and hand them to customers at the counter. Open a drive-thru for cars buying boxes, a package table that bundles burgers into boxes, and a take-away kiosk; balloons over each head show the order. Hire counter, packer and cashier staff, upgrade capacity, speed and price, and open new districts to earn stars. Collect idle income while away. Follows the original tutorial. Drag to walk, portrait for phones. All 10 campaign stages are in, each with its own foods, prices, districts and stars, plus VIP customers, a restroom, cleaner robots and a skin room." },
    thumbnail: "assets/thumbnails/burger.png",
    path: "games/burger/index.html",
    rev: "20261101d",
    // three.js vendor, no build step; rebuilt from the Android XAPK (io.supercent.burgeridle 31.8.0, Unity 2022.3.62f3
    // IL2CPP) by games/burger/tools, rules from the Ghidra decompile. Bump rev: node games/burger/tools/stamp.js <rev>.
    // Kiem: burger-sim.js, burger-stages.js, burger-play.js. Stage 1-10 + VIP/restroom/cleaner/skin xong.
    status: "available",
    tags: ["Quản lý", "Nhàn rỗi", "Màn dọc"]
  },
  {
    id: "cats-soup",
    title: "Mèo & Súp",
    tagline: "Mèo nấu súp giữa rừng: xây bếp, thái rau, nghỉ ngơi, bán món và mở rộng khu rừng.",
    desc: "Làm lại Cats&Soup (HIDEA) từ bản Android 5.3.0, chạy thẳng trên web bằng asset gốc và chữ tiếng Việt của bản gốc. Mỗi cơ sở xây xong có một chú mèo mới: mèo nấu súp, nước ép, món xào; mèo thái nguyên liệu mang tới nồi rồi ghé chỗ nghỉ để ra điểm công thức. Bán món, nâng cấp (giữ nút để nâng liên tục), học công thức, mở rộng rừng qua 9 cấp, có hướng dẫn cho người mới. Rương kho báu, hũ phúc, khinh khí cầu, máy gắp, voi bán hàng, bóng rổ, máy nhạc, đơn đặc biệt; câu cá, bể cá; nhiệm vụ, điểm danh; mèo với tim, kỹ năng, quà; trang phục trên mèo 3D; tháp mèo; nội thất và phòng mèo; bộ sưu tập, sách tranh, kho; skin cơ sở, 19 chủ đề, đèn lồng; mèo con đi dạo trong rừng và du lịch; kính viễn vọng, đài quan sát; minigame bắt bướm, đập chuột chũi, Cooking Lab, bảng nam châm; sự kiện theo tháng, súp pass; hồ sơ và chụp ảnh; khách ghé thăm, ếch hoàng tử, khối trang trí; dời trạm; ngày và đêm; hiệu ứng hạt của bản gốc; cửa hàng gem (quảng cáo bấm là nhận). Lưu theo tài khoản hub.",
    genre: "thu-gian",
    accent: "#9cc56b",
    en: { title: "Cats & Soup", tagline: "Cats cook soup in the forest: build kitchens, chop vegetables, rest, sell dishes and grow the forest.", desc: "Cats&Soup (HIDEA) remade from the Android 5.3.0 release, running in the browser on the original assets. Every facility brings a new cat: cooks make soup, juice and stir-fry, prep cats chop ingredients and rest to earn recipe points. Sell dishes, upgrade (hold to repeat), learn recipes, grow the forest through 9 sizes, with a tutorial. Treasure chest, lucky jar, balloon, claw machine, elephant trader, basketball, music player, special orders; fishing and aquarium; missions and attendance; cats with hearts, skills, gifts; outfits on the 3D cats; cat tower; furniture and cat rooms; collection, picture book, storage; facility skins, 19 themes, lanterns; kittens roaming the forest and travelling; telescope and observatory; minigames (butterflies, whack-a-mole, Cooking Lab, magnet board); monthly events and soup pass; profile and photo mode; visiting guests, frog prince, deco blocks; moving facilities; day and night; the original particle effects; gem shop (ads pay at once). Saved to the hub account." },
    thumbnail: "assets/thumbnails/cats-soup.png",
    path: "games/cats-soup/index.html",
    rev: "20261102h",
    // three.js r160 vendor, no build step; rebuilt from the XAPK (com.hidea.cat 5.3.0, Unity 6000.0.60f1 IL2CPP ARMv7,
    // D:/catsoup-ref) by games/cats-soup/tools, rules from the Ghidra decompile (D:/catsoup-ref/rules).
    // Bump rev: node games/cats-soup/tools/stamp.js <rev>. Kiem: test/cats-soup-sim.js, test/cats-soup-play.js (CS_URL=<Pages>).
    status: "available",
    tags: ["Nhàn rỗi", "Quản lý", "Màn dọc"]
  },
  {
    id: "snail-ride",
    title: "Snail Ride",
    tagline: "Ốc sên cưỡi cành cây cong vô tận: chạm để lật sang mặt kia, né gai và bọ, gom bong bóng.",
    desc: "Làm lại Snail Ride (Bloop) từ bản Android 1.2, chạy thẳng trên web bằng hình, tiếng và số liệu gốc. Ốc sên bò trên một cành cây uốn lượn không có điểm cuối; chạm màn hình hoặc bấm Space để lật sang mặt bên kia của cành, né gai, bọ rùa, dế, ruồi và ong. Gom bong bóng làm tiền, ăn vỏ ốc thưởng thì lao nhanh gấp bốn trong 8 giây và húc vỡ mọi chướng ngại để cộng combo. Có một lớp khiên đỡ một cú chạm, trời đổi màu và đổ mưa theo lượt chơi. Hết lượt nhận quà theo giờ, bỏ 500 bong bóng chơi máy gắp thú để mở skin ốc mới; có 48 skin, nhiệm vụ và 10 ngôn ngữ. Nút xem quảng cáo bấm là nhận. Có tạm dừng đếm ngược, độ khó tăng dần, cài đặt nhạc và tiếng; lưu trong trình duyệt.",
    genre: "hanh-dong",
    accent: "#7bbf3a",
    en: { title: "Snail Ride", tagline: "A snail rides an endless winding vine: tap to flip to the other side, dodge spikes and bugs, grab bubbles.", desc: "Snail Ride (Bloop) remade from the Android 1.2 release, running in the browser on the original art, sound and numbers. The snail crawls along a vine that winds forever; tap or press Space to flip to the other side, dodging spikes, ladybugs, crickets, flies and bees. Bubbles are your currency, and the bonus shell sends you four times faster for 8 seconds, smashing every obstacle for combo points. One shield absorbs a hit, and the sky changes colour and turns to rain as you play. After a run, collect timed gifts and spend 500 bubbles on the claw machine to win new snail skins; there are 48 skins, missions and 10 languages. Ad buttons grant the reward instantly. Pause with a countdown, difficulty that ramps up, music and sound settings; saved in the browser." },
    thumbnail: "assets/thumbnails/snail-ride.png",
    path: "games/snail-ride/index.html",
    rev: "20261102c",
    // three.js r160 vendor + DOM UI, no build step; rebuilt from the APK (com.bloop.snail 1.2, Unity 2018.3.7f1 Mono) on the
    // linux box (~/snail-ride-ref, ~/snail-ride-work) by games/snail-ride/tools. Bump rev: python3 games/snail-ride/tools/stamp.py.
    // Kiem: ~/snail-ride-work/test/e2e.mjs on linux.
    status: "available",
    tags: ["Vô tận", "Phản xạ", "Màn dọc"]
  },
  {
    id: "walking-trade-bevy",
    title: "The Walking Trade",
    tagline: "Mở tiệm giữa thời xác sống: nhập hàng, đặt giá, bán lấy pin, đêm xuống thì giữ cửa.",
    desc: "The Walking Trade viết lại bằng Bevy (Rust), chạy WebAssembly ngay trong trình duyệt, dùng hình, tiếng và số liệu của game gốc. Nhìn góc thứ nhất: dọn tiệm bỏ hoang, nhập hàng của thương nhân, bày kệ và đặt giá, mở cửa bán cho khách lấy pin. Thuê người làm, học kỹ năng, chế đồ, xem bản đồ thế giới và ra ngoài lục lọi; đêm có xác sống kéo tới phá cửa. Save lưu trong trình duyệt. Chạy trên máy tính, nên dùng Chrome hoặc Edge; máy không có card đồ hoạ rời hoặc chạy chậm sẽ tự chuyển sang đồ hoạ thấp cho nhẹ; lần đầu tải khoảng 140 MB, có màn hình chờ, mất khoảng 1,5 phút trên mạng nhanh, lần mở sau nhanh hơn. Log lỗi tự gửi về cho người làm game.",
    genre: "chien-thuat",
    accent: "#d9a441",
    en: { title: "The Walking Trade", tagline: "Run a shop in the zombie apocalypse: buy stock, set prices, sell for batteries, hold the door at night.", desc: "The Walking Trade rewritten in Bevy (Rust) and running as WebAssembly in the browser, on the original game's art, sound and numbers. First person: clear out an abandoned shop, buy from the trader, stock the shelves and set prices, then open up and sell for batteries. Hire staff, learn skills, craft, check the world map and go scavenging; at night the dead come for your door. Saves stay in the browser. Runs on a desktop or laptop, best in Chrome or Edge; machines without a dedicated graphics card, or that run slow, switch to low graphics by themselves; the first load is about 140 MB behind a loading screen and takes about a minute and a half on a fast connection, less on the next visit. Error logs are sent to the developers automatically." },
    thumbnail: "assets/thumbnails/walking-trade-bevy.png",
    // Bevy 0.20 build for wasm32 (WebGL2), host ở repo Pages riêng poke5121999-art/twt-bevy-web (408 MB asset).
    // Nguồn: repo twt-bevy trên ssh linux2, nhánh web; dựng lại bằng tools/web/build-web.sh, kiểm bằng
    // TWT_URL=<Pages> TWT_HEADED=1 node tools/web/smoke.cjs (Chrome thật, GPU máy này).
    path: "https://poke5121999-art.github.io/twt-bevy-web/",
    rev: "20261107a",
    status: "available",
    tags: ["Kinh doanh", "Sinh tồn", "Góc nhìn thứ nhất", "Máy tính"]
  }
];
