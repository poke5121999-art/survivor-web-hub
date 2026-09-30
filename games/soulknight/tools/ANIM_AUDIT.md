# Kiem toan hoat anh Soul Knight: goc 8.6 so voi web

Sinh boi `tools/anim_audit.py`, khong sua tay. Nguon: Animator trong prefab goc (D:\sk86-ref) so voi `data/sk-data.js`, `sk-bosses86.js`, `sk-weapons86.js`. Nhan: [DO] cho moi con so o day.

- "state" = trang thai AnimatorController co motion la mot AnimationClip (moi layer). Web mang state neu ten khop (bo tien to `L<n>.`).
- `thieu-sprite`: clip goc co khung sprite ma web khong co state do. `thieu-transform`: clip goc chi co duong cong Transform/mau; lop web chi luu khung sprite (quai, vat the) khong bieu dien duoc.
- `mat-cong`: state web co khung sprite nhung clip goc con duong cong float (co gian, doi mau, di chuyen) bi bo. Lop bosses/weapons web luu duong cong nen khong tinh cot nay.
- `lech-khung`: web it khung sprite hon clip goc.
- `tinh`: web ve mot khung duy nhat du clip goc co >1 khung.

## Tong hop

| lop | thuc the | vang mat o web | du state (bo char_*) | thieu state | trong do char_* | thieu-sprite | thieu-transform | lech-khung | mat-cong | tinh |
|---|---|---|---|---|---|---|---|---|---|---|
| heroes | 42 | 0 | 14 | 133 | 42 | 77 | 56 | 0 | 81 | 0 |
| enemies | 155 | 13 | 27 | 983 | 335 | 58 | 925 | 0 | 590 | 12 |
| bosses | 20 | 0 | 20 | 89 | 89 | 51 | 38 | 0 | 0 | 0 |
| weapons | 410 | 114 | 241 | 775 | 0 | 108 | 667 | 0 | 0 | 0 |
| pets | 46 | 46 | 0 | 630 | 178 | 242 | 388 | 0 | 0 | 0 |
| mounts | 31 | 31 | 0 | 480 | 124 | 266 | 214 | 0 | 0 | 0 |
| hall | 108 | 108 | 0 | 586 | 11 | 257 | 329 | 0 | 0 | 0 |
| objects | 354 | 251 | 50 | 1659 | 271 | 507 | 1152 | 0 | 54 | 48 |

Cot "vang mat o web": thuc the goc khong co trong du lieu web (khong tinh vao "du state"). "thieu state" tinh tren moi thuc the (thuc the vang mat tinh het state cua no). `char_*` la state dung chung (char_hit, char_dizzy, char_tap_dead, char_hide_tap, char_angry) va khong tinh vao "du state".

## heroes

Skin: goc 782, web 42 (chi skin 0).

| thuc the | ghi chu | thieu-sprite | thieu-transform | lech-khung |
|---|---|---|---|---|
| aigirl |  | skin_0_skill0_idle, skin_0_skill0_run | char_hit |  |
| airbender |  | skill, skin_0_skill_0_run, hah | char_hit |  |
| arcaneknight |  | skill_0_charge, skill_0_unleash, skill_0_unleash_loop | char_hit |  |
| astrologist |  | skin_0_skill | char_hit |  |
| beheaded |  | skill | char_hit |  |
| captain |  | skin_0_idle_skill, skin_0_run_skill | char_hit |  |
| elves |  | skill | char_hit, hide_bow, show_bow |  |
| envoy |  | skin_0_run_has_weapon, skin_0_idle_has_weapon, skin_0_idle_has_weapon_1, skin_0_run_has_weapon 1 | char_hit |  |
| fighter |  | kick, skill_idle, push_off, kick1, kick2, kick3, explosion, explosion_run, continus_boxing | char_hit |  |
| joker |  | skin_0_idle_skill_1, skin_0_run_skill_1 | char_hit |  |
| ladychef |  | skin_0_skill_0 | char_hit |  |
| lancer |  | jump, jumpExit | rotate, liftSpear, char_hit |  |
| mage |  |  | char_hit, skill |  |
| miner |  | down, dig, up, New State, New State 0, New State 1, drill_rotate | char_hit, drill_show, skin_0_skill2_drill, jump |  |
| necromancer |  | skill | char_hit |  |
| ninja |  | skill | char_hit |  |
| officer |  | seat | char_hit |  |
| ranger |  | roll, rock | char_hit |  |
| robot |  |  | char_hit, skill, skill_end |  |
| specialforces |  | skin_0_skill_hide_body, ide_blue, run_blue, dead_blue, ide_green, run_green, dead_green, skin_0_skill_green_start, skin_0_skill_green, skin_0_skill_green_end | char_hit |  |
| swordmaster |  | skill1 | char_hit |  |
| transcendent |  | skill, dead2 | char_hit |  |
| trapmaster |  | ide_l, run_r, run_l, ide_r | char_hit, skin_0_skill_1_ide |  |
| viking |  |  | char_hit, jump |  |
| warliege |  | roll, skill1_dash, skin_0_idle_dark, skin_0_run_dark, skin_0_skill2_jump | char_hit |  |
| warlock |  | skill_idle, skill_run | char_hit |  |
| werewolf |  | skill_idle, skill_run, skill, atk_0, atk_1, atk_2 | char_hit, New State, eat |  |
| yinyang |  | skin_0_idle_yin, skin_0_run_yin, skin_0_dash, skin_0_dash_yin | char_hit |  |

## enemies

| thuc the | ghi chu | thieu-sprite | thieu-transform | lech-khung |
|---|---|---|---|---|
| e_alien01 | man 3-1,3-2,3-3,3-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h1/weapon:pistol_rotate, img/h1/weapon:fire |  |
| e_alien02 | man 3-1,3-2,3-3,3-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h1/weapon:pistol_rotate, img/h1/weapon:fire |  |
| e_alien03 | man 3-1,3-2,3-3,3-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_android01 | man 2-1,2-2 |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_android02 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h1/weapon:pistol_rotate, img/h1/weapon:fire |  |
| e_android03 | man 2-2,2-3,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_android04 | man 2-3,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_spear_ide, img/h1/weapon:w_spear, img/h1/weapon:w_spear 0, img/h1/weapon:switch_temp |  |
| e_battery01 | vang mat o web; man 2-2,2-3,2-4,2-5... | battery01_dead, char_dizzy, char_tap_dead | battery01_ide, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_boombMiner | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:atk, img/h1/weapon:switch_temp, img/h1/weapon:w_throw_prepare, img/h1/weapon:w_throw_atk |  |
| e_crab_ufo | tinh; man 3-1,3-2,3-3,3-4... |  | ide, atk, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0 |  |
| e_creeper | man 3-2,3-3,3-4,3-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_creeper_fly | man 3-2,3-3,3-4,3-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_crystal | man 1-3,1-4,1-5 |  | ide, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_dark_knight | man 2-4,2-5 |  | char_hit, char_hide_tap, attack |  |
| e_dream_angry | vang mat o web; man 1-1,1-2 | idle, run, dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_dream_hate | vang mat o web; man 1-3 | idle, run, dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_dream_sad | vang mat o web; man 1-5 | idle, run, dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_dream_think | vang mat o web; man 1-4 | idle, run, dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_fire_sacrifice | man 1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon_staff:New State, img/h1/weapon_staff:w_staff, img/h1/weapon_staff:w_staff 0 |  |
| e_fireknight01 | man 3-2,3-3,3-4,3-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_spear_ide, img/h1/weapon:w_spear, img/h1/weapon:w_spear 0, img/h1/weapon:switch_temp |  |
| e_fireknight02 | man 3-2,3-3,3-4 |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_ghost | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_giant | man 2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon_gatlin:New State, img/h1/weapon_gatlin:w_gatlin, img/h1/weapon_gatlin:w_gatlin 0 |  |
| e_golem01 | man 3-3,3-4,3-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_golem02 | man 3-3,3-4,3-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_hammer | man 2-3,2-4,2-5 |  | hammer_atk1, hammer_atk3, char_hit, char_hide_tap |  |
| e_iceKnight | tinh; man 2-3,2-4,2-5 |  | enemy01_ide, enemy01_run, knight04_atk, knight04_atk2, char_hit, char_hide_tap |  |
| e_knight01 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h1/weapon:pistol_rotate, img/h1/weapon:fire |  |
| e_knight02 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_knight03 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:m4, img/h1/weapon:m4 0, img/h1/weapon:fire |  |
| e_knight04 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_knight05 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_knight06 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_lavaHive | tinh; man 3-4,3-5 |  | char_hit, char_hide_tap |  |
| e_lilIceKnight | tinh; man 2-1,2-2,2-3 |  | enemy01_ide, enemy01_run, knight04_atk, char_hit, char_hide_tap |  |
| e_lilRobberMonkey | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_malphite01 | tinh; man 1-1,1-2,1-3,1-4... |  | ide, run, yeti01_atk, char_hit, char_hide_tap |  |
| e_malphite02 | tinh; man 1-1,1-2,1-3,1-4... |  | ide, run, yeti01_atk, char_hit, char_hide_tap, img/head/h1/weapon:w_ide, img/head/h1/weapon:weapon_pistol, img/head/h1/weapon:weapon_pistol 0, img/head/h1/weapon:pistol_rotate, img/head/h1/weapon:fire (+5) |  |
| e_malphite03 | tinh; man 1-3,1-4,1-5 |  | ide, run, yeti01_atk, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h1/weapon:pistol_rotate, img/h1/weapon:fire |  |
| e_miner01 | man 1-1,1-2,1-3,1-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_miner02 | man 1-1,1-2,1-3,1-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_spear_ide, img/h1/weapon:w_spear, img/h1/weapon:w_spear 0, img/h1/weapon:switch_temp |  |
| e_miner03 | man 1-1,1-2,1-3,1-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_miner04 | man 1-2,1-3,1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_miner05 | man 1-2,1-3,1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_miner06 | man 1-2,1-3,1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_minerBoss01 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_minerBoss02 | man 2-2,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_monkey01 | man 1-2,1-3,1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:m4, img/h1/weapon:m4 0, img/h1/weapon:fire |  |
| e_monkey02 | man 1-1,1-2,1-3,1-4... |  | char_hit, char_hide_tap, img/h1/weapon:idle, img/h1/weapon:throw, img/h1/weapon:sword, img/h1/weapon:switch_temp, img/h1/weapon:throw_prepare, img/h1/weapon:spear, img/h1/weapon:check_mode, img/h1/weapon:check_mode_t (+2) |  |
| e_monkey03 | man 1-1,1-2,1-3,1-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_monkey04 | man 1-1,1-2,1-3,1-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_monkey05 | man 1-1,1-2,1-3,1-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_spear_ide, img/h1/weapon:w_spear, img/h1/weapon:w_spear 0, img/h1/weapon:switch_temp |  |
| e_mosquito | man 3-1,3-2,3-3,3-4... |  | char_hit, char_hide_tap, img/h1/weapon:New State, img/h1/weapon:w_gatlin, img/h1/weapon:w_gatlin 0 |  |
| e_mummy01 | man 3-1,3-2 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:m4, img/h1/weapon:m4 0, img/h1/weapon:fire |  |
| e_mummy02 | man 3-1,3-2,3-3,3-4 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h1/weapon:pistol_rotate, img/h1/weapon:fire |  |
| e_mummy03 | man 3-1,3-2,3-3,3-4... |  | char_hit, char_hide_tap, img/bullet_boom/b:boom_ide |  |
| e_mummy04 | man 3-1,3-2,3-3,3-4... |  | char_hit, char_hide_tap, img/h1/weapon_staff:New State, img/h1/weapon_staff:w_staff, img/h1/weapon_staff:w_staff 0 |  |
| e_mummy05 | man 3-1,3-2,3-3,3-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:m4, img/h1/weapon:m4 0, img/h1/weapon:fire |  |
| e_old_alien02 | vang mat o web; man 1-1,1-2,1-3,1-4... | alien01_ide, alien01_run, alien01_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_spear_ide, img/h1/weapon:w_spear, img/h1/weapon:w_spear 0, img/h1/weapon:switch_temp |  |
| e_old_alien03 | vang mat o web; man 1-1,1-2,1-3,1-4... | alien01_ide, alien01_run, alien01_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_bow0, img/h1/weapon:w_bow2, img/h1/weapon:w_bow1 |  |
| e_old_battery | vang mat o web; man 1-2,1-3,1-4,1-5 | battery01_ide, battery01_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_old_creeper_fly | vang mat o web; man 1-1,1-2,1-3,1-4... | creeper_fly_ide, creeper_fly_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_old_hammer | vang mat o web; man 1-3,1-4,1-5 | hammer_ide, hammer_run, hammer_dead, hammer_atk2, char_dizzy, char_tap_dead | hammer_atk1, hammer_atk3, char_hit, char_hide_tap |  |
| e_old_transitionPort | vang mat o web; man 1-4,1-5 | ide, dead, char_dizzy, char_tap_dead | atk, char_hit, char_hide_tap |  |
| e_old_worm | vang mat o web; man 1-1,1-2,1-3,1-4... | worm_ide, worm_run, worm_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap |  |
| e_orc01 | man 1-1,1-2,1-3,1-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h1/weapon:pistol_rotate, img/h1/weapon:fire |  |
| e_orc02 | man 1-1,1-2,1-3,1-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_spear_ide, img/h1/weapon:w_spear, img/h1/weapon:w_spear 0, img/h1/weapon:switch_temp |  |
| e_orc03 | man 1-1,1-2,1-3,1-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_bow0, img/h1/weapon:w_bow2, img/h1/weapon:w_bow1 |  |
| e_orc04 | man 1-2,1-3,1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_orc05 | man 1-2,1-3,1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_orc06 | man 1-2,1-3,1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_orc07 | man 1-3,1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon_staff:New State, img/h1/weapon_staff:w_staff, img/h1/weapon_staff:w_staff 0 |  |
| e_orc08 | man 1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_orc_elite_archer | man 1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_bow0, img/h1/weapon:w_bow2, img/h1/weapon:w_bow1 |  |
| e_owl_metal | man 3-3,3-4,3-5 |  | ide, atk, dead, char_hit, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h1/weapon:pistol_rotate, img/h1/weapon:fire |  |
| e_pirate_blade | man 3-1,3-2,3-3,3-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_pirate_fat | man 3-4,3-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h2/weapon:w_ide, img/h2/weapon:weapon_pistol, img/h2/weapon:weapon_pistol 0 |  |
| e_pirate_gun | man 3-1,3-2,3-3,3-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0 |  |
| e_pirate_punch | man 3-2,3-3,3-4,3-5 |  | char_hit, char_hide_tap, img/h1/weapon:active, img/h1/weapon:atk_1, img/h1/weapon:atk_t, img/h2/weapon:active, img/h2/weapon:atk_1, img/h2/weapon:atk_t |  |
| e_pirate_shotgun | man 3-1,3-2,3-3,3-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0 |  |
| e_plottedPlant | man 1-3,1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_pumpkin01 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:idle, img/h1/weapon:throw, img/h1/weapon:sword, img/h1/weapon:switch_temp, img/h1/weapon:throw_prepare, img/h1/weapon:spear, img/h1/weapon:check_mode, img/h1/weapon:check_mode_t (+2) |  |
| e_pumpkin02 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:w_sword_ide_inverse, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_pumpkin03 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h1/weapon:pistol_rotate, img/h1/weapon:fire |  |
| e_pumpkin04 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:w_sword_ide_inverse, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_pumpkin05 | man 2-2,2-3,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0 |  |
| e_pumpkin06 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_pumpkinHouse | tinh; man 2-3,2-4,2-5 |  | ide, atk, char_hit, char_hide_tap |  |
| e_relicSkeleton01 | man 2-2,2-3,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon:New State, img/h1/weapon:w_staff, img/h1/weapon:w_staff 0 |  |
| e_relicSkeleton02 | man 2-2,2-3,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_bow0, img/h1/weapon:w_bow2, img/h1/weapon:w_bow1 |  |
| e_relicSkeleton03 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_relicSkeleton04 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_relicSkeleton05 | man 2-3,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon:idle, img/h1/weapon:throw, img/h1/weapon:sword, img/h1/weapon:switch_temp, img/h1/weapon:throw_prepare, img/h1/weapon:spear, img/h1/weapon:check_mode, img/h1/weapon:check_mode_t (+2) |  |
| e_robberMonkey | man 2-4,2-5 |  | robberMonkey_weapon1, robberMonkey_weapon2, robberMonkey_weapon1_atk, robberMonkey_weapon2_atk, char_hit, char_hide_tap |  |
| e_robot_bishop | man 2-3,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_spear_ide, img/h1/weapon:w_spear, img/h1/weapon:w_spear 0, img/h1/weapon:switch_temp |  |
| e_robot_knight_2 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_spear_ide, img/h1/weapon:switch_temp, img/h1/weapon:w_spear, img/h1/weapon:w_axe |  |
| e_robot_knight_3 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_robot_knight_4 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_robot_pawn | man 2-3,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_spear_ide, img/h1/weapon:w_spear, img/h1/weapon:w_spear 0, img/h1/weapon:switch_temp, img/h2/weapon:w_spear_ide, img/h2/weapon:w_spear, img/h2/weapon:w_spear 0, img/h2/weapon:switch_temp |  |
| e_robot_rook | man 2-2,2-3,2-4,2-5 |  | atk, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h1/weapon:pistol_rotate, img/h1/weapon:fire |  |
| e_rockcrab | man 1-3,1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_ruinsworm | man 1-1,1-2,1-3,1-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_shaman | man 2-2,2-3,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon_staff:New State, img/h1/weapon_staff:w_staff, img/h1/weapon_staff:w_staff 0 |  |
| e_skeleton01 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_skeleton02 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_skeleton03 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_bow0, img/h1/weapon:w_bow2, img/h1/weapon:w_bow1 |  |
| e_skeleton04 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_skeleton05 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_skeleton06 | man 2-1,2-2,2-3,2-4... |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:m4, img/h1/weapon:m4 0, img/h1/weapon:fire |  |
| e_statueCrab_host | tinh; man 1-4,1-5 |  | ide, e_statueCrabHost_fade, char_hit, char_hide_tap |  |
| e_succulent | man 1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_swampArtist | man 2-2,2-3 |  | char_hit, char_hide_tap, img/h1/weapon:w_spear_ide, img/h1/weapon:w_spear, img/h1/weapon:w_spear 0, img/h1/weapon:switch_temp |  |
| e_swampOrc01 | man 2-1 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h1/weapon:pistol_rotate, img/h1/weapon:fire |  |
| e_swampOrc02 | man 2-1,2-2 |  | char_hit, char_hide_tap, img/h1/weapon:w_spear_ide, img/h1/weapon:w_spear, img/h1/weapon:w_spear 0, img/h1/weapon:switch_temp |  |
| e_swampOrc03 | man 2-1 |  | char_hit, char_hide_tap, img/h1/weapon:w_bow0, img/h1/weapon:w_bow2, img/h1/weapon:w_bow1 |  |
| e_swampOrc04 | man 2-1,2-2,2-3 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_swampOrc05 | man 2-1,2-2,2-4 |  | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| e_swampOrc06 | man 2-2,2-3,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_swampOrc07 | man 2-3,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon_staff:New State, img/h1/weapon_staff:w_staff, img/h1/weapon_staff:w_staff 0 |  |
| e_swampOrc08 | man 2-3,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| e_swampRider01 | man 2-2,2-4,2-5 |  | char_hit, char_hide_tap, swampRider_spear |  |
| e_swampRider02 | man 2-3,2-5 |  | char_hit, char_hide_tap, swampRider_spear |  |
| e_swampRider03 | man 2-4,2-5 |  | char_hit, char_hide_tap, swampRider_spear |  |
| e_swampTentacle | vang mat o web; man 2-3,2-4,2-5 | char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back (+2) |  |
| e_tentacle | tinh; man 3-4,3-5 |  | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0 (+3) |  |
| e_thunder_miner | man 1-4,1-5 |  | char_hit, char_hide_tap, img/h1/weapon:w_spear_ide, img/h1/weapon:w_spear, img/h1/weapon:w_spear 0, img/h1/weapon:switch_temp |  |
| e_transitionPort | tinh; man 3-4,3-5 |  | atk, char_hit, char_hide_tap |  |
| e_ufo | tinh; man 3-1,3-2,3-3,3-4... |  | char_hit, char_hide_tap, img/h1/weapon:New State, img/h1/weapon:w_gatlin, img/h1/weapon:w_gatlin 0 |  |
| e_wizard01 | man 2-2,2-3,2-4,2-5 |  | char_hit, char_hide_tap, img/h1/weapon_staff:New State, img/h1/weapon_staff:w_staff, img/h1/weapon_staff:w_staff 0 |  |

