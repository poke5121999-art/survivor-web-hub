// City map menu (MartMenuController): every mart in RC_MartOrder, how far each is (finished mats / total,
// PlayerHumanController.GetCompletionRate) and the idle income it holds: floor(completion x martMaxIdleIncomeList[i]),
// collectable once per requiredTimeForCollection = 10800 s (MartMenuController.c:32) since the last collect.
export const IDLE_EVERY = 10800;

// marts: data/marts.json; global: { mart, visited[], idleAt{id: ms} }; doneOf(id): finished mats of a visited mart.
export function martRows(marts, global, doneOf, now) {
  return marts.map(m => {
    const visited = global.visited.includes(m.id);
    const rate = visited ? Math.min(1, doneOf(m.id) / m.mats) : 0;
    const amount = Math.floor(rate * m.idle);
    const at = global.idleAt[m.id];
    const left = at == null ? IDLE_EVERY : Math.max(0, IDLE_EVERY - (now - at) / 1000);
    return { id: m.id, name: m.name, visited, here: m.id === global.mart, rate, amount, left, ready: visited && amount > 0 && left <= 0 };
  });
}
