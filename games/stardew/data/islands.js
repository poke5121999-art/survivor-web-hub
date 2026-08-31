/*
 * islands.js - the archipelago: what land exists, what is on it, and what it
 * costs to own.
 *
 * THE SHAPE OF THE GAME LIVES HERE. The old build dropped a player into a
 * whole valley of fifty-two maps on the first morning, and the honest report
 * on that was "vô unlock full làng làm ngợp" - everything open, nothing
 * earned, no idea where to start. Pickaxe King Island answers that by selling
 * you the world one plot at a time, and this file is that answer: twenty-five
 * islands on a 5x5 sea, each bought with a rank and a pile of gold, each
 * adjacent to the one before it so the map grows outward from your own front
 * door instead of arriving all at once.
 *
 * The second thing that changed: there are NO interiors. A shop is not a door
 * you walk through into a 12x9 room, it is an island. Marnie's barn, Pierre's
 * counter, the community centre - each is its own piece of land with its own
 * villager standing on it, in the open air, visible from the sea. That removes
 * every load screen in the game and makes "where do I buy seeds" a thing you
 * can answer by looking at the map.
 *
 * ---------------------------------------------------------------- the grid
 * Islands sit in a 5x5 lattice of slots. Slot pitch is 30 tiles across and 24
 * down; an island is placed at the slot's top-left and may be any size up to
 * 26x20, which leaves at least a 4-tile channel of open sea between
 * neighbours. Bridges are not authored - world.js draws one down the middle of
 * every channel whose two islands are both owned, so the walkable map is
 * always exactly the land you have paid for.
 *
 * ------------------------------------------------------------------ unlock
 *   rank   the Island Rank (see progress in sim.js) the player must have hit
 *   gold   the price, and it is the real gate - rank arrives faster than money
 *   Adjacency is implied by the lattice: you may only buy land that touches
 *   land you already own. That is what makes the order legible without a
 *   dependency list, and it is why `home` sits at (1,2) rather than a corner.
 *
 * ----------------------------------------------------------------- content
 *   plots   rects of tillable dirt
 *   grass   rects of tall grass; walking into one can start an encounter
 *   objs    everything placed by hand - counters, beds, trees, signs
 *   scatter what the generator sprinkles (trees, rocks, weeds, forage)
 *   enc     the encounter table, [species, weight, minLv, maxLv, when]
 *           `when` is 'day' | 'night' | null (any time)
 *   fish    which fish list this island's water draws from
 *
 * Coordinates in `plots`, `grass` and `objs` are LOCAL to the island - (0,0)
 * is its top-left tile. world.js offsets them. Authoring them absolute was
 * tried first and every island had to be re-typed the moment one moved.
 */
