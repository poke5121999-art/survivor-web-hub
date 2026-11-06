// Player cosmetics on the store rig (rules/census-cosmetics.md), data and meshes from tools/export_cosmetics.py:
// SkinController.AssignSkin swaps the body mesh (stickman_Player), OutfitController.AssignOutfit draws a second skinned
// mesh on the same 22 bones (OutfitBonesAssigner), HatController.AssignHat puts a static mesh in HatSlotTransform (1).
// Each mesh keeps its own bind poses. The pet (PetView) is one of the PetVisuals prefabs from art/pets: it walks to
// PetRelativePos (2.5 right, 3 behind the player) at speed 24, stops within 0.5, and plays Run while it moves.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { makeMaterial, addSmoothNormals } from './toon.js';
import { attachRigs } from './anim.js';

const PET_SPEED = 24, PET_STOP = 0.5;
const v3 = new THREE.Vector3(), q4 = new THREE.Quaternion();

function sub(root, name) {
  let hit = null;
  root.traverse(o => { if (!hit && o.name === name) hit = o; });
  return hit;
}

export class Looks {
  // data: cosmetics.json; gltf: cosmetics.glb; player: the Player_Chef object; pets: { scene, gltf } of art/pets (lazy).
  constructor({ data, gltf, texBase, player, anim, loadPets }) {
    Object.assign(this, { data, texBase, player, anim, loadPets });
    this.geo = [];
    gltf.scene.children.forEach(o => {
      const src = o.isMesh ? o : o.children[0];
      o.updateMatrix();
      this.geo[+o.name.slice(1)] = { geometry: src.geometry, q: o.matrix.clone() };
      addSmoothNormals(src.geometry);
    });
    this.mats = data.materials.map(m => makeMaterial({ ...m, tex: m.tex != null ? 0 : null }, texBase, m.tex != null ? [{ name: m.tex }] : [], {}));
    const body = sub(player, 'stickman_Player');
    this.bodyMeshes = body ? body.children.filter(c => c.isSkinnedMesh) : [];
    this.bones = this.bodyMeshes.length ? this.bodyMeshes[0].skeleton.bones : [];
    this.outfitNode = sub(player, 'OutfitMesh');
    this.hatNode = sub(player, 'hat_Clerk') || sub(player, 'HatSlotTransform (1)');
    this.petTarget = sub(player, 'PetRelativePos');
    this.extra = [];
    this.pet = null;
  }

  skeleton(mi) {
    const info = this.data.meshes[mi], g = this.geo[mi];
    return new THREE.Skeleton(this.bones, info.bind.map(a => new THREE.Matrix4().fromArray(a).multiply(g.q)));
  }

  // eq: { skin, outfit, hat, pet } enum ids (the *Preference values).
  apply(eq) {
    const find = (list, id) => list.find(r => r.id === id) || list[0];
    const skin = find(this.data.skins, eq.skin);
    if (skin.mesh != null && this.bodyMeshes.length) {
      const sk = this.skeleton(skin.mesh), g = this.geo[skin.mesh];
      for (const m of this.bodyMeshes) {
        m.geometry = g.geometry;
        m.bind(sk, new THREE.Matrix4());
      }
    }
    for (const o of this.extra) o.parent.remove(o);
    this.extra = [];
    const add = (node, mi, matIdx, skinned) => {
      if (!node || mi == null) return;
      const g = this.geo[mi], m = this.mats[matIdx] || this.mats[0];
      const sk = skinned ? this.skeleton(mi) : null;
      for (const mat of [m.mat, m.outline]) {
        if (!mat) continue;
        let mesh;
        if (skinned) {
          mesh = new THREE.SkinnedMesh(g.geometry, mat);
          mesh.bind(sk, new THREE.Matrix4());
          mesh.frustumCulled = false;
        } else {
          mesh = new THREE.Mesh(g.geometry, mat);
          mesh.applyMatrix4(g.q);
        }
        node.add(mesh);
        this.extra.push(mesh);
      }
    };
    const outfit = find(this.data.outfits, eq.outfit);
    add(this.outfitNode, outfit.mesh, (outfit.mats || [0])[0], true);
    const hat = find(this.data.hats, eq.hat);
    // IsBlockingHat outfits hide the hat (dormant: none of the shop outfits blocks).
    if (!outfit.blocksHat) add(this.hatNode, hat.mesh, (hat.mats || [0])[0], false);
    if (this.hatNode) this.hatNode.visible = true;
    this.setPet(find(this.data.pets, eq.pet));
  }

  async setPet(row) {
    this.petRow = row;
    if (this.pet) { this.pet.obj.parent && this.pet.obj.parent.remove(this.pet.obj); this.pet = null; }
    if (!row || row.prefab == null) return;
    if (!this.petWorld) {
      const [scene, gltf] = await this.loadPets();
      scene.render = {};
      this.petWorld = buildWorld(scene, gltf, { texBase: this.texBase });
      attachRigs(this.anim, this.petWorld);
      this.petRoots = this.petWorld.objects.filter(o => o.userData.node.p === -1);
    }
    if (this.petRow !== row) return;
    const i = this.data.pets.filter(p => p.prefab != null).indexOf(row);
    const obj = this.petRoots[i];
    if (!obj) return;
    let rig = null;
    obj.traverse(o => { if (!rig && o.userData.rig) rig = o.userData.rig; });
    if (rig) for (const s of ['Idle_A', 'Run']) { const a = rig.action(s); if (a) { a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; } }
    this.player.parent.add(obj);
    obj.visible = true;
    this.petTarget.getWorldPosition(v3);
    obj.position.copy(this.player.parent.worldToLocal(v3));
    this.pet = { obj, rig, moving: false };
  }

  // Item i of the carried stack that rides on the pet (past the player's own limit): its slot above the pet's back
  // (StackingSlot_PetSmall/Medium/Big y 2.3/3.0/3.9, step 1.3 per item).
  petSlot(k, out) {
    if (!this.pet) return null;
    const y = { small: 2.3, medium: 3.0, big: 3.9 }[this.petRow.size] || 2.3;
    this.pet.obj.getWorldPosition(out);
    out.y += y + k * 1.3;
    return out;
  }

  update(dt) {
    const p = this.pet;
    if (!p || !this.petTarget) return;
    this.petTarget.getWorldPosition(v3);
    const o = p.obj, par = o.parent;
    const local = par.worldToLocal(v3.clone());
    const dx = local.x - o.position.x, dz = local.z - o.position.z, d = Math.hypot(dx, dz);
    const moving = d > PET_STOP;
    if (moving) {
      const step = Math.min(d, PET_SPEED * dt);
      o.position.x += dx / d * step;
      o.position.z += dz / d * step;
      // Rigs face local -z (see game.js placeAgent).
      q4.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(dx, dz) + Math.PI);
      o.quaternion.slerp(q4, Math.min(1, dt * 12));
    }
    if (p.rig) {
      if (moving !== p.moving) p.rig.play(moving ? 'Run' : 'Idle_A', 0.25);
      p.rig.update(dt);
    }
    p.moving = moving;
  }
}
