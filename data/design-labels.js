// Hand-written label overlay: maps every GameSpark metadata table and field path of repo-2d-topdown to designer-facing Vietnamese labels.
(function () {
  var LOBBY = "Server áp ở lần gọi sau (DEV trễ tối đa 60 giây); game cập nhật khi người chơi ở sảnh, không đổi giữa ca.";
  var SERVER = "Server áp ở lần gọi sau (DEV trễ tối đa 60 giây).";
  var RUN = "Áp từ đầu ca kế tiếp; ca đang chơi giữ số cũ. Ca co-op dùng số của chủ phòng.";
  var UNKNOWN = "Chưa rõ tác dụng, hỏi lập trình viên trước khi đổi.";
  var ID = { label: "Mã", help: "Khoá của bản ghi, game tìm theo mã này. Giữ nguyên." };
  var CFG_ID = { label: "Mã", help: "Bảng tham số chỉ có một bản ghi tên default. Giữ nguyên." };
  var NOT_READ = "Game chưa đọc ô này từ bảng; đổi ở đây không có tác dụng.";
  var MINMAX = ["Ít nhất", "Nhiều nhất"];

  window.DESIGN_LABELS = {
    wallet_start: {
      title: "Gói khởi đầu",
      blurb: "Tài khoản mới nhận gì khi vào game lần đầu, và quà khi chơi hết màn hướng dẫn.",
      effect: "Chỉ áp cho tài khoản tạo SAU khi lưu.",
      fields: {
        "_id": CFG_ID,
        "gold": { label: "Vàng", unit: "vàng", min: 0, int: true },
        "gem": { label: "Ngọc", unit: "ngọc", min: 0, int: true, help: "Ngọc tài khoản mới có ngay. Hiện 0: chỉ có 160 ngọc quà hướng dẫn." },
        "ticketX": { label: "Vé Xác", unit: "vé", min: 0, int: true },
        "crew": { label: "Xác có sẵn", help: "Mã các xác người chơi mới có ngay, ví dụ bao (Flare)." },
        "crew.*": { label: "Mã xác" },
        "mateTactics": { label: "Chiến thuật 4 ô đồng đội", items: ["Ô 1", "Ô 2", "Ô 3", "Ô 4"], help: "Mã chiến thuật: loot, thu, soi, baoke, cuuho, nhu, san, tiepte." },
        "tutorialGold": { label: "Quà hướng dẫn: vàng", unit: "vàng", min: 0, int: true, help: "Trao một lần duy nhất, khi người chơi chơi hết màn hướng dẫn lần đầu. 0 = không tặng." },
        "tutorialGem": { label: "Quà hướng dẫn: ngọc", unit: "ngọc", min: 0, int: true, help: "Trao cùng lúc với vàng quà hướng dẫn. 0 = không tặng." },
        "tutorialTicketX": { label: "Quà hướng dẫn: vé xác", unit: "vé", min: 0, int: true, help: "Như trên." }
      }
    },

    crew: {
      title: "Xác (nhân vật)",
      blurb: "Chỉ số gốc ở cấp 0 và số của kỹ năng chủ động của từng xác.",
      effect: RUN,
      rowTitle: "name",
      fields: {
        "_id": ID,
        "name": { label: "Tên", help: NOT_READ },
        "star": { label: "Số sao", int: true, help: NOT_READ },
        "hp": { label: "Máu", min: 1 },
        "atk": { label: "Sát thương", min: 0 },
        "spd": { label: "Tốc chạy", min: 0.1, help: "Hệ số: 1 = tốc chuẩn, 1,08 = nhanh hơn 8%." },
        "carry": { label: "Sức mang", unit: "kg", min: 0 },
        "grit": { label: "Giáp", pct: true, min: 0, max: 1, help: "Tổng giáp sau khi cộng chiến thuật bị chặn ở 75%." },
        "atkR": { label: "Tầm đánh", unit: "ô", min: 0 },
        "atkCd": { label: "Nhịp đánh", unit: "giây", min: 0.01, help: "Số giây giữa hai nhát đánh thường." },
        "skill": { label: "Kỹ năng" },
        "skill.id": { label: "Mã kỹ năng", help: "Cố định theo xác; mã khác mã đang dùng thì game bỏ qua mọi số kỹ năng của xác đó." },
        "skill.cd": { label: "Hồi chiêu", unit: "giây", min: 0, help: "Số gốc, trước khi trừ Giảm hồi chiêu." },
        "skill.dur": { label: "Thời gian hiệu lực", unit: "giây", min: 0 },
        "skill.radius": { label: "Bán kính", unit: "ô", min: 0 },
        "skill.heal": { label: "Hồi máu", unit: "máu", min: 0, help: "Bao Vây Hồi Máu: hồi mỗi giây trong vòng. Mở Toang (Pick): hồi một lần cho mỗi người được thanh tẩy." },
        "skill.dmg": { label: "Sát thương kỹ năng", min: 0 },
        "skill.stun": { label: "Thời gian choáng", unit: "giây", min: 0 },
        "skill.dist": { label: "Quãng dịch chuyển", unit: "ô", min: 0 },
        "skill.lightR": { label: "Bán kính quầng sáng", unit: "ô", min: 0, help: "Chói Loà: quầng sáng đi theo người bấm và từng đồng đội trong bán kính kỹ năng." },
        "skill.lightDur": { label: "Thời gian quầng sáng", unit: "giây", min: 0, help: "Chói Loà." },
        "skill.camZoom": { label: "Độ thu camera", min: 0.4, max: 1, help: "Thấu Thị: 0,74 = camera lùi ra, thấy rộng hơn khoảng 35% mỗi chiều. 1 = không đổi." },
        "skill.mapZoom": { label: "Độ mở bản đồ nhỏ", min: 1, max: 3, help: "Thấu Thị: bản đồ nhỏ thấy gấp bấy nhiêu lần số ô." },
        "skill.pullSpd": { label: "Tốc độ kéo đầu", unit: "ô/giây", min: 1, help: "Kéo Về: đầu đồng đội bị móc bay về người bấm với tốc độ này, xuyên tường." },
        "skill.maxItems": { label: "Số món tối đa mỗi lần kéo", unit: "món", int: true, min: 0, help: "Kéo Đồ: một lần bấm kéo nhiều nhất bấy nhiêu món về bệ. 0 = không giới hạn." },
        "skill.flySpd": { label: "Tốc độ đồ bay", unit: "ô/giây", min: 1, help: "Kéo Đồ: đồ lơ lửng bay thẳng về bệ với tốc độ này, xuyên tường." }
      }
    },

    tactics: {
      title: "Chiến thuật đồng đội",
      blurb: "Phần cộng chỉ số khi bot đồng đội chạy đúng chiến thuật được gán.",
      effect: RUN,
      rowLabels: { loot: "Khuân đồ", thu: "Thủ bệ", soi: "Soi map", baoke: "Bảo kê", cuuho: "Giải cứu", nhu: "Nhử mồi", san: "Săn quái", tiepte: "Tiếp tế" },
      fields: {
        "_id": ID,
        "bonus": { label: "Phần cộng chỉ số", help: "Chỉ số không có trong danh sách thì không được cộng." },
        "bonus.atk": { label: "Sát thương", pct: true },
        "bonus.hp": { label: "Máu", pct: true },
        "bonus.spd": { label: "Tốc chạy", pct: true },
        "bonus.carry": { label: "Sức mang", pct: true },
        "bonus.cd": { label: "Giảm hồi chiêu", pct: true },
        "bonus.luck": { label: "Giá đồ", pct: true },
        "bonus.eye": { label: "Tầm nhìn", pct: true },
        "bonus.grit": { label: "Giáp", pct: true }
      }
    },

    upgrade: {
      title: "Lên cấp xác",
      blurb: "Giá vàng và mảnh từng cấp (số dòng = cấp tối đa), phần chỉ số mỗi xác được cộng thêm mỗi lần lên cấp, mốc giảm hồi chiêu và mốc mở nội tại.",
      effect: LOBBY,
      fields: {
        "_id": CFG_ID,
        "steps": {
          label: "Giá từng cấp",
          help: "Mỗi dòng là một bước lên cấp, ví dụ dòng \"1 → 2\" là giá để lên cấp 2. Cấp tối đa = số dòng.",
          cols: ["shard", "gold"],
          rowLabel: "{0} → {1}",
          add: { button: "Thêm cấp", noId: true, copyLast: true, item: { shard: 1, gold: 0 } },
          dropLast: { button: "Bỏ cấp cuối", min: 1, title: "Bỏ dòng cuối để giảm cấp tối đa (cả dòng đã lưu)" }
        },
        "steps.*": { label: "Bước" },
        "steps.*.shard": { label: "Mảnh", unit: "mảnh", min: 0, int: true },
        "steps.*.gold": { label: "Vàng", unit: "vàng", min: 0, int: true },
        "growth": {
          label: "Chỉ số tăng mỗi cấp",
          help: "Mỗi lần lên cấp, chỉ số của xác cộng thêm đúng số này.",
          cols: ["crew", "hp", "atk", "spd", "carry", "grit"]
        },
        "growth.*": { label: "Xác" },
        "growth.*.crew": { label: "Xác", readonly: true, namesFrom: { table: "crew", field: "name" } },
        "growth.*.hp": { label: "Máu", min: 0 },
        "growth.*.atk": { label: "Sát thương", min: 0 },
        "growth.*.spd": { label: "Tốc chạy", min: 0 },
        "growth.*.carry": { label: "Sức mang", min: 0 },
        "growth.*.grit": { label: "Giáp", pct: true, min: 0 },
        "cdAtLevel": { label: "Cấp giảm hồi chiêu", min: 1, int: true, help: "Từ cấp này hồi chiêu kỹ năng được giảm." },
        "cdReduce": { label: "Mức giảm hồi chiêu", pct: true, min: 0, max: 1 },
        "passiveAtLevel": { label: "Cấp mở nội tại", min: 1, int: true }
      }
    },

    passives: {
      title: "Nội tại",
      blurb: "Số của nội tại từng xác, mở ở cấp tối đa.",
      effect: RUN,
      fields: {
        "_id": CFG_ID,
        "flareSang": { label: "Flare: vùng đã đi sáng thêm", pct: true, min: 0 },
        "haloHeal": { label: "Halo: hồi máu đồng đội mỗi giây", unit: "máu", min: 0 },
        "haloRange": { label: "Halo: tầm hồi máu", unit: "ô", min: 0 },
        "atlasPhat": { label: "Atlas: phạt tốc độ đồ nặng còn lại", pct: true, min: 0, max: 1 },
        "pickPrySpeed": { label: "Pick: cạy cửa kẹt nhanh gấp", unit: "lần", min: 0 },
        "shadeNoiseFactor": { label: "Shade: tiếng động còn lại", pct: true, min: 0, max: 1 },
        "shadeSan": { label: "Shade: tiếng động thấp nhất", pct: true, min: 0, max: 1 },
        "quakeRetain": { label: "Quake: phần giá món đang vác được giữ khi bị đánh", pct: true, min: 0, max: 1, help: "100% = món đang vác không mất giá." },
        "lureRange": { label: "Lure: tầm thấy quái trên bản đồ nhỏ", unit: "ô", min: 0 },
        "hookBe": { label: "Hook: bệ hồi sinh đếm nhanh gấp", unit: "lần", min: 0 },
        "barbReduce": { label: "Barb: bớt sát thương cho đồng đội", pct: true, min: 0 },
        "barbTam": { label: "Barb: tầm che chắn", unit: "ô", min: 0 },
        "barbTran": { label: "Barb: mức bớt tối đa", pct: true, min: 0, max: 1 },
        "blinkBase": { label: "Blink: không ăn đòn sau Chớp (chưa có nội tại)", unit: "giây", min: 0 },
        "blinkBat": { label: "Blink: không ăn đòn sau Chớp (có nội tại)", unit: "giây", min: 0 },
        "oracleSight": { label: "Oracle: cả tổ nhìn xa thêm", pct: true, min: 0 },
        "frostSlow": { label: "Frost: làm chậm quái bị đánh", pct: true, min: 0, max: 1 },
        "frostSeconds": { label: "Frost: thời gian làm chậm", unit: "giây", min: 0 },
        "frostTran": { label: "Frost: làm chậm tối đa", pct: true, min: 0, max: 1 },
        "magnetTam": { label: "Magnet: tầm hút đồ nhỏ", unit: "ô", min: 0 },
        "magnetBay": { label: "Magnet: tốc độ đồ bay về tay", unit: "pixel/giây", min: 0 },
        "seraphTam": { label: "Seraph: tầm bảo vệ", unit: "ô", min: 0 },
        "seraphHealCooldown": { label: "Seraph: hồi lại cho mỗi người", unit: "giây", min: 0, help: "Mỗi đồng đội chỉ được cứu khỏi gục một lần trong ngần này giây." }
      }
    },

    gacha_banners: {
      title: "Băng gacha",
      blurb: "Giá mỗi lượt, tỉ lệ 5★/4★, bảo hiểm và xác độc quyền của từng băng.",
      effect: LOBBY,
      rowLabels: { char: "Gacha Xác", lim1: "Gacha Giới Hạn: Blink & Oracle", lim2: "Gacha Giới Hạn: Frost & Magnet" },
      fields: {
        "_id": ID,
        "costGem": { label: "Giá mỗi lượt", unit: "ngọc", min: 0, int: true },
        "ticket": { label: "Vé dùng thay ngọc", help: "Mã vé; ticketX = Vé Xác." },
        "rate5": { label: "Tỉ lệ 5★", pct: true, min: 0, max: 1, help: "0,006 = 0,6%." },
        "rate4": { label: "Tỉ lệ 4★", pct: true, min: 0, max: 1 },
        "soft": { label: "Bảo hiểm mềm", unit: "lần", min: 0, int: true, help: "Quá số lượt này, mỗi lượt tỉ lệ 5★ tăng thêm một bước (gacha_rules)." },
        "hard": { label: "Bảo hiểm cứng", unit: "lần", min: 1, int: true, help: "Số lượt tối đa trước khi chắc chắn ra 5★." },
        "pity4": { label: "Bảo hiểm 4★", unit: "lần", min: 1, int: true, help: "Cứ bấy nhiêu lượt chắc có ít nhất một 4★." },
        "chars": { label: "Xác độc quyền", help: "Mã xác chỉ băng này có. Trống = băng thường." },
        "chars.*": { label: "Mã xác" }
      }
    },

    gacha_rules: {
      title: "Luật gacha",
      blurb: "Bước tăng tỉ lệ sau bảo hiểm mềm, mảnh khi trùng xác, quay 10 chắc có 4★.",
      effect: LOBBY,
      fields: {
        "_id": CFG_ID,
        "softPityStep": { label: "Bước tăng tỉ lệ 5★ sau bảo hiểm mềm", pct: true, min: 0, max: 1, help: "Mỗi lượt quá mốc bảo hiểm mềm cộng số này vào tỉ lệ 5★." },
        "duplicateShard": { label: "Mảnh khi ra xác trùng", unit: "mảnh", min: 0, int: true },
        "tenPullMin4Star": { label: "Quay 10 chắc có 4★" }
      }
    },

    shop_packs: {
      title: "Gói nạp",
      blurb: "Các gói nạp tiền thật: giá, ngọc nạp, ngọc tặng thêm, nhãn.",
      effect: LOBBY,
      rowTitle: "name",
      fields: {
        "_id": ID,
        "name": { label: "Tên gói" },
        "usd": { label: "Giá", unit: "đô la", min: 0, cents: true, help: "Giá đô la, tối đa hai số lẻ, ví dụ 4.99. Giá thật trên điện thoại do Google Play và App Store đặt." },
        "gem": { label: "Ngọc nạp", unit: "ngọc", min: 0, int: true },
        "bonus": { label: "Ngọc tặng thêm", unit: "ngọc", min: 0, int: true },
        "tag": { label: "Nhãn", help: "Chữ nổi trên gói, ví dụ HOT. Để trống = không có nhãn." }
      }
    },

    shop_rules: {
      title: "Luật cửa hàng",
      blurb: "Tỉ lệ đổi ngọc nạp ra ngọc.",
      effect: LOBBY,
      fields: {
        "_id": CFG_ID,
        "paidGemToGem": { label: "Ngọc nhận cho mỗi ngọc nạp", unit: "ngọc", min: 0, help: "1 = đổi một ngọc nạp lấy một ngọc." }
      }
    },

    shop_exchange: {
      title: "Đổi ngọc",
      blurb: "Đổi ngọc lấy vàng hoặc vé, kèm giới hạn mỗi ngày.",
      effect: LOBBY,
      rowLabels: { x1: "Đổi vàng (gói nhỏ)", x2: "Đổi vàng (gói lớn)", x3: "Đổi Vé Xác" },
      fields: {
        "_id": ID,
        "gemCost": { label: "Giá", unit: "ngọc", min: 0, int: true },
        "reward": { label: "Nhận được", help: "Món không có trong danh sách thì không nhận." },
        "reward.gold": { label: "Vàng", unit: "vàng", min: 0, int: true },
        "reward.ticketX": { label: "Vé Xác", unit: "vé", min: 0, int: true },
        "dailyLimit": { label: "Giới hạn mỗi ngày", unit: "lần", min: 0, int: true }
      }
    },

    loadout: {
      title: "Đồ nghề trước ca",
      blurb: "Đồ nghề mua bằng vàng ở sảnh trước khi vào ca.",
      effect: LOBBY,
      rowLabels: {
        bomb: "Lựu đạn", stun: "Lựu đạn choáng", mine: "Mìn đặt", xung: "Lựu đạn xung kích", gun: "Súng lục", tranq: "Súng gây mê",
        laser: "Súng laser sạc", shotgun: "Súng nòng ngắn", chum: "Lựu đạn chùm", inflatable: "Búa hơi", pan: "Chảo gang",
        bat: "Gậy bóng chày", machete: "Mã tấu", prodzap: "Dùi cui điện", sledge: "Búa tạ", ringcarry: "Nhẫn nhẹ tay",
        ringspeed: "Nhẫn tốc", ringpower: "Nhẫn sức", ringguard: "Nhẫn chống vỡ"
      },
      fields: {
        "_id": ID,
        "goldPrice": { label: "Giá", unit: "vàng", min: 0, int: true },
        "uses": { label: "Số lần dùng", unit: "lần", int: true, help: "Game client không đọc ô này (số lần dùng trong ca lấy từ station_gear). " + UNKNOWN }
      }
    },

    quests: {
      title: "Nhiệm vụ",
      blurb: "Nhiệm vụ ngày, nhiệm vụ tuần và thành tựu: điều kiện và phần thưởng. Ô thưởng để trống là không thưởng loại đó.",
      effect: SERVER + " Sửa chữ, số cần đạt và thưởng thì nhiệm vụ đang chạy đổi ngay. Nhiệm vụ ngày/tuần mới thêm chỉ vào từ kỳ sau (ngày/tuần sau); thành tựu mới hiện ngay.",
      expand: true,
      rowLabels: { daily: "Nhiệm vụ ngày", weekly: "Nhiệm vụ tuần", ach: "Thành tựu" },
      fields: {
        "_id": ID,
        "pick": { label: "Số nhiệm vụ mỗi kỳ", min: 0, int: true, help: "Bốc ngẫu nhiên bấy nhiêu nhiệm vụ từ danh sách. 0 = lấy hết." },
        "list": {
          label: "Danh sách",
          cols: ["id", "text", "metric", "need", "reward.gold", "reward.gem", "reward.ticketX"],
          add: {
            button: "+ Thêm nhiệm vụ",
            idPrefix: { daily: "d_", weekly: "w_", ach: "a_" },
            item: { text: "", metric: "runs", need: 1, reward: { gold: 100 } }
          }
        },
        "list.*": { label: "Nhiệm vụ" },
        "list.*.id": { label: "Mã nhiệm vụ", re: "^[a-z0-9_]{1,40}$", unique: true,
          invalid: "Mã chỉ gồm chữ thường không dấu, số và dấu _, tối đa 40 ký tự.",
          help: "Mã riêng của nhiệm vụ, không trùng trong cùng danh sách. Đã lưu rồi thì đừng đổi mã: thành tựu đổi mã thì người đã nhận sẽ nhận lại được lần nữa; nhiệm vụ ngày/tuần đổi mã thì biến mất khỏi kỳ đang chạy." },
        "list.*.text": { label: "Mô tả", re: "[^ ]", invalid: "Nhập chữ người chơi thấy.", help: "Chữ người chơi thấy. Đổi số cần đạt thì sửa cả chữ này." },
        "list.*.metric": {
          label: "Đếm theo",
          help: "Bộ đếm server tính cho kỳ này. Ngày, tuần và thành tựu đếm được những thứ khác nhau.",
          choicesBy: {
            daily: [
              { v: "runs", label: "Số ca đã đi" }, { v: "loot", label: "Giá trị đồ đã giao" }, { v: "skills", label: "Số lần dùng kỹ năng" },
              { v: "kills", label: "Số quái đã hạ" }, { v: "floors", label: "Số tầng đã qua" }, { v: "pulls", label: "Số lần quay gacha" },
              { v: "revives", label: "Số lần đỡ đồng đội" }
            ],
            weekly: [
              { v: "runs", label: "Số ca đã đi" }, { v: "wins", label: "Số ca thắng" }, { v: "loot", label: "Giá trị đồ đã giao" },
              { v: "kills", label: "Số quái đã hạ" }, { v: "upgrades", label: "Số lần nâng cấp nhân vật" }
            ],
            ach: [
              { v: "runs", label: "Số ca đã đi (cả đời)" }, { v: "wins", label: "Số ca thắng (cả đời)" }, { v: "loot", label: "Giá trị đồ đã giao (cả đời)" },
              { v: "kills", label: "Số quái đã hạ (cả đời)" }, { v: "skills", label: "Số lần dùng kỹ năng (cả đời)" }, { v: "floors", label: "Số tầng đã qua (cả đời)" },
              { v: "pulls", label: "Số lần quay gacha (cả đời)" }, { v: "revives", label: "Số lần đỡ đồng đội (cả đời)" },
              { v: "upgrades", label: "Số lần nâng cấp nhân vật (cả đời)" }, { v: "mapsDone", label: "Số ải đã phá đảo" },
              { v: "own5", label: "Số nhân vật 5★ đang có" }, { v: "squadFull", label: "Số ô đội hình đã điền" }
            ]
          }
        },
        "list.*.need": { label: "Cần đạt", min: 1, int: true },
        "list.*.reward": { label: "Thưởng" },
        "list.*.reward.gold": { label: "Vàng", unit: "vàng", min: 0, int: true, optional: true },
        "list.*.reward.gem": { label: "Ngọc", unit: "ngọc", min: 0, int: true, optional: true },
        "list.*.reward.ticketX": { label: "Vé Xác", unit: "vé", min: 0, int: true, optional: true }
      }
    },

    maps: {
      title: "Ải",
      blurb: "Ải 5 nhà: thưởng mỗi lần phá đảo và thưởng lần phá đảo đầu tiên.",
      effect: LOBBY,
      rowLabels: { ai: "Ải 5 nhà" },
      fields: {
        "_id": ID,
        "floors": { label: "Số nhà", int: true, help: "Game client không đổi số nhà theo ô này (số nhà thật do stage_houses quyết). " + UNKNOWN },
        "clear": { label: "Thưởng phá đảo" },
        "clear.gold": { label: "Vàng", unit: "vàng", min: 0, int: true },
        "clear.gem": { label: "Ngọc", unit: "ngọc", min: 0, int: true, help: "Hiện đặt 0: ngọc chỉ có từ quà hướng dẫn và cửa hàng." },
        "first": { label: "Thưởng lần đầu", help: "Thưởng thêm cho lần phá đảo đầu tiên." },
        "first.gold": { label: "Vàng", unit: "vàng", min: 0, int: true },
        "first.gem": { label: "Ngọc", unit: "ngọc", min: 0, int: true, help: "Hiện đặt 0." }
      }
    },

    run_reward: {
      title: "Thưởng sau ca",
      blurb: "Đổi giá trị đồ đã giao ra vàng, và ngọc thưởng ca co-op theo số tầng.",
      effect: SERVER,
      fields: {
        "_id": CFG_ID,
        "lootGoldRate": { label: "Vàng theo giá trị đồ giao", pct: true, min: 0, help: "55% = nhận vàng bằng 55% tổng giá trị đồ đã giao. 0 = đồ nhặt không quy ra vàng tài khoản (đồ chỉ tiêu ở cửa hàng trạm trong ca)." },
        "goldPerHouse": { label: "Vàng thưởng mỗi nhà xong", help: "Mỗi nhà qua được cộng bấy nhiêu vàng vào thưởng ca, theo chế độ; tổng bị kẹp bởi Trần vàng thưởng." },
        "goldPerHouse.normal": { label: "Ải 5 nhà", unit: "vàng", min: 0, int: true },
        "goldPerHouse.coop": { label: "Chơi với bạn", unit: "vàng", min: 0, int: true },
        "goldPerHouse.endless_solo": { label: "Vô tận một mình", unit: "vàng", min: 0, int: true },
        "goldPerHouse.endless_coop": { label: "Vô tận cùng bạn", unit: "vàng", min: 0, int: true },
        "goldCap": { label: "Trần vàng thưởng mỗi ca / trận", help: "Vàng thưởng một ca không vượt số này, theo chế độ." },
        "goldCap.normal": { label: "Ải 5 nhà", unit: "vàng", min: 0, int: true },
        "goldCap.coop": { label: "Chơi với bạn", unit: "vàng", min: 0, int: true },
        "goldCap.endless_solo": { label: "Vô tận một mình", unit: "vàng", min: 0, int: true },
        "goldCap.endless_coop": { label: "Vô tận cùng bạn", unit: "vàng", min: 0, int: true },
        "goldCap.pvp": { label: "Đấu đội 5v5", unit: "vàng", min: 0, int: true },
        "pvpGold": { label: "Vàng thưởng Đấu đội 5v5", help: "Vàng sau trận: thắng hoặc thua cộng số cố định, thêm theo số hạ gục; kẹp bởi Trần vàng Đấu đội." },
        "pvpGold.win": { label: "Thắng", unit: "vàng", min: 0, int: true },
        "pvpGold.lose": { label: "Thua", unit: "vàng", min: 0, int: true },
        "pvpGold.perKill": { label: "Mỗi hạ gục", unit: "vàng", min: 0, int: true },
        "pvpGold.minSec": { label: "Trận phải kéo dài ít nhất", unit: "giây", min: 0, int: true, help: "Trận ngắn hơn số giây này thì không có vàng thưởng (chống bỏ ngang lấy thưởng)." },
        "coopGemPerStep": { label: "Ngọc co-op mỗi chặng", unit: "ngọc", min: 0, int: true, help: "Ca co-op: nhận bấy nhiêu ngọc cho mỗi chặng tầng đã qua. 0 = không thưởng ngọc." },
        "coopFloorsPerStep": { label: "Số tầng mỗi chặng ngọc co-op", min: 1, int: true },
        "coopTierFloors": { label: "Số tầng mỗi bậc co-op", min: 1, int: true, help: "Bậc = số tầng chia số này; chỉ để hiện, không đổi thưởng." },
        "lootCapSlack": { label: "Hệ số trần đồ mỗi nhà (chống gian lận)", min: 1, help: "Server không trả quá trần đồ loot_cap của các nhà mà giờ chơi cho phép, nhân số này. 2 = gấp đôi trần đặt đồ, chừa két, rương và món cuối." },
        "maxKillsPerFloor": { label: "Trần số quái giết mỗi nhà", min: 1, int: true, help: "Bộ đếm quest giết quái của một ca không vượt số này nhân số nhà giờ chơi cho phép." },
        "maxSkillsPerFloor": { label: "Trần số lần dùng kỹ năng mỗi nhà", min: 1, int: true, help: "Bộ đếm quest dùng kỹ năng, cùng cách kẹp như trên." },
        "maxRevivesPerFloor": { label: "Trần số lần hồi sinh mỗi nhà", min: 1, int: true, help: "Bộ đếm quest hồi sinh đồng đội, cùng cách kẹp như trên." }
      }
    },

    stage_houses: {
      title: "Các nhà trong ải",
      blurb: "Bảng chia ba phần: phòng và hành lang, độ khó và quái (hai phần này theo vị trí nhà, không xáo), và theme (tên, kiểu nhà, loot, boss; xáo mỗi ca).",
      effect: RUN,
      sections: [
        {
          title: "Phòng và hành lang (theo vị trí nhà, không xáo)",
          note: "Mỗi nhà luôn có 1 phòng xe tải, cộng các phòng dưới đây. Nhà thứ n luôn dùng dòng n.",
          rowLabels: { "1": "Nhà 1", "2": "Nhà 2", "3": "Nhà 3", "4": "Nhà 4", "5": "Nhà 5" },
          inline: 5,
          fields: ["extractRooms", "privateRooms", "sharedRooms", "shortCorridors", "longCorridors", "specialExtract",
            "mediumRatio", "largeRatio"]
        },
        {
          title: "Độ khó và quái (theo vị trí nhà, không xáo)",
          note: "Nhà sau luôn khó hơn nhà trước, dù theme nào rơi vào.",
          rowLabels: { "1": "Nhà 1", "2": "Nhà 2", "3": "Nhà 3", "4": "Nhà 4", "5": "Nhà 5" },
          fields: ["level", "hpMul", "dmgMul", "quotaMul", "foeCount", "kindCount", "foes"]
        },
        {
          title: "Theme (xáo ngẫu nhiên mỗi ca)",
          note: "Theme gồm tên, kiểu nhà, loot, chất liệu, giá đồ, quái đặc trưng và boss.",
          noteWhen: {
            table: "stage_rules", field: "shuffleThemes",
            "true": "Đang bật xáo: mỗi ca, 5 theme này được chia ngẫu nhiên vào 5 vị trí nhà.",
            "false": "Đang tắt xáo (Luật ải): nhà thứ n luôn mang theme dòng n."
          },
          rowTitle: "name",
          fields: ["name", "houseStyle", "loot", "materials", "giaTriMul", "ownFoes", "boss", "bossFromHouse"]
        }
      ],
      fields: {
        "_id": { label: "Thứ tự nhà", help: "1 = nhà đầu. Giữ nguyên." },
        "name": { label: "Tên nhà" },
        "level": { label: "Mức độ", min: 1, max: 20, int: true, help: "Chỉ tiêu, trần loot, rương và giấc ngủ đầu ca của quái đi theo số này." },
        "houseStyle": { label: "Kiểu nhà", int: true, help: "Mã theme sàn/tường (hiện dùng 17–21). -1 = bốc ngẫu nhiên." },
        "foes": { label: "Loài quái", help: "Mã loài có thể gặp trong nhà. Để trống = game tự bốc." },
        "foes.*": { label: "Mã loài" },
        "foeCount": { label: "Số chỗ đặt quái", min: 0, int: true, help: "0 = mỗi loài một chỗ." },
        "kindCount": { label: "Số loài mỗi ca", min: 0, int: true, help: "Bốc bấy nhiêu loài từ mọi loài đã mở tới nhà này. 0 = dùng nguyên danh sách." },
        "ownFoes": { label: "Quái đặc trưng", help: "Kiểu nhà này rơi vào vị trí đã mở loài đó thì loài đó luôn có mặt." },
        "ownFoes.*": { label: "Mã loài" },
        "boss": { label: "Boss", help: "Mã loài boss, đúng một con. Trống = không có boss." },
        "bossFromHouse": { label: "Boss có từ nhà thứ", min: 1, int: true, help: "Boss đi theo theme nhưng chỉ xuất hiện khi theme rơi vào nhà thứ này trở đi." },
        "hpMul": { label: "Hệ số máu quái", min: 0 },
        "dmgMul": { label: "Hệ số sát thương quái", min: 0 },
        "materials": { label: "Tỉ trọng chất liệu đồ", items: ["Gốm", "Gỗ", "Kim loại"], min: 0, help: "Để trống = chia đều." },
        "giaTriMul": { label: "Hệ số giá đồ", min: 0 },
        "loot": { label: "Bộ hình loot", help: "vampire, pyramid, spacestation, asylum. Để trống = hình chung." },
        "specialExtract": { label: "Bệ giao nằm trong phòng đặc biệt", help: "Bật = mọi bệ giao nằm trong phòng SpecialExtract." },
        "mediumRatio": { label: "Thiên hướng phòng vừa", min: 0, max: 1, help: "Không phải tỉ lệ chính xác: số càng cao càng hay bốc phòng cỡ vừa." },
        "largeRatio": { label: "Thiên hướng phòng to", min: 0, max: 1 },
        "quotaMul": { label: "Hệ số chỉ tiêu", min: 0 },
        "extractRooms": { label: "Phòng extract", unit: "phòng", min: 0, max: 8, int: true, help: "Phòng lá có bệ giao, không tính phòng xe tải. Số bệ giao của nhà = số này + 1 (bệ đầu nằm ở phòng xe tải)." },
        "privateRooms": { label: "Phòng loot riêng", unit: "phòng", min: 0, max: 8, int: true, help: "Phòng private loot của nhà này." },
        "sharedRooms": { label: "Phòng loot chung", unit: "phòng", min: 0, max: 40, int: true, help: "Phòng share loot. Tổng phòng của nhà = 1 phòng xe tải + extract + riêng + chung." },
        "shortCorridors": { label: "Hành lang ngắn", unit: "đoạn", min: 0, max: 40, int: true },
        "longCorridors": { label: "Hành lang dài", unit: "đoạn", min: 0, max: 40, int: true, help: "Mỗi đoạn dài bốc ngẫu nhiên dài hoặc rất dài. Tổng hành lang không được nhiều hơn số phòng loot chung." }
      }
    },

    stage_rules: {
      title: "Luật ải",
      blurb: "Luật chung cả ca: xáo kiểu nhà, khoảng cách bệ, đồ trên xe, vài số của quái, tầm lửa và khí.",
      effect: RUN,
      fields: {
        "_id": CFG_ID,
        "shuffleThemes": { label: "Xáo kiểu nhà mỗi ca", help: "Bật: độ khó vẫn theo vị trí nhà, còn tên, kiểu nhà, loot và quái đặc trưng được xáo." },
        "angelBotTotal": { label: "Bot giữ thiên thần hộ người chơi", unit: "giây", min: 0, help: "Khi người chơi gục, cả tổ bot đồng đội cùng giữ thiên thần hộ trong tổng bấy nhiêu giây (không nhân theo số bot). Mặc định 15." },
        "minPadSpacing": { label: "Khoảng cách tối thiểu giữa hai bệ", unit: "cửa", min: 1, int: true },
        "xeNoMul": { label: "Đồ trên xe chịu nổ", min: 0, help: "1 = đau như đồ trên sàn, 0 = xe che hết." },
        "cartFoeHitMul": { label: "Đồ trên xe khi quái đánh người đẩy", min: 0, help: "1 = như món đang vác, 0 = quái không làm hư đồ trên xe." },
        "shockThreshold": { label: "Ngưỡng đập tường", unit: "pixel/giây", min: 0, help: "Lựu đạn xung kích: thân bị thổi đập tường nhanh hơn số này mới mất máu." },
        "shockCoefficient": { label: "Máu mất khi đập tường", min: 0, help: "Máu mất trên mỗi pixel/giây vượt ngưỡng." },
        "bratRestAfterThrow": { label: "Con nít ranh: nghỉ sau mỗi cú ném", unit: "giây", min: 0, help: "0 = mặc định (9 giây)." },
        "maxMines": { label: "Kẻ gài mìn: số mìn tối đa", min: 0, int: true, help: "0 = mặc định (5)." },
        "mineIntervalMul": { label: "Kẻ gài mìn: hệ số nhịp đặt mìn", min: 0, help: "1 = mặc định (11–16 giây mỗi quả), 2 = thưa gấp đôi." },
        "ghostGiveUpRadius": { label: "Hồn ma: bỏ đuổi khi người chạy xa hơn", unit: "ô", min: 0, help: "0 = mặc định (20 ô)." },
        "fireRange": { label: "Tầm tia lửa", unit: "ô", min: 1 },
        "fireRangeMax": { label: "Tầm tia lửa tối đa (phòng rộng)", unit: "ô", min: 1 },
        "gasRange": { label: "Tầm khí độc", unit: "ô", min: 1 },
        "gasRangeMax": { label: "Tầm khí độc tối đa (phòng rộng)", unit: "ô", min: 1 },
        "decorLightFadeIn": { label: "Ánh sáng decor: hiện ra trong", unit: "giây", min: 0, help: "Đèn pin soi trúng decor phát sáng thì vòng sáng của nó hiện dần trong ngần này giây." },
        "decorLightFadeOut": { label: "Ánh sáng decor: tắt dần trong", unit: "giây", min: 0, help: "Đèn pin rời khỏi decor thì vòng sáng tắt dần trong ngần này giây." },
        "smartLook": { label: "Tự xoay (điện thoại một cần)", help: "Điện thoại: cần trái để đi, hướng nhìn tự quay về con quái đang khoá, không có quái thì theo hướng đi. Người chơi bật/tắt trong Cài đặt, nhóm Điều khiển. PC không dùng." },
        "smartLook.default": { label: "Bật sẵn cho người chơi mới", min: 0, max: 1, int: true, help: "1 = máy cảm ứng lần đầu vào game thì bật sẵn, 0 = tắt sẵn. Người chơi đã chọn trong Cài đặt thì giữ lựa chọn của họ." },
        "smartLook.lockRange": { label: "Tầm bắt đầu khoá quái", unit: "ô", min: 1, max: 20, help: "Nón đèn pin dài 6,8 ô." },
        "smartLook.lockKeepMul": { label: "Đã khoá thì giữ tới", unit: "× tầm", min: 1, max: 3, help: "Quái lùi ra quá tầm khoá một chút vẫn giữ, để người không quay qua quay lại ở mép tầm." },
        "smartLook.lockCone": { label: "Chỉ khoá quái ở trước mặt trong", unit: "rad", min: 0.1, max: 3.2, help: "Nửa góc tính từ hướng đang nhìn. 1 rad ≈ 57°. Quái phải đang thấy (trong đèn)." },
        "smartLook.rearRange": { label: "Quái lao vào trong tầm này thì quay lại", unit: "ô", min: 0, max: 10, help: "Con đang đuổi mình ở gần hơn số này thì khoá dù ở sau lưng hay ngoài đèn." },
        "smartLook.switchRatio": { label: "Đổi mục tiêu khi con mới tốt hơn", pct: true, min: 0.05, max: 1, help: "60% = điểm con mới (gần + đúng hướng + đang lao vào) phải dưới 60% điểm con đang khoá. Thấp hơn = ít đổi hơn." },
        "smartLook.switchCooldown": { label: "Nghỉ giữa hai lần đổi mục tiêu", unit: "giây", min: 0, max: 5 },
        "smartLook.losGrace": { label: "Quái khuất tường vẫn giữ khoá trong", unit: "giây", min: 0, max: 5 },
        "smartLook.moveDelay": { label: "Đi một hướng bao lâu mới quay theo", unit: "giây", min: 0, max: 3 },
        "smartLook.moveDeadband": { label: "Hướng đi lệch ít hơn thì không quay", unit: "độ", min: 0, max: 90 },
        "smartLook.turnMul": { label: "Tốc độ tự xoay", min: 0.1, max: 3, help: "So với tốc độ quay bằng cần xoay tay. 0,45 = chậm hơn một nửa, đỡ chóng mặt." },
        "smartLook.carryTurnMul": { label: "Đang vác/đẩy đồ: tốc độ xoay nhân thêm", min: 0.1, max: 1, help: "Đồ đang vác treo trước mặt, quay nhanh là đồ văng theo." },
        "smartLook.carryRangeMul": { label: "Đang vác/đẩy đồ: tầm khoá nhân", min: 0, max: 1 },
        "smartLook.carryMoveDelay": { label: "Đang vác/đẩy đồ: đi một hướng bao lâu mới quay theo", unit: "giây", min: 0, max: 5, help: "Lùi một bước ngắn khi vác thì không quay người." }
      }
    },

    extract_quota: {
      title: "Chỉ tiêu giao hàng",
      blurb: "Tiền phải giao ở mỗi nhà: tổng giá đồ × phần phải giao × đường độ khó × hệ số tổ đội × hệ số chỉ tiêu của nhà, chia đều cho các bệ.",
      effect: RUN,
      fields: {
        "_id": CFG_ID,
        "quotaFactor": { label: "Phần giá trị phải giao", pct: true, min: 0, help: "70% = phải giao 70% tổng giá đồ trong nhà, trước các hệ số khác." },
        "difficultyCurve": { label: "Đường độ khó theo mức độ", help: "Các mốc {mức độ, hệ số}; mức độ phải tăng dần." },
        "difficultyCurve.*": { label: "Mốc" },
        "difficultyCurve.*.level": { label: "Mức độ", min: 1, int: true },
        "difficultyCurve.*.mul": { label: "Hệ số", min: 0 },
        "crewMulBase": { label: "Hệ số tổ đội: gốc", min: 0, help: "Hệ số tổ đội = gốc + mỗi người × min(số người, số người tính tối đa)." },
        "crewMulStep": { label: "Hệ số tổ đội: mỗi người", min: 0 },
        "crewMulMaxCrew": { label: "Hệ số tổ đội: số người tính tối đa", min: 1, int: true },
        "extractHoldSeconds": { label: "Thời gian đứng trên nút giao", unit: "giây", min: 0 }
      }
    },

    loot_cap: {
      title: "Trần loot",
      blurb: "Trần tổng giá trị và số món loot theo mức độ nhà, và tỉ lệ ra đồ nhỏ/vừa/to.",
      effect: RUN,
      fields: {
        "_id": CFG_ID,
        "capLevel": { label: "Mức độ chạm trần", min: 2, int: true, help: "Từ mức độ này trần loot không tăng nữa; giữa mức 1 và mức này game nội suy." },
        "value": { label: "Tổng giá trị loot", items: ["Mức độ 1", "Mức độ trần"], min: 0, int: true },
        "count": { label: "Số món tối đa", items: ["Mức độ 1", "Mức độ trần"], min: 0, int: true },
        "big": { label: "Số món to tối đa", items: ["Mức độ 1", "Mức độ trần"], min: 0, int: true },
        "med": { label: "Số món vừa tối đa", items: ["Mức độ 1", "Mức độ trần"], min: 0, int: true },
        "sizeSplit": { label: "Chia cỡ đồ", help: "Game rút số ngẫu nhiên 0–100%: dưới mốc nhỏ ra đồ nhỏ, dưới mốc vừa ra đồ vừa, còn lại ra đồ to." },
        "sizeSplit.small": { label: "Mốc đồ nhỏ", pct: true, min: 0, max: 1 },
        "sizeSplit.medium": { label: "Mốc đồ vừa", pct: true, min: 0, max: 1, help: "Phải lớn hơn mốc đồ nhỏ." }
      }
    },

    loot_sizes: {
      title: "Cỡ đồ",
      blurb: "Bán kính, khối lượng và khoảng giá của đồ nhỏ, vừa, to.",
      effect: RUN,
      rowLabels: { "nhỏ": "Đồ nhỏ", "vừa": "Đồ vừa", "to": "Đồ to" },
      fields: {
        "_id": { label: "Mã", help: "Mã game dùng (có dấu). Giữ nguyên." },
        "order": { label: "Thứ tự", int: true, help: NOT_READ },
        "r": { label: "Bán kính", unit: "pixel", min: 1 },
        "mass": { label: "Khối lượng", min: 0 },
        "vmin": { label: "Giá thấp nhất", min: 0, int: true, help: "Nhà có bộ loot riêng thì giá theo bảng loot_items." },
        "vmax": { label: "Giá cao nhất", min: 0, int: true }
      }
    },

    loot_materials: {
      title: "Chất liệu đồ",
      blurb: "Độ giòn, ngưỡng va chạm, màu và lực ném trúng của từng chất liệu.",
      effect: RUN,
      rowLabels: { "hồn": "Hồn (orb)", "gốm": "Gốm", "gỗ": "Gỗ", "kim loại": "Kim loại" },
      fields: {
        "_id": { label: "Mã", help: "Mã game dùng (có dấu). Giữ nguyên." },
        "order": { label: "Thứ tự", int: true, help: NOT_READ },
        "frag": { label: "Độ giòn", min: 0, help: "Nhân vào mức mất giá mỗi cú va." },
        "thresh": { label: "Ngưỡng va chạm", min: 0, help: "Va mạnh hơn số này món mới bắt đầu mất giá." },
        "col": { label: "Màu", help: "#rrggbb" },
        "edge": { label: "Màu viền", help: "#rrggbb" },
        "shatter": { label: "Vỡ hẳn", help: "Bật = vỡ là mất sạch giá, thay vì mòn dần." },
        "hit": { label: "Hệ số sát thương khi ném trúng", min: 0 }
      }
    },

    loot_items: {
      title: "Giá từng món đồ",
      blurb: "Khoảng giá và chỗ rơi của từng món trong các bộ loot riêng (vampire, pyramid, spacestation, asylum).",
      effect: RUN,
      fields: {
        "_id": { label: "Mã", help: "<bộ>/<tên prefab>, chỉ để không trùng. Giữ nguyên." },
        "set": { label: "Bộ loot", help: "Khoá nhận diện món cùng với cỡ và ô; đổi là game không tìm thấy món." },
        "size": { label: "Cỡ", int: true, help: "0 nhỏ, 1 vừa, 2 to. Khoá nhận diện món, đừng đổi." },
        "slot": { label: "Ô trong dải hình", int: true, help: "Khoá nhận diện món, đừng đổi." },
        "vmin": { label: "Giá thấp nhất", min: 0 },
        "vmax": { label: "Giá cao nhất", min: 0 },
        "place": { label: "Chỗ rơi", help: "Anywhere = đâu cũng được, Floor = chỉ dưới đất, Table = chỉ trên mặt bàn." }
      }
    },

    safes_chests: {
      title: "Két sắt và rương",
      blurb: "Tỉ lệ có két theo nhà, số món trong két, số rương, tỉ lệ rương giả.",
      effect: RUN,
      fields: {
        "_id": CFG_ID,
        "safeRate": { label: "Tỉ lệ nhà có két", items: ["Nhà 1", "Nhà 2", "Nhà 3", "Nhà 4", "Nhà 5"], pct: true, min: 0, max: 1 },
        "safeItems": { label: "Số món két phun ra", items: MINMAX, min: 0, int: true },
        "safeSizeSmall": { label: "Két: mốc đồ nhỏ", pct: true, min: 0, max: 1, help: "Rút ngẫu nhiên: dưới mốc nhỏ ra đồ nhỏ, dưới mốc vừa ra đồ vừa, còn lại ra đồ to." },
        "safeSizeMedium": { label: "Két: mốc đồ vừa", pct: true, min: 0, max: 1 },
        "trapFromLevel": { label: "Rương có từ mức độ", min: 1, int: true, help: "Nhà có mức độ thấp hơn không có rương. Tên trường nói bẫy nhưng bẫy nay do designer đặt trong prefab phòng." },
        "chestCount": { label: "Số rương mỗi nhà", items: ["Mức có rương đầu tiên", "Dày nhất (6 mức sau)"], min: 0, int: true },
        "chestMimicRate": { label: "Tỉ lệ rương giả (Rương răng)", pct: true, min: 0, max: 1 },
        "chestItems": { label: "Số món trong rương", items: MINMAX, min: 0, int: true }
      }
    },

    station_upgrades: {
      title: "Nâng cấp ở trạm",
      blurb: "Giá gốc từng nâng cấp ở trạm dịch vụ giữa hai nhà.",
      effect: RUN,
      rowLabels: {
        hp: "Nâng máu", stam: "Nâng thể lực", str: "Nâng sức", range: "Nâng tầm với", sprint: "Nâng tốc độ chạy", rush: "Nước rút",
        push: "Đẩy", regen: "Hồi thể lực nhanh", light: "Nâng đèn", grip: "Găng chống sốc", slot: "Nâng túi đồ", cart: "Nâng thùng xe"
      },
      fields: {
        "_id": ID,
        "price": { label: "Giá gốc", min: 0, int: true, help: "Giá lần mua thứ n = giá gốc × hệ số tăng giá (station_rules) mũ n." }
      }
    },

    station_gear: {
      title: "Đồ nghề ở trạm",
      blurb: "Vũ khí và đồ dùng bán ở trạm: giá, số lần dùng, số món tối đa mỗi ca.",
      effect: RUN,
      rowLabels: {
        gun: "Súng lục", tranq: "Súng gây mê", bomb: "Lựu đạn", stun: "Lựu đạn choáng", xung: "Lựu đạn xung kích", chum: "Lựu đạn chùm",
        mine: "Mìn đặt", pry: "Xà beng", shotgun: "Súng nòng ngắn", laser: "Súng laser sạc", bat: "Gậy bóng chày", pan: "Chảo gang",
        sledge: "Búa tạ", machete: "Mã tấu", prodzap: "Dùi cui điện", inflatable: "Búa hơi", ringcarry: "Nhẫn nhẹ tay",
        ringspeed: "Nhẫn tốc", ringpower: "Nhẫn sức", ringguard: "Nhẫn chống vỡ"
      },
      fields: {
        "_id": ID,
        "price": { label: "Giá", min: 0, int: true },
        "uses": { label: "Số lần dùng", unit: "lần", min: 1, int: true },
        "stock": { label: "Số món tối đa mỗi ca", unit: "món", min: 0, int: true }
      }
    },

    station_healthpacks: {
      title: "Túi máu ở trạm",
      blurb: "Túi máu bán ở kệ riêng của trạm: giá và lượng máu hồi.",
      effect: RUN,
      rowLabels: { tui25: "Túi máu 25", tui50: "Túi máu 50", tui100: "Túi máu 100" },
      fields: {
        "_id": ID,
        "price": { label: "Giá", min: 0, int: true },
        "hp": { label: "Máu hồi", unit: "máu", min: 1 }
      }
    },

    station_vehicles: {
      title: "Xe ở trạm",
      blurb: "Xe máy và xe đẩy bán ở trạm: giá và số chiếc mua được mỗi ca.",
      effect: RUN,
      rowLabels: { scout: "Xe trinh sát", haul: "Xe chở đồ", day: "Xe đẩy thêm", mini: "Xe đẩy mini" },
      fields: {
        "_id": ID,
        "price": { label: "Giá", min: 0, int: true },
        "stock": { label: "Số chiếc tối đa mỗi ca", min: 0, int: true }
      }
    },

    station_rules: {
      title: "Luật trạm dịch vụ",
      blurb: "Hệ số tăng giá nâng cấp, số lần một nâng cấp được bày, số ô bày mỗi loại, thời gian tính tiền.",
      effect: RUN,
      fields: {
        "_id": CFG_ID,
        "upgradePriceGrowth": { label: "Hệ số tăng giá nâng cấp", min: 1, help: "Mỗi lần mua cùng một nâng cấp, giá nhân thêm số này." },
        "upgradeMaxSpawns": { label: "Số lần một nâng cấp được bày", min: 0, int: true, help: "Mỗi nâng cấp được bốc ra trạm tối đa bấy nhiêu lần một ca." },
        "slots": { label: "Số ô bày", help: "Không vượt số ô có sẵn trên prefab trạm." },
        "slots.upgrade": { label: "Ô nâng cấp", min: 0, max: 3, int: true },
        "slots.gear": { label: "Ô đồ nghề", min: 0, max: 5, int: true },
        "slots.vehicle": { label: "Ô xe", min: 0, max: 2, int: true },
        "payCountdown": { label: "Thời gian tính tiền", unit: "giây", min: 0, help: "Đặt đồ lên quầy rồi chờ bấy nhiêu giây; trong lúc đó còn lấy đồ ra được." }
      }
    },

    gacha_wheel: {
      title: "Bánh xe quái gacha",
      blurb: "Các ô trên bánh xe may rủi của quái gacha: hiệu ứng, phần trăm máu, trọng số, màu.",
      effect: RUN,
      rowTitle: "name",
      fields: {
        "_id": { label: "Số thứ tự ô", help: "0 = ô đầu. Giữ nguyên." },
        "name": { label: "Chữ trên ô" },
        "effect": { label: "Hiệu ứng", help: "Nothing = trượt, PartialHeal = hồi một phần, Damage = mất máu, FullHeal = hồi đầy, DieInstantly = chết ngay." },
        "val": { label: "Phần trăm máu", unit: "%", min: 0, help: "Hồi một phần và mất máu: % máu tối đa. Hiệu ứng khác bỏ qua số này." },
        "weight": { label: "Trọng số", min: 0, help: "Xác suất = trọng số / tổng trọng số; cũng quyết bề rộng ô. 0 = bỏ ô." },
        "color": { label: "Màu ô", help: "#rrggbb" }
      }
    },

    foes: {
      title: "Quái",
      blurb: "Máu, sát thương, hồi đòn, tốc độ của từng loài quái.",
      effect: RUN,
      rowLabels: {
        gunner: "Kẻ bắn", rook: "Kẻ húc", banger: "Bom con", gnome: "Gnome", mimic: "Rương răng", ghost: "Hồn ma",
        wallhand: "Bàn tay quỷ dị", mummy: "Xác ướp", brat: "Con nít ranh", headthrower: "Kẻ ném đầu", minelayer: "Kẻ gài mìn",
        impostor: "Kẻ giả mạo", gacha: "Quái gacha", hunter: "Kẻ truy lùng", vampire: "Ma cà rồng", nurse: "Y tá",
        joker: "Joker hề", alien: "Alien", pharaoh: "Pharaoh", longxuong: "Lồng của Pharaoh"
      },
      fields: {
        "_id": ID,
        "hp": { label: "Máu", min: 1 },
        "dmg": { label: "Sát thương", min: 0 },
        "cd": { label: "Hồi đòn", unit: "giây", min: 0 },
        "speed": { label: "Tốc độ", unit: "pixel/giây", min: 0 },
        "pack": { label: "Số con một đàn", min: 0, int: true, help: "Chỉ loài đi theo đàn mới có ô này." }
      }
    },

    run_timers: {
      title: "Đồng hồ trong ca",
      blurb: "Quái ngủ đầu ca, hồi sinh quái, sát thương tăng theo mức độ, đợt đuổi sau bệ cuối, xe tải hồi máu.",
      effect: RUN,
      fields: {
        "_id": CFG_ID,
        "initialSleep": { label: "Quái ngủ đầu ca" },
        "initialSleep.min": { label: "Ngủ ít nhất (mức độ 1)", unit: "giây", min: 0 },
        "initialSleep.max": { label: "Ngủ nhiều nhất (mức độ 1)", unit: "giây", min: 0 },
        "initialSleep.endLevel": { label: "Hết ngủ từ mức độ", min: 2, int: true },
        "initialSleep.exp": { label: "Độ cong giảm giờ ngủ", min: 0, help: "Giờ ngủ nhân (1 − (mức độ − 1) / (mức hết ngủ − 1)) mũ số này." },
        "initialSleep.skipChance": { label: "Tỉ lệ ca bỏ qua giờ ngủ", pct: true, min: 0, max: 1 },
        "foeRespawn": { label: "Thời gian hồi sinh quái", unit: "giây", min: 0 },
        "foeDmgPerLevel": { label: "Sát thương quái tăng mỗi mức độ", pct: true, min: 0 },
        "escape": { label: "Đợt đuổi sau bệ cuối", help: "Khoảng cách tính bằng pixel (1 ô = 24 pixel)." },
        "escape.delay": { label: "Chờ trước khi nhà trở mặt", unit: "giây", min: 0, help: "Tính từ lúc bệ cuối chốt." },
        "escape.respawn": { label: "Hồi sinh quái lúc chạy về", unit: "giây", min: 0 },
        "escape.hornN": { label: "Số lần xe tải rú", unit: "lần", min: 0, int: true },
        "escape.hornT": { label: "Rú trong khoảng", unit: "giây", min: 0 },
        "escape.hornR": { label: "Tiếng rú nghe xa", unit: "pixel", min: 0 },
        "escape.ping0": { label: "Chỉ điểm: khoảng cách lần đầu", unit: "giây", min: 0 },
        "escape.pingUp": { label: "Chỉ điểm: mỗi lần giãn thêm", unit: "giây", min: 0 },
        "escape.pingMax": { label: "Chỉ điểm: khoảng cách tối đa", unit: "giây", min: 0 },
        "escape.pingR": { label: "Chỉ điểm: tiếng lan xa", unit: "pixel", min: 0 },
        "escape.pingNear": { label: "Chỉ điểm: rơi quanh người", unit: "pixel", min: 0, help: "Chỉ điểm rơi trong bán kính này quanh người còn đứng." },
        "escape.hornAlert": { label: "Độ ồn tiếng rú", min: 0, help: "Mức báo động quái; 3 = to bằng một cú vụt trúng mặt." },
        "escape.pingAlert": { label: "Độ ồn tiếng chỉ điểm", min: 0, help: "2,2 = bằng tiếng bệ rút hàng." },
        "escape.dark": { label: "Bản đồ nhớ còn sáng", pct: true, min: 0, max: 1, help: "Đèn nhà tắt: phần trí nhớ căn nhà còn hiện." },
        "escape.darkT": { label: "Thời gian tắt đèn", unit: "giây", min: 0 },
        "escape.spotLo": { label: "Quái gọi thêm: gần xe tải nhất", unit: "pixel", min: 0, help: "Quái gọi thêm đứng thành vành quanh xe tải, giữa hai số gần nhất và xa nhất." },
        "escape.spotHi": { label: "Quái gọi thêm: xa xe tải nhất", unit: "pixel", min: 0 },
        "escape.spotClear": { label: "Quái gọi thêm: cách người còn sống ít nhất", unit: "pixel", min: 0 },
        "truckHeal": { label: "Xe tải hồi máu giữa các nhà" },
        "truckHeal.early": { label: "Nhà 1–2", unit: "máu", min: 0 },
        "truckHeal.mid": { label: "Nhà 3–4", unit: "máu", min: 0 },
        "truckHeal.late": { label: "Nhà 5 trở đi", unit: "máu", min: 0 },
        "truckHeal.patch": { label: "Máu tối thiểu khi vào nhà mới", unit: "máu", min: 0, help: "Sàn an toàn: không ai bước vào nhà mới dưới ngần này máu." },
        "reviveHp": { label: "Máu khi được đỡ dậy", unit: "máu", min: 1 },
        "rideHold": { label: "Giữ nút XUẤT PHÁT trên xe", unit: "giây", min: 0.3, max: 10, help: "Chặng trên xe giữa trạm dịch vụ và nhà sau: phải đè nút này đủ số giây thì xe mới chạy. Nhả giữa chừng là đếm lại." }
      }
    },

    decor_lights: {
      title: "Ánh sáng decor",
      blurb: "Mỗi dòng là một kiểu ánh sáng của decor (nến, bếp lửa, ống thí nghiệm, đèn chập chờn...): màu, bán kính, nhịp nhấp nháy và các decor dùng kiểu đó. Vòng sáng chỉ hiện khi đèn pin của người chơi soi trúng decor; thời gian hiện và tắt chỉnh ở Luật ải. Chỉ là hình, không đổi luật chơi.",
      effect: RUN,
      fields: {
        "_id": { label: "Mã kiểu sáng", help: "Giữ nguyên." },
        "color": { label: "Màu", help: "Mã màu dạng #rrggbb, ví dụ #ffa040 là cam nến." },
        "radiusTiles": { label: "Bán kính", unit: "ô", min: 0.5, max: 8, help: "Decor to hơn 2 ô nên đặt bán kính bằng nửa bề rộng decor cộng 1 đến 1,5 ô." },
        "intensity": { label: "Độ sáng ở tâm", pct: true, min: 0, max: 1 },
        "scaleAmp": { label: "Bán kính dao động", pct: true, min: 0, max: 0.3, help: "6% = vòng sáng phình co trong khoảng ±6% bán kính. Trên 15% trông như phồng xẹp." },
        "intensityAmp": { label: "Độ sáng dao động", pct: true, min: 0, max: 0.5 },
        "curve": { label: "Kiểu nhấp nháy", choices: [
          { v: "noise", label: "Nến: lay ngẫu nhiên" },
          { v: "surge", label: "Bếp lửa: bùng rồi lắng" },
          { v: "pattern", label: "Chuỗi tắt bật (đèn hỏng)" },
          { v: "pulse", label: "Thở đều" },
          { v: "heartbeat", label: "Nhịp tim" },
          { v: "glitch", label: "Màn hình: thỉnh thoảng nhiễu" }
        ] },
        "hz": { label: "Nhịp", unit: "lần/giây", min: 0, help: "Chỉ dùng cho Thở đều và Nhịp tim. 0,7 = máy thở đều; 0,25 = pha lê thở chậm; 1 = nhịp tim." },
        "pattern": { label: "Chuỗi tắt bật", help: "Chỉ dùng cho kiểu Chuỗi tắt bật. Đọc 10 chữ mỗi giây: a = tắt hẳn, m = sáng bình thường, z = sáng gấp đôi." },
        "decors": { label: "Decor dùng kiểu này", help: "Tên prefab decor trong game, ví dụ candlestick_triple. Sửa được tên; chưa thêm hay bớt ô được." },
        "decors.*": { label: "Decor" }
      }
    },

    endless_seasons: {
      title: "Theme Vô Tận theo tháng",
      blurb: "Mỗi tháng là một mùa Vô Tận (reset lúc 00:00 giờ VN ngày 1). Điền trước kiểu nhà cho các tháng tới; tháng chưa có dòng thì dùng \"Kiểu nhà khoá\" trong Luật chế độ Vô Tận.",
      effect: SERVER + " Không cần bản build mới.",
      rowPattern: { re: "^(\\d{4})-(\\d{2})$", text: "Tháng $2/$1" },
      addRow: { label: "Thêm tháng", placeholder: "VD 2026-12", button: "Thêm tháng", re: "^\\d{4}-(0[1-9]|1[0-2])$", invalid: "Nhập tháng dạng NĂM-THÁNG, ví dụ 2026-12.", exists: "Tháng này đã có dòng rồi.", help: "Gõ năm-tháng (2026-12) rồi bấm Thêm tháng; dòng mới lấy sẵn kiểu nhà của dòng cuối, rồi sửa và lưu." },
      fields: {
        "_id": { label: "Tháng", help: "Dạng NĂM-THÁNG. Giữ nguyên." },
        "houseStyle": { label: "Kiểu nhà của tháng", int: true, min: 17, max: 21, help: "17 Lâu đài vampire, 18 Kim tự tháp Ai Cập, 19 Khu vui chơi bỏ hoang, 20 Trạm vũ trụ, 21 Bệnh viện tâm thần." }
      }
    },

    rank_rewards: {
      title: "Thưởng bảng xếp hạng mùa (Vô Tận)",
      blurb: "Thưởng MÙA (tháng), gửi vào Hộp thư khi mùa kết thúc. Mỗi bảng (Một mình / Cùng bạn) có 7 mốc hạng riêng; các mốc cùng bảng không được chồng nhau. Mốc cuối \"Hạng >100\" (Hạng đến = 0, tức trở xuống) chỉ dành cho ai đã vượt ít nhất \"Nhà tối thiểu\" nhà. Xếp hạng theo nhà vượt cao hơn, rồi thời gian ít hơn, rồi tiền nhiều hơn.",
      effect: SERVER + " Không cần bản build mới.",
      rowLabels: {"solo_1_1":"Một mình · Top 1","solo_2_2":"Một mình · Top 2","solo_3_3":"Một mình · Top 3","solo_4_20":"Một mình · Hạng 4–20","solo_21_50":"Một mình · Hạng 21–50","solo_51_100":"Một mình · Hạng 51–100","solo_101_0":"Một mình · Hạng >100","coop_1_1":"Cùng bạn · Top 1","coop_2_2":"Cùng bạn · Top 2","coop_3_3":"Cùng bạn · Top 3","coop_4_20":"Cùng bạn · Hạng 4–20","coop_21_50":"Cùng bạn · Hạng 21–50","coop_51_100":"Cùng bạn · Hạng 51–100","coop_101_0":"Cùng bạn · Hạng >100"},
      fields: {
        "_id": { label: "Mã", help: "Dạng bảng_từ_đến, game tìm theo mã này. Giữ nguyên." },
        "board": { label: "Bảng", help: "solo = Một mình, coop = Cùng bạn. Giữ nguyên." },
        "rankFrom": { label: "Hạng từ", min: 1, int: true, help: "Hạng đầu của mốc (1 = nhất). Không chồng với mốc khác cùng bảng." },
        "rankTo": { label: "Hạng đến", min: 0, int: true, help: "Hạng cuối của mốc, không nhỏ hơn Hạng từ. 0 = trở xuống (không giới hạn)." },
        "minHouse": { label: "Nhà tối thiểu", unit: "nhà", min: 0, int: true, help: "Phải vượt ít nhất ngần này nhà trong mùa mới nhận thưởng mốc này. 0 = không cần." },
        "gold": { label: "Thưởng vàng", unit: "vàng", min: 0, int: true },
        "gem": { label: "Thưởng ngọc", unit: "ngọc", min: 0, int: true }
      }
    },

    endless_rules: {
      title: "Luật chế độ Vô Tận",
      blurb: "Nhà 1–5 chơi như ải thường. Từ nhà 6 trở đi, mỗi nhà thêm một bậc khó nhân cộng dồn lên số của nhà 5, cho tới khi chạm trần. Kiểu nhà khoá ở đây chỉ là theme dự phòng, dùng khi tháng đó chưa có dòng trong bảng Theme Vô Tận theo tháng.",
      effect: RUN,
      fields: {
        "_id": CFG_ID,
        "houseStyle": { label: "Kiểu nhà khoá (dự phòng)", int: true, min: 17, max: 21, help: "Theme dùng khi tháng chưa có dòng trong Theme Vô Tận theo tháng. Phải trùng một kiểu trong bảng Các nhà trong ải: 17 Lâu đài vampire, 18 Kim tự tháp Ai Cập, 19 Khu vui chơi bỏ hoang, 20 Trạm vũ trụ, 21 Bệnh viện tâm thần." },
        "levelStep": { label: "Mức độ tăng mỗi nhà", int: true, min: 0, help: "Từ nhà 6, mức độ (level) của nhà tăng thêm bấy nhiêu cho mỗi nhà." },
        "hpGrowth": { label: "Máu quái tăng mỗi nhà", pct: true, min: 0, help: "8% = mỗi nhà từ nhà 6, máu quái nhân thêm 8% so với nhà trước." },
        "dmgGrowth": { label: "Sát thương quái tăng mỗi nhà", pct: true, min: 0, help: "Như trên, áp cho sát thương quái." },
        "quotaGrowth": { label: "Chỉ tiêu giao hàng tăng mỗi nhà", pct: true, min: 0, help: "Như trên, áp cho tiền phải giao." },
        "maxMul": { label: "Trần hệ số", min: 1, help: "Hệ số nhân cộng dồn không vượt số này (4 = tối đa gấp 4 lần nhà 5). Phải từ 1 trở lên." },
        "roomEvery": { label: "Cứ bao nhiêu nhà thêm một phòng", int: true, min: 1, help: "Cứ mỗi bấy nhiêu nhà kể từ nhà 6, nhà thêm một phòng loot chung." },
        "maxExtraRooms": { label: "Số phòng thêm tối đa", unit: "phòng", int: true, min: 0, help: "Trần số phòng thêm so với nhà 5." },
        "lootGrowth": { label: "Giá trị đồ tăng mỗi nhà", pct: true, min: 0, max: 1, help: "8% = từ nhà 6, giá trị đồ đặt trong nhà tăng thêm 8% mỗi nhà, như chỉ tiêu. Từ 0% đến 100%." },
        "minHouseSeconds": { label: "Số giây tối thiểu mỗi nhà (chống gian lận)", unit: "giây", int: true, min: 0, help: "Qua nhà nhanh hơn mức này bị coi là gian lận, lượt không được ghi." },
        "fastHouseGrace": { label: "Số nhà được qua nhanh hơn mức trên ở đầu ca", unit: "nhà", int: true, min: 0, help: "Vài nhà đầu ca được phép qua nhanh hơn số giây tối thiểu mà không bị coi là gian lận." },
        "minCoopPlayers": { label: "Số người tối thiểu để chơi Cùng bạn", unit: "người", int: true, min: 1 },
        "maxCoopPlayers": { label: "Số người tối đa để chơi Cùng bạn", unit: "người", int: true, min: 1 },
        "mailDays": { label: "Thư thưởng hết hạn sau … ngày", unit: "ngày", int: true, min: 1, help: "Thư thưởng mùa nằm trong Hộp thư bấy nhiêu ngày rồi hết hạn." },
        "heldTopN": { label: "Giữ thưởng mùa của top … chờ duyệt (chống gian lận)", unit: "hạng", int: true, min: 0, help: "Thư thưởng mùa của hạng 1 tới hạng này bị giữ: người chơi chưa thấy và chưa nhận được cho tới khi admin thả (AC_MAIL_RELEASE) hoặc tới hạn tự thả bên dưới. 0 = không giữ ai." },
        "heldDays": { label: "Tự thả thưởng top sau … ngày", unit: "ngày", int: true, min: 0, help: "Không ai thả thì thư thưởng top tự nhận được sau bấy nhiêu ngày kể từ lúc hết mùa (0 giờ ngày 1, giờ VN). Thư bị giữ được cộng thêm bấy nhiêu ngày vào hạn nhận." },
        "rankedUnlockRuns": { label: "Số ca phải chơi để mở Vô Tận xếp hạng", unit: "ca", int: true, min: 1, help: "Người chơi mới phải hoàn tất ngần này ca thì mới vào được Vô Tận xếp hạng." }
      }
    },

    coop_rules: {
      title: "Luật mạng co-op",
      blurb: "Chọn hệ thống mạng cho phòng co-op. Chỉ áp cho phòng tạo MỚI sau khi lưu; phòng đang mở giữ nguyên hệ thống cũ.",
      effect: SERVER + " Không cần bản build mới.",
      fields: {
        "_id": CFG_ID,
        "netBackend": { label: "Mạng co-op Online của bản web (và app khi ô dưới chọn Relay Unity)", choices: [
          { v: "ngo", label: "Relay Unity (đang chạy)" },
          { v: "rtd", label: "Engine RTD (repo-topdown) — chưa chạy được game này" },
          { v: "steam", label: "Steam (chưa có)" }
        ], help: "Phòng đang mở giữ hệ thống mạng lúc tạo; chỉ phòng tạo sau khi đổi mới dùng giá trị này. Chọn hệ thống chưa chạy được thì phòng mới sẽ không vào được." },
        "appNet": { label: "Mạng co-op Online của bản app", choices: [
          { v: "eos", label: "EOS của Epic (miễn phí, mặc định)" },
          { v: "utp", label: "Relay Unity như web (tốn tiền relay và Vivox)" }
        ], help: "Chỉ bản app (Android, iOS) đọc; bản web luôn dùng Relay Unity. Chuyển sang Relay Unity khi EOS gặp sự cố: người chơi nhận ở lần mở game sau, phòng đang mở giữ nguyên. Thiếu trường = EOS. Bản app chưa có EOS bỏ qua công tắc này. Phòng EOS và phòng Relay Unity không vào chung được bằng mã." },
        "hostAwayGrace": { label: "Giây khách chờ chủ phòng app tạm rời", unit: "giây", min: 10, max: 600, int: true, help: "Chủ phòng trên app xuống nền (nghe điện thoại, đổi app) thì khách thấy \"Chủ phòng đang tạm rời\" và chờ thêm chừng này giây kể từ lúc mất kết nối với chủ (khoảng 30 s sau khi chủ xuống nền), nên đồng hồ khách thấy đếm từ số này cộng 30; chủ quay lại kịp thì ca chạy tiếp, quá thì khách rời ca. Chỉ áp cho phòng EOS của bản app. Thiếu trường = 90." },
        "poseSpeedMul": { label: "Hệ số tốc độ tối đa của khách (chống gian lận)", min: 1, help: "Chủ phòng không cho khách đi nhanh hơn tốc chạy tối đa nhân số này; vượt thì kéo về, không đá khỏi phòng. 1,1 = chừa 10% sai số khung hình." },
        "poseBurstSeconds": { label: "Giây đi dồn được sau lag", unit: "giây", min: 0, help: "Sau một lúc mạng chậm, gói tư thế dồn lại vẫn được nhận tối đa chừng này giây đường đi." },
        "poseRoundPx": { label: "Sai số làm tròn toạ độ", unit: "px", min: 0, help: "Khoảng cộng thêm vào trần quãng đi để không bắt nhầm do làm tròn toạ độ." },
        "intentPerSecond": { label: "Số thao tác mỗi giây của khách", min: 1, int: true, help: "Chủ phòng bỏ thao tác (đánh, dùng đồ…) vượt số này mỗi giây; người bấm nhanh khoảng 10 lần/giây." },
        "intentBurst": { label: "Số thao tác dồn tối đa", min: 1, int: true, help: "Bấm dồn một lúc tối đa chừng này thao tác trước khi bị bỏ." },
        "keyEvery": { label: "Nhịp ảnh chụp đầy đủ", unit: "tick", min: 0, int: true, help: "Cứ chừng này ảnh chụp (15 ảnh/giây) chủ phòng gửi mỗi khách một ảnh đầy đủ để sửa sai lệch; các khách được so le để không dồn cùng lúc. 450 = 30 giây. 0 = tắt." },
        "chargeSlackSeconds": { label: "Dung sai sạc của khách", unit: "giây", min: 0, help: "Mức sạc khách khai chỉ được nhận tối đa bằng thời gian chủ phòng đếm từ lúc bắt đầu sạc cộng số giây này; bù độ trễ giữa hai thao tác và cú chạm nhanh." },
        "stamGraceSeconds": { label: "Ân hạn thể lực của khách", unit: "giây", min: 0, help: "Thể lực khách đã cạn quá chừng này giây thì tư thế khai nước rút chỉ được đi tốc độ đi bộ; hai bên tính thể lực lệch nhịp nên cần chừa chút." },
        "noiseWindowSeconds": { label: "Cửa sổ đo tiếng động", unit: "giây", min: 0, help: "Chủ phòng đo quãng thân khách đã đi trong khoảng này để so với cần gạt khách khai; hai khoảng liền nhau lệch mới tính." },
        "noiseQuietSeconds": { label: "Giây nghỉ đo tiếng động sau khi bị hất", unit: "giây", min: 0, help: "Sau khi khách bị đau hay hất tung, chừng này giây không đo tiếng động (cú hất đi về khách rồi mới về lại tư thế)." },
        "buySlackTiles": { label: "Dung sai khoảng cách khi mua", unit: "ô", min: 0, help: "Khách mua hàng chỉ được nhận khi thân khách cách nút thanh toán không quá bán kính bước lên nút cộng chừng này ô." },
        "relayCapKBPerMin": { label: "Trần byte chủ phòng gửi (KB/phút, 0 = tắt)", unit: "KB/phút", min: 0, max: 100000, int: true, help: "Chủ phòng gửi ảnh chụp cho các khách tối đa bấy nhiêu KB mỗi phút, chia đều cho các khách; vượt trần thì khối ít gấp để nhịp sau và log cảnh báo relay-budget. 1024 = 1 MB/phút. 0 = tắt." },
        "relayCapBurstSeconds": { label: "Độ dồn cho phép", unit: "giây", min: 0.2, max: 10, help: "Cho dồn tối đa bấy nhiêu giây ngân sách trong một lúc." },
        "localStun": { label: "Máy STUN để nhận ra cùng mạng (Local)", help: "Địa chỉ STUN để máy hỏi IP công cộng của mình, dùng nhận ra những máy cùng mạng khi liệt kê phòng Local. Nhiều địa chỉ cách nhau dấu phẩy, ví dụ stun:stun.l.google.com:19302. Để trống = không lọc cùng mạng, chỉ vào được bằng mã phòng." },
        "localIce": { label: "Máy ICE cho kết nối Local, trống = chỉ cùng mạng", help: "Các địa chỉ ICE (STUN/TURN) cho phòng Local (web và app), cách nhau dấu phẩy. Trống = chỉ nối được các máy cùng mạng; có địa chỉ thì nối được cả máy khác mạng nhưng có thể tốn băng thông TURN." }
      }
    },

    modes: {
      title: "Bật / tắt chế độ chơi",
      blurb: "Tắt một chế độ thì thẻ của nó ở màn chọn chế độ hiện COMING SOON, người chơi bấm vào chỉ thấy thông báo COMING SOON. Ải 5 nhà luôn mở vì màn hướng dẫn chạy trên nó.",
      effect: "Người chơi thấy ở lần mở game sau (DEV trễ tối đa 60 giây), không cần bản build mới.",
      rowLabels: { coop: "Chơi với bạn", pvp: "Đấu đội 5v5", endless_solo: "Vô tận một mình", endless_coop: "Vô tận cùng bạn" },
      fields: {
        "_id": ID,
        "open": { label: "Mở cho người chơi", help: "Tắt = thẻ hiện COMING SOON, không vào được." },
        "unlockRuns": { label: "Số ca phải chơi để mở Đấu đội", int: true, min: 0, max: 1000, unit: "ca", help: "Chơi đủ số ca này thì thẻ Đấu đội 3v3 mở; 0 = mở ngay." },
        "localOpen": { label: "Local (cùng Wi-Fi)", help: "Chỉ có ở Chơi với bạn. Tắt = người chơi không chọn được Local; Online vẫn theo công tắc Online. Thiếu trường = mở." },
        "fakeOnline": { label: "Giả online (1 người + 9 bot)", help: "Bật = bấm TÌM TRẬN 5v5 hiện màn tìm trận giả rồi vào trận offline với 9 bot; không cần Relay hay UGS, công tắc Online ở Chơi với bạn (và tab Chi phí dịch vụ) không đóng được. Tắt = tìm trận online thật. Chỉ có tác dụng khi Mở cho người chơi đang bật. Bản game cũ hơn bản có tính năng này bỏ qua công tắc." },
        "fake": { label: "Màn tìm trận giả", help: "Chỉ dùng khi Giả online bật." },
        "fake.queueMin": { label: "Đủ người sớm nhất", unit: "giây", min: 0, max: 120, help: "Ghế lấp đủ 10/10 vào một lúc ngẫu nhiên giữa số này và số muộn nhất." },
        "fake.queueMax": { label: "Đủ người muộn nhất", unit: "giây", min: 0, max: 120, help: "Không nhỏ hơn số sớm nhất." },
        "fake.estimate": { label: "Ước tính hiện ra", unit: "giây", min: 0, max: 120, help: "Số hiện ở dòng \"Ước tính\" trên màn tìm trận." },
        "fake.fullHold": { label: "Giữ chữ \"Đủ người!\"", unit: "giây", min: 0, max: 10, help: "Đủ 10/10 thì chữ \"Đủ người!\" đứng chừng này giây trước màn đối đầu." },
        "fake.countdown": { label: "Đếm ngược màn đối đầu", unit: "giây", int: true, min: 1, max: 10, help: "Màn đối đầu đếm lùi từ số này (3 = 3-2-1) rồi vào trận." },
        "fake.pingMin": { label: "Ping thấp nhất", unit: "ms", int: true, min: 0, max: 999 },
        "fake.pingMax": { label: "Ping cao nhất", unit: "ms", int: true, min: 0, max: 999, help: "Ping hiện cạnh mỗi người là số ngẫu nhiên giữa ping thấp nhất và số này." },
        "fake.levelFloor": { label: "Cấp giữa tối thiểu của bot", unit: "cấp", int: true, min: 1, max: 999, help: "Bot rải quanh cấp người chơi, nhưng người chơi cấp thấp hơn số này thì bot rải quanh số này (người mới không gặp toàn bot cấp 1). Từng bot vẫn có thể lệch xuống dưới, không dưới cấp 1." },
        "fake.levelSpread": { label: "Cấp bot lệch quanh cấp người chơi", unit: "cấp", int: true, min: 0, max: 100, help: "Cấp bot = cấp giữa ± tối đa 1,5 lần số này, dồn về gần cấp giữa." },
        "fake.names": { label: "Tên bot giả", lines: 4, help: "Các tên cách nhau dấu phẩy, bot lấy ngẫu nhiên trong danh sách này. Để trống = dùng danh sách có sẵn trong game." },
        "score": { label: "Bảng xếp hạng cuối trận", help: "Điểm mỗi người = tiền × tiền mang lên bệ + hạ gục × số hạ gục + hỗ trợ × số hỗ trợ − gục × số lần gục. MVP = điểm cao nhất của phe thắng (hoà: cả trận). Thiếu khối này = game dùng số mặc định." },
        "score.money": { label: "Điểm mỗi 1 tiền mang lên bệ", min: 0, help: "Nhân với tiền mang lên bệ. 0,01 = 100 tiền được 1 điểm." },
        "score.kill": { label: "Điểm mỗi hạ gục", unit: "điểm", min: 0 },
        "score.assist": { label: "Điểm mỗi hỗ trợ", unit: "điểm", min: 0 },
        "score.death": { label: "Điểm trừ mỗi lần gục", unit: "điểm", min: 0, help: "Số dương, game trừ đi. 1 = mỗi lần gục mất 1 điểm." },
        "score.assistWindow": { label: "Cửa sổ hỗ trợ", unit: "giây", min: 0.1, max: 60, help: "Ai gây đòn lên nạn nhân trong ngần ấy giây trước khi nó gục (mà không phải người hạ) được 1 hỗ trợ. Lớn hơn 0, tối đa 60." },
        "bots": { label: "Bot đấu đội", help: "Cách bot hai phe vác đồ, đánh người, bấm chiêu và chơi trên đấu trường. Thiếu khối này = game dùng số mặc định (bằng số đang hiện). Ngoài Đấu đội 5v5 bot dùng số cũ riêng." },
        "bots.fumblePerSec": { label: "Xác suất tuột tay mỗi giây khi vác", min: 0, max: 1, help: "0..1. 0,01 = mỗi giây có 1% bot buông món đang vác." },
        "bots.regrabDelay": { label: "Chờ nhặt lại món vừa tuột", unit: "giây", min: 0, max: 10, help: "Tuột tay rồi, ngần này giây sau bot nhặt lại đúng món ấy." },
        "bots.carryDither": { label: "Xác suất đứng ngẩn khi vác", min: 0, max: 1, help: "0..1, mỗi nhịp nghĩ. 0 = bot đang vác đồ không bao giờ đứng ngẩn." },
        "bots.swingArc": { label: "Góc mặt tới là vụt", unit: "độ", min: 1, max: 180, help: "Bot chỉ vụt khi mặt đã quay tới trong ngần này độ quanh hướng nó định vụt." },
        "bots.aimErrDeg": { label: "Độ lệch nhát vụt tối đa", unit: "độ", min: 0, max: 90, help: "Mỗi nhát lệch tối đa ngần này độ khỏi chỗ bot thấy người kia, nhân thêm hệ số tay ngắm của từng bot." },
        "bots.aimLag": { label: "Độ trễ ngắm", unit: "giây", min: 0, max: 2, help: "Chỗ bot thấy người kia bám theo chỗ thật trễ chừng này; người kia lách hay lùi kịp thì nhát vụt trượt." },
        "bots.strafeFlipMin": { label: "Đổi chiều đi vòng sớm nhất", unit: "giây", min: 0.05, max: 30, help: "Lúc chờ hồi nhát bot đi vòng quanh người kia, cứ khoảng giữa số này và số muộn nhất thì đổi chiều. Không lớn hơn số muộn nhất." },
        "bots.strafeFlipMax": { label: "Đổi chiều đi vòng muộn nhất", unit: "giây", min: 0.05, max: 30 },
        "bots.backstepChance": { label: "Xác suất lùi một bước sau mỗi nhát", min: 0, max: 1, help: "0..1." },
        "bots.retreatHp": { label: "Máu bắt đầu rút lui", min: 0, max: 1, help: "0..1, phần máu tối đa. Tay không và máu dưới mức này (nhân hệ số cẩn thận) thì rút về đồng đội hoặc bệ." },
        "bots.retreatExitHp": { label: "Máu thôi rút lui", min: 0, max: 1, help: "0..1. Phải lớn hơn mức bắt đầu rút, không thì bot lật qua lại giữa đánh và rút." },
        "bots.retreatMaxT": { label: "Rút lui tối đa", unit: "giây", min: 0, max: 60, help: "Thôi rút sau ngần này giây dù máu chưa hồi." },
        "bots.castReactMin": { label: "Chờ bấm chiêu ngắn nhất", unit: "giây", min: 0, max: 10, help: "Từ lúc chiêu vừa đáng bấm tới lúc bấm, bốc ngẫu nhiên giữa số này và số dài nhất. Không lớn hơn số dài nhất." },
        "bots.castReactMax": { label: "Chờ bấm chiêu dài nhất", unit: "giây", min: 0, max: 10 },
        "bots.teamCastGap": { label: "Giãn cách bấm chiêu với đồng đội", unit: "giây", min: 0, max: 60, help: "Đồng đội trong 8 ô vừa bấm cùng chiêu chưa quá ngần này giây thì bot chưa bấm." },
        "bots.lootMemoryT": { label: "Nhớ món bao lâu", unit: "giây", min: 0, max: 600, help: "Phe bot còn nhớ vị trí một món ngần này giây sau lần cuối có người phe ấy thấy nó. Có người cầm món lên thì cả hai phe quên ngay. Chỉ dùng ở đấu trường." },
        "bots.freeDither": { label: "Xác suất đứng ngẩn khi tay không", min: 0, max: 1, help: "0..1, mỗi nhịp nghĩ. Chỉ dùng ở đấu trường." },
        "bots.wpPauseMin": { label: "Đứng nhìn quanh ngắn nhất", unit: "giây", min: 0, max: 10, help: "Ở mỗi điểm canh vùng giữa bot đứng nhìn quanh một lúc, bốc ngẫu nhiên giữa số này và số dài nhất. Không lớn hơn số dài nhất." },
        "bots.wpPauseMax": { label: "Đứng nhìn quanh dài nhất", unit: "giây", min: 0, max: 10 },
        "bots.wpRing": { label: "Bán kính vòng điểm canh", min: 0, max: 1, help: "0..1. Tám điểm canh nằm trên vòng quanh tâm vùng giữa; bán kính = phần này của nửa bề ngang / cao vùng giữa." },
        "bots.coverR": { label: "Tầm tìm chỗ nấp", unit: "ô", min: 0, max: 6, help: "Bot tìm chỗ nấp (sau một ô tường hay đồ, khuất người kia) trong tầm này lúc chờ hồi nhát hoặc lúc rút." },
        "bots.coverChance": { label: "Xác suất đi nấp sau mỗi nhát", min: 0, max: 1, help: "0..1. Đi nấp thay vì lùi hay đi vòng, nếu có chỗ nấp." },
        "bots.chaseCarrierR": { label: "Tầm đuổi người đang vác đồ", unit: "ô", min: 0, max: 30, help: "Bot tay không thấy người phe kia đang vác đồ trong tầm này (thấy được, không tường chắn) thì đuổi đánh. Tầm vào đánh thường là 5 ô." },
        "bots.idleThink": { label: "Chờ tối đa khi rảnh việc", unit: "giây", min: 0, max: 5, help: "Bot tay không, không có việc, chờ nhiều nhất ngần này giây trước khi nghĩ việc kế." },
        "bots.brains": { label: "Kiểu não bot", cols: ["id", "weight", "jobs.loot", "jobs.hunt", "jobs.chase", "jobs.escort", "jobs.hold", "jobs.foe", "jobs.retreat", "traits.aggression", "traits.caution", "traits.aim"],
          add: { button: "+ Thêm kiểu não", item: { weight: 1, jobs: { loot: 1, hunt: 1, chase: 1, escort: 1, hold: 1, foe: 1, retreat: 1 }, traits: { aggression: 0, caution: 0, aim: 0 } } },
          help: "Mỗi bot đấu trường bốc ngẫu nhiên một kiểu não theo Tỉ lệ bốc, từ hạt trận (cùng trận cùng bot thì cùng kiểu). Mỗi nhịp nghĩ bot chấm mọi việc làm được rồi nhân hệ số của việc ấy, làm việc điểm cao nhất. 1 = như bot chung, 0 = không bao giờ chọn việc đó, 2 = gấp đôi. Thiếu danh sách = game dùng năm kiểu có sẵn." },
        "bots.brains.*": { label: "Kiểu não" },
        "bots.brains.*.id": { label: "Mã kiểu não", re: "^[a-z0-9_]{1,40}$", unique: true, invalid: "Mã chỉ gồm chữ thường không dấu, số và dấu _, tối đa 40 ký tự.", help: "Mã riêng, không trùng. Công cụ đo và nhãn gỡ lỗi in mã này." },
        "bots.brains.*.weight": { label: "Tỉ lệ bốc", min: 0, max: 100, help: "Kiểu này được bốc theo tỉ lệ số này trên tổng. 0 = không bot nào mang kiểu này." },
        "bots.brains.*.jobs.loot": { label: "Nhặt đồ", min: 0, max: 10, help: "Hệ số việc nhặt đồ: đi lấy món phe mình đã thấy, kéo phụ món đồng đội đang kéo." },
        "bots.brains.*.jobs.hunt": { label: "Săn người", min: 0, max: 10, help: "Hệ số việc săn người: đi tìm người phe kia phe mình biết chỗ (chỗ đông người điểm cao hơn); cũng nới tầm vào đánh và cho vào đánh cả khi phe kia đông hơn." },
        "bots.brains.*.jobs.chase": { label: "Đuổi người vác", min: 0, max: 10, help: "Hệ số việc đuổi người vác: chặn đầu người phe kia đang vác đồ trên đường nó về bệ; cũng nới tầm đuổi người vác." },
        "bots.brains.*.jobs.escort": { label: "Hộ tống", min: 0, max: 10, help: "Hệ số việc hộ tống: đứng sát đồng đội đang vác, phía người phe kia; lúc hộ tống chỉ đánh kẻ áp sát người vác." },
        "bots.brains.*.jobs.hold": { label: "Giữ nửa nhà", min: 0, max: 10, help: "Hệ số việc giữ nửa nhà: đi các điểm canh ở nửa vùng giữa phía bệ mình." },
        "bots.brains.*.jobs.foe": { label: "Đánh quái", min: 0, max: 10, help: "Hệ số việc đánh quái: đi đánh quái vùng giữa thấy được; cũng làm bot bị quái dí quay lại đánh sớm hơn." },
        "bots.brains.*.jobs.retreat": { label: "Rút lui", min: 0, max: 10, help: "Hệ số việc rút lui: máu thấp mà người phe kia ở gần thì lui về đồng đội / bệ; cũng nâng mức máu bắt đầu rút." },
        "bots.brains.*.traits.aggression": { label: "Lệch hăng", min: -1, max: 1, help: "Cộng vào độ hăng ngẫu nhiên (0..1) của bot: hăng thì vào đánh xa hơn, ngẩn ít hơn. Kẹp trong 0..1 sau khi cộng." },
        "bots.brains.*.traits.caution": { label: "Lệch cẩn thận", min: -1, max: 1, help: "Cộng vào độ cẩn thận: cẩn thận thì rút ở mức máu cao hơn. Kẹp trong 0..1 sau khi cộng." },
        "bots.brains.*.traits.aim": { label: "Lệch tay ngắm", min: -1, max: 1, help: "Cộng vào tay ngắm: cao thì nhát vụt lệch ít hơn. Kẹp trong 0..1 sau khi cộng." },
        "bots.traits": { label: "Tính nết từng bot (tầm hệ số)", help: "Mỗi bot có ba tính nết ngẫu nhiên (hăng, cẩn thận, tay ngắm), mỗi tính chọn một hệ số trong tầm dưới đây. 1 = giữ nguyên số ở trên. Mỗi cặp không để hệ số nhỏ nhất lớn hơn hệ số lớn nhất." },
        "bots.traits.engageMin": { label: "Tầm vào đánh, hệ số nhỏ nhất", min: 0.1, max: 3, help: "Hệ số 0,1..3 nhân tầm vào đánh. Bot ít hăng nhất lấy số này." },
        "bots.traits.engageMax": { label: "Tầm vào đánh, hệ số lớn nhất", min: 0.1, max: 3, help: "Bot hăng nhất lấy số này." },
        "bots.traits.reactMin": { label: "Nhịp ngẩn trước khi lao vào, hệ số nhỏ nhất", min: 0, max: 5, help: "Hệ số 0..5. Bot hăng nhất lấy số này." },
        "bots.traits.reactMax": { label: "Nhịp ngẩn trước khi lao vào, hệ số lớn nhất", min: 0, max: 5 },
        "bots.traits.retreatMin": { label: "Máu rút lui, hệ số nhỏ nhất", min: 0, max: 5, help: "Hệ số 0..5 nhân Máu bắt đầu rút lui. Bot liều nhất lấy số này." },
        "bots.traits.retreatMax": { label: "Máu rút lui, hệ số lớn nhất", min: 0, max: 5, help: "Bot cẩn thận nhất lấy số này." },
        "bots.traits.aimMin": { label: "Độ lệch nhát vụt, hệ số nhỏ nhất", min: 0, max: 5, help: "Hệ số 0..5 nhân Độ lệch nhát vụt tối đa. Bot ngắm giỏi nhất lấy số này." },
        "bots.traits.aimMax": { label: "Độ lệch nhát vụt, hệ số lớn nhất", min: 0, max: 5, help: "Bot ngắm tệ nhất lấy số này." },
        "bots.redropCooldown": { label: "Để yên món vừa buông, theo lý do", help: "Số giây bot để yên món nó vừa buông, tuỳ lý do buông. Tuột tay không có ở đây (nhặt lại ngay). Tia đứt và bệ không nhận thì cả hai phe để yên món ấy chừng đó giây." },
        "bots.redropCooldown.snap": { label: "Tia đứt", unit: "giây", min: 0, max: 120 },
        "bots.redropCooldown.pad": { label: "Bệ không nhận", unit: "giây", min: 0, max: 120 },
        "bots.redropCooldown.flee": { label: "Bỏ chạy", unit: "giây", min: 0, max: 120 },
        "bots.redropCooldown.fight": { label: "Buông để đánh", unit: "giây", min: 0, max: 120 },
        "bots.redropCooldown.rescue": { label: "Buông để cứu đồng đội", unit: "giây", min: 0, max: 120 },
        "bots.redropCooldown.down": { label: "Bị hạ gục", unit: "giây", min: 0, max: 120 },
        "bots.redropCooldown.grab": { label: "Bị người kia giật", unit: "giây", min: 0, max: 120 },
        "mmk": { label: "Ghép trận Đấu đội", help: "Thời gian chờ ghép và cỡ đội." },
        "mmk.waitSec": { label: "Chờ ghép trước khi bot lấp chỗ", unit: "giây", min: 0, max: 600, help: "Sau ngần này giây chưa đủ người thật thì bot lấp các ghế còn trống." },
        "mmk.teamSize": { label: "Số người mỗi đội", int: true, min: 1, max: 10, unit: "người" },
        "arena": { label: "Đấu trường dựng tay", help: "Số cho các bố cục ở bảng Bố cục đấu trường 5v5. Loot và quái chỉ nằm ở vùng giữa để hai phe giành nhau. Thiếu khối này = game dùng số mặc định." },
        "arena.lootCount": { label: "Số món loot giữa sân lúc vào trận", int: true, min: 0, max: 200, unit: "món", help: "Bốc ngẫu nhiên trong vùng giữa lúc dựng trận; cũng là trần số món vùng giữa giữ được." },
        "arena.respawnMode": { label: "Luật mọc bù món", choices: [
          { v: "broken", label: "Chỉ mọc bù món vỡ" }, { v: "empty", label: "Luật cũ: mọc khi chỗ trống" }
        ], help: "Chỉ mọc bù món vỡ = món bị mang đi hẳn không mọc lại; luật cũ = chỗ nào trống thì mọc món mới." },
        "arena.chestCount": { label: "Số rương trên đấu trường", int: true, min: 0, max: 100, unit: "cái" },
        "arena.safeCount": { label: "Số két trên đấu trường", int: true, min: 0, max: 100, unit: "cái" },
        "arena.respawnDelay": { label: "Chờ trước khi mọc bù", unit: "giây", min: 0, max: 600, help: "Sau khi một món vùng giữa bị mang đi hẳn, ngần này giây sau mọc món thay ở một ô giữa trống, ngoài nón đèn của mọi người." },
        "arena.foeCount": { label: "Số quái to trên đấu trường", int: true, min: 1, max: 100, unit: "con", help: "Chỉ quái to (Kẻ húc, Kẻ truy lùng, Xác ướp)." }
      },
      // Extra switches under the coop row. Online is not an md_modes field: it is cd_cost_guard/relay.forceClosed, inverted.
      reach: {
        row: "coop",
        online: { label: "Online", help: "Qua Unity Relay (tốn tiền). Tắt cũng đóng Đấu đội 5v5 và Vô tận cùng bạn; có hiệu lực sau khoảng 20 giây. Lưu ngay khi bấm, cùng dữ liệu với tab Chi phí dịch vụ." },
        local: { label: "Local", help: "Cùng Wi-Fi, qua WebRTC, không dùng Relay hay Vivox. Bấm Lưu như các ô khác." },
        loading: "Đang tải Online…",
        saved: "Đã lưu Online"
      },
      // fakeOnline + fake + score show in their own row under pvp instead of grid columns.
      fakeRow: "pvp"
    },
    pvp_maps: {
      title: "Bố cục đấu trường 5v5",
      blurb: "Mỗi dòng là một bố cục đấu trường dựng tay của Đấu đội 5v5; mỗi trận game bốc một bố cục từ các dòng đang mở. Ở đây chỉ bật / tắt từng bố cục và chọn theme nó được bốc cùng. Sơ đồ ô (rows) và chú giải (legend) chỉ xem, vì sửa tay dễ phá đối xứng tâm: sửa trong gamespark-config/pvp_maps.json rồi đồng bộ.",
      effect: "Người chơi thấy ở lần mở game sau (DEV trễ tối đa 60 giây); bản game cũ hơn bản có bảng này dùng bố cục dựng sẵn trong code.",
      rowLabels: { nga_tu: "Ngã tư", phao_dai: "Pháo đài", ban_co: "Bàn cờ", classic: "Cổ điển" },
      fields: {
        "_id": ID,
        "open": { label: "Mở cho lượt bốc", help: "Tắt = bố cục này không vào lượt bốc. Tắt hết thì game dùng bố cục dựng sẵn." },
        "themes": { label: "Theme được bốc cùng", help: "Các khoá theme bố cục này được ghép: vampire, pyramid, vietnam, spacestation, asylum. Gõ sai khoá thì không lưu được." },
        "themes.*": { label: "Theme" },
        "rows": { label: "Sơ đồ ô (chỉ xem)", readonly: true, help: "Mỗi ký tự là một ô theo chú giải bên dưới; đối xứng tâm, viền là tường." },
        "legend": { label: "Chú giải ký tự (chỉ xem)", readonly: true, help: "wall = tường, floor = sàn ngoài, mid = sàn vùng giữa, foe = chỗ quái (cũng là vùng giữa), prop:room / block / tall / small = đồ của theme." }
      }
    },
    // Not an md_ table: runtime collection cd_cost_guard, one doc per paid service, saved through gs-design "guard_save".
    cost_guard: {
      title: "Chi phí dịch vụ",
      blurb: "Đặt mức chi tối đa mỗi tháng (USD) cho dịch vụ trả tiền theo lượng dùng. Ước tính vượt mức thì người chơi mới không vào được tính năng dùng dịch vụ đó.",
      effect: "Ngay ở lượt hỏi cổng kế tiếp của người chơi, không cần deploy (trang này sửa GameSpark DEV). Bảng chưa có dòng nào thì dịch vụ đó không bị canh (luôn mở).",
      note: "Đóng khi ước tính vượt ngưỡng; phòng đang chơi vẫn chạy tiếp nên hoá đơn có thể nhỉnh hơn ngưỡng.",
      noMeter: "chưa có số đo tháng này",
      stale: "chưa có người dùng gần đây hoặc bộ đếm đứng",
      why: { forced: "đóng tay", cap: "chạm ngưỡng" },
      services: {
        relay: { title: "Unity Relay", blocks: "Chặn tạo / tìm trận / vào phòng co-op mọi chế độ. Người đang trong phòng và Rejoin không bị chặn." },
        vivox: { title: "Vivox", blocks: "Chặn đăng nhập Vivox (chat chữ và voice co-op). Người đã đăng nhập giữ nguyên." }
      },
      fields: {
        capUsd: { label: "Ngưỡng đóng (USD / tháng)", help: "Ước tính tháng này vượt số này thì đóng. 0 = đóng ngay khi vượt phần miễn phí." },
        forceClosed: { label: "Đóng tay", help: "Bật = đóng dịch vụ ngay, bất kể chi phí." },
        reserve: { label: "Dự phòng (người)", help: "Cộng thêm vào lượng đang dùng khi xét cổng, bù độ trễ đo 1 đến 2 phút." },
        perGiB: { label: "Giá mỗi GiB (USD)" },
        freeGiBPerCcu: { label: "GiB miễn phí mỗi CCU" },
        freeGiBCap: { label: "Trần GiB miễn phí" },
        perCcu: { label: "Giá mỗi CCU (USD)" },
        freeCcu: { label: "CCU miễn phí" },
        overheadBytes: { label: "Byte đệm mỗi gói", help: "Cộng vào mỗi gói nhận để bù phần đầu gói mà client không thấy." },
        bytesFactor: { label: "Hệ số byte", help: "Nhân với tổng byte đo được; 1 = đo sao dùng vậy." },
        freePcu: { label: "PCU miễn phí" },
        stepPcu: { label: "Số PCU mỗi bậc" },
        perStep: { label: "Giá mỗi bậc (USD)" }
      },
      price: "Giá đơn vị (theo bảng giá nhà cung cấp)"
    },
    // Not an md_ table: runtime collection cd_client_gate, one doc "default", saved through gs-design "gate_save".
    client_gate: {
      title: "Phát hành & bảo trì",
      blurb: "Bật bảo trì khi cần đóng game, và đặt bản thấp nhất còn được vào game cho từng nền tảng: người chơi bản cũ hơn thấy bảng \"Cập nhật\" và không vào được.",
      effect: "Trong khoảng 30 giây ở lượt đăng nhập, vào ca hay vào phòng kế tiếp của người chơi, không cần deploy (trang này sửa GameSpark DEV).",
      missing: "Chưa có dòng điều khiển trên GameSpark nên cổng đang tắt: không bảo trì, bản nào cũng vào được. Lưu lần đầu sẽ tạo nó.",
      onNote: "Đang bảo trì: người chơi (trừ tester) không đăng nhập, không vào ca, không vào phòng được. Ca đang chơi vẫn chơi hết và lưu được.",
      confirmOn: "Bật bảo trì? Người chơi (trừ tester) sẽ không vào được game cho tới khi tắt.",
      maint: {
        title: "Bảo trì",
        on: { label: "Bảo trì", help: "Lưu ngay khi bấm, cùng lời nhắn và giờ đang gõ bên dưới. Bật thì hỏi lại trước." },
        message: { label: "Lời nhắn cho người chơi", help: "Hiện trong bảng bảo trì của game. Tối đa 300 ký tự." },
        until: { label: "Dự kiến xong lúc", help: "Không bắt buộc, chỉ để hiện cho người chơi; tắt bảo trì vẫn phải bấm tay. Nhập theo giờ máy bạn, lưu dưới dạng UTC." },
        save: "Lưu lời nhắn",
        saved: { on: "Đã bật bảo trì", off: "Đã tắt bảo trì", msg: "Đã lưu lời nhắn bảo trì" },
        status: { on: "Đang bảo trì", off: "Mở" }
      },
      net: {
        title: "Bảo trì mạng",
        note: "Khoá riêng từng đường mạng co-op với lý do bảo trì: Co-op Online, Co-op Vô Tận và PvP bị khoá; Co-op Local và chơi một mình vẫn mở.",
        ids: {
          eos: { label: "EOS (Epic Online Services)", help: "Phòng co-op Online trên app." },
          utp: { label: "Netcode (Unity Relay)", help: "Co-op trên web và đường dự phòng của app." }
        },
        on: { label: "Bảo trì", help: "Chỉ có hiệu lực sau khi bấm Lưu. Bật thì hỏi lại trước." },
        message: { label: "Lời nhắn cho người chơi", help: "Hiện làm lý do khoá chế độ. Tối đa 300 ký tự." },
        until: { label: "Dự kiến xong lúc", help: "Không bắt buộc, chỉ để hiện cho người chơi; tắt bảo trì vẫn phải bấm tay. Nhập theo giờ máy bạn, lưu dưới dạng UTC." },
        confirmOn: "Bật bảo trì mạng cho {names}? Các chế độ co-op và PvP dùng đường này sẽ bị khoá cho tới khi tắt.",
        save: "Lưu bảo trì mạng",
        saved: "Đã lưu bảo trì mạng"
      },
      build: {
        title: "Bản tối thiểu",
        note: "Bản thấp hơn số này không vào được game. 0 = không chặn. Đặt bất kỳ ô nào lớn hơn 0 thì bản game cũ chưa gửi số bản (mọi nền tảng) cũng bị chặn.",
        min: { label: "Bản thấp hơn số này không vào được game" },
        platforms: {
          webgl: { label: "Web (WebGL)", help: "Số bản web = số commit lúc build. Không được lớn hơn bản web đang có trên hub." },
          android: { label: "Android", help: "Số bản = số pipeline CI (versionCode)." },
          ios: { label: "iOS", help: "Số bản = số pipeline CI (CFBundleVersion)." }
        },
        hub: { label: "Bản web trên hub", none: "chưa có (bỏ qua kiểm tra)", loading: "đang đọc…" },
        overHub: "Web: bản tối thiểu {min} lớn hơn bản web đang có trên hub ({hub}), mọi người chơi web sẽ bị chặn. Phát hành bản web mới lên hub trước.",
        stores: {
          android: { label: "Link Google Play", help: "Nút Cập nhật trên Android mở link này." },
          ios: { label: "Link App Store", help: "Nút Cập nhật trên iOS mở link này." }
        },
        save: "Lưu",
        saved: "Đã lưu bản tối thiểu"
      }
    }
  };
})();