## bosses

Khong co thuc the nao thieu.

## weapons

| thuc the | ghi chu | thieu-sprite | thieu-transform | lech-khung |
|---|---|---|---|---|
| weapon_010 |  |  | weapon_pistol, weapon_pistol 0, pistol_rotate |  |
| weapon_024 |  |  | m4, m4 0 |  |
| weapon_042 |  |  | w_laser_charge |  |
| weapon_045 |  |  | w_laser_charge |  |
| weapon_046 |  |  | w_laser_charge |  |
| weapon_051 |  |  | w_laser_charge |  |
| weapon_059 |  |  | w_laser_charge |  |
| weapon_064 |  | w_katana_combo_flash |  |  |
| weapon_068 | vang mat o web |  | idle, hold, axe, sword, back |  |
| weapon_073 | vang mat o web |  | w_spear_ide, w_spear, w_spear 0, switch_temp |  |
| weapon_074 |  |  | w/gun_point/light:light_ide |  |
| weapon_075 |  |  | w/gun_point/light:light_ide |  |
| weapon_089 |  |  | New State, w_magic_bow_special_hold |  |
| weapon_093 |  |  | w_laser_charge |  |
| weapon_095 | vang mat o web |  | w_ide, atk, weapon_pistol 0 |  |
| weapon_099 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword2 |  |
| weapon_108 |  |  | w_laser_charge |  |
| weapon_120 |  | w_caliburn_hold, w_caliburn_sp_hold | w_caliburn_ide |  |
| weapon_121 |  |  | w_laser_charge |  |
| weapon_124 | vang mat o web |  | w_ide, weapon_pistol, weapon_pistol 0, pistol_rotate, fire |  |
| weapon_128 |  | w_wkn_smg_ide, w_wkn_rife_ide |  |  |
| weapon_132 | vang mat o web |  | New State, rifle, rifle 0, switch_temp, w_m4, w_wkn_smg_ide, w_wkn_rife_ide |  |
| weapon_133 | vang mat o web |  | w_spear_ide, w_spear, w_spear 0, switch_temp |  |
| weapon_144 | vang mat o web |  | w_spear_ide, w_spear, w_spear 0, switch_temp |  |
| weapon_147 |  |  | w_laser_charge |  |
| weapon_148 |  |  | w_laser_charge |  |
| weapon_149 |  |  | w/gun_point/light:light_ide |  |
| weapon_150 | vang mat o web |  | w_spear_ide, w_spear, w_spear 0, switch_temp |  |
| weapon_162 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword2, w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_163 |  |  | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_164 |  |  | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_165 |  |  | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_166 |  |  | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_167 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword2, w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_168 |  |  | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_169 | vang mat o web |  | w_spear_ide, w_spear, w_spear 0, switch_temp |  |
| weapon_171 |  |  | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_175 | vang mat o web |  | w_ide, weapon_pistol, weapon_pistol 0, pistol_rotate, fire |  |
| weapon_181 |  | w_181_atk_sp |  |  |
| weapon_185 |  |  | w_laser_charge |  |
| weapon_187 |  |  | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_188 |  |  | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_189 | vang mat o web |  | w_sword_ide, w_sword 0, w_sword_ide_inverse, back, back_ready, w_sword2 |  |
| weapon_191 | vang mat o web |  | w_sword_ide, w_hammer, w_hammer_b, back |  |
| weapon_195 | vang mat o web |  | w_staff1, New State |  |
| weapon_198 | vang mat o web |  | idle, hold, axe, sword, back |  |
| weapon_200 |  |  | w_laser_charge |  |
| weapon_203 | vang mat o web |  | idle, throw, sword, switch_temp, throw_prepare, spear, check_mode, check_mode_t, w_wkn_smg_ide, w_wkn_rife_ide |  |
| weapon_204 | vang mat o web |  | idle, throw, sword, switch_temp, throw_prepare, spear, check_mode, check_mode_t, w_wkn_smg_ide, w_wkn_rife_ide |  |
| weapon_205 |  |  | w_wkn_smg_ide, w_wkn_rife_ide |  |
| weapon_206 | vang mat o web |  | idle, throw, sword_t, throw_prepare, check_mode, w_ide, back, check_mode 0, throw_t, sowrd (+2) |  |
| weapon_208 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword2 |  |
| weapon_211 |  |  | idle, drink, atk, prepare, rotate |  |
| weapon_213 | vang mat o web |  | idle, drink, atk, prepare, rotate |  |
| weapon_214 | vang mat o web |  | w_staff1, New State, w_staff 0, w_staff, drink |  |
| weapon_215 | vang mat o web |  | w_ghost_inactive, w_ghost_idle, w_rifle, w_ghost_drop, stop_switch |  |
| weapon_216 |  |  | w_wkn_smg_ide, w_wkn_rife_ide |  |
| weapon_224 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword2, w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_225 | vang mat o web | w_sword_ide, w_sword 0, back, back_ready, w_sword2 |  |  |
| weapon_232 | vang mat o web | w:weapon_232_idle | w_staff1, New State, w_staff 0, w_staff, w_channel_staff |  |
| weapon_233 |  | normal_idle, hungry_idle, normal_atk, hungry_atk |  |  |
| weapon_234 |  |  | w_show_charge_ide, w_show_charge |  |
| weapon_235 |  |  | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_237 |  | w_caculator_normal_ide, w_caculator_666_ide |  |  |
| weapon_238 | vang mat o web |  | w_camera_ide, weapon_pistol, weapon_pistol 0 |  |
| weapon_240 | vang mat o web |  | w_ide, weapon_pistol, weapon_pistol 0, pistol_rotate, fire |  |
| weapon_242 | vang mat o web |  | w_ide, weapon_pistol, weapon_pistol 0, pistol_rotate, fire |  |
| weapon_244 | vang mat o web |  | w_staff1, New State |  |
| weapon_245 |  |  | w/w/light:light_ide |  |
| weapon_246 |  | w/effect_thunder:effect | w_sword_wind_light_mode_normal, w_sword_wind_light_mode_start, w_sword_wind_light_mode_end, w_sword_wind_light_mode |  |
| weapon_248 | vang mat o web |  | w_ide, weapon_pistol, weapon_pistol 0, pistol_rotate, fire |  |
| weapon_252 | vang mat o web |  | idle, launch, launch_t, back |  |
| weapon_253 | vang mat o web |  | inactive, atk_2, atk_1, active, atk_t, atk_3 |  |
| weapon_254 | vang mat o web |  | w_staff1, New State, w_staff 0, w_staff, w_staff_anubis_mummy |  |
| weapon_255 | vang mat o web |  | w_ide, weapon_pistol, weapon_pistol 0, pistol_rotate, fire |  |
| weapon_265 | vang mat o web |  | w_ide, w_265_atk_t, w_265_atk_b |  |
| weapon_267 |  |  | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_270 |  | weapon_270_normal, weapon_270_use |  |  |
| weapon_273 | vang mat o web | whistle, whistle_trigger | w_ide |  |
| weapon_274 |  | weapon_274_sprite, weapon_274_buffactive |  |  |
| weapon_278 |  | w/effect_thunder:effect |  |  |
| weapon_279 | vang mat o web |  | w_laser 0, w_laser, w_sword_eat |  |
| weapon_280 | vang mat o web |  | w_laser 0, w_laser, w_sword_eat |  |
| weapon_281 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword_eat, w_sword2 |  |
| weapon_282 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword_eat, w_sword2 |  |
| weapon_283 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword2 |  |
| weapon_284 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword_eat, w_sword2 |  |
| weapon_288 | vang mat o web |  | w_ide, rifle, rifle 0, switch_temp, fire, w_rifle_131 |  |
| weapon_289 | vang mat o web |  | w_ide, rifle, rifle 0, switch_temp, fire, w_rifle_131 |  |
| weapon_291 | vang mat o web |  | inactive, atk_2, atk_1, active, atk_t, hold, hold_max, hold_attack |  |
| weapon_292 |  |  | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_293 |  |  | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_295 | vang mat o web |  | w_ide, rifle, rifle 0, switch_temp, fire, w_rifle_131 |  |
| weapon_297 | vang mat o web |  | w_laser 0, w_laser, w_laser_no_move, w_laser_blade, w_laser_spear, w_laser_charge |  |
| weapon_298 |  |  | w_laser_charge |  |
| weapon_301 | vang mat o web |  | w_spear_ide, switch_temp_2, axe, axe_t, atk_t3, switch_temp_0, switch_temp_1, w_sword 0, w_sword2, w_axe (+6) |  |
| weapon_303 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword2, w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_304 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword2 |  |
| weapon_305 | vang mat o web |  | idle, throw, sword, switch_temp, throw_prepare, spear, check_mode, check_mode_t, w_wkn_smg_ide, w_wkn_rife_ide |  |
| weapon_306 | vang mat o web |  | w_sword_ide, w_hammer, w_hammer_b, back, w_hammer_s |  |
| weapon_307 | vang mat o web |  | w_sword_ide, w_sword 0, back, w_dark_knight_sword2, w_dark_knight_dash, w_dark_knight_block, w_dark_knight_block_atk, w_dark_knight_rolling, w_dark_knight_sp, w_dark_knight_sp2 (+1) |  |
| weapon_309 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword2, w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate, w/sub_container (1):w_throw_sub_idle, w/sub_container (1):w_throw_sub_create (+1) |  |
| weapon_311 |  |  | w_wkn_smg_ide, w_wkn_rife_ide |  |
| weapon_312 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword2, w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_313 |  |  | w_staff1, New State, w_staff 0, w_staff, drink |  |
| weapon_316 | vang mat o web | w_bow0, w_bow2, w_bow1 |  |  |
| weapon_317 | vang mat o web |  | w_sword_ide, atk, switch_temp, prepare, w_throw_prepare, w_throw_atk, w_sting, w_hold, w_throw_prepare_max_charge, w_throw_atk_max_charge (+7) |  |
| weapon_320 | vang mat o web | rifle, rifle 0 | New State, switch_temp |  |
| weapon_329 |  | w/sub_container:w_throw_sub_329_idle, w/sub_container:w_throw_sub_329_evo | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_330 |  |  | w_laser_charge |  |
| weapon_331 | vang mat o web |  | idle, drink, atk, prepare, rotate |  |
| weapon_333 | vang mat o web |  | w_ide, weapon_pistol, weapon_pistol 0 |  |
| weapon_334 | vang mat o web | face:show_face, face:hide_face, face:keep_face | Empty, attack, attack 0, attack 1, ai_attack, w_simple_idle, face:idle, face:boss26_weapon_keep_hidingFace |  |
| weapon_339 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword2, w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_340 | vang mat o web |  | w_staff1, New State, w_staff 0, w_staff, drink |  |
| weapon_342 |  | w_kingOfHero_hold | w_kingOfHero_ide |  |
| weapon_344 | vang mat o web |  | w_staff1, New State, w_staff 0, w_staff, drink |  |
| weapon_345 |  | super_1, super_0 | New State |  |
| weapon_346 | vang mat o web | idle, opening, closing, summon, summon_anim, checkCanOpen |  |  |
| weapon_348 | vang mat o web |  | w_bow0, w_bow2, w_bow1 |  |
| weapon_349 | vang mat o web |  | w_bow0, w_bow2, w_bow1 |  |
| weapon_352 | vang mat o web |  | w_staff1, New State, w_staff 0, w_staff, drink |  |
| weapon_353 | vang mat o web |  | w_staff1, New State, w_staff 0, w_staff, drink |  |
| weapon_354 | vang mat o web | Melee | w_spear_ide, switch_temp, Shoot, AttackStart |  |
| weapon_355 | vang mat o web |  | idle |  |
| weapon_357 | vang mat o web | w_laser_robot_queen_idle_floor, w_laser_robot_queen_atk_0, w_laser_robot_queen_atk_1, w_laser_robot_queen_atk_2, w_laser_robot_queen_atk_0_to_1, w_laser_robot_queen_atk_1_to_2 0, w_laser_robot_queen_atk_0 0, New State, back |  |  |
| weapon_358 | vang mat o web | w_sword_ide, w_sword 0, back, back_ready, w_sword_ide_queen_slap_on_floor, w_sword2 |  |  |
| weapon_359 | vang mat o web | weapon_359_atk1, weapon_359_atk3, weapon_359_hold | ide, weapon_359_atk2, weapon_359_atk0 |  |
| weapon_360 |  |  | w_laser_charge |  |
| weapon_362 | vang mat o web |  | w_bow0, w_bow2, w_bow1, w_bow1_mode_0 |  |
| weapon_363 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready |  |
| weapon_364 | vang mat o web |  | New State, rifle, rifle 0, switch_temp |  |
| weapon_365 | vang mat o web |  | New State, rifle, rifle 0, switch_temp |  |
| weapon_368 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword_eat, w_sword2, w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_369 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword_eat, w_sword2, w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_372 | vang mat o web | weapon372_change_fire, weapon372_change_ice, weapon372_change_thunder, weapon372_thunder_sprite, weapon372_ice_sprite, weapon372_fire_sprite | w_staff_idle, w_staff_normal_atk, w_staff_charging, drink, w_staff_hold_atk, w_staff_normal_atk2, w_crossbow_back |  |
| weapon_373 | vang mat o web |  | w_crossbow_idle, w_prequel_normal_atk, w_crossbow_back, w_crossbow_atk_special |  |
| weapon_376 |  | w_sword_376_idle, w_sword_376_half |  |  |
| weapon_382 | vang mat o web | SuperAtk | Start, Atk_Pet, Atk, BoomAtk |  |
| weapon_384 | vang mat o web |  | idle, idle2, atk, w_staff, drink |  |
| weapon_388 | vang mat o web | w_hammer_t, w_hammer_2 | w_sword_ide, w_hammer, back |  |
| weapon_389 | vang mat o web | weapon_359_atk1, weapon_389_atk0, weapon_389_cd | ide |  |
| weapon_392 | vang mat o web |  | start, New State, atk |  |
| weapon_393 | vang mat o web | atk, atk1, atk_pre | New State |  |
| weapon_394 | vang mat o web |  | w_394_idle, w_394_slash_2, w_394_slash_1, w_394_hammer_hit |  |
| weapon_395 | vang mat o web | w_staff1, New State, w_staff 0, w_staff | drink |  |
| weapon_396 | vang mat o web | w_396_rot | w_ide, weapon_pistol, weapon_pistol 0, pistol_rotate |  |
| weapon_397 | vang mat o web |  | w_ide, rifle, rifle 0, switch_temp, fire, w_rifle_131 |  |
| weapon_399 | vang mat o web |  | w_billiard_idle, w_billiards_1, w_billiard_2, w_billiard_idle 0 |  |
| weapon_400 | vang mat o web |  | idle, hold, axe, sword, back, storm_axe_throw |  |
| weapon_401 | vang mat o web | mouseComputer_front, mouseComputer_back, mouseComputer_front_atk, mouseComputer_back_atk, mouseComputer_front_atk 0 |  |  |
| weapon_402 | vang mat o web | eye_atk, eye_atk 0 |  |  |
| weapon_403 | vang mat o web | w_sword_ide, axe, sword_t | sword 2, sword 1, weapon403_hold |  |
| weapon_404 | vang mat o web |  | w_sword_ide, w_sword 0, move, w_sword2 |  |
| weapon_405 | vang mat o web | weapon_405_sword_light | w_sword_ide, w_sword 0, back, back_ready, w_sword2 |  |
| weapon_407 | vang mat o web |  | idle, throw, sword_t, throw_prepare, check_mode, w_ide, back, check_mode 0, throw_t, sowrd (+2) |  |
| weapon_408 | vang mat o web |  | New State, w_smg 0, w_smg, w_rifle |  |
| weapon_409 | vang mat o web |  | w_crossbow_idle, milk_tea_atk, milk_tea_charging, milk_tea_back |  |
| weapon_410 | vang mat o web | w_sword_ide, w_annihilation_b, back, w_annihilation_1_end, w_annihilation_1_loop, w_annihilation_t | w_annihilation_1_start |  |
| weapon_412 | vang mat o web |  | w_ide, weapon_pistol, weapon_pistol 0, pistol_rotate, fire |  |
| weapon_413 | vang mat o web |  | w_ide, weapon_pistol, weapon_pistol 0, pistol_rotate, fire |  |
| weapon_414 | vang mat o web | weapon_414_effect | ide, atk, back, w_staff_hold_devilHorns, New State |  |
| weapon_415 | vang mat o web |  | w_ide, weapon_pistol, w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_416 | vang mat o web |  | w_sword_ide, w_sword 0, w_sword_ide_inverse, back, back_ready, w_sword2 |  |
| weapon_417 | vang mat o web | weapon_417_sprite_idle, weapon_417_sprite_transit, weapon_417_sprite_idle_high, weapon_417_sprite_idle_x | w_inactive_417, idle, back, w_staff_417_loop, w_staff_417, weapon_417_x, w_staff_417_back |  |
| weapon_900 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword2 |  |
| weapon_901 | vang mat o web |  | w_sword_ide, w_sword 0, back, back_ready, w_sword2 |  |
| weapon_902 | vang mat o web |  | w_spear_ide, w_spear, w_spear 0, switch_temp, w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |
| weapon_903 |  |  | w/sub_container:w_throw_sub_idle, w/sub_container:w_throw_sub_create, w/sub_container:rotate |  |

