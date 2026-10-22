// Chữ của chuỗi nhiệm vụ mở đầu "Village of Rough Waves" (nhiệm vụ 1-7 + quầy Vivian).
// - `en` là NGUYÊN VĂN game gốc, chép từ clip https://www.youtube.com/watch?v=DcGavHFwqtk (khung 1.5 s ở
//   D:\wos-ref\clips\DcGavHFwqtk\dlg\sheet_a..e.png, mốc giờ ghi cạnh từng dòng) và ảnh chụp D:\wos-ref\pilot\*.png.
//   Server gửi các chuỗi này nên chúng không có trong bảng localization của client (D:\wos-ref\data\loc).
// - `vi` là BẢN DỊCH CỦA BẢN WEB (chúng tôi tự dịch, không phải bản dịch chính thức của TEAM42), trừ các khoá đánh dấu
//   [LOC]: chép từ D:\wos-ref\data\loc\vi.json của game.
// - Dòng ghi [ĐỀ XUẤT]: không đọc được trong clip (bị che, chạy chữ dở), bản web tự viết cho trọn mạch. Mọi dòng khác thấy rõ.
// Mặc định hiện tiếng Việt; `?lang=en` hiện nguyên văn. {name} = tên người chơi. <o>..</o> = chữ cam (TMP color tag).
const P = new URLSearchParams(location.search);
export const LANG = /^en/i.test(P.get('lang') || '') ? 'en' : 'vi';

