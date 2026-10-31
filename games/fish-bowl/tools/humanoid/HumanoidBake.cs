// Bakes Humanoid (muscle) AnimationClips onto the transforms of one rig, for the web build that has no Mecanim.
// Run by bake_humanoid.sh in a throwaway project: rig.json (bone tree in Unity coordinates, from art/env/scene.json),
// the Avatar asset and the clips (from the AssetRipper project) sit in Assets/Bake.
// Output baked.json: {clip: {length, fps, root: [[px,py,pz,qx,qy,qz,qw] per frame], bones: {path: [[same] per frame]}}}
// in Unity coordinates, local to each bone's parent. root = the Animator GameObject with applyRootMotion, starting at
// identity, i.e. the clip's own root motion that Timeline then places with the clip/track offsets.
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.Animations;
using UnityEngine.Playables;

public static class HumanoidBake
{
    [System.Serializable] class Node { public string n; public int p; public float[] t; public float[] r; public float[] s; }
    [System.Serializable] class Rig { public string avatar; public Node[] nodes; public string[] clips; }

    const float Fps = 30f;

    static string F(float v) => v.ToString("0.#####", CultureInfo.InvariantCulture);

    public static void Run()
    {
        var rig = JsonUtility.FromJson<Rig>(File.ReadAllText("Assets/Bake/rig.json"));
        var gos = new GameObject[rig.nodes.Length];
        var paths = new string[rig.nodes.Length];
        for (int i = 0; i < rig.nodes.Length; i++)
        {
            var n = rig.nodes[i];
            gos[i] = new GameObject(n.n);
            if (n.p >= 0) gos[i].transform.SetParent(gos[n.p].transform, false);
            gos[i].transform.localPosition = new Vector3(n.t[0], n.t[1], n.t[2]);
            gos[i].transform.localRotation = new Quaternion(n.r[0], n.r[1], n.r[2], n.r[3]);
            gos[i].transform.localScale = new Vector3(n.s[0], n.s[1], n.s[2]);
            paths[i] = n.p < 0 ? "" : (n.p == 0 ? n.n : paths[n.p] + "/" + n.n);
        }
        var root = gos[0];
        var animator = root.AddComponent<Animator>();
        animator.avatar = AssetDatabase.LoadAssetAtPath<Avatar>("Assets/Bake/" + rig.avatar);
        animator.applyRootMotion = true;
        Debug.Log($"[bake] avatar {animator.avatar} human={animator.isHuman} valid={(animator.avatar ? animator.avatar.isValid : false)}");

        var rest = new List<(Vector3, Quaternion)>();
        foreach (var g in gos) rest.Add((g.transform.localPosition, g.transform.localRotation));

        var sb = new StringBuilder("{");
        bool firstClip = true;
        foreach (var name in rig.clips)
        {
            var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>("Assets/Bake/" + name + ".anim");
            if (clip == null) { Debug.LogError("[bake] missing clip " + name); continue; }
            for (int i = 0; i < gos.Length; i++) { gos[i].transform.localPosition = rest[i].Item1; gos[i].transform.localRotation = rest[i].Item2; }
            var graph = PlayableGraph.Create("bake");
            graph.SetTimeUpdateMode(DirectorUpdateMode.Manual);
            var output = AnimationPlayableOutput.Create(graph, "out", animator);
            var playable = AnimationClipPlayable.Create(graph, clip);
            playable.SetApplyFootIK(false);
            output.SetSourcePlayable(playable);
            graph.Play();
            int frames = Mathf.Max(2, Mathf.CeilToInt(clip.length * Fps) + 1);
            var tracks = new StringBuilder[gos.Length];
            for (int i = 0; i < gos.Length; i++) tracks[i] = new StringBuilder();
            double prev = 0;
            for (int f = 0; f < frames; f++)
            {
                double t = System.Math.Min(clip.length, f / (double)Fps);
                playable.SetTime(t);
                graph.Evaluate(f == 0 ? 0f : (float)(t - prev));
                prev = t;
                for (int i = 0; i < gos.Length; i++)
                {
                    var tr = gos[i].transform;
                    var p = tr.localPosition; var q = tr.localRotation;
                    if (f > 0) tracks[i].Append(',');
                    tracks[i].Append('[').Append(F(p.x)).Append(',').Append(F(p.y)).Append(',').Append(F(p.z)).Append(',')
                        .Append(F(q.x)).Append(',').Append(F(q.y)).Append(',').Append(F(q.z)).Append(',').Append(F(q.w)).Append(']');
                }
            }
            graph.Destroy();
            if (!firstClip) sb.Append(',');
            firstClip = false;
            sb.Append('"').Append(name).Append("\":{\"length\":").Append(F(clip.length)).Append(",\"fps\":").Append(F(Fps))
              .Append(",\"human\":").Append(clip.humanMotion ? "true" : "false")
              .Append(",\"root\":[").Append(tracks[0]).Append("],\"bones\":{");
            for (int i = 1; i < gos.Length; i++)
            {
                if (i > 1) sb.Append(',');
                sb.Append('"').Append(paths[i]).Append("\":[").Append(tracks[i]).Append(']');
            }
            sb.Append("}}");
            Debug.Log($"[bake] {name}: {frames} frames, length {clip.length}, human {clip.humanMotion}");
        }
        sb.Append('}');
        File.WriteAllText("baked.json", sb.ToString());
        Debug.Log("[bake] done");
    }
}
