#!/usr/bin/env node
/*
 * Ghi lời giới thiệu thẻ hub (tagline ngắn, desc, genre, accent) vào data/games.js theo id.
 * Dùng: node tools/hub-copy.js   (chạy lại bao nhiêu lần cũng ra cùng một tệp)
 * tagline hiện trên thẻ, desc hiện trong bảng chi tiết, en là bản tiếng Anh (title/tagline/desc); genre phải là một khoá trong GENRES của js/hub.js.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const COPY = {
  'dragonproj': ['hanh-dong', '#f59e0b', 'Săn quái một ngón: kéo để chạy, chạm để bắn, vẩy để né.',
    'Mang ba thợ săn vào ải và đổi qua lại ngay giữa trận. Sáu lớp vũ khí, từ súng săn cận chiến tới cung nạp lực, mỗi lớp mạnh đúng một kiểu. 38 ải, cuối mỗi ải là một con Behemoth. Gacha ra 43 nhân vật.'],
  'survivor': ['hanh-dong', '#a78bfa', 'Chỉ việc chạy né, vũ khí tự bắn. Sống sót qua từng đợt quái.',
    'Kiểu Vampire Survivors. Bạn chỉ lo hướng chạy, mọi vũ khí tự khai hoả. Quái kéo tới từng đợt, đợt sau đông và khó hơn đợt trước.'],
  'kingfall': ['chien-thuat', '#fb923c', 'Thủ thành: dựng thành, đặt quân, giữ cổng cuối trước quái và trùm.',
    'Thủ thành kiểu tower defense. Xây toà thành, đặt quân phòng thủ và giữ cánh cổng cuối cùng qua từng đợt quái, xen giữa là trùm.'],
  'mmorpg': ['nhap-vai', '#818cf8', 'Thế giới mở với lối đánh tự bắn của Survivor. Cày bãi quái, về lúc nào tuỳ bạn.',
    'Cùng lối đánh tự bắn của Survivor, nhưng trong một thế giới được lưu lại. Đi dọc hành lang đấu trường, dọn các bãi quái tự hồi sinh theo giờ riêng, cày đủ thì rời đi.'],
  'rung-toi': ['kinh-di', '#84cc16', 'Kinh dị nhìn từ trên xuống. Chỉ thấy thứ trước mặt, và đèn pin làm lộ bạn.',
    'Sinh tồn trong rừng đêm. Tường và cây chặn tầm nhìn nên bạn chỉ thấy thứ ở trước mặt. Đêm xuống, cái đèn pin vừa cứu bạn vừa bán đứng bạn.'],
  'repo2d-unity': ['kinh-di', '#2dd4bf', 'Kinh dị co-op năm người. Trực ca vô tận tới khi cả tổ gục.',
    'Bản Unity của Ca Trực Đêm. Tổ năm người, 14 nhân vật, gacha, trang bị và 9 màn. Chế độ Co-op Ca vô tận cho năm người thật, mỗi người mang nhân vật của mình vào, chơi tới khi cả tổ gục.'],
  'stardew': ['thu-gian', '#4ade80', 'Ông ngoại để lại một hòn đảo. Còn 24 hòn nữa đang chờ bạn mua.',
    'Làm nông, khám phá và bắt quái. Biển quanh đảo của bạn còn hai mươi bốn hòn nữa để mua dần từng hòn. Trong đám cỏ cao trên vài hòn có thứ đang trốn.'],
  'hic': ['chien-thuat', '#ef4444', 'Ba ngày nhặt đồ, rồi hắn tới. Trận đánh tự diễn theo đồ bạn chọn.',
    'Roguelite auto-battler. Bạn có ba ngày để nhặt đồ. Khi hắn tới thì không bấm được gì nữa, thắng hay thua đã nằm trong đống đồ bạn chọn lúc trời còn sáng.'],
  'voiddiver': ['hanh-dong', '#c084fc', 'Lặn xuống hầm ngục giữa thành phố, nhặt cổ vật trước khi đèn pin cạn.',
    'Tiệm đồ cổ Balusha cử bạn xuống hầm ngục nhặt cổ vật. Chém, bắn, lướt dưới ánh đèn pin sắp cạn, càng căng thẳng thì bóng tối càng sinh quái. Mang đồ về bốt điện thoại để bán, chế đồ và học kỹ năng. Bốn Diver để chọn.'],
  'orbit': ['khac', '#94a3b8', 'Bản dựng thử: so hai cách chở hàng trên cùng một dây chuyền.',
    'Chưa phải game hoàn chỉnh. Bản A nối máy với máy bằng hai cú chạm, bản B dùng kho chung kiểu Deep Town. Chơi cả hai trong 3 phút rồi xem bản nào vừa tay hơn.'],
  'slimeclash': ['chien-thuat', '#34d399', 'Ghép slime trên lưới 6×6, gộp lên cấp và bắn hạ con quái khổng lồ.',
    'Mỗi lượt ba bước kéo quân. Xếp ba con cùng loại cùng cấp thành hàng để gộp lên cấp. Hết bước, cả sân bắn vào quái, rồi quái nện xuống cột nó đã báo trước. Mười ngày một chương, trùm ở ngày 5 và ngày 10.'],
  'chuyen-tau': ['hanh-dong', '#fbbf24', 'Giữ đoàn tàu hơi nước sống sót qua sa mạc Viễn Tây đầy xác sống.',
    'Tàu chạy thì bạn đứng trên nóc toa mà thủ. Tàu dừng ga thì xuống lục nhà với đồng hồ đếm ngược trên đầu, và tàu chạy tiếp dù có bạn hay không. Mười nhân vật, mỗi người một chiêu riêng. Chín chuyến, bốn kiểu đêm.'],
  'deepcore': ['hanh-dong', '#f472b6', 'Đào sâu xuống hang, để mười linh thú tự đánh thay bạn.',
    'Một cần gạt, màn hình dọc. Bạn không tự đánh, mỗi món mang theo là một linh thú tự chọn mục tiêu. Việc của bạn là đi, đào và đứng đúng chỗ. Mỗi ván một tầng khoảng mười phút, hạ chủ hang rồi chạy về khoang thoát.'],
  'ghe-nong': ['chien-thuat', '#f43f5e', 'Làm huấn luyện viên esport: tập luyện, cấm chọn tướng, xem đội đánh 5v5.',
    'Nuôi tuyển thủ kiểu Uma Musume qua một mùa 24 lượt, có thể lực, tâm trạng và độ thân thiết. Vào giải thì cấm chọn trong 20 tướng, rồi xem trận 5v5 tự đánh trên bản đồ của Teamfight Manager 2. 24 đội máy tranh hạng song song tới chung kết thế giới.'],
  'xuoi-dong': ['thu-gian', '#fb7185', 'Lái nhà thuyền xuôi dòng ra biển, câu cá và ngắm ngày đêm. Không có thua.',
    'Xuôi từ hẻm đá qua rừng thông, đầm lầy, hang đá rồi ra biển. Có mưa có giông, đêm xuống thì cabin sáng đèn và đom đóm bay dọc bờ. Kéo lưới bắt cá, vớt thùng trôi, chín loài cá ghi vào sổ.'],
  'ho-xanh': ['thu-gian', '#38bdf8', 'Lặn bắt cá bằng súng xiên như Dave the Diver, tối về mở quán sushi.',
    'Ngắm bằng chuột, bắn trúng thì dây kéo cá về, cá to thì bấm liên tục để kéo co. Dưỡng khí vừa là máu. Lặn từ vùng nông xuống vực sâu 250 m với 65 loài cá, rồi về quán Bancho làm sushi và lấy tiền nâng cấp.'],
  'biet-doi-lan': ['hanh-dong', '#22d3ee', 'Dave the Diver gặp R.E.P.O.: kéo đồ cổ từ đáy biển lên cho đủ chỉ tiêu.',
    'Mỗi ca là năm chuyến lặn, chuyến sau sâu hơn và chỉ tiêu cao hơn. Bắn móc vào đồ cổ rồi vừa bơi vừa kéo lên cano, va đập là mất giá, kéo nặng quá thì đứt dây. Cá mập ngủ, nghe tiếng động rồi rượt theo bạn.'],
  'pokeone': ['nhap-vai', '#facc15', 'Bắt Pokémon từ Pallet Town, đi theo ô và đấu theo lượt như PRO.',
    'Tạo nhân vật, nhận Pokémon đầu tiên từ Giáo sư Oak rồi đi qua Route 1 tới Viridian City. Trận đấu chạy luật Gen 7 trên Pokémon Showdown. Lập đội tối đa 3 người để đánh chủ gym, đấu giá Pokémon ở chợ trời.'],
  'soulknight': ['hanh-dong', '#60a5fa', 'Soul Knight trên web: bắn tự ngắm, dọn phòng, hạ trùm cuối mỗi tầng.',
    'Qua Rừng, Lâu Đài, Núi Lửa từ 1-1 tới 3-5. 42 nhân vật có kỹ năng riêng, 361 vũ khí, 12 trùm, lái buôn, tượng và buff. Thêm chế độ mùa giải Thoát khỏi Monkia. Số liệu lấy thẳng từ Soul Knight 8.6.'],
  'diablo2': ['nhap-vai', '#dc2626', 'Diablo II làm lại trên web: đủ 5 act, bảy lớp nhân vật, ba độ khó.',
    'Dùng hình, tiếng, bản đồ và số liệu gốc. 131 khu sinh ngẫu nhiên mỗi lần vào, từ Rogue Encampment tới Worldstone Chamber, có lính đánh thuê, waypoint và trùm cả 5 act. Chuột trái đi và đánh, chuột phải dùng kỹ năng. Điện thoại xoay ngang có cần điều khiển.'],
  'gia-pha': ['khac', '#d4a373', 'Dựng cây gia phả dòng họ, kéo thả nhánh, đính kèm ảnh và lời kể.',
    'Bấm quanh thẻ để thêm con, vợ chồng, cha mẹ, kéo thả để chuyển cả nhánh. Mỗi người có ghi chú soạn như Word và kho tài liệu nhận ảnh, tiếng, phim, PDF, kèm ghi âm. Tìm không cần gõ dấu, xuất ra tệp để chép sang máy khác.'],
  'tron-tim': ['hanh-dong', '#a3e635', 'Trốn tìm 10 người với bot: núp bụi, né bo, chạy ra cổng cùng đồng đội.',
    '7 người trốn, 3 người tìm trên bản đồ ghép ngẫu nhiên. Người tìm đóng giả người trốn trong 5 giây đầu. Bo co qua 4 vòng, cuối cùng cổng mở. Tám nhân vật Soul Knight, mỗi người một kỹ năng như tàng hình, mồi nhử, dịch chuyển.'],
  'dredge': ['kinh-di', '#93c5fd', 'Câu cá trên quần đảo sương mù. Đừng ở ngoài khơi khi trời tối.',
    'Làm lại DREDGE trên web. Mượn chiếc thuyền cũ kèm món nợ $50, câu cá quanh The Marrows và bán cho người buôn. Mỗi loài cá có minigame riêng, xếp cá vào khoang theo đúng hình dáng. Trời tối thì sương dày lên và nỗi hoảng loạn tăng dần.'],
  'vuc-san': ['hanh-dong', '#06b6d4', '4 thợ lặn đấu 2 cá mập trong vực tối. Chọn phe, soi đèn, sống sót.',
    'Thợ lặn chỉ thấy chỗ đèn pin soi và phải mang đồ cổ về khoang cứu hộ trước khi hết 4 phút. Cá mập thấy người bật đèn từ xa nhưng không chui được khe hẹp. 12 loài cá mập, 10 thợ lặn, mỗi người một kỹ năng. Bot lấp ghế trống, chơi được bằng cảm ứng.']
};

const EN = {
  'dragonproj': ['Dragon Hunt', 'One-finger monster hunting: drag to run, tap to shoot, flick to dodge.',
    'Take three hunters into each stage and swap between them mid-fight. Six weapon classes, from close-range shotguns to charged bows, each best at one thing. 38 stages, each ending with a Behemoth. The gacha pulls from 43 characters.'],
  'survivor': ['Survivor', 'Just run and dodge, your weapons fire themselves. Survive wave after wave.',
    'In the style of Vampire Survivors. You only steer, every weapon fires on its own. Enemies come in waves, each one bigger and harder than the last.'],
  'kingfall': ['Kingfall: The Last Citadel TD', 'Raise the citadel, place defenders, hold the last gate against mobs and bosses.',
    'Tower defense siege. Build the citadel, place your defenders and hold the final gate through wave after wave of mobs, with bosses in between.'],
  'mmorpg': ['Survivor MMO', "Survivor's auto-shooter combat in a persistent world. Farm camps, leave anytime.",
    'The same auto-shooter combat as Survivor, in a world that remembers. Walk up the arena corridor, clear mob camps that respawn on their own timers, and leave once you have farmed enough.'],
  'rung-toi': ['Dark Forest', 'Top-down horror. You only see what is in front of you, and your flashlight gives you away.',
    'Survive a forest at night. Walls and trees block your view, so you only see what is ahead. After dark, your flashlight both saves you and betrays you.'],
  'repo2d-unity': ['Night Shift: Squad', 'Five-player co-op horror. Work the endless shift until the whole crew falls.',
    'The Unity build of Night Shift. A five-person crew, 14 characters, gacha, gear and 9 levels. Endless Co-op Shift is for five real players, each bringing their own character, playing until the whole crew falls.'],
  'stardew': ['Fallen Star Isles', 'Grandpa left you an island. 24 more are waiting for you to buy them.',
    'Farm, explore and catch monsters. The sea around your island holds twenty-four more to buy one at a time. Something hides in the tall grass on a few of them.'],
  'hic': ['He Is Coming', 'Three days to scavenge, then he arrives. The fight plays out from the gear you picked.',
    'Roguelite auto-battler. You have three days to gather gear. Once he arrives you cannot press anything, the win or loss was decided by what you packed while it was still light.'],
  'voiddiver': ['Void Diver', 'Dive into the dungeon under the city and grab relics before your flashlight dies.',
    'The Balusha antique shop sends you into the dungeon to collect relics. Slash, shoot and dash under a dying flashlight, and the higher the tension, the more monsters the dark spawns. Bring loot back to the phone booth to sell, craft and learn skills. Four Divers to choose from.'],
  'orbit': ['Orbit — Milestone 1', 'A prototype comparing two ways to move goods on one production line.',
    'Not a full game yet. Version A links machine to machine with two taps, version B uses a shared store like Deep Town. Play both for 3 minutes and see which feels better.'],
  'slimeclash': ['SlimeClash', 'Merge slimes on a 6×6 grid, level them up and blast a giant monster.',
    'Three moves per turn. Line up three slimes of the same kind and level to merge them up. Then the whole board fires at the monster, and it slams the column it warned you about. Ten days per chapter, bosses on day 5 and day 10.'],
  'chuyen-tau': ['The Last Train', 'Keep a steam train alive across a Wild West desert full of zombies.',
    'While the train runs you defend from the roof. At a station you search houses with a countdown overhead, and the train leaves with or without you. Ten characters, each with a unique ability. Nine journeys, four kinds of night.'],
  'deepcore': ['Deep Core', 'Dig deep into the caves and let ten companion beasts fight for you.',
    'One joystick, portrait screen. You never attack, every item you carry is a beast that picks its own targets. Your job is to move, dig and stand in the right place. Each run is one floor of about ten minutes: beat the cave boss, then race to the escape pod.'],
  'ghe-nong': ['Hot Seat', 'Coach an esports team: train players, draft heroes, watch your team fight 5v5.',
    'Raise players Uma Musume style over a 24-turn season, with stamina, mood and bonds. At tournaments you ban and pick from 20 heroes, then watch the 5v5 play out on the Teamfight Manager 2 map. 24 AI teams climb the ladder alongside you up to the world finals.'],
  'xuoi-dong': ['Downstream', 'Pilot a houseboat down the river to the sea, fish and watch day turn to night. No losing.',
    'Drift from a rocky gorge through pine forest, swamp and caves out to the sea. Rain and storms come and go, at night the cabin windows glow and fireflies line the banks. Net fish, salvage floating crates, and log nine species in your book.'],
  'ho-xanh': ['Blue Hole', 'Harpoon fishing like Dave the Diver, then run a sushi bar at night.',
    'Aim with the mouse, hit a fish and the line reels it in, big ones need rapid clicks to win the tug of war. Oxygen is your health. Dive from the shallows to a 250 m abyss with 65 species, then head to Bancho to serve sushi and earn upgrades.'],
  'biet-doi-lan': ['Dive Squad', 'Dave the Diver meets R.E.P.O.: haul relics up from the seabed to hit your quota.',
    'Each shift is five dives, each deeper with a higher quota. Hook a relic and swim it up to the boat, bumps lower its value and too much weight snaps the line. Sharks sleep, hear noise, then come after you.'],
  'pokeone': ['PokéOne', 'Catch Pokémon from Pallet Town, walk the grid and battle turn by turn like PRO.',
    'Create your trainer, get your first Pokémon from Professor Oak and head through Route 1 to Viridian City. Battles run Gen 7 rules on Pokémon Showdown. Team up with up to 3 players for gym leaders, and auction Pokémon at the marketplace.'],
  'soulknight': ['Soul Knight', 'Soul Knight on the web: auto-aim shooting, room clearing, a boss on every floor.',
    'Fight from 1-1 to 3-5 through the Forest, Castle and Volcano. 42 characters with their own skills, 361 weapons, 12 bosses, merchants, statues and buffs. Includes the Escape from Monkia season mode. Stats come straight from Soul Knight 8.6.'],
  'diablo2': ['Diablo II', 'Diablo II remade for the web: all 5 acts, seven classes, three difficulties.',
    'Built from the original art, sound, maps and numbers. 131 areas generated fresh each visit, from the Rogue Encampment to the Worldstone Chamber, with mercenaries, waypoints and every act boss. Left click to move and attack, right click for skills. Phones in landscape get a joystick.'],
  'gia-pha': ['Family Tree', 'Build your family tree, drag whole branches, attach photos and recorded stories.',
    'Tap around a card to add children, spouses or parents, and drag to move a whole branch. Everyone gets Word-style notes and a file store for photos, audio, video and PDFs, plus voice recording. Search without accents and export to a file for another device.'],
  'tron-tim': ['Hide & Seek', '10-player hide and seek with bots: hide in bushes, beat the zone, reach the gate together.',
    '7 hiders and 3 seekers on a randomly stitched map. Seekers pose as hiders for the first 5 seconds. The zone shrinks over 4 rounds, then the gate opens. Eight Soul Knight characters, each with a skill like invisibility, decoys or teleport.'],
  'dredge': ['Fogbound', 'Fish the islands in the fog. Do not stay out after dark.',
    'DREDGE remade for the web. Borrow an old boat along with a $50 debt, fish around The Marrows and sell to the fishmonger. Every species has its own minigame, and fish fill the hold in their real shapes. After dark the fog thickens and panic sets in.'],
  'vuc-san': ['The Hunting Deep', '4 divers versus 2 sharks in a dark abyss. Pick a side, light the way, survive.',
    'Divers only see what their flashlight hits and must bring relics back to the rescue pod within 4 minutes. Sharks spot lit divers from afar but cannot squeeze through narrow gaps. 12 sharks and 10 divers, each with a skill. Bots fill empty seats, and touch controls work.']
};

const FILE = path.join(__dirname, '..', 'data', 'games.js');
let src = fs.readFileSync(FILE, 'utf8');
const done = [];
for (const [id, [genre, accent, tagline, desc]] of Object.entries(COPY)) {
  const at = src.indexOf('id: "' + id + '"');
  if (at < 0) throw new Error('game not found in data/games.js: ' + id);
  const end = src.indexOf('\n  }', at);
  let block = src.slice(at, end);
  block = block.replace(/\n {4}(desc|genre|accent|en): .*,(?=\n)/g, '');
  const next = block.replace(/\n {4}tagline: .*,(?=\n)/, () => '\n    tagline: ' + JSON.stringify(tagline) + ',' +
    '\n    desc: ' + JSON.stringify(desc) + ',\n    genre: ' + JSON.stringify(genre) + ',\n    accent: ' + JSON.stringify(accent) + ',' +
    '\n    en: { title: ' + JSON.stringify(EN[id][0]) + ', tagline: ' + JSON.stringify(EN[id][1]) + ', desc: ' + JSON.stringify(EN[id][2]) + ' },');
  if (next === block) throw new Error('tagline line not found for ' + id);
  src = src.slice(0, at) + next + src.slice(end);
  done.push(id);
}
fs.writeFileSync(FILE, src);
global.window = {};
require(FILE);
const shown = window.HUB_GAMES.filter((g) => g.status === 'available');
const missing = shown.filter((g) => !g.desc).map((g) => g.id);
if (missing.length) throw new Error('visible games without desc: ' + missing.join(', '));
const long = shown.filter((g) => g.tagline.length > 80 || g.en.tagline.length > 90).map((g) => g.id);
console.log('ghi ' + done.length + ' game; tagline dài nhất ' + Math.max(...shown.map((g) => g.tagline.length)) + ' ký tự' + (long.length ? '; >80: ' + long.join(', ') : ''));
