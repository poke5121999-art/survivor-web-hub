// Farm gates, rules/gates.md. farms[f].gate = { open, remaining, slide, pendingAIClose, aiGoing }.
// Player gate (farm 0): closed 1.0 s at scene start, then open; the player may lock it for 60 s (free) or 180 s (ad,
// granted at once) while standing at the open gate; nothing opens it early. Closed, it blocks the player and carves the
// navmesh, so rivals cannot path into the farm (their brainrot objective then fails as blocked).
// AI gates (farms 1..3): closed 30/50/40 s from scene start; the player's "Unlock" button (ad, granted at once) opens a
// closed one; after the player steals a brainrot from that farm the gate's ownerAI walks home and then to the close
// button and closes it for 60 s. Closed AI gates block only the player (rivals pass).
import { inBoxXZ, insideBy, dxz } from './util.js';
import { gotoSteal } from './rivals.js';

export function initGates(sim) {
  const G = sim.D.gates;
  sim.state.farms = [{ level: sim.D.farm.level, gate: newGate(G.player.initialClosed) }]
    .concat(sim.D.rivalFarms.map((f, k) => ({ gate: newGate(G.ai[k].initialClosed) })));
  sim.state.farms.forEach((f, i) => sim.emit('gate', { farm: i, open: f.gate.open, remaining: f.gate.remaining }));
}

export function newGate(initial) {
  return initial > 0 ? { open: false, remaining: initial, slide: 0, pendingAIClose: false, aiGoing: false }
    : { open: true, remaining: 0, slide: 1, pendingAIClose: false, aiGoing: false };
}

const gateDef = (sim, f) => (f === 0 ? sim.D.gates.player : sim.D.gates.ai[f - 1]);

export function closeFor(sim, f, seconds) {
  const g = sim.state.farms[f].gate, d = Math.max(0, seconds);
  if (d <= 0) { openGate(sim, f); return; }
  g.open = false;
  g.remaining = d;
  sim.emit('gate', { farm: f, open: false, remaining: d });
}

function openGate(sim, f) {
  const g = sim.state.farms[f].gate;
  const was = g.open;
  g.open = true;
  g.remaining = 0;
  if (!was) sim.emit('gate', { farm: f, open: true, remaining: 0 });
}

export function stepGates(sim, dt) {
  const s = sim.state;
  s.farms.forEach((farm, f) => {
    const g = farm.gate, d = gateDef(sim, f);
    if (!g.open) {
      if (g.remaining <= 0) openGate(sim, f);
      else g.remaining -= dt;
    }
    // slidingGate.localPosition MoveTowards target at slideSpeed (as a 0..1 fraction of the open offset).
    const target = g.open ? 1 : 0, step = d.slideSpeed * dt / Math.max(1e-6, d.openOffset);
    g.slide = g.slide < target ? Math.min(target, g.slide + step) : Math.max(target, g.slide - step);
    if (f > 0) updateAICloseRequest(sim, f);
  });
}

// AIGateController.OnAnyBrainrotStolen: the player stole one of this farm's brainrots.
export function onFarmBrainrotStolen(sim, f) {
  if (f <= 0) return;
  const g = sim.state.farms[f].gate;
  g.pendingAIClose = true;
  g.aiGoing = false;
}

function updateAICloseRequest(sim, f) {
  const g = sim.state.farms[f].gate, d = sim.D.gates.ai[f - 1];
  if (!g.pendingAIClose || d.owner == null) return;
  const a = d.owner + 1, rival = sim.state.actors[a];
  if (!g.aiGoing) {
    const ret = sim.D.rivalFarms[f - 1].returnPoint;   // EnemyFarmManager.ReturnPoint of THIS gate's farm
    if (rival.carry || dxz(rival.pos, ret) > d.returnDistance) return;
    gotoSteal(sim, a, d.closeButton);
    g.aiGoing = true;                                   // set even when GotoSteal refused (gates.md 2.2)
    return;
  }
  if (dxz(rival.pos, d.closeButton) <= d.pressDistance) {
    g.pendingAIClose = false;
    g.aiGoing = false;
    closeFor(sim, f, d.closeAfterTheft);
  }
}

// Player gate buttons (60 s free, 180 s ad) while standing at the open gate.
export function lockPlayerGate(sim, long) {
  if (!sim.state.ui.gateLock) return false;
  const d = sim.D.gates.player;
  closeFor(sim, 0, long ? d.lockLong : d.lockShort);
  sim.tutorial('PlayerGateControls', null);
  return true;
}

// AI gate "Unlock" (ad, granted at once) while standing at a closed AI gate.
export function unlockAIGate(sim, f = sim.state.ui.aiGateUnlock) {
  if (f == null || f <= 0 || sim.state.farms[f].gate.open || sim.state.ui.aiGateUnlock !== f) return false;
  openGate(sim, f);
  sim.tutorial('AIGateOpenButton', null);
  return true;
}

// Farm footprint each gate guards: the player farm interaction volume and the rival farm areas (same 12.8 x 17.5 m).
const guardBox = (sim, f) => (f === 0 ? sim.D.farm.zone : sim.D.rivalFarms[f - 1].area);
// An agent counts as inside a farm when its whole body (NavMeshAgent radius) is inside the fence line.
const agentInside = (sim, f, p) => insideBy(guardBox(sim, f), p, sim.D.rivals[0].agentRadius);

// NavMesh carve of the closed player gate: no agent path into or out of the player farm.
export function pathBlocked(sim, from, to) {
  if (sim.state.farms[0].gate.open) return false;
  return agentInside(sim, 0, from) !== agentInside(sim, 0, to);
}

// Solid prison_gate collider: the player cannot cross a closed gate's farm boundary.
export function playerCrossBlocked(sim, from, to) {
  return sim.state.farms.some((farm, f) => !farm.gate.open && inBoxXZ(guardBox(sim, f), from) !== inBoxXZ(guardBox(sim, f), to));
}

export function insideGateTrigger(sim, f, p) {
  return inBoxXZ(gateDef(sim, f).trigger, p, sim.D.player.radius);
}