## pets

| thuc the | ghi chu | thieu-sprite | thieu-transform | lech-khung |
|---|---|---|---|---|
| druid_vine | vang mat o web | char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0 (+3) |  |
| druid_vine_s10 | vang mat o web | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| druid_vine_s11 | vang mat o web | char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0 (+3) |  |
| druid_vine_s12 | vang mat o web | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| druid_vine_s13 | vang mat o web | char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0 (+3) |  |
| druid_vine_s14 | vang mat o web | tentacle_atk, tentacle_ide, tentacle_atk_no_warn, char_dizzy, char_tap_dead | tentacle_show, tentacle_hide, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| druid_vine_s15 | vang mat o web | char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0 (+3) |  |
| druid_vine_s16 | vang mat o web | tentacle_ide, char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp (+2) |  |
| druid_vine_s17 | vang mat o web | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| druid_vine_s18 | vang mat o web | char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0 (+3) |  |
| druid_vine_s19 | vang mat o web | tentacle_atk, tentacle_hide, tentacle_show, tentacle_atk_no_warn, tentacle_show_s19_2, tentacle_show_s19_1, tentacle_ide, tentacle_ide 0, tentacle_atk 0, tentacle_atk_no_warn 0 (+5) | char_hit, char_hide_tap, img/h1/weapon:New State, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp |  |
| druid_vine_s2 | vang mat o web | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| druid_vine_s20 | vang mat o web | tentacle_atk, tentacle_show, tentacle_atk_no_warn, tentacle_show_s19_2, tentacle_show_s19_1, tentacle_ide, tentacle_ide 0, tentacle_atk 0, tentacle_atk_no_warn 0, tentacle_atk_no_warn 0 0 (+6) | tentacle_hide, char_hit, char_hide_tap, img/h1/weapon:New State, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp |  |
| druid_vine_s22 | vang mat o web | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| druid_vine_s24 | vang mat o web | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| druid_vine_s26 | vang mat o web | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| druid_vine_s27 | vang mat o web | tentacle_ide, char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp (+2) |  |
| druid_vine_s29 | vang mat o web | tentacle_ide, char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp (+2) |  |
| druid_vine_s4 | vang mat o web | char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0 (+3) |  |
| druid_vine_s5 | vang mat o web | char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0 (+3) |  |
| druid_vine_s6 | vang mat o web | char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0 (+3) |  |
| druid_vine_s7 | vang mat o web | char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_hit, char_hide_tap, tentacle_cloud_show_s7, tentacle_cloud_ide_s7, tentacle_cloud_hide_s7 (+6) |  |
| druid_vine_s8 | vang mat o web | char_dizzy, char_tap_dead | tentacle_show, tentacle_atk, tentacle_hide, tentacle_ide, tentacle_atk_no_warn, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0 (+3) |  |
| druid_vine_s9 | vang mat o web | tentacle_atk, tentacle_ide, tentacle_atk_no_warn, char_dizzy, char_tap_dead | tentacle_show, tentacle_hide, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| ex_npc_skeleton_01 | vang mat o web | skeleton01_ide, skeleton01_run, skeleton01_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| ex_npc_skeleton_02 | vang mat o web | skeleton01_ide, skeleton01_run, skeleton01_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_bow0, img/h1/weapon:w_bow2, img/h1/weapon:w_bow1 |  |
| npc_skeleton_01 | vang mat o web | skeleton01_ide, skeleton01_run, skeleton01_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| npc_skeleton_01_s1 | vang mat o web | skeleton01_ide, skeleton01_run, skeleton01_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| npc_skeleton_02 | vang mat o web | skeleton01_ide, skeleton01_run, skeleton01_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_bow0, img/h1/weapon:w_bow2, img/h1/weapon:w_bow1 |  |
| npc_skeleton_02_s1 | vang mat o web | skeleton01_ide, skeleton01_run, skeleton01_dead, char_dizzy, char_tap_dead, weapon_317_skin_1_sprite | char_hit, char_hide_tap, img/h1/weapon:w_bow0, img/h1/weapon:w_bow2, img/h1/weapon:w_bow1 |  |
| npc_skeleton_03 | vang mat o web | skeleton01_startup, skeleton01_run, skeleton01_dead, skeleton01_ide, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_hammer, img/h1/weapon:w_hammer_b, img/h1/weapon:back |  |
| npc_skeleton_04 | vang mat o web | skeleton02_ide, skeleton02_run, skeleton02_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| npc_skeleton_04_s1 | vang mat o web | skeleton02_ide, skeleton02_run, skeleton02_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| npc_skeleton_05 | vang mat o web | skeleton02_ide, skeleton02_run, skeleton02_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_bow0, img/h1/weapon:w_bow2, img/h1/weapon:w_bow1 |  |
| npc_skeleton_05_s1 | vang mat o web | skeleton02_ide, skeleton02_run, skeleton02_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_bow0, img/h1/weapon:w_bow2, img/h1/weapon:w_bow1 |  |
| npc_snow_fox_golden | vang mat o web | snow_fox_ide, snow_fox_run, snow_fox_golden_atk2, snow_fox_golden_atk, char_dizzy | snow_fox_dead, char_hit, char_hide_tap, char_tap_dead, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| npc_snow_fox_golden_s1 | vang mat o web | snow_fox_ide, snow_fox_run, snow_fox_golden_atk2, snow_fox_golden_atk, char_dizzy | snow_fox_dead, char_hit, char_hide_tap, char_tap_dead, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| npc_snowman | vang mat o web | ide, run, dead, yeti01_atk, char_dizzy, char_tap_dead | char_hit, char_hide_tap |  |
| npc_snowman_s1 | vang mat o web | ide, run, dead, yeti01_atk, char_dizzy, char_tap_dead | char_hit, char_hide_tap |  |
| pet_relicScarabFire | vang mat o web | ide, run, dead, lilMushroomMan_gas, char_dizzy, char_tap_dead | char_hit, char_hide_tap |  |
| pet_relicScarabIce | vang mat o web | ide, run, dead, lilMushroomMan_gas, char_dizzy, char_tap_dead | char_hit, char_hide_tap |  |
| pet_relicScarabPoison | vang mat o web | ide, run, dead, lilMushroomMan_gas, char_dizzy, char_tap_dead | char_hit, char_hide_tap |  |
| plasmonic_drone | vang mat o web |  | Idle, Deactive, Active, img/h1/smg:New State, img/h1/smg:w_smg 0, img/h1/smg:w_smg, img/h1/smg:w_rifle |  |
| plasmonic_drone_s1 | vang mat o web | Idle, Attack, Deactive, Active, idle_red, deactive_red, Attack_red, deactive_red_s1 0, deactive_red_s1 1, active_red | img/h1/smg:New State, img/h1/smg:w_smg 0, img/h1/smg:w_smg, img/h1/smg:w_rifle |  |
| vcmech | vang mat o web | vcmech_summon, VcMech_run, VcMech_ide, vcmech_leave, char_tap_dead, char_angry, char_dizzy | VcMech_dead, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h1/weapon:pistol_rotate, img/h1/weapon:fire, img/h2/weapon:w_ide, img/h2/weapon:rifle (+4) |  |
| vcmech_s1 | vang mat o web | vcmech_summon, VcMech_run, VcMech_ide, vcmech_leave, char_tap_dead, char_angry, char_dizzy, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0 | VcMech_dead, char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:pistol_rotate, img/h2/weapon:w_ide, img/h2/weapon:rifle, img/h2/weapon:rifle 0, img/h2/weapon:switch_temp, img/h2/weapon:fire (+1) |  |

## mounts

| thuc the | ghi chu | thieu-sprite | thieu-transform | lech-khung |
|---|---|---|---|---|
| mbear | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s1 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s10 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s11 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s12 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s13 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s14 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s15 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s16 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s17 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s18 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s19 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s2 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s20 | vang mat o web | ide, run, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | dead, char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s22 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s24 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s26 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s27 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s29 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s4 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s5 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s6 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s7 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s8 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mbear_s9 | vang mat o web | ide, run, dead, attack, m_attack, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mboar | vang mat o web | ide, run, dead, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| mboar2 | vang mat o web | ide, run, dead, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp, img/h1/mboar2:w_spear_ide, img/h1/mboar2:switch_temp, img/h1/mboar2:laser, img/h1/mboar2:atk_start (+1) |  |
| mcristal | vang mat o web | ide, run, dead, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp, img/h1/mcristal:w_ide, img/h1/mcristal:rifle, img/h1/mcristal:rifle 0, img/h1/mcristal:switch_temp (+2) |  |
| mcristal_gold | vang mat o web | ide, run, dead, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp, img/h1/mcristal:w_ide, img/h1/mcristal:rifle, img/h1/mcristal:rifle 0, img/h1/mcristal:switch_temp (+2) |  |
| mspider | vang mat o web | ide, run, dead, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp, img/h1/mspider:w_ide, img/h1/mspider:weapon_pistol, img/h1/mspider:weapon_pistol 0, img/h1/mspider:pistol_rotate (+1) |  |
| mvaken | vang mat o web | ide, run, dead, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp, img/h1/e_worm01:w_ide, img/h1/e_worm01:weapon_pistol, img/h1/e_worm01:weapon_pistol 0, img/h1/e_worm01:pistol_rotate (+1) |  |

## hall

