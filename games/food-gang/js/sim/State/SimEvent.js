// Simulation events for the view. agent/other are agent ids (-1 = none), bullet a bullet id.

export const SimEventType = Object.freeze({
  AgentJumped: 0,
  AgentActionStarted: 1,      // agent, flag = isSpecial, int = action index
  AgentActionEnded: 2,
  AgentMeleeWindowOpened: 3,
  AgentMeleeWindowClosed: 4,
  AgentShootTriggered: 5,     // agent, value = angle offset (deg), value2 = offsetY, flag = isSpecial
  AgentBuffTriggered: 6,
  AgentTookDamage: 7,         // agent = target, other = source, value = amount (negative = heal), pos = hit position
  AgentHitBlocked: 8,
  AgentDied: 9,               // agent, other = killer, int = death count, flag = special kill
  AgentRespawned: 10,
  BulletSpawned: 11,          // bullet, agent = source, int = bullet data index, pos
  BulletRebounded: 12,        // bullet, pos
  BulletDestroyed: 13,        // bullet, int = bullet data index, pos, flag = from boss
  AllPlayersSpawned: 14,
  BossSpawned: 15,
  GameOverTriggered: 16,      // int = winner team, other = winner slot, flag = time-out
});

export const SIM_EVENT_TYPE_COUNT = 17;

export function createSimEvent(type, tick, o) {
  return {
    type,
    tick,
    agent: o && o.agent !== undefined ? o.agent : -1,
    other: o && o.other !== undefined ? o.other : -1,
    bullet: o && o.bullet !== undefined ? o.bullet : -1,
    int: o && o.i !== undefined ? o.i : 0,
    value: o && o.value !== undefined ? o.value : 0,
    value2: o && o.value2 !== undefined ? o.value2 : 0,
    flag: o && o.flag !== undefined ? o.flag : false,
    pos: o && o.pos ? { x: o.pos.x, y: o.pos.y } : { x: 0, y: 0 },
  };
}
