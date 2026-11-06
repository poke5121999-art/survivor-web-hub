# World of Slime Demo: code map (IL2CPP decompile)

Measured 2026-10-21 from `GameAssembly.dll` + `global-metadata.dat` v39 of the Steam demo
(`build_info` TextAsset: `TargetServer="ProdDemo" TargetMarket="Window64"`, BundleVersion 1.1.0).
Every `Type.Method` below can be re-run with `il2cpp_method.py <Type.Method>`.

## Bottom line

**The client is a thin renderer for an online, server-authoritative MMO.** It holds no stats, no damage
formula, no element chart, no capture or synthesis odds, no quests or dialogue. All of those come from the
TEAM42 game server (TCP socket, `SocketManager`) and from S3 behind signed URLs. A web rebuild cannot copy
the real numbers from the install. It can copy: the schemas (field names, enums), the client-side constants
listed below, art and anim, UI strings, input bindings, and the render rules in `data.bundle`.

## Tools (D:\wos-ref\tools)

| File | Use |
|---|---|
| `il2cpp_method.py` | Copy of `games/voiddiver/tools/il2cpp_method.py`. Game dir is env `WOS_GAME` (default `D:/Steam/steamapps/common/World of Slime Demo`). `--type RX`, `--find RX`, `--fields ExactFullName`, `--xref T.M`, `--strref RX`, `--usage RX`, `T.M` decompiles. |
| `dump_types.py` | Writes `code/types.txt`: assembly, full name, field count, method count for every typeDef (26 578). |
| `dump_fields.py RX [--methods]` | `--fields` for every type whose full name matches RX, in one process. Faster than looping. |
| `lits.py RX` / `dump_lit.py RX out` | Every string literal matching RX (short or full text). |
| `dump_databundle.py` | All 232 MonoBehaviours of `data.bundle` to `code/data/*.json` (UnityPy typetree). |
| `dump_loc.py` | Unity Localization string tables en + vi to `code/loc_en.json`, `code/loc_vi.json`. |
| `probe_bundles.py`, `probe_res.py` | Inventory of data.bundle, string tables, resources.assets. |

Traps that already bit:
- `py -3.12 -I` **ignores `PYTHONIOENCODING`** (`-I` implies `-E`). The copy of `il2cpp_method.py` calls
  `sys.stdout.reconfigure(encoding='utf-8')` itself. Without that, `--type .` crashes on cp1252.
- `--fields` takes an exact full name (or a `.Name` suffix), not a regex. Use `dump_fields.py` for regex.
- String literals in the annotated disassembly are single-quoted: grep `; '...'`, not `"`.
- Generic methods (`DataManager.LoadDatas<T>`) show `@0x0`: the body is shared and not addressable by name.

## Code outputs (D:\wos-ref\code)

`types.txt` (all types + assembly), `fields_meta.txt` (meta row types), `fields_netdata.txt` (all
`SM.Team42.*.Network.Data.*` types, 604 lines), `fields_packets.txt` (response packets incl. RequestCode /
ResponseCode enums: 308 / 621 values), `enums.txt` (36 gameplay enums with values), `wwise_enums.txt`,
`input_actions.json` + `input_bindings.txt`, `data/*.json` (data.bundle), `loc_en.json`, `loc_vi.json`.

Game assemblies: `SM.Game.dll` (2322 types, gameplay + UI), `SM.Contracts.dll` (1642, network packets and
meta schemas, MessagePack formatters), `SM.Core.dll` (466, enums, utils, Wwise manager), `SM.Net.dll`,
`SM.Patches*.dll` (patcher), `SM.Tool.Data.DB.dll` (editor DB models), `Team42.ByteSerializer.Runtime.dll`
(packet codec). Third party of note: MessagePack, ZstdSharp, UniTask, DOTween, JoystickPack, Unity Input
System, Unity Localization, Addressables, Wwise, Firebase (Auth/Crashlytics/AI), Steamworks.NET, Sentry,
Unity IAP, MeshCombineStudio, Febucci TextAnimator.

## 1. Where game data lives (the main question)

