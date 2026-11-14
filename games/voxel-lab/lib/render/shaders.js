// Voxel Lab - GLSL: surface patterns by voxel coordinate, fracture faces, built-edge bevel, volume AO,
// sky visibility, sun shadows, debris, sprites, sky and the post chain (SSAO-ish, bloom, ACES).
// Techniques studied from Voxel Engine by mattshumer (spawn.co), analysis/voxel-render.md §3, §4, §7, §8, §13;
// every line here is our own.

export const COMMON = /* glsl */`
precision highp float;
precision highp sampler3D;
precision highp sampler2DShadow;
uniform sampler3D uDensity;
uniform sampler3D uSkyVis;
uniform sampler2DShadow uShadow;
uniform mat4 uShadowMat;
uniform vec3 uSunDir, uSunCol, uAmbSky, uAmbGround, uFogCol, uVolSize;
uniform float uShadowTexel, uShadowWorldTexel, uTime;

float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float hash31(vec3 p){ p = fract(p*vec3(.1031,.1030,.0973)); p += dot(p, p.yxz+33.33); return fract((p.x+p.y)*p.z); }

float sunShadow(vec3 wp, vec3 n, float ndl){
  vec3 p = wp + n*(uShadowWorldTexel*1.6*(1.3-ndl)+0.012);
  vec4 sc = uShadowMat*vec4(p,1.);
  vec3 s = sc.xyz*0.5+0.5;
  if (s.x<0.||s.y<0.||s.x>1.||s.y>1.||s.z>1.) return 1.;
  float a = hash21(gl_FragCoord.xy)*6.2831853;
  vec2 r = vec2(cos(a), sin(a))*uShadowTexel*1.25;
  float z = s.z-0.0006;
  float sh = texture(uShadow, vec3(s.xy+r, z)) + texture(uShadow, vec3(s.xy-r, z))
           + texture(uShadow, vec3(s.xy+vec2(-r.y,r.x), z)) + texture(uShadow, vec3(s.xy-vec2(-r.y,r.x), z));
  return sh*0.25;
}
float dens(vec3 wp){ return texture(uDensity, wp/uVolSize).r; }
float skyVis(vec3 wp, vec3 n){ return texture(uSkyVis, (wp + n*0.44 + vec3(0.,0.12,0.))/uVolSize).r; }
vec3 applyFog(vec3 col, vec3 wp, vec3 cam){
  float d = distance(wp, cam);
  float h = exp(-max(0.5*(wp.y+cam.y)-1.2, 0.)*0.07);
  float f = min(1.-exp(-d*0.003*h), 0.94);
  return mix(col, uFogCol, f);
}
vec3 ambientLight(vec3 n, float sv, float ao){
  vec3 hemi = mix(uAmbGround, uAmbSky, n.y*0.5+0.5);
  return (hemi*sv + uAmbGround*0.22*(1.-sv))*ao;
}
`;

export const SURFACE_VERT = /* glsl */`
attribute vec4 aInfo;
attribute vec4 aQuad;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec2 vQuv;
flat varying vec4 vInfo;
flat varying vec2 vQsize;
flat varying vec3 vN;
flat varying vec3 vTa;
flat varying vec3 vTb;
void main(){
  vLocal = position;
  vec4 w = modelMatrix*vec4(position,1.);
  vWorld = w.xyz;
  vInfo = aInfo; vQuv = aQuad.xy; vQsize = aQuad.zw;
  int face = int(aInfo.x+0.5), d = face/2;
  float s = (face - d*2)==1 ? 1. : -1.;
  vec3 n = d==0 ? vec3(s,0.,0.) : (d==1 ? vec3(0.,s,0.) : vec3(0.,0.,s));
  vec3 ta = d==0 ? vec3(0.,0.,1.) : vec3(1.,0.,0.);
  vec3 tb = d==1 ? vec3(0.,0.,1.) : vec3(0.,1.,0.);
  mat3 m = mat3(modelMatrix);
  vN = normalize(m*n); vTa = normalize(m*ta); vTb = normalize(m*tb);
  gl_Position = projectionMatrix*viewMatrix*w;
}
`;

