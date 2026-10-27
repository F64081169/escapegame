// 引擎：劇本直譯、對話框、手機、選項、存檔
(function(){
'use strict';

const S = window.STORY, ENDINGS = window.ENDINGS, EXTRA = window.EXTRA_DRAFTS || [];
const $ = q => document.querySelector(q);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
const clamp = v => Math.max(0, Math.min(100, v));
const WAIT = 1;
const TOTAL_ENDINGS = Object.keys(ENDINGS).length;
const TOTAL_DRAFTS = 127;

const PART_LABEL = {1:'第一部　戀愛線', 2:'第二部　婚後線', 3:'第三部　男方視角'};
const CAST = {
  me:    {n: () => G.name, c:'var(--her)', g: () => G.name.slice(-1)},
  jm:    {n:'江默', c:'var(--him)', g:'默'},
  lei:   {n:'阿蕾', c:'var(--c-lei)', g:'蕾'},
  bei:   {n:'阿北', c:'var(--c-bei)', g:'北'},
  cat:   {n:'發財', c:'var(--c-cat)', g:'喵'},
  dad:   {n:'江爸', c:'var(--c-dad)', g:'爸'},
  ama:   {n:'阿嬤', c:'var(--c-ama)', g:'嬤'},
  nurse: {n:'護理師', c:'var(--c-nurse)', g:'護'}
};
const STAT = {
  love:  {lb:'親密', c:'var(--her)'},
  run:   {lb:'逃跑', c:'var(--alert)'},
  self:  {lb:'自我', c:'var(--sage)'},
  brave: {lb:'勇氣', c:'var(--him)'}
};
const TONE = {
  true:   ['rgba(255,179,139,.28)', 'var(--her)'],
  good:   ['rgba(159,211,178,.24)', 'var(--sage)'],
  self:   ['rgba(159,211,178,.24)', 'var(--sage)'],
  normal: ['rgba(141,170,216,.22)', 'var(--him)'],
  bad:    ['rgba(255,100,121,.22)', 'var(--alert)']
};
const P1_FLAGS = ['kitten', 'namedAfter', 'kissed', 'clearMsg', 'spam', 'app', 'boundary', 'opened', 'igLike'];
const P3_FLAGS = P1_FLAGS.concat(['safeword', 'dadTalk']);
const pickFlags = (f, keys) => Object.fromEntries(keys.filter(k => f && k in f).map(k => [k, f[k]]));

// ---------- persistence
const KEY = 'escapegame.v1';
const P = (() => {
  let d = {};
  try { d = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  return Object.assign({endings:[], unlocked:{}, speed:1, meters:true, checkpoint:null, lastName:'', lastFlags:null}, d);
})();
const saveP = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} };

// ---------- state
let G = null;
const fresh = (part, o = {}) => ({
  part,
  name: o.name || P.lastName || '林小滿',
  stats: Object.assign({love:10, run:30, self:50, brave:10}, o.stats || {}),
  flags: Object.assign({kitten:'湯圓'}, o.flags || {}),
  drafts: (o.drafts || []).slice(),
  frames: [], scene:null, chap:'', wait:null, opts:null, auto:false, skip:false, log:[]
});
const ctx = () => Object.assign({}, G.flags, G.stats);
const interp = s => String(s).replace(/\{(\w+)\}/g, (m, k) => k === 'name' ? G.name : (G.flags[k] != null ? G.flags[k] : m));

// ---------- interpreter
function go(id){
  const steps = S[id];
  if (!steps) { console.error('找不到場景', id); return; }
  G.scene = id;
  G.frames = [{steps, i:0}];
  run();
}
const push = steps => G.frames.push({steps, i:0});
function run(){
  let guard = 0;
  while (G && guard++ < 4000) {
    const f = G.frames[G.frames.length - 1];
    if (!f) return;
    if (f.i >= f.steps.length) { G.frames.pop(); continue; }
    const s = f.steps[f.i++];
    if (exec(s) === WAIT) return;
  }
}
const resume = () => { if (!G) return; G.wait = null; run(); };

function exec(s){
  if (s.ch) return chapterCard(s);
  if (s.bg) setBg(s.bg, s.loc);
  if ('n' in s) return say(null, s.n, 'narr');
  if ('th' in s) return say(null, s.th, 'thought');
  if ('me' in s) return say('me', s.me, 'line');
  if (s.s) return say(s.s, s.t, 'line');
  if (s.c) return choose(s);
  if (s.phone === 'open') { openPhone(s.with); return; }
  if (s.phone === 'close') { closePhone(); return; }
  if (s.msg) return message(s);
  if (s.sys) return sysLine(s.sys);
  if (s.ghost) return ghost(s.ghost);
  if (s.wait) return pause(s.wait);
  if (s.draft) return draft(s);
  if (s.set) Object.assign(G.flags, s.set);
  if (s.fx || s.note) applyFx(s.fx || {}, s.note);
  if (s.if) { const br = s.if(ctx()) ? s.then : s.else; if (br) push(br); return; }
  if (s.route) { go(s.route(ctx())); return WAIT; }
  if (s.go) { go(s.go); return WAIT; }
  if (s.check) { const id = failCheck(); if (id) { go(id); return WAIT; } return; }
  if (s.end) return showEnding(s.end);
  if (s.input) return askName();
  if (s.drafts) return showDrafts();
  if (s.flood) return flood();
}

function failCheck(){
  const s = G.stats;
  if (G.part === 1) { if (s.self <= 15) return 'p1_fail_self'; if (s.run >= 100) return 'p1_fail_run'; }
  if (G.part === 2 && (s.run >= 100 || s.self <= 10)) return 'p2_end_bad';
  return null;
}

// ---------- timers / animation
let typing = null, anim = null, pend = null, autoT = null;
const SPEED = [46, 28, 13, 0];
const MUL = [1.3, 1, .7, .45];
function later(fn, ms){
  G.wait = 'timer';
  const m = G.skip ? .1 : MUL[P.speed];
  const p = {fn, id:setTimeout(() => { if (pend === p) { pend = null; fn(); } }, Math.max(0, ms * m))};
  pend = p;
}
function flushPend(){ const p = pend; if (!p) return; pend = null; clearTimeout(p.id); p.fn(); }
function stopAll(){
  if (typing) clearInterval(typing.id);
  if (anim) clearInterval(anim.id);
  if (pend) clearTimeout(pend.id);
  clearTimeout(autoT);
  typing = anim = pend = null;
}

function advance(){
  if (!G || !$('#modal').hidden || !$('#ending').hidden || !$('#title').hidden) return;
  if (!$('#card').hidden) { closeCard(); return; }
  if (typing) { finishType(); return; }
  if (anim) { anim.finish(); return; }
  if (pend) { flushPend(); return; }
  if (G.wait === 'click') { G.wait = null; $('#box').classList.remove('ready'); run(); }
}

// ---------- dialogue box
function say(who, text, mode){
  const t = interp(text);
  const box = $('#box'), w = $('#who');
  box.classList.remove('idle', 'ready', 'narr', 'thought', 'line');
  box.classList.add(mode);
  if (who) {
    const c = CAST[who];
    const name = typeof c.n === 'function' ? c.n() : c.n;
    w.hidden = false;
    w.style.setProperty('--c', c.c);
    w.querySelector('.av').textContent = typeof c.g === 'function' ? c.g() : c.g;
    w.querySelector('.nm').textContent = name;
    log(name, t, c.c);
  } else if (mode === 'thought') {
    w.hidden = false;
    w.style.setProperty('--c', 'var(--accent)');
    w.querySelector('.av').textContent = '';
    w.querySelector('.nm').textContent = G.part === 3 ? '江默・心聲' : '心聲';
    log('心聲', t, 'var(--accent)');
  } else {
    w.hidden = true;
    log('', t);
  }
  typeText(t);
  G.wait = 'click';
  return WAIT;
}
function typeText(t){
  const box = $('#text');
  if (typing) clearInterval(typing.id);
  typing = null;
  const ms = G.skip ? 0 : SPEED[P.speed];
  if (!ms) { box.textContent = t; typed(); return; }
  const chars = Array.from(t);
  let i = 0;
  box.textContent = '';
  typing = {t, id:setInterval(() => { box.textContent += chars[i++]; if (i >= chars.length) finishType(); }, ms)};
}
function finishType(){
  if (typing) { clearInterval(typing.id); $('#text').textContent = typing.t; typing = null; }
  typed();
}
function typed(){
  $('#box').classList.add('ready');
  clearTimeout(autoT);
  if (G.skip) autoT = setTimeout(() => { if (G && G.wait === 'click') advance(); }, 80);
  else if (G.auto) autoT = setTimeout(() => { if (G && G.wait === 'click') advance(); }, 1200 + $('#text').textContent.length * 55);
}
// 手機動畫進行時，對話框保留上一句、變暗；換章或結局時才清空
function idleBox(clear){
  const box = $('#box');
  box.classList.add('idle');
  box.classList.remove('ready');
  if (clear) {
    $('#who').hidden = true;
    $('#text').textContent = '';
  }
}

// ---------- HUD
function hud(){
  const m = $('#meters');
  const keys = G.part === 3 ? ['brave'] : ['love', 'run', 'self'];
  m.hidden = !P.meters;
  if (m.dataset.part !== String(G.part)) {
    m.dataset.part = G.part;
    m.innerHTML = keys.map(k => `<div class="meter ${k}" style="color:${STAT[k].c}"><span class="lb">${STAT[k].lb}</span><span class="bar"><i></i></span><span class="val"></span></div>`).join('')
      + (G.part === 3 ? '<div class="meter count"><span class="lb">未送出</span><span class="val" id="unsent"></span></div>' : '');
  }
  keys.forEach(k => {
    const row = m.querySelector('.meter.' + k);
    row.querySelector('i').style.width = G.stats[k] + '%';
    row.querySelector('.val').textContent = G.stats[k];
  });
  if (G.part === 3) $('#unsent').textContent = G.drafts.filter(d => !d.sent).length;
  m.classList.toggle('danger', G.part !== 3 && G.stats.run >= 75);
  $('#chap').textContent = G.chap;
}
function applyFx(fx, note){
  const vis = G.part === 3 ? ['brave'] : ['love', 'run', 'self'];
  const parts = [];
  const runBefore = G.stats.run;
  for (const k of Object.keys(fx)) {
    const v = fx[k];
    if (!v) continue;
    G.stats[k] = clamp((G.stats[k] || 0) + v);
    if (vis.includes(k)) parts.push(`<b style="color:${STAT[k].c}">${STAT[k].lb} ${v > 0 ? '+' : '−'}${Math.abs(v)}</b>`);
  }
  hud();
  const html = P.meters ? parts.join('') : '';
  if (html || note) toast(html, note ? interp(note) : '');
  if (G.part !== 3 && runBefore < 75 && G.stats.run >= 75 && G.stats.run < 100) toast('', '他的手，已經放在門把上了。');
}
function toast(html, note){
  if (G && G.skip && !note) return;
  const box = $('#toasts');
  const t = el('div', 'toast', (html ? `<span class="d">${html}</span>` : '') + (note ? `<span class="n">${esc(note)}</span>` : ''));
  box.append(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.classList.add('out'), 2800);
  setTimeout(() => t.remove(), 3400);
}

// ---------- scene
function setBg(id, loc){
  if (loc != null) $('#loc').textContent = interp(loc);
  window.Scene.setBg(id);
}
const clock = () => { const m = $('#loc').textContent.match(/(\d{1,2}:\d{2})/); return m ? m[1] : ''; };

// ---------- chapter card
function chapterCard(s){
  G.chap = `${s.ch}　${interp(s.t)}`;
  P.checkpoint = {scene:G.scene, part:G.part, name:G.name, stats:{...G.stats}, flags:{...G.flags}, drafts:G.drafts.slice(), label:G.chap};
  saveP();
  resetPhone();
  clearChoices();
  idleBox(true);
  hud();
  const c = $('#card');
  c.querySelector('.c-part').textContent = s.part || PART_LABEL[G.part];
  c.querySelector('.c-no').textContent = s.ch;
  c.querySelector('.c-title').textContent = interp(s.t);
  c.querySelector('.c-q').textContent = s.q ? interp(s.q) : '';
  c.hidden = false;
  c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
  G.wait = 'card';
  if (G.skip) setTimeout(() => { if (G && G.wait === 'card') closeCard(); }, 500);
  return WAIT;
}
function closeCard(){
  $('#card').hidden = true;
  if (G && G.wait === 'card') resume();
}

// ---------- phone
let threads = {}, contact = null;
const glyphFor = name => ({'江默':'默', '阿蕾':'蕾', '阿北':'北'}[name] || name.slice(-1));
function openPhone(w){
  const name = interp(w || '江默');
  const th = $('#thread');
  if (contact !== name) {
    if (contact) threads[contact] = Array.from(th.children);
    th.replaceChildren(...(threads[name] || []));
    contact = name;
  }
  $('#phName').textContent = name;
  $('#phAv').textContent = glyphFor(name);
  const ph = $('#phone');
  if (ph.hidden) { ph.hidden = false; requestAnimationFrame(() => ph.classList.add('on')); }
  th.scrollTop = th.scrollHeight;
}
function closePhone(){
  const ph = $('#phone');
  ph.classList.remove('on', 'drafting');
  ph.hidden = true;
  dots(false);
  $('#replies').replaceChildren();
}
function resetPhone(){
  closePhone();
  threads = {}; contact = null;
  $('#thread').replaceChildren();
  $('#pinput').textContent = '';
  $('#pinput').classList.add('empty');
}
function ensurePhone(){ if ($('#phone').hidden || !contact) openPhone(contact || '江默'); }
function dots(on){
  const th = $('#thread');
  let d = document.getElementById('dots');
  if (on) {
    if (!d) { d = el('div', 'row them', '<div class="bubble typing"><i></i><i></i><i></i></div>'); d.id = 'dots'; }
    th.append(d);
    th.scrollTop = th.scrollHeight;
    $('#phStatus').textContent = '正在輸入…';
  } else {
    if (d) d.remove();
    $('#phStatus').textContent = '';
  }
}
function bubble(side, t, s = {}){
  const th = $('#thread');
  const row = el('div', 'row ' + side);
  let b;
  if (s.kind === 'photo') {
    b = el('div', 'bubble photo', `<span class="ph-img" aria-hidden="true"><i></i><i></i></span><span class="ph-cap">${esc(t.replace(/^\[照片\]\s*/, ''))}</span>`);
  } else if (s.kind === 'sticker') {
    b = el('div', 'bubble sticker', `<span class="kao">${esc(s.k || '(・ω・)')}</span><span class="ph-cap">${esc(t.replace(/^\[貼圖\]\s*/, ''))}</span>`);
  } else {
    b = el('div', 'bubble');
    b.textContent = t;
  }
  const meta = el('div', 'meta');
  const time = s.time || clock();
  meta.textContent = time;
  if (side === 'me' && !s.unread) {
    const mark = () => { meta.innerHTML = '已讀<br>' + esc(time); };
    if (G.skip || !s.readDelay) setTimeout(mark, G.skip ? 0 : 450); else setTimeout(mark, s.readDelay);
  }
  row.append(b, meta);
  const d = document.getElementById('dots');
  if (d) th.insertBefore(row, d); else th.append(row);
  th.scrollTop = th.scrollHeight;
  const who = side === 'me' ? (G.part === 3 ? '江默' : G.name) : contact;
  log(who + '（訊息）', t, side === 'me' ? 'var(--mine)' : 'var(--mist)');
}
function message(s){
  ensurePhone();
  idleBox();
  const t = interp(s.t);
  if (s.msg === 'them') {
    dots(true);
    const wait = s.typing != null ? s.typing : Math.min(2600, 500 + Array.from(t).length * 45);
    later(() => { dots(false); bubble('them', t, s); later(resume, 300); }, wait);
  } else {
    bubble('me', t, s);
    later(resume, s.typing != null ? s.typing : 450);
  }
  return WAIT;
}
function sysLine(t){
  ensurePhone();
  idleBox();
  const th = $('#thread');
  th.append(el('div', 'sys', esc(interp(t))));
  th.scrollTop = th.scrollHeight;
  later(resume, 650);
  return WAIT;
}
function ghost(ms){
  ensurePhone();
  idleBox();
  dots(true);
  later(() => { dots(false); later(resume, 250); }, ms);
  return WAIT;
}
function pause(ms){ later(resume, ms); return WAIT; }

// ---------- choices
function clearChoices(){
  const c = $('#choices');
  c.hidden = true;
  c.replaceChildren();
  $('#replies').replaceChildren();
  $('#replies').classList.remove('pair');
  $('#phone').classList.remove('drafting');
  if (G) G.opts = null;
}
function choose(s){
  const opts = s.c.filter(o => !o.if || o.if(ctx()));
  const inPhone = !!s.phone && !$('#phone').hidden;
  const wrap = inPhone ? $('#replies') : $('#choices');
  wrap.replaceChildren();
  opts.forEach((o, k) => {
    const b = el('button', 'opt' + (inPhone ? ' reply' : '') + (o.tempt ? ' tempt' : ''), `<span class="k">${k + 1}</span><span class="t">${esc(interp(o.t))}</span>`);
    b.type = 'button';
    b.addEventListener('click', e => { e.stopPropagation(); pick(o); });
    wrap.append(b);
  });
  if (!inPhone) wrap.hidden = false;
  else $('#thread').scrollTop = $('#thread').scrollHeight;
  G.opts = opts.map(o => () => pick(o));
  G.wait = 'choice';
  if (G.skip) setSkip(false);
  return WAIT;
}
function pick(o){
  if (!G || G.wait !== 'choice') return;
  clearChoices();
  log('', interp(o.t), null, true);
  if (o.set) Object.assign(G.flags, o.set);
  if (o.fx || o.note) applyFx(o.fx || {}, o.note);
  const seq = [];
  if (o.m) seq.push({msg:'me', t:o.m});
  if (o.then) seq.push(...o.then);
  seq.push({check:true});
  if (o.go) seq.push({go:o.go});
  push(seq);
  resume();
}

// ---------- drafts (第三部)
function typeInto(box, text, done){
  const chars = Array.from(text);
  let i = 0;
  box.textContent = '';
  box.classList.remove('empty');
  $('#phone').classList.add('drafting');
  const finish = () => { if (anim) clearInterval(anim.id); anim = null; box.textContent = text; box.scrollTop = box.scrollHeight; done(); };
  const ms = G.skip ? 0 : [70, 48, 26, 0][P.speed];
  if (!ms) return finish();
  G.wait = 'anim';
  anim = {finish, id:setInterval(() => { box.textContent += chars[i++]; box.scrollTop = box.scrollHeight; if (i >= chars.length) finish(); }, ms)};
}
function eraseInto(box, done){
  let chars = Array.from(box.textContent);
  const finish = () => { if (anim) clearInterval(anim.id); anim = null; box.textContent = ''; box.classList.add('empty'); $('#phone').classList.remove('drafting'); done(); };
  if (G.skip || !chars.length) return finish();
  const step = Math.max(1, Math.ceil(chars.length / 36));
  G.wait = 'anim';
  anim = {finish, id:setInterval(() => { chars = chars.slice(0, -step); box.textContent = chars.join(''); if (!chars.length) finish(); }, 30)};
}
function draft(s){
  ensurePhone();
  idleBox();
  const t = interp(s.draft), need = s.need || 0, box = $('#pinput');
  const record = sent => { G.drafts.push({t, time:s.time, sent}); hud(); };
  const send = () => {
    if (G.wait !== 'choice') return;
    clearChoices();
    if (G.stats.brave >= need) {
      box.textContent = ''; box.classList.add('empty');
      bubble('me', t, {});
      record(true);
      if (need) applyFx({brave: s.gain != null ? s.gain : 10}, '傳送成功。');
      push(s.ok || []);
      later(resume, 600);
    } else {
      $('#phone').classList.add('freeze');
      setTimeout(() => $('#phone').classList.remove('freeze'), 900);
      applyFx({brave:5}, '拇指停在傳送鍵上方三公分……試過了，也算數。');
      later(() => eraseInto(box, () => { record(false); push(s.fail || []); resume(); }), 900);
    }
  };
  const del = () => {
    if (G.wait !== 'choice') return;
    clearChoices();
    eraseInto(box, () => { record(false); push(s.del || s.fail || []); resume(); });
  };
  typeInto(box, t, () => {
    const wrap = $('#replies');
    wrap.replaceChildren();
    wrap.classList.add('pair');
    const short = G.stats.brave < need;
    const b1 = el('button', 'opt draft send' + (short ? ' short' : ''), `<span class="k">1</span><span>傳送</span>${need ? `<span class="req">勇氣 ${G.stats.brave}／${need}</span>` : ''}`);
    b1.type = 'button';
    b1.addEventListener('click', e => { e.stopPropagation(); send(); });
    wrap.append(b1);
    G.opts = [send];
    if (!s.nodel) {
      const b2 = el('button', 'opt draft del', '<span class="k">2</span><span>刪除</span>');
      b2.type = 'button';
      b2.addEventListener('click', e => { e.stopPropagation(); del(); });
      wrap.append(b2);
      G.opts.push(del);
    }
    $('#phone').classList.add('drafting');
    G.wait = 'choice';
  });
  return WAIT;
}
function allDrafts(){
  const live = G.drafts.filter(d => d.time);
  const liveTimes = new Set(live.map(d => d.time));
  return live.concat(EXTRA.filter(d => !liveTimes.has(d.time))).sort((a, b) => a.time.localeCompare(b.time));
}
function showDrafts(){
  const list = allDrafts();
  const html = `<p class="m-eyebrow">備忘錄 › 草稿</p>
    <h3 class="m-title">沒有傳出去的話</h3>
    <ol class="drafts">${list.map(d => `<li class="${d.sent ? 'sent' : ''}"><time>${esc(d.time)}</time><p>${esc(interp(d.t))}</p>${d.sent ? '<span class="tag">這一次，傳出去了</span>' : ''}</li>`).join('')}</ol>
    <p class="m-note">……往下還有 ${TOTAL_DRAFTS - list.length} 則。</p>
    <button class="btn primary m-close" type="button" data-close>關上備忘錄</button>`;
  G.wait = 'modal';
  openModal(html, resume);
  return WAIT;
}
function flood(){
  ensurePhone();
  idleBox();
  const list = allDrafts().filter(d => !d.sent).map(d => interp(d.t)).slice(0, 14);
  let i = 0;
  const tick = () => {
    if (i < list.length) { bubble('me', list[i++], {}); later(tick, 260); }
    else sysLine(`＋${TOTAL_DRAFTS - list.length} 則訊息`);
  };
  tick();
  return WAIT;
}

// ---------- name
function askName(){
  G.wait = 'modal';
  openModal(`<p class="m-eyebrow">序章</p>
    <h3 class="m-title">故事裡的妳，叫做——</h3>
    <input id="nameInput" class="m-input" maxlength="6" autocomplete="off" spellcheck="false" value="${esc(G.name)}" aria-label="女主角的名字">
    <p class="m-note">最多六個字。之後江默會用這個名字叫妳——如果他叫得出口的話。</p>
    <button class="btn primary m-close" type="button" data-close>就是我</button>`, () => {
      const v = ($('#nameInput').value || '').trim().slice(0, 6);
      G.name = v || '林小滿';
      P.lastName = G.name;
      saveP();
      resume();
    });
  const inp = $('#nameInput');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); closeModal(); } });
  setTimeout(() => { inp.focus(); inp.select(); }, 40);
  return WAIT;
}

