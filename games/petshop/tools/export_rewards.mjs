// node tools/export_rewards.mjs -> data/rewards.json: LevelRewardUIHelper.rewardDataList (level store scene node) as
// { level: [{ name, icon }] }; rewardDataList[i] is shown when the store reaches level i + 1. Icons are the sprites
// export_ui.py already wrote (art/ui/<name>_<pathId>.webp); a sprite that was not exported gets icon null.
import fs from 'fs';
const G = new URL('../', import.meta.url);
const s = JSON.parse(fs.readFileSync(new URL('art/store/scene.json', G)));
const files = fs.readdirSync(new URL('art/ui/', G));
const node = s.nodes.find(n => n.k && n.k.LevelRewardUIHelper);
const out = {};
node.k.LevelRewardUIHelper.rewardDataList.forEach((r, i) => {
  if (!r.subRewardList.length) return;
  out[i + 1] = r.subRewardList.map(x => {
    const id = x.rewardSprite && x.rewardSprite.id;
    const f = id != null ? files.find(fn => fn === `reward_${id}.webp`) : null;
    return { name: x.name, icon: f || null };
  });
});
fs.writeFileSync(new URL('data/rewards.json', G), JSON.stringify(out));
console.log(JSON.stringify(out));
