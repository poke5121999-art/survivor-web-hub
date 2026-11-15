// Fault-tolerant registry for the showcase/tools: a broken group file logs an error
// instead of blanking the whole page. Games should import lib/index.js instead.
const GROUPS = ['concrete', 'drums', 'furniture', 'metal', 'workshop', 'vehicles'];
const res = await Promise.allSettled(GROUPS.map((g) => import(`./${g}.js`)));
export const PROPS = [];
res.forEach((r, i) => {
  if (r.status === 'fulfilled') PROPS.push(...(r.value.PROPS || []));
  else console.error(`props/${GROUPS[i]}.js failed to load: ${r.reason?.message || r.reason}`);
});
const BY_ID = new Map(PROPS.map((p) => [p.id, p]));
export const propInfo = (id) => BY_ID.get(id);
