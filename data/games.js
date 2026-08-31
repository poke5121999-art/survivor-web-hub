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
    id: "dragonproj",
    title: "Săn Rồng",
    tagline: "Dựng lại Dragon Project (COLOPL, đã đóng cửa). Một ngón tay ở giữa màn hình làm hết: kéo để chạy, chạm để chém, vẩy để né, giữ để ra đòn đặc thù, giữ-rồi-trượt-về-nút để xả kỹ năng. Năm vũ khí, mỗi cây hai kỹ năng nặng đô riêng — song dao thì nháy ra sau lưng rồi chém, đại kiếm thì bổ ra một làn chấn khí — nhân sáu hệ nguyên tố lên trên. 38 ải solo, dọn quái rồi hạ Behemoth cuối ải.",
    thumbnail: "assets/thumbnails/dragonproj.svg",
    path: "games/dragonproj/index.html",
    rev: "20260831a",
    // Plain canvas/JS, không engine, mở được từ file://. Dựng lại từ Dragon Project
    // (COLOPL 2016, Global 2017, đóng cửa 30/09/2020) — game săn quái kiểu Monster Hunter
    // cho di động, 1-4 người.
    // KHÔNG dùng một file ảnh/âm thanh nào của game gốc. Cái được lấy là DỮ LIỆU
    // THIẾT KẾ, đọc từ Official Dragon Project Wiki (154 trang, qua api.php), bài
    // 4Gamer 2016-06-20 mô tả bản đồ thao tác ぷにコン, wiki Shironeko Project (game
    // cùng hệ điều khiển, nơi Punicon ra đời), và ảnh chụp HUD trong wiki dùng để dựng
    // lại bố cục. Ghi chép đầy đủ kèm nguồn: games/dragonproj/RESEARCH.md.
    // ART: nhân vật, quái, boss, nền và vật trang trí là SPRITE THẬT lấy từ kho
    // D:\HoloCureAssets (rip từ HoloCure) — chỗ để vẽ đè lên sau. Trước đây mọi thứ vẽ
    // bằng code hình học; đổi vì hình vẽ-bằng-code không ra cảm giác nào cả. Đường ống
    // trong js/atlas.js + _tools/pack.py cố ý giữ một luật: ĐỔI ART = THAY FILE PNG +
    // SỬA assets/asset-map.json, KHÔNG ĐỤNG CODE — trong code không có lấy một tên
    // sprite nào, chỉ có khoá kiểu 'mobs.purun.idle'. Thiếu ảnh thì tự rơi về hình học
    // cũ chứ không vỡ. Danh mục và lý do chọn từng sprite: games/dragonproj/assets/ASSETS.md.
    // VFX vẫn vẽ bằng code (Canvas 2D thuần) — xem games/dragonproj/REMAKE.md.
    // Trọng tâm là PUNICON, hệ điều khiển một-ngón của COLOPL, tái dựng đúng ngữ pháp của
    // nó: kéo = chạy, chạm = đánh, bấm liên tục = combo, vẩy = né, giữ = đòn đặc thù riêng
    // của từng vũ khí, giữ-rồi-trượt-về-nút = dồn rồi xả kỹ năng, và dấu "!!" trên đầu là
    // lời mời bấm tiếp (đánh khi đang lăn, phản đòn sau khi né chuẩn).
    // KỸ NĂNG (js/skills.js): 5 vũ khí × 2 = MƯỜI kỹ năng, và mười cái là mười trình phát
    // riêng biệt — có test khoá lại luật đó, vì bệnh cũ của bản trước đúng là 40 viên Magi
    // dùng chung 3 nhánh code nên xả cái nào cũng thấy y hệt nhau. Nặng đô, không rẻ: dồn
    // lâu (0,8–1,6s, đi chậm còn 35% trong lúc dồn), hồi lâu (12–26s), huỷ giữa chừng thì
    // hoàn 60%. Chồng lên là LỚP NGUYÊN TỐ (6 hệ): lôi kiếm lướt tới để lại vệt điện, chém
    // trúng thì điện nảy sang mục tiêu bên cạnh; hoả thì đốt, thuỷ thì đóng băng trơn
    // trượt, thổ thì hất văng và rung đất, quang thì làm loá, ám thì hút máu.
    // HỆ MAGI ĐÃ XOÁ SẠCH — nó là thứ làm loãng phần vũ khí. Ô Magi, kho Magi, quầy quay
    // Magi và mọi chỉ số phụ thuộc nó đều đi theo.
    // Số liệu CÓ NGUỒN: tỉ lệ gacha (SS 3 / S 15 / A 55 / B 27), tỉ lệ rơi đồ của quái
    // thường và quái elite, thang chỉ số trang bị hạng SS, bảng thưởng nhiệm vụ ngày/tuần,
    // và luật thưởng tối đa 4 Gem mỗi con boss.
    // Máu boss và sát thương từng đòn KHÔNG nguồn nào công bố nên là tái dựng, cân theo
    // thang chỉ số trên.
    // BỐN CHỖ CỐ Ý LỆCH BẢN GỐC (ba chỗ đầu: RESEARCH.md mục 13; chỗ thứ tư: REMAKE.md):
    //   1. Đi ẢI đánh số thay cho map nối map + Quest Gacha ra boss — 38 ải, mỗi ải là
    //      dọn quái rồi Behemoth cuối ải ra ngay tại chỗ. Trùm leo B → A → S → SS.
    //   2. Gacha ra THẲNG trang bị (giữ nguyên tỉ lệ SS 3 / S 15 / A 55 / B 27), bỏ khâu
    //      Tablet + lò rèn. Nguyên liệu để NÂNG CẤP vẫn phải cày trong ải.
    //   3. Quay trúng món đã có thì ra LÕI RỒNG — thứ duy nhất mở được bậc Tiến hoá, và
    //      không rơi ở bất kỳ bảng nào (có test quét toàn bộ bảng rơi để chốt luật này).
    //   4. Kỹ năng gắn vào VŨ KHÍ chứ không phải vào một hệ rune riêng: cây nào lên Lv.8
    //      thì mở kỹ năng thứ hai của chính nó. Chọn vũ khí = chọn lối đánh, không phải
    //      chọn xong rồi còn đi lắp rune.
    // Co-op 1-4 người của bản gốc KHÔNG được dựng lại, và cũng không có NPC đồng đội:
    // vào ải MỘT MÌNH, bù lại có 3 lượt tự đứng dậy.
    // Ships with an in-game bot bắn PointerEvent thật lên canvas — tức là đi qua đúng con
    // đường mà ngón tay người chơi đi qua (js/punicon.js), nên ngưỡng tap/flick/hold sai là
    // bot hỏng ngay. test/dragonproj-suite.js lái nó và kiểm luật.
    status: "available",
    tags: ["Săn quái", "Hành động", "Gacha", "Một ngón", "Solo"]
  },
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
    title: "Ca Trực Đêm: Biệt Đội",
    tagline: "Bản Unity. Một tổ năm người: bạn cầm một xác, bốn xác còn lại do máy điều khiển. Ngoài trận là kho 14 xác, gacha, trang bị và 9 màn mở dần; trong trận vẫn là căn nhà tối và cái chỉ tiêu.",
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
    // Map lớn KHÔNG lặp vô hạn: 9 map, số tầng chạy vòng 3 → 4 → 5 rồi lặp lại từ 3 với quái
    // khoẻ hơn và thêm giống quái mới (Nhện Trần, Quản Ca, Bóng Đen). Hết tầng cuối là phá đảo.
    // Ships with an in-game bot; docs/tests/browser/test_repo_squad.py lái nó qua đúng cử chỉ
    // người chơi (kéo cần gạt, bấm nút kỹ năng, bấm nút trong menu) và kiểm luật — 50 checks,
    // 0 console errors, có một ván phá đảo trọn vẹn map 3 tầng.
    // CHƯA có người thật ngồi chơi lâu.
    status: "available",
    tags: ["Kinh dị", "Gacha", "Biệt đội", "Khuân đồ", "Solo"]
  },
  {
    id: "stardew",
    title: "Quần Đảo Sao Rơi",
    tagline: "Ông ngoại để lại một hòn đảo. Biển quanh đây còn hai mươi bốn hòn nữa — mua từng hòn một, và trong đám cỏ cao trên vài hòn có thứ đang trốn.",
    thumbnail: "assets/thumbnails/stardew.svg",
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
  },
  {
    id: "orbit",
    title: "Quỹ Đạo — Mốc 1",
    tagline: "Bản dựng thử, không phải game. Cùng một dây chuyền, hai cách vận chuyển: bản A nối máy với máy bằng hai cú chạm, bản B là kho chung kiểu Deep Town. Chơi cả hai trong 3 phút rồi so bằng ngón cái.",
    thumbnail: "assets/thumbnails/orbit.svg",
    path: "games/orbit/index.html",
    // 2026-08-31. Dụng cụ đo cho games/orbit/RESEARCH.md muc 9 (Moc 1) - the question is
    // whether a factory graph survives a portrait screen and a single centre joystick once
    // conveyor dragging is removed. Both variants share map seed, recipes, craft times and
    // controls; only the transport layer differs. Not a game, not a build: status stays
    // build-pending so it shows on admin.html and never on the public hub.
    // Checks: node games/orbit/tools/smoke.js
    status: "build-pending",
    tags: ["Dây chuyền", "Dựng thử", "Màn dọc", "Một tay"]
  }
];
