'use strict';
/* ================= 规则常量 ================= */
const PER_LEVEL = 35, FULL_SCORE = 980;
const BIG_LEVELS = ['微小','小','中','大','特大'];
const RAINBOW = [
  {n:'红',h:0},{n:'橙',h:30},{n:'黄',h:58},{n:'绿',h:130},
  {n:'蓝',h:210},{n:'靛',h:262},{n:'紫',h:300}
];
const TOP = 10, BOTTOM = 212;
const GOURD = `M95 -7 C95 -9.8 105 -9.8 105 -7 C105 -2 105 4 105 10.3 C124.9 12.8 140 29.9 140 50 C140 66.4 130 81.2 114.7 87.2 C149.3 93 174 118.9 174 149 C174 183.8 140.9 212 100 212 C59.1 212 26 183.8 26 149 C26 118.9 50.7 93 85.3 87.2 C70 81.2 60 66.4 60 50 C60 29.9 75.1 12.8 95 10.3 C95 4 95 -2 95 -7 Z`;
const VINE = 'M-30 -24 C60 -20 140 -14 250 -30';
const WEEK = ['日','一','二','三','四','五','六'];
const SIZE_SCALE = {微小:.62, 小:.72, 中:.82, 大:.92, 特大:1};

/* ================= 数据层 ================= */
const DB_KEY = 'zzb_v1';
let DB = null;
let storageOK = true;   // 检测当前打开方式能否自动保存（数据URI等环境可能不支持）