const PATTERNS = /* glsl */`
uniform sampler2D uPalette;
uniform sampler2D uNoise;
uniform vec4 uScorch[16];
uniform int uScorchN;
uniform float uBevel;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec2 vQuv;
flat varying vec4 vInfo;
flat varying vec2 vQsize;
flat varying vec3 vN;
flat varying vec3 vTa;
flat varying vec3 vTb;

vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
// line mask: 1 on a joint of half-width w centred on integer multiples of period
float joint(float x, float period, float w, float aa){
  float d = abs(fract(x/period+0.5)-0.5)*period;
  return 1.-smoothstep(w, w+aa+0.02, d);
}
`;

export const SURFACE_FRAG = COMMON + PATTERNS + /* glsl */`
void main(){
  int face = int(vInfo.x+0.5), d = face/2;
  int mat = int(vInfo.y+0.5);
  int fl = int(vInfo.z+0.5);
  bool fresh = (fl & 1) != 0, loose = (fl & 2) != 0;
  float sgn = (face - d*2)==1 ? 1. : -1.;
  vec3 nl = d==0 ? vec3(sgn,0.,0.) : (d==1 ? vec3(0.,sgn,0.) : vec3(0.,0.,sgn));
  vec3 pc = vLocal;
  vec2 uv = d==0 ? pc.zy : (d==1 ? pc.xz : pc.xy);
  float layer = d==0 ? pc.x : (d==1 ? pc.y : pc.z);
  vec3 vc = floor(pc - nl*0.5);
  vec4 p0 = texelFetch(uPalette, ivec2(mat,0), 0);
  vec4 p1 = texelFetch(uPalette, ivec2(mat,1), 0);
  vec4 p2 = texelFetch(uPalette, ivec2(mat,2), 0);
  vec3 albedo = toLin(p0.rgb);
  float var = p0.a*2.;
  float rough = p1.r;
  float emis = p1.g;
  int pat = int(p1.b*255.+0.5);
  int mfl = int(p1.a*255.+0.5);
  bool metal = (mfl & 1) != 0;
  float fw = max(fwidth(uv.x), fwidth(uv.y));
  float det = 1.-smoothstep(0.25, 0.9, fw);
  vec4 blot = texture(uNoise, uv*0.027 + layer*0.173);
  vec4 fine = texture(uNoise, uv*0.31 + layer*0.071);
  float cavity = 1.;
  float patVar = 1.;
  bool side = d != 1;

  if (!fresh) {
    if (pat == 1) { // running-bond brick, 3 x 1 voxels
      float course = floor(uv.y);
      float bx = (uv.x + mod(course,2.)*1.5)/3.;
      vec2 id = vec2(floor(bx), course);
      float h = hash21(id);
      float tone = 0.84 + 0.3*h;
      if (hash21(id+7.3) < 0.1) tone *= 0.72;
      albedo *= tone*(0.9+0.2*blot.r);
      float jw = 0.07 + 0.05*fine.g;
      float bed = joint(uv.y, 1., jw, fw);
      float perp = joint(bx*3., 3., jw, fw)*(1.-smoothstep(0.15,0.5,fw));
      float mj = max(bed, perp)*(1.-smoothstep(0.45,1.1,fw));
      albedo = mix(albedo, vec3(0.52,0.5,0.46)*0.62, mj);
      cavity = 1.-0.45*mj;
      patVar = 0.25;
    } else if (pat == 2) { // planks 2 voxels wide, butt joints every 24
      float along = side ? uv.x : uv.x, across = side ? uv.y : uv.y;
      float board = floor(across/2.);
      float t = hash21(vec2(board, 3.1));
      float off = floor(t*24.);
      float butt = joint(along+off, 24., 0.05, fw);
      float gap = joint(across, 2., 0.05, fw);
      float g = texture(uNoise, vec2(along*0.03, across*0.4 + t)).g;
      albedo *= (0.8 + 0.34*t)*(0.9+0.2*g);
      float mj = max(butt, gap)*det;
      albedo *= 1.-0.6*mj; cavity = 1.-0.4*mj;
      patVar = 0.2;
    } else if (pat == 3) { // roof tiles
      float row = floor(uv.y/2.);
      vec2 id = vec2(floor((uv.x + mod(row,2.)*1.5)/3.), row);
      float tone = 0.88 + 0.22*hash21(id);
      float g = max(joint(uv.y, 2., 0.08, fw), joint(uv.x + mod(row,2.)*1.5, 3., 0.07, fw)*0.7)*det;
      albedo *= tone*(1.-0.5*g)*(0.9+0.2*blot.r);
      // each tile catches a little light on its lower lip
      albedo *= 0.92 + 0.16*smoothstep(0.2, 1.8, mod(uv.y,2.));
      cavity = 1.-0.3*g; patVar = 0.3;
    } else if (pat == 4) { // mottled stone / render / foliage
      albedo *= 0.82 + 0.36*blot.r;
      albedo *= 0.94 + 0.12*fine.b*det;
    } else if (pat == 5) { // timber grain along the long side of the member
      bool lu = vQsize.x >= vQsize.y;
      float al = lu ? uv.x : uv.y, ac = lu ? uv.y : uv.x;
      float g = texture(uNoise, vec2(al*0.021, ac*0.37)).g;
      float g2 = texture(uNoise, vec2(al*0.08, ac*1.3)).r;
      albedo *= (0.8 + 0.36*g)*(0.93+0.14*g2*det);
      if (rough > 0.9) albedo *= 0.72 + 0.56*texture(uNoise, vec2(ac*0.9, al*0.05)).g;
      patVar = 0.3;
    } else if (pat == 6) { // ember
      float pulse = 0.5+0.5*sin(uTime*6.5+vc.x*1.7+vc.z*2.3)*sin(uTime*1.7+vc.y*1.1);
      albedo = mix(vec3(0.02,0.015,0.012), albedo, 0.35+0.65*pulse);
      emis *= 0.4+0.9*pulse; patVar = 0.;
    } else if (pat == 7) { // turf
      if (d == 1 && sgn > 0.) {
        albedo *= mix(vec3(1.02,0.66,0.9)*1.15, vec3(0.7,0.6,1.02)*1.25, blot.r);
        albedo *= 1. + 0.045*sin(uv.y*0.3927);
        albedo *= 0.86 + 0.28*fine.b*det;
      } else {
        albedo = toLin(vec3(0.43,0.32,0.23))*(0.8+0.4*blot.r);
        float lip = step(0.72, fract(uv.y))*step(0.5, 1.-nl.y);
        albedo = mix(albedo, toLin(p0.rgb)*0.8, lip*det*0.6);
      }
      patVar = 0.22;
    } else if (pat == 8) { // tarmac
      albedo *= 0.88 + 0.24*fine.b*det;
      albedo = mix(albedo, vec3(0.32), step(0.94, fine.a)*det*0.5);
      patVar = 0.5;
    } else if (pat == 9) { // formwork concrete: 2.4 m panels, 1.5 m lifts, tie holes
      vec2 pn = floor(uv/vec2(24.,15.));
      albedo *= 0.93 + 0.14*hash21(pn+0.37);
      float ln = max(joint(uv.x, 24., 0.06, fw), joint(uv.y, 15., 0.06, fw))*(1.-smoothstep(0.5,1.5,fw));
      vec2 th = abs(fract(uv/vec2(12.,15.))-0.5)*vec2(12.,15.);
      float hole = (1.-smoothstep(0.22,0.34,length(th)))*det;
      albedo *= 1.-0.22*ln-0.45*hole;
      albedo *= 0.93+0.14*blot.r;
      // rain streaks under the top
      albedo *= 0.96+0.08*texture(uNoise, vec2(uv.x*0.043, uv.y*0.0031)).g;
      cavity = 1.-0.3*hole;
    } else if (pat == 10) { // brushed metal
      float g = texture(uNoise, vec2(uv.x*0.4, uv.y*0.012)).g;
      albedo *= 0.92 + 0.16*g;
      patVar = 0.4;
    } else if (pat == 11) { // rubble: noisy, so it reads as broken
      albedo *= 0.66 + 0.68*hash31(vc);
      albedo *= 0.85 + 0.3*blot.r;
      patVar = 0.25;
    } else if (pat == 12) { // soil
      albedo *= mix(0.78, 1.12, blot.r);
      albedo *= 0.85 + 0.3*fine.b*det;
      patVar = 0.5;
    } else if (pat == 13) { // corrugated sheet: ribs every 2 voxels
      float c = side ? uv.x : uv.x;
      float rib = abs(fract(c*0.5)-0.5)*2.;
      float fade = 1.-smoothstep(0.35,1.2,fw);
      albedo *= mix(1., 0.72+0.38*rib, fade);
      albedo *= 0.94+0.12*texture(uNoise, vec2(uv.x*0.05, uv.y*0.004)).g;
      patVar = 0.3;
    } else if (pat == 14) { // thatch: layered strands
      float row = floor(uv.y*1.);
      float st = texture(uNoise, vec2(uv.x*0.45, row*0.137)).g;
      albedo *= (0.74+0.5*st)*(0.8+0.3*fract(uv.y));
      patVar = 0.4;
    } else if (pat == 15) { // bamboo culms 2 voxels wide with nodes
      bool lu = vQsize.x > vQsize.y;
      float al = lu ? uv.x : uv.y, ac = lu ? uv.y : uv.x;
      float cu = abs(fract(ac*0.5)-0.5)*2.;
      float culm = floor(ac*0.5);
      float node = joint(al + hash21(vec2(culm,1.7))*8., 8., 0.12, fw)*det;
      albedo *= (0.7+0.4*(1.-cu*cu))*(1.-0.4*node)*(0.9+0.2*hash21(vec2(culm,9.1)));
      patVar = 0.3;
    } else if (pat == 16) { // paving / dressed stone: 6 x 3 blocks, running bond on walls
      float ph = side ? 3. : 6.;
      float row = floor(uv.y/ph);
      float ox = side ? mod(row,2.)*3. : 0.;
      vec2 id = vec2(floor((uv.x+ox)/6.), row);
      albedo *= 0.9 + 0.2*hash21(id+1.9);
      float g = max(joint(uv.y, ph, 0.06, fw), joint(uv.x+ox, 6., 0.06, fw))*(1.-smoothstep(0.4,1.2,fw));
      albedo *= (1.-0.4*g)*(0.93+0.14*blot.r);
      cavity = 1.-0.3*g; patVar = 0.4;
    } else { // flat paint / plaster
      albedo *= 0.96 + 0.08*blot.r;
      albedo *= 0.97 + 0.06*texture(uNoise, vec2(uv.x*0.043, uv.y*0.0031)).g;
    }
    albedo *= 1. + ((blot.g-0.5)*0.8 + (fine.r-0.5)*0.6*det)*var*patVar;
  } else {
    // fracture face: the inside of the material
    albedo = toLin(p2.rgb);
    float h = hash31(vc + nl*3.7);
    if (pat == 9) { // aggregate, and rust-red bar ends every 2 voxels when reinforced
      albedo *= 0.8 + 0.5*step(0.7, fine.b)*det;
      if (metal) { vec2 q = abs(fract(uv*0.5)-0.5); float bar = (1.-smoothstep(0.1,0.2,length(q)))*det; albedo = mix(albedo, vec3(0.28,0.07,0.03), bar*step(0.5,hash21(floor(uv*0.5)))); }
    }
    albedo *= 0.8 + 0.4*h;
    emis *= 0.6;
  }
  if (fresh || loose) {
    float h = hash31(vc);
    albedo = albedo*(1.06+0.28*h)+0.012;
    albedo = mix(albedo, vec3(0.2,0.185,0.165), loose ? 0.16 : 0.3);
  }
  // weathering toward warm grey
  if (pat != 6 && emis < 0.01) albedo = mix(albedo, vec3(0.32,0.3,0.27)*luma(albedo)*2.2, 0.08);

  // scorch marks: max-combined smoothstep discs (voxel-render.md §6.1 profile)
  float soot = 0.;
  for (int i = 0; i < 16; i++) { float dd = distance(vWorld, uScorch[i].xyz)/uScorch[i].w; float t = clamp((1.15-dd)/0.65, 0., 1.)*step(float(i)+0.5, float(uScorchN)); soot = max(soot, t*t*(3.-2.*t)); }
  if (soot > 0.) { float a = smoothstep(0., 0.3, soot-(1.-blot.r)*0.42)*(0.82+0.18*fine.g); albedo *= mix(vec3(1.), vec3(0.3,0.28,0.26), a*(fresh ? 0.5 : 1.)); }

  // bevel on edges that existed when built
  vec3 n = vN;
  int eb = int(vInfo.w+0.5);
  if (uBevel > 0.5 && eb != 0) {
    float fade = 1.-smoothstep(0.1, 0.45, fw);
    if (fade > 0.) {
      float bw = 0.09*(0.8+1.6*fine.g) + fw*0.7;
      float ta = 0., tb = 0.;
      if ((eb & 1) != 0) ta -= 1.-smoothstep(0., bw, vQuv.x);
      if ((eb & 2) != 0) ta += 1.-smoothstep(0., bw, vQsize.x-vQuv.x);
      if ((eb & 4) != 0) tb -= 1.-smoothstep(0., bw, vQuv.y);
      if ((eb & 8) != 0) tb += 1.-smoothstep(0., bw, vQsize.y-vQuv.y);
      float e = clamp(max(abs(ta), abs(tb)), 0., 1.)*fade;
      n = normalize(n + (vTa*ta + vTb*tb)*0.8*fade);
      albedo = mix(albedo, vec3(luma(albedo))*1.25, e*0.35);
    }
  }

  // lighting
  vec3 V = normalize(cameraPosition - vWorld);
  float ndl = max(dot(n, uSunDir), 0.);
  float gndl = max(dot(vN, uSunDir), 0.);
  if (fresh) ndl = mix(ndl, max((dot(n,uSunDir)+0.4)/1.4, 0.), 0.5);
  float sh = gndl > 0. ? sunShadow(vWorld, vN, gndl) : 0.;
  vec3 pa = vWorld + vN*0.26;
  float a1 = dens(pa + vTa*0.25) + dens(pa - vTa*0.25) + dens(pa + vTb*0.25) + dens(pa - vTb*0.25);
  float a2 = dens(vWorld + vN*0.62) + dens(vWorld + vN*1.15);
  float ao = clamp(1. - 0.2*a1 - 0.16*a2, 0.18, 1.);
  float sv = skyVis(vWorld, vN);
  vec3 amb = ambientLight(n, sv, ao)*cavity;
  vec3 sun = uSunCol*ndl*sh;
  float diffScale = metal ? 0.75 : 1.;
  vec3 col = albedo*(sun*mix(1., cavity, 0.6)*diffScale + amb);
  // sun glint (GGX-ish lobe) on smooth and metal faces
  if (sh > 0.01 && rough < 0.75) {
    vec3 H = normalize(V + uSunDir);
    float a = max(rough*rough, 0.02);
    float ndh = max(dot(n,H), 0.);
    float dd = ndh*ndh*(a*a-1.)+1.;
    float D = a*a/(3.14159*dd*dd);
    vec3 f0 = metal ? mix(vec3(0.05), albedo, 0.7) : vec3(0.04);
    col += f0*uSunCol*min(D, 12.)*ndl*sh*0.25;
    if (metal) col += f0*mix(uAmbGround, uAmbSky, clamp(reflect(-V, n).y*0.5+0.5, 0., 1.))*sv*0.5*(1.-rough);
  }
  col += toLin(p0.rgb)*emis*18.;
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(col, 1.);
}
`;

