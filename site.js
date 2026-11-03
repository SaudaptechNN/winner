(function(){
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const isMobile = () => innerWidth < 900;

/* ---------- 3D SCENE ---------- */
const canvas = document.getElementById('gl');
let renderer, scene, camera, globe, dotsMat, markers = {}, planes = [], stars;
const R = 2;
const ll = (lat, lon, r=R) => {
  const phi = (90-lat)*Math.PI/180, th = (lon+180)*Math.PI/180;
  return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(th), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(th));
};
const PLACES = {
  home:     {lat:32.78, lon:-96.8,  label:'Dallas · Home Base'},
  greece:   {lat:36.4,  lon:25.4,   label:'Santorini · Greece'},
  maldives: {lat:3.2,   lon:73.2,   label:'Maldives'},
  tanzania: {lat:-6.4,  lon:34.9,   label:'Tanzania'},
  thailand: {lat:12.9,  lon:100.9,  label:'Thailand'},
  group:    {lat:20,    lon:-30,    label:'Group Retreats · Worldwide'},
  celebrate:{lat:25,    lon:-75,    label:'Celebrations · Worldwide'}
};

try{
  renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, innerWidth/innerHeight, .1, 100);
  camera.position.set(0,0,9);

  globe = new THREE.Group(); scene.add(globe);

  // core sphere
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(R*.985,64,64),
    new THREE.MeshBasicMaterial({color:0x070b16})));
  // atmosphere
  const atm = new THREE.Mesh(new THREE.SphereGeometry(R*1.18,64,64), new THREE.ShaderMaterial({
    transparent:true, side:THREE.BackSide, blending:THREE.AdditiveBlending, depthWrite:false,
    vertexShader:'varying vec3 n;void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 n;void main(){float i=pow(.62-dot(n,vec3(0,0,1.)),3.);gl_FragColor=vec4(.84,.69,.42,1.)*i;}'
  }));
  scene.add(atm); atm.userData.fixed = true; globe.userData.atm = atm;

  // latitude/longitude graticule
  const gm = new THREE.LineBasicMaterial({color:0xd6b26a, transparent:true, opacity:.07});
  for(let lat=-60; lat<=60; lat+=30){ const p=[]; for(let lo=0;lo<=360;lo+=4) p.push(ll(lat,lo-180,R*1.001)); globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),gm)); }
  for(let lo=0; lo<360; lo+=30){ const p=[]; for(let la=-90;la<=90;la+=4) p.push(ll(la,lo-180,R*1.001)); globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),gm)); }

  // dotted land (sampled from a world map; falls back to uniform dots)
  dotsMat = new THREE.PointsMaterial({color:0xd6b26a, size:.026, transparent:true, opacity:.85, sizeAttenuation:true, depthWrite:false});
  function buildDots(mask){
    const pts=[]; const N=26000, ga=Math.PI*(3-Math.sqrt(5));
    for(let i=0;i<N;i++){
      const y=1-(i/(N-1))*2, rr=Math.sqrt(1-y*y), t=ga*i;
      const v=new THREE.Vector3(Math.cos(t)*rr*R, y*R, Math.sin(t)*rr*R);
      if(mask){
        const lat=Math.asin(y)*180/Math.PI;
        // invert ll(): th = atan2(z,-x)
        let th=Math.atan2(v.z,-v.x); if(th<0) th+=2*Math.PI;
        const lon=th*180/Math.PI-180;
        if(!mask(lat,lon)) continue;
      }
      pts.push(v.x,v.y,v.z);
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    globe.add(new THREE.Points(g,dotsMat));
  }
  const img=new Image(); img.crossOrigin='anonymous';
  img.onload=()=>{
    try{
      const c=document.createElement('canvas'); c.width=720; c.height=360;
      const x=c.getContext('2d'); x.drawImage(img,0,0,720,360);
      const d=x.getImageData(0,0,720,360).data; const lum=new Float32Array(720*360); let sum=0;
      for(let i=0;i<lum.length;i++){lum[i]=(d[i*4]+d[i*4+1]+d[i*4+2])/3; sum+=lum[i];}
      const mean=sum/lum.length; let above=0; for(let i=0;i<lum.length;i++) if(lum[i]>mean) above++;
      const landIsBright = above < lum.length/2; // land is the minority class
      buildDots((lat,lon)=>{
        const px=Math.min(719,Math.max(0,Math.floor((lon+180)/360*720))), py=Math.min(359,Math.max(0,Math.floor((90-lat)/180*360)));
        const b=lum[py*720+px]>mean; return landIsBright? b : !b;
      });
    }catch(e){buildDots(null)}
  };
  img.onerror=()=>buildDots(null);
  img.src='https://unpkg.com/three-globe@2.31.0/example/img/earth-water.png';

  // markers + arcs from home
  const home = ll(PLACES.home.lat, PLACES.home.lon);
  Object.keys(PLACES).forEach(k=>{
    if(['group','celebrate'].includes(k)) return;
    const p = ll(PLACES[k].lat, PLACES[k].lon);
    const m = new THREE.Mesh(new THREE.SphereGeometry(k==='home'?.05:.04,16,16), new THREE.MeshBasicMaterial({color:k==='home'?0xffffff:0xf3dca1}));
    m.position.copy(p); globe.add(m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.06,.07,32), new THREE.MeshBasicMaterial({color:0xf3dca1,transparent:true,opacity:.8,side:THREE.DoubleSide}));
    ring.position.copy(p.clone().multiplyScalar(1.004)); ring.lookAt(p.clone().multiplyScalar(2)); globe.add(ring);
    markers[k]={m,ring,p};
    if(k!=='home'){
      const mid = home.clone().add(p).multiplyScalar(.5).normalize().multiplyScalar(R*(1.25+home.distanceTo(p)*.12));
      const curve = new THREE.QuadraticBezierCurve3(home,mid,p);
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(80)),
        new THREE.LineBasicMaterial({color:0xd6b26a,transparent:true,opacity:.35})));
      const pl = new THREE.Mesh(new THREE.SphereGeometry(.035,12,12), new THREE.MeshBasicMaterial({color:0xffffff}));
      globe.add(pl); planes.push({mesh:pl,curve,t:Math.random(),speed:.0016+Math.random()*.001});
    }
  });

  // starfield
  const sp=[]; for(let i=0;i<1800;i++){ const r=18+Math.random()*30, a=Math.random()*6.283, b=Math.acos(2*Math.random()-1);
    sp.push(r*Math.sin(b)*Math.cos(a), r*Math.cos(b), r*Math.sin(b)*Math.sin(a)); }
  const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));
  stars=new THREE.Points(sg,new THREE.PointsMaterial({color:0xf4efe6,size:.06,transparent:true,opacity:.7}));
  scene.add(stars);

  // gold dust floating
  const dp=[]; for(let i=0;i<240;i++) dp.push((Math.random()-.5)*14,(Math.random()-.5)*9,(Math.random()-.5)*6);
  const dg=new THREE.BufferGeometry(); dg.setAttribute('position',new THREE.Float32BufferAttribute(dp,3));
  const dust=new THREE.Points(dg,new THREE.PointsMaterial({color:0xd6b26a,size:.03,transparent:true,opacity:.55}));
  dust.position.z=2; scene.add(dust); globe.userData.dust=dust;
}catch(e){ console.warn('WebGL unavailable',e); canvas.style.display='none'; }

