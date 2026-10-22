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
    'item.215': 'Small Slime Fragment',                                                           // 6:27 (item_type 215)
    'ui.slimeExp': 'Slime EXP',                                                                   // 6:06 "Roasted Slime EXP + 2"
    'ru.duel1': 'Got some fight in you? Then bring it!',                                          // 5:33
    'ru.duel2': "A true adventurer doesn't crumble over a trial like this!",                      // 5:36
    'ru.won': "A true adventurer doesn't crumble over a trial like this!",                        // [ĐỀ XUẤT] sau trận: lặp câu 5:36
    'mt.b1': "Hic! Ah, I'm getting drunk!",                                                       // 6:36
    'ui.notice': 'Notice',
    'ui.notBuilt': 'Not in the web version yet: the duel with Rudga and Shadow Forest have no map data.',   // bản web
    'ui.ok': 'Yes',
    // ---- F3 bắt slime, túi, kho, bách khoa. [LOC] = chuỗi của D:\wos-ref\data\loc\en.json (khoá ghi cạnh)
    'item.1': '30 HP Potion', 'item.1.d': 'A potion that restores 30 HP of the slime with you.',   // tên 7:38 "30 HP Potion × 3"; mô tả [ĐỀ XUẤT]
    'tame.tag.tame': 'Tame', 'tame.tag.untamed': 'Untamed',                                       // gmwall_tame_floralime_cube / v4van_capture_untamed_prince; [LOC] SlimeIndex.DegreeStep02
    'tame.noNearby': 'There are no wild slimes nearby to tame!',                                  // [LOC] UI.CubeNoNearbySlime
    'tame.autoArchived': 'The tamed slime has been sent to the warehouse!',                       // [LOC] UI.AutoArchived
    'tame.full': 'Slime inventory is full. You cannot tame a slime now.',                         // [LOC] UI.CubeNoEmptyInven
    'tame.caught': '{name} was tamed!',                                                           // [ĐỀ XUẤT]
    'tame.free': '{name} broke free!',                                                            // [ĐỀ XUẤT] ("nakatakas", GM WALL 6:56)
    'tame.miss': 'The Cube missed.',                                                              // [ĐỀ XUẤT]
    'tame.registered': 'New slime data has been registered in the Slimepedia.',                  // [LOC] UI.SlimeIndexRegistered
    'tame.askNick': 'Would you like to give the {name} a nickname?',                              // v4van_nickname_synthesis_lab
    'tame.nextTime': 'Next time', 'tame.nickname': 'Nickname',                                    // v4van_nickname_synthesis_lab
    'tame.nickTitle': 'Nickname Setting', 'tame.nickHint': 'Maximum of {Length} alphabets',       // [LOC] LoginScene.NickName.Title, LoginScene.Nickname.PlaceHolder
    'item.cooldown': 'The item is on cooldown.',                                                  // [ĐỀ XUẤT]
    'item.used': '{item} used: {name} HP + {n}',                                                  // [ĐỀ XUẤT]
    'item.noTarget': 'There is no partner slime to use it on.',                                   // [ĐỀ XUẤT]
    'item.addQuick': 'Added to Quick Slot!', 'item.removeQuick': 'Removed from Quick Slot!',      // [LOC] Inventory.AddQuickslot / RemoveQuickslot
    'item.alreadyQuick': "It's already set in Quickslot",                                         // [LOC] Inventory.AlreadyQuickSlot
    'bag.use': 'Use', 'bag.addQuick': 'Add Quick-Slot', 'bag.removeQuick': 'Remove Quick Slot', 'bag.organize': 'Organize',   // [LOC] Common.UseButton, Inventory.AddQuickSlot, Common.RemoveQuickSlot, Inventory.OrganizeBag
    'bag.title': 'Bag', 'bag.all': 'All', 'bag.empty': 'You have selected an empty slot.',       // [LOC] Common.Inventory, SlimeArchive.Empty
    'bag.cannotUse': 'This item cannot be used from the bag.',                                    // [ĐỀ XUẤT] (Cube: canUseInInventory false)
    'party.unavailable': 'Accompany Unavailable',                                                 // [LOC] PlayScene.Slimeslotlimit
    'party.cooldown': 'Cannot be changed during cooldown.',                                       // [LOC] EquipMonsterFailCode.SWITCH_ON_COOLDOWN
    'party.hpZero': 'Slime has no HP.',                                                           // [LOC] EquipMonsterFailCode.MONSTER_HP_ZERO
    'party.switchPerk': 'Unlock the skill to use.',                                               // [LOC] SwitchMonsterFailCode.Perk
    'party.fainted': 'Fainted', 'party.accompanying': 'Accompanying',                              // [LOC] Slimeinventory.Faint, Archive.AlreadyHolding
    'st.title': 'Slime Storage', 'st.take': 'Take It', 'st.archive': 'Archive', 'st.bag': 'Bag',  // [LOC] Archive.*
    'st.emptySlot': 'You have selected an empty slot.',                                          // [LOC] SlimeArchive.Empty
    'st.takeFail': 'Failed to bring out the slime!', 'st.archiveFail': 'Slime storage failed!',   // [LOC] Context.Archive.*
    'st.lastSlime': 'You must have at least one slime!',                                          // [LOC] SlimeInventory.ReleaseWhenOneSlime
    'st.equipped': 'Partner slime cannot be used.',                                               // [LOC] SlimeInventory.ReleaseEquippedSlime
    'st.skill': 'Skill', 'st.level': 'Level',
    'c.storage': 'Slime Storage',                                                                 // [LOC] Archive.SlimeStorageTitle (lựa chọn với Allen)
    'al.st1': "You'll be able to see a list of slimes currently tamed by {name}.",               // v4van_capture_untamed_prince (Allen)
    'dex.title': 'Slimepedia', 'dex.point': 'Collection Point', 'dex.noData': 'No data',          // [LOC] Index.SlimeIndexTitle, Index.IndexScore, SlimeIndex.DegreeStep00
    'dex.discover': 'Discovery', 'dex.tame': 'Tame', 'dex.bond': 'Bond',                          // [LOC] SlimeIndex.DegreeStep01..03
    'dex.found': 'Found slime {FoundCount}', 'dex.caught': 'Tamed slime {CaughtCount}',          // [LOC] Index.FoundSlimeCount, Index.CaughtSlimeCount
    'dex.bonding': 'People Bonding',                                                              // gmwall_slimepedia "??? People Bonding"
    // ---- F4: nhiệm vụ 7 (trả) .. 14. Mốc giờ = clip DcGavHFwqtk; khung 1280x720 bóc lại ở D:\wos-ref\clips\DcGavHFwqtk\f4, f4full
    'grp.sidejob': 'Suspicious Side Job', 'grp.patrol': 'Shadow Forest Patrol',                   // 8:06, 8:30 băng QuestStart
    'map.shadow_forest_entrance': 'Shadow Forest Entrance',
    'q8.title': "Grant Martin's Request", 'q8.o': 'Defeat Junior Floralime',                      // 6:57, 6:54
    'q9.title': 'Recovery Complete!', 'q9.o': 'Use 30 HP Potion',                                  // 7:30 "Recovery Complete! ✓ Use 30 HP Potion 1/1"
    'q10.title': 'Suspicious Researcher', 'q10.o': 'Purchase Cube',                                // 8:06, 10:15 "Purchase Cube 0/3"
    'q11.title': 'Patrol', 'q11.o1': 'Patrol Shadow Forest Entrance', 'q11.o2': 'Defeat Junior Floralime',   // 8:30, 11:03
    'q12.title': 'Suspicious Part-Time Job',                                                      // 11:03 "Suspicious Part-Time J…" (chữ bị cắt; "Job" [ĐỀ XUẤT])
    'q12.o': 'Not in the web version yet',                                                        // bản web: clip dừng ở 11:06
    'q12.desc': "The clip ends here (11:06): this quest's objectives are not in the web version yet.",   // bản web
    // Martin (Shadow Forest Entrance), nhận 6:39-6:52, trả 10:06-10:13. Người chơi bấm qua nhanh: dòng "He…", "So…" bỏ (không đọc được)
    'mt1': 'Hey! *hic*',                                                                          // 6:40
    'mt2': 'Yes, you, the one who just turned to look!\nCome over here a moment!',                // 6:41
    'mt3': '*hic* Bring me liquor, liquor!',                                                      // 6:45.5, 6:52, 10:06
    'mt4': "I thought I was seeing things from being drunk, *hic*\nBut you're a real person?",    // 6:47
    'mt5': 'Since you wander outside the village,\nyou must know how to handle slimes! *hic*',    // 6:47.5
    'mt6': "I'm envious, *hic* so very envious...",                                               // 6:47.7
    'mt7': 'All right, you ask? *hic*\nDoes this Martin look all right to you?',                  // 6:48.7
    'mt8': 'The moment I see those <o>Junior Floralime</o>,\nrage boils up inside me... *hic*',   // 6:49
    'mt9': 'Go get rid of some <o>Junior Floralime</o>\nroaming around here, *hic*',              // 6:49.7
    'mt10': "Those cursed slimes, *hic*\nno matter how many I kill, it's never enough, *hic*",    // 6:50.8
    'mt11': 'but <o>10</o> of them, at least, *hic*\nmight ease this gut of mine, *hic*',         // 6:51
    'mt12': "Ohh, you're amazing! *hic*",                                                         // 10:07.8
    'mt13': 'You know, I once dreamed\nof being a great adventurer too, *hic*',                   // 10:08.5
    'mt14': 'Slimes...! *hic*\nThose damn slimes got in the way!!',                               // 10:09.1
    'mt15': "If only I'd known how to handle a Cube,\nthose slimes would've just...! ......",     // 10:09.5
    'mt16': '...... ......',                                                                      // 10:10
    'mt17': "Everyone, come back!! Don't go that way!!",                                         // 10:10.8
    'mt18': 'There are slimes over there...\n...Huh? Did I just doze off? *hic*',                 // 10:11.2
    'mt19': 'If I doze off even after killing slimes, *hic*\nI must not have had enough liquor, *hic*',   // 10:12
    'mt20': 'Good work. You can go now, *hic*\nThanks for indulging my venting, *hic*',           // 10:12.4
    'c.matter': "What's the matter?", 'c.done': "It's done", 'c.martin': '...Martin?', 'c.youdid': 'You did...',   // 6:45, 10:07, 10:10, 10:11.5 ("You did" chạy chữ dở)
    // Lucy trả q7 (7:18-7:28) + dạy dùng thuốc, trả "Recovery Complete!" (7:33-7:42)
    'lr1': 'You made it back safe...!\nAre you hurt anywhere?',                                   // 7:19.2
    'lr2': 'You were later than I expected, so I worried\nsomething might have happened to you in the forest.',   // 7:19.5 ("forest" bị khung che [ĐỀ XUẤT])
    'lr3': 'Anyway, did you manage to defeat the Junior\nFloralime?',                             // 7:21.7
    'lr4': 'Impressive...\nThen, will you show me the byproducts you got?',                       // 7:22.5 ("got" bị che [ĐỀ XUẤT])
    'lr5': "Wow, it's a Small Slime Fragment.\nI haven't seen one in ages...",                    // 7:23.5
    'lr6': 'There are only a few people in the village\nwho can handle slimes.',                  // 7:24
    'lr6b': 'Do you have any potions with you?',                                                  // [ĐỀ XUẤT] 7:24.2 chỉ thấy "D…"
    'lr7': "You didn't know. A <o>Potion</o> is an item that can\n<o>restore the HP or mana</o> of the slime with you.",   // 7:25.4
    'lr8': 'Since you went outside the village,\nyour slime might be hurt too.',                  // 7:25.7
    'lr9': "Here, take this first.\nIt's a ⟦potion⟧<o>30 HP Potion</o>.",                                 // 7:26
    'lr10': "...Yes, it's an apology gift for you.",                                              // 7:27
    'lr11': 'Feed it directly to the slime with you.',                                            // 7:27.5
    'lr12': 'You can either take it straight from your <o>bag</o>,\nor <o>set it out for easy use</o>.',   // 7:27.7
    'lr13': 'but out where slimes swarm,\na potion is a huge help.',                               // 7:35.5
    'lr14': "Oh, and potions are sold at Vivian's shop.",                                         // 7:36
    'lr15': "...I'm telling you this because\nyou looked like you didn't know anything.",          // 7:37
    'lr16': 'I recommend going to see <o>Billy</o>.',                                             // 7:38.2
    'lr17': 'He seems interested in you...\nWhy not go say hello, at least?',                     // 7:39.7
    'lr18': "I see... it's important to act\non what your heart tells you.",                      // 7:40.7
    'lr19': 'If you ever tame a splendid slime,\ncome show me now and then.',                    // 7:41.5
    'lr20': '...Wondering what you should do?\nThen, how about going to see <o>Billy</o>?',       // 7:42.7
    'c.back': "I'm back", 'c.actually': 'Actually...', 'c.ofcourse': 'Of course', 'c.herethey': 'Here they are',   // 7:18.5, 7:20, 7:22, 7:23
    'c.potion': 'A Potion?', 'c.giving': 'Are you giving this to me?', 'c.fed': 'I fed it the potion',   // 7:24.8, 7:26.3, 7:33
    'c.whatnow2': 'What should I do now?', 'c.think': "I'll think about it",                      // 7:36, 7:39
    // Mysterious Researcher (gần kho, 7:46-8:05; 10:55-11:01)
    'rs0': 'Hey, you there! Hold on.\nCome talk with me.',                                        // 7:47 (gọi từ xa khi trả Recovery Complete!)
    'rs1': "You've got quite a rare slime there.\nIs that yours?",                               // 7:54.6
    'rs2': 'Really?\nWhere on earth did you find it?',                                            // 7:55.9
    'rs3': "I can't remember the last time\nI saw a slime like this!",                            // 7:56.2
    'rs4': "Don't tell me you don't know\nthe value of your own slime?",                          // 7:57.5
    'rs5': "It's a special kind of slime that can\nbond with you through connection.",            // 7:58.5 (thẻ Friendly Slime)
    'rs6': 'Most slimes are hostile toward humans,\nbut a <o>Friendly Slime</o> is different.',   // 7:58.2
    'rs7': '..Did you know that humans who can bond with\n<o>Friendly Slimes</o> are called <o>Trainers</o>?',   // 7:58.9
    'rs8': "Ugh, I'm not sure I can trust someone\nwho doesn't even know this basic stuff.",      // 7:59.6
    'rs9': 'The task I want to entrust to you\ncan only be done by someone who can wield ⟦cube⟧<o>Cube</o>.',   // 8:02 (khung 2 fps)
    'rs10': 'This is a critical task that requires handling\n⟦cube⟧<o>Cube</o>...!',                    // 8:00
    'rs11': "...!\nDon't tell me you don't even know what ⟦cube⟧<o>Cube</o> is?",                       // 8:01
    'rs12': '⟦cube⟧<o>Cube</o> is something you need\nto <o>tame slimes</o>.',                          // 8:01.4
    'rs13': 'Only a handful of people\ncan use one,',                                             // 8:01.7
    'rs14': 'and only those born with\nan innate talent for handling slimes.',                    // 8:01.9
    'rs15': "...No good.\nLooks like you don't even have ⟦cube⟧<o>Cube</o> on you.",                    // 8:02.2
    'rs16': "So we'll have to start from there.",                                                 // 8:02.4
    'rs17': 'Go to the <o>Shop</o> right now and\nbring me <o>3</o> ⟦cube⟧<o>Cube</o>.',                // 8:02.6
    'rs18': "I'm teaching you the basics\nfrom scratch,",                                         // 8:03.9
    'rs19': "so you should be grateful\nI'm not charging you for lessons!",                       // 8:04.1
    'rs20': 'The <o>shop</o> is near the <o>west exit of the village</o>!',                       // 8:04.4
    'rs21': 'No arguments.\nGet going, quick!',                                                   // 8:04.5 (thẻ Shop)
    'rsA': 'How did that task go?',                                                               // 8:06.7, 10:55 "How did tha…" (cuối câu [ĐỀ XUẤT])
    'rt1': 'Hmm, I was worried, but you managed just fine.',                                      // 10:56.9
    'rt2': 'Good, then let me get to the real business!',                                         // 10:57.1
    'rt3': "I'd like to offer you a part-time job.",                                              // 10:57.4
    'rt4': 'To <o>tame</o> one, use the ⟦cube⟧<o>Cube</o> when a slime comes\nclose.',                  // 10:57.7 (chữ đầu bị cắt [ĐỀ XUẤT])
    'rt5': "For that, you'd better take out the ⟦cube⟧<o>Cube</o>\nin advance so it's ready to use, right?",   // 10:57.9
    'rt6': "Before throwing the ⟦cube⟧<o>Cube</o>,\ndon't forget to wear down the slime's health first.",   // 10:58.1 (thẻ Tame)
    'rt7': "I'll give you a full explanation of the\n<o>Slimepedia</o> when the time comes.",     // 10:59.4
    'rt8': 'If you want to know, hurry and go\n<o>tame a Junior Floralime</o>!',                 // 11:00.7
    'c.yesright': "Yes, that's right.", 'c.rare': 'Is my slime rare?', 'c.isee': 'I see', 'c.whatcube': 'What is Cube?',   // 7:55, 7:56.5, 7:59, 8:00.3
    'c.ownmoney': 'With my own money?', 'c.whatbuy': 'What was it you wanted me to buy?',         // 8:02.8, 8:06
    'c.brought': "I've brought the Cube", 'c.understood': 'Understood.', 'c.slimepedia': 'Slimepedia?',   // 10:56, 10:58.3, 10:59.8
    // Billy (đài phun, 8:18-8:28)
    'bi0': 'Haha, care to watch over Larus with me?',                                             // 8:18.5, 8:28.5
    'bi1': "Oh oh, a stranger from outside the village!\nGlad to meet you! I'm the guardian of the village,\nBilly.",   // 8:19.7
    'bi2': 'Welcome to Larus Village,\nfull of curiosity and romance!',                           // 8:21
    'bi3': "Hahaha, meeting like this must be some kind of\nfate!\nSomehow I have a feeling we'll get along just fine.",   // 8:21.8
    'bi4': "As it happens, I've been looking for someone\nto <o>patrol</o> Shadow Forest!",       // 8:22.7
    'bi5': "That's right!\nIt means checking for anything that could threaten\nthe village!",    // 8:23.5
    'bi6': 'Not just inside the village,\nbut the outskirts and surroundings too!',               // 8:23.8
    'bi7': 'So, what do you say? Would you give it a try?',                                       // 8:24
    'bi8': 'Hahaha, I like that confidence!',                                                     // 8:25.2
    'bi9': 'Then, start by patrolling\n<o>Shadow Forest Entrance</o>!',                           // 8:25.5
    'bi10': 'Be thorough about it!\nMake sure to scout all the way to the end\nin the direction of Forest Path!',   // 8:25.8
    'bi11': "Oh, if there are any threats out there, you'll have\nto take them down too!",        // 8:26.8
    'bi12': 'I heard from Martin that <o>Shadow Forest Entrance</o>\nhas\n<o>Junior Floralime</o> running wild.',   // 8:27.2
    'bi13': 'If you run into them on patrol,\ntake out <o>10</o> of them for me!',                // 8:27.3
    'c.nicemeet': 'Nice to meet you', 'c.leave': 'Leave it to me',                                // 8:18 ("…meet you", chữ đầu [ĐỀ XUẤT]), 8:24.8
    'ui.notBuiltTurnIn': 'Not in the web version yet: the clip never shows this quest being turned in.',   // bản web
    // thẻ hướng dẫn (DialogueIllust) + màn chỉ nút (Tutorial_* prefab, chuỗi Unmasking.* [LOC])
    'tut.friendly.t': 'Friendly Slime',                                                           // 7:58.5
    'tut.friendly.d': 'Unlike ordinary slimes, a Friendly Slime <o>gives off a special aura</o> around it.\nTravel with a Friendly Slime to raise its <o>affinity</o>.',
    'tut.shop.t': 'Shop',                                                                         // 8:04.5
    'tut.shop.d': 'To <o>tame a slime</o> you need a <o>cube</o>.\nVisit the village merchant to buy cubes.',
    'tut.tame.t': 'Tame',                                                                         // 10:58
    'tut.tame.d': "The slime is trapped in the cube.\nThe <o>lower the slime's health</o>, the higher the tame chance.",
    'tut.bag.t': 'Bag',                                                                           // 7:27.5
    'tut.bag.d': 'Open your bag and try <o>using an item</o>.\nA <o>Potion</o> restores the <o>HP</o> of your accompanying slime.',
    'gd.inventory': 'There are 2 ways to use the potion.\nOpen the bag to use the potion,',       // [LOC] Unmasking.Inventory
    'gd.quick': 'You can easily use the equipped potion too.\nUse the potion with your preferred metohd',   // [LOC] Unmasking.QuickSlot (lỗi chính tả gốc)
    'gd.quickAll': "Use the equipped cube if there's a slime that you want to tame! You can do this, right?",   // [LOC] Unmasking.QuickSlotButtons
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
    'item.215': 'Mảnh slime nhỏ',
    'ui.slimeExp': 'EXP Slime',
    'ru.duel1': 'Có chút máu chiến đấy nhỉ? Vậy thì lên đi!',
    'ru.duel2': 'Nhà thám hiểm thật thụ không gục ngã vì chút thử thách thế này đâu!',
    'ru.won': 'Nhà thám hiểm thật thụ không gục ngã vì chút thử thách thế này đâu!',
    'mt.b1': 'Hic! A, mình say mất rồi!',
    'ui.notice': 'Thông Báo',
    'ui.notBuilt': 'Chưa có trong bản web: trận đấu với Rudga và Shadow Forest chưa có dữ liệu bản đồ.',
    'ui.ok': 'Có',
    // ---- F3 (bản dịch của bản web; [LOC] chép vi.json của game)
    'item.1': 'Bình Thuốc 30 HP', 'item.1.d': 'Bình thuốc hồi 30 HP cho slime đang đồng hành.',
    'tame.tag.tame': 'Bắt Được', 'tame.tag.untamed': 'Chưa Bắt',                                   // DegreeStep02 [LOC]; "Chưa Bắt" [ĐỀ XUẤT]
    'tame.noNearby': 'Không có slime hoang gần đây để thuần!',                                    // [LOC]
    'tame.autoArchived': 'Slime đã thuần được gửi vào kho!',                                      // [LOC]
    'tame.full': 'Túi slime đã đầy. Bạn không thể thuần slime lúc này.',                          // [LOC]
    'tame.caught': 'Đã thuần phục {name}!',
    'tame.free': '{name} đã thoát ra!',
    'tame.miss': 'Cube ném trượt.',
    'tame.registered': 'Dữ liệu slime mới đã được ghi vào Bách Khoa Slime.',                      // [LOC]
    'tame.askNick': 'Bạn có muốn đặt biệt danh cho {name} không?',
    'tame.nextTime': 'Để sau', 'tame.nickname': 'Biệt Danh',
    'tame.nickTitle': 'Cài Đặt Biệt Danh', 'tame.nickHint': 'Tối đa {Length} ký tự',             // [LOC]
    'item.cooldown': 'Vật phẩm đang hồi.',
    'item.used': 'Đã dùng {item}: {name} HP + {n}',
    'item.noTarget': 'Không có slime đồng hành để dùng.',
    'item.addQuick': 'Đã thêm vào ô nhanh!', 'item.removeQuick': 'Đã xóa khỏi ô nhanh!',          // [LOC]
    'item.alreadyQuick': 'Đã có trong ô nhanh.',                                                  // [LOC]
    'bag.use': 'Sử Dụng', 'bag.addQuick': 'Thêm Vào Ô Nhanh', 'bag.removeQuick': 'Xóa Khỏi Ô Nhanh', 'bag.organize': 'Sắp Xếp',   // [LOC]
    'bag.title': 'Túi Đồ', 'bag.all': 'Tất Cả', 'bag.empty': 'Bạn đã chọn một ô trống.',         // [LOC]
    'bag.cannotUse': 'Không dùng được vật phẩm này trong túi.',
    'party.unavailable': 'Không Thể Đồng Hành',                                                    // [LOC]
    'party.cooldown': 'Không thể đổi khi đang hồi.',                                              // [LOC]
    'party.hpZero': 'Slime hết HP.',                                                              // [LOC]
    'party.switchPerk': 'Mở khóa kỹ năng để sử dụng.',                                            // [LOC]
    'party.fainted': 'Bất Tỉnh', 'party.accompanying': 'Đang Đồng Hành',                           // [LOC]
    'st.title': 'Kho Slime', 'st.take': 'Lấy Ra', 'st.archive': 'Cất Giữ', 'st.bag': 'Túi Đồ',    // [LOC]
    'st.emptySlot': 'Bạn đã chọn một ô trống.',                                                   // [LOC]
    'st.takeFail': 'Không thể lấy slime ra!', 'st.archiveFail': 'Lưu trữ slime thất bại!',        // [LOC]
    'st.lastSlime': 'Bạn phải có ít nhất một slime!',                                             // [LOC]
    'st.equipped': 'Không thể dùng slime đồng hành.',                                             // [LOC]
    'st.skill': 'Kỹ Năng', 'st.level': 'Cấp',
    'c.storage': 'Kho Slime',                                                                     // [LOC]
    'al.st1': 'Cậu sẽ xem được danh sách những slime mà {name} đang thuần phục.',
    'dex.title': 'Bách Khoa Slime', 'dex.point': 'Điểm Sưu Tầm', 'dex.noData': 'Không Có Dữ Liệu', // [LOC]
    'dex.discover': 'Phát Hiện', 'dex.tame': 'Bắt Được', 'dex.bond': 'Gắn Kết',                   // [LOC]
    'dex.found': 'Slime Đã Phát Hiện {FoundCount}', 'dex.caught': 'Slime Đã Bắt {CaughtCount}',   // [LOC]
    'dex.bonding': 'Người Gắn Kết',
    // ---- F4
    'grp.sidejob': 'Việc Làm Thêm Đáng Ngờ', 'grp.patrol': 'Tuần Tra Rừng Bóng Tối',
    'map.shadow_forest_entrance': 'Lối Vào Rừng Bóng Tối',
    'q8.title': 'Giúp Martin', 'q8.o': 'Hạ Junior Floralime',
    'q9.title': 'Hồi Phục Xong!', 'q9.o': 'Dùng Thuốc 30 HP',
    'q10.title': 'Nhà Nghiên Cứu Đáng Ngờ', 'q10.o': 'Mua Cube',
    'q11.title': 'Tuần Tra', 'q11.o1': 'Tuần tra Lối Vào Rừng Bóng Tối', 'q11.o2': 'Hạ Junior Floralime',
    'q12.title': 'Việc Làm Thêm Đáng Ngờ',
    'q12.o': 'Chưa có trong bản web',
    'q12.desc': 'Clip dừng ở đây (11:06): mục tiêu của nhiệm vụ này chưa có trong bản web.',
    'mt1': 'Này! *hic*',
    'mt2': 'Phải, cậu đó, cái người vừa quay lại nhìn!\nLại đây một chút!',
    'mt3': '*hic* Mang rượu cho ta, rượu!',
    'mt4': 'Ta cứ tưởng say quá nên nhìn nhầm, *hic*\nHoá ra là người thật à?',
    'mt5': 'Cậu đi lang thang ngoài làng thế kia,\nhẳn là biết cách xử lý slime rồi! *hic*',
    'mt6': 'Ghen tị quá, *hic* ghen tị quá đi mất...',
    'mt7': 'Ta có ổn không à? *hic*\nTrông Martin này có giống ổn không?',
    'mt8': 'Cứ thấy lũ <o>Junior Floralime</o> đó là\nta lại sôi máu... *hic*',
    'mt9': 'Đi dẹp bớt lũ <o>Junior Floralime</o>\nđang lảng vảng quanh đây đi, *hic*',
    'mt10': 'Lũ slime đáng nguyền rủa, *hic*\ngiết bao nhiêu cũng không đủ, *hic*',
    'mt11': 'nhưng ít nhất <o>10</o> con, *hic*\nthì cũng hả được cục tức này, *hic*',
    'mt12': 'Ồ, cậu giỏi thật đấy! *hic*',
    'mt13': 'Cậu biết không, ta cũng từng mơ\nthành một nhà thám hiểm lừng danh, *hic*',
    'mt14': 'Slime...! *hic*\nLũ slime chết tiệt đó cản đường!!',
    'mt15': 'Giá mà ta biết dùng Cube,\nthì lũ slime đó đã...! ......',
    'mt16': '...... ......',
    'mt17': 'Mọi người, quay lại!! Đừng đi lối đó!!',
    'mt18': 'Đằng kia có slime...\n...Hả? Ta vừa ngủ gật à? *hic*',
    'mt19': 'Giết slime xong mà vẫn ngủ gật, *hic*\nchắc là uống chưa đủ rồi, *hic*',
    'mt20': 'Làm tốt lắm. Cậu đi được rồi, *hic*\nCảm ơn đã nghe ta xả giận, *hic*',
    'c.matter': 'Có chuyện gì vậy?', 'c.done': 'Xong rồi', 'c.martin': '...Martin?', 'c.youdid': 'Ông ngủ thật đấy...',
    'lr1': 'Cậu về an toàn rồi...!\nCó bị thương ở đâu không?',
    'lr2': 'Cậu về muộn hơn mình nghĩ, mình cứ lo\ncó chuyện gì xảy ra với cậu trong rừng.',
    'lr3': 'Mà này, cậu hạ được Junior\nFloralime chưa?',
    'lr4': 'Giỏi thật...\nVậy cho mình xem sản phẩm phụ cậu lấy được nhé?',
    'lr5': 'Oa, Mảnh slime nhỏ này.\nLâu lắm rồi mình mới thấy một mảnh...',
    'lr6': 'Trong làng chỉ có vài người\nbiết cách xử lý slime thôi.',
    'lr6b': 'Cậu có mang theo bình thuốc nào không?',
    'lr7': 'Cậu không biết à. <o>Bình thuốc</o> là vật phẩm\n<o>hồi HP hoặc mana</o> cho slime đi cùng cậu.',
    'lr8': 'Cậu đã ra ngoài làng,\nchắc slime của cậu cũng bị thương rồi.',
    'lr9': 'Đây, cầm lấy trước đã.\nLà ⟦potion⟧<o>Thuốc 30 HP</o> đấy.',
    'lr10': '...Ừ, quà xin lỗi cho cậu đó.',
    'lr11': 'Cho thẳng slime đi cùng cậu uống nhé.',
    'lr12': 'Cậu có thể lấy thẳng từ <o>túi đồ</o>,\nhoặc <o>đặt sẵn ra cho tiện dùng</o>.',
    'lr13': 'ở ngoài kia slime đầy rẫy,\nbình thuốc giúp ích nhiều lắm.',
    'lr14': 'À, thuốc có bán ở tiệm của Vivian đấy.',
    'lr15': '...Mình nói vậy vì\ntrông cậu như chẳng biết gì cả.',
    'lr16': 'Mình khuyên cậu nên đi gặp <o>Billy</o>.',
    'lr17': 'Anh ấy có vẻ để ý đến cậu đấy...\nSao không qua chào một tiếng?',
    'lr18': 'Ra vậy... làm theo điều\ntrái tim mách bảo là quan trọng mà.',
    'lr19': 'Nếu cậu thuần được con slime nào thật đẹp,\nthỉnh thoảng mang cho mình xem nhé.',
    'lr20': '...Đang băn khoăn không biết làm gì à?\nVậy đi gặp <o>Billy</o> thử xem?',
    'c.back': 'Mình về rồi', 'c.actually': 'Thật ra thì...', 'c.ofcourse': 'Tất nhiên', 'c.herethey': 'Đây này',
    'c.potion': 'Bình thuốc?', 'c.giving': 'Cậu cho mình à?', 'c.fed': 'Mình cho nó uống thuốc rồi',
    'c.whatnow2': 'Giờ mình nên làm gì?', 'c.think': 'Để mình nghĩ đã',
    'rs0': 'Này, cậu kia! Đứng lại.\nLại đây nói chuyện với ta.',
    'rs1': 'Cậu có một con slime hiếm đấy.\nLà của cậu à?',
    'rs2': 'Thật sao?\nCậu tìm thấy nó ở đâu vậy?',
    'rs3': 'Ta không nhớ nổi lần cuối\nta thấy một con slime như thế này!',
    'rs4': 'Đừng nói là cậu không biết\ngiá trị của chính con slime của mình nhé?',
    'rs5': 'Đó là một loại slime đặc biệt có thể\ngắn kết với cậu qua sợi dây liên kết.',
    'rs6': 'Phần lớn slime thù địch với con người,\nnhưng <o>Slime Thân Thiện</o> thì khác.',
    'rs7': '..Cậu có biết người có thể gắn kết với\n<o>Slime Thân Thiện</o> được gọi là <o>Trainer</o> không?',
    'rs8': 'Chậc, ta không chắc có tin được người\nđến điều cơ bản này cũng không biết.',
    'rs9': 'Việc ta muốn giao cho cậu\nchỉ người dùng được ⟦cube⟧<o>Cube</o> mới làm nổi.',
    'rs10': 'Đây là việc hệ trọng, cần phải dùng\n⟦cube⟧<o>Cube</o>...!',
    'rs11': '...!\nĐừng nói là cậu còn không biết ⟦cube⟧<o>Cube</o> là gì nhé?',
    'rs12': '⟦cube⟧<o>Cube</o> là thứ cần có\nđể <o>thuần phục slime</o>.',
    'rs13': 'Chỉ một số ít người\ndùng được nó,',
    'rs14': 'và chỉ những ai sinh ra với\ntài năng thiên bẩm xử lý slime.',
    'rs15': '...Không được rồi.\nCó vẻ cậu còn chẳng mang ⟦cube⟧<o>Cube</o> nào.',
    'rs16': 'Vậy phải bắt đầu từ đó thôi.',
    'rs17': 'Đến <o>Tiệm</o> ngay đi và\nmang cho ta <o>3</o> ⟦cube⟧<o>Cube</o>.',
    'rs18': 'Ta dạy cậu từ những điều\ncơ bản nhất đấy,',
    'rs19': 'nên cậu hãy biết ơn vì\nta không thu học phí!',
    'rs20': '<o>Tiệm</o> ở gần <o>lối ra phía tây của làng</o>!',
    'rs21': 'Không cãi.\nĐi mau lên!',
    'rsA': 'Việc đó thế nào rồi?',
    'rt1': 'Hừm, ta đã lo, nhưng cậu làm tốt lắm.',
    'rt2': 'Tốt, giờ vào việc chính thôi!',
    'rt3': 'Ta muốn mời cậu một việc làm thêm.',
    'rt4': 'Muốn <o>thuần phục</o> một con, hãy dùng ⟦cube⟧<o>Cube</o> khi slime\nlại gần.',
    'rt5': 'Vì vậy, cậu nên lấy sẵn ⟦cube⟧<o>Cube</o> ra\nđể lúc nào cũng dùng được, đúng không?',
    'rt6': 'Trước khi ném ⟦cube⟧<o>Cube</o>,\nđừng quên làm slime yếu máu đi đã.',
    'rt7': 'Đến lúc thích hợp ta sẽ giải thích\nđầy đủ về <o>Bách Khoa Slime</o>.',
    'rt8': 'Nếu muốn biết thì mau đi\n<o>thuần phục một con Junior Floralime</o>!',
    'c.yesright': 'Vâng, đúng vậy.', 'c.rare': 'Slime của mình hiếm à?', 'c.isee': 'Ra vậy', 'c.whatcube': 'Cube là gì?',
    'c.ownmoney': 'Bằng tiền của mình à?', 'c.whatbuy': 'Ông muốn mình mua gì nhỉ?',
    'c.brought': 'Mình mang Cube đến rồi', 'c.understood': 'Đã hiểu.', 'c.slimepedia': 'Bách Khoa Slime?',
    'bi0': 'Haha, cùng mình canh giữ Larus không?',
    'bi1': 'Ồ ồ, người lạ từ ngoài làng!\nRất vui được gặp! Mình là người bảo vệ của làng,\nBilly.',
    'bi2': 'Chào mừng đến Làng Larus,\nđầy tò mò và lãng mạn!',
    'bi3': 'Hahaha, gặp nhau thế này chắc là\nduyên phận!\nKhông hiểu sao mình thấy tụi mình sẽ hợp nhau lắm.',
    'bi4': 'Đúng lúc mình đang tìm người\n<o>tuần tra</o> Rừng Bóng Tối!',
    'bi5': 'Đúng vậy!\nLà kiểm tra mọi thứ có thể đe doạ\nngôi làng!',
    'bi6': 'Không chỉ trong làng,\nmà cả vùng ven và xung quanh nữa!',
    'bi7': 'Thế nào, cậu có muốn thử không?',
    'bi8': 'Hahaha, mình thích sự tự tin đó!',
    'bi9': 'Vậy bắt đầu bằng việc tuần tra\n<o>Lối Vào Rừng Bóng Tối</o>!',
    'bi10': 'Làm cho kỹ nhé!\nNhớ trinh sát đến tận cùng\ntheo hướng Đường Rừng!',
    'bi11': 'À, nếu ngoài đó có mối đe doạ nào,\ncậu cũng phải dẹp luôn đấy!',
    'bi12': 'Mình nghe Martin nói <o>Lối Vào Rừng Bóng Tối</o>\ncó\n<o>Junior Floralime</o> đang hoành hành.',
    'bi13': 'Nếu gặp chúng lúc tuần tra,\nhạ giúp mình <o>10</o> con nhé!',
    'c.nicemeet': 'Rất vui được gặp', 'c.leave': 'Cứ để mình',
    'ui.notBuiltTurnIn': 'Chưa có trong bản web: clip không cho thấy lúc trả nhiệm vụ này.',
    'tut.friendly.t': 'Slime Thân Thiện',
    'tut.friendly.d': 'Khác với slime thường, Slime Thân Thiện <o>toả ra một luồng khí đặc biệt</o> quanh mình.\nĐi cùng Slime Thân Thiện để tăng <o>độ thân thiết</o>.',
    'tut.shop.t': 'Tiệm',
    'tut.shop.d': 'Muốn <o>thuần phục slime</o> thì cần <o>cube</o>.\nHãy đến thương nhân trong làng để mua cube.',
    'tut.tame.t': 'Thuần Phục',
    'tut.tame.d': 'Slime bị nhốt trong cube.\n<o>Máu slime càng thấp</o>, tỉ lệ thuần phục càng cao.',
    'tut.bag.t': 'Túi Đồ',
    'tut.bag.d': 'Mở túi đồ và thử <o>dùng một vật phẩm</o>.\n<o>Bình thuốc</o> hồi <o>HP</o> cho slime đang đồng hành.',
    'gd.inventory': 'Có 2 cách để dùng bình thuốc.\n Cậu có thể mở túi đồ ra rồi dùng thuốc,',                     // [LOC]
    'gd.quick': 'Cậu cũng có thể nhấn ngay bình thuốc đã đặt sẵn để dùng cho nhanh.\n Cách nào tiện hơn thì cậu cứ dùng cách đó nhé.',   // [LOC]
    'gd.quickAll': 'Khi có slime cậu muốn bắt ở gần, hãy dùng Cube đã đăng ký! Chuyện này thì cậu làm được chứ?',   // [LOC]
  },
};

// L('al4', { name }) -> chuỗi theo ngôn ngữ trang; thiếu bản vi thì dùng nguyên văn
export function L(key, args) {
  let s = TEXT[LANG][key] ?? TEXT.en[key] ?? key;
  if (args) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in args ? args[k] : m));
  return s;
}