export const GLASS_FRAG = COMMON + PATTERNS + /* glsl */`
uniform vec3 uZenith, uHorizon;
void main(){
  int face = int(vInfo.x+0.5), d = face/2;
  int mat = int(vInfo.y+0.5);
  vec3 pc = vLocal;
  vec2 uv = d==0 ? pc.zy : (d==1 ? pc.xz : pc.xy);
  vec3 albedo = toLin(texelFetch(uPalette, ivec2(mat,0), 0).rgb);
  vec2 pane = floor(uv/vec2(12.,14.));
  vec3 n = normalize(vN + (vTa*(hash21(pane)-0.5) + vTb*(hash21(pane+3.1)-0.5))*0.07);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(n, V));
  float dark = 1.-luma(albedo);
  float f0 = 0.05 + 0.24*dark*dark;
  float fres = f0 + (1.-f0)*pow(1.-ndv, 5.);
  vec3 R = reflect(-V, n);
  float h = max(R.y, 0.);
  vec3 sky = mix(uHorizon, uZenith, 1.-exp(-3.*h));
  // stepped fake skyline and ground in the reflection
  float sl = step(R.y, 0.06 + 0.1*hash21(vec2(floor(atan(R.z, R.x)*9.), 2.)));
  sky = mix(sky, uAmbGround*1.2 + uSunCol*0.04, sl*0.75);
  float glint = pow(max(dot(R, uSunDir), 0.), 600.)*40.;
  float sh = sunShadow(vWorld, vN, max(dot(vN,uSunDir),0.05));
  vec3 body = albedo*(uAmbSky*0.5 + uSunCol*0.12*sh);
  float aBody = 0.3 + 0.25*dark;
  vec3 col = body*aBody + sky*fres + uSunCol*glint*sh*fres;
  float alpha = clamp(aBody + fres, 0., 1.);
  float fogk = 1.-min(1.-exp(-distance(vWorld,cameraPosition)*0.003), 0.94);
  gl_FragColor = vec4(mix(uFogCol*alpha, col, fogk), alpha);
}
`;

