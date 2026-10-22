// ===== KHUÔN DỮ LIỆU NHIỆM VỤ + HỘI THOẠI (đọc trước) ==============================================================
// Chuỗi mở đầu "Village of Rough Waves" chép từ clip DcGavHFwqtk (docs/research/QUESTLINE.md) và ảnh chụp D:\wos-ref\pilot.
// Game gốc nhận nhiệm vụ/hội thoại từ server (không có trong đệm meta), nên các bảng dưới là bản web dựng lại theo khung hình;
// chữ nằm ở data/quest_text.js (khoá = id ở đây). Số ghi [ĐỀ XUẤT] là bản web tự đặt, [THẤY m:ss] là đọc trong clip.
//
// QUESTS[i] = { id, title (khoá chữ), group (khoá chữ phụ đề "Village of Rough Waves"), town (sprite TownSymbol),
//               giver (NPC giao), target (NPC trả/nói chuyện), map (bản đồ của target, cho ô chi tiết),
//               desc? (khoá chữ StoryText ô chi tiết nhật ký),
//               objectives: [{ id, text (khoá chữ), need (số đếm cần), kind: 'talk'|'heal'|'item'|'perk'|'kill'|'use'|'buy'|'reach'|'none',
//                 model? (kill: loài slime), item? (use/buy: item_type id), map? + rect? [x0,z0,x1,z1] (reach: bước vào vùng) }],
//               rewards: { exp, gold, items: { itemId: n } }, next (id nhiệm vụ tự nhận khi xong),
//               turnIn? 'notBuilt' (clip không cho thấy lúc trả), notBuilt? (nội dung chưa biết) }
//   Bộ đếm kill/use/buy/reach do engine.onKill/onUse/onBuy/tick cộng cho MỌI nhiệm vụ đang làm có mục tiêu khớp (Martin + Patrol
//   cùng đếm Junior Floralime như 11:03 "Defeat Junior Floralime 10/10"), không có if theo id nhiệm vụ.
// DIALOGUE[nodeId] = { sp (người nói: tên NPC | 'box'), t? (khoá chữ, mặc định = nodeId), style? 'dark' (DialogueStyleUI),
//               illust? (khoá TUTORIALS, thẻ hướng dẫn hiện cùng dòng này), act? (hành động khi dòng hiện),
//               next? (nodeId kế) | choices?: [{ t (khoá chữ), icon (ChoicePopup: before|progress|complete|heal|buy|sell|talk|exit),
//               to? (nodeId), act? }] }   — không có next/choices = hết hội thoại
// hành động (act, chuỗi "lệnh:tham số", nhiều lệnh nối bằng ";"):
//   start:q  complete:q  obj:q.o (cộng 1 vào bộ đếm)  heal (trừ Vàng, hồi slime, rồi obj)  box (mở hộp đang xét)
//   perk (mở bảng Tiềm năng)  shop (mở quầy)  notbuilt (thông báo chưa có)  pushback (đẩy người chơi về làng)  sell
//   F4 (chạy sau khi khung thoại đóng, theo thứ tự): guide:id (màn chỉ nút GUIDES[id], xong thì chạy GUIDES[id].then)
//   call:node (NPC gọi từ xa: mở hội thoại node với người nói của node)  notice:khoáChữ (popup Notice)
// TALK[npc] = [{ when: { q, s: 'none'|'active'|'ready'|'done' } | null, gate?: { started?: q, done?: q }, start }] — NPC lấy dòng
//   ĐẦU TIÊN khớp trạng thái (+ cổng). Dòng `s: 'none'` có cổng mở = NPC đang có việc giao: dấu "!" (quest_marker_before) trên đầu.
//   active = đang làm, chưa đủ mục tiêu; ready = đủ mục tiêu (hoặc mục tiêu 'talk' với chính NPC này); none = chưa nhận.
// Không có if riêng cho từng NPC: game.js chỉ gọi engine.talk(npcName) và engine tra bảng này.

