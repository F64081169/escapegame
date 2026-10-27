// 場景：背景漸層、道具、粒子
(function(){
'use strict';

const BG = {
  void:       {g:'radial-gradient(90% 70% at 50% 40%,#151a2c 0%,#0a0d17 100%)', fx:'dust', v:''},
  rain:       {g:'radial-gradient(120% 90% at 80% 0%,#2b3556 0%,#141a2e 50%,#090c16 100%)', fx:'rain', v:'巷口'},
  clinicfront:{g:'radial-gradient(90% 70% at 30% 25%,#3a2a3e 0%,#151b2c 55%,#080b14 100%)', fx:'rain', v:'動物醫院', prop:'neon'},
  clinic:     {g:'linear-gradient(180deg,#1f3134 0%,#172528 55%,#0e1618 100%)', fx:'dust', v:'診療室', prop:'tube'},
  room:       {g:'radial-gradient(80% 70% at 20% 85%,#4a3226 0%,#22192a 55%,#110e1a 100%)', fx:'dust', v:'房間'},
  office:     {g:'linear-gradient(180deg,#2a3446 0%,#222a3a 60%,#1a2030 100%)', fx:null, v:'辦公室'},
  petstore:   {g:'linear-gradient(160deg,#4d3b2a 0%,#3a2e2a 50%,#251e22 100%)', fx:'dust', v:'寵物用品店'},
  park:       {g:'linear-gradient(180deg,#141b33 0%,#1d2440 50%,#2c2236 100%)', fx:'bokeh', v:'河濱'},
  door:       {g:'linear-gradient(180deg,#2a2a30 0%,#1c1c23 60%,#121218 100%)', fx:null, v:'樓梯間', prop:'lamp'},
  rooftop:    {g:'linear-gradient(180deg,#0b1026 0%,#18193a 55%,#2e2140 100%)', fx:'stars', v:'頂樓', prop:'bulbs'},
  home:       {g:'radial-gradient(90% 80% at 70% 75%,#4d3528 0%,#2a2030 55%,#161320 100%)', fx:'dust', v:'家'},
  garage:     {g:'linear-gradient(180deg,#23272c 0%,#1a1d21 60%,#0f1114 100%)', fx:null, v:'停車場', prop:'tube'},
  oldhouse:   {g:'radial-gradient(100% 80% at 50% 15%,#5a2a26 0%,#33191c 55%,#1a0e12 100%)', fx:'dust', v:'團圓飯', prop:'lanterns'},
  balcony:    {g:'linear-gradient(180deg,#0d1022 0%,#1b1631 60%,#2e1a2a 100%)', fx:'fireworks', v:'陽台'},
  oldroom:    {g:'radial-gradient(70% 60% at 30% 75%,#3b3024 0%,#1e1a20 60%,#0f0d14 100%)', fx:'dust', v:'舊房間', prop:'lamp'},
  hospital:   {g:'linear-gradient(180deg,#24343e 0%,#1a262e 60%,#111a20 100%)', fx:null, v:'醫院', prop:'tube'},
  tokyo:      {g:'linear-gradient(180deg,#0c0f24 0%,#1d1838 50%,#3a1f3e 100%)', fx:'bokeh', v:'東京', prop:'skyline'},
  his:        {g:'radial-gradient(90% 80% at 50% 100%,#1d2a44 0%,#10172a 55%,#080b16 100%)', fx:'dust', v:'他'},
  store:      {g:'linear-gradient(180deg,#26393a 0%,#1d292b 55%,#111a1c 100%)', fx:null, v:'巷口', prop:'tube'}
};

const bulbs = () => {
  const n = 15;
  let s = '<div class="bulbs">';
  for (let i = 0; i < n; i++) {
    const x = 100 * i / (n - 1), y = 34 * Math.sin(Math.PI * i / (n - 1));
    s += `<i class="${i === 10 ? 'off' : ''}" style="left:${x}%;top:${y}px"></i>`;
  }
  return s + '</div>';
};
const PROPS = {
  neon: '<div class="neon"><span>晴天動物醫院</span><em>・</em><b>2</b><i>4H</i></div>',
  bulbs: bulbs(),
  lanterns: '<div class="lantern l1"></div><div class="lantern l2"></div>',
  skyline: '<div class="skyline"></div>',
  tube: '<div class="tube"></div>',
  lamp: '<div class="lamp"></div>'
};

const $ = q => document.querySelector(q);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let flip = false, cur = null;

function setBg(id){
  if (id === cur) return;
  cur = id;
  const b = BG[id] || BG.void;
  const a = $('#bgA'), c = $('#bgB');
  const on = flip ? a : c, off = flip ? c : a;
  flip = !flip;
  on.style.background = b.g;
  on.style.opacity = 1;
  off.style.opacity = 0;
  $('#vert').textContent = b.v || '';
  $('#prop').innerHTML = b.prop ? PROPS[b.prop] : '';
  setFx(b.fx || null);
}

// ---------- particles
const cv = $('#fx'), cx = cv.getContext('2d');
const P = {type:null, ps:[], w:0, h:0, raf:0, t:0, next:0};
const R = Math.random;

function size(){
  const r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, r.width * d);
  cv.height = Math.max(1, r.height * d);
  cx.setTransform(d, 0, 0, d, 0, 0);
  P.w = r.width; P.h = r.height;
  seed();
  if (reduced) draw();
}

function seed(){
  const {w, h} = P;
  P.ps = [];
  const add = (n, f) => { for (let i = 0; i < n; i++) P.ps.push(f(i)); };
  if (P.type === 'rain')  add(Math.round(w * h / 8000), () => ({x:R()*w*1.2, y:R()*h, l:10+R()*18, v:7+R()*7, a:.1+R()*.25}));
  if (P.type === 'dust')  add(Math.round(w * h / 22000), () => ({x:R()*w, y:R()*h, r:.5+R()*1.5, vx:(R()-.5)*.15, vy:-.04-R()*.18, a:.12+R()*.3, p:R()*6}));
  if (P.type === 'bokeh') add(Math.round(14 + w / 70), i => ({x:R()*w, y:R()*h, r:10+R()*38, vx:(R()-.5)*.14, vy:(R()-.5)*.08, hue:[34,330,205,18][i % 4], a:.05+R()*.11}));
  if (P.type === 'stars') add(Math.round(w * h / 4500), () => ({x:R()*w, y:R()*h*.7, r:.2+R()*1.2, p:R()*6, s:.6+R()*2}));
  P.next = 0;
}

function burst(){
  const x = P.w * (.15 + R() * .7), y = P.h * (.12 + R() * .3), hue = [12, 38, 330, 200, 50][Math.floor(R() * 5)];
  for (let i = 0; i < 46; i++) {
    const ang = Math.PI * 2 * i / 46, sp = 1.2 + R() * 2.2;
    P.ps.push({x, y, vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp, life:1, hue});
  }
}

function draw(){
  const {w, h} = P;
  cx.clearRect(0, 0, w, h);
  P.t += .016;
  const t = P.t;
  switch (P.type) {
    case 'rain':
      cx.lineWidth = 1;
      for (const d of P.ps) {
        cx.strokeStyle = `rgba(175,195,235,${d.a})`;
        cx.beginPath(); cx.moveTo(d.x, d.y); cx.lineTo(d.x - d.l * .22, d.y + d.l); cx.stroke();
        if (!reduced) { d.y += d.v; d.x -= d.v * .22; if (d.y > h) { d.y = -20; d.x = R() * w * 1.2; } }
      }
      break;
    case 'dust':
      for (const d of P.ps) {
        cx.fillStyle = `rgba(255,238,215,${d.a * (.55 + .45 * Math.sin(t * 1.5 + d.p))})`;
        cx.beginPath(); cx.arc(d.x, d.y, d.r, 0, 7); cx.fill();
        if (!reduced) { d.x += d.vx; d.y += d.vy; if (d.y < -5) { d.y = h + 5; d.x = R() * w; } }
      }
      break;
    case 'bokeh':
      cx.globalCompositeOperation = 'lighter';
      for (const d of P.ps) {
        const g = cx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        g.addColorStop(0, `hsla(${d.hue},85%,72%,${d.a})`);
        g.addColorStop(1, `hsla(${d.hue},85%,72%,0)`);
        cx.fillStyle = g; cx.beginPath(); cx.arc(d.x, d.y, d.r, 0, 7); cx.fill();
        if (!reduced) { d.x += d.vx; d.y += d.vy; if (d.x < -50) d.x = w + 50; if (d.x > w + 50) d.x = -50; if (d.y < -50) d.y = h + 50; if (d.y > h + 50) d.y = -50; }
      }
      cx.globalCompositeOperation = 'source-over';
      break;
    case 'stars':
      for (const d of P.ps) {
        cx.fillStyle = `rgba(240,236,255,${.35 + .55 * Math.abs(Math.sin(t * d.s + d.p))})`;
        cx.beginPath(); cx.arc(d.x, d.y, d.r, 0, 7); cx.fill();
      }
      break;
    case 'fireworks':
      if (!reduced && t > P.next) { burst(); P.next = t + 1.1 + R() * 1.6; }
      cx.globalCompositeOperation = 'lighter';
      for (const d of P.ps) {
        cx.fillStyle = `hsla(${d.hue},90%,65%,${Math.max(0, d.life)})`;
        cx.beginPath(); cx.arc(d.x, d.y, 1.6, 0, 7); cx.fill();
        d.x += d.vx; d.y += d.vy; d.vy += .025; d.vx *= .985; d.life -= .012;
      }
      cx.globalCompositeOperation = 'source-over';
      P.ps = P.ps.filter(d => d.life > 0);
      break;
  }
}

function loop(){
  if (P.raf || reduced) return;
  const tick = () => {
    P.raf = 0;
    if (!P.type || document.hidden) { cx.clearRect(0, 0, P.w, P.h); return; }
    draw();
    P.raf = requestAnimationFrame(tick);
  };
  P.raf = requestAnimationFrame(tick);
}

function setFx(type){
  P.type = type;
  seed();
  if (!type) { cx.clearRect(0, 0, P.w, P.h); return; }
  if (reduced) draw(); else loop();
}

addEventListener('resize', size);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });
size();

window.Scene = {setBg, BG};
})();
