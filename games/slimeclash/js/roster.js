/*
 * SlimeClash — roster, SINH TỰ ĐỘNG từ APK Slime Legion 4.5.0. Đừng sửa tay.
 *
 * Nguồn từng trường:
 *   id, slug  <- tên file res/heroes/<id>_<slug>.bytes  (96 hero, id 101-196)
 *   tier      <- tiền tố sprite Headicon_<tier>_<id> trong ui/avataricon.bytes
 *                (chỉ có hai giá trị: 1 và 4; 33 hero thuộc nhóm 4)
 *   name      <- cột `des` của GiftTriggerConfig; hero nào không có thì lấy slug
 *                viết hoa đầu từ, và ĐƯỢC ĐÁNH DẤU bằng `named:false`
 *   art       <- có chân dung trong assets/units/<id>.png hay không
 *
 * klass (core/elite/champion) là QUYẾT ĐỊNH THIẾT KẾ, không phải số đo:
 *   nằm trong nhóm 11 hero mà cấu hình gói nạp xếp cao nhất -> champion
 *   còn lại, tier 4 -> elite
 *   còn lại        -> core
 * Xem README mục "Chỗ KHÔNG phải số thật".
 */
(function (root) {
  'use strict';
  var R = [
    {id:101,name:"Fireeye",slug:"fireeye",tier:1,klass:"core",rarity:"starter",color:"blue",art:true,named:false},
    {id:102,name:"Archer",slug:"archer",tier:1,klass:"core",rarity:"starter",color:"red",art:true,named:false},
    {id:103,name:"IronBull",slug:"stone",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:true},
    {id:104,name:"Shaman",slug:"shaman",tier:1,klass:"core",rarity:"starter",color:"blue",art:true,named:false},
    {id:105,name:"Reaper",slug:"reaper",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:false},
    {id:106,name:"Swordman",slug:"swordman",tier:1,klass:"core",rarity:"starter",color:"green",art:true,named:false},
    {id:107,name:"ThunderRobot",slug:"robot",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:true},
    {id:108,name:"WarriorBull",slug:"warrior",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:true},
    {id:109,name:"Enchantress",slug:"enchantress",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:true},
    {id:110,name:"Dracula",slug:"dracula",tier:4,klass:"elite",rarity:"rare",color:"blue",art:true,named:true},
    {id:111,name:"Lord",slug:"lord",tier:4,klass:"elite",rarity:"rare",color:"red",art:true,named:true},
    {id:112,name:"Totem",slug:"totem",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:true},
    {id:113,name:"Joker",slug:"joker",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:true},
    {id:114,name:"Engineer",slug:"engineer",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:true},
    {id:115,name:"Succubus",slug:"succubus",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:true},
    {id:116,name:"Witch",slug:"witch",tier:4,klass:"elite",rarity:"rare",color:"blue",art:true,named:true},
    {id:117,name:"Medusa",slug:"medusa",tier:1,klass:"champion",rarity:"epic",color:"red",art:true,named:true},
    {id:118,name:"Naga",slug:"naga",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:true},
    {id:119,name:"Siren",slug:"siren",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:true},
    {id:120,name:"Nova",slug:"nova",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:true},
    {id:121,name:"NightElf",slug:"nightelf",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:true},
    {id:122,name:"Goblins",slug:"goblins",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:false},
    {id:123,name:"Mummy",slug:"mummy",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:false},
    {id:124,name:"Cactus",slug:"cactus",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:true},
    {id:125,name:"StoneMan",slug:"stoneman",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:true},
    {id:126,name:"Zombie",slug:"zombie",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:true},
    {id:127,name:"Chomper",slug:"chomper",tier:4,klass:"elite",rarity:"rare",color:"green",art:true,named:true},
    {id:128,name:"Titanum",slug:"titanum",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:true},
    {id:129,name:"Spikeweed",slug:"spikeweed",tier:4,klass:"elite",rarity:"rare",color:"red",art:true,named:true},
    {id:130,name:"Monkey",slug:"monkey",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:true},
    {id:131,name:"Undine",slug:"undine",tier:4,klass:"elite",rarity:"rare",color:"blue",art:true,named:true},
    {id:132,name:"Ghost",slug:"ghost",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:true},
    {id:133,name:"Fattie",slug:"fattie",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:true},
    {id:134,name:"Wolf",slug:"wolf",tier:1,klass:"core",rarity:"common",color:"blue",art:false,named:false},
    {id:135,name:"Yuffie",slug:"yuffie",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:true},
    {id:136,name:"Hades",slug:"hades",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:true},
    {id:137,name:"WaterDragon",slug:"waterdragon",tier:4,klass:"elite",rarity:"rare",color:"blue",art:true,named:true},
    {id:138,name:"RockDragon",slug:"rockdragon",tier:4,klass:"elite",rarity:"rare",color:"red",art:true,named:true},
    {id:139,name:"Luby",slug:"firedragon",tier:4,klass:"elite",rarity:"rare",color:"green",art:true,named:true},
    {id:140,name:"Finer",slug:"finer",tier:1,klass:"core",rarity:"common",color:"blue",art:false,named:false},
    {id:141,name:"Venom",slug:"venom",tier:4,klass:"elite",rarity:"rare",color:"red",art:true,named:true},
    {id:142,name:"RockBull",slug:"rockbull",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:true},
    {id:143,name:"PinkBeer",slug:"pinkbeer",tier:4,klass:"elite",rarity:"rare",color:"blue",art:true,named:true},
    {id:144,name:"Amy",slug:"amy",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:true},
    {id:145,name:"Spider",slug:"spider",tier:4,klass:"elite",rarity:"rare",color:"green",art:true,named:true},
    {id:146,name:"GhostMonkey",slug:"ghostmonkey",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:true},
    {id:147,name:"Bella",slug:"bella",tier:4,klass:"elite",rarity:"rare",color:"red",art:true,named:true},
    {id:148,name:"WhiteOni",slug:"whiteoni",tier:4,klass:"elite",rarity:"rare",color:"green",art:true,named:true},
    {id:149,name:"Judge",slug:"judge",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:true},
    {id:150,name:"Nobody",slug:"nobody",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:true},
    {id:151,name:"Oliver",slug:"oliver",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:true},
    {id:152,name:"Mina",slug:"mina",tier:4,klass:"champion",rarity:"epic",color:"blue",art:true,named:true},
    {id:153,name:"Prophet",slug:"prophet",tier:1,klass:"champion",rarity:"epic",color:"red",art:true,named:true},
    {id:154,name:"Silanui",slug:"silanui",tier:4,klass:"champion",rarity:"epic",color:"green",art:true,named:true},
    {id:155,name:"Pilot",slug:"pilot",tier:4,klass:"elite",rarity:"rare",color:"blue",art:true,named:true},
    {id:156,name:"Guardian",slug:"guardian",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:true},
    {id:157,name:"Laplace",slug:"laplace",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:true},
    {id:158,name:"Finer",slug:"finer",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:true},
    {id:159,name:"DarkKnight",slug:"darkknight",tier:4,klass:"elite",rarity:"rare",color:"red",art:true,named:true},
    {id:160,name:"Nox",slug:"nox",tier:4,klass:"champion",rarity:"epic",color:"green",art:true,named:true},
    {id:161,name:"Hemera",slug:"hemera",tier:1,klass:"champion",rarity:"epic",color:"blue",art:true,named:true},
    {id:162,name:"Panda",slug:"panda",tier:1,klass:"champion",rarity:"epic",color:"red",art:true,named:true},
    {id:163,name:"Medea",slug:"medea",tier:1,klass:"champion",rarity:"epic",color:"green",art:true,named:true},
    {id:164,name:"Navier",slug:"navier",tier:1,klass:"champion",rarity:"epic",color:"blue",art:true,named:true},
    {id:165,name:"Drogon",slug:"drogon",tier:1,klass:"champion",rarity:"epic",color:"red",art:true,named:true},
    {id:166,name:"ElynSea",slug:"elynsea",tier:1,klass:"champion",rarity:"epic",color:"green",art:true,named:true},
    {id:167,name:"Aurora",slug:"aurora",tier:4,klass:"elite",rarity:"rare",color:"blue",art:true,named:false},
    {id:168,name:"Angel",slug:"angel",tier:4,klass:"elite",rarity:"rare",color:"red",art:true,named:false},
    {id:169,name:"Youyou",slug:"youyou",tier:4,klass:"elite",rarity:"rare",color:"green",art:true,named:false},
    {id:170,name:"Simon",slug:"simon",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:false},
    {id:171,name:"Forestelf",slug:"forestelf",tier:4,klass:"elite",rarity:"rare",color:"red",art:true,named:false},
    {id:172,name:"Sivir",slug:"sivir",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:false},
    {id:173,name:"Kalifna",slug:"kalifna",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:false},
    {id:174,name:"Ifrit",slug:"ifrit",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:false},
    {id:175,name:"Sapphire",slug:"sapphire",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:false},
    {id:176,name:"Luna",slug:"luna",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:false},
    {id:177,name:"Beelzebubslime",slug:"beelzebubslime",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:false},
    {id:178,name:"Beelzebubarcher",slug:"beelzebubarcher",tier:4,klass:"elite",rarity:"rare",color:"green",art:true,named:false},
    {id:179,name:"Metis",slug:"metis",tier:4,klass:"elite",rarity:"rare",color:"blue",art:true,named:false},
    {id:180,name:"Iris",slug:"iris",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:false},
    {id:181,name:"Tahla",slug:"tahla",tier:4,klass:"elite",rarity:"rare",color:"green",art:true,named:false},
    {id:182,name:"Mary",slug:"mary",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:false},
    {id:183,name:"Giant Rock Tortoise",slug:"rockturtle",tier:4,klass:"elite",rarity:"rare",color:"red",art:true,named:true},
    {id:184,name:"Selene",slug:"selene",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:false},
    {id:185,name:"Unicorn",slug:"unicorn",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:true},
    {id:186,name:"Nephthys",slug:"nephthys",tier:4,klass:"elite",rarity:"rare",color:"red",art:true,named:false},
    {id:187,name:"Laina",slug:"laina",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:false},
    {id:188,name:"Shifrony",slug:"shifrony",tier:4,klass:"elite",rarity:"rare",color:"blue",art:true,named:false},
    {id:189,name:"Teresa",slug:"teresa",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:false},
    {id:190,name:"Beelzebubsiren",slug:"beelzebubsiren",tier:4,klass:"elite",rarity:"rare",color:"green",art:true,named:false},
    {id:191,name:"Eryx",slug:"eryx",tier:4,klass:"elite",rarity:"rare",color:"blue",art:true,named:false},
    {id:192,name:"Tamamo",slug:"tamamo",tier:4,klass:"elite",rarity:"rare",color:"red",art:true,named:false},
    {id:193,name:"Wukong",slug:"wukong",tier:1,klass:"core",rarity:"common",color:"green",art:true,named:false},
    {id:194,name:"Serqet",slug:"serqet",tier:1,klass:"core",rarity:"common",color:"blue",art:true,named:false},
    {id:195,name:"Zhenji",slug:"zhenji",tier:1,klass:"core",rarity:"common",color:"red",art:true,named:false},
    {id:196,name:"Rhea",slug:"rhea",tier:4,klass:"elite",rarity:"rare",color:"green",art:true,named:false},
  ];
  root.SLIME_ROSTER = R;
  if (typeof module === 'object' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
