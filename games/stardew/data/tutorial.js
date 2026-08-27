/*
 * tutorial.js - what the game tells you, and exactly when.
 *
 * The rule this file exists to enforce: NOTHING IS EXPLAINED BEFORE IT CAN BE
 * USED. A tutorial that front-loads twelve screens on the first morning is not
 * teaching, it is a wall of text you tap through and then play badly anyway.
 * Every step here is attached to a TRIGGER - the moment the player first does
 * or could do the thing - so the explanation of Pokemon Work Points arrives on
 * the morning they own a Pokemon and not one minute earlier.
 *
 * Each step is one CARD with one to four short pages. A page is three or four
 * lines at most; anything longer belongs in the handbook, which archives every
 * card so it can be re-read from the menu without ever blocking play again.
 *
 * Fields:
 *   id       stable key. Stored in sim.taught, so renaming one re-teaches it.
 *   on       trigger name. See js/tutorial.js for the list and who fires it.
 *   when     optional (game) -> bool, an extra condition on the trigger
 *   title    card heading
 *   who      optional speaker; draws that portrait beside the text
 *   pages    [{ text, art, tip }]
 *              art  an atlas frame drawn above the text
 *              tip  a short highlighted line - the one thing to remember
 *   task     optional { text, done(game) } - the card stays pinned as a small
 *            objective strip until `done` returns true. Use it ONLY where
 *            doing the thing is the explanation.
 *   prio     lower shows first when two fire on the same frame
 *
 * Line breaks are built by concatenating NL rather than written as an escape
 * inside the literal. That is not style: this file is edited by scripts as
 * often as by hand, and an escape sequence is one shell layer away from
 * becoming a real newline and breaking every string in the file.
 */
