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
      blurb: "Tài khoản mới nhận gì khi vào game lần đầu.",
      effect: "Chỉ áp cho tài khoản tạo SAU khi lưu.",
      fields: {
        "_id": CFG_ID,
        "gold": { label: "Vàng", unit: "vàng", min: 0, int: true },
        "gem": { label: "Ngọc", unit: "ngọc", min: 0, int: true },
        "ticketX": { label: "Vé Xác", unit: "vé", min: 0, int: true },
        "crew": { label: "Xác có sẵn", help: "Mã các xác người chơi mới có ngay, ví dụ bao (Flare)." },
        "crew.*": { label: "Mã xác" },
        "mateTactics": { label: "Chiến thuật 4 ô đồng đội", items: ["Ô 1", "Ô 2", "Ô 3", "Ô 4"], help: "Mã chiến thuật: loot, thu, soi, baoke, cuuho, nhu, san, tiepte." }
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
        "skill.heal": { label: "Hồi máu mỗi giây", unit: "máu", min: 0 },
        "skill.dmg": { label: "Sát thương kỹ năng", min: 0 },
        "skill.stun": { label: "Thời gian choáng", unit: "giây", min: 0 },
        "skill.dist": { label: "Quãng dịch chuyển", unit: "ô", min: 0 }
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
      blurb: "Cấp tối đa, giá vàng, mảnh, phần tăng chỉ số mỗi cấp, mốc giảm hồi chiêu và mốc mở nội tại.",
      effect: LOBBY,
      fields: {
        "_id": CFG_ID,
        "maxLevel": { label: "Cấp tối đa", min: 1, int: true },
        "goldBase": { label: "Vàng gốc", unit: "vàng", min: 0, int: true, help: "Giá lên cấp = vàng gốc × (cấp + 1)." },
        "shardPerLevel": { label: "Mảnh mỗi cấp", unit: "mảnh", min: 0, int: true },
        "statPerLevel": { label: "Chỉ số tăng mỗi cấp", pct: true, min: 0, help: "0,038 = mỗi cấp cộng 3,8% chỉ số gốc." },
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
        "vnd": { label: "Giá", unit: "VND", min: 0, int: true },
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
      blurb: "Nhiệm vụ ngày, nhiệm vụ tuần và thành tựu: điều kiện và phần thưởng.",
      effect: SERVER,
      rowLabels: { daily: "Nhiệm vụ ngày", weekly: "Nhiệm vụ tuần", ach: "Thành tựu" },
      fields: {
        "_id": ID,
        "pick": { label: "Số nhiệm vụ mỗi kỳ", min: 0, int: true, help: "Bốc ngẫu nhiên bấy nhiêu nhiệm vụ từ danh sách. 0 = lấy hết." },
        "list": { label: "Danh sách" },
        "list.*": { label: "Nhiệm vụ" },
        "list.*.id": { label: "Mã nhiệm vụ" },
        "list.*.text": { label: "Mô tả", help: "Chữ người chơi thấy. Đổi số cần đạt thì sửa cả chữ này." },
        "list.*.metric": { label: "Đếm theo", help: "Mã bộ đếm: runs, loot, skills, kills, floors, pulls, revives, wins, upgrades, squadFull, mapsDone." },
        "list.*.need": { label: "Cần đạt", min: 1, int: true },
        "list.*.reward": { label: "Thưởng" },
        "list.*.reward.gold": { label: "Vàng", unit: "vàng", min: 0, int: true },
        "list.*.reward.gem": { label: "Ngọc", unit: "ngọc", min: 0, int: true },
        "list.*.reward.ticketX": { label: "Vé Xác", unit: "vé", min: 0, int: true }
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
        "clear.gem": { label: "Ngọc", unit: "ngọc", min: 0, int: true },
        "first": { label: "Thưởng lần đầu", help: "Thưởng thêm cho lần phá đảo đầu tiên." },
        "first.gold": { label: "Vàng", unit: "vàng", min: 0, int: true },
        "first.gem": { label: "Ngọc", unit: "ngọc", min: 0, int: true }
      }
    },

    run_reward: {
      title: "Thưởng sau ca",
      blurb: "Đổi giá trị đồ đã giao ra vàng, và ngọc thưởng ca co-op theo số tầng.",
      effect: SERVER,
      fields: {
        "_id": CFG_ID,
        "lootGoldRate": { label: "Vàng theo giá trị đồ giao", pct: true, min: 0, help: "55% = nhận vàng bằng 55% tổng giá trị đồ đã giao." },
        "coopGemPerStep": { label: "Ngọc co-op mỗi chặng", unit: "ngọc", min: 0, int: true, help: "Ca co-op: nhận bấy nhiêu ngọc cho mỗi chặng tầng đã qua." },
        "coopFloorsPerStep": { label: "Số tầng mỗi chặng ngọc co-op", min: 1, int: true },
        "coopTierFloors": { label: "Số tầng mỗi bậc co-op", min: 1, int: true, help: "Bậc = số tầng chia số này; chỉ để hiện, không đổi thưởng." }
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
        "loot": { label: "Bộ hình loot", help: "vampire, asylum… Để trống = hình chung." },
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
        "gasRangeMax": { label: "Tầm khí độc tối đa (phòng rộng)", unit: "ô", min: 1 }
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
      blurb: "Khoảng giá và chỗ rơi của từng món trong các bộ loot riêng (vampire, asylum).",
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
        "escape.waveT": { label: "Đợt quái gọi thêm rải trong", unit: "giây", min: 0 },
        "escape.waveMin": { label: "Đợt gọi thêm ít nhất", min: 0, int: true, help: "Tính bằng số con, không phải số đàn." },
        "escape.waveMax": { label: "Đợt gọi thêm nhiều nhất", min: 0, int: true },
        "escape.packMin": { label: "Đợt tối thiểu để kèm đàn", min: 0, int: true, help: "Đợt nhỏ hơn số này thì không kèm quái đi đàn." },
        "escape.spotLo": { label: "Quái gọi thêm: gần xe tải nhất", unit: "pixel", min: 0, help: "Quái gọi thêm đứng thành vành quanh xe tải, giữa hai số gần nhất và xa nhất." },
        "escape.spotHi": { label: "Quái gọi thêm: xa xe tải nhất", unit: "pixel", min: 0 },
        "escape.spotClear": { label: "Quái gọi thêm: cách người còn sống ít nhất", unit: "pixel", min: 0 },
        "truckHeal": { label: "Xe tải hồi máu giữa các nhà" },
        "truckHeal.early": { label: "Nhà 1–2", unit: "máu", min: 0 },
        "truckHeal.mid": { label: "Nhà 3–4", unit: "máu", min: 0 },
        "truckHeal.late": { label: "Nhà 5 trở đi", unit: "máu", min: 0 },
        "truckHeal.patch": { label: "Máu tối thiểu khi vào nhà mới", unit: "máu", min: 0, help: "Sàn an toàn: không ai bước vào nhà mới dưới ngần này máu." },
        "reviveHp": { label: "Máu khi được đỡ dậy", unit: "máu", min: 1 }
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
        "rankedUnlockRuns": { label: "Số ca phải chơi để mở Vô Tận xếp hạng", unit: "ca", int: true, min: 1, help: "Người chơi mới phải hoàn tất ngần này ca thì mới vào được Vô Tận xếp hạng." }
      }
    }
  };
})();
