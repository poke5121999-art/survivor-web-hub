// Sky dome, environment map from the sky (no HDRI), lights, and the cloud sea under the islands.
(function () {
  'use strict';
  const PM = globalThis.PM;

  const SKY_FS = `
    uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uMid; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uCloudLit; uniform vec3 uCloudDark;
    uniform sampler2D tNoise; uniform float uTime; uniform float uCover;
    varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      float up = d.y;
      vec3 c = mix(mix(uHorizon, uMid, smoothstep(0.0, 0.09, up)), uZenith, smoothstep(0.06, 0.34, up));
      c = mix(c, uGround, (1.0 - smoothstep(-0.25, 0.0, up)));
      float sd = max(dot(d, uSunDir), 0.0);
      c += uSunCol * (pow(sd, 10.0) * 0.12 + pow(sd, 90.0) * 0.4 + pow(sd, 900.0) * 2.0);
      c += uSunCol * smoothstep(0.99975, 0.9999, sd) * 40.0;
      if (up > -0.02) {
        vec2 p = d.xz / (up + 0.18);
        float n = texture2D(tNoise, p*0.045 + vec2(uTime*0.0016, 0.0)).r;
        float n2 = texture2D(tNoise, p*0.13 - vec2(uTime*0.003, uTime*0.001)).g;
        float dens = smoothstep(uCover, uCover + 0.28, n*0.7 + n2*0.3);
        float thick = smoothstep(uCover + 0.05, uCover + 0.5, n*0.7 + n2*0.3);
        vec3 cc = mix(uCloudLit, uCloudDark, thick*0.8);
        cc += uSunCol * pow(sd, 5.0) * (1.0 - thick) * 1.6;
        c = mix(c, cc, dens * smoothstep(-0.02, 0.12, up) * 0.92);
      }
      gl_FragColor = vec4(c, 1.0);
    }`;

  const SEA_VS = `varying vec3 vWp; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const SEA_FS = `
    uniform sampler2D tNoise; uniform float uTime; uniform float uLevel; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uSunCol; uniform vec3 uSunDir; uniform vec3 uFog;
    varying vec3 vWp;
    float dens(vec2 p){ return texture2D(tNoise, p*0.006 + vec2(uTime*0.0022, 0.0)).r*0.62 + texture2D(tNoise, p*0.021 + vec2(-uTime*0.004, uTime*0.002)).g*0.3 + texture2D(tNoise, p*0.07 + vec2(uTime*0.006, 0.0)).b*0.08; }
    void main(){
      vec2 p = vWp.xz;
      float d = dens(p);
      float thr = 0.3 + uLevel * 0.42;
      float ign = fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      if (d < thr + (ign - 0.5) * 0.035 && uLevel > 0.001) discard;
      float e = 2.5;
      vec3 n = normalize(vec3(dens(p - vec2(e, 0.0)) - dens(p + vec2(e, 0.0)), 0.05 + uLevel*0.05, dens(p - vec2(0.0, e)) - dens(p + vec2(0.0, e))));
      float lit = clamp(dot(n, uSunDir)*0.5 + 0.5, 0.0, 1.0);
      float crest = smoothstep(thr, thr + 0.2, d);
      float back = smoothstep(-1200.0, -100.0, vWp.z);
      vec3 c = mix(uShade, uLit, clamp(uLevel*0.75 + crest*0.2 + (lit - 0.5)*0.5, 0.0, 1.0));
      c += uSunCol * pow(lit, 3.0) * 0.3 * uLevel;
      c *= 0.7 + 0.3*back;
      gl_FragColor = vec4(c, 1.0);
    }`;

  PM.Sky = function (G, theme) {
    const THREE = globalThis.THREE, scene = G.scene;
    const noise = G.bake.noise();
    const sunDir = new THREE.Vector3().fromArray(theme.sunDir).normalize();
    const col = (a) => new THREE.Color().fromArray(a);
    const skyU = { uZenith: { value: col(theme.zenith) }, uHorizon: { value: col(theme.horizon) }, uMid: { value: col(theme.mid) }, uGround: { value: col(theme.ground) }, uSunDir: { value: sunDir }, uSunCol: { value: col(theme.sunCol) },
      uCloudLit: { value: col(theme.cloudLit) }, uCloudDark: { value: col(theme.cloudDark) }, tNoise: { value: noise }, uTime: { value: 0 }, uCover: { value: theme.cover } };
    const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, side: THREE.BackSide, depthWrite: false, depthTest: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`, fragmentShader: SKY_FS });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
    dome.frustumCulled = false; dome.renderOrder = -10;
    scene.add(dome);

    const pm = new THREE.PMREMGenerator(G.renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
    const envRT = pm.fromScene(envScene, 0, 1, 200);
    scene.environment = envRT.texture;
    pm.dispose();

    const key = new THREE.DirectionalLight(col(theme.keyCol), theme.keyInt);
    const keyDir = new THREE.Vector3().fromArray(theme.keyDir).normalize();
    const map = G.map;
    key.position.set(map.w / 2, map.h / 2, 0).addScaledVector(keyDir, 160);
    key.target.position.set(map.w / 2, map.h / 2, 0);
    key.castShadow = true;
    const q = G.quality;
    key.shadow.mapSize.set(q.shadow, q.shadow);
    const sc = key.shadow.camera;
    sc.left = -map.w * 0.56; sc.right = map.w * 0.56; sc.top = map.h * 0.62; sc.bottom = -map.h * 0.62; sc.near = 20; sc.far = 330;
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.25; key.shadow.radius = q.soft ? 2.2 : 1;
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(col(theme.sunCol), theme.rimInt);
    rim.position.copy(sunDir).multiplyScalar(100);
    scene.add(rim);
    const hemi = new THREE.HemisphereLight(col(theme.zenith), col(theme.bounce), theme.hemiInt);
    scene.add(hemi);

    const seaGeo = new THREE.PlaneGeometry(2600, 1500, 1, 1).rotateX(-Math.PI / 2);
    const shells = [];
    for (let i = 0; i < q.cloudShells; i++) {
      const lvl = q.cloudShells === 1 ? 0 : i / (q.cloudShells - 1);
      const m = new THREE.ShaderMaterial({ vertexShader: SEA_VS, fragmentShader: SEA_FS, uniforms: { tNoise: { value: noise }, uTime: skyU.uTime, uLevel: { value: lvl }, uLit: { value: col(theme.seaLit) }, uShade: { value: col(theme.seaShade) }, uSunCol: skyU.uSunCol, uSunDir: { value: sunDir }, uFog: { value: col(theme.fog) } } });
      const mesh = new THREE.Mesh(seaGeo, m);
      mesh.position.set(map.w / 2, map.seaY - 5 + lvl * 5.5, -520);
      mesh.frustumCulled = false;
      scene.add(mesh); shells.push(mesh);
    }

    const env = G.gfx.env;
    env.fogCol.fromArray(theme.fog); env.sunCol.fromArray(theme.sunCol); env.sunDir.copy(sunDir);
    env.fogStart = theme.fogStart; env.fogDen = theme.fogDen; env.seaY = map.seaY; env.mist = theme.mist; env.exposure = theme.exposure; env.bloom = theme.bloom; env.rays = theme.rays;

    return { key, rim, hemi, dome, sunDir, update(dt) { skyU.uTime.value += dt; } };
  };

  PM.THEMES = {
    doiche: {
      zenith: [0.13, 0.27, 0.62], mid: [0.66, 0.42, 0.50], horizon: [1.05, 0.56, 0.28], ground: [0.50, 0.36, 0.46], sunDir: [-0.25, 0.062, -0.966], sunCol: [1.7, 0.9, 0.42],
      cloudLit: [1.45, 0.92, 0.66], cloudDark: [0.30, 0.25, 0.44], cover: 0.4,
      keyDir: [-0.55, 0.62, 0.56], keyCol: [1.0, 0.84, 0.64], keyInt: 3.6, rimInt: 2.0, hemiInt: 0.5, bounce: [0.5, 0.34, 0.3],
      seaLit: [1.15, 0.78, 0.62], seaShade: [0.26, 0.22, 0.40], fog: [0.80, 0.52, 0.48], fogStart: 150, fogDen: 0.0015, mist: 0.22, exposure: 1.0, bloom: 0.4, rays: 0.9
    }
  };
})();