(function (global) {
  'use strict';

  var NL = String.fromCharCode(10);
  var BR = NL + NL;

  var STEPS = [

    // ------------------------------------------------------------- opening
    {
      id: 'welcome', on: 'start', prio: 0,
      title: 'Quần Đảo Sao Rơi',
      who: 'Farmer_Idle0',
      pages: [
        { art: 'Kingdom',
          text: 'Ông ngoại để lại cho bạn một hòn đảo. Một hòn thôi.' + BR +
                'Biển quanh đây còn hai mươi bốn hòn nữa — có đảo trồng trọt, ' +
                'có đảo nuôi thú, có đảo đầy cỏ cao mà thứ gì đó đang trốn trong đấy.',
          tip: 'Mỗi hòn đảo là một cái "nhà". Không có cửa nào để chui vào — tất cả đều ngoài trời.' },
        { art: 'MiniHarbor',
          text: 'Bạn mua từng đảo một. Mỗi đảo cần hai thứ: CẤP ĐẢO TRƯỞNG đủ cao, và đủ vàng.' + BR +
                'Cấp lên khi bạn làm bất cứ việc gì — trồng, câu, đào, bắt Pokémon. ' +
                'Không có con đường duy nhất.',
          tip: 'Chỉ mua được đảo nằm SÁT một đảo bạn đã có.' }
      ]
    },
    {
      id: 'move', on: 'start', prio: 1,
      title: 'Đi lại và làm việc',
      pages: [
        { text: 'Kéo cần gạt dưới màn hình để đi.' + BR +
                'Khi trước mặt có thứ gì làm được — cây để chặt, đá để đập, đất để cuốc — ' +
                'nút TAY sẽ hiện ở góc phải. Bấm là làm.',
          tip: 'Không cần chọn công cụ. Đứng trước cái gì thì làm cái đó.' },
        { text: 'Thanh xanh bên phải là THỂ LỰC. Mỗi nhát cuốc, mỗi gàu nước đều tốn.' + BR +
                'Hết thể lực là bạn lê chân, và sáng hôm sau chỉ hồi được một nửa. ' +
                'Về ngủ trước 12h đêm.',
          tip: 'Ngủ trên giường ở Đảo Nhà để sang ngày mới.' }
      ],
      task: { text: 'Đi tới cái giường ở Đảo Nhà và thử ngủ một đêm',
              done: function (g) { return g.sim.day > 1 || g.sim.year > 1; } }
    },

    // -------------------------------------------------------------- farming
    {
      id: 'firstTill', on: 'till', prio: 2,
      title: 'Luống đất đầu tiên',
      pages: [
        { art: 'Shovel',
          text: 'Đất nâu là đất trồng được. Cuốc lên thành luống, gieo hạt, ' +
                'rồi TƯỚI mỗi ngày cho tới khi cây chín.',
          tip: 'Không tưới thì cây đứng yên — không chết, nhưng cũng không lớn.' },
        { text: 'Trời mưa tự tưới hết. Nhìn dự báo ở góc trên trước khi đi ngủ ' +
                'để khỏi phí một buổi sáng.' }
      ]
    },
    {
      id: 'firstPlant', on: 'plant', prio: 2,
      title: 'Gieo hạt',
      pages: [
        { art: 'CoinSeeds',
          text: 'Mỗi loại hạt chỉ sống đúng MÙA của nó. Sang mùa mới, ' +
                'cây trái mùa còn dở sẽ chết sạch.' + BR +
                'Một mùa có 28 ngày. Đừng gieo thứ cần 13 ngày vào ngày 20.',
          tip: 'Đứng trước luống đã trồng và bấm nút tay để xem còn mấy ngày nữa chín.' }
      ]
    },
    {
      id: 'firstHarvest', on: 'harvest', prio: 2,
      title: 'Thu hoạch và bán',
      pages: [
        { art: 'Wheat',
          text: 'Bỏ nông sản vào HÒM GIAO HÀNG (cái thùng gỗ trên Đảo Nhà). ' +
                'Đêm đó bạn được trả tiền.',
          tip: 'Bán qua hòm được giá tốt hơn bán tay cho NPC.' },
        { text: 'Cây có PHẨM CẤP: thường, bạc, vàng, tím. Cấp Nông Nghiệp càng cao ' +
                'thì càng hay ra hàng đẹp, và hàng đẹp đắt hơn hẳn.' }
      ]
    },
    {
      id: 'farm', on: 'island:farm',
      title: 'Đảo Nông Trại',
      pages: [
        { text: 'Bốn luống lớn, không có gì che. Đây là chỗ để trồng ăn tiền thật sự.',
          tip: 'Mở bảng NÔNG TRẠI để cuốc / gieo / tưới / hái HÀNG LOẠT thay vì từng ô.' },
        { art: 'Plus_5x5',
          text: 'Chế VÒI TƯỚI ở Đảo Xưởng và đặt giữa luống — ' +
                'sáng nào nó cũng tự tưới quanh mình.' + BR +
                'Vòi thường tưới hình chữ thập, Vòi Nông Trại 5x5, Siêu Vòi 7x7.',
          tip: 'Một Siêu Vòi thay được gần năm chục gàu nước mỗi ngày.' }
      ]
    },

    // ---------------------------------------------------------------- shops
    {
      id: 'shop', on: 'island:market',
      title: 'Đảo Chợ',
      who: 'Farmer_Idle0__2',
      pages: [
        { art: 'Shop',
          text: 'Sạp Hạt Giống bán thứ để trồng. Sạp Tạp Hoá mua lại mọi thứ bạn không cần.' + BR +
                'Hàng đổi theo mùa — đầu mỗi mùa ghé xem lại.',
          tip: 'Chợ chỉ mở 6h–17h.' },
        { art: 'QuestBase',
          text: 'BẢNG ĐƠN HÀNG ở giữa chợ. Mỗi ngày có vài đơn: ' +
                'giao đủ số họ cần, nhận vàng và điểm cấp cao hơn hẳn bán lẻ.',
          tip: 'Đơn hàng là cách lên cấp nhanh nhất trong tuần đầu.' }
      ]
    },

    // -------------------------------------------------------------- animals
    {
      id: 'animals', on: 'island:ranch',
      title: 'Đảo Chuồng Trại',
      who: 'CowElf_Idle0',
      pages: [
        { art: 'Cow',
          text: 'Mua thú ở Trại Giống. Mỗi sáng cho ăn và VUỐT VE từng con.' + BR +
                'Con nào được chăm đủ sẽ cho trứng / sữa / len đều và chất lượng cao dần.',
          tip: 'Chạm vào chuồng để mở bảng chăm CẢ ĐÀN một lượt.' },
        { text: 'Cỏ khô lấy từ silo. Ngày mưa hay mùa đông thú không ra ngoài gặm được, ' +
                'phải có cỏ dự trữ.' }
      ]
    },

    // --------------------------------------------------------------- forest
    {
      id: 'forestIsl', on: 'island:forest',
      title: 'Đảo Rừng',
      who: 'WoodCutterBear_Idle_0',
      pages: [
        { art: 'Tree',
          text: 'Gỗ ở đây nhiều nhất quần đảo. Gỗ là nguyên liệu chính của ' +
                'mọi thứ chế tạo được — rương, máy, cầu tàu, vòi tưới.',
          tip: 'Chặt cây xong thì gốc mọc lại sau vài ngày, không mất hẳn.' },
        { text: 'Nấm dại và quả rừng mọc lại mỗi ngày. Nhặt hết trước khi đi.' }
      ]
    },
    {
      id: 'smithIsl', on: 'island:smith',
      title: 'Đảo Thợ Rèn',
      who: 'Enginear2_Idle0',
      pages: [
        { art: 'smithy_0',
          text: 'Đưa dụng cụ cho Kỹ Sư Lam nâng cấp: Đồng → Sắt → Vàng → Iridium.' + BR +
                'Mỗi bậc chặt/đập mạnh hơn hẳn và bớt tốn thể lực.',
          tip: 'Cần quặng luyện thành THỎI. Lò nung ở ngay đây.' }
      ]
    },

    // -------------------------------------------------------------- fishing
    {
      id: 'fishing', on: 'island:harbor',
      title: 'Đảo Bến Cá',
      who: 'Sailor_Idle_0',
      pages: [
        { art: 'goldFishingRod',
          text: 'Đứng sát mép nước, nút CÂU sẽ hiện. Bấm KÉO đúng lúc con trỏ ' +
                'nằm trong vùng vàng.',
          tip: 'Cầu tàu ăn ra biển sâu — cá to chỉ cắn ở đó.' },
        { text: 'Mỗi vùng nước có đàn cá riêng. Pokémon hệ Nước có thể "Câu Hộ" ' +
                'nếu bạn lười cầm cần.' }
      ]
    },

    // -------------------------------------------------------------- POKEMON
    {
      id: 'pokemon', on: 'island:meadow', prio: 0,
      title: 'Cỏ cao có gì đó',
      pages: [
        { art: 'DropBall_0',
          text: 'Đi vào ĐÁM CỎ CAO là có thể gặp Pokémon hoang.' + BR +
                'Đánh cho nó yếu rồi ném bóng — càng ít máu, càng dễ bắt. ' +
                'Làm nó ngủ hoặc tê liệt thì dễ hơn nữa.',
          tip: 'Bóng ném vào con còn đầy máu gần như chắc chắn trượt.' },
        { art: 'FriendIcon',
          text: 'Bạn được tặng một PIKACHU và năm quả bóng để bắt đầu.' + BR +
                'Đội hình tối đa 6 con. Số còn lại nằm trong TỦ GỬI ở Đảo Poké Mart.',
          tip: 'Bắt đủ 151 loài là mục tiêu dài hơi nhất của game.' }
      ],
      task: { text: 'Bắt con Pokémon đầu tiên của bạn',
              done: function (g) { return g.sim.pokeCaught >= 1; } }
    },
    {
      id: 'pokework', on: 'firstPoke', prio: 0,
      title: 'Pokémon làm ruộng hộ bạn',
      pages: [
        { art: 'Magnetic',
          text: 'Đây là lý do bạn đi bắt chúng.' + BR +
                'Pokémon trong đội có thể làm việc đồng áng THAY BẠN — ' +
                'và việc đó KHÔNG TỐN THỂ LỰC của bạn một chút nào.',
          tip: 'Mở bảng POKÉMON, kéo xuống phần SAI VIỆC.' },
        { art: 'Water',
          text: 'HỆ quyết định làm được việc gì:' + NL +
                '• Nước / Băng → tưới cả đảo' + NL +
                '• Đất / Đá / Giác Đấu → cuốc đất, đập đá' + NL +
                '• Cỏ / Côn Trùng → thu hoạch, gieo hạt, bón phân' + NL +
                '• Siêu Linh / Điện / Thép → gom đồ rơi' + NL +
                '• Lửa → hun máy chế biến xong ngay' + NL +
                '• Bay / Rồng → bay giữa các đảo',
          tip: 'Một đội cân hệ làm được gần hết việc nhà nông trong một buổi.' },
        { art: 'AttendanceIcon',
          text: 'Mỗi con có SỨC LÀM mỗi ngày — thường 3 đến 6 lượt. ' +
                'Việc tác động cả đảo tốn 2, việc lớn tốn 3.' + BR +
                'Pokémon càng mạnh, càng quý bạn, càng lấp lánh thì sức làm càng nhiều. ' +
                'Huyền thoại được từ 10 trở lên.',
          tip: 'Sức làm hồi lại khi BẠN NGỦ, không phải lúc nửa đêm.' }
      ]
    },
    {
      id: 'pokestats', on: 'firstPokeSummary',
      title: 'Đọc chỉ số Pokémon',
      pages: [
        { text: 'Hai con cùng loài, cùng cấp, vẫn khác nhau. ' +
                'Bốn thứ tạo ra khác biệt đó:',
          tip: 'Tất cả đều được tính bằng đúng công thức thế hệ 3.' },
        { text: '• CÁ THỂ (IV) 0–31 mỗi chỉ số. Bẩm sinh, không đổi được.' + NL +
                '• NỖ LỰC (EV) 0–255 mỗi chỉ số, tổng tối đa 510. ' +
                'Tích luỹ khi đánh thắng.' + NL +
                '• TÍNH CÁCH tăng 10% một chỉ số và giảm 10% một chỉ số khác.' + NL +
                '• GIỚI TÍNH và LẤP LÁNH đọc ra từ cùng một con số ngẫu nhiên ' +
                'sinh ra cùng với nó.' },
        { art: 'ScholarIcon',
          text: 'Đảo Nghiên Cứu có máy soi được IV thật, máy luyện EV theo ý muốn, ' +
                'và bạc hà đổi tính cách.',
          tip: 'Lấp lánh chỉ khoảng 1/500 — thấy con nào ánh khác thường thì đừng bỏ qua.' }
      ]
    },
    {
      id: 'pokemart', on: 'island:pokemart',
      title: 'Đảo Poké Mart',
      who: 'Student1_Idle0',
      pages: [
        { art: 'DropBall_0',
          text: 'Bóng Thường rẻ. Bóng Lớn x1.5, Siêu Bóng x2.' + BR +
                'Có loại chuyên: Bóng Lưới ăn hệ Nước và Côn Trùng, ' +
                'Bóng Đêm ăn ban đêm, Bóng Nhanh chỉ mạnh ở lượt đầu.',
          tip: 'Ném Bóng Nhanh ngay lượt 1 là x4 — mạnh hơn cả Siêu Bóng.' },
        { text: 'TỦ GỬI để cất Pokémon vượt quá 6 con. ' +
                'ĐÁ HỒI SỨC bên cạnh chữa đầy máu miễn phí.' }
      ]
    },
    {
      id: 'firstFaint', on: 'pokeFaint',
      title: 'Pokémon gục',
      pages: [
        { text: 'Con gục không đánh và không làm việc được nữa.' + BR +
                'Chạm ĐÁ HỒI SỨC (ở Đảo Cỏ Xanh và Poké Mart) để chữa cả đội miễn phí, ' +
                'hoặc dùng thuốc Hồi Sinh.',
          tip: 'Ngủ một đêm cũng hồi, nhưng chỉ một phần.' }
      ]
    },
    {
      id: 'firstShiny', on: 'shiny',
      title: 'Con này lấp lánh!',
      pages: [
        { text: 'Bạn vừa gặp một Pokémon LẤP LÁNH — màu khác hẳn đồng loại, ' +
                'khoảng 1 trong 500 con.' + BR +
                'Nó được cộng thêm sức làm, và nó sẽ không quay lại nếu bạn bỏ chạy.',
          tip: 'Đừng đánh quá tay. Dùng quả bóng tốt nhất bạn có.' }
      ]
    },
    {
      id: 'lab', on: 'island:lab',
      title: 'Đảo Nghiên Cứu',
      who: 'Enginear_Idle0',
      pages: [
        { text: 'MÁY SOI đọc chính xác IV từng chỉ số.' + NL +
                'MÁY LUYỆN đổ EV vào chỉ số bạn chọn.' + NL +
                'BẠC HÀ đổi tính cách.' + NL +
                'NHÀ GỬI cho Pokémon lên cấp trong lúc bạn đi vắng.',
          tip: 'Đây là chỗ biến một con "được" thành một con "hoàn hảo".' }
      ]
    },

    // -------------------------------------------------------- the workaday
    {
      id: 'mine', on: 'island:mine',
      title: 'Đảo Mỏ',
      who: 'FoxNight_0',
      pages: [
        { art: 'MineGate',
          text: 'Miệng hang ăn xuống từng tầng. Đập đá lấy quặng, ' +
                'tìm THANG để xuống sâu hơn.' + BR +
                'Quặng là thứ duy nhất nâng cấp được dụng cụ và chế được vòi tưới.',
          tip: 'Không đào thì không có vòi tưới, và không có vòi tưới thì tưới tay cả đời.' }
      ]
    },
    {
      id: 'mineDepth', on: 'mineEnter',
      title: 'Dưới hầm mỏ',
      pages: [
        { art: 'Ladder',
          text: 'Tìm THANG để xuống tầng sâu hơn. Đá có quặng bên trong; ' +
                'đá thường thỉnh thoảng giấu đá quý.',
          tip: 'Càng sâu quặng càng quý — và quái đánh càng đau.' },
        { text: 'Hết MÁU là bạn tỉnh dậy ở nhà và mất một ít vàng.' + BR +
                'Cứ 5 tầng có một THANG MÁY — nó nhớ chỗ bạn đã tới, ' +
                'nên lần sau khỏi đi lại từ đầu.',
          tip: 'Ăn hồi THỂ LỰC, không hồi MÁU. Đừng nhầm hai thanh.' }
      ]
    },
    {
      id: 'machines', on: 'island:workshop',
      title: 'Đảo Xưởng',
      who: 'Crafter_0',
      pages: [
        { art: 'OvenEmpty',
          text: 'Máy biến nguyên liệu thô thành hàng đắt: sữa → phô mai, ' +
                'nho → rượu, quặng → thỏi.' + BR +
                'Bỏ đồ vào tối nay, sáng mai lấy ra.',
          tip: 'Hàng thủ công thường đáng giá gấp hai ba lần nguyên liệu.' },
        { text: 'BÀN CHẾ TẠO ở giữa đảo làm ra máy, vòi tưới, rương và bom ' +
                'từ gỗ, đá và quặng.' + BR +
                'Pokémon hệ Lửa "Ủ Lò" được — xong ngay mọi máy đang chạy, khỏi đợi qua đêm.' }
      ]
    },
    {
      id: 'machineTut', on: 'firstMachine',
      title: 'Đặt máy xuống',
      pages: [
        { art: 'OvenEmpty',
          text: 'Máy đặt được ở BẤT KỲ đảo nào bạn sở hữu, không riêng Đảo Xưởng.' + BR +
                'Mở túi, chạm cái máy, chọn "Đặt xuống trước mặt".',
          tip: 'Đặt máy vắt sữa ngay cạnh chuồng bò thì đỡ phải đi lại.' }
      ]
    },
    {
      id: 'sprinklerTut', on: 'sprinkler',
      title: 'Vòi tưới',
      pages: [
        { art: 'Plus_5x5',
          text: 'Đặt vòi vào GIỮA luống. Mỗi sáng nó tự tưới quanh mình ' +
                'trước khi bạn thức dậy.',
          tip: 'Vòi thường tưới hình chữ thập, Vòi Nông Trại 5x5, Siêu Vòi 7x7.' }
      ]
    },
    {
      id: 'cooking', on: 'island:tavern',
      title: 'Đảo Quán',
      who: 'CookingElf_0',
      pages: [
        { art: 'CheesePizza',
          text: 'Nấu ăn ở bếp. Món ăn hồi thể lực nhiều hơn nguyên liệu thô nhiều lần.',
          tip: 'Mang món NPC thích đi tặng — điểm thân thiết cao gấp mấy lần đồ thường.' },
        { text: 'Tối đến cả đảo kéo về đây. Muốn gặp ai mà ban ngày không thấy ' +
                'thì ghé quán lúc 7–10h tối.' }
      ]
    },
    {
      id: 'bundles', on: 'island:festival',
      title: 'Đảo Lễ Hội',
      who: 'Princess_Idle_0',
      pages: [
        { art: 'QuestFrame_OutLine_0_',
          text: 'BẢNG GÓI HÀNG cần bạn nộp đúng bộ nông sản, cá, khoáng. ' +
                'Xong mỗi gói là một phần thưởng lớn.',
          tip: 'Đừng bán sạch — giữ lại mỗi loại một món để nộp.' }
      ]
    },
    {
      id: 'museumIsl', on: 'island:museum',
      title: 'Đảo Bảo Tàng',
      who: 'MinotarusManager_Idle0',
      pages: [
        { text: 'Nộp khoáng vật và cổ vật cho Cụ Hiền. Mỗi món chỉ nộp được một lần.',
          tip: 'Cứ khoảng 15 hiện vật lại có một mốc thưởng lớn.' }
      ]
    },
    {
      id: 'greenhouseIsl', on: 'island:greenhouse',
      title: 'Đảo Vườn Kính',
      who: 'EppleElfIdle_0',
      pages: [
        { text: 'Trong kính KHÔNG CÓ MÙA. Trồng gì, lúc nào, cũng sống — ' +
                'và không chết khi sang mùa.',
          tip: 'Đây là chỗ trồng những thứ đắt nhất mà bình thường chỉ sống một mùa.' }
      ]
    },

    // ------------------------------------------------- the catch islands
    /* Each catch island gets ONE card and it is always the same shape: what
     * lives here, and what to bring. That is the only thing a player needs at
     * the moment they first walk into a new patch of grass, and repeating the
     * shape means they learn to expect it. */
    {
      id: 'jungleIsl', on: 'island:jungle',
      title: 'Đảo Rừng Rậm',
      pages: [
        { text: 'Cỏ ở đây nuôi hệ CÔN TRÙNG, CỎ và ĐỘC.' + BR +
                'Mang Pokémon hệ Lửa hoặc Bay là dễ thở nhất.',
          tip: 'Scyther và Pinsir hiếm, nhưng có thật. Chịu khó lội cỏ.' }
      ]
    },
    {
      id: 'rockyIsl', on: 'island:rocky',
      title: 'Đảo Hang Đá',
      pages: [
        { text: 'Hệ ĐÁ và ĐẤT. Hệ Đất MIỄN NHIỄM hoàn toàn với hệ Điện — ' +
                'Pikachu vô dụng ở đây.' + BR +
                'Mang hệ Nước, Cỏ hoặc Giác Đấu.',
          tip: 'Bọn này thủ cao và máu dày — nhớ mang bóng tốt.' }
      ]
    },
    {
      id: 'beachIsl', on: 'island:beach',
      title: 'Đảo Bãi Biển',
      pages: [
        { text: 'Hệ NƯỚC. Nước nông ở mép đảo lội được — ' +
                'Pokémon nước hay nấp ở đó.',
          tip: 'BÓNG LƯỚI ăn x3 với hệ Nước và Côn Trùng. Mua ở Poké Mart.' }
      ]
    },
    {
      id: 'volcanoIsl', on: 'island:volcano',
      title: 'Đảo Núi Lửa',
      pages: [
        { text: 'Hệ LỬA, và quặng tốt nhất quần đảo nằm trong đá ở đây.' + BR +
                'Đừng mang Pokémon hệ Cỏ hay Băng.',
          tip: 'Có tin đồn Moltres ngủ đâu đó trên này, và chỉ hiện ban ngày.' }
      ]
    },
    {
      id: 'frostIsl', on: 'island:frost',
      title: 'Đảo Băng',
      pages: [
        { text: 'Ở đây LUÔN là mùa Đông — cây mùa khác không sống được.' + BR +
                'Hệ BĂNG và NƯỚC.',
          tip: 'Articuno chỉ xuất hiện ban đêm. Mang đủ bóng cho một đêm dài.' }
      ]
    },
    {
      id: 'ruinsIsl', on: 'island:ruins',
      title: 'Đảo Cổ',
      pages: [
        { text: 'Hệ MA và SIÊU LINH. Hệ Thường đánh hệ Ma KHÔNG ăn thua gì cả.' + BR +
                'Hoá thạch đào được ở đây nộp cho bảo tàng.',
          tip: 'Có thứ rất mạnh thức giấc ở đây vào ban đêm.' }
      ]
    },
    {
      id: 'sanctuaryIsl', on: 'island:sanctuary',
      title: 'Đảo Thánh Địa',
      pages: [
        { text: 'Không ai săn ở đây, nên những loài hiếm nhất chọn nơi này để ngủ: ' +
                'Chansey, Ditto, Porygon, Snorlax.',
          tip: 'Và một loài mà hầu như không ai từng thấy.' }
      ]
    },
    {
      id: 'skyIsl', on: 'island:sky',
      title: 'Đảo Trên Mây',
      pages: [
        { text: 'Hệ BAY. Gió mạnh, tầm nhìn xa, và Zapdos ở đâu đó trên này.',
          tip: 'Hệ Đá đánh hệ Bay rất mạnh — mang một con theo.' }
      ]
    },
    {
      id: 'dragonIsl', on: 'island:dragon',
      title: 'Đảo Rồng',
      pages: [
        { text: 'Hòn cuối cùng. Mọi thứ ở đây đều trên cấp 40.' + BR +
                'Hệ RỒNG chỉ sợ hệ Băng và chính hệ Rồng.',
          tip: 'Đừng xuống đây với đội dưới cấp 40. Thật đấy.' }
      ]
    },

    // ------------------------------------------------------------- nudges
    {
      id: 'buyIsland', on: 'canBuy', prio: 1,
      title: 'Mua đảo mới',
      pages: [
        { art: 'MiniHarbor',
          text: 'Bạn đã đủ cấp và đủ vàng để mua thêm một hòn đảo.' + BR +
                'Mở BẢN ĐỒ, chọn hòn đang viền vàng, bấm MUA. Cầu sẽ tự nối sang.',
          tip: 'Mua rồi thì đảo đó là của bạn vĩnh viễn.' }
      ]
    },
    {
      id: 'rankUp', on: 'rankUp', when: function (g) { return g.sim.rank === 2; },
      title: 'Lên cấp Đảo Trưởng',
      pages: [
        { art: 'LevelUpArrow',
          text: 'Cấp Đảo Trưởng lên khi bạn làm bất cứ việc gì có ích. ' +
                'Nó là điều kiện để mua đảo mới.',
          tip: 'Bán hàng, giao đơn, bắt Pokémon, đào quặng — tất cả đều tính.' }
      ]
    },
    {
      id: 'lowEnergy', on: 'lowEnergy',
      title: 'Sắp kiệt sức',
      pages: [
        { text: 'Thể lực còn dưới một phần tư.' + BR +
                'Ăn gì đó trong túi, hoặc về ngủ. Làm tới lúc bằng 0 là bạn ngất, ' +
                'và sáng mai chỉ hồi được một nửa.',
          tip: 'Sai Pokémon làm việc thay — việc của chúng không tốn thể lực của bạn.' }
      ]
    },
    {
      id: 'bagFull', on: 'bagFull',
      title: 'Túi đầy',
      pages: [
        { text: 'Túi hết chỗ. Bỏ bớt vào RƯƠNG ở Đảo Nhà, ' +
                'hoặc bỏ vào hòm giao hàng để bán.',
          tip: 'Sạp Tạp Hoá bán túi lớn hơn: 24 ô rồi 36 ô.' }
      ]
    },
    {
      id: 'seasonEnd', on: 'seasonEnd',
      title: 'Sắp sang mùa',
      pages: [
        { text: 'Còn ít ngày là hết mùa. Cây trái mùa còn dở sẽ CHẾT SẠCH ' +
                'vào đêm chuyển mùa.',
          tip: 'Thu hoạch hết, và đừng gieo thêm thứ không kịp chín.' }
      ]
    },
    {
      id: 'night', on: 'nightLate',
      title: 'Đã khuya',
      pages: [
        { text: 'Hơn 12h đêm rồi. Đến 2h sáng bạn sẽ ngất tại chỗ ' +
                'và mất một phần thể lực của ngày mai.',
          tip: 'Về giường ở Đảo Nhà. Pokémon hệ Siêu Linh dịch chuyển bạn về ngay.' }
      ]
    }
  ];

  var BY_ID = {};
  STEPS.forEach(function (s) { BY_ID[s.id] = s; });

  global.ISL_TUTORIAL_DATA = { STEPS: STEPS, byId: function (id) { return BY_ID[id]; } };
})(window);