export const DEBRIS_VERT = /* glsl */`
attribute vec3 iColor;
varying vec3 vWorld;
varying vec3 vNrm;
varying vec3 vCol;
varying vec3 vObj;
void main(){
  vec4 w = modelMatrix*instanceMatrix*vec4(position,1.);
  vWorld = w.xyz; vObj = position;
  vNrm = normalize(mat3(modelMatrix*instanceMatrix)*normal);
  vCol = iColor;
  gl_Position = projectionMatrix*viewMatrix*w;
}
`;
export const DEBRIS_FRAG = COMMON + /* glsl */`
varying vec3 vWorld;
varying vec3 vNrm;
varying vec3 vCol;
varying vec3 vObj;
void main(){
  vec3 n = normalize(vNrm);
  vec3 albedo = pow(vCol, vec3(2.2));
  // worn corners: darken toward the cube edges so small cubes still read as chunks
  vec3 q = abs(vObj)*2.;
  float edge = max(max(min(q.x,q.y), min(q.y,q.z)), min(q.x,q.z));
  albedo *= 1.-0.25*smoothstep(0.75, 1., edge);
  float ndl = max(dot(n, uSunDir), 0.);
  float sh = ndl > 0. ? sunShadow(vWorld, n, ndl) : 0.;
  float ao = clamp(1.-0.6*dens(vWorld + n*0.2), 0.3, 1.);
  float sv = skyVis(vWorld, n);
  vec3 col = albedo*(uSunCol*ndl*sh + ambientLight(n, sv, ao));
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(col, 1.);
}
`;

