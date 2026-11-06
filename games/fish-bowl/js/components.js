// The game's framework MonoBehaviours (namespace AS + a few helpers), keyed by short class name. Each instance gets
// (game, path, data) where data is its block in data/components.json; methods carry the original names so UnityEvents
// call them directly (see events.js). Task classes live in tasks/*.js.

class Base {
  constructor(game, path, data) {
    this.game = game;
    this.path = path;
    this.data = data || {};
  }
}

// AS.ActivityManager: one Activity per level; completing one shows the result and unlocks the next.
class ActivityManager extends Base {
  CurrentActivityComplete() { this.game.complete(false); }
  NexActivityUnlock() { this.game.unlockNext(); }
  HUD_NAV_CANVAS_Opacity(v) { this.game.nav.opacity = v; }
}

// InstanceManager: hints, player on/off, teleports.
class InstanceManager extends Base {
  ShowHintFromInstanceMngr(text) { this.game.hint(text); }
  PlayerStatus(on) { this.game.setControl(on); }
  AlignPlayerToTransforn(t) { if (t) this.game.fish.align(t); this.game.snapCamera(); }
  DeactivateGoPrompt(on) { this.game.ui.setActive('hud', 'JumpGoPRomptParent/JumpGoPrompt', !!on); }
}

// AS.TimelineController: plays the PlayableDirector on its object.
class TimelineController extends Base {
  Play() { this.game.playTimeline(this.path); }
  CameraBlendStateCut() { /* camera cuts are already hard cuts here */ }
}

// AS.FadeCall.Fade -> AS.Fading.DoFading(Mode, Speed, wait) on the HUD Fader (constructor defaults: Speed 1, wait 1).
class FadeCall extends Base {
  Fade() { this.game.fadeTo(this.data.Mode || 0, this.data.Speed ?? 1, this.data.wait ?? 1); }
}

// AS.ButtonEventsAssign: entering its trigger shows the HUD action button ("TAP!") wired to OnButtonClick.
class ButtonEventsAssign extends Base {
  AssignEvents() { this.game.assignAction(this); }
  click() { this.game.events.run(this.data.OnButtonClick); }
}

// EventTriggers: OnEnable / OnDisable events of its GameObject.
class EventTriggers extends Base {
  onEnable() { this.game.events.run(this.data.OnEnableEvent); }
  onDisable() { this.game.events.run(this.data.OnDisableEvents); }
}

export const CORE = { ActivityManager, InstanceManager, TimelineController, FadeCall, ButtonEventsAssign, EventTriggers };
export { Base };