| Data | Source | Evidence |
|---|---|---|
| Monster/slime types, items, objects, quests, quest groups, actions, attacks, skills, maps, perks, visual effects, buffs, districts, monster market | **Game server over the socket**, gzip JSON chunks, cached on disk | `SM.Common.Manager.MetaSyncManager.SyncAll` sends `'meta:manifest'` then `MetaBulkRequest` (`'meta:bulk#{0}'`). Reply `MetaChunkData{metaTypeName, contentVersion, scope, seq, total, gzBytes}`. `MetaSyncManager.DecompressToString`, `MergeIntoDataManager`, `GetJson`. Disk cache `MetaSyncManager.WriteDiskCache/TryLoadFromDiskCache` (prefix `meta_`, per locale, under `StaticFuncPath.GetDevicePatchDirectory`). |
| Same tables, loader side | `SM.Common.Manager.DataManager.LoadDatas` (`<LoadDatas>d__104.MoveNext`) asks for `monster_type_client`, `item_type_client`, `object_type_client`, `quest_type_client`, `action_type_client`, `attack_type_client`, `skill_type_client`, `map_type_client`, `perk_type_client`, `visual_effect_type_client`, `buff_type_client`, `district_type_client`, `quest_group_type_client`, `monster_market_type_client`. `DataManager.ToMetaTypeName` strips `_client`. None of these names is in `aa/catalog.bin`, `resources.assets` or any local file. Result lands in `DataManager.MonsterTypeMap`, `ItemTypeMap`, ... (`SMMetaDataTypeMap<K,V>`). |
| Text for meta rows (monster names, skill text: `TextId`) | Server: `TextRequest` -> `DataManager.OnMessageReceived(ResponseCode, List<TextData>)`, `DataManager.GetCachedText(TextId)` | Local string tables only have `UI` (471) and `Context` (303) keys. |
| Map collision, floor heights, land type, camera rect, fog, BGM, markers | **S3 over HTTP** with server-granted URLs | `SM.Scene.Play.Controller.Map.MapDataLoader.<DownloadMapClentDataWriteFile>d__11`: `'{0}map/map_type_{1}_client.dat'`, `..._tile.dat`, ETag + `If-None-Match`, cache `MapCacheStore`. URL grant: `MetaSyncManager.RequestMapDatUrls(mapId)` (`AssetGrantRequest`, kind `'map_dat'`, 3 s timeout, 240 s cache). Base `StaticFuncPath.S3URL_MAP_METADATA` = `https://t42-slime-dev.s3.ap-northeast-2.amazonaws.com` + `/metadata` + `/{Dev,Stage,Prod,Public}/`. Format: MessagePack `SMEditor.Data.ClientMapData{width,height,floors:int?[],cameraMoveRect,verticalFogData,bgm,landType:int?[],cloudProjectorData,mapBackgroundType,mapLightType,positionMarkerDatas}`. Unsigned GET returns **403** (bucket root, `/Prod/metadata/map/map_type_1_client.dat`, `/Public/...`). |
| Map visuals | Local Addressables `map_*`, `mapres_*` bundles | `AddressMapLoader.MakeMap`, `FreezeMapAddressMixedLoader.Make`, `CombineMapLoaderData`, `BakeSceneMapLoaderData`. |
| Player account, slimes owned, levels, stats, inventory, quests progress | Server (`SMLoginData`, `SMMonsterData`, `QuestDetailData`) | No local save file; see section 10. |
| Render rules, UI colours, element colours, emotion, customize, map tile classification, map sounds, Wwise refs | **Local `data.bundle`** (232 ScriptableObjects, dumped to `code/data/`) | `CommonDataSet`, `CustomizeDataSet`, `EmotionDataSet`, `MapCombineDataSet`, `MapSoundDataSet`, `SlimeRenderingDataSet`, `CommonWwiseEventData`, `EventSceneDataSet`, `PreloadAssetDataSet`, `DialogueCameraSettings`, `DeathScreenEffectSettings`, `ProfanityFilterSettings`, and 218 `SL_<Species>_<Elements>` per-slime model/equipment rules (120 species). |
| UI strings, 17 languages incl. vi | Local `localization-string-tables-*` bundles | `code/loc_en.json`, `code/loc_vi.json`. |
| `resources.assets` TextAssets | Only `build_info` (XML, target server per platform), `BillingMode`, line-break tables, perf test | No game tables. `StreamingAssets` has only Addressables, the login MP4, `google-services-desktop.json`. |

