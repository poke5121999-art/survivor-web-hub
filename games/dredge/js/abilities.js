/*
 * Năng lực (abilities) của Biển Mù, chép từ bản gốc:
 *   PlayerAbilityManager / Ability / AbilityBarUI / AbilityIcon / AbilityRadial / AbilityRadialWedge (D:\dredge-ref\src),
 *   số liệu: DR_WORLD.AbilityData (14 bản ghi), DR_BOAT.physics.abilities (component trong PlayerContainer.prefab),
 *   DR_BOAT.physics.abilityAudio (tên clip), DR_BOAT.abilityUI (Game.unity: thanh năng lực, vòng chọn, ống nhòm; tools/boat.py).
 *
 * Điều khiển như bản PC (DredgeControlBindings.cs:288-290, 333-335):
 *   giữ E (tay cầm: LB) = mở vòng chọn: Time.timeScale 0,3 (DR.timeScale, main.js nhân vào dt), 11 nêm đều (BuildInfo.photoMode),
 *     góc chuột so với tâm màn hình chọn nêm (vùng chết = nửa CooldownFill 300 · tỉ lệ canvas), rê qua nêm đã mở là chọn luôn;
 *     thả E hoặc bấm chuột trái thì đóng.
 *   chuột phải (tay cầm: X) = dùng năng lực đang chọn: bấm (thường), giữ đủ castTime (Teo tàn/Hiện thân 1 s),
 *     giữ để duy trì (isContinuous: Còi sương, Tăng tốc). Hồi chiêu tính theo NGÀY game (Time.TimeAndDay − abilityHistory).
 *   Đèn chuyển sang năng lực Lights (phím L của bản gốc là Bách khoa, không còn bật đèn).
 * Sự kiện phát ra (DR.emit):
 *   'abilityToggled' {id, active}  — GameEvents.TogglePlayerAbility (bật/tắt một năng lực)
 *   'abilitySelected' id           — GameEvents.SelectPlayerAbility (đổi năng lực hiện hành)
 *   'ability' id                   — mở khoá (cùng hợp đồng với lệnh Yarn UnlockAbility trong js/yarn.js)
 * Móc cho chỗ khác: DRAbilities.selected(), .isActive(id), .radialOpen, .spyglassActive, .hasteHeat(), .debug()
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR, B = root.DR_BOAT, CFG = root.DR_CONFIG, UI = B.abilityUI;
  const PA = B.physics.abilities, AA = B.physics.abilityAudio || {}, CAM = B.physics.camera;
  const URLB = f => new URL(f, document.baseURI).href;
  const SPR = n => URLB('art/ui/sprites/' + n + '.webp');

  // ------------------------------------------------------------------------------------------------ dữ liệu
  // DR_WORLD.AbilityData có bản trùng tên "#AbilityData" (hai bundle); lấy bản không hậu tố
  const DATA = {};
  for (const [k, v] of Object.entries(root.DR_WORLD.AbilityData)) {
    const id = k.split('#')[0];
    if (!DATA[id] || !k.includes('#')) DATA[id] = Object.assign({ id }, v);
  }
  const N = UI.numAbilities;                                     // 11: BuildInfo.photoMode = 1 (AbilityRadial.Awake)
  const WEDGES = UI.radial.wedges.slice(0, N);                   // thứ tự AbilityRadial.abilityWedges (bundle Game.unity)
  const WEDGE_W = 360 / N, HALF_W = WEDGE_W / 2;
  const TIME_SCALE = 0.3;                                        // AbilityRadial.ShowRadial: Time.timeScale = 0.3f
  const OPEN_TWEEN = 0.35;                                       // ShowRadial: DOScale 0 → 1, 0,35 s, Ease.OutExpo, không theo timeScale
  const RECTS = UI.rects;
  const hex2 = h => [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255, 1];
  const COL = CFG.colors;                                        // GameConfigData.Colors; WARNING = 5, NEGATIVE = 3 (SettingsSaveDataTemplate)
  const WARNING = COL[5], NEGATIVE = COL[3], ALERT = hex2(COL[2]);   // DredgeColorTypeEnum: POSITIVE 2, NEGATIVE 3, WARNING 5
  // ControlPromptIcon của AbilityControlPrompt (Game.unity): enabledColor, holdFillEnabledColor, disabledColor 0,566
  const CPI = RECTS['ActiveAbility/Container/CurrentContainer/AbilityControlPrompt'].fields.ControlPromptIcon;

  // Tên tiếng Việt (dịch từ chuỗi gốc ability.<id>.name / .description, giữ chuỗi gốc ở thuộc tính data-orig)
  const VI = {
    lights: ['Đèn', 'Thắp sáng màn đêm. Đèn càng mạnh càng bớt hoảng loạn.'],
    'lights-advanced': ['Đèn cải tiến', 'Đèn mạnh hơn làm dịu hoảng loạn. Chiếu xa hơn.'],
    foghorn: ['Còi sương', 'Một tiếng còi lớn. Cho mọi thứ biết bạn đang ở đây.'],
    'foghorn-advanced': ['Còi sương cải tiến', 'Cho mọi thứ biết bạn đang ở đây. Xung còi soi sáng xung quanh.'],
    spyglass: ['Ống nhòm', 'Nhìn gần hơn. Nhận ra điểm câu từ xa.'],
    'spyglass-advanced': ['Ống nhòm cải tiến', 'Nhận ra điểm câu từ xa và đánh dấu lên bản đồ.'],
    pot: ['Bẫy cua', 'Thả một bẫy cua, bẫy tự bắt cua theo thời gian.'],
    trawl: ['Lưới kéo', 'Thả hoặc kéo lưới lên. Chạy thuyền để bắt cá.'],
    bait: ['Mồi', 'Ném mồi xuống biển. Ai biết thứ gì sẽ ngoi lên?'],
    haste: ['Tăng tốc', 'Truyền cho máy tốc độ từ cõi khác. Coi chừng quá nhiệt.'],
    atrophy: ['Teo tàn', 'Gặt xác mọi con cá trong tầm mắt. Tầm xa.'],
    banish: ['Xua đuổi', 'Lời xua đuổi đẩy lui hầu hết tà ác — trong một lúc.'],
    manifest: ['Hiện thân', 'Dịch chuyển về nơi mọi chuyện bắt đầu.'],
    camera: ['Máy ảnh', 'Dành chút thời gian để chỉnh lại mình.']
  };
  const VI_UNKNOWN = ['???', 'Chưa mở khoá'];                     // ability.radial.unknown-name / unknown-description
  const VI_COOLDOWN = 'ĐANG HỒI';                                 // ability.radial.on-cooldown (style 16 = in hoa)
  const VI_MISSING = 'THIẾU ĐỒ';                                  // ability.radial.missing-item
  const TYPE_VI = { COASTAL: 'VEN BỜ', SHALLOW: 'NÔNG', OCEANIC: 'NGOÀI KHƠI', ABYSSAL: 'VỰC SÂU', HADAL: 'HẺM SÂU', VOLCANIC: 'NÚI LỬA', MANGROVE: 'NGẬP MẶN', DREDGE: 'NẠO VÉT', CRAB: 'CUA', ICE: 'BĂNG' };

  const S = () => D.s;
  const G = () => root.DRGrid;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const outExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  const outQuad = t => 1 - (1 - t) * (1 - t);                    // DOTween defaultEaseType 6 (Resources/DOTweenSettings.asset)
  const roundEven = v => { const r = Math.round(v); return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r; }; // Mathf.RoundToInt
  // Tiếng: chỉ phát tên đã tra được trong DR_AUDIO (khoá ngữ nghĩa hoặc tên clip gốc); tên chưa có ghi vào MISSING
  // một lần (luồng tiếng sẽ ship), không gọi DRAudio mỗi khung để khỏi cảnh báo lặp
  const MISSING = new Set();
  const has = k => { if (!k || !root.DRAudio) return false; if (DRAudio.resolve(k)) return true; if (!MISSING.has(k)) { MISSING.add(k); console.warn('[abilities] sound not shipped:', k); } return false; };
  const sfx = (k, v, r) => { try { if (has(k)) DRAudio.play(k, v, r); } catch (e) { /* tiếng không bắt buộc */ } };
  const loopSfx = (k, v, r) => { try { if (has(k)) DRAudio.loop(k, v, r); } catch (e) { /* tiếng không bắt buộc */ } };
  const stopSfx = k => { try { if (has(k)) DRAudio.stopLoop(k); } catch (e) { /* tiếng không bắt buộc */ } };

  // AnimationCurve Hermite (khoá {time, value, inSlope, outSlope}); ngoài đầu/cuối giữ giá trị biên
  function curve(c, t) {
    const k = c.m_Curve;
    if (t <= k[0].time) return k[0].value;
    const l = k[k.length - 1];
    if (t >= l.time) return l.value;
    for (let i = 1; i < k.length; i++) {
      const a = k[i - 1], b = k[i];
      if (t > b.time) continue;
      const d = b.time - a.time, u = (t - a.time) / d, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * a.value + (u3 - 2 * u2 + u) * a.outSlope * d + (-2 * u3 + 3 * u2) * b.value + (u3 - u2) * b.inSlope * d;
    }
    return l.value;
  }

  // ------------------------------------------------------------------------------------------------ sổ lưu
  function save() {
    const s = S();
    if (!s) return null;
    s.abilities = s.abilities || {};
    s.abilityHistory = s.abilityHistory || {};                   // SaveData.abilityHistory: id → TimeAndDay lần dùng
    s.abilityToggles = s.abilityToggles || {};                   // SaveData.abilityToggleStates (persistAbilityToggle)
    s.vars = s.vars || {};
    return s;
  }
  const unlocked = id => !!(save() && S().abilities[id]);
  const ownsAdvanced = d => !!(d.linkedAdvancedVersion && unlocked(d.linkedAdvancedVersion));
  const shown = d => ownsAdvanced(d) ? DATA[d.linkedAdvancedVersion] : d; // bản cải tiến thay icon/tên/tiếng khi đã có
  const unseen = d => !!S().vars[d.id + '-unseen'];               // SaveData.GetAbilityUnseen: bool "<tên>-unseen"
  function setUnseen(d, v) { S().vars[d.id + '-unseen'] = !!v; }

  // PlayerAbilityManager.GetTimeSinceLastCast: TimeAndDay − abilityHistory (chưa dùng bao giờ = vô cùng)
  function sinceCast(d) {
    const h = save().abilityHistory[d.id];
    return h == null ? Infinity : S().time - h;
  }
  // PlayerAbilityManager.GetHasDependantItems + SaveData.HasItemsOfSubtypeInInventory / HasAnyOfTheseItemsInInventory
  function hasItems(d) {
    const inv = D.grid('INVENTORY'), Gr = G(), items = root.DR_ITEMS;
    if (!inv) return false;
    if (d.linkedItems && d.linkedItems.length) return inv.items.some(i => d.linkedItems.includes(i.id));
    const sub = Gr.mask(d.linkedItemSubtype, Gr.SUB);
    if (!sub) return true;
    return inv.items.some(i => {
      const it = items[i.id];
      if (!it || Gr.subOf(it) !== sub) return false;
      if (!d.allowDamagedItems && it.damageMode === 'OPERATION' && Gr.onDamaged(inv, i)) return false;
      if (!d.allowExhaustedItems && it.damageMode === 'DURABILITY' && !(i.dur > 0)) return false;
      return true;
    });
  }

  // ------------------------------------------------------------------------------------------------ đồng hồ game
  // Unity Time.time (theo timeScale) cho sfxRepeatThreshold, tween và nhiệt Tăng tốc
  let gameT = 0;
  const paused = () => { const p = document.getElementById('dr-pause'); return !!(p && !p.hidden); };
  // lớp hành động BASE của bản gốc: đang lái thuyền, không bến/hội thoại/cửa sổ/màn mở đầu/tự cập bến
  function baseLayer() {
    if (!S() || D.mode !== 'sail' || paused()) return false;
    if (root.DRDialogue && DRDialogue.isOpen && DRDialogue.isOpen()) return false;
    if (root.DRIntro && DRIntro.playing) return false;
    if (root.DRCargo && DRCargo.isOpen && DRCargo.isOpen()) return false;
    if (root.DRHud && DRHud.journalOpen && DRHud.journalOpen()) return false;
    if (root.DRDocks && DRDocks.docking) return false;
    return true;
  }

  // ------------------------------------------------------------------------------------------------ năng lực
  // Ability (Ability.cs): Activate phát castSFX (bản cải tiến nếu có) trừ khi vừa thả trong sfxRepeatThreshold giây,
  // Deactivate phát deactivateSFX; persistAbilityToggle thì lưu trạng thái.
  class Ability {
    constructor(id) { this.id = id; this.d = DATA[id]; this.isActive = false; this.lastRelease = -1e9; }
    get data() { return this.d; }
    activate() { return false; }
    deactivate() { this.baseDeactivate(); }
    baseActivate() {
      if (!this.isActive) return false;
      emitToggle(this, true);
      if (this.d.persistAbilityToggle) save().abilityToggles[this.id] = true;
      if (gameT > this.lastRelease + (this.d.sfxRepeatThreshold || 0)) sfx(shown(this.d).castSFX);
      return true;
    }
    baseDeactivate(silent) {
      this.isActive = false;
      this.lastRelease = gameT;
      emitToggle(this, false);
      if (!silent) sfx(shown(this.d).deactivateSFX);
      if (this.d.persistAbilityToggle) save().abilityToggles[this.id] = false;
    }
    update() {}
  }
  function emitToggle(ab, on) {
    D.emit('abilityToggled', { id: ab.id, active: on }); // GameEvents.TogglePlayerAbility: HUD, tiếng, hiệu ứng nghe ở đây
    if (ab === cur()) bar.dirty = true;
  }

  // LightAbility.cs: bấm để bật/tắt; bật = SetLightStrength(4) + container đèn + nón sáng + vùng chống hoảng loạn
  class Lights extends Ability {
    activate() {
      if (this.isActive) { this.deactivate(); return false; }
      this.isActive = true;
      root.DRBoat.setLights(true);
      return this.baseActivate();
    }
    deactivate() {
      if (this.isActive) root.DRBoat.setLights(false);
      this.baseDeactivate();
    }
  }

  // FoghornAbility.cs: giữ để kêu. Bắt đầu: cao độ pitchValues[foghorn-style-index] → −pitchChange, âm lượng
  // volumeStart → volumeEnd trong fadeInSec; thả: dừng vòng lặp, phát foghornEndClip ở cao độ cuối.
  // Có "foghorn-advanced": xung sonar cỡ mainSonarSize trong mainSonarLifetimeSec + xung nhỏ ở mỗi điểm câu trong tầm,
  // trễ theo khoảng cách / (size / lifetime).
  const FH = PA.FoghornAbility;
  class Foghorn extends Ability {
    constructor(id) { super(id); this.t = 0; this.lastSonar = -1e9; this.pitchStart = 1; this.pitchEnd = 1; }
    activate() {
      this.isActive = true;
      const idx = (S().vars['foghorn-style-index'] | 0) % FH.pitchValues.length;
      this.pitchStart = FH.pitchValues[idx]; this.pitchEnd = this.pitchStart - FH.pitchChange;
      this.t = 0;
      this.apply();
      if (ownsAdvanced(this.d) && gameT > this.lastSonar + FH.delayBetweenAdvancedFoghornCast + FH.mainSonarLifetimeSec) {
        this.lastSonar = gameT;
        sonar();
      }
      this.baseActivate();
      return true;
    }
    apply() {
      const k = outQuad(clamp01(this.t / FH.fadeInSec));       // DOPitch / DOFade, ease mặc định OutQuad
      this.vol = lerp(FH.volumeStart, FH.volumeEnd, k); this.rate = lerp(this.pitchStart, this.pitchEnd, k);
      // [ĐỀ XUẤT] DRAudio.loop làm mượt âm lượng τ 0,25 s nên tween 0,08 s gốc nghe dài hơn một chút
      loopSfx('boat.horn.loop', this.vol, this.rate);
    }
    update(dt) { if (this.isActive) { this.t += dt; this.apply(); } }
    deactivate() {
      if (this.isActive) {
        stopSfx('boat.horn.loop');
        // foghornEndSource.pitch = pitchEnd; PlayOneShot(foghornEndClip): nguồn foghorn-end âm lượng 0,5 (prefab)
        const end = (AA.FoghornAbility && AA.FoghornAbility.sources || []).find(s => s.clip === 'foghorn-end');
        sfx('boat.horn.end', end ? end.volume : 0.5, this.pitchEnd);
        this.ended = (this.ended || 0) + 1;
      }
      this.baseDeactivate();
    }
  }
  function sonar() {
    const b = S().boat, y = root.DRBoat.root ? DRBoat.root.position.y : 0;
    const spd = FH.mainSonarSize / FH.mainSonarLifetimeSec;
    pulse([b.x, y, b.z], false, 0);
    for (const sp of (root.DRSpots && DRSpots.list) || []) {
      const d = Math.hypot(sp.x - b.x, sp.z - b.z);
      if (d <= FH.mainSonarSize) pulse([sp.x, y, sp.z], true, d / spd);
    }
  }
  function pulse(pos, mini, delay) {
    setTimeout(() => {
      // FoghornAbility.DoSonarAtPosition: main.startSize / startLifetime đặt lại rồi Emit(1)
      if (root.DRParticles) DRParticles.spawn('SonarPulseEffect', { pos, size: mini ? FH.miniSonarSize : FH.mainSonarSize, lifetime: mini ? FH.miniSonarLifetimeSec : FH.mainSonarLifetimeSec });
      sfx(mini ? 'Advanced Foghorn Ping' : 'Advanced Foghorn Ability', mini ? 0.7 : 1);
    }, delay * 1000);
  }

  // SpyglassAbility.cs + SpyglassUI.cs: bấm để vào/ra camera nhìn thẳng (SpyglassVCam FOV 15, POV quanh 3 m trên thuyền);
  // tia nhìn tìm điểm câu trong maxRange 200 m, lệch < maxAngle 5°, không bị đất che; bảng tin bám điểm ấy.
  const SG = PA.SpyglassAbility, SC = B.physics.spyglassCam;
  class Spyglass extends Ability {
    constructor(id) { super(id); this.h = 0; this.v = 0; this.focus = null; this.blend = 0; this.dir = 0; }
    activate() {
      if (this.isActive) { this.deactivate(); return false; }
      this.isActive = true;
      // POV: dọc = 0,5; ngang = trục X của Player VCam (camera.js giữ Cm.x theo chiều three.js)
      this.v = 0.5; this.h = root.DRCamera ? DRCamera.x : 0;
      this.dir = 1; this.blend = 0;
      if (root.DRCamera) DRCamera.override = camOverride;
      lockPointer(true);
      return this.baseActivate();
    }
    deactivate() {
      if (this.isActive) {
        if (root.DRCamera) DRCamera.x = ((this.h + 180) % 360 + 360) % 360 - 180;
        this.dir = -1; this.blend = 0;
        lockPointer(false);
        this.setFocus(null);
      }
      this.baseDeactivate();
    }
    look(dx, dy) {
      // POV InputValueGain: giá trị += input · maxSpeed; input chuột = pixel · 0,05 (InControl), maxSpeed = base · setting 0,5
      const sx = SC.sensitivity.baseSensitivityX * 0.5, sy = SC.sensitivity.baseSensitivityY * 0.5;
      const P = SC.CinemachinePOV;
      this.h -= dx * 0.05 * sx;                                   // phải ⇒ quay phải (three.js: góc giảm)
      this.v = Math.max(P.m_VerticalAxis.m_MinValue, Math.min(P.m_VerticalAxis.m_MaxValue, this.v + dy * 0.05 * sy)); // m_InvertInput 1
    }
    update() {
      if (!this.isActive) return;
      this.setFocus(scanSpots(this));
    }
    setFocus(sp) {
      if (sp === this.focus) return;
      this.focus = sp;
      spy.dirty = true;
    }
  }

  // BoostAbility.cs: giữ để tăng tốc. Lực tiến × boostAmount(giữ)·1,3; nhiệt += dt·hasteHeatGain·burnAmount(giữ)·1,3/HEAT_SINK,
  // không giữ thì −hasteHeatLoss/s; nhiệt ≥ hasteHeatCap ⇒ nổ: tiếng, rung, hỏng một ô máy, nghỉ hasteHeatCooldown giây.
  // Khói ống khói = lerp(0, chimneySmokeEmissionMax, đốt²) (DRVfx.smokeBoost = đốt² ∈ 0..1); FOV 40 → 50 trong 1 s.
  const HS = PA.BoostAbility;
  class Haste extends Ability {
    constructor(id) {
      super(id); this.hold = 0; this.raw = 0; this.prop = 0; this.cooldown = 0; this.onCd = false; this.heatSink = 1;
      this.crackle = 0; this.fov = 0; this.fov0 = 0; this.fovT = 1; this.fovTo = 0; this.explosions = 0;
    }
    activate() {
      this.isActive = true;
      this.hold = 0;
      this.heatSink = (root.DRBoat.stats && DRBoat.stats.heatSink) || 1;
      loopSfx('boat.haste.loop', mainVol(), 1);                    // MainSFX "Haste - Loop"
      this.baseActivate();
      if (HS.useHasteVFX) impulse(1.5);                           // KickoffImpulse m_AmplitudeGain 1,5
      this.tweenFov(1);
      return true;
    }
    deactivate() {
      root.DRBoat.abilitySpeed = 1;
      stopSfx('boat.haste.loop');
      if (this.isActive) this.tweenFov(0);
      this.baseDeactivate();
    }
    tweenFov(to) { this.fov0 = this.fov; this.fovTo = to; this.fovT = 0; } // PlayerCamera.OnPlayerAbilityToggled: DOTween.To(tweenProp, …, hasteCamLerpDuration)
    update(dt) {
      this.hold += dt;
      if (this.onCd) {
        this.cooldown -= dt;
        if (this.cooldown <= 0) { this.onCd = false; this.raw = 0; }
      } else {
        if (this.isActive) {
          const t = clamp01(this.hold);
          const speed = curve(HS.boostAmount, t) * HS.boostMagnitude, burn = curve(HS.burnAmount, t) * HS.boostMagnitude;
          this.raw += dt * (CFG.hasteHeatGain * (burn / this.heatSink));
          root.DRBoat.abilitySpeed = speed;
        } else this.raw -= dt * CFG.hasteHeatLoss;
        if (this.raw < 0) this.raw = 0;
        this.prop = this.raw / CFG.hasteHeatCap;
        if (this.prop >= 1) this.explode();
      }
      // khói ống khói: chỉ khi đang giữ; vfx.js đọc DRVfx.smokeBoost
      if (root.DRVfx) DRVfx.smokeBoost = this.isActive ? Math.pow(this.prop, 2) : 0;
      // CrackleSFX "Haste - Overheat Loop": âm lượng = crackleSFXCurve(đốt), Lerp theo dt·volumeBlendSpeed
      if (this.prop > 0 || this.crackle > 0.01) {
        this.crackle = lerp(this.crackle, curve(HS.crackleSFXCurve, this.prop), Math.min(1, dt * HS.volumeBlendSpeed));
        if (!this.isActive && this.crackle <= 0.01) this.crackle = 0;
        loopSfx('Haste - Overheat Loop', this.crackle, 1);
      }
      // FOV: Lerp(defaultFOV, hasteFOV, tweenProp)
      if (this.fovT < 1) {
        this.fovT = Math.min(1, this.fovT + dt / CAM.hasteCamLerpDuration);
        this.fov = lerp(this.fov0, this.fovTo, outQuad(this.fovT));
      }
      if (root.DRCamera) DRCamera.fovAdd = (CAM.hasteFOV - CAM.defaultFOV) * this.fov;
      // PlayerSanity.AbilitySanityValue = sanityValue (−1) khi đang giữ; [ĐỀ XUẤT] cộng riêng ở đây vì sky.js gọi
      // sanityRate(…, ability = 0): rate·GlobalSanityModifier·dt·hệ số thời gian, tách được vì kháng hoảng loạn = 0
      if (this.isActive && S() && root.DRSky && DRSky.env) {
        const tm = DRSky.env.timeMod || 0;
        S().sanity = clamp01(S().sanity + HS.sanityValue * CFG.globalSanityModifier * dt * tm);
      }
    }
    explode() {
      if (HS.useHasteVFX) impulse(2);                              // ExplodeImpulse m_AmplitudeGain 2
      this.cooldown = CFG.hasteHeatCooldown; this.onCd = true; this.explosions++;
      const clips = (AA.BoostAbility && AA.BoostAbility.fields.explosionClips) || [];
      sfx(clips.length > 1 ? clips[Math.floor(Math.random() * clips.length)] : 'boat.haste.explosion');
      heat.explode = performance.now();
      const G2 = G();
      root.DRBoat.damageEquipment(G2.SUB.ENGINE);                  // GridManager.AddDamageToInventory(EQUIPMENT, ENGINE)
    }
  }
  const mainVol = () => { const s = AA.BoostAbility && AA.BoostAbility.sources.find(x => x.node === 'MainSFX'); return s ? s.volume : 1; };
  // CinemachineImpulseSource: [ĐỀ XUẤT] biên độ × 0,1 · cameraShakeScaleFactor vào DRBoat.shake (camera.js rung theo nó)
  function impulse(gain) { if (root.DRBoat) DRBoat.shake = Math.max(DRBoat.shake, gain * 0.1 * (CFG.cameraShakeScaleFactor || 1)); }

  // Năng lực chưa làm trên bản web (lưới kéo, bẫy cua, mồi, máy ảnh, xua đuổi, teo tàn, hiện thân): chọn được, dùng thì báo
  class Pending extends Ability {
    activate() { if (root.DRHud) DRHud.toast((VI[this.id] || [this.id])[0] + ': chưa có trên bản web'); return false; }
    deactivate() { this.isActive = false; }
  }

  const ABILITIES = {};
  for (const id of Object.keys(DATA)) {
    if (/-advanced$/.test(id)) continue;
    ABILITIES[id] = id === 'lights' ? new Lights(id) : id === 'foghorn' ? new Foghorn(id) : id === 'spyglass' ? new Spyglass(id)
      : id === 'haste' ? new Haste(id) : new Pending(id);
  }
  // PlayerAbilityManager.RegisterAbility: bản cải tiến dùng chung đối tượng với bản thường
  const abilityOf = id => ABILITIES[id] || ABILITIES[String(id).replace(/-advanced$/, '')];
  // Cho module khác (lưới kéo GR-06, bẫy cua GR-07, mồi GR-13…) cắm năng lực vào chỗ "Pending":
  //   DRAbilities.register('trawl', class extends DRAbilities.Ability { activate() { …; this.isActive = true; return this.baseActivate(); } })
  //   hoặc register('trawl', { activate() {…}, deactivate() {…}, update(dt) {…} }) — hàm được gắn lên một Ability mới.
  // activate() trả true khi dùng được (ghi abilityHistory, tính hồi chiêu); baseActivate/baseDeactivate lo tiếng + sự kiện.
  function register(id, impl) {
    if (!DATA[id]) throw new Error('ability data not found: ' + id);
    const old = ABILITIES[id];
    if (old && old.isActive) old.deactivate();
    const ab = typeof impl === 'function' ? new impl(id) : Object.assign(new Ability(id), impl);
    if (!(ab instanceof Ability)) throw new Error('ability implementation does not extend DRAbilities.Ability: ' + id);
    ABILITIES[id] = ab;
    bar.dirty = radial.dirty = true;
    return ab;
  }

  // ------------------------------------------------------------------------------------------------ chọn / dùng
  let selId = null;
  const cur = () => selId ? abilityOf(selId) : null;
  function select(id, quiet) {
    const d = DATA[id];
    if (!d) return;
    selId = id;
    save().lastAbility = id;                                      // SaveData.LastSelectedAbility
    act.hold = 0; act.down = act.down && !quiet;
    bar.dirty = true; heat.dirty = true;
    D.emit('abilitySelected', id);                                // GameEvents.SelectPlayerAbility
  }
  // AbilityBarUI.VerifyAbilityCast
  function verify(d) {
    if (sinceCast(d) < d.cooldown) return false;
    if (!hasItems(d)) return false;
    if (radial.open) return false;
    return true;
  }
  // AbilityBarUI.OnCurrentPressComplete: dùng; được thì ghi abilityHistory (hồi chiêu tính từ đây)
  function complete() {
    const ab = cur();
    if (!ab || !verify(ab.d)) return;
    if (ab.activate()) {
      if (ab.d.cooldown > 0) act.blocked = true;                  // GetCurrentAbilityAction().Disable(true) tới khi hết hồi
      save().abilityHistory[ab.d.id] = S().time;
      act.casts++;
    } else if (ab.d.canFailCast) { act.blocked = true; act.hold = 0; }
  }
  // nút năng lực (chuột phải / X / chạm vào ô năng lực): DredgePlayerActionPress, …Hold (castTime), …HoldDelegate (isContinuous)
  const act = { down: false, hold: 0, blocked: false, casts: 0 };
  function abilityDown() {
    if (!baseLayer() || act.down) return;
    act.down = true; bar.dirty = true;
    const ab = cur();
    if (!ab) return;
    if (act.blocked && !(ab.d.cooldown > 0 && sinceCast(ab.d) < ab.d.cooldown)) act.blocked = false;
    if (act.blocked) return;
    if (ab.d.isContinuous) { if (verify(ab.d)) ab.activate(); }  // OnCurrentPressBegin
    else if (!(ab.d.castTime > 0)) complete();                    // bấm là dùng (WasPressed)
  }
  function abilityUp() {
    if (!act.down) return;
    act.down = false; bar.dirty = true;
    const ab = cur();
    if (ab && ab.d.isContinuous && ab.isActive) ab.deactivate(); // OnCurrentPressEnd
  }

  // ------------------------------------------------------------------------------------------------ mở khoá
  // ItemLogicHandler.OnItemAdded: món NET đầu tiên vào khoang người chơi mở "trawl", POT mở "pot" (ItemLogicHandler.cs:85-96)
  function unlock(id, quiet) {
    const d = DATA[id];
    if (!d || unlocked(id)) return false;
    S().abilities[id] = true;
    if (d.showUnseenNotification) setUnseen(d, true);
    D.emit('ability', id);                                        // cùng sự kiện với lệnh Yarn UnlockAbility
    if (!quiet && root.DRHud) DRHud.toast('Mở khoá năng lực: ' + (VI[id] || [id])[0]); // notification.ability-unlocked
    radial.dirty = true; bar.dirty = true;
    return true;
  }
  // Chỉ lưới có GridConfigurationData.itemsInThisBelongToPlayer (khoang thuyền TierNHull, kho Storage) mới mở khoá;
  // lưới của cửa hàng, phần thưởng nhiệm vụ… thì không (SerializableGrid.cs:308 → TriggerItemAddedEvent(belongsToPlayer)).
  // Mồi: bản gốc mở khi món mồi được "thấy" (OnItemSeen); [ĐỀ XUẤT] web chưa có sự kiện "thấy" nên mở khi mồi vào lưới của người chơi.
  function belongsToPlayer(key) {
    const rec = S() && S().grids && S().grids[key], cfg = rec && root.DR_GRIDS && DR_GRIDS[rec.cfg];
    return !!(cfg && cfg.itemsInThisBelongToPlayer);
  }
  function checkItems(list) {
    const Gr = G(), items = root.DR_ITEMS, bait = DATA.bait && DATA.bait.linkedItems || [];
    for (const i of list) {
      const it = items[i.id];
      if (!it) continue;
      const sub = Gr.subOf(it);
      if (sub & Gr.SUB.NET) unlock('trawl');
      if (sub & Gr.SUB.POT) unlock('pot');
      if (bait.includes(i.id)) unlock('bait');
    }
  }

  // ------------------------------------------------------------------------------------------------ DOM chung
  let rootEl = null, kCanvas = 1;
  const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };
  const rgba = c => 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + (c[3] == null ? 1 : c[3]) + ')';
  // RectTransform → hình chữ nhật (đơn vị canvas, gốc dưới-trái) trong hình chữ nhật cha
  function rect(path, parent) {
    const r = RECTS[path];
    if (!r) throw new Error('ability UI rect not found: ' + path);
    const ax0 = parent.x + r.aMin[0] * parent.w, ax1 = parent.x + r.aMax[0] * parent.w;
    const ay0 = parent.y + r.aMin[1] * parent.h, ay1 = parent.y + r.aMax[1] * parent.h;
    const w = ax1 - ax0 + r.size[0], h = ay1 - ay0 + r.size[1];
    const px = ax0 + (ax1 - ax0) * r.pivot[0] + r.pos[0], py = ay0 + (ay1 - ay0) * r.pivot[1] + r.pos[1];
    return { x: px - w * r.pivot[0], y: py - h * r.pivot[1], w, h, r };
  }
  // đặt phần tử theo hình chữ nhật trong hệ toạ độ của cha (top-left CSS, đơn vị canvas)
  function place(e, R, parent) {
    e.style.left = (R.x - parent.x) + 'px';
    e.style.top = (parent.y + parent.h - (R.y + R.h)) + 'px';
    e.style.width = R.w + 'px'; e.style.height = R.h + 'px';
    const r = R.r;
    if (r && (r.rotZ || r.scale[0] !== 1 || r.scale[1] !== 1)) {
      e.style.transformOrigin = (r.pivot[0] * 100) + '% ' + ((1 - r.pivot[1]) * 100) + '%';
      e.style.transform = 'rotate(' + (-r.rotZ) + 'deg) scale(' + r.scale[0] + ',' + r.scale[1] + ')';
    }
    return e;
  }
  // Image: sprite trắng tô màu = mask + nền; màu trắng thì vẽ ảnh thẳng
  function paint(e, sprite, color, contain) {
    const url = 'url("' + (/^art\//.test(sprite) ? URLB(sprite) : SPR(sprite)) + '")';
    const white = !color || (color[0] === 1 && color[1] === 1 && color[2] === 1);
    const fit = contain === false ? '100% 100%' : 'contain';
    e.style.backgroundImage = white ? url : 'none';
    e.style.backgroundSize = fit;
    if (white) { e.style.webkitMask = e.style.mask = ''; e.style.backgroundColor = 'transparent'; e.style.opacity = color ? color[3] : 1; }
    else {
      e.style.backgroundColor = rgba(color);
      e.style.webkitMask = e.style.mask = url + ' center / ' + fit + ' no-repeat';
    }
  }

  // sprite làm mặt nạ, màu đặt riêng qua backgroundColor / backgroundImage (Image.color đổi theo trạng thái)
  function mask(e, sprite) {
    const url = 'url("' + SPR(sprite) + '")';
    e.style.webkitMask = e.style.mask = url + ' center / contain no-repeat';
    e.style.backgroundColor = '#fff';
  }

  // ------------------------------------------------------------------------------------------------ thanh năng lực (AbilityBarUI)
  const bar = { dirty: true, el: null, refreshT: 0, cdProp: 1, hasItems: true };
  function buildBar() {
    const scr = { x: 0, y: 0, w: 1920, h: 1080 };
    const A = rect('ActiveAbility', scr), C = rect('ActiveAbility/Container', A);
    const box = bar.el = el('div', 'ab-bar', rootEl);              // hệ toạ độ canvas, gốc dưới-trái màn hình, scale(k)
    const frame = { x: 0, y: 0, w: 0, h: 0 };
    const at = (path, parentR, cls, parentEl) => { const R = rect(path, parentR); const e = place(el('div', cls, parentEl || box), R, parentEl ? parentR : frame); e._R = R; return e; };
    // RadialPromptContainer: [nền PromptBackground lật ngang][RadialMenuIcon][phím E]
    const rp = at('ActiveAbility/Container/RadialPromptContainer', C, 'ab-rp');
    const rpR = rp._R;
    const rpb = at('ActiveAbility/Container/RadialPromptContainer/Backplate', rpR, 'ab-img ab-bp', rp);
    paint(rpb, 'PromptBackground', RECTS['ActiveAbility/Container/RadialPromptContainer/Backplate'].image.color, false);
    paint(at('ActiveAbility/Container/RadialPromptContainer/Icon', rpR, 'ab-img', rp), 'RadialMenuIcon');
    bar.rpKey = at('ActiveAbility/Container/RadialPromptContainer/ControlPromptIcon', rpR, 'ab-ctl', rp);
    bar.rpGlyph = at('ActiveAbility/Container/RadialPromptContainer/ControlPromptIcon/Icon', bar.rpKey._R, 'ab-img ab-glyph', bar.rpKey);
    // AbilityIcon: Backplate (ActionButtonMain_Disabled), CooldownFill (Inactive/Active, đổ đứng từ dưới), DisabledLayer, Icon
    const cc = rect('ActiveAbility/Container/CurrentContainer', C);
    const icon = bar.icon = at('ActiveAbility/Container/CurrentContainer/AbilityIcon', cc, 'ab-icon');
    const iR = icon._R, sq = Math.min(iR.w, iR.h);                // preserveAspect: ảnh nút vuông nằm giữa
    const sqR = { x: iR.x + (iR.w - sq) / 2, y: iR.y + (iR.h - sq) / 2, w: sq, h: sq };
    const sqEl = (cls, spr) => { const e = place(el('i', 'ab-img ' + cls, icon), sqR, iR); if (spr) paint(e, spr); return e; };
    bar.back = sqEl('ab-back', 'ActionButtonMain_Disabled');
    bar.fill = sqEl('ab-fill', 'ActionButtonMain_Inactive');
    bar.disabled = sqEl('ab-dis', 'ActionButtonMain_Disabled');
    bar.ic = at('ActiveAbility/Container/CurrentContainer/AbilityIcon/Icon', iR, 'ab-img ab-ic', icon);
    // AbilityControlPrompt (chuột phải): vòng giữ (HoldActionBack/Fill), vòng quay (HoldDelegateAction), ký hiệu phím
    const cp = bar.ctl = at('ActiveAbility/Container/CurrentContainer/AbilityControlPrompt', cc, 'ab-ctl');
    const cpR = cp._R;
    bar.ctlBack = at('ActiveAbility/Container/CurrentContainer/AbilityControlPrompt/HoldActionBack', cpR, 'ab-img ab-hold', cp);
    mask(bar.ctlBack, 'control-icon-outline-circle');
    bar.ctlFill = at('ActiveAbility/Container/CurrentContainer/AbilityControlPrompt/HoldActionFill', cpR, 'ab-img ab-holdfill', cp);
    mask(bar.ctlFill, 'control-icon-outline-circle');                // Filled Radial360, gốc đáy, ngược chiều kim
    bar.ctlSpin = at('ActiveAbility/Container/CurrentContainer/AbilityControlPrompt/HoldDelegateAction', cpR, 'ab-img ab-spin', cp);
    mask(bar.ctlSpin, 'control-icon-outline-spinner');
    bar.ctlGlyph = at('ActiveAbility/Container/CurrentContainer/AbilityControlPrompt/Icon', cpR, 'ab-img ab-glyph', cp);
    bar.spin = 0;
    // AttentionCallout: có năng lực mới chưa xem
    bar.alert = at('ActiveAbility/Container/AttentionCallout', C, 'ab-img ab-alert');
    paint(bar.alert, 'AlertIcon', ALERT);                            // ColorSettingResponder {POSITIVE}
    buildHeat(at, C);
    // chạm (điện thoại): ô năng lực = nút năng lực; nhãn vòng chọn = bật/tắt vòng chọn
    icon.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; e.preventDefault(); e.stopPropagation(); abilityDown(); });
    const up = e => { if (e.pointerType === 'mouse') return; abilityUp(); };
    icon.addEventListener('pointerup', up); icon.addEventListener('pointercancel', up);
    rp.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; e.preventDefault(); e.stopPropagation(); if (radial.open) hideRadial(); else showRadial(); });
  }

  // HasteInfoPanel: thanh nhiệt dựng đứng cạnh ô năng lực, hiện khi đang chọn Tăng tốc (mờ dần animateDurationSec, OutExpo)
  const heat = { el: null, a: 0, from: 0, to: 0, t: 1, dirty: true, explode: 0 };
  function buildHeat(at, C) {
    const P = 'ActiveAbility/Container/HasteInfoPanel', hp = heat.el = at(P, C, 'ab-heat');
    const hR = hp._R, cont = rect(P + '/Container', hR);
    const c = heat.cont = place(el('div', 'ab-heatc', hp), cont, hR);
    const border = rect(P + '/Container/Border', cont);
    const bEl = place(el('div', 'ab-border', c), border, cont);
    const sub = (name, cls) => place(el('i', cls, bEl), rect(P + '/Container/Border/' + name, border), border);
    sub('Background', 'ab-hbg'); heat.fill = sub('Fill', 'ab-hfill'); heat.flash = sub('AnimatedFill', 'ab-hflash');
    heat.icon = place(el('i', 'ab-img ab-flame', c), rect(P + '/Container/Icon', cont), cont);
    paint(heat.icon, 'FlameIcon');
    heat.ani = place(el('i', 'ab-img ab-flame2', c), rect(P + '/Container/AnimatedIcon', cont), cont);
    paint(heat.ani, 'FlameIcon', [1, 0, 0, 1]);                    // màu NEGATIVE (HasteAbilityInfoPanel.RefreshColors)
    heat.ani.style.backgroundColor = NEGATIVE;
  }

  function refreshBar(realDt) {
    const show = baseLayer() && !!cur();
    if (bar.shown !== show) { bar.shown = show; bar.el.classList.toggle('on', show); }
    heatPanel(realDt);
    if (!show) return;
    const ab = cur(), d = ab.d, sd = shown(d);
    // CheckAbilityCooldown mỗi refreshDelaySec (0,2 s): đổ = thời gian từ lần dùng / hồi chiêu
    bar.refreshT -= realDt;
    if (bar.refreshT <= 0 || bar.dirty) {
      bar.refreshT = UI.bar.refreshDelaySec;
      let prop = 1;
      if (d.cooldown > 0) { const t = sinceCast(d); prop = t > d.cooldown ? 1 : t / d.cooldown; }
      bar.cdProp = prop;
      bar.hasItems = hasItems(d);
      if (act.blocked && prop >= 1 && !(d.canFailCast && act.down)) act.blocked = false;
    }
    const key = [sd.icon, ab.isActive, bar.cdProp.toFixed(3), bar.hasItems, act.down, radial.open, anyUnseen()].join('|');
    if (key !== bar.key || bar.dirty) {
      bar.key = key; bar.dirty = false;
      paint(bar.ic, sd.icon);
      paint(bar.fill, ab.isActive ? 'ActionButtonMain_Active' : 'ActionButtonMain_Inactive');   // AbilityIcon.RefreshAbilityStateUI
      bar.fill.style.clipPath = 'inset(' + ((1 - bar.cdProp) * 100).toFixed(2) + '% 0 0 0)';   // Filled Vertical, gốc dưới
      bar.disabled.style.display = bar.hasItems ? 'none' : 'block';                             // SetDisabledEntirely(!hasRequiredItems)
      const enabled = bar.hasItems && bar.cdProp >= 1 && !act.blocked;
      // ControlPromptIcon.OnEnableStatusChanged: ký hiệu/vòng nền/vòng quay = enabledColor, vòng đổ = holdFillEnabledColor; tắt = disabledColor
      bar.ctlOn = enabled;
      const back = enabled ? CPI.enabledColor : CPI.disabledColor;
      bar.ctlBack.style.backgroundColor = bar.ctlSpin.style.backgroundColor = rgba(back);
      bar.ctlGlyph.style.filter = enabled ? '' : 'brightness(' + CPI.disabledColor[0] + ')';
      bar.ctl.style.visibility = radial.open ? 'hidden' : 'visible';                           // OnRadialMenuShowingToggled
      // loại nút: giữ (castTime) có vòng đổ, giữ-duy-trì có vòng quay, bấm thì chỉ ký hiệu
      const hold = !d.isContinuous && d.castTime > 0, cont = !!d.isContinuous;
      bar.ctlBack.style.display = bar.ctlFill.style.display = hold ? 'block' : 'none';
      bar.ctlSpin.style.display = cont ? 'block' : 'none';
      paint(bar.ctlGlyph, act.down ? UI.glyphs.ability.down : UI.glyphs.ability.up);
      paint(bar.rpGlyph, radial.keyDown ? UI.glyphs.radial.down : UI.glyphs.radial.up);
      bar.alert.style.display = anyUnseen() ? 'block' : 'none';
    }
    // vòng giữ: fillAmount = 1 − giữ/castTime (màu đen đè lên vòng trắng, ngược chiều kim từ đáy)
    if (!d.isContinuous && d.castTime > 0) {
      const a = (1 - clamp01(act.hold / d.castTime)) * 360;
      const fc = rgba(bar.ctlOn ? CPI.holdFillEnabledColor : CPI.disabledColor);
      bar.ctlFill.style.backgroundImage = 'conic-gradient(from 180deg, transparent 0deg ' + (360 - a).toFixed(1) + 'deg, ' + fc + ' ' + (360 - a).toFixed(1) + 'deg 360deg)';
    }
    if (d.isContinuous && act.down) { bar.spin -= 180 * realDt; bar.ctlSpin.style.transform = 'rotate(' + (-bar.spin).toFixed(1) + 'deg)'; } // delegateSpinSpeedDegPerSec 180
  }
  const anyUnseen = () => Object.values(DATA).some(d => d.showUnseenNotification && unlocked(d.id) && unseen(d));

  function heatPanel(realDt) {
    const want = baseLayer() && selId === 'haste';
    if (heat.dirty || want !== heat.want) {
      heat.dirty = false;
      if (want !== heat.want) { heat.want = want; heat.from = heat.a; heat.to = want ? 1 : 0; heat.t = 0; }
    }
    if (heat.t < 1) {
      heat.t = Math.min(1, heat.t + realDt / UI.haste.animateDurationSec);
      heat.a = lerp(heat.from, heat.to, outExpo(heat.t));
    }
    heat.el.style.opacity = heat.a.toFixed(3);
    heat.el.style.display = heat.a > 0.001 ? 'block' : 'none';
    if (heat.a <= 0.001) return;
    const h = ABILITIES.haste, p = clamp01(h.prop);
    heat.fill.style.clipPath = 'inset(' + ((1 - p) * 100).toFixed(2) + '% 0 0 0)';
    const w = hex2(WARNING), n = hex2(NEGATIVE);
    heat.fill.style.background = rgba([lerp(w[0], n[0], p), lerp(w[1], n[1], p), lerp(w[2], n[2], p), 1]);
    // HasteBarAnimator "explode" (Explode.anim 0,467 s): ngọn lửa đỏ to 1 → 2,5 và mờ 1 → 0; thanh trắng nháy 0-1-0-1-0
    const t = (performance.now() - heat.explode) / 1000;
    if (heat.explode && t < 0.4667) {
      const u = t / 0.4667, fl = [0, 1, 0, 1, 0], seg = Math.min(3, Math.floor(t / 0.11667)), fu = (t - seg * 0.11667) / 0.11667;
      heat.ani.style.display = 'block';
      heat.ani.style.transform = 'scale(' + lerp(1, 2.5, u).toFixed(3) + ')';
      heat.ani.style.opacity = (1 - u).toFixed(3);
      heat.flash.style.opacity = lerp(fl[seg], fl[seg + 1], fu).toFixed(3);
    } else { heat.ani.style.display = 'none'; heat.flash.style.opacity = 0; }
  }

  // ------------------------------------------------------------------------------------------------ vòng chọn (AbilityRadial)
  const radial = { open: false, el: null, idx: 0, prev: 0, t: 1, dirty: true, keyDown: false, wedges: [], mouse: null, selections: 0 };
  function buildRadial() {
    const P = 'AbilityRadial/Container', C0 = { x: 0, y: 0, w: 550, h: 550 };
    const C = { x: 0, y: 0, w: RECTS[P].size[0], h: RECTS[P].size[1], r: RECTS[P] };
    const box = radial.el = el('div', 'ab-radial', rootEl);
    box.style.width = C.w + 'px'; box.style.height = C.h + 'px';
    const disc = (path, cls) => { const R = rect(path, C); const e = place(el('i', 'ab-disc ' + cls, box), R, C0); return e; };
    const bg = disc(P + '/Background', 'ab-rbg'); bg.style.background = rgba(RECTS[P + '/Background'].image.color);
    radial.wedge = disc(P + '/SelectionWedge', 'ab-wedge');
    radial.wedge.style.transform = '';
    const cb = disc(P + '/CooldownBackplate', 'ab-cdb'); cb.style.background = rgba(RECTS[P + '/CooldownBackplate'].image.color);
    radial.cd = disc(P + '/CooldownFill', 'ab-cdf');
    const tb = disc(P + '/TextBackplate', 'ab-tb'); tb.style.background = rgba(RECTS[P + '/TextBackplate'].image.color);
    const tbR = rect(P + '/TextBackplate', C), tcR = rect(P + '/TextBackplate/TextContainer', tbR);
    const tc = place(el('div', 'ab-tc', tb), tcR, tbR);
    const txt = (name, cls) => place(el('div', 'ab-txt ' + cls, tc), rect(P + '/TextBackplate/TextContainer/' + name, tcR), tcR);
    radial.title = txt('AbilityTitle', 'ab-title'); radial.desc = txt('AbilityDescription', 'ab-desc'); radial.invalid = txt('InvalidAbilityText', 'ab-invalid');
    radial.invalid.style.color = rgba(RECTS[P + '/TextBackplate/TextContainer/InvalidAbilityText'].text.color);
    // nêm: AbilityRadialWedge.LayOutButton(N): góc 360/N · index, vị trí radius · (sin, cos) quanh tâm
    for (const w of WEDGES) {
      const node = RECTS[P + '/Abilities/' + w.node];
      const a = (360 / N * w.index) * Math.PI / 180;
      const cx = C.w / 2 + w.radius * Math.sin(a), cy = C.h / 2 + w.radius * Math.cos(a);
      const R = { x: cx - node.size[0] / 2, y: cy - node.size[1] / 2, w: node.size[0], h: node.size[1] };
      const e = place(el('i', 'ab-img ab-wicon', box), R, C0);
      e.dataset.ability = w.ability;
      const al = RECTS[P + '/Abilities/' + w.node + '/AttentionCallout'];
      const aR = { x: cx + al.pos[0] - al.size[0] / 2, y: cy + al.pos[1] - al.size[1] / 2, w: al.size[0], h: al.size[1] };
      const ae = place(el('i', 'ab-img ab-walert', box), aR, C0);
      paint(ae, 'AlertIcon');
      radial.wedges.push({ w, e, ae });
    }
    // chạm: chạm vào nêm là chọn rồi đóng
    box.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || !radial.open) return;
      e.preventDefault(); e.stopPropagation();
      pointAt(e.clientX, e.clientY);
      hideRadial();
    });
  }

  function showRadial() {
    if (radial.open || !baseLayer()) return;
    radial.open = true;
    radial.t = 0;                                                  // DOScale 0 → 1
    D.timeScale = TIME_SCALE;
    // GameEvents.ToggleRadialMenuShowing(true): năng lực có deactivateOnInputLayerChanged tắt ngay
    for (const ab of Object.values(ABILITIES)) if (ab.isActive && ab.d.deactivateOnInputLayerChanged) ab.deactivate();
    abilityUp();
    radial.el.classList.add('on');
    sfx(UI.radial.openSFX);                                        // "Radial Menu - Appear"
    radial.idx = Math.max(0, WEDGES.findIndex(w => w.ability === selId));
    changeIndex(radial.idx);
    bar.dirty = true;
  }
  function hideRadial() {
    if (!radial.open) return;
    radial.open = false;
    radial.el.classList.remove('on');
    if (!paused()) D.timeScale = 1;
    sfx('Radial Menu - Disappear');                                // closeSFX (AbilityRadial, guid fe02b600…)
    bar.dirty = true;
  }
  // AbilityRadial.Update (chuột): góc theo chiều kim đồng hồ từ đỉnh, làm tròn về bội của round(360/N) rồi chia 360/N
  function indexForAngle(deg) {
    const step = Math.round(WEDGE_W);                             // Mathf.RoundToInt(32,727) = 33
    const a = roundEven(deg);
    const snapped = Math.sign(a / step) * Math.round(Math.abs(a / step)) * step; // MathUtil.RoundToStep (AwayFromZero)
    return roundEven(snapped / WEDGE_W) % N;
  }
  function pointAt(x, y) {
    const cx = innerWidth / 2, cy = innerHeight / 2;              // AbilityRadial neo giữa canvas
    const mx = x - cx, my = cy - y;                               // y lên trên như Input.mousePosition
    const dz = RECTS['AbilityRadial/Container/CooldownFill'].size[0] * 0.5 * kCanvas; // mouseDeadzoneSize
    if (Math.hypot(mx, my) < dz || (mx === 0 && my === 0)) return;
    const l = Math.hypot(mx, my);
    let ang = Math.atan2(my / l, -mx / l) / Math.PI * 180 - 90;   // Mathf.Atan2(y, −x)/π·180 − 90
    if (ang < 0) ang += 360;
    const idx = indexForAngle(ang);
    if (idx !== radial.idx) { sfx(UI.radial.selectSFX); changeIndex(idx); } // "Radial Menu - Select"
  }
  // AbilityRadial.ChangeCurrentIndex
  function changeIndex(i) {
    radial.idx = i % N;
    const d = DATA[WEDGES[radial.idx].ability];
    if (unlocked(d.id)) {
      setUnseen(ownsAdvanced(d) ? DATA[d.linkedAdvancedVersion] : d, false);
      if (selId !== d.id) { select(d.id); radial.selections++; }
    }
    radial.dirty = true;
  }
  function refreshRadial(realDt) {
    if (!radial.open && radial.el.classList.contains('on')) radial.el.classList.remove('on');
    if (!radial.open) return;
    if (!baseLayer()) { hideRadial(); return; }
    if (radial.t < 1) radial.t = Math.min(1, radial.t + realDt / OPEN_TWEEN);
    const sc = outExpo(radial.t) * kCanvas;
    radial.el.style.transform = 'translate(-50%, -50%) scale(' + sc.toFixed(4) + ')';
    if (!radial.dirty) return;
    radial.dirty = false;
    const d = DATA[WEDGES[radial.idx].ability], ok = unlocked(d.id), sd = shown(d);
    // SelectionWedge: Radial360 gốc trên, theo chiều kim, 1/N vòng, xoay tới nêm đang chọn
    const from = WEDGE_W * radial.idx - HALF_W;
    radial.wedge.style.background = 'conic-gradient(from ' + from.toFixed(3) + 'deg, #fff 0deg ' + WEDGE_W.toFixed(3) + 'deg, transparent ' + WEDGE_W.toFixed(3) + 'deg 360deg)';
    let fill = 1, red = false, txt = '';
    if (ok) {
      radial.title.textContent = (VI[sd.id] || [sd.nameKey])[0]; radial.title.dataset.orig = sd.nameKey;
      radial.desc.textContent = (VI[sd.id] || [, sd.descriptionKey])[1]; radial.desc.dataset.orig = sd.descriptionKey;
      let ready = true;
      if (d.cooldown > 0) {
        const t = sinceCast(d);
        fill = clamp01(1 - t / d.cooldown);
        if (t <= d.cooldown) { ready = false; red = true; txt = VI_COOLDOWN; }
      }
      if (ready && !hasItems(d)) { fill = 1; red = true; txt = VI_MISSING; }
      if (ready && !txt) fill = 0;
    } else {
      radial.title.textContent = VI_UNKNOWN[0]; radial.desc.textContent = VI_UNKNOWN[1];
      radial.title.dataset.orig = radial.desc.dataset.orig = '';
      fill = 0;
    }
    radial.cd.style.background = red ? 'conic-gradient(' + NEGATIVE + ' 0deg ' + (fill * 360).toFixed(1) + 'deg, transparent ' + (fill * 360).toFixed(1) + 'deg 360deg)' : 'transparent';
    radial.invalid.textContent = txt; radial.invalid.style.display = txt ? 'block' : 'none';
    for (const r of radial.wedges) {
      const wd = DATA[r.w.ability], on = unlocked(wd.id), hi = r.w === WEDGES[radial.idx];
      // AbilityRadialWedge: icon (bản cải tiến nếu có) hoặc lockedSprite; nêm đang chọn tô đen
      paint(r.e, on ? shown(wd).icon : r.w.lockedSprite, hi ? [0, 0, 0, 1] : null);
      r.e.classList.toggle('hi', hi);
      const showAlert = on && (ownsAdvanced(wd) ? DATA[wd.linkedAdvancedVersion] : wd).showUnseenNotification && unseen(ownsAdvanced(wd) ? DATA[wd.linkedAdvancedVersion] : wd);
      r.ae.style.display = showAlert ? 'block' : 'none';
    }
  }

  // ------------------------------------------------------------------------------------------------ ống nhòm: camera + bảng tin
  const spy = { el: null, dirty: true, cross: null, info: null };
  const HARDOUT = t => { const m0 = Math.PI / 2; return (t * t * t - 2 * t * t + t) * m0 + (-2 * t * t * t + 3 * t * t); }; // Cinemachine HardOut
  const BLEND = 0.5;                                               // Main Camera Blends: **ANY CAMERA** ⇄ SpyglassVCam, Style 5, 0,5 s
  const _q = new T.Quaternion(), _p = new T.Vector3(), _e = new T.Euler(0, 0, 0, 'YXZ'), _fw = new T.Vector3();
  function spyPose(out) {
    // Transposer LockToTargetWithWorldUp, m_FollowOffset (0, 3, 0): 3 m trên gốc Player; POV quay quanh trục thuyền
    const sg = ABILITIES.spyglass, br = root.DRBoat.root;
    out.p.set(br.position.x, br.position.y + SC.CinemachineTransposer.m_FollowOffset.y, br.position.z);
    _e.set(-sg.v * Math.PI / 180, br.rotation.y + sg.h * Math.PI / 180, 0, 'YXZ'); // Euler(dọc, ngang): dọc dương = cúi xuống
    out.q.setFromEuler(_e);
    out.fov = SC.lens.FieldOfView;
    return out;
  }
  const poseS = { p: new T.Vector3(), q: new T.Quaternion(), fov: 15 }, poseN = { p: new T.Vector3(), q: new T.Quaternion(), fov: 40 };
  function camOverride(cam, dt, mode, env) {
    const sg = ABILITIES.spyglass;
    // camera thường vẫn chạy (Player VCam đứng chờ) để có điểm đầu/cuối của phép trộn
    DRCamera.override = null;
    DRCamera.update(dt, mode, env);
    DRCamera.override = camOverride;
    poseN.p.copy(cam.position); poseN.q.copy(cam.quaternion); poseN.fov = cam.fov;
    spyPose(poseS);
    sg.blend = Math.min(BLEND, sg.blend + dt);
    let k = HARDOUT(sg.blend / BLEND);
    if (sg.dir < 0) k = 1 - k;
    if (sg.dir < 0 && sg.blend >= BLEND) { DRCamera.override = null; return true; } // trộn ra xong: trả camera
    cam.position.lerpVectors(poseN.p, poseS.p, k);
    _q.copy(poseN.q).slerp(poseS.q, k); cam.quaternion.copy(_q);
    const fov = lerp(poseN.fov, poseS.fov, k);
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (cam.near !== (k > 0.5 ? SC.lens.NearClipPlane : 0.5)) { cam.near = k > 0.5 ? SC.lens.NearClipPlane : 0.5; cam.updateProjectionMatrix(); }
    return true;
  }
  // SpyglassAbility.Update: RaycastAll(maxRange, lớp POI) theo hướng camera; chọn điểm có góc lệch nhỏ nhất < maxAngle,
  // không bị che (RaycastAll tới điểm theo obscuredLayerMask = 0). [ĐỀ XUẤT] "che" = đoạn thẳng cắt qua đất (DRWorld.sdf < 0).
  function scanSpots(sg) {
    if (!root.DRSpots || !DRSpots.list) return null;
    const cam = root.DRCamera && DRCamera.cam;
    if (!cam || sg.blend < BLEND * 0.5 && sg.dir > 0) return sg.focus;
    spyPose(poseS);
    const P = poseS.p; _fw.set(0, 0, -1).applyQuaternion(poseS.q);
    let best = null, bestAng = Infinity;
    for (const sp of DRSpots.list) {
      const dx = sp.x - P.x, dy = 0 - P.y, dz = sp.z - P.z, dist = Math.hypot(dx, dy, dz);
      if (dist > SG.maxRange + 4) continue;
      if (!rayHitsSpot(P, _fw, sp)) continue;                     // RaycastAll(maxRange) phải chạm collider của điểm
      const along = dx * _fw.x + dy * _fw.y + dz * _fw.z;
      const ang = Math.acos(Math.max(-1, Math.min(1, along / dist))) * 180 / Math.PI; // Vector3.Angle tới tâm điểm
      if (ang >= SG.maxAngle || ang >= bestAng) continue;
      if (blocked(P.x, P.z, sp.x, sp.z)) continue;
      bestAng = ang; best = sp;
    }
    return best;
  }
  // Collider thật của HarvestPOI (markers.json: CapsuleCollider trục y, bán kính 2, cao 6, tâm (0, −1, 0)) theo id điểm
  let spotCols = null;
  function spotCollider(sp) {
    if (!spotCols) {
      spotCols = {};
      const ms = (root.DRWorld && DRWorld.data && DRWorld.data.markers && DRWorld.data.markers.markers) || [];
      for (const m of ms) if (m.kind === 'harvestPOI' && m.harvestPOIData && m.colliders && m.colliders[0]) spotCols[String(m.harvestPOIData.id)] = m.colliders[0];
    }
    return spotCols[sp.id] || null;
  }
  // tia (gốc P, hướng đơn vị f, dài maxRange) có chạm collider của điểm không: khoảng cách tia–đoạn trục capsule ≤ bán kính
  function rayHitsSpot(P, f, sp) {
    const c = spotCollider(sp), sc = c && c.scale ? c.scale : [1, 1, 1];
    const r = c ? c.radius * Math.max(sc[0], sc[2]) : sp.r;
    const half = c && c.shape === 'capsule' ? Math.max(0, c.height * sc[1] / 2 - r) : 0;
    const cy = c && c.center ? c.center[1] * sc[1] : 0;
    const ax = sp.x, ay = cy - half, az = sp.z, L = half * 2;      // đoạn trục: (ax, ay..ay+L, az)
    const wx = P.x - ax, wy = P.y - ay, wz = P.z - az;
    const b = f.y, dW = f.x * wx + f.y * wy + f.z * wz, eW = wy, den = 1 - b * b;
    let s = den > 1e-6 ? (eW - b * dW) / den : 0;
    s = Math.max(0, Math.min(L, s));
    let t = Math.max(0, Math.min(SG.maxRange, (ax - P.x) * f.x + (ay + s - P.y) * f.y + (az - P.z) * f.z));
    s = Math.max(0, Math.min(L, P.y + t * f.y - ay));
    t = Math.max(0, Math.min(SG.maxRange, (ax - P.x) * f.x + (ay + s - P.y) * f.y + (az - P.z) * f.z));
    const qx = P.x + t * f.x - ax, qy = P.y + t * f.y - (ay + s), qz = P.z + t * f.z - az;
    return qx * qx + qy * qy + qz * qz <= r * r;
  }
  function blocked(x0, z0, x1, z1) {
    if (!root.DRWorld || !DRWorld.sdf) return false;
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.ceil(d / 2));
    for (let i = 1; i < n; i++) { const t = i / n; if (DRWorld.sdf(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t) < 0) return true; }
    return false;
  }
  function buildSpy() {
    const box = spy.el = el('div', 'ab-spy', rootEl);
    const P = 'SpyglassUI/SpyglassGyroscope';
    // dấu thập: XAxis 32×1920 xoay 90°, YAxis 32×1080; sprite SpyglassCrosshair lát (Tiled), màu tối
    const cross = spy.cross = el('div', 'ab-cross', box);
    for (const n of ['XAxis', 'YAxis']) {
      const r = RECTS[P + '/' + n], e = el('i', 'ab-axis', cross);
      e.style.width = r.size[0] + 'px'; e.style.height = r.size[1] + 'px';
      e.style.marginLeft = (-r.size[0] / 2) + 'px'; e.style.marginTop = (-r.size[1] / 2) + 'px';
      e.style.transform = 'rotate(' + (-r.rotZ) + 'deg)';
      e.style.backgroundColor = rgba(r.image.color);
    }
    // bảng tin (InfoPanelContainer, neo đáy-giữa vào điểm câu trên màn hình)
    const IP = 'SpyglassUI/InfoPanelContainer', ipR = { x: 0, y: 0, w: RECTS[IP].size[0], h: RECTS[IP].size[1], r: RECTS[IP] };
    const info = spy.info = el('div', 'ab-info', box);
    info.style.width = ipR.w + 'px'; info.style.height = ipR.h + 'px';
    // Backplate: VerticalLayoutGroup (đệm trái 20, phải 20, trên −20, dưới 10) + ContentSizeFitter cao theo nội dung:
    // thẻ loại 40 (nhô nửa trên mép), BasicContainer 80; AdvancedContainer 60 chỉ có ở ống nhòm cải tiến (chưa làm) ⇒ cao 110
    const lay = RECTS[IP + '/Backplate'].fields.VerticalLayoutGroup.m_Padding;  // [trái, phải, trên, dưới]
    const tag0 = RECTS[IP + '/Backplate/HarvestableTypeTag'], bc0 = RECTS[IP + '/Backplate/BasicContainer'];
    const bpH = lay[2] + tag0.size[1] + bc0.size[1] + lay[3];
    const bp0 = rect(IP + '/Backplate', ipR), bp = { x: bp0.x, y: bp0.y, w: bp0.w, h: bpH };
    const bpe = place(el('div', 'ab-ibp', info), bp, ipR);
    const tagR = { x: bp.x + (bp.w - tag0.size[0]) / 2, y: bp.y + bp.h - lay[2] - tag0.size[1], w: tag0.size[0], h: tag0.size[1] };
    spy.tag = place(el('div', 'ab-tag', bpe), tagR, bp);
    spy.tagTxt = el('span', '', spy.tag);
    spy.tagAdv = el('i', 'ab-img ab-tagadv', spy.tag); paint(spy.tagAdv, 'AdvancedTypeIcon');
    const bcR = { x: bp.x + (bp.w - bc0.size[0]) / 2, y: tagR.y - bc0.size[1], w: bc0.size[0], h: bc0.size[1] };
    const bc = place(el('div', 'ab-ibc', bpe), bcR, bp);
    spy.name = place(el('div', 'ab-iname', bc), rect(IP + '/Backplate/BasicContainer/NameText', bcR), bcR);
    spy.img = place(el('i', 'ab-img ab-iimg', bc), rect(IP + '/Backplate/BasicContainer/Image', bcR), bcR);
    spy.bad = place(el('i', 'ab-img ab-ibad', bc), rect(IP + '/Backplate/BasicContainer/InvalidEquipmentImage', bcR), bcR);
    paint(spy.bad, 'x', RECTS[IP + '/Backplate/BasicContainer/InvalidEquipmentImage'].image.color);
    const ul = place(el('i', 'ab-img ab-iul', info), rect(IP + '/Underline', ipR), ipR);
    paint(ul, 'DestinationPointer', null, false);
  }
  const _v = new T.Vector3();
  function refreshSpy() {
    const sg = ABILITIES.spyglass, on = sg.isActive && baseLayer();
    spy.el.classList.toggle('on', on);
    if (!on) { spy.shownAt = 0; return; }
    const f = sg.focus;
    if (spy.dirty) {
      spy.dirty = false;
      if (f) {
        const day = root.DRSky && DRSky.env ? DRSky.env.isDay : true;
        const R = root.DRRules, list = (R.spotList(f.d, day) || []).length ? R.spotList(f.d, day) : (f.d.items || f.d.nightItems || []);
        const id = list && list[0], it = root.DR_ITEMS[id];
        spy.item = it ? id : null;
        if (it) {
          // SpyglassUI.RefreshUI: tên khi đã từng bắt (không thì ???), ảnh (đồ lặt vặt = ảnh ẩn), thẻ loại, dấu X khi thiếu đồ
          const caught = (S().caught && S().caught[id]) > 0;
          spy.name.textContent = caught ? it.name : '???';
          const trinket = (G().subOf(it) & G().SUB.TRINKET) !== 0;
          paint(spy.img, trinket ? 'QuestionMark' : it.sprite, [1, 1, 1, 0.9999]);  // Silhouette_UI_Material: bóng trắng
          const ht = it.harvestableType || 'NONE', cf = ((root.DR_WORLD.HarvestTypeTagConfig || {}).HarvestTypeTagConfig || {});
          spy.tag.style.setProperty('--c', rgba((cf.colorLookup || {})[ht] || [0.65, 0.54, 0.38, 1]));
          spy.tagTxt.textContent = TYPE_VI[ht] || ht; spy.tagTxt.style.color = rgba((cf.textColorLookup || {})[ht] || [1, 1, 1, 1]);
          spy.tagAdv.style.display = it.requiresAdvancedEquipment ? 'block' : 'none';
          const st = root.DRBoat.stats;
          const okEq = st && (it.requiresAdvancedEquipment ? st.advancedTypes.has(ht) : st.harvestTypes.has(ht));
          spy.bad.style.display = okEq ? 'none' : 'block';
          spy.shownAt = performance.now();
        }
      }
    }
    const vis = !!(f && spy.item);
    // SpyglassUIShow/Hide: alpha InfoPanelContainer 0 ↔ 1 trong 0,117 s
    spy.info.style.opacity = vis ? Math.min(1, (performance.now() - spy.shownAt) / 117).toFixed(3) : 0;
    if (!vis) return;
    const cam = DRCamera.cam;
    _v.set(f.x, 0, f.z).project(cam);
    const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight;
    const b = S().boat, dist = Math.hypot(f.x - b.x, f.z - b.z);
    const sc = lerp(UI.spyglass.scaleMax, UI.spyglass.scaleMin, clamp01((dist - UI.spyglass.closeThreshold) / (UI.spyglass.farThreshold - UI.spyglass.closeThreshold)));
    spy.info.style.left = sx + 'px'; spy.info.style.top = sy + 'px';
    spy.info.style.transform = 'translate(-50%, -100%) scale(' + (sc * kCanvas).toFixed(4) + ')';
  }
  // khoá con trỏ như CursorLockMode.Locked; [ĐỀ XUẤT] trình duyệt từ chối thì vẫn xoay bằng movementX/Y không khoá
  function lockPointer(on) {
    try {
      const c = document.getElementById('dr-canvas');
      if (on && c && c.requestPointerLock && matchMedia('(pointer: fine)').matches) {
        const r = c.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      } else if (!on && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    } catch (e) { /* khoá con trỏ không bắt buộc */ }
  }
  // Esc khi con trỏ đang khoá: trình duyệt tự nhả khoá và không chuyển phím Esc cho trang ⇒ coi như Back (thoát ống nhòm)
  let hadLock = false;
  document.addEventListener('pointerlockchange', () => {
    const locked = !!document.pointerLockElement;
    if (!locked && hadLock && ABILITIES.spyglass.isActive) ABILITIES.spyglass.deactivate();
    hadLock = locked;
  });

  // ------------------------------------------------------------------------------------------------ vòng lặp
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const realDt = Math.min(0.1, last ? (now - last) / 1000 : 0.016); last = now;
    if (!rootEl || !S()) return;
    const ts = D.timeScale == null ? 1 : D.timeScale;
    const running = D.mode !== 'title' && !paused();
    const dt = running ? realDt * ts : 0;
    gameT += dt;
    // rời lớp BASE (bến, khoang, hội thoại, câu cá…): tắt năng lực có deactivateOnInputLayerChanged, đóng vòng chọn
    const base = baseLayer();
    if (!base) {
      for (const ab of Object.values(ABILITIES)) if (ab.isActive && ab.d.deactivateOnInputLayerChanged) ab.deactivate();
      if (act.down) abilityUp();
      if (radial.open) hideRadial();
    }
    if (!radial.open && D.timeScale !== 1 && !paused()) D.timeScale = 1;
    // nút giữ castTime (DredgePlayerActionHold: thời gian thật, nhả thì tụt dần)
    const ab = cur();
    if (ab && !ab.d.isContinuous && ab.d.castTime > 0 && running) {
      if (act.down && !act.blocked) { act.hold += realDt; if (act.hold >= ab.d.castTime) { act.hold = 0; complete(); } }
      else act.hold = Math.max(0, act.hold - realDt);
    }
    for (const a of Object.values(ABILITIES)) a.update(dt);
    refreshBar(realDt);
    refreshRadial(realDt);
    refreshSpy();
    const sg = ABILITIES.spyglass;
    if (sg.dir < 0 && root.DRCamera && DRCamera.override !== camOverride && sg.blend >= BLEND) sg.dir = 0;
  }

  function resize() {
    kCanvas = innerHeight / 1080;                                  // CanvasScaler ScaleWithScreenSize 1920×1080, match height
    if (bar.el) bar.el.style.transform = 'scale(' + kCanvas + ')';
    if (spy.cross) spy.cross.style.transform = 'scale(' + kCanvas + ')';
  }

  // trạng thái từ sổ lưu (ván mới / nạp): Ability.Init + AbilityRadial.Start
  function fromSave() {
    if (!save()) return;
    for (const a of Object.values(ABILITIES)) { a.isActive = false; a.lastRelease = -1e9; }
    ABILITIES.lights.isActive = !!S().lightsOn;                    // persistAbilityToggle: đèn giữ trạng thái đã lưu
    ABILITIES.haste.raw = ABILITIES.haste.prop = 0; ABILITIES.haste.onCd = false; ABILITIES.haste.fov = 0; ABILITIES.haste.fovT = 1;
    if (root.DRCamera) { DRCamera.fovAdd = 0; if (DRCamera.override === camOverride) DRCamera.override = null; }
    if (root.DRBoat) DRBoat.abilitySpeed = 1;
    const last = S().lastAbility, w = WEDGES.find(x => x.ability === last);
    select(w ? w.ability : WEDGES[0].ability, true);
    // sổ lưu cũ (trước khi có năng lực) có thể đã chở lưới/bẫy trong khoang: mở bù một lần, chỉ xét khoang thuyền
    const inv = D.grid('INVENTORY');
    if (inv && belongsToPlayer('INVENTORY')) checkItems(inv.items);
    act.down = false; act.blocked = false; act.hold = 0;
    radial.dirty = bar.dirty = true;
  }

  function init() {
    rootEl = el('div', 'dr-ui', document.body); rootEl.id = 'dr-ab';
    buildBar(); buildRadial(); buildSpy();
    resize(); addEventListener('resize', resize);
    // gợi ý ở màn đầu (index.html) còn ghi "L đèn": [ĐỀ XUẤT] sửa tại chỗ cho đúng phím mới, gốc index.html là của root
    const hint = document.querySelector('#dr-title .hint');
    if (hint && /L đèn/.test(hint.textContent)) hint.textContent = hint.textContent.replace('L đèn', 'chuột phải năng lực · giữ E chọn năng lực');
    D.on('newgame', fromSave); D.on('load', fromSave);
    D.on('mode', m => { if (m === 'sail' && !selId) fromSave(); });
    D.on('cargo', (key, inst) => { if (inst && S() && belongsToPlayer(key || 'INVENTORY')) checkItems([inst]); bar.dirty = true; });
    D.on('ability', id => { const d = DATA[id]; if (d && d.showUnseenNotification && S().vars[id + '-unseen'] == null) setUnseen(d, true); radial.dirty = bar.dirty = true; if (root.DRBoat) DRBoat.refresh(); });
    D.on('lights', on => { ABILITIES.lights.isActive = !!on; bar.dirty = true; });
    // chuột: rê để chọn nêm (vòng mở) hoặc xoay ống nhòm
    addEventListener('pointermove', e => {
      if (radial.open && e.pointerType === 'mouse') pointAt(e.clientX, e.clientY);
      if (ABILITIES.spyglass.isActive && e.pointerType === 'mouse') ABILITIES.spyglass.look(e.movementX || 0, e.movementY || 0);
    });
    requestAnimationFrame(frame);
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);

  root.DRAbilities = {
    // input.js gọi
    radialDown() { radial.keyDown = true; bar.dirty = true; showRadial(); },
    radialUp() { radial.keyDown = false; bar.dirty = true; hideRadial(); },
    radialConfirm() { if (radial.open) { hideRadial(); return true; } return false; }, // Confirm (chuột trái) = ToggleRadial
    radialStick(x, y) {                                            // tay cầm: RadialSelect, vùng chết 0,35, góc 0 = lên, theo chiều kim
      if (!radial.open || Math.hypot(x, y) < UI.radial.controllerDeadzoneMagnitude) return;
      let ang = Math.atan2(x, y) * 180 / Math.PI; if (ang < 0) ang += 360;
      const idx = indexForAngle(ang); if (idx !== radial.idx) { sfx(UI.radial.selectSFX); changeIndex(idx); }
    },
    abilityDown, abilityUp,
    back() {                                                       // Esc: thoát ống nhòm (allowExitAction) / đóng vòng chọn
      if (radial.open) { hideRadial(); return true; }
      const sg = ABILITIES.spyglass;
      if (sg.isActive) { sg.deactivate(); return true; }
      return false;
    },
    get radialOpen() { return radial.open; },
    get spyglassActive() { return ABILITIES.spyglass.isActive; },
    selected: () => selId, select: id => { if (unlocked(id)) select(id); }, isActive: id => !!(abilityOf(id) && abilityOf(id).isActive),
    unlock, register, Ability, data: id => DATA[id], hasteHeat: () => ABILITIES.haste.prop, indexForAngle, wedges: () => WEDGES.map(w => w.ability),
    missingSounds: () => [...MISSING],
    debug() {
      const h = ABILITIES.haste, sg = ABILITIES.spyglass, f = ABILITIES.foghorn;
      return {
        selected: selId, radialOpen: radial.open, radialIndex: radial.idx, timeScale: D.timeScale == null ? 1 : D.timeScale,
        active: Object.keys(ABILITIES).filter(k => ABILITIES[k].isActive), casts: act.casts, blocked: act.blocked, hold: act.hold,
        haste: { hold: h.hold, raw: h.raw, prop: h.prop, onCd: h.onCd, explosions: h.explosions, fov: h.fov, speed: root.DRBoat ? DRBoat.abilitySpeed : 1, crackle: h.crackle },
        foghorn: { vol: f.vol, rate: f.rate, ended: f.ended || 0 },
        spyglass: { h: sg.h, v: sg.v, blend: sg.blend, dir: sg.dir, focus: sg.focus ? sg.focus.id : null, item: spy.item || null },
        cooldownProp: bar.cdProp, hasItems: bar.hasItems, history: Object.assign({}, (S() && S().abilityHistory) || {})
      };
    }
  };
})(window);