| thuc the | ghi chu | thieu-sprite | thieu-transform | lech-khung |
|---|---|---|---|---|
| hero_room/common#abing_0_normal | vang mat o web | sleep, run, idle_1, idle_3, idle_3_start, idle, idle_2, idle_4, idle_3_loop, idle_3_end (+4) |  |  |
| hero_room/common#bossrush_entrance_gate | vang mat o web | create_gate, transfer_gate, close_gate | normal/glow/glow:transfer_gate_glow, normal/inner:transfer_gate_hole, pure/glow/glow:transfer_gate_glow, pure/inner:transfer_gate_hole |  |
| hero_room/common#chest_0_normal | vang mat o web | ring_root/ring1/ring_0/w/gun_point/bullet:chain_ide, body:chest_idle | chest_open, chest_close, ring_root/ring1/ring_0:w_ide, ring_root/ring1/ring_0:atk, ring_root/ring1/ring_0:weapon_pistol 0, ring_root/ring2/ring_1:w_ide, ring_root/ring2/ring_1:atk, ring_root/ring2/ring_1:weapon_pistol 0, ring_root/ring3/ring_2:w_ide, ring_root/ring3/ring_2:atk (+4) |  |
| hero_room/common#chest_material | vang mat o web |  | chest_open, chest_close |  |
| hero_room/common#daily_package_0_normal | vang mat o web |  | chest_open, chest_close |  |
| hero_room/common#function | vang mat o web | pet_slot/wild_pet_normal:ide, pet_slot/wild_pet_normal:run, pet_slot/wild_pet_normal:atk, pet_slot/wild_pet_normal:action idle, stuffs_slot/weapon_shower:w_sword_ide, stuffs_slot/weapon_shower:w_sword 0 | pet_slot/wild_pet_normal:pet00_hit, stuffs_slot/weapon_shower:atk, stuffs_slot/weapon_shower:atk 0, stuffs_slot/weapon_shovel:w_sword_ide, stuffs_slot/weapon_shovel:w_sword 0, stuffs_slot/weapon_shovel:back, stuffs_slot/weapon_shovel:back_ready, stuffs_slot/weapon_shovel:w_sword2 |  |
| hero_room/common#gem | vang mat o web | coin_silver, coin_copper, coin_gold, gem, star_coin |  |  |
| hero_room/common#magic_protal2 | vang mat o web | transfer_gate_02:transfer_gate | transfer_gate_02:create_gate, transfer_gate_02/light:light_ide |  |
| hero_room/common#npc_cooker | vang mat o web | idle |  |  |
| hero_room/common#npc_cooker_hide | vang mat o web | idle |  |  |
| hero_room/common#npc_decoration_captain | vang mat o web | idle |  |  |
| hero_room/common#plutus_cat_0_christmas | vang mat o web | plutus_ide |  |  |
| hero_room/common#plutus_cat_0_easter | vang mat o web | plutus_ide |  |  |
| hero_room/common#plutus_cat_0_halloween | vang mat o web | plutus_ide |  |  |
| hero_room/common#plutus_cat_0_normal | vang mat o web | plutus_ide |  |  |
| hero_room/common#room_egg | vang mat o web | egg_yellow_idle, egg_yellow_open, egg_yellow_broken |  |  |
| hero_room/common#room_egg_sping_festival | vang mat o web | egg_yellow_idle, egg_yellow_open, egg_yellow_broken |  |  |
| hero_room/common#room_seller | vang mat o web | npc01:npc01_ide, container0/television:television |  |  |
| hero_room/common#station | vang mat o web |  | light_effect:light_ide |  |
| hero_room/common#token_machine | vang mat o web | closed, open |  |  |
| hero_room/common#tv_0_christmas | vang mat o web | tab:Idle, tab:Transition | tv_ide |  |
| hero_room/common#tv_0_normal | vang mat o web | tab:Idle, tab:Transition | tv_ide |  |
| hero_room/common#tv_0_spring_festival | vang mat o web | tab:Idle, tab:Transition | tv_ide |  |
| hero_room/common#uinarrativedialog_abing_intro | vang mat o web |  | continue/text:ui_text_blinked, continue/text:ui_text_blinked_hide, skip/text:ui_text_blinked, skip/text:ui_text_blinked_hide |  |
| hero_room/common#way_battle | vang mat o web |  | way_battle |  |
| hero_room/common#window_attribute_furniture | vang mat o web |  | hide_window, show_window |  |
| hero_room/common#window_decoration_captain | vang mat o web |  | body/buy_hero_skin_panel:show_skin |  |
| hero_room/common#window_furniture | vang mat o web |  | hide_window, show_window |  |
| hero_room/common#window_plant_pot | vang mat o web |  | hide_window, show_window |  |
| hero_room/garden/skin_0#garden_0_christmas | vang mat o web | function/stake_slot/stake:char_hit, function/retired_knight_slot/npc_retired_knight:npc_retired_knight_idle, function/pet_slot/wild_pet_normal:ide, function/pet_slot/wild_pet_normal:run, function/pet_slot/wild_pet_normal:atk, function/pet_slot/wild_pet_normal:action idle, function/stuffs_slot/weapon_shower:w_sword_ide, function/stuffs_slot/weapon_shower:w_sword 0 | function/pet_slot/wild_pet_normal:pet00_hit, function/stuffs_slot/weapon_shower:atk, function/stuffs_slot/weapon_shower:atk 0, function/stuffs_slot/weapon_shovel:w_sword_ide, function/stuffs_slot/weapon_shovel:w_sword 0, function/stuffs_slot/weapon_shovel:back, function/stuffs_slot/weapon_shovel:back_ready, function/stuffs_slot/weapon_shovel:w_sword2 |  |
| hero_room/garden/skin_0#garden_0_halloween | vang mat o web | function/stake_slot/stake:char_hit, function/retired_knight_slot/npc_retired_knight:npc_retired_knight_idle, function/pet_slot/wild_pet_normal:ide, function/pet_slot/wild_pet_normal:run, function/pet_slot/wild_pet_normal:atk, function/pet_slot/wild_pet_normal:action idle, function/stuffs_slot/weapon_shower:w_sword_ide, function/stuffs_slot/weapon_shower:w_sword 0 | function/pet_slot/wild_pet_normal:pet00_hit, function/stuffs_slot/weapon_shower:atk, function/stuffs_slot/weapon_shower:atk 0, function/stuffs_slot/weapon_shovel:w_sword_ide, function/stuffs_slot/weapon_shovel:w_sword 0, function/stuffs_slot/weapon_shovel:back, function/stuffs_slot/weapon_shovel:back_ready, function/stuffs_slot/weapon_shovel:w_sword2 |  |
| hero_room/garden/skin_0#garden_0_normal | vang mat o web | function/stake_slot/stake:char_hit, function/retired_knight_slot/npc_retired_knight:npc_retired_knight_idle, function/pet_slot/wild_pet_normal:ide, function/pet_slot/wild_pet_normal:run, function/pet_slot/wild_pet_normal:atk, function/pet_slot/wild_pet_normal:action idle, function/stuffs_slot/weapon_shower:w_sword_ide, function/stuffs_slot/weapon_shower:w_sword 0 | function/pet_slot/wild_pet_normal:pet00_hit, function/stuffs_slot/weapon_shower:atk, function/stuffs_slot/weapon_shower:atk 0, function/stuffs_slot/weapon_shovel:w_sword_ide, function/stuffs_slot/weapon_shovel:w_sword 0, function/stuffs_slot/weapon_shovel:back, function/stuffs_slot/weapon_shovel:back_ready, function/stuffs_slot/weapon_shovel:w_sword2 |  |
| hero_room/garden/skin_0#garden_0_spring_festival | vang mat o web | function/stake_slot/stake:char_hit, function/retired_knight_slot/npc_retired_knight:npc_retired_knight_idle, function/pet_slot/wild_pet_normal:ide, function/pet_slot/wild_pet_normal:run, function/pet_slot/wild_pet_normal:atk, function/pet_slot/wild_pet_normal:action idle, function/stuffs_slot/weapon_shower:w_sword_ide, function/stuffs_slot/weapon_shower:w_sword 0, skin/firework:firework_fire 1, skin/firework:fire_work (+1) | function/pet_slot/wild_pet_normal:pet00_hit, function/stuffs_slot/weapon_shower:atk, function/stuffs_slot/weapon_shower:atk 0, function/stuffs_slot/weapon_shovel:w_sword_ide, function/stuffs_slot/weapon_shovel:w_sword 0, function/stuffs_slot/weapon_shovel:back, function/stuffs_slot/weapon_shovel:back_ready, function/stuffs_slot/weapon_shovel:w_sword2 |  |
| hero_room/garden/skin_0#magic_well_0_normal | vang mat o web | object_fishing_spot_magicwell:normal |  |  |
| hero_room/garden/skin_0#magic_well_0_winter | vang mat o web | object_fishing_spot_magicwell:normal |  |  |
| hero_room/garden/skin_1#garden_1 | vang mat o web | function/stake_slot/stake:char_hit_right, function/stake_slot/stake:char_hit_left, function/retired_knight_slot/npc_retired_knight:npc_retired_knight_idle, function/pet_slot/wild_pet_normal:ide, function/pet_slot/wild_pet_normal:run, function/pet_slot/wild_pet_normal:atk, function/pet_slot/wild_pet_normal:action idle, function/stuffs_slot/weapon_shower:w_sword_ide, function/stuffs_slot/weapon_shower:w_sword 0 | function/pet_slot/wild_pet_normal:pet00_hit, function/stuffs_slot/weapon_shower:atk, function/stuffs_slot/weapon_shower:atk 0, function/stuffs_slot/weapon_shovel:w_sword_ide, function/stuffs_slot/weapon_shovel:w_sword 0, function/stuffs_slot/weapon_shovel:back, function/stuffs_slot/weapon_shovel:back_ready, function/stuffs_slot/weapon_shovel:w_sword2, skin/monkeys:monkey_move_0 |  |
| hero_room/garden/skin_1#magic_well_1 | vang mat o web | object_fishing_spot_magicwell:normal |  |  |
| hero_room/garden/skin_2#garden_2 | vang mat o web | function/stake_slot/stake:char_hit_right, function/stake_slot/stake:char_hit_left, function/retired_knight_slot/npc_retired_knight:npc_retired_knight_idle, function/pet_slot/wild_pet_normal:ide, function/pet_slot/wild_pet_normal:run, function/pet_slot/wild_pet_normal:atk, function/pet_slot/wild_pet_normal:action idle, function/stuffs_slot/weapon_shower:w_sword_ide, function/stuffs_slot/weapon_shower:w_sword 0 | function/pet_slot/wild_pet_normal:pet00_hit, function/stuffs_slot/weapon_shower:atk, function/stuffs_slot/weapon_shower:atk 0, function/stuffs_slot/weapon_shovel:w_sword_ide, function/stuffs_slot/weapon_shovel:w_sword 0, function/stuffs_slot/weapon_shovel:back, function/stuffs_slot/weapon_shovel:back_ready, function/stuffs_slot/weapon_shovel:w_sword2 |  |
| hero_room/garden/skin_2#magic_well_2 | vang mat o web | object_fishing_spot_magicwell:normal |  |  |
| hero_room/garden/skin_3#garden_3 | vang mat o web | function/stake_slot/stake:char_hit_right, function/stake_slot/stake:char_hit_left, function/retired_knight_slot/npc_retired_knight:npc_retired_knight_idle, function/pet_slot/wild_pet_normal:ide, function/pet_slot/wild_pet_normal:run, function/pet_slot/wild_pet_normal:atk, function/pet_slot/wild_pet_normal:action idle, function/stuffs_slot/weapon_shower:w_sword_ide, function/stuffs_slot/weapon_shower:w_sword 0 | function/pet_slot/wild_pet_normal:pet00_hit, function/stuffs_slot/weapon_shower:atk, function/stuffs_slot/weapon_shower:atk 0, function/stuffs_slot/weapon_shovel:w_sword_ide, function/stuffs_slot/weapon_shovel:w_sword 0, function/stuffs_slot/weapon_shovel:back, function/stuffs_slot/weapon_shovel:back_ready, function/stuffs_slot/weapon_shovel:w_sword2 |  |
| hero_room/garden/skin_3#magic_well_3 | vang mat o web | object_fishing_spot_magicwell:normal |  |  |
| hero_room/garden/skin_4#garden_4 | vang mat o web | function/stake_slot/stake:char_hit, function/stake_slot/stake:stake_hit_r_garden_4, function/retired_knight_slot/npc_retired_knight:npc_retired_knight_idle, function/pet_slot/wild_pet_normal:ide, function/pet_slot/wild_pet_normal:run, function/pet_slot/wild_pet_normal:atk, function/pet_slot/wild_pet_normal:action idle, function/stuffs_slot/weapon_shower:w_sword_ide, function/stuffs_slot/weapon_shower:w_sword 0 | function/pet_slot/wild_pet_normal:pet00_hit, function/stuffs_slot/weapon_shower:atk, function/stuffs_slot/weapon_shower:atk 0, function/stuffs_slot/weapon_shovel:w_sword_ide, function/stuffs_slot/weapon_shovel:w_sword 0, function/stuffs_slot/weapon_shovel:back, function/stuffs_slot/weapon_shovel:back_ready, function/stuffs_slot/weapon_shovel:w_sword2 |  |
| hero_room/garden/skin_4#magic_well_4 | vang mat o web | object_fishing_spot_magicwell:normal |  |  |
| hero_room/hall/skin_0#chest_0_christmas | vang mat o web | ring_root/ring1/ring_0/w/gun_point/bullet:chain_ide, body:chest_idle | chest_open, chest_close, ring_root/ring1/ring_0:w_ide, ring_root/ring1/ring_0:atk, ring_root/ring1/ring_0:weapon_pistol 0, ring_root/ring2/ring_1:w_ide, ring_root/ring2/ring_1:atk, ring_root/ring2/ring_1:weapon_pistol 0, ring_root/ring3/ring_2:w_ide, ring_root/ring3/ring_2:atk (+4) |  |
| hero_room/hall/skin_0#chest_0_spring_festival | vang mat o web | ring_root/ring1/ring_0/w/gun_point/bullet:chain_ide, body:chest_idle | chest_open, chest_close, ring_root/ring1/ring_0:w_ide, ring_root/ring1/ring_0:atk, ring_root/ring1/ring_0:weapon_pistol 0, ring_root/ring2/ring_1:w_ide, ring_root/ring2/ring_1:atk, ring_root/ring2/ring_1:weapon_pistol 0, ring_root/ring3/ring_2:w_ide, ring_root/ring3/ring_2:atk (+4) |  |
| hero_room/hall/skin_0#daily_package_0_christmas | vang mat o web |  | chest_open, chest_close |  |
| hero_room/hall/skin_0#daily_package_0_from_player_1 | vang mat o web |  | chest_open, chest_close |  |
| hero_room/hall/skin_0#daily_package_0_from_player_2 | vang mat o web |  | chest_open, chest_close |  |
| hero_room/hall/skin_0#daily_package_0_from_player_2_upgrade | vang mat o web |  | chest_open, chest_close |  |
| hero_room/hall/skin_0#daily_package_0_from_player_3 | vang mat o web |  | chest_open, chest_close |  |
| hero_room/hall/skin_0#daily_package_0_from_player_3_upgrade | vang mat o web |  | chest_open, chest_close |  |
| hero_room/hall/skin_0#daily_package_0_season_irontide | vang mat o web |  | chest_open, chest_close |  |
| hero_room/hall/skin_0#fish_bowl_0_normal | vang mat o web | object_fishing_spot_fishbowl:normal |  |  |
| hero_room/hall/skin_0#hall_0_christmas | vang mat o web |  | function/way_battle:way_battle |  |
| hero_room/hall/skin_0#hall_0_christmas_old | vang mat o web | objects/static/hall/multi_room_way:object_tap_ide | objects/static/hall/way_battle:object_tap_ide |  |
| hero_room/hall/skin_0#hall_0_easter | vang mat o web | objects/static/hall/multi_room_way:object_tap_ide | objects/static/hall/way_battle:object_tap_ide |  |
| hero_room/hall/skin_0#hall_0_halloween | vang mat o web |  | function/way_battle:way_battle |  |
| hero_room/hall/skin_0#hall_0_halloween_old | vang mat o web | objects/static/hall/multi_room_way:object_tap_ide | objects/static/hall/way_battle:object_tap_ide |  |
| hero_room/hall/skin_0#hall_0_normal | vang mat o web |  | function/way_battle:way_battle |  |
| hero_room/hall/skin_0#hall_0_spring_festival | vang mat o web |  | function/way_battle:way_battle |  |
| hero_room/hall/skin_0#handbook_entry_0_normal | vang mat o web |  | handbook_entry, handbook_entry_new |  |
| hero_room/hall/skin_0#room_egg_april_fool | vang mat o web | egg_yellow_idle, egg_yellow_open, egg_yellow_broken |  |  |
| hero_room/hall/skin_1#chest_1 | vang mat o web | ring_root/ring1/ring_0/w/gun_point/bullet:chain_ide | chest_open, ring_root/ring1/ring_0:w_ide, ring_root/ring1/ring_0:atk, ring_root/ring1/ring_0:weapon_pistol 0, ring_root/ring2/ring_1:w_ide, ring_root/ring2/ring_1:atk, ring_root/ring2/ring_1:weapon_pistol 0, ring_root/ring3/ring_2:w_ide, ring_root/ring3/ring_2:atk, ring_root/ring3/ring_2:weapon_pistol 0 (+3) |  |
| hero_room/hall/skin_1#daily_package_1 | vang mat o web |  | chest_open, chest_close |  |
| hero_room/hall/skin_1#fish_bowl_1 | vang mat o web | object_fishing_spot_fishbowl:normal |  |  |
| hero_room/hall/skin_1#hall_1 | vang mat o web |  | function/way_battle:way_battle |  |
| hero_room/hall/skin_1#handbook_entry_1 | vang mat o web |  | handbook_entry, handbook_entry_new |  |
| hero_room/hall/skin_1#plutus_cat_1 | vang mat o web | plutus_ide |  |  |
| hero_room/hall/skin_1#tv_1 | vang mat o web | tab:Idle, tab:Transition | tv_ide |  |
| hero_room/hall/skin_2#chest_2 | vang mat o web | ring_root/ring1/ring_0/w/gun_point/bullet:chain_ide, body:chest_idle | chest_open, chest_close, ring_root/ring1/ring_0:w_ide, ring_root/ring1/ring_0:atk, ring_root/ring1/ring_0:weapon_pistol 0, ring_root/ring2/ring_1:w_ide, ring_root/ring2/ring_1:atk, ring_root/ring2/ring_1:weapon_pistol 0, ring_root/ring3/ring_2:w_ide, ring_root/ring3/ring_2:atk (+4) |  |
| hero_room/hall/skin_2#daily_package_2 | vang mat o web |  | chest_open, chest_close |  |
| hero_room/hall/skin_2#fish_bowl_2 | vang mat o web | object_fishing_spot_fishbowl:normal |  |  |
| hero_room/hall/skin_2#hall_2 | vang mat o web |  | function/way_battle:way_battle |  |
| hero_room/hall/skin_2#handbook_entry_2 | vang mat o web |  | handbook_entry, handbook_entry_new |  |
| hero_room/hall/skin_2#plutus_cat_2 | vang mat o web | plutus_ide |  |  |
| hero_room/hall/skin_2#tv_2 | vang mat o web | tab:Idle, tab:Transition | tv_ide |  |
| hero_room/hall/skin_3#chest_3 | vang mat o web | ring_root/ring1/ring_0/w/gun_point/bullet:chain_ide | chest_open, ring_root/ring1/ring_0:w_ide, ring_root/ring1/ring_0:atk, ring_root/ring1/ring_0:weapon_pistol 0, ring_root/ring2/ring_1:w_ide, ring_root/ring2/ring_1:atk, ring_root/ring2/ring_1:weapon_pistol 0, ring_root/ring3/ring_2:w_ide, ring_root/ring3/ring_2:atk, ring_root/ring3/ring_2:weapon_pistol 0 (+3) |  |
| hero_room/hall/skin_3#daily_package_3 | vang mat o web |  | chest_open, chest_close |  |
| hero_room/hall/skin_3#fish_bowl_3 | vang mat o web | object_fishing_spot_fishbowl:normal |  |  |
| hero_room/hall/skin_3#hall_3 | vang mat o web |  | function/way_battle:way_battle, skin:hall_floor_texture |  |
| hero_room/hall/skin_3#handbook_entry_3 | vang mat o web |  | handbook_entry, handbook_entry_new |  |
| hero_room/hall/skin_3#plutus_cat_3 | vang mat o web | plutus_ide |  |  |
| hero_room/hall/skin_3#tv_3 | vang mat o web | tab:Idle, tab:Transition | tv_ide |  |
| hero_room/hall/skin_4#chest_4 | vang mat o web | chest_open, ring_root/ring1/ring_0/w/gun_point/bullet:chain_ide | ring_root/ring1/ring_0:w_ide, ring_root/ring1/ring_0:atk, ring_root/ring1/ring_0:weapon_pistol 0, ring_root/ring2/ring_1:w_ide, ring_root/ring2/ring_1:atk, ring_root/ring2/ring_1:weapon_pistol 0, ring_root/ring3/ring_2:w_ide, ring_root/ring3/ring_2:atk, ring_root/ring3/ring_2:weapon_pistol 0, ring_root/ring4/ring_3:w_ide (+2) |  |
| hero_room/hall/skin_4#daily_package_4 | vang mat o web |  | chest_open, chest_close |  |
| hero_room/hall/skin_4#fish_bowl_4 | vang mat o web | object_fishing_spot_fishbowl:normal |  |  |
| hero_room/hall/skin_4#hall_4 | vang mat o web |  | function/way_battle:way_battle |  |
| hero_room/hall/skin_4#handbook_entry_4 | vang mat o web |  | handbook_entry, handbook_entry_new |  |
| hero_room/hall/skin_4#plutus_cat_4 | vang mat o web | plutus_ide |  |  |
| hero_room/hall/skin_4#tv_4 | vang mat o web | tab:Idle, tab:Transition | tv_ide |  |
| hero_room/hall/skin_5#chest_5 | vang mat o web | ring_root/ring1/ring_0/w/gun_point/bullet:chain_ide | chest_open, ring_root/ring1/ring_0:w_ide, ring_root/ring1/ring_0:atk, ring_root/ring1/ring_0:weapon_pistol 0, ring_root/ring2/ring_1:w_ide, ring_root/ring2/ring_1:atk, ring_root/ring2/ring_1:weapon_pistol 0, ring_root/ring3/ring_2:w_ide, ring_root/ring3/ring_2:atk, ring_root/ring3/ring_2:weapon_pistol 0 (+3) |  |
| hero_room/hall/skin_5#daily_package_5 | vang mat o web |  | chest_open, chest_close |  |
| hero_room/hall/skin_5#fish_bowl_5 | vang mat o web | object_fishing_spot_fishbowl:normal |  |  |
| hero_room/hall/skin_5#hall_5 | vang mat o web |  | function/way_battle:way_battle, skin/door:door_open, skin/door:door_close, skin/door2:door_open, skin/door2:door_close |  |
| hero_room/hall/skin_5#handbook_entry_5 | vang mat o web |  | handbook_entry, handbook_entry_new |  |
| hero_room/hall/skin_5#tv_5 | vang mat o web | tab:Idle, tab:Transition | tv_ide |  |
| hero_room/magic_area/skin_0#magic_area_0_normal | vang mat o web | function/bossrush_slot/npc_bossrush_mgr:bossrush_mgr, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:create_gate, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:transfer_gate, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:close_gate, function/explorer_slot/npc_explorer:npc_explorer_ide, function/explorer_slot/npc_explorer:npc_explorer_ide_in_activity, function/explorer_slot/npc_explorer:npc_explorer_walk_in_activity, function/shaman_slot/npc_shaman:npc_magic_ide, function/defence_mode_slot/magic_protal2/transfer_gate_02:transfer_gate | function/bossrush_slot/npc_bossrush_mgr/bossrush_door/normal/glow/glow:transfer_gate_glow, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/normal/inner:transfer_gate_hole, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/pure/glow/glow:transfer_gate_glow, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/pure/inner:transfer_gate_hole, function/shaman_slot/npc_shaman:npc_magic_normal_weapon, function/shaman_slot/npc_shaman:npc_magic_hope_weapon, function/defence_mode_slot/magic_protal2/transfer_gate_02:create_gate, function/defence_mode_slot/magic_protal2/transfer_gate_02/light:light_ide, skin/magic_ball/anim_light:light_scale |  |
| hero_room/magic_area/skin_1#magic_area_1 | vang mat o web | function/bossrush_slot/npc_bossrush_mgr:bossrush_mgr, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:create_gate, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:transfer_gate, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:close_gate, function/explorer_slot/npc_explorer:npc_explorer_ide, function/explorer_slot/npc_explorer:npc_explorer_ide_in_activity, function/explorer_slot/npc_explorer:npc_explorer_walk_in_activity, function/shaman_slot/npc_shaman:npc_magic_ide, function/defence_mode_slot/magic_protal2/transfer_gate_02:transfer_gate | function/bossrush_slot/npc_bossrush_mgr/bossrush_door/normal/glow/glow:transfer_gate_glow, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/normal/inner:transfer_gate_hole, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/pure/glow/glow:transfer_gate_glow, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/pure/inner:transfer_gate_hole, function/shaman_slot/npc_shaman:npc_magic_normal_weapon, function/shaman_slot/npc_shaman:npc_magic_hope_weapon, function/defence_mode_slot/magic_protal2/transfer_gate_02:create_gate, function/defence_mode_slot/magic_protal2/transfer_gate_02/light:light_ide, skin/magic_ball/anim_light:light_scale |  |
| hero_room/magic_area/skin_2#magic_area_2 | vang mat o web | function/bossrush_slot/npc_bossrush_mgr:bossrush_mgr, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:create_gate, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:transfer_gate, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:close_gate, function/explorer_slot/npc_explorer:npc_explorer_ide, function/explorer_slot/npc_explorer:npc_explorer_ide_in_activity, function/explorer_slot/npc_explorer:npc_explorer_walk_in_activity, function/shaman_slot/npc_shaman:npc_magic_ide, function/defence_mode_slot/magic_protal2/transfer_gate_02:transfer_gate | function/bossrush_slot/npc_bossrush_mgr/bossrush_door/normal/glow/glow:transfer_gate_glow, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/normal/inner:transfer_gate_hole, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/pure/glow/glow:transfer_gate_glow, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/pure/inner:transfer_gate_hole, function/shaman_slot/npc_shaman:npc_magic_normal_weapon, function/shaman_slot/npc_shaman:npc_magic_hope_weapon, function/defence_mode_slot/magic_protal2/transfer_gate_02:create_gate, function/defence_mode_slot/magic_protal2/transfer_gate_02/light:light_ide, skin/magic_ball/anim_light:light_scale |  |
| hero_room/magic_area/skin_3#magic_area_3 | vang mat o web | function/bossrush_slot/npc_bossrush_mgr:bossrush_mgr, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:create_gate, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:transfer_gate, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:close_gate, function/explorer_slot/npc_explorer:npc_explorer_ide, function/explorer_slot/npc_explorer:npc_explorer_ide_in_activity, function/explorer_slot/npc_explorer:npc_explorer_walk_in_activity, function/shaman_slot/npc_shaman:npc_magic_ide, function/defence_mode_slot/magic_protal2/transfer_gate_02:transfer_gate | function/bossrush_slot/npc_bossrush_mgr/bossrush_door/normal/glow/glow:transfer_gate_glow, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/normal/inner:transfer_gate_hole, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/pure/glow/glow:transfer_gate_glow, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/pure/inner:transfer_gate_hole, function/shaman_slot/npc_shaman:npc_magic_normal_weapon, function/shaman_slot/npc_shaman:npc_magic_hope_weapon, function/defence_mode_slot/magic_protal2/transfer_gate_02:create_gate, function/defence_mode_slot/magic_protal2/transfer_gate_02/light:light_ide, skin/magic_ball/anim_light:light_scale |  |
| hero_room/magic_area/skin_4#magic_area_4 | vang mat o web | function/bossrush_slot/npc_bossrush_mgr:bossrush_mgr, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:create_gate, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:transfer_gate, function/bossrush_slot/npc_bossrush_mgr/bossrush_door:close_gate, function/explorer_slot/npc_explorer:npc_explorer_ide, function/explorer_slot/npc_explorer:npc_explorer_ide_in_activity, function/explorer_slot/npc_explorer:npc_explorer_walk_in_activity, function/shaman_slot/npc_shaman:npc_magic_ide, function/defence_mode_slot/magic_protal2/transfer_gate_02:transfer_gate | function/bossrush_slot/npc_bossrush_mgr/bossrush_door/normal/glow/glow:transfer_gate_glow, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/normal/inner:transfer_gate_hole, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/pure/glow/glow:transfer_gate_glow, function/bossrush_slot/npc_bossrush_mgr/bossrush_door/pure/inner:transfer_gate_hole, function/shaman_slot/npc_shaman:npc_magic_normal_weapon, function/shaman_slot/npc_shaman:npc_magic_hope_weapon, function/defence_mode_slot/magic_protal2/transfer_gate_02:create_gate, function/defence_mode_slot/magic_protal2/transfer_gate_02/light:light_ide, skin/magic_ball/anim_light:light_scale |  |
| hero_room/second_hall/skin_0#second_hall_0_normal | vang mat o web | function/npc_cooker:idle, function/npc_cooker_hide:idle, skin/decorations/worker_3:idle, skin/decorations/worker_3:run, skin/decorations/worker_3:ice_cave_miner_dig_idle, skin/decorations/worker_3:ice_cave_miner_dig, skin/decorations/worker_4:idle, skin/decorations/worker_4:run, skin/decorations/worker_4:ice_cave_miner_dig_idle, skin/decorations/worker_4:ice_cave_miner_dig (+1) | function/way_battle:way_battle |  |
| hero_room/second_hall/skin_0#second_hall_0_spring_festival | vang mat o web | function/npc_cooker:idle, function/npc_cooker_hide:idle, skin/decorations/worker_3:idle, skin/decorations/worker_3:run, skin/decorations/worker_3:ice_cave_miner_dig_idle, skin/decorations/worker_3:ice_cave_miner_dig, skin/decorations/worker_4:idle, skin/decorations/worker_4:run, skin/decorations/worker_4:ice_cave_miner_dig_idle, skin/decorations/worker_4:ice_cave_miner_dig (+1) | function/way_battle:way_battle |  |
| hero_room/work_shop/skin_0#work_shop_0_normal | vang mat o web | function/room_seller_slot/room_seller/npc01:npc01_ide, function/room_seller_slot/room_seller/container0/television:television, function/token_machine_slot/token_machine:closed, function/token_machine_slot/token_machine:open, function/decoration_captain_slot/npc_decoration_captain:idle | function/station_slot/station/light_effect:light_ide, function/chest_material_slot/chest_material:chest_open, function/chest_material_slot/chest_material:chest_close |  |
| hero_room/work_shop/skin_1#work_shop_1 | vang mat o web | function/room_seller_slot/room_seller/npc01:npc01_ide, function/room_seller_slot/room_seller/container0/television:television, function/token_machine_slot/token_machine:closed, function/token_machine_slot/token_machine:open, function/decoration_captain_slot/npc_decoration_captain:idle | function/station_slot/station/light_effect:light_ide, function/chest_material_slot/chest_material:chest_open, function/chest_material_slot/chest_material:chest_close |  |
| hero_room/work_shop/skin_2#work_shop_2 | vang mat o web | function/room_seller_slot/room_seller/npc01:npc01_ide, function/room_seller_slot/room_seller/container0/television:television, function/decoration_captain_slot/npc_decoration_captain:idle | function/station_slot/station/light_effect:light_ide, function/chest_material_slot/chest_material:chest_open, function/chest_material_slot/chest_material:chest_close, function/token_machine_slot/token_machine:closed, function/token_machine_slot/token_machine:open |  |
| hero_room/work_shop/skin_3#work_shop_3 | vang mat o web | function/room_seller_slot/room_seller/npc01:npc01_ide, function/room_seller_slot/room_seller/container0/television:television, function/token_machine_slot/token_machine:open, function/decoration_captain_slot/npc_decoration_captain:idle | function/station_slot/station/light_effect:light_ide, function/chest_material_slot/chest_material:chest_open, function/chest_material_slot/chest_material:chest_close, function/token_machine_slot/token_machine:closed |  |
| hero_room/work_shop/skin_4#work_shop_4 | vang mat o web | function/room_seller_slot/room_seller/npc01:npc01_ide, function/room_seller_slot/room_seller/container0/television:television, function/token_machine_slot/token_machine:closed, function/token_machine_slot/token_machine:open, function/decoration_captain_slot/npc_decoration_captain:idle | function/station_slot/station/light_effect:light_ide, function/chest_material_slot/chest_material:chest_open, function/chest_material_slot/chest_material:chest_close |  |