export const QUESTS = [
  { id: 'q1', title: 'q1.title', group: 'grp.larus', town: 'Town/Town_Larus', giver: 'Amy', target: 'Amy', map: 257,
    objectives: [{ id: 'talk', text: 'q1.o', need: 1, kind: 'talk' }],
    rewards: { exp: 10, gold: 0, items: {} }, next: 'q2' },                 // exp [ĐỀ XUẤT]: clip không thấy log ở 1:48
  { id: 'q2', title: 'q2.title', group: 'grp.larus', town: 'Town/Town_Larus', giver: 'Amy', target: 'Allen', map: 478,
    objectives: [{ id: 'talk', text: 'q2.o', need: 1, kind: 'talk' }],
    rewards: { exp: 10, gold: 0, items: {} }, next: 'q3' },                 // exp [ĐỀ XUẤT]
  { id: 'q3', title: 'q3.title', group: 'grp.larus', town: 'Town/Town_Larus', giver: 'Allen', target: 'Allen', map: 478,
    objectives: [{ id: 'heal', text: 'q3.o', need: 1, kind: 'heal' }],
    rewards: { exp: 40, gold: 0, items: {} }, next: 'q4' },                 // [THẤY 2:57] "User EXP + 40"
  { id: 'q4', title: 'q4.title', group: 'grp.larus', town: 'Town/Town_Larus', giver: 'Allen', target: 'Allen', map: 110, desc: 'q4.desc',
    objectives: [{ id: 'herb', text: 'q4.o', need: 1, kind: 'item', item: 773 }],
    rewards: { exp: 40, gold: 0, items: {} }, next: 'q5', take: { 773: 1 } },   // exp [ĐỀ XUẤT]: đủ 100 để lên Lv2 như 4:00
  { id: 'q5', title: 'q5.title', group: 'grp.larus', town: 'Town/Town_Larus', giver: 'Allen', target: 'Allen', map: 478,
    objectives: [{ id: 'perk', text: 'q5.o', need: 1, kind: 'perk' }],
    rewards: { exp: 10, gold: 0, items: {} }, next: 'q6' },                 // [THẤY 4:18] "User EXP + 10"
  { id: 'q6', title: 'q6.title', group: 'grp.larus', town: 'Town/Town_Larus', giver: 'Allen', target: 'Lucy', map: 110,
    objectives: [{ id: 'talk', text: 'q6.o', need: 1, kind: 'talk' }],
    rewards: { exp: 10, gold: 0, items: {} }, next: 'q7' },                 // [THẤY 4:42] "User EXP + 10"
  { id: 'q7', title: 'q7.title', group: 'grp.larus', town: 'Town/Town_Larus', giver: 'Lucy', target: 'Lucy', map: 110,
    objectives: [{ id: 'kill', text: 'q7.o1', need: 2, kind: 'kill', model: 'SL_Slime_Grass' }, { id: 'frag', text: 'q7.o2', need: 1, kind: 'item' }],
    rewards: { exp: 20, gold: 0, items: { 1: 3 } }, next: 'q9' },   // [THẤY 7:28] "30 HP Potion × 3", "User EXP + 20"
  // ---- F4 (QUESTLINE.md bước 8-14). Thứ tự trong bảng = thứ tự nhận trong clip = thứ tự trên HUD (6:54, 7:30, 8:33, 11:03)
  { id: 'q8', title: 'q8.title', group: 'grp.larus', town: 'Town/Town_Larus', giver: 'Martin', target: 'Martin', map: 'shadow_forest_entrance',
    objectives: [{ id: 'kill', text: 'q8.o', need: 10, kind: 'kill', model: 'SL_Slime_Grass' }],
    rewards: { exp: 30, gold: 0, items: {} }, next: null },                 // [THẤY 10:15] "User EXP + 30"
  { id: 'q9', title: 'q9.title', group: 'grp.larus', town: 'Town/Town_Larus', giver: 'Lucy', target: 'Lucy', map: 110,
    objectives: [{ id: 'potion', text: 'q9.o', need: 1, kind: 'use', item: 1 }],
    rewards: { exp: 10, gold: 0, items: {} }, next: null },                 // [THẤY 7:42] "User EXP + 10"
  { id: 'q10', title: 'q10.title', group: 'grp.sidejob', town: 'Town/Town_Larus', giver: 'Mysterious Researcher', target: 'Mysterious Researcher', map: 110,
    objectives: [{ id: 'cube', text: 'q10.o', need: 3, kind: 'buy', item: 4 }],
    rewards: { exp: 20, gold: 0, items: {} }, next: 'q12' },                // [THẤY 11:03] "User EXP + 20"
  // Patrol: clip không cho thấy lúc trả (chạy tới 11:06 vẫn "Patrol Shadow Forest Entrance 0/1"); phần thưởng chưa biết.
  // Vùng tuần tra [ĐỀ XUẤT]: "scout all the way to the end in the direction of Forest Path" = đầu tây con đường rừng (x <= 19.5)
  { id: 'q11', title: 'q11.title', group: 'grp.patrol', town: 'Town/Town_Larus', giver: 'Billy', target: 'Billy', map: 'shadow_forest_entrance',
    objectives: [{ id: 'patrol', text: 'q11.o1', need: 1, kind: 'reach', map: 'shadow_forest_entrance', rect: [0, 0, 19.5, 60] },
      { id: 'kill', text: 'q11.o2', need: 10, kind: 'kill', model: 'SL_Slime_Grass' }],
    rewards: { exp: 0, gold: 0, items: {} }, next: null, turnIn: 'notBuilt' },
  // "Suspicious Part-Time J…" (11:03): clip dừng ngay sau khi nhận, nội dung chưa biết -> mục tiêu giữ chỗ "Chưa có trong bản web"
  { id: 'q12', title: 'q12.title', group: 'grp.sidejob', town: 'Town/Town_Larus', giver: 'Mysterious Researcher', target: 'Mysterious Researcher', map: 110,
    desc: 'q12.desc', objectives: [{ id: 'nb', text: 'q12.o', need: 1, kind: 'none' }], rewards: { exp: 0, gold: 0, items: {} }, next: null, notBuilt: true },
];
export const QUEST = Object.fromEntries(QUESTS.map(q => [q.id, q]));
export const FIRST_QUEST = 'q1';
// [ĐỀ XUẤT] EXP cần để lên cấp: Lv1 -> 2 = 100 (q1..q4 = 10+10+40+40 thì lên Lv2 đúng lúc trả q4, khớp 4:00 "Level Up 2")
export const EXP_TO_NEXT = lv => 100 * lv;
// [ĐO TRONG CLIP] Vàng mở đầu 10,000: tài khoản mới tạo ở 0:03, sau khi chữa 71 Vàng (2:41) HUD shop ghi 9,929 (10:39),
// mua 3 Cube x 500 còn 8,429 (10:45). Bản demo 2026-10-21 (pilot h4.png) chữa giá 89.
export const START_GOLD = 10000;
export const HEAL_COST = 89;      // [ĐO KHI CHƠI 2026-10-21] h4.png