export const SPRITE_VERT = /* glsl */`
attribute vec4 iPos;   // xyz, size
attribute vec4 iCol;   // rgb, opacity
attribute vec4 iMisc;  // kind (1 dust, 2 smoke, 3 spark, 4 fire), seed, glow, stretch
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vMisc;
varying vec3 vWorld;
void main(){
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float a = iMisc.y*6.2831853;
  vec2 c = position.xy;
  if (iMisc.x < 2.5) c = vec2(c.x*cos(a)-c.y*sin(a), c.x*sin(a)+c.y*cos(a));
  if (iMisc.x > 3.5) c.y = c.y*(1.+iMisc.w) + 0.25*iMisc.w;
  vec3 w = iPos.xyz + (right*c.x + up*c.y)*iPos.w;
  vUv = position.xy*2.; vCol = iCol; vMisc = iMisc; vWorld = w;
  gl_Position = projectionMatrix*viewMatrix*vec4(w,1.);
}
`;
export const SPRITE_FRAG = COMMON + /* glsl */`
uniform sampler2D uNoise;
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vMisc;
varying vec3 vWorld;
void main(){
  float r = length(vUv);
  if (r > 1.) discard;
  float kind = vMisc.x;
  vec4 nz = texture(uNoise, vUv*0.21 + vMisc.y*7.31);
  if (kind < 2.5) { // dust and smoke: soft lit puffs
    float soft = smoothstep(1., 0.25, r + (nz.r-0.5)*0.55);
    float a = vCol.a*soft;
    if (a < 0.004) discard;
    vec3 n = normalize(vec3(vUv, sqrt(max(1.-r*r, 0.))));
    vec3 sunV = normalize((viewMatrix*vec4(uSunDir,0.)).xyz);
    float lit = dot(n, sunV)*0.5+0.5;
    float sh = sunShadow(vWorld, uSunDir, 1.);
    float sv = texture(uSkyVis, (vWorld+vec3(0.,0.3,0.))/uVolSize).r;
    vec3 col = pow(vCol.rgb, vec3(2.2))*(uSunCol*lit*(0.25+0.75*sh)*0.55 + mix(uAmbGround, uAmbSky, 0.7)*(0.35+0.65*sv));
    col = applyFog(col, vWorld, cameraPosition);
    gl_FragColor = vec4(col*a, a);
  } else if (kind < 3.5) { // spark
    float s = smoothstep(1., 0., r);
    gl_FragColor = vec4(vCol.rgb*s*vMisc.z*vCol.a, 0.);
  } else { // fire tongue
    float t = clamp(vUv.y*0.5+0.5, 0., 1.);
    float w = (1.-t*0.75)*(0.75+0.5*nz.g);
    float s = smoothstep(w, w*0.2, abs(vUv.x))*smoothstep(1., 0.6, r)*smoothstep(0., 0.25, t+0.2);
    vec3 fc = mix(vec3(1.,0.85,0.45), vec3(1.,0.28,0.04), clamp(t*1.3+nz.r*0.4-0.2, 0., 1.));
    gl_FragColor = vec4(fc*s*vMisc.z*vCol.a, s*vCol.a*0.25);
  }
}
`;

