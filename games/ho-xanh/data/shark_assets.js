// Sinh bởi tools/rip_shark.py — đừng sửa tay.
// [DtD]: DR_GameData_Fish (hp, damage, size, cm, rank), SAFishData (ai), prefab SA_* (scale, bounds, mouth), clip gốc.
window.HX_SHARKS = {
 "species": [
  {
   "id": "Whitetip_Reefshark",
   "tid": 2010025,
   "tids": [
    2010025,
    2010055
   ],
   "zone": "A",
   "name": "Whitetip Reefshark",
   "hp": 95,
   "damage": 25,
   "size": 2,
   "cm": 210,
   "rank": 4,
   "activeType": 0,
   "qteLevel": 1,
   "carvable": 2,
   "night": {
    "tid": 2010055,
    "hp": 200,
    "damage": 40,
    "activeType": 1
   },
   "glb": "art/shark/Whitetip_Reefshark.glb",
   "kb": 264,
   "prefab": "Fish/A/ReefShark/Prefabs/SA_2010025_Whitetip_Reefshark_Renew.prefab",
   "controller": "SA_Whitetip_Reefshark",
   "ai": {
    "AggressionType": 2.0,
    "SwimSpeed": 0.0,
    "runToHomeSpeed": 2.5,
    "FishBattleSpeedRate": 1.3,
    "RotateSpeed": 50.0,
    "RangeFindEnemy": 4.5,
    "SprintLimitTime": 1.5,
    "CoolTimeSprintDecision": 5.0,
    "RangeAbleToSprintAttack": 5.0,
    "LeastAngleToSprint": 13.0,
    "MaxRangeCanFollow": 8.0,
    "TurnWeigh": 0.8,
    "SwimWeigh": 2.8,
    "SprintWeigh": 3.5,
    "LimitTimeFindEnemyFromRun": 4.0,
    "abilities": {
     "qte": {
      "range": 7.0,
      "angle": 10.0,
      "cool": 3.0,
      "sprint": 0.8,
      "accel": 1.1
     },
     "bite": {
      "rate": 1.0,
      "cool": 10.0
     },
     "rage": {
      "time": 3.0,
      "afterAttack": 5.0
     },
     "sprint": {
      "speed": 5.0
     }
    },
    "src": "Assets/ScriptableObjects/Fish/SA_Fish/SA_2010025_WhitetipReefShark.asset"
   },
   "scale": 0.96,
   "face": 1,
   "bounds": [
    -2.405,
    -0.501,
    1.604,
    0.746
   ],
   "mouth": [
    1.651,
    0.01
   ],
   "roles": {
    "sprint": "Ani3D_Whitetipshark_Normal_Sprint_A_01",
    "turn": "Ani3D_Whitetipshark_Normal_SwimTurn_A_01",
    "swim": "Ani3D_Whitetipshark_Normal_Swim_A_01",
    "swimB": "Ani3D_Whitetipshark_Normal_Swim_B_01",
    "swimC": "Ani3D_Whitetipshark_Normal_Swim_C_01",
    "qteFail": "Ani3D_Whitetipshark_QTE_Fail_A_01",
    "qteSuccess": "Ani3D_Whitetipshark_QTE_Success_A_01",
    "qteEnter": "Ani3D_Whitetip_Reefshark_QTE_Enter_A_01",
    "die": "Ani3D_Whitetipshark_Normal_Die_A_01",
    "attack": "Ani3D_Whitetipshark_Normal_Attack_C_01",
    "qteReady": "Ani3D_Whitetipshark_QTE_Ready_A_01",
    "damage": "Ani3D_Whitetipshark_Timeline_Damage_A_01"
   },
   "clips": {
    "Ani3D_Whitetipshark_Normal_Sprint_A_01": {
     "len": 1.3333,
     "loop": true,
     "sfx": [
      [
       0.0,
       "shark_sound_whitetipshark_qte_entera_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Attack_01",
       "Bip001 Tail_Top"
      ],
      [
       0.15,
       "VFX_Whitetip_Reefshark01_Body_A_01_StrongSprint",
       "Bip001"
      ]
     ]
    },
    "Ani3D_Whitetipshark_Normal_SwimTurn_A_01": {
     "len": 1.3333,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1523,
       0.0
      ],
      [
       0.2,
       0.4141,
       0.0
      ],
      [
       0.3,
       0.7144,
       0.0
      ],
      [
       0.4,
       1.0943,
       0.0
      ],
      [
       0.5,
       1.4545,
       0.0
      ],
      [
       0.6,
       1.6167,
       0.0
      ],
      [
       0.7,
       1.6268,
       0.0
      ],
      [
       0.8,
       1.4068,
       0.0
      ],
      [
       0.9,
       1.0551,
       0.0
      ],
      [
       1.0,
       0.7244,
       0.0
      ],
      [
       1.1,
       0.4572,
       0.0
      ],
      [
       1.2,
       0.2207,
       0.0
      ],
      [
       1.3,
       0.0194,
       0.0
      ],
      [
       1.333,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_Whitetipshark_Normal_Swim_A_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_Whitetipshark_Normal_Swim_B_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_Whitetipshark_Normal_Swim_C_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_Whitetipshark_QTE_Fail_A_01": {
     "len": 2.2,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.0182,
       0.0253
      ],
      [
       0.2,
       0.0924,
       0.0507
      ],
      [
       0.3,
       0.4011,
       -0.0226
      ],
      [
       0.4,
       0.5727,
       0.0
      ],
      [
       0.5,
       0.5547,
       0.0
      ],
      [
       0.6,
       0.5597,
       0.0
      ],
      [
       0.7,
       0.5527,
       0.0
      ],
      [
       0.8,
       0.5261,
       0.0
      ],
      [
       0.9,
       0.5443,
       0.0
      ],
      [
       1.0,
       0.4781,
       0.0
      ],
      [
       1.1,
       0.4821,
       0.0049
      ],
      [
       1.2,
       0.4695,
       0.0492
      ],
      [
       1.3,
       0.4646,
       0.0665
      ],
      [
       1.4,
       0.915,
       0.0234
      ],
      [
       1.5,
       1.1703,
       0.0
      ],
      [
       1.6,
       1.1826,
       0.0
      ],
      [
       1.7,
       1.1914,
       0.0
      ],
      [
       1.8,
       1.1972,
       0.0
      ],
      [
       1.9,
       1.2008,
       0.0
      ],
      [
       2.0,
       1.2026,
       0.0
      ],
      [
       2.1,
       1.2033,
       0.0
      ],
      [
       2.2,
       1.2035,
       0.0
      ],
      [
       2.2,
       1.2035,
       0.0
      ]
     ],
     "sfx": [
      [
       0.2,
       "shark_sound_longnosesawshark_qte_fail_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Blood_A_01",
       "Bip001 Mouth"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_AttackD_Bip001 Mouth_Spit_A_01",
       "Bip001 Mouth"
      ]
     ]
    },
    "Ani3D_Whitetipshark_QTE_Success_A_01": {
     "len": 3.1667,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.6529,
       0.1267
      ],
      [
       0.2,
       1.0008,
       -0.1102
      ],
      [
       0.3,
       1.0856,
       -0.2202
      ],
      [
       0.4,
       1.121,
       -0.3071
      ],
      [
       0.5,
       1.1539,
       -0.4132
      ],
      [
       0.6,
       1.2009,
       -0.5739
      ],
      [
       0.7,
       1.2481,
       -0.7664
      ],
      [
       0.8,
       1.2978,
       -0.9457
      ],
      [
       0.9,
       1.3536,
       -1.066
      ],
      [
       1.0,
       1.4236,
       -1.0959
      ],
      [
       1.1,
       1.5149,
       -1.0735
      ],
      [
       1.2,
       1.6167,
       -1.0249
      ],
      [
       1.3,
       1.7128,
       -0.9583
      ],
      [
       1.4,
       1.7914,
       -0.8723
      ],
      [
       1.5,
       1.8491,
       -0.7645
      ],
      [
       1.6,
       1.8963,
       -0.6363
      ],
      [
       1.7,
       1.9366,
       -0.4978
      ],
      [
       1.8,
       1.9729,
       -0.3601
      ],
      [
       1.9,
       2.0076,
       -0.2341
      ],
      [
       2.0,
       2.0435,
       -0.1308
      ],
      [
       2.1,
       2.0795,
       -0.0547
      ],
      [
       2.2,
       2.1127,
       -0.0022
      ],
      [
       2.3,
       2.1429,
       0.0295
      ],
      [
       2.4,
       2.1708,
       0.0429
      ],
      [
       2.5,
       2.1973,
       0.0405
      ],
      [
       2.6,
       2.2237,
       0.0276
      ],
      [
       2.7,
       2.2455,
       0.0119
      ],
      [
       2.8,
       2.2574,
       0.0016
      ],
      [
       2.9,
       2.2583,
       0.0008
      ],
      [
       3.0,
       2.2583,
       0.0008
      ],
      [
       3.1,
       2.2583,
       0.0008
      ],
      [
       3.167,
       2.2583,
       0.0008
      ]
     ],
     "sfx": [
      [
       0.0,
       "shark_sound_whitetipshark_qte_success_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ]
     ]
    },
    "Ani3D_Whitetip_Reefshark_QTE_Enter_A_01": {
     "len": 1.2333,
     "loop": true,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.0847,
       0.0
      ],
      [
       0.2,
       -0.0074,
       0.0
      ],
      [
       0.3,
       0.0578,
       0.0
      ],
      [
       0.4,
       0.0,
       0.0
      ],
      [
       0.5,
       0.1041,
       0.0
      ],
      [
       0.6,
       0.0492,
       0.0
      ],
      [
       0.7,
       0.1123,
       0.0
      ],
      [
       0.8,
       0.0399,
       0.0
      ],
      [
       0.9,
       0.0715,
       0.0
      ],
      [
       1.0,
       0.0165,
       0.0
      ],
      [
       1.1,
       0.0396,
       0.0
      ],
      [
       1.2,
       0.015,
       0.0
      ],
      [
       1.233,
       0.0,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Succes_DaveLegs_A_01",
       "Bip001 Mouth"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Enter_A_01",
       "Bip001"
      ]
     ]
    },
    "Ani3D_Whitetipshark_Normal_Die_A_01": {
     "len": 3.5,
     "loop": false,
     "sfx": [
      [
       0.0,
       "shark_large_fish_die_01"
      ]
     ]
    },
    "Ani3D_Whitetipshark_Normal_Attack_C_01": {
     "len": 1.6667,
     "loop": true,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1041,
       0.0
      ],
      [
       0.2,
       0.0492,
       0.0
      ],
      [
       0.3,
       0.1123,
       0.0
      ],
      [
       0.4,
       0.0399,
       0.0
      ],
      [
       0.5,
       0.0715,
       0.0
      ],
      [
       0.6,
       0.0165,
       0.0
      ],
      [
       0.7,
       0.0396,
       0.0
      ],
      [
       0.8,
       0.0125,
       0.0
      ],
      [
       0.9,
       0.0771,
       0.0
      ],
      [
       1.0,
       0.0716,
       0.0
      ],
      [
       1.1,
       0.0761,
       0.0
      ],
      [
       1.2,
       0.0691,
       0.0
      ],
      [
       1.3,
       0.0425,
       0.0
      ],
      [
       1.4,
       0.0608,
       0.0
      ],
      [
       1.5,
       0.0078,
       0.0
      ],
      [
       1.6,
       0.042,
       0.0
      ],
      [
       1.667,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_Whitetipshark_QTE_Ready_A_01": {
     "len": 1.8,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       -0.002,
       0.0
      ],
      [
       0.2,
       -0.008,
       0.0
      ],
      [
       0.3,
       -0.0174,
       0.0
      ],
      [
       0.4,
       -0.03,
       0.0
      ],
      [
       0.5,
       -0.0452,
       0.0
      ],
      [
       0.6,
       -0.0628,
       0.0
      ],
      [
       0.7,
       -0.0824,
       0.0
      ],
      [
       0.8,
       -0.1035,
       0.0
      ],
      [
       0.9,
       -0.1258,
       0.0
      ],
      [
       1.0,
       -0.1489,
       0.0
      ],
      [
       1.1,
       -0.1725,
       0.0
      ],
      [
       1.2,
       -0.196,
       0.0
      ],
      [
       1.3,
       -0.2194,
       0.0
      ],
      [
       1.4,
       -0.2418,
       0.0
      ],
      [
       1.5,
       -0.2632,
       0.0
      ],
      [
       1.6,
       -0.2832,
       0.0
      ],
      [
       1.7,
       0.0633,
       0.0
      ],
      [
       1.8,
       1.1395,
       0.0
      ],
      [
       1.8,
       1.1395,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_02",
       "Bip001 fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_02",
       "Bip001 fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_02",
       "Bip001 Tail_Top"
      ],
      [
       0.1,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_02",
       "Bip001"
      ]
     ]
    },
    "Ani3D_Whitetipshark_Timeline_Damage_A_01": {
     "len": 0.6,
     "loop": false
    }
   },
   "icon": "art/shark/Whitetip_Reefshark_icon.png"
  },
  {
   "id": "Blacktip_Reefshark",
   "tid": 2010058,
   "tids": [
    2010058
   ],
   "zone": "A",
   "name": "Blacktip ReefShark",
   "hp": 160,
   "damage": 40,
   "size": 2,
   "cm": 150,
   "rank": 6,
   "activeType": 1,
   "qteLevel": 1,
   "carvable": 2,
   "night": null,
   "glb": "art/shark/Blacktip_Reefshark.glb",
   "kb": 242,
   "prefab": "Fish/A/ReefShark/Prefabs/SA_2010058_Blacktip_Reefshark.prefab",
   "controller": "SA_Whitetip_Reefshark",
   "ai": {
    "AggressionType": 2.0,
    "SwimSpeed": 0.0,
    "runToHomeSpeed": 2.85,
    "FishBattleSpeedRate": 1.1,
    "RotateSpeed": 50.0,
    "RangeFindEnemy": 5.0,
    "SprintLimitTime": 1.25,
    "CoolTimeSprintDecision": 6.5,
    "RangeAbleToSprintAttack": 5.0,
    "LeastAngleToSprint": 13.0,
    "MaxRangeCanFollow": 8.0,
    "TurnWeigh": 0.8,
    "SwimWeigh": 2.8,
    "SprintWeigh": 4.0,
    "LimitTimeFindEnemyFromRun": 5.0,
    "abilities": {
     "rage": {
      "time": 3.0,
      "afterAttack": 5.0
     },
     "sprint": {
      "speed": 5.5
     },
     "qte": {
      "range": 7.0,
      "angle": 10.0,
      "cool": 3.0,
      "sprint": 0.0,
      "accel": 1.0
     },
     "other": [
      "FishQTEData"
     ]
    },
    "src": "Assets/ScriptableObjects/Fish/SA_Fish/SA_2010058_BlacktipReefShark.asset"
   },
   "scale": 1.0,
   "face": 1,
   "bounds": [
    -2.205,
    -0.532,
    1.615,
    0.774
   ],
   "mouth": [
    1.201,
    -0.045
   ],
   "roles": {
    "sprint": "Ani3D_Whitetipshark_Normal_Sprint_A_01",
    "turn": "Ani3D_Whitetipshark_Normal_SwimTurn_A_01",
    "swim": "Ani3D_Whitetipshark_Normal_Swim_A_01",
    "swimB": "Ani3D_Whitetipshark_Normal_Swim_B_01",
    "swimC": "Ani3D_Whitetipshark_Normal_Swim_C_01",
    "qteFail": "Ani3D_Whitetipshark_QTE_Fail_A_01",
    "qteSuccess": "Ani3D_Whitetipshark_QTE_Success_A_01",
    "qteEnter": "Ani3D_Whitetip_Reefshark_QTE_Enter_A_01",
    "die": "Ani3D_Whitetipshark_Normal_Die_A_01",
    "attack": "Ani3D_Whitetipshark_Normal_Attack_C_01",
    "qteReady": "Ani3D_Whitetipshark_QTE_Ready_A_01"
   },
   "clips": {
    "Ani3D_Whitetipshark_Normal_Sprint_A_01": {
     "len": 1.3333,
     "loop": true,
     "sfx": [
      [
       0.0,
       "shark_sound_whitetipshark_qte_entera_01"
      ]
     ]
    },
    "Ani3D_Whitetipshark_Normal_SwimTurn_A_01": {
     "len": 1.3333,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1586,
       0.0
      ],
      [
       0.2,
       0.4314,
       0.0
      ],
      [
       0.3,
       0.7442,
       0.0
      ],
      [
       0.4,
       1.1399,
       0.0
      ],
      [
       0.5,
       1.5151,
       0.0
      ],
      [
       0.6,
       1.6841,
       0.0
      ],
      [
       0.7,
       1.6946,
       0.0
      ],
      [
       0.8,
       1.4654,
       0.0
      ],
      [
       0.9,
       1.0991,
       0.0
      ],
      [
       1.0,
       0.7546,
       0.0
      ],
      [
       1.1,
       0.4762,
       0.0
      ],
      [
       1.2,
       0.2299,
       0.0
      ],
      [
       1.3,
       0.0202,
       0.0
      ],
      [
       1.333,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_Whitetipshark_Normal_Swim_A_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_Whitetipshark_Normal_Swim_B_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_Whitetipshark_Normal_Swim_C_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_Whitetipshark_QTE_Fail_A_01": {
     "len": 2.2,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.019,
       0.0264
      ],
      [
       0.2,
       0.0963,
       0.0528
      ],
      [
       0.3,
       0.4178,
       -0.0235
      ],
      [
       0.4,
       0.5966,
       0.0
      ],
      [
       0.5,
       0.5778,
       0.0
      ],
      [
       0.6,
       0.583,
       0.0
      ],
      [
       0.7,
       0.5757,
       0.0
      ],
      [
       0.8,
       0.548,
       0.0
      ],
      [
       0.9,
       0.567,
       0.0
      ],
      [
       1.0,
       0.498,
       0.0
      ],
      [
       1.1,
       0.5022,
       0.0051
      ],
      [
       1.2,
       0.4891,
       0.0513
      ],
      [
       1.3,
       0.484,
       0.0693
      ],
      [
       1.4,
       0.9531,
       0.0244
      ],
      [
       1.5,
       1.2191,
       0.0
      ],
      [
       1.6,
       1.2319,
       0.0
      ],
      [
       1.7,
       1.241,
       0.0
      ],
      [
       1.8,
       1.2471,
       0.0
      ],
      [
       1.9,
       1.2508,
       0.0
      ],
      [
       2.0,
       1.2527,
       0.0
      ],
      [
       2.1,
       1.2534,
       0.0
      ],
      [
       2.2,
       1.2536,
       0.0
      ],
      [
       2.2,
       1.2536,
       0.0
      ]
     ],
     "sfx": [
      [
       0.2,
       "shark_sound_longnosesawshark_qte_fail_01"
      ]
     ]
    },
    "Ani3D_Whitetipshark_QTE_Success_A_01": {
     "len": 3.1667,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.6801,
       0.132
      ],
      [
       0.2,
       1.0425,
       -0.1148
      ],
      [
       0.3,
       1.1308,
       -0.2294
      ],
      [
       0.4,
       1.1677,
       -0.3199
      ],
      [
       0.5,
       1.202,
       -0.4304
      ],
      [
       0.6,
       1.2509,
       -0.5978
      ],
      [
       0.7,
       1.3001,
       -0.7983
      ],
      [
       0.8,
       1.3519,
       -0.9851
      ],
      [
       0.9,
       1.41,
       -1.1104
      ],
      [
       1.0,
       1.4829,
       -1.1416
      ],
      [
       1.1,
       1.578,
       -1.1182
      ],
      [
       1.2,
       1.6841,
       -1.0676
      ],
      [
       1.3,
       1.7842,
       -0.9982
      ],
      [
       1.4,
       1.866,
       -0.9086
      ],
      [
       1.5,
       1.9261,
       -0.7964
      ],
      [
       1.6,
       1.9753,
       -0.6628
      ],
      [
       1.7,
       2.0173,
       -0.5185
      ],
      [
       1.8,
       2.0551,
       -0.3751
      ],
      [
       1.9,
       2.0913,
       -0.2439
      ],
      [
       2.0,
       2.1286,
       -0.1362
      ],
      [
       2.1,
       2.1661,
       -0.057
      ],
      [
       2.2,
       2.2007,
       -0.0023
      ],
      [
       2.3,
       2.2322,
       0.0307
      ],
      [
       2.4,
       2.2612,
       0.0447
      ],
      [
       2.5,
       2.2889,
       0.0422
      ],
      [
       2.6,
       2.3164,
       0.0288
      ],
      [
       2.7,
       2.3391,
       0.0124
      ],
      [
       2.8,
       2.3515,
       0.0017
      ],
      [
       2.9,
       2.3524,
       0.0008
      ],
      [
       3.0,
       2.3524,
       0.0008
      ],
      [
       3.1,
       2.3524,
       0.0008
      ],
      [
       3.167,
       2.3524,
       0.0008
      ]
     ],
     "sfx": [
      [
       0.0,
       "shark_sound_whitetipshark_qte_success_01"
      ]
     ]
    },
    "Ani3D_Whitetip_Reefshark_QTE_Enter_A_01": {
     "len": 1.2333,
     "loop": true,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.0882,
       0.0
      ],
      [
       0.2,
       -0.0077,
       0.0
      ],
      [
       0.3,
       0.0602,
       0.0
      ],
      [
       0.4,
       0.0,
       0.0
      ],
      [
       0.5,
       0.1084,
       0.0
      ],
      [
       0.6,
       0.0513,
       0.0
      ],
      [
       0.7,
       0.117,
       0.0
      ],
      [
       0.8,
       0.0416,
       0.0
      ],
      [
       0.9,
       0.0745,
       0.0
      ],
      [
       1.0,
       0.0172,
       0.0
      ],
      [
       1.1,
       0.0413,
       0.0
      ],
      [
       1.2,
       0.0156,
       0.0
      ],
      [
       1.233,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_Whitetipshark_Normal_Die_A_01": {
     "len": 3.5,
     "loop": false,
     "sfx": [
      [
       0.0,
       "shark_large_fish_die_01"
      ]
     ]
    },
    "Ani3D_Whitetipshark_Normal_Attack_C_01": {
     "len": 1.6667,
     "loop": true,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1084,
       0.0
      ],
      [
       0.2,
       0.0513,
       0.0
      ],
      [
       0.3,
       0.117,
       0.0
      ],
      [
       0.4,
       0.0416,
       0.0
      ],
      [
       0.5,
       0.0745,
       0.0
      ],
      [
       0.6,
       0.0172,
       0.0
      ],
      [
       0.7,
       0.0413,
       0.0
      ],
      [
       0.8,
       0.013,
       0.0
      ],
      [
       0.9,
       0.0803,
       0.0
      ],
      [
       1.0,
       0.0746,
       0.0
      ],
      [
       1.1,
       0.0793,
       0.0
      ],
      [
       1.2,
       0.072,
       0.0
      ],
      [
       1.3,
       0.0443,
       0.0
      ],
      [
       1.4,
       0.0633,
       0.0
      ],
      [
       1.5,
       0.0081,
       0.0
      ],
      [
       1.6,
       0.0437,
       0.0
      ],
      [
       1.667,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_Whitetipshark_QTE_Ready_A_01": {
     "len": 1.8,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       -0.0021,
       0.0
      ],
      [
       0.2,
       -0.0083,
       0.0
      ],
      [
       0.3,
       -0.0181,
       0.0
      ],
      [
       0.4,
       -0.0312,
       0.0
      ],
      [
       0.5,
       -0.0471,
       0.0
      ],
      [
       0.6,
       -0.0654,
       0.0
      ],
      [
       0.7,
       -0.0858,
       0.0
      ],
      [
       0.8,
       -0.1078,
       0.0
      ],
      [
       0.9,
       -0.131,
       0.0
      ],
      [
       1.0,
       -0.1551,
       0.0
      ],
      [
       1.1,
       -0.1797,
       0.0
      ],
      [
       1.2,
       -0.2042,
       0.0
      ],
      [
       1.3,
       -0.2285,
       0.0
      ],
      [
       1.4,
       -0.2519,
       0.0
      ],
      [
       1.5,
       -0.2742,
       0.0
      ],
      [
       1.6,
       -0.295,
       0.0
      ],
      [
       1.7,
       0.0659,
       0.0
      ],
      [
       1.8,
       1.187,
       0.0
      ],
      [
       1.8,
       1.187,
       0.0
      ]
     ]
    }
   },
   "icon": "art/shark/Blacktip_Reefshark_icon.png"
  },
  {
   "id": "Copper_Shark",
   "tid": 2010059,
   "tids": [
    2010059
   ],
   "zone": "A",
   "name": "Copper Shark",
   "hp": 200,
   "damage": 50,
   "size": 2,
   "cm": 230,
   "rank": 6,
   "activeType": 1,
   "qteLevel": 1,
   "carvable": 2,
   "night": null,
   "glb": "art/shark/Copper_Shark.glb",
   "kb": 227,
   "prefab": "Fish/A/Copper_Shark/Prefabs/SA_2010059_Copper_Shark.prefab",
   "controller": "SA_Cooper_Shark",
   "ai": {
    "AggressionType": 2.0,
    "SwimSpeed": 0.0,
    "runToHomeSpeed": 2.85,
    "FishBattleSpeedRate": 1.1,
    "RotateSpeed": 50.0,
    "RangeFindEnemy": 5.0,
    "SprintLimitTime": 1.25,
    "CoolTimeSprintDecision": 6.5,
    "RangeAbleToSprintAttack": 5.0,
    "LeastAngleToSprint": 13.0,
    "MaxRangeCanFollow": 8.0,
    "TurnWeigh": 0.8,
    "SwimWeigh": 2.8,
    "SprintWeigh": 5.0,
    "LimitTimeFindEnemyFromRun": 5.0,
    "abilities": {
     "rage": {
      "time": 3.0,
      "afterAttack": 5.0
     },
     "sprint": {
      "speed": 5.5
     },
     "qte": {
      "range": 7.0,
      "angle": 10.0,
      "cool": 3.0,
      "sprint": 0.0,
      "accel": 1.0
     },
     "other": [
      "FishQTEData",
      "AniSpeedDataQTEAble",
      "AfterSprint_IncreaseRotation"
     ]
    },
    "src": "Assets/ScriptableObjects/Fish/SA_Fish/SA_2010059_CopperShark.asset"
   },
   "scale": 1.0,
   "face": 1,
   "bounds": [
    -3.438,
    -0.634,
    1.666,
    0.76
   ],
   "mouth": [
    0.781,
    -0.055
   ],
   "roles": {
    "sprint": "Ani3D_CopperShark_Normal_Sprint_A_01",
    "turn": "Ani3D_CopperShark_Normal_SwimTurn_A_01",
    "swim": "Ani3D_CopperShark_Normal_Swim_A_01",
    "swimB": "Ani3D_CopperShark_Normal_Swim_B_01",
    "swimC": "Ani3D_CopperShark_Normal_Swim_C_01",
    "qteFail": "Ani3D_CopperShark_QTE_Fail_A_01",
    "qteSuccess": "Ani3D_CopperShark_QTE_Success_A_01",
    "qteEnter": "Ani3D_CopperShark_QTE_Enter_A_01",
    "die": "Ani3D_CopperShark_Normal_Die_A_01",
    "attack": "Ani3D_Whitetipshark_Normal_Attack_C_01",
    "qteReady": "Ani3D_CopperShark_QTE_Ready_A_01"
   },
   "clips": {
    "Ani3D_CopperShark_Normal_Sprint_A_01": {
     "len": 1.3333,
     "loop": true,
     "sfx": [
      [
       0.0,
       "shark_sound_whitetipshark_qte_entera_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Attack_01",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Body_A_01_StrongSprint",
       "Bip001"
      ]
     ]
    },
    "Ani3D_CopperShark_Normal_SwimTurn_A_01": {
     "len": 1.4,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1586,
       0.0
      ],
      [
       0.2,
       0.4314,
       0.0
      ],
      [
       0.3,
       0.7442,
       0.0
      ],
      [
       0.4,
       1.1399,
       0.0
      ],
      [
       0.5,
       1.5151,
       0.0
      ],
      [
       0.6,
       1.6841,
       0.0
      ],
      [
       0.7,
       1.6946,
       0.0
      ],
      [
       0.8,
       1.4654,
       0.0
      ],
      [
       0.9,
       1.0991,
       0.0
      ],
      [
       1.0,
       0.7546,
       0.0
      ],
      [
       1.1,
       0.4762,
       0.0
      ],
      [
       1.2,
       0.2299,
       0.0
      ],
      [
       1.3,
       0.0202,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ]
     ],
     "sfx": [
      [
       0.0,
       "shark_sound_cookiecutter_qte_success_01"
      ]
     ]
    },
    "Ani3D_CopperShark_Normal_Swim_A_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_CopperShark_Normal_Swim_B_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_CopperShark_Normal_Swim_C_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_CopperShark_QTE_Fail_A_01": {
     "len": 2.2,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.019,
       0.0264
      ],
      [
       0.2,
       0.0963,
       0.0528
      ],
      [
       0.3,
       0.4178,
       -0.0235
      ],
      [
       0.4,
       0.5974,
       0.0
      ],
      [
       0.5,
       0.5783,
       0.0
      ],
      [
       0.6,
       0.583,
       0.0
      ],
      [
       0.7,
       0.5757,
       0.0
      ],
      [
       0.8,
       0.548,
       0.0
      ],
      [
       0.9,
       0.567,
       0.0
      ],
      [
       1.0,
       0.498,
       0.0
      ],
      [
       1.1,
       0.5022,
       0.0051
      ],
      [
       1.2,
       0.4891,
       0.0513
      ],
      [
       1.3,
       0.484,
       0.0693
      ],
      [
       1.4,
       0.941,
       0.0244
      ],
      [
       1.5,
       1.2352,
       0.0
      ],
      [
       1.6,
       1.2876,
       0.0
      ],
      [
       1.7,
       1.3252,
       0.0
      ],
      [
       1.8,
       1.3503,
       0.0
      ],
      [
       1.9,
       1.3656,
       0.0
      ],
      [
       2.0,
       1.3734,
       0.0
      ],
      [
       2.1,
       1.3763,
       0.0
      ],
      [
       2.2,
       1.3767,
       0.0
      ],
      [
       2.2,
       1.3767,
       0.0
      ]
     ],
     "sfx": [
      [
       0.4,
       "shark_sound_longnosesawshark_qte_fail_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Blood_A_01",
       "Bip001 Mouth"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_AttackD_Bip001 Mouth_Spit_A_01",
       "Bip001 Mouth"
      ]
     ]
    },
    "Ani3D_CopperShark_QTE_Success_A_01": {
     "len": 3.3333,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.0233,
       0.01
      ],
      [
       0.2,
       0.2656,
       0.0789
      ],
      [
       0.3,
       0.8093,
       0.0945
      ],
      [
       0.4,
       1.0954,
       -0.1403
      ],
      [
       0.5,
       1.1815,
       -0.261
      ],
      [
       0.6,
       1.2536,
       -0.3703
      ],
      [
       0.7,
       1.3262,
       -0.4861
      ],
      [
       0.8,
       1.3923,
       -0.5867
      ],
      [
       0.9,
       1.4498,
       -0.6582
      ],
      [
       1.0,
       1.506,
       -0.7032
      ],
      [
       1.1,
       1.5674,
       -0.7231
      ],
      [
       1.2,
       1.6408,
       -0.7189
      ],
      [
       1.3,
       1.725,
       -0.6932
      ],
      [
       1.4,
       1.8115,
       -0.6516
      ],
      [
       1.5,
       1.8912,
       -0.5994
      ],
      [
       1.6,
       1.9562,
       -0.5414
      ],
      [
       1.7,
       2.011,
       -0.4749
      ],
      [
       1.8,
       2.0596,
       -0.4013
      ],
      [
       1.9,
       2.1036,
       -0.3248
      ],
      [
       2.0,
       2.1443,
       -0.2493
      ],
      [
       2.1,
       2.1833,
       -0.1786
      ],
      [
       2.2,
       2.222,
       -0.1162
      ],
      [
       2.3,
       2.2585,
       -0.0574
      ],
      [
       2.4,
       2.291,
       -0.0057
      ],
      [
       2.5,
       2.319,
       0.0314
      ],
      [
       2.6,
       2.3416,
       0.0456
      ],
      [
       2.7,
       2.357,
       0.0386
      ],
      [
       2.8,
       2.3654,
       0.0232
      ],
      [
       2.9,
       2.3701,
       0.0078
      ],
      [
       3.0,
       2.3743,
       0.0008
      ],
      [
       3.1,
       2.3779,
       0.0008
      ],
      [
       3.2,
       2.3795,
       0.0008
      ],
      [
       3.3,
       2.3798,
       0.0008
      ],
      [
       3.333,
       2.3798,
       0.0008
      ]
     ],
     "sfx": [
      [
       0.0,
       "shark_sound_whitetipshark_qte_success_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ]
     ]
    },
    "Ani3D_CopperShark_QTE_Enter_A_01": {
     "len": 1.2333,
     "loop": true,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       -0.0033,
       0.0
      ],
      [
       0.2,
       -0.0712,
       0.0
      ],
      [
       0.3,
       -0.0033,
       0.0
      ],
      [
       0.4,
       -0.0635,
       0.0
      ],
      [
       0.5,
       0.0449,
       0.0
      ],
      [
       0.6,
       -0.0228,
       0.0
      ],
      [
       0.7,
       0.0535,
       0.0
      ],
      [
       0.8,
       -0.0223,
       0.0
      ],
      [
       0.9,
       0.011,
       0.0
      ],
      [
       1.0,
       -0.0456,
       0.0
      ],
      [
       1.1,
       -0.0224,
       0.0
      ],
      [
       1.2,
       -0.0002,
       0.0
      ],
      [
       1.233,
       0.0,
       0.0
      ]
     ],
     "sfx": [
      [
       0.01,
       "shark_sound_whitetipshark_qte_entera_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Succes_DaveLegs_A_01",
       "Bip001 Mouth"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Enter_A_01",
       "Bip001"
      ]
     ]
    },
    "Ani3D_CopperShark_Normal_Die_A_01": {
     "len": 3.5,
     "loop": false,
     "sfx": [
      [
       0.0,
       "shark_large_fish_die_01"
      ]
     ]
    },
    "Ani3D_Whitetipshark_Normal_Attack_C_01": {
     "len": 1.6667,
     "loop": true,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1084,
       0.0
      ],
      [
       0.2,
       0.0513,
       0.0
      ],
      [
       0.3,
       0.117,
       0.0
      ],
      [
       0.4,
       0.0416,
       0.0
      ],
      [
       0.5,
       0.0745,
       0.0
      ],
      [
       0.6,
       0.0172,
       0.0
      ],
      [
       0.7,
       0.0413,
       0.0
      ],
      [
       0.8,
       0.013,
       0.0
      ],
      [
       0.9,
       0.0803,
       0.0
      ],
      [
       1.0,
       0.0746,
       0.0
      ],
      [
       1.1,
       0.0793,
       0.0
      ],
      [
       1.2,
       0.072,
       0.0
      ],
      [
       1.3,
       0.0443,
       0.0
      ],
      [
       1.4,
       0.0633,
       0.0
      ],
      [
       1.5,
       0.0081,
       0.0
      ],
      [
       1.6,
       0.0437,
       0.0
      ],
      [
       1.667,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_CopperShark_QTE_Ready_A_01": {
     "len": 1.8,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       -0.0021,
       0.0
      ],
      [
       0.2,
       -0.0083,
       0.0
      ],
      [
       0.3,
       -0.0181,
       0.0
      ],
      [
       0.4,
       -0.0312,
       0.0
      ],
      [
       0.5,
       -0.0471,
       0.0
      ],
      [
       0.6,
       -0.0654,
       0.0
      ],
      [
       0.7,
       -0.0858,
       0.0
      ],
      [
       0.8,
       -0.1078,
       0.0
      ],
      [
       0.9,
       -0.131,
       0.0
      ],
      [
       1.0,
       -0.1551,
       0.0
      ],
      [
       1.1,
       -0.1797,
       0.0
      ],
      [
       1.2,
       -0.2042,
       0.0
      ],
      [
       1.3,
       -0.2285,
       0.0
      ],
      [
       1.4,
       -0.2519,
       0.0
      ],
      [
       1.5,
       -0.2742,
       0.0
      ],
      [
       1.6,
       -0.295,
       0.0
      ],
      [
       1.7,
       0.0659,
       0.0
      ],
      [
       1.8,
       1.187,
       0.0
      ],
      [
       1.8,
       1.187,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_02",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_02",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_02",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_02",
       "Bip001"
      ]
     ]
    }
   },
   "icon": "art/shark/Copper_Shark_icon.png"
  },
  {
   "id": "Shortfin_Mako",
   "tid": 2010073,
   "tids": [
    2010073
   ],
   "zone": "A",
   "name": "Shortfin Mako",
   "hp": 230,
   "damage": 70,
   "size": 2,
   "cm": 270,
   "rank": 8,
   "activeType": 0,
   "qteLevel": 1,
   "carvable": 2,
   "night": null,
   "glb": "art/shark/Shortfin_Mako.glb",
   "kb": 275,
   "prefab": "Fish/A/Shortfin_Mako/Prefabs/SA_2010073_Shortfin_Mako.prefab",
   "controller": "Shortfin_Mako01_SA",
   "ai": {
    "AggressionType": 2.0,
    "SwimSpeed": 0.0,
    "runToHomeSpeed": 2.85,
    "FishBattleSpeedRate": 1.0,
    "RotateSpeed": 40.0,
    "RangeFindEnemy": 7.2,
    "SprintLimitTime": 1.1,
    "CoolTimeSprintDecision": 10.0,
    "RangeAbleToSprintAttack": 6.0,
    "LeastAngleToSprint": 13.0,
    "MaxRangeCanFollow": 8.0,
    "TurnWeigh": 0.8,
    "SwimWeigh": 2.8,
    "SprintWeigh": 4.0,
    "LimitTimeFindEnemyFromRun": 3.0,
    "abilities": {
     "other": [
      "AniSpeedDataQTEAble",
      "FishQTEData"
     ]
    },
    "src": "Assets/ScriptableObjects/Fish/SA_Fish/SA_2010073_Shortfin_Mako.asset"
   },
   "scale": 1.0,
   "face": 1,
   "bounds": [
    -3.231,
    -0.746,
    1.45,
    0.961
   ],
   "mouth": [
    0.539,
    0.003
   ],
   "roles": {
    "swim": "Ani3D_ShortfinMako_Normal_Swim_A_01",
    "swimB": "Ani3D_ShortfinMako_Normal_Swim_B_01",
    "swimC": "Ani3D_ShortfinMako_Normal_Swim_C_01",
    "sprint": "Ani3D_ShortfinMako_Normal_Sprint_A_01",
    "turn": "Ani3D_ShortfinMako_Normal_SwimTurn_A_01",
    "die": "Ani3D_ShortfinMako_Normal_Die_A_01",
    "idle": "Ani3D_ShortfinMako_Normal_SwimTurn_A_01",
    "qteReady": "Ani3D_ShortfinMako_QTE_Ready_A_01",
    "attack": "Ani3D_ShortfinMako_Normal_Attack_A_01",
    "attack2": "Ani3D_ShortfinMako_Normal_Attack_A_02",
    "qteFail": "Ani3D_ShortfinMako_QTE_Fail_A_01",
    "qteSuccess": "Ani3D_ShortfinMako_QTE_Success_A_01",
    "qteEnter": "Ani3D_ShortfinMako_QTE_Enter_A_01"
   },
   "clips": {
    "Ani3D_ShortfinMako_Normal_Swim_A_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_ShortfinMako_Normal_Swim_B_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_ShortfinMako_Normal_Swim_C_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_ShortfinMako_Normal_Sprint_A_01": {
     "len": 1.3333,
     "loop": true,
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Attack_01",
       "Bip001 Tail_Bottom01"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Body_A_01_StrongSprint",
       "Bip001"
      ]
     ]
    },
    "Ani3D_ShortfinMako_Normal_SwimTurn_A_01": {
     "len": 1.4,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1586,
       0.0
      ],
      [
       0.2,
       0.4314,
       0.0
      ],
      [
       0.3,
       0.7442,
       0.0
      ],
      [
       0.4,
       1.1399,
       0.0
      ],
      [
       0.5,
       1.5151,
       0.0
      ],
      [
       0.6,
       1.6841,
       0.0
      ],
      [
       0.7,
       1.6946,
       0.0
      ],
      [
       0.8,
       1.4654,
       0.0
      ],
      [
       0.9,
       1.0991,
       0.0
      ],
      [
       1.0,
       0.7546,
       0.0
      ],
      [
       1.1,
       0.4762,
       0.0
      ],
      [
       1.2,
       0.2299,
       0.0
      ],
      [
       1.3,
       0.0202,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_ShortfinMako_Normal_Die_A_01": {
     "len": 3.5,
     "loop": false
    },
    "Ani3D_ShortfinMako_QTE_Ready_A_01": {
     "len": 1.6667,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       -0.0084,
       0.0113
      ],
      [
       0.2,
       -0.032,
       0.0428
      ],
      [
       0.3,
       -0.0684,
       0.0908
      ],
      [
       0.4,
       -0.115,
       0.1517
      ],
      [
       0.5,
       -0.1694,
       0.2217
      ],
      [
       0.6,
       -0.2291,
       0.2972
      ],
      [
       0.7,
       -0.2916,
       0.3745
      ],
      [
       0.8,
       -0.3544,
       0.4498
      ],
      [
       0.9,
       -0.4151,
       0.5195
      ],
      [
       1.0,
       -0.4721,
       0.5802
      ],
      [
       1.1,
       -0.5363,
       0.6333
      ],
      [
       1.2,
       -0.6118,
       0.6829
      ],
      [
       1.3,
       -0.6939,
       0.7312
      ],
      [
       1.4,
       -0.7713,
       0.7787
      ],
      [
       1.5,
       -0.8345,
       0.8266
      ],
      [
       1.6,
       -0.8738,
       0.8758
      ],
      [
       1.667,
       -0.8821,
       0.9099
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_02",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_02",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_02",
       "Bip001 Tail_Bottom01"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_02",
       "Bip001"
      ]
     ]
    },
    "Ani3D_ShortfinMako_Normal_Attack_A_01": {
     "len": 0.7333,
     "loop": true,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       1.05,
       0.0
      ],
      [
       0.2,
       2.1,
       0.0
      ],
      [
       0.3,
       3.15,
       0.0
      ],
      [
       0.4,
       4.2,
       0.0
      ],
      [
       0.5,
       5.25,
       0.0
      ],
      [
       0.6,
       6.3,
       0.0
      ],
      [
       0.7,
       7.0,
       0.0
      ],
      [
       0.733,
       7.0,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Attack_01",
       "Bip001 Tail_Bottom01"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Body_A_01_StrongSprint",
       "Bip001"
      ]
     ]
    },
    "Ani3D_ShortfinMako_Normal_Attack_A_02": {
     "len": 1.5333,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.2443,
       0.0
      ],
      [
       0.2,
       0.4886,
       0.0
      ],
      [
       0.3,
       0.7329,
       0.0
      ],
      [
       0.4,
       1.5553,
       0.0
      ],
      [
       0.5,
       2.1241,
       0.0
      ],
      [
       0.6,
       2.4216,
       0.0
      ],
      [
       0.7,
       2.7191,
       0.0
      ],
      [
       0.8,
       3.0166,
       0.0
      ],
      [
       0.9,
       3.3141,
       0.0
      ],
      [
       1.0,
       3.6116,
       0.0
      ],
      [
       1.1,
       3.9091,
       0.0
      ],
      [
       1.2,
       4.2066,
       0.0
      ],
      [
       1.3,
       4.5041,
       0.0
      ],
      [
       1.4,
       4.8017,
       0.0
      ],
      [
       1.5,
       5.0,
       0.0
      ],
      [
       1.533,
       5.0,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Attack_01",
       "Bip001 Tail_Bottom01"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Body_A_01_StrongSprint",
       "Bip001"
      ],
      [
       0.35,
       "VFX_Shortfin_Mako_Bite_A_01",
       "Bip001 Mouth"
      ]
     ]
    },
    "Ani3D_ShortfinMako_QTE_Fail_A_01": {
     "len": 2.2,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.019,
       0.0264
      ],
      [
       0.2,
       0.0963,
       0.0528
      ],
      [
       0.3,
       0.4178,
       -0.0235
      ],
      [
       0.4,
       0.5974,
       0.0
      ],
      [
       0.5,
       0.5783,
       0.0
      ],
      [
       0.6,
       0.583,
       0.0
      ],
      [
       0.7,
       0.5757,
       0.0
      ],
      [
       0.8,
       0.548,
       0.0
      ],
      [
       0.9,
       0.567,
       0.0
      ],
      [
       1.0,
       0.498,
       0.0
      ],
      [
       1.1,
       0.5022,
       0.0051
      ],
      [
       1.2,
       0.4891,
       0.0513
      ],
      [
       1.3,
       0.484,
       0.0693
      ],
      [
       1.4,
       0.9334,
       -0.2332
      ],
      [
       1.5,
       1.2803,
       -0.471
      ],
      [
       1.6,
       1.4132,
       -0.5682
      ],
      [
       1.7,
       1.5281,
       -0.6544
      ],
      [
       1.8,
       1.6242,
       -0.7283
      ],
      [
       1.9,
       1.7009,
       -0.7888
      ],
      [
       2.0,
       1.7577,
       -0.8345
      ],
      [
       2.1,
       1.7938,
       -0.8641
      ],
      [
       2.2,
       1.8087,
       -0.8766
      ],
      [
       2.2,
       1.8087,
       -0.8766
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Bottom01"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Blood_A_01",
       "Bip001 Mouth"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_AttackD_Bip001 Mouth_Spit_A_01",
       "Bip001 Mouth"
      ]
     ]
    },
    "Ani3D_ShortfinMako_QTE_Success_A_01": {
     "len": 3.3333,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1216,
       -0.072
      ],
      [
       0.2,
       0.4036,
       -0.1039
      ],
      [
       0.3,
       0.8114,
       -0.145
      ],
      [
       0.4,
       1.1085,
       -0.3305
      ],
      [
       0.5,
       1.2528,
       -0.5086
      ],
      [
       0.6,
       1.4053,
       -0.6983
      ],
      [
       0.7,
       1.5295,
       -0.8097
      ],
      [
       0.8,
       1.6277,
       -0.8733
      ],
      [
       0.9,
       1.7141,
       -0.9216
      ],
      [
       1.0,
       1.7986,
       -0.9616
      ],
      [
       1.1,
       1.891,
       -1.0014
      ],
      [
       1.2,
       2.0006,
       -1.0505
      ],
      [
       1.3,
       2.1237,
       -1.1052
      ],
      [
       1.4,
       2.2502,
       -1.1539
      ],
      [
       1.5,
       2.3703,
       -1.185
      ],
      [
       1.6,
       2.474,
       -1.187
      ],
      [
       1.7,
       2.5565,
       -1.1509
      ],
      [
       1.8,
       2.6295,
       -1.0864
      ],
      [
       1.9,
       2.6959,
       -1.0103
      ],
      [
       2.0,
       2.7577,
       -0.9391
      ],
      [
       2.1,
       2.8169,
       -0.8895
      ],
      [
       2.2,
       2.8751,
       -0.8753
      ],
      [
       2.3,
       2.9285,
       -0.8729
      ],
      [
       2.4,
       2.9755,
       -0.8722
      ],
      [
       2.5,
       3.0155,
       -0.8727
      ],
      [
       2.6,
       3.0482,
       -0.8739
      ],
      [
       2.7,
       3.073,
       -0.8753
      ],
      [
       2.8,
       3.0897,
       -0.8763
      ],
      [
       2.9,
       3.0981,
       -0.8766
      ],
      [
       3.0,
       3.1037,
       -0.8766
      ],
      [
       3.1,
       3.108,
       -0.8766
      ],
      [
       3.2,
       3.111,
       -0.8766
      ],
      [
       3.3,
       3.1124,
       -0.8766
      ],
      [
       3.333,
       3.1125,
       -0.8766
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Bottom01"
      ]
     ]
    },
    "Ani3D_ShortfinMako_QTE_Enter_A_01": {
     "len": 0.6667,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.3626,
       0.0186
      ],
      [
       0.2,
       1.1652,
       0.0561
      ],
      [
       0.3,
       1.9551,
       0.0842
      ],
      [
       0.4,
       2.4741,
       0.0736
      ],
      [
       0.5,
       2.8785,
       0.0265
      ],
      [
       0.6,
       3.1461,
       -0.0209
      ],
      [
       0.667,
       3.2043,
       -0.0333
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Bottom01"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Succes_DaveLegs_A_01",
       "Bip001 Mouth"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Enter_A_01",
       "Bip001"
      ]
     ]
    }
   },
   "icon": "art/shark/Shortfin_Mako_icon.png"
  },
  {
   "id": "Zebra_Shark",
   "tid": 2010074,
   "tids": [
    2010074
   ],
   "zone": "A",
   "name": "Zebra Shark",
   "hp": 250,
   "damage": 53,
   "size": 2,
   "cm": 240,
   "rank": 8,
   "activeType": 1,
   "qteLevel": 1,
   "carvable": 2,
   "night": null,
   "glb": "art/shark/Zebra_Shark.glb",
   "kb": 171,
   "prefab": "Fish/A/Zebra_Shark01/Prefabs/SA_2010074_Zebra_Shark01.prefab",
   "controller": "Zebra_Shark01_SA",
   "ai": {
    "AggressionType": 4.0,
    "SwimSpeed": 0.9,
    "runToHomeSpeed": 2.75,
    "FishBattleSpeedRate": 2.1,
    "RotateSpeed": 35.0,
    "RangeFindEnemy": 6.5,
    "SprintLimitTime": 1.1,
    "CoolTimeSprintDecision": 1.5,
    "RangeAbleToSprintAttack": 5.5,
    "LeastAngleToSprint": 14.0,
    "MaxRangeCanFollow": 15.0,
    "TurnWeigh": 0.9,
    "SwimWeigh": 3.0,
    "SprintWeigh": 5.0,
    "LimitTimeFindEnemyFromRun": 2.0,
    "abilities": {
     "sprint": {
      "speed": 5.5
     },
     "other": [
      "AniSpeedDataQTEAble",
      "AfterSprint_IncreaseRotation",
      "DR.AI.AwayFromTargetData"
     ]
    },
    "src": "Assets/ScriptableObjects/Fish/SA_Fish/SA_2010074_Zebra_Shark01.asset"
   },
   "scale": 1.0,
   "face": 1,
   "bounds": [
    -2.566,
    -0.539,
    1.111,
    0.451
   ],
   "mouth": [
    0.656,
    -0.042
   ],
   "roles": {
    "sprint": "Ani3D_ZebraShark_Normal_Attack_A_01",
    "swim": "Ani3D_ZebraShark_Normal_Swim_A_01",
    "swimB": "Ani3D_ZebraShark_Normal_Swim_B_01",
    "swimC": "Ani3D_ZebraShark_Normal_Swim_C_01",
    "turn": "Ani3D_ZebraShark_Normal_SwimTurn_A_01",
    "die": "Ani3D_ZebraShark_Normal_Die_A_01",
    "idle": "Ani3D_ZebraShark_Normal_SwimTurn_A_01",
    "attack": "Ani3D_ZebraShark_Normal_Attack_A_01"
   },
   "clips": {
    "Ani3D_ZebraShark_Normal_Attack_A_01": {
     "len": 1.0,
     "loop": true,
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Attack_01",
       "Bip001 Tail_Top02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Body_A_01_StrongSprint",
       "Bip001"
      ]
     ]
    },
    "Ani3D_ZebraShark_Normal_Swim_A_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_ZebraShark_Normal_Swim_B_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_ZebraShark_Normal_Swim_C_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_ZebraShark_Normal_SwimTurn_A_01": {
     "len": 1.4,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1586,
       0.0
      ],
      [
       0.2,
       0.4314,
       0.0
      ],
      [
       0.3,
       0.7442,
       0.0
      ],
      [
       0.4,
       1.1399,
       0.0
      ],
      [
       0.5,
       1.5151,
       0.0
      ],
      [
       0.6,
       1.6841,
       0.0
      ],
      [
       0.7,
       1.6946,
       0.0
      ],
      [
       0.8,
       1.4654,
       0.0
      ],
      [
       0.9,
       1.0991,
       0.0
      ],
      [
       1.0,
       0.7546,
       0.0
      ],
      [
       1.1,
       0.4762,
       0.0
      ],
      [
       1.2,
       0.2299,
       0.0
      ],
      [
       1.3,
       0.0202,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_ZebraShark_Normal_Die_A_01": {
     "len": 3.5,
     "loop": false
    }
   },
   "icon": "art/shark/Zebra_Shark_icon.png"
  },
  {
   "id": "Thresher_Shark",
   "tid": 2010132,
   "tids": [
    2010132
   ],
   "zone": "A",
   "name": "Thresher Shark",
   "hp": 220,
   "damage": 80,
   "size": 2,
   "cm": 320,
   "rank": 9,
   "activeType": 0,
   "qteLevel": 1,
   "carvable": 2,
   "night": null,
   "glb": "art/shark/Thresher_Shark.glb",
   "kb": 242,
   "prefab": "Fish/A/Thresher_Shark01/Prefabs/SA_2010132_Thresher_Shark01.prefab",
   "controller": "Thresher_Shark01_SA",
   "ai": {
    "AggressionType": 2.0,
    "SwimSpeed": 0.9,
    "runToHomeSpeed": 2.9,
    "FishBattleSpeedRate": 1.65,
    "RotateSpeed": 50.0,
    "RangeFindEnemy": 5.5,
    "SprintLimitTime": 1.0,
    "CoolTimeSprintDecision": 12.0,
    "RangeAbleToSprintAttack": 7.0,
    "LeastAngleToSprint": 11.0,
    "MaxRangeCanFollow": 7.5,
    "TurnWeigh": 0.9,
    "SwimWeigh": 2.2,
    "SprintWeigh": 2.8,
    "LimitTimeFindEnemyFromRun": 3.0,
    "abilities": {
     "sprint": {
      "speed": 5.5
     },
     "other": [
      "AfterSprint_IncreaseRotation",
      "AniSpeedDataQTEAble"
     ]
    },
    "src": "Assets/ScriptableObjects/Fish/SA_Fish/SA_2010132_Thresher_Shark01.asset"
   },
   "scale": 1.0,
   "face": 1,
   "bounds": [
    -4.914,
    -0.662,
    0.728,
    0.627
   ],
   "mouth": [
    0.167,
    0.0
   ],
   "roles": {
    "idle": "Ani3D_ThresherShark_Normal_SwimTurn_A_01",
    "swimB": "Ani3D_ThresherShark_Normal_Swim_B_01",
    "swimC": "Ani3D_ThresherShark_Normal_Swim_C_01",
    "swim": "Ani3D_ThresherShark_Normal_Swim_A_01",
    "sprint": "Ani3D_ThresherShark_Normal_Sprint_A_01",
    "turn": "Ani3D_ThresherShark_Normal_SwimTurn_A_01",
    "die": "Ani3D_ThresherShark_Normal_Die_A_01",
    "attack": "Ani3D_ThresherShark_Normal_Attack_A_01",
    "attack2": "Ani3D_ThresherShark_Normal_Attack_A_02"
   },
   "clips": {
    "Ani3D_ThresherShark_Normal_SwimTurn_A_01": {
     "len": 1.7333,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1586,
       0.0
      ],
      [
       0.2,
       0.4314,
       0.0
      ],
      [
       0.3,
       0.7442,
       0.0
      ],
      [
       0.4,
       1.1399,
       0.0
      ],
      [
       0.5,
       1.5151,
       0.0
      ],
      [
       0.6,
       1.6841,
       0.0
      ],
      [
       0.7,
       1.7032,
       0.0
      ],
      [
       0.8,
       1.5752,
       0.0
      ],
      [
       0.9,
       1.3451,
       0.0
      ],
      [
       1.0,
       1.0749,
       0.0
      ],
      [
       1.1,
       0.8236,
       0.0
      ],
      [
       1.2,
       0.6312,
       0.0
      ],
      [
       1.3,
       0.4614,
       0.0
      ],
      [
       1.4,
       0.3095,
       0.0
      ],
      [
       1.5,
       0.1571,
       0.0
      ],
      [
       1.6,
       0.0308,
       0.0
      ],
      [
       1.7,
       0.0,
       0.0
      ],
      [
       1.733,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_ThresherShark_Normal_Swim_B_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_ThresherShark_Normal_Swim_C_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_ThresherShark_Normal_Swim_A_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_ThresherShark_Normal_Sprint_A_01": {
     "len": 1.3333,
     "loop": true,
     "fx": [
      [
       0.0,
       "VFX_Thresher_Shark_Tail_Top02_A_01",
       "Bip001 Tail_Top02"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Tail_Top05_A_01",
       "Bip001 Tail_Top05"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Body_A_01_StrongSprint",
       "Bip001"
      ]
     ]
    },
    "Ani3D_ThresherShark_Normal_Die_A_01": {
     "len": 3.5,
     "loop": false
    },
    "Ani3D_ThresherShark_Normal_Attack_A_01": {
     "len": 0.6667,
     "loop": true,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       1.05,
       0.0
      ],
      [
       0.2,
       2.1,
       0.0
      ],
      [
       0.3,
       3.15,
       0.0
      ],
      [
       0.4,
       4.2,
       0.0
      ],
      [
       0.5,
       5.25,
       0.0
      ],
      [
       0.6,
       6.3,
       0.0
      ],
      [
       0.667,
       7.0,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Thresher_Shark_Tail_Top02_A_02",
       "Bip001 Tail_Top02"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Tail_Top05_A_02",
       "Bip001 Tail_Top05"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Fin_A_02",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Fin_A_02",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Body_A_01",
       "Bip001"
      ]
     ]
    },
    "Ani3D_ThresherShark_Normal_Attack_A_02": {
     "len": 1.5333,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.2687,
       0.0
      ],
      [
       0.2,
       0.5375,
       0.0
      ],
      [
       0.3,
       0.8062,
       0.0
      ],
      [
       0.4,
       1.3879,
       0.0
      ],
      [
       0.5,
       1.8511,
       0.0
      ],
      [
       0.6,
       2.1768,
       0.0
      ],
      [
       0.7,
       2.5026,
       0.0
      ],
      [
       0.8,
       2.8283,
       0.0
      ],
      [
       0.9,
       3.1541,
       0.0
      ],
      [
       1.0,
       3.4798,
       0.0
      ],
      [
       1.1,
       3.8056,
       0.0
      ],
      [
       1.2,
       4.1313,
       0.0
      ],
      [
       1.3,
       4.4571,
       0.0
      ],
      [
       1.4,
       4.7828,
       0.0
      ],
      [
       1.5,
       5.0136,
       0.0
      ],
      [
       1.533,
       5.0,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Thresher_Shark_Tail_Top02_A_02",
       "Bip001 Tail_Top02"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Tail_Top05_A_02",
       "Bip001 Tail_Top05"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Fin_A_02",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Fin_A_02",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Body_A_01",
       "Bip001"
      ],
      [
       0.5,
       "VFX_Thresher_Shark_Tail_Top02_A_02",
       "Bip001 Tail_Top02"
      ],
      [
       0.5,
       "VFX_Thresher_Shark_Tail_Top05_A_02",
       "Bip001 Tail_Top05"
      ],
      [
       0.5,
       "VFX_Thresher_Shark_Fin_A_02",
       "Bip001 Fin_L02"
      ],
      [
       0.5,
       "VFX_Thresher_Shark_Fin_A_02",
       "Bip001 Fin_R02"
      ],
      [
       0.5,
       "VFX_Thresher_Shark_Body_A_01",
       "Bip001"
      ],
      [
       0.4,
       "VFX_Tiger_Shark_Bite_A_01",
       "Bip001 Mouth"
      ]
     ]
    },
    "Ani3D_ThresherShark_Normal_Attack_B_02": {
     "len": 1.6667,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.6337,
       0.0
      ],
      [
       0.2,
       1.2673,
       0.0
      ],
      [
       0.3,
       1.901,
       0.0
      ],
      [
       0.4,
       2.5346,
       0.0
      ],
      [
       0.5,
       3.1682,
       0.0
      ],
      [
       0.6,
       3.8019,
       0.0
      ],
      [
       0.7,
       4.4831,
       0.0
      ],
      [
       0.8,
       5.2593,
       0.0
      ],
      [
       0.9,
       5.6893,
       0.0
      ],
      [
       1.0,
       6.0269,
       0.0
      ],
      [
       1.1,
       6.3194,
       0.0
      ],
      [
       1.2,
       6.5757,
       0.0
      ],
      [
       1.3,
       6.8048,
       0.0
      ],
      [
       1.4,
       7.0127,
       0.0
      ],
      [
       1.5,
       7.1671,
       0.0
      ],
      [
       1.6,
       7.2529,
       0.0
      ],
      [
       1.667,
       7.2696,
       0.0
      ]
     ],
     "sfx": [
      [
       0.0,
       "shark_sound_whitetipshark_qte_entera_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Thresher_Shark_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Thresher_Shark_Body_A_01_StrongSprint",
       "Bip001"
      ],
      [
       0.7,
       "VFX_Thresher_Shark_Tail_Top02_A_01_Strong",
       "Bip001 Tail_Top02"
      ],
      [
       0.7,
       "VFX_Thresher_Shark_Tail_Top05_A_01_Strong",
       "Bip001 Tail_Top05"
      ]
     ]
    }
   },
   "icon": "art/shark/Thresher_Shark_icon.png"
  },
  {
   "id": "Tiger_Shark",
   "tid": 2010119,
   "tids": [
    2010119,
    2010128
   ],
   "zone": "B",
   "name": "Tiger Shark",
   "hp": 175,
   "damage": 40,
   "size": 2,
   "cm": 650,
   "rank": 6,
   "activeType": 0,
   "qteLevel": 0,
   "carvable": 2,
   "night": {
    "tid": 2010128,
    "hp": 350,
    "damage": 60,
    "activeType": 1
   },
   "glb": "art/shark/Tiger_Shark.glb",
   "kb": 260,
   "prefab": "Fish/B/Tiger_Shark/Prefabs/SA_2010119_Tiger_Shark.prefab",
   "controller": "SA_Tiger_Shark",
   "ai": {
    "AggressionType": 2.0,
    "SwimSpeed": 0.0,
    "runToHomeSpeed": 2.75,
    "FishBattleSpeedRate": 1.0,
    "RotateSpeed": 50.0,
    "RangeFindEnemy": 7.2,
    "SprintLimitTime": 1.15,
    "CoolTimeSprintDecision": 13.0,
    "RangeAbleToSprintAttack": 6.0,
    "LeastAngleToSprint": 13.0,
    "MaxRangeCanFollow": 8.0,
    "TurnWeigh": 0.8,
    "SwimWeigh": 2.8,
    "SprintWeigh": 4.0,
    "LimitTimeFindEnemyFromRun": 4.0,
    "abilities": {
     "sprint": {
      "speed": 5.5
     },
     "qte": {
      "range": 7.0,
      "angle": 10.0,
      "cool": 3.0,
      "sprint": 0.0,
      "accel": 1.0
     },
     "other": [
      "FishQTEData",
      "LinkQTEData",
      "AniSpeedDataQTEAble",
      "AfterSprint_IncreaseRotation",
      "CloseBodyAttack"
     ]
    },
    "src": "Assets/ScriptableObjects/Fish/SA_Fish/SA_2010119_Tiger_Shark.asset"
   },
   "scale": 1.2,
   "face": 1,
   "bounds": [
    -4.444,
    -1.256,
    1.69,
    1.343
   ],
   "mouth": [
    0.831,
    -0.255
   ],
   "roles": {
    "sprint": "Ani3D_TigerShark01_Normal_Sprint_A_01",
    "swim": "Ani3D_TigerShark01_Normal_Swim_A_01",
    "swimB": "Ani3D_TigerShark01_Normal_Swim_B_01",
    "swimC": "Ani3D_TigerShark01_Normal_Swim_C_01",
    "qteEnter": "Ani3D_TigerShark01_QTE_Enter_A_01",
    "qteFail": "Ani3D_TigerShark01_QTE_Fail_A_01",
    "qteSuccess": "Ani3D_TigerShark01_QTE_Success_A_01",
    "turn": "Ani3D_TigerShark01_Normal_SwimTurn_A_01",
    "die": "Ani3D_TigerShark01_Normal_Die_A_01",
    "attack": "Ani3D_TigerShark01_Normal_Attack_A_01",
    "qteReady": "Ani3D_TigerShark01_QTE_Ready_A_01"
   },
   "clips": {
    "Ani3D_TigerShark01_Normal_Sprint_A_01": {
     "len": 1.3333,
     "loop": true,
     "sfx": [
      [
       0.001,
       "shark_sound_whitetipshark_qte_entera_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Body_A_01_StrongSprint",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_R02"
      ]
     ]
    },
    "Ani3D_TigerShark01_Normal_Swim_A_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_TigerShark01_Normal_Swim_B_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_TigerShark01_Normal_Swim_C_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_TigerShark01_QTE_Enter_A_01": {
     "len": 1.2,
     "loop": true,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1058,
       0.0
      ],
      [
       0.2,
       -0.0092,
       0.0
      ],
      [
       0.3,
       0.0722,
       0.0
      ],
      [
       0.4,
       0.0,
       0.0
      ],
      [
       0.5,
       0.1301,
       0.0
      ],
      [
       0.6,
       0.0616,
       0.0
      ],
      [
       0.7,
       0.1404,
       0.0
      ],
      [
       0.8,
       0.0325,
       0.0
      ],
      [
       0.9,
       0.1058,
       0.0
      ],
      [
       1.0,
       -0.0092,
       0.0
      ],
      [
       1.1,
       0.0722,
       0.0
      ],
      [
       1.2,
       0.0,
       0.0
      ],
      [
       1.2,
       0.0,
       0.0
      ]
     ],
     "sfx": [
      [
       0.0,
       "shark_sound_megamouth_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Tiger_Shark_Enter_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_AttackB_DaveLegs_A_01",
       "Bip001 Mouth"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_AttackD_Bip001 Mouth_Bite_A_01",
       "Bip001 Mouth"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top01"
      ]
     ]
    },
    "Ani3D_TigerShark01_QTE_Fail_A_01": {
     "len": 2.2,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.0228,
       0.0317
      ],
      [
       0.2,
       0.1156,
       0.0634
      ],
      [
       0.3,
       0.5014,
       -0.0282
      ],
      [
       0.4,
       0.7169,
       0.0
      ],
      [
       0.5,
       0.694,
       0.0
      ],
      [
       0.6,
       0.6996,
       0.0
      ],
      [
       0.7,
       0.6908,
       0.0
      ],
      [
       0.8,
       0.6576,
       0.0
      ],
      [
       0.9,
       0.6804,
       0.0
      ],
      [
       1.0,
       0.5976,
       0.0
      ],
      [
       1.1,
       0.6026,
       0.0061
      ],
      [
       1.2,
       0.5869,
       0.0616
      ],
      [
       1.3,
       0.5808,
       0.0832
      ],
      [
       1.4,
       1.1292,
       0.0293
      ],
      [
       1.5,
       1.4822,
       0.0
      ],
      [
       1.6,
       1.5451,
       0.0
      ],
      [
       1.7,
       1.5902,
       0.0
      ],
      [
       1.8,
       1.6204,
       0.0
      ],
      [
       1.9,
       1.6387,
       0.0
      ],
      [
       2.0,
       1.6481,
       0.0
      ],
      [
       2.1,
       1.6516,
       0.0
      ],
      [
       2.2,
       1.652,
       0.0
      ],
      [
       2.2,
       1.652,
       0.0
      ]
     ],
     "sfx": [
      [
       0.2,
       "shark_sound_longnosesawshark_qte_fail_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_AttackD_Bip001 Mouth_Bite_A_01",
       "Bip001 Mouth"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_AttackD_Bip001 Mouth_Spit_A_01",
       "Bip001 Mouth"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_AttackD_Bip001 Mouth_A_01",
       "Bip001 Mouth"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Blood_A_01",
       "Bip001 Mouth"
      ]
     ]
    },
    "Ani3D_TigerShark01_QTE_Success_A_01": {
     "len": 3.3333,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.028,
       0.012
      ],
      [
       0.2,
       0.3187,
       0.0947
      ],
      [
       0.3,
       0.9712,
       0.1134
      ],
      [
       0.4,
       1.3145,
       -0.1684
      ],
      [
       0.5,
       1.4178,
       -0.3132
      ],
      [
       0.6,
       1.5043,
       -0.4444
      ],
      [
       0.7,
       1.5914,
       -0.5833
      ],
      [
       0.8,
       1.6708,
       -0.704
      ],
      [
       0.9,
       1.7398,
       -0.7898
      ],
      [
       1.0,
       1.8072,
       -0.8438
      ],
      [
       1.1,
       1.8809,
       -0.8677
      ],
      [
       1.2,
       1.969,
       -0.8627
      ],
      [
       1.3,
       2.07,
       -0.8318
      ],
      [
       1.4,
       2.1738,
       -0.7819
      ],
      [
       1.5,
       2.2694,
       -0.7193
      ],
      [
       1.6,
       2.3474,
       -0.6497
      ],
      [
       1.7,
       2.4131,
       -0.5695
      ],
      [
       1.8,
       2.4712,
       -0.4808
      ],
      [
       1.9,
       2.5237,
       -0.3887
      ],
      [
       2.0,
       2.5726,
       -0.298
      ],
      [
       2.1,
       2.6197,
       -0.2136
      ],
      [
       2.2,
       2.6664,
       -0.1392
      ],
      [
       2.3,
       2.7102,
       -0.0692
      ],
      [
       2.4,
       2.7492,
       -0.0068
      ],
      [
       2.5,
       2.7828,
       0.0377
      ],
      [
       2.6,
       2.8099,
       0.0547
      ],
      [
       2.7,
       2.8284,
       0.0463
      ],
      [
       2.8,
       2.8385,
       0.0278
      ],
      [
       2.9,
       2.8441,
       0.0094
      ],
      [
       3.0,
       2.8492,
       0.001
      ],
      [
       3.1,
       2.8535,
       0.001
      ],
      [
       3.2,
       2.8554,
       0.001
      ],
      [
       3.3,
       2.8558,
       0.001
      ],
      [
       3.333,
       2.8558,
       0.001
      ]
     ],
     "sfx": [
      [
       0.25,
       "shark_sound_whitetipshark_qte_success_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_AttackD_Bip001 Mouth_Bite_A_01",
       "Bip001 Mouth"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_AttackD_Bip001 Mouth_A_01",
       "Bip001 Mouth"
      ]
     ]
    },
    "Ani3D_TigerShark01_Normal_SwimTurn_A_01": {
     "len": 1.4,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1903,
       0.0
      ],
      [
       0.2,
       0.5177,
       0.0
      ],
      [
       0.3,
       0.893,
       0.0
      ],
      [
       0.4,
       1.3679,
       0.0
      ],
      [
       0.5,
       1.8181,
       0.0
      ],
      [
       0.6,
       2.0209,
       0.0
      ],
      [
       0.7,
       2.0335,
       0.0
      ],
      [
       0.8,
       1.7585,
       0.0
      ],
      [
       0.9,
       1.3189,
       0.0
      ],
      [
       1.0,
       0.9055,
       0.0
      ],
      [
       1.1,
       0.5714,
       0.0
      ],
      [
       1.2,
       0.2759,
       0.0
      ],
      [
       1.3,
       0.0242,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_TigerShark01_Normal_Die_A_01": {
     "len": 3.5,
     "loop": false,
     "sfx": [
      [
       0.01,
       "shark_large_fish_die_01"
      ],
      [
       0.0,
       "shark_sound_whitetipshark_qte_entera_01"
      ]
     ]
    },
    "Ani3D_TigerShark01_Normal_Attack_A_01": {
     "len": 0.7333,
     "loop": true,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       1.26,
       0.0
      ],
      [
       0.2,
       2.52,
       0.0
      ],
      [
       0.3,
       3.78,
       0.0
      ],
      [
       0.4,
       5.04,
       0.0
      ],
      [
       0.5,
       6.3,
       0.0
      ],
      [
       0.6,
       7.56,
       0.0
      ],
      [
       0.7,
       8.4,
       0.0
      ],
      [
       0.733,
       8.4,
       0.0
      ]
     ],
     "sfx": [
      [
       0.0,
       "shark_sound_megamouth_01"
      ]
     ]
    },
    "Ani3D_TigerShark01_QTE_Ready_A_01": {
     "len": 1.4667,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.0,
       0.0
      ],
      [
       0.2,
       0.0,
       0.0
      ],
      [
       0.3,
       0.0,
       0.0
      ],
      [
       0.4,
       0.0,
       0.0
      ],
      [
       0.5,
       0.0,
       0.0
      ],
      [
       0.6,
       0.0,
       0.0
      ],
      [
       0.7,
       0.0,
       0.0
      ],
      [
       0.8,
       0.0,
       0.0
      ],
      [
       0.9,
       0.0,
       0.0
      ],
      [
       1.0,
       0.0,
       0.0
      ],
      [
       1.1,
       0.0,
       0.0
      ],
      [
       1.2,
       0.0,
       0.0
      ],
      [
       1.3,
       0.0,
       0.0
      ],
      [
       1.4,
       0.5341,
       0.0
      ],
      [
       1.467,
       1.4244,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Top_A_02",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Body_A_02",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Fin_A_02",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Fin_A_02",
       "Bip001 Fin_R02"
      ]
     ]
    },
    "Ani3D_TigerShark01_LinkQTE_Success_A_01": {
     "len": 1.8333,
     "loop": false,
     "sfx": [
      [
       0.0,
       "shark_large_fish_die_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Tiger_Shark_Link_Success_Top_A_01",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Link_Success_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Link_Success_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Link_Success_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Link_Success_Head_Blood_A_01",
       "Bip001 Head"
      ]
     ]
    }
   },
   "icon": "art/shark/Tiger_Shark_icon.png"
  },
  {
   "id": "Longnosesaw_Shark",
   "tid": 2010125,
   "tids": [
    2010125,
    2010127
   ],
   "zone": "B",
   "name": "LongNoseSaw Shark",
   "hp": 100,
   "damage": 30,
   "size": 2,
   "cm": 210,
   "rank": 6,
   "activeType": 0,
   "qteLevel": 0,
   "carvable": 2,
   "night": {
    "tid": 2010127,
    "hp": 200,
    "damage": 45,
    "activeType": 1
   },
   "glb": "art/shark/Longnosesaw_Shark.glb",
   "kb": 282,
   "prefab": "Fish/B/Longnosesaw_Shark/Prefabs/SA_2010125_Longnosesaw_Shark.prefab",
   "controller": "Longnosesaw_Shark",
   "ai": {
    "AggressionType": 2.0,
    "SwimSpeed": 0.0,
    "runToHomeSpeed": 2.75,
    "FishBattleSpeedRate": 1.3,
    "RotateSpeed": 50.0,
    "RangeFindEnemy": 5.5,
    "SprintLimitTime": 1.0,
    "CoolTimeSprintDecision": 4.5,
    "RangeAbleToSprintAttack": 5.5,
    "LeastAngleToSprint": 13.0,
    "MaxRangeCanFollow": 7.5,
    "TurnWeigh": 0.25,
    "SwimWeigh": 1.5,
    "SprintWeigh": 2.5,
    "LimitTimeFindEnemyFromRun": 3.0,
    "abilities": {
     "rage": {
      "time": 3.0,
      "afterAttack": 5.0
     },
     "sprint": {
      "speed": 5.5
     },
     "qte": {
      "range": 5.0,
      "angle": 15.0,
      "cool": 5.0,
      "sprint": 0.0,
      "accel": 1.25
     },
     "other": [
      "FishQTEData"
     ]
    },
    "src": "Assets/ScriptableObjects/Fish/SA_Fish/SA_2010125_LongNoseSawShark.asset"
   },
   "scale": 0.9,
   "face": 1,
   "bounds": [
    -1.657,
    -0.626,
    2.379,
    0.555
   ],
   "mouth": [
    0.659,
    -0.046
   ],
   "roles": {
    "sprint": "Ani3D_LongnosesawShark_Normal_Sprint_A_01",
    "swim": "Ani3D_LongnosesawShark_Normal_Swim_A_01",
    "swimB": "Ani3D_LongnosesawShark_Normal_Swim_B_01",
    "swimC": "Ani3D_LongnosesawShark_Normal_Swim_C_01",
    "qteEnter": "Ani3D_LongnosesawShark_QTE_Enter_A_01",
    "qteFail": "Ani3D_LongnosesawShark_QTE_Fail_A_01",
    "qteSuccess": "Ani3D_LongnosesawShark_QTE_Success_A_01",
    "turn": "Ani3D_LongnosesawShark_Normal_SwimTurn_A_01",
    "attack": "Ani3D_LongnosesawShark_Normal_Attack_B_01",
    "die": "Ani3D_LongnosesawShark_Normal_Die_A_01",
    "qteReady": "Ani3D_LongnosesawShark_QTE_Ready_A_01"
   },
   "clips": {
    "Ani3D_LongnosesawShark_Normal_Sprint_A_01": {
     "len": 1.3333,
     "loop": true,
     "sfx": [
      [
       0.0,
       "shark_sound_whitetipshark_qte_entera_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01_StrongSprint",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_R02"
      ]
     ]
    },
    "Ani3D_LongnosesawShark_Normal_Swim_A_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_LongnosesawShark_Normal_Swim_B_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_LongnosesawShark_Normal_Swim_C_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_LongnosesawShark_QTE_Enter_A_01": {
     "len": 1.3333,
     "loop": false,
     "sfx": [
      [
       0.0,
       "shark_sound_qte_riser_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Fail_Head_A_01",
       "Bip001 Head"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Enter_A_01",
       "Bip001"
      ]
     ]
    },
    "Ani3D_LongnosesawShark_QTE_Fail_A_01": {
     "len": 1.6667,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.349,
       0.0
      ],
      [
       0.2,
       0.4861,
       0.0
      ],
      [
       0.3,
       0.5044,
       0.0
      ],
      [
       0.4,
       0.4603,
       0.0
      ],
      [
       0.5,
       0.5431,
       0.0
      ],
      [
       0.6,
       0.6633,
       0.0
      ],
      [
       0.7,
       0.6592,
       0.0
      ],
      [
       0.8,
       0.6275,
       0.0
      ],
      [
       0.9,
       0.7061,
       0.0
      ],
      [
       1.0,
       0.7519,
       0.0
      ],
      [
       1.1,
       0.6985,
       0.0
      ],
      [
       1.2,
       0.7026,
       0.0
      ],
      [
       1.3,
       1.1276,
       0.0
      ],
      [
       1.4,
       1.2223,
       0.0
      ],
      [
       1.5,
       1.317,
       0.0
      ],
      [
       1.6,
       1.4117,
       0.0
      ],
      [
       1.667,
       1.4747,
       0.0
      ]
     ],
     "sfx": [
      [
       0.0,
       "shark_sound_longnosesawshark_qte_fail_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Longnosesaw_Shark_Blood_A_01",
       "Target"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Fail_Head_A_01",
       "Bip001 Head"
      ],
      [
       1.15,
       "VFX_Longnosesaw_Shark_Fail_Shot_Head_A_01",
       "Bip001 Head"
      ]
     ]
    },
    "Ani3D_LongnosesawShark_QTE_Success_A_01": {
     "len": 1.6667,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.5621,
       0.0
      ],
      [
       0.2,
       1.0097,
       0.0
      ],
      [
       0.3,
       1.2286,
       0.0
      ],
      [
       0.4,
       1.4474,
       0.0
      ],
      [
       0.5,
       1.6663,
       0.0
      ],
      [
       0.6,
       1.8851,
       0.0
      ],
      [
       0.7,
       2.104,
       0.0
      ],
      [
       0.8,
       2.3229,
       0.0
      ],
      [
       0.9,
       2.5418,
       0.0
      ],
      [
       1.0,
       2.7071,
       0.0
      ],
      [
       1.1,
       2.8173,
       0.0
      ],
      [
       1.2,
       2.9353,
       0.0
      ],
      [
       1.3,
       3.0554,
       0.0
      ],
      [
       1.4,
       3.1757,
       0.0
      ],
      [
       1.5,
       3.2958,
       0.0
      ],
      [
       1.6,
       3.416,
       0.0
      ],
      [
       1.667,
       3.4961,
       0.0
      ]
     ],
     "sfx": [
      [
       0.0,
       "shark_sound_cookiecutter_qte_success_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Fail_Head_A_01",
       "Bip001 Head"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Succes_DaveLegs_A_01",
       "Target"
      ]
     ]
    },
    "Ani3D_LongnosesawShark_Normal_SwimTurn_A_01": {
     "len": 1.4,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1427,
       0.0
      ],
      [
       0.2,
       0.3883,
       0.0
      ],
      [
       0.3,
       0.6698,
       0.0
      ],
      [
       0.4,
       1.0259,
       0.0
      ],
      [
       0.5,
       1.3636,
       0.0
      ],
      [
       0.6,
       1.5157,
       0.0
      ],
      [
       0.7,
       1.5251,
       0.0
      ],
      [
       0.8,
       1.3189,
       0.0
      ],
      [
       0.9,
       0.9892,
       0.0
      ],
      [
       1.0,
       0.6791,
       0.0
      ],
      [
       1.1,
       0.4286,
       0.0
      ],
      [
       1.2,
       0.2069,
       0.0
      ],
      [
       1.3,
       0.0182,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_LongnosesawShark_Normal_Attack_B_01": {
     "len": 1.3333,
     "loop": false
    },
    "Ani3D_LongnosesawShark_Normal_Die_A_01": {
     "len": 3.5,
     "loop": false,
     "sfx": [
      [
       0.0,
       "shark_large_fish_die_01"
      ]
     ]
    },
    "Ani3D_LongnosesawShark_QTE_Ready_A_01": {
     "len": 1.4333,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       -0.003,
       0.0
      ],
      [
       0.2,
       -0.0115,
       0.0
      ],
      [
       0.3,
       -0.0248,
       0.0
      ],
      [
       0.4,
       -0.0424,
       0.0
      ],
      [
       0.5,
       -0.0633,
       0.0
      ],
      [
       0.6,
       -0.0869,
       0.0
      ],
      [
       0.7,
       -0.1126,
       0.0
      ],
      [
       0.8,
       -0.1396,
       0.0
      ],
      [
       0.9,
       -0.1672,
       0.0
      ],
      [
       1.0,
       -0.1948,
       0.0
      ],
      [
       1.1,
       -0.2216,
       0.0
      ],
      [
       1.2,
       -0.2468,
       0.0
      ],
      [
       1.3,
       -0.2699,
       0.0
      ],
      [
       1.4,
       0.6199,
       0.0
      ],
      [
       1.433,
       1.0679,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_02",
       "Bip001 Tail_Top01"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_02",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_02",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_02",
       "Bip001 Fin_R02"
      ]
     ]
    }
   },
   "icon": "art/shark/Longnosesaw_Shark_icon.png"
  },
  {
   "id": "Smooth_Hammershark",
   "tid": 2010133,
   "tids": [
    2010133
   ],
   "zone": "B",
   "name": "Smooth Hammershark",
   "hp": 260,
   "damage": 90,
   "size": 2,
   "cm": 280,
   "rank": 9,
   "activeType": 0,
   "qteLevel": 1,
   "carvable": 2,
   "night": null,
   "glb": "art/shark/Smooth_Hammershark.glb",
   "kb": 294,
   "prefab": "Fish/B/Smooth_Hammershark01/Prefabs/SA_2010133_Smooth_Hammershark01.prefab",
   "controller": "Smooth_Hammershark01_SA",
   "ai": {
    "AggressionType": 2.0,
    "SwimSpeed": 0.8,
    "runToHomeSpeed": 2.85,
    "FishBattleSpeedRate": 1.22,
    "RotateSpeed": 50.0,
    "RangeFindEnemy": 7.0,
    "SprintLimitTime": 0.8,
    "CoolTimeSprintDecision": 10.0,
    "RangeAbleToSprintAttack": 6.0,
    "LeastAngleToSprint": 13.0,
    "MaxRangeCanFollow": 8.0,
    "TurnWeigh": 0.8,
    "SwimWeigh": 2.8,
    "SprintWeigh": 4.0,
    "LimitTimeFindEnemyFromRun": 2.5,
    "abilities": {
     "sprint": {
      "speed": 5.2
     },
     "other": [
      "AniSpeedDataQTEAble",
      "AfterSprint_IncreaseRotation",
      "SerialHookAttack",
      "HeadbuttRush"
     ]
    },
    "src": "Assets/ScriptableObjects/Fish/SA_Fish/SA_2010133_Smooth_Hammershark01.asset"
   },
   "scale": 1.0,
   "face": 1,
   "bounds": [
    -3.675,
    -0.688,
    1.208,
    1.061
   ],
   "mouth": [
    0.344,
    -0.103
   ],
   "roles": {
    "sprint": "Ani3D_SmoothHammershark_Normal_Sprint_A_01",
    "swim": "Ani3D_SmoothHammershark_Normal_Swim_A_01",
    "swimB": "Ani3D_SmoothHammershark_Normal_Swim_B_01",
    "swimC": "Ani3D_SmoothHammershark_Normal_Swim_C_01",
    "turn": "Ani3D_SmoothHammershark_Normal_SwimTurn_A_01",
    "die": "Ani3D_SmoothHammershark_Normal_Die_A_01",
    "idle": "Ani3D_SmoothHammershark_Normal_SwimTurn_A_01",
    "attack3": "Ani3D_SmoothHammershark_Normal_Attack_B_03",
    "stun": "Ani3D_SmoothHammershark_Normal_Sturn_A_01",
    "weak": "Ani3D_SmoothHammershark_Normal_SwimWeak_A_01"
   },
   "clips": {
    "Ani3D_SmoothHammershark_Normal_Sprint_A_01": {
     "len": 1.3333,
     "loop": true,
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Smooth_Hammershark01_Tail_A_01",
       "Bip001 Tail_Top02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Body_A_01_StrongSprint",
       "Bip001"
      ]
     ]
    },
    "Ani3D_SmoothHammershark_Normal_Swim_A_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_SmoothHammershark_Normal_Swim_B_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_SmoothHammershark_Normal_Swim_C_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_SmoothHammershark_Normal_SwimTurn_A_01": {
     "len": 1.4,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1586,
       0.0
      ],
      [
       0.2,
       0.4314,
       0.0
      ],
      [
       0.3,
       0.7442,
       0.0
      ],
      [
       0.4,
       1.1399,
       0.0
      ],
      [
       0.5,
       1.5151,
       0.0
      ],
      [
       0.6,
       1.6841,
       0.0
      ],
      [
       0.7,
       1.6946,
       0.0
      ],
      [
       0.8,
       1.4654,
       0.0
      ],
      [
       0.9,
       1.0991,
       0.0
      ],
      [
       1.0,
       0.7546,
       0.0
      ],
      [
       1.1,
       0.4762,
       0.0
      ],
      [
       1.2,
       0.2299,
       0.0
      ],
      [
       1.3,
       0.0202,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_SmoothHammershark_Normal_Die_A_01": {
     "len": 3.5,
     "loop": false
    },
    "Ani3D_SmoothHammershark_Normal_Attack_B_03": {
     "len": 0.6667,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.7197,
       0.0
      ],
      [
       0.2,
       1.0733,
       0.0
      ],
      [
       0.3,
       1.4269,
       0.0
      ],
      [
       0.4,
       1.7353,
       0.0
      ],
      [
       0.5,
       1.9532,
       0.0
      ],
      [
       0.6,
       2.0367,
       0.0
      ],
      [
       0.667,
       2.0355,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Smooth_Hammershark01_Tail_A_01",
       "Bip001 Tail_Top02"
      ],
      [
       0.0,
       "VFX_Smooth_Hammershark01_Attack_Head_A_01",
       "Bip001 Head"
      ]
     ]
    },
    "Ani3D_SmoothHammershark_Normal_Attack_A_01": {
     "len": 1.1,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.0795,
       0.0
      ],
      [
       0.2,
       0.2725,
       0.0
      ],
      [
       0.3,
       0.5116,
       0.0
      ],
      [
       0.4,
       0.7271,
       0.0
      ],
      [
       0.5,
       1.5708,
       0.0
      ],
      [
       0.6,
       1.9713,
       0.0
      ],
      [
       0.7,
       2.2475,
       0.0
      ],
      [
       0.8,
       2.4798,
       0.0
      ],
      [
       0.9,
       2.6948,
       0.0
      ],
      [
       1.0,
       2.9189,
       0.0
      ],
      [
       1.1,
       3.0,
       0.0
      ],
      [
       1.1,
       3.0,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Smooth_Hammershark01_Tail_A_01",
       "Bip001 Tail_Top02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Body_A_01_StrongSprint",
       "Bip001"
      ],
      [
       0.4,
       "VFX_Smooth_Hammershark01_Attack_Head_A_01",
       "Bip001 Head"
      ]
     ]
    },
    "Ani3D_SmoothHammershark_Normal_Attack_A_02": {
     "len": 0.9667,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.85,
       0.0
      ],
      [
       0.2,
       1.1586,
       0.0
      ],
      [
       0.3,
       1.3551,
       0.0
      ],
      [
       0.4,
       1.5203,
       0.0
      ],
      [
       0.5,
       1.6633,
       0.0
      ],
      [
       0.6,
       1.7933,
       0.0
      ],
      [
       0.7,
       1.9192,
       0.0
      ],
      [
       0.8,
       2.0502,
       0.0
      ],
      [
       0.9,
       2.1954,
       0.0
      ],
      [
       0.967,
       2.1954,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Smooth_Hammershark01_Tail_A_01",
       "Bip001 Tail_Top02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Body_A_01_StrongSprint",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Smooth_Hammershark01_Attack_Head_A_01",
       "Bip001 Head"
      ]
     ]
    },
    "Ani3D_SmoothHammershark_Normal_Attack_A_03": {
     "len": 2.4667,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       1.8929,
       0.0
      ],
      [
       0.2,
       2.4785,
       0.0
      ],
      [
       0.3,
       2.7828,
       0.0
      ],
      [
       0.4,
       3.0036,
       0.0
      ],
      [
       0.5,
       3.1662,
       0.0
      ],
      [
       0.6,
       3.2962,
       0.0
      ],
      [
       0.7,
       3.4191,
       0.0
      ],
      [
       0.8,
       3.5602,
       0.0
      ],
      [
       0.9,
       3.7425,
       0.0
      ],
      [
       1.0,
       3.9501,
       0.0
      ],
      [
       1.1,
       4.1713,
       0.0
      ],
      [
       1.2,
       4.4023,
       0.0
      ],
      [
       1.3,
       4.6394,
       0.0
      ],
      [
       1.4,
       4.8787,
       0.0
      ],
      [
       1.5,
       5.1165,
       0.0
      ],
      [
       1.6,
       5.349,
       0.0
      ],
      [
       1.7,
       5.5723,
       0.0
      ],
      [
       1.8,
       5.7827,
       0.0
      ],
      [
       1.9,
       5.9765,
       0.0
      ],
      [
       2.0,
       6.1498,
       0.0
      ],
      [
       2.1,
       6.2987,
       0.0
      ],
      [
       2.2,
       6.4197,
       0.0
      ],
      [
       2.3,
       6.5087,
       0.0
      ],
      [
       2.4,
       6.5622,
       0.0
      ],
      [
       2.467,
       6.5761,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Smooth_Hammershark01_Tail_A_01",
       "Bip001 Tail_Top02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Smooth_Hammershark01_Attack_Head_A_01",
       "Bip001 Head"
      ],
      [
       2.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       2.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ]
     ]
    },
    "Ani3D_SmoothHammershark_Normal_Sturn_A_01": {
     "len": 0.5333,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       -0.3306,
       0.0
      ],
      [
       0.2,
       -0.2118,
       0.0
      ],
      [
       0.3,
       -0.1661,
       0.0
      ],
      [
       0.4,
       -0.1325,
       0.0
      ],
      [
       0.5,
       -0.1155,
       0.0
      ],
      [
       0.533,
       -0.1143,
       0.0
      ]
     ]
    },
    "Ani3D_SmoothHammershark_Normal_SwimWeak_A_01": {
     "len": 4.4333,
     "loop": true,
     "fx": [
      [
       0.0,
       "VFX_Smooth_Hammershark01_WeakSwimBreath_A_01",
       "Bip001 Mouth"
      ]
     ]
    }
   },
   "icon": "art/shark/Smooth_Hammershark_icon.png"
  },
  {
   "id": "Cookiecutter_Shark",
   "tid": 2010211,
   "tids": [
    2010211
   ],
   "zone": "C",
   "name": "Cookiecutter Shark",
   "hp": 80,
   "damage": 35,
   "size": 1,
   "cm": 50,
   "rank": 6,
   "activeType": 0,
   "qteLevel": 0,
   "carvable": 0,
   "night": null,
   "glb": "art/shark/Cookiecutter_Shark.glb",
   "kb": 185,
   "prefab": "Fish/C/Cookiecutter_Shark/Prefabs/SA_2010211_Cookiecutter_Shark.prefab",
   "controller": "SA_Cookiecutter_Shark01",
   "ai": {
    "AggressionType": 2.0,
    "SwimSpeed": 0.7,
    "runToHomeSpeed": 2.5,
    "FishBattleSpeedRate": 1.5,
    "RotateSpeed": 45.0,
    "RangeFindEnemy": 3.5,
    "SprintLimitTime": 1.5,
    "CoolTimeSprintDecision": 5.5,
    "RangeAbleToSprintAttack": 5.5,
    "LeastAngleToSprint": 13.0,
    "MaxRangeCanFollow": 5.0,
    "TurnWeigh": 0.25,
    "SwimWeigh": 1.5,
    "SprintWeigh": 3.0,
    "LimitTimeFindEnemyFromRun": 4.0,
    "abilities": {
     "rage": {
      "time": 3.0,
      "afterAttack": 5.0
     },
     "sprint": {
      "speed": 3.7
     },
     "qte": {
      "range": 7.0,
      "angle": 10.0,
      "cool": 3.0,
      "sprint": 1.0,
      "accel": 1.1
     },
     "other": [
      "FishQTEData"
     ]
    },
    "src": "Assets/ScriptableObjects/Fish/SA_Fish/SA_2010211_Cookiecutter_Shark.asset"
   },
   "scale": 1.0,
   "face": 1,
   "bounds": [
    -1.053,
    -0.188,
    0.622,
    0.146
   ],
   "mouth": [
    0.358,
    -0.034
   ],
   "roles": {
    "sprint": "Ani3D_CookiecutterShark_Normal_Sprint_A_01",
    "turn": "Ani3D_CookiecutterShark_Normal_SwimTurn_A_01",
    "swim": "Ani3D_CookiecutterShark_Normal_Swim_A_01",
    "swimB": "Ani3D_CookiecutterShark_Normal_Swim_B_01",
    "swimC": "Ani3D_CookiecutterShark_Normal_Swim_C_01",
    "qteFail": "Ani3D_CookiecutterShark_QTE_Fail_A_01",
    "qteEnter": "Ani3D_CookiecutterShark_QTE_Enter_A_01",
    "qteSuccess": "Ani3D_CookiecutterShark_QTE_Success_A_01",
    "die": "Ani3D_CookiecutterShark_Normal_Die_A_01",
    "qteReady": "Ani3D_CookiecutterShark_QTE_Ready_A_01"
   },
   "clips": {
    "Ani3D_CookiecutterShark_Normal_Sprint_A_01": {
     "len": 1.0667,
     "loop": true,
     "sfx": [
      [
       0.0,
       "shark_sound_whitetipshark_qte_entera_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Cookiecutter_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Bottom01"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Sprint_Body_A_01_StrongSprint",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Fin_A_01",
       "Bip001 Fin_L02"
      ]
     ]
    },
    "Ani3D_CookiecutterShark_Normal_SwimTurn_A_01": {
     "len": 1.1333,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.2268,
       0.0408
      ],
      [
       0.2,
       0.5954,
       0.0714
      ],
      [
       0.3,
       0.9857,
       0.0785
      ],
      [
       0.4,
       1.3037,
       0.0781
      ],
      [
       0.5,
       1.5091,
       0.0631
      ],
      [
       0.6,
       1.457,
       0.0555
      ],
      [
       0.7,
       1.1684,
       0.0539
      ],
      [
       0.8,
       0.8434,
       0.0469
      ],
      [
       0.9,
       0.5239,
       0.0065
      ],
      [
       1.0,
       0.1548,
       0.0
      ],
      [
       1.1,
       0.0,
       0.0
      ],
      [
       1.133,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_CookiecutterShark_Normal_Swim_A_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_CookiecutterShark_Normal_Swim_B_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_CookiecutterShark_Normal_Swim_C_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_CookiecutterShark_QTE_Fail_A_01": {
     "len": 1.4,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.0147,
       0.0342
      ],
      [
       0.2,
       0.0647,
       0.1125
      ],
      [
       0.3,
       0.1583,
       0.199
      ],
      [
       0.4,
       0.5449,
       0.2686
      ],
      [
       0.5,
       1.0187,
       0.0468
      ],
      [
       0.6,
       1.013,
       -0.1187
      ],
      [
       0.7,
       0.908,
       -0.1566
      ],
      [
       0.8,
       0.7322,
       -0.1317
      ],
      [
       0.9,
       0.5706,
       -0.1039
      ],
      [
       1.0,
       0.4015,
       -0.0742
      ],
      [
       1.1,
       0.2275,
       -0.0424
      ],
      [
       1.2,
       0.0842,
       -0.0158
      ],
      [
       1.3,
       0.0059,
       -0.0011
      ],
      [
       1.4,
       0.0,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ]
     ],
     "sfx": [
      [
       0.0,
       "shark_sound_cookiecutter_qte_fail_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Cookiecutter_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Bottom01"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Fin_A_01",
       "Bip001 Fin_L02"
      ]
     ]
    },
    "Ani3D_CookiecutterShark_QTE_Enter_A_01": {
     "len": 0.8,
     "loop": true,
     "sfx": [
      [
       0.0,
       "shark_sound_qte_riser_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Cookiecutter_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Bottom01"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Enter_A_01",
       "Bip001"
      ]
     ]
    },
    "Ani3D_CookiecutterShark_QTE_Success_A_01": {
     "len": 2.6667,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.0169,
       0.0342
      ],
      [
       0.2,
       0.0696,
       0.1125
      ],
      [
       0.3,
       0.1611,
       0.199
      ],
      [
       0.4,
       0.5042,
       0.2686
      ],
      [
       0.5,
       0.9457,
       0.0842
      ],
      [
       0.6,
       1.0765,
       -0.0911
      ],
      [
       0.7,
       1.1696,
       -0.2554
      ],
      [
       0.8,
       1.2472,
       -0.3518
      ],
      [
       0.9,
       1.3229,
       -0.3551
      ],
      [
       1.0,
       1.3848,
       -0.3346
      ],
      [
       1.1,
       1.4332,
       -0.3001
      ],
      [
       1.2,
       1.4702,
       -0.2548
      ],
      [
       1.3,
       1.4977,
       -0.2022
      ],
      [
       1.4,
       1.518,
       -0.1457
      ],
      [
       1.5,
       1.5328,
       -0.0886
      ],
      [
       1.6,
       1.5444,
       -0.0344
      ],
      [
       1.7,
       1.5547,
       0.0136
      ],
      [
       1.8,
       1.5656,
       0.0521
      ],
      [
       1.9,
       1.5792,
       0.0777
      ],
      [
       2.0,
       1.5977,
       0.087
      ],
      [
       2.1,
       1.6174,
       0.085
      ],
      [
       2.2,
       1.6336,
       0.0797
      ],
      [
       2.3,
       1.6465,
       0.0727
      ],
      [
       2.4,
       1.6561,
       0.0652
      ],
      [
       2.5,
       1.6625,
       0.0586
      ],
      [
       2.6,
       1.666,
       0.0543
      ],
      [
       2.667,
       1.6666,
       0.0534
      ]
     ],
     "sfx": [
      [
       0.0,
       "shark_sound_cookiecutter_qte_success_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Cookiecutter_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Bottom01"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Fin_A_01",
       "Bip001 Fin_L02"
      ]
     ]
    },
    "Ani3D_CookiecutterShark_Normal_Die_A_01": {
     "len": 3.5,
     "loop": false,
     "sfx": [
      [
       0.0,
       "shark_midlarge_fish_die_03"
      ]
     ]
    },
    "Ani3D_CookiecutterShark_QTE_Ready_A_01": {
     "len": 1.8,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       -0.0021,
       0.0
      ],
      [
       0.2,
       -0.0083,
       0.0
      ],
      [
       0.3,
       -0.0181,
       0.0
      ],
      [
       0.4,
       -0.0312,
       0.0
      ],
      [
       0.5,
       -0.0471,
       0.0
      ],
      [
       0.6,
       -0.0654,
       0.0
      ],
      [
       0.7,
       -0.0858,
       0.0
      ],
      [
       0.8,
       -0.1078,
       0.0
      ],
      [
       0.9,
       -0.131,
       0.0
      ],
      [
       1.0,
       -0.1551,
       0.0
      ],
      [
       1.1,
       -0.1797,
       0.0
      ],
      [
       1.2,
       -0.2042,
       0.0
      ],
      [
       1.3,
       -0.2285,
       0.0
      ],
      [
       1.4,
       -0.2519,
       0.0
      ],
      [
       1.5,
       -0.2742,
       0.0
      ],
      [
       1.6,
       -0.295,
       0.0
      ],
      [
       1.7,
       0.0659,
       0.0
      ],
      [
       1.8,
       1.187,
       0.0
      ],
      [
       1.8,
       1.187,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Cookiecutter_Shark_Sprint_Top_A_02",
       "Bip001 Tail_Bottom01"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Sprint_Body_A_02",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Cookiecutter_Shark_Fin_A_01",
       "Bip001 Fin_L02"
      ]
     ]
    }
   },
   "icon": "art/shark/Cookiecutter_Shark_icon.png"
  },
  {
   "id": "Frilled_Shark",
   "tid": 2010204,
   "tids": [
    2010204
   ],
   "zone": "C",
   "name": "Frilled Shark",
   "hp": 180,
   "damage": 40,
   "size": 2,
   "cm": 210,
   "rank": 7,
   "activeType": 0,
   "qteLevel": 0,
   "carvable": 2,
   "night": null,
   "glb": "art/shark/Frilled_Shark.glb",
   "kb": 264,
   "prefab": "Fish/C/Frilled_Shark/Prefabs/SA_2010204_Frilled_Shark.prefab",
   "controller": "SA_Frilled_Shark01",
   "ai": {
    "AggressionType": 2.0,
    "SwimSpeed": 0.0,
    "runToHomeSpeed": 2.6,
    "FishBattleSpeedRate": 1.1,
    "RotateSpeed": 35.0,
    "RangeFindEnemy": 4.0,
    "SprintLimitTime": 1.5,
    "CoolTimeSprintDecision": 6.5,
    "RangeAbleToSprintAttack": 5.0,
    "LeastAngleToSprint": 13.0,
    "MaxRangeCanFollow": 5.6,
    "TurnWeigh": 0.8,
    "SwimWeigh": 2.8,
    "SprintWeigh": 3.5,
    "LimitTimeFindEnemyFromRun": 4.0,
    "abilities": {
     "rage": {
      "time": 3.0,
      "afterAttack": 5.0
     },
     "sprint": {
      "speed": 4.0
     },
     "qte": {
      "range": 7.0,
      "angle": 10.0,
      "cool": 3.0,
      "sprint": 0.0,
      "accel": 1.15
     },
     "other": [
      "FishQTEData"
     ]
    },
    "src": "Assets/ScriptableObjects/Fish/SA_Fish/SA_2010204_Frilled_Shark.asset"
   },
   "scale": 0.75,
   "face": 1,
   "bounds": [
    -2.566,
    -0.304,
    1.142,
    0.26
   ],
   "mouth": [
    0.673,
    -0.011
   ],
   "roles": {
    "sprint": "Ani3D_FrilledShark_Normal_Sprint_A_01",
    "turn": "Ani3D_FrilledShark_Normal_SwimTurn_A_01",
    "swim": "Ani3D_FrilledShark_Normal_Swim_A_01",
    "swimB": "Ani3D_FrilledShark_Normal_Swim_B_01",
    "swimC": "Ani3D_FrilledShark_Normal_Swim_C_01",
    "qteFail": "Ani3D_FrilledShark_QTE_Fail_A_01",
    "qteSuccess": "Ani3D_FrilledShark_QTE_Success_A_01",
    "qteEnter": "Ani3D_FrilledShark_QTE_Enter_A_01",
    "die": "Ani3D_FrilledShark_Normal_Die_A_01",
    "qteReady": "Ani3D_FrilledShark_QTE_Ready_A_01"
   },
   "clips": {
    "Ani3D_FrilledShark_Normal_Sprint_A_01": {
     "len": 1.3333,
     "loop": true,
     "sfx": [
      [
       0.0,
       "shark_sound_whitetipshark_qte_entera_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Tail_Fin01_R"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Tail_Fin01_L"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail21"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01_StrongSprint",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ]
     ]
    },
    "Ani3D_FrilledShark_Normal_SwimTurn_A_01": {
     "len": 1.4,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.119,
       0.0
      ],
      [
       0.2,
       0.3236,
       0.0
      ],
      [
       0.3,
       0.5581,
       0.0
      ],
      [
       0.4,
       0.8549,
       0.0
      ],
      [
       0.5,
       1.1363,
       0.0
      ],
      [
       0.6,
       1.2631,
       0.0
      ],
      [
       0.7,
       1.271,
       0.0
      ],
      [
       0.8,
       1.0991,
       0.0
      ],
      [
       0.9,
       0.8243,
       0.0
      ],
      [
       1.0,
       0.566,
       0.0
      ],
      [
       1.1,
       0.3572,
       0.0
      ],
      [
       1.2,
       0.1724,
       0.0
      ],
      [
       1.3,
       0.0152,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ]
     ]
    },
    "Ani3D_FrilledShark_Normal_Swim_A_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_FrilledShark_Normal_Swim_B_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_FrilledShark_Normal_Swim_C_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_FrilledShark_QTE_Fail_A_01": {
     "len": 2.2,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.0142,
       0.0198
      ],
      [
       0.2,
       0.0722,
       0.0396
      ],
      [
       0.3,
       0.3134,
       -0.0176
      ],
      [
       0.4,
       0.4481,
       0.0
      ],
      [
       0.5,
       0.4337,
       0.0
      ],
      [
       0.6,
       0.4372,
       0.0
      ],
      [
       0.7,
       0.4318,
       0.0
      ],
      [
       0.8,
       0.411,
       0.0
      ],
      [
       0.9,
       0.4252,
       0.0
      ],
      [
       1.0,
       0.3735,
       0.0
      ],
      [
       1.1,
       0.3766,
       0.0038
      ],
      [
       1.2,
       0.3668,
       0.0385
      ],
      [
       1.3,
       0.363,
       0.052
      ],
      [
       1.4,
       0.7148,
       0.0183
      ],
      [
       1.5,
       0.9143,
       0.0
      ],
      [
       1.6,
       0.9239,
       0.0
      ],
      [
       1.7,
       0.9308,
       0.0
      ],
      [
       1.8,
       0.9353,
       0.0
      ],
      [
       1.9,
       0.9381,
       0.0
      ],
      [
       2.0,
       0.9395,
       0.0
      ],
      [
       2.1,
       0.9401,
       0.0
      ],
      [
       2.2,
       0.9402,
       0.0
      ],
      [
       2.2,
       0.9402,
       0.0
      ]
     ],
     "sfx": [
      [
       0.2,
       "shark_sound_longnosesawshark_qte_fail_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Tail_Fin01_R"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Tail_Fin01_L"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail21"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Frilled_Shark_Blood_A_01",
       "Bip001 Mouth"
      ]
     ]
    },
    "Ani3D_FrilledShark_QTE_Success_A_01": {
     "len": 3.3333,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.0175,
       0.0075
      ],
      [
       0.2,
       0.1992,
       0.0592
      ],
      [
       0.3,
       0.607,
       0.0709
      ],
      [
       0.4,
       0.8216,
       -0.1052
      ],
      [
       0.5,
       0.8861,
       -0.1958
      ],
      [
       0.6,
       0.9402,
       -0.2777
      ],
      [
       0.7,
       0.9947,
       -0.3626
      ],
      [
       0.8,
       1.0442,
       -0.4235
      ],
      [
       0.9,
       1.0874,
       -0.452
      ],
      [
       1.0,
       1.1295,
       -0.4615
      ],
      [
       1.1,
       1.1755,
       -0.4634
      ],
      [
       1.2,
       1.2305,
       -0.4663
      ],
      [
       1.3,
       1.2934,
       -0.4686
      ],
      [
       1.4,
       1.358,
       -0.4705
      ],
      [
       1.5,
       1.418,
       -0.4708
      ],
      [
       1.6,
       1.4677,
       -0.4668
      ],
      [
       1.7,
       1.5116,
       -0.44
      ],
      [
       1.8,
       1.552,
       -0.3925
      ],
      [
       1.9,
       1.5885,
       -0.3335
      ],
      [
       2.0,
       1.621,
       -0.2723
      ],
      [
       2.1,
       1.6491,
       -0.2186
      ],
      [
       2.2,
       1.6723,
       -0.1799
      ],
      [
       2.3,
       1.6912,
       -0.1467
      ],
      [
       2.4,
       1.707,
       -0.115
      ],
      [
       2.5,
       1.7201,
       -0.0845
      ],
      [
       2.6,
       1.7314,
       -0.0569
      ],
      [
       2.7,
       1.7413,
       -0.0335
      ],
      [
       2.8,
       1.7505,
       -0.0153
      ],
      [
       2.9,
       1.7597,
       -0.0036
      ],
      [
       3.0,
       1.7694,
       0.0006
      ],
      [
       3.1,
       1.7777,
       0.0006
      ],
      [
       3.2,
       1.7825,
       0.0006
      ],
      [
       3.3,
       1.7846,
       0.0006
      ],
      [
       3.333,
       1.7849,
       0.0006
      ]
     ],
     "sfx": [
      [
       0.25,
       "shark_sound_whitetipshark_qte_success_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Tail_Fin01_R"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Tail_Fin01_L"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail21"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ]
     ]
    },
    "Ani3D_FrilledShark_QTE_Enter_A_01": {
     "len": 0.8,
     "loop": true,
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Tail_Fin01_R"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Tail_Fin01_L"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_01",
       "Bip001 Tail21"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_01",
       "Bip001 Fin_L02"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Enter_A_01",
       "Bip001"
      ]
     ]
    },
    "Ani3D_FrilledShark_Normal_Die_A_01": {
     "len": 3.5,
     "loop": false,
     "sfx": [
      [
       0.0,
       "shark_large_fish_die_01"
      ]
     ]
    },
    "Ani3D_FrilledShark_QTE_Ready_A_01": {
     "len": 1.8,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       -0.0016,
       0.0
      ],
      [
       0.2,
       -0.0062,
       0.0
      ],
      [
       0.3,
       -0.0136,
       0.0
      ],
      [
       0.4,
       -0.0234,
       0.0
      ],
      [
       0.5,
       -0.0353,
       0.0
      ],
      [
       0.6,
       -0.049,
       0.0
      ],
      [
       0.7,
       -0.0644,
       0.0
      ],
      [
       0.8,
       -0.0809,
       0.0
      ],
      [
       0.9,
       -0.0983,
       0.0
      ],
      [
       1.0,
       -0.1163,
       0.0
      ],
      [
       1.1,
       -0.1348,
       0.0
      ],
      [
       1.2,
       -0.1532,
       0.0
      ],
      [
       1.3,
       -0.1714,
       0.0
      ],
      [
       1.4,
       -0.1889,
       0.0
      ],
      [
       1.5,
       -0.2056,
       0.0
      ],
      [
       1.6,
       -0.2213,
       0.0
      ],
      [
       1.7,
       0.0494,
       0.0
      ],
      [
       1.8,
       0.8902,
       0.0
      ],
      [
       1.8,
       0.8902,
       0.0
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_02",
       "Bip001 Tail_Fin01_R"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_02",
       "Bip001 Tail_Fin01_L"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Top_A_02",
       "Bip001 Tail21"
      ],
      [
       0.0,
       "VFX_Longnosesaw_Shark_Sprint_Body_A_02",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_02",
       "Bip001 Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_Fin_A_02",
       "Bip001 Fin_L02"
      ]
     ]
    }
   },
   "icon": "art/shark/Frilled_Shark_icon.png"
  },
  {
   "id": "Megamouth_Shark",
   "tid": 2010210,
   "tids": [
    2010210,
    2010224
   ],
   "zone": "C",
   "name": "Megamouth Shark",
   "hp": 180,
   "damage": 50,
   "size": 2,
   "cm": 350,
   "rank": 7,
   "activeType": 0,
   "qteLevel": 0,
   "carvable": 2,
   "night": null,
   "glb": "art/shark/Megamouth_Shark.glb",
   "kb": 174,
   "prefab": "Fish/C/Megamouth_Shark/Prefabs/SA_2010210_Megamouth_Shark.prefab",
   "controller": "Megamouth_Shark_Controller",
   "ai": {
    "AggressionType": 2.0,
    "SwimSpeed": 0.0,
    "runToHomeSpeed": 2.8,
    "FishBattleSpeedRate": 1.5,
    "RotateSpeed": 50.0,
    "RangeFindEnemy": 5.0,
    "SprintLimitTime": 1.5,
    "CoolTimeSprintDecision": 5.0,
    "RangeAbleToSprintAttack": 5.0,
    "LeastAngleToSprint": 13.0,
    "MaxRangeCanFollow": 8.0,
    "TurnWeigh": 0.8,
    "SwimWeigh": 2.8,
    "SprintWeigh": 3.5,
    "LimitTimeFindEnemyFromRun": 5.0,
    "abilities": {
     "other": [
      "MeleeSkillByEyeSight",
      "SelfStateSkill",
      "MeleeAttackData",
      "OnFlagByAnimationData",
      "AfterSprint_IncreaseRotation",
      "AniSpeedDataQTEAble"
     ]
    },
    "src": "Assets/ScriptableObjects/Fish/SA_Fish/SA_2010210_Megamouth_Shark.asset"
   },
   "scale": 1.0,
   "face": 1,
   "bounds": [
    -3.477,
    -0.732,
    1.517,
    0.732
   ],
   "mouth": [
    0.624,
    -0.068
   ],
   "roles": {
    "swim": "Ani3D_MegamouthShark_Normal_Swim_A_01",
    "swimB": "Ani3D_MegamouthShark_Normal_Swim_B_01",
    "swimC": "Ani3D_MegamouthShark_Normal_Swim_C_01",
    "sprint": "sprint",
    "attack": "Ani3D_MegamouthShark_Normal_Attack_A_01",
    "attack2": "Ani3D_MegamouthShark_Normal_Attack_A_02",
    "turn": "Ani3D_MegamouthShark_Normal_SwimTurn_A_01",
    "die": "Ani3D_MegamouthShark_Normal_Die_A_01"
   },
   "clips": {
    "Ani3D_MegamouthShark_Normal_Swim_A_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_MegamouthShark_Normal_Swim_B_01": {
     "len": 1.6667,
     "loop": true
    },
    "Ani3D_MegamouthShark_Normal_Swim_C_01": {
     "len": 1.6667,
     "loop": true
    },
    "sprint": {
     "len": 1.3333,
     "loop": true
    },
    "Ani3D_MegamouthShark_Normal_Attack_A_01": {
     "len": 1.3333,
     "loop": true,
     "sfx": [
      [
       0.0,
       "shark_sound_megamouth_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       0.15,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       0.3,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       0.45,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       0.6,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       0.75,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       0.9,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       1.05,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       1.2,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       1.35,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       1.5,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       1.65,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       1.8,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       1.95,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       2.1,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       2.25,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       2.4,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       2.55,
       "VFX_Megamouth_Shark_Attak01_Drink_01A",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Fin01"
      ]
     ]
    },
    "Ani3D_MegamouthShark_Normal_Attack_A_02": {
     "len": 1.3333,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.0186,
       0.0201
      ],
      [
       0.2,
       0.0833,
       0.0401
      ],
      [
       0.3,
       0.3393,
       -0.1037
      ],
      [
       0.4,
       0.417,
       -0.1223
      ],
      [
       0.5,
       0.4434,
       -0.1147
      ],
      [
       0.6,
       0.4674,
       -0.1021
      ],
      [
       0.7,
       0.4889,
       -0.0861
      ],
      [
       0.8,
       0.5077,
       -0.0681
      ],
      [
       0.9,
       0.5236,
       -0.0496
      ],
      [
       1.0,
       0.5365,
       -0.0321
      ],
      [
       1.1,
       0.5462,
       -0.0171
      ],
      [
       1.2,
       0.5527,
       -0.006
      ],
      [
       1.3,
       0.5557,
       -0.0004
      ],
      [
       1.333,
       0.5559,
       0.0
      ]
     ],
     "sfx": [
      [
       0.0,
       "shark_sound_whitetipshark_qte_success_01"
      ]
     ],
     "fx": [
      [
       0.0,
       "VFX_Megamouth_Shark_Attack02_Mouth_A_01",
       "Bip001 Mouth"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Top_A_01",
       "Bip001 Tail_Fin01"
      ],
      [
       0.0,
       "VFX_Megamouth_Shark_Attack02_Body_A_01",
       "Bip001"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Fin_A_01",
       "Bip001 Side_Fin_L02"
      ],
      [
       0.0,
       "VFX_Tiger_Shark_Sprint_Fin_A_01",
       "Bip001 Side_Fin_R02"
      ],
      [
       0.0,
       "VFX_Whitetip_Reefshark01_AttackD_Bip001 Mouth_Bite_A_01",
       "Bip001 Mouth"
      ]
     ]
    },
    "Ani3D_MegamouthShark_Normal_SwimTurn_A_01": {
     "len": 1.4,
     "loop": false,
     "motion": [
      [
       0.0,
       0.0,
       0.0
      ],
      [
       0.1,
       0.1586,
       0.0
      ],
      [
       0.2,
       0.4314,
       0.0
      ],
      [
       0.3,
       0.7442,
       0.0
      ],
      [
       0.4,
       1.1399,
       0.0
      ],
      [
       0.5,
       1.5151,
       0.0
      ],
      [
       0.6,
       1.6841,
       0.0
      ],
      [
       0.7,
       1.6946,
       0.0
      ],
      [
       0.8,
       1.4654,
       0.0
      ],
      [
       0.9,
       1.0991,
       0.0
      ],
      [
       1.0,
       0.7546,
       0.0
      ],
      [
       1.1,
       0.4762,
       0.0
      ],
      [
       1.2,
       0.2299,
       0.0
      ],
      [
       1.3,
       0.0202,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ],
      [
       1.4,
       0.0,
       0.0
      ]
     ],
     "sfx": [
      [
       0.0,
       "shark_sound_cookiecutter_qte_success_01"
      ]
     ]
    },
    "Ani3D_MegamouthShark_Normal_Die_A_01": {
     "len": 3.5,
     "loop": false,
     "sfx": [
      [
       0.0,
       "shark_large_fish_die_01"
      ]
     ]
    }
   },
   "icon": "art/shark/Megamouth_Shark_icon.png"
  }
 ],
 "audio": {
  "shark_large_fish_die_01": {
   "src": "audio/shark_large_fish_die_01.mp3",
   "kind": "sfx",
   "vol": 0.7,
   "clip": "large_fish_die_01"
  },
  "shark_sound_megamouth_01": {
   "src": "audio/shark_sound_megamouth_01.mp3",
   "kind": "sfx",
   "vol": 1.0,
   "clip": "sound_MegaMouth_01"
  },
  "shark_midlarge_fish_die_03": {
   "src": "audio/shark_midlarge_fish_die_03.mp3",
   "kind": "sfx",
   "vol": 0.7,
   "clip": "midlarge_fish_die_03"
  },
  "shark_sound_cookiecutter_qte_fail_01": {
   "src": "audio/shark_sound_cookiecutter_qte_fail_01.mp3",
   "kind": "sfx",
   "vol": 1.0,
   "clip": "sound_CookieCutter_QTE_Fail_01"
  },
  "shark_sound_cookiecutter_qte_success_01": {
   "src": "audio/shark_sound_cookiecutter_qte_success_01.mp3",
   "kind": "sfx",
   "vol": 1.0,
   "clip": "sound_CookieCutter_QTE_Success_01"
  },
  "shark_sound_longnosesawshark_qte_fail_01": {
   "src": "audio/shark_sound_longnosesawshark_qte_fail_01.mp3",
   "kind": "sfx",
   "vol": 0.8,
   "clip": "sound_LongnoseSawShark_QTE_Fail_01"
  },
  "shark_sound_qte_riser_01": {
   "src": "audio/shark_sound_qte_riser_01.mp3",
   "kind": "sfx",
   "vol": 0.45,
   "clip": "sound_QTE_riser_01"
  },
  "shark_sound_whitetipshark_qte_entera_01": {
   "src": "audio/shark_sound_whitetipshark_qte_entera_01.mp3",
   "kind": "sfx",
   "vol": 0.5,
   "clip": "sound_WhitetipShark_QTE_EnterA_01"
  },
  "shark_sound_whitetipshark_qte_success_01": {
   "src": "audio/shark_sound_whitetipshark_qte_success_01.mp3",
   "kind": "sfx",
   "vol": 1.0,
   "clip": "sound_WhitetipShark_QTE_Success_01"
  }
 }
};