const DD = 'dark';
export const DIALOGUE = {
  // ---- Amy, nhiệm vụ 1 (mạch theo 1:23-1:48; dlg_sheet.png)
  amy1: { sp: 'Amy', next: 'amy2' },
  amy2: { sp: 'Amy', choices: [{ t: 'c.whereami', icon: 'complete', to: 'amy3' }, { t: 'c.end', icon: 'exit' }] },
  amy3: { sp: 'Amy', next: 'amy4' },
  amy4: { sp: 'Amy', next: 'amy5' },
  amy5: { sp: 'Amy', next: 'amy6' },
  amy6: { sp: 'Amy', choices: [{ t: 'c.iam', icon: 'talk', to: 'amy7' }] },
  amy7: { sp: 'Amy', next: 'amy8' },
  amy8: { sp: 'Amy', next: 'amy9' },
  amy9: { sp: 'Amy', choices: [{ t: 'c.father', icon: 'talk', to: 'amy10' }] },
  amy10: { sp: 'Amy', next: 'amy11' },
  amy11: { sp: 'Amy', choices: [{ t: 'c.whatnow', icon: 'talk', to: 'amy12' }] },
  amy12: { sp: 'Amy', choices: [{ t: 'c.ah', icon: 'talk', to: 'amy13' }] },
  amy13: { sp: 'Amy', next: 'amy14' },
  amy14: { sp: 'Amy', illust: 'heal', choices: [{ t: 'c.wherestorage', icon: 'talk', to: 'amy15' }, { t: 'c.rest', icon: 'talk', to: 'amy15' }] },
  amy15: { sp: 'Amy', act: 'complete:q1' },
  amy16: { sp: 'Amy', choices: [{ t: 'c.whatsup', icon: 'progress', to: 'amy15r' }, { t: 'c.end', icon: 'exit' }] },
  amy15r: { sp: 'Amy', t: 'amy15' },
  // ---- Allen, nhiệm vụ 2 (2:17-2:26)
  al1q2: { sp: 'Allen', t: 'al1', choices: [{ t: 'c.hello', icon: 'complete', to: 'al2' }, { t: 'c.end', icon: 'exit' }] },
  al2: { sp: 'Allen', choices: [{ t: 'c.iam', icon: 'talk', to: 'al3' }] },
  al3: { sp: 'Allen', next: 'al4' },
  al4: { sp: 'Allen', next: 'al5' },
  al5: { sp: 'Allen', next: 'al6' },
  al6: { sp: 'Allen', choices: [{ t: 'c.fine', icon: 'talk', to: 'al7' }] },
  al7: { sp: 'Allen', act: 'complete:q2' },
  // ---- Allen, chữa slime (h2/h4/h6.png, 2:27-2:42)
  alH: { sp: 'Allen', choices: [{ t: 'c.yes', icon: 'talk', act: 'heal', to: 'alH2' }, { t: 'c.no', icon: 'exit' }] },
  alH2: { sp: 'Allen' },
  alHno: { sp: 'Allen' },
  // ---- Allen, Slime Storage (F3; dòng thoại v4van_capture_untamed_prince): mở kho khi hội thoại đóng
  alSt: { sp: 'Allen', t: 'al.st1', act: 'storage' },
  // ---- Allen, nhiệm vụ 3
  al1q3: { sp: 'Allen', t: 'al1', choices: [{ t: 'c.whatwas', icon: 'progress', to: 'al7r' }, { t: 'c.heal', icon: 'heal', to: 'alH' }, { t: 'c.storage', icon: 'talk', to: 'alSt' }, { t: 'c.end', icon: 'exit' }] },
  al7r: { sp: 'Allen', t: 'al7' },
  al1q3r: { sp: 'Allen', t: 'al1', choices: [{ t: 'c.thanks', icon: 'complete', to: 'al8' }, { t: 'c.heal', icon: 'heal', to: 'alH' }, { t: 'c.storage', icon: 'talk', to: 'alSt' }, { t: 'c.end', icon: 'exit' }] },
  al8: { sp: 'Allen', choices: [{ t: 'c.stamina', icon: 'talk', to: 'al9' }] },
  al9: { sp: 'Allen', next: 'al10' },
  al10: { sp: 'Allen', choices: [{ t: 'c.whatisit', icon: 'talk', to: 'al11' }] },
  al11: { sp: 'Allen', act: 'complete:q3' },
  // ---- Allen, nhiệm vụ 4 (2:56, 3:44-3:51)
  al1q4: { sp: 'Allen', t: 'al1', choices: [{ t: 'c.whatsup', icon: 'progress', to: 'al11r' }, { t: 'c.heal', icon: 'heal', to: 'alH' }, { t: 'c.storage', icon: 'talk', to: 'alSt' }, { t: 'c.end', icon: 'exit' }] },
  al11r: { sp: 'Allen', t: 'al11' },
  al1q4r: { sp: 'Allen', t: 'al1', choices: [{ t: 'c.here', icon: 'complete', to: 'al12' }, { t: 'c.heal', icon: 'heal', to: 'alH' }, { t: 'c.storage', icon: 'talk', to: 'alSt' }, { t: 'c.end', icon: 'exit' }] },
  al12: { sp: 'Allen', act: 'complete:q4', next: 'al13' },
  al13: { sp: 'Allen', next: 'al14' },
  al14: { sp: 'Allen', next: 'al15' },
  al15: { sp: 'Allen', next: 'al16' },
  al16: { sp: 'Allen', next: 'al17' },
  al17: { sp: 'Allen', next: 'al18' },
  al18: { sp: 'Allen', act: 'perk' },
  // ---- Allen, nhiệm vụ 5 (4:03-4:18)
  al1q5: { sp: 'Allen', t: 'al1', choices: [{ t: 'c.whatsup', icon: 'progress', to: 'al18' }, { t: 'c.heal', icon: 'heal', to: 'alH' }, { t: 'c.storage', icon: 'talk', to: 'alSt' }, { t: 'c.end', icon: 'exit' }] },
  al1q5r: { sp: 'Allen', t: 'al1', choices: [{ t: 'c.awakened', icon: 'complete', to: 'al19' }, { t: 'c.heal', icon: 'heal', to: 'alH' }, { t: 'c.storage', icon: 'talk', to: 'alSt' }, { t: 'c.end', icon: 'exit' }] },
  al19: { sp: 'Allen', next: 'al20' },
  al20: { sp: 'Allen', next: 'al21' },
  al21: { sp: 'Allen', choices: [{ t: 'c.whatisit', icon: 'talk', to: 'al22' }] },
  al22: { sp: 'Allen', choices: [{ t: 'c.where', icon: 'talk', to: 'al23' }] },
  al23: { sp: 'Allen', act: 'complete:q5' },
  al1q6: { sp: 'Allen', t: 'al1', choices: [{ t: 'c.whoto', icon: 'progress', to: 'al23r' }, { t: 'c.heal', icon: 'heal', to: 'alH' }, { t: 'c.storage', icon: 'talk', to: 'alSt' }, { t: 'c.end', icon: 'exit' }] },
  al23r: { sp: 'Allen', t: 'al23' },
  al1idle: { sp: 'Allen', t: 'al1', choices: [{ t: 'c.heal', icon: 'heal', to: 'alH' }, { t: 'c.storage', icon: 'talk', to: 'alSt' }, { t: 'c.end', icon: 'exit' }] },
  // ---- Lucy, nhiệm vụ 6 (4:29-4:39)
  lu1q6: { sp: 'Lucy', t: 'lu1', choices: [{ t: 'c.hello', icon: 'complete', to: 'lu2' }, { t: 'c.end', icon: 'exit' }] },
  lu2: { sp: 'Lucy', next: 'lu3' },
  lu3: { sp: 'Lucy', next: 'lu4' },
  lu4: { sp: 'Lucy', choices: [{ t: 'c.well', icon: 'talk', to: 'lu5' }] },
  lu5: { sp: 'Lucy', next: 'lu6' },
  lu6: { sp: 'Lucy', next: 'lu7' },
  lu7: { sp: 'Lucy', next: 'lu8' },
  lu8: { sp: 'Lucy', act: 'complete:q6' },
  lu1: { sp: 'Lucy', choices: [{ t: 'c.end', icon: 'exit' }] },
  // ---- Rudga chặn cổng tây (x5.png, 4:54-5:09). Đấu tay đôi + Shadow Forest chưa có bản đồ -> thông báo, đẩy về làng
  ru1: { sp: 'Rudga', next: 'ru2' },
  ru2: { sp: 'Rudga', next: 'ru3' },
  ru3: { sp: 'Rudga', choices: [{ t: 'c.lucy', icon: 'progress', to: 'ru4' }] },
  ru3idle: { sp: 'Rudga', t: 'ru3', choices: [{ t: 'c.end', icon: 'exit', act: 'pushback' }] },
  ru4: { sp: 'Rudga', illust: 'whistle', act: 'duel' },   // F1: đấu tay đôi ở sân dựng theo clip (js/combat)
  ruWon: { sp: 'Rudga', t: 'ru.won' },
  ru1idle: { sp: 'Rudga', t: 'ru1', next: 'ru3idle' },
  // ---- hộp trôi dạt (b1.png, 3:09-3:24): khung thoại tối DialogueStyleUI, tên "..."
  bx1: { sp: 'box', style: DD, choices: [{ t: 'c.look', icon: 'talk', act: 'box' }, { t: 'c.end', icon: 'exit' }] },
  bxEmpty: { sp: 'box', style: DD },
  // ---- Vivian (10:30-10:38)
  vi1: { sp: 'Vivian', choices: [{ t: 'c.iam', icon: 'talk', to: 'vi2' }, { t: 'c.buy', icon: 'buy', act: 'shop' }, { t: 'c.sell', icon: 'sell', act: 'sell' }, { t: 'c.end', icon: 'exit' }] },
  vi2: { sp: 'Vivian', next: 'vi3' },
  vi3: { sp: 'Vivian', next: 'vi4' },
  vi4: { sp: 'Vivian', next: 'vi5' },
  vi5: { sp: 'Vivian', choices: [{ t: 'c.buy', icon: 'buy', act: 'shop' }, { t: 'c.sell', icon: 'sell', act: 'sell' }, { t: 'c.end', icon: 'exit' }] },
  // ---- F4. Martin nhận "Grant Martin's Request" (6:39-6:52): khung thoại không chân dung, chỉ chibi (6:39)
  mt1: { sp: 'Martin', next: 'mt2' },
  mt2: { sp: 'Martin', next: 'mt3o' },
  mt3o: { sp: 'Martin', t: 'mt3', choices: [{ t: 'c.matter', icon: 'before', to: 'mt4' }, { t: 'c.end', icon: 'exit' }] },   // 6:45
  mt4: { sp: 'Martin', next: 'mt5' }, mt5: { sp: 'Martin', next: 'mt6' }, mt6: { sp: 'Martin', next: 'mt7' },
  mt7: { sp: 'Martin', next: 'mt8' }, mt8: { sp: 'Martin', next: 'mt9' }, mt9: { sp: 'Martin', next: 'mt10' },
  mt10: { sp: 'Martin', next: 'mt11' },
  mt11: { sp: 'Martin', act: 'start:q8' },
  mtA: { sp: 'Martin', t: 'mt3', choices: [{ t: 'c.whatsup', icon: 'progress', to: 'mt11r' }, { t: 'c.end', icon: 'exit' }] },   // 6:52 nói lại
  mt11r: { sp: 'Martin', t: 'mt11' },
  // trả (10:06-10:13)
  mtR: { sp: 'Martin', t: 'mt3', choices: [{ t: 'c.done', icon: 'complete', to: 'mt12' }, { t: 'c.end', icon: 'exit' }] },
  mt12: { sp: 'Martin', next: 'mt13' }, mt13: { sp: 'Martin', next: 'mt14' }, mt14: { sp: 'Martin', next: 'mt15' },
  mt15: { sp: 'Martin', next: 'mt16' },
  mt16: { sp: 'Martin', choices: [{ t: 'c.martin', icon: 'none', to: 'mt17' }] },
  mt17: { sp: 'Martin', next: 'mt18' },
  mt18: { sp: 'Martin', choices: [{ t: 'c.youdid', icon: 'none', to: 'mt19' }] },
  mt19: { sp: 'Martin', next: 'mt20' },
  mt20: { sp: 'Martin', act: 'complete:q8' },
  mtI: { sp: 'Martin', t: 'mt3', choices: [{ t: 'c.end', icon: 'exit' }] },
  // ---- Lucy trả "Grant Lucy's Request" (7:18-7:28): thẻ Túi Đồ, rồi màn chỉ nút túi + ô Q (7:28-7:30)
  lu1q7: { sp: 'Lucy', t: 'lu1', choices: [{ t: 'c.back', icon: 'complete', to: 'lr1' }, { t: 'c.end', icon: 'exit' }] },
  lr1: { sp: 'Lucy', choices: [{ t: 'c.actually', icon: 'none', to: 'lr2' }] },
  lr2: { sp: 'Lucy', next: 'lr3' },
  lr3: { sp: 'Lucy', choices: [{ t: 'c.ofcourse', icon: 'none', to: 'lr4' }] },
  lr4: { sp: 'Lucy', choices: [{ t: 'c.herethey', icon: 'none', to: 'lr5' }] },
  lr5: { sp: 'Lucy', next: 'lr6' }, lr6: { sp: 'Lucy', next: 'lr6b' },
  lr6b: { sp: 'Lucy', choices: [{ t: 'c.potion', icon: 'none', to: 'lr7' }] },
  lr7: { sp: 'Lucy', next: 'lr8' }, lr8: { sp: 'Lucy', next: 'lr9' },
  lr9: { sp: 'Lucy', choices: [{ t: 'c.giving', icon: 'none', to: 'lr10' }] },
  lr10: { sp: 'Lucy', next: 'lr11' },
  lr11: { sp: 'Lucy', illust: 'bag', next: 'lr12' },                        // 7:27.5 thẻ "Bag"
  lr12: { sp: 'Lucy', illust: 'bag', act: 'complete:q7;guide:potion' },   // 7:28: thẻ còn trên dòng này
  // "Recovery Complete!" (7:33-7:42)
  lu1q9: { sp: 'Lucy', t: 'lu1', choices: [{ t: 'c.whatsup', icon: 'progress', to: 'lr12r' }, { t: 'c.end', icon: 'exit' }] },
  lr12r: { sp: 'Lucy', t: 'lr12' },
  lu1q9r: { sp: 'Lucy', t: 'lu1', choices: [{ t: 'c.fed', icon: 'complete', to: 'lr13' }, { t: 'c.end', icon: 'exit' }] },
  lr13: { sp: 'Lucy', next: 'lr14' }, lr14: { sp: 'Lucy', next: 'lr15' },
  lr15: { sp: 'Lucy', choices: [{ t: 'c.whatnow2', icon: 'none', to: 'lr16' }] },
  lr16: { sp: 'Lucy', next: 'lr17' },
  lr17: { sp: 'Lucy', choices: [{ t: 'c.think', icon: 'none', to: 'lr18' }] },
  lr18: { sp: 'Lucy', next: 'lr19' },
  lr19: { sp: 'Lucy', act: 'complete:q9;call:rs0' },                         // 7:42 xong, 7:46 Researcher gọi
  lr20: { sp: 'Lucy', choices: [{ t: 'c.end', icon: 'exit' }] },
  // ---- Mysterious Researcher (7:46-8:05): gọi từ xa, rồi nhận "Suspicious Researcher"
  rs0: { sp: 'Mysterious Researcher' },
  rs1: { sp: 'Mysterious Researcher', choices: [{ t: 'c.yesright', icon: 'before', to: 'rs2' }] },
  rs2: { sp: 'Mysterious Researcher', next: 'rs3' },
  rs3: { sp: 'Mysterious Researcher', choices: [{ t: 'c.rare', icon: 'none', to: 'rs4' }] },
  rs4: { sp: 'Mysterious Researcher', next: 'rs5' },
  rs5: { sp: 'Mysterious Researcher', illust: 'friendly', next: 'rs6' },   // 7:58.5 thẻ Friendly Slime
  rs6: { sp: 'Mysterious Researcher', illust: 'friendly', next: 'rs7' },   // thẻ còn 7:58.5-7:59
  rs7: { sp: 'Mysterious Researcher', choices: [{ t: 'c.isee', icon: 'none', to: 'rs8' }] },
  rs8: { sp: 'Mysterious Researcher', next: 'rs9' }, rs9: { sp: 'Mysterious Researcher', next: 'rs10' },
  rs10: { sp: 'Mysterious Researcher', next: 'rs11' },
  rs11: { sp: 'Mysterious Researcher', choices: [{ t: 'c.whatcube', icon: 'none', to: 'rs12' }] },
  rs12: { sp: 'Mysterious Researcher', next: 'rs13' }, rs13: { sp: 'Mysterious Researcher', next: 'rs14' },
  rs14: { sp: 'Mysterious Researcher', next: 'rs15' }, rs15: { sp: 'Mysterious Researcher', next: 'rs16' },
  rs16: { sp: 'Mysterious Researcher', next: 'rs17' },
  rs17: { sp: 'Mysterious Researcher', choices: [{ t: 'c.ownmoney', icon: 'none', to: 'rs18' }] },
  rs18: { sp: 'Mysterious Researcher', next: 'rs19' }, rs19: { sp: 'Mysterious Researcher', next: 'rs20' },
  rs20: { sp: 'Mysterious Researcher', next: 'rs21' },
  rs21: { sp: 'Mysterious Researcher', illust: 'shop', act: 'start:q10' },  // 8:04.5 thẻ Shop, 8:06 băng nhiệm vụ
  rsA: { sp: 'Mysterious Researcher', choices: [{ t: 'c.whatbuy', icon: 'progress', to: 'rs17r' }, { t: 'c.end', icon: 'exit' }] },
  rs17r: { sp: 'Mysterious Researcher', t: 'rs17' },
  // trả (10:55-11:03): thẻ Tame, màn chỉ ba ô Q/E/R (11:01), rồi "Quest complete! Suspicious Researcher" (11:03)
  rsR: { sp: 'Mysterious Researcher', t: 'rsA', choices: [{ t: 'c.brought', icon: 'complete', to: 'rt1' }, { t: 'c.end', icon: 'exit' }] },
  rt1: { sp: 'Mysterious Researcher', next: 'rt2' }, rt2: { sp: 'Mysterious Researcher', next: 'rt3' },
  rt3: { sp: 'Mysterious Researcher', next: 'rt4' }, rt4: { sp: 'Mysterious Researcher', next: 'rt5' },
  rt5: { sp: 'Mysterious Researcher', next: 'rt6' },
  rt6: { sp: 'Mysterious Researcher', illust: 'tame', choices: [{ t: 'c.understood', icon: 'none', to: 'rt7' }] },
  rt7: { sp: 'Mysterious Researcher', choices: [{ t: 'c.slimepedia', icon: 'none', to: 'rt8' }] },
  rt8: { sp: 'Mysterious Researcher', act: 'guide:tame' },
  rtI: { sp: 'Mysterious Researcher', t: 'rt8', choices: [{ t: 'c.end', icon: 'exit' }] },
  // ---- Billy nhận "Patrol" (8:18-8:28)
  bi0o: { sp: 'Billy', t: 'bi0', choices: [{ t: 'c.nicemeet', icon: 'before', to: 'bi1' }, { t: 'c.end', icon: 'exit' }] },
  bi1: { sp: 'Billy', next: 'bi2' }, bi2: { sp: 'Billy', next: 'bi3' }, bi3: { sp: 'Billy', next: 'bi4' },
  bi4: { sp: 'Billy', next: 'bi5' }, bi5: { sp: 'Billy', next: 'bi6' }, bi6: { sp: 'Billy', next: 'bi7' },
  bi7: { sp: 'Billy', choices: [{ t: 'c.leave', icon: 'none', to: 'bi8' }] },
  bi8: { sp: 'Billy', next: 'bi9' }, bi9: { sp: 'Billy', next: 'bi10' }, bi10: { sp: 'Billy', next: 'bi11' },
  bi11: { sp: 'Billy', next: 'bi12' }, bi12: { sp: 'Billy', next: 'bi13' },
  bi13: { sp: 'Billy', act: 'start:q11' },
  biA: { sp: 'Billy', t: 'bi0', choices: [{ t: 'c.whatsup', icon: 'progress', to: 'bi13r' }, { t: 'c.end', icon: 'exit' }] },
  bi13r: { sp: 'Billy', t: 'bi13' },
  biR: { sp: 'Billy', t: 'bi0', choices: [{ t: 'c.done', icon: 'complete', act: 'notice:ui.notBuiltTurnIn' }, { t: 'c.end', icon: 'exit' }] },
  biI: { sp: 'Billy', t: 'bi0', choices: [{ t: 'c.end', icon: 'exit' }] },
};

