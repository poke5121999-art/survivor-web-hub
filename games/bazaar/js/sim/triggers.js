/* Chợ Phiên — TRIGGERS: khớp sự kiện với `Trigger` của ability (CODE-COMBAT §3.4, §3.6).
   Hàm khớp: (trig, card sở hữu ability, ev, S) → bool. Sự kiện ev = {kind, side, card (thẻ chủ thể), src (TriggerSource),
   tcard (TriggerTarget), player / tplayer (đối tượng người chơi), attr, delta, causer (thẻ gây ra)}.
   Chủ thể (`Subject`) quyết định có liên quan hay không: ev.card ∈ Subject.GetTargets({TargetingCard: card}) (HintService.cs:353-362). */
(function (root) {
  'use strict';
  var BZ = root.BZSim = root.BZSim || {};
  var TR = BZ.TRIGGERS;
  var ANY = ['Alive', 'Destroyed'];
  var SELF = { $type: 'TTargetCardSelf' };
  var PSELF = { $type: 'TTargetPlayerRelative', TargetMode: 'Self' };

  function inCards(S, t, card, ev, x) {
    if (!x) return false;
    return BZ.targets(t || SELF, { S: S, card: card, ev: ev }, null, null, ANY).indexOf(x) >= 0;
  }
  function inPlayers(S, t, card, ev, pl) {
    if (!pl) return false;
    return BZ.targets(t || PSELF, { S: S, card: card, ev: ev }).indexOf(pl) >= 0;
  }
  function changeOk(type, delta) { // EAttributeChangeType { Loss, Gain, Any }
    if (type === 'Gain') return delta > 0;
    if (type === 'Loss') return delta < 0;
    return delta !== 0;
  }
  function srcOk(S, trig, card, ev) { return !trig.Source || inCards(S, trig.Source, card, ev, ev.causer); }
  function tgtOk(S, trig, card, ev) {
    if (!trig.Target) return true;
    if (ev.tcard) return inCards(S, trig.Target, card, ev, ev.tcard);
    if (ev.tplayer) return inPlayers(S, trig.Target, card, ev, ev.tplayer);
    return false;
  }
  var subjectCard = function (trig, card, ev, S) { return inCards(S, trig.Subject, card, ev, ev.card); };
  var subjectCardSrc = function (trig, card, ev, S) { return subjectCard(trig, card, ev, S) && srcOk(S, trig, card, ev); };
  var performed = function (trig, card, ev, S) { return subjectCard(trig, card, ev, S) && tgtOk(S, trig, card, ev); };
  var subjectPlayer = function (trig, card, ev, S) { return inPlayers(S, trig.Subject, card, ev, ev.player); };
  var never = function () { return false; };

  TR.TTriggerOnCardFired = function (trig, card, ev) { return ev.card === card; };          // chỉ chính thẻ này bắn
  TR.TTriggerOnItemUsed = subjectCard;                                                     // BazaarCardDealer.cs:1241-1245
  TR.TTriggerOnBeforeItemUsed = subjectCard;
  TR.TTriggerOnCardCritted = subjectCard;                                                  // :1237-1240
  TR.TTriggerOnCardPerformedSlow = performed;
  TR.TTriggerOnCardPerformedFreeze = performed;
  TR.TTriggerOnCardPerformedHaste = performed;
  TR.TTriggerOnCardPerformedBurn = performed;
  TR.TTriggerOnCardPerformedPoison = performed;
  TR.TTriggerOnCardPerformedRegen = performed;
  TR.TTriggerOnCardPerformedHeal = performed;
  TR.TTriggerOnCardPerformedOverHeal = performed;
  TR.TTriggerOnCardPerformedShield = performed;
  TR.TTriggerOnCardPerformedDamage = performed;
  TR.TTriggerOnCardPerformedReload = performed;
  TR.TTriggerOnCardPerformedDestruction = performed;                                       // CardDestroy hoặc CardDisable
  TR.TTriggerOnCardStartsFlying = performed;                                               // Subject = thẻ ra lệnh bay
  TR.TTriggerOnBeforeCardDestroyed = subjectCardSrc;
  TR.TTriggerOnCardDisabled = subjectCardSrc;
  TR.TTriggerOnCardRepaired = subjectCardSrc;
  TR.TTriggerOnCardTransformed = subjectCardSrc;
  TR.TTriggerOnCardStartedFlying = subjectCardSrc;                                         // Subject = thẻ bắt đầu bay
  TR.TTriggerOnCardStoppedFlying = subjectCardSrc;
  TR.TTriggerOnCardUpgraded = subjectCardSrc;
  TR.TTriggerOnCardAttributeChanged = function (trig, card, ev, S) { // TTriggerOnCardAttributeChanged.cs:10-23
    if (trig.AttributeChanged && trig.AttributeChanged !== ev.attr) return false;
    if (!changeOk(trig.ChangeType || 'Any', ev.delta)) return false;
    if (trig.PreviousValue && !BZ.compare(trig.PreviousValue.ComparisonOperator, ev.prev, trig.PreviousValue.ComparisonValue || 0)) return false;
    if (trig.CurrentValue && !BZ.compare(trig.CurrentValue.ComparisonOperator, ev.cur, trig.CurrentValue.ComparisonValue || 0)) return false;
    return subjectCardSrc(trig, card, ev, S);
  };
  TR.TTriggerOnPlayerAttributeChanged = function (trig, card, ev, S) { // TTriggerOnPlayerAttributeChanged.cs:10-19
    if (trig.AttributeType && trig.AttributeType !== ev.attr) return false;
    if (!changeOk(trig.ChangeType || 'Any', ev.delta)) return false;
    return subjectPlayer(trig, card, ev, S) && srcOk(S, trig, card, ev);
  };
  TR.TTriggerOnPlayerEnraged = subjectPlayer;
  TR.TTriggerOnPlayerEnrageEnded = subjectPlayer;
  TR.TTriggerOnPlayerDied = subjectPlayer;
  TR.TTriggerOnFightStarted = function (trig, card, ev, S) { return !trig.CombatType || trig.CombatType === S.combatType; };
  TR.TTriggerOnSandstorm = function () { return true; };
  TR.TTriggerOr = function (trig, card, ev, S) { // TTriggerOr.cs:11-19
    var ts = trig.Triggers || [];
    for (var i = 0; i < ts.length; i++) if (ts[i].$type === ev.kind && BZ.matchTrigger(ts[i], card, ev, S)) return true;
    return false;
  };
  // Ngoài trận (cửa hàng, ngày giờ, gặp gỡ) hoặc kết thúc trận: đã biết, không bao giờ kích trong mô phỏng
  ['TTriggerOnCardSelected', 'TTriggerOnCardSold', 'TTriggerOnCardPurchased', 'TTriggerOnDayStarted', 'TTriggerOnHourStarted',
    'TTriggerOnEncounterCardsDealt', 'TTriggerOnEncounterSelected', 'TTriggerOnEncounterEntered', 'TTriggerOnEncounterExited',
    'TTriggerOnCardQuestCompleted', 'TTriggerOnFightEnded', 'TTriggerOnRunStarted', 'TTriggerOnRunCompleted',
    'TTriggerOnPlayerLeveledUp', 'TTriggerOnBeforeCardSold', 'TTriggerOnBeforeFightStarted', 'TTriggerOnCardEnchanted',
    // Có trong mã nhưng dữ liệu không dùng (CODE-COMBAT §3.6 cuối): để no-op
    'TTriggerOnBeforeCardTransformed', 'TTriggerOnCardCharged', 'TTriggerOnCardConsumed', 'TTriggerOnCardDestroyed',
    'TTriggerOnCardFrozen', 'TTriggerOnCardHasted', 'TTriggerOnCardPerformedCharge', 'TTriggerOnCardPerformedRage',
    'TTriggerOnCardPerformedTempo', 'TTriggerOnCardPerformedTransform', 'TTriggerOnCardReloaded', 'TTriggerOnCardSlowed',
    'TTriggerOnCardStopsFlying', 'TTriggerOnPlayerAttributePercentChange', 'TTriggerOnPlayerBurned', 'TTriggerOnPlayerDamaged',
    'TTriggerOnPlayerHealed', 'TTriggerOnPlayerLifeStealed', 'TTriggerOnPlayerShielded', 'TTriggerOnPlayerPoisoned',
    'TTriggerOnPlayerRaged', 'TTriggerOnPlayerRagedWhileEnraged'
  ].forEach(function (k) { if (!TR[k]) TR[k] = never; });

  BZ.matchTrigger = function (trig, card, ev, S) {
    var f = TR[trig.$type];
    if (!f) { BZ.noteUnknown(trig.$type, 'trigger'); return false; }
    return f(trig, card, ev, S);
  };
  // Các kind mà một trigger nghe (TTriggerOr nghe mọi con)
  BZ.triggerKinds = function (trig) {
    if (!trig) return ['TTriggerOnCardFired']; // TCardAbility.Trigger mặc định OnCardFired (TCardAbility.cs:10-46)
    if (trig.$type === 'TTriggerOr') { var o = []; (trig.Triggers || []).forEach(function (t) { o = o.concat(BZ.triggerKinds(t)); }); return o; }
    return [trig.$type];
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BZ;
})(typeof window !== 'undefined' ? window : globalThis);