// ---------- ending
function showEnding(id){
  const e = ENDINGS[id];
  if (!P.endings.includes(id)) P.endings.push(id);
  if (id === 'key') P.unlocked.p2 = true;
  if (e.part === 2) P.unlocked.p3 = true;
  P.lastName = G.name;
  P.lastFlags = {...G.flags};
  saveP();
  setSkip(false); setAuto(false);
  stopAll();
  closePhone(); clearChoices(); idleBox(true);
  const [glow, solid] = TONE[e.tone];
  const ov = $('#ending');
  ov.style.setProperty('--glow', glow);
  ov.style.setProperty('--glow-solid', solid);
  const stats = G.part === 3
    ? `<span>勇氣 <b>${G.stats.brave}</b></span><span>傳出去的草稿 <b>${G.drafts.filter(d => d.sent).length}</b></span>`
    : `<span>親密 <b>${G.stats.love}</b></span><span>逃跑 <b>${G.stats.run}</b></span><span>自我 <b>${G.stats.self}</b></span>`;
  const draftCard = e.draft ? `<div class="e-draft"><span class="lb">他的草稿匣・未傳送</span><time>${esc(e.draft.time)}</time><p>${esc(interp(e.draft.t))}</p></div>` : '';
  const nextBtn = e.next === 2 ? '<button class="btn primary" type="button" data-act="p2">進入第二部　婚後線</button>'
                : e.next === 3 ? '<button class="btn primary" type="button" data-act="p3">進入第三部　男方視角</button>' : '';
  const about = e.part === 3 ? `<div class="e-about">
      <h3>關於逃避型依附</h3>
      <p>逃避型依附不是「不愛」。它比較像一種很早就學會的自我保護：需要別人，曾經是一件危險的事。所以親密感一上升，身體會先拉警報。</p>
      <p>對他有用的，通常是說清楚自己的需要而不追打；約好一個「暫停暗號」，讓撤退變成會回來的暫停；以及看見他藏在行動裡的那些愛——外出籠、鹽酥雞、不成對的拖鞋。</p>
      <p>對妳一樣重要的是：理解他，不代表要無限期地等。妳的需要也是需要。好的關係，是兩個人都往中間走一步。</p>
      <p class="bye">感謝遊玩。今天，記得回訊息。</p>
    </div>` : '';
  $('#endBody').innerHTML = `
    <div class="e-top"><span class="e-rank">${e.rank}</span><span class="e-no">ENDING ${String(e.no).padStart(2, '0')} / ${TOTAL_ENDINGS}</span></div>
    <h2 class="e-title">${esc(e.title)}</h2>
    <p class="e-text">${esc(interp(e.text))}</p>
    ${draftCard}
    <div class="e-stats">${stats}<span>已收集 <b>${P.endings.length}</b> / ${TOTAL_ENDINGS}</span></div>
    <div class="e-actions">${nextBtn}
      <button class="btn" type="button" data-act="retry">重玩這一章</button>
      <button class="btn" type="button" data-act="title">回到標題</button>
    </div>${about}`;
  ov.hidden = false;
  ov.scrollTop = 0;
  G.wait = 'ending';
  ov.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    const a = b.dataset.act;
    if (a === 'p2') startPart(2, true);
    else if (a === 'p3') startPart(3, true);
    else if (a === 'retry') loadCheckpoint();
    else showTitle();
  }));
  setTimeout(() => ov.querySelector('.btn')?.focus({preventScroll:true}), 60);
  return WAIT;
}

