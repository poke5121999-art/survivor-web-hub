// Sinh bởi tools/pro/rip_battle.py — đừng sửa tay. Hoạt ảnh chiêu và bóng của PRO cho trận 2D.
// moves[id] = [{img, frames, cols, fw, fh (khung trong ảnh), w, h (cỡ hiện, px sân 570×400), fps,
//              on: 'foe'|'user'|'target' (phía diễn), place: 'scene' (phủ sân) | 'target' (đặt lên Pokémon)}]
window.P1 = window.P1 || {};
P1.PRO_ANIM = {
 "moves": {
  "absorb": [
   {
    "img": "art/pro/anim/absorbfoe.png",
    "frames": 16,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/absorbuser.png",
    "frames": 16,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "aeroblast": [
   {
    "img": "art/pro/anim/aeroblastfoe.png",
    "frames": 18,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/aeroblastuser.png",
    "frames": 18,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "bite": [
   {
    "img": "art/pro/anim/bite.png",
    "frames": 8,
    "cols": 8,
    "fw": 250,
    "fh": 256,
    "w": 250,
    "h": 256,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "bubble": [
   {
    "img": "art/pro/anim/bubble.png",
    "frames": 18,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/bubblefoe.png",
    "frames": 18,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   }
  ],
  "cometpunch": [
   {
    "img": "art/pro/anim/comet_punch.png",
    "frames": 10,
    "cols": 8,
    "fw": 250,
    "fh": 250,
    "w": 250,
    "h": 250,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "doublekick": [
   {
    "img": "art/pro/anim/doublekick.png",
    "frames": 10,
    "cols": 8,
    "fw": 250,
    "fh": 256,
    "w": 250,
    "h": 256,
    "fps": 11.11,
    "on": "target",
    "place": "target"
   }
  ],
  "doubleslap": [
   {
    "img": "art/pro/anim/doubleslap.png",
    "frames": 10,
    "cols": 8,
    "fw": 250,
    "fh": 250,
    "w": 250,
    "h": 250,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "ember": [
   {
    "img": "art/pro/anim/emberfoe.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/emberuser.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "firepunch": [
   {
    "img": "art/pro/anim/fire_punch.png",
    "frames": 16,
    "cols": 8,
    "fw": 250,
    "fh": 250,
    "w": 250,
    "h": 250,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "fireblast": [
   {
    "img": "art/pro/anim/fireblastfoe.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/fireblastuser.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "flamethrower": [
   {
    "img": "art/pro/anim/flamethrowerfoe.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/flamethroweruser.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "gigadrain": [
   {
    "img": "art/pro/anim/gigadrainfoe.png",
    "frames": 20,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/gigadrainfoe.png",
    "frames": 20,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "hydropump": [
   {
    "img": "art/pro/anim/hydrofoe.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/hydrouser.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "icepunch": [
   {
    "img": "art/pro/anim/ice_punch.png",
    "frames": 15,
    "cols": 8,
    "fw": 250,
    "fh": 250,
    "w": 250,
    "h": 250,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "icebeam": [
   {
    "img": "art/pro/anim/icebeamfoe.png",
    "frames": 13,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 18.18,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/icebeamuser.png",
    "frames": 13,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 18.18,
    "on": "user",
    "place": "scene"
   }
  ],
  "karatechop": [
   {
    "img": "art/pro/anim/karatechop.png",
    "frames": 15,
    "cols": 8,
    "fw": 250,
    "fh": 250,
    "w": 250,
    "h": 250,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "leer": [
   {
    "img": "art/pro/anim/leer.png",
    "frames": 6,
    "cols": 6,
    "fw": 250,
    "fh": 256,
    "w": 250,
    "h": 256,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "megapunch": [
   {
    "img": "art/pro/anim/mega_punch.png",
    "frames": 8,
    "cols": 8,
    "fw": 250,
    "fh": 256,
    "w": 250,
    "h": 256,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "megadrain": [
   {
    "img": "art/pro/anim/megadrainfoe.png",
    "frames": 16,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/megadrainuser.png",
    "frames": 16,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "payday": [
   {
    "img": "art/pro/anim/paydayfoe.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/paydayuser.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "poisonpowder": [
   {
    "img": "art/pro/anim/poison_powder.png",
    "frames": 12,
    "cols": 8,
    "fw": 250,
    "fh": 250,
    "w": 250,
    "h": 250,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "poisonsting": [
   {
    "img": "art/pro/anim/poisonstingfoe.png",
    "frames": 10,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 18.18,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/poisonstinguser.png",
    "frames": 10,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 18.18,
    "on": "user",
    "place": "scene"
   }
  ],
  "pound": [
   {
    "img": "art/pro/anim/pound.png",
    "frames": 8,
    "cols": 8,
    "fw": 250,
    "fh": 256,
    "w": 250,
    "h": 256,
    "fps": 15.38,
    "on": "target",
    "place": "target"
   }
  ],
  "psychocut": [
   {
    "img": "art/pro/anim/psychocutfoe.png",
    "frames": 13,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 18.18,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/psychocutuser.png",
    "frames": 13,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 18.18,
    "on": "user",
    "place": "scene"
   }
  ],
  "quickattack": [
   {
    "img": "art/pro/anim/quick_attack.png",
    "frames": 6,
    "cols": 6,
    "fw": 250,
    "fh": 256,
    "w": 250,
    "h": 256,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "rapidspin": [
   {
    "img": "art/pro/anim/rapidspinfoe.png",
    "frames": 13,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 18.18,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/rapidspinuser.png",
    "frames": 13,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 18.18,
    "on": "user",
    "place": "scene"
   }
  ],
  "recover": [
   {
    "img": "art/pro/anim/recoverfoe.png",
    "frames": 12,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 18.18,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/recoveruser.png",
    "frames": 13,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 18.18,
    "on": "user",
    "place": "scene"
   }
  ],
  "rollout": [
   {
    "img": "art/pro/anim/rollout.png",
    "frames": 8,
    "cols": 8,
    "fw": 250,
    "fh": 256,
    "w": 250,
    "h": 256,
    "fps": 16.67,
    "on": "target",
    "place": "target"
   }
  ],
  "scratch": [
   {
    "img": "art/pro/anim/scratch.png",
    "frames": 8,
    "cols": 8,
    "fw": 250,
    "fh": 256,
    "w": 250,
    "h": 256,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "shadowclaw": [
   {
    "img": "art/pro/anim/shadowclawfoe.png",
    "frames": 8,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/shadowclawuser.png",
    "frames": 8,
    "cols": 3,
    "fw": 570,
    "fh": 202,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "slash": [
   {
    "img": "art/pro/anim/slash.png",
    "frames": 8,
    "cols": 8,
    "fw": 250,
    "fh": 256,
    "w": 250,
    "h": 256,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "sleeppowder": [
   {
    "img": "art/pro/anim/sleep_powder.png",
    "frames": 12,
    "cols": 8,
    "fw": 250,
    "fh": 250,
    "w": 250,
    "h": 250,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "stunspore": [
   {
    "img": "art/pro/anim/sleep_powder.png",
    "frames": 12,
    "cols": 8,
    "fw": 250,
    "fh": 250,
    "w": 250,
    "h": 250,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "surf": [
   {
    "img": "art/pro/anim/surffoe.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/surfuser.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "swift": [
   {
    "img": "art/pro/anim/swiftfoe.png",
    "frames": 13,
    "cols": 3,
    "fw": 570,
    "fh": 405,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/swiftuser.png",
    "frames": 18,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "swordsdance": [
   {
    "img": "art/pro/anim/swordsdance.png",
    "frames": 12,
    "cols": 8,
    "fw": 250,
    "fh": 256,
    "w": 250,
    "h": 256,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "tackle": [
   {
    "img": "art/pro/anim/tackle.png",
    "frames": 6,
    "cols": 6,
    "fw": 250,
    "fh": 256,
    "w": 250,
    "h": 256,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "tailwhip": [
   {
    "img": "art/pro/anim/tailwhip.png",
    "frames": 10,
    "cols": 8,
    "fw": 250,
    "fh": 250,
    "w": 250,
    "h": 250,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "thunderpunch": [
   {
    "img": "art/pro/anim/thunder_punch.png",
    "frames": 15,
    "cols": 8,
    "fw": 250,
    "fh": 250,
    "w": 250,
    "h": 250,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "thunderbolt": [
   {
    "img": "art/pro/anim/thunderboltfoe.png",
    "frames": 18,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/thunderboltfoe.png",
    "frames": 18,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "thunder": [
   {
    "img": "art/pro/anim/thunderfoe.png",
    "frames": 18,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/thunderuser.png",
    "frames": 18,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "thundershock": [
   {
    "img": "art/pro/anim/thunderboltfoe.png",
    "frames": 18,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/thunderboltfoe.png",
    "frames": 18,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "watergun": [
   {
    "img": "art/pro/anim/watergunfoe.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "foe",
    "place": "scene"
   },
   {
    "img": "art/pro/anim/watergunuser.png",
    "frames": 16,
    "cols": 4,
    "fw": 428,
    "fh": 304,
    "w": 570,
    "h": 405,
    "fps": 15.38,
    "on": "user",
    "place": "scene"
   }
  ],
  "withdraw": [
   {
    "img": "art/pro/anim/withdraw.png",
    "frames": 14,
    "cols": 8,
    "fw": 250,
    "fh": 250,
    "w": 250,
    "h": 250,
    "fps": 14.29,
    "on": "target",
    "place": "target"
   }
  ],
  "barrier": [
   {
    "img": "art/pro/anim/barrier_foe.png",
    "frames": 7,
    "cols": 7,
    "fw": 192,
    "fh": 192,
    "w": 92,
    "h": 92,
    "fps": 10.0,
    "on": "foe",
    "place": "target"
   },
   {
    "img": "art/pro/anim/barrier_foe.png",
    "frames": 7,
    "cols": 7,
    "fw": 192,
    "fh": 192,
    "w": 160,
    "h": 160,
    "fps": 10.0,
    "on": "user",
    "place": "target"
   }
  ],
  "falseswipe": [
   {
    "img": "art/pro/anim/false_swipe_foe.png",
    "frames": 10,
    "cols": 10,
    "fw": 192,
    "fh": 192,
    "w": 192,
    "h": 192,
    "fps": 10.0,
    "on": "foe",
    "place": "target"
   },
   {
    "img": "art/pro/anim/false_swipe_foe.png",
    "frames": 10,
    "cols": 10,
    "fw": 192,
    "fh": 192,
    "w": 200,
    "h": 200,
    "fps": 10.0,
    "on": "user",
    "place": "target"
   }
  ],
  "lightscreen": [
   {
    "img": "art/pro/anim/light_screen_foe.png",
    "frames": 12,
    "cols": 10,
    "fw": 192,
    "fh": 192,
    "w": 92,
    "h": 92,
    "fps": 10.0,
    "on": "foe",
    "place": "target"
   },
   {
    "img": "art/pro/anim/light_screen_foe.png",
    "frames": 12,
    "cols": 10,
    "fw": 192,
    "fh": 192,
    "w": 160,
    "h": 160,
    "fps": 10.0,
    "on": "user",
    "place": "target"
   }
  ],
  "magiccoat": [
   {
    "img": "art/pro/anim/magic_coat_foe.png",
    "frames": 12,
    "cols": 10,
    "fw": 192,
    "fh": 192,
    "w": 92,
    "h": 92,
    "fps": 10.0,
    "on": "foe",
    "place": "target"
   },
   {
    "img": "art/pro/anim/magic_coat_foe.png",
    "frames": 12,
    "cols": 10,
    "fw": 192,
    "fh": 192,
    "w": 160,
    "h": 160,
    "fps": 10.0,
    "on": "user",
    "place": "target"
   }
  ],
  "reflect": [
   {
    "img": "art/pro/anim/reflect_foe.png",
    "frames": 12,
    "cols": 10,
    "fw": 192,
    "fh": 192,
    "w": 92,
    "h": 92,
    "fps": 10.0,
    "on": "foe",
    "place": "target"
   },
   {
    "img": "art/pro/anim/reflect_foe.png",
    "frames": 12,
    "cols": 10,
    "fw": 192,
    "fh": 192,
    "w": 160,
    "h": 160,
    "fps": 10.0,
    "on": "user",
    "place": "target"
   }
  ]
 },
 "status": {
  "par": {
   "img": "art/pro/anim/par.png",
   "frames": 8,
   "cols": 8,
   "fw": 250,
   "fh": 256,
   "w": 250,
   "h": 256,
   "fps": 14.29,
   "on": "target",
   "place": "target"
  },
  "psn": {
   "img": "art/pro/anim/psn.png",
   "frames": 8,
   "cols": 8,
   "fw": 250,
   "fh": 256,
   "w": 250,
   "h": 256,
   "fps": 14.29,
   "on": "target",
   "place": "target"
  },
  "slp": {
   "img": "art/pro/anim/slp.png",
   "frames": 8,
   "cols": 8,
   "fw": 250,
   "fh": 256,
   "w": 250,
   "h": 256,
   "fps": 14.29,
   "on": "target",
   "place": "target"
  }
 },
 "weather": {
  "DesolateLand": {
   "img": "art/pro/anim/battleharshsun.png",
   "frames": 8,
   "cols": 3,
   "fw": 570,
   "fh": 202,
   "w": 570,
   "h": 405,
   "fps": 33.33,
   "on": "target",
   "place": "scene"
  },
  "RainDance": {
   "img": "art/pro/anim/battlerain.png",
   "frames": 8,
   "cols": 3,
   "fw": 570,
   "fh": 202,
   "w": 570,
   "h": 405,
   "fps": 20.0,
   "on": "target",
   "place": "scene"
  },
  "Sandstorm": {
   "img": "art/pro/anim/battlesand.png",
   "frames": 8,
   "cols": 3,
   "fw": 570,
   "fh": 202,
   "w": 570,
   "h": 405,
   "fps": 20.0,
   "on": "target",
   "place": "scene"
  },
  "SunnyDay": {
   "img": "art/pro/anim/battlesun.png",
   "frames": 8,
   "cols": 3,
   "fw": 570,
   "fh": 202,
   "w": 570,
   "h": 405,
   "fps": 33.33,
   "on": "target",
   "place": "scene"
  }
 },
 "balls": {
  "pokeball": {
   "closed": "art/pro/ball/pokeball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/pokeball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/pokeball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "greatball": {
   "closed": "art/pro/ball/greatball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/greatball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/greatball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "ultraball": {
   "closed": "art/pro/ball/ultraball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/ultraball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/ultraball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "masterball": {
   "closed": "art/pro/ball/masterball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/masterball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/masterball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "premierball": {
   "closed": "art/pro/ball/premierball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/premierball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/premierball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "cherishball": {
   "closed": "art/pro/ball/cherishball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/cherishball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/cherishball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "healball": {
   "closed": "art/pro/ball/healball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/healball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/healball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "friendball": {
   "closed": "art/pro/ball/friendball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/friendball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/friendball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "luxuryball": {
   "closed": "art/pro/ball/luxuryball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/luxuryball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/luxuryball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "netball": {
   "closed": "art/pro/ball/netball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/netball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/netball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "nestball": {
   "closed": "art/pro/ball/nestball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/nestball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/nestball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "quickball": {
   "closed": "art/pro/ball/quickball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/quickball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/quickball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "timerball": {
   "closed": "art/pro/ball/timerball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/timerball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/timerball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "duskball": {
   "closed": "art/pro/ball/duskball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/duskball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/duskball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "levelball": {
   "closed": "art/pro/ball/levelball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/levelball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/levelball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "diveball": {
   "closed": "art/pro/ball/diveball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/diveball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/diveball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "dreamball": {
   "closed": "art/pro/ball/dreamball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/dreamball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/dreamball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "fastball": {
   "closed": "art/pro/ball/fastball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/fastball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/fastball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "heavyball": {
   "closed": "art/pro/ball/heavyball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/heavyball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/heavyball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "loveball": {
   "closed": "art/pro/ball/loveball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/loveball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/loveball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "lureball": {
   "closed": "art/pro/ball/lureball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/lureball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/lureball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "moonball": {
   "closed": "art/pro/ball/moonball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/moonball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/moonball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "sportball": {
   "closed": "art/pro/ball/sportball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/sportball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/sportball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "repeatball": {
   "closed": "art/pro/ball/repeatball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/repeatball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/repeatball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "safariball": {
   "closed": "art/pro/ball/safariball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/safariball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/safariball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "parkball": {
   "closed": "art/pro/ball/parkball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/parkball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/parkball_hand.png",
   "handSize": [
    48,
    64
   ]
  },
  "beastball": {
   "closed": "art/pro/ball/beastball_closed.png",
   "closedSize": [
    28,
    28
   ],
   "open": "art/pro/ball/beastball_open.png",
   "openSize": [
    28,
    46
   ],
   "hand": "art/pro/ball/beastball_hand.png",
   "handSize": [
    48,
    64
   ]
  }
 },
 "typeFallback": {
  "normal": "tackle",
  "fire": "ember",
  "water": "watergun",
  "electric": "thundershock",
  "grass": "absorb",
  "ice": "icebeam",
  "fighting": "karatechop",
  "poison": "poisonsting",
  "psychic": "psychocut",
  "ghost": "shadowclaw",
  "dark": "bite",
  "flying": "aeroblast"
 }
};
