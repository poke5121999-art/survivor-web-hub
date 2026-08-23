/* Vẽ. Mọi thứ trong game được vẽ bằng code, không có file ảnh nào.
 *
 * WHY: game gốc là pixel art kiểu NES, nhưng ảnh của họ là tài sản của họ.
 * Vẽ lại bằng lưới pixel vừa giữ được cái nhìn đó vừa không đụng vào asset ai cả.
 *
 * Bản vẽ đầu tiên bị chê "mờ quá, chả biết cái nào địa hình cái nào để bấm".
 * ROOT-CAUSE: mọi thứ đều vẽ trên lưới 8x8 với một bảng màu xanh rất sát nhau,
 * không viền, và ô địa hình lẫn ô bấm được đều là một hình vuông đặc như nhau.
 * Ba luật rút ra, áp cho toàn bộ file này:
 *   1. NỀN và VẬT là hai lớp. Nền luôn tối và ít chi tiết; vật nằm đè lên trên.
 *   2. Mọi VẬT đều có viền tối một pixel. Viền là thứ tách nó khỏi nền, không
 *      phải màu — màu thì lẫn ngay khi thu nhỏ xuống 32 pixel.
 *   3. Thứ BẤM ĐƯỢC luôn có bệ sáng ở dưới và mũi nhấp nháy ở trên. Người chơi
 *      không phải học ô nào bấm được; nhìn là thấy.
 */
