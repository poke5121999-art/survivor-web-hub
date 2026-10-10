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
    id: "dragonproj",
    title: "Săn Rồng",
    tagline: "Săn quái một ngón: kéo để chạy, chạm để bắn, vẩy để né.",
    desc: "Mang ba thợ săn vào ải và đổi qua lại ngay giữa trận. Sáu lớp vũ khí, từ súng săn cận chiến tới cung nạp lực, mỗi lớp mạnh đúng một kiểu. 38 ải, cuối mỗi ải là một con Behemoth. Gacha ra 43 nhân vật.",
    genre: "hanh-dong",
    accent: "#f59e0b",
    en: { title: "Dragon Hunt", tagline: "One-finger monster hunting: drag to run, tap to shoot, flick to dodge.", desc: "Take three hunters into each stage and swap between them mid-fight. Six weapon classes, from close-range shotguns to charged bows, each best at one thing. 38 stages, each ending with a Behemoth. The gacha pulls from 43 characters." },
    thumbnail: "assets/thumbnails/dragonproj.png",
    path: "games/dragonproj/index.html",
    rev: "20260901a",
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
    // Vũ khí trên tay + trong kho đồ là biểu tượng của Sephiria (sephiria.page),
    // tra theo LỚP x HỆ: 5 x 7 = 35 ô, không ô nào trống. Ba số rot/len/grip căn ảnh
    // vào bàn tay nằm trong manifest, không nằm trong code. Lưỡi QUÉT theo cung của
    // đòn đang ra (cùng công thức handAngle mà thân dùng), và vệt chém là một dải
    // vuốt nhọn bám đúng mép dẫn đó — hai thứ đi cùng một nhịp, không còn cảnh lưỡi
    // đứng im trong khi vệt chém quét ngang.
    // Boss tra ảnh theo DÁNG THÂN (21 dáng cho 56 con), hệ nói bằng quầng sáng dưới
    // chân chứ không nhuộm nguyên con.
    // Kho đồ: GIỮ một món rồi KÉO lên khe để lắp. Giữ-rồi-mới-kéo (180ms) là để
    // không giết mất thao tác cuộn danh sách; khe chỉ sáng khi nhận được đúng loại;
    // kéo tới sát mép trên thì khung tự cuộn cho khe trang bị lên tới nơi.
    // VFX vẫn vẽ bằng code (Canvas 2D thuần) — xem games/dragonproj/REMAKE.md.
    // NHÂN VẬT (data/heroes.js): 43 người lấy từ dàn sprite HoloCure. Mỗi người gắn
    // CỨNG một lớp vũ khí — tức gắn cứng một bộ move set và hai kỹ năng — cộng một hệ.
    // Gắn cứng chứ không cho tự chọn, vì nếu ai cũng cầm được mọi thứ thì nhân vật chỉ
    // còn là một bộ chỉ số và một tấm ảnh; gắn cứng thì đội hình ba người mới là một
    // quyết định thật. Mỗi người TỰ GIỮ trang bị của mình (một ô vũ khí đúng lớp + bốn
    // ô giáp) và một món chỉ nằm ở một người. Ba khe đổi-giữa-trận có sẵn từ trước giờ
    // là ba NGƯỜI: đổi khe là đổi ảnh, đổi lớp, đổi kỹ năng, đổi cả thanh máu.
    // Gacha KHÔNG còn quay ra đồ, chỉ quay ra người; trùng người thì thành Lõi Rồng.
    // Hồ sơ cũ (ba khe vũ khí của một người) tự chuyển thành đội hình ba người, chọn
    // theo đúng ba lớp đang dùng — có test khoá lại.
    // 2026-09-01: ĐỔI TỪ CẬN CHIẾN SANG BẮN, và hạ thang sát thương. Lý do đo được
    // chứ không phải cảm tính: quái thường đang chết trong 0,5-1,0 phát suốt cả game
    // (0,60 ở cấp 1 · 1,01 ở cấp 10 · 0,51 ở cấp 40), vì sát thương cộng dồn từ ba
    // nguồn đều lớn trong khi máu quái chỉ là 32+14/cấp. Sau khi sửa: TTK 0,95-2,34
    // giây, đúng dải chuẩn của thể loại, và số phát để giết giữ ổn định theo cấp.
    // Phần lớn việc rescale do TỐC ĐỘ BẮN gánh chứ không phải do chia sát thương:
    // chuỗi combo cũ ra ~2 nhát/giây, súng trường bắn 5 phát/giây.
    // Sáu lớp: rifle (DPS bền) · shotgun (burst cận cảnh, tầm 149px ngắn nhất game) ·
    // sniper (tầm + xuyên hàng) · bow (nạp bốn nấc + DẢI CHÍ MẠNG: đứng đúng tầm thì
    // mỗi mũi đau gấp rưỡi) · staff (năm tia toè quạt, niệm NGẮT ĐƯỢC) · launcher
    // (dọn đám, đạn chậm cố ý, không bao giờ chí mạng).
    // Kèm theo: hệ THẺ ĐÁNH (tối đa 3 con được ra đòn cùng lúc, số còn lại vẫn doạ
    // nhưng không đánh), đạn quái to gấp 2,5 và chậm bằng đúng tốc chạy người chơi,
    // hitstop hạ từ 50-210ms xuống thang 1/10/20/50/100ms, và đạn hiện dần 140ms chưa
    // có hitbox. Ghi chép đầy đủ kèm nguồn: games/dragonproj/SHOOTER.md
    // Trọng tâm vẫn là PUNICON, hệ điều khiển một-ngón của COLOPL: kéo = chạy,
    // chạm = bắn, giữ = ba nghĩa tuỳ lớp (rải / nạp lực / ghì súng), vẩy = né,
    // giữ-rồi-trượt-về-nút = dồn rồi xả kỹ năng.
    // KỸ NĂNG (js/skills.js): 6 lớp × 2 = MƯỜI HAI kỹ năng, và mười hai cái là mười hai
    // trình phát riêng biệt — có test khoá lại luật đó, vì bệnh cũ của bản trước đúng là
    // 40 viên Magi dùng chung 3 nhánh code nên xả cái nào cũng thấy y hệt nhau.
    // Sức mạnh giờ tính theo D×R×T×K (sát thương đòn thường × phát/giây × hồi chiêu ×
    // hệ số) thay vì hệ số 1,8–3,4 cũ — thấp hơn chuẩn thể loại cả chục lần, và đó là
    // lý do không ai buồn bấm kỹ năng. Chồng lên là LỚP NGUYÊN TỐ (6 hệ): lôi kiếm lướt tới để lại vệt điện, chém
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
    tags: ["Bắn súng", "Săn quái", "Gacha", "Một ngón", "Solo"]
  },
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
    id: "mmorpg",
    // WORKING TITLE — the owner has not named this game yet; only the folder name
    // (mmorpg_survivor) is settled. Change `title` here when they do; `id` is the
    // folder under games/ and should stay put.
    title: "Survivor MMO",
    tagline: "Thế giới mở với lối đánh tự bắn của Survivor. Cày bãi quái, về lúc nào tuỳ bạn.",
    desc: "Cùng lối đánh tự bắn của Survivor, nhưng trong một thế giới được lưu lại. Đi dọc hành lang đấu trường, dọn các bãi quái tự hồi sinh theo giờ riêng, cày đủ thì rời đi.",
    genre: "nhap-vai",
    accent: "#818cf8",
    en: { title: "Survivor MMO", tagline: "Survivor's auto-shooter combat in a persistent world. Farm camps, leave anytime.", desc: "The same auto-shooter combat as Survivor, in a world that remembers. Walk up the arena corridor, clear mob camps that respawn on their own timers, and leave once you have farmed enough." },
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
    tags: ["MMORPG", "Tự bắn", "Cày quái"]
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
    path: "games/voiddiver/index.html",
    rev: "20260929b",
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
    id: "orbit",
    title: "Quỹ Đạo — Mốc 1",
    tagline: "Bản dựng thử: so hai cách chở hàng trên cùng một dây chuyền.",
    desc: "Chưa phải game hoàn chỉnh. Bản A nối máy với máy bằng hai cú chạm, bản B dùng kho chung kiểu Deep Town. Chơi cả hai trong 3 phút rồi xem bản nào vừa tay hơn.",
    genre: "khac",
    accent: "#94a3b8",
    en: { title: "Orbit — Milestone 1", tagline: "A prototype comparing two ways to move goods on one production line.", desc: "Not a full game yet. Version A links machine to machine with two taps, version B uses a shared store like Deep Town. Play both for 3 minutes and see which feels better." },
    thumbnail: "assets/thumbnails/orbit.svg",
    path: "games/orbit/index.html",
    // 2026-08-31. Dụng cụ đo cho games/orbit/RESEARCH.md muc 9 (Moc 1) - the question is
    // whether a factory graph survives a portrait screen and a single centre joystick once
    // conveyor dragging is removed. Both variants share map seed, recipes, craft times and
    // controls; only the transport layer differs. It is a measuring tool rather than a
    // finished game — but it runs, so it is available rather than build-pending; the
    // "Dựng thử" tag is what tells a player what they are opening.
    // Checks: node games/orbit/tools/smoke.js
    status: "available",
    tags: ["Dây chuyền", "Dựng thử", "Màn dọc", "Một tay"]
  },
  {
    id: "slimeclash",
    title: "SlimeClash",
    tagline: "Ghép slime trên lưới 6×6, gộp lên cấp và bắn hạ con quái khổng lồ.",
    desc: "Mỗi lượt ba bước kéo quân. Xếp ba con cùng loại cùng cấp thành hàng để gộp lên cấp. Hết bước, cả sân bắn vào quái, rồi quái nện xuống cột nó đã báo trước. Mười ngày một chương, trùm ở ngày 5 và ngày 10.",
    genre: "chien-thuat",
    accent: "#34d399",
    en: { title: "SlimeClash", tagline: "Merge slimes on a 6×6 grid, level them up and blast a giant monster.", desc: "Three moves per turn. Line up three slimes of the same kind and level to merge them up. Then the whole board fires at the monster, and it slams the column it warned you about. Ten days per chapter, bosses on day 5 and day 10." },
    thumbnail: "assets/thumbnails/slimeclash.png",
    path: "games/slimeclash/index.html",
    // Cơ chế GỘP + tiến trình + kinh tế của Slime Legion (Perfeggs, 2023), bỏ hẳn pha thủ
    // thành auto-battle, thay bằng trận theo lượt lấy cảm hứng từ Might & Magic: Clash of
    // Heroes (Capybara/Ubisoft, 2009).
    //
    // Bản đầu dựng đúng theo Clash of Heroes — HAI sân đối đầu, mỗi quân một bộ đếm lượt
    // nạp trên đầu — và đã bị bỏ: hai sân đối đầu là hình dạng của một game PvP chứ không
    // phải PvE. Bản đang chạy chỉ người chơi có sân; đối thủ là MỘT con quái có thanh máu
    // riêng, đánh trả vào một cột đã báo trước, và đòn của nó đếm theo BƯỚC chứ không theo
    // lượt — càng thao tác nhiều thì đòn tới càng nhanh.
    //
    // SỐ CÂN BẰNG LÀ SỐ ĐO THẬT, không phải phỏng đoán: mổ APK Slime Legion 4.5.0 rồi đọc
    // ba bộ cấu hình quên mã hoá (config_t1, config_t3, dungeon, elitechapter). Từ đó ra:
    // lưới 6x6 (BoardInitColumnCount/RowCount), ngân sách bước 10/10/6 mỗi ngày, máu quái
    // x1.15/ngày nhưng sát thương quái KHÔNG tăng (attack_ratio = 1), trần giảm sát thương
    // 80%, boss báo trước 10 bước (boss_forecast_step), máu thành 1000 bất biến ở cả 1744
    // dòng cấu hình ải, trần vàng/mảnh theo chương (coin_max 220->1800, hero_card_max
    // 25/35/45), bảng trọng số rơi hộp kỹ năng, xác suất thưởng khi gộp 3 ô và 4 ô (đều
    // 0.5), và 96 hero kèm id + slug. Mỗi hero còn có đủ 6 khung sprite theo cấp trong
    // res/heroes — gộp lên cấp là thấy con vật lột xác ngay, đó là phần thưởng thị giác
    // của cả cơ chế.
    // Ghi chép đầy đủ kèm cách lấy: games/slimeclash/_research/ (12 tài liệu).
    //
    // CHƯA LẤY ĐƯỢC: chỉ số gốc từng hero, giá nâng cấp, tỉ lệ gacha, stamina — nằm trong
    // config/table.bytes mã hoá XXTEA, khoá chưa dò ra (đã vét literal C#, metadata IL2CPP,
    // mọi section của libil2cpp.so, 12 thư viện .so khác, 9 file DEX). Bốn agent research
    // wiki xác nhận các số này KHÔNG tồn tại ở bất kỳ nguồn công khai nào. Nên chỉ số quân
    // trong js/data.js dựng theo thang 38 unit của Clash of Heroes, và header file đó GHI RÕ
    // rằng đấy không phải số của Slime Legion — đừng ai đọc nhầm.
    //
    // IAP: giữ nguyên bộ máy gói nạp kích-theo-hành-vi của bản gốc (gói tân thủ, gói sau 3
    // lần thua, gói khi thiếu vàng) nhưng mua đều MIỄN PHÍ. Bỏ giá đi thì cooldown một mình
    // cho phép ~276 lượt mở gói/ngày và game sụp trong một buổi chiều, nên phần thưởng đi
    // qua đúng trần chương của bản gốc, cộng ngân sách "Phiếu Ưu Đãi" 8/ngày và trần kim
    // cương 180/ngày. Lý lẽ đầy đủ: _research/economy-design.md.
    //
    // Kiểm: node games/slimeclash/_test/sim.js — kiểm luật gộp, kiểm bất biến bàn cờ, rồi
    // cho bot chơi và đo tỉ lệ thắng theo chương/ngày (cấp Hero trong mô phỏng SUY TỪ trần
    // vàng [APK], không bịa). Và node games/slimeclash/_test/browser.js — Chrome headless
    // qua DevTools Protocol, không cần npm: kiểm kéo thả thật sự đổi bàn cờ và tốn bước,
    // bấm Đánh thì quái mất máu, và màn trận không tràn quá một màn hình.
    //
    // Mô phỏng bắt được bốn lỗi cân bằng mà đọc code không thấy — đáng chú ý nhất:
    // gradePowerMul PHẢI lớn hơn minRun, để 2.2 với minRun 3 thì gộp là LỖ và nước đi tối
    // ưu thành "không bao giờ gộp". Suy dẫn ghi ngay trong js/config.js.
    status: "available",
    tags: ["Ghép ô", "Theo lượt", "Màn dọc", "Một tay", "Chiến thuật"]
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
    id: "deepcore",
    title: "Lõi Sâu",
    tagline: "Đào sâu xuống hang, để mười linh thú tự đánh thay bạn.",
    desc: "Một cần gạt, màn hình dọc. Bạn không tự đánh, mỗi món mang theo là một linh thú tự chọn mục tiêu. Việc của bạn là đi, đào và đứng đúng chỗ. Mỗi ván một tầng khoảng mười phút, hạ chủ hang rồi chạy về khoang thoát.",
    genre: "hanh-dong",
    accent: "#f472b6",
    en: { title: "Deep Core", tagline: "Dig deep into the caves and let ten companion beasts fight for you.", desc: "One joystick, portrait screen. You never attack, every item you carry is a beast that picks its own targets. Your job is to move, dig and stand in the right place. Each run is one floor of about ten minutes: beat the cave boss, then race to the escape pod." },
    thumbnail: "assets/thumbnails/deepcore.png",
    path: "games/deepcore/index.html",
    rev: "20260907f",
    // Trộn ba game: Deep Rock Galactic (nhịp đi hang, nhiệm vụ, bầy có báo trước,
    // chạy thoát) + Deep Rock Galactic: Survivor (lên cấp chọn 1 trong 3, vũ khí tự
    // đánh, tự đào) + Core Keeper (đá đặc, khoét hang, vỉa quặng, bóng tối, art).
    // Ghi chép đầy đủ kèm nguồn: games/deepcore/research/ (bốn tài liệu, ~4.000 dòng,
    // hơn 340 nhãn [NGUỒN] kèm URL) và games/deepcore/DESIGN.md.
    //
    // ART: sprite THẬT rút từ Core Keeper đang cài trên máy
    // (D:\Steam\steamapps\common\Core Keeper). 6.969 texture + 7.642 sprite được
    // bóc bằng UnityPy, lọc còn 478 khoá đóng thành 2,45 MB atlas. Đường ống giữ đúng
    // luật của dragonproj: TRONG CODE KHÔNG CÓ MỘT TÊN TỆP ẢNH NÀO, chỉ có khoá kiểu
    // 'mob.caveling.move'. Đổi art = sửa danh mục trong _tools/build_atlas.py rồi chạy
    // lại, không đụng code.
    //
    // Ba chỗ phải giải mã mới dùng được bộ art (xem games/deepcore/assets/ASSETS.md):
    //   1. Nhân vật là PAPERDOLL: 293 lớp trang bị cùng khổ 234x156, cùng một bảng
    //      39 khung 26x26. Nhờ thế "đội mũ vào thì thấy cái mũ" là chuyện miễn phí —
    //      chỉ là vẽ thêm một lớp nữa, không phải hiệu ứng.
    //   2. Nhiều sinh vật (chó, mèo, rùa, bọ cuộn, slime...) được tô màu bằng BẢNG
    //      DẢI MÀU: ảnh gốc chỉ là mặt nạ độ sáng, màu thật nằm trong một texture
    //      256x1 tên gm_<tên>. Không áp bảng thì cả đàn vẽ ra thành khối đen.
    //   3. Số khung của mỗi dải anim không nằm trong dữ liệu nào đọc được (game dùng
    //      ECS chứ không dùng AnimationClip của Unity), nên phải DÒ bằng ảnh: ba dấu
    //      hiệu cộng lại (khe cắt, lệch tâm, tỉ lệ), sai chỗ nào thì ghi đè tay.
    //
    // BỐN CHỖ CỐ Ý LỆCH BẢN GỐC:
    //   1. MỘT TẦNG chứ không leo năm tầng như DRG:Survivor — giống DRG gốc hơn, và
    //      một ván mười phút trên điện thoại không chứa nổi năm đường cong độ khó.
    //   2. QUÁI KHÔNG RƠI VIÊN KINH NGHIỆM. Kinh nghiệm cộng thẳng, và phần lớn đến
    //      từ ĐÀO chứ không từ giết — nên cây cuốc không bao giờ là việc phụ, và
    //      không ai phải hút sạch sàn sau mỗi đợt bằng một ngón cái.
    //   3. NGƯỜI CHƠI KHÔNG TỰ ĐÁNH. Cả sát thương đến từ linh thú (lớp summoner).
    //      Để việc đó vẫn có chiều sâu: quái đứng trong 120px quanh người chơi thì ăn
    //      thêm 25% sát thương (chép Meat Shield của Path of Exile), nên VỊ TRÍ thay
    //      cho việc ngắm. Một nút duy nhất: GỌI — gom bầy về, hồi cho chúng, và cộng
    //      35% sát thương trong hai giây.
    //   4. Glurch tách ra slime con khi máu ≤ 50%. Bản gốc chỉ có MỘT chiêu (nhảy vồ
    //      + vũng nhớt), đủ cho một sandbox nhưng phẳng lì khi nó là cao trào đóng màn
    //      của một ván mười phút.
    //
    // CÂN BẰNG ĐO BẰNG MÁY chứ không đoán: _tools/soak.js chạy trọn một ván không vẽ,
    // với một người chơi giả biết né đòn báo trước và giữ quái ở tầm trung. Sáu lượt
    // ải 1: thắng 4/6, ván trung bình 6 phút 38, cấp 17,7. Bốn lỗi nặng chỉ bị lộ nhờ
    // bộ đo này chứ không nhờ chơi tay: quặng do CHÍNH người chơi đào không được tính
    // vào nhiệm vụ; đào đá thường không cho kinh nghiệm nên vòng tiến bộ không khởi
    // động được; mảnh linh thú rơi cho cả mười con thay vì chỉ đội đã ra trận; và 60
    // giây chạy thoát là không đủ băng qua bản đồ.
    //
    // Kiểm: node test/deepcore-suite.js
    status: "available",
    tags: ["Đào hầm", "Nhìn từ trên xuống", "Màn dọc", "Roguelite", "Triệu hồi", "Gacha"]
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
    rev: "20260924a",
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
    id: "pokeone",
    title: "PokéOne",
    tagline: "Bắt Pokémon từ Pallet Town, đi theo ô và đấu theo lượt như PRO.",
    desc: "Tạo nhân vật, nhận Pokémon đầu tiên từ Giáo sư Oak rồi đi qua Route 1 tới Viridian City. Trận đấu chạy luật Gen 7 trên Pokémon Showdown. Lập đội tối đa 3 người để đánh chủ gym, đấu giá Pokémon ở chợ trời.",
    genre: "nhap-vai",
    accent: "#facc15",
    en: { title: "PokéOne", tagline: "Catch Pokémon from Pallet Town, walk the grid and battle turn by turn like PRO.", desc: "Create your trainer, get your first Pokémon from Professor Oak and head through Route 1 to Viridian City. Battles run Gen 7 rules on Pokémon Showdown. Team up with up to 3 players for gym leaders, and auction Pokémon at the marketplace." },
    thumbnail: "assets/thumbnails/pokeone.png",
    path: "games/pokeone/index.html",
    rev: "20260928b",
    // @pkmn/sim 0.10.11 (Pokémon Showdown, gói esbuild) vendor sẵn trong games/pokeone/vendor, không có bước build.
    // ART + TIẾNG + UI: rút từ client PRO (D:\PROClient_64.zip, Unity 2023.1) theo yêu cầu của chủ dự án ngày
    // 2026-09-28, bằng các công cụ trong games/pokeone/tools/pro (tile 32px, sprite Pokémon trước/sau/đi theo, lớp
    // nhân vật, NPC, nền trận, hoạt ảnh chiêu, atlas UI NGUI, tiếng hiệu ứng). Nhạc và tiếng kêu vẫn từ PokéOne.
    // Bản đồ không có trong client (máy chủ gửi) nên Pallet/Route 1/Viridian dựng tay bằng tile PRO.
    // Đây không phải tài sản của repo: muốn gỡ thì xoá games/pokeone/art, games/pokeone/audio và games/pokeone/data.
    // Mạng: Supabase Realtime (chat, boss) + bảng chợ ở db/pokeone-market.sql. Thiết kế: games/pokeone/NET.md.
    // Kiến trúc: games/pokeone/ARCH.md.
    //
    // Kiểm: node test/pokeone-engine.js, pokeone-battle.js, pokeone-world.js, pokeone-shell.js, pokeone-social.js
    status: "available",
    tags: ["Pokémon", "Nhập vai", "Bắt Pokémon", "Đấu theo lượt", "2D", "Đi theo ô", "Chat", "Đánh boss", "Chợ trời"]
  },
  {
    id: "soulknight",
    title: "Hiệp Sĩ Linh Hồn",
    tagline: "Soul Knight trên web: bắn tự ngắm, dọn phòng, hạ trùm cuối mỗi tầng.",
    desc: "Qua Rừng, Lâu Đài, Núi Lửa từ 1-1 tới 3-5. 42 nhân vật có kỹ năng riêng, 361 vũ khí, 12 trùm, lái buôn, tượng và buff. Thêm chế độ mùa giải Thoát khỏi Monkia. Số liệu lấy thẳng từ Soul Knight 8.6.",
    genre: "hanh-dong",
    accent: "#60a5fa",
    en: { title: "Soul Knight", tagline: "Soul Knight on the web: auto-aim shooting, room clearing, a boss on every floor.", desc: "Fight from 1-1 to 3-5 through the Forest, Castle and Volcano. 42 characters with their own skills, 361 weapons, 12 bosses, merchants, statues and buffs. Includes the Escape from Monkia season mode. Stats come straight from Soul Knight 8.6." },
    thumbnail: "assets/thumbnails/soulknight.png",
    path: "games/soulknight/index.html",
    rev: "20261010s",
    // Plain canvas/JS, không engine. ART + CẤU HÌNH: bóc từ Soul Knight 8.5.1 (ChillyRoom) theo yêu cầu
    // của chủ dự án ngày 2026-09-29, bằng games/soulknight/tools/build_sk.py (máu/tốc độ/AI/súng của quái,
    // 711 hoạt ảnh gốc, 282 mẫu phòng kèm cấu hình đợt quái, rương/cửa/cổng/vật phẩm). Chỉ số vũ khí,
    // nhân vật, trùm lấy từ wiki cộng đồng vì các bundle ấy không còn trên máy.
    // Đây không phải tài sản của repo: muốn gỡ thì xoá games/soulknight/art và games/soulknight/data.
    //
    // Kiểm: node test/soulknight-smoke.js (cần server tĩnh ở cổng 8811 tại gốc repo)
    status: "available",
    tags: ["Roguelike", "Bắn súng", "Hầm ngục", "Pixel art", "Tự ngắm", "Soul Knight"]
  },
  {
    id: "diablo2",
    title: "Ác Quỷ II",
    tagline: "Diablo II làm lại trên web: đủ 5 act, bảy lớp nhân vật, ba độ khó.",
    desc: "Dùng hình, tiếng, bản đồ và số liệu gốc. 131 khu sinh ngẫu nhiên mỗi lần vào, từ Rogue Encampment tới Worldstone Chamber, có lính đánh thuê, waypoint và trùm cả 5 act. Chuột trái đi và đánh, chuột phải dùng kỹ năng. Điện thoại xoay ngang có cần điều khiển.",
    genre: "nhap-vai",
    accent: "#dc2626",
    en: { title: "Diablo II", tagline: "Diablo II remade for the web: all 5 acts, seven classes, three difficulties.", desc: "Built from the original art, sound, maps and numbers. 131 areas generated fresh each visit, from the Rogue Encampment to the Worldstone Chamber, with mercenaries, waypoints and every act boss. Left click to move and attack, right click for skills. Phones in landscape get a joystick." },
    thumbnail: "assets/thumbnails/diablo2.png",
    path: "games/diablo2/index.html",
    rev: "20261009a",
    // Plain canvas/JS, không engine. Chủ dự án chốt 2026-10-06: dùng asset + config của Diablo II từ bản D2R
    // trên máy (D:/Diablo2, giải nén ở D:/d2r-ref). Art 2D cổ (DCC/DT1/DS1/DC6) bóc từ kho CASC, số liệu từ
    // excel 3.1. Lever ở games/diablo2/_tools/, hợp đồng ở brain/plans/diablo2-d2r.md, ghi chép ở README.md.
    //
    // Kiểm: node test/diablo2-rules.js, diablo2-drlg.js, diablo2-suite.js
    status: "available",
    tags: ["Nhập vai hành động", "Hầm ngục", "Isometric", "Nhặt đồ", "Diablo II"]
  },
  {
    id: "gia-pha",
    title: "Cây Gia Phả",
    tagline: "Dựng cây gia phả dòng họ, kéo thả nhánh, đính kèm ảnh và lời kể.",
    desc: "Bấm quanh thẻ để thêm con, vợ chồng, cha mẹ, kéo thả để chuyển cả nhánh. Mỗi người có ghi chú soạn như Word và kho tài liệu nhận ảnh, tiếng, phim, PDF, kèm ghi âm. Tìm không cần gõ dấu, xuất ra tệp để chép sang máy khác.",
    genre: "khac",
    accent: "#d4a373",
    en: { title: "Family Tree", tagline: "Build your family tree, drag whole branches, attach photos and recorded stories.", desc: "Tap around a card to add children, spouses or parents, and drag to move a whole branch. Everyone gets Word-style notes and a file store for photos, audio, video and PDFs, plus voice recording. Search without accents and export to a file for another device." },
    thumbnail: "assets/thumbnails/gia-pha.svg",
    path: "games/gia-pha/index.html",
    rev: "20261001c",
    // Plain DOM + SVG, không engine, không bước build. Dữ liệu (người, cặp vợ chồng, ghi chú) và tài liệu
    // đính kèm (Blob) nằm trong IndexedDB của máy người dùng, không lên máy chủ nào. Đọc .docx bằng
    // mammoth 1.8.0 (BSD-2) vendor ở games/gia-pha/vendor, chỉ tải khi cần. Mô hình và bất biến:
    // games/gia-pha/README.md.
    //
    // Kiểm: node test/gia-pha-suite.js
    status: "available",
    tags: ["Công cụ", "Gia phả", "Ghi chú", "Tài liệu", "Kéo thả"]
  },
  {
    id: "tron-tim",
    title: "Trốn Tìm",
    tagline: "Trốn tìm 10 người với bot: núp bụi, né bo, chạy ra cổng cùng đồng đội.",
    desc: "7 người trốn, 3 người tìm trên bản đồ ghép ngẫu nhiên. Người tìm đóng giả người trốn trong 5 giây đầu. Bo co qua 4 vòng, cuối cùng cổng mở. Tám nhân vật Soul Knight, mỗi người một kỹ năng như tàng hình, mồi nhử, dịch chuyển.",
    genre: "hanh-dong",
    accent: "#a3e635",
    en: { title: "Hide & Seek", tagline: "10-player hide and seek with bots: hide in bushes, beat the zone, reach the gate together.", desc: "7 hiders and 3 seekers on a randomly stitched map. Seekers pose as hiders for the first 5 seconds. The zone shrinks over 4 rounds, then the gate opens. Eight Soul Knight characters, each with a skill like invisibility, decoys or teleport." },
    thumbnail: "assets/thumbnails/tron-tim.png",
    path: "games/tron-tim/index.html",
    rev: "20261006a",
    // Plain canvas/JS, không engine. Dựng lại Hide And Seek (Heallios, 2021), game trường cũ của chủ dự
    // án, từ APK đã bóc ở D:\phanminhtam-ref (ngoài git): luật, số liệu, bố cục bản đồ và toàn bộ UI là
    // của game gốc (dump RectTransform vẽ lại bằng ugui.js). Nhân vật, hoạt ảnh, kỹ năng, VFX, tiếng và
    // ô bản đồ lấy từ Soul Knight qua games/tron-tim/tools/extract_sk.js. Thiết kế: games/tron-tim/DESIGN.md.
    //
    // Kiểm: node test/tron-tim-core.js, tron-tim-skills.js, tron-tim-ui.js (server tĩnh cổng 8814/8815)
    status: "available",
    tags: ["Trốn tìm", "Bot", "Bo co dần", "Pixel art", "Soul Knight", "Solo"]
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
    rev: "20261010g",
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
    rev: "20261010a",
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
  }
];