export const TALK = {
  Amy: [{ when: { q: 'q1', s: 'ready' }, start: 'amy1' }, { when: null, start: 'amy16' }],
  Allen: [
    { when: { q: 'q2', s: 'ready' }, start: 'al1q2' },
    { when: { q: 'q3', s: 'active' }, start: 'al1q3' }, { when: { q: 'q3', s: 'ready' }, start: 'al1q3r' },
    { when: { q: 'q4', s: 'active' }, start: 'al1q4' }, { when: { q: 'q4', s: 'ready' }, start: 'al1q4r' },
    { when: { q: 'q5', s: 'active' }, start: 'al1q5' }, { when: { q: 'q5', s: 'ready' }, start: 'al1q5r' },
    { when: { q: 'q6', s: 'active' }, start: 'al1q6' },
    { when: null, start: 'al1idle' },
  ],
  Lucy: [{ when: { q: 'q6', s: 'ready' }, start: 'lu1q6' }, { when: { q: 'q7', s: 'ready' }, start: 'lu1q7' },
    { when: { q: 'q9', s: 'active' }, start: 'lu1q9' }, { when: { q: 'q9', s: 'ready' }, start: 'lu1q9r' },
    { when: { q: 'q9', s: 'done' }, start: 'lr20' }, { when: null, start: 'lu1' }],
  // F4
  Martin: [{ when: { q: 'q8', s: 'none' }, gate: { started: 'q7' }, start: 'mt1' }, { when: { q: 'q8', s: 'active' }, start: 'mtA' },
    { when: { q: 'q8', s: 'ready' }, start: 'mtR' }, { when: null, start: 'mtI' }],
  'Mysterious Researcher': [{ when: { q: 'q10', s: 'none' }, gate: { done: 'q9' }, start: 'rs1' }, { when: { q: 'q10', s: 'active' }, start: 'rsA' },
    { when: { q: 'q10', s: 'ready' }, start: 'rsR' }, { when: { q: 'q10', s: 'done' }, start: 'rtI' }],
  Billy: [{ when: { q: 'q11', s: 'none' }, gate: { done: 'q9' }, start: 'bi0o' }, { when: { q: 'q11', s: 'active' }, start: 'biA' },
    { when: { q: 'q11', s: 'ready' }, start: 'biR' }, { when: null, start: 'biI' }],
  // flag: chỉ khớp khi engine.save[flag] đúng (save.duel = đã thắng Rudga, js/combat)
  Rudga: [{ flag: 'duel', when: null, start: 'ruWon' }, { when: { q: 'q7', s: 'active' }, start: 'ru1' }, { when: null, start: 'ru1idle' }],
  Vivian: [{ when: null, start: 'vi1' }],
};