export const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix*viewMatrix*vec4(position*400. + cameraPosition, 1.); gl_Position = p.xyww; }
`;
export const SKY_FRAG = /* glsl */`
precision highp float;
uniform vec3 uSunDir, uSunCol, uZenith, uHorizon, uFogCol;
uniform sampler2D uNoise;
uniform float uTime;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.);
  vec3 col = mix(uHorizon, uZenith, 1.-exp(-3.*h));
  float sd = max(dot(d, uSunDir), 0.);
  col += uSunCol*(pow(sd, 900.)*6. + pow(sd, 24.)*0.05 + pow(sd, 4.)*0.02);
  if (d.y > 0.02) { // thin high cloud wisps
    vec2 p = d.xz/(d.y+0.12);
    float c = texture(uNoise, p*0.035 + uTime*0.0006).r*0.6 + texture(uNoise, p*0.09 - uTime*0.0009).g*0.4;
    c = smoothstep(0.5, 0.74, c)*smoothstep(0.02, 0.2, d.y);
    col = mix(col, vec3(1.15)*(uHorizon*0.4+0.6), c*0.7);
  }
  col = mix(col, uFogCol, smoothstep(0.06, -0.02, d.y));
  gl_FragColor = vec4(col, 1.);
}
`;

export const FS_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;

// Alchemy-style SSAO on a golden-angle spiral, radius 0.42 m, fading 25-45 m (voxel-render.md §8.1)
export const SSAO_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDepth;
uniform mat4 uProjInv, uProj;
uniform vec2 uRes;
varying vec2 vUv;
vec3 viewPos(vec2 uv){ float z = textureLod(tDepth, uv, 0.).x; vec4 p = uProjInv*vec4(uv*2.-1., z*2.-1., 1.); return p.xyz/p.w; }
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
void main(){
  float z = texture2D(tDepth, vUv).x;
  if (z >= 0.99999) { gl_FragColor = vec4(1.); return; }
  vec3 p = viewPos(vUv);
  float dist = -p.z;
  float fade = 1.-smoothstep(25., 45., dist);
  if (fade <= 0.) { gl_FragColor = vec4(1.); return; }
  vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  float rad = 0.42;
  vec4 pr = uProj*vec4(rad, 0., p.z, 1.);
  float rUv = abs(pr.x/pr.w)*0.5;
  float a0 = hash21(gl_FragCoord.xy)*6.2831853;
  float occ = 0.;
  for (int i = 0; i < 8; i++) {
    float fi = float(i)+0.5;
    float rr = sqrt(fi/8.)*rUv;
    float a = a0 + fi*2.3999632;
    vec3 q = viewPos(vUv + vec2(cos(a), sin(a))*rr);
    vec3 v = q-p;
    float vv = dot(v,v);
    occ += max(dot(v,n)-0.02, 0.)/(vv+0.01)*step(vv, rad*rad*1.2);
  }
  float ao = clamp(1.-occ*0.11*fade, 0., 1.);
  gl_FragColor = vec4(ao, ao, ao, 1.);
}
`;