function defaultData(){
  return {
    types: [],            // {id, name}
    events: [],           // {id, typeId, name, score, tracked}
    records: [],          // {id, date, typeId, typeName, eventId, eventName, score, doubled, note, photoIds, at}
    meta: { dayStart: 6, dayEnd: 18, maxTotal: 0, achievements: [] } // achievements: {n, date, score, at}
  };
}
function load(){
  try{
    localStorage.setItem('zzb_probe','1');
    localStorage.removeItem('zzb_probe');
    storageOK = true;
    DB = JSON.parse(localStorage.getItem(DB_KEY)) || defaultData();
  }catch(e){
    storageOK = false;
    DB = defaultData();
  }
  if(!DB.meta) DB.meta = defaultData().meta;
  if(DB.meta.dayStart == null) DB.meta.dayStart = 6;
  if(DB.meta.dayEnd == null) DB.meta.dayEnd = 18;
  if(DB.meta.maxTotal == null) DB.meta.maxTotal = 0;
  if(!Array.isArray(DB.meta.achievements)) DB.meta.achievements = [];
}
function save(){
  try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); return true; }
  catch(e){ return false; }
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function pad2(n){ return String(n).padStart(2,'0'); }
function dateStr(d){ d = d || new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function totalScore(){ return DB.records.reduce((s,r)=>s+r.score,0); }
function occCount(eventId){ return DB.records.filter(r=>r.eventId===eventId).length; }
function fmtDateCN(str){
  const [y,m,d] = str.split('-').map(Number);
  const wd = WEEK[new Date(y, m-1, d).getDay()];
  return `${m}月${d}日 · 周${wd}`;
}

/* 满瓶成就检查：总分跨越 980 的整数倍即记录，掉分不撤销 */
function checkMilestones(prevTotal, newTotal){
  for(let m = FULL_SCORE; m <= newTotal; m += FULL_SCORE){
    if(prevTotal < m && !DB.meta.achievements.some(a=>a.n === m/FULL_SCORE)){
      DB.meta.achievements.push({ n: m/FULL_SCORE, date: dateStr(), score: m, at: Date.now() });
    }
  }
  if(newTotal > DB.meta.maxTotal) DB.meta.maxTotal = newTotal;
}
function applyRecordChange(prevTotal){
  const newTotal = totalScore();
  checkMilestones(prevTotal, newTotal);
  save();
}

/* ================= 等级换算 ================= */
function levelInfo(total){
  if(total >= FULL_SCORE){
    return { big:'特大', sub:5, k:29, full:true, neg:false, label:'满瓶' };
  }
  const k = Math.min(28, Math.max(1, Math.floor(total / PER_LEVEL) + 1));
  let big, sub;
  if(k <= 3){ big='微小'; sub=k; }
  else if(k <= 10){ big='小'; sub=k-3; }
  else if(k <= 17){ big='中'; sub=k-10; }
  else if(k <= 24){ big='大'; sub=k-17; }
  else { big='特大'; sub=k-24; }
  return { big, sub, k, full:false, neg: total < 0, label:`${big} · ${sub}` };
}

/* ================= 照片存储 ================= */
/* 优先用 IndexedDB（托管版）；file:// 等环境不可用时自动降级为
   数据内嵌 base64（存 localStorage，容量有限，靠「导出备份」兜底） */
function blobToDataURL(blob){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}
function dataURLToBlob(dataURL){
  return fetch(dataURL).then(r => r.blob());
}
const Photos = {
  mode: 'auto',   // 'auto' | 'idb' | 'base64'
  _db: null,
  open(){
    return new Promise((res, rej) => {
      if(this._db) return res(this._db);
      if(!window.indexedDB) return rej(new Error('no idb'));
      const r = indexedDB.open('zzb_photos', 1);
      r.onupgradeneeded = e => { e.target.result.createObjectStore('p'); };
      r.onsuccess = e => { this._db = e.target.result; res(this._db); };
      r.onerror = () => rej(r.error);
    });
  },
  async init(){
    if(this.mode !== 'auto') return;
    try { await this.open(); this.mode = 'idb'; }
    catch(e){ this.mode = 'base64'; }
  },
  async put(id, blob){
    await this.init();
    if(this.mode === 'base64'){
      if(!DB.meta.photosBase64) DB.meta.photosBase64 = {};
      DB.meta.photosBase64[id] = await blobToDataURL(blob);
      if(!save()){ delete DB.meta.photosBase64[id]; throw new Error('quota'); }
      return;
    }
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('p','readwrite');
      tx.objectStore('p').put(blob, id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async get(id){
    await this.init();
    if(this.mode === 'base64'){
      const u = DB.meta.photosBase64 && DB.meta.photosBase64[id];
      return u ? dataURLToBlob(u) : null;
    }
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('p','readonly');
      const rq = tx.objectStore('p').get(id);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => rej(rq.error);
    });
  },
  async del(id){
    await this.init();
    if(this.mode === 'base64'){
      if(DB.meta.photosBase64){ delete DB.meta.photosBase64[id]; save(); }
      return;
    }
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('p','readwrite');
      tx.objectStore('p').delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async keys(){
    await this.init();
    if(this.mode === 'base64'){
      return DB.meta.photosBase64 ? Object.keys(DB.meta.photosBase64) : [];
    }
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('p','readonly');
      const rq = tx.objectStore('p').getAllKeys();
      rq.onsuccess = () => res(rq.result || []);
      rq.onerror = () => rej(rq.error);
    });
  },
  async clear(){
    await this.init();
    if(this.mode === 'base64'){
      DB.meta.photosBase64 = {};
      save();
      return;
    }
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('p','readwrite');
      tx.objectStore('p').clear();
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
};

/* 照片压缩：最长边 1280px，JPEG 0.72（兼顾打印与存储空间） */
function compressImage(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1280;
      let w = img.width, h = img.height;
      const sc = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * sc); h = Math.round(h * sc);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      cv.toBlob(b => b ? res(b) : rej(new Error('compress fail')), 'image/jpeg', 0.72);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('load fail')); };
    img.src = url;
  });
}

/* 缩略图 URL 缓存 */
const thumbUrls = new Map();
async function photoUrl(id){
  if(thumbUrls.has(id)) return thumbUrls.get(id);
  const b = await Photos.get(id);
  if(!b) return null;
  const u = URL.createObjectURL(b);
  thumbUrls.set(id, u);
  return u;
}