Server endpoints (string literals): `https://worldofslime.game/{0}/channels`, `https://dir.worldofsli.me/{0}/channels`
(channel directory, `{0}` = build type), S3 `https://t42-slime-dev.s3.ap-northeast-2.amazonaws.com`
(`/AddressablePatches/`, `/metadata`). Socket host/port come from `ConnectIPData{ip, port, serverId, regionData}`.
Auth: Steam, Google, Apple, Firebase. Local `%USERPROFILE%\AppData\LocalLow` has no World of Slime folder:
the demo was never run on this machine, so no `meta_*` cache exists to harvest.

**Way to get real numbers** (owner decision, not done): run the demo once, log in, play; the meta JSON is then
cached under the device patch directory (`StaticFuncPath.GetDevicePatchDirectory`, find it with
`--fields SM.Common.Common.StaticFuncPath` and decompiling `GetDevicePatchDirectory`). Even then only the meta
rows arrive: stats per level, damage, odds stay on the server. Packet captures would show `DamageData` per hit.

## 2. Battle: real-time, server-authoritative

- Real-time action on the field, no turn system. The player's active slime (`SMLoginData.equippedMonsterId`)
  fights; owned slimes are in `holdingMonsters`, switched by `SelectMonsterInBagRequest{pocketIndex}`
  (keys 1-6, `EquipMonster1..6`). `CommonDataSet.EnableSwitchingLoyaltyRatio = 0.2`.
- Modes `Enums.MonsterBattleType`: `TARGET_ATTACK=0`, `AUTO_ATTACK=1` (`SwitchMonsterBattleTypeRequest`,
  key H `CombatMode`).
- Client sends intents only: `TargetAttackRequest{gameIndex}`, `MoveToAttackRequest{gameIndex}`,
  `CastAttackRequest{CastParamData}`, `SkillUsePressRequest{skillTypeId}` then
  `SkillUseReleaseRequest{SkillRequestData{skillTypeId, CastParamData{targetGameIndex,targetX,targetZ,targetDegree,degreeRadius}, skillRequestId}}`
  (press = show indicator, release = cast), `DashRequest{dashState}`, `SearchTargetRequest`.
- Server replies: `DamageData{gameIndex, damage, damageType, element}` (`Enums.DamageType NORMAL/CRITICAL/GUARD`),
  `AttackedData{attackGameIndex, attackTypeId, attackedGameIndex}`, `SkillUseData`, `BuffInstanceData`,
  `ExpGainData`, `MonsterLevelUpData{statDeltaMap}`, `UpdateStatData`, `SkillCooltimeData`. Time sync
  `ClientFrame{realtimeFrame}` / `ServerFrame{frame}`.
- **No damage formula and no element matchup table in the client.** `--find 'Damage|Effective|Weakness|Advantage|Multiplier|Formula|Affinity'`
  finds only UI/camera helpers. `ElementGameData` holds only colours. What exists is the stat vocabulary:
  `Enums.SMUserStat` (MAX_HP, MAX_MP, PHYSICAL/MAGICAL_ATTACK, _DEFENSE, _PENETRATION, ATTACK_SPEED,
  HIT_STAT, AVOID_STAT, ATTACK_RANGE, MOVE_SPEED, COOLTIME_REDUCE, INT/CON/STR/AGI/DEX/VIT, MAX_STAMINA,
  LOYALTY/CUBE/MIX boosts, ...), `Enums.SMAttackApplytype` (PHYSICAL, MAGICAL, PENETRATE, CUT, ROCK, SHOCK),
  passive `Mitigation{applyType, rate}`, `StatAbsolute{stat, offsetValue}`, `StatRatio{stat, offsetRatio, baseStatOnly}`.
  A web version has to invent the formula and chart; say so on the page.
- Elements (`Enums.MonsterElement`, ids 20001-20013): FIRE, WATER, GROUND, WIND, GRASS, STEEL ("Metal" in UI),
  ELECTRIC, ICE, MAGIC, POWER, LIGHT, DARK, POISON. Tribes `MonsterTribe`: DRAGON, LIQUID, GHOST, BIRD, STONE,
  BEAST, INSECT, FISH, PLANT, DEVIL, REPTILE. A monster has a list of elements (1-2, see `SL_*` names).