// Chân dung lớn (NPCPortrait) = ảnh đứng img/npc/<model>_Default.webp; tên theo ARCH.md (ghép chân dung với ảnh thật)
export const NPC_ART = {
  Amy: 'img/npc/NPC_Larus_Biggirl_Default.webp', Allen: 'img/npc/NPC_Larus_Store_Default.webp',
  Lucy: 'img/npc/NPC_Larus_Biggirl_4_Default.webp', Rudga: 'img/npc/NPC_Larus_Bigman_3_Default.webp',
  Vivian: 'img/npc/NPC_Larus_Shop_Default.webp', 'Mysterious Researcher': 'img/npc/NPC_Larus_Researcher_Default.webp',
};   // Martin, Billy: không có chân dung lớn (6:39, 8:18 chỉ chibi)
// chibi nhỏ cho ô chi tiết nhật ký (CharacterThumb là RawImage chụp mô hình; bản web dùng ảnh đứng nhỏ img/npc/<model>.webp)
export const NPC_THUMB = {
  Amy: 'img/npc/NPC_Larus_Biggirl.webp', Allen: 'img/npc/NPC_Larus_Store.webp', Lucy: 'img/npc/NPC_Larus_Biggirl_4.webp',
  Rudga: 'img/npc/NPC_Larus_Bigman_3.webp', Vivian: 'img/npc/NPC_Larus_Shop.webp',
  Martin: 'img/npc/NPC_Larus_Fatman_3.webp', Billy: 'img/npc/NPC_Larus_Bigman.webp', 'Mysterious Researcher': 'img/npc/NPC_Larus_Researcher.webp',
};