export const TEXT = {
  en: {
    // ---- nhóm, nhiệm vụ, mục tiêu (HUD QuestBookmark, băng chữ QuestStart, q1.png)
    'grp.larus': 'Village of Rough Waves',
    'q1.title': 'An Unfamiliar Place', 'q1.o': 'Talk with Amy',                 // 1:21
    'q2.title': 'Allen of Larus Storage', 'q2.o': 'Talk with Allen',            // 1:51, v9.png
    'q3.title': 'Heal the Slime', 'q3.o': 'Heal slime',                         // 2:33
    'q4.title': 'The Herb in the Box', 'q4.o': 'Herb',                          // 2:57, q1.png
    'q4.desc': "Let's grant Allen's request!\nFind the <o>Herb</o> in the <o>Washed-up Box</o>, then return to <o>Allen</o> of <o>Larus Storage</o>.",   // q1.png
    'q5.title': 'Hidden Power', 'q5.o': 'Awaken Potential',                     // 3:54, 4:00
    'q6.title': 'Talk with Lucy', 'q6.o': 'Talk with Lucy',                     // 4:21
    'q7.title': "Grant Lucy's Request", 'q7.o1': 'Defeat Junior Floralime', 'q7.o2': 'Small Slime Fragment',   // 4:45
    'map.110': 'Larus Village', 'map.478': 'Larus Storage', 'map.257': 'Larus Tavern',
    // ---- lựa chọn
    'c.end': 'End Conversation',                    // 1:24.5
    'c.whereami': 'Where am I?',                    // 1:24.5
    'c.iam': "I'm {name}",                          // 1:27.5, 10:32
    'c.father': 'Have you seen my father?',         // 1:32
    'c.whatnow': 'What should I do now?',           // 1:38
    'c.ah': 'Ah...',                                // 1:41
    'c.wherestorage': 'Where is Larus Storage?',    // 1:42.5
    'c.rest': "I'll rest a bit before I go",        // 1:42.5
    'c.whatsup': 'What was I supposed to do?',      // 1:47, 2:56
    'c.hello': 'Hello',                             // 2:18.5, 4:29
    'c.fine': "It's fine, but more importantly...", // 2:23
    'c.whatwas': 'What was I doing?',               // 2:27.5, h2.png
    'c.heal': 'Slime Healing',                      // 2:27.5, h2.png
    'c.yes': 'Yes', 'c.no': 'No',                   // h4.png
    'c.thanks': 'Thanks for the healing',           // 2:47
    'c.stamina': 'Is restoring stamina important?', // 2:48.5, h6.png
    'c.whatisit': 'What is it?',                    // 2:51.5, 4:09.5
    'c.here': 'Here you go',                        // 3:44
    'c.awakened': "I've awakened it.",              // [ĐỀ XUẤT] 4:05 chữ mờ không đọc được
    'c.where': 'Where should I go?',                // 4:12
    'c.whoto': 'Who was I to go to?',               // 4:18.5
    'c.well': 'Well...',                            // 4:33.5
    'c.lucy': 'Actually, Lucy asked me to…',        // 4:54
    'c.look': 'Take a look',                        // 3:09, b1.png
    'c.buy': 'Buy', 'c.sell': 'Sell',               // 10:32
    // ---- Amy (quán trọ), nhiệm vụ 1
    'amy1': "I'm so glad you woke up!\nAre you feeling all right?",                               // 1:23, dlg_sheet
    'amy2': 'I was worried you might not open your eyes at all.',                                 // 1:24.5
    'amy3': 'This is Larus Village.',                                                             // dlg_sheet
    'amy4': 'A village where rough waves and\nthe spirit of adventurers flow.',                   // 1:26
    'amy5': 'All the famous adventurers\nare from our village.',                                  // dlg_sheet
    'amy6': "I'm Amy, the owner of this shop.\nWhat's your name?",                                // 1:27.5
    'amy7': "By the way, you have no idea how startled I was\nto hear you'd collapsed alone in the forest.",   // 1:29
    'amy8': "Oh my, a Balrog? I've heard of it.",                                                 // 1:30.5
    'amy9': 'You must be quite strong\nagainst bad luck, {name}.',                               // 1:32
    'amy10': 'Come to think of it, {name},\nwhere is your hometown?',                            // 1:33.5
    'amy11': "Oh my, you don't know how to get back?\nGoodness, that's a real problem.",          // 1:36.5
    'amy12': 'Perhaps because it was attacked by the Balrog,\nyour slime, {name},',              // 1:39.5
    'amy13': 'looks utterly worn out.\nIt seems its stamina has run out.',                        // 1:41
    'amy14': '…in the blink of an eye.',                                                          // 1:42.5 (đầu câu đã chạy qua)
    'amy15': "After heading <o>outside</o>, go straight <o>north</o>\nand you'll see it.",        // 1:44
    'amy16': 'Oh my, did you have something to say to me?',                                       // 1:45.5
    // ---- Allen (kho), nhiệm vụ 2-5
    'al1': 'Welcome. This is Larus Storage.',                                                     // 2:17, al1.png
    'al2': "Oh, who might you be? We haven't met before…",                                        // QUESTLINE 2:18
    'al3': "Oh, nice to meet you.\nI'm Allen.",                                                   // 2:20
    'al4': 'By the way, {name}, how did you end up\ncoming all the way to Larus Village?',        // 2:21.5
    'al5': 'So you were attacked by a Balrog while traveling…',                                   // 2:21 (sheet02)
    'al6': "And you don't even know how to get back\nto your hometown, that must be so hard.",     // 2:23
    'al7': "Indeed, you'd best get it <o>healed</o> right away.",                                 // 2:24.5
    'alH': 'The healing costs <o>{cost} Gold</o>.\nWould you like to be healed?',                 // h4.png (89), clip 2:41 (71)
    'alH2': 'The healing is complete.\nCome by anytime you need healing.',                        // 2:42.5
    'alHno': "You don't have enough Gold.",                                                       // [ĐỀ XUẤT]
    'al8': "so whenever your slime isn't in good shape,\nplease visit anytime.",                  // 2:48.5, h6.png
    'al9': "Its movements also slow down,\nso it's quite a dangerous state.",                     // 2:50
    'al10': "There's actually one thing I'd like to ask of you.",                                 // 2:51.5
    'al11': "So I'd like you to move around outside\nin my place, {name}.",                       // 2:53
    'al12': 'but thanks to you, {name},\nI can breathe a little easier now.',                     // 3:45
    'al13': "By the way, {name}.\nAs a fellow cube user, there's something I'm curious about.",   // 3:47
    'al14': "The slime you cared for earlier, {name},\nwas clearly different from everyone else's slimes.",   // 3:48
    'al15': "Oh, my.\nDon't tell me you don't know?",                                             // 3:48.5
    'al16': 'And carefully examine what kind of\n<o>potential</o> lies inside you.',              // 3:51
    'al17': 'Would you like to try awakening your <o>potential</o>?',                             // 3:50
    'al18': 'Then, {name},\ntake your time and look within yourself.',                            // 3:51.5
    'al19': "Oh, my goodness...\nYou've grown even stronger than before!",                        // 4:05
    'al20': "I'm certain you'll grow far stronger than you are now.",                             // 4:06
    'al21': "if you don't mind,\nthere's one more thing I'd like to ask of you.",                 // 4:09.5
    'al22': 'Oh, someone who loves\ndrawing slimes.',                                             // 4:11
    'al23': 'It seemed like she wanted to talk with you\nonce you woke up, {name}.',              // 4:12.5
    // ---- Lucy (đài phun), nhiệm vụ 6
    'lu1': 'Anyone here worth painting...?',                                                      // 4:29, 7:33
    'lu2': "I'm glad you woke up.",                                                               // 4:30.5
    'lu3': 'So, your name is...',                                                                 // 4:32
    'lu4': 'Anyway, what brings you to me?\nDid you need something?',                             // 4:33.5
    'lu5': "I want to test whether you're strong\nenough to bring me a slime,",                   // 4:36
    'lu6': "I hear it's quite dangerous out there...",                                            // 4:36.5
    'lu7': 'Just bring me <o>1</o>\nof those byproducts.',                                        // 4:38
    'lu8': "I'll be waiting, so take care out there.",                                            // 4:39
    // ---- Rudga (cổng tây), nhiệm vụ 7
    'ru1': "Wait! It's dangerous outside the village!",                                           // 4:54, x5.png
    'ru2': "You barely escaped with your life, and you're\nabout to head down a dangerous path again?",   // QUESTLINE
    'ru3': 'By the way, {name}, were you really about to\nhead outside the village?',             // QUESTLINE
    'ru4': '…All right, then duel me and prove your skill!',                                      // QUESTLINE
    // ---- hộp trôi dạt (b1.png, 3:09)
    'box.name': '...',
    'bx1': 'A box that floated in from the sea.',
    'bxEmpty': "There's nothing inside.",                                                         // [ĐỀ XUẤT] clip không cho thấy
    // ---- Vivian (quầy hàng), phần mua Cube của nhiệm vụ 13
    'vi1': "Wow, so you're the kid who came from\noutside the village?",                          // 10:30
    'vi2': 'Hmm, your name was, let me see...',                                                   // 10:32
    'vi3': "Our shop is stocked with all sorts of\nthings you'll need for adventuring.",           // 10:33
    'vi4': 'It can really come in handy in a pinch,\nso bring anything you want to sell, anytime~',   // 10:35
    'vi5': 'We only deal in the finest goods!',                                                   // 10:36
    // ---- thẻ hướng dẫn (DialogueIllust)
    'tut.heal.t': 'Slime Healing',                                                                // 1:42
    'tut.heal.d': "Heal a <o>slime</o> whose <o>Stamina</o> has run low at the <o>storage</o>.\nAlong with the slime's <o>Stamina</o>, its <o>HP</o> and <o>MP</o> are also restored.",
    'tut.whistle.t': 'Combat Controls & Whistle',                                                 // 4:57
    'tut.whistle.d': 'Stop the battle and recall your slime.\nWhen you press the <o>whistle</o> button, your slime returns.',
    // ---- giao diện (chuỗi server/khung hình, không có trong bảng loc)
    'ui.userExp': 'User EXP',                                                                     // [LOC] Log.Exp
    'ui.levelUp': 'Level Up',
    'ui.sp': 'You have earned a skill point!',                                                    // [LOC] Levelup.SkillPoint
    'ui.questComplete': 'Quest complete!',                                                        // [LOC] Quest.QuestCompleteText
    'ui.inprogress': 'Inprogress', 'ui.complete': 'Complete', 'ui.quest': 'Quest', 'ui.all': 'All',   // [LOC]
    'ui.potential': 'Potential', 'ui.potentialInfo': 'Potential Info', 'ui.condition': 'Condition', 'ui.learn': 'Learn',   // [LOC]
    'ui.notEnoughSP': 'Not enough Potential. Failed to learn a skill.',                           // [LOC] Perk.NotEnoughSkillPoint
    'perk.companion': 'Slime Companion 1',                                                        // 3:57
    'perk.companion.d': 'Increases the max level of slimes that can accompany',                   // 3:57
    'ui.buy': 'Buy', 'ui.cancel': 'Cancel', 'ui.confirm': 'Confirm', 'ui.min': 'Min', 'ui.bag': 'Bag', 'ui.owned': 'Owned', 'ui.consumable': 'Consumable',   // [LOC]
    'ui.thanks': 'Thanks for your purchase!',                                                     // 10:45
    'ui.confirmBuy': 'Are you sure you want to buy it?',                                          // 10:45 (popup Notice)
    'ui.notEnoughGold': 'Not enough Gold.',                                                       // [ĐỀ XUẤT]
    'item.4': 'Cube', 'item.4.d': 'A basic Cube made for taming slimes. Anyone can obtain it easily.',   // 10:39
    'item.773': 'Herb',
    'ui.notice': 'Notice',
    'ui.notBuilt': 'Not in the web version yet: the duel with Rudga and Shadow Forest have no map data.',   // bản web
    'ui.ok': 'Yes',
  },
  vi: {
    'grp.larus': 'Làng Sóng Dữ',
    'q1.title': 'Nơi Xa Lạ', 'q1.o': 'Nói chuyện với Amy',
    'q2.title': 'Allen Ở Kho Larus', 'q2.o': 'Nói chuyện với Allen',
    'q3.title': 'Chữa Cho Slime', 'q3.o': 'Chữa slime',
    'q4.title': 'Thảo Mộc Trong Hộp', 'q4.o': 'Thảo mộc',
    'q4.desc': 'Hãy giúp Allen nào!\nTìm <o>Thảo mộc</o> trong <o>Hộp trôi dạt</o>, rồi quay về gặp <o>Allen</o> ở <o>Kho Larus</o>.',
    'q5.title': 'Sức Mạnh Tiềm Ẩn', 'q5.o': 'Đánh thức tiềm năng',
    'q6.title': 'Nói Chuyện Với Lucy', 'q6.o': 'Nói chuyện với Lucy',
    'q7.title': 'Giúp Lucy', 'q7.o1': 'Hạ Junior Floralime', 'q7.o2': 'Mảnh slime nhỏ',
    'map.110': 'Làng Larus', 'map.478': 'Kho Larus', 'map.257': 'Quán Trọ Larus',
    'c.end': 'Kết thúc hội thoại', 'c.whereami': 'Đây là đâu?', 'c.iam': 'Tôi là {name}', 'c.father': 'Cô có thấy bố tôi không?',
    'c.whatnow': 'Giờ tôi phải làm sao?', 'c.ah': 'À...', 'c.wherestorage': 'Kho Larus ở đâu?', 'c.rest': 'Tôi nghỉ một chút rồi đi',
    'c.whatsup': 'Tôi phải làm gì nhỉ?', 'c.hello': 'Xin chào', 'c.fine': 'Không sao, quan trọng hơn là...', 'c.whatwas': 'Tôi đang làm gì nhỉ?',
    'c.heal': 'Chữa slime', 'c.yes': 'Có', 'c.no': 'Không', 'c.thanks': 'Cảm ơn vì đã chữa', 'c.stamina': 'Hồi thể lực quan trọng lắm à?',
    'c.whatisit': 'Chuyện gì vậy?', 'c.here': 'Của anh đây', 'c.awakened': 'Tôi đánh thức được rồi.', 'c.where': 'Tôi nên đi đâu?',
    'c.whoto': 'Tôi phải gặp ai nhỉ?', 'c.well': 'Thì...', 'c.lucy': 'Thật ra Lucy nhờ tôi…', 'c.look': 'Xem thử', 'c.buy': 'Mua', 'c.sell': 'Bán',
    'amy1': 'Mừng quá, cậu tỉnh rồi!\nCậu thấy trong người ổn chứ?',
    'amy2': 'Tôi đã lo cậu sẽ không mở mắt nữa.',
    'amy3': 'Đây là làng Larus.',
    'amy4': 'Ngôi làng của sóng dữ và\nkhí phách nhà thám hiểm.',
    'amy5': 'Mọi nhà thám hiểm lừng danh\nđều xuất thân từ làng chúng tôi.',
    'amy6': 'Tôi là Amy, chủ quán này.\nCậu tên là gì?',
    'amy7': 'Mà này, nghe tin cậu ngất một mình trong rừng\ntôi hết cả hồn đấy.',
    'amy8': 'Trời, một con Balrog sao? Tôi có nghe nói đến nó.',
    'amy9': 'Cậu đúng là gan lì trước vận rủi\nđấy, {name}.',
    'amy10': 'Nhắc mới nhớ, {name},\nquê cậu ở đâu vậy?',
    'amy11': 'Trời, cậu không biết đường về sao?\nThế thì phiền thật đấy.',
    'amy12': 'Chắc là vì bị Balrog tấn công,\nslime của cậu, {name},',
    'amy13': 'trông kiệt sức lắm rồi.\nCó vẻ nó cạn thể lực rồi.',
    'amy14': '…trong nháy mắt thôi.',
    'amy15': 'Ra khỏi <o>quán</o> rồi đi thẳng lên <o>phía bắc</o>\nlà thấy ngay.',
    'amy16': 'Ơ, cậu có gì muốn nói với tôi à?',
    'al1': 'Chào mừng. Đây là Kho Larus.',
    'al2': 'Ồ, cậu là ai vậy? Ta chưa gặp nhau bao giờ…',
    'al3': 'Ồ, rất vui được gặp cậu.\nTôi là Allen.',
    'al4': 'Mà này {name}, sao cậu lại\nlạc tới tận làng Larus vậy?',
    'al5': 'Vậy là cậu bị Balrog tấn công khi đang đi đường…',
    'al6': 'Lại còn không biết đường về quê nữa,\nchắc vất vả lắm.',
    'al7': 'Phải rồi, cậu nên <o>chữa</o> cho nó ngay đi.',
    'alH': 'Chữa trị tốn <o>{cost} Vàng</o>.\nCậu có muốn chữa không?',
    'alH2': 'Chữa xong rồi.\nCần chữa thì cứ ghé lúc nào cũng được.',
    'alHno': 'Cậu không đủ Vàng.',
    'al8': 'nên hễ slime của cậu không khoẻ,\ncứ ghé lúc nào cũng được.',
    'al9': 'Nó còn đi chậm lại nữa,\nnên tình trạng đó khá nguy hiểm.',
    'al10': 'Thật ra tôi có một việc muốn nhờ cậu.',
    'al11': 'Nên tôi muốn cậu ra ngoài\nđi thay tôi một chuyến, {name}.',
    'al12': 'nhưng nhờ cậu, {name},\ntôi nhẹ nhõm được phần nào rồi.',
    'al13': 'Mà này {name}.\nLà người cùng dùng cube, có chuyện tôi tò mò lắm.',
    'al14': 'Con slime cậu chăm lúc nãy, {name},\nrõ ràng khác hẳn slime của mọi người.',
    'al15': 'Ôi trời.\nĐừng nói là cậu không biết nhé?',
    'al16': 'Và hãy xem kỹ xem bên trong cậu\ncó <o>tiềm năng</o> gì.',
    'al17': 'Cậu có muốn thử đánh thức <o>tiềm năng</o> của mình không?',
    'al18': 'Vậy thì {name},\ncứ từ từ nhìn vào bên trong mình nhé.',
    'al19': 'Ôi chao...\nCậu mạnh hơn trước nhiều rồi đấy!',
    'al20': 'Tôi chắc cậu sẽ còn mạnh hơn bây giờ nhiều.',
    'al21': 'nếu cậu không phiền,\ntôi còn một việc nữa muốn nhờ.',
    'al22': 'Ồ, một người rất thích\nvẽ slime.',
    'al23': 'Hình như cô ấy muốn nói chuyện với cậu\nkhi cậu tỉnh lại đấy, {name}.',
    'lu1': 'Ở đây có ai đáng vẽ không nhỉ...?',
    'lu2': 'Mừng là cậu tỉnh rồi.',
    'lu3': 'Vậy, tên cậu là...',
    'lu4': 'Mà cậu tìm tôi có chuyện gì?\nCậu cần gì à?',
    'lu5': 'Tôi muốn thử xem cậu có đủ mạnh\nđể mang slime về cho tôi không,',
    'lu6': 'Nghe nói ngoài kia nguy hiểm lắm...',
    'lu7': 'Chỉ cần mang cho tôi <o>1</o>\ncái phụ phẩm đó thôi.',
    'lu8': 'Tôi sẽ đợi, nên ra ngoài cẩn thận nhé.',
    'ru1': 'Khoan! Ra ngoài làng nguy hiểm lắm!',
    'ru2': 'Vừa thoát chết trong gang tấc mà\nlại định đi vào đường nguy hiểm nữa sao?',
    'ru3': 'Mà này {name}, cậu thật sự định\nra ngoài làng à?',
    'ru4': '…Được thôi, vậy đấu với tôi để chứng tỏ bản lĩnh đi!',
    'box.name': '...',
    'bx1': 'Một chiếc hộp trôi dạt từ biển vào.',
    'bxEmpty': 'Bên trong không có gì.',
    'vi1': 'Ồ, vậy ra cậu là đứa nhóc từ\nngoài làng đến à?',
    'vi2': 'Hừm, tên cậu là gì nhỉ, để xem nào...',
    'vi3': 'Tiệm chúng tôi có đủ mọi thứ\ncậu cần cho chuyến phiêu lưu.',
    'vi4': 'Lúc nguy cấp là dùng được ngay,\nnên có gì muốn bán cứ mang tới nhé~',
    'vi5': 'Chúng tôi chỉ bán hàng tốt nhất thôi!',
    'tut.heal.t': 'Chữa Slime',
    'tut.heal.d': 'Chữa cho <o>slime</o> bị cạn <o>Thể lực</o> ở <o>kho</o>.\nCùng với <o>Thể lực</o>, <o>HP</o> và <o>MP</o> của slime cũng được hồi lại.',
    'tut.whistle.t': 'Điều Khiển Chiến Đấu & Huýt Sáo',
    'tut.whistle.d': 'Dừng trận đấu và gọi slime về.\nBấm nút <o>huýt sáo</o> thì slime sẽ quay về.',
    'ui.userExp': 'EXP Người Chơi',                      // [LOC]
    'ui.levelUp': 'Lên Cấp',
    'ui.sp': 'Bạn nhận được một điểm kỹ năng!',          // [LOC]
    'ui.questComplete': 'Hoàn thành nhiệm vụ!',          // [LOC]
    'ui.inprogress': 'Đang Tiến Hành', 'ui.complete': 'Hoàn Thành', 'ui.quest': 'Nhiệm Vụ', 'ui.all': 'Tất Cả',   // [LOC]
    'ui.potential': 'Tiềm Năng', 'ui.potentialInfo': 'Thông Tin Tiềm Năng', 'ui.condition': 'Điều Kiện', 'ui.learn': 'Học',   // [LOC]
    'ui.notEnoughSP': 'Không đủ tiềm năng. Học kỹ năng thất bại.',   // [LOC]
    'perk.companion': 'Slime Đồng Hành 1',
    'perk.companion.d': 'Tăng cấp tối đa của slime có thể đồng hành',
    'ui.buy': 'Mua', 'ui.cancel': 'Hủy', 'ui.confirm': 'Xác Nhận', 'ui.min': 'Tối Thiểu', 'ui.bag': 'Túi Đồ', 'ui.owned': 'Số Lượng', 'ui.consumable': 'Tiêu Hao',   // [LOC]
    'ui.thanks': 'Cảm ơn quý khách!',
    'ui.confirmBuy': 'Bạn có chắc muốn mua không?',
    'ui.notEnoughGold': 'Không đủ Vàng.',
    'item.4': 'Cube', 'item.4.d': 'Cube cơ bản dùng để thuần phục slime. Ai cũng dễ dàng có được.',
    'item.773': 'Thảo mộc',
    'ui.notice': 'Thông Báo',
    'ui.notBuilt': 'Chưa có trong bản web: trận đấu với Rudga và Shadow Forest chưa có dữ liệu bản đồ.',
    'ui.ok': 'Có',
  },
};

// L('al4', { name }) -> chuỗi theo ngôn ngữ trang; thiếu bản vi thì dùng nguyên văn
export function L(key, args) {
  let s = TEXT[LANG][key] ?? TEXT.en[key] ?? key;
  if (args) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in args ? args[k] : m));
  return s;
}
