# -*- coding: utf-8 -*-
"""Sinh games/ho-xanh/data/fish_spawn.js: vùng + độ sâu + giờ hoạt động hợp lệ của từng loài cá.

    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/spawn_data.py

Vì sao lấy từ wiki chứ không phải bản gốc [ĐO 2026-09-25]:
  Đã soát toàn bộ MonoBehaviour của các scene A01, B01, C03 (mọi lớp có tên chứa "Fish"/"Spawn":
  xem FishAllocator, FishGroupController, FishWayPoint, AreaStopFishAlloc, BoidsGroupManager,
  BoidAIManager qua level.load_with_deps + o.read_typetree()). Kết quả:
  - FishGroupController mỗi scene chỉ là một GameObject rỗng tên theo mã bản đồ (FishGroup_A_1_NEW
    ở A01, FishGroup_A_2_NEW ở A02, ... FishGroup_C_4 ở C04) — không có trường nào, không mang danh
    sách loài.
  - FishAllocator (đặt tay, có toạ độ + FishWayPoint) chỉ xuất hiện 1-2 lần mỗi scene và toàn trỏ
    tới "Fishmon" — cá nhiệm vụ/tuần đặt tên riêng (TID 2011xxx, bảng GameDataSheet "Fishmon", vd
    "Warrior_Green_Humphead_Parrotfish", "Titanium_Titan_Triggerfish") — không phải cá thường bơi
    theo đàn (TID 2010xxx) mà rip.py đã bóc vào assets.js.
  - BoidsGroupManager/BoidAIManager.settings trỏ sang một asset "GroupBoidSetting" dùng chung mọi
    zone (chỉ có minSpeed/maxSpeed/perceptionRadius…, số điều khiển hành vi đàn, không phải danh
    sách loài); "boidsGroups"/"boids" rỗng trong dữ liệu tĩnh (sinh lúc chạy).
  - DR_GameData_Fish.json (FishInfoData) không có trường vùng/độ sâu nào ngoài thư mục Spine gốc
    (Fish/A|B|C/<loài>/) mà rip.py đã đọc thành "zone" trong assets.js. Trường "SourcePath" không
    khớp bảng nào tìm được (không phải DR_GameData_Fishing.json — bảng đó là minigame câu cá DLC
    Jungle, TID 42xxx, hoàn toàn khác).
  => Bản gốc không lưu danh sách loài theo từng bản đồ con (A01 so với A02…) hay theo dải mét chi
  tiết hơn ba vùng A/B/C — mọi giả thuyết ngược lại đã bị loại bằng cách đọc trực tiếp dữ liệu.
  Phần bảng gốc CÓ nhưng ta chưa dùng: fandom wiki (dave-the-diver.fandom.com), trang mỗi loài có
  hộp "Infobox ingredient" với trường "active_time" (day/night/both) — bản gốc CÓ phân biệt cá theo
  giờ, nhưng js/fish.js hiện không lọc theo đó. Trang "Blue Hole Shallows" còn ghi rành mạch một
  ngoại lệ theo bản đồ: bản rừng tảo (map A06) không có Sheepshead và Striped Catfish.
  Script này gọi thẳng API wiki (action=parse, prop=wikitext) mỗi lần chạy để lấy active_time mới
  nhất và xác nhận câu ngoại lệ rừng tảo còn đúng nguyên văn; nhãn mọi số trong tệp ra là [WIKI].

Không có mạng thì giữ nguyên data/fish_spawn.js cũ (in cảnh báo), để lỗi mạng không xoá dữ liệu.
"""
import io, json, os, re, sys, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
DATA = os.path.join(GAME, 'data')
API = 'https://dave-the-diver.fandom.com/api.php'
WIKI_SHALLOWS_URL = 'https://dave-the-diver.fandom.com/wiki/Blue_Hole_Shallows'

