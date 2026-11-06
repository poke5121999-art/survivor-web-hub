# World of Slime Demo: data tables found locally

Made by `tools/dump_data.py` (to `data/<bundle>/<Class>/<name>.json`, `data/components/<Class>/<bundle>.json`, `data/_summary.json`),
`tools/dump_loc.py` (to `data/loc/<lang>.json`), `tools/scenes.py` (to `data/scenes.json`). Run `index_bundles.py` first; dump_data needs its
script map. PPtr fields stay as `{m_FileID, m_PathID}` (they point at sprites/textures in other CABs).

## Headline: the gameplay tables are NOT in the client
No slime stats, skills, items, drops, quests, shops, NPC dialogue or map layout tables exist locally. The game is online (Team42
`RPGCommon`/`SMCommon` network code: `MetaBulkRequest`, `QuestDetailListRequest`, `ShopBuyItemRequest`, `PerkDetailRequest`,
`SearchMonsterMarketRequest`, `PatchServerVersionInfo`), and `build_info.json` says `TargetServer=ProdDemo`. The client downloads its
"meta" from the server; map layouts are server-sent as well, only mapId to sound object (126 ids) is local. What is local is
presentation data. Slime stats, skills and drops would have to be invented or taken from a wiki or footage.

## Tables present (data.bundle, 232 objects)
| file | rows | fields and content |
|---|---|---|
| data/data/SlimeRenderingData/SL_*.json | 218 | `normalModelResourceName`, `baseModelResourceName`, `mainMaterialCount`, `EquipmentRuleList[{material, meshRuleDataList[{equipmentCondition, postFix, isUnique, defaultResourceName}], materialRuleDataList, FXRuleDataList}]`. Sample SL_AlarmCrab_Steel: 2 rules (material 20018 Bead001, material 20015 Vent001). Elements are in the name. |
| SlimeRenderingDataSet | 1 | `slimeRenderingDataSet{m_keys, m_values}` index of the 218 above |
| CommonDataSet | 1 | `elementUIData[13]` (id 20001..20013, pastel color, sprite PPtrs, loc key `MonsterElement.FIRE`, English name), `elementGameData[13]` (element color, death-effect color), `monsterSpecialityUIData[7]` (e.g. `SMMonsterSpeciality.FLY`), `questGroupUIData[6]`, damage/heal/hit/nickname/slime-grade colors, `LightTypeData[4]` gradients, night 19:00 to 06:00, `EnableSwitchingLoyaltyRatio` 0.2 |
| EmotionDataSet | 23 | emotion id to icon |
| MapSoundDataSet | 126 | `{mapId, soundObjectName "<id>_SoundEnvironmentObject"}`; a list of real map ids (85..110 and more) |
| MapCombineDataSet | 5 groups | tile classification for the tile-combine renderer (`Ground_Empty`, `Ground_int01_001`, center/edge/corner tiles) |
| EventSceneDataSet | 10 | cutscene keys, e.g. `CutScene_Merge_Ralus_Success` with actors (`NPC_Larus_Merge`, map "258") |
| CustomizeDataSet | 1 | 10 lens colors, 10 hair colors, 10 face decal textures per gender plus masks, face offsets |
| PreloadAssetDataSet | 4 lists | addressable names that are preloaded |
| CommonWwiseEventData, WwiseEventReference x2 | 1 each | Wwise event ids (attack/return sound, ui_attack, ui_whistle) |
| DeathScreenEffectSettings, DialogueCameraSettings, ProfanityFilterSettings | 1 each | camera/post numbers; profanity lists for 6 languages (not needed) |

Prefab components with data (`data/components/`): SlimeModelInfo x437 (RopeAttachTransform PPtr, WwiseFootstepEvent id),
MonsterObjectDestroyInfo x14 (harvestable props: crystalpillar, fossil, fruittree, herbbush, honeycomb, mushroom, orevein, saltcrystal, slimemess),
SoundMapProp x54. Also `data/resources.assets/TextAsset/build_info.json` (server and bundle versions; Prod bundle 1.29.0) and
`data/video_prologue/TextAsset/Prologue.json`.

## Localization (`data/loc/<lang>.json`, 17 languages including vi, en, ko; `{table: {key: text}}`)
Two StringTables per language: `UI` 471 keys (472 in ko) and `Context` 303 keys; every key resolved (0 `id_N` fallbacks).
Keys such as `MonsterMarket.NoticeRemainTime`, `Friend.UnBlock.AgreeMessage`, `CashShop.Warning`, `Archive.ArchivingFail`,
`Setting.Language.ko`. vi sample: "Lưu trữ slime thất bại!". `<lang>.assets.json` is the SMFontStyleTable (font per locale).
Not local: slime, item and skill names, quest and NPC dialogue text (all server meta). Use asset names like `SL_Bat_WindDark` as ids.

## Scenes (`data/scenes.json`, `tools/scenes.py`)
- level0 SplashLogoScene: logo with DOTween, ManagerObject, post volume.
- level1 SplashScene: AVProVideo background video, Wwise init (AkInitializer, WwiseManager, AudioController), UICanvas with 4 children.
- level2 LoginScene: SocialNetworkAuthProvider, SMButtons, RawImage background.
- level3 PlayScene, the whole game: GameController, CameraController (FollowCamera, RTCamera), PartyController, InteractionController,
  MapController, ItemCooltimeHolder, PVPController, FootstepController, TimelineController. Maps load additively from bundles.
- level4 WaitScene: one empty object (loading/wait).
There is no authored world scene to export; the world is assembled at runtime from map prefabs plus server data.

## Gaps for the web remake
Slime stats, skills, merge ("mix") rules, element chart (class `SMElementChartData` exists; values come from code or server), drop
tables, quests, shops, NPC dialogue, map layouts. Options: constants from the IL2CPP dump (`tools/il2cpp_method.py`), the mapres prefabs for
the look, wiki or gameplay footage for numbers.