// ---------- starting / loading
function hideOverlays(){
  stopAll();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  closeModal(true);
  ['#title', '#ending', '#card'].forEach(q => { $(q).hidden = true; });
  resetPhone(); clearChoices();
  $('#toasts').replaceChildren();
}
function begin(){
  document.body.classList.remove('at-title');
  document.body.classList.toggle('pov-him', G.part === 3);
  $('#meters').dataset.part = '';
  idleBox(true);
  hud();
}
function startPart(n, carry){
  const prev = carry && G ? G : null;
  hideOverlays();
  if (n === 1) {
    G = fresh(1);
    begin();
    go('p1_prologue');
  } else if (n === 2) {
    const base = prev
      ? {name:prev.name, flags:pickFlags(prev.flags, P1_FLAGS), stats:{love:Math.min(60, 40 + Math.round((prev.stats.love - 55) / 2)), run:Math.round(prev.stats.run * .5) + 15, self:Math.max(prev.stats.self, 45)}}
      : {flags:pickFlags(P.lastFlags, P1_FLAGS), stats:{love:48, run:30, self:55}};
    G = fresh(2, base);
    begin();
    go('p2_c6');
  } else {
    const base = {name: prev ? prev.name : undefined, flags:pickFlags(prev ? prev.flags : P.lastFlags, P3_FLAGS), stats:{brave:10}};
    G = fresh(3, base);
    begin();
    go('p3_start');
  }
}
function loadCheckpoint(){
  const c = P.checkpoint;
  if (!c || !S[c.scene]) { showTitle(); return; }
  hideOverlays();
  G = fresh(c.part, {name:c.name, stats:c.stats, flags:c.flags, drafts:c.drafts});
  begin();
  go(c.scene);
}
function showTitle(){
  hideOverlays();
  G = null;
  document.body.classList.remove('pov-him');
  document.body.classList.add('at-title');
  window.Scene.setBg('rain');
  $('#loc').textContent = '';
  $('#chap').textContent = '';
  idleBox(true);
  const cp = P.checkpoint;
  $('#bCont').hidden = !cp;
  $('#bContLabel').textContent = cp ? cp.label : '';
  $('#bEndsCount').textContent = `${P.endings.length} / ${TOTAL_ENDINGS}`;
  $('#title').hidden = false;
  setTimeout(() => $('#bNew').focus({preventScroll:true}), 60);
}