/* ---------- focus / camera state ---------- */
let focusKey='home';
const targetQ = new THREE.Quaternion(), curQ = new THREE.Quaternion();
const pos = {x:0,y:0,z:9,s:1}, tgt = {x:0,y:0,z:9,s:1};
const mouse = {x:0,y:0,sx:0,sy:0};
const lbl = document.getElementById('lbl');

function setFocus(k){
  if(!PLACES[k]||!globe) return;
  focusKey=k;
  const dir = ll(PLACES[k].lat,PLACES[k].lon).normalize();
  // tilt slightly so the point sits just above center
  targetQ.setFromUnitVectors(dir, new THREE.Vector3(0,.12,1).normalize());
  const focusPlace = ['greece','maldives','tanzania','thailand'].includes(k);
  tgt.s = focusPlace ? 1.18 : 1;
  tgt.x = isMobile()?0: (k==='group'?2.6 : k==='celebrate'?-2.6 : focusPlace?2.4:2.5);
  tgt.y = isMobile()?1.2:0;
  lbl.style.opacity=0; setTimeout(()=>{lbl.textContent=PLACES[k].label; lbl.style.opacity=1},350);
}
if(globe){ setFocus('home'); globe.quaternion.copy(targetQ); curQ.copy(targetQ); }

const io = new IntersectionObserver(es=>{
  es.forEach(e=>{ if(e.isIntersecting) setFocus(e.target.dataset.focus); });
},{rootMargin:'-45% 0px -45% 0px'});
document.querySelectorAll('[data-focus]').forEach(el=>io.observe(el));

let scrollY_=0; addEventListener('scroll',()=>{scrollY_=scrollY; document.getElementById('hd').classList.toggle('s',scrollY>40);},{passive:true});
addEventListener('mousemove',e=>{ mouse.x=(e.clientX/innerWidth-.5); mouse.y=(e.clientY/innerHeight-.5); });

function resize(){
  if(!renderer) return;
  renderer.setSize(innerWidth,innerHeight,false);
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  if(globe) setFocus(focusKey);
}
addEventListener('resize',resize); resize();

