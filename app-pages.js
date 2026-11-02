'use strict';
/* ================= 工具 ================= */
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
}
function recMult(r){ return r.mult || (r.doubled ? 2 : 1); }
function recBadge(r){ const m = recMult(r); return m > 1 ? `<span class="badge">×${m}</span>` : ''; }
function shorten(s, n){ s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

/* ================= 补填日期记忆 ================= */
/* 补填过以前的日期后，当天再点「＋」默认沿用该日期；改回今天或过夜后自动恢复今天 */
const FILL_KEY = 'zzb_lastFill';
let lastFill = (() => {
  try{
    const o = JSON.parse(localStorage.getItem(FILL_KEY));
    return o && o.day === dateStr() ? o.date : null;
  }catch(e){ return null; }
})();
function setLastFill(date){
  lastFill = date;
  try{
    if(date) localStorage.setItem(FILL_KEY, JSON.stringify({ day: dateStr(), date }));
    else localStorage.removeItem(FILL_KEY);
  }catch(e){}
}

/* ================= 记录页 ================= */
let viewYM = null;
function navNow(){ const d = new Date(); viewYM = { y: d.getFullYear(), m: d.getMonth() + 1 }; }
function ymKey(y, m){ return `${y}-${pad2(m)}`; }

function renderRecords(){
  if(!viewYM) navNow();
  const total = totalScore();
  const li = levelInfo(total);
  document.getElementById('stTotal').textContent = total;
  document.getElementById('stLevel').textContent = total < 0 ? '微小 · 1（负分）' : li.label;
  document.getElementById('stMax').textContent = DB.meta.maxTotal;
  document.getElementById('mnLabel').textContent = `${viewYM.y}年${viewYM.m}月`;

  const key = ymKey(viewYM.y, viewYM.m);
  const list = document.getElementById('recList');
  const banner = storageOK ? '' :
    `<div class="warnBanner">⚠️ 当前打开方式不支持自动保存：打开后请先在「设置 → 从备份文件恢复」载入上次的备份，记完后到「设置 → 导出备份文件」保存</div>`;

  if(DB.records.length === 0){
    list.innerHTML = banner + `<div class="emptyHint">还没有任何记录<br>点右下角「＋」记下第一笔<br>（可先去事件库创建类型和事件，点选更方便）<br>
      <button class="btn-ghost" id="goLib">去事件库</button></div>`;
    document.getElementById('goLib').onclick = () => { showPage('library'); renderLibrary(); };
    return;
  }

  const rs = DB.records.filter(r => r.date.startsWith(key));
  if(rs.length === 0){
    list.innerHTML = banner + `<div class="emptyHint">这个月没有记录</div>`;
    return;
  }

  const groups = [];
  rs.forEach(r => {
    let g = groups.find(x => x.date === r.date);
    if(!g){ g = { date: r.date, items: [] }; groups.push(g); }
    g.items.push(r);
  });
  groups.sort((a,b) => a.date < b.date ? 1 : -1);

  list.innerHTML = banner + groups.map(g => {
    const sum = g.items.reduce((s,r) => s + r.score, 0);
    const cls = sum > 0 ? 'pos' : (sum < 0 ? 'neg' : 'zero');
    const rows = g.items.map(r => {
      const badge = recBadge(r);
      const ph = (r.photoIds && r.photoIds.length) ? `<span class="ph">📷×${r.photoIds.length}</span>` : '';
      const hasDetail = !!(r.note || (r.photoIds && r.photoIds.length) || r.match);
      const toggle = hasDetail ? `<button class="recToggle" data-id="${r.id}" aria-label="展开详情">▾</button>` : '';
      return `<div class="recItem">
        <div class="recRow" data-id="${r.id}">
          <span class="ev">${esc(r.typeName)} · ${esc(r.eventName)}${badge}</span>
          ${ph}<span class="sc ${r.score > 0 ? 'plus' : 'minus'}">${r.score > 0 ? '+' : ''}${r.score}</span>${toggle}
        </div>
        <div class="recDetail" id="rd-${r.id}" style="display:none"></div>
      </div>`;
    }).join('');
    return `<div class="dayHead">${fmtDateCN(g.date)}<span class="dsum ${cls}">当日 ${sum > 0 ? '+' : ''}${sum}</span></div>${rows}`;
  }).join('');

  list.querySelectorAll('.recRow').forEach(el => {
    el.onclick = () => {
      const r = DB.records.find(x => x.id === el.dataset.id);
      if(r) openRecPanel(r);
    };
  });
  list.querySelectorAll('.recToggle').forEach(b => {
    b.onclick = e => { e.stopPropagation(); toggleRecDetail(b.dataset.id); };
  });
}

/* 月记录里展开备注/照片/同类情况 */
function toggleRecDetail(id){
  const el = document.getElementById('rd-' + id);
  if(!el) return;
  const r = DB.records.find(x => x.id === id);
  if(!r) return;
  const btn = document.querySelector(`.recToggle[data-id="${id}"]`);
  if(el.style.display === 'none'){
    if(!el.dataset.loaded){
      let html = '';
      if(r.note) html += `<div class="dNote">${esc(r.note)}</div>`;
      if(r.match){
        const sim = r.match.manual ? '手动选择'
          : (r.match.sim != null ? `文字相近 ${Math.round(r.match.sim * 100)}%` : '');
        html += `<div class="matchRef">同类情况：${esc(r.match.date)}「${esc(r.match.note)}」${sim ? ' · ' + sim : ''}</div>`;
      }
      if(r.photoIds && r.photoIds.length){
        html += `<div class="dPhotos">` + r.photoIds.map(pid =>
          `<img class="dPhoto" data-pid="${pid}" alt="">`).join('') + `</div>`;
      }
      el.innerHTML = html;
      el.dataset.loaded = '1';
      (r.photoIds || []).forEach(pid => {
        const img = el.querySelector(`img[data-pid="${pid}"]`);
        if(!img) return;
        photoUrl(pid).then(u => { if(u) img.src = u; });
        img.onclick = () => viewPhoto(pid);
      });
    }
    el.style.display = 'block';
    if(btn) btn.textContent = '▴';
  } else {
    el.style.display = 'none';
    if(btn) btn.textContent = '▾';
  }
}

/* ================= 月份选择器 ================= */
function openMonthPicker(){
  let yr = viewYM.y;
  openModal(`<div class="centerBox">
    <h4>选择月份</h4>
    <div class="ymNav">
      <button class="icon-btn" id="ymPrev">◀</button>
      <b id="ymYear"></b>
      <button class="icon-btn" id="ymNext">▶</button>
    </div>
    <div class="ymGrid" id="ymGrid"></div>
  </div>`);
  function render(){
    document.getElementById('ymYear').textContent = yr + '年';
    const g = document.getElementById('ymGrid');
    g.innerHTML = '';
    for(let m = 1; m <= 12; m++){
      const b = document.createElement('button');
      b.textContent = m + '月';
      if(yr === viewYM.y && m === viewYM.m) b.classList.add('on');
      b.onclick = () => { viewYM = { y: yr, m }; closeModal(); renderRecords(); };
      g.appendChild(b);
    }
  }
  render();
  document.getElementById('ymPrev').onclick = () => { yr--; render(); };
  document.getElementById('ymNext').onclick = () => { yr++; render(); };
}

/* ================= 记一笔面板 ================= */
function openRecPanel(rec){
  const editing = !!rec;
  const evNow = rec ? DB.events.find(e => e.id === rec.eventId) : null;
  const storedMult = rec ? recMult(rec) : 1;
  const st = {
    typeId: rec ? rec.typeId : (DB.types.length ? DB.types[0].id : null),
    eventId: rec ? rec.eventId : null,
    custom: rec ? !evNow : (DB.types.length === 0),
    customName: rec && !evNow ? rec.eventName : '',
    customScore: rec && !evNow ? rec.score : 0,
    mult: storedMult,
    userMult: rec ? storedMult : null,
    match: rec && rec.match ? { ...rec.match } : null,
    matchManual: !!(rec && rec.match),
    photoIds: rec ? [...(rec.photoIds || [])] : [],
    newPhotoBlobs: [],   // {id, blob} 未入库的新照片
    removedPhotoIds: []  // 点保存时才真正删除
  };
  if(st.custom && !rec) st.typeId = null;

  openModal(`<div class="sheet">
    <h4>${editing ? '编辑记录' : '＋ 记一笔'}</h4>
    <label>日期（可补录）</label>
    <input type="date" id="rpDate" value="${rec ? rec.date : (lastFill || dateStr())}">
    <label>类型</label>
    <div class="chips" id="rpTypes"></div>
    <div id="rpEvents"></div>
    <div id="rpTrack"></div>
    <label>备注（可选）</label>
    <input type="text" id="rpNote" placeholder="写一句备注…" value="${rec ? esc(rec.note || '') : ''}">
    <label>照片（最多 3 张）</label>
    <div class="phThumbs" id="rpPhotos"></div>
    <div class="sheetBtns">
      ${editing ? '<button class="btn-danger" id="rpDel">删除</button>' : ''}
      <button class="btn-ghost" id="rpCancel">取消</button>
      <button class="btn-primary" id="rpSave">保存</button>
    </div>
  </div>`);

  const evOf = () => DB.events.find(e => e.id === st.eventId);
  const typeNameOf = () => {
    const t = DB.types.find(x => x.id === st.typeId);
    return t ? t.name : '';
  };
  function resetMatch(){
    st.match = null;
    st.matchManual = false;
    st.userMult = null;
    st.mult = 1;
  }
  function refreshMatch(){
    const ev = evOf();
    if(st.custom || !ev){ st.match = null; return; }
    if(st.matchManual) return;
    const dateEl = document.getElementById('rpDate');
    const noteEl = document.getElementById('rpNote');
    const date = dateEl ? dateEl.value : '';
    const note = noteEl ? noteEl.value.trim() : '';
    st.match = (date && note)
      ? findSimilarNote(st.typeId, typeNameOf(), date, note, editing ? rec.id : null)
      : null;
    if(st.userMult == null) st.mult = st.match ? 2 : 1;
  }

  document.getElementById('rpDate').onchange = () => { resetMatch(); renderTrack(); };
  document.getElementById('rpNote').oninput = () => { resetMatch(); renderTrack(); };

  function renderTypes(){
    const box = document.getElementById('rpTypes');
    box.innerHTML = DB.types.map(t =>
      `<button class="chip ${!st.custom && st.typeId === t.id ? 'on' : ''}" data-tid="${t.id}">${esc(t.name)}</button>`
    ).join('') + `<button class="chip ${st.custom ? 'on' : ''}" id="rpCustom">自定义</button>`;
    box.querySelectorAll('[data-tid]').forEach(b => {
      b.onclick = () => {
        st.custom = false; st.typeId = b.dataset.tid; st.eventId = null;
        resetMatch(); renderTypes(); renderEvents();
      };
    });
    document.getElementById('rpCustom').onclick = () => {
      st.custom = true; st.typeId = null; st.eventId = null;
      resetMatch(); renderTypes(); renderEvents();
    };
  }

  function renderEvents(){
    const box = document.getElementById('rpEvents');
    if(st.custom){
      box.innerHTML = `<label>事件名称</label>
        <input type="text" id="rpCName" placeholder="自定义事件名称" value="${esc(st.customName)}">
        <label>分数（加分正数，减分负数）</label>
        <input type="number" id="rpCScore" step="1" value="${st.customScore}">`;
      document.getElementById('rpCName').oninput = e => st.customName = e.target.value;
      document.getElementById('rpCScore').oninput = e => st.customScore = parseInt(e.target.value) || 0;
      if(DB.types.length === 0){
        box.insertAdjacentHTML('beforeend', `<p style="font-size:12px;color:#8f86ad;margin:8px 0 0">提示：可去事件库创建类型和事件，以后点选更方便</p>`);
      }
    } else {
      const evs = DB.events.filter(e => e.typeId === st.typeId);
      if(evs.length === 0){
        box.innerHTML = `<p style="font-size:13px;color:#8f86ad;margin:6px 0">该类型下还没有事件，<a id="rpGoLib" style="color:var(--primary)">去事件库添加</a></p>`;
        const a = document.getElementById('rpGoLib');
        if(a) a.onclick = () => { closeModal(); showPage('library'); renderLibrary(); };
      } else {
        box.innerHTML = `<label>事件</label><div class="chips">` + evs.map(e =>
          `<button class="chip ${st.eventId === e.id ? 'on' : ''}" data-eid="${e.id}">${esc(e.name)}</button>`
        ).join('') + `</div>`;
        box.querySelectorAll('[data-eid]').forEach(b => {
          b.onclick = () => { st.eventId = b.dataset.eid; resetMatch(); renderEvents(); };
        });
      }
    }
    renderTrack();
  }

  function renderTrack(){
    const box = document.getElementById('rpTrack');
    const ev = st.custom ? null : evOf();
    if(!ev){ box.innerHTML = ''; return; }

    refreshMatch();

    const cnt = occCount(ev.id) + (editing ? 0 : 1);
    const base = ev.score;
    const final = base * st.mult;
    const col = final > 0 ? 'var(--plus)' : 'var(--minus)';
    const multBadge = st.mult > 1 ? '<span class="badge">加倍 ×2</span>' : '';

    let html = '';
    if(ev.tracked){
      html += `<div class="trackNote">「${esc(ev.name)}」这是<b>第 ${cnt} 次</b>发生
        <a id="rpHist">查看全部历史</a></div>`;
    }

    html += `<div class="switchRow">
      <span>本次记分：<b style="color:${col}">${final > 0 ? '+' : ''}${final}</b> ${multBadge}</span>
      <span style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;color:var(--ink2)">加倍</span>
        <span class="switch"><label style="display:block;cursor:pointer"><input type="checkbox" id="rpDouble" ${st.mult > 1 ? 'checked' : ''}><i></i></label></span>
      </span>
    </div>`;

    const dateEl = document.getElementById('rpDate');
    const noteEl = document.getElementById('rpNote');
    const date = dateEl ? dateEl.value : '';
    const note = noteEl ? noteEl.value.trim() : '';
    const recent = recentNotes(st.typeId, typeNameOf(), date, editing ? rec.id : null, 3)
      .filter(x => !st.match || x.id !== st.match.id);

    if(st.match){
      const simTxt = st.match.manual ? '您选择的同类备注'
        : `文字相近 ${Math.round((st.match.sim || 0) * 100)}%`;
      html += `<div class="matchBox">
        <div class="matchTitle">${st.match.manual ? '已选择同类情况' : '发现 10 天内相似备注'}</div>
        <div class="matchNote">${esc(st.match.date)}「${esc(st.match.note)}」<span class="matchSim">${simTxt}</span></div>
        <div class="matchHint">${st.mult > 1 ? '本次已按 ×2 记分' : '本次不加倍'}</div>
      </div>`;
    } else if(recent.length){
      html += `<div class="matchEmpty">没有找到相似备注，按原分记。</div>`;
    }

    if(recent.length){
      html += `<div class="recentNotes">
        <div class="recentTitle">最近同类备注（点一条 = 同一类情况，自动 ×2）</div>
        <div class="recentList">` + recent.map(x =>
          `<button class="recentChip" data-rid="${x.id}">${esc(x.date.slice(5))} ${esc(shorten(x.note, 16))}</button>`
        ).join('') + `</div>
      </div>`;
    }

    box.innerHTML = html;
    const d = document.getElementById('rpDouble');
    if(d) d.onchange = () => {
      st.userMult = d.checked ? 2 : 1;
      st.mult = st.userMult;
      renderTrack();
    };
    const h = document.getElementById('rpHist');
    if(h) h.onclick = () => openEventHistory(ev.id);
    box.querySelectorAll('.recentChip').forEach(b => {
      b.onclick = () => {
        const r = DB.records.find(x => x.id === b.dataset.rid);
        if(!r) return;
        st.match = {
          id: r.id, date: r.date, note: r.note,
          sim: textSimilarity(note, r.note), manual: true
        };
        st.matchManual = true;
        st.userMult = 2;
        st.mult = 2;
        renderTrack();
      };
    });
  }

  function renderPhotos(){
    const box = document.getElementById('rpPhotos');
    let html = '';
    st.photoIds.forEach((pid, i) => {
      html += `<span class="phWrap" data-idx="${i}">
        <img class="phThumb" data-pid="${pid}" src="">
        <button class="phDel" data-idx="${i}">✕</button>
      </span>`;
    });
    st.newPhotoBlobs.forEach((p, i) => {
      html += `<span class="phWrap" data-new="${i}">
        <img class="phThumb" src="${URL.createObjectURL(p.blob)}">
        <button class="phDel" data-new="${i}">✕</button>
      </span>`;
    });
    if(st.photoIds.length + st.newPhotoBlobs.length < 3){
      html += `<button class="chip" id="rpAddPhoto">📷 添加照片</button>`;
    }
    html += `<input type="file" id="rpPhotoFile" accept="image/*" style="display:none">`;
    box.innerHTML = html;
    st.photoIds.forEach(pid => {
      const img = box.querySelector(`img[data-pid="${pid}"]`);
      if(img) img.onclick = () => viewPhoto(pid);
      photoUrl(pid).then(u => { if(u && img) img.src = u; });
    });
    box.querySelectorAll('.phDel').forEach(b => {
      b.onclick = () => {
        if(b.dataset.new != null) st.newPhotoBlobs.splice(+b.dataset.new, 1);
        else {
          const i = +b.dataset.idx;
          st.removedPhotoIds.push(st.photoIds[i]);
          st.photoIds.splice(i, 1);
        }
        renderPhotos();
      };
    });
    const add = document.getElementById('rpAddPhoto');
    if(add) add.onclick = () => document.getElementById('rpPhotoFile').click();
    const f = document.getElementById('rpPhotoFile');
    if(f) f.onchange = async () => {
      const file = f.files[0];
      if(!file) return;
      try{
        const blob = await compressImage(file);
        st.newPhotoBlobs.push({ id: uid(), blob });
        renderPhotos();
      }catch(e){ toast('照片处理失败'); }
    };
  }

  renderTypes();
  renderEvents();
  renderPhotos();

  document.getElementById('rpCancel').onclick = closeModal;

  document.getElementById('rpSave').onclick = async () => {
    const date = document.getElementById('rpDate').value;
    if(!date) return toast('请选择日期');
    const note = document.getElementById('rpNote').value.trim();
    let typeName, eventName, score, mult = 1, matchRef = null;
    if(st.custom){
      eventName = document.getElementById('rpCName').value.trim();
      if(!eventName) return toast('请输入事件名称');
      score = parseInt(document.getElementById('rpCScore').value) || 0;
      if(score === 0) return toast('分数不能为 0');
      typeName = '自定义';
    } else {
      const ev = evOf();
      if(!ev) return toast('请选择事件');
      typeName = DB.types.find(t => t.id === st.typeId)?.name || '';
      eventName = ev.name;
      mult = st.mult > 1 ? 2 : 1;
      score = ev.score * mult;
      matchRef = mult > 1 && st.match
        ? { id: st.match.id, date: st.match.date, note: st.match.note, sim: st.match.sim, manual: !!st.match.manual }
        : null;
    }
    // 保存新照片
    const newIds = [];
    for(const p of st.newPhotoBlobs){
      try{
        await Photos.put(p.id, p.blob);
        newIds.push(p.id);
      }catch(e){
        toast('照片存储失败，已跳过（空间不足时请及时导出备份）');
      }
    }
    const photoIds = [...st.photoIds, ...newIds].slice(0, 3);
    for(const pid of st.removedPhotoIds){ await Photos.del(pid); thumbUrls.delete(pid); }
    const prev = totalScore();
    if(editing){
      rec.date = date; rec.note = note;
      rec.typeId = st.typeId; rec.typeName = typeName;
      rec.eventId = st.eventId; rec.eventName = eventName;
      rec.mult = mult; rec.doubled = mult > 1; rec.score = score;
      rec.match = matchRef;
      rec.photoIds = photoIds.slice(0,3);
    } else {
      DB.records.push({
        id: uid(), date, note,
        typeId: st.typeId, typeName, eventId: st.eventId, eventName,
        mult, doubled: mult > 1, score, match: matchRef,
        photoIds: photoIds.slice(0,3), at: Date.now()
      });
      setLastFill(date === dateStr() ? null : date); // 补填了旧日期就记住，记的是今天则恢复默认
    }
    applyRecordChange(prev);
    closeModal();
    renderRecords();
    toast((editing ? '已保存修改' : `已记一笔 ${score > 0 ? '+' : ''}${score} 分`)
      + (storageOK ? '' : '（当前方式不自动保存，请到设置导出备份）'));
  };

  if(editing){
    document.getElementById('rpDel').onclick = () => {
      confirmBox('确定删除这条记录吗？<br>删除后相关事件的「第几次」计数会重新计算。', async () => {
        const prev = totalScore();
        DB.records = DB.records.filter(x => x.id !== rec.id);
        for(const pid of rec.photoIds || []){ await Photos.del(pid); thumbUrls.delete(pid); }
        applyRecordChange(prev);
        closeModal();
        renderRecords();
        toast('已删除');
      }, '删除');
    };
  }
}

/* ================= 事件历史 ================= */
function openEventHistory(eventId){
  const ev = DB.events.find(e => e.id === eventId);
  const rs = DB.records.filter(r => r.eventId === eventId).slice().reverse();
  openTopModal(`<div class="sheet">
    <h4>「${ev ? esc(ev.name) : ''}」全部记录（${rs.length} 次）</h4>
    <div class="histList">
      ${rs.map(r => `<div class="row">
        <span class="dt">${r.date}</span>
        <span class="nm">${recBadge(r)} ${esc(r.note || '')}</span>
        <span class="sc ${r.score > 0 ? 'plus' : 'minus'}">${r.score > 0 ? '+' : ''}${r.score}</span>
      </div>`).join('') || '<p style="color:#8f86ad;text-align:center">暂无记录</p>'}
    </div>
    <div class="sheetBtns"><button class="btn-primary" id="hClose">关闭</button></div>
  </div>`);
  document.getElementById('hClose').onclick = closeTopModal;
}

/* ================= 事件库 / 等级库 ================= */
let libTab = 'events';
function renderLibrary(){
  document.getElementById('libTitle').textContent = libTab === 'levels' ? '等级库' : '事件库';
  document.getElementById('libTabEvents').classList.toggle('on', libTab === 'events');
  document.getElementById('libTabLevels').classList.toggle('on', libTab === 'levels');
  document.getElementById('libAddType').style.display = libTab === 'levels' ? 'none' : '';
  document.getElementById('libHint').style.display = libTab === 'levels' ? 'none' : '';
  if(libTab === 'levels'){ renderLevelLibrary(); return; }
  const list = document.getElementById('libList');
  if(DB.types.length === 0){
    list.innerHTML = `<div class="emptyHint">事件库还是空的<br>先建一个类型（如：自信、自尊、爱心）<br>再在类型下添加具体事件</div>`;
    return;
  }
  list.innerHTML = DB.types.map(t => {
    const evs = DB.events.filter(e => e.typeId === t.id);
    return `<div class="typeCard">
      <div class="typeHead"><span class="nm">${esc(t.name)}</span>
        <button data-act="editType" data-id="${t.id}">✎</button>
        <button data-act="delType" data-id="${t.id}">🗑</button>
      </div>
      ${evs.map((e, i) => `<div class="evRow">
        <span class="nm">${esc(e.name)}${e.tracked ? ' <span class="trackTag">追踪</span>' : ''}</span>
        <span class="sc ${e.score > 0 ? 'plus' : 'minus'}">${e.score > 0 ? '+' : ''}${e.score}</span>
        ${i > 0 ? `<button data-act="upEv" data-id="${e.id}">↑</button>` : '<span style="width:32px"></span>'}
        ${i < evs.length - 1 ? `<button data-act="downEv" data-id="${e.id}">↓</button>` : '<span style="width:32px"></span>'}
        <button data-act="editEv" data-id="${e.id}">✎</button>
        <button data-act="delEv" data-id="${e.id}">🗑</button>
      </div>`).join('') || '<div class="evRow" style="color:#8f86ad">还没有事件，点下方「＋ 添加事件」</div>'}
      <button class="btn-ghost btn-block" data-act="addEv" data-id="${t.id}">＋ 添加事件</button>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-act]').forEach(b => {
    b.onclick = () => {
    const act = b.dataset.act, id = b.dataset.id;
    if(act === 'editType'){
      openTypeForm(DB.types.find(t => t.id === id));
    } else if(act === 'delType'){
      const t = DB.types.find(t => t.id === id);
      if(!t) return;
      confirmBox(`删除类型「${esc(t.name)}」？<br>该类型下的所有事件也会一并删除（已有记录不受影响）。`, () => {
        DB.types = DB.types.filter(x => x.id !== id);
        DB.events = DB.events.filter(e => e.typeId !== id);
        save();
        toast('已删除');
        renderLibrary();
      }, '删除');
    } else if(act === 'addEv'){
      openEventForm(id, null);
    } else if(act === 'upEv'){
      moveEvent(id, -1);
    } else if(act === 'downEv'){
      moveEvent(id, 1);
    } else if(act === 'editEv'){
      openEventForm(null, DB.events.find(e => e.id === id));
    } else if(act === 'delEv'){
      const e = DB.events.find(e => e.id === id);
      if(!e) return;
      confirmBox(`删除事件「${esc(e.name)}」？已有记录不受影响。`, () => {
        DB.events = DB.events.filter(x => x.id !== id);
        save();
        toast('已删除');
        renderLibrary();
      }, '删除');
    }
    };
  });
}

/* ================= 等级库 ================= */
function renderLevelLibrary(){
  const list = document.getElementById('libList');
  const th = levelThresholds();
  const total = totalScore();
  const li = levelInfo(total);
  const steps = levelSteps();
  const groups = [
    { big:'微小', from:1, to:3 },
    { big:'小', from:4, to:10 },
    { big:'中', from:11, to:17 },
    { big:'大', from:18, to:24 },
    { big:'特大', from:25, to:28 }
  ];
  let html = `<div class="card levelNow">
    <p>当前总分 <b>${total}</b> 分 ｜ 当前等级 <b>${total < 0 ? '微小 · 1（负分）' : li.label}</b></p>
    <p>满瓶总分：<b>${th[28]}</b> 分</p>
  </div>`;
  groups.forEach(g => {
    html += `<div class="typeCard">
      <div class="typeHead"><span class="nm">${g.big}</span>
        <button class="miniBtn" data-act="groupSet" data-from="${g.from}" data-to="${g.to}" data-big="${g.big}">整组统一</button>
      </div>`;
    for(let k = g.from; k <= g.to; k++){
      const [big, sub] = levelNameParts(k);
      const start = th[k - 1];
      const step = steps[k - 1];
      const next = k < 28 ? `升到下一级 ${step} 分` : `升到满瓶 ${step} 分`;
      html += `<div class="evRow levelRow">
        <span class="nm">${big} · ${sub}</span>
        <span class="lvStart">${start} 分起</span>
        <span class="lvStep">${next}</span>
        <button data-act="editStep" data-idx="${k - 1}">✎</button>
      </div>`;
    }
    html += `</div>`;
  });
  html += `<button class="btn-ghost btn-block" id="levelReset">恢复默认（微小 35，其余 56，满瓶 ${DEFAULT_FULL_SCORE}）</button>`;
  list.innerHTML = html;
  list.querySelectorAll('[data-act]').forEach(b => {
    b.onclick = () => {
      if(b.dataset.act === 'editStep') openStepForm(+b.dataset.idx);
      else if(b.dataset.act === 'groupSet') openGroupStepForm(+b.dataset.from, +b.dataset.to, b.dataset.big);
    };
  });
  document.getElementById('levelReset').onclick = () => {
    confirmBox(`恢复默认等级分数？<br>微小 3 级每级 35 分，其余每级 56 分，满瓶 ${DEFAULT_FULL_SCORE} 分。`, () => {
      DB.meta.levelSteps = DEFAULT_LEVEL_STEPS.slice();
      save();
      renderLevelLibrary();
      renderRecords();
      renderHome();
      toast('已恢复默认');
    }, '恢复');
  };
}

function openStepForm(idx){
  const steps = levelSteps();
  const k = idx + 1;
  const [big, sub] = levelNameParts(k);
  let nextName = '满瓶';
  if(k < 28){
    const p = levelNameParts(k + 1);
    nextName = `${p[0]} · ${p[1]}`;
  }
  openModal(`<div class="sheet">
    <h4>修改升级分数</h4>
    <p style="margin:0;font-size:13px;color:#8f86ad;text-align:center">${big} · ${sub} → ${nextName}</p>
    <label>升到下一级需要多少分</label>
    <input type="number" id="stepVal" min="1" max="99999" step="1" value="${steps[idx]}">
    <p style="font-size:12px;color:#8f86ad;line-height:1.6">改动后，后面所有等级的起点和满瓶总分会自动重新计算。</p>
    <div class="sheetBtns">
      <button class="btn-ghost" id="stepCancel">取消</button>
      <button class="btn-primary" id="stepSave">保存</button>
    </div>
  </div>`);
  document.getElementById('stepCancel').onclick = closeModal;
  document.getElementById('stepSave').onclick = () => {
    const v = parseInt(document.getElementById('stepVal').value);
    if(!v || v < 1) return toast('请输入大于 0 的整数');
    if(v > 99999) return toast('分数太大了，请填 1–99999');
    DB.meta.levelSteps[idx] = v;
    save();
    closeModal();
    renderLevelLibrary();
    renderRecords();
    renderHome();
    toast('已保存');
  };
}

function openGroupStepForm(from, to, big){
  const steps = levelSteps();
  const first = steps[from - 1];
  const same = steps.slice(from - 1, to).every(v => v === first);
  openModal(`<div class="sheet">
    <h4>${big} · 整组统一</h4>
    <p style="margin:0;font-size:13px;color:#8f86ad;text-align:center">把这 ${to - from + 1} 个小级都改成同一个升级分数</p>
    <label>每级需要多少分</label>
    <input type="number" id="groupVal" min="1" max="99999" step="1" value="${same ? first : ''}" placeholder="例如 56">
    <div class="sheetBtns">
      <button class="btn-ghost" id="groupCancel">取消</button>
      <button class="btn-primary" id="groupSave">保存</button>
    </div>
  </div>`);
  document.getElementById('groupCancel').onclick = closeModal;
  document.getElementById('groupSave').onclick = () => {
    const v = parseInt(document.getElementById('groupVal').value);
    if(!v || v < 1) return toast('请输入大于 0 的整数');
    if(v > 99999) return toast('分数太大了，请填 1–99999');
    for(let i = from - 1; i < to; i++) DB.meta.levelSteps[i] = v;
    save();
    closeModal();
    renderLevelLibrary();
    renderRecords();
    renderHome();
    toast('已保存');
  };
}

/* 事件在所属类型内上移/下移（只影响同类型内的事件顺序） */
function moveEvent(id, dir){
  const e = DB.events.find(x => x.id === id);
  if(!e) return;
  const siblings = DB.events.filter(x => x.typeId === e.typeId);
  const idx = siblings.findIndex(x => x.id === id);
  const target = siblings[idx + dir];
  if(!target) return;
  const gi = DB.events.indexOf(e);
  const gi2 = DB.events.indexOf(target);
  DB.events[gi] = target;
  DB.events[gi2] = e;
  save();
  renderLibrary();
}

function openTypeForm(type){
  openModal(`<div class="sheet">
    <h4>${type ? '编辑类型' : '新建类型'}</h4>
    <label>类型名称</label>
    <input type="text" id="tfName" value="${type ? esc(type.name) : ''}" placeholder="如：自信 / 自尊 / 爱心">
    <div class="sheetBtns">
      <button class="btn-ghost" id="tfCancel">取消</button>
      <button class="btn-primary" id="tfSave">保存</button>
    </div>
  </div>`);
  document.getElementById('tfCancel').onclick = closeModal;
  document.getElementById('tfSave').onclick = () => {
    const v = document.getElementById('tfName').value.trim();
    if(!v) return toast('请输入类型名称');
    if(type){ type.name = v; } else { DB.types.push({ id: uid(), name: v }); }
    save();
    closeModal();
    renderLibrary();
    toast('已保存');
  };
}

function openEventForm(typeId, ev){
  const t = ev ? DB.types.find(x => x.id === ev.typeId) : DB.types.find(x => x.id === typeId);
  openModal(`<div class="sheet">
    <h4>${ev ? '编辑事件' : '新建事件'}</h4>
    <p style="margin:0;font-size:13px;color:#8f86ad">所属类型：${t ? esc(t.name) : '—'}</p>
    <label>事件名称</label>
    <input type="text" id="efName" value="${ev ? esc(ev.name) : ''}" placeholder="如：主动举手发言">
    <label>分数（加分填正数，减分填负数）</label>
    <input type="number" id="efScore" step="1" value="${ev ? ev.score : 10}">
    <div class="switchRow"><span>追踪（记录时显示第几次发生、可加倍、可查历史）</span>
      <span class="switch"><label style="display:block;cursor:pointer"><input type="checkbox" id="efTrack" ${ev && ev.tracked ? 'checked' : ''}><i></i></label></span>
    </div>
    <div class="sheetBtns">
      <button class="btn-ghost" id="efCancel">取消</button>
      <button class="btn-primary" id="efSave">保存</button>
    </div>
  </div>`);
  document.getElementById('efCancel').onclick = closeModal;
  document.getElementById('efSave').onclick = () => {
    const name = document.getElementById('efName').value.trim();
    if(!name) return toast('请输入事件名称');
    const score = parseInt(document.getElementById('efScore').value);
    if(!score) return toast('分数不能为 0');
    const tracked = document.getElementById('efTrack').checked;
    if(ev){
      ev.name = name; ev.score = score; ev.tracked = tracked;
    } else {
      DB.events.push({ id: uid(), typeId, name, score, tracked });
    }
    save();
    closeModal();
    renderLibrary();
    toast('已保存');
  };
}

/* ================= 成长纪念册 ================= */
let albumPages = [], albumIdx = 0;

function renderAlbum(){
  const today = dateStr();
  const d = new Date();
  d.setDate(d.getDate() - 30);
  const aMonthAgo = dateStr(d);
  const first = DB.records.length ? DB.records.map(r => r.date).sort()[0] : today;
  document.getElementById('alStart').value = first < aMonthAgo ? first : aMonthAgo;
  document.getElementById('alEnd').value = today;
  document.getElementById('alPages').innerHTML = '';
  albumPages = [];
}

function genAlbum(){
  const s = document.getElementById('alStart').value;
  const e = document.getElementById('alEnd').value;
  if(!s || !e) return toast('请选择起止日期');
  if(s > e) return toast('起始日期不能晚于结束日期');
  const rs = DB.records.filter(r => r.date >= s && r.date <= e)
    .slice().sort((a,b) => a.date < b.date ? -1 : (a.date > b.date ? 1 : 0));
  if(rs.length === 0) return toast('这段时间内没有记录');

  const plus = rs.reduce((x,r) => x + (r.score > 0 ? r.score : 0), 0);
  const minus = rs.reduce((x,r) => x + (r.score < 0 ? r.score : 0), 0);
  const ach = DB.meta.achievements.filter(a => a.date >= s && a.date <= e).length;
  const phCount = rs.reduce((x,r) => x + (r.photoIds ? r.photoIds.length : 0), 0);

  // 按天分组
  const days = [];
  rs.forEach(r => {
    let g = days.find(x => x.date === r.date);
    if(!g){ g = { date: r.date, items: [] }; days.push(g); }
    g.items.push(r);
  });
  // 拆成单元（一天最多 4 条一组），每页 6 单元
  const units = [];
  days.forEach(g => {
    for(let i = 0; i < g.items.length; i += 4){
      units.push({ date: g.date, items: g.items.slice(i, i + 4) });
    }
  });
  const pages = [];
  let cur = [];
  units.forEach(u => {
    if(cur.length >= 6){ pages.push(cur); cur = []; }
    cur.push(u);
  });
  if(cur.length) pages.push(cur);

  albumPages = [
    { cover: true, start: s, end: e, n: rs.length, plus, minus, ach, ph: phCount },
    ...pages.map(blocks => ({ blocks })),
    { back: true }
  ];
  albumIdx = 0;
  renderAlbumPage();
}

async function albumPageHTML(p){
  if(p.cover){
    return `<div class="albumPage albumCover">
      <div class="t1">珠珠成长纪念册</div>
      <div class="t2">${p.start} ～ ${p.end}</div>
      <div class="t3">记录 ${p.n} 条<br>加分 +${p.plus} ｜ 减分 ${p.minus} ｜ 净变化 ${p.plus + p.minus > 0 ? '+' : ''}${p.plus + p.minus}<br>期间满瓶 ${p.ach} 次 ｜ 照片 ${p.ph} 张</div>
    </div>`;
  }
  if(p.back){
    return `<div class="albumPage albumCover">
      <div class="t1" style="font-size:20px">愿能量满满，快乐成长</div>
      <div class="t2">爱你的爸爸妈妈<br>${dateStr()}</div>
    </div>`;
  }
  let html = '';
  for(const g of p.blocks){
    const sum = g.items.reduce((s,r) => s + r.score, 0);
    html += `<div class="apHead">${fmtDateCN(g.date)}　当日 ${sum > 0 ? '+' : ''}${sum}</div>`;
    for(const r of g.items){
      let imgs = '';
      if(r.photoIds && r.photoIds.length){
        for(const pid of r.photoIds){
          const u = await photoUrl(pid);
          if(u) imgs += `<img class="apPhoto" src="${u}">`;
        }
      }
      html += `<div class="apRow">
        <span class="nm">${esc(r.typeName)} · ${esc(r.eventName)}${recMult(r) > 1 ? ' <span class="badge">加倍×2</span>' : ''}</span>
        <span class="sc ${r.score > 0 ? 'plus' : 'minus'}">${r.score > 0 ? '+' : ''}${r.score}</span>
        ${r.note ? `<span class="apNote">备注：${esc(r.note)}</span>` : ''}
        ${imgs ? `<span class="apNote" style="width:100%">${imgs}</span>` : ''}
      </div>`;
    }
  }
  return `<div class="albumPage">${html}</div>`;
}

async function renderAlbumPage(){
  const wrap = document.getElementById('alPages');
  if(!albumPages.length){ wrap.innerHTML = ''; return; }
  const total = albumPages.length;
  const nav = `<div class="albumNav">
    <button id="alPrev">◀</button>
    <b id="alPg">第 ${albumIdx + 1} / ${total} 页</b>
    <button id="alNext">▶</button>
    <button class="btn-primary" id="alPrint" style="border-radius:20px;padding:8px 20px;font-size:14px">打印</button>
  </div>`;
  wrap.innerHTML = await albumPageHTML(albumPages[albumIdx]) + nav;
  document.getElementById('alPrev').onclick = () => { albumIdx = Math.max(0, albumIdx - 1); renderAlbumPage(); };
  document.getElementById('alNext').onclick = () => { albumIdx = Math.min(total - 1, albumIdx + 1); renderAlbumPage(); };
  document.getElementById('alPrint').onclick = doPrintAlbum;
}

async function doPrintAlbum(){
  toast('正在排版…');
  const area = document.getElementById('printArea');
  let html = '';
  for(const p of albumPages){
    if(p.cover){
      html += `<div class="printPage printCover"><h1>珠珠成长纪念册</h1><div>${p.start} ～ ${p.end}<br>记录 ${p.n} 条 ｜ 加分 +${p.plus} ｜ 减分 ${p.minus} ｜ 净变化 ${p.plus + p.minus > 0 ? '+' : ''}${p.plus + p.minus}<br>期间满瓶 ${p.ach} 次 ｜ 照片 ${p.ph} 张</div></div>`;
      continue;
    }
    if(p.back){
      html += `<div class="printPage printCover"><h1 style="font-size:22px">愿能量满满，快乐成长</h1><div>爱你的爸爸妈妈<br>${dateStr()}</div></div>`;
      continue;
    }
    let ph = '';
    for(const g of p.blocks){
      const sum = g.items.reduce((s,r) => s + r.score, 0);
      ph += `<div class="ppHead">${fmtDateCN(g.date)}　当日 ${sum > 0 ? '+' : ''}${sum}</div>`;
      for(const r of g.items){
        let imgs = '';
        if(r.photoIds && r.photoIds.length){
          for(const pid of r.photoIds){
            const u = await photoUrl(pid);
            if(u) imgs += `<img class="ppPhoto" src="${u}">`;
          }
        }
        ph += `<div class="ppRow"><span>${esc(r.typeName)} · ${esc(r.eventName)}${recMult(r) > 1 ? '（加倍×2）' : ''}</span><span style="margin-left:auto">${r.score > 0 ? '+' : ''}${r.score}</span>${r.note ? `<span class="ppNote">备注：${esc(r.note)}</span>` : ''}${imgs}</div>`;
      }
    }
    html += `<div class="printPage">${ph}</div>`;
  }
  area.innerHTML = html;
  setTimeout(() => window.print(), 400);
}

/* ================= 设置 ================= */
function renderSettings(){
  document.getElementById('setDayStart').value = DB.meta.dayStart;
  document.getElementById('setDayEnd').value = DB.meta.dayEnd;
  const ach = DB.meta.achievements.slice().sort((a,b) => a.n - b.n);
  document.getElementById('achList').innerHTML = ach.length
    ? ach.map(a => `<p>🏆 第 ${a.n} 次满瓶 · ${a.date} · ${a.score} 分</p>`).join('')
    : '<p>还没有满瓶记录，继续加油！</p>';
}

async function exportBackup(){
  toast('正在打包…');
  const photoIds = new Set();
  DB.records.forEach(r => (r.photoIds || []).forEach(id => photoIds.add(id)));
  const photos = {};
  for(const id of photoIds){
    const b = await Photos.get(id);
    if(!b) continue;
    const base64 = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result.split(',')[1]);
      fr.onerror = rej;
      fr.readAsDataURL(b);
    });
    photos[id] = base64;
  }
  const obj = { app: 'zzb', version: 1, exportedAt: dateStr(), data: DB, photos };
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `珠珠能量宝瓶备份-${dateStr()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('同步文件已生成，请发到另一台设备');
}

/* ================= 合并导入（不覆盖本机内容，按唯一编号自动去重） ================= */
function mergeImportData(obj){
  if(!obj || obj.app !== 'zzb' || !obj.data || !Array.isArray(obj.data.records)) return false;
  const src = obj.data;
  for(const t of src.types || []){
    if(!DB.types.some(x => x.id === t.id)) DB.types.push(t);
  }
  /* 事件上下顺序以同步文件为准；两边都有的保留本机内容，本机独有的事件排在所属类型末尾 */
  const srcEventIds = new Set((src.events || []).map(e => e.id));
  const mergedEvents = [];
  for(const e of src.events || []){
    const local = DB.events.find(x => x.id === e.id);
    mergedEvents.push(local || e);
  }
  for(const e of DB.events){
    if(srcEventIds.has(e.id)) continue;
    let at = -1;
    for(let i = mergedEvents.length - 1; i >= 0; i--){
      if(mergedEvents[i].typeId === e.typeId){ at = i + 1; break; }
    }
    if(at >= 0) mergedEvents.splice(at, 0, e); else mergedEvents.push(e);
  }
  DB.events = mergedEvents;
  const have = new Set(DB.records.map(r => r.id));
  const addedRecords = [];
  for(const r of src.records){
    if(!have.has(r.id)){ DB.records.push(r); have.add(r.id); addedRecords.push(r); }
  }
  if(src.meta){
    if((src.meta.maxTotal || 0) > DB.meta.maxTotal) DB.meta.maxTotal = src.meta.maxTotal;
    for(const a of src.meta.achievements || []){
      if(!DB.meta.achievements.some(x => x.n === a.n)) DB.meta.achievements.push(a);
    }
    /* 设置类（昼夜背景时间）以同步文件为准 */
    if(src.meta.dayStart != null && src.meta.dayEnd != null){
      DB.meta.dayStart = src.meta.dayStart;
      DB.meta.dayEnd = src.meta.dayEnd;
    }
    /* 等级分数也属设置，以同步文件为准 */
    if(validLevelSteps(src.meta.levelSteps)){
      DB.meta.levelSteps = src.meta.levelSteps.slice();
    }
    if(src.meta.photosBase64){
      if(!DB.meta.photosBase64) DB.meta.photosBase64 = {};
      for(const [id, b64] of Object.entries(src.meta.photosBase64)){
        if(!DB.meta.photosBase64[id]) DB.meta.photosBase64[id] = b64;
      }
    }
  }
  save();
  return { added: addedRecords.length, addedRecords };
}

function importSyncMerge(file){
  const fr = new FileReader();
  fr.onload = () => {
    try{
      const obj = JSON.parse(fr.result);
      if(!obj || obj.app !== 'zzb' || !obj.data || !Array.isArray(obj.data.records)) throw new Error('bad');
      const newCount = obj.data.records.filter(r => !DB.records.some(x => x.id === r.id)).length;
      confirmBox(`同步文件里有 ${obj.data.records.length} 条记录，其中 ${newCount} 条是本机没有的。合并后两边记录都会保留、不覆盖；事件上下顺序和昼夜背景时间设置会以同步文件为准。确定合并？`, async () => {
        const res = mergeImportData(obj);
        applyBG();
        for(const r of res.addedRecords){
          for(const pid of r.photoIds || []){
            if(obj.photos && obj.photos[pid]){
              const b = await Photos.get(pid);
              if(!b){
                try{
                  const bin = atob(obj.photos[pid]);
                  const arr = new Uint8Array(bin.length);
                  for(let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                  await Photos.put(pid, new Blob([arr], { type: 'image/jpeg' }));
                }catch(e){}
              }
            }
          }
        }
        toast(`合并完成：新增 ${res.added} 条记录`);
        renderSettings();
        renderRecords();
      }, '合并');
    }catch(e){
      toast('同步文件无法识别');
    }
  };
  fr.readAsText(file);
}

function importBackup(file){
  const fr = new FileReader();
  fr.onload = () => {
    try{
      const obj = JSON.parse(fr.result);
      if(!obj || obj.app !== 'zzb' || !obj.data || !Array.isArray(obj.data.records)) throw new Error('bad');
      confirmBox(`将用备份（${obj.exportedAt}，共 ${obj.data.records.length} 条记录）覆盖当前全部数据，确定吗？`, async () => {
        DB = obj.data;
        if(!DB.meta) DB.meta = defaultData().meta;
        normalizeDB();
        save();
        await Photos.clear();
        thumbUrls.clear();
        for(const [id, b64] of Object.entries(obj.photos || {})){
          try{
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for(let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            await Photos.put(id, new Blob([arr], { type: 'image/jpeg' }));
          }catch(e){}
        }
        toast('恢复完成');
        setTimeout(() => location.reload(), 800);
      }, '恢复');
    }catch(e){
      toast('备份文件无法识别');
    }
  };
  fr.readAsText(file);
}

/* ================= 趋势页 ================= */
const TREND_COLORS = ['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#6250d6','#e34948'];
const TREND_OTHER = '#898781';
let trGran = 'day';
let trHidden = {};
let trState = null;
let trTableOpen = false;
let trSelIdx = null;

function trendAddDays(d, n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function trendMonday(d){
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function trendCatKey(r){ return r.typeId ? 't:' + r.typeId : 'n:' + (r.typeName || '其他'); }
function trendCatName(r){ return r.typeName || (r.typeId ? '未分类' : '自定义'); }

function trendBuckets(g){
  const out = [];
  const today = new Date();
  if(g === 'day'){
    for(let i = 13; i >= 0; i--){
      const d = trendAddDays(today, -i);
      out.push({ key: dateStr(d), label: `${d.getMonth()+1}/${d.getDate()}`, full: `${d.getMonth()+1}月${d.getDate()}日` });
    }
  } else if(g === 'week'){
    const mon = trendMonday(today);
    for(let i = 11; i >= 0; i--){
      const d = trendAddDays(mon, -7 * i);
      out.push({ key: dateStr(d), label: `${d.getMonth()+1}/${d.getDate()}`, full: `${d.getMonth()+1}月${d.getDate()}日那周` });
    }
  } else if(g === 'month'){
    for(let i = 11; i >= 0; i--){
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      out.push({
        key: `${d.getFullYear()}-${pad2(d.getMonth()+1)}`,
        label: `${d.getMonth()+1}月`,
        full: `${d.getFullYear()}年${d.getMonth()+1}月`
      });
    }
  } else {
    let minY = today.getFullYear();
    DB.records.forEach(r => {
      const y = parseInt(r.date.slice(0, 4), 10);
      if(y && y < minY) minY = y;
    });
    minY = Math.max(minY, today.getFullYear() - 9);
    for(let y = minY; y <= today.getFullYear(); y++){
      out.push({ key: String(y), label: String(y), full: `${y}年` });
    }
  }
  return out;
}
function trendBucketKey(g, date){
  if(g === 'day') return date;
  if(g === 'week'){
    const [y, m, d] = date.split('-').map(Number);
    return dateStr(trendMonday(new Date(y, m - 1, d)));
  }
  if(g === 'month') return date.slice(0, 7);
  return date.slice(0, 4);
}

function buildTrendData(){
  const all = [];
  const seen = new Set();
  DB.records.forEach(r => {
    const k = trendCatKey(r);
    if(!seen.has(k)){ seen.add(k); all.push({ key: k, name: trendCatName(r) }); }
  });
  /* 稳定配色：按类别首次出现的顺序排（编号随创建时间递增），新增类别不会改变旧类别颜色 */
  all.sort((a, b) => {
    const ac = a.key.startsWith('n:'), bc = b.key.startsWith('n:');
    if(ac !== bc) return ac ? 1 : -1;
    return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
  });
  all.forEach((c, i) => { c.color = i < 8 ? TREND_COLORS[i] : TREND_OTHER; c.fold = i >= 8; });

  const buckets = trendBuckets(trGran);
  const at = new Map(buckets.map((b, i) => [b.key, i]));
  const vals = new Map();
  const cnt = new Map();
  all.forEach(c => { vals.set(c.key, buckets.map(() => 0)); cnt.set(c.key, 0); });
  const used = new Set();
  DB.records.forEach(r => {
    const i = at.get(trendBucketKey(trGran, r.date));
    if(i == null) return;
    const k = trendCatKey(r);
    vals.get(k)[i] += r.score;
    cnt.set(k, cnt.get(k) + 1);
    used.add(k);
  });

  const series = [];
  all.forEach(c => {
    if(c.fold || !used.has(c.key)) return;
    series.push({ key: c.key, name: c.name, color: c.color, values: vals.get(c.key), count: cnt.get(c.key) });
  });
  const foldedKeys = all.filter(c => c.fold && used.has(c.key)).map(c => c.key);
  if(foldedKeys.length){
    series.push({
      key: 'other', name: '其他', color: TREND_OTHER,
      count: foldedKeys.reduce((a, k) => a + cnt.get(k), 0),
      values: buckets.map((b, i) => foldedKeys.reduce((s, k) => s + vals.get(k)[i], 0))
    });
  }
  const visible = series.filter(s => !trHidden[s.key]);
  const total = visible.reduce((s, x) => s + x.values.reduce((a, b) => a + b, 0), 0);
  const visRecCount = visible.reduce((a, s) => a + s.count, 0);
  return { buckets, series, visible, total, visRecCount };
}

function renderTrend(){
  const data = buildTrendData();
  trState = data;
  document.querySelectorAll('#trGran button').forEach(b => {
    b.classList.toggle('active', b.dataset.gran === trGran);
  });
  const first = data.buckets[0], last = data.buckets[data.buckets.length - 1];
  let rangeTxt;
  if(trGran === 'day') rangeTxt = `近 14 天（${first.full} – ${last.full}）`;
  else if(trGran === 'week') rangeTxt = `近 12 周（${first.full} – ${last.full}）`;
  else if(trGran === 'month') rangeTxt = `近 12 个月（${first.full} – ${last.full}）`;
  else rangeTxt = data.buckets.length > 1 ? `${first.full} – ${last.full}` : `${first.full}`;
  const cls = data.total > 0 ? 'plus' : (data.total < 0 ? 'minus' : '');
  document.getElementById('trSummary').innerHTML =
    `<span>合计 <b class="${cls}">${data.total > 0 ? '+' : ''}${data.total}</b></span>
     <span>${data.visRecCount} 笔</span>
     <span class="trSumHint">${rangeTxt}</span>`;
  renderTrendLegend();
  renderTrendChart();
  renderTrendTable();
}

function renderTrendLegend(){
  const box = document.getElementById('trLegend');
  if(!trState || trState.series.length < 2){
    box.innerHTML = trState && trState.series.length === 1
      ? '' : (trState ? `<span class="trHint">这段时间没有记录</span>` : '');
    return;
  }
  box.innerHTML = trState.series.map(s => {
    const off = !!trHidden[s.key];
    return `<button class="trLegendItem${off ? ' off' : ''}" data-ckey="${s.key}" aria-pressed="${!off}">
      <i style="background:${s.color}"></i><span>${esc(s.name)}</span></button>`;
  }).join('');
  box.querySelectorAll('.trLegendItem').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.ckey;
      trHidden[k] = !trHidden[k];
      if(trHidden[k] === false) delete trHidden[k];
      trSelIdx = null;
      renderTrend();
    };
  });
}

function niceTrendStep(range){
  if(!(range > 0)) return 1;
  const raw = range / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : (norm <= 2 ? 2 : (norm <= 5 ? 5 : 10));
  return Math.max(1, Math.round(step * mag));
}

function renderTrendChart(){
  const wrap = document.getElementById('trChart');
  const vis = trState ? trState.visible : [];
  if(!trState || trState.series.length === 0){
    wrap.innerHTML = '<div class="trHint">还没有记录。记下第一笔后，这里会出现趋势。</div>';
    return;
  }
  if(vis.length === 0){
    wrap.innerHTML = '<div class="trHint">已全部隐藏，点上方图例重新显示。</div>';
    return;
  }
  const buckets = trState.buckets, n = buckets.length;
  const W = Math.max(300, wrap.clientWidth || 360);
  const H = 300;
  const direct = vis.length <= 4;
  const left = 40, right = direct ? 58 : 16, top = 14, bottom = 30;
  const plotW = Math.max(60, W - left - right), plotH = H - top - bottom;

  let vmin = 0, vmax = 0;
  vis.forEach(s => s.values.forEach(v => { if(v < vmin) vmin = v; if(v > vmax) vmax = v; }));
  if(vmax === vmin) vmax = vmin + 1;
  const step = niceTrendStep(vmax - vmin);
  const yMin = Math.floor(vmin / step) * step;
  const yMax = Math.ceil(vmax / step) * step;
  const span = yMax - yMin || 1;
  const xOf = i => n === 1 ? left + plotW / 2 : left + (plotW * i) / (n - 1);
  const yOf = v => top + plotH * (1 - (v - yMin) / span);

  let svg = '';
  for(let v = yMin; v <= yMax + 1e-9; v += step){
    const y = yOf(v).toFixed(1);
    svg += `<line x1="${left}" y1="${y}" x2="${W - right}" y2="${y}" stroke="#e1e0d9" stroke-width="1" shape-rendering="crispEdges"/>`;
    svg += `<text x="${left - 6}" y="${(+y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#898781">${Math.round(v)}</text>`;
  }
  const y0 = yOf(0).toFixed(1);
  svg += `<line x1="${left}" y1="${y0}" x2="${W - right}" y2="${y0}" stroke="#c3c2b7" stroke-width="1" shape-rendering="crispEdges"/>`;

  /* 从最新一个时间点往回标，保证最后一个日期一定有刻度、且相邻刻度不挤在一起 */
  const stride = Math.max(1, Math.ceil(n / 6));
  for(let i = n - 1; i >= 0; i -= stride){
    svg += `<text x="${xOf(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#898781">${esc(buckets[i].label)}</text>`;
  }

  vis.forEach(s => {
    const pts = s.values.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const i = n - 1;
    svg += `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(s.values[i]).toFixed(1)}" r="4.5" fill="${s.color}" stroke="#ffffff" stroke-width="2"/>`;
  });

  if(direct){
    const labels = vis.map(s => ({ s, y: yOf(s.values[n - 1]) })).sort((a, b) => a.y - b.y);
    let lastY = -99;
    labels.forEach(L => {
      if(L.y - lastY < 12) return;
      lastY = L.y;
      svg += `<text x="${(xOf(n - 1) + 8).toFixed(1)}" y="${(L.y + 3.5).toFixed(1)}" font-size="10" fill="#52514e">${esc(shorten(L.s.name, 4))}</text>`;
    });
  }

  svg += `<line id="trCross" x1="0" y1="${top}" x2="0" y2="${H - bottom}" stroke="#c3c2b7" stroke-width="1" style="display:none"/>`;
  svg += `<g id="trHoverDots"></g>`;
  svg += `<rect id="trHit" x="${left}" y="${top}" width="${plotW}" height="${plotH}" fill="transparent" style="cursor:crosshair"/>`;

  wrap.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="各类别分数趋势图" tabindex="0">${svg}</svg>
    <div class="trTip" id="trTip" style="display:none"></div>`;
  trState.geom = { W, H, left, right, top, bottom, xs: buckets.map((b, i) => xOf(i)), yOf, plotW, plotH };

  const svgEl = wrap.querySelector('svg');
  const tip = document.getElementById('trTip');
  const move = clientX => {
    const rect = svgEl.getBoundingClientRect();
    const scale = W / rect.width;
    const x = (clientX - rect.left) * scale;
    let best = 0, bd = Infinity;
    trState.geom.xs.forEach((px, i) => { const d = Math.abs(px - x); if(d < bd){ bd = d; best = i; } });
    showTrendTip(best);
  };
  svgEl.onpointermove = e => move(e.clientX);
  svgEl.onpointerdown = e => move(e.clientX);
  svgEl.onpointerleave = () => hideTrendTip();
  svgEl.onfocus = () => showTrendTip(trSelIdx == null ? buckets.length - 1 : trSelIdx);
  svgEl.onblur = () => hideTrendTip();
  svgEl.onkeydown = e => {
    if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const base = trSelIdx == null ? buckets.length - 1 : trSelIdx;
    trSelIdx = Math.max(0, Math.min(buckets.length - 1, base + (e.key === 'ArrowLeft' ? -1 : 1)));
    showTrendTip(trSelIdx);
  };
  if(trSelIdx != null) showTrendTip(trSelIdx);
}

function showTrendTip(i){
  if(!trState || !trState.geom) return;
  const g = trState.geom;
  const vis = trState.visible;
  if(!vis.length) return;
  trSelIdx = i;
  const wrap = document.getElementById('trChart');
  const svg = wrap.querySelector('svg');
  const tip = document.getElementById('trTip');
  const cross = document.getElementById('trCross');
  const dots = document.getElementById('trHoverDots');
  if(!svg || !tip || !cross || !dots) return;
  const x = g.xs[i];
  cross.setAttribute('x1', x.toFixed(1));
  cross.setAttribute('x2', x.toFixed(1));
  cross.style.display = '';
  dots.innerHTML = vis.map(s =>
    `<circle cx="${x.toFixed(1)}" cy="${g.yOf(s.values[i]).toFixed(1)}" r="4.5" fill="${s.color}" stroke="#ffffff" stroke-width="2"/>`
  ).join('');
  tip.innerHTML = `<div class="ttDate">${esc(trState.buckets[i].full)}</div>` + vis.map(s => {
    const v = s.values[i];
    return `<div class="ttRow"><i style="background:${s.color}"></i><b>${v > 0 ? '+' : ''}${v}</b><span>${esc(s.name)}</span></div>`;
  }).join('');
  tip.style.display = 'block';
  const half = 74;
  tip.style.left = Math.min(Math.max(x, half), g.W - half) + 'px';
}

function hideTrendTip(){
  const tip = document.getElementById('trTip');
  const cross = document.getElementById('trCross');
  const dots = document.getElementById('trHoverDots');
  if(tip) tip.style.display = 'none';
  if(cross) cross.style.display = 'none';
  if(dots) dots.innerHTML = '';
}

function renderTrendTable(){
  const box = document.getElementById('trTable');
  if(!box) return;
  box.style.display = trTableOpen ? 'block' : 'none';
  const btn = document.getElementById('trTableBtn');
  if(btn) btn.textContent = trTableOpen ? '收起表格' : '看数字表格';
  if(!trTableOpen || !trState) return;
  const vis = trState.visible;
  if(!vis.length){ box.innerHTML = '<div class="trHint">没有可显示的数据</div>'; return; }
  const head = `<tr><th>时间</th>${vis.map(s => `<th>${esc(s.name)}</th>`).join('')}<th>合计</th></tr>`;
  const rows = trState.buckets.map((b, i) => {
    const sum = vis.reduce((a, s) => a + s.values[i], 0);
    return `<tr><th scope="row">${esc(b.full)}</th>${vis.map(s => `<td>${s.values[i] > 0 ? '+' : ''}${s.values[i]}</td>`).join('')}<td><b>${sum > 0 ? '+' : ''}${sum}</b></td></tr>`;
  }).reverse().join('');
  box.innerHTML = `<div class="trTableWrap"><table class="trTable"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

/* ================= 事件绑定 ================= */
(function init(){
  document.getElementById('fab').onclick = () => openRecPanel(null);
  document.getElementById('mnPrev').onclick = () => { viewYM.m--; if(viewYM.m < 1){ viewYM.m = 12; viewYM.y--; } renderRecords(); };
  document.getElementById('mnNext').onclick = () => { viewYM.m++; if(viewYM.m > 12){ viewYM.m = 1; viewYM.y++; } renderRecords(); };
  document.getElementById('mnLabel').onclick = openMonthPicker;
  document.getElementById('mnToday').onclick = () => { navNow(); renderRecords(); };
  document.getElementById('btnHome').onclick = () => { showPage('home'); renderHome(); };
  document.getElementById('btnTrend').onclick = () => { showPage('trend'); renderTrend(); };
  document.getElementById('btnLibrary').onclick = () => { libTab = 'events'; renderLibrary(); showPage('library'); };
  document.getElementById('libTabEvents').onclick = () => { libTab = 'events'; renderLibrary(); };
  document.getElementById('libTabLevels').onclick = () => { libTab = 'levels'; renderLibrary(); };
  document.querySelectorAll('#trGran button').forEach(b => {
    b.onclick = () => { trGran = b.dataset.gran; trSelIdx = null; renderTrend(); };
  });
  document.getElementById('trTableBtn').onclick = () => { trTableOpen = !trTableOpen; renderTrendTable(); };
  let rzTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => {
      if(document.getElementById('page-trend').classList.contains('active')) renderTrendChart();
    }, 150);
  });
  document.getElementById('btnAlbum').onclick = () => { renderAlbum(); showPage('album'); };
  document.getElementById('btnSettings').onclick = () => { renderSettings(); showPage('settings'); };
  document.getElementById('libAddType').onclick = () => openTypeForm(null);
  document.getElementById('alGen').onclick = genAlbum;
  document.getElementById('setDaySave').onclick = () => {
    const s = parseInt(document.getElementById('setDayStart').value);
    const e = parseInt(document.getElementById('setDayEnd').value);
    if(isNaN(s) || isNaN(e) || s < 0 || s > 23 || e < 0 || e > 23) return toast('请输入 0–23 的小时数');
    if(s === e) return toast('开始和结束不能相同');
    DB.meta.dayStart = s;
    DB.meta.dayEnd = e;
    save();
    applyBG();
    toast('已保存');
  };
  document.getElementById('btnExport').onclick = exportBackup;
  document.getElementById('btnMergeImport').onclick = () => document.getElementById('mergeFile').click();
  document.getElementById('mergeFile').onchange = e => {
    if(e.target.files[0]) importSyncMerge(e.target.files[0]);
    e.target.value = '';
  };
  document.getElementById('btnImport').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = e => {
    if(e.target.files[0]) importBackup(e.target.files[0]);
    e.target.value = '';
  };
  document.getElementById('btnClear').onclick = () => {
    confirmBox('将删除全部记录、事件和照片，且无法恢复。确定继续？', () => {
      confirmBox('再次确认：真的要清空所有数据吗？', async () => {
        DB = defaultData();
        save();
        await Photos.clear();
        thumbUrls.clear();
        location.reload();
      }, '清空');
    }, '继续');
  };
  document.querySelectorAll('.back-btn').forEach(b => {
    b.onclick = () => {
      const back = b.dataset.back;
      showPage(back);
      if(back === 'records') renderRecords();
      if(back === 'home') renderHome();
    };
  });
})();