// ---------- modal
let modalClose = null;
function openModal(html, onClose){
  const m = $('#modal');
  $('#sheet').innerHTML = html;
  m.hidden = false;
  modalClose = onClose || null;
  m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); closeModal(); }));
}
function closeModal(silent){
  const m = $('#modal');
  if (m.hidden) return;
  const f = modalClose;
  modalClose = null;
  m.hidden = true;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (f && !silent) f();
}
function logModal(){
  if (!G) return;
  const items = G.log.slice(-200).map(l => `<li class="${l.pick ? 'pick' : ''}">${l.who ? `<span class="w" style="color:${l.c || 'var(--mist)'}">${esc(l.who)}</span>` : ''}<span class="x">${l.pick ? '▸ ' : ''}${esc(l.t)}</span></li>`).join('');
  openModal(`<p class="m-eyebrow">對話紀錄</p><h3 class="m-title">${esc(G.chap || '序章')}</h3><ol class="log">${items || '<li><span class="x">還沒有任何對話。</span></li>'}</ol><button class="btn m-close" type="button" data-close>關閉</button>`);
  const sh = $('#sheet');
  sh.scrollTop = sh.scrollHeight;
}
function log(who, t, c, pick){ if (G) G.log.push({who, t, c, pick:!!pick}); }