const clock=new THREE.Clock();
function loop(){
  requestAnimationFrame(loop);
  if(!renderer) return;
  const t=clock.getElapsedTime();
  curQ.slerp(targetQ, reduce?1:.045);
  globe.quaternion.copy(curQ);
  // slow idle spin around local view axis for life
  mouse.sx+=(mouse.x-mouse.sx)*.05; mouse.sy+=(mouse.y-mouse.sy)*.05;
  pos.x+=(tgt.x-pos.x)*.05; pos.y+=(tgt.y-pos.y)*.05; pos.s+=(tgt.s-pos.s)*.05;
  const sc = pos.s*(isMobile()?.78:1);
  globe.scale.setScalar(sc);
  const off = new THREE.Vector3(pos.x*0.72, pos.y, 0);
  globe.position.copy(off);
  globe.userData.atm.position.copy(off); globe.userData.atm.scale.setScalar(sc);
  globe.rotateOnWorldAxis(new THREE.Vector3(0,1,0), mouse.sx*.35);
  globe.rotateOnWorldAxis(new THREE.Vector3(1,0,0), mouse.sy*.2);
  camera.position.x = mouse.sx*.6; camera.position.y = -mouse.sy*.4 - scrollY_*.0004;
  camera.lookAt(0,0,0);
  stars.rotation.y = t*.008 + scrollY_*.00008; stars.rotation.x = scrollY_*.00004;
  globe.userData.dust.rotation.y = t*.03; globe.userData.dust.position.y = -scrollY_*.0006;
  Object.entries(markers).forEach(([k,o])=>{ const s=1+((t*1.2+o.p.x)%1)*1.8; o.ring.scale.setScalar(s); o.ring.material.opacity=.8*(1-((t*1.2+o.p.x)%1)); });
  planes.forEach(p=>{ p.t=(p.t+p.speed)%1; p.mesh.position.copy(p.curve.getPoint(p.t)); });
  renderer.render(scene,camera);
}
loop();

/* ---------- UI motion ---------- */
document.getElementById('bg').onclick=()=>document.body.classList.toggle('menu');
document.querySelectorAll('#menu a').forEach(a=>a.addEventListener('click',()=>document.body.classList.remove('menu')));

addEventListener('load',()=>{
  const first=!document.documentElement.classList.contains('nopre'); try{sessionStorage.setItem('wcpre','1')}catch(e){}
  setTimeout(()=>{
    document.getElementById('pre').classList.add('done');
    if(window.gsap && !reduce){
      gsap.to('.hero h1 .l span,.phero h1 .l span',{y:0,duration:1.4,ease:'expo.out',stagger:.14,delay:.35});
      gsap.registerPlugin(ScrollTrigger);
      gsap.utils.toArray('.rv').forEach((el,i)=>{
        gsap.to(el,{opacity:1,y:0,duration:1.1,ease:'power3.out',scrollTrigger:{trigger:el,start:'top 88%'},delay:(el.closest('.hero')?.5:0)});
      });
    } else {
      document.querySelectorAll('.rv').forEach(e=>{e.style.opacity=1;e.style.transform='none'});
      document.querySelectorAll('.hero h1 .l span,.phero h1 .l span').forEach(e=>e.style.transform='none');
    }
  },first?900:50);
});
// safety net if CDN blocked
setTimeout(()=>{ if(!window.gsap){ document.querySelectorAll('.rv').forEach(e=>{e.style.opacity=1;e.style.transform='none'}); document.querySelectorAll('.hero h1 .l span,.phero h1 .l span').forEach(e=>e.style.transform='none'); document.getElementById('pre').classList.add('done'); } },3500);

/* 3D tilt cards */
document.querySelectorAll('.tilt').forEach(c=>{
  c.addEventListener('mousemove',e=>{
    const r=c.getBoundingClientRect(), x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height;
    c.style.setProperty('--ry',((x-.5)*14)+'deg'); c.style.setProperty('--rx',((.5-y)*14)+'deg');
    c.style.setProperty('--mx',(x*100)+'%'); c.style.setProperty('--my',(y*100)+'%');
    if(!c.classList.contains('dest')) c.style.transform=`rotateX(${(.5-y)*12}deg) rotateY(${(x-.5)*12}deg)`;
  });
  c.addEventListener('mouseleave',()=>{ c.style.setProperty('--rx','0deg'); c.style.setProperty('--ry','0deg'); if(!c.classList.contains('dest')) c.style.transform=''; });
});
document.querySelectorAll('.tilt3d').forEach(s=>{
  const st=s.parentElement;
  st.addEventListener('mousemove',e=>{ const r=st.getBoundingClientRect(); const x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5; s.style.transform=`rotateY(${x*-26}deg) rotateX(${y*18}deg)`; });
  st.addEventListener('mouseleave',()=>s.style.transform='');
});

/* cursor */
const cur=document.querySelector('.cur'), cr=document.querySelector('.cur-r'); let cx=0,cy=0,rx=0,ry=0;
addEventListener('mousemove',e=>{cx=e.clientX;cy=e.clientY; cur.style.transform=`translate(${cx-5}px,${cy-5}px)`;});
(function f(){ rx+=(cx-rx)*.15; ry+=(cy-ry)*.15; cr.style.transform=`translate(${rx-22}px,${ry-22}px)`; requestAnimationFrame(f); })();
document.querySelectorAll('a,button,.tilt').forEach(el=>{ el.addEventListener('mouseenter',()=>cr.classList.add('hov')); el.addEventListener('mouseleave',()=>cr.classList.remove('hov')); });
})();
