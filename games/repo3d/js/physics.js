import RAPIER from '../vendor/rapier.es.js';
import { CFG } from './config.js';

export async function createPhysics() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -CFG.gravity, z: 0 });
  world.timestep = 1 / CFG.physicsHz;
  const props = [];

  function fixedBox(x, y, z, hx, hy, hz, opts = {}) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    if (opts.rotY) body.setRotation(quatY(opts.rotY), false);
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(opts.friction ?? 0.7), body);
    return body;
  }

  function dynamicBody(shape, pos, mass, mesh, tag) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
        .setLinearDamping(0.05).setAngularDamping(0.25).setCcdEnabled(true),
    );
    const col = world.createCollider(shape.setMass(mass).setFriction(0.6).setRestitution(0.15), body);
    const rec = { body, col, mesh, tag, prevVel: { x: 0, y: 0, z: 0 } };
    props.push(rec);
    return rec;
  }

  function remove(rec) {
    const i = props.indexOf(rec);
    if (i >= 0) props.splice(i, 1);
    world.removeRigidBody(rec.body);
  }

  function snapshotVelocities() {
    for (const p of props) {
      const v = p.body.linvel();
      p.prevVel.x = v.x; p.prevVel.y = v.y; p.prevVel.z = v.z;
    }
  }

  function syncMeshes() {
    for (const p of props) {
      if (!p.mesh) continue;
      const t = p.body.translation(), r = p.body.rotation();
      p.mesh.position.set(t.x, t.y, t.z);
      p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  function castRay(origin, dir, maxToi, excludeCollider) {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = world.castRayAndGetNormal(ray, maxToi, true, undefined, undefined, excludeCollider);
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    return { collider: hit.collider, toi: hit.timeOfImpact, point: p, normal: hit.normal, rec: props.find((q) => q.col === hit.collider || (q.cols && q.cols.some((c) => c.handle === hit.collider.handle))) || null };
  }

  return { R: RAPIER, world, props, fixedBox, dynamicBody, remove, snapshotVelocities, syncMeshes, castRay };
}

export function quatY(a) {
  return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
}
