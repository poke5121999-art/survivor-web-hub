import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
GAME = r'D:\pokeone-ref\extract\app\files'
DATA = os.path.join(GAME,'PokeOne_Data')
CORE = ['globalgamemanagers','globalgamemanagers.assets','resources.assets','sharedassets0.assets',
        'sharedassets1.assets','sharedassets2.assets','level0','level1','level2']
_gen = None
def gen():
    global _gen
    if _gen is None:
        _gen = TypeTreeGenerator('2018.4.36f1')
        _gen.load_local_dll_folder(r'D:\pokeone-ref\il2cpp\DummyDll')
    return _gen
def load_core():
    env = UnityPy.load(*[os.path.join(DATA,f) for f in CORE])
    env.typetree_generator = gen()
    return env
def files(env):
    return {os.path.basename(k): v for k, v in env.files.items()}
def script_name(o):
    try:
        d = o.read(check_read=False)
        return d.m_Script.read().m_Name
    except Exception:
        return None

import struct
_scripts = None
def scripts(env):
    """(file_index, path_id) of MonoScript -> (assembly, fullname), resolved by name of the file holding it."""
    global _scripts
    if _scripts is None:
        _scripts = {}
        for name, sf in files(env).items():
            if not hasattr(sf, 'objects'): continue
            for pid, o in sf.objects.items():
                if o.type.name == 'MonoScript':
                    d = o.read()
                    full = (d.m_Namespace + '.' if d.m_Namespace else '') + d.m_ClassName
                    _scripts[(name, pid)] = (d.m_AssemblyName, full)
    return _scripts

def script_of(env, o):
    raw = o.get_raw_data()
    fid, = struct.unpack_from('<i', raw, 12 + 4)
    pid, = struct.unpack_from('<q', raw, 12 + 4 + 4)
    sf = o.assets_file
    if fid == 0:
        fname = os.path.basename(sf.name)
    else:
        fname = os.path.basename(sf.externals[fid - 1].path)
    return scripts(env).get((fname, pid))

def read_mb(env, o):
    s = script_of(env, o)
    if not s: return None, None
    asm, full = s
    try:
        nodes = gen().get_nodes_up(asm, full)
        return full, o.read_typetree(nodes)
    except Exception as e:
        return full, None