(function (global) {
  'use strict';

  var COLX = [6, 36, 66, 96, 126];
  var ROWY = [5, 29, 53, 77, 101];

  /* Which panel paints an island's ground. These are the flat colour swatches
   * the source game nine-slices its land from; sampled, they are:
   *   0 lime green   1 olive   2 deep green   3 white
   *   4 brick red    5 purple  6 pale yellow-green   7 dusty rose
   * Picking per island is what makes the sea read as a set of distinct places
   * rather than one green rash. game.js lays a hashed texture and a shoreline
   * over the top, because a flat swatch on its own reads as a sticker. */
  var GROUND = ['BaseGround0_forSliced', 'BaseGround0_forSliced 1',
                'BaseGround0_forSliced 2', 'BaseGround0_forSliced 3',
                'BaseGround1_forSliced', 'BaseGround2_forSliced',
                'BaseGround3_forSliced', 'BaseGround4_forSliced'];

  var ISLANDS = [

    /* ============================================================ TIER 0 */
    {
      id: 'home', name: 'Đảo Nhà', col: 1, row: 2, w: 24, h: 18, ground: 0,
      unlock: null,                       // yours from the first morning
      blurb: 'Mảnh đất ông ngoại để lại. Nhỏ, nhưng là của bạn.',
      plots: [{ x: 3, y: 10, w: 8, h: 6 }],
      objs: [
        { x: 14, y: 5, kind: 'house', art: 'HouseFront', w: 4, h: 3 },
        { x: 16, y: 8, kind: 'bed' },
        { x: 19, y: 8, kind: 'chest' },
        { x: 13, y: 8, kind: 'kitchen' },
        { x: 11, y: 5, kind: 'mailbox' },
        { x: 4, y: 6, kind: 'bin' },
        { x: 7, y: 6, kind: 'calendarBoard' },
        { x: 20, y: 13, kind: 'petBed' }
      ],
      scatter: { tree: 5, rock: 3, weed: 6, forage: 1 },
      path: [[12, 4], [12, 16]],
      fish: 'coast'
    },

    /* ============================================================ TIER 1 */
    {
      id: 'farm', name: 'Đảo Nông Trại', col: 2, row: 2, w: 26, h: 20, ground: 6,
      unlock: { rank: 2, gold: 300 },
      blurb: 'Đất bằng phẳng, nắng cả ngày. Chỗ để trồng cho ra trồng.',
      tutorial: 'farm',
      plots: [{ x: 2, y: 3, w: 10, h: 7 }, { x: 14, y: 3, w: 10, h: 7 },
              { x: 2, y: 12, w: 10, h: 6 }, { x: 14, y: 12, w: 10, h: 6 }],
      objs: [
        { x: 12, y: 1, kind: 'bin' },
        { x: 13, y: 10, kind: 'sign', text: 'Nông Trại Lớn — trồng gì cũng được, miễn đúng mùa.' }
      ],
      scatter: { weed: 8, rock: 4 },
      farmable: true,
      fish: 'coast'
    },
    {
      id: 'market', name: 'Đảo Chợ', col: 1, row: 1, w: 22, h: 16, ground: 0,
      unlock: { rank: 3, gold: 600 },
      blurb: 'Sạp hạt giống, sạp tạp hoá, và một ông bác nói nhiều.',
      tutorial: 'shop',
      npc: 'bacnong',
      objs: [
        { x: 5, y: 6, kind: 'shop', shop: 'seeds', art: 'Shop', w: 4, h: 4,
          label: 'Sạp Hạt Giống' },
        { x: 13, y: 6, kind: 'shop', shop: 'general', art: 'Shop', w: 4, h: 4,
          label: 'Sạp Tạp Hoá' },
        { x: 10, y: 13, kind: 'orderBoard' },
        { x: 2, y: 3, kind: 'sign', text: 'Chợ Đảo — mở 6h đến 17h, chủ nhật nghỉ.' }
      ],
      scatter: { weed: 4 },
      path: [[2, 11], [20, 11]],
      fish: 'coast'
    },
    {
      id: 'forest', name: 'Đảo Rừng', col: 0, row: 2, w: 24, h: 18, ground: 2,
      unlock: { rank: 4, gold: 1200 },
      blurb: 'Gỗ, nhựa cây, nấm dại. Và một con gấu cầm rìu rất hiền.',
      npc: 'gaumoc',
      objs: [
        { x: 17, y: 6, kind: 'shop', shop: 'lumber', art: 'LumberShop', w: 3, h: 3,
          label: 'Trại Gỗ' },
        { x: 4, y: 4, kind: 'tapper' }
      ],
      scatter: { tree: 26, bigTree: 4, rock: 6, weed: 10, forage: 4, stump: 3 },
      fish: 'forest'
    },

    /* ============================================================ TIER 2 */
    {
      id: 'ranch', name: 'Đảo Chuồng Trại', col: 2, row: 1, w: 24, h: 18, ground: 0,
      unlock: { rank: 5, gold: 2000 },
      blurb: 'Gà, bò, cừu, heo. Cho ăn mỗi sáng, vuốt ve mỗi ngày.',
      tutorial: 'animals',
      npc: 'cosua',
      objs: [
        { x: 3, y: 4, kind: 'coop', farmBuilding: 'Coop', buildingId: 'coop1', w: 5, h: 4 },
        { x: 13, y: 4, kind: 'barn', farmBuilding: 'Barn', buildingId: 'barn1', w: 6, h: 4 },
        { x: 10, y: 12, kind: 'shop', shop: 'animals', art: 'Housing', w: 3, h: 3,
          label: 'Trại Giống' },
        { x: 3, y: 12, kind: 'silo', farmBuilding: 'Silo' },
        { x: 19, y: 12, kind: 'trough' }
      ],
      pasture: { x: 2, y: 9, w: 20, h: 7 },
      scatter: { weed: 6, tree: 3 },
      fish: 'coast'
    },
    {
      id: 'harbor', name: 'Đảo Bến Cá', col: 1, row: 3, w: 24, h: 16, ground: 6,
      unlock: { rank: 6, gold: 3000 },
      blurb: 'Cầu tàu dài, nước sâu, cá to. Mồi bán ngay tại chỗ.',
      tutorial: 'fishing',
      npc: 'thuythu',
      objs: [
        { x: 15, y: 4, kind: 'shop', shop: 'fish', art: 'Harbor_FishMarket', w: 4, h: 3,
          label: 'Chợ Cá' },
        { x: 4, y: 5, kind: 'baitTable' },
        { x: 9, y: 16, kind: 'dock', w: 4, h: 5 },
        { x: 20, y: 10, kind: 'crabPotRack' }
      ],
      pier: { x: 9, y: 16, w: 4, h: 5 },
      scatter: { weed: 3, driftwood: 4 },
      fish: 'ocean'
    },
    {
      id: 'smith', name: 'Đảo Thợ Rèn', col: 2, row: 3, w: 22, h: 16, ground: 7,
      unlock: { rank: 7, gold: 5000 },
      blurb: 'Lò lúc nào cũng đỏ. Đưa cuốc vào, hôm sau lấy ra tốt hơn.',
      npc: 'kysu',
      objs: [
        { x: 8, y: 5, kind: 'toolUpgrade', w: 4, h: 3 },
        { x: 15, y: 5, kind: 'shop', shop: 'smith', art: 'smithy_0', w: 3, h: 3,
          label: 'Lò Rèn' },
        { x: 3, y: 6, kind: 'geodeCrusher' },
        { x: 12, y: 12, kind: 'machine', machine: 'Furnace' }
      ],
      scatter: { rock: 10, weed: 3 },
      fish: 'coast'
    },

    /* ================================================ TIER 3 - Pokemon opens */
    {
      id: 'meadow', name: 'Đảo Cỏ Xanh', col: 3, row: 2, w: 26, h: 20, ground: 0,
      unlock: { rank: 8, gold: 7000 },
      blurb: 'Cỏ cao ngang hông. Có gì đó đang sột soạt trong đó.',
      tutorial: 'pokemon',
      /* The first catch island hands over a starter and five balls, because a
       * grass patch with nothing to throw is a wall, not a feature. */
      grant: { poke: { id: 25, lv: 5, name: 'Pikachu' },
               items: [{ name: 'Poké Ball', qty: 5 }] },
      grass: [{ x: 2, y: 3, w: 10, h: 6 }, { x: 14, y: 4, w: 10, h: 7 },
              { x: 5, y: 13, w: 16, h: 5 }],
      objs: [
        { x: 12, y: 1, kind: 'sign', text: 'CỎ CAO — đi vào là gặp Pokémon hoang. Nhớ mang bóng.' },
        { x: 23, y: 10, kind: 'healStone' }
      ],
      scatter: { tree: 6, weed: 6, forage: 3 },
      enc: [
        [16, 20, 3, 6, null],   // Pidgey
        [19, 20, 2, 5, null],   // Rattata
        [10, 14, 2, 4, 'day'],  // Caterpie
        [13, 14, 2, 4, 'day'],  // Weedle
        [43, 10, 3, 6, 'night'],// Oddish
        [69, 10, 3, 6, 'day'],  // Bellsprout
        [29,  8, 3, 6, null],   // Nidoran F
        [32,  8, 3, 6, null],   // Nidoran M
        [39,  6, 3, 6, null],   // Jigglypuff
        [52,  5, 4, 7, 'night'],// Meowth
        [56,  5, 4, 7, null],   // Mankey
        [25,  3, 4, 7, null],   // Pikachu
        [63,  2, 5, 8, null],   // Abra
        [133, 1, 5, 9, null]    // Eevee
      ],
      fish: 'coast'
    },
    {
      id: 'pokemart', name: 'Đảo Poké Mart', col: 3, row: 1, w: 20, h: 15, ground: 6,
      unlock: { rank: 8, gold: 7500 },
      blurb: 'Bóng, thuốc, và một cậu bé thuộc lòng bảng giá.',
      npc: 'cauboong',
      objs: [
        { x: 7, y: 5, kind: 'shop', shop: 'pokemart', art: 'Shop', w: 4, h: 4,
          label: 'Poké Mart' },
        { x: 14, y: 6, kind: 'healStone' },
        { x: 3, y: 10, kind: 'pcBox' },
        { x: 3, y: 4, kind: 'sign', text: 'Poké Mart — bóng, thuốc, và tủ gửi Pokémon.' }
      ],
      scatter: { weed: 3 },
      path: [[2, 12], [18, 12]],
      fish: 'coast'
    },

    /* ============================================================ TIER 4 */
    {
      id: 'mine', name: 'Đảo Mỏ', col: 0, row: 1, w: 22, h: 17, ground: 7,
      unlock: { rank: 10, gold: 9000 },
      blurb: 'Một cái miệng hang tối om ăn thẳng xuống lòng đảo.',
      tutorial: 'mine',
      npc: 'hiepsicao',
      objs: [
        { x: 9, y: 4, kind: 'mineEntrance', w: 4, h: 3 },
        { x: 16, y: 8, kind: 'shop', shop: 'adventure', art: 'MineCategory', w: 3, h: 3,
          label: 'Hội Thám Hiểm' },
        { x: 3, y: 9, kind: 'elevator' }
      ],
      scatter: { rock: 18, bigRock: 5, weed: 4 },
      fish: 'coast'
    },
    {
      id: 'workshop', name: 'Đảo Xưởng', col: 0, row: 3, w: 22, h: 16, ground: 1,
      unlock: { rank: 11, gold: 12000 },
      blurb: 'Thùng ủ, máy vắt, lò sấy. Nguyên liệu vào, tiền ra.',
      tutorial: 'machines',
      npc: 'thothucong',
      machineBank: { x: 3, y: 4, w: 16, h: 8 },
      objs: [
        { x: 10, y: 13, kind: 'workshop' },
        { x: 19, y: 4, kind: 'chest' }
      ],
      scatter: { weed: 4 },
      fish: 'coast'
    },
    {
      id: 'jungle', name: 'Đảo Rừng Rậm', col: 3, row: 3, w: 26, h: 20, ground: 2,
      unlock: { rank: 12, gold: 15000 },
      blurb: 'Nóng, ẩm, đầy tiếng côn trùng. Cỏ ở đây cao hơn người.',
      grass: [{ x: 2, y: 3, w: 11, h: 8 }, { x: 15, y: 3, w: 9, h: 8 },
              { x: 4, y: 14, w: 18, h: 4 }],
      objs: [{ x: 13, y: 1, kind: 'sign', text: 'RỪNG RẬM — nhiều Côn Trùng và Cỏ. Coi chừng Độc.' }],
      scatter: { tree: 16, bigTree: 6, forage: 6, weed: 8 },
      enc: [
        [1,  4, 8, 12, null],   // Bulbasaur
        [11, 14, 7, 11, 'day'], // Metapod
        [14, 14, 7, 11, 'day'], // Kakuna
        [12, 8, 10, 14, 'day'], // Butterfree
        [15, 8, 10, 14, 'day'], // Beedrill
        [48, 14, 8, 12, 'night'],// Venonat
        [46, 12, 8, 12, null],  // Paras
        [43, 10, 9, 13, null],  // Oddish
        [102, 8, 9, 13, null],  // Exeggcute
        [114, 5, 10, 14, null], // Tangela
        [123, 2, 12, 16, null], // Scyther
        [127, 2, 12, 16, null], // Pinsir
        [113, 1, 10, 14, null]  // Chansey
      ],
      fish: 'jungle'
    },
    {
      id: 'tavern', name: 'Đảo Quán', col: 2, row: 0, w: 22, h: 16, ground: 5,
      unlock: { rank: 13, gold: 18000 },
      blurb: 'Bếp đỏ lửa tới khuya. Ai rảnh cũng ghé.',
      tutorial: 'cooking',
      npc: 'daubep',
      objs: [
        { x: 8, y: 5, kind: 'shop', shop: 'tavern', art: 'MagicCookingTool', w: 4, h: 3,
          label: 'Quán Ăn' },
        { x: 14, y: 5, kind: 'kitchen' },
        { x: 4, y: 10, kind: 'table', w: 3, h: 2 },
        { x: 12, y: 11, kind: 'table', w: 3, h: 2 },
        { x: 18, y: 8, kind: 'blackboard' }
      ],
      gather: { x: 3, y: 9, w: 16, h: 5 },     // where villagers hang out at night
      scatter: { weed: 3 },
      fish: 'coast'
    },

    /* ============================================================ TIER 5 */
    {
      id: 'rocky', name: 'Đảo Hang Đá', col: 4, row: 2, w: 24, h: 18, ground: 7,
      unlock: { rank: 15, gold: 24000 },
      blurb: 'Đá tảng và bụi cỏ mọc trong khe. Thứ sống ở đây đều cứng đầu.',
      grass: [{ x: 3, y: 4, w: 8, h: 6 }, { x: 14, y: 6, w: 8, h: 8 }],
      objs: [{ x: 12, y: 2, kind: 'sign', text: 'HANG ĐÁ — Đá và Đất. Mang theo Pokémon hệ Nước hoặc Cỏ.' }],
      scatter: { rock: 22, bigRock: 8, weed: 5 },
      enc: [
        [74, 20, 12, 16, null],  // Geodude
        [27, 16, 12, 16, null],  // Sandshrew
        [50, 14, 12, 16, null],  // Diglett
        [66, 12, 13, 17, null],  // Machop
        [104, 10, 13, 17, 'night'], // Cubone
        [95, 8, 14, 18, null],   // Onix
        [111, 7, 14, 18, null],  // Rhyhorn
        [75, 5, 16, 20, null],   // Graveler
        [51, 4, 16, 20, null],   // Dugtrio
        [140, 2, 15, 19, null],  // Kabuto
        [138, 2, 15, 19, null],  // Omanyte
        [142, 1, 18, 22, 'night']// Aerodactyl
      ],
      fish: 'coast'
    },
    {
      id: 'greenhouse', name: 'Đảo Vườn Kính', col: 1, row: 0, w: 20, h: 15, ground: 6,
      unlock: { rank: 16, gold: 30000 },
      blurb: 'Trong kính không có mùa. Trồng gì, lúc nào, cũng sống.',
      npc: 'nangtao',
      season: 'Spring',
      plots: [{ x: 3, y: 4, w: 14, h: 8 }],
      farmable: true,
      objs: [{ x: 10, y: 2, kind: 'sign', text: 'VƯỜN KÍNH — cây không chết khi đổi mùa.' }],
      fish: null
    },
    {
      id: 'museum', name: 'Đảo Bảo Tàng', col: 0, row: 0, w: 20, h: 15, ground: 1,
      unlock: { rank: 17, gold: 36000 },
      blurb: 'Tủ kính trống. Cụ Hiền đợi bạn lấp đầy chúng.',
      npc: 'cuhien',
      objs: [
        { x: 8, y: 5, kind: 'museumDesk', w: 4, h: 3 },
        { x: 3, y: 5, kind: 'display' }, { x: 15, y: 5, kind: 'display' },
        { x: 3, y: 10, kind: 'display' }, { x: 15, y: 10, kind: 'display' },
        { x: 9, y: 11, kind: 'dexResearch' }
      ],
      fish: 'coast'
    },
    {
      id: 'festival', name: 'Đảo Lễ Hội', col: 3, row: 0, w: 24, h: 17, ground: 5,
      unlock: { rank: 18, gold: 45000 },
      blurb: 'Sân khấu, đèn lồng, và bảng gói hàng của cả đảo.',
      tutorial: 'bundles',
      npc: 'congchua',
      objs: [
        { x: 10, y: 4, kind: 'bundleBoard', w: 4, h: 3 },
        { x: 4, y: 9, kind: 'stage', w: 5, h: 3 },
        { x: 17, y: 9, kind: 'stage', w: 5, h: 3 },
        { x: 12, y: 13, kind: 'sign', text: 'LỄ HỘI — mỗi mùa một lần, cả đảo có mặt.' }
      ],
      gather: { x: 4, y: 12, w: 16, h: 4 },
      fish: 'coast'
    },

    /* ============================================================ TIER 6 */
    {
      id: 'beach', name: 'Đảo Bãi Biển', col: 4, row: 3, w: 26, h: 16, ground: 6,
      unlock: { rank: 20, gold: 60000 },
      blurb: 'Cát trắng, sóng nông. Thứ gì cũng dạt vào đây.',
      sand: true,
      grass: [{ x: 3, y: 3, w: 8, h: 4 }],
      surf: [{ x: 2, y: 12, w: 22, h: 3 }],     // shallow water you can wade into
      objs: [
        { x: 14, y: 4, kind: 'shop', shop: 'beach', art: 'BaitShopTable', w: 3, h: 3,
          label: 'Quầy Ven Biển' },
        { x: 20, y: 8, kind: 'crabPotRack' }
      ],
      scatter: { shell: 10, driftwood: 6, weed: 2 },
      enc: [
        [98, 18, 16, 20, null],  // Krabby
        [72, 16, 16, 20, null],  // Tentacool
        [120, 12, 16, 20, 'night'], // Staryu
        [54, 12, 16, 20, null],  // Psyduck
        [60, 12, 16, 20, null],  // Poliwag
        [90, 10, 17, 21, null],  // Shellder
        [116, 8, 17, 21, null],  // Horsea
        [118, 8, 17, 21, null],  // Goldeen
        [86, 6, 18, 22, null],   // Seel
        [7,  4, 16, 20, null],   // Squirtle
        [131, 2, 20, 24, null],  // Lapras
        [147, 1, 18, 22, null]   // Dratini
      ],
      fish: 'ocean'
    },
    {
      id: 'volcano', name: 'Đảo Núi Lửa', col: 4, row: 1, w: 24, h: 19, ground: 4,
      unlock: { rank: 22, gold: 90000 },
      blurb: 'Đất nóng dưới chân. Quặng ở đây tốt nhất quần đảo.',
      grass: [{ x: 3, y: 5, w: 8, h: 6 }, { x: 14, y: 8, w: 8, h: 7 }],
      lava: [{ x: 12, y: 2, w: 5, h: 4 }],
      objs: [{ x: 11, y: 17, kind: 'sign', text: 'NÚI LỬA — hệ Lửa. Đừng mang Pokémon hệ Cỏ.' }],
      scatter: { rock: 16, bigRock: 10 },
      enc: [
        [37, 18, 22, 26, null],  // Vulpix
        [58, 16, 22, 26, null],  // Growlithe
        [77, 14, 23, 27, null],  // Ponyta
        [109, 12, 22, 26, null], // Koffing
        [81, 12, 22, 26, null],  // Magnemite
        [4,  6, 22, 26, null],   // Charmander
        [126, 5, 25, 29, null],  // Magmar
        [78, 4, 27, 31, null],   // Rapidash
        [110, 4, 26, 30, null],  // Weezing
        [88, 4, 22, 26, 'night'],// Grimer
        [146, 1, 32, 36, 'day']  // Moltres
      ],
      fish: 'lava'
    },

    /* ============================================================ TIER 7 */
    {
      id: 'frost', name: 'Đảo Băng', col: 0, row: 4, w: 24, h: 17, ground: 3,
      unlock: { rank: 24, gold: 130000 },
      blurb: 'Tuyết không bao giờ tan. Cỏ ở đây đông cứng thành bụi trắng.',
      season: 'Winter',
      grass: [{ x: 3, y: 4, w: 9, h: 6 }, { x: 14, y: 6, w: 8, h: 7 }],
      objs: [{ x: 12, y: 2, kind: 'sign', text: 'ĐẢO BĂNG — hệ Băng. Ở đây luôn là mùa Đông.' }],
      scatter: { rock: 10, tree: 6 },
      enc: [
        [86, 20, 26, 30, null],  // Seel
        [90, 16, 26, 30, null],  // Shellder
        [124, 10, 28, 32, 'night'], // Jynx
        [87, 8, 30, 34, null],   // Dewgong
        [91, 8, 30, 34, null],   // Cloyster
        [27, 10, 26, 30, null],  // Sandshrew
        [220, 0, 0, 0, null],    // reserved: a Gen 2 ice type, if the dex ever grows
        [131, 3, 30, 34, null],  // Lapras
        [144, 1, 36, 40, 'night']// Articuno
      ],
      fish: 'ice'
    },
    {
      id: 'lab', name: 'Đảo Nghiên Cứu', col: 1, row: 4, w: 22, h: 16, ground: 3,
      unlock: { rank: 25, gold: 150000 },
      blurb: 'Nơi người ta đo được cả tiềm năng bẩm sinh của một con Pokémon.',
      tutorial: 'lab',
      npc: 'giaosu',
      objs: [
        { x: 8, y: 5, kind: 'ivJudge', w: 4, h: 3 },
        { x: 15, y: 5, kind: 'evTrainer', w: 3, h: 3 },
        { x: 3, y: 9, kind: 'natureMint' },
        { x: 11, y: 11, kind: 'daycare', w: 4, h: 3 },
        { x: 18, y: 10, kind: 'pcBox' }
      ],
      fish: 'coast'
    },
    {
      id: 'ruins', name: 'Đảo Cổ', col: 2, row: 4, w: 24, h: 18, ground: 5,
      unlock: { rank: 26, gold: 200000 },
      blurb: 'Cột đá đổ, chữ khắc không ai đọc được, và tiếng thở dài lúc nửa đêm.',
      grass: [{ x: 3, y: 5, w: 9, h: 7 }, { x: 15, y: 4, w: 7, h: 8 }],
      objs: [
        { x: 12, y: 2, kind: 'pillar' }, { x: 6, y: 14, kind: 'pillar' },
        { x: 18, y: 14, kind: 'pillar' },
        { x: 12, y: 15, kind: 'fossilDig' }
      ],
      scatter: { rock: 12, weed: 8 },
      enc: [
        [92, 20, 28, 32, 'night'],  // Gastly
        [96, 16, 28, 32, null],     // Drowzee
        [63, 12, 28, 32, null],     // Abra
        [104, 10, 28, 32, null],    // Cubone
        [105, 6, 32, 36, 'night'],  // Marowak
        [93, 6, 33, 37, 'night'],   // Haunter
        [97, 6, 33, 37, null],      // Hypno
        [64, 5, 32, 36, null],      // Kadabra
        [122, 3, 32, 36, null],     // Mr. Mime
        [138, 3, 30, 34, null],     // Omanyte
        [140, 3, 30, 34, null],     // Kabuto
        [150, 1, 45, 50, 'night']   // Mewtwo
      ],
      fish: 'coast'
    },
    {
      id: 'sanctuary', name: 'Đảo Thánh Địa', col: 3, row: 4, w: 24, h: 18, ground: 0,
      unlock: { rank: 28, gold: 280000 },
      blurb: 'Không ai săn ở đây. Những thứ hiếm nhất chọn nơi này để ngủ.',
      grass: [{ x: 4, y: 4, w: 8, h: 7 }, { x: 14, y: 5, w: 8, h: 7 }],
      objs: [
        { x: 12, y: 14, kind: 'shrine' },
        { x: 11, y: 2, kind: 'sign', text: 'THÁNH ĐỊA — nơi trú của những loài hiếm.' }
      ],
      scatter: { tree: 8, forage: 6 },
      enc: [
        [113, 14, 30, 34, null],  // Chansey
        [35, 14, 30, 34, 'night'],// Clefairy
        [132, 12, 30, 34, null],  // Ditto
        [133, 10, 30, 34, null],  // Eevee
        [137, 8, 32, 36, null],   // Porygon
        [39, 10, 30, 34, null],   // Jigglypuff
        [143, 3, 36, 40, null],   // Snorlax
        [151, 1, 40, 45, null]    // Mew
      ],
      fish: 'coast'
    },
    {
      id: 'sky', name: 'Đảo Trên Mây', col: 4, row: 0, w: 24, h: 17, ground: 3,
      unlock: { rank: 30, gold: 380000 },
      blurb: 'Cao đến mức nhìn xuống thấy hết quần đảo. Gió không bao giờ ngừng.',
      grass: [{ x: 3, y: 5, w: 8, h: 6 }, { x: 14, y: 4, w: 8, h: 8 }],
      objs: [{ x: 12, y: 14, kind: 'skyAltar' }],
      scatter: { rock: 6 },
      enc: [
        [21, 18, 32, 36, null],  // Spearow
        [17, 16, 32, 36, null],  // Pidgeotto
        [41, 14, 32, 36, 'night'],// Zubat
        [84, 12, 32, 36, null],  // Doduo
        [22, 8, 36, 40, null],   // Fearow
        [42, 8, 36, 40, 'night'],// Golbat
        [18, 6, 38, 42, null],   // Pidgeot
        [85, 6, 38, 42, null],   // Dodrio
        [83, 4, 34, 38, null],   // Farfetch'd
        [123, 3, 36, 40, null],  // Scyther
        [145, 1, 42, 46, null]   // Zapdos
      ],
      fish: null
    },
    {
      id: 'dragon', name: 'Đảo Rồng', col: 4, row: 4, w: 26, h: 20, ground: 4,
      unlock: { rank: 34, gold: 600000 },
      blurb: 'Cuối quần đảo. Thứ ngủ ở đây không quan tâm bạn là ai.',
      grass: [{ x: 4, y: 5, w: 9, h: 8 }, { x: 15, y: 4, w: 8, h: 9 }],
      lava: [{ x: 2, y: 16, w: 6, h: 3 }],
      objs: [
        { x: 13, y: 16, kind: 'dragonNest' },
        { x: 12, y: 2, kind: 'sign', text: 'ĐẢO RỒNG — chỗ này không dành cho người mới.' }
      ],
      scatter: { bigRock: 12, rock: 8 },
      enc: [
        [147, 16, 38, 42, null],  // Dratini
        [148, 8, 42, 46, null],   // Dragonair
        [115, 10, 40, 44, null],  // Kangaskhan
        [128, 10, 40, 44, null],  // Tauros
        [130, 6, 42, 46, null],   // Gyarados
        [95, 8, 40, 44, null],    // Onix
        [112, 6, 42, 46, null],   // Rhydon
        [149, 2, 48, 52, null],   // Dragonite
        [150, 1, 50, 55, 'night'] // Mewtwo
      ],
      fish: 'lava'
    }
  ];

  /* Fish pools per island water type - names index data/gamedata.js `fish`.
   * Keeping this here rather than on each island means a new island picks a
   * pool by name instead of restating forty species. */
  var FISH_POOL = {
    coast:  ['Sardine', 'Anchovy', 'Herring', 'Sunfish', 'Carp', 'Chub',
             'Bream', 'Largemouth Bass', 'Rainbow Trout', 'Perch', 'Smallmouth Bass'],
    ocean:  ['Sardine', 'Tuna', 'Red Snapper', 'Halibut', 'Squid', 'Octopus',
             'Eel', 'Super Cucumber', 'Albacore', 'Pufferfish', 'Tilapia', 'Red Mullet'],
    forest: ['Chub', 'Catfish', 'Walleye', 'Shad', 'Bream', 'Carp', 'Woodskip'],
    jungle: ['Catfish', 'Tilapia', 'Stingray', 'Lionfish', 'Blue Discus'],
    ice:    ['Perch', 'Pike', 'Lingcod', 'Midnight Carp', 'Sturgeon', 'Squid'],
    lava:   ['Lava Eel', 'Stonefish', 'Ice Pip', 'Scorpion Carp']
  };

  global.ISL_ISLANDS = {
    list: ISLANDS,
    GROUND: GROUND,
    FISH_POOL: FISH_POOL,
    COLX: COLX, ROWY: ROWY,
    SLOT_W: 30, SLOT_H: 24,
    WORLD_W: 160, WORLD_H: 126,
    byId: function (id) {
      for (var i = 0; i < ISLANDS.length; i++) if (ISLANDS[i].id === id) return ISLANDS[i];
      return null;
    },
    /* Where an island's top-left tile sits in world coordinates. */
    originOf: function (isl) { return { x: COLX[isl.col], y: ROWY[isl.row] }; },
    /* Orthogonally adjacent islands - the buy rule and the bridge builder both
     * read this, so they can never disagree about what touches what. */
    neighbours: function (isl) {
      var out = [];
      for (var i = 0; i < ISLANDS.length; i++) {
        var o = ISLANDS[i];
        if (o === isl) continue;
        if (Math.abs(o.col - isl.col) + Math.abs(o.row - isl.row) === 1) out.push(o);
      }
      return out;
    }
  };
})(window);
