// English texts of the localization keys the match and result screens use (D:\foodgang-ref\export\text\English.txt).
const EN = {
  'title.rank.1': '1st', 'title.rank.2': '2nd', 'title.rank.3': '3rd', 'title.rank.4': '4th',
  'title.respawn': 'BACK IN:', 'title.end.draw': 'DRAW', 'title.end.timeout': 'TIME OUT!', 'title.end.victory': 'VICTORY',
  'title.end.defeat': 'DEFEAT', 'title.ranking.draw': 'DRAW', 'game.ready': 'READY?', 'game.start': 'BATTLE!',
  'mission.dm.2vs2': 'Gang Battle', 'mission.dm.ffa': 'Food Battle', 'mission.kill.ffa': 'Fast Food', 'mission.kill.2vs2': 'Fast Gang',
  'mission.survive.ffa': 'Last Food Standing', 'mission.survive.2vs2': 'Last Gang Standing', 'mission.killboss.1vs3': 'Boss Rush',
  'stage.1': 'Kitchen', 'stage.2': 'Dining table', 'stage.3': 'Pantry', 'info.searching': 'Searching opponents...',
  'info.exit': 'EXIT', 'reward.open.free': 'CLAIM', 'reward.open.ad': 'CLAIM', 'info.playagain': 'PLAY AGAIN',
  'lucky.fridge': 'Lucky fridge!', 'super.lucky.fridge': 'Super Lucky fridge!',
};

export const T = (k) => EN[k] ?? k;

// Localize components: the scene text is the designer's placeholder, the key gives the shipped string
export function localize(root) {
  const st = [root];
  while (st.length) {
    const n = st.pop();
    const l = n.script('Localize');
    if (l && l.fields.m_key && EN[l.fields.m_key]) {
      const t = (l.fields.m_text && n.scene ? n.scene.ref(l.fields.m_text) : null) || n.get('Text');
      if (t && t.setText) t.setText(EN[l.fields.m_key]);
    }
    for (const c of n.children) st.push(c);
  }
}