- Per-species timing lives in meta `SMMonsterType`: `defaultAttackPreDelayMillis/PostDelayMillis`,
  `rangedSkill*`, `meleeSkill*`, pivots, `motionSpeed`, `floatingHeight`, `sizeType`, `defaultAttackMaxRange`,
  `defaultAttackCastType` (server data, not local).
- HUD/indicators: `SM.Scene.Play.UnitObject.SkillRangeIndicator.*` (`AimDegreeSkillIndicator`,
  `PositionSkillIndicator`, `SMArcRegion`, `SMCircleRegion`, `SMLineRegion`, `SMScatterLineRegion`), cast guides
  `SectorCastGuide{angleDegree, innerRadius}`, `ArrowCastGuide`, `MultiArrowCastGuide`.

## 3. Skills

Meta `SkillType{id, nameTextId, descriptionTextId, thumbnailResource}`; `SMActiveSkillType` adds
`coolTimeMillis, consumeMP, consumeStamina, actionTypeIds, castType, motionCategory, holdingOption, element,
descriptionParams, friendlySkill`; `PassiveSkillType{passiveBuffTypeId}`. Cast kinds `Enums.CastType`: Base,
Field, Immediate, Object, Position, AimDegree, Internal, MonsterInventory, MonsterInventorySkill. Per-slime
`SMMonsterData.skillTypeIds`, `learnableSkillTypeIds`, `skillAutoUsable`; requests `LearnMonsterSkillRequest`,
`ExceptMonsterSkillRequest`, `UpdateSkillAutoUsableRequest`. Four skill slots on PC: LShift, Q, E, R
(`Slot1..4`). Buffs `BuffType{visualEffectType, isHidden, isDebuff, stackType}` (`BuffStackType AGGREGATE/ISOLATE`).
Perk tree `SMPerkType{perkCategory, colIndex, rowIndex, maxLevel, passiveEffectTypes, superPerkIds, obtainConditions}`.

## 4. Capture / recruit

Throw a cube item: `CastTargetMonstersRequest{itemId}` (item with `ItemOptionCube`; `CastTypePosition.cubeGuide`).
Server answers `CatchResultData{monsterGameIndexList, cubeGameIndex, result, showEffect}` with
`Enums.CubeWobbleResult FAIL=-1, CAUGHT=0, ONE_WOBBLE=1, TWO_WOBBLES=2, THREE_WOBBLES=3`. Odds are server-side
(`SMUserStat.CUBE_BOOST` hints a modifier). Caught slime arrives as `SMMonsterData` (`acquisition`
`Enums.MonsterAcquisition`: STARTER, FIELD, MIX, FISHING, SHOP, TRADE, QUEST_REWARD, ...; `isTamable`, `loyalty/maxLoyalty`,
`hunger`, `stamina`). Starter choice UI: `SM.Scene.Play.UI.View.SelectInitialSlimeUI.*`. Dex `MonsterDexDegree`
None/Discover/Catch/Master.

## 5. Synthesis (mix, the "synt" maps)

Flow: NPC `MixNPCIdentity` opens `IAMixDialogData{mixObjectTypeId, archivedMonsterMap, maxSlotCount,
successSceneName, failSceneName}` -> UI `SM.Scene.Play.UI.View.MixingUI.MixingUI` ("Synthesis Lab") ->
`MixAvailableSubMonsterRequest`, `MixAvailableMaterialRequest`, `MixMonsterCostRequest` ->
`MixCostData{probability, cost, mixStatus, hintTextId}` (`MonsterMixStatus` NONE, PERFECT, IMPOSSIBLE_MIX,
LEVEL_NOT_ENOUGH, NEED_MATERIAL, LOW) -> `MixMonsterStartRequest{MixRequestData{monsterId, subMonsterId,
materialItemTypeId}}` -> `MixResultData{resultType (MixResultType Success=1/Fail=2/Error=3), resultMonster}`.
Cutscene `cutscene_merge` bundle, `SM.MergeLeverControlObject_Sucsses/_Failed`, `CutSceneMergeSuccessResult`.
Materials `Enums.SMMaterial` (LEATHER, LEAF, SCALE, WING, FEATHER, THORN, HORN, FUR, TENTACLE, CRYSTAL, MIST,
MEMBRANE, RING, SOLIDPIECE, VENT, BLADE, DEVILWING, BEAD, EXOSKELETON, RUNE) drive both mix ingredients
(`MonsterMixIngredientSubOptionMonsterMaterial`) and slime equipment (`SMMonsterData.itemEquipmentMap`,
`SL_*` `EquipmentRuleList`). Recipe/result tables and odds: server only.

