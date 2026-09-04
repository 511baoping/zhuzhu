'use strict';
/* ================= 工具 ================= */
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
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
      const badge = r.doubled ? '<span class="badge">加倍×2</span>' : '';
      const ph = (r.photoIds && r.photoIds.length) ? `<span class="ph">📷×${r.photoIds.length}</span>` : '';
      return `<div class="recRow" data-id="${r.id}">
        <span class="ev">${esc(r.typeName)} · ${esc(r.eventName)}${badge}</span>
        ${ph}<span class="sc ${r.score > 0 ? 'plus' : 'minus'}">${r.score > 0 ? '+' : ''}${r.score}</span>
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
  const st = {
    typeId: rec ? rec.typeId : (DB.types.length ? DB.types[0].id : null),
    eventId: rec ? rec.eventId : null,
    custom: rec ? !evNow : (DB.types.length === 0),
    customName: rec && !evNow ? rec.eventName : '',
    customScore: rec && !evNow ? rec.score : 0,
    doubled: rec ? !!rec.doubled : false,
    photoIds: rec ? [...(rec.photoIds || [])] : [],
    newPhotoBlobs: [],   // {id, blob} 未入库的新照片
    removedPhotoIds: []  // 点保存时才真正删除
  };
  if(st.custom && !rec) st.typeId = null;

  openModal(`<div class="sheet">
    <h4>${editing ? '编辑记录' : '＋ 记一笔'}</h4>
    <label>日期（可补录）</label>
    <input type="date" id="rpDate" value="${rec ? rec.date : dateStr()}">
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

  function renderTypes(){
    const box = document.getElementById('rpTypes');
    box.innerHTML = DB.types.map(t =>
      `<button class="chip ${!st.custom && st.typeId === t.id ? 'on' : ''}" data-tid="${t.id}">${esc(t.name)}</button>`
    ).join('') + `<button class="chip ${st.custom ? 'on' : ''}" id="rpCustom">自定义</button>`;
    box.querySelectorAll('[data-tid]').forEach(b => {
      b.onclick = () => { st.custom = false; st.typeId = b.dataset.tid; st.eventId = null; renderTypes(); renderEvents(); };
    });
    document.getElementById('rpCustom').onclick = () => { st.custom = true; st.typeId = null; st.eventId = null; renderTypes(); renderEvents(); };
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
          b.onclick = () => { st.eventId = b.dataset.eid; renderEvents(); };
        });
      }
    }
    renderTrack();
  }

  function renderTrack(){
    const box = document.getElementById('rpTrack');
    const ev = st.custom ? null : evOf();
    if(!ev){
      box.innerHTML = '';
      return;
    }
    const cnt = occCount(ev.id) + (editing ? 0 : 1);
    const base = ev.score;
    const final = base * (st.doubled ? 2 : 1);
    let html = `<div class="switchRow">
      <span>本次记分：<b style="color:${final > 0 ? 'var(--plus)' : 'var(--minus)'}">${final > 0 ? '+' : ''}${final}</b>
        ${st.doubled ? '<span class="badge">加倍×2</span>' : ''}</span>
      <span class="switch"><label style="display:block;cursor:pointer"><input type="checkbox" id="rpDouble" ${st.doubled ? 'checked' : ''}><i></i></label></span>
    </div>`;
    if(ev.tracked){
      html = `<div class="trackNote">「${esc(ev.name)}」这是<b>第 ${cnt} 次</b>发生
        <a id="rpHist">查看全部历史</a><br>勾选右侧开关可<b>加倍${base > 0 ? '加分' : '扣分'}</b>（${base} → ${base * 2}）</div>` + html;
    }
    box.innerHTML = html;
    const d = document.getElementById('rpDouble');
    if(d) d.onchange = () => { st.doubled = d.checked; renderTrack(); };
    const h = document.getElementById('rpHist');
    if(h) h.onclick = () => openEventHistory(ev.id);
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
    let typeName, eventName, score;
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
      score = ev.score * (st.doubled ? 2 : 1);
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
      rec.doubled = st.doubled; rec.score = score;
      rec.photoIds = photoIds.slice(0,3);
    } else {
      DB.records.push({
        id: uid(), date, note,
        typeId: st.typeId, typeName, eventId: st.eventId, eventName,
        doubled: st.doubled, score, photoIds: photoIds.slice(0,3), at: Date.now()
      });
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
        <span class="nm">${r.doubled ? '<span class="badge">加倍×2</span> ' : ''}${esc(r.note || '')}</span>
        <span class="sc ${r.score > 0 ? 'plus' : 'minus'}">${r.score > 0 ? '+' : ''}${r.score}</span>
      </div>`).join('') || '<p style="color:#8f86ad;text-align:center">暂无记录</p>'}
    </div>
    <div class="sheetBtns"><button class="btn-primary" id="hClose">关闭</button></div>
  </div>`);
  document.getElementById('hClose').onclick = closeTopModal;
}

/* ================= 事件库 ================= */
function renderLibrary(){
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
        <span class="nm">${esc(r.typeName)} · ${esc(r.eventName)}${r.doubled ? ' <span class="badge">加倍×2</span>' : ''}</span>
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
        ph += `<div class="ppRow"><span>${esc(r.typeName)} · ${esc(r.eventName)}${r.doubled ? '（加倍×2）' : ''}</span><span style="margin-left:auto">${r.score > 0 ? '+' : ''}${r.score}</span>${r.note ? `<span class="ppNote">备注：${esc(r.note)}</span>` : ''}${imgs}</div>`;
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

/* ================= 事件绑定 ================= */
(function init(){
  document.getElementById('fab').onclick = () => openRecPanel(null);
  document.getElementById('mnPrev').onclick = () => { viewYM.m--; if(viewYM.m < 1){ viewYM.m = 12; viewYM.y--; } renderRecords(); };
  document.getElementById('mnNext').onclick = () => { viewYM.m++; if(viewYM.m > 12){ viewYM.m = 1; viewYM.y++; } renderRecords(); };
  document.getElementById('mnLabel').onclick = openMonthPicker;
  document.getElementById('mnToday').onclick = () => { navNow(); renderRecords(); };
  document.getElementById('btnHome').onclick = () => { showPage('home'); renderHome(); };
  document.getElementById('btnLibrary').onclick = () => { renderLibrary(); showPage('library'); };
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