/* ================= 葫芦渲染 ================= */
let svgUid = 0;
function gourdSVG(li, opts){
  opts = opts || {};
  const P = 'g' + (++svgUid);
  let defs = '', body = '', scoreText = '', bugEl = '';
  let strokeC = '#b9aee2', glowC = '#cfc6f2';

  const glass = `<linearGradient id="${P}glass" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f7f4ff"/><stop offset="1" stop-color="#eae4fa"/>
  </linearGradient>`;
  const gloss = `<radialGradient id="${P}gloss" gradientUnits="objectBoundingBox" cx=".36" cy=".58" r=".55" fx=".32" fy=".53">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".4"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="${P}gloss2" gradientUnits="objectBoundingBox" cx=".5" cy=".2" r=".3">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>`;
  const leaf = `<linearGradient id="${P}leaf" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#a8d465"/><stop offset="1" stop-color="#5c8f2e"/>
  </linearGradient>`;

  if(opts.showBug){
    bugEl = `<g class="crawler">
      <animateMotion dur="110s" repeatCount="indefinite" path="${VINE}" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear"/>
      <g transform="translate(0,-10)">
        <circle cx="0" cy="0" r="9" fill="#ffd9a8" opacity=".16"/>
        <ellipse cx="0" cy="0" rx="6.5" ry="5" fill="#c62828"/>
        <line x1="0" y1="-5" x2="0" y2="5" stroke="#1c130c" stroke-width="1"/>
        <circle cx="0" cy="-3" r=".9" fill="#1c130c"/>
        <circle cx="-2.6" cy="-2.2" r=".9" fill="#1c130c"/>
        <circle cx="2.6" cy="-2.2" r=".9" fill="#1c130c"/>
        <circle cx="-1.8" cy=".2" r=".9" fill="#1c130c"/>
        <circle cx="1.8" cy=".2" r=".9" fill="#1c130c"/>
        <circle cx="-2.4" cy="2.4" r=".9" fill="#1c130c"/>
        <circle cx="2.4" cy="2.4" r=".9" fill="#1c130c"/>
        <circle cx="-5.4" cy="-1.2" r="2" fill="#1c130c"/>
        <path d="M-7 -3 L-9.5 -5 M-6.6 -1.8 L-9.6 -2.6" stroke="#1c130c" stroke-width=".9" fill="none"/>
        <path d="M-3.5 4.5 L-5.5 7 M-1 5 L-1.6 7.6 M1 5 L1.6 7.6 M3.5 4.5 L5.5 7" stroke="#1c130c" stroke-width="1" fill="none"/>
      </g>
    </g>`;
  }

  if(li.big === '微小'){
    const num = li.neg && opts.total != null ? String(opts.total) : String(li.sub);
    const col = li.neg ? '#d64545' : '#8b7cc9';
    defs += glass + gloss + leaf;
    body = `<path d="${GOURD}" fill="url(#${P}glass)"/>
      <text x="100" y="196" text-anchor="middle" font-size="92" font-weight="700"
        fill="${col}" font-family="Georgia,'KaiTi','STKaiti',serif">${num}</text>`;
  } else if(li.big === '小' || li.big === '中' || li.big === '大'){
    const lvl = li.big==='小' ? 1 : (li.big==='中' ? 2 : 3);
    const sat = lvl===1 ? 38 : (lvl===2 ? 62 : 100);
    const lit = lvl===1 ? 82 : (lvl===2 ? 62 : 52);
    const h = RAINBOW[li.sub-1].h;
    const bodyGrad = `<linearGradient id="${P}body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${h} ${sat}% ${Math.min(lit+8,95)}%)"/>
      <stop offset=".55" stop-color="hsl(${h} ${sat}% ${lit}%)"/>
      <stop offset="1" stop-color="hsl(${h} ${sat}% ${Math.max(lit-10,6)}%)"/>
    </linearGradient>`;
    defs += bodyGrad + gloss + leaf;
    body = `<path d="${GOURD}" fill="url(#${P}body)"/>`;
    strokeC = `hsl(${h} ${sat}% ${lit-16}%)`;
    glowC = `hsl(${h} ${sat}% ${lit}%)`;
  } else { /* 特大 / 满瓶 */
    const f = li.full ? 1 : Math.min(li.sub, 4) * 0.25;
    const lt = BOTTOM - (BOTTOM - TOP) * f;
    const rain = `<linearGradient id="${P}rain" gradientUnits="userSpaceOnUse" x1="0" y1="${lt}" x2="0" y2="${BOTTOM}">
      <stop offset="0" stop-color="hsl(285 100% 62%)"/>
      <stop offset=".17" stop-color="hsl(262 100% 60%)"/>
      <stop offset=".33" stop-color="hsl(210 100% 58%)"/>
      <stop offset=".5" stop-color="hsl(130 90% 56%)"/>
      <stop offset=".67" stop-color="hsl(58 100% 56%)"/>
      <stop offset=".83" stop-color="hsl(30 100% 58%)"/>
      <stop offset="1" stop-color="hsl(0 100% 58%)"/>
    </linearGradient>`;
    defs += glass + gloss + rain + leaf;
    body = `<path d="${GOURD}" fill="url(#${P}glass)"/>
      <g clip-path="url(#${P}clip)">
        <g clip-path="url(#${P}liq)">
          <rect x="0" y="${lt}" width="200" height="${BOTTOM-lt}" fill="url(#${P}rain)"/>
          <circle cx="78" cy="${lt+28}" r="2.4" fill="#fff" opacity=".55"/>
          <circle cx="124" cy="${lt+14}" r="2" fill="#fff" opacity=".45"/>
          <circle cx="96" cy="${lt+46}" r="2.6" fill="#fff" opacity=".4"/>
          <circle cx="140" cy="${lt+62}" r="2" fill="#fff" opacity=".5"/>
          <circle cx="66" cy="${lt+72}" r="2.2" fill="#fff" opacity=".35"/>
        </g>
        <rect x="0" y="${lt}" width="200" height="6" fill="#ffffff" opacity=".4"/>
      </g>`;
    defs += `<clipPath id="${P}clip"><path d="${GOURD}"/></clipPath>
      <clipPath id="${P}liq"><rect x="0" y="${lt}" width="200" height="${BOTTOM-lt}"/></clipPath>`;
    strokeC = '#c9bdf0';
    glowC = '#d9c8ff';
    if(li.full && opts.total != null){
      const sc = String(opts.total);
      const fs = sc.length > 4 ? 46 : 64;
      scoreText = `<text x="100" y="182" text-anchor="middle" font-size="${fs}" font-weight="700"
        fill="#ffffff" stroke="rgba(70,40,110,.6)" stroke-width="3" paint-order="stroke"
        font-family="Georgia,'KaiTi',serif">${sc}</text>
      <text x="100" y="210" text-anchor="middle" font-size="26"
        fill="#ffffff" stroke="rgba(70,40,110,.6)" stroke-width="2" paint-order="stroke">分</text>`;
    }
  }

  defs += `<radialGradient id="${P}glow" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="${glowC}" stop-opacity=".3"/><stop offset=".7" stop-color="${glowC}" stop-opacity=".1"/><stop offset="1" stop-color="${glowC}" stop-opacity="0"/>
  </radialGradient>`;

  return `<svg viewBox="-70 -100 340 540">
    <defs>${defs}</defs>
    <g>
      <path d="${VINE}" fill="none" stroke="#4a7a26" stroke-width="14" stroke-linecap="round"/>
      <path d="${VINE}" fill="none" stroke="#7aad40" stroke-width="8" stroke-linecap="round"/>
      <path d="M140 -14 C162 -22 170 -4 158 4 C148 12 136 8 140 -4" fill="none" stroke="#7aad40" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M96 -18 C68 -32 54 -58 74 -70 C94 -82 118 -58 110 -30 C105 -11 100 -10 96 -18 Z" fill="url(#${P}leaf)"/>
      <path d="M104 -18 C132 -32 146 -58 126 -70 C106 -82 82 -58 90 -30 C95 -11 100 -10 104 -18 Z" fill="url(#${P}leaf)"/>
      <path d="M28 -26 C12 -36 6 -54 20 -62 C36 -70 48 -52 44 -36 C41 -25 34 -24 28 -26 Z" fill="url(#${P}leaf)" opacity=".95"/>
      ${bugEl}
    </g>
    <g class="sway">
      <g class="breath"><ellipse cx="100" cy="102" rx="150" ry="215" fill="url(#${P}glow)"/></g>
      <path d="M100 -11 C99.5 -12 100.5 -13 100 -14" fill="none" stroke="#6f9e3a" stroke-width="7" stroke-linecap="round"/>
      ${body}
      <path d="${GOURD}" fill="url(#${P}gloss)"/>
      <path d="${GOURD}" fill="url(#${P}gloss2)"/>
      <path d="${GOURD}" fill="none" stroke="${strokeC}" stroke-width="2.2" opacity=".6"/>
      ${scoreText}
    </g>
  </svg>`;
}

