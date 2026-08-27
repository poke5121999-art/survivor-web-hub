/*
 * Ca Trực Đêm: Biệt Đội — bảng nội dung (content tables).
 *
 * WHY: mọi con số cân bằng của game nằm ĐÚNG một chỗ, để sửa balance không phải
 *      lục trong code mô phỏng.
 * ROOT-CAUSE: bản web cũ (games/repo2d) rải hằng số khắp một file 350 KB; đổi một
 *      con số phải đọc cả file mới dám sửa.
 * SEE: docs/proposals/repo-squad.md
 *
 * Toàn bộ file này là DỮ LIỆU thuần — không đọc DOM, không đụng trạng thái ván chơi.
 */
(function (root) {
  'use strict';

  const SQ = root.SQ = root.SQ || {};

  // ---------------------------------------------------------------------------
  // Chỉ số dùng chung. Mọi nơi trong game chỉ được nói tới 8 khoá này.
  // ---------------------------------------------------------------------------
  SQ.STATS = {
    atk:   { key: 'atk',   name: 'Sát thương',  short: 'ATK',  fmt: 'int' },
    hp:    { key: 'hp',    name: 'Máu',         short: 'HP',   fmt: 'int' },
    spd:   { key: 'spd',   name: 'Tốc chạy',    short: 'SPD',  fmt: 'pct' },
    carry: { key: 'carry', name: 'Sức mang',    short: 'MANG', fmt: 'pct' },
    cd:    { key: 'cd',    name: 'Giảm hồi chiêu', short: 'CD', fmt: 'pct' },
    luck:  { key: 'luck',  name: 'Giá đồ',      short: 'GIÁ',  fmt: 'pct' },
    eye:   { key: 'eye',   name: 'Tầm nhìn',    short: 'NHÌN', fmt: 'pct' },
    grit:  { key: 'grit',  name: 'Giáp',        short: 'GIÁP', fmt: 'pct' }
  };
  SQ.STAT_KEYS = ['atk', 'hp', 'spd', 'carry', 'cd', 'luck', 'eye', 'grit'];

  // ---------------------------------------------------------------------------
  // Độ hiếm. 3★ / 4★ / 5★ — giống hệ thống người chơi gacha đã quen.
  // ---------------------------------------------------------------------------
  SQ.RARITY = {
    3: { star: 3, name: 'Thường',     color: '#7f97ad', glow: 'rgba(127,151,173,.35)' },
    4: { star: 4, name: 'Kỳ Cựu',     color: '#a678d8', glow: 'rgba(166,120,216,.40)' },
    5: { star: 5, name: 'Huyền Thoại', color: '#e0a53c', glow: 'rgba(224,165,60,.45)' }
  };

  // ---------------------------------------------------------------------------
  // XÁC (nhân vật). Mỗi xác có ĐÚNG một kỹ năng chủ động, bấm nút để dùng.
  //
  // hp/atk/spd/carry là chỉ số gốc ở cấp 1. Cấp xác (1..30) nhân tuyến tính.
  // atkR: tầm đánh thường, tính theo ô (TILE). atkCd: giây giữa hai nhát.
  // skill.cd: giây hồi chiêu gốc, trước khi trừ "Giảm hồi chiêu".
  // ---------------------------------------------------------------------------
  SQ.CHARS = [
    // ---- 3★ : có sẵn / rơi nhiều ----
    {
      id: 'bao', name: 'Bảo', epithet: 'Đèn Pin', star: 3, hue: 48,
      hp: 105, atk: 9, spd: 1.00, carry: 32, grit: 0, atkR: 1.9, atkCd: 0.85,
      passive: { name: 'Quen Đường', desc: 'Vùng đã đi qua sáng lâu hơn 40%.' },
      skill: {
        id: 'flash', name: 'Chói Loà', cd: 16, dur: 3, radius: 5.5,
        desc: 'Loé đèn: mọi con quái trong 5,5 ô đứng hình 3 giây và quên mục tiêu.'
      }
    },
    {
      id: 'hue', name: 'Huệ', epithet: 'Y Tá Ca Ba', star: 3, hue: 140,
      hp: 120, atk: 7, spd: 0.97, carry: 28, grit: 0.05, atkR: 1.8, atkCd: 0.95,
      passive: { name: 'Băng Gạc', desc: 'Đồng đội đứng cạnh hồi 1 máu mỗi giây.' },
      skill: {
        id: 'healring', name: 'Vòng Hồi', cd: 20, dur: 6, radius: 4.2, heal: 9,
        desc: 'Đặt vòng sáng tại chỗ: ai đứng trong đó hồi 9 máu mỗi giây trong 6 giây.'
      }
    },
    {
      id: 'tam', name: 'Tâm', epithet: 'Cửu Vạn', star: 3, hue: 25,
      hp: 135, atk: 8, spd: 0.94, carry: 46, grit: 0.10, atkR: 1.7, atkCd: 1.0,
      passive: { name: 'Vai U', desc: 'Đồ nặng chỉ ăn 70% mức phạt tốc độ.' },
      skill: {
        id: 'gong', name: 'Gồng', cd: 18, dur: 8,
        desc: 'Gồng 8 giây: bỏ hết phạt trọng lượng và chạy nhanh hơn 30%.'
      }
    },
    {
      id: 'ky', name: 'Kỳ', epithet: 'Thợ Khoá', star: 3, hue: 200,
      hp: 100, atk: 10, spd: 1.02, carry: 30, grit: 0, atkR: 2.0, atkCd: 0.8,
      passive: { name: 'Tay Nghề', desc: 'Cạy cửa kẹt nhanh gấp đôi.' },
      skill: {
        id: 'unlock', name: 'Mở Toang', cd: 22, radius: 9,
        desc: 'Bung mọi cửa khoá/kẹt trong 9 ô — kể cả cửa bạn chưa nhìn thấy.'
      }
    },

    // ---- 4★ ----
    {
      id: 'linh', name: 'Linh', epithet: 'Bóng', star: 4, hue: 275,
      hp: 96, atk: 12, spd: 1.08, carry: 30, grit: 0, atkR: 1.9, atkCd: 0.7,
      passive: { name: 'Chân Mèo', desc: 'Tiếng động phát ra chỉ bằng một nửa.' },
      skill: {
        id: 'vanish', name: 'Tàng Hình', cd: 24, dur: 6,
        desc: 'Biến mất 6 giây: quái không nhìn thấy, không nghe thấy bạn.'
      }
    },
    {
      id: 'dung', name: 'Dũng', epithet: 'Xà Beng', star: 4, hue: 8,
      hp: 150, atk: 16, spd: 0.95, carry: 40, grit: 0.14, atkR: 2.1, atkCd: 1.05,
      passive: { name: 'Lì Đòn', desc: 'Bị đánh không rơi đồ đang vác.' },
      skill: {
        id: 'shock', name: 'Xung Chấn', cd: 17, radius: 5, dmg: 34, stun: 2.2,
        desc: 'Nện sàn: quái quanh 5 ô văng ra, choáng 2,2 giây và ăn 34 sát thương.'
      }
    },
    {
      id: 'mai', name: 'Mai', epithet: 'Mồi', star: 4, hue: 320,
      hp: 104, atk: 11, spd: 1.05, carry: 30, grit: 0, atkR: 2.2, atkCd: 0.75,
      passive: { name: 'Tai Thính', desc: 'Thấy quái trên bản đồ nhỏ xa hơn 50%.' },
      skill: {
        id: 'decoy', name: 'Mồi Nhử', cd: 19, dur: 9, radius: 16,
        desc: 'Ném hộp kêu: quái trong 16 ô bỏ mọi thứ, kéo hết về chỗ hộp trong 9 giây.'
      }
    },
    {
      id: 'phuc', name: 'Phúc', epithet: 'Cứu Hộ', star: 4, hue: 96,
      hp: 128, atk: 10, spd: 1.02, carry: 34, grit: 0.08, atkR: 1.8, atkCd: 0.9,
      passive: { name: 'Kéo Lê', desc: 'Đỡ đồng đội dậy nhanh gấp đôi.' },
      skill: {
        id: 'rescue', name: 'Kéo Về', cd: 26,
        desc: 'Giật mọi đồng đội đang gục về cạnh mình và đỡ dậy ngay một người.'
      }
    },
    {
      id: 'son', name: 'Sơn', epithet: 'Kẽm Gai', star: 4, hue: 178,
      hp: 140, atk: 9, spd: 0.96, carry: 36, grit: 0.16, atkR: 1.7, atkCd: 1.0,
      passive: { name: 'Chắn', desc: 'Giảm thêm 8% sát thương cho cả tổ đứng cạnh.' },
      skill: {
        id: 'cage', name: 'Lồng Sắt', cd: 21, dur: 9,
        desc: 'Dựng bốn tấm chắn quanh mình: quái không đi qua được trong 9 giây.'
      }
    },

    // ---- 5★ ----
    {
      id: 'nga', name: 'Nga', epithet: 'Chớp', star: 5, hue: 190,
      hp: 112, atk: 18, spd: 1.12, carry: 34, grit: 0.05, atkR: 2.2, atkCd: 0.62,
      passive: { name: 'Bước Hụt', desc: 'Sau khi dịch chuyển, 2 giây đầu không ăn sát thương.' },
      skill: {
        id: 'blink', name: 'Chớp', cd: 12, dist: 6.5,
        desc: 'Dịch chuyển 6,5 ô theo hướng đang đi — xuyên tường — và để lại một bóng giả đánh lạc hướng.'
      }
    },
    {
      id: 'khoi', name: 'Khôi', epithet: 'Mắt Thần', star: 5, hue: 55,
      hp: 108, atk: 15, spd: 1.04, carry: 32, grit: 0.05, atkR: 2.6, atkCd: 0.72,
      passive: { name: 'Đo Đạc', desc: 'Cả tổ nhìn xa thêm 15%.' },
      skill: {
        id: 'reveal', name: 'Thấu Thị', cd: 25, dur: 12,
        desc: 'Lộ toàn bộ tầng trong 12 giây: đồ, quái, bệ giao hàng — và cả tổ nhìn xa gấp rưỡi.'
      }
    },
    {
      id: 'van', name: 'Vân', epithet: 'Băng', star: 5, hue: 205,
      hp: 116, atk: 17, spd: 1.03, carry: 32, grit: 0.06, atkR: 2.4, atkCd: 0.75,
      passive: { name: 'Hơi Lạnh', desc: 'Quái bị bạn đánh chậm đi 25% trong 2 giây.' },
      skill: {
        id: 'freeze', name: 'Đóng Băng', cd: 23, dur: 4.5, radius: 8,
        desc: 'Đóng băng mọi con quái trong 8 ô suốt 4,5 giây; đánh vào chúng ăn thêm 50% sát thương.'
      }
    },
    {
      id: 'hai', name: 'Hải', epithet: 'Từ Trường', star: 5, hue: 285,
      hp: 110, atk: 14, spd: 1.02, carry: 44, grit: 0.05, atkR: 2.3, atkCd: 0.8,
      passive: { name: 'Hút Nhẹ', desc: 'Đồ nhỏ trong 2 ô tự bay vào tay.' },
      skill: {
        id: 'pull', name: 'Kéo Đồ', cd: 20, radius: 11,
        desc: 'Hút mọi món đồ rơi trong 11 ô bay thẳng lên bệ giao hàng gần nhất.'
      }
    },
    {
      id: 'tuyet', name: 'Tuyết', epithet: 'Bất Tử', star: 5, hue: 350,
      hp: 125, atk: 16, spd: 1.05, carry: 34, grit: 0.10, atkR: 2.2, atkCd: 0.78,
      passive: { name: 'Rọi Sáng', desc: 'Đồng đội gục cạnh bạn không mất máu tối đa.' },
      skill: {
        id: 'angel', name: 'Thiên Thần', cd: 30, dur: 5,
        desc: 'Đỡ dậy tất cả người đang gục và cho cả tổ 5 giây không thể chết.'
      }
    }
  ];
  SQ.CHAR_BY_ID = {};
  SQ.CHARS.forEach(c => { SQ.CHAR_BY_ID[c.id] = c; });

  // ---------------------------------------------------------------------------
  // CHIẾN THUẬT cho từng bot trong tổ. Người chơi gán một cái cho mỗi bot.
  //   bonus: chỉ số cộng thêm khi bot chạy đúng vai.
  // ---------------------------------------------------------------------------
  SQ.TACTICS = [
    { id: 'loot',   name: 'Khuân đồ',  icon: '📦', bonus: { carry: 0.15, luck: 0.05 },
      desc: 'Lao vào món đắt nhất gần nhất, vác thẳng ra bệ. Tránh đánh nhau.' },
    { id: 'thu',    name: 'Thủ bệ',    icon: '🛡️', bonus: { grit: 0.10, atk: 0.10 },
      desc: 'Bám bệ giao hàng, chặn quái mò tới, nhặt đồ ai đánh rơi gần bệ.' },
    { id: 'soi',    name: 'Soi map',   icon: '🔦', bonus: { eye: 0.30, spd: 0.08 },
      desc: 'Đi xa nhất, mở bản đồ và chấm vị trí đồ cho cả tổ. Thấy quái là né.' },
    { id: 'baoke',  name: 'Bảo kê',    icon: '🥊', bonus: { atk: 0.15, grit: 0.08 },
      desc: 'Bám sát bạn, cắt mặt con quái nào đang đuổi bạn.' },
    { id: 'cuuho',  name: 'Giải cứu',  icon: '🚑', bonus: { spd: 0.10, grit: 0.06 },
      desc: 'Ai gục là chạy tới đỡ dậy trước đã; rảnh thì khuân đồ nhẹ.' },
    { id: 'nhu',    name: 'Nhử mồi',   icon: '🔔', bonus: { spd: 0.14 },
      desc: 'Cố tình gây tiếng ở góc xa để kéo quái khỏi chỗ cả tổ đang làm.' },
    { id: 'san',    name: 'Săn quái',  icon: '⚔️', bonus: { atk: 0.22 },
      desc: 'Chủ động tìm quái mà đánh. Quái chết rơi tiền và mảnh.' },
    { id: 'tiepte', name: 'Tiếp tế',   icon: '💉', bonus: { cd: 0.15 },
      desc: 'Đứng giữa đội hình, giữ khoảng cách, ưu tiên bấm kỹ năng hỗ trợ sớm.' }
  ];
  SQ.TACTIC_BY_ID = {};
  SQ.TACTICS.forEach(t => { SQ.TACTIC_BY_ID[t.id] = t; });

  // ---------------------------------------------------------------------------
  // TRANG BỊ. Sáu ô, giống Genshin: chọn XÁC trước, rồi lắp đồ cho xác đó.
  //   mains: các chỉ số chính có thể ra ở ô đó.
  // ---------------------------------------------------------------------------
  SQ.SLOTS = [
    { id: 'mu',   name: 'Mũ',   icon: '⛑️', mains: ['hp', 'grit'] },
    { id: 'ao',   name: 'Áo',   icon: '🧥', mains: ['hp', 'grit', 'atk'] },
    { id: 'gang', name: 'Găng', icon: '🧤', mains: ['atk', 'cd'] },
    { id: 'giay', name: 'Giày', icon: '🥾', mains: ['spd', 'carry'] },
    { id: 'den',  name: 'Đèn',  icon: '🔦', mains: ['eye', 'luck'] },
    { id: 'tui',  name: 'Túi',  icon: '🎒', mains: ['carry', 'luck'] }
  ];
  SQ.SLOT_BY_ID = {};
  SQ.SLOTS.forEach(s => { SQ.SLOT_BY_ID[s.id] = s; });

  // Bộ đồ (set): lắp đủ 2 / 4 món cùng bộ thì được thưởng.
  SQ.SETS = [
    { id: 'caibang', name: 'Cái Bang', p2: { carry: 0.12 }, p4: { luck: 0.15 },
      d2: 'Sức mang +12%', d4: 'Giá đồ +15%' },
    { id: 'thoxay',  name: 'Thợ Xây',  p2: { grit: 0.10 },  p4: { hp: 0.18 },
      d2: 'Giáp +10%',    d4: 'Máu +18%' },
    { id: 'dolang',  name: 'Đồ Lăng',  p2: { spd: 0.08 },   p4: { cd: 0.16 },
      d2: 'Tốc chạy +8%', d4: 'Giảm hồi chiêu +16%' },
    { id: 'satthu',  name: 'Sát Thủ',  p2: { atk: 0.12 },   p4: { atk: 0.20 },
      d2: 'Sát thương +12%', d4: 'Sát thương +20%' },
    { id: 'canhgac', name: 'Canh Gác', p2: { eye: 0.15 },   p4: { grit: 0.14 },
      d2: 'Tầm nhìn +15%', d4: 'Giáp +14%' }
  ];
  SQ.SET_BY_ID = {};
  SQ.SETS.forEach(s => { SQ.SET_BY_ID[s.id] = s; });

  // Giá trị chỉ số chính, theo sao, ở cấp 0 và cấp tối đa (20).
  SQ.MAIN_CURVE = {
    atk:   { 3: [6, 26],    4: [10, 46],   5: [15, 72] },
    hp:    { 3: [40, 170],  4: [70, 300],  5: [110, 470] },
    spd:   { 3: [.03, .10], 4: [.05, .16], 5: [.07, .24] },
    carry: { 3: [.06, .20], 4: [.10, .32], 5: [.14, .46] },
    cd:    { 3: [.04, .13], 4: [.06, .20], 5: [.09, .28] },
    luck:  { 3: [.05, .16], 4: [.08, .26], 5: [.12, .38] },
    eye:   { 3: [.06, .20], 4: [.10, .30], 5: [.14, .44] },
    grit:  { 3: [.03, .11], 4: [.05, .17], 5: [.07, .25] }
  };
  // Chỉ số phụ: một lần "ra" cho bao nhiêu.
  SQ.SUB_ROLL = {
    atk: [2, 5], hp: [14, 34], spd: [.012, .030], carry: [.02, .05],
    cd: [.015, .035], luck: [.02, .05], eye: [.02, .06], grit: [.012, .030]
  };
  SQ.EQUIP_MAX_LV = 20;
  SQ.SUB_UNLOCK_AT = [4, 8, 12, 16];   // mỗi mốc mở/nâng một chỉ số phụ

  // Tên đồ, ghép theo ô + độ hiếm, để mỗi món có tên riêng thay vì "Mũ 4★".
  SQ.EQUIP_NAMES = {
    mu:   { 3: ['Mũ Cối Sờn', 'Mũ Bảo Hộ Cũ'], 4: ['Mũ Đội Trưởng', 'Mũ Lính Cứu Hoả'], 5: ['Mũ Sắt Của Ông Ba', 'Mũ Trắng Tầng Hầm'] },
    ao:   { 3: ['Áo Bạt Vá', 'Áo Phản Quang'], 4: ['Áo Da Dày', 'Áo Chống Cắt'], 5: ['Áo Giáp Kho Lạnh', 'Áo Của Người Trước'] },
    gang: { 3: ['Găng Vải Thô', 'Găng Cao Su'], 4: ['Găng Bọc Sắt', 'Găng Thợ Hàn'], 5: ['Găng Xé Gió', 'Găng Của Kẻ Đếm Tiền'] },
    giay: { 3: ['Dép Tổ Ong', 'Giày Bata'], 4: ['Bốt Cao Su', 'Giày Chống Đinh'], 5: ['Bốt Bảy Dặm', 'Giày Không Tiếng'] },
    den:  { 3: ['Đèn Pin Nhựa', 'Đèn Dầu'], 4: ['Đèn Halogen', 'Đèn Đội Đầu'], 5: ['Đèn Rọi Sương', 'Mắt Thần Cũ'] },
    tui:  { 3: ['Bao Tải', 'Túi Vải Bố'], 4: ['Ba Lô Bộ Đội', 'Thùng Đeo Lưng'], 5: ['Túi Không Đáy', 'Rương Vác Vai'] }
  };

  // ---------------------------------------------------------------------------
  // TIẾN HOÁ — nâng chỉ số cho CẢ TỔ, không riêng ai. Vàng là tiền chính.
  //   mỗi cấp cộng `per` vào chỉ số; giá = base * (1 + lv * step)
  // ---------------------------------------------------------------------------
  SQ.EVOL = [
    { id: 'hp',    name: 'Thể Lực',    stat: 'hp',    per: 12,   max: 20, base: 800,  step: 0.55, icon: '❤️', desc: 'Cả tổ +12 máu mỗi cấp.' },
    { id: 'atk',   name: 'Đòn Tay',    stat: 'atk',   per: 1.4,  max: 20, base: 900,  step: 0.60, icon: '⚔️', desc: 'Cả tổ +1,4 sát thương mỗi cấp.' },
    { id: 'spd',   name: 'Chân Chạy',  stat: 'spd',   per: 0.012, max: 15, base: 1100, step: 0.62, icon: '👟', desc: 'Cả tổ chạy nhanh thêm 1,2% mỗi cấp.' },
    { id: 'carry', name: 'Vai Gánh',   stat: 'carry', per: 0.020, max: 15, base: 1000, step: 0.58, icon: '📦', desc: 'Cả tổ mang nặng thêm 2% mỗi cấp.' },
    { id: 'cd',    name: 'Thuộc Bài',  stat: 'cd',    per: 0.015, max: 12, base: 1500, step: 0.70, icon: '⏱️', desc: 'Hồi chiêu nhanh thêm 1,5% mỗi cấp.' },
    { id: 'grit',  name: 'Da Trâu',    stat: 'grit',  per: 0.012, max: 12, base: 1400, step: 0.66, icon: '🛡️', desc: 'Cả tổ giảm thêm 1,2% sát thương mỗi cấp.' },
    { id: 'eye',   name: 'Mắt Quen',   stat: 'eye',   per: 0.020, max: 12, base: 1200, step: 0.60, icon: '👁️', desc: 'Cả tổ nhìn xa thêm 2% mỗi cấp.' },
    { id: 'luck',  name: 'Mặc Cả',     stat: 'luck',  per: 0.018, max: 15, base: 1600, step: 0.72, icon: '💰', desc: 'Đồ bán được thêm 1,8% mỗi cấp.' },
    { id: 'iq',    name: 'Ăn Ý',       stat: 'iq',    per: 0.06,  max: 10, base: 2000, step: 0.75, icon: '🧠', desc: 'Bot phản ứng nhanh hơn 6% mỗi cấp: nhặt sớm hơn, né sớm hơn.' }
  ];

  // ---------------------------------------------------------------------------
  // MAP LỚN. KHÔNG lặp vô hạn: mỗi map có số tầng cố định, hết tầng là THẮNG.
  //   power: lực chiến khuyên nên có. quotaBase: chỉ tiêu tầng 1.
  // ---------------------------------------------------------------------------
  // MAP LỚN — số tầng chạy theo vòng 3 → 4 → 5, rồi lặp lại từ 3 với một vòng khó hơn:
  // quái cùng loại nhưng khoẻ hơn, cộng thêm một giống quái chưa từng gặp.
  // WHY: người chơi đo được sức mình bằng cùng một thước (3-4-5 tầng) qua từng vòng,
  //      nên "mình mạnh lên bao nhiêu" là câu hỏi có câu trả lời, không phải cảm giác.
  SQ.MAPS = [
    // ---------------- VÒNG 1 — học nghề ----------------
    {
      id: 'k3', name: 'Khu Tập Thể K3', cycle: 1, floors: 3, power: 0, tier: 1,
      quotaBase: 4200, quotaStep: 0.35, foes: ['rook'], foeBase: 2, foePer: 1,
      pal: { floor: '#14161a', wall: '#343c48', accent: '#4b5768' },
      desc: 'Ba tầng nhà cũ, đèn hành lang chập chờn. Chỗ dạy nghề.',
      first: { gold: 3000, gem: 300, ticketX: 1 },
      clear: { gold: 900, gem: 20 }
    },
    {
      id: 'cho', name: 'Chợ Đêm Bến Cũ', cycle: 1, floors: 4, power: 900, tier: 2,
      quotaBase: 7000, quotaStep: 0.34, foes: ['rook', 'patrol'], foeBase: 3, foePer: 1,
      pal: { floor: '#17150f', wall: '#3d3527', accent: '#5c4e37' },
      desc: 'Sạp gỗ, thùng cá, và một thứ đi lại giữa các quầy.',
      first: { gold: 6000, gem: 500, ticketE: 2 },
      clear: { gold: 1800, gem: 30 }
    },
    {
      id: 'bv', name: 'Bệnh Viện Bỏ Hoang', cycle: 1, floors: 5, power: 2600, tier: 3,
      quotaBase: 11000, quotaStep: 0.33, foes: ['rook', 'patrol', 'angel'], foeBase: 3, foePer: 1,
      pal: { floor: '#121818', wall: '#2f3f3c', accent: '#456158' },
      desc: 'Hành lang trắng. Đừng quay lưng lại con đứng yên.',
      first: { gold: 12000, gem: 800, ticketX: 2 },
      clear: { gold: 3200, gem: 45 }
    },

    // ---------------- VÒNG 2 — quái khoẻ hơn, thêm Thợ Săn rồi Nhện ----------------
    {
      id: 'det', name: 'Nhà Máy Dệt', cycle: 2, floors: 3, power: 5200, tier: 4,
      quotaBase: 17000, quotaStep: 0.32, foes: ['patrol', 'angel', 'hunter'], foeBase: 4, foePer: 1,
      pal: { floor: '#161113', wall: '#3f303a', accent: '#5c4250' },
      desc: 'Vòng hai bắt đầu lại từ ba tầng — nhưng thứ trong nhà thì không quay lại như cũ. Thợ Săn nghe được cả tiếng bạn thở.',
      first: { gold: 20000, gem: 1200, ticketE: 3 },
      clear: { gold: 5200, gem: 60 }
    },
    {
      id: 'kho', name: 'Kho Lạnh Bến Xe', cycle: 2, floors: 4, power: 9000, tier: 5,
      quotaBase: 24000, quotaStep: 0.31, foes: ['hunter', 'angel', 'nhen'], foeBase: 4, foePer: 1,
      pal: { floor: '#111419', wall: '#2b3a50', accent: '#3d5474' },
      desc: 'Trần thấp, ống lạnh chạy dọc. Nhện Trần rơi xuống đúng lúc bạn ngẩng lên.',
      first: { gold: 30000, gem: 1500, ticketX: 2, ticketE: 2 },
      clear: { gold: 7000, gem: 75 }
    },
    {
      id: 'bt', name: 'Biệt Thự Đồi Sương', cycle: 2, floors: 5, power: 14000, tier: 6,
      quotaBase: 33000, quotaStep: 0.30, foes: ['angel', 'hunter', 'nhen', 'patrol'], foeBase: 5, foePer: 1,
      pal: { floor: '#141020', wall: '#37304f', accent: '#4e4270' },
      desc: 'Đồ ở đây đắt gấp đôi chỗ khác. Có lý do cả.',
      first: { gold: 45000, gem: 2000, ticketX: 3 },
      clear: { gold: 10000, gem: 95 }
    },

    // ---------------- VÒNG 3 — thêm Quản Ca rồi Bóng Đen ----------------
    {
      id: 'ga', name: 'Ga Hàng Cũ', cycle: 3, floors: 3, power: 21000, tier: 7,
      quotaBase: 44000, quotaStep: 0.30, foes: ['hunter', 'nhen', 'quanca'], foeBase: 5, foePer: 1,
      pal: { floor: '#14110d', wall: '#3a3428', accent: '#564936' },
      desc: 'Lại ba tầng, lại từ đầu. Quản Ca thấy bạn một cái là cả nhà biết bạn ở đâu.',
      first: { gold: 70000, gem: 2600, ticketE: 4 },
      clear: { gold: 15000, gem: 120 }
    },
    {
      id: 'tau', name: 'Xưởng Đóng Tàu', cycle: 3, floors: 4, power: 30000, tier: 8,
      quotaBase: 58000, quotaStep: 0.29, foes: ['quanca', 'hunter', 'nhen', 'bongden'], foeBase: 5, foePer: 1,
      pal: { floor: '#0f1518', wall: '#2a4049', accent: '#3b5c68' },
      desc: 'Vỏ tàu dựng đứng trong bóng tối. Bóng Đen chỉ hiện ra khi đã sát mặt.',
      first: { gold: 95000, gem: 3200, ticketX: 4 },
      clear: { gold: 21000, gem: 150 }
    },
    {
      id: 'hh', name: 'Tầng Hầm Không Tên', cycle: 3, floors: 5, power: 42000, tier: 9,
      quotaBase: 76000, quotaStep: 0.28, foes: ['bongden', 'quanca', 'angel', 'nhen', 'hunter'], foeBase: 6, foePer: 1,
      pal: { floor: '#0e0e11', wall: '#2c2c34', accent: '#41414e' },
      desc: 'Không có trên bản đồ nào. Xe tải đỗ ở đây thì tắt máy chờ.',
      first: { gold: 150000, gem: 5000, ticketX: 5, ticketE: 5 },
      clear: { gold: 32000, gem: 220 }
    }
  ];
  SQ.MAP_BY_ID = {};
  SQ.MAPS.forEach(m => { SQ.MAP_BY_ID[m.id] = m; });

  // ---------------------------------------------------------------------------
  // QUÁI. hp/dmg nhân theo tier của map.
  // ---------------------------------------------------------------------------
  SQ.FOES = {
    rook:   { id: 'rook',   name: 'Con Ngồi',  hp: 70,  dmg: 16, spd: 62,  sight: 0,   hear: 9,  color: '#8a6b4f',
              desc: 'Mù. Chỉ nghe. Đứng im thì nó đi qua.' },
    patrol: { id: 'patrol', name: 'Kẻ Tuần',   hp: 95,  dmg: 20, spd: 74,  sight: 8.5, hear: 6,  color: '#6f7d99',
              desc: 'Đi theo tuyến. Thấy là đuổi, đuổi lâu.' },
    angel:  { id: 'angel',  name: 'Tượng',     hp: 150, dmg: 30, spd: 130, sight: 12,  hear: 3,  color: '#b9b3a6',
              desc: 'Đứng yên khi có người nhìn. Quay lưng đi là nó tới.' },
    hunter: { id: 'hunter', name: 'Thợ Săn',   hp: 130, dmg: 26, spd: 88,  sight: 10,  hear: 11, color: '#9a4a44',
              desc: 'Nghe được cả tiếng bạn thở. Nó không quên.' },
    // --- vòng 2 ---
    nhen:   { id: 'nhen',   name: 'Nhện Trần', hp: 85,  dmg: 32, spd: 118, sight: 6,   hear: 12, color: '#6b4a72',
              desc: 'Máu ít, chạy nhanh, cắn đau. Nó rơi xuống từ trần.' },
    // --- vòng 3 ---
    quanca: { id: 'quanca', name: 'Quản Ca',   hp: 260, dmg: 24, spd: 58,  sight: 13,  hear: 7,  color: '#8a8f6a',
              alert: 1,
              desc: 'Đi chậm, dai. Nó thấy bạn một cái là cả nhà biết bạn đứng đâu.' },
    bongden:{ id: 'bongden', name: 'Bóng Đen', hp: 175, dmg: 34, spd: 96,  sight: 11,  hear: 9,  color: '#3d3a4a',
              hidden: 4, stunProof: 1,
              desc: 'Chỉ hiện ra khi đã sát mặt. Choáng không ăn thua với nó.' }
  };

  // ---------------------------------------------------------------------------
  // ĐỒ ĂN TIỀN trong nhà: cỡ (khối lượng) và chất liệu (giá).
  // ---------------------------------------------------------------------------
  SQ.SIZES = [
    { id: 'nho',  name: 'nhỏ',  mass: 6,  r: 7,  valMul: 1.0 },
    { id: 'vua',  name: 'vừa',  mass: 17, r: 10, valMul: 2.6 },
    { id: 'to',   name: 'to',   mass: 34, r: 14, valMul: 5.4 }
  ];
  SQ.MATERIALS = [
    { id: 'nhua',  name: 'nhựa',   mul: 0.7,  color: '#5d6b74' },
    { id: 'go',    name: 'gỗ',     mul: 1.0,  color: '#7a5a3a' },
    { id: 'thuy',  name: 'thuỷ tinh', mul: 1.5, color: '#5f8f96', fragile: 1.6 },
    { id: 'dong',  name: 'đồng',   mul: 2.0,  color: '#b07a3c' },
    { id: 'bac',   name: 'bạc',    mul: 3.0,  color: '#b9c2c9' },
    { id: 'vang',  name: 'vàng',   mul: 4.6,  color: '#e0b03c' }
  ];
  SQ.LOOT_NOUNS = ['tượng', 'đồng hồ', 'hộp', 'khung ảnh', 'bình', 'chân nến', 'két nhỏ',
                   'đài', 'chuông', 'mâm', 'lư', 'tách trà', 'quạt bàn', 'đầu máy'];

  // ---------------------------------------------------------------------------
  // GACHA. Hai băng: XÁC và TRANG BỊ. Có bảo hiểm (pity) như game thật.
  // ---------------------------------------------------------------------------
  SQ.GACHA = {
    char: {
      id: 'char', name: 'Gacha Xác', costGem: 160, ticket: 'ticketX',
      rate5: 0.006, rate4: 0.051, soft: 74, hard: 90, pity4: 10,
      desc: 'Ra xác mới. Trùng xác thì thành mảnh để nâng cấp xác đó.',
      color: '#e0a53c'
    },
    equip: {
      id: 'equip', name: 'Gacha Trang Bị', costGem: 120, ticket: 'ticketE',
      rate5: 0.020, rate4: 0.120, soft: 999, hard: 60, pity4: 10,
      desc: 'Ra trang bị sáu ô, chỉ số chính và phụ đều ngẫu nhiên.',
      color: '#a678d8'
    }
  };

  // ---------------------------------------------------------------------------
  // CỬA HÀNG. Nạp là GIẢ — không có cổng thanh toán nào ở đây, bấm là có ngọc.
  // ---------------------------------------------------------------------------
  SQ.PACKS = [
    { id: 'p1', name: 'Gói Tập Sự',    vnd: 22000,  gem: 300,   bonus: 0,    tag: '' },
    { id: 'p2', name: 'Gói Thợ',       vnd: 109000, gem: 1600,  bonus: 100,  tag: '' },
    { id: 'p3', name: 'Gói Cai',       vnd: 249000, gem: 3800,  bonus: 400,  tag: 'HOT' },
    { id: 'p4', name: 'Gói Chủ Thầu',  vnd: 549000, gem: 8800,  bonus: 1200, tag: '' },
    { id: 'p5', name: 'Gói Nhà Đầu Tư', vnd: 999000, gem: 16800, bonus: 3200, tag: 'LỜI NHẤT' },
    { id: 'p6', name: 'Gói Ông Trùm',  vnd: 2499000, gem: 45000, bonus: 12000, tag: 'V.I.P' }
  ];
  SQ.EXCHANGE = [
    { id: 'x1', gem: 50,  gold: 6000,  limit: 20 },
    { id: 'x2', gem: 200, gold: 28000, limit: 10 },
    { id: 'x3', gem: 60,  ticketX: 1,  limit: 5 },
    { id: 'x4', gem: 45,  ticketE: 1,  limit: 5 }
  ];

  // ---------------------------------------------------------------------------
  // NHIỆM VỤ. counters là các bộ đếm sim ghi vào sau mỗi ván.
  // ---------------------------------------------------------------------------
  SQ.QUEST_POOL = {
    daily: [
      { id: 'd_run',   text: 'Đi 2 ca bất kỳ',                 counter: 'runs',    need: 2,     r: { gold: 600, gem: 15 } },
      { id: 'd_loot',  text: 'Giao đủ 12.000 giá trị đồ',       counter: 'loot',    need: 12000, r: { gold: 900 } },
      { id: 'd_skill', text: 'Dùng kỹ năng 15 lần',            counter: 'skills',  need: 15,    r: { gold: 500, gem: 10 } },
      { id: 'd_kill',  text: 'Hạ 8 con quái',                  counter: 'kills',   need: 8,     r: { gold: 700 } },
      { id: 'd_floor', text: 'Qua 4 tầng',                     counter: 'floors',  need: 4,     r: { gold: 800, ticketE: 1 } },
      { id: 'd_gacha', text: 'Quay gacha 5 lần',               counter: 'pulls',   need: 5,     r: { gold: 1000 } },
      { id: 'd_rev',   text: 'Đỡ đồng đội dậy 3 lần',          counter: 'revives', need: 3,     r: { gold: 600, gem: 10 } }
    ],
    weekly: [
      { id: 'w_win',   text: 'Phá đảo 3 map lớn',              counter: 'wins',    need: 3,     r: { gold: 6000, gem: 200 } },
      { id: 'w_loot',  text: 'Giao đủ 120.000 giá trị đồ',      counter: 'loot',    need: 120000, r: { gold: 8000, ticketX: 1 } },
      { id: 'w_kill',  text: 'Hạ 60 con quái',                 counter: 'kills',   need: 60,    r: { gold: 7000, ticketE: 2 } },
      { id: 'w_up',    text: 'Nâng cấp trang bị 10 lần',        counter: 'upgrades', need: 10,   r: { gold: 5000, gem: 150 } }
    ]
  };
  SQ.ACHIEVEMENTS = [
    { id: 'a_first',  text: 'Phá đảo map lớn đầu tiên',        counter: 'wins',    need: 1,   r: { gem: 300 } },
    { id: 'a_all',    text: 'Phá đảo cả 6 map lớn',            counter: 'mapsDone', need: 6,  r: { gem: 2000, ticketX: 5 } },
    { id: 'a_five',   text: 'Sở hữu 1 xác 5★',                 counter: 'own5',    need: 1,   r: { gem: 400 } },
    { id: 'a_squad',  text: 'Có đủ 5 xác trong tổ',            counter: 'squadFull', need: 5, r: { gold: 3000 } },
    { id: 'a_lv20',   text: 'Nâng một món trang bị lên cấp 20', counter: 'eqMax',  need: 1,   r: { gem: 500 } },
    { id: 'a_kill100', text: 'Hạ 100 con quái',                counter: 'kills',   need: 100, r: { gold: 12000 } },
    { id: 'a_loot1m', text: 'Giao đủ 1.000.000 giá trị đồ',     counter: 'loot',   need: 1000000, r: { gem: 1500 } },
    { id: 'a_evol',   text: 'Nâng Tiến Hoá tổng 30 cấp',        counter: 'evolLv', need: 30,  r: { gem: 800 } }
  ];

  // Xác cho không lúc mới vào — đủ một tổ 5 người để chơi ngay.
  SQ.STARTER_CHARS = ['bao', 'hue', 'tam', 'ky', 'linh'];

})(window);