(function (global) {
  'use strict';

  /* Bảng màu. Chữ hoa = viền/tối, chữ thường = thân/sáng. */
  var PAL = {
    '.': null,
    /* trung tính */
    K: '#080c0a', L: '#131b18', M: '#2a3540', N: '#48596b', O: '#7d92a6', P: '#c3d3e0', Q: '#f2f7fb',
    /* cỏ / lá */
    g: '#24402c', h: '#2e5136', i: '#3f7a48', j: '#57a85c', k: '#8ed177', G: '#16281c',
    /* đất / gỗ */
    d: '#5a4128', e: '#78562f', f: '#9c7040', c: '#c49a5e', D: '#33230f',
    /* đá */
    r: '#55636f', s: '#6f8091', t: '#9aabbb', R: '#2b343d',
    /* nước */
    w: '#1d3f6b', x: '#2a5a94', y: '#4b8ac9', z: '#8fc4ef',
    /* đỏ / máu */
    p: '#7a1f1f', q: '#c03535', u: '#e8674f', U: '#4a0f0f',
    /* vàng / kim loại quý */
    S: '#8a6a12', T: '#d8b02e', v: '#f5d24b', V: '#f7e07a',
    /* tím / phép */
    m: '#4a2a63', n: '#7c4a9e', o: '#b57ad6',
    /* da */
    A: '#c9946a', B: '#f0d0aa',
    /* lam */
    b: '#2a4a8a', a: '#4f7fd0', C: '#9fc4f5'
  };

  function draw(ctx, rows, x, y, size) {
    if (!rows) return;
    var n = rows.length, px = size / n;
    for (var r = 0; r < n; r++) {
      var line = rows[r];
      for (var c = 0; c < line.length; c++) {
        var col = PAL[line[c]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(Math.floor(x + c * px), Math.floor(y + r * px),
          Math.ceil(px), Math.ceil(px));
      }
    }
  }

  /* Vẽ đúng cái bóng của hình, toàn bộ bằng một màu.
     WHY: hiệu ứng "trúng đòn" lúc đầu là một hình vuông trắng phủ lên nhân vật,
     và nó trông đúng như thế — một hình vuông, không phải một cú đánh. Phải tô
     theo đúng những pixel có màu thì cú giật mới bám vào nhân vật. */
  function drawTinted(ctx, rows, x, y, size, color) {
    if (!rows) return;
    var n = rows.length, px = size / n;
    ctx.fillStyle = color;
    for (var r = 0; r < n; r++) {
      var line = rows[r];
      for (var c = 0; c < line.length; c++) {
        if (!PAL[line[c]]) continue;
        ctx.fillRect(Math.floor(x + c * px), Math.floor(y + r * px),
          Math.ceil(px), Math.ceil(px));
      }
    }
  }

  /* ------------------------------------------------------------------ nền */
  /* Nền cố tình phẳng và tối. Mọi chi tiết đều dành cho lớp vật ở trên. */

  var GROUND = {
    grass: [
      'gggggggg', 'ghgggggh', 'gggggghg', 'gghggggg',
      'gggggghg', 'ghgggggg', 'ggggghgg', 'gggggggg'],
    dirt: [
      'dddddddd', 'ddeddddd', 'dddddedd', 'dedddddd',
      'ddddeddd', 'dddedddd', 'dddddded', 'dddddddd'],
    water: [
      'wwwwwwww', 'wxwwwwxw', 'wwwxxwww', 'wxwwwwwx',
      'wwwwxwww', 'wxwwwwxw', 'wwwxwwww', 'wwwwwwww']
  };

  /* Lớp vật trên nền: cây và đá. Cả hai đều có viền tối và một mảng sáng ở
     phía trên trái, để mắt bắt được khối chứ không phải một vệt màu. */
  var OVERLAY = {
    tree: [
      '....KKKK....',
      '..KKiiiiKK..',
      '.KiijjjjiiK.',
      'KijjjkkjjjiK',
      'KijjkkkkjjiK',
      'KijjjkkjjjiK',
      '.KiijjjjiiK.',
      '..KKiiiiKK..',
      '....KddK....',
      '....KddK....',
      '...KDddDK...',
      '...KKKKKK...'],
    rock: [
      '............',
      '....KKKK....',
      '..KKrrrrKK..',
      '.KrsssssrK..',
      'KrssttssssrK',
      'KrsstttsssrK',
      'KrssssssssrK',
      'KrrssssssrrK',
      '.KRrrrrrrRK.',
      '..KKRRRRKK..',
      '....KKKK....',
      '............'],
    flower: [
      '............',
      '............',
      '.....KK.....',
      '....KuuK....',
      '...KuVVuK...',
      '...KuVVuK...',
      '....KuuK....',
      '.....Ki.....',
      '.....Ki.....',
      '....KiiK....',
      '............',
      '............']
  };

  /* ---------------------------------------------------------------- người */

  var HERO = [
    '....KKKK....',
    '...KTTTTK...',
    '...KBAABK...',
    '..KBBBBBBK..',
    '..KBKBBKBK..',
    '..KBBBBBBK..',
    '.KqqqQQqqqK.',
    'KqqqqQQqqqqK',
    'KAqqqqqqqqAK',
    '.KKqqqqqqKK.',
    '..KddK.KddK.',
    '..KKKK.KKKK.'];

  /* ----------------------------------------------------------------- quái */
  /* Mỗi con một bóng riêng: sói mõm dài, dơi có cánh, nhện tám chân, gấu to
     vai, nhím đầy gai. Ở 32 pixel thì cái đọc được là BÓNG, không phải mặt. */

  var MOB = {
    wolf: [
      '............',
      'KK........KK',
      'KNK......KNK',
      'KNNKKKKKKNNK',
      'KNNNNNNNNNNK',
      'KNuNNNNNuNNK',
      '.KNNNNNNNNK.',
      '.KNKQQKQQNK.',
      '..KNNNNNNK..',
      '..KN.KK.NK..',
      '..KK....KK..',
      '............'],
    bat: [
      '............',
      'KK........KK',
      'KmK......KmK',
      'KmmKK..KKmmK',
      'KmmmmKKmmmmK',
      'KmnmmmmmmnmK',
      '.KmuKmmKumK.',
      '.KmmmQQmmmK.',
      '..KmmmmmmK..',
      '...KmmmmK...',
      '....KKKK....',
      '............'],
    spider: [
      '............',
      'K..KK..KK..K',
      'LK.KL..LK.KL',
      '.LK.KKKK.KL.',
      '..LKLLLLKL..',
      '.KLLuLLuLLK.',
      '.KLLLLLLLLK.',
      '..KLLLLLLK..',
      '.LK.KKKK.KL.',
      'LK.KL..LK.KL',
      'K..KK..KK..K',
      '............'],
    bear: [
      '............',
      '.KK......KK.',
      'KddK....KddK',
      'KdddKKKKdddK',
      'KddddddddddK',
      'KdduddduddKK',
      'KddddddddddK',
      'KdddKQQKdddK',
      'KDddddddddDK',
      '.KDDddddDDK.',
      '..KK.KK.KK..',
      '............'],
    hedgehog: [
      '..K..K..K...',
      'K.K.KK.K.K..',
      '.KKKKKKKKK..',
      'KNNNNNNNNNK.',
      'KNtNtNtNtNNK',
      'KNNNNNNNNNNK',
      'KNNNNNNNBBAK',
      '.KNNNNNNKBKK',
      '..KNNNNNNKK.',
      '...KKKKKK...',
      '............',
      '............'],
    raven: [
      '............',
      '.....KK.....',
      '....KLLK....',
      '...KLLLLK...',
      'KKKLLuLLKKKK',
      'KLLLLLLLLLTK',
      'KLLLLLLLLLLK',
      '.KLLLLLLLLK.',
      '..KLLLLLLK..',
      '...KLLLLK...',
      '....KTTK....',
      '............'],
    giant: [
      '...KKKKKK...',
      '..KMMMMMMK..',
      '.KMMNNNNMMK.',
      'KMMNuNNuNMMK',
      'KMMNNNNNNMMK',
      'KMMNQQQQNMMK',
      'KMMMMMMMMMMK',
      'KMMMMMMMMMMK',
      '.KMMMMMMMMK.',
      '.KMMK..KMMK.',
      '.KKK....KKK.',
      '............'],
    golem: [
      '...KKKKKK...',
      '..KrrrrrrK..',
      '.KrsTssTsrK.',
      'KrssssssssrK',
      'KrsRRRRRRsrK',
      'KrssssssssrK',
      'KrrssssssrrK',
      'KKrrssssrrKK',
      '..KrrrrrrK..',
      '..Krr..rrK..',
      '..KK....KK..',
      '............'],
    treant: [
      '....KKKK....',
      '..KKiiiiKK..',
      '.KijjjjjjiK.',
      'KijjujjujjiK',
      'KijjjjjjjjiK',
      'KijjKQQKjjiK',
      '.KijjjjjjiK.',
      '..KKddddKK..',
      '...KdDDdK...',
      '..KddDDddK..',
      '..KK.dd.KK..',
      '.....KK.....'],
    abom: [
      'K..KK..KK..K',
      '.KKLLKKLLKK.',
      'KLLLLLLLLLLK',
      'KLuLLLLLLuLK',
      'KLLLLLLLLLLK',
      'KLLQQLLQQLLK',
      'KLLLLLLLLLLK',
      'KLLuuuuuuLLK',
      '.KLLLLLLLLK.',
      'K..KLLLLK..K',
      '.KK.KKKK.KK.',
      'K..K....K..K'],
    knight: [
      '...KKKKKK...',
      '..KMMMMMMK..',
      '.KMNNNNNNMK.',
      'KMNuNMMNuNMK',
      'KMNNNNNNNNMK',
      'KMMNNNNNNMMK',
      'KMMMMMMMMMMK',
      'KMMMKQQKMMMK',
      '.KMMMMMMMMK.',
      '.KMMK..KMMK.',
      '.KKK....KKK.',
      '............']
  };

  function mobArt(name) {
    var n = (name || '').toLowerCase();
    if (n.indexOf('wolf') >= 0 || n.indexOf('werewolf') >= 0) return MOB.wolf;
    if (n.indexOf('bat') >= 0) return MOB.bat;
    if (n.indexOf('spider') >= 0) return MOB.spider;
    if (n.indexOf('bear') >= 0 || n.indexOf('hog') >= 0) return MOB.bear;
    if (n.indexOf('hedgehog') >= 0) return MOB.hedgehog;
    if (n.indexOf('raven') >= 0) return MOB.raven;
    if (n.indexOf('giant') >= 0 || n.indexOf('griffin') >= 0) return MOB.giant;
    if (n.indexOf('golem') >= 0 || n.indexOf('troll') >= 0) return MOB.golem;
    if (n.indexOf('treant') >= 0 || n.indexOf('leshen') >= 0 ||
        n.indexOf('brittlebark') >= 0 || n.indexOf('druid') >= 0) return MOB.treant;
    if (n.indexOf('abomination') >= 0) return MOB.abom;
    return MOB.knight;
  }

  /* -------------------------------------------------------------- sự kiện */
  /* Tất cả đều 12x12, có viền, và được vẽ kèm bệ sáng (xem drawEvent). */

  var EV = {
    chest: [
      '............',
      '..KKKKKKKK..',
      '.KffffffffK.',
      '.KfcccccffK.',
      '.KKKKKKKKKK.',
      '.KfTTTTTTfK.',
      '.KffKTTKffK.',
      '.KffffffffK.',
      '.KeeeeeeeeK.',
      '.KKKKKKKKKK.',
      '............',
      '............'],
    jewel: [
      '............',
      '...KKKKKK...',
      '..KaaaaaaK..',
      '.KaCCaaCCaK.',
      '.KaCzzzzCaK.',
      '.KKKKKKKKKK.',
      '.KbbTTTTbbK.',
      '.KbbbbbbbbK.',
      '.KKKKKKKKKK.',
      '............',
      '............',
      '............'],
    grave: [
      '....KKKK....',
      '..KKOOOOKK..',
      '.KOOOOOOOOK.',
      '.KOOKKKKOOK.',
      '.KOKLLLLKOK.',
      '.KOKLLLLKOK.',
      '.KOOOOOOOOK.',
      '.KNNNNNNNNK.',
      '..KKNNNNKK..',
      '.KhhhhhhhhK.',
      'KgggggggggK.',
      '............'],
    anvil: [
      '............',
      '............',
      '.KKKKKKKKK..',
      'KNNNNNNNNNK.',
      'KNttNNNNNNK.',
      '.KKNNNNNKK..',
      '...KNNNK....',
      '...KNNNK....',
      '..KNNNNNK...',
      '.KNNNNNNNK..',
      '.KKKKKKKKK..',
      '............'],
    oil: [
      '.....KK.....',
      '.....KdK....',
      '....KddK....',
      '....KddK....',
      '...KjjjjK...',
      '..KjkkkkjK..',
      '.KjkkkkkkjK.',
      '.KjkkkkkkjK.',
      '.KjjkkkkjjK.',
      '..KjjjjjjK..',
      '...KKKKKK...',
      '............'],
    merchant: [
      '...KKKKKK...',
      '..KTTTTTTK..',
      '..KBBBBBBK..',
      '..KBKBBKBK..',
      '..KBBBBBBK..',
      '.KnnnnnnnnK.',
      'KnnooooonnKK',
      'KnnnKTTKnnnK',
      '.KnnnnnnnnK.',
      '.KddK..KddK.',
      '.KKK....KKK.',
      '............'],
    fire: [
      '............',
      '.....KK.....',
      '....KTTK....',
      '...KTVVTK...',
      '..KuTVVTuK..',
      '.KquTVVTuqK.',
      '.KqquTTuqqK.',
      '..KqquuqqK..',
      '.KeeeeeeeeK.',
      'KeddddddddeK',
      '.KKKKKKKKKK.',
      '............'],
    house: [
      '.....KK.....',
      '....KqqK....',
      '...KqqqqK...',
      '..KqqqqqqK..',
      '.KqqqqqqqqK.',
      'KqqqqqqqqqqK',
      'KffffffffffK',
      'KffKTTKffffK',
      'KffKTTKffffK',
      'KffKKKKffffK',
      'KKKKKKKKKKKK',
      '............'],
    golem: [
      '...KKKKKK...',
      '..KrrrrrrK..',
      '.KrsTssTsrK.',
      'KrssssssssrK',
      'KrssRRRRssrK',
      'KrssssssssrK',
      'KKrrssssrrKK',
      '..KrrrrrrK..',
      '..Krr..rrK..',
      '..KK....KK..',
      '............',
      '............'],
    cauldron: [
      '............',
      '...K....K...',
      '..KjK..KjK..',
      '.KKKKKKKKKK.',
      'KMjjjjjjjjMK',
      'KMjkkkkkkjMK',
      'KMjjjjjjjjMK',
      '.KMMMMMMMMK.',
      '..KMMMMMMK..',
      '...KM..MK...',
      '..KKK..KKK..',
      '............'],
    tower: [
      '.....KK.....',
      '.....KTK....',
      '....KTTK....',
      '...KeeeeK...',
      '...KefeeK...',
      '...KeeeeK...',
      '..KeeeeeeK..',
      '..KeKTTKeK..',
      '.KeeeeeeeeK.',
      'KeeeeeeeeeeK',
      'KKKKKKKKKKKK',
      '............'],
    well: [
      '....KKKK....',
      '...Ke..eK...',
      '..KKKKKKKK..',
      '.KrrrrrrrrK.',
      '.KrwwwwwwrK.',
      '.KrwzzzzwrK.',
      '.KrwwwwwwrK.',
      '.KrrrrrrrrK.',
      '.KRrrrrrrRK.',
      '.KKKKKKKKKK.',
      '............',
      '............']
  };

  /* --------------------------------------------------- biểu tượng vật phẩm */
  /* Món đồ được đoán hình theo TÊN GỐC tiếng Anh, vì tên gốc mới là thứ ổn
     định — bản dịch có thể đổi chữ bất cứ lúc nào. */

  var ICON = {
    sword: [
      '.......KK...',
      '......KQQK..',
      '.....KQQPK..',
      '....KQQPK...',
      '...KQQPK....',
      '..KQQPK.....',
      '.KQPK.......',
      'KTTTTTK.....',
      '.KKTTKK.....',
      '..KeeK......',
      '..KeeK......',
      '..KKKK......'],
    axe: [
      '....KKKK....',
      '..KKPPPPKK..',
      '.KPPQQQQPPK.',
      '.KPPQQQQPPK.',
      '..KPPPPPPK..',
      '...KKKeKKK..',
      '.....KeK....',
      '.....KeK....',
      '.....KeK....',
      '.....KeK....',
      '.....KKK....',
      '............'],
    hammer: [
      '..KKKKKKKK..',
      '.KNNOOOONNK.',
      '.KNOOOOOONK.',
      '.KNNOOOONNK.',
      '..KKKeKKKK..',
      '....KeK.....',
      '....KeK.....',
      '....KeK.....',
      '....KeK.....',
      '....KKK.....',
      '............',
      '............'],
    spear: [
      '.....KK.....',
      '....KQQK....',
      '....KQQK....',
      '...KQPPQK...',
      '...KQPPQK...',
      '....KeeK....',
      '....KeeK....',
      '....KeeK....',
      '....KeeK....',
      '....KeeK....',
      '....KKKK....',
      '............'],
    bow: [
      '...KKK......',
      '..KeeeK.....',
      '.KeK.KeK....',
      'KeK...KeK...',
      'KeK....KPK..',
      'KeK.....KPK.',
      'KeK....KPK..',
      'KeK...KeK...',
      '.KeK.KeK....',
      '..KeeeK.....',
      '...KKK......',
      '............'],
    staff: [
      '....KKKK....',
      '...KoooK....',
      '..KonnnoK...',
      '..KonnnoK...',
      '...KoooK....',
      '....KeK.....',
      '....KeK.....',
      '....KeK.....',
      '....KeK.....',
      '....KeK.....',
      '....KKK.....',
      '............'],
    whip: [
      '..KK........',
      '.KeeK.......',
      '.KeeK.......',
      '..KeeK......',
      '...KeeK.....',
      '....KeeK....',
      '.....KeeK...',
      '......KeeK..',
      '.......KeK..',
      '........KK..',
      '............',
      '............'],
    ring: [
      '............',
      '.....KK.....',
      '....KTVK....',
      '...KKKKKK...',
      '..KTKqqKTK..',
      '.KTK....KTK.',
      '.KTK....KTK.',
      '.KTK....KTK.',
      '..KTK..KTK..',
      '...KTTTTK...',
      '....KKKK....',
      '............'],
    earring: [
      '.....KK.....',
      '....KTTK....',
      '...KTK.KTK..',
      '...KTK.KTK..',
      '....KTKTK...',
      '.....KTK....',
      '.....KTK....',
      '....KqqqK...',
      '...KquuuqK..',
      '....KqqqK...',
      '.....KK.....',
      '............'],
    crown: [
      '............',
      '.K..K..K..K.',
      'KTKKKTKKKTK.',
      'KTTKKTTKKTTK',
      'KTTTTTTTTTTK',
      'KTqTTqTTqTTK',
      'KTTTTTTTTTTK',
      'KKKKKKKKKKKK',
      '............',
      '............',
      '............',
      '............'],
    helmet: [
      '............',
      '...KKKKKK...',
      '..KNOOOONK..',
      '.KNOOOOOONK.',
      '.KNOKKKKONK.',
      '.KNOK..KONK.',
      '.KNOOOOOONK.',
      '.KNNOOOONNK.',
      '..KNNNNNNK..',
      '...KKKKKK...',
      '............',
      '............'],
    boots: [
      '............',
      '..KKK..KKK..',
      '..KeK..KeK..',
      '..KeK..KeK..',
      '..KeK..KeK..',
      '..KeK..KeK..',
      '.KeeeKKKeeeK',
      'KeffeKKeffeK',
      'KeeeeKKeeeeK',
      'KKKKKKKKKKKK',
      '............',
      '............'],
    glove: [
      '............',
      '..K.K.K.....',
      '.KeKeKeK....',
      '.KeeeeeKK...',
      'KKeeeeeeeK..',
      'KeKeeeeeeK..',
      'KeeeeeeeeK..',
      '.KeeeeeeK...',
      '.KfffffK....',
      '..KKKKK.....',
      '............',
      '............'],
    armor: [
      '...KKKKKK...',
      '..KNNNNNNK..',
      '.KNOOOOOONK.',
      'KNOOOOOOOONK',
      'KNOOKqqKOONK',
      'KNOOOqqOOONK',
      'KNOOOOOOOONK',
      '.KNOOOOOONK.',
      '.KNNOOOONNK.',
      '..KNNNNNNK..',
      '...KKKKKK...',
      '............'],
    shield: [
      '..KKKKKKKK..',
      '.KaaaaaaaaK.',
      '.KaCCaaCCaK.',
      '.KaaaaaaaaK.',
      '.KaaTTTTaaK.',
      '.KaaTTTTaaK.',
      '..KaaaaaaK..',
      '..KaaaaaaK..',
      '...KaaaaK...',
      '....KaaK....',
      '.....KK.....',
      '............'],
    potion: [
      '.....KK.....',
      '....KOOK....',
      '....KOOK....',
      '...KOOOOK...',
      '..KOqqqqOK..',
      '.KOqquuqqOK.',
      '.KOqqqqqqOK.',
      '.KOqqqqqqOK.',
      '.KOOqqqqOOK.',
      '..KOOOOOOK..',
      '...KKKKKK...',
      '............'],
    food: [
      '............',
      '..KKKKKKKK..',
      '.KeeeeeeeeK.',
      'KefffffffeKK',
      'KeffqqqqffeK',
      'KeffquuqffeK',
      'KeffqqqqffeK',
      'KeffffffffeK',
      '.KeeeeeeeeK.',
      '..KKKKKKKK..',
      '............',
      '............'],
    bomb: [
      '.......KK...',
      '......KTK...',
      '.....KTK....',
      '..KKKKK.....',
      '.KLLLLLKK...',
      'KLLLLLLLLK..',
      'KLLOLLLLLK..',
      'KLLLLLLLLK..',
      '.KLLLLLLK...',
      '..KKKKKK....',
      '............',
      '............'],
    gem: [
      '............',
      '...KKKKKK...',
      '..KaCCCCaK..',
      '.KaCzzzzCaK.',
      'KaCzzzzzzCaK',
      'KaCzzzzzzCaK',
      '.KaCzzzzCaK.',
      '..KaCCCCaK..',
      '...KaaaaK...',
      '....KKKK....',
      '............',
      '............'],
    talisman: [
      '.....KK.....',
      '....KOOK....',
      '...KOKKOK...',
      '..KOK..KOK..',
      '.KOK....KOK.',
      '.KOK....KOK.',
      '..KOK..KOK..',
      '...KOTTOK...',
      '...KTuuTK...',
      '....KTTK....',
      '.....KK.....',
      '............'],
    thorn: [
      '..K......K..',
      '.KiK....KiK.',
      '.KiiK..KiiK.',
      '..KiiKKiiK..',
      '...KiiiiK...',
      '..KiijjiiK..',
      '.KiijjjjiiK.',
      '.KiiKKKKiiK.',
      '..KiK..KiK..',
      '..KK....KK..',
      '............',
      '............'],
    misc: [
      '............',
      '...KKKKKK...',
      '..KOOOOOOK..',
      '.KOOPPPPOOK.',
      '.KOPPQQPPOK.',
      '.KOPPQQPPOK.',
      '.KOOPPPPOOK.',
      '..KOOOOOOK..',
      '...KKKKKK...',
      '............',
      '............',
      '............']
  };

  /* Bảng đoán hình theo tên gốc. Thứ tự QUAN TRỌNG: xét từ chữ riêng nhất tới
     chữ chung nhất, vì "Bonespine Whip" vừa có "whip" vừa không nên rơi vào
     nhánh vũ khí chung. */
  var ICON_RULES = [
    ['whip', 'whip'], ['bow', 'bow'], ['spear', 'spear'], ['lance', 'spear'],
    ['axe', 'axe'], ['hammer', 'hammer'], ['club', 'hammer'], ['stick', 'staff'],
    ['staff', 'staff'], ['rod', 'staff'], ['scepter', 'staff'],
    ['blade', 'sword'], ['sword', 'sword'], ['rapier', 'sword'], ['scythe', 'sword'],
    ['dagger', 'sword'], ['greatsword', 'sword'], ['edge', 'sword'], ['iceblade', 'sword'],
    ['earring', 'earring'], ['ring', 'ring'], ['crown', 'crown'],
    ['helmet', 'helmet'], ['mask', 'helmet'],
    ['boots', 'boots'], ['greaves', 'boots'], ['sandals', 'boots'],
    ['gauntlet', 'glove'], ['glove', 'glove'],
    ['shield', 'shield'], ['buckler', 'shield'], ['mirror', 'shield'],
    ['armor', 'armor'], ['plate', 'armor'], ['mail', 'armor'], ['vest', 'armor'],
    ['coat', 'armor'], ['cloak', 'armor'], ['scales', 'armor'], ['physique', 'armor'],
    ['potion', 'potion'], ['flask', 'potion'], ['wine', 'potion'], ['oil', 'potion'],
    ['cocktail', 'potion'], ['sap', 'potion'],
    ['bomb', 'bomb'], ['firecracker', 'bomb'], ['cherry', 'bomb'],
    ['gemstone', 'gem'], ['crystal', 'gem'],
    ['talisman', 'talisman'], ['bond', 'talisman'], ['charm', 'talisman'],
    ['pendant', 'talisman'], ['doll', 'talisman'], ['contract', 'talisman'],
    ['ritual', 'talisman'], ['curse', 'talisman'], ['heart', 'talisman'],
    ['rose', 'thorn'], ['thorn', 'thorn'], ['razorvine', 'thorn'], ['acorn', 'thorn'],
    ['steak', 'food'], ['ham', 'food'], ['roast', 'food'], ['honeycomb', 'food'],
    ['feather', 'misc'], ['web', 'misc'], ['needle', 'misc'], ['whetstone', 'misc'],
    ['transfusion', 'misc'], ['bracelet', 'ring'], ['belt', 'armor']
  ];

  function iconFor(item) {
    var n = ((item && item.name) || '').toLowerCase();
    for (var i = 0; i < ICON_RULES.length; i++) {
      if (n.indexOf(ICON_RULES[i][0]) >= 0) return ICON[ICON_RULES[i][1]];
    }
    if (item && item.weapon) return ICON.sword;
    if (item && (item.tags || []).indexOf('food') >= 0) return ICON.food;
    if (item && (item.tags || []).indexOf('jewelry') >= 0) return ICON.ring;
    return ICON.misc;
  }

  var RARITY_COLOR = {
    common: '#8fa3b5', rare: '#5b8fd6', heroic: '#b06fd0',
    golden: '#f2d24b', diamond: '#7fe3f0', cauldron: '#e08a3c'
  };

  /* ---------------------------------------------------------------- vẽ ra */

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  global.HIC_ART = {
    PAL: PAL,
    draw: draw,
    RARITY_COLOR: RARITY_COLOR,

    ground: function (ctx, kind, x, y, s) {
      draw(ctx, GROUND[kind] || GROUND.grass, x, y, s);
    },
    overlay: function (ctx, kind, x, y, s) {
      if (OVERLAY[kind]) draw(ctx, OVERLAY[kind], x, y, s);
    },
    hero: function (ctx, x, y, s) { draw(ctx, HERO, x, y, s); },
    mob: function (ctx, name, x, y, s) { draw(ctx, mobArt(name), x, y, s); },
    mobArt: mobArt,
    HERO: HERO,

    /* Ô sự kiện: bệ sáng dưới chân + biểu tượng + mũi nhấp nháy trên đầu.
       Đây là thứ trả lời câu "cái nào bấm được" mà không cần một dòng chữ nào. */
    event: function (ctx, icon, x, y, s, t, dim) {
      var cx = x + s / 2, by = y + s * 0.86;
      ctx.save();
      // bệ sáng
      var g = ctx.createRadialGradient(cx, by, 0, cx, by, s * 0.6);
      g.addColorStop(0, dim ? 'rgba(155,175,195,.30)' : 'rgba(242,210,75,.42)');
      g.addColorStop(1, 'rgba(242,210,75,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, by, s * 0.52, s * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = dim ? 0.55 : 1;
      draw(ctx, EV[icon] || EV.chest, x, y - s * 0.08, s);
      ctx.globalAlpha = 1;
      if (!dim) {
        // mũi nhấp nháy
        var bob = Math.sin((t || 0) / 260) * s * 0.06;
        ctx.fillStyle = '#f2d24b';
        ctx.beginPath();
        ctx.moveTo(cx, y - s * 0.10 + bob);
        ctx.lineTo(cx - s * 0.14, y - s * 0.30 + bob);
        ctx.lineTo(cx + s * 0.14, y - s * 0.30 + bob);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },

    /* Bóng đổ dưới chân mọi thứ đứng trên mặt đất — nó là thứ tách "vật" khỏi
       "nền" mạnh hơn bất cứ đường viền nào. */
    shadow: function (ctx, x, y, s) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.40)';
      ctx.beginPath();
      ctx.ellipse(x + s / 2, y + s * 0.88, s * 0.32, s * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    icon: function (ctx, item, x, y, s) { draw(ctx, iconFor(item), x, y, s); },
    tintHero: function (ctx, x, y, s, color) { drawTinted(ctx, HERO, x, y, s, color); },
    tintMob: function (ctx, name, x, y, s, color) { drawTinted(ctx, mobArt(name), x, y, s, color); },
    iconFor: iconFor,
    roundRect: roundRect,
    EV: EV,
    ICON: ICON
  };

  /* Ảnh nhỏ cho các bảng.
     HAI cái bẫy ở đây, cả hai đều đã cắn một lần:
     1. Khoá bộ nhớ đệm phải là TÊN món đồ. Lúc đầu tôi ném cả object vào khoá,
        JavaScript biến nó thành "[object Object]", nên mọi món cùng độ hiếm
        dùng chung một hình — trên màn hình trang bị thì khiên nằm ở ô của kiếm.
     2. Phải trả về một canvas MỚI mỗi lần. Một nút DOM chỉ nằm được ở một chỗ:
        gắn lại cùng một canvas vào chỗ thứ hai là nó BIẾN MẤT khỏi chỗ thứ nhất,
        và bảng bộ đồ mất sạch hình ngay khi bộ thứ hai được vẽ ra. */
  var cache = {};

  function renderIcon(kind, key, px, opts) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = px;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var pad = 0;
    if (opts.frame) {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      roundRect(ctx, 0.5, 0.5, px - 1, px - 1, px * 0.18);
      ctx.fill();
      ctx.strokeStyle = opts.frame;
      ctx.lineWidth = Math.max(1, px * 0.06);
      ctx.stroke();
      pad = px * 0.14;
    }
    var inner = px - pad * 2;
    if (kind === 'mob') global.HIC_ART.mob(ctx, key, pad, pad, inner);
    else if (kind === 'event') draw(ctx, EV[key] || EV.chest, pad, pad, inner);
    else if (kind === 'item') draw(ctx, iconFor(key), pad, pad, inner);
    else draw(ctx, HERO, pad, pad, inner);
    return cv;
  }

  global.HIC_iconCanvas = function (kind, key, px, opts) {
    opts = opts || {};
    px = px || 32;
    var name = typeof key === 'string' ? key : ((key && key.name) || '?');
    var ck = kind + '|' + name + '|' + px + '|' + (opts.frame || '');
    if (!cache[ck]) cache[ck] = renderIcon(kind, key, px, opts);
    var out = document.createElement('canvas');
    out.width = out.height = px;
    var octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(cache[ck], 0, 0);
    return out;
  };
})(window);