# dải mét gốc của từng vùng, y hệt data/tuning.js dive.bands [DtD wiki] (không đụng tuning.js,
# chép lại hằng số ở đây để tệp này tự đứng độc lập).
BANDS = {'A': [0, 50], 'B': [50, 130], 'C': [130, 250]}

# id nội bộ (thư mục Spine, cột "id" trong assets.js) -> tên trang wiki, khi khác cách đổi mặc định
# (bỏ gạch dưới). Tra bằng tay 2026-09-25, so khớp với danh mục "Shallows/Medium Depth/Depths Fish".
TITLE_OVERRIDE = {
    'Bluetang': 'Blue Tang', 'Smallspotted_dart': 'Small Spotted Dart', 'Stellate_Puffer': 'Starry Puffer',
    'Asian_Sheepshead': 'Sheepshead', 'GreatSpiderCrab': 'Spider Crab', 'Pacificfanfish': 'Pacific Fanfish',
    'Bloodbelly_Comb_Jelly': 'Blood-belly Comb Jellyfish', 'Mediterranean_Rainbow_Wrasse': 'Rainbow Wrasse',
    'Ruby_CardinalFish': 'Cardinal Fish', 'Red_Mullet': 'Striped Red Mullet', 'Devil_ScorpionFish': 'Devil Scorpionfish',
    'CuttleFish': 'Cuttlefish', 'SpearSquid': 'Spear Squid', 'Box_JellyFish': 'Box Jellyfish',
    'Harlequin_hind': 'Harlequin Hind', 'Juvenile_Circular_BatFish': 'Orbicular Batfish',
    'Reef_Triggerfish': 'Lagoon Triggerfish', 'SquareSpot_Anthias': 'Sea Goldie', 'Warty_Frogfish': 'Clown Frogfish',
}
# Không có trang riêng trên wiki (nội dung cắt/chưa dùng — assets.js đã có rank -1 cho loài này,
# js/fish.js lọc rank>0 nên không bao giờ sinh ra; vẫn ghi entry mặc định cho đủ danh sách).
NO_WIKI_PAGE = {'Cow_Pattern_Snapper'}

# Map rừng tảo A06 không có hai loài này dù cùng vùng A [WIKI Blue_Hole_Shallows, đoạn "special
# seaweed map... a few exceptions, notably the aggressive Sheepshead and Striped Catfish"].
KELP_EXCLUDE_MAP = 'A06'
KELP_EXCLUDE_SPECIES = ['Asian_Sheepshead', 'Striped_Catfish']
KELP_EXCLUDE_QUOTE = '[[Sheepshead]] and [[Striped Catfish]]'


def http_get(params):
    url = API + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (ho-xanh spawn_data.py)'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode('utf-8'))


def wikitext(title):
    d = http_get({'action': 'parse', 'page': title, 'format': 'json', 'prop': 'wikitext', 'redirects': 1})
    if 'error' in d:
        return None
    return d['parse']['wikitext']['*']


def category_members(cat):
    d = http_get({'action': 'query', 'list': 'categorymembers', 'cmtitle': 'Category:' + cat,
                  'cmlimit': 500, 'format': 'json'})
    return [m['title'] for m in d['query']['categorymembers']]


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def resolve_title(sid, cat_members):
    if sid in TITLE_OVERRIDE:
        return TITLE_OVERRIDE[sid]
    default = sid.replace('_', ' ')
    import difflib
    best = difflib.get_close_matches(norm(default), [norm(c) for c in cat_members], n=1, cutoff=0.6)
    if best:
        return cat_members[[norm(c) for c in cat_members].index(best[0])]
    return default


def field(wikitext_, name):
    m = re.search(r'\|\s*%s\s*=\s*([^\n|}]*)' % name, wikitext_)
    return m.group(1).strip() if m else None


def norm_active(v):
    v = (v or '').strip().lower()
    if v.startswith('night'):
        return 'night'
    if v.startswith('both'):
        return 'both'
    return 'day'  # mặc định wiki: đa số loài chỉ ghi 'day', hoặc không có trang (Cow_Pattern_Snapper)