/* ================= 首页 ================= */
function applyBG(){
  const h = new Date().getHours();
  const isDay = DB.meta.dayStart < DB.meta.dayEnd
    ? (h >= DB.meta.dayStart && h < DB.meta.dayEnd)
    : (h >= DB.meta.dayStart || h < DB.meta.dayEnd); // 跨午夜的白昼
  const st = document.getElementById('stage');
  st.classList.toggle('day', isDay);
  st.classList.toggle('night', !isDay);
  /* 首页上的按钮也要跟着昼夜换样式，把标记同步到整页 */
  document.getElementById('page-home').classList.toggle('day', isDay);
  document.getElementById('page-home').classList.toggle('night', !isDay);
}
function renderHome(){
  const total = totalScore();
  const li = levelInfo(total);
  const box = document.getElementById('gourdBox');
  const h = Math.min(window.innerHeight * 0.62, 540) * SIZE_SCALE[li.big];
  box.style.width = Math.round(h * 0.6296) + 'px';
  box.style.height = Math.round(h) + 'px';
  box.innerHTML = gourdSVG(li, { total, showBug: true });
  applyBG();
}
function initStageFx(){
  const starsBox = document.getElementById('stars');
  for(let i = 0; i < 26; i++){
    const st = document.createElement('div');
    st.className = 'star';
    const sz = (Math.random() * 2.5 + 1.5).toFixed(1);
    st.style.width = sz + 'px';
    st.style.height = sz + 'px';
    st.style.left = (Math.random() * 100).toFixed(1) + '%';
    st.style.top = (Math.random() * 100).toFixed(1) + '%';
    st.style.animationDelay = (Math.random() * 3).toFixed(1) + 's';
    starsBox.appendChild(st);
  }
  const ffBox = document.getElementById('fireflies');
  for(let i = 0; i < 7; i++){
    const f = document.createElement('div');
    f.className = 'fly';
    f.style.left = (8 + Math.random() * 84).toFixed(1) + '%';
    f.style.top = (35 + Math.random() * 50).toFixed(1) + '%';
    f.style.animationDuration = (6 + Math.random() * 7).toFixed(1) + 's';
    f.style.animationDelay = (-Math.random() * 8).toFixed(1) + 's';
    ffBox.appendChild(f);
  }
}

