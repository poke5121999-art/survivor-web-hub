// GPU-baked PBR sets. Each surface is a GLSL function over a tileable [0,1) square.
// Outputs three textures: albedo (sRGB, alpha = paint mask), ORM (R ao, G rough, B metal), normal (from height).
import * as THREE from '../vendor/three.module.min.js';
import { NOISE } from './glsl.js';

const COMMON = /* glsl */`
${NOISE}
float sat(float x){ return clamp(x,0.,1.); }
float scratches(vec2 uv, float P, float seed){
  float s=0.;
  for(int i=0;i<3;i++){
    float a=h12(vec2(seed,float(i)))*6.283;
    vec2 d=vec2(cos(a),sin(a));
    vec2 q=vec2(dot(uv,d), dot(uv,vec2(-d.y,d.x)))*P*(1.+float(i));
    float line=abs(fract(q.y+pn(q*vec2(.05,1.),P*4.)*.3)-.5);
    float len=step(.72, pn(vec2(q.x*.08, floor(q.y)), P*8.));
    s=max(s, smoothstep(.012,0.,line)*len);
  }
  return s;
}
`;

// Each entry: GLSL body that sets alb, rough, metal, h (0..1), ao, paint (mask, 1 = takes the tint).
export const SURF = {
  concrete: `
    vec2 p=uv*4.;
    float m=pfbm(p,4.,6);
    float sp=pvor(uv*48.,48.).x;
    vec2 wq=uv*5.+vec2(pfbm(uv*4.,4.,3),pfbm(uv*4.+5.,4.,3))*.6; vec3 cr=pvor(wq,5.); float crack=smoothstep(.02,.0,cr.y-cr.x)*smoothstep(.55,.65,pfbm(uv*6.,6.,4));
    float stain=smoothstep(.55,.8,pfbm(uv*2.+3.1,2.,5));
    float g=.33+.14*(m-.5)-.05*smoothstep(.25,.0,sp)+.03*h12(floor(uv*256.));
    alb=vec3(g)*vec3(1.,.985,.96); alb*=1.-.35*stain; alb*=1.-.6*crack;
    rough=.86+.08*m-.2*stain; metal=0.;
    h=.55+.25*(m-.5)+.12*smoothstep(.3,0.,sp)-.5*crack; ao=1.-.5*crack; paint=0.;`,
  asphalt: `
    vec2 p=uv*4.;
    float m=pfbm(p,4.,5);
    vec3 v=pvor(uv*64.,64.); float stone=smoothstep(.45,.2,v.x);
    float tar=smoothstep(.62,.66,pfbm(uv*3.+7.,3.,4));
    vec3 cr=pvor(uv*2.,2.); float crack=smoothstep(.03,0.,cr.y-cr.x)*step(.5,pfbm(uv*6.,6.,3));
    float g=.075+.03*(m-.5)+.06*stone*(.4+.6*v.z);
    alb=vec3(g)*vec3(1.,1.,1.02); alb=mix(alb, vec3(.035), tar); alb*=1.-.5*crack;
    rough=mix(.9-.1*stone,.6,tar); metal=0.;
    h=.5+.3*stone*(1.-v.x)-.4*crack-.05*tar; ao=1.-.4*crack-.2*(1.-stone)*.3; paint=0.;`,
  ballast: `
    vec3 v=pvor(uv*14.,14.); vec3 v2=pvor(uv*29.+.5,29.);
    float d=min(v.x*1.1, v2.x*1.6+.15);
    float id=v.x*1.1<v2.x*1.6+.15? v.z : v2.z;
    float dome=sat(1.-d*1.7); float gap=smoothstep(.0,.25,v.y-v.x);
    vec3 c=mix(vec3(.30,.29,.27), vec3(.42,.38,.33), id); c=mix(c, vec3(.22,.2,.19), step(.8,fract(id*7.3)));
    float grime=pfbm(uv*6.,6.,4);
    alb=c*(.75+.35*grime)*(.35+.65*gap); alb*=.85+.15*h12(floor(uv*512.));
    rough=.78+.15*grime; metal=0.;
    h=dome*gap; ao=.25+.75*gap*sqrt(dome+.1); paint=0.;`,
  wood: `
    vec2 p=vec2(uv.x*2., uv.y*12.);
    float grain=pfbm(vec2(p.x*.5, p.y*3.), 12., 5);
    float rings=sin((uv.y*40.+grain*6.)*3.14)*.5+.5;
    float split=smoothstep(.04,.0,abs(fract(uv.y*6.+pn(vec2(uv.x*8.,uv.y*6.),8.)*.4)-.5))*step(.55,pn(vec2(uv.x*3.,floor(uv.y*6.)),3.));
    float tar=pfbm(uv*5.,5.,4);
    vec3 c=mix(vec3(.10,.07,.05), vec3(.20,.14,.09), rings*.6+grain*.4);
    c=mix(c, vec3(.05,.045,.04), smoothstep(.45,.75,tar));
    alb=c*(1.-.7*split); rough=.82+.1*grain; metal=0.;
    h=.5+.25*rings*.3+.2*grain-.6*split; ao=1.-.6*split; paint=0.;`,
  corrugated: `
    float cor=sin(uv.x*6.283*8.); float corA=cor*.5+.5;
    float ridge=pow(abs(cor),2.);
    vec2 p=uv*3.;
    float n=pfbm(p,3.,6);
    float streak=pfbm(vec2(uv.x*24., uv.y*1.5),24.,4);
    float rv=n*.7+streak*.38 + .22*smoothstep(.88,1.,uv.y) + .18*smoothstep(.12,0.,uv.y);
    float rust=smoothstep(.71,.8, rv);
    float rustEdge=smoothstep(.64,.71, rv) - rust;
    float chips=smoothstep(.78,.8,pfbm(uv*12.+4.,12.,4))*(1.-rust);
    float scr=scratches(uv,8.,3.);
    float grime=.72+.28*pfbm(uv*5.+9.,5.,5) - .25*smoothstep(.4,1.,streak)*(1.-uv.y*.5);
    vec3 rc=mix(vec3(.15,.065,.03), vec3(.27,.12,.05), pn(uv*40.,40.));
    alb=mix(vec3(grime*(1.-.25*(1.-corA))), rc, rust);
    alb*=1.-.35*rustEdge; alb=mix(alb, vec3(.16,.155,.15), chips*.8);
    alb=mix(alb, vec3(.4), scr*.25*(1.-rust));
    paint=(1.-rust)*(1.-chips*.6)*(1.-scr*.5)*(1.-rustEdge*.5);
    rough=mix(.5+.15*n, .92, rust); rough=mix(rough,.35,scr); metal=mix(.0,.25,rust)+chips*.5;
    h=corA*.7+.12*rust*pn(uv*90.,90.)+.05*n; ao=.75+.25*corA; `,
  paintedMetal: `
    float n=pfbm(uv*3.,3.,6);
    float rust=smoothstep(.74,.84,n*.85+.2*pfbm(uv*16.,16.,3));
    float chips=smoothstep(.76,.78,pfbm(uv*10.+2.,10.,5));
    float scr=scratches(uv,6.,7.);
    float grime=.78+.22*pfbm(uv*4.+5.,4.,5);
    vec3 rc=mix(vec3(.15,.065,.03), vec3(.27,.12,.05), pn(uv*30.,30.));
    alb=mix(vec3(grime), rc, rust); alb=mix(alb, vec3(.3), chips*(1.-rust));
    paint=(1.-rust)*(1.-chips)*(1.-scr*.7);
    rough=mix(.45+.15*n,.9,rust); rough=mix(rough,.3,max(chips,scr)*(1.-rust)); metal=max(chips,scr)*(1.-rust)*.9;
    h=.5+.1*n-.08*chips+.1*rust*pn(uv*80.,80.); ao=1.; `,
  steel: `
    float n=pfbm(uv*4.,4.,5);
    vec3 sp=pvor(uv*10.,10.);
    float streak=pfbm(vec2(uv.x*30.,uv.y*2.),30.,4);
    float rust=smoothstep(.62,.8,pfbm(uv*3.+1.,3.,6)+.2*streak);
    vec3 c=vec3(.56,.57,.58)*(.85+.15*sp.z)*(.9+.1*streak);
    alb=mix(c, vec3(.3,.15,.07), rust); rough=mix(.38+.2*n+.08*sp.z, .85, rust); metal=mix(1.,.2,rust);
    h=.5+.05*n+.15*rust*pn(uv*70.,70.); ao=1.; paint=0.;`,
  rust: `
    float n=pfbm(uv*4.,4.,7);
    float flake=smoothstep(.5,.7,pfbm(uv*20.,20.,3));
    alb=mix(vec3(.17,.08,.04), vec3(.38,.19,.08), n)*(.8+.3*flake); rough=.9; metal=.25;
    h=.5+.3*n+.2*flake; ao=1.; paint=0.;`,
  brick: `
    vec2 b=vec2(uv.x*4., uv.y*12.); float row=floor(b.y); b.x+=mod(row,2.)*.5;
    vec2 f=fract(b); vec2 id=vec2(floor(b.x), row);
    float mx=smoothstep(.0,.04,f.x)*smoothstep(1.,.96,f.x); float my=smoothstep(.0,.08,f.y)*smoothstep(1.,.92,f.y);
    float brick=mx*my;
    float v=h12(mod(id,vec2(4.,12.)));
    float n=pfbm(uv*8.,8.,5);
    vec3 c=mix(vec3(.33,.12,.07), vec3(.45,.2,.12), v)*(.8+.3*n);
    c=mix(c, vec3(.15,.12,.1), step(.88,v));
    float soot=smoothstep(.4,.9,pfbm(uv*2.,2.,5));
    alb=mix(vec3(.38,.36,.33)*(.8+.2*n), c, brick)*(1.-.5*soot);
    rough=mix(.95,.82,brick); metal=0.; h=brick*(.7+.2*n)+.1*n; ao=.6+.4*brick; paint=0.;`,
  polymer: `
    vec3 v=pvor(uv*90.,90.);
    float st=smoothstep(.0,.5,v.x);
    float n=pfbm(uv*6.,6.,4);
    alb=vec3(.032+.012*n); rough=.62+.12*st; metal=0.;
    h=.5+.35*(1.-st)+.05*n; ao=1.; paint=0.;`,
  anodized: `
    float br=pfbm(vec2(uv.x*2., uv.y*160.),160.,3);
    float scr=scratches(uv,10.,11.);
    float n=pfbm(uv*4.,4.,5);
    alb=vec3(.055+.01*n+.01*br); alb=mix(alb, vec3(.55), scr*.7);
    rough=.34+.1*br+.06*n; rough=mix(rough,.22,scr); metal=.75+.25*scr;
    h=.5+.04*br-.05*scr; ao=1.; paint=0.;`,
  phosphate: `
    float g=h12(floor(uv*512.)); float n=pfbm(uv*8.,8.,5);
    float wear=smoothstep(.62,.8,pfbm(uv*3.,3.,6));
    alb=mix(vec3(.05,.052,.05)*(.85+.3*g), vec3(.4,.41,.42), wear*.6);
    rough=mix(.6+.15*g, .3, wear); metal=mix(.55,1.,wear);
    h=.5+.08*g+.05*n; ao=1.; paint=0.;`,
  fabric: `
    vec2 w=uv*vec2(96.,96.);
    float wx=sin(w.x*3.1416)*.5+.5, wy=sin(w.y*3.1416)*.5+.5;
    float over=step(.5,fract((floor(w.x)+floor(w.y))*.5));
    float weave=mix(wx*(.6+.4*wy), wy*(.6+.4*wx), over);
    float n=pfbm(uv*5.,5.,5);
    float dirt=smoothstep(.5,.85,pfbm(uv*3.+2.,3.,5));
    alb=vec3((.62+.38*weave)*(.85+.25*n))*(1.-.35*dirt); paint=1.-dirt*.4;
    rough=.92; metal=0.; h=.3+.6*weave+.1*n; ao=.7+.3*weave;`,
  leather: `
    vec3 v=pvor(uv*40.,40.); float n=pfbm(uv*6.,6.,5);
    float crease=smoothstep(.06,0.,v.y-v.x);
    alb=vec3(.75+.25*n)*(1.-.45*crease); paint=1.-.3*crease;
    rough=.6+.2*n+.2*crease; metal=0.; h=.6+.2*n-.5*crease; ao=1.-.4*crease;`,
  plasterBlock: `
    vec2 b=vec2(uv.x*2., uv.y*4.); float row=floor(b.y); b.x+=mod(row,2.)*.5; vec2 f=fract(b);
    float joint=smoothstep(.0,.02,f.x)*smoothstep(1.,.98,f.x)*smoothstep(.0,.03,f.y)*smoothstep(1.,.97,f.y);
    float n=pfbm(uv*6.,6.,6); float stain=smoothstep(.45,.9,pfbm(vec2(uv.x*6.,uv.y*1.5),6.,5));
    alb=vec3(.46,.45,.42)*(.85+.25*n)*(1.-.45*stain)*(.6+.4*joint);
    rough=.9; metal=0.; h=.4+.4*joint+.2*n; ao=.6+.4*joint; paint=0.;`,
};

const VERT = 'in vec3 position; in vec2 uv; out vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
function frag(body) {
  return /* glsl */`precision highp float;
in vec2 vUv; out vec4 o; uniform int MODE; uniform float texel;
${COMMON}
void surf(vec2 uv, out vec3 alb, out float rough, out float metal, out float h, out float ao, out float paint){
  alb=vec3(.5); rough=.8; metal=0.; h=.5; ao=1.; paint=0.;
  ${body}
}
float H(vec2 uv){ vec3 a; float r,m,h,ao,p; surf(uv,a,r,m,h,ao,p); return h; }
void main(){
  vec3 alb; float rough, metal, h, ao, paint; surf(vUv, alb, rough, metal, h, ao, paint);
  if(MODE==0){ o=vec4(clamp(alb,0.,1.), paint); }
  else if(MODE==1){ o=vec4(ao, clamp(rough,.02,1.), metal, 1.); }
  else { float e=texel; float hx=H(vUv+vec2(e,0.))-H(vUv-vec2(e,0.)); float hy=H(vUv+vec2(0.,e))-H(vUv-vec2(0.,e));
    float s=1./(e*2.)*0.012; vec3 n=normalize(vec3(-hx*s,-hy*s,1.)); o=vec4(n*.5+.5,1.); }
}`;
}

export class Baker {
  constructor(renderer, size) {
    this.r = renderer; this.size = size; this.sets = {};
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }
  makeRT(srgb) {
    const s = this.size;
    const rt = new THREE.WebGLRenderTarget(s, s, {
      type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    });
    rt.texture.anisotropy = Math.min(8, this.r.capabilities.getMaxAnisotropy());
    if (srgb) rt.texture.colorSpace = THREE.SRGBColorSpace;
    return rt;
  }
  bake(name, size) {
    if (this.sets[name]) return this.sets[name];
    const s = size || this.size;
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag(SURF[name]),
      uniforms: { MODE: { value: 0 }, texel: { value: 1 / s } }, depthTest: false, depthWrite: false,
    });
    this.quad.material = mat;
    const prevSize = this.size; this.size = s;
    const out = {};
    const prevRT = this.r.getRenderTarget();
    const prevXR = this.r.xr.enabled;
    ['albedo', 'orm', 'normal'].forEach((k, i) => {
      const rt = this.makeRT(i === 0);
      mat.uniforms.MODE.value = i;
      this.r.setRenderTarget(rt);
      this.r.render(this.scene, this.cam);
      out[k] = rt.texture; (out._rts || (out._rts = {}))[k] = rt;
    });
    this.r.setRenderTarget(prevRT); this.r.xr.enabled = prevXR;
    this.size = prevSize;
    mat.dispose();
    this.sets[name] = out;
    return out;
  }
}