def load_assets_species():
    src = io.open(os.path.join(DATA, 'assets.js'), encoding='utf-8').read()
    obj = json.loads(src[src.index('=') + 1:].strip().rstrip(';'))
    return obj['fish']


def main():
    species = load_assets_species()
    print('assets.js: %d loài cá' % len(species))

    cats = {}
    for cat, area in [('Shallows_Fish', 'A'), ('Medium_Depth_Fish', 'B'), ('Depths_Fish', 'C')]:
        try:
            cats[area] = category_members(cat)
        except Exception as e:
            print('LỖI mạng khi lấy danh mục %s: %s — giữ nguyên fish_spawn.js cũ.' % (cat, e))
            return 1

    shallows_wt = wikitext('Blue Hole Shallows') or ''
    if KELP_EXCLUDE_QUOTE not in shallows_wt:
        print('CẢNH BÁO: không thấy câu ngoại lệ rừng tảo trên wiki nữa — kiểm lại KELP_EXCLUDE_* bằng tay.')

    out = {}
    misses = []
    for sp in species:
        sid = sp['id']
        area = sp['zone']
        title = resolve_title(sid, cats.get(area, []))
        wt = None if sid in NO_WIKI_PAGE else wikitext(title)
        active = norm_active(field(wt, 'active_time')) if wt else 'day'
        src = field(wt, 'source') if wt else None
        if wt and src and area == 'A' and src not in ('shallows',):
            misses.append((sid, area, src, title))
        if wt and src and area == 'B' and src not in ('medium', 'stalactite'):
            misses.append((sid, area, src, title))
        if wt and src and area == 'C' and src not in ('depths',):
            misses.append((sid, area, src, title))
        entry = {'depth': BANDS[area], 'active': active, '_title': title, '_src': src}
        if sid in KELP_EXCLUDE_SPECIES:
            entry['excludeMaps'] = [KELP_EXCLUDE_MAP]
        out[sid] = entry
        print('  %-30s area=%s wiki="%-28s" active=%-5s source=%s' % (sid, area, title, active, src))

    if misses:
        print('CẢNH BÁO: vùng lệch giữa assets.js (thư mục Spine gốc) và wiki:')
        for m in misses:
            print('   ', m)

    lines = []
    lines.append('// Sinh bởi tools/spawn_data.py — đừng sửa tay. Nguồn: dave-the-diver.fandom.com (đọc lại mỗi lần chạy).')
    lines.append('// depth = dải mét của cả vùng A/B/C [DtD wiki, giống data/tuning.js dive.bands]: bản gốc và wiki đều')
    lines.append('// không chia nhỏ hơn ba vùng này cho cá thường (xem chú thích đầu spawn_data.py).')
    lines.append('// active = giờ loài đó xuất hiện trên wiki (Infobox ingredient |active_time=) [WIKI]: day | night | both.')
    lines.append('// excludeMaps = bản đồ trong vùng KHÔNG có loài này dù cùng vùng A/B/C [WIKI Blue_Hole_Shallows].')
    lines.append('window.HX_FISH_SPAWN = {')
    for sid in sorted(out):
        e = out[sid]
        extra = ''
        if 'excludeMaps' in e:
            extra = ', excludeMaps: %s' % json.dumps(e['excludeMaps'])
        lines.append('  %s: { depth: %s, active: %s%s }, // wiki "%s"%s' % (
            json.dumps(sid), json.dumps(e['depth']), json.dumps(e['active']), extra,
            e['_title'], '' if e['_src'] else ' (không có trang wiki, mặc định day)'))
    lines.append('};')
    out_path = os.path.join(DATA, 'fish_spawn.js')
    io.open(out_path, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    print('Đã ghi', out_path)
    return 0


if __name__ == '__main__':
    sys.exit(main())