/* ================= 页面切换 ================= */
function showPage(name){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + name);
  if(el) el.classList.add('active');
  window.scrollTo(0, 0);
}

/* ================= 弹层 / 提示 ================= */
let toastTimer = null;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function openModal(html){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="mask"></div>` + html;
  root.querySelector('.mask').onclick = closeModal;
  return root;
}
function closeModal(){
  document.getElementById('modalRoot').innerHTML = '';
}
/* 顶层浮层：叠在面板上方（如确认框、历史记录、照片查看），关闭后回到面板 */
function openTopModal(html){
  const top = document.getElementById('modalTop');
  top.innerHTML = `<div class="mask"></div>` + html;
  top.querySelector('.mask').onclick = closeTopModal;
  return top;
}
function closeTopModal(){
  document.getElementById('modalTop').innerHTML = '';
}
function confirmBox(msg, onOk, okText){
  okText = okText || '确定';
  openTopModal(`<div class="centerBox">
    <h4>${msg}</h4>
    <div class="sheetBtns">
      <button class="btn-ghost" id="cfCancel">取消</button>
      <button class="btn-primary" id="cfOk">${okText}</button>
    </div>
  </div>`);
  document.getElementById('cfCancel').onclick = closeTopModal;
  document.getElementById('cfOk').onclick = () => { closeTopModal(); onOk(); };
}

/* ================= 图片查看 ================= */
async function viewPhoto(id){
  const url = await photoUrl(id);
  if(!url) return toast('照片加载失败');
  const img = document.createElement('img');
  img.style.cssText = 'max-width:100%;max-height:70vh;border-radius:12px;display:block;margin:0 auto';
  img.src = url;
  openTopModal(`<div class="centerBox" style="background:rgba(20,14,45,.95);position:relative">
    <button class="icon-btn" style="position:absolute;top:10px;right:10px;background:none;border:none;color:#fff;font-size:20px" id="pvClose">✕</button>
  </div>`);
  const top = document.getElementById('modalTop');
  top.querySelector('.centerBox').appendChild(img);
  top.querySelector('#pvClose').onclick = closeTopModal;
}

/* ================= 初始化 ================= */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
load();
initStageFx();
renderHome();
document.getElementById('homeEntry').onclick = () => { showPage('records'); renderRecords(); };
window.addEventListener('resize', () => {
  if(document.getElementById('page-home').classList.contains('active')) renderHome();
});
/* 每分钟刷新一次昼夜背景（跨整点时切换） */
setInterval(() => {
  if(document.getElementById('page-home').classList.contains('active')) applyBG();
}, 60000);