// thẻ hướng dẫn (DialogueIllust): ảnh img/dialogue/*
export const TUTORIALS = {
  heal: { title: 'tut.heal.t', desc: 'tut.heal.d', img: 'img/dialogue/DialogueIllust_SlimeClinic.webp' },          // 1:42
  whistle: { title: 'tut.whistle.t', desc: 'tut.whistle.d', img: 'img/dialogue/DialogueIllust_Whistle.webp' },     // 4:57
  // F4: tên ảnh gốc khác tên thẻ: Friendly Slime = DialogueIllust_Tamable, Tame = CubeCapture02, Bag = Inventory (ghép theo hình 7:27-10:58)
  bag: { title: 'tut.bag.t', desc: 'tut.bag.d', img: 'img/dialogue/DialogueIllust_Inventory.webp' },                // 7:27.5
  friendly: { title: 'tut.friendly.t', desc: 'tut.friendly.d', img: 'img/dialogue/DialogueIllust_Tamable.webp' },  // 7:58.5
  shop: { title: 'tut.shop.t', desc: 'tut.shop.d', img: 'img/dialogue/DialogueIllust_Shop.webp' },                  // 8:04.5
  tame: { title: 'tut.tame.t', desc: 'tut.tame.d', img: 'img/dialogue/DialogueIllust_CubeCapture02.webp' },         // 10:58
};

