#!/bin/sh
# Rebuild the Lanternfall source that every line number in lib/lf/, tools/port-lf-*.js and SKILL-NOTES.md points to.
# Usage: sh scripts/fetch-lanternfall.sh [dest=~/lanternfall-ref]   (needs git; network on first run)
# Then:  LF_SRC=<dest>/repo node tools/port-lf-all.js   and   LF_SRC=<dest>/repo node tools/gate.js
set -eu
DEST="${1:-$HOME/lanternfall-ref}"
COMMIT=ada0fd528d3dfdf860719e65e7b2a7f8017119f9
mkdir -p "$DEST"
if [ ! -d "$DEST/repo/.git" ]; then
  # autocrlf off so the working tree holds the same LF bytes git stores (the hashes below are of those bytes)
  timeout 300 git -c core.autocrlf=false clone https://github.com/loktar00/lanternfall "$DEST/repo"
fi
git -C "$DEST/repo" -c core.autocrlf=false checkout -q "$COMMIT"
fail=0
check() {
  # hash the LF form, so a checkout made with core.autocrlf=true verifies too
  got=$(tr -d '\r' < "$DEST/repo/$1" | sha256sum | cut -c1-64)
  if [ "$got" = "$2" ]; then echo "ok       $1"; else echo "MISMATCH $1 (got $got)"; fail=1; fi
}
check src/00-util.js      a0754ad14342dee3f8a57a99337ff6869aab58d79e4343e6cec8566ae793db50
check src/10-kit.js       d7035f2698ac4e59bdeba1270a6d254b7bde4a86ad5504481896a5f6ef0ef361
check src/20-human.js     cf64ffed5b0cad8e8e5ee2706555537d7f554999df02b8fd843c3d4c4239dbc1
check src/20b-wardrobe.js e4f349e57a72cfd96bcfaebffb57b04ad014b8d68e7951985ca0601923b5f5cf
check src/21-heroes.js    89c060006e632e21800ad1f0e22743c70032d8f530947444f20386f19ce0822c
check src/22-monsters.js  3976e87da0ff2d8811d6db1406e96bf1120d39900e7abb26aec33fa3dfd677b1
check src/25-anim.js      457bac81ec67263701362898f85b5a678eeba88710e9814188e7876b60ebbdff
check src/30-world.js     fd4035ee80fc36396bb4c32cc72d86a028941317f004eb233bef23060d873299
check src/40-post.js      d66d9d26c07069897b4628c3059a5aacf9f8a75564e58d56167e4ee3df3edad8
check src/50-fx.js        301f5f2819a348ec6531376445d0aa3fba1485dc92d574c238f8f401281fe71c
check src/90-main.js      a95ac12e84fa7c6f36d60d0b2178e93b3639e5316206795da364a155a48cba1a
[ "$fail" = 0 ] || { echo "source does not match Lanternfall @ ${COMMIT}; line numbers will be off"; exit 1; }
echo "LF_SRC=$DEST/repo"