function settingsModal(){
  const names = ['慢', '中', '快', '瞬間'];
  openModal(`<p class="m-eyebrow">設定</p><h3 class="m-title">讓他慢慢說，或快一點</h3>
    <div class="set-row"><span>文字速度</span><div class="seg" id="segSpeed">${names.map((n, i) => `<button type="button" data-v="${i}" aria-pressed="${P.speed === i}">${n}</button>`).join('')}</div></div>
    <div class="set-row"><span>顯示數值</span><div class="seg" id="segMeters"><button type="button" data-v="1" aria-pressed="${P.meters}">顯示</button><button type="button" data-v="0" aria-pressed="${!P.meters}">隱藏</button></div></div>
    <div class="set-row"><span>存檔與結局</span><button class="btn" type="button" id="wipe">清除所有紀錄</button></div>
    <button class="btn primary m-close" type="button" data-close>完成</button>`);
  const seg = (id, f) => $(id).querySelectorAll('button').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    f(+b.dataset.v);
    $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    saveP();
  }));
  seg('#segSpeed', v => { P.speed = v; });
  seg('#segMeters', v => { P.meters = !!v; if (G) hud(); });
  const w = $('#wipe');
  w.addEventListener('click', e => {
    e.stopPropagation();
    if (!w.dataset.armed) { w.dataset.armed = '1'; w.textContent = '再按一次，確定清除'; return; }
    Object.assign(P, {endings:[], unlocked:{}, checkpoint:null, lastName:'', lastFlags:null});
    saveP();
    w.textContent = '已清除';
    w.disabled = true;
    if (!G) showTitle();
  });
}
function partsModal(){
  const p2 = !!P.unlocked.p2, p3 = !!P.unlocked.p3;
  openModal(`<p class="m-eyebrow">選擇篇章</p><h3 class="m-title">從哪裡開始？</h3>
    <div class="parts">
      <button class="part" type="button" data-p="1"><b>第一部　戀愛線</b><span>凌晨兩點的動物醫院。攻略一個只會回「嗯」的獸醫。</span><small>五章・六種結局</small></button>
      <button class="part" type="button" data-p="2" ${p2 ? '' : 'disabled'}><b>第二部　婚後線</b><span>結婚以後，他還是會躲進停車場。</span><small>${p2 ? '五章・三種結局' : '達成「備用鑰匙」結局後開啟'}</small></button>
      <button class="part" type="button" data-p="3" ${p3 ? '' : 'disabled'}><b>第三部　男方視角</b><span>同樣的日子，換成他的手機。這一次，由你決定要不要按下傳送。</span><small>${p3 ? '六則草稿・兩種結局' : '完成任一婚後線結局後開啟'}</small></button>
    </div>
    ${p2 && p3 ? '' : '<button class="linkish" type="button" id="unlockAll">直接開啟全部篇章（會被劇透）</button>'}
    <button class="btn m-close" type="button" data-close>返回</button>`);
  $('#sheet').querySelectorAll('.part').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    if (b.disabled) return;
    closeModal(true);
    startPart(+b.dataset.p, false);
  }));
  const u = $('#unlockAll');
  if (u) u.addEventListener('click', e => { e.stopPropagation(); P.unlocked.p2 = P.unlocked.p3 = true; saveP(); partsModal(); });
}
function endingsModal(){
  const list = Object.entries(ENDINGS).sort((a, b) => a[1].no - b[1].no);
  openModal(`<p class="m-eyebrow">結局收集</p><h3 class="m-title">${P.endings.length} / ${TOTAL_ENDINGS}</h3>
    <ul class="gallery">${list.map(([id, e]) => {
      const got = P.endings.includes(id);
      return `<li class="${got ? '' : 'locked'}"><span class="no">${String(e.no).padStart(2, '0')}・${PART_LABEL[e.part].slice(0, 3)}</span><b>${got ? esc(e.title) : '？？？'}</b><span class="rk" style="color:${TONE[e.tone][1]}">${got ? e.rank : '未解鎖'}</span></li>`;
    }).join('')}</ul>
    <button class="btn m-close" type="button" data-close>返回</button>`);
}
function menuModal(){
  openModal(`<p class="m-eyebrow">選單</p><h3 class="m-title">${esc(G ? G.chap : '')}</h3>
    <div class="m-row">
      <button class="btn" type="button" id="mLog">對話紀錄</button>
      <button class="btn" type="button" id="mSet">設定</button>
      <button class="btn" type="button" id="mEnd">結局收集</button>
      <button class="btn" type="button" id="mRetry">從本章開頭重來</button>
      <button class="btn" type="button" id="mTitle">回到標題</button>
    </div>
    <p class="m-note">每一章開頭會自動存檔。回到標題後，可以從「繼續」接著玩。</p>
    <button class="btn primary m-close" type="button" data-close>繼續遊戲</button>`);
  const on = (id, f) => $(id).addEventListener('click', e => { e.stopPropagation(); f(); });
  on('#mLog', () => { closeModal(true); logModal(); });
  on('#mSet', () => { closeModal(true); settingsModal(); });
  on('#mEnd', () => { closeModal(true); endingsModal(); });
  on('#mRetry', () => { closeModal(true); loadCheckpoint(); });
  on('#mTitle', () => { closeModal(true); showTitle(); });
}

