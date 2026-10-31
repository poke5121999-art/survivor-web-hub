"""Export the Lumber Inc characters, tools, wood props, cash and trucks (several prefabs per output, side by side as roots).

Usage: cd games/lumber-inc/tools && PYTHONIOENCODING=utf-8 py -3.12 export_chars.py [chars|props]

art/chars/  player + workers + toolbag + worker tools (Animator + Animancer rigs, SkinnedMeshRenderer)
art/props/  logs, peeled logs, blocks, holder, cash, trucks
Roots are listed in scene.json in the order below. Each calls export_world.py --paths (own process: it holds a few GB).
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
B = "Assets/ResAddressable/FolderMode/"
CH = B + "Characters/Prefabs/"
SETS = {
    "chars": [CH + "Settled/" + n + ".prefab" for n in (
        "Pre_Role001", "Pre_Timber001", "Pre_Timber002", "Pre_Timber003", "Pre_Timber004",
        "Pre_Carrier001", "Pre_Carrier002", "Pre_Builder001", "Pre_ToolBag")]
    + [CH + "Attachment/EmpTools/" + n + ".prefab" for n in (
        "EmpTool_Axe", "EmpTool_Saw", "EmpTool_Cart", "EmpTool_TreeCar", "EmpTool_TreeCar2", "EmpTool_CarryCar",
        "EmpTool_CarryCar2", "EmpTool_Hammer")],
    "props": [B + "Buildings/Factory/Prefabs/" + n + ".prefab" for n in (
        "Pre_Wood1", "Pre_Wood2", "Pre_Wood3", "Pre_Peel_Wood1", "Pre_Peel_Wood2", "Pre_Wood_Block1",
        "Pre_Wood_Block2", "Pre_Holder")]
    + [B + "Maps/Box/Pre_Cash.prefab"]
    + [B + "Vehicles/Truck/Pre_Car_Truck%d.prefab" % i for i in (1, 2, 3)],
}


def main():
    which = sys.argv[1:] or list(SETS)
    for w in which:
        r = subprocess.run([sys.executable, os.path.join(HERE, "export_world.py"), w, "--paths", ",".join(SETS[w])], cwd=HERE)
        if r.returncode:
            sys.exit(r.returncode)


if __name__ == "__main__":
    main()