## 6. Items, shop, market

`ItemType{id:long, itemCategory, nameTextId, modelResource, thumbnailResource, rare, properties:
Dictionary<SMItemProperty,int>, options:List<ItemOption>}`. Option kinds `Enums.ItemOption`: CraftIngredient,
Equipable, MonsterEquipable, MonsterMixIngredient, Ownable, Quest, Sellable, Transformable, Usable, Cube,
MonsterMaterial, Ride, MonsterFood, Openable, Monster, ConditionalDrop. Inventory `InventoryCategory` BAG/EQUIP/STORAGE,
quick slots `SMLoginData.MaxQuickSlotCount = 3`. Shops `ShopBuyItemRequest/ShopSellItemRequest`, cash shop,
player monster market (`MonsterMarket*Request`, `MonsterMarketUI`).

## 7. Quests, dialogue, cutscenes

Quests: meta `Quest{questGroup, nameTextId, goals:List<QuestGoal{goalTextId, iconResource, goalNavigation}>,
visibleVars, locationMapId, objectTypeId, hidden, showStartUI, finishNavigation, questGroupId}`; progress
`QuestDetailData{questId, status, vars, goals}`. Dialogue is server-scripted "IA" (interaction) packets:
`IADialogData{messages, pending, gameIndex}`, `IAChooseData{options:List<ChooseOptionData{text, optionId,
iconType}>}`, `IAShopData`, `IAStartCutSceneData{cutSceneTypeId}`, `IACameraMoveData`, `IAMoveMapData`, with
client feedback `IADialogFeedbackRequest`, `IAChooseFeedbackRequest`, `IATerminateRequest`. Dialogue text is
not in the client. Cutscenes: Timeline assets (`SM.Timeline*`, `video_prologue`, `cutscene_merge` bundles,
`EventSceneDataSet`). UI: `SM.Scene.Play.UI.View.DialogueUI.*`.

## 8. Player movement and camera

- Movement is server-simulated. `MainJoystick.FixedUpdate` reads the stick (or `SMActions.Gameplay.Move`,
  WASD), builds `forward*vertical + right*horizontal`, `speedStep = round(|v| * 10)` (0..10), and
  `handleAngle` from `Joystick.HandleDegree` with constants 180 and 11.25 (so 32 directions of 11.25 deg;
  exact add/sub order not traced, re-run `il2cpp_method.py MainJoystick.FixedUpdate`). It sends
  `MoveRequest{handleAngle, speedStep}` only when either changes. Click-to-move: `MoveToRequest{x, z, speedStep}`.
  Server broadcasts `MoveData{playerIndex, baseX, baseZ, moveX, moveZ, moveFlag}` (ints); `MoveBehaviour`
  interpolates with `CalibrationEpsilonSqr = 1e-6`. Dash `DashRequest` (LShift). Ride `UserRidingBehaviour`.
- Height from map data: `MapController.GetHeight(Vector3)`, `GetFloorHeight`, `GetLandType`,
  `PositionToMapIndex(ClientMapData, pos)` (grid `width x height`, `floors[]`, `landType[]`).
- Camera: `SM.Scene.Play.Util.FollowCamera` (offset, deadZone, minSpeed/maxSpeed, distanceForMaxSpeed,
  map limits from `ClientMapData.cameraMoveRect`), `SM.Scene.Play.Controller.CameraController` (zoom presets
  `cameraPresets`, `wheelZoomStep`, `WheelNotchValue = 120`, `pinchZoomSensitivity`, pad zoom,
  `standaloneDefaultZoomBlend`). Field values are on prefabs/scenes, not in code: read them from the play
  scene/UI bundles with UnityPy.

## 9. Input: PC vs mobile

- One code base for Android/iOS/Windows/OSX (`Enums.Platform`, `Enums.DeviceType PC=3`). Branches are often
  folded at build time: `PlaySceneButtonBatch.IsStandalone()` compiles to `return true` in this PC build.