// Màn chỉ nút (prefab ui_tutorial__Tutorial_*): nền tối Screen (0.058,0.091,0.104,0.698), vòng sáng quanh nút HUD (target = data-hud),
// khung chữ Dialogue_Frame_Round (0.102,0.235,0.31) 960x230 có chibi NPC (npc = dialogueNpcModelResource), chữ Unmasking.* [LOC].
// box: vị trí tâm khung chữ theo prefab: { from: 'target', p } (con của UnmaskShape, neo góc phải trên nút) | { from: 'screen', a, p }.
// arrow: [x, y, độ xoay] mũi tên DialogueIllust_Arrow quanh tâm nút. Bấm (chuột/Space) để qua bước.
// then: hành động chạy sau bước cuối (11:01 màn chỉ -> 11:03 "Quest complete!").
export const GUIDES = {
  potion: [
    { prefab: 'Tutorial_INVENTORY_BUTTON', npc: 'Lucy', t: 'gd.inventory', target: ['menuBag'], ring: 120, arrow: [175, 0, 90], box: { from: 'target', p: [-88, -324] } },   // 7:28
    { prefab: 'Tutorial_QUICK_SLOT_0_BUTTON', npc: 'Lucy', t: 'gd.quick', target: ['item0'], ring: 150, arrow: [0, 190, 180], box: { from: 'screen', a: [1, 0], p: [-1146, 263] } },   // 7:30
  ],
  tame: [
    { prefab: 'Tutorial_QUICK_SLOT_ALL_BUTTON', npc: 'Mysterious Researcher', t: 'gd.quickAll', target: ['item0', 'item1', 'item2'], ring: 128,
      box: { from: 'screen', a: [1, 0], p: [-1079.5, 358] }, then: 'complete:q10' },   // 11:01
  ],
};

