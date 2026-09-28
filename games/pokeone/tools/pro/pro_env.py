"""Nạp gói PRO (D:\pro-ref) một lần và tra ảnh theo đường dẫn Resources (vd 'tiles/12', 'pbig/25')."""
import json, os, UnityPy

PRO = os.environ.get('PRO_REF', r'D:\pro-ref')
BUNDLE = os.path.join(PRO, 'PROClient', 'PROClient_Data', 'data.unity3d')


class ProEnv:
    def __init__(self):
        self.env = UnityPy.load(BUNDLE)
        rm = next(o for o in self.env.objects if o.type.name == 'ResourceManager')
        self.paths = {k: v['m_PathID'] for k, v in rm.read_typetree()['m_Container']}
        self.res = {o.path_id: o for o in self.env.objects if o.assets_file.name == 'resources.assets'}

    def obj(self, path):
        return self.res[self.paths[path]]

    def image(self, path):
        return self.obj(path).read().image

    def text(self, path):
        s = self.obj(path).read().m_Script
        return s if isinstance(s, str) else s.decode('utf-8', 'replace')

    def listdir(self, prefix):
        pre = prefix.rstrip('/') + '/'
        return sorted(p[len(pre):] for p in self.paths if p.startswith(pre) and '/' not in p[len(pre):])