// ---------- auto / skip
function setAuto(v){
  if (!G) v = false;
  if (G) G.auto = v;
  $('#tAuto').setAttribute('aria-pressed', !!v);
  if (v && G.wait === 'click' && !typing) typed();
}
function setSkip(v){
  if (!G) v = false;
  if (G) G.skip = v;
  $('#tSkip').setAttribute('aria-pressed', !!v);
  if (v) { if (typing) finishType(); else if (anim) anim.finish(); else if (pend) flushPend(); else if (G.wait === 'click') typed(); }
}

// ---------- wiring
$('#app').addEventListener('click', e => {
  if (e.target.closest('button, input, .modal, #title, #ending, #hud')) return;
  if (!$('#card').hidden) { closeCard(); return; }
  if (G && G.skip) setSkip(false);
  advance();
});
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
const tool = (id, f) => $(id).addEventListener('click', e => { e.stopPropagation(); f(); e.currentTarget.blur(); });
tool('#tLog', logModal);
tool('#tAuto', () => setAuto(!(G && G.auto)));
tool('#tSkip', () => setSkip(!(G && G.skip)));
tool('#tMenu', menuModal);
$('#bNew').addEventListener('click', () => startPart(1, false));
$('#bCont').addEventListener('click', loadCheckpoint);
$('#bParts').addEventListener('click', partsModal);
$('#bEnds').addEventListener('click', endingsModal);
$('#bSet').addEventListener('click', settingsModal);

document.addEventListener('keydown', e => {
  if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (!G || !$('#title').hidden || !$('#ending').hidden) return;
  if (!$('#card').hidden) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); closeCard(); } return; }
  if (e.key === ' ' || e.key === 'Enter') {
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    e.preventDefault();
    advance();
  } else if (/^[1-4]$/.test(e.key) && G.wait === 'choice' && G.opts) {
    const f = G.opts[+e.key - 1];
    if (f) { e.preventDefault(); f(); }
  }
});

// ---------- boot
if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
  try { window.claude.hot.snapshot(() => ({inGame: !!G})); } catch (e) {}
}
const start = data => { if (data && data.inGame && P.checkpoint) loadCheckpoint(); else showTitle(); };
const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : {});

})();
