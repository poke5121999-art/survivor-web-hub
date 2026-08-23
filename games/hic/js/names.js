/* Tên và chữ mô tả tiếng Việt cho toàn bộ vật phẩm, quái, lưỡi mài và bộ đồ.
 *
 * WHY: cả ván chơi là đọc chữ trên món đồ rồi quyết định lắp hay bỏ. Để nguyên
 * tiếng Anh thì người chơi không đọc kịp, mà không đọc kịp thì không có chiến thuật.
 * ROOT-CAUSE: bảng dữ liệu gốc là tiếng Anh và phải giữ nguyên để đối chiếu, nên
 * bản dịch phải nằm tách ra một chỗ, tra theo tên gốc.
 *
 * Bản mạ vàng / kim cương KHÔNG cần dòng riêng: chúng lấy tên và chữ của món
 * gốc rồi nhân số lên, đúng như cách bảng hiệu ứng tra tên.
 */
(function (global) {
  'use strict';

  var creature = {
    'Bat Level 1': 'Dơi', 'Bat Level 2': 'Dơi lớn', 'Bat Level 3': 'Dơi khổng lồ',
    'Bear Level 1': 'Gấu', 'Bear Level 2': 'Gấu lớn', 'Bear Level 3': 'Gấu già',
    'Bearserker': 'Gấu Cuồng Sát',
    'Black Knight': 'Hắc Kỵ Sĩ',
    'Bloodmoon Werewolf': 'Người Sói Trăng Máu',
    'Brittlebark Beast': 'Quái Vỏ Giòn',
    'Crazed Honeybear Level 2': 'Gấu Mật Điên', 'Crazed Honeybear Level 3': 'Gấu Mật Cuồng',
    'Gentle Giant': 'Người Khổng Lồ Hiền',
    'Granite Griffin': 'Sư Điểu Đá Hoa',
    'Hedgehog Level 1': 'Nhím', 'Hedgehog Level 2': 'Nhím lớn', 'Hedgehog Level 3': 'Nhím già',
    'Hothead': 'Gã Nóng Đầu',
    'Ironstone Golem': 'Golem Thiết Thạch',
    'Leshen': 'Leshen',
    'Mountain Troll': 'Quỷ Núi',
    'Raven Level 2': 'Quạ Trộm',
    'Razortusk Hog': 'Lợn Nanh Cạo',
    'Redwood Treant': 'Thần Mộc Hồng Sam',
    'Spider Level 1': 'Nhện', 'Spider Level 2': 'Nhện lớn', 'Spider Level 3': 'Nhện chúa',
    'Stormcloud Druid': 'Đức Sĩ Mây Giông',
    'Wolf Level 1': 'Sói', 'Wolf Level 2': 'Sói lớn', 'Wolf Level 3': 'Sói đầu đàn',
    'Woodland Abomination': 'Thứ Trong Rừng'
  };

  var creatureText = {
    'Bat Level 1': 'Cách một nhát đánh lại hút 1 máu.',
    'Bat Level 2': 'Cách một nhát đánh lại hút 2 máu.',
    'Bat Level 3': 'Cách một nhát đánh lại hút 3 máu.',
    'Bear Level 1': 'Gây thêm 3 sát thương khi bạn còn giáp.',
    'Bear Level 2': 'Gây thêm 5 sát thương khi bạn còn giáp.',
    'Bear Level 3': 'Gây thêm 7 sát thương khi bạn còn giáp.',
    'Bearserker': 'Đòn đánh bỏ qua giáp.',
    'Black Knight': 'Vào trận: cộng công bằng đúng công của bạn.',
    'Bloodmoon Werewolf': 'Đầu lượt: nếu bạn dưới 50% máu, kết liễu ngay.',
    'Brittlebark Beast': 'Mỗi lần trúng đòn, nó chịu thêm 3 sát thương.',
    'Crazed Honeybear Level 2': 'Gây thêm 4 sát thương khi bạn còn giáp.',
    'Crazed Honeybear Level 3': 'Gây thêm 5 sát thương khi bạn còn giáp.',
    'Gentle Giant': 'Mỗi lần trúng đòn được 2 gai; dưới nửa máu thì 4 gai.',
    'Granite Griffin': 'Dưới nửa máu: được 30 giáp và tự choáng 2 lượt.',
    'Hedgehog Level 1': 'Vào trận: được 3 gai.',
    'Hedgehog Level 2': 'Vào trận: được 4 gai.',
    'Hedgehog Level 3': 'Vào trận: được 5 gai.',
    'Hothead': 'Nếu nhanh hơn bạn, nhát đầu tiên gây thêm 10 sát thương.',
    'Ironstone Golem': 'Mất sạch giáp: giảm 3 công.',
    'Leshen': 'Không có gì đặc biệt. Chỉ là nó rất khoẻ.',
    'Mountain Troll': 'Chỉ đánh cách lượt.',
    'Raven Level 2': 'Đòn đánh cướp vàng thay vì gây sát thương.',
    'Razortusk Hog': 'Nếu vào trận nhanh hơn bạn, mỗi lượt đánh thêm một nhát.',
    'Redwood Treant': 'Công của nó bị giảm nửa khi đánh vào giáp.',
    'Spider Level 1': 'Vào trận: nếu nhanh hơn bạn, gây 3 sát thương.',
    'Spider Level 2': 'Vào trận: nếu nhanh hơn bạn, gây 4 sát thương.',
    'Spider Level 3': 'Vào trận: nếu nhanh hơn bạn, gây 5 sát thương.',
    'Stormcloud Druid': 'Nếu trúng đòn hơn một lần trong cùng lượt, nó làm bạn choáng 1 lượt.',
    'Wolf Level 1': 'Bạn còn 5 máu trở xuống thì nó cộng 2 công.',
    'Wolf Level 2': 'Bạn còn 5 máu trở xuống thì nó cộng 3 công.',
    'Wolf Level 3': 'Bạn còn 5 máu trở xuống thì nó cộng 4 công.',
    'Woodland Abomination': 'Mỗi lượt cộng 1 công, mãi mãi. Không ai giết được nó — chỉ là sống được bao lâu.'
  };

  var item = {
    'Assault Greaves': 'Giày Xung Kích', 'Battle Axe': 'Rìu Chiến',
    'Bearclaw Blade': 'Kiếm Vuốt Gấu', 'Bejeweled Blade': 'Kiếm Nạm Ngọc',
    'Blackbriar Blade': 'Kiếm Gai Đen', 'Blacksmith Bond': 'Khế Ước Thợ Rèn',
    'Blood Bond': 'Khế Ước Máu', 'Bloodmoon Ritual': 'Nghi Lễ Trăng Máu',
    'Bloodthief Needle': 'Kim Đoạt Huyết', 'Bloody Steak': 'Bít Tết Tái',
    'Bonespine Whip': 'Roi Xương Sống', 'Boots of the Hero': 'Giày Anh Hùng',
    'Boss Contract': 'Hợp Đồng Săn Trùm', 'Bramble Buckler': 'Khiên Bụi Gai',
    'Briar Rose': 'Hoa Hồng Gai', 'Brittlebark Armor': 'Giáp Vỏ Giòn',
    'Brittlebark Bow': 'Cung Vỏ Giòn', 'Brittlebark Buckler': 'Khiên Vỏ Giòn',
    'Brittlebark Club': 'Chuỳ Vỏ Giòn', 'Chain Mail': 'Áo Giáp Xích',
    'Charcoal Roast': 'Món Nướng Than', 'Cherry Bomb': 'Bom Anh Đào',
    'Cherry Cocktail': 'Cốc Anh Đào', 'Citrine Earring': 'Khuyên Hoàng Ngọc',
    'Citrine Gemstone': 'Đá Hoàng Ngọc', 'Citrine Ring': 'Nhẫn Hoàng Ngọc',
    'Cracked Bouldershield': 'Khiên Đá Nứt', 'Cracked Whetstone': 'Đá Mài Nứt',
    'Crimson Cloak': 'Áo Choàng Đỏ Thẫm', 'Double-edged Sword': 'Kiếm Hai Lưỡi',
    'Double-plated Armor': 'Giáp Hai Lớp', 'Elderwood Necklace': 'Vòng Cổ Cổ Mộc',
    'Elderwood Staff': 'Trượng Cổ Mộc', 'Emerald Crown': 'Vương Miện Lục Bảo',
    'Emerald Earring': 'Khuyên Lục Bảo', 'Emerald Gemstone': 'Đá Lục Bảo',
    'Emerald Ring': 'Nhẫn Lục Bảo', 'Emergency Shield': 'Khiên Cấp Cứu',
    'Energy Crystal': 'Tinh Thể Năng Lượng', 'Explosive Surprise': 'Món Quà Nổ',
    'Explosive Sword': 'Kiếm Nổ', 'Featherweight Blade': 'Kiếm Nhẹ Tựa Lông',
    'Featherweight Coat': 'Áo Nhẹ Tựa Lông', 'Firecracker Belt': 'Đai Pháo',
    'Fortified Gauntlet': 'Găng Kiên Cố', 'Gemstone Scepter': 'Quyền Trượng Bảo Thạch',
    'Gold Ring': 'Nhẫn Vàng', 'Granite Cherry': 'Anh Đào Đá Hoa',
    'Granite Gauntlet': 'Găng Đá Hoa', 'Granite Hammer': 'Búa Đá Hoa',
    'Grindstone Club': 'Chuỳ Đá Mài', 'Haymaker': 'Cú Móc Hàm',
    'Heart Drinker': 'Kiếm Uống Tim', 'Heart-shaped Acorn': 'Hạt Sồi Hình Tim',
    'Heart-shaped Potion': 'Lọ Thuốc Hình Tim', 'Hidden Dagger': 'Dao Giấu',
    'Honey Ham': 'Giăm Bông Mật Ong', 'Honeycomb': 'Tảng Sáp Ong',
    'Hook Blade': 'Kiếm Móc', 'Horned Helmet': 'Mũ Sừng',
    'Impressive Physique': 'Thân Hình Đáng Nể', 'Iron Rose': 'Hoa Hồng Sắt',
    'Iron Transfusion': 'Truyền Sắt', 'Ironskin Potion': 'Thuốc Da Sắt',
    'Ironstone Greatsword': 'Đại Kiếm Thiết Thạch', 'Ironstone Sandals': 'Dép Thiết Thạch',
    'Leather Boots': 'Giày Da', 'Leather Glove': 'Găng Da', 'Leather Vest': 'Áo Da',
    'Lifeblood Burst': 'Vỡ Huyết Mạch', 'Lifesteal Scythe': 'Lưỡi Hái Hút Máu',
    'Lifethread Pendant': 'Bùa Chỉ Mệnh', 'Marble Mirror': 'Gương Cẩm Thạch',
    'Melting Iceblade': 'Kiếm Băng Tan', 'Mortal Edge': 'Lưỡi Tử Vong',
    'Oak Heart': 'Tim Sồi', 'Ore Heart': 'Tim Quặng',
    'Petrifying Flask': 'Lọ Hoá Đá', 'Pinecone Plate': 'Giáp Quả Thông',
    'Plated Greaves': 'Giày Giáp Tấm', 'Plated Helmet': 'Mũ Giáp Tấm',
    'Protecting Charm': 'Bùa Che Chở', 'Rabbit Doll': 'Búp Bê Thỏ',
    'Razor Scales': 'Vảy Dao Cạo', 'Razorvine Talisman': 'Bùa Dây Gai',
    'Redwood Cloak': 'Áo Choàng Hồng Sam', 'Redwood Helmet': 'Mũ Hồng Sam',
    'Redwood Roast': 'Món Nướng Hồng Sam', 'Redwood Rod': 'Gậy Hồng Sam',
    'Rock Roast': 'Món Nướng Đá', 'Ruby Crown': 'Vương Miện Hồng Ngọc',
    'Ruby Earring': 'Khuyên Hồng Ngọc', 'Ruby Gemstone': 'Đá Hồng Ngọc',
    'Ruby Ring': 'Nhẫn Hồng Ngọc', 'Saffron Feather': 'Lông Nghệ Tây',
    'Sanguine Rose': 'Hoa Hồng Huyết', 'Sapphire Crown': 'Vương Miện Lam Ngọc',
    'Sapphire Earring': 'Khuyên Lam Ngọc', 'Sapphire Gemstone': 'Đá Lam Ngọc',
    'Sapphire Ring': 'Nhẫn Lam Ngọc', 'Shield Talisman': 'Bùa Khiên',
    'Shield of the Hero': 'Khiên Anh Hùng', 'Spearshield Lance': 'Thương Khiên',
    'Steelbond Curse': 'Lời Nguyền Trói Thép', 'Sticky Web': 'Mạng Nhện Dính',
    'Stone Steak': 'Bít Tết Đá', 'Stoneslab Sword': 'Kiếm Phiến Đá',
    'Stormcloud Spear': 'Thương Mây Giông', 'Sugar Bomb': 'Bom Đường',
    'Swiftstrike Cloak': 'Áo Choàng Thần Tốc', 'Swiftstrike Gauntlet': 'Găng Thần Tốc',
    'Swiftstrike Rapier': 'Kiếm Mỏng Thần Tốc', 'Sword Talisman': 'Bùa Kiếm',
    'Sword of the Hero': 'Kiếm Anh Hùng', 'Tempest Blade': 'Kiếm Bão',
    'Tempest Plate': 'Giáp Bão', 'Thorn Ring': 'Nhẫn Gai',
    'Time Bomb': 'Bom Hẹn Giờ', 'Tree Sap': 'Nhựa Cây',
    'Vampiric Wine': 'Rượu Ma Cà Rồng', 'Weighted Bracelet': 'Vòng Tạ',
    "Woodcutter's Axe": 'Rìu Tiều Phu', 'Wooden Stick': 'Gậy Gỗ'
  };

  /* Chữ mô tả. `{n}` là chỗ nhân theo bản mạ vàng / kim cương. */
  var itemText = {
    'Assault Greaves': 'Mỗi lần bạn trúng đòn, gây 1 sát thương.',
    'Battle Axe': 'Gây gấp đôi sát thương lên giáp.',
    'Bearclaw Blade': 'Công luôn bằng số máu đang thiếu.',
    'Bejeweled Blade': 'Cộng 2 công cho mỗi món trang sức đang đeo.',
    'Blackbriar Blade': 'Cộng 2 công cho mỗi điểm gai.',
    'Blacksmith Bond': '"Mất sạch giáp" được kích thêm 1 lần nữa.',
    'Blood Bond': 'Khi địch mất 50% máu, kích toàn bộ hiệu ứng "dưới nửa máu" của bạn.',
    'Bloodmoon Ritual': 'Dưới nửa máu: được 10 gai và chịu 2 sát thương.',
    'Bloodthief Needle': 'Mở màn: nếu nhanh hơn địch, cướp 5 máu tối đa của nó.',
    'Bloody Steak': 'Dưới nửa máu: được giáp bằng 50% máu tối đa.',
    'Bonespine Whip': 'Mỗi lượt đánh thêm hai nhát, mỗi nhát luôn 1 sát thương.',
    'Boss Contract': 'Hạ một con trùm thì được 15 vàng.',
    'Bramble Buckler': 'Đầu lượt: đổi 1 giáp lấy 2 gai.',
    'Briar Rose': 'Mỗi lần hồi máu, được 2 gai.',
    'Brittlebark Armor': 'Mỗi lần trúng đòn, chịu thêm 1 sát thương.',
    'Brittlebark Bow': 'Sau 3 nhát đánh, mất 2 công.',
    'Brittlebark Buckler': 'Mất sạch giáp sau nhát đánh đầu tiên của địch.',
    'Brittlebark Club': 'Mất sạch giáp & dưới nửa máu: mất 2 công.',
    'Chain Mail': 'Dưới nửa máu: được giáp bằng giáp gốc của bạn.',
    'Charcoal Roast': 'Vào trận: nếu máu không đầy, gây 4 sát thương.',
    'Cherry Bomb': 'Vào trận: gây {2} sát thương.',
    'Cherry Cocktail': 'Vào trận & dưới nửa máu: gây 3 sát thương và hồi 3 máu.',
    'Citrine Earring': 'Cách một lượt lại được {1} tốc.',
    'Citrine Gemstone': 'Tốc độ của bạn bị đảo dấu.',
    'Citrine Ring': 'Vào trận: gây sát thương bằng tốc độ của bạn.',
    'Cracked Bouldershield': 'Mất sạch giáp: được {5} giáp.',
    'Cracked Whetstone': 'Lượt đầu: được {2} công.',
    'Crimson Cloak': 'Mỗi lần trúng đòn, hồi 1 máu.',
    'Double-edged Sword': 'Khi đánh trúng: chịu 1 sát thương.',
    'Double-plated Armor': 'Mất sạch giáp: được {3} giáp.',
    'Elderwood Necklace': '', 'Elderwood Staff': '',
    'Emerald Crown': '',
    'Emerald Earring': 'Cách một lượt lại hồi {1} máu.',
    'Emerald Gemstone': 'Phần hồi máu thừa được ném thẳng vào địch.',
    'Emerald Ring': 'Vào trận: hồi {2} máu.',
    'Emergency Shield': 'Mở màn: nếu chậm hơn địch, được {4} giáp.',
    'Energy Crystal': 'Mở màn: nếu nhanh hơn địch, mất 2 tốc và kích lại toàn bộ hiệu ứng mở màn.',
    'Explosive Surprise': 'Mất sạch giáp: gây 5 sát thương.',
    'Explosive Sword': 'Mất sạch giáp & dưới nửa máu: gây 3 sát thương.',
    'Featherweight Blade': '',
    'Featherweight Coat': 'Vào trận: đổi 1 giáp lấy 3 tốc.',
    'Firecracker Belt': 'Mất sạch giáp: gây 1 sát thương {3} lần.',
    'Fortified Gauntlet': 'Đầu lượt: nếu còn giáp, được thêm 1 giáp.',
    'Gemstone Scepter': 'Hút sức mạnh từ đá lục bảo, hồng ngọc, lam ngọc và hoàng ngọc bạn đang đeo.',
    'Gold Ring': 'Vào trận: được 1 vàng.',
    'Granite Cherry': 'Vào trận: được 6 giáp. Mất sạch giáp: gây 6 sát thương.',
    'Granite Gauntlet': 'Vào trận: được {5} giáp.',
    'Granite Hammer': 'Khi đánh trúng: đổi 1 giáp lấy 2 công.',
    'Grindstone Club': 'Vũ khí tiếp theo bạn lắp được cộng 2 công vĩnh viễn.',
    'Haymaker': 'Cứ 3 nhát đánh lại có một nhát gấp ba sát thương.',
    'Heart Drinker': 'Khi đánh trúng: hồi 1 máu.',
    'Heart-shaped Acorn': 'Vào trận: nếu giáp gốc bằng 0, hồi đầy máu.',
    'Heart-shaped Potion': 'Lần đầu tiên bị đánh còn đúng 1 máu, hồi đầy máu.',
    'Hidden Dagger': 'Càng nhặt được nhiều Dao Giấu thì nó càng mạnh.',
    'Honey Ham': 'Nhân đôi máu tối đa.',
    'Honeycomb': '',
    'Hook Blade': 'Mỗi lần bạn phá giáp địch, được đúng ngần ấy giáp.',
    'Horned Helmet': 'Vào trận: được {2} gai.',
    'Impressive Physique': 'Mất sạch giáp: làm địch choáng 1 lượt.',
    'Iron Rose': 'Mỗi lần hồi máu, được 1 giáp.',
    'Iron Transfusion': 'Đầu lượt: được 2 giáp và mất 1 máu.',
    'Ironskin Potion': 'Vào trận: được giáp bằng số máu đang thiếu.',
    'Ironstone Greatsword': '',
    'Ironstone Sandals': 'Khi còn giáp thì được 3 công.',
    'Leather Boots': 'Nếu nhanh hơn địch, được 2 công.',
    'Leather Glove': '', 'Leather Vest': '',
    'Lifeblood Burst': 'Dưới nửa máu: gây sát thương bằng 50% máu tối đa của bạn.',
    'Lifesteal Scythe': 'Khi đánh trúng: hồi máu bằng đúng phần sát thương vào máu địch.',
    'Lifethread Pendant': 'Đòn chí mạng: 50% cơ hội sống sót với 1 máu.',
    'Marble Mirror': 'Vào trận: được giáp bằng giáp của địch.',
    'Melting Iceblade': 'Khi đánh trúng: mất 1 công.',
    'Mortal Edge': 'Dưới nửa máu: được 5 công và chịu 2 sát thương.',
    'Oak Heart': 'Cộng 2 máu cho mỗi món gỗ đang đeo.',
    'Ore Heart': 'Vào trận: được 2 giáp cho mỗi món đá đang đeo.',
    'Petrifying Flask': 'Dưới nửa máu: được {10} giáp và tự choáng {2} lượt.',
    'Pinecone Plate': 'Vào trận: nếu máu đầy, mỗi đầu lượt được 1 gai tới hết trận.',
    'Plated Greaves': 'Mất sạch giáp: đổi 3 tốc lấy 9 giáp.',
    'Plated Helmet': 'Đầu lượt: nếu dưới 50% máu, được 2 giáp.',
    'Protecting Charm': 'Nhát đánh đầu tiên của địch bị giảm nửa sát thương.',
    'Rabbit Doll': 'Dưới nửa máu: kích lại toàn bộ hiệu ứng mở màn.',
    'Razor Scales': 'Sau khi mất sạch giáp: mỗi điểm giáp bị phá đều gây sát thương ngược lại.',
    'Razorvine Talisman': 'Mỗi lần được gai, được thêm 1 gai.',
    'Redwood Cloak': 'Vào trận: nếu máu không đầy, hồi {1} máu.',
    'Redwood Helmet': 'Mất sạch giáp: hồi {3} máu.',
    'Redwood Roast': '', 'Redwood Rod': '', 'Rock Roast': '', 'Ruby Crown': '',
    'Ruby Earring': 'Cách một lượt lại gây {1} sát thương.',
    'Ruby Gemstone': 'Nếu công của bạn đúng bằng 1, mỗi đòn đánh gây thêm 4 sát thương.',
    'Ruby Ring': 'Vào trận: được {1} công và chịu {2} sát thương.',
    'Saffron Feather': 'Đầu lượt: đổi {1} tốc lấy {1} máu.',
    'Sanguine Rose': 'Mỗi lần hồi máu, hồi thêm 1 máu.',
    'Sapphire Crown': '',
    'Sapphire Earring': 'Cách một lượt lại được {1} giáp.',
    'Sapphire Gemstone': 'Mỗi lần mất giáp, hồi đúng ngần ấy máu.',
    'Sapphire Ring': 'Vào trận: cướp {2} giáp của địch.',
    'Shield Talisman': 'Mỗi lần được giáp, được thêm 1 giáp.',
    'Shield of the Hero': '', 'Spearshield Lance': '',
    'Steelbond Curse': 'Vào trận: cho địch 8 giáp.',
    'Sticky Web': 'Mở màn: nếu chậm hơn địch, làm địch choáng 1 lượt.',
    'Stone Steak': 'Vào trận: nếu máu đầy, được 5 giáp.',
    'Stoneslab Sword': 'Khi đánh trúng: được 2 giáp.',
    'Stormcloud Spear': 'Cứ 5 nhát đánh: làm địch choáng 2 lượt.',
    'Sugar Bomb': 'Đầu lượt: gây 2 sát thương.',
    'Swiftstrike Cloak': 'Mở màn: nếu tốc của bạn gấp đôi địch trở lên, lượt sau đánh thêm một nhát.',
    'Swiftstrike Gauntlet': 'Dưới nửa máu: lượt sau đánh thêm một nhát.',
    'Swiftstrike Rapier': 'Mở màn: nếu nhanh hơn địch, lượt sau đánh thêm hai nhát.',
    'Sword Talisman': 'Mọi sát thương không phải đòn đánh của bạn đều cộng thêm 1.',
    'Sword of the Hero': '',
    'Tempest Blade': 'Công luôn bằng tốc độ.',
    'Tempest Plate': 'Mất sạch giáp: được tốc bằng giáp gốc.',
    'Thorn Ring': 'Vào trận: được 6 gai.',
    'Time Bomb': 'Sau 5 lượt: gây 15 sát thương.',
    'Tree Sap': 'Dưới nửa máu: hồi 1 máu, sáu lần.',
    'Vampiric Wine': 'Dưới nửa máu: hồi {4} máu.',
    'Weighted Bracelet': '',
    "Woodcutter's Axe": 'Cộng 2 công cho mỗi ô đồ còn trống.',
    'Wooden Stick': ''
  };

  var edge = {
    'Agile Edge': 'Lưỡi Nhanh Nhẹn', 'Bleeding Edge': 'Lưỡi Rỉ Máu',
    'Blunt Edge': 'Lưỡi Cùn', 'Cutting Edge': 'Lưỡi Sắc',
    'Featherweight Edge': 'Lưỡi Nhẹ', 'Jagged Edge': 'Lưỡi Răng Cưa',
    'Lightning Edge': 'Lưỡi Sét', 'Thieving Edge': 'Lưỡi Trộm',
    "Titan's Edge": 'Lưỡi Thần Khổng Lồ'
  };
  var edgeText = {
    'Agile Edge': 'Lượt đầu đánh thêm một nhát.',
    'Bleeding Edge': 'Khi đánh trúng: hồi 1 máu.',
    'Blunt Edge': 'Khi đánh trúng: được 1 giáp.',
    'Cutting Edge': 'Khi đánh trúng: gây thêm 1 sát thương.',
    'Featherweight Edge': 'Khi đánh trúng: đổi 1 tốc lấy 1 công.',
    'Jagged Edge': 'Khi đánh trúng: được 2 gai và chịu 1 sát thương.',
    'Lightning Edge': 'Vào trận: làm địch choáng 1 lượt.',
    'Thieving Edge': 'Khi đánh trúng: nếu có dưới 10 vàng, được 1 vàng.',
    "Titan's Edge": 'Chỉ đánh cách lượt, nhưng gấp đôi sát thương.'
  };

  var oil = { 'Armor Oil': 'Dầu Giáp', 'Attack Oil': 'Dầu Công', 'Speed Oil': 'Dầu Tốc' };

  var set = {
    'Briar Greaves': 'Bộ Giày Bụi Gai', 'Elderwood Mask': 'Bộ Mặt Nạ Cổ Mộc',
    "Hero's Return": 'Bộ Anh Hùng Trở Về', 'Raw Hide': 'Bộ Da Sống',
    'Redwood Crown': 'Bộ Vương Miện Hồng Sam', 'Stone Scales': 'Bộ Vảy Đá'
  };
  var setText = {
    'Briar Greaves': 'Mỗi lần trúng đòn, được 1 gai.',
    'Elderwood Mask': 'Vào trận: nếu công, giáp và tốc gốc bằng nhau, cộng thêm đúng ngần ấy mỗi loại.',
    "Hero's Return": '+1 công, +1 giáp, +1 tốc.',
    'Raw Hide': 'Cách một lượt lại được 1 công.',
    'Redwood Crown': 'Dưới nửa máu: hồi đầy máu.',
    'Stone Scales': 'Dưới nửa máu: được 10 giáp.'
  };

  function strip(n) {
    if (n.indexOf('Golden ') === 0) return { base: n.slice(7), pre: 'Mạ Vàng ', m: 2 };
    if (n.indexOf('Diamond ') === 0) return { base: n.slice(8), pre: 'Kim Cương ', m: 4 };
    return { base: n, pre: '', m: 1 };
  }

  global.HIC_vnName = function (name) {
    var s = strip(name);
    var vn = item[s.base] || creature[s.base] || edge[s.base] || oil[s.base] || set[s.base];
    return s.pre + (vn || s.base);
  };

  /* Chữ mô tả, đã nhân theo bản mạ vàng / kim cương. */
  global.HIC_vnEffect = function (name, kind) {
    var s = strip(name);
    var table = kind === 'creature' ? creatureText
      : kind === 'edge' ? edgeText
        : kind === 'set' ? setText : itemText;
    var t = table[s.base];
    if (t == null) return '';
    return t.replace(/\{(\d+)\}/g, function (_, d) { return String(parseInt(d, 10) * s.m); });
  };

  /* Cẩm nang: mỗi loại địa điểm trên bản đồ là gì, cho gì, và có mất đi không.
     WHY: người chơi mở bản đồ ra thấy mười hai loại ô khác nhau và không có chỗ
     nào tra được chúng là gì. Một cơ chế không tra được thì bằng không có. */
  global.HIC_PLACE_INFO = {
    chest: { name: 'Rương gỗ', icon: 'chest',
      what: 'Ba món đồ thường, chọn lấy một.',
      gone: 'Mở ra là hết — mở chính là lấy.' },
    jewelrybox: { name: 'Hộp trang sức', icon: 'jewel',
      what: 'Ba món trang sức, chọn lấy một. Nhẫn, khuyên, vương miện, đá quý.',
      gone: 'Mở ra là hết.' },
    grave: { name: 'Nấm mồ', icon: 'grave',
      what: 'Ba món cấp anh hùng — thứ mạnh nhất nhặt được ngoài đường.',
      gone: 'Mở ra là hết.' },
    anvil: { name: 'Đe rèn', icon: 'anvil',
      what: 'Mài một lưỡi lên vũ khí: thêm một hiệu ứng nổ mỗi khi bạn đánh trúng. Chỉ giữ được một lưỡi.',
      gone: 'Mài rồi mới mất; xem mà không mài thì vẫn còn đó.' },
    oil: { name: 'Lọ dầu', icon: 'oil',
      what: 'Bôi lên vũ khí, cộng thẳng một điểm công, giáp hoặc tốc. Tối đa ba lọ.',
      gone: 'Bôi rồi mới mất.' },
    merchant: { name: 'Lái buôn', icon: 'merchant',
      what: 'Ba món hiếm bán lấy vàng. Vàng kiếm được từ việc giết quái.',
      gone: 'Chỉ đi khi bán được hàng — chưa đủ tiền thì quay lại sau.' },
    campfire: { name: 'Đống lửa', icon: 'fire',
      what: 'Nghỉ để hồi 10 máu.',
      gone: 'Nghỉ thì đẩy thẳng tới sáng hôm sau — mất phần thời gian còn lại của hôm nay.' },
    house: { name: 'Căn nhà', icon: 'house',
      what: 'Ngủ một giấc, máu đầy lại.',
      gone: 'Cũng đẩy tới sáng hôm sau như đống lửa.' },
    golem: { name: 'Golem thợ rèn', icon: 'golem',
      what: 'Ghép hai món GIỐNG HỆT nhau thành bản mạ vàng (hiệu ứng nhân đôi). Hai bản mạ vàng thành kim cương (nhân bốn).',
      gone: 'Ghép rồi mới mất. Ghép xong hai ô đồ dồn lại còn một.' },
    cauldron: { name: 'Vạc nấu', icon: 'cauldron',
      what: 'Nấu hai món ăn thành một món mới mạnh hơn cả hai.',
      gone: 'Nấu rồi mới mất.' },
    tower: { name: 'Chòi canh', icon: 'tower',
      what: 'Leo lên là thấy toàn bộ vùng này — biết luôn chỗ nào có gì.',
      gone: 'Leo một lần là hết.' },
    well: { name: 'Giếng ước', icon: 'well',
      what: 'Thả 20 vàng xuống để đổi lấy một món hiếm, hoặc 5 lượt đổi hàng ở lái buôn.',
      gone: 'Ước rồi mới mất.' }
  };

  global.HIC_TERRAIN_INFO = [
    { ground: 'grass', overlay: null, name: 'Cỏ', what: 'Đi qua được.' },
    { ground: 'dirt', overlay: null, name: 'Đất trống', what: 'Đi qua được.' },
    { ground: 'grass', overlay: 'tree', name: 'Cây', what: 'Chặn đường.' },
    { ground: 'grass', overlay: 'rock', name: 'Đá', what: 'Chặn đường.' },
    { ground: 'water', overlay: null, name: 'Nước', what: 'Chặn đường.' },
    { ground: 'grass', overlay: 'flower', name: 'Hoa', what: 'Chỉ để nhìn.' }
  ];

  global.HIC_RARITY_VN = {
    common: 'Thường', rare: 'Hiếm', heroic: 'Anh hùng',
    golden: 'Mạ vàng', diamond: 'Kim cương', cauldron: 'Món nấu'
  };
  global.HIC_TAG_VN = {
    food: 'món ăn', jewelry: 'trang sức', wood: 'gỗ',
    stone: 'đá', sanguine: 'huyết', bomb: 'bom'
  };
})(window);