## objects

| thuc the | ghi chu | thieu-sprite | thieu-transform | lech-khung |
|---|---|---|---|---|
| common#arrow_rain | tinh; other |  | arrow_rain_move |  |
| common#bard_skill1_buff_circle | vang mat o web; statue |  | buff_idle |  |
| common#battery | tinh; other |  | battery01_ide, battery02_dead, char_hit, img/h1/smg:w_ide, img/h1/smg:m4, img/h1/smg:m4 0, img/h1/smg:fire |  |
| common#buff_astrologist | vang mat o web; statue | astrologist_buff_state_0, astrologist_buff_state_1, astrologist_buff_state_2 |  |  |
| common#buff_astrologist_fade | vang mat o web; statue |  | New Animation |  |
| common#buff_ice | vang mat o web; statue |  | disappear |  |
| common#buff_ice_c02_s12 | vang mat o web; statue |  | disappear |  |
| common#buff_ice_c02_s14 | vang mat o web; statue |  | disappear |  |
| common#buff_ice_c02_s17 | vang mat o web; statue |  | disappear |  |
| common#buff_ice_c02_s18 | vang mat o web; statue |  | disappear |  |
| common#buff_ice_c02_s19 | vang mat o web; statue |  | disappear |  |
| common#buff_ice_c02_s23 | vang mat o web; statue |  | disappear |  |
| common#buff_ice_c02_s5 | vang mat o web; statue |  | disappear |  |
| common#buff_ice_c05_s8 | vang mat o web; statue |  | disappear |  |
| common#buff_ice_medium | vang mat o web; statue |  | disappear |  |
| common#buff_ice_s15 | vang mat o web; statue |  | disappear |  |
| common#buff_ice_shield | vang mat o web; statue |  | disappear |  |
| common#buff_ice_short | vang mat o web; statue |  | disappear |  |
| common#buff_ice_stone | vang mat o web; statue |  | disappear |  |
| common#buff_ice_then_thorn | vang mat o web; statue |  | disappear |  |
| common#buff_nightmare | tinh; statue |  | buff_nightmare |  |
| common#buff_nightmare_2 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_nightmare_s1 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_nightmare_s10 | vang mat o web; statue | skin_10, skin_11_loop |  |  |
| common#buff_nightmare_s12 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_nightmare_s13 | vang mat o web; statue | buff_nightmare |  |  |
| common#buff_nightmare_s14 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_nightmare_s16 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_nightmare_s2 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_nightmare_s3 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_nightmare_s4 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_nightmare_s5 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_nightmare_s6 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_nightmare_s7 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_nightmare_s8 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_nightmare_s8_1 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_nightmare_s9 | vang mat o web; statue |  | buff_nightmare |  |
| common#buff_reward_mark | vang mat o web; statue | Start Skin 9, Start Skin 11, Start Skin 0, Start Skin 2, Start Skin 3, Start Skin 4, Start Skin 5, Start Skin 6, Start Skin 7, Start Skin 8 (+48) | Last Skin 0, Last Skin 10 |  |
| common#buff_sickle | vang mat o web; statue | icon:buff_sickle |  |  |
| common#buff_tpl3 | vang mat o web; statue |  | middle/icon:idle, middle/icon:fade, middle/isUpgrade:idle, middle/isUpgrade:fade |  |
| common#buff_tpl4 | vang mat o web; statue |  | middle/icon:idle, middle/icon:fade, middle/isUpgrade:idle, middle/isUpgrade:fade |  |
| common#buff_tpl5 | vang mat o web; statue |  | middle/icon:idle, middle/icon:fade, middle/isUpgrade:idle, middle/isUpgrade:fade |  |
| common#buff_tpl6 | vang mat o web; statue |  | middle/icon:idle, middle/icon:fade, middle/isUpgrade:idle, middle/isUpgrade:fade |  |
| common#buff_wig | vang mat o web; statue |  | buff_wig_basketball |  |
| common#buff_yin | vang mat o web; statue |  | buff_yin |  |
| common#bullet_43_no_buff | vang mat o web; statue |  | laser_short |  |
| common#bullet_9_smith | tinh; merchant |  | b_laser_start, b_laser, b_laser_end |  |
| common#bullet_boom | vang mat o web; other |  | b:boom_ide |  |
| common#bullet_boom_box_mutation | vang mat o web; chest |  | offset/b:boom_ide |  |
| common#bullet_frost | vang mat o web; other |  | gas_start, gas_end |  |
| common#bullet_smith_short | tinh; merchant |  | laser_short |  |
| common#c10_skill_atk | tinh; other |  | c10_atk_obj |  |
| common#c28_buff | vang mat o web; statue | sword_buff_empty, sword_buff |  |  |
| common#chest00 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| common#chest01 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| common#chest02 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| common#chest03 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| common#chest_gold_single_big | vang mat o web; chest |  | chest_open |  |
| common#chest_miner_level_3 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| common#chest_miner_level_4 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| common#chest_miner_level_5 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| common#chest_return_player | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| common#chest_single_big | vang mat o web; chest |  | chest_open |  |
| common#drink_bloody_mary | vang mat o web; other |  | drink |  |
| common#drink_coconut | vang mat o web; other |  | drink |  |
| common#drink_coffee | vang mat o web; other |  | drink |  |
| common#drink_forget | vang mat o web; other |  | drink |  |
| common#drink_garlic_juice | vang mat o web; other |  | drink |  |
| common#drink_jade_elixir | vang mat o web; other |  | drink |  |
| common#drink_juice | vang mat o web; other |  | drink |  |
| common#drink_milk | vang mat o web; other |  | drink |  |
| common#drink_redbull | vang mat o web; other |  | drink |  |
| common#drink_soda | vang mat o web; other |  | drink |  |
| common#drink_tea | vang mat o web; other |  | drink |  |
| common#drink_wine | vang mat o web; other |  | drink |  |
| common#effect_black_smoke | tinh; other |  | explode_smoke:gas_start, explode_smoke:gas_end |  |
| common#effect_c3_skill | tinh; other |  | effect_magic |  |
| common#effect_health_skill | tinh; other |  | effect_magic |  |
| common#effect_open_box | vang mat o web; chest | effect_open_box |  |  |
| common#effect_open_chest | vang mat o web; chest | effect03 |  |  |
| common#effect_priest_1 | tinh; other |  | skill |  |
| common#eletric_box | vang mat o web; chest | drop |  |  |
| common#explode_blast_out | tinh; other |  | explode_blast_poly_ide, explode_blast_big |  |
| common#explode_energy | vang mat o web; other |  | explode_energy |  |
| common#explode_energy2 | vang mat o web; other |  | explode_energy |  |
| common#explode_ice_box | tinh; chest |  | explode_ice_start, explode_ice, explode_ice_end |  |
| common#explode_ice_box_s10 | vang mat o web; chest |  | explode_ice_start, explode_ice, explode_ice_end |  |
| common#explode_ice_box_s11 | vang mat o web; chest | explode_ice_start, explode_ice, explode_ice_end |  |  |
| common#explode_ice_box_s12 | vang mat o web; chest |  | explode_ice_start, explode_ice, explode_ice_end |  |
| common#explode_ice_box_s13 | vang mat o web; chest |  | explode_ice_start, explode_ice, explode_ice_end |  |
| common#explode_ice_box_s14 | vang mat o web; chest |  | explode_ice_start, explode_ice, explode_ice_end |  |
| common#explode_ice_box_s15 | vang mat o web; chest | explode_ice_start, explode_ice, explode_ice_end |  |  |
| common#explode_ice_box_s17 | vang mat o web; chest | explode_ice, explode_ice_end | explode_ice_start |  |
| common#explode_ice_box_s18 | vang mat o web; chest | explode_ice_start, explode_ice, explode_ice_end |  |  |
| common#explode_ice_box_s19 | vang mat o web; chest |  | explode_ice_start, explode_ice, explode_ice_end |  |
| common#explode_ice_box_s20 | vang mat o web; chest | explode_ice_start, explode_ice, explode_ice_end |  |  |
| common#explode_ice_box_s3 | vang mat o web; chest |  | explode_ice_start, explode_ice, explode_ice_end |  |
| common#explode_ice_box_s5 | vang mat o web; chest |  | explode_ice_start, explode_ice, explode_ice_end |  |
| common#explode_ice_box_s6 | vang mat o web; chest | explode_ice | explode_ice_start, explode_ice_end, img/light_effect:light_ide |  |
| common#explode_ice_box_s7 | vang mat o web; chest |  | explode_ice_start, explode_ice, explode_ice_end |  |
| common#explode_ice_box_s8 | vang mat o web; chest | explode_ice_start, explode_ice, explode_ice_end |  |  |
| common#explode_ice_box_s9 | vang mat o web; chest | explode_ice_start, explode_ice | explode_ice_end |  |
| common#explode_poly | vang mat o web; other |  | explode_blast_poly_ide, explode_blast_poly |  |
| common#explode_poly_werewolf | tinh; other |  | explode_blast_poly_ide, explode_blast_poly |  |
| common#explode_s_hit_enemy | vang mat o web; other | explode_small, explode_big, explode_nuclear |  |  |
| common#fighter_0_0_continus_boxing | vang mat o web; chest |  | atk_1, atk_2, continous_boxing3, continous_boxing4 |  |
| common#fire2 | vang mat o web; other |  | root:gas_start, root:gas_end |  |
| common#fire_box | vang mat o web; chest | drop |  |  |
| common#gas2 | vang mat o web; other |  | gas_start, gas_end |  |
| common#gas_alchemist_0 | tinh; other |  | gas_start, gas_end |  |
| common#ice_box | vang mat o web; chest | drop |  |  |
| common#m_mech_5 | vang mat o web; other | idle, run, dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | attack, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp, img/h1/bite:w_spear_ide, img/h1/bite:w_spear, img/h1/bite:w_spear 0, img/h1/bite:switch_temp, img/h2:w_ide (+17) |  |
| common#mcloud | vang mat o web; other | char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | ide, run, dead, char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| common#mhorse | vang mat o web; other | ide, run, dead, char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| common#msword | vang mat o web; other | char_dizzy, char_tap_dead, mount_hp:teammate_bar_ide, mount_hp:ui_reborn_bar_ide | ide, run, dead, char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| common#mtao_sword | tinh; other |  | ide, run, dead, char_hit, char_hide_tap, img/h1:w_spear_ide, img/h1:w_spear, img/h1:w_spear 0, img/h1:switch_temp |  |
| common#nec_fireball | tinh; other |  | fire_ball_move |  |
| common#normal_gate | vang mat o web; portal | create_gate, transfer_gate, close_gate |  |  |
| common#npc_banker2_cage | vang mat o web; merchant | banker_ide |  |  |
| common#npc_card_1 | vang mat o web; merchant | ide, run, dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_spear_ide, img/h1/weapon:w_spear, img/h1/weapon:w_spear 0, img/h1/weapon:switch_temp |  |
| common#npc_card_2 | vang mat o web; merchant | ide, atk, dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:rifle, img/h1/weapon:rifle 0, img/h1/weapon:switch_temp, img/h1/weapon:fire, img/h1/weapon:w_rifle_131 |  |
| common#npc_card_3 | vang mat o web; merchant | ide, run, dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:inactive, img/h1/weapon:atk_2, img/h1/weapon:atk_1, img/h1/weapon:active, img/h1/weapon:atk_t, img/h1/weapon:atk_3 |  |
| common#npc_card_4 | vang mat o web; merchant | idle, run, dead, atk, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_ide, img/h1/weapon:weapon_pistol, img/h1/weapon:weapon_pistol 0, img/h1/weapon:pistol_rotate |  |
| common#npc_card_5 | vang mat o web; merchant | idle, run, dead, atk, char_tap_dead | char_hit, char_hide_tap |  |
| common#npc_gambler | vang mat o web; merchant | idle |  |  |
| common#npc_knight_golden | vang mat o web; merchant | enemy01_ide, enemy01_run, enemy01_dead, char_dizzy, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| common#npc_knight_weapon_affix_arrow_servant | vang mat o web; merchant | npc_knight_ide, npc_knight_run, npc_knight_dead, char_tap_dead | char_hit, char_hide_tap |  |
| common#npc_master_advancement | vang mat o web; merchant | npc_trainer_idle, tab:Idle, tab:Transition |  |  |
| common#npc_portable_body_boom | vang mat o web; merchant | skeleton01_ide, skeleton01_run, char_dizzy, char_tap_dead | char_hit, char_hide_tap |  |
| common#npc_portable_boom | vang mat o web; merchant | skeleton01_ide, skeleton01_run, portable_boom_pending, portable_boom_start, portable_boom_pending_0, char_dizzy, char_tap_dead | char_hit, char_hide_tap |  |
| common#npc_portable_cross_boom | vang mat o web; merchant | skeleton01_ide, skeleton01_run, portable_boom_pending, portable_boom_start, portable_boom_pending_0, char_dizzy, char_tap_dead | char_hit, char_hide_tap |  |
| common#npc_portable_ice_sculpture | vang mat o web; merchant | skeleton01_ide, skeleton01_run, char_dizzy, char_tap_dead | char_hit, char_hide_tap |  |
| common#npc_promote | vang mat o web; merchant | promote_idle |  |  |
| common#npc_promote_10 | vang mat o web; merchant | promote_idle, npc_promote5_walk |  |  |
| common#npc_promote_11 | vang mat o web; merchant | promote_idle |  |  |
| common#npc_promote_12 | vang mat o web; merchant | promote_idle |  |  |
| common#npc_promote_13 | vang mat o web; merchant |  | Spine Mecanim GameObject (Tricolor_Loong):Idle |  |
| common#npc_promote_14 | vang mat o web; merchant | promote_idle |  |  |
| common#npc_promote_16 | vang mat o web; merchant | promote_idle |  |  |
| common#npc_promote_17 | vang mat o web; merchant |  | npc_promote_16/Spine:idle |  |
| common#npc_promote_18 | vang mat o web; merchant | root/cat:cat, root/snow_man:snow_man |  |  |
| common#npc_promote_2 | vang mat o web; merchant | promote_idle |  |  |
| common#npc_promote_5 | vang mat o web; merchant | promote_idle, npc_promote5_walk | logos/logo:logo_soulknight_pre_show, logos/logo:logo_soulknight_pre_fade, logos/logo_en:logo_soulknight_pre_show, logos/logo_en:logo_soulknight_pre_fade |  |
| common#npc_promote_6 | vang mat o web; merchant | promote_idle, npc_promote5_walk |  |  |
| common#npc_promote_7 | vang mat o web; merchant | promote_idle, walk, npc_promote7_idle1, npc_promote7_idle2, npc_promote7_idle3 |  |  |
| common#npc_promote_8 | vang mat o web; merchant | promote_idle, npc_promote5_walk |  |  |
| common#npc_promote_9 | vang mat o web; merchant | promote_idle, npc_promote5_walk |  |  |
| common#npc_promote_h5 | vang mat o web; merchant | promote_idle, atk_0, atk_1, atk_2, run |  |  |
| common#npc_prophet | vang mat o web; merchant | idle |  |  |
| common#npc_retired_knight | vang mat o web; merchant | npc_retired_knight_idle |  |  |
| common#npc_seller | vang mat o web; merchant | idle |  |  |
| common#npc_skill_update | vang mat o web; merchant | npc_trainer_idle |  |  |
| common#npc_trainer | vang mat o web; merchant | npc_trainer_idle |  |  |
| common#npc_warliege | vang mat o web; merchant | idle, run |  |  |
| common#npc_weapon_collector | vang mat o web; merchant | npc_weapon_collector_idle, npc_weapon_collector_run, npc_weapon_collector_weapon |  |  |
| common#portal | portal |  | glow/glow:transfer_gate_glow, inner:transfer_gate_hole |  |
| common#proj_thunder | tinh; other |  | thunder_child:thunder |  |
| common#relic_transfer_gate | vang mat o web; portal | create_gate, transfer_gate, close_gate | scale/glow/glow:transfer_gate_glow, scale/inner:transfer_gate_hole |  |
| common#shield | tinh; other |  | shield_ide, shield_close, shield_open, shield_idle_rotate |  |
| common#shield_wave | tinh; other |  | show |  |
| common#shipwreck_chest | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| common#show_effect_wolf | tinh; other |  | skill |  |
| common#sword_403_buff | vang mat o web; statue | b_sword |  |  |
| common#sword_dash | tinh; other |  | b_sword |  |
| common#sword_sweep | tinh; other |  | b_sword |  |
| common#target | tinh; other |  | lock_target, lock_target2 |  |
| common#target2 | tinh; other |  | lock_target, lock_target2 |  |
| common#target_warn_effect | tinh; other |  | lock_target |  |
| common#text_buff | vang mat o web; statue |  | text_info_show, text_talk, text_showup, text_info_end, showitem, showbuff |  |
| common#text_buff_outline | vang mat o web; statue |  | text_info_show, text_talk, text_showup, text_info_end, showitem, showbuff |  |
| common#transfer_gate | portal |  | glow/glow:transfer_gate_glow, inner:transfer_gate_hole |  |
| common#transfer_gate_02 | vang mat o web; portal | transfer_gate | create_gate, light:light_ide |  |
| common#transfer_gate_aram | vang mat o web; portal | create_gate, transfer_gate, close_gate |  |  |
| common#transfer_gate_extendedlevel | vang mat o web; portal | create_gate, transfer_gate, close_gate | glow/glow:transfer_gate_glow, inner:transfer_gate_hole, canvas/tap:object_tap_hide, canvas/tap:object_tap_click, canvas/tap:object_tap_ide |  |
| common#trash_opened_box | vang mat o web; chest | trash_box_sealed, trash_box_opened, trash_box_open |  |  |
| common#trash_sealed_box | vang mat o web; chest | trash_box_sealed, trash_box_opened, trash_box_open |  |  |
| common#troop2_buff_ice_mage1 | vang mat o web; statue |  | disappear |  |
| common#troop2_explode_ice_box | vang mat o web; chest |  | explode_ice_start, explode_ice, explode_ice_end |  |
| common#weapon_270_sword_bullet_buff | vang mat o web; statue | b_slash |  |  |
| common#weapon_item_chest | vang mat o web; chest |  | chest_open, chest_close |  |
| common#widget_hb_achievement_chest | vang mat o web; chest |  | light_effect:light_ide, NormalChestRoot:New State, NormalChestRoot:chest_open, NormalChestRoot:ui_chest_open_finish |  |
| common#window_shop | vang mat o web; merchant |  | hide_window, show_window, btn_back:Normal, btn_back:Highlighted, btn_back:Pressed, btn_back:Disabled, light1:gem_light1, light2:gem_light2 |  |
| common#window_show_blind_box_items | vang mat o web; chest |  | window_objcets_show, window_objcets_hide, window_objcets_ide |  |
| common#window_show_object_reward_chest | vang mat o web; chest |  | window_objcet_ide |  |
| common#window_show_object_treasure_box | vang mat o web; chest |  | window_objcet_ide |  |
| common#window_show_object_treasure_box_1 | vang mat o web; chest |  | window_objcet_ide |  |
| level/1/c#brazier05 | tinh; brazier | brazier03 |  |  |
| level/2/c#brazier04 | tinh; brazier | brazier03 |  |  |
| level/2/d#brazier06 | tinh; brazier | brazier03 |  |  |
| level/2/e#brazier07 | tinh; brazier | brazier03 |  |  |
| level/2/f#brazier08 | tinh; brazier | inactive, active |  |  |
| level/2/f#relic_chest | vang mat o web; chest |  | chest_open, chest_close |  |
| level/2/f#relic_chest_room_reward | vang mat o web; chest |  | chest_open, chest_close |  |
| level/2/g#electric_box | vang mat o web; chest | ElectricBox_off, ElectricBox_on, ElectricBox_dead, electric_shock_band:ide |  |  |
| level/2/g#machinerycity_door_e | vang mat o web; door | Open, Close |  |  |
| level/2/g#machinerycity_door_n | vang mat o web; door | Open, Close |  |  |
| level/2/g#machinerycity_door_s | vang mat o web; door | Open, Close |  |  |
| level/2/g#machinerycity_door_w | vang mat o web; door | Open, Close |  |  |
| levelcommon#bar | vang mat o web; other | object_waiter/object_waiter:idle, object_waiter/object_waiter2:ide, object_waiter/object_waiter2:skill, object_waiter/object_waiter3:idle, object_waiter/object_waiter4:idle, object_waiter/object_waiter5:idle | object_waiter/object_waiter2:char_hit |  |
| levelcommon#brazier02 | tinh; brazier | brazier02 |  |  |
| levelcommon#chest_battery | vang mat o web; chest | img/battery:char_dizzy, img/battery:char_tap_dead | close, open, dead, img/battery:battery01_ide, img/battery:char_hit, img/battery:char_hide_tap, img/battery/img/head/se:w_ide, img/battery/img/head/se:rifle, img/battery/img/head/se:rifle 0, img/battery/img/head/se:switch_temp (+6) |  |
| levelcommon#chest_big | tinh; chest |  | chest_open |  |
| levelcommon#chest_big_3 | vang mat o web; chest |  | chest_open |  |
| levelcommon#chest_big_4 | vang mat o web; chest |  | chest_open |  |
| levelcommon#chest_boss | chest |  | chest_open, chest_close |  |
| levelcommon#chest_boss01 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| levelcommon#chest_boss02 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| levelcommon#chest_boss03 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| levelcommon#chest_boss04 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| levelcommon#chest_boss07 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| levelcommon#chest_boss08 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| levelcommon#chest_boss09 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| levelcommon#chest_boss10 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| levelcommon#chest_boss13 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| levelcommon#chest_boss14 | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| levelcommon#chest_boss_weapon_evolution | vang mat o web; chest | chest_open 0, chest_open 1, chest_open 2, chest_open 3, chest_open 4, chest_evolution_0, chest_evolution_1, chest_evolution_2, chest_evolution_3, chest_evolution_4 (+2) |  |  |
| levelcommon#chest_bossnian | vang mat o web; chest | body:chest_idle | chest_open, chest_close |  |
| levelcommon#chest_closable | vang mat o web; chest |  | close, open |  |
| levelcommon#chest_room_reward | chest |  | chest_open, chest_close |  |
| levelcommon#chestbattery_root2 | vang mat o web; chest | chest_battery_1/img/battery:char_dizzy, chest_battery_1/img/battery:char_tap_dead, chest_battery_2/img/battery:char_dizzy, chest_battery_2/img/battery:char_tap_dead | chest_battery_1:close, chest_battery_1:open, chest_battery_1:dead, chest_battery_1/img/battery:battery01_ide, chest_battery_1/img/battery:char_hit, chest_battery_1/img/battery:char_hide_tap, chest_battery_1/img/battery/img/head/se:w_ide, chest_battery_1/img/battery/img/head/se:rifle, chest_battery_1/img/battery/img/head/se:rifle 0, chest_battery_1/img/battery/img/head/se:switch_temp (+22) |  |
| levelcommon#chestbattery_root2_2 | vang mat o web; chest | chest_battery_1/img/battery:char_dizzy, chest_battery_1/img/battery:char_tap_dead, chest_battery_2/img/battery:char_dizzy, chest_battery_2/img/battery:char_tap_dead | chest_battery_1:close, chest_battery_1:open, chest_battery_1:dead, chest_battery_1/img/battery:battery01_ide, chest_battery_1/img/battery:char_hit, chest_battery_1/img/battery:char_hide_tap, chest_battery_1/img/battery/img/head/se:w_ide, chest_battery_1/img/battery/img/head/se:rifle, chest_battery_1/img/battery/img/head/se:rifle 0, chest_battery_1/img/battery/img/head/se:switch_temp (+22) |  |
| levelcommon#chestbattery_root3 | vang mat o web; chest | chest_battery_1/img/battery:char_dizzy, chest_battery_1/img/battery:char_tap_dead, chest_battery_2/img/battery:char_dizzy, chest_battery_2/img/battery:char_tap_dead, chest_battery_3/img/battery:char_dizzy, chest_battery_3/img/battery:char_tap_dead | chest_battery_1:close, chest_battery_1:open, chest_battery_1:dead, chest_battery_1/img/battery:battery01_ide, chest_battery_1/img/battery:char_hit, chest_battery_1/img/battery:char_hide_tap, chest_battery_1/img/battery/img/head/se:w_ide, chest_battery_1/img/battery/img/head/se:rifle, chest_battery_1/img/battery/img/head/se:rifle 0, chest_battery_1/img/battery/img/head/se:switch_temp (+38) |  |
| levelcommon#chestbattery_root3_2 | vang mat o web; chest | chest_battery_1/img/battery:char_dizzy, chest_battery_1/img/battery:char_tap_dead, chest_battery_2/img/battery:char_dizzy, chest_battery_2/img/battery:char_tap_dead, chest_battery_3/img/battery:char_dizzy, chest_battery_3/img/battery:char_tap_dead | chest_battery_1:close, chest_battery_1:open, chest_battery_1:dead, chest_battery_1/img/battery:battery01_ide, chest_battery_1/img/battery:char_hit, chest_battery_1/img/battery:char_hide_tap, chest_battery_1/img/battery/img/head/se:w_ide, chest_battery_1/img/battery/img/head/se:rifle, chest_battery_1/img/battery/img/head/se:rifle 0, chest_battery_1/img/battery/img/head/se:switch_temp (+38) |  |
| levelcommon#chestbattery_root3_3 | vang mat o web; chest | chest_battery_1/img/battery:char_dizzy, chest_battery_1/img/battery:char_tap_dead, chest_battery_2/img/battery:char_dizzy, chest_battery_2/img/battery:char_tap_dead, chest_battery_3/img/battery:char_dizzy, chest_battery_3/img/battery:char_tap_dead | chest_battery_1:close, chest_battery_1:open, chest_battery_1:dead, chest_battery_1/img/battery:battery01_ide, chest_battery_1/img/battery:char_hit, chest_battery_1/img/battery:char_hide_tap, chest_battery_1/img/battery/img/head/se:w_ide, chest_battery_1/img/battery/img/head/se:rifle, chest_battery_1/img/battery/img/head/se:rifle 0, chest_battery_1/img/battery/img/head/se:switch_temp (+38) |  |
| levelcommon#chestbattery_root4 | vang mat o web; chest | chest_battery_1/img/battery:char_dizzy, chest_battery_1/img/battery:char_tap_dead, chest_battery_2/img/battery:char_dizzy, chest_battery_2/img/battery:char_tap_dead, chest_battery_3/img/battery:char_dizzy, chest_battery_3/img/battery:char_tap_dead, chest_battery_4/img/battery:char_dizzy, chest_battery_4/img/battery:char_tap_dead | chest_battery_1:close, chest_battery_1:open, chest_battery_1:dead, chest_battery_1/img/battery:battery01_ide, chest_battery_1/img/battery:char_hit, chest_battery_1/img/battery:char_hide_tap, chest_battery_1/img/battery/img/head/se:w_ide, chest_battery_1/img/battery/img/head/se:rifle, chest_battery_1/img/battery/img/head/se:rifle 0, chest_battery_1/img/battery/img/head/se:switch_temp (+54) |  |
| levelcommon#chestbattery_root4_2 | vang mat o web; chest | chest_battery_1/img/battery:char_dizzy, chest_battery_1/img/battery:char_tap_dead, chest_battery_2/img/battery:char_dizzy, chest_battery_2/img/battery:char_tap_dead, chest_battery_3/img/battery:char_dizzy, chest_battery_3/img/battery:char_tap_dead, chest_battery_4/img/battery:char_dizzy, chest_battery_4/img/battery:char_tap_dead | chest_battery_1:close, chest_battery_1:open, chest_battery_1:dead, chest_battery_1/img/battery:battery01_ide, chest_battery_1/img/battery:char_hit, chest_battery_1/img/battery:char_hide_tap, chest_battery_1/img/battery/img/head/se:w_ide, chest_battery_1/img/battery/img/head/se:rifle, chest_battery_1/img/battery/img/head/se:rifle 0, chest_battery_1/img/battery/img/head/se:switch_temp (+54) |  |
| levelcommon#chestrainbowhorse_root3 | vang mat o web; chest | chest_battery_1/img/battery:char_dizzy, chest_battery_1/img/battery:char_tap_dead, chest_battery_2/img/battery:char_dizzy, chest_battery_2/img/battery:char_tap_dead, chest_battery_3/img/battery:char_dizzy, chest_battery_3/img/battery:char_tap_dead | chest_battery_1:close, chest_battery_1:open, chest_battery_1:dead, chest_battery_1/img/battery:battery01_ide, chest_battery_1/img/battery:char_hit, chest_battery_1/img/battery:char_hide_tap, chest_battery_1/img/battery/img/head/smg:w_laser 0, chest_battery_1/img/battery/img/head/smg:w_laser, chest_battery_1/img/battery/img/head/smg:w_laser_no_move, chest_battery_1/img/battery/img/head/smg:w_laser_blade (+26) |  |
| levelcommon#chestrainbowhorse_root3_2 | vang mat o web; chest | chest_battery_1/img/battery:char_dizzy, chest_battery_1/img/battery:char_tap_dead, chest_battery_2/img/battery:char_dizzy, chest_battery_2/img/battery:char_tap_dead, chest_battery_3/img/battery:char_dizzy, chest_battery_3/img/battery:char_tap_dead | chest_battery_1:close, chest_battery_1:open, chest_battery_1:dead, chest_battery_1/img/battery:battery01_ide, chest_battery_1/img/battery:char_hit, chest_battery_1/img/battery:char_hide_tap, chest_battery_1/img/battery/img/head/smg:w_laser 0, chest_battery_1/img/battery/img/head/smg:w_laser, chest_battery_1/img/battery/img/head/smg:w_laser_no_move, chest_battery_1/img/battery/img/head/smg:w_laser_blade (+26) |  |
| levelcommon#chestrainbowhorse_root3_3 | vang mat o web; chest | chest_battery_1/img/battery:char_dizzy, chest_battery_1/img/battery:char_tap_dead, chest_battery_2/img/battery:char_dizzy, chest_battery_2/img/battery:char_tap_dead, chest_battery_3/img/battery:char_dizzy, chest_battery_3/img/battery:char_tap_dead | chest_battery_1:close, chest_battery_1:open, chest_battery_1:dead, chest_battery_1/img/battery:battery01_ide, chest_battery_1/img/battery:char_hit, chest_battery_1/img/battery:char_hide_tap, chest_battery_1/img/battery/img/head/smg:w_laser 0, chest_battery_1/img/battery/img/head/smg:w_laser, chest_battery_1/img/battery/img/head/smg:w_laser_no_move, chest_battery_1/img/battery/img/head/smg:w_laser_blade (+26) |  |
| levelcommon#dinner | vang mat o web; other | c3:npc_knight_ide, c3:npc_knight_run, c3:npc_knight_dead, c3:char_tap_dead | c3:char_hit, c3:char_hide_tap |  |
| levelcommon#furance | vang mat o web; other |  | idle, open |  |
| levelcommon#furance_fuse | vang mat o web; other |  | idle, open |  |
| levelcommon#furance_inverse | vang mat o web; other |  | idle, open |  |
| levelcommon#mineral_crystal | vang mat o web; other |  | char_hit |  |
| levelcommon#mineral_gold | vang mat o web; other |  | char_hit |  |
| levelcommon#naughtyboy1 | vang mat o web; other | postman_ide |  |  |
| levelcommon#naughtyboy2 | vang mat o web; other | postman_ide |  |  |
| levelcommon#naughtyboy3 | vang mat o web; other | postman_ide |  |  |
| levelcommon#npc_01_x | vang mat o web; merchant | npc_knight_ide, npc_knight_run, npc_knight_dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_pet_1:w_sword_ide, img/h1/weapon_pet_1:w_sword 0, img/h1/weapon_pet_1:back, img/h1/weapon_pet_1:back_ready, img/h1/weapon_pet_1:w_sword2 |  |
| levelcommon#npc_02 | vang mat o web; merchant | char10_ide, char10_run, char10_dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_pet_2:w_ide, img/h1/weapon_pet_2:m4, img/h1/weapon_pet_2:m4 0, img/h1/weapon_pet_2:fire |  |
| levelcommon#npc_02_x | vang mat o web; merchant | char10_ide, char10_run, char10_dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_pet_2:w_ide, img/h1/weapon_pet_2:m4, img/h1/weapon_pet_2:m4 0, img/h1/weapon_pet_2:fire |  |
| levelcommon#npc_03 | vang mat o web; merchant | char09_ide, char09_run, char09_dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_pet_3:w_ide, img/h1/weapon_pet_3:rifle, img/h1/weapon_pet_3:rifle 0, img/h1/weapon_pet_3:switch_temp, img/h1/weapon_pet_3:fire, img/h1/weapon_pet_3:w_rifle_131 |  |
| levelcommon#npc_03_accompany | vang mat o web; merchant | char09_ide, char09_run, char09_dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_026:New State, img/h1/weapon_026:w_smg 0, img/h1/weapon_026:w_smg, img/h1/weapon_026:w_rifle |  |
| levelcommon#npc_04 | vang mat o web; merchant | char10_ide, char10_run, char10_dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_pet_4:w_staff1, img/h1/weapon_pet_4:New State, img/h1/weapon_pet_4:w_staff 0, img/h1/weapon_pet_4:w_staff, img/h1/weapon_pet_4:drink |  |
| levelcommon#npc_05 | vang mat o web; merchant | npc_knight_ide, npc_knight_run, npc_knight_dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_pet_5:idle, img/h1/weapon_pet_5:hold, img/h1/weapon_pet_5:axe, img/h1/weapon_pet_5:sword, img/h1/weapon_pet_5:back |  |
| levelcommon#npc_05_x | vang mat o web; merchant | npc_knight_ide, npc_knight_run, npc_knight_dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_pet_5:idle, img/h1/weapon_pet_5:hold, img/h1/weapon_pet_5:axe, img/h1/weapon_pet_5:sword, img/h1/weapon_pet_5:back |  |
| levelcommon#npc_06 | vang mat o web; merchant | npc_knight_ide, npc_knight_run, npc_knight_dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_pet_6:w_sword_ide, img/h1/weapon_pet_6:w_sword 0, img/h1/weapon_pet_6:back, img/h1/weapon_pet_6:back_ready, img/h1/weapon_pet_6:w_sword2, img/h1/weapon_pet_6/w/sub_container:w_throw_sub_idle, img/h1/weapon_pet_6/w/sub_container:w_throw_sub_create, img/h1/weapon_pet_6/w/sub_container:rotate |  |
| levelcommon#npc_07 | vang mat o web; merchant | ide, run, dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_pet_7:w_sword_ide, img/h1/weapon_pet_7:w_sword 0, img/h1/weapon_pet_7:w_sword_ide_inverse, img/h1/weapon_pet_7:back, img/h1/weapon_pet_7:back_ready, img/h1/weapon_pet_7:w_sword2 |  |
| levelcommon#npc_07_mad | vang mat o web; merchant | ide, run, dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon:w_sword_ide, img/h1/weapon:w_sword 0, img/h1/weapon:back, img/h1/weapon:back_ready, img/h1/weapon:w_sword2 |  |
| levelcommon#npc_08 | vang mat o web; merchant | ide, run, dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_pet_8:w_spear_ide, img/h1/weapon_pet_8:w_spear, img/h1/weapon_pet_8:w_spear 0, img/h1/weapon_pet_8:switch_temp |  |
| levelcommon#npc_09 | vang mat o web; merchant | ide, run, dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_pet_9:w_ide, img/h1/weapon_pet_9:rifle, img/h1/weapon_pet_9:rifle 0, img/h1/weapon_pet_9:switch_temp, img/h1/weapon_pet_9:fire, img/h1/weapon_pet_9:w_rifle_131 |  |
| levelcommon#npc_10 | vang mat o web; merchant | ide, run, dead, char_tap_dead | char_hit, char_hide_tap |  |
| levelcommon#npc_11 | vang mat o web; merchant | ide, run, dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_pet_11:w_ide, img/h1/weapon_pet_11:atk, img/h1/weapon_pet_11:weapon_pistol 0 |  |
| levelcommon#npc_11_accompany | vang mat o web; merchant | char09_ide, char09_run, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_119:w_staff1, img/h1/weapon_119:New State, img/h1/weapon_119:w_staff 0, img/h1/weapon_119:w_staff, img/h1/weapon_119:drink |  |
| levelcommon#npc_12 | vang mat o web; merchant | ide, run, dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_pet_12:w_sword_ide, img/h1/weapon_pet_12:w_sword 0, img/h1/weapon_pet_12:back, img/h1/weapon_pet_12:back_ready, img/h1/weapon_pet_12:w_sword2 |  |
| levelcommon#npc_13 | vang mat o web; merchant | ide, run, dead, char_tap_dead | char_hit, char_hide_tap |  |
| levelcommon#npc_banker2 | vang mat o web; merchant | banker_ide |  |  |
| levelcommon#npc_bossrush_engineer | vang mat o web; merchant | New State, bossrush_mgr, New State 0 |  |  |
| levelcommon#npc_bossrush_timer | vang mat o web; merchant | body:bossrush_mgr |  |  |
| levelcommon#npc_buff_doctor_o | vang mat o web; statue | ide, run, char_tap_dead | dead, char_hit, char_hide_tap |  |
| levelcommon#npc_char01 | tinh; merchant |  | img/h1/weapon_init_ranger:inactive, img/h1/weapon_init_ranger:active, img/h1/weapon_init_ranger:check, img/h1/weapon_init_ranger:through_right, img/h1/weapon_init_ranger:through_left, img/h1/weapon_init_ranger:New State, img/h1/weapon_init_ranger:atk1, img/h1/weapon_init_ranger:atk2, img/h1/weapon_init_ranger:atk3, img/h1/weapon_init_ranger:prepare_right (+4) |  |
| levelcommon#npc_char02 | tinh; merchant | img/head2/root:light, img/head2/root:big_light | img/h1/weapon_init_mage:w_staff1, img/h1/weapon_init_mage:New State, img/h1/weapon_init_mage:w_staff 0, img/h1/weapon_init_mage:w_staff, img/h1/weapon_init_mage:drink, img/head2/root:ide |  |
| levelcommon#npc_char03 | tinh; merchant |  | img/h1/weapon_init_assassin:ide, img/h1/weapon_init_assassin:max_atk, img/h1/weapon_init_assassin:max_atk_2, img/h1/weapon_init_assassin:atk_t, img/h1/weapon_init_assassin:atk_1, img/h1/weapon_init_assassin:atk_2, img/h1/weapon_init_assassin:back, img/h1/weapon_init_assassin:idle, img/h1/weapon_init_assassin:w_init_assassin_max |  |
| levelcommon#npc_char08 | tinh; merchant |  | img/h1/weapon_init_elves:w_bow0, img/h1/weapon_init_elves:w_bow2, img/h1/weapon_init_elves:w_bow1 |  |
| levelcommon#npc_char10 | tinh; merchant |  | img/h1/weapon_init_priest:w_staff1, img/h1/weapon_init_priest:New State, img/h1/weapon_init_priest:w_staff 0, img/h1/weapon_init_priest:w_staff, img/h1/weapon_init_priest:drink |  |
| levelcommon#npc_char11 | tinh; merchant |  | img/h1/weapon_init_druid:idle, img/h1/weapon_init_druid:throw, img/h1/weapon_init_druid:sword_t, img/h1/weapon_init_druid:throw_prepare, img/h1/weapon_init_druid:check_mode, img/h1/weapon_init_druid:w_ide, img/h1/weapon_init_druid:back, img/h1/weapon_init_druid:check_mode 0, img/h1/weapon_init_druid:throw_t, img/h1/weapon_init_druid:sowrd (+2) |  |
| levelcommon#npc_char13 | tinh; merchant |  | img/h1/weapon_init_viking:inactive, img/h1/weapon_init_viking:atk_2, img/h1/weapon_init_viking:atk_1, img/h1/weapon_init_viking:active, img/h1/weapon_init_viking:atk_t, img/h1/weapon_init_viking:atk_3 |  |
| levelcommon#npc_char20 | tinh; merchant |  | img/h1/weapon_init_ninja:ide, img/h1/weapon_init_ninja:atk_t, img/h1/weapon_init_ninja:atk_1, img/h1/weapon_init_ninja:atk_2, img/h1/weapon_init_ninja:atk_3 |  |
| levelcommon#npc_char29 | tinh; merchant |  | img/h1/weapon_init_lancerx:idle, img/h1/weapon_init_lancerx:sword, img/h1/weapon_init_lancerx:back_idle, img/h1/weapon_init_lancerx:drop |  |
| levelcommon#npc_char30 | tinh; merchant |  | img/h1/weapon_init_warliege:idle, img/h1/weapon_init_warliege:back, img/h1/weapon_init_warliege:atk__0, img/h1/weapon_init_warliege:atk_1, img/h1/weapon_init_warliege:atk_0_inverse, img/h1/weapon_init_warliege:atk_t, img/h1/weapon_init_warliege:atk_t_inverse, img/h1/weapon_init_warliege:shield_show |  |
| levelcommon#npc_char31 | tinh; merchant |  | img/h1/weapon_init_arcaneknight:normal, img/h1/weapon_init_arcaneknight:using, img/h1/weapon_init_arcaneknight:wield, img/h1/weapon_init_arcaneknight:charge |  |
| levelcommon#npc_char38 | tinh; merchant |  | img/h1/weapon_init_captainx:w_ide, img/h1/weapon_init_captainx:weapon_pistol, img/h1/weapon_init_captainx:weapon_pistol 0, img/h1/weapon_init_captainx:pistol_rotate, img/h1/weapon_init_captainx:w_sword 0, img/h1/weapon_init_captainx:w_sword2, img/h1/weapon_init_captainx:sword_idle |  |
| levelcommon#npc_char39 | tinh; merchant |  | img/h1/weapon_init_yinyang:w_ide, img/h1/weapon_init_yinyang:ai_girl_w_pistol_h1 |  |
| levelcommon#npc_char40 | tinh; merchant |  | img/h1/weapon_init_gunsexpert:idle, img/h1/weapon_init_gunsexpert:gunsexpert_hold_atk, img/h1/weapon_init_gunsexpert:mode1, img/h1/weapon_init_gunsexpert:gunsexpert_holding |  |
| levelcommon#npc_char41 | tinh; merchant |  | img/h1/weapon_init_ladychef:w_sword_ide, img/h1/weapon_init_ladychef:w_sword 0 0, img/h1/weapon_init_ladychef:w_sword2 |  |
| levelcommon#npc_fusion_smith_buddies | vang mat o web; merchant | npc_smith_fusion_activity:smith_idle, npc_smith_fusion_activity:smith_work, npc_smith:smith_idle, npc_smith:smith_work |  |  |
| levelcommon#npc_ice_cave_entrance | vang mat o web; merchant | idle, run, ice_cave_miner_dig_idle, ice_cave_miner_dig |  |  |
| levelcommon#npc_mount_creature | vang mat o web; merchant | img:npc_trainer_idle |  |  |
| levelcommon#npc_mount_mech | vang mat o web; merchant | img:npc_trainer_idle |  |  |
| levelcommon#npc_smith_cage | vang mat o web; merchant | smith_idle, smith_work |  |  |
| levelcommon#npc_smith_fusion | vang mat o web; merchant | smith_idle, smith_work |  |  |
| levelcommon#npc_swamp_entrance | vang mat o web; merchant | object_fishing_spot_swamp_alter:normal |  |  |
| levelcommon#npc_void_child | vang mat o web; merchant | ide, run, dead, char_tap_dead | char_hit, char_hide_tap |  |
| levelcommon#npc_void_child_fx | vang mat o web; merchant | ide, run, dead, char_tap_dead | char_hit, char_hide_tap |  |
| levelcommon#npc_void_child_mercenary | vang mat o web; merchant | ide, run, dead, char_tap_dead | char_hit, char_hide_tap, img/h1/weapon_325:w_sword_ide, img/h1/weapon_325:hold, img/h1/weapon_325:back, img/h1/weapon_325:sword |  |
| levelcommon#npc_weapon_item_multi | vang mat o web; merchant | idle |  |  |
| levelcommon#r_coop_chest | vang mat o web; chest |  | enemy_group/chest_coop_big_4:chest_open |  |
| levelcommon#r_pills | tinh; other |  | enemy_group/weapon_292:w_sword_ide, enemy_group/weapon_292:w_sword 0, enemy_group/weapon_292:back, enemy_group/weapon_292:back_ready, enemy_group/weapon_292:w_sword_eat, enemy_group/weapon_292:w_sword2, enemy_group/weapon_292/w/sub_container:w_throw_sub_idle, enemy_group/weapon_292/w/sub_container:w_throw_sub_create, enemy_group/weapon_292/w/sub_container:rotate, enemy_group/weapon_292:w_sword_ide (+35) |  |
| levelcommon#r_start_ball_buff | vang mat o web; statue | room_seller_ball_buff/npc01/img/body:banker_ide, room_seller_ball_buff/container0/television:television |  |  |
| levelcommon#sell_multi | vang mat o web; other | npc01:npc01_ide, table/candle:objects1_1, table/television:television |  |  |
| levelcommon#sell_mystery2_cage | vang mat o web; other | npc01_ide |  |  |
| levelcommon#sell_saleday | vang mat o web; other | npc01:npc01_ide, table/television:television, table/candle:objects1_1 |  |  |
| levelcommon#sell_saleday_boss | vang mat o web; other | npc01:npc01_ide, table/television:television, table/candle:objects1_1 |  |  |
| levelcommon#torch | vang mat o web; brazier | objects1_1 |  |  |
| levelcommon#void_child | vang mat o web; other | npc_void_child:ide, npc_void_child:run, npc_void_child:dead, npc_void_child:char_tap_dead | npc_void_child:char_hit, npc_void_child:char_hide_tap |  |
| levelcommon#water_dispenser | vang mat o web; other | water_machine |  |  |
| levelcommon#wishing_well | other |  | open, img/light:light, img/light:fade |  |
| levelcommon#wishing_well_mini_size | vang mat o web; other |  | open, img/light:light, img/light:fade |  |
| levelobjects#chest_single_big_3 | vang mat o web; chest |  | chest_open |  |
| levelobjects#npc_01_decorator | vang mat o web; merchant | npc_1/imgs:pet_npc_01_idle, npc_3/imgs:pet_npc_01_idle |  |  |
| levelobjects#npc_03_decorator | vang mat o web; merchant | npc_03_accompany:char09_ide, npc_03_accompany:char09_run, npc_03_accompany:char09_dead, npc_03_accompany:char_tap_dead, npc_03_accompany:char09_ide, npc_03_accompany:char09_run, npc_03_accompany:char09_dead, npc_03_accompany:char_tap_dead | npc_03_accompany:char_hit, npc_03_accompany:char_hide_tap, npc_03_accompany/img/h1/weapon_026:New State, npc_03_accompany/img/h1/weapon_026:w_smg 0, npc_03_accompany/img/h1/weapon_026:w_smg, npc_03_accompany/img/h1/weapon_026:w_rifle, npc_03_accompany:char_hit, npc_03_accompany:char_hide_tap, npc_03_accompany/img/h1/weapon_026:New State, npc_03_accompany/img/h1/weapon_026:w_smg 0 (+2) |  |
| levelobjects#npc_11_decorator | vang mat o web; merchant | environment/npc_11_accompany:char09_ide, environment/npc_11_accompany:char09_run, environment/npc_11_accompany:char_tap_dead, environment/npc_11_accompany:char09_ide, environment/npc_11_accompany:char09_run, environment/npc_11_accompany:char_tap_dead, environment/npc_11_accompany:char09_ide, environment/npc_11_accompany:char09_run, environment/npc_11_accompany:char_tap_dead | environment/npc_11_accompany:char_hit, environment/npc_11_accompany:char_hide_tap, environment/npc_11_accompany/img/h1/weapon_119:w_staff1, environment/npc_11_accompany/img/h1/weapon_119:New State, environment/npc_11_accompany/img/h1/weapon_119:w_staff 0, environment/npc_11_accompany/img/h1/weapon_119:w_staff, environment/npc_11_accompany/img/h1/weapon_119:drink, environment/npc_11_accompany:char_hit, environment/npc_11_accompany:char_hide_tap, environment/npc_11_accompany/img/h1/weapon_119:w_staff1 (+11) |  |
| levelobjects#npc_weapon_item_fish_decorator | vang mat o web; merchant | environment/object_fishing_spot_event:normal |  |  |
| levelobjects#npc_weapon_item_multi_decorator | vang mat o web; merchant |  | environment/npc_2/hand:idle |  |

## Gioi han cua phep do

- Chi tinh Animator trong prefab. Hieu ung ky nang, vien dan, VFX (prefab rieng) khong nam trong ban kiem toan nay.
- Hero: prefab khong gan controller (gan luc chay); dung controller `skin` trong `skin/character/<thu muc>/skin_0.ab`. Moi skin khac chi dem so bundle (chay `--all-skins` de doc controller tung skin).
- State nhieu node trong blend tree: lay clip dau tien (giong build_sk.py). State khong co motion khong tinh.
- Quai: moi map A..F cua man 1-1..3-5 trong `map_levels` (ke ca ban bien the e_old_*, e_dream_*); web chi co 13 theme.
- So khop theo ten state, khong so noi dung clip: state cung ten nhung clip khac van tinh la du.
- Bosses/weapons: web luu duong cong nen thieu-transform la thieu that. Quai/vat the: web chi luu khung sprite.