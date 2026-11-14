// Shared GLSL: hashes, periodic noise (tileable bakes), world noise, voronoi, rain ripples.
export const NOISE = /* glsl */`
float h12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 h22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float h13(vec3 p3){ p3=fract(p3*.1031); p3+=dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
// periodic value noise: period P (integer cells)
float pn(vec2 p, float P){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  float a=h12(mod(i,P)), b=h12(mod(i+vec2(1,0),P)), c=h12(mod(i+vec2(0,1),P)), d=h12(mod(i+vec2(1,1),P));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float pfbm(vec2 p, float P, int oct){ float s=0., a=.5; for(int i=0;i<8;i++){ if(i>=oct) break; s+=a*pn(p,P); p*=2.; P*=2.; a*=.5; } return s; }
// periodic voronoi: returns (F1, F2, cell id)
vec3 pvor(vec2 p, float P){ vec2 i=floor(p), f=fract(p); float d1=8., d2=8.; float id=0.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(x,y); vec2 c=mod(i+g,P); vec2 o=h22(c);
    vec2 r=g+o-f; float d=dot(r,r); if(d<d1){ d2=d1; d1=d; id=h12(c+7.1);} else if(d<d2) d2=d; }
  return vec3(sqrt(d1), sqrt(d2), id); }
// world (non periodic) noise
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h12(i),h12(i+vec2(1,0)),u.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),u.x),u.y); }
float vn3(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.-2.*f);
  float n000=h13(i), n100=h13(i+vec3(1,0,0)), n010=h13(i+vec3(0,1,0)), n110=h13(i+vec3(1,1,0));
  float n001=h13(i+vec3(0,0,1)), n101=h13(i+vec3(1,0,1)), n011=h13(i+vec3(0,1,1)), n111=h13(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,u.x),mix(n010,n110,u.x),u.y),mix(mix(n001,n101,u.x),mix(n011,n111,u.x),u.y),u.z); }
float fbm2(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
float fbm3(vec3 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vn3(p); p=p*2.01+vec3(1.7,9.2,3.1); a*=.5; } return s; }
`;

// Rain ripple normal for horizontal water: expanding rings in a jittered grid, time animated.
export const RIPPLES = /* glsl */`
vec2 rainRipple(vec2 p, float t){
  vec2 n=vec2(0.);
  for(int l=0;l<2;l++){
    vec2 q=p*(l==0?1.0:1.73)+float(l)*3.7;
    vec2 i=floor(q), f=fract(q);
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
      vec2 g=vec2(x,y); vec2 c=i+g; vec2 o=h22(c)*.8+.1;
      float ph=fract(t*(0.9+h12(c+3.3)*.6)+h12(c));
      vec2 d=g+o-f; float r=length(d);
      float ring=ph*0.6; float w=r-ring;
      float a=(1.-ph)*(1.-ph)*smoothstep(.12,0.,abs(w))*smoothstep(0.6,0.,r);
      n+=normalize(d+1e-4)*sin(w*48.)*a;
    }
  }
  return n*0.5;
}
`;