- PC: Unity Input System asset `SMActions` (control schemes Keyboard&Mouse, Gamepad), full map in
  `code/input_bindings.txt`. Gameplay: WASD move, Space interact/attack (`KeyboardInteractAttack`), C switch,
  LShift dash and Slot1, Q/E/R Slot2-4, 1-6 equip slime 1-6, H combat mode, Tab minimap, M world map,
  I inventory, B slimepedia, N slime inventory, J quest, P party, K perk, O community, Enter chat, LCtrl skip
  dialogue, Esc. Mouse aim: `MouseAimInputSource` + `CursorTargetResolver`; right click `RightMouseClick`;
  wheel zoom. Gamepad: `GamepadAimInputSource`, virtual mouse (`UnifiedCursorController`, `VirtualMouseSlowArea`).
  Rebinding saved in PlayerPrefs `KeyBindingOverrides`. Device switching: `InputModeController`
  (`CurrentInputDeviceType`, `OnInputDeviceChanged`).
- Mobile/touch: on-screen `MainJoystick` (JoystickPack `Joystick`) for movement, `DefaultAttackButton`
  (`CalculatePivot`), skill buttons with drag-aim `JoystickAimInputSource` (dead zone, `SkillIndicatorBase.SetJoystick`),
  `ItemQuickSlotPod.UpdateTouchAim`, pinch zoom `CameraController.CollectPinchTouchPositions`,
  tap-to-interact `TouchInteractor` (capsule per monster), `SystemTouchEffect`, `HandheldVirtualKeyboardManager`,
  `GpuTierClassifier.Mobile`. The same `MainJoystick.FixedUpdate` path sends movement on both platforms.

## 10. Save data

Online account on the server: `SMLoginData` (holding monsters, equipped monster, recipes `learnedRecipeIds`,
dex, friends, quest bookmarks, quick slots), `RPGUserData{level, accExp, currentMapId, x, z, itemEquipments,
customizeData}`, `LoginData{money, cash}`. Local only: PlayerPrefs `Enums.PlayerPrefsKey` (graphics, volumes,
locale, LoginToken, QuestBookmarks, TutorialCompleted, SlimeIndexBadge, SkillLearnableSlime, QuickSlot,
KeyBindingOverrides) and the meta/map caches. A web version needs its own localStorage/Supabase save.

## 11. Audio (Wwise)

Event names are mostly data: meta fields `idleSoundResource`, `hitSoundResource`, `dieSoundResource`,
`appearSoundResource` (`MonsterType`), `skillSoundResource`, `AttackType.appearSound/loopSound/disappearSound/attackedSound`,
`DistrictType.bgmResource`, `ClientMapData.bgm`. Local refs: `CommonWwiseEventData` (`AttackSoundEvent`,
`ReturnSoundEvent` as Wwise object refs), `MapSoundDataSet`, `SMEditor.Data.ScriptableObject.MapSoundObject`.
Code enums: `Enums.Wwise_RTPC` (Master_Volume, BGM_Volume, SFX_Volume, TotalMinutes),
`Enums.Wwise_Footstep_Event` (quad, default, giant, flutter, hop, sticky, slime, biped, flap, hover, slither,
sticky_L), `Enums.Wwise_Prop_Event` (Bush, SnowBush), riding start/stop in `UserMoveBehaviour` statics. Manager:
`SM.Common.Wwise.WwiseManager`. Banks in the `wwisedata_windows` bundles; names map via bank HIRC + Wwise
object refs, not code.

## 12. Localization

Unity Localization: collections `UI` (471 keys, e.g. `MixingPopup.MixingRateText` "Synthesis success rate {Rate}")
and `Context` (303). 17 locales incl. `vi`. Meta text (`TextId`) is server-side (`TextRequest`,
`DataManager.textDataSet`). Essential/boot strings: `SM.Common.DataSet.EssentialLocalizeData`.

## Open gaps

1. Real stats, damage formula, element chart, capture odds, mix recipes/odds, quest and dialogue text: not in
   the install. Only the server has them. Options: run the demo logged in to cache meta JSON (rows only), or
   invent rules for the web and label them.
2. Map collision/height `.dat` files are behind signed S3 URLs (403 unsigned). Rebuild walkable areas from
   `map_*` bundle meshes/colliders and `MapCombineDataSet` instead.
3. Camera/zoom/joystick numbers sit on prefabs in bundles: not read yet.
4. Wwise event-name to .wem mapping: not done (bank parsing).
