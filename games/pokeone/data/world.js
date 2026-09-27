// Sinh bởi tools/rip_world.py - không sửa tay.
window.P1 = window.P1 || {};
P1.WORLD = {
 "frame": {
  "unit": "1 đơn vị Unity = 1 ô",
  "angles": "độ",
  "raw": "khung Unity (tay trái)",
  "three": "khung bản web: soi gương z cho vị trí/hướng thế giới: (x, y, z) -> (x, y, -z); quaternion (x, y, z, w) -> (-x, -y, z, w)",
  "why": "game gốc: máy ảnh ở -z Unity nhìn về +z, prop đặt xoay 180° quanh y. Bản web: glb đảo x, prop không xoay, máy ảnh ở +z nhìn -z. Đảo x rồi bỏ quay 180° = soi gương z.",
  "src": "level2 Player Handler/Player Camera (GameCamera.Offset z = -14.5, Transform 45° quanh x) + sharedassets2 NPCPrefab (con quay 180°)"
 },
 "character": {
  "moveSpeed": {
   "value": 3.25,
   "unit": "ô/giây (đơn vị Unity/giây)",
   "src": "level2 Player Handler/Player Character CharacterHandler.MoveSpeed (NPCPrefab và Network Player cũng 3.25)",
   "npc": 3.25,
   "network": 3.25
  },
  "animationSpeed": {
   "value": null,
   "src": "CharacterHandler.AnimationSpeed (private, offset 0xAC)",
   "note": "private, không serialize; mã GameAssembly.dll bị Themida mã hoá (.ctor 0x1AA6B0 toàn byte rác), không đọc được hằng"
  },
  "jumpSpeed": {
   "value": null,
   "src": "CharacterHandler.JumpSpeed (private, offset 0x10C)",
   "note": "private, không serialize; mã bị mã hoá như trên"
  },
  "lineOfSight": {
   "value": 0,
   "npc": 0,
   "checkForLOS": true,
   "src": "CharacterHandler.LineOfSight trên Player Character (level2) và NPCPrefab (sharedassets2)",
   "note": "mặc định 0; tầm nhìn thật của trainer do server gửi (NPCSettingStruct.LOS, SightAction)"
  },
  "defaults": {
   "player": {
    "MoveSpeed": 3.25,
    "LineOfSight": 0,
    "CheckForLOS": 1,
    "Steps": 1,
    "CurrentDirection": 1,
    "SpriteNumber": -1
   },
   "npc": {
    "MoveSpeed": 3.25,
    "LineOfSight": 0,
    "CheckForLOS": 1,
    "Steps": 1,
    "CurrentDirection": 1,
    "SpriteNumber": -1
   },
   "src": "level2 Player Handler/Player Character / sharedassets2 NPCPrefab, CharacterHandler"
  },
  "rig": {
   "spriteOffset": {
    "pos": [
     0.5,
     0.2,
     -0.35
    ],
    "quat": [
     0.3007,
     0.0,
     0.0,
     0.9537
    ],
    "euler": [
     35.0,
     0.0,
     0.0
    ],
    "scale": [
     1.0,
     1.0,
     1.0
    ],
    "active": true,
    "three": {
     "pos": [
      0.5,
      0.2,
      0.35
     ],
     "quat": [
      -0.3007,
      0.0,
      0.0,
      0.9537
     ],
     "euler": [
      -35.0,
      0.0,
      0.0
     ]
    },
    "src": "level2 Player Handler/Player Character/Sprite Offset Transform (NPCPrefab, Network Player giống hệt)"
   },
   "body": {
    "pos": [
     0.0,
     0.1,
     0.0
    ],
    "quat": [
     0.0,
     0.0,
     0.0,
     1.0
    ],
    "euler": [
     0.0,
     0.0,
     0.0
    ],
    "scale": [
     2.0,
     2.0,
     2.0
    ],
    "active": true,
    "mesh": "Quad (built-in 1x1, pid 10210) x scale -> 2x2 đơn vị",
    "material": {
     "name": "Player Material",
     "shader": "Custom/Character",
     "color": [
      1.0,
      1.0,
      1.0,
      1.0
     ],
     "cutoff": 0.5
    },
    "three": {
     "pos": [
      0.0,
      0.1,
      0.0
     ],
     "quat": [
      0.0,
      0.0,
      0.0,
      1.0
     ],
     "euler": [
      0.0,
      0.0,
      0.0
     ]
    },
    "src": "level2 Player Handler/Player Character/Sprite Offset/Quad - Body MeshFilter+MeshRenderer"
   },
   "shadow": {
    "pos": [
     0.0,
     -0.8,
     0.06
    ],
    "quat": [
     0.5,
     0.0,
     0.0,
     0.866
    ],
    "euler": [
     60.0015,
     0.0,
     0.0
    ],
    "scale": [
     1.0,
     0.5,
     1.0
    ],
    "active": true,
    "mesh": "Quad (built-in) scale 1x0.5",
    "material": {
     "name": "shadow 1",
     "shader": "Standard",
     "texture": "shadow",
     "texSize": [
      32,
      16
     ],
     "img": "art/fx/shadow.png",
     "color": [
      1.0,
      1.0,
      1.0,
      0.5608
     ],
     "mode": "fade",
     "blend": [
      5,
      10
     ],
     "cutoff": 0.5
    },
    "three": {
     "pos": [
      0.0,
      -0.8,
      -0.06
     ],
     "quat": [
      -0.5,
      0.0,
      0.0,
      0.866
     ],
     "euler": [
      -60.0015,
      0.0,
      0.0
     ]
    },
    "note": "cộng góc cha 35.0° + 60.0° = 95.0° quanh x: gần nằm phẳng; CharacterHandler.Shadow trỏ GameObject này",
    "src": "level2 Player Handler/Player Character/Sprite Offset/Quad - Shadow"
   },
   "quadSize": [
    2.0,
    2.0
   ],
   "pxPerUnit": 32,
   "pxPerUnitNote": "[SUY RA] ô sprite 64 px (sdata 256x256, lưới 4x4) phủ cả quad 2x2 đơn vị -> 32 px/đơn vị, khớp ô nền 32 px. UV từng ô do SetSpritePosition gán lúc chạy (mã mã hoá), không đo được.",
   "tiltDeg": 35.0,
   "tiltNote": "Sprite Offset xoay +35.0° quanh x (Unity): mặt quad ngả về phía máy ảnh (-z Unity). Máy ảnh nghiêng 45°, nên sprite không vuông góc tia nhìn.",
   "quadCentre": [
    0.5,
    0.2819,
    -0.2926
   ],
   "quadCentreThree": [
    0.5,
    0.2819,
    0.2926
   ],
   "quadBottom": [
    0.5,
    -0.5372,
    -0.8662
   ],
   "quadBottomThree": [
    0.5,
    -0.5372,
    0.8662
   ],
   "shadowCentre": [
    0.5,
    -0.4897,
    -0.7597
   ],
   "shadowCentreThree": [
    0.5,
    -0.4897,
    0.7597
   ],
   "src": "tính từ ma trận Transform: gốc nhân vật -> Quad - Body/Quad - Shadow (khung gốc nhân vật)"
  },
  "groundY": {
   "value": -0.6,
   "src": "sharedassets2 NPCPrefab: con AcornTree, Apricorn - Black, Apricorn - Blue, Apricorn - Green, Apricorn - Pink, Apricorn - Red, Apricorn - White, Apricorn - Yellow, Berry Tree_1, Door Horiz, Door Vert, Door_3, Door_4, Door_5, Fire_Lamp, PokeBall, Rock_Break, Snorlax_Sleep, TreeCut đặt ở y = -0.6 so với gốc nhân vật",
   "note": "[SUY RA] mặt đất ô = gốc nhân vật - 0.6; bóng đổ nằm ~0.11 trên mặt đất"
  },
  "propYaw180": {
   "value": true,
   "src": "sharedassets2 NPCPrefab: Door_3, Door Horiz, TreeCut, PokeBall, Rock_Break, Fire_Lamp... Transform quay (0,1,0,~0) = 180° quanh y",
   "note": "prop gắn vào nhân vật (cửa, cây chặt được...) xoay 180°; TreeCut scale 0.06024 = 1/16.6 (nhóm prefab cũ). Nhà gốc có mặt tiền pháp tuyến +z (đo diện tích pháp tuyến ext_house_pallettown_1: +z 25.6, -z 4.9), máy ảnh ở -z: [SUY RA] map gốc đặt prop với ry = 180."
  },
  "meshRef": {
   "mesh": "Quad",
   "pathID": 10210,
   "src": "unity default resources"
  }
 },
 "follow": {
  "root": {
   "pos": [
    1.0,
    0.0,
    0.0
   ],
   "quat": [
    0.0,
    0.0,
    0.0,
    1.0
   ],
   "euler": [
    0.0,
    0.0,
    0.0
   ],
   "scale": [
    1.0,
    1.0,
    1.0
   ],
   "active": true,
   "three": {
    "pos": [
     1.0,
     0.0,
     0.0
    ]
   },
   "src": "level2 Player Handler/Follow Pokemon Transform (con của Player Handler, cạnh Player Character)",
   "note": "đặt lệch 1 ô theo x khi dựng scene; lúc chơi FollowPokemon tự dời theo bước chủ (mã mã hoá)"
  },
  "spriteOffset": {
   "pos": [
    0.5,
    0.2,
    -0.15
   ],
   "quat": [
    0.342,
    0.0,
    0.0,
    0.9397
   ],
   "euler": [
    39.9975,
    0.0,
    0.0
   ],
   "scale": [
    1.0,
    1.0,
    1.0
   ],
   "active": true,
   "three": {
    "pos": [
     0.5,
     0.2,
     0.15
    ],
    "quat": [
     -0.342,
     0.0,
     0.0,
     0.9397
    ],
    "euler": [
     -39.9975,
     0.0,
     0.0
    ]
   },
   "src": "level2 Player Handler/Follow Pokemon/Sprite Offset"
  },
  "body": {
   "pos": [
    0.0,
    0.1,
    0.0
   ],
   "quat": [
    0.0,
    0.0,
    0.0,
    1.0
   ],
   "euler": [
    0.0,
    0.0,
    0.0
   ],
   "scale": [
    2.0,
    2.0,
    2.0
   ],
   "active": true,
   "material": {
    "name": "Player Material",
    "shader": "Custom/Character",
    "color": [
     1.0,
     1.0,
     1.0,
     1.0
    ],
    "cutoff": 0.5
   },
   "three": {
    "pos": [
     0.0,
     0.1,
     0.0
    ],
    "quat": [
     0.0,
     0.0,
     0.0,
     1.0
    ],
    "euler": [
     0.0,
     0.0,
     0.0
    ]
   },
   "src": "level2 Player Handler/Follow Pokemon/Sprite Offset/Quad - Body"
  },
  "shadow": {
   "pos": [
    0.0,
    -0.9203,
    -0.0237
   ],
   "quat": [
    0.4617,
    0.0,
    0.0,
    0.887
   ],
   "euler": [
    54.9956,
    0.0,
    0.0
   ],
   "scale": [
    1.0,
    0.5,
    1.0
   ],
   "active": false,
   "activeInNetworkPlayer": true,
   "three": {
    "pos": [
     0.0,
     -0.9203,
     0.0237
    ],
    "quat": [
     -0.4617,
     0.0,
     0.0,
     0.887
    ],
    "euler": [
     -54.9956,
     0.0,
     0.0
    ]
   },
   "src": "level2 Player Handler/Follow Pokemon/Sprite Offset/Quad - Shadow (level2 tắt, sharedassets2 Network Player bật)"
  },
  "serialized": {
   "Steps": 0,
   "CurrentDirection": 0,
   "objects": 3,
   "src": "level2 Player Handler/Follow Pokemon FollowPokemon"
  },
  "speed": {
   "value": null,
   "src": "FollowPokemon (dump.cs 205972)",
   "note": "lớp không có trường tốc độ/offset public; AnimationSpeed private không serialize. [SUY RA] đi theo tốc độ bước của chủ (MoveSpeed)"
  }
 },
 "camera": {
  "fov": 30.0,
  "fovAxis": "dọc (Unity), dùng thẳng cho PerspectiveCamera.fov",
  "near": 0.3,
  "far": 56.0,
  "clearFlags": "solidColor",
  "clearColor": [
   0.6887,
   0.6887,
   0.6887,
   0.0
  ],
  "hdr": false,
  "msaa": false,
  "src": "level2 Player Handler/Player Camera Camera (fov, near, far, clear)",
  "follow": {
   "target": "Player Handler/Player Character/Sprite Offset",
   "offset": [
    0.0,
    14.0,
    -14.5
   ],
   "npcOffset": [
    0.5,
    14.0,
    -14.5
   ],
   "speed": 8.0,
   "src": "level2 Player Handler/Player Camera GameCamera.Target/Offset/NPCOffset/speed",
   "note": "vị trí máy ảnh = vị trí Target (Sprite Offset của người chơi) + Offset. [SUY RA] speed = hệ số Lerp mỗi giây (mã Update bị mã hoá). NPCOffset dùng khi máy ảnh bám NPC trong script (ScriptTarget).",
   "three": {
    "offset": [
     0.0,
     14.0,
     14.5
    ],
    "npcOffset": [
     0.5,
     14.0,
     14.5
    ]
   }
  },
  "rotation": {
   "pos": [
    0.0,
    0.0,
    0.0
   ],
   "quat": [
    0.3827,
    0.0,
    0.0,
    0.9239
   ],
   "euler": [
    45.0009,
    0.0,
    0.0
   ],
   "scale": [
    1.0,
    1.0,
    1.0
   ],
   "active": true,
   "pitchDeg": 45.0,
   "forwardUnity": [
    0.0,
    -0.7071,
    0.7071
   ],
   "offsetAngleDeg": 43.9949,
   "distance": 20.1556,
   "three": {
    "quat": [
     -0.3827,
     0.0,
     0.0,
     0.9239
    ],
    "euler": [
     -45.0009,
     0.0,
     0.0
    ],
    "dir": [
     0.0,
     -0.7071,
     -0.7071
    ],
    "note": "three.js: camera.position = target + (0, 14, 14.5); camera.rotation.x = -45° (nhìn về -z, chúc xuống)"
   },
   "src": "level2 Player Handler/Player Camera Transform (localRotation, cha Player Handler không xoay)",
   "note": "góc Transform cố định 45°; góc của Offset là atan(14/14.5) = 43.99°: [SUY RA] máy ảnh không LookAt mà giữ góc Transform"
  },
  "underwater": {
   "color": [
    0.3443,
    0.4299,
    1.0,
    1.0
   ],
   "amplitude": 0.001,
   "freq": [
    30.0,
    30.0
   ],
   "src": "level2 Player Handler/Player Camera CameraEffects"
  }
 },
 "light": {
  "sun": {
   "type": "directional",
   "color": [
    1.0,
    1.0,
    1.0,
    1.0
   ],
   "intensity": 0.7,
   "shadows": "none",
   "transform": {
    "pos": [
     0.0,
     3.0,
     0.0
    ],
    "quat": [
     0.3827,
     0.0,
     0.0,
     0.9239
    ],
    "euler": [
     45.0009,
     0.0,
     0.0
    ],
    "scale": [
     1.0,
     1.0,
     1.0
    ],
    "active": true
   },
   "dirUnity": [
    0.0,
    -0.7071,
    0.7071
   ],
   "three": {
    "dir": [
     0.0,
     -0.7071,
     -0.7071
    ],
    "note": "hướng ánh sáng CHIẾU TỚI; đặt DirectionalLight ở target - dir * k"
   },
   "src": "level2 Map/Directional Light Light (= MapManager.MapLight)"
  },
  "ambient": {
   "mode": "flat",
   "color": [
    0.4118,
    0.4118,
    0.4118,
    1.0
   ],
   "intensity": 1.0,
   "src": "level2 RenderSettings m_AmbientMode/m_AmbientSkyColor"
  },
  "fog": {
   "on": false,
   "mode": "exp2",
   "color": [
    0.5,
    0.5,
    0.5,
    1.0
   ],
   "density": 0.01,
   "start": 0.0,
   "end": 300.0,
   "src": "level2 RenderSettings (m_Fog = false: map ngoài trời không có sương)"
  },
  "ambientByArea": {
   "normal": [
    0.4118,
    0.4118,
    0.4118,
    1.0
   ],
   "cave": [
    0.3333,
    0.3333,
    0.3333,
    1.0
   ],
   "spooky": [
    0.2021,
    0.1623,
    0.6038,
    1.0
   ],
   "battle": [
    0.4118,
    0.4118,
    0.4118,
    1.0
   ],
   "battleEvening": [
    0.2353,
    0.1255,
    0.0,
    1.0
   ],
   "battleNight": [
    0.0196,
    0.0,
    0.1255,
    1.0
   ],
   "battleSpooky": [
    0.0627,
    0.0,
    1.0,
    1.0
   ],
   "src": "level2 Map MapManager AmbientColour/CaveAmbientColour/SpookyAmbientColour/Battle*AmbientColour"
  },
  "environmentColours": {
   "value": [
    [
     0.4118,
     0.4118,
     0.4118,
     1.0
    ],
    [
     0.1216,
     0.1451,
     0.2431,
     1.0
    ],
    [
     1.0,
     1.0,
     1.0,
     1.0
    ],
    [
     0.7725,
     0.7725,
     0.7725,
     1.0
    ],
    [
     0.7547,
     0.513,
     0.2955,
     1.0
    ],
    [
     0.2091,
     0.2956,
     0.5472,
     1.0
    ],
    [
     0.2667,
     0.2863,
     0.3529,
     1.0
    ]
   ],
   "src": "level2 Map MapManager EnviromentColours[7]",
   "note": "thứ tự không có nhãn (GameDayTime chỉ có 5 giá trị Unset/Morning/Day/Evening/Night, mảng có 7; mã dùng mảng bị mã hoá). [0] = AmbientColour, [4] cam = hoàng hôn, [1]/[5] xanh tối = đêm là [SUY RA] theo màu."
  },
  "timeOfDay": {
   "value": 0,
   "enum": {
    "0": "Unset",
    "1": "Morning",
    "2": "Day",
    "3": "Evening",
    "4": "Night"
   },
   "src": "level2 Map MapManager TimeOfDay + dump.cs enum GameDayTime"
  },
  "water": {
   "normal": [
    1.0,
    1.0,
    1.0,
    1.0
   ],
   "cave": [
    0.5647,
    0.6902,
    0.3294,
    1.0
   ],
   "spooky": [
    0.0392,
    0.2392,
    0.4627,
    1.0
   ],
   "src": "level2 Map MapManager WaterColourNormal/Cave/Spooky"
  },
  "weather": {
   "sand": [
    [
     0.717,
     0.5464,
     0.2266,
     0.0
    ],
    [
     0.7176,
     0.549,
     0.2275,
     1.0
    ],
    [
     0.6792,
     0.5327,
     0.2531,
     1.0
    ]
   ],
   "snow": [
    [
     1.0,
     1.0,
     1.0,
     0.0
    ],
    [
     1.0,
     1.0,
     1.0,
     0.7961
    ]
   ],
   "rain": [
    [
     0.1843,
     0.2431,
     0.3294,
     0.0
    ],
    [
     0.1843,
     0.2431,
     0.3294,
     1.0
    ]
   ],
   "src": "level2 Map MapManager SandColours/SnowColours/RainColours"
  },
  "areaLights": {
   "mapManagerRefs": {
    "dark": "Player Handler/Player Character/Dark Light",
    "cave": "Player Handler/Player Character/Cave Light",
    "spooky": "Player Handler/Player Character/Red Light"
   },
   "dark": {
    "type": "point",
    "color": [
     1.0,
     0.9451,
     0.8471,
     1.0
    ],
    "intensity": 1.0,
    "range": 2.0,
    "pos": [
     0.5,
     0.5,
     -1.0
    ],
    "active": false,
    "three": {
     "pos": [
      0.5,
      0.5,
      1.0
     ]
    },
    "src": "level2 Player Handler/Player Character/Dark Light Light (con của nhân vật người chơi)"
   },
   "cave": {
    "type": "point",
    "color": [
     1.0,
     0.9451,
     0.8471,
     1.0
    ],
    "intensity": 1.0,
    "range": 8.54,
    "pos": [
     0.5,
     4.0,
     -0.6
    ],
    "active": false,
    "three": {
     "pos": [
      0.5,
      4.0,
      0.6
     ]
    },
    "src": "level2 Player Handler/Player Character/Cave Light Light (con của nhân vật người chơi)"
   },
   "red": {
    "type": "point",
    "color": [
     0.5569,
     0.1804,
     0.3647,
     1.0
    ],
    "intensity": 2.0,
    "range": 25.0,
    "pos": [
     0.5,
     5.0,
     -2.5
    ],
    "active": false,
    "three": {
     "pos": [
      0.5,
      5.0,
      2.5
     ]
    },
    "src": "level2 Player Handler/Player Character/Red Light Light (con của nhân vật người chơi)"
   },
   "src": "level2 Map MapManager DarkLight/CaveLight/SpookyLight (GameObject) + Light trên các con của Player Character"
  },
  "nightLights": {
   "value": [
    {
     "material": "c102_09_mado",
     "colors": {
      "_Color": [
       0.952,
       0.917,
       0.345,
       1.0
      ],
      "_EmissionColor": [
       0.0,
       0.0,
       0.0,
       1.0
      ]
     },
     "file": "sharedassets2.assets"
    },
    {
     "material": "c102_mado",
     "colors": {
      "_Color": [
       0.952,
       0.917,
       0.345,
       1.0
      ],
      "_EmissionColor": [
       0.0,
       0.0,
       0.0,
       1.0
      ]
     },
     "file": "sharedassets2.assets"
    }
   ],
   "src": "level2 Map MapManager NightLights (material cửa sổ sáng ban đêm)"
  }
 },
 "fx": {
  "grass": {
   "prefab": "Special Grass",
   "systems": [
    {
     "path": "Special Grass",
     "main": {
      "duration": 5.0,
      "looping": true,
      "prewarm": false,
      "playOnAwake": true,
      "startDelay": {
       "mode": "constant",
       "value": 0.0
      },
      "startLifetime": {
       "mode": "constant",
       "value": 0.8
      },
      "startSpeed": {
       "mode": "constant",
       "value": 3.5
      },
      "startSize": {
       "mode": "constant",
       "value": 0.25
      },
      "startRotationDeg": {
       "mode": "constant",
       "value": 0.0
      },
      "startColor": {
       "mode": "twoColors",
       "min": [
        0.043,
        0.6132,
        0.0,
        1.0
       ],
       "max": [
        0.9193,
        1.0,
        0.0,
        1.0
       ]
      },
      "gravityModifier": {
       "mode": "constant",
       "value": 1.0
      },
      "maxParticles": 50,
      "simulationSpace": "local",
      "scalingMode": "local",
      "simulationSpeed": 1.0
     },
     "emission": {
      "rateOverTime": {
       "mode": "constant",
       "value": 4.0
      },
      "rateOverDistance": {
       "mode": "constant",
       "value": 0.0
      },
      "bursts": []
     },
     "shape": {
      "enabled": true,
      "type": "cone",
      "radius": 0.2,
      "radiusThickness": 1.0,
      "angle": 5.5,
      "length": 5.0,
      "arc": 360.0,
      "box": [
       1.0,
       1.0,
       1.0
      ],
      "position": [
       0.0,
       0.0,
       0.0
      ],
      "rotation": [
       0.0,
       0.0,
       0.0
      ],
      "randomDirection": 0.0
     },
     "colorOverLifetime": {
      "mode": "gradient",
      "at": [
       0.0,
       0.25,
       0.5,
       0.75,
       1.0
      ],
      "rgba": [
       [
        1.0,
        1.0,
        1.0,
        1.0
       ],
       [
        1.0,
        1.0,
        1.0,
        1.0
       ],
       [
        1.0,
        1.0,
        1.0,
        1.0
       ],
       [
        1.0,
        1.0,
        1.0,
        1.0
       ],
       [
        1.0,
        1.0,
        1.0,
        0.0
       ]
      ]
     },
     "rotationOverLifetimeDeg": {
      "mode": "twoConstants",
      "min": -120.0,
      "max": 120.0
     },
     "renderer": {
      "mode": "billboard",
      "alignment": "view",
      "lengthScale": 2.0,
      "velocityScale": 0.0,
      "maxParticleSize": 0.5,
      "sortingFudge": 0.0,
      "materials": [
       {
        "name": "CFX3_Leaf AB",
        "shader": "Legacy Shaders/Particles/Alpha Blended",
        "texture": "CFX3_T_Leaf",
        "texSize": [
         128,
         128
        ],
        "img": "art/fx/CFX3_T_Leaf.png",
        "color": [
         1.0,
         1.0,
         1.0,
         1.0
        ],
        "tintcolor": [
         0.502,
         0.502,
         0.502,
         0.502
        ]
       }
      ]
     },
     "transform": {
      "pos": [
       -0.5,
       -0.5,
       0.0
      ],
      "quat": [
       0.0,
       0.0,
       0.0,
       1.0
      ],
      "euler": [
       0.0,
       0.0,
       0.0
      ],
      "scale": [
       1.0,
       1.0,
       1.0
      ],
      "active": true,
      "three": {
       "pos": [
        -0.5,
        -0.5,
        0.0
       ],
       "quat": [
        0.0,
        0.0,
        0.0,
        1.0
       ],
       "euler": [
        0.0,
        0.0,
        0.0
       ]
      }
     }
    }
   ],
   "src": "sharedassets2.assets prefab \"Special Grass\" ParticleSystem (+ con)",
   "use": "lá cỏ bắn lên khi bước vào cỏ cao [SUY RA theo tên + màu xanh lá]"
  },
  "dust": {
   "prefab": "Dust Effect",
   "systems": [
    {
     "path": "Dust Effect",
     "main": {
      "duration": 0.5,
      "looping": true,
      "prewarm": false,
      "playOnAwake": true,
      "startDelay": {
       "mode": "constant",
       "value": 0.0
      },
      "startLifetime": {
       "mode": "constant",
       "value": 4.0
      },
      "startSpeed": {
       "mode": "constant",
       "value": 0.0
      },
      "startSize": {
       "mode": "curve",
       "at": [
        0.0,
        0.25,
        0.5,
        0.75,
        1.0
       ],
       "value": [
        0.5115,
        0.5124,
        0.4712,
        0.3223,
        0.0
       ]
      },
      "startRotationDeg": {
       "mode": "twoConstants",
       "min": 0.0,
       "max": 360.0
      },
      "startColor": {
       "mode": "color",
       "rgba": [
        0.7925,
        0.3894,
        0.0,
        0.6784
       ]
      },
      "gravityModifier": {
       "mode": "constant",
       "value": 0.0
      },
      "maxParticles": 5,
      "simulationSpace": "local",
      "scalingMode": "shape",
      "simulationSpeed": 1.0
     },
     "emission": {
      "rateOverTime": {
       "mode": "constant",
       "value": 1.0
      },
      "rateOverDistance": {
       "mode": "constant",
       "value": 0.0
      },
      "bursts": []
     },
     "shape": {
      "enabled": true,
      "type": "box",
      "radius": 0.2,
      "radiusThickness": 1.0,
      "angle": 80.0,
      "length": 5.0,
      "arc": 360.0,
      "box": [
       0.0,
       0.0,
       0.3
      ],
      "position": [
       0.0,
       0.0,
       0.0
      ],
      "rotation": [
       0.0,
       0.0,
       0.0
      ],
      "randomDirection": 0.0
     },
     "sizeOverLifetime": {
      "mode": "curve",
      "at": [
       0.0,
       0.25,
       0.5,
       0.75,
       1.0
      ],
      "value": [
       0.0,
       1.2974,
       2.2016,
       2.7308,
       2.9032
      ]
     },
     "colorOverLifetime": {
      "mode": "gradient",
      "at": [
       0.0,
       0.25,
       0.5,
       0.75,
       1.0
      ],
      "rgba": [
       [
        0.9176,
        1.0,
        1.0,
        0.0
       ],
       [
        0.7696,
        0.9049,
        0.9049,
        1.0
       ],
       [
        0.6216,
        0.8098,
        0.8098,
        0.8333
       ],
       [
        0.4735,
        0.7147,
        0.7147,
        0.4167
       ],
       [
        0.3255,
        0.6196,
        0.6196,
        0.0
       ]
      ]
     },
     "rotationOverLifetimeDeg": {
      "mode": "twoConstants",
      "min": -45.0,
      "max": 45.0
     },
     "renderer": {
      "mode": "horizontalBillboard",
      "alignment": "view",
      "lengthScale": 2.0,
      "velocityScale": 0.0,
      "maxParticleSize": 0.5,
      "sortingFudge": 0.0,
      "materials": [
       {
        "name": "CFXM2_SingleSmoke AB",
        "shader": "Mobile/Particles/Alpha Blended",
        "texture": "CFXM2_T_SingleSmoke",
        "texSize": [
         32,
         32
        ],
        "img": "art/fx/CFXM2_T_SingleSmoke.png",
        "color": [
         1.0,
         1.0,
         1.0,
         1.0
        ],
        "tintcolor": [
         0.5,
         0.5,
         0.5,
         0.5
        ]
       }
      ]
     },
     "transform": {
      "pos": [
       0.0,
       0.0,
       4.073
      ],
      "quat": [
       -0.7071,
       0.0,
       0.0,
       0.7071
      ],
      "euler": [
       -90.0,
       0.0,
       0.0
      ],
      "scale": [
       0.5,
       0.5,
       0.5
      ],
      "active": true,
      "three": {
       "pos": [
        0.0,
        0.0,
        -4.073
       ],
       "quat": [
        0.7071,
        0.0,
        0.0,
        0.7071
       ],
       "euler": [
        90.0,
        0.0,
        0.0
       ]
      }
     }
    }
   ],
   "src": "sharedassets2.assets prefab \"Dust Effect\" ParticleSystem (+ con)",
   "use": "bụi khi đáp sau cú nhảy gờ [SUY RA theo tên]"
  },
  "shiny": {
   "prefab": "Shiny Sparkle",
   "systems": [
    {
     "path": "Shiny Sparkle",
     "main": {
      "duration": 5.0,
      "looping": true,
      "prewarm": false,
      "playOnAwake": true,
      "startDelay": {
       "mode": "constant",
       "value": 0.0
      },
      "startLifetime": {
       "mode": "constant",
       "value": 3.0
      },
      "startSpeed": {
       "mode": "twoConstants",
       "min": 0.3,
       "max": 0.6
      },
      "startSize": {
       "mode": "constant",
       "value": 10.0
      },
      "startRotationDeg": {
       "mode": "constant",
       "value": 0.0
      },
      "startColor": {
       "mode": "twoColors",
       "min": [
        1.0,
        0.9056,
        0.0,
        1.0
       ],
       "max": [
        0.0501,
        1.0,
        0.0,
        1.0
       ]
      },
      "gravityModifier": {
       "mode": "constant",
       "value": -0.005
      },
      "maxParticles": 20,
      "simulationSpace": "world",
      "scalingMode": "local",
      "simulationSpeed": 1.0
     },
     "emission": {
      "rateOverTime": {
       "mode": "constant",
       "value": 3.0
      },
      "rateOverDistance": {
       "mode": "constant",
       "value": 0.0
      },
      "bursts": []
     },
     "shape": {
      "enabled": true,
      "type": "skinnedMeshRenderer",
      "radius": 1.0,
      "radiusThickness": 1.0,
      "angle": 25.0,
      "length": 5.0,
      "arc": 360.0,
      "box": [
       1.0,
       1.0,
       1.0
      ],
      "position": [
       0.0,
       0.0,
       0.0
      ],
      "rotation": [
       0.0,
       0.0,
       0.0
      ],
      "randomDirection": 0.0
     },
     "sizeOverLifetime": {
      "mode": "curve",
      "at": [
       0.0,
       0.25,
       0.5,
       0.75,
       1.0
      ],
      "value": [
       0.0,
       0.25,
       0.5,
       0.75,
       1.0
      ]
     },
     "colorOverLifetime": {
      "mode": "gradient",
      "at": [
       0.0,
       0.25,
       0.5,
       0.75,
       1.0
      ],
      "rgba": [
       [
        1.0,
        1.0,
        1.0,
        0.0
       ],
       [
        1.0,
        1.0,
        1.0,
        1.0
       ],
       [
        1.0,
        1.0,
        1.0,
        1.0
       ],
       [
        1.0,
        1.0,
        1.0,
        1.0
       ],
       [
        1.0,
        1.0,
        1.0,
        0.0
       ]
      ]
     },
     "rotationOverLifetimeDeg": {
      "mode": "twoConstants",
      "min": 180.0,
      "max": 360.0
     },
     "renderer": {
      "mode": "billboard",
      "alignment": "view",
      "lengthScale": 2.0,
      "velocityScale": 0.0,
      "maxParticleSize": 1.0,
      "sortingFudge": 0.0,
      "materials": [
       {
        "name": "CFXM3_GlowStar ADD",
        "shader": "Particles/Standard Unlit",
        "texture": "CFXM3_T_GlowStar",
        "texSize": [
         64,
         64
        ],
        "img": "art/fx/CFXM3_T_GlowStar.png",
        "color": [
         1.0,
         1.0,
         1.0,
         1.0
        ],
        "tintcolor": [
         0.5,
         0.5,
         0.5,
         0.5
        ],
        "blend": [
         5,
         1
        ],
        "cutoff": 0.5
       }
      ]
     },
     "transform": {
      "pos": [
       0.0,
       0.0,
       0.0
      ],
      "quat": [
       0.0,
       0.0,
       0.0,
       1.0
      ],
      "euler": [
       0.0,
       0.0,
       0.0
      ],
      "scale": [
       1.0,
       1.0,
       1.0
      ],
      "active": true,
      "three": {
       "pos": [
        0.0,
        0.0,
        0.0
       ],
       "quat": [
        0.0,
        0.0,
        0.0,
        1.0
       ],
       "euler": [
        0.0,
        0.0,
        0.0
       ]
      }
     },
     "scripts": [
      "ShinySparkler"
     ]
    }
   ],
   "src": "sharedassets2.assets prefab \"Shiny Sparkle\" ParticleSystem (+ con)",
   "use": "lấp lánh Pokémon shiny; ShinySparkler gán shape = SkinnedMeshRenderer của model lúc chạy"
  },
  "ripple": {
   "prefab": "RippleEffect",
   "systems": [
    {
     "path": "RippleEffect",
     "main": {
      "duration": 0.5,
      "looping": true,
      "prewarm": false,
      "playOnAwake": true,
      "startDelay": {
       "mode": "constant",
       "value": 0.0
      },
      "startLifetime": {
       "mode": "constant",
       "value": 5.0
      },
      "startSpeed": {
       "mode": "constant",
       "value": 0.0
      },
      "startSize": {
       "mode": "curve",
       "at": [
        0.0,
        0.25,
        0.5,
        0.75,
        1.0
       ],
       "value": [
        0.5115,
        0.5124,
        0.4712,
        0.3223,
        0.0
       ]
      },
      "startRotationDeg": {
       "mode": "twoConstants",
       "min": 0.0,
       "max": 360.0
      },
      "startColor": {
       "mode": "color",
       "rgba": [
        1.0,
        1.0,
        1.0,
        0.3059
       ]
      },
      "gravityModifier": {
       "mode": "constant",
       "value": 0.0
      },
      "maxParticles": 5,
      "simulationSpace": "local",
      "scalingMode": "shape",
      "simulationSpeed": 1.0
     },
     "emission": {
      "rateOverTime": {
       "mode": "constant",
       "value": 1.0
      },
      "rateOverDistance": {
       "mode": "constant",
       "value": 0.0
      },
      "bursts": []
     },
     "shape": {
      "enabled": false,
      "type": "hemisphere",
      "radius": 0.2,
      "radiusThickness": 1.0,
      "angle": 80.0,
      "length": 5.0,
      "arc": 360.0,
      "box": [
       1.0,
       1.0,
       1.0
      ],
      "position": [
       0.0,
       0.0,
       0.0
      ],
      "rotation": [
       0.0,
       0.0,
       0.0
      ],
      "randomDirection": 0.0
     },
     "sizeOverLifetime": {
      "mode": "curve",
      "at": [
       0.0,
       0.25,
       0.5,
       0.75,
       1.0
      ],
      "value": [
       0.0,
       1.2974,
       2.2016,
       2.7308,
       2.9032
      ]
     },
     "colorOverLifetime": {
      "mode": "gradient",
      "at": [
       0.0,
       0.25,
       0.5,
       0.75,
       1.0
      ],
      "rgba": [
       [
        0.9176,
        1.0,
        1.0,
        0.0
       ],
       [
        0.7696,
        0.9049,
        0.9049,
        1.0
       ],
       [
        0.6216,
        0.8098,
        0.8098,
        0.8333
       ],
       [
        0.4735,
        0.7147,
        0.7147,
        0.4167
       ],
       [
        0.3255,
        0.6196,
        0.6196,
        0.0
       ]
      ]
     },
     "renderer": {
      "mode": "horizontalBillboard",
      "alignment": "view",
      "lengthScale": 2.0,
      "velocityScale": 0.0,
      "maxParticleSize": 0.5,
      "sortingFudge": 0.0,
      "materials": [
       {
        "name": "CFXM_Ripple_AddSoft",
        "shader": "Cartoon FX/Particles Additive Alpha8",
        "texture": "CFXM_T_Ripple",
        "texSize": [
         64,
         64
        ],
        "img": "art/fx/CFXM_T_Ripple.png",
        "color": [
         1.0,
         1.0,
         1.0,
         1.0
        ],
        "tintcolor": [
         1.0,
         1.0,
         1.0,
         1.0
        ]
       }
      ]
     },
     "transform": {
      "pos": [
       0.0,
       0.0,
       0.0
      ],
      "quat": [
       -0.7071,
       0.0,
       0.0,
       0.7071
      ],
      "euler": [
       -90.0,
       0.0,
       0.0
      ],
      "scale": [
       0.5,
       0.5,
       0.5
      ],
      "active": true,
      "three": {
       "pos": [
        0.0,
        0.0,
        0.0
       ],
       "quat": [
        0.7071,
        0.0,
        0.0,
        0.7071
       ],
       "euler": [
        90.0,
        0.0,
        0.0
       ]
      }
     }
    },
    {
     "path": "RippleEffect/Particle System",
     "main": {
      "duration": 4.0,
      "looping": true,
      "prewarm": false,
      "playOnAwake": true,
      "startDelay": {
       "mode": "constant",
       "value": 0.0
      },
      "startLifetime": {
       "mode": "constant",
       "value": 1.0
      },
      "startSpeed": {
       "mode": "twoConstants",
       "min": 0.0,
       "max": 0.5
      },
      "startSize": {
       "mode": "constant",
       "value": 0.1
      },
      "startRotationDeg": {
       "mode": "constant",
       "value": 0.0
      },
      "startColor": {
       "mode": "color",
       "rgba": [
        1.0,
        1.0,
        1.0,
        1.0
       ]
      },
      "gravityModifier": {
       "mode": "constant",
       "value": 0.0
      },
      "maxParticles": 1000,
      "simulationSpace": "local",
      "scalingMode": "local",
      "simulationSpeed": 1.0
     },
     "emission": {
      "rateOverTime": {
       "mode": "constant",
       "value": 10.0
      },
      "rateOverDistance": {
       "mode": "constant",
       "value": 0.0
      },
      "bursts": []
     },
     "shape": {
      "enabled": true,
      "type": "cone",
      "radius": 0.3,
      "radiusThickness": 1.0,
      "angle": 25.0,
      "length": 5.0,
      "arc": 360.0,
      "box": [
       1.0,
       1.0,
       1.0
      ],
      "position": [
       0.0,
       0.0,
       0.0
      ],
      "rotation": [
       0.0,
       0.0,
       0.0
      ],
      "randomDirection": 0.0
     },
     "colorOverLifetime": {
      "mode": "gradient",
      "at": [
       0.0,
       0.25,
       0.5,
       0.75,
       1.0
      ],
      "rgba": [
       [
        1.0,
        1.0,
        1.0,
        0.0
       ],
       [
        1.0,
        1.0,
        1.0,
        1.0
       ],
       [
        1.0,
        1.0,
        1.0,
        1.0
       ],
       [
        1.0,
        1.0,
        1.0,
        1.0
       ],
       [
        1.0,
        1.0,
        1.0,
        0.0
       ]
      ]
     },
     "velocityOverLifetime": {
      "x": {
       "mode": "constant",
       "value": 0.0
      },
      "y": {
       "mode": "constant",
       "value": 0.0
      },
      "z": {
       "mode": "constant",
       "value": 1.0
      },
      "space": "local"
     },
     "renderer": {
      "mode": "billboard",
      "alignment": "view",
      "lengthScale": 2.0,
      "velocityScale": 0.0,
      "maxParticleSize": 0.5,
      "sortingFudge": 0.0,
      "materials": [
       {
        "name": "Bubble",
        "shader": "Legacy Shaders/Particles/Additive",
        "texture": "CFXM3_T_CircleSoft",
        "texSize": [
         64,
         64
        ],
        "img": "art/fx/CFXM3_T_CircleSoft.png",
        "color": [
         1.0,
         1.0,
         1.0,
         1.0
        ],
        "tintcolor": [
         0.2075,
         0.2075,
         0.2075,
         1.0
        ],
        "cutoff": 0.5
       }
      ]
     },
     "transform": {
      "pos": [
       0.0,
       0.0,
       -2.679
      ],
      "quat": [
       0.0,
       0.0,
       0.0,
       1.0
      ],
      "euler": [
       0.0,
       0.0,
       0.0
      ],
      "scale": [
       1.0,
       1.0,
       1.0
      ],
      "active": true,
      "three": {
       "pos": [
        0.0,
        0.0,
        2.679
       ],
       "quat": [
        0.0,
        0.0,
        0.0,
        1.0
       ],
       "euler": [
        0.0,
        0.0,
        0.0
       ]
      }
     }
    }
   ],
   "src": "sharedassets2.assets prefab \"RippleEffect\" ParticleSystem (+ con)",
   "use": "gợn nước quanh chân khi lội/lướt [SUY RA theo tên]"
  },
  "followShinyStars": {
   "systems": [
    {
     "path": "ShinyStars Small",
     "main": {
      "duration": 0.6,
      "looping": true,
      "prewarm": false,
      "playOnAwake": true,
      "startDelay": {
       "mode": "constant",
       "value": 0.0
      },
      "startLifetime": {
       "mode": "twoConstants",
       "min": 0.6,
       "max": 0.8
      },
      "startSpeed": {
       "mode": "constant",
       "value": 0.0
      },
      "startSize": {
       "mode": "twoConstants",
       "min": 0.1,
       "max": 0.2
      },
      "startRotationDeg": {
       "mode": "constant",
       "value": 0.0
      },
      "startColor": {
       "mode": "color",
       "rgba": [
        0.8235,
        1.0,
        0.9781,
        0.809
       ]
      },
      "gravityModifier": {
       "mode": "constant",
       "value": 0.0
      },
      "maxParticles": 15,
      "simulationSpace": "world",
      "scalingMode": "shape",
      "simulationSpeed": 1.0
     },
     "emission": {
      "rateOverTime": {
       "mode": "constant",
       "value": 7.0
      },
      "rateOverDistance": {
       "mode": "constant",
       "value": 0.0
      },
      "bursts": [
       {
        "time": 0.0,
        "count": {
         "mode": "constant",
         "value": 0.0
        },
        "cycles": 1,
        "interval": 0.01
       }
      ]
     },
     "shape": {
      "enabled": true,
      "type": "sphere",
      "radius": 0.35,
      "radiusThickness": 1.0,
      "angle": 80.0,
      "length": 5.0,
      "arc": 360.0,
      "box": [
       1.0,
       1.0,
       1.0
      ],
      "position": [
       0.0,
       0.0,
       0.0
      ],
      "rotation": [
       0.0,
       0.0,
       0.0
      ],
      "randomDirection": 0.0
     },
     "sizeOverLifetime": {
      "mode": "curve",
      "at": [
       0.0,
       0.25,
       0.5,
       0.75,
       1.0
      ],
      "value": [
       0.0,
       0.4375,
       0.75,
       0.9375,
       1.0
      ]
     },
     "colorOverLifetime": {
      "mode": "gradient",
      "at": [
       0.0,
       0.25,
       0.5,
       0.75,
       1.0
      ],
      "rgba": [
       [
        1.0,
        1.0,
        1.0,
        0.0
       ],
       [
        1.0,
        1.0,
        1.0,
        0.65
       ],
       [
        1.0,
        1.0,
        1.0,
        1.0
       ],
       [
        1.0,
        1.0,
        1.0,
        0.5
       ],
       [
        1.0,
        1.0,
        1.0,
        0.0
       ]
      ]
     },
     "rotationOverLifetimeDeg": {
      "mode": "twoConstants",
      "min": -90.0,
      "max": 90.0
     },
     "velocityOverLifetime": {
      "x": {
       "mode": "constant",
       "value": 0.0
      },
      "y": {
       "mode": "constant",
       "value": 0.3
      },
      "z": {
       "mode": "constant",
       "value": 0.0
      },
      "space": "local"
     },
     "renderer": {
      "mode": "billboard",
      "alignment": "view",
      "lengthScale": 5.0,
      "velocityScale": 0.0,
      "maxParticleSize": 0.5,
      "sortingFudge": -1.0,
      "materials": [
       {
        "name": "CFXM3_GlowStar ADD",
        "shader": "Particles/Standard Unlit",
        "texture": "CFXM3_T_GlowStar",
        "texSize": [
         64,
         64
        ],
        "img": "art/fx/CFXM3_T_GlowStar.png",
        "color": [
         1.0,
         1.0,
         1.0,
         1.0
        ],
        "tintcolor": [
         0.5,
         0.5,
         0.5,
         0.5
        ],
        "blend": [
         5,
         1
        ],
        "cutoff": 0.5
       }
      ]
     },
     "transform": {
      "pos": [
       0.0,
       0.12,
       -0.37
      ],
      "quat": [
       -0.6756,
       0.0,
       0.0,
       0.7373
      ],
      "euler": [
       -84.9991,
       0.0,
       0.0
      ],
      "scale": [
       1.0,
       1.0,
       1.0
      ],
      "active": false,
      "three": {
       "pos": [
        0.0,
        0.12,
        0.37
       ],
       "quat": [
        0.6756,
        0.0,
        0.0,
        0.7373
       ],
       "euler": [
        84.9991,
        0.0,
        0.0
       ]
      }
     }
    }
   ],
   "src": "level2 Player Handler/Follow Pokemon/Sprite Offset/Quad - Shadow/ShinyStars Small ParticleSystem",
   "use": "sao nhỏ dưới Pokémon đi theo khi shiny (GameObject tắt sẵn)"
  }
 },
 "door": {
  "houseDoors": {
   "door_ext_brownhouse": {
    "animations": [
     {
      "node": "Door_2",
      "playAutomatically": true,
      "clips": [
       {
        "name": "Take 001",
        "legacy": true,
        "sampleRate": 30.0,
        "wrap": "loop",
        "length": 1.7,
        "curves": [
         {
          "prop": "position",
          "path": "",
          "keys": [
           [
            0.0,
            -17.6927,
            0.8847,
            -2.104
           ],
           [
            1.7,
            -17.6927,
            0.8847,
            -2.104
           ]
          ]
         },
         {
          "prop": "rotation",
          "path": "",
          "keys": [
           [
            0.0,
            -0.7071,
            0.0,
            0.0,
            0.7071
           ],
           [
            0.3667,
            -0.6707,
            0.224,
            0.224,
            0.6707
           ],
           [
            0.6,
            -0.5692,
            0.4195,
            0.4195,
            0.5692
           ],
           [
            0.8667,
            -0.5018,
            0.4982,
            0.4982,
            0.5018
           ],
           [
            1.2,
            -0.6326,
            0.3158,
            0.3158,
            0.6326
           ],
           [
            1.4333,
            -0.6991,
            0.1059,
            0.1059,
            0.6991
           ],
           [
            1.6667,
            -0.7071,
            0.0,
            0.0,
            0.7071
           ],
           [
            1.7,
            -0.7071,
            0.0,
            0.0,
            0.7071
           ]
          ],
          "peak": 89.5875,
          "peakAt": 0.8667
         },
         {
          "prop": "scale",
          "path": "",
          "keys": [
           [
            0.0,
            1.0,
            1.0,
            1.0
           ],
           [
            1.7,
            1.0,
            1.0,
            1.0
           ]
          ]
         }
        ]
       }
      ]
     }
    ],
    "hasDoorAnimator": true,
    "src": "assets/assetbundles/mapassets/modelprefabs/door_ext_brownhouse.prefab (mdata) Animation + clip legacy"
   },
   "door_green_oak": {
    "animations": [
     {
      "node": "Door_2",
      "playAutomatically": true,
      "clips": [
       {
        "name": "Take 001",
        "legacy": true,
        "sampleRate": 30.0,
        "wrap": "loop",
        "length": 1.7,
        "curves": [
         {
          "prop": "position",
          "path": "",
          "keys": [
           [
            0.0,
            -17.6927,
            0.8847,
            -2.104
           ],
           [
            1.7,
            -17.6927,
            0.8847,
            -2.104
           ]
          ]
         },
         {
          "prop": "rotation",
          "path": "",
          "keys": [
           [
            0.0,
            -0.7071,
            0.0,
            0.0,
            0.7071
           ],
           [
            0.3667,
            -0.6707,
            0.224,
            0.224,
            0.6707
           ],
           [
            0.6,
            -0.5692,
            0.4195,
            0.4195,
            0.5692
           ],
           [
            0.8667,
            -0.5018,
            0.4982,
            0.4982,
            0.5018
           ],
           [
            1.2,
            -0.6326,
            0.3158,
            0.3158,
            0.6326
           ],
           [
            1.4333,
            -0.6991,
            0.1059,
            0.1059,
            0.6991
           ],
           [
            1.6667,
            -0.7071,
            0.0,
            0.0,
            0.7071
           ],
           [
            1.7,
            -0.7071,
            0.0,
            0.0,
            0.7071
           ]
          ],
          "peak": 89.5875,
          "peakAt": 0.8667
         },
         {
          "prop": "scale",
          "path": "",
          "keys": [
           [
            0.0,
            1.0,
            1.0,
            1.0
           ],
           [
            1.7,
            1.0,
            1.0,
            1.0
           ]
          ]
         }
        ]
       }
      ]
     }
    ],
    "hasDoorAnimator": true,
    "src": "assets/assetbundles/mapassets/modelprefabs/door_green_oak.prefab (mdata) Animation + clip legacy"
   },
   "pokiecentre_doors": {
    "animations": [
     {
      "node": "PokieCentre_Doors",
      "playAutomatically": true,
      "clips": [
       {
        "name": "Take 001",
        "legacy": true,
        "sampleRate": 30.0,
        "wrap": "loop",
        "length": 1.7,
        "curves": [
         {
          "prop": "position",
          "path": "DoorLeft",
          "keys": [
           [
            0.0,
            -8.2605,
            0.0,
            -6.9269
           ],
           [
            1.7,
            -8.2605,
            0.0,
            -6.9269
           ]
          ]
         },
         {
          "prop": "position",
          "path": "DoorLeft001",
          "keys": [
           [
            0.8333,
            -8.2605,
            0.0,
            -6.9269
           ],
           [
            1.7,
            -8.2605,
            0.0,
            -6.9269
           ]
          ]
         },
         {
          "prop": "rotation",
          "path": "DoorLeft",
          "keys": [
           [
            0.0,
            -0.7071,
            0.0,
            0.0,
            0.7071
           ],
           [
            0.4333,
            -0.6922,
            0.1445,
            0.1445,
            0.6922
           ],
           [
            0.9,
            -0.6563,
            0.2631,
            0.2631,
            0.6563
           ],
           [
            1.3,
            -0.6981,
            0.1122,
            0.1122,
            0.6981
           ],
           [
            1.6667,
            -0.7071,
            0.0,
            0.0,
            0.7071
           ],
           [
            1.7,
            -0.7071,
            0.0,
            0.0,
            0.7071
           ]
          ],
          "peak": 43.6901,
          "peakAt": 0.9
         },
         {
          "prop": "rotation",
          "path": "DoorLeft001",
          "keys": [
           [
            0.0,
            0.7071,
            0.0,
            0.0,
            0.7071
           ],
           [
            0.4333,
            0.6928,
            -0.1413,
            0.1413,
            0.6928
           ],
           [
            0.9333,
            0.6606,
            -0.2521,
            0.2521,
            0.6606
           ],
           [
            1.3,
            0.6985,
            -0.1097,
            0.1097,
            0.6985
           ],
           [
            1.6667,
            0.7071,
            0.0,
            0.0,
            0.7071
           ],
           [
            1.7,
            0.7071,
            0.0,
            0.0,
            0.7071
           ]
          ],
          "peak": 41.776,
          "peakAt": 0.9333
         },
         {
          "prop": "scale",
          "path": "DoorLeft",
          "keys": [
           [
            0.0,
            0.0106,
            0.01,
            0.01
           ],
           [
            1.7,
            0.0106,
            0.01,
            0.01
           ]
          ]
         },
         {
          "prop": "scale",
          "path": "DoorLeft001",
          "keys": [
           [
            0.0,
            -0.0106,
            -0.01,
            -0.01
           ],
           [
            1.7,
            -0.0106,
            -0.01,
            -0.01
           ]
          ]
         }
        ]
       }
      ]
     }
    ],
    "hasDoorAnimator": true,
    "src": "assets/assetbundles/mapassets/modelprefabs/pokiecentre_doors.prefab (mdata) Animation + clip legacy"
   },
   "shopdoors": {
    "animations": [
     {
      "node": "ShopDoors",
      "playAutomatically": true,
      "clips": [
       {
        "name": "Take 001",
        "legacy": true,
        "sampleRate": 30.0,
        "wrap": "loop",
        "length": 1.7,
        "curves": [
         {
          "prop": "position",
          "path": "Glass",
          "keys": [
           [
            0.0,
            -7.5412,
            1.3456,
            -3.5671
           ],
           [
            0.3333,
            -4.2642,
            1.3456,
            -3.5671
           ],
           [
            0.7,
            1.129,
            1.3456,
            -3.5671
           ],
           [
            0.8667,
            1.7243,
            1.3456,
            -3.5671
           ],
           [
            1.1667,
            -1.5091,
            1.3456,
            -3.5671
           ],
           [
            1.6667,
            -7.5412,
            1.3456,
            -3.5671
           ],
           [
            1.7,
            -7.5412,
            1.3456,
            -3.5671
           ]
          ],
          "peak": 9.2655,
          "peakAt": 0.8667
         },
         {
          "prop": "position",
          "path": "Glass001",
          "keys": [
           [
            0.0,
            -9.0929,
            1.3456,
            -3.5671
           ],
           [
            0.5,
            -15.0406,
            1.3456,
            -3.5671
           ],
           [
            0.9333,
            -17.9068,
            1.3456,
            -3.5671
           ],
           [
            1.6667,
            -9.0929,
            1.3456,
            -3.5671
           ],
           [
            1.7,
            -9.0929,
            1.3456,
            -3.5671
           ]
          ],
          "peak": 8.8139,
          "peakAt": 0.9333
         },
         {
          "prop": "rotation",
          "path": "Glass",
          "keys": [
           [
            0.0,
            -0.7071,
            0.0,
            0.0,
            0.7071
           ],
           [
            1.7,
            -0.7071,
            0.0,
            0.0,
            0.7071
           ]
          ]
         },
         {
          "prop": "rotation",
          "path": "Glass001",
          "keys": [
           [
            0.0,
            0.7071,
            0.0,
            0.0,
            0.7071
           ],
           [
            1.7,
            0.7071,
            0.0,
            0.0,
            0.7071
           ]
          ]
         },
         {
          "prop": "scale",
          "path": "Glass",
          "keys": [
           [
            0.0,
            0.01,
            0.01,
            0.01
           ],
           [
            1.7,
            0.01,
            0.01,
            0.01
           ]
          ]
         },
         {
          "prop": "scale",
          "path": "Glass001",
          "keys": [
           [
            0.0,
            -0.01,
            -0.01,
            -0.01
           ],
           [
            1.7,
            -0.01,
            -0.01,
            -0.01
           ]
          ]
         }
        ]
       }
      ]
     }
    ],
    "hasDoorAnimator": true,
    "src": "assets/assetbundles/mapassets/modelprefabs/shopdoors.prefab (mdata) Animation + clip legacy"
   }
  },
  "doorAnimator": {
   "fields": {
    "anim": null,
    "ExtraSize": 0.0
   },
   "src": "mdata* DoorAnimator (71 prefab, dump.cs 226588): anim = null, ExtraSize = 0 ở mọi cửa nhà",
   "note": "[SUY RA] DoorAnimator lấy Animation ở con lúc chạy và phát clip khi người chơi đứng trước cửa; toạ độ clip của prefab nhóm cũ (door_ext_*) tính theo đơn vị cũ, nhân legacyScale 0.060241 như props.js"
  },
  "npcDoors": {
   "value": [
    {
     "name": "Door_3",
     "transform": {
      "pos": [
       0.0,
       -0.6,
       0.0
      ],
      "quat": [
       0.0,
       1.0,
       0.0,
       0.0
      ],
      "euler": [
       0.0,
       180.0,
       0.0
      ],
      "scale": [
       1.0,
       1.0,
       1.0
      ],
      "active": false
     },
     "animations": [
      {
       "node": "DoorBoss",
       "clips": [
        {
         "name": "Take 001",
         "legacy": true,
         "sampleRate": 30.0,
         "wrap": "loop",
         "length": 3.3667,
         "curves": [
          {
           "prop": "position",
           "path": "Box005",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0
            ],
            [
             0.0333,
             0.0043,
             0.0,
             0.0
            ],
            [
             0.5667,
             0.6295,
             0.0,
             0.0
            ],
            [
             1.1667,
             1.2579,
             0.0,
             0.0
            ],
            [
             1.7,
             1.8471,
             0.0,
             0.0
            ],
            [
             2.1667,
             1.2579,
             0.0,
             0.0
            ],
            [
             2.7667,
             0.6295,
             0.0,
             0.0
            ],
            [
             3.3333,
             0.0,
             0.0,
             0.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0
            ]
           ],
           "peak": 1.8471,
           "peakAt": 1.7
          },
          {
           "prop": "position",
           "path": "Box006",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0
            ],
            [
             1.1667,
             0.0,
             0.0,
             0.0
            ],
            [
             1.6667,
             0.5944,
             0.0,
             0.0
            ],
            [
             2.1667,
             0.0,
             0.0,
             0.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0
            ]
           ],
           "peak": 0.5944,
           "peakAt": 1.6667
          },
          {
           "prop": "position",
           "path": "Box009",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0
            ],
            [
             0.5667,
             0.0,
             0.0,
             0.0
            ],
            [
             1.1667,
             0.6284,
             0.0,
             0.0
            ],
            [
             1.7,
             1.2176,
             0.0,
             0.0
            ],
            [
             2.1667,
             0.6284,
             0.0,
             0.0
            ],
            [
             2.7667,
             0.0,
             0.0,
             0.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0
            ]
           ],
           "peak": 1.2176,
           "peakAt": 1.7
          },
          {
           "prop": "rotation",
           "path": "Box005",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "rotation",
           "path": "Box006",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "rotation",
           "path": "Box009",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Box005",
           "keys": [
            [
             0.0,
             1.0,
             1.0,
             1.0
            ],
            [
             3.3667,
             1.0,
             1.0,
             1.0
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Box006",
           "keys": [
            [
             0.0,
             1.0,
             1.018,
             0.4246
            ],
            [
             3.3667,
             1.0,
             1.018,
             0.4246
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Box009",
           "keys": [
            [
             0.0,
             1.0,
             1.0,
             1.0
            ],
            [
             3.3667,
             1.0,
             1.0,
             1.0
            ]
           ]
          }
         ]
        }
       ]
      }
     ]
    },
    {
     "name": "Door_4",
     "transform": {
      "pos": [
       1.0,
       -0.6,
       0.0
      ],
      "quat": [
       0.0,
       0.7071,
       0.0,
       -0.7071
      ],
      "euler": [
       0.0,
       -90.0,
       0.0
      ],
      "scale": [
       1.0,
       1.0,
       1.0
      ],
      "active": false
     },
     "animations": [
      {
       "node": "DoorBoss",
       "clips": [
        {
         "name": "Take 001",
         "legacy": true,
         "sampleRate": 30.0,
         "wrap": "loop",
         "length": 3.3667,
         "curves": [
          {
           "prop": "position",
           "path": "Box005",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0
            ],
            [
             0.0333,
             0.0043,
             0.0,
             0.0
            ],
            [
             0.5667,
             0.6295,
             0.0,
             0.0
            ],
            [
             1.1667,
             1.2579,
             0.0,
             0.0
            ],
            [
             1.7,
             1.8471,
             0.0,
             0.0
            ],
            [
             2.1667,
             1.2579,
             0.0,
             0.0
            ],
            [
             2.7667,
             0.6295,
             0.0,
             0.0
            ],
            [
             3.3333,
             0.0,
             0.0,
             0.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0
            ]
           ],
           "peak": 1.8471,
           "peakAt": 1.7
          },
          {
           "prop": "position",
           "path": "Box006",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0
            ],
            [
             1.1667,
             0.0,
             0.0,
             0.0
            ],
            [
             1.6667,
             0.5944,
             0.0,
             0.0
            ],
            [
             2.1667,
             0.0,
             0.0,
             0.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0
            ]
           ],
           "peak": 0.5944,
           "peakAt": 1.6667
          },
          {
           "prop": "position",
           "path": "Box009",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0
            ],
            [
             0.5667,
             0.0,
             0.0,
             0.0
            ],
            [
             1.1667,
             0.6284,
             0.0,
             0.0
            ],
            [
             1.7,
             1.2176,
             0.0,
             0.0
            ],
            [
             2.1667,
             0.6284,
             0.0,
             0.0
            ],
            [
             2.7667,
             0.0,
             0.0,
             0.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0
            ]
           ],
           "peak": 1.2176,
           "peakAt": 1.7
          },
          {
           "prop": "rotation",
           "path": "Box005",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "rotation",
           "path": "Box006",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "rotation",
           "path": "Box009",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Box005",
           "keys": [
            [
             0.0,
             1.0,
             1.0,
             1.0
            ],
            [
             3.3667,
             1.0,
             1.0,
             1.0
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Box006",
           "keys": [
            [
             0.0,
             1.0,
             1.018,
             0.4246
            ],
            [
             3.3667,
             1.0,
             1.018,
             0.4246
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Box009",
           "keys": [
            [
             0.0,
             1.0,
             1.0,
             1.0
            ],
            [
             3.3667,
             1.0,
             1.0,
             1.0
            ]
           ]
          }
         ]
        }
       ]
      }
     ]
    },
    {
     "name": "Door_5",
     "transform": {
      "pos": [
       0.0,
       -0.6,
       2.0
      ],
      "quat": [
       0.0,
       1.0,
       0.0,
       0.0
      ],
      "euler": [
       0.0,
       180.0,
       0.0
      ],
      "scale": [
       1.0,
       1.0,
       1.0
      ],
      "active": false
     },
     "animations": [
      {
       "node": "Door_5",
       "clips": [
        {
         "name": "Take 001",
         "legacy": true,
         "sampleRate": 30.0,
         "wrap": "loop",
         "length": 1.7,
         "curves": [
          {
           "prop": "position",
           "path": "Object003",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             2.0
            ],
            [
             0.0333,
             0.0,
             -0.0006,
             2.0
            ],
            [
             1.6667,
             0.0,
             -0.5221,
             2.0
            ],
            [
             1.7,
             0.0,
             0.0,
             2.0
            ]
           ],
           "peak": 0.5221,
           "peakAt": 1.6667
          },
          {
           "prop": "position",
           "path": "Object004",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             2.0
            ],
            [
             0.0333,
             0.0,
             -0.0055,
             2.0
            ],
            [
             0.8333,
             0.0,
             -1.501,
             2.0
            ],
            [
             1.6667,
             0.0,
             -2.0231,
             2.0
            ],
            [
             1.7,
             0.0,
             0.0,
             2.0
            ]
           ],
           "peak": 2.0231,
           "peakAt": 1.6667
          },
          {
           "prop": "rotation",
           "path": "Object003",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             1.7,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "rotation",
           "path": "Object004",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             1.7,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Object003",
           "keys": [
            [
             0.0,
             1.0,
             1.0,
             1.0
            ],
            [
             1.7,
             1.0,
             1.0,
             1.0
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Object004",
           "keys": [
            [
             0.0,
             1.0,
             1.0,
             1.0
            ],
            [
             1.7,
             1.0,
             1.0,
             1.0
            ]
           ]
          }
         ]
        }
       ]
      }
     ]
    },
    {
     "name": "Door Horiz",
     "transform": {
      "pos": [
       0.0,
       -0.6,
       0.0
      ],
      "quat": [
       0.0,
       1.0,
       0.0,
       0.0
      ],
      "euler": [
       0.0,
       180.0,
       0.0
      ],
      "scale": [
       1.0,
       1.0,
       1.0
      ],
      "active": false
     },
     "animations": [
      {
       "node": "DoorBoss",
       "clips": [
        {
         "name": "Take 001",
         "legacy": true,
         "sampleRate": 30.0,
         "wrap": "loop",
         "length": 3.3667,
         "curves": [
          {
           "prop": "position",
           "path": "Box005",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0
            ],
            [
             0.0333,
             0.0043,
             0.0,
             0.0
            ],
            [
             0.5667,
             0.6295,
             0.0,
             0.0
            ],
            [
             1.1667,
             1.2579,
             0.0,
             0.0
            ],
            [
             1.7,
             1.8471,
             0.0,
             0.0
            ],
            [
             2.1667,
             1.2579,
             0.0,
             0.0
            ],
            [
             2.7667,
             0.6295,
             0.0,
             0.0
            ],
            [
             3.3333,
             0.0,
             0.0,
             0.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0
            ]
           ],
           "peak": 1.8471,
           "peakAt": 1.7
          },
          {
           "prop": "position",
           "path": "Box006",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0
            ],
            [
             1.1667,
             0.0,
             0.0,
             0.0
            ],
            [
             1.6667,
             0.5944,
             0.0,
             0.0
            ],
            [
             2.1667,
             0.0,
             0.0,
             0.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0
            ]
           ],
           "peak": 0.5944,
           "peakAt": 1.6667
          },
          {
           "prop": "position",
           "path": "Box009",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0
            ],
            [
             0.5667,
             0.0,
             0.0,
             0.0
            ],
            [
             1.1667,
             0.6284,
             0.0,
             0.0
            ],
            [
             1.7,
             1.2176,
             0.0,
             0.0
            ],
            [
             2.1667,
             0.6284,
             0.0,
             0.0
            ],
            [
             2.7667,
             0.0,
             0.0,
             0.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0
            ]
           ],
           "peak": 1.2176,
           "peakAt": 1.7
          },
          {
           "prop": "rotation",
           "path": "Box005",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "rotation",
           "path": "Box006",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "rotation",
           "path": "Box009",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Box005",
           "keys": [
            [
             0.0,
             1.0,
             1.0,
             1.0
            ],
            [
             3.3667,
             1.0,
             1.0,
             1.0
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Box006",
           "keys": [
            [
             0.0,
             1.0,
             1.018,
             0.4246
            ],
            [
             3.3667,
             1.0,
             1.018,
             0.4246
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Box009",
           "keys": [
            [
             0.0,
             1.0,
             1.0,
             1.0
            ],
            [
             3.3667,
             1.0,
             1.0,
             1.0
            ]
           ]
          }
         ]
        }
       ]
      }
     ]
    },
    {
     "name": "Door Vert",
     "transform": {
      "pos": [
       1.0,
       -0.6,
       0.0
      ],
      "quat": [
       0.0,
       0.7071,
       0.0,
       -0.7071
      ],
      "euler": [
       0.0,
       -90.0,
       0.0
      ],
      "scale": [
       1.0,
       1.0,
       1.0
      ],
      "active": false
     },
     "animations": [
      {
       "node": "DoorBoss",
       "clips": [
        {
         "name": "Take 001",
         "legacy": true,
         "sampleRate": 30.0,
         "wrap": "loop",
         "length": 3.3667,
         "curves": [
          {
           "prop": "position",
           "path": "Box005",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0
            ],
            [
             0.0333,
             0.0043,
             0.0,
             0.0
            ],
            [
             0.5667,
             0.6295,
             0.0,
             0.0
            ],
            [
             1.1667,
             1.2579,
             0.0,
             0.0
            ],
            [
             1.7,
             1.8471,
             0.0,
             0.0
            ],
            [
             2.1667,
             1.2579,
             0.0,
             0.0
            ],
            [
             2.7667,
             0.6295,
             0.0,
             0.0
            ],
            [
             3.3333,
             0.0,
             0.0,
             0.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0
            ]
           ],
           "peak": 1.8471,
           "peakAt": 1.7
          },
          {
           "prop": "position",
           "path": "Box006",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0
            ],
            [
             1.1667,
             0.0,
             0.0,
             0.0
            ],
            [
             1.6667,
             0.5944,
             0.0,
             0.0
            ],
            [
             2.1667,
             0.0,
             0.0,
             0.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0
            ]
           ],
           "peak": 0.5944,
           "peakAt": 1.6667
          },
          {
           "prop": "position",
           "path": "Box009",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0
            ],
            [
             0.5667,
             0.0,
             0.0,
             0.0
            ],
            [
             1.1667,
             0.6284,
             0.0,
             0.0
            ],
            [
             1.7,
             1.2176,
             0.0,
             0.0
            ],
            [
             2.1667,
             0.6284,
             0.0,
             0.0
            ],
            [
             2.7667,
             0.0,
             0.0,
             0.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0
            ]
           ],
           "peak": 1.2176,
           "peakAt": 1.7
          },
          {
           "prop": "rotation",
           "path": "Box005",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "rotation",
           "path": "Box006",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "rotation",
           "path": "Box009",
           "keys": [
            [
             0.0,
             0.0,
             0.0,
             0.0,
             1.0
            ],
            [
             3.3667,
             0.0,
             0.0,
             0.0,
             1.0
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Box005",
           "keys": [
            [
             0.0,
             1.0,
             1.0,
             1.0
            ],
            [
             3.3667,
             1.0,
             1.0,
             1.0
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Box006",
           "keys": [
            [
             0.0,
             1.0,
             1.018,
             0.4246
            ],
            [
             3.3667,
             1.0,
             1.018,
             0.4246
            ]
           ]
          },
          {
           "prop": "scale",
           "path": "Box009",
           "keys": [
            [
             0.0,
             1.0,
             1.0,
             1.0
            ],
            [
             3.3667,
             1.0,
             1.0,
             1.0
            ]
           ]
          }
         ]
        }
       ]
      }
     ]
    }
   ],
   "src": "sharedassets2 NPCPrefab/Door_* (cửa kiểu NPC do server bật, Animation DoorBoss)"
  },
  "doorObject": {
   "src": "mdata* DoorObject (21 prefab: rèm gym Striaton, BadgeGate, kệ sách...)",
   "note": "cửa đặc biệt trượt DoorParts tới EndPositions với speed (1..3); không dùng cho cửa nhà thường"
  }
 },
 "emote": {
  "bubble": {
   "offset": [
    0.5,
    1.0,
    0.0
   ],
   "prefabOffset": [
    0.5,
    1.5,
    0.0
   ],
   "depth": 0,
   "src": "level2 GUI Root/Panel - Usernames/Emote Bubble EmoteBubble.offset; sharedassets2 prefab \"Emote Bubble\" (dùng cho NPC/người khác)",
   "note": "bong bóng là widget NGUI bám toạ độ màn hình của target (Player Character) + offset thế giới"
  },
  "sprite": {
   "atlas": "EmoteAtlas",
   "initial": "1",
   "size": [
    52,
    42
   ],
   "src": "level2 .../Emote Bubble spriteEmote UISprite mAtlas/mSpriteName/mWidth/mHeight"
  },
  "spotted": {
   "sprite": "1",
   "atlas": "EmoteAtlas",
   "src": "data/atlas.js EmoteAtlas \"1\" = [70,4,68,62] = bong bóng dấu \"!\" (xem art/ui/EmoteAtlas.png); \"2\" = \"?\"",
   "note": "[SUY RA] trainer thấy người chơi -> emote 1 (\"!\"): CharacterHandler.ProximityEmote / EmoteBubble.Emote(int id) nhận số; mã chọn số bị mã hoá"
  },
  "spottedSFX": {
   "value": null,
   "src": "MAPAPI.Response.NPCSettingStruct.SpottedSFX (string, dump.cs 164231+)",
   "note": "server gửi theo từng NPC; client không có giá trị mặc định (stringliteral.json không có tên tiếng)"
  },
  "animation": {
   "clips": [
    {
     "name": "Bubble",
     "legacy": true,
     "sampleRate": 60.0,
     "wrap": "default",
     "length": 0.3,
     "curves": [
      {
       "prop": "scale",
       "path": "",
       "keys": [
        [
         0.0,
         1.0,
         1.0,
         1.0
        ],
        [
         0.0667,
         1.0707,
         0.9516,
         1.0
        ],
        [
         0.0833,
         1.055,
         0.9761,
         1.0
        ],
        [
         0.15,
         0.9477,
         1.1315,
         1.0
        ],
        [
         0.2167,
         1.08,
         1.08,
         1.0
        ],
        [
         0.3,
         1.0,
         1.0,
         1.0
        ]
       ]
      },
      {
       "prop": "m_PlayAutomatically",
       "path": "",
       "keys": [
        [
         0.0,
         0.0
        ],
        [
         0.3,
         0.0
        ]
       ]
      }
     ]
    }
   ],
   "src": "level2 GUI Root/Panel - Usernames/Emote Bubble Animation"
  },
  "tweenScale": {
   "from": [
    0.0,
    0.0,
    0.0
   ],
   "to": [
    1.0,
    1.0,
    1.0
   ],
   "duration": 0.25,
   "delay": 0.0,
   "style": 0,
   "ignoreTimeScale": 1,
   "curve": [
    0.0,
    0.25,
    0.5,
    0.75,
    1.0
   ],
   "src": "level2 .../Emote Bubble TweenScale (EmoteBubble.TS)"
  }
 }
};