export const BLOOM_DOWN_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uFirst;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv + uTexel*vec2(-1.,-1.)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.,-1.)).rgb
         + texture2D(tSrc, vUv + uTexel*vec2(-1.,1.)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.,1.)).rgb;
  c *= 0.25;
  if (uFirst > 0.5) { c = min(c, vec3(24.)); float l = dot(c, vec3(0.2126,0.7152,0.0722)); c *= 1./(1.+l*0.15); }
  gl_FragColor = vec4(c, 1.);
}
`;
export const BLOOM_UP_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tSrc, tAdd;
uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv + uTexel*vec2(-0.5,-0.5)).rgb + texture2D(tSrc, vUv + uTexel*vec2(0.5,-0.5)).rgb
         + texture2D(tSrc, vUv + uTexel*vec2(-0.5,0.5)).rgb + texture2D(tSrc, vUv + uTexel*vec2(0.5,0.5)).rgb;
  gl_FragColor = vec4(c*0.25 + texture2D(tAdd, vUv).rgb, 1.);
}
`;

// composite: AO on, bloom mix 0.07, exposure, Hill ACES fit of c*1.6, S-curve 0.18, vignette 0.25, dither (voxel-render.md §8.6)
export const COMPOSITE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tScene, tDepth, tAO, tBloom;
uniform vec2 uTexel, uAoTexel;
uniform float uExposure, uUseAO, uUseBloom, uFlash;
varying vec2 vUv;
vec3 rrtOdt(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
vec3 aces(vec3 c){
  c = mat3(0.59719,0.076,0.0284, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777)*c;
  c = rrtOdt(c);
  c = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602)*c;
  return clamp(c, 0., 1.);
}
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  if (uUseAO > 0.5) {
    float z = texture2D(tDepth, vUv).x;
    float ao = texture2D(tAO, vUv + uAoTexel*vec2(-0.5,-0.5)).r + texture2D(tAO, vUv + uAoTexel*vec2(0.5,-0.5)).r
             + texture2D(tAO, vUv + uAoTexel*vec2(-0.5,0.5)).r + texture2D(tAO, vUv + uAoTexel*vec2(0.5,0.5)).r;
    ao *= 0.25;
    if (z < 0.99999) c *= mix(1., ao, 0.75);
  }
  if (uUseBloom > 0.5) c = mix(c, texture2D(tBloom, vUv).rgb/3., 0.075);
  c *= uExposure*(1.+uFlash);
  c = aces(c*1.6);
  c = pow(c, vec3(1./2.2));
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  c *= 1. + (l*(3.-2.*l)-1.)*0.18;
  vec2 q = vUv-0.5;
  c *= 1.-0.2*smoothstep(0.25, 0.95, dot(q,q)*2.);
  c += (hash21(gl_FragCoord.xy)+hash21(gl_FragCoord.xy+17.)-1.)/255.;
  gl_FragColor = vec4(c, 1.);
}
`;

// far field: one flat lawn beyond the live voxel box, shaded like the turf so the seam does not show
export const FAR_VERT = /* glsl */`
varying vec3 vWorld;
void main(){ vec4 w = modelMatrix*vec4(position,1.); vWorld = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }
`;
export const FAR_FRAG = COMMON + /* glsl */`
uniform sampler2D uNoise;
uniform vec3 uGrass;
varying vec3 vWorld;
void main(){
  vec2 uv = vWorld.xz*10.;
  vec4 blot = texture(uNoise, uv*0.027);
  vec3 albedo = pow(uGrass, vec3(2.2));
  albedo *= mix(vec3(1.02,0.66,0.9)*1.15, vec3(0.7,0.6,1.02)*1.25, blot.r);
  albedo *= 1. + 0.045*sin(uv.y*0.3927);
  albedo = mix(albedo, vec3(0.32,0.3,0.27)*dot(albedo, vec3(0.2126,0.7152,0.0722))*2.2, 0.08);
  vec3 n = vec3(0.,1.,0.);
  vec3 col = albedo*(uSunCol*max(uSunDir.y,0.) + ambientLight(n, 1., 1.));
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(col, 1.);
}
`;