// Hộp trôi dạt trong làng (110): vị trí [ĐO TRONG ẢNH] (thước 33.6 px/m ngang, 21.6 px/m dọc như data/portals.js).
// herb: chỉ hộp cạnh quầy Vivian có Thảo mộc (clip 3:21-3:24 "Herb × 1"). model [ĐỀ XUẤT]: hộp thật (thùng nằm + thùng gỗ + lưới,
// b1.png) không có trong prop/ đã xuất; gần nhất là pr_oldbox_003 (rương có lưới, 3.4 m) thu 0.5 cho bằng cỡ ~1.6 m trong b1.png.
export const BOXES = [
  { id: 'box_benjamin', x: 37.6, z: 52.6, yaw: 0, model: 'prop/pr_oldbox_003.glb', scale: 0.5, herb: false, src: 'b1.png, x5.png (cạnh nhà mái xanh, trên Benjamin)' },
  { id: 'box_fountain', x: 70.6, z: 73.4, yaw: 90, model: 'prop/pr_oldbox_003.glb', scale: 0.5, herb: false, src: 'clip 3:12 (cạnh Lucy, phải đài phun)' },
  { id: 'box_vivian', x: 42.2, z: 71.0, yaw: 0, model: 'prop/pr_oldbox_003.glb', scale: 0.5, herb: true, src: 'clip 3:21, x5.png (phải quầy Vivian, giữa các thùng gỗ)' },
];
export const INTERACT_RANGE = 2.2;     // [ĐỀ XUẤT] m: trong khoảng này Space là nói chuyện / xem (InteractButton hiện)
// NPC đứng sau quầy (Allen sau quầy kho al1.png, Vivian sau quầy hàng x5.png): người chơi chỉ tới được mép quầy
export const TALK_RANGE = { Allen: 3.8, Vivian: 4.8 };   // [ĐO TRONG REPO] khoảng mép quầy trong collide 478 / 110

// Cổng tây của làng (110): đường đất z 55..61 chạy ra mép x = 1 (lưới collide). Bước vào vùng này thì Rudga chặn (4:54).
export const WEST_GATE = { rect: [0, 53, 25, 63], back: { x: 29.5, z: 58.5 }, npc: 'Rudga' };   // [ĐO TRONG REPO] collide 110

// Quầy Vivian (10:39): tab Tiêu hao, 3 ô. Chỉ Cube có tên/mô tả đọc được; hai ô kia giá 500 thấy trong clip, tên không đọc được,
// ảnh là món gần nhất trong img/item (clip: bình tròn hồng, túi giấy) [ĐỀ XUẤT].
export const SHOP = {
  Vivian: [
    { item: 4, price: 500, icon: 'img/item/Item_Cube_1.webp', name: 'item.4', desc: 'item.4.d' },
    { item: 1, price: 500, icon: 'img/item/item_potion_hp_1.webp', name: 'item.1', desc: 'item.1.d' },   // F3: thuốc = item_type 1 (thumbnail item_potion_hp_1) [ĐỀ XUẤT ghép ô 2 của quầy]
    { item: null, price: 500, icon: 'img/item/Item_Basket.webp', name: null },
  ],
};
export const ITEM_ICON = { 1: 'img/item/item_potion_hp_1.webp', 4: 'img/item/Item_Cube_1.webp', 773: 'img/item/Item_Herb.webp', 215: 'img/item/Item_SlimePart_1.webp' };   // 215 Small Slime Fragment (item_type thumbnail)
export const BAG_SLOTS = 28;           // [THẤY 10:39] "Bag 1/28"

// Tiềm năng (PerkUI): nút Slime Companion 1, 3 bậc (0/3, 3:54), học tốn 1 SP (3:57 "Learn SP 1")
export const PERKS = [{ id: 'companion1', name: 'perk.companion', desc: 'perk.companion.d', max: 3, cost: 1, icon: 'img/icon/Icon_Perk_Partner_Lv1.webp' }];
