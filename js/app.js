/* หน้าจอหลักของโปรแกรมจัดตารางสอน */
(function () {
  'use strict';
  const TT = window.TT;
  const { buildGrid, esc } = window.TTGrid;
  const P = window.TTPrint;
  const STORE_KEY = 'timetable.v1';

  let state = load();
  const ui = {
    tab: 'home',
    dataTab: isEmpty() ? 'school' : 'groups',
    dataFilter: '',
    assignTeacher: '',
    view: 'teacher',
    viewId: '',
    cal: 'week',
    termPick: null,
    termSel: null,
    listFilter: '',
    mode: 'place',
    selected: null,
    showConflicts: false,
    lastUnplaced: [],
    printType: 'teacher',
    printId: '',
    printDept: '',
    printDetail: true,
  };

  /* ------------------------------ บันทึก / โหลด ------------------------------ */

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return TT.normalizeState(JSON.parse(raw));
    } catch (e) { /* ข้อมูลเสียหรือเปิดใน private mode */ }
    return TT.emptyState();
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('บันทึกในเบราว์เซอร์ไม่สำเร็จ กรุณากด "บันทึกไฟล์สำรอง" เก็บไว้', true);
    }
  }

  function commit() {
    syncTeacherActivities();
    TT.syncAdvisors(state);
    TT.sanitizePlacements(state);
    save();
    render();
  }

  /** รายวิชาสำเร็จรูป (เช่น รายวิชา 2/2568) ที่ยังไม่มีในข้อมูล */
  function catalogMissing() {
    const have = new Set(state.subjects.map((x) => norm(x.code)));
    return (window.TTCatalogs || []).map((c, i) => {
      const rows = TT.parseSubjectRows(c.text);
      return { i, name: c.name, total: rows.length, missing: rows.filter((r) => !have.has(r.code)) };
    });
  }

  function addCatalog(i) {
    const c = (window.TTCatalogs || [])[i];
    if (!c) return;
    const r = TT.addSubjects(state, c.text);
    commit();
    toast('เพิ่ม' + c.name + ' เข้าคลังรายวิชา ' + r.added + ' วิชา' + (r.existing ? ' · มีอยู่แล้ว ' + r.existing + ' วิชา' : '') + ' · มอบให้ครูได้ที่การ์ดครู → "+ เพิ่มวิชาให้ครูคนนี้"');
  }

  /** กิจกรรมของครู (PLC) ที่สร้างแล้ว: เพิ่ม/ลบตามรายชื่อครูให้อัตโนมัติ */
  function syncTeacherActivities() {
    for (const r of state.settings.recurring) {
      if (r.scope !== 'teacher' || !state.assignments.some((a) => a.recurringId === r.id)) continue;
      const ex = new Set(r.exclude || []);
      const have = new Set(state.assignments.filter((a) => a.recurringId === r.id).map((a) => a.teacherId));
      const want = state.teachers.filter((t) => !ex.has(t.id)).map((t) => t.id);
      if (want.length !== have.size || want.some((id) => !have.has(id))) TT.applyRecurring(state, r.id);
    }
  }

  function isEmpty() {
    return !state.teachers.length && !state.groups.length && !state.subjects.length && !state.assignments.length;
  }

  function toast(msg, bad) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (el.className = ''), 4000);
  }

  const ASK_ICON = {
    warn: '<svg viewBox="0 0 24 24"><path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>',
    danger: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>',
  };

  /**
   * กล่องถาม/แจ้งเตือนแบบป๊อปอัป (แทน confirm/alert ของเบราว์เซอร์)
   * ask({ tone: 'warn'|'danger'|'info', title, msg, items: [], q, ok, cancel }) → Promise<true|false>
   * cancel: false = มีแค่ปุ่มตกลง (ใช้แจ้งเตือน)
   */
  function ask(o) {
    const dlg = $('#dlg-ask');
    const tone = o.tone || 'warn';
    dlg.className = 'ask no-print ' + tone;
    $('.ask-ic', dlg).innerHTML = ASK_ICON[tone] || ASK_ICON.info;
    $('#ask-title').textContent = o.title || '';
    const msg = $('.ask-msg', dlg);
    msg.textContent = o.msg || '';
    msg.hidden = !o.msg;
    const list = $('.ask-list', dlg);
    list.innerHTML = (o.items || []).map((t) => typeof t === 'string' ? '<li>' + esc(t) + '</li>'
      : '<li>' + esc(t.text) + (t.sub ? '<small>' + esc(t.sub) + '</small>' : '') + '</li>').join('');
    list.hidden = !(o.items || []).length;
    const q = $('.ask-q', dlg);
    q.textContent = o.q || '';
    q.hidden = !o.q;
    const okB = $('.ask-ok', dlg);
    const noB = $('.ask-cancel', dlg);
    okB.textContent = o.ok || 'ตกลง';
    okB.className = 'btn ask-ok ' + (tone === 'danger' ? 'solid-bad' : 'primary');
    noB.textContent = o.cancel || 'ยกเลิก';
    noB.hidden = o.cancel === false;
    return new Promise((resolve) => {
      const done = (v) => {
        okB.onclick = noB.onclick = dlg.onclick = dlg.oncancel = null;
        if (dlg.open) dlg.close();
        resolve(v);
      };
      okB.onclick = () => done(true);
      noB.onclick = () => done(false);
      dlg.oncancel = (e) => { e.preventDefault(); done(false); };
      dlg.onclick = (e) => { if (e.target === dlg) done(false); }; // คลิกนอกกล่อง = ยกเลิก
      dlg.showModal();
      (o.cancel === false || tone !== 'danger' ? okB : noB).focus();
    });
  }

  /**
   * รวมข้อความชนกันที่เหมือนกันของหลายคน/หลายกลุ่ม
   * "ครู ก: ซ้อนกับ X" + "กลุ่มเรียน ข: ซ้อนกับ X" → { text: 'ซ้อนกับ X', sub: 'ครู ก · กลุ่มเรียน ข' }
   */
  function groupReasons(reasons) {
    const m = new Map();
    for (const r of reasons) {
      const i = r.indexOf(': ');
      const who = i > 0 ? r.slice(0, i) : '';
      const what = i > 0 ? r.slice(i + 2) : r;
      if (!m.has(what)) m.set(what, []);
      if (who && !m.get(what).includes(who)) m.get(what).push(who);
    }
    return [...m].map(([text, who]) => ({ text, sub: who.join(' · ') }));
  }

  function badBox(msgs) {
    return '<div class="bad-box"><b class="bad-h">' + ICON.info + 'ชนกันตรงนี้</b>' + groupReasons([...msgs]).map((r) =>
      '<div class="bad-i">' + esc(r.text) + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</div>').join('') + '</div>';
  }

  function conflictAsk(reasons, verb) {
    return ask({
      tone: 'warn',
      title: 'ช่วงเวลานี้ชนกัน',
      items: groupReasons(reasons),
      q: 'ต้องการ' + verb + 'ไว้ตรงนี้ทั้งที่ชนกันไหม?',
      ok: verb + 'ต่อ',
      cancel: 'ไม่' + verb,
    });
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function exportBackup() {
    download('ตารางสอน-' + state.settings.semester + '-' + state.settings.year + '.json', JSON.stringify(state, null, 1));
  }

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const options = (list, value, labelFn, empty) =>
    (empty != null ? '<option value="">' + esc(empty) + '</option>' : '') +
    list.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === value ? ' selected' : '') + '>' + esc(labelFn(x)) + '</option>').join('');
  const simpleOptions = (list, value) => list.map((x) => {
    const [v, label] = Array.isArray(x) ? x : [x, x];
    return '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>';
  }).join('');

  const ICON = {
    lock: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    check: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4 10-10"/></svg>',
    search: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
    ban: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/></svg>',
    info: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg>',
    x: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    scissors: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8.2 8.3L19 17M8.2 15.7L19 7"/></svg>',
  };

  /* --------------------------------- เค้าโครง --------------------------------- */

  const TABS = [
    ['home', 'หน้าแรก'],
    ['data', 'ข้อมูล'],
    ['assign', 'มอบวิชาให้ครู'],
    ['schedule', 'จัดตาราง'],
    ['print', 'พิมพ์'],
  ];

  function render() {
    $('#steps').innerHTML = TABS.map(([k, label], i) =>
      '<button class="step' + (ui.tab === k ? ' active' : '') + '" data-tab="' + k + '"' + (ui.tab === k ? ' aria-current="page"' : '') + '>' +
      (i ? '<span class="num">' + i + '</span>' : '') + label + '</button>').join('');
    $$('#steps .step').forEach((b) => (b.onclick = () => go(b.dataset.tab)));
    // แจ้งเตือนสีแดงเฉพาะเมื่อมีเรื่องต้องแก้
    const errors = TT.checkData(state).filter((i) => i.level === 'error').length;
    const chk = $('#hdr-check');
    chk.hidden = !errors;
    $('#hdr-check-n').textContent = 'ต้องแก้ ' + errors + ' เรื่อง';
    chk.onclick = () => go('check');
    $('#hdr-term').textContent = 'ภาคเรียน ' + state.settings.semester + '/' + state.settings.year;

    const main = $('#main');
    const keepY = window.scrollY;
    main.className = 'tab-' + ui.tab;
    const intro = isEmpty() && !['rules', 'check', 'home'].includes(ui.tab)
      ? '<div class="notice">' + ICON.info + '<span>ยังไม่มีข้อมูล เริ่มกรอกที่ <b>ข้อมูล</b> หรือลองใช้ข้อมูลตัวอย่างก่อน</span><button class="btn small" id="load-sample">โหลดข้อมูลตัวอย่าง</button></div>'
      : '';
    const fn = { home: renderHome, data: renderData, assign: renderAssign, schedule: renderSchedule, print: renderPrint, rules: renderRules, check: renderCheck }[ui.tab];
    main.innerHTML = intro + '<div id="view"></div>';
    fn($('#view'));
    const ls = $('#load-sample');
    if (ls) ls.onclick = loadSample;
    // วาดใหม่แล้วให้อยู่ตำแหน่งเดิม (เช่น กำลังทำสัปดาห์ที่ 10 จะไม่เด้งกลับขึ้นบน)
    if (window.scrollY !== keepY) window.scrollTo(0, keepY);
  }

  function go(tab) {
    ui.tab = tab;
    ui.selected = null;
    render();
    window.scrollTo(0, 0);
  }

  /* --------------------------------- หน้าแรก --------------------------------- */

  /** ใช้แผนการเรียนที่เตรียมไว้ (เช่น แผนกคอม 2/2569) */
  function usePreparedPlan(i) {
    const plan = (window.TTPlans || [])[i];
    if (!plan) return;
    const res = TT.importStudyPlan(state, plan.text, { mergeSections: true, activity: { day: openDays().includes('พุธ') ? 'พุธ' : openDays()[0], start: 2 } });
    ui.assignTeacher = '';
    commit();
    toast('ใส่ ' + plan.name + ' แล้ว · รายวิชา ' + state.subjects.length + ' · รอมอบให้ครู ' + state.assignments.filter((a) => !a.teacherId).length + ' วิชา');
  }

  function renderHome(el) {
    const s = state.settings;
    const blocks = TT.allBlocks(state);
    const placedH = blocks.filter((b) => b.placement).reduce((n, b) => n + b.len, 0);
    const totalH = blocks.reduce((n, b) => n + b.len, 0);
    const unassigned = state.assignments.filter((a) => !a.teacherId).length;
    const terms = state.assignments.filter(TT.isTerm).map((a) => TT.termStatus(state, a));
    const termLeft = terms.reduce((n, x) => n + x.remaining, 0);
    const conflicts = TT.findConflicts(state).list.length;
    const recPending = s.recurring.filter((r) => !state.assignments.some((a) => a.recurringId === r.id) &&
      (r.scope === 'teacher' ? state.teachers.length : state.groups.length));
    const done1 = state.groups.length && state.subjects.length && state.teachers.length;
    const done2 = done1 && state.assignments.length && !unassigned;
    const done3 = done2 && totalH && placedH >= totalH && !termLeft && !conflicts;
    const current = !done1 ? 1 : !done2 ? 2 : !done3 ? 3 : 4;
    const plans = window.TTPlans || [];
    const step = (n, done, title, status, actions) =>
      '<section class="hstep' + (done ? ' done' : '') + (current === n ? ' current' : '') + '">' +
      '<div class="hnum">' + (done ? ICON.check : n) + '</div>' +
      '<div class="hbody"><h2>' + title + (current === n ? ' <span class="badge on">ทำขั้นนี้ต่อ</span>' : '') + '</h2><p>' + status + '</p>' +
      '<div class="btns">' + actions + '</div></div></section>';

    el.innerHTML =
      '<div class="page-head"><h1>จัดตารางสอน ภาคเรียนที่ ' + esc(s.semester) + '/' + esc(s.year) + '</h1><p>ทำตามขั้นตอนทีละขั้น ระบบบอกว่าทำถึงไหนแล้ว</p></div>' +
      '<div class="home">' +
      step(1, done1, 'ใส่ข้อมูล',
        'กลุ่มเรียน <b>' + state.groups.length + '</b> · รายวิชา <b>' + state.subjects.length + '</b> · ครู <b>' + state.teachers.length + '</b>' +
          (!state.teachers.length && state.subjects.length ? ' — <span class="warn">ยังไม่มีรายชื่อครู</span>' : ''),
        plans.map((p, i) => '<button class="btn' + (state.subjects.length ? '' : ' primary') + '" data-plan="' + i + '">ใช้' + esc(p.name) + '</button>').join('') +
        '<button class="btn" id="h-import">นำเข้าแผนการเรียนอื่น</button>' +
        catalogMissing().filter((c) => c.missing.length).map((c) => '<button class="btn" data-catalog="' + c.i + '" title="เพิ่มเฉพาะรหัสที่ยังไม่มี ไม่ทับของเดิม">เพิ่ม' + esc(c.name) + ' (' + c.missing.length + ' วิชา)</button>').join('') +
        '<button class="btn' + (state.subjects.length && !state.teachers.length ? ' primary' : '') + '" id="h-teachers">ใส่รายชื่อครู</button>' +
        (isEmpty() ? '<button class="btn ghost" id="h-sample">ลองข้อมูลตัวอย่าง</button>' : '')) +
      step(2, done2, 'มอบวิชาให้ครู',
        state.assignments.length
          ? 'มอบแล้ว <b>' + (state.assignments.length - unassigned) + '/' + state.assignments.length + '</b> วิชา' + (unassigned ? ' · ยังไม่มีครู <b class="warn">' + unassigned + '</b> วิชา' : ' · ครบแล้ว')
          : 'ยังไม่มีรายวิชาให้มอบ (ทำขั้นที่ 1 ก่อน)',
        '<button class="btn' + (current === 2 ? ' primary' : '') + '" data-go="assign">มอบวิชาให้ครู →</button>' +
        (recPending.length ? '<button class="btn" id="h-hr">สร้าง ' + recPending.map((r) => esc(r.title) + ' (' + esc(r.day) + ' คาบ ' + r.start + ')').join(' และ ') + '</button>' : '')) +
      step(3, done3, 'จัดตาราง',
        totalH ? 'ตารางรายสัปดาห์ จัดแล้ว <b>' + placedH + '/' + totalH + '</b> ชม.' + (terms.length ? ' · ตารางทั้งเทอม ' + (termLeft ? 'เหลือ <b>' + termLeft + '</b> ชม.' : 'ครบ') : '') +
          (conflicts ? ' · <span class="warn">ชนกัน ' + conflicts + ' จุด</span>' : '') : 'ยังไม่มีวิชาให้จัด',
        '<button class="btn' + (current === 3 ? ' primary' : '') + '" id="h-auto"' + (totalH > placedH ? '' : ' disabled') + '>จัดอัตโนมัติทั้งหมด</button>' +
        '<button class="btn" data-go="schedule">เปิดหน้าจัดตาราง →</button>') +
      step(4, false, 'พิมพ์', 'ตารางสอนรายครู · ตารางเรียนรายกลุ่ม · บันทึกเป็น PDF ได้',
        '<button class="btn' + (current === 4 ? ' primary' : '') + '" data-go="print">ไปหน้าพิมพ์ →</button>') +
      '</div>' +
      '<p class="hint home-foot">วันห้ามจัด · Home Room · สัปดาห์ ปวช./ปวส. · เวลาเรียน ตั้งได้ที่ปุ่ม <b>ตั้งค่า</b> มุมขวาบน</p>';

    $$('[data-plan]', el).forEach((b) => (b.onclick = () => usePreparedPlan(Number(b.dataset.plan))));
    $$('[data-catalog]', el).forEach((b) => (b.onclick = () => addCatalog(Number(b.dataset.catalog))));
    $$('[data-go]', el).forEach((b) => (b.onclick = () => go(b.dataset.go)));
    const on = (id, fn) => { const b = $(id, el); if (b) b.onclick = fn; };
    on('#h-import', openPlanImport);
    on('#h-teachers', () => { ui.dataTab = 'teachers'; ui.dataFilter = ''; go('data'); });
    on('#h-sample', loadSample);
    on('#h-hr', () => {
      const msgs = [];
      for (const rec of recPending) {
        const r = TT.applyRecurring(state, rec.id);
        if (r.error) { toast(rec.title + ': ' + r.error, true); return; }
        msgs.push(rec.scope === 'teacher' ? rec.title + ' ครู ' + r.teachers + ' คน' : rec.title + ' ' + r.groups + ' กลุ่ม (มีครู ' + r.withTeacher + ')');
      }
      commit();
      toast('สร้าง ' + msgs.join(' · '));
    });
    on('#h-auto', () => {
      const res = TT.autoSchedule(state, { timeLimit: 4000 });
      state.placements.push(...res.placements);
      ui.lastUnplaced = res.unplaced;
      commit();
      toast(res.complete ? 'จัดครบทั้งหมด ' + res.placements.length + ' ก้อน' : 'วางได้ ' + res.placements.length + ' ก้อน · วางไม่ได้ ' + res.unplaced.length + ' ก้อน', !res.complete);
    });
  }

  async function loadSample() {
    if (!isEmpty() && !(await ask({ title: 'ใช้ข้อมูลตัวอย่าง?', msg: 'ข้อมูลปัจจุบันจะถูกแทนที่ด้วยข้อมูลตัวอย่าง', ok: 'แทนที่' }))) return;
    state = TT.normalizeState(window.TTSample.sampleState(TT));
    ui.viewId = '';
    ui.tab = 'home';
    commit();
    toast('โหลดข้อมูลตัวอย่างแล้ว');
  }

  /* ------------------------------- ตรวจสอบ ------------------------------- */

  const ISSUE_LABEL = {
    'dup-group': 'กลุ่มเรียนซ้ำ',
    'dup-subject': 'ลงวิชาซ้ำ',
    'group-clash': 'เรียนซ้อนเวลา',
    'group-overload': 'ชั่วโมงเกิน',
    'no-group': 'ไม่มีกลุ่มเรียน',
    'dup-teacher': 'ชื่อครูซ้ำ',
    'dup-subjectcode': 'รหัสวิชาซ้ำ',
  };

  function renderCheck(el) {
    const issues = TT.checkData(state);
    const idx = TT.indexState(state);
    const errors = issues.filter((i) => i.level === 'error');
    const warns = issues.filter((i) => i.level === 'warn');
    const usage = (gid) => state.assignments.filter((a) => a.groupIds.includes(gid)).length;
    const card = (i, n) => {
      let actions = '';
      if (i.type === 'dup-group') {
        actions = '<div class="dup-list">' + i.groupIds.map((gid) => {
          const g = idx.groups.get(gid);
          return '<div class="dup-row"><span class="grow"><b>' + esc(g.name) + '</b><small>รหัส ' + esc(g.code) + (g.level ? ' · ' + esc(g.level) : '') +
            (g.advisor ? ' · ที่ปรึกษา ' + esc(g.advisor) : '') + ' · ใช้ใน ' + usage(gid) + ' รายการ</small></span>' +
            '<button class="btn small" data-keep="' + esc(gid) + '" data-issue="' + n + '">เก็บอันนี้ รวมที่เหลือเข้ามา</button></div>';
        }).join('') + '</div>';
      } else if (i.groupIds && i.groupIds.length) {
        actions = '<div class="btns"><button class="btn small" data-see-group="' + esc(i.groupIds[0]) + '">ดูตารางกลุ่มเรียน →</button>' +
          (i.teacherId ? '<button class="btn small ghost" data-see-teacher="' + esc(i.teacherId) + '">ไปที่ภาระงานของครู →</button>' : '') + '</div>';
      } else if (i.teacherId || i.type === 'no-group') {
        actions = '<div class="btns"><button class="btn small" data-see-teacher="' + esc(i.teacherId || '__none') + '">ไปแก้ที่ภาระงานสอน →</button></div>';
      } else if (i.type === 'dup-teacher' || i.type === 'dup-subjectcode') {
        actions = '<div class="btns"><button class="btn small" data-see-data="' + (i.type === 'dup-teacher' ? 'teachers' : 'subjects') + '">ไปแก้ที่ข้อมูล →</button></div>';
      }
      return '<section class="issue ' + i.level + '"><div class="issue-head"><span class="issue-tag">' + esc(ISSUE_LABEL[i.type] || i.type) + '</span>' +
        '<h3>' + esc(i.title) + '</h3></div><p>' + esc(i.detail) + '</p>' + actions + '</section>';
    };
    el.innerHTML =
      '<div class="page-head"><h1>ตรวจสอบข้อมูล</h1><p>ตรวจกลุ่มเรียนซ้ำ ลงวิชาซ้ำ เรียนซ้อนเวลา และชั่วโมงเกินเวลาที่มี — ตรวจใหม่ทุกครั้งที่แก้ข้อมูล</p></div>' +
      '<div class="stats narrow">' +
      '<div class="stat-tile ' + (errors.length ? 'bad' : 'ok') + '"><span>ต้องแก้</span><b>' + errors.length + '</b><small>เช่น กลุ่มรหัสซ้ำ เรียนซ้อนเวลา</small></div>' +
      '<div class="stat-tile ' + (warns.length ? 'warn' : 'ok') + '"><span>ควรตรวจ</span><b>' + warns.length + '</b><small>อาจตั้งใจ หรืออาจผิด</small></div>' +
      '<div class="stat-tile"><span>กลุ่มเรียน</span><b>' + state.groups.length + '</b><small>กลุ่มในระบบ</small></div></div>' +
      (issues.length ? '<div class="issues">' + issues.map(card).join('') + '</div>'
        : '<div class="card empty-state ok-state">' + ICON.check + '<b>ไม่พบปัญหา</b><span>ไม่มีกลุ่มเรียนซ้ำ ไม่มีวิชาซ้ำ และไม่มีกลุ่มเรียนซ้อนเวลา</span></div>');

    $$('[data-keep]', el).forEach((b) => (b.onclick = async () => {
      const i = issues[Number(b.dataset.issue)];
      const keep = b.dataset.keep;
      const others = i.groupIds.filter((g) => g !== keep);
      const names = others.map((g) => (idx.groups.get(g) || {}).name).join(', ');
      if (!(await ask({ title: 'รวมกลุ่มเรียนซ้ำ?', msg: 'รวม "' + names + '" เข้ากับ "' + idx.groups.get(keep).name + '" รายวิชาและตารางของกลุ่มที่รวมจะย้ายมาที่กลุ่มนี้ แล้วลบกลุ่มที่ซ้ำออก', ok: 'รวมกลุ่ม' }))) return;
      others.forEach((g) => TT.mergeGroups(state, keep, g));
      commit();
      toast('รวมกลุ่มเรียนแล้ว');
    }));
    $$('[data-see-group]', el).forEach((b) => (b.onclick = () => { ui.view = 'group'; ui.viewId = b.dataset.seeGroup; ui.listFilter = ''; go('schedule'); }));
    $$('[data-see-teacher]', el).forEach((b) => (b.onclick = () => { ui.assignTeacher = b.dataset.seeTeacher; ui.listFilter = ''; go('assign'); }));
    $$('[data-see-data]', el).forEach((b) => (b.onclick = () => { ui.dataTab = b.dataset.seeData; ui.dataFilter = ''; go('data'); }));
  }

  /* ------------------------------- เงื่อนไข ------------------------------- */

  function dayMode(name) {
    const s = state.settings;
    if (!s.days.includes(name)) return 'hidden';
    return s.closedDays.includes(name) ? 'closed' : 'open';
  }

  function openDays() {
    return state.settings.days.filter((d) => !state.settings.closedDays.includes(d));
  }

  function renderRules(el) {
    const s = state.settings;
    const pers = TT.periods(s);
    const perOpts = pers.map((p) => [p.no, 'คาบ ' + p.no + ' · ' + p.start + '–' + p.end]);

    el.innerHTML =
      '<div class="page-head"><h1>เงื่อนไขการจัดตาราง</h1><p>ใช้ทั้งตอนวางคาบเองและตอนกดจัดอัตโนมัติ</p></div>' +
      '<div class="rules">' +
      '<div class="col">' +
      // วันเรียน
      '<section class="card"><div class="card-head"><div><h2>วันเรียน</h2><p>กำหนดทีละวัน ว่าเปิดสอน ห้ามจัด หรือไม่ต้องแสดง</p></div></div>' +
      '<div class="day-rows">' + TT.ALL_DAYS.map((d) => {
        const m = dayMode(d);
        return '<div class="day-row"><span>' + esc(d) + '</span><div class="seg" role="radiogroup" aria-label="' + esc(d) + '">' +
          [['open', 'เปิดสอน'], ['closed', 'ห้ามจัด'], ['hidden', 'ไม่แสดง']].map(([k, label]) =>
            '<button role="radio" aria-checked="' + (m === k) + '" class="' + (m === k ? 'active ' + k : '') + '" data-daymode="' + esc(d) + '|' + k + '">' + label + '</button>').join('') +
          '</div></div>';
      }).join('') + '</div>' +
      '<div class="tip">' + ICON.info + '<span><b>ห้ามจัด</b> ยังแสดงแถววันนั้นในใบตารางเป็นช่องว่าง เหมือนแบบฟอร์มเดิม · <b>ไม่แสดง</b> เอาแถววันนั้นออกจากใบตาราง</span></div>' +
      '</section>' +
      // โครงสร้างคาบ
      '<section class="card"><div class="card-head"><div><h2>โครงสร้างคาบ</h2><p>' + pers.length + ' คาบ · ' +
      esc((pers[0] || {}).start || '') + '–' + esc((pers[pers.length - 1] || {}).end || '') + '</p></div></div>' +
      '<div class="timeline">' + s.columns.map((c, i) => c.type === 'break'
        ? '<span class="tl-break" title="' + esc(c.label + ' ' + c.start + '–' + c.end) + '"></span>'
        : '<span class="tl-p" title="' + esc(c.start + '–' + c.end) + '">' + s.columns.slice(0, i + 1).filter((x) => x.type === 'period').length + '</span>').join('') + '</div>' +
      '<details class="cols-edit"><summary>แก้ไขเวลาและช่วงพัก</summary>' +
      '<p class="hint">ก้อนคาบคร่อมช่วงพักไม่ได้ ยกเว้นวิชาที่ติ๊ก Block Course · ควรตั้งให้เรียบร้อยก่อนเริ่มจัด เพราะการเพิ่ม/ลบคาบทำให้เลขคาบที่จัดไว้เลื่อน</p>' +
      '<table class="data"><thead><tr><th>ประเภท</th><th>คาบ / ชื่อช่วงพัก</th><th>เริ่ม</th><th>สิ้นสุด</th><th></th></tr></thead><tbody>' +
      s.columns.map((c, i) => {
        const no = c.type === 'period' ? s.columns.slice(0, i + 1).filter((x) => x.type === 'period').length : '';
        return '<tr data-col="' + i + '"><td><select data-cf="type" aria-label="ประเภท"><option value="period"' + (c.type === 'period' ? ' selected' : '') + '>คาบเรียน</option>' +
          '<option value="break"' + (c.type === 'break' ? ' selected' : '') + '>ช่วงพัก</option></select></td>' +
          '<td>' + (c.type === 'break' ? '<input data-cf="label" aria-label="ชื่อช่วงพัก" value="' + esc(c.label) + '">' : 'คาบที่ ' + no) + '</td>' +
          '<td><input type="time" data-cf="start" aria-label="เวลาเริ่ม" value="' + esc(c.start) + '"></td><td><input type="time" data-cf="end" aria-label="เวลาสิ้นสุด" value="' + esc(c.end) + '"></td>' +
          '<td class="nowrap"><button class="btn icon" data-cmove="-1" aria-label="เลื่อนขึ้น">↑</button><button class="btn icon" data-cmove="1" aria-label="เลื่อนลง">↓</button>' +
          '<button class="btn icon danger" data-cdel aria-label="ลบ">' + ICON.x + '</button></td></tr>';
      }).join('') +
      '</tbody></table><div class="btns"><button class="btn" id="col-add">+ เพิ่มคาบต่อท้าย</button><button class="btn ghost" id="col-reset">คืนค่าเริ่มต้น (13 คาบ 08:00–22:00)</button></div></details>' +
      '</section>' +
      '</div>' +
      '<div class="col">' +
      // กิจกรรมประจำ
      '<section class="card"><div class="card-head"><div><h2>กิจกรรมประจำ</h2><p>ล็อกไว้ทุกสัปดาห์ จัดอัตโนมัติจะไม่วางวิชาอื่นทับ</p></div>' +
      '<button class="btn" id="rec-add">+ เพิ่มกิจกรรม</button></div>' +
      (s.recurring.length ? s.recurring.map((r) => recurringCard(r, perOpts)).join('') : '<p class="hint">ยังไม่มีกิจกรรมประจำ</p>') +
      '</section>' +
      // ช่วงห้ามจัด
      '<section class="card"><div class="card-head"><div><h2>ช่วงเวลาห้ามจัด</h2><p>ใช้กับทุกคน เช่น ประชุมครู กิจกรรมวิทยาลัย</p></div>' +
      '<button class="btn" id="blk-add">+ เพิ่มช่วงเวลา</button></div>' +
      '<div class="blk-list">' +
      s.closedDays.filter((d) => s.days.includes(d)).map((d) =>
        '<div class="blk-row auto"><span class="hatch"></span><span class="grow"><b>ทุกวัน' + esc(d) + ' · ทั้งวัน</b><small>ตั้งจากวันเรียน</small></span></div>').join('') +
      s.blocked.map((b, i) =>
        '<div class="blk-row" data-blk="' + i + '"><span class="hatch"></span>' +
        '<input data-bf="label" placeholder="เช่น ประชุมครู" aria-label="ชื่อ" value="' + esc(b.label) + '">' +
        '<select data-bf="day" aria-label="วัน">' + simpleOptions(s.days, b.day) + '</select>' +
        '<select data-bf="from" aria-label="ตั้งแต่คาบ">' + simpleOptions(pers.map((p) => [p.no, 'คาบ ' + p.no]), b.from) + '</select>' +
        '<span class="muted">ถึง</span>' +
        '<select data-bf="to" aria-label="ถึงคาบ">' + simpleOptions(pers.map((p) => [p.no, 'คาบ ' + p.no]), b.to) + '</select>' +
        '<button class="btn icon danger" data-bdel aria-label="ลบ">' + ICON.x + '</button></div>').join('') +
      (!s.blocked.length && !s.closedDays.length ? '<p class="hint">ยังไม่มีช่วงห้ามจัด</p>' : '') +
      '</div><p class="hint">เวลาไม่ว่างของครูหรือกลุ่มเรียนแต่ละคน ตั้งได้ที่หน้าจัดตาราง → โหมด "เวลาไม่ว่าง"</p>' +
      '</section>' +
      // สัปดาห์ต่อภาคเรียน
      '<section class="card"><div class="card-head"><div><h2>สัปดาห์ต่อภาคเรียน</h2><p>ใช้คิดชั่วโมงทั้งเทอม (ชม./สัปดาห์ × สัปดาห์) และจำนวนสัปดาห์ในตารางทั้งเทอม</p></div></div>' +
      '<div class="lw-rows">' + Object.entries(s.levelWeeks).map(([k, w]) =>
        '<label class="lw-row"><b>' + esc(k) + '</b><input type="number" min="1" max="40" data-lw="' + esc(k) + '" value="' + w + '"> สัปดาห์' +
        '<small>เช่น 4 ชม./สัปดาห์ × ' + w + ' = ' + 4 * w + ' ชม.</small></label>').join('') + '</div>' +
      '<p class="hint">ระดับของกลุ่มดูจากช่อง "ระดับชั้น" (ปวช./ปวส.) ถ้าไม่มี ใช้หลักที่ 3 ของรหัสกลุ่ม: 2 = ปวช. (เช่น 692190101), 3 = ปวส. (เช่น 693190501) · ปวส. จบที่สัปดาห์ที่ ' + (s.levelWeeks['ปวส.'] || '') + ' วางตารางทั้งเทอมหลังจากนั้นไม่ได้</p>' +
      '</section>' +
      // ห้องเรียน
      '<section class="card"><div class="card-head"><div><h2>ห้องเรียน</h2><p>ตรวจชนเฉพาะครูและกลุ่มเรียนเสมอ ส่วนห้องเลือกได้</p></div></div>' +
      '<label class="switch-row"><input type="checkbox" id="chk-rooms"' + (s.checkRooms ? ' checked' : '') + '>' +
      '<span><b>ตรวจห้องเรียนชนกัน</b><small>ปิดไว้ = ใช้ห้องเดียวกันพร้อมกันได้ (ค่าเริ่มต้น) · เปิด = ห้องเดียวกันเวลาเดียวกันจะแจ้งว่าชน ยกเว้นห้องที่ตั้ง "ใช้พร้อมกันได้"</small></span></label>' +
      '</section>' +
      '</div></div>';

    // วันเรียน
    $$('[data-daymode]', el).forEach((b) => (b.onclick = () => {
      const [d, m] = b.dataset.daymode.split('|');
      setDayMode(d, m);
    }));
    // โครงสร้างคาบ
    bindColumns(el);
    // กิจกรรมประจำ
    $('#rec-add', el).onclick = () => {
      s.recurring.push({ id: TT.uid('rec'), title: 'กิจกรรม', day: openDays()[0] || s.days[0], start: 1, len: 1 });
      commit();
    };
    $$('[data-rec]', el).forEach((box) => {
      const r = s.recurring.find((x) => x.id === box.dataset.rec);
      const generated = () => state.assignments.some((a) => a.recurringId === r.id);
      $$('[data-rf]', box).forEach((inp) => (inp.onchange = () => {
        const k = inp.dataset.rf;
        r[k] = k === 'start' || k === 'len' ? Number(inp.value) : inp.value.trim();
        if (generated()) {
          const res = TT.applyRecurring(state, r.id);
          if (res.error) toast(res.error, true);
        }
        commit();
      }));
      $('[data-rgo]', box).onclick = () => {
        const res = TT.applyRecurring(state, r.id);
        if (res.error) { toast(res.error, true); return; }
        commit();
        toast(r.scope === 'teacher' ? r.title + ' ครู ' + res.teachers + ' คน' + (res.excluded ? ' (ติ๊กออก ' + res.excluded + ')' : '')
          : r.title + ' ครบ ' + res.groups + ' กลุ่ม · มีครู ' + res.withTeacher + ' กลุ่ม · ว่าง ' + (res.groups - res.withTeacher) + ' กลุ่ม');
      };
      $$('[data-rt]', box).forEach((cb) => (cb.onchange = () => {
        const ex = new Set(r.exclude || []);
        if (cb.checked) ex.delete(cb.dataset.rt); else ex.add(cb.dataset.rt);
        r.exclude = [...ex];
        if (generated()) TT.applyRecurring(state, r.id);
        ui.recOpen = r.id;
        commit();
      }));
      const who = $('.rec-who', box);
      if (who && ui.recOpen === r.id) who.open = true;
      $('[data-rdel]', box).onclick = async () => {
        const n = state.assignments.filter((a) => a.recurringId === r.id).length;
        if (!(await ask({ tone: 'danger', title: 'ลบกิจกรรม "' + r.title + '"?', msg: n ? 'ภาระงานที่สร้างไว้ ' + n + ' รายการจะถูกลบด้วย' : '', ok: 'ลบ' }))) return;
        TT.removeRecurring(state, r.id);
        commit();
      };
      $$('[data-adv]', box).forEach((sel) => (sel.onchange = async () => {
        ui.recOpen = r.id;
        if (!(await chooseAdvisor(sel.dataset.adv, sel.value))) { render(); return; }
        commit();
        const g = state.groups.find((x) => x.id === sel.dataset.adv) || {};
        const t = state.teachers.find((x) => x.id === sel.value);
        toast(t ? (g.name || g.code) + ' → ' + t.name : (g.name || g.code) + ' ยังไม่มีครู');
      }));
    });
    $$('[data-lw]', el).forEach((inp) => (inp.onchange = () => {
      const n = Math.max(1, Math.min(40, Math.round(Number(inp.value) || 18)));
      const before = state.sessions.length;
      s.levelWeeks[inp.dataset.lw] = n;
      s.weeks = Math.max(...Object.values(s.levelWeeks));
      commit();
      const lost = before - state.sessions.length;
      toast(inp.dataset.lw + ' เรียน ' + n + ' สัปดาห์' + (lost ? ' · เอาวันที่วางเกินสัปดาห์ที่ ' + n + ' ออก ' + lost + ' วัน' : ''));
    }));
    $('#chk-rooms', el).onchange = (e) => { s.checkRooms = e.target.checked; commit(); toast(s.checkRooms ? 'เปิดตรวจห้องเรียนชนกันแล้ว' : 'ปิดตรวจห้องเรียนชนกันแล้ว'); };
    // ช่วงห้ามจัด
    $('#blk-add', el).onclick = () => {
      s.blocked.push({ id: TT.uid('b'), label: '', day: openDays()[0] || s.days[0], from: 1, to: 1 });
      commit();
    };
    $$('[data-blk]', el).forEach((row) => {
      const b = s.blocked[Number(row.dataset.blk)];
      $$('[data-bf]', row).forEach((inp) => (inp.onchange = () => {
        const k = inp.dataset.bf;
        b[k] = k === 'from' || k === 'to' ? Number(inp.value) : inp.value.trim();
        if (b.to < b.from) b.to = b.from;
        commit();
      }));
      $('[data-bdel]', row).onclick = () => { s.blocked.splice(Number(row.dataset.blk), 1); commit(); };
    });
  }

  function recurringCard(r, perOpts) {
    if (r.scope === 'teacher') return teacherActivityCard(r, perOpts);
    const s = state.settings;
    const mine = state.assignments.filter((a) => a.recurringId === r.id);
    const blank = mine.filter((a) => !a.teacherId);
    const dayChoices = openDays().includes(r.day) ? openDays() : [r.day, ...openDays()];
    let status;
    if (mine.length) {
      const blankNames = blank.map((a) => (state.groups.find((g) => g.id === a.groupIds[0]) || {}).name).filter(Boolean);
      status = '<li class="ok">' + ICON.check + '<span>สร้างแล้ว ' + mine.length + ' กลุ่มเรียน · มีครูแล้ว ' + (mine.length - blank.length) + ' กลุ่ม</span></li>' +
        (blank.length
          ? '<li class="warn">' + ICON.info + '<span>ยังไม่มีครู ' + blank.length + ' กลุ่ม: ' + esc(blankNames.slice(0, 6).join(', ')) + (blankNames.length > 6 ? ' …' : '') +
            ' — เลือกได้ในตารางด้านล่าง</span></li>'
          : '');
    } else {
      const clone = JSON.parse(JSON.stringify(state));
      const res = TT.applyRecurring(clone, r.id);
      status = res.error
        ? '<li class="warn">' + ICON.info + '<span>' + esc(res.error) + '</span></li>'
        : '<li>' + ICON.check + '<span>จะสร้างให้ ' + res.groups + ' กลุ่มเรียน ผู้สอนคือครูที่ปรึกษา (ครู 1 คน : 1 กลุ่ม)</span></li>' +
          '<li>' + ICON.check + '<span>มีครู ' + res.withTeacher + ' กลุ่ม · เว้นว่าง ' + (res.groups - res.withTeacher) + ' กลุ่ม' +
          (res.duplicate ? ' (ครูได้กลุ่มอื่นแล้ว ' + res.duplicate + ')' : '') +
          (res.notFound ? ' (ไม่พบชื่อในรายชื่อครู ' + res.notFound + ')' : '') +
          (res.noAdvisor ? ' (ไม่มีชื่อครูที่ปรึกษา ' + res.noAdvisor + ')' : '') + '</span></li>' +
          '<li>' + ICON.check + '<span>นับเป็นภาระงานสอนของครู ' + (Number(r.len) || 1) + ' ชม./สัปดาห์</span></li>';
    }
    return '<div class="rec" data-rec="' + esc(r.id) + '">' +
      '<div class="rec-head">' + ICON.lock + '<input data-rf="title" aria-label="ชื่อกิจกรรม" value="' + esc(r.title) + '">' +
      (mine.length ? '<span class="badge on">ใช้งานอยู่</span>' : '<span class="badge">ยังไม่ได้สร้าง</span>') +
      '<button class="btn icon danger" data-rdel aria-label="ลบกิจกรรม">' + ICON.x + '</button></div>' +
      '<div class="rec-fields">' +
      '<label>วัน<select data-rf="day">' + simpleOptions(dayChoices.map((d) => [d, 'ทุกวัน' + d]), r.day) + '</select></label>' +
      '<label>เริ่ม<select data-rf="start">' + simpleOptions(perOpts, r.start) + '</select></label>' +
      '<label>จำนวนคาบ<select data-rf="len">' + simpleOptions([1, 2, 3, 4].map((n) => [n, n + ' คาบ']), r.len) + '</select></label>' +
      '<label>กลุ่มเรียน<select disabled><option>ทุกกลุ่ม (' + state.groups.length + ')</option></select></label>' +
      '</div>' +
      '<ul class="rec-status">' + status + '</ul>' +
      (mine.length ? advisorTable(r, mine, blank.length) : '') +
      '<button class="btn primary block" data-rgo>' + (mine.length ? 'อัปเดต' : 'สร้าง') + ' ' + esc(r.title) + ' ให้ทุกกลุ่ม</button>' +
      '</div>';
  }

  /** ตารางเลือกครูที่ปรึกษา (ผู้สอน Home Room) รายกลุ่ม */
  function advisorTable(r, mine, blankCount) {
    const byGroup = new Map(mine.map((a) => [(a.groupIds || [])[0], a]));
    const count = new Map();
    mine.forEach((a) => { if (a.teacherId) count.set(a.teacherId, (count.get(a.teacherId) || 0) + 1); });
    const sorted = sortGroups(state.groups.filter((g) => byGroup.has(g.id)));
    let cur = null;
    let alt = false;
    const rows = sorted.map(({ g, grade, dept }) => {
      let head = '';
      if (grade !== cur) {
        cur = grade;
        alt = false;
        head = '<tr class="grade-row"><td colspan="2"><b>' + esc(grade || 'ไม่ทราบชั้นปี') + '</b></td></tr>';
      }
      alt = !alt;
      const a = byGroup.get(g.id);
      const opts = '<option value="">- ยังไม่มีครู -</option>' + state.teachers.map((t) => {
        const n = (count.get(t.id) || 0) - (t.id === a.teacherId ? 1 : 0);
        return '<option value="' + esc(t.id) + '"' + (t.id === a.teacherId ? ' selected' : '') + '>' + esc(t.name) + (n > 0 ? ' (มีกลุ่มแล้ว)' : '') + '</option>';
      }).join('');
      let why = '';
      if (!a.teacherId && norm(g.advisor)) {
        const t = TT.findTeacherByName(state, g.advisor);
        const other = t && mine.find((x) => x.teacherId === t.id);
        const og = other && state.groups.find((x) => x.id === other.groupIds[0]);
        why = '<small class="warn">ข้อมูลกลุ่ม: "' + esc(g.advisor) + '" ' + (t ? 'เป็นที่ปรึกษา ' + esc(og ? og.name || og.code : 'กลุ่มอื่น') + ' แล้ว (Home Room เวลาเดียวกัน)' : 'ไม่พบในรายชื่อครู') + '</small>';
      }
      return head + '<tr class="' + (a.teacherId ? '' : 'need-row') + (alt ? '' : ' alt') + '"><td>' + esc(g.name || g.code) + ' <small class="muted">' + esc(dept) + '</small>' + (why ? '<br>' + why : '') + '</td>' +
        '<td><select data-adv="' + esc(g.id) + '" aria-label="ครูที่ปรึกษา ' + esc(g.name || g.code) + '"' + (a.teacherId ? '' : ' class="need"') + '>' + opts + '</select></td></tr>';
    }).join('');
    return '<details class="rec-who adv"' + (blankCount || ui.recOpen === r.id ? ' open' : '') + '><summary>เลือกครูที่ปรึกษาแต่ละกลุ่ม' + (blankCount ? ' (ยังว่าง ' + blankCount + ' กลุ่ม)' : '') + '</summary>' +
      '<p class="hint">เปลี่ยนแล้วชื่อครูที่ปรึกษาในข้อมูลกลุ่มเรียนเปลี่ยนตาม · Home Room ยังล็อกที่วัน/คาบเดิม</p>' +
      '<table class="data adv-table"><tbody>' + rows + '</tbody></table></details>';
  }

  /** การ์ดกิจกรรมของครู (PLC): ครูทุกคน ยกเว้นที่ติ๊กออก */
  function teacherActivityCard(r, perOpts) {
    const mine = state.assignments.filter((a) => a.recurringId === r.id);
    const ex = new Set(r.exclude || []);
    const inCount = state.teachers.filter((t) => !ex.has(t.id)).length;
    const dayChoices = state.settings.days.slice();
    const closed = (state.settings.closedDays || []).includes(r.day);
    const status =
      '<li>' + ICON.check + '<span>ครู ' + inCount + ' คน' + (ex.size ? ' · ติ๊กออก ' + ex.size + ' คน' : '') + ' · นับเป็นภาระงาน ' + (Number(r.len) || 1) + ' ชม./สัปดาห์</span></li>' +
      (closed ? '<li>' + ICON.check + '<span>วัน' + esc(r.day) + 'ห้ามจัดวิชาอื่น แต่กิจกรรมนี้ลงได้</span></li>' : '') +
      (mine.length ? '<li class="ok">' + ICON.check + '<span>สร้างแล้ว · เพิ่ม/ลบครู ระบบปรับให้เอง</span></li>' : '');
    return '<div class="rec" data-rec="' + esc(r.id) + '">' +
      '<div class="rec-head">' + ICON.lock + '<input data-rf="title" aria-label="ชื่อกิจกรรม" value="' + esc(r.title) + '">' +
      (mine.length ? '<span class="badge on">ใช้งานอยู่</span>' : '<span class="badge">ยังไม่ได้สร้าง</span>') +
      '<button class="btn icon danger" data-rdel aria-label="ลบกิจกรรม">' + ICON.x + '</button></div>' +
      '<div class="rec-fields">' +
      '<label>วัน<select data-rf="day">' + simpleOptions(dayChoices.map((d) => [d, 'ทุกวัน' + d]), r.day) + '</select></label>' +
      '<label>เริ่ม<select data-rf="start">' + simpleOptions(perOpts, r.start) + '</select></label>' +
      '<label>จำนวนคาบ<select data-rf="len">' + simpleOptions([1, 2, 3, 4].map((n) => [n, n + ' คาบ']), r.len) + '</select></label>' +
      '<label>ผู้เข้าร่วม<select disabled><option>ครูทุกคน</option></select></label>' +
      '</div>' +
      '<ul class="rec-status">' + status + '</ul>' +
      (state.teachers.length
        ? '<details class="rec-who"><summary>เลือกครูที่เข้าร่วม (เอาติ๊กออก = ไม่มี' + esc(r.title) + ')</summary><div class="rec-tlist">' +
          state.teachers.map((t) => '<label><input type="checkbox" data-rt="' + esc(t.id) + '"' + (ex.has(t.id) ? '' : ' checked') + '> ' + esc(t.name || '(ไม่มีชื่อ)') + '</label>').join('') +
          '</div></details>'
        : '<p class="hint">ยังไม่มีรายชื่อครู</p>') +
      '<button class="btn primary block" data-rgo>' + (mine.length ? 'อัปเดต' : 'สร้าง') + ' ' + esc(r.title) + ' ให้ครู ' + inCount + ' คน</button>' +
      '</div>';
  }

  async function setDayMode(d, mode) {
    const s = state.settings;
    const cur = dayMode(d);
    if (cur === mode) return;
    const di = s.days.indexOf(d);
    if (mode === 'closed' && di >= 0) {
      // กิจกรรมของครู (เช่น PLC) อยู่ในวันห้ามจัดได้
      const keep = (p) => p.day !== di || TT.isTeacherActivity(state, state.assignments.find((a) => a.id === p.assignmentId));
      const n = state.placements.filter((p) => !keep(p)).length;
      if (n && !(await ask({ title: 'ห้ามจัดวัน' + d + '?', msg: 'วัน' + d + 'มีคาบที่จัดไว้ ' + n + ' ก้อน จะถูกนำออกจากตาราง', ok: 'ทำต่อ' }))) return render();
      state.placements = state.placements.filter(keep);
    }
    const next = TT.ALL_DAYS.filter((x) => (x === d ? mode !== 'hidden' : s.days.includes(x)));
    if (!next.length) { toast('ต้องมีอย่างน้อย 1 วัน', true); return render(); }
    const setClosed = () => {
      s.closedDays = s.closedDays.filter((x) => x !== d);
      if (mode === 'closed') s.closedDays.push(d);
    };
    if (next.join() !== s.days.join()) await changeDays(next, setClosed);
    else { setClosed(); commit(); }
  }

  /** เปลี่ยนวันเรียน โดยย้ายคาบที่จัดไว้/เวลาไม่ว่าง ให้อยู่วันเดิม */
  async function changeDays(next, before) {
    const s = state.settings;
    const map = s.days.map((d) => next.indexOf(d));
    const lost = state.placements.filter((p) => map[p.day] < 0).length;
    if (lost && !(await ask({ title: 'เอาวันออก?', msg: 'มีคาบที่จัดไว้ในวันที่เอาออก ' + lost + ' ก้อน ซึ่งจะถูกนำออกจากตาราง', ok: 'ทำต่อ' }))) return render();
    if (before) before();
    state.placements = state.placements.filter((p) => map[p.day] >= 0).map((p) => ({ ...p, day: map[p.day] }));
    for (const ent of [...state.teachers, ...state.groups]) {
      ent.unavailable = (ent.unavailable || []).map((k) => {
        const [d, p] = k.split('|').map(Number);
        return map[d] >= 0 ? TT.cellKey(map[d], p) : null;
      }).filter(Boolean);
    }
    s.days = next;
    commit();
  }

  function bindColumns(el) {
    const cols = state.settings.columns;
    $$('tr[data-col]', el).forEach((tr) => {
      const i = Number(tr.dataset.col);
      $$('[data-cf]', tr).forEach((inp) => (inp.onchange = () => {
        cols[i][inp.dataset.cf] = inp.value;
        if (inp.dataset.cf === 'type' && inp.value === 'break' && !cols[i].label) cols[i].label = 'พัก';
        commit();
        const d = $('details.cols-edit');
        if (d) d.open = true;
      }));
      $('[data-cdel]', tr).onclick = () => { cols.splice(i, 1); commit(); $('details.cols-edit').open = true; };
      $$('[data-cmove]', tr).forEach((b) => (b.onclick = () => {
        const j = i + Number(b.dataset.cmove);
        if (j < 0 || j >= cols.length) return;
        [cols[i], cols[j]] = [cols[j], cols[i]];
        commit();
        $('details.cols-edit').open = true;
      }));
    });
    $('#col-add', el).onclick = () => {
      const last = cols[cols.length - 1];
      const start = last ? last.end : '08:00';
      const [h, m] = start.split(':').map(Number);
      cols.push({ type: 'period', start, end: String(Math.min(23, h + 1)).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0') });
      commit();
      $('details.cols-edit').open = true;
    };
    $('#col-reset', el).onclick = async () => { if (await ask({ title: 'คืนค่าโครงสร้างคาบเริ่มต้น?', ok: 'คืนค่า' })) { state.settings.columns = TT.defaultColumns(); commit(); } };
  }

  /* ------------------------------ ข้อมูลพื้นฐาน ------------------------------ */

  const ENT = {
    groups: {
      title: 'กลุ่มเรียน', prefix: 'g', key: 'code',
      fields: [
        { k: 'level', label: 'ระดับชั้น', w: 6 },
        { k: 'code', label: 'รหัสกลุ่ม', w: 8 },
        { k: 'name', label: 'ชื่อกลุ่มเรียน', w: 14 },
        { k: 'departmentId', label: 'แผนกวิชา', type: 'dept', w: 9 },
        { k: 'major', label: 'สาขาวิชา', w: 10 },
        { k: 'size', label: 'จำนวนผู้เรียน', type: 'num', w: 4 },
        { k: 'advisor', label: 'ครูที่ปรึกษา', w: 14 },
      ],
      pasteHint: 'วางรายชื่อกลุ่มเรียนที่คัดลอกจากระบบของวิทยาลัยได้เลย เช่น\nปวช.3/1  (ปวช.67) ช่างยนต์  672010101  ปวช.3 ช่างยนต์67  เครื่องกลและยานยนต์  2  ชื่อครูที่ปรึกษา\nหรือแบบง่าย: รหัสกลุ่ม [แท็บ] ชื่อกลุ่มเรียน',
    },
    teachers: {
      title: 'ครู', prefix: 't', key: 'name',
      fields: [
        { k: 'name', label: 'ชื่อ-สกุล', w: 14 },
        { k: 'qualification', label: 'วุฒิการศึกษา', w: 12 },
        { k: 'departmentId', label: 'แผนกวิชา', type: 'dept', w: 10 },
        { k: 'major', label: 'สาขาวิชา', w: 10 },
        { k: 'duty', label: 'หน้าที่พิเศษ', w: 10 },
      ],
      pasteHint: 'คอลัมน์: ชื่อ-สกุล | วุฒิการศึกษา | แผนกวิชา (ถ้ายังไม่มี ระบบสร้างให้) | สาขาวิชา | หน้าที่พิเศษ\nชื่อครูควรสะกดตรงกับช่อง "ครูที่ปรึกษา" ของกลุ่มเรียน เพื่อให้สร้าง Home Room ได้อัตโนมัติ',
    },
    subjects: {
      title: 'รายวิชา', prefix: 's', key: 'code',
      fields: [
        { k: 'code', label: 'รหัสวิชา', w: 8 },
        { k: 'name', label: 'ชื่อรายวิชา', w: 20 },
        { k: 't', label: 'ท.', type: 'num', w: 3 },
        { k: 'p', label: 'ป.', type: 'num', w: 3 },
        { k: 'n', label: 'น.', type: 'num', w: 3 },
      ],
      pasteHint: 'คอลัมน์: รหัสวิชา | ชื่อรายวิชา | ท. | ป. | น.  (หรือ รหัสวิชา | ชื่อรายวิชา | 1-2-2)',
    },
    rooms: {
      title: 'ห้อง/สถานที่', prefix: 'r', key: 'name',
      fields: [
        { k: 'name', label: 'ชื่อห้อง/สถานที่', w: 16 },
        { k: 'shared', label: 'ใช้พร้อมกันได้หลายกลุ่ม (ไม่ตรวจชน)', type: 'bool' },
      ],
      pasteHint: 'คอลัมน์: ชื่อห้อง | ใช้พร้อมกันได้ (ใส่ "ใช่" สำหรับสถานประกอบการ/สนาม)',
    },
    departments: {
      title: 'แผนกวิชา', prefix: 'd', key: 'name',
      fields: [
        { k: 'name', label: 'ชื่อแผนกวิชา', w: 14 },
        { k: 'head', label: 'หัวหน้าแผนกวิชา', w: 14 },
      ],
      pasteHint: 'คอลัมน์: ชื่อแผนกวิชา | ชื่อหัวหน้าแผนกวิชา',
    },
  };

  function renderData(el) {
    const tabs = [['school', 'สถานศึกษา', '']].concat(Object.entries(ENT).map(([k, c]) => [k, c.title, state[k].length]));
    el.innerHTML = '<div class="page-head"><h1>ข้อมูล</h1><p>กรอกครั้งเดียว ใช้ได้ทุกภาคเรียน · แก้ไขในช่องได้ทันที ระบบบันทึกอัตโนมัติ</p></div>' +
      '<div class="pills">' + tabs.map(([k, label, n]) =>
        '<button class="pill-tab' + (k === ui.dataTab ? ' active' : '') + '" data-sub="' + k + '">' + label + (n !== '' ? ' <span class="count">' + n + '</span>' : '') + '</button>').join('') + '</div>' +
      '<div id="data-body"></div>';
    $$('[data-sub]', el).forEach((b) => (b.onclick = () => { ui.dataTab = b.dataset.sub; ui.dataFilter = ''; render(); }));
    if (ui.dataTab === 'school') renderSchool($('#data-body', el));
    else renderEntity($('#data-body', el));
  }

  function renderSchool(el) {
    const s = state.settings;
    el.innerHTML =
      '<div class="cards">' +
      '<section class="card"><h2>สถานศึกษา</h2>' +
      '<label class="field">ชื่อสถานศึกษา<input data-set="collegeName" value="' + esc(s.collegeName) + '"></label>' +
      '<div class="row2"><label class="field">ภาคเรียนที่<select data-set="semester">' + simpleOptions(['1', '2', '3'], s.semester) + '</select></label>' +
      '<label class="field">ปีการศึกษา<input data-set="year" value="' + esc(s.year) + '" inputmode="numeric"></label></div>' +
      '<label class="field">ตราสถานศึกษา (หัวกระดาษ)<input type="file" id="logo-file" accept="image/*"></label>' +
      (s.logo ? '<div class="logo-prev"><img src="' + esc(s.logo) + '" alt="ตราสถานศึกษา"><button class="btn small" id="logo-del">ลบตรา</button></div>' : '') +
      '</section>' +
      '<section class="card"><h2>ผู้ลงนามท้ายตาราง</h2>' +
      '<label class="field">หัวหน้างานพัฒนาหลักสูตรการเรียนการสอน<input data-sign="curriculumHead" value="' + esc(s.signers.curriculumHead) + '"></label>' +
      '<label class="field">รองผู้อำนวยการฝ่ายวิชาการ<input data-sign="viceDirector" value="' + esc(s.signers.viceDirector) + '"></label>' +
      '<label class="field">ผู้อำนวยการ<input data-sign="director" value="' + esc(s.signers.director) + '"></label>' +
      '<p class="hint">ชื่อหัวหน้าแผนกวิชา กรอกที่แท็บ "แผนกวิชา"</p></section>' +
      '<section class="card"><h2>สำรอง / ย้ายข้อมูล</h2>' +
      '<p class="hint">ข้อมูลเก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น ควรบันทึกไฟล์สำรองเป็นระยะ และใช้ไฟล์นี้ย้ายไปทำต่อที่เครื่องอื่น</p>' +
      '<div class="btns"><button class="btn" id="export">บันทึกไฟล์สำรอง</button>' +
      '<label class="btn">เปิดไฟล์สำรอง<input type="file" id="import" accept=".json,application/json" hidden></label>' +
      '<button class="btn" id="sample">โหลดข้อมูลตัวอย่าง</button></div>' +
      '<div class="btns"><button class="btn" id="new-term">เริ่มภาคเรียนใหม่</button>' +
      '<button class="btn danger" id="wipe">ล้างข้อมูลทั้งหมด</button></div>' +
      '<p class="hint">"เริ่มภาคเรียนใหม่" เก็บครู รายวิชา กลุ่มเรียน ห้อง และเงื่อนไขไว้ แต่ล้างภาระงานและตาราง</p></section>' +
      '</div>';

    $$('[data-set]', el).forEach((inp) => (inp.onchange = () => {
      s[inp.dataset.set] = inp.value.trim();
      save();
      $('#hdr-term').textContent = 'ภาคเรียน ' + s.semester + '/' + s.year;
    }));
    $$('[data-sign]', el).forEach((inp) => (inp.onchange = () => { s.signers[inp.dataset.sign] = inp.value.trim(); save(); }));
    $('#logo-file', el).onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 1024 * 1024) { toast('ไฟล์ใหญ่เกิน 1MB กรุณาย่อรูปก่อน', true); return; }
      const r = new FileReader();
      r.onload = () => { s.logo = r.result; commit(); };
      r.readAsDataURL(f);
    };
    const ld = $('#logo-del', el);
    if (ld) ld.onclick = () => { s.logo = ''; commit(); };
    $('#export', el).onclick = exportBackup;
    $('#import', el).onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = async () => {
        try {
          const next = TT.normalizeState(JSON.parse(r.result));
          if (!(await ask({ title: 'เปิดไฟล์สำรอง?', msg: 'ข้อมูลปัจจุบันจะถูกแทนที่ด้วยข้อมูลจากไฟล์ "' + f.name + '"', ok: 'แทนที่' }))) return;
          state = next;
          ui.viewId = '';
          commit();
          toast('เปิดไฟล์สำรองแล้ว');
        } catch (err) {
          toast('อ่านไฟล์ไม่ได้ ไฟล์ต้องเป็นไฟล์สำรองจากโปรแกรมนี้ (.json)', true);
        }
      };
      r.readAsText(f);
    };
    $('#sample', el).onclick = loadSample;
    $('#new-term', el).onclick = async () => {
      if (!(await ask({ tone: 'danger', title: 'เริ่มภาคเรียนใหม่?', msg: 'ล้างภาระงานสอนและตารางทั้งหมด (เก็บครู รายวิชา กลุ่มเรียน ห้อง เงื่อนไขไว้) แนะนำให้บันทึกไฟล์สำรองของภาคเรียนเดิมก่อน', ok: 'ล้างและเริ่มใหม่' }))) return;
      state.assignments = [];
      state.placements = [];
      commit();
    };
    $('#wipe', el).onclick = async () => {
      if (!(await ask({ tone: 'danger', title: 'ล้างข้อมูลทั้งหมด?', msg: 'ย้อนกลับไม่ได้ ควรบันทึกไฟล์สำรองก่อน', ok: 'ล้างทั้งหมด' }))) return;
      state = TT.emptyState();
      commit();
    };
  }

  function renderEntity(el) {
    const cfg = ENT[ui.dataTab];
    el.innerHTML =
      '<div class="toolbar"><label class="search">' + ICON.search + '<input type="search" id="dfilter" aria-label="ค้นหา" placeholder="ค้นหา' + cfg.title + '" value="' + esc(ui.dataFilter) + '"></label>' +
      '<span class="spacer"></span>' +
      (ui.dataTab === 'subjects' ? catalogMissing().filter((c) => c.missing.length).map((c) => '<button class="btn" data-catalog="' + c.i + '" title="เพิ่มเฉพาะรหัสที่ยังไม่มี ไม่ทับของเดิม">+ ' + esc(c.name) + ' (' + c.missing.length + ')</button>').join('') : '') +
      '<button class="btn" id="dpaste">วางจาก Excel</button><button class="btn primary" id="dadd">+ เพิ่ม' + cfg.title + '</button></div>' +
      (ui.dataTab === 'subjects' ? '<p class="hint data-note">' + ICON.info + ' หน้านี้เป็น<b>คลังรายวิชา</b> เพิ่มที่นี่แล้วยังไม่เป็นของครูคนไหน — กด <b>"มอบให้ครู →"</b> ท้ายแถว หรือไปที่ <b>มอบวิชาให้ครู</b> → การ์ดครู → <b>"+ เพิ่มวิชาให้ครูคนนี้"</b></p>' : '') +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
      cfg.fields.map((f) => '<th>' + esc(f.label) + '</th>').join('') +
      (ui.dataTab === 'subjects' ? '<th>ชม./สัปดาห์</th>' : '') + '<th title="นับให้อัตโนมัติ คลิกตัวเลขเพื่อไปดู">' + USAGE_LABEL[ui.dataTab] + '</th><th></th></tr></thead><tbody id="dbody"></tbody></table></div>' +
      '<datalist id="dept-list"></datalist>';

    $('#dfilter', el).oninput = (e) => { ui.dataFilter = e.target.value; fillDataBody(); };
    $('#dadd', el).onclick = () => {
      const item = { id: TT.uid(cfg.prefix) };
      cfg.fields.forEach((f) => (item[f.k] = f.type === 'bool' ? false : ''));
      if (ui.dataTab === 'teachers' || ui.dataTab === 'groups') item.unavailable = [];
      state[ui.dataTab].push(item);
      ui.dataFilter = '';
      save();
      render();
      const inputs = $$('#dbody tr:last-child input');
      if (inputs[0]) inputs[0].focus();
    };
    $('#dpaste', el).onclick = () => openPaste(cfg.title, cfg.pasteHint, (text) => importEntity(ui.dataTab, text));
    $$('[data-catalog]', el).forEach((b) => (b.onclick = () => addCatalog(Number(b.dataset.catalog))));
    fillDataBody();
  }

  // คอลัมน์นับอัตโนมัติ (แก้เองไม่ได้) บอกว่าข้อมูลแถวนี้ถูกใช้ในกี่วิชา คลิกเพื่อไปดู
  const USAGE_LABEL = {
    teachers: 'วิชาที่สอน',
    groups: 'วิชาที่เรียน',
    subjects: 'กลุ่มที่เรียน',
    rooms: 'วิชาที่ใช้ห้อง',
    departments: 'วิชาของแผนก',
  };

  function usageCell(kind, it) {
    const n = usageCount(kind, it.id);
    if (kind === 'subjects') {
      return (n ? '<button class="linkish" data-usage="' + esc(it.id) + '" title="ดูรายการที่ใช้วิชานี้">' + n + ' กลุ่ม</button> · ' : '') +
        '<button class="linkish" data-give="' + esc(it.id) + '" title="เลือกครูและกลุ่มเรียนของวิชานี้">มอบให้ครู →</button>';
    }
    if (!n) return '<span class="muted" title="ยังไม่มีวิชาที่ใช้ข้อมูลนี้">–</span>';
    const unit = kind === 'subjects' ? ' กลุ่ม' : ' วิชา';
    return '<button class="linkish" data-usage="' + esc(it.id) + '" title="นับให้อัตโนมัติ คลิกเพื่อไปดู">' + n + unit + ' →</button>';
  }

  // วิชาเดียวกันแต่คนละกลุ่มเรียน นับเป็น 1 วิชา (หน้ารายวิชานับจำนวนกลุ่มที่เรียน)
  function usageCount(kind, id) {
    const mine = state.assignments.filter((a) =>
      kind === 'teachers' ? a.teacherId === id
        : kind === 'subjects' ? a.subjectId === id
          : kind === 'groups' ? a.groupIds.includes(id)
            : kind === 'rooms' ? a.roomId === id
              : state.teachers.some((t) => t.departmentId === id && t.id === a.teacherId));
    if (kind === 'subjects') return new Set(mine.flatMap((a) => a.groupIds)).size;
    return new Set(mine.map(subjKey)).size;
  }

  function subjKey(a) {
    return a.subjectId ? 's:' + a.subjectId : 'x:' + (a.title || 'กิจกรรม');
  }

  function fillDeptList() {
    const dl = $('#dept-list');
    if (dl) dl.innerHTML = state.departments.filter((d) => norm(d.name)).map((d) => '<option value="' + esc(d.name) + '"></option>').join('');
  }

  /** แผนกของกลุ่ม (ที่ตั้งไว้ หรือที่เดา) */
  function groupDeptName(g) {
    const d = state.departments.find((x) => x.id === g.departmentId);
    return (d && d.name) || groupDept(g) || 'ไม่ระบุแผนก';
  }

  /** เรียงกลุ่มเรียน: ชั้นปี ปวช.1 → ปวส.2 แล้วแผนก แล้วรหัส · คืน [{ g, grade, dept }] */
  function sortGroups(list) {
    return list.map((g) => ({ g, grade: TT.groupGrade(state, g), dept: groupDeptName(g) }))
      .sort((x, y) => TT.gradeRank(x.grade) - TT.gradeRank(y.grade) || x.dept.localeCompare(y.dept, 'th') || String(x.g.code).localeCompare(String(y.g.code)));
  }

  /** เดาแผนกของกลุ่มเรียน (ถ้ายังไม่ได้ตั้ง): สาขาวิชาหรือชื่อกลุ่มที่มีชื่อแผนกอยู่ เช่น "ปวช.1 ช่างยนต์ 68" → ช่างยนต์ */
  function groupDept(g) {
    const flat = (x) => norm(x).replace(/[\s.]/g, '');
    const m = flat(g.major);
    const n = flat(g.name);
    const d = state.departments.find((x) => { const k = flat(x.name); return k && ((m && (m === k || m.includes(k) || k.includes(m))) || n.includes(k)); });
    return d ? d.name : '';
  }

  function fillDataBody() {
    const kind = ui.dataTab;
    const cfg = ENT[kind];
    const q = norm(ui.dataFilter).toLowerCase();
    const deptName = (id) => (state.departments.find((d) => d.id === id) || {}).name || '';
    const rows = state[kind].filter((it) => !q || cfg.fields.some((f) =>
      String(f.type === 'dept' ? deptName(it[f.k]) : it[f.k] == null ? '' : it[f.k]).toLowerCase().includes(q)));
    const dupIds = new Set();
    if (kind === 'groups') TT.checkData(state).filter((i) => i.type === 'dup-group').forEach((i) => i.groupIds.forEach((g) => dupIds.add(g)));
    const body = $('#dbody');
    const rowHtml = (it, alt) =>
      '<tr data-id="' + esc(it.id) + '" class="' + (alt ? 'alt' : '') + (dupIds.has(it.id) ? ' dup-row-t" title="กลุ่มเรียนนี้ซ้ำกับกลุ่มอื่น ดูที่ ตรวจสอบ' : '') + '">' + cfg.fields.map((f) => {
        // พิมพ์ชื่อแผนกใหม่ได้เลย (สร้างให้อัตโนมัติ) หรือเลือกจากรายการที่มีอยู่
        if (f.type === 'dept') {
          const guess = kind === 'groups' && !it[f.k] ? groupDept(it) : '';
          return '<td><input data-f="' + f.k + '" list="dept-list" aria-label="' + esc(f.label) + '" placeholder="' + esc(guess ? guess + ' ?' : 'พิมพ์หรือเลือก') + '" value="' + esc(deptName(it[f.k])) + '" style="min-width:' + (f.w || 8) + 'em"></td>';
        }
        if (f.type === 'bool') return '<td class="c"><input type="checkbox" data-f="' + f.k + '" aria-label="' + esc(f.label) + '"' + (it[f.k] ? ' checked' : '') + '></td>';
        return '<td' + (f.type === 'num' ? ' class="num"' : '') + '><input data-f="' + f.k + '" aria-label="' + esc(f.label) + '" value="' + esc(it[f.k]) + '" style="min-width:' + (f.w || 8) + 'em"' + (f.type === 'num' ? ' inputmode="numeric"' : '') + '></td>';
      }).join('') +
      (kind === 'subjects' ? '<td class="c hrs">' + TT.subjectHours(it) + '</td>' : '') +
      '<td class="c">' + (dupIds.has(it.id) ? '<button class="badge bad-b" data-go-check>ซ้ำ</button> ' : '') + usageCell(kind, it) + '</td>' +
      '<td><button class="btn icon danger" data-del aria-label="ลบ">' + ICON.x + '</button></td></tr>';
    let html;
    if (kind === 'groups') {
      // เรียงตามชั้นปี ปวช.1 → ปวส.2 แล้วตามแผนกวิชา · แต่ละชั้นมีหัวข้อ · แถวสลับสี
      const cols = cfg.fields.length + 2;
      const sorted = sortGroups(rows);
      html = '';
      let cur = null;
      let i = 0;
      for (const x of sorted) {
        if (x.grade !== cur) {
          cur = x.grade;
          i = 0;
          const n = sorted.filter((y) => y.grade === cur).length;
          html += '<tr class="grade-row"><td colspan="' + cols + '"><b>' + esc(cur || 'ไม่ทราบชั้นปี') + '</b> <span class="muted">' + n + ' กลุ่ม · ' +
            esc([...new Set(sorted.filter((y) => y.grade === cur).map((y) => y.dept))].join(' · ')) + '</span></td></tr>';
        }
        html += rowHtml(x.g, i++ % 2 === 1);
      }
    } else {
      html = rows.map((it, i) => rowHtml(it, i % 2 === 1)).join('');
    }
    body.innerHTML = html || '<tr><td colspan="9" class="empty-row">ยังไม่มีข้อมูล กด "+ เพิ่ม" หรือ "วางจาก Excel"</td></tr>';
    fillDeptList();

    $$('[data-go-check]', body).forEach((b) => (b.onclick = () => go('check')));
    $$('[data-give]', body).forEach((b) => (b.onclick = () => editAssignment({ id: TT.uid('a'), teacherId: '', subjectId: b.dataset.give, title: '', groupIds: [], roomId: null, blocks: '', blockCourse: false, plan: 'weekly' }, true)));
    $$('[data-usage]', body).forEach((b) => (b.onclick = () => {
      const id = b.dataset.usage;
      if (kind === 'teachers') { ui.assignTeacher = id; ui.dataFilter = ''; ui.teacherFilter = ''; ui.listFilter = ''; go('assign'); }
      else if (kind === 'groups') { ui.view = 'group'; ui.viewId = id; ui.listFilter = ''; go('schedule'); }
      else if (kind === 'rooms') { ui.view = 'room'; ui.viewId = id; ui.listFilter = ''; go('schedule'); }
      else {
        const sj = state.subjects.find((x) => x.id === id);
        ui.listFilter = sj ? sj.code : '';
        ui.dataFilter = '';
        go('assign');
      }
    }));
    $$('tr[data-id]', body).forEach((tr) => {
      const item = state[kind].find((x) => x.id === tr.dataset.id);
      $$('[data-f]', tr).forEach((inp) => (inp.onchange = () => {
        const f = cfg.fields.find((x) => x.k === inp.dataset.f);
        if (f.type === 'dept') {
          const before = state.departments.length;
          item[f.k] = norm(inp.value) ? findOrCreate('departments', inp.value).id : '';
          save();
          if (state.departments.length > before) {
            toast('เพิ่มแผนกวิชา "' + norm(inp.value) + '" แล้ว');
            fillDeptList();
            const count = $('[data-sub=departments] .count');
            if (count) count.textContent = state.departments.length;
          }
          return;
        }
        const oldVal = item[f.k];
        item[f.k] = f.type === 'bool' ? inp.checked : f.type === 'num' ? (inp.value === '' ? '' : Number(inp.value) || 0) : inp.value.trim();
        if (kind === 'subjects') $('.hrs', tr).textContent = TT.subjectHours(item);
        // เปลี่ยนชื่อครู → ชื่อครูที่ปรึกษาในข้อมูลกลุ่มเปลี่ยนตาม
        if (kind === 'teachers' && f.k === 'name' && oldVal) {
          const k = norm(oldVal).replace(/[\s.]/g, '');
          state.groups.forEach((g) => { if (norm(g.advisor).replace(/[\s.]/g, '') === k) g.advisor = item.name; });
        }
        if (kind === 'groups' && f.k === 'advisor') { advisorChanged(item); return; }
        save();
      }));
      $('[data-del]', tr).onclick = () => deleteEntity(kind, item);
    });
  }

  /**
   * เลือกครูที่ปรึกษาของกลุ่ม (Home Room เวลาเดียวกันทุกกลุ่ม → ครู 1 คนได้ 1 กลุ่ม)
   * ถ้าครูเป็นที่ปรึกษากลุ่มอื่นอยู่ ถามก่อนว่าจะย้ายมากลุ่มนี้ไหม · คืนค่า true เมื่อเปลี่ยนแล้ว
   */
  async function chooseAdvisor(groupId, teacherId) {
    const g = state.groups.find((x) => x.id === groupId) || {};
    const t = teacherId ? state.teachers.find((x) => x.id === teacherId) : null;
    if (t) {
      const others = state.groups.filter((x) => x.id !== groupId && (TT.findTeacherByName(state, x.advisor) || {}).id === t.id);
      if (others.length) {
        const names = others.map((x) => x.name || x.code).join(', ');
        if (!(await ask({ title: t.name + ' เป็นที่ปรึกษา ' + names + ' อยู่แล้ว', msg: 'Home Room ทุกกลุ่มเรียนเวลาเดียวกัน ครู 1 คนดูแลได้ 1 กลุ่ม',
          q: 'ย้าย ' + t.name + ' มาเป็นที่ปรึกษา ' + (g.name || g.code) + ' แทนไหม? (' + names + ' จะยังไม่มีครูที่ปรึกษา)', ok: 'ย้ายมากลุ่มนี้', cancel: 'ไม่เปลี่ยน' }))) return false;
        others.forEach((x) => TT.setAdvisor(state, x.id, ''));
      }
    }
    TT.setAdvisor(state, groupId, teacherId || '');
    return true;
  }

  /** แก้ชื่อครูที่ปรึกษาในหน้ากลุ่มเรียน → ผู้สอน Home Room ของกลุ่มเปลี่ยนตาม */
  function advisorChanged(g) {
    const hasHR = state.assignments.some((a) => a.recurringId && (a.groupIds || [])[0] === g.id);
    const name = norm(g.advisor);
    const t = TT.findTeacherByName(state, name);
    if (!hasHR) { save(); return; }
    if (name && !t) {
      TT.setAdvisor(state, g.id, '');
      g.advisor = name;
      save();
      toast('ไม่พบ "' + name + '" ในรายชื่อครู · Home Room ของ ' + (g.name || g.code) + ' ยังไม่มีครู', true);
      return;
    }
    const typed = g.advisor;
    chooseAdvisor(g.id, t ? t.id : '').then((ok) => {
      if (!ok) { g.advisor = typed; TT.syncAdvisors(state); }
      save();
      fillDataBody();
      const blank = !state.assignments.some((a) => a.recurringId && (a.groupIds || [])[0] === g.id && a.teacherId);
      toast(t && !blank ? 'Home Room ของ ' + (g.name || g.code) + ' → ' + t.name
        : 'Home Room ของ ' + (g.name || g.code) + ' ยังไม่มีครู' + (t ? ' (' + t.name + ' เป็นที่ปรึกษากลุ่มอื่นอยู่)' : ''), blank && !!t);
    });
  }

  async function deleteEntity(kind, item) {
    const n = usageCount(kind, item.id);
    const label = item.name || item.code || 'รายการนี้';
    if (kind === 'teachers') {
      if (!(await ask({ tone: 'danger', title: 'ลบ "' + label + '"?', msg: n ? 'ภาระงานสอนที่เกี่ยวข้องจะถูกลบด้วย (กิจกรรมประจำจะเหลือไว้แบบยังไม่มีครู)' : '', ok: 'ลบ' }))) return;
      state.assignments.forEach((a) => { if (a.recurringId && a.teacherId === item.id && !TT.isTeacherActivity(state, a)) a.teacherId = ''; });
      state.assignments = state.assignments.filter((a) => a.teacherId !== item.id);
      state.settings.recurring.forEach((r) => { if (r.exclude) r.exclude = r.exclude.filter((id) => id !== item.id); });
    } else if (kind === 'subjects') {
      if (!(await ask({ tone: 'danger', title: 'ลบ "' + label + '"?', msg: n ? 'ภาระงานสอนที่เกี่ยวข้อง ' + n + ' รายการจะถูกลบด้วย' : '', ok: 'ลบ' }))) return;
      state.assignments = state.assignments.filter((a) => a.subjectId !== item.id);
    } else {
      if (!(await ask({ tone: 'danger', title: 'ลบ "' + label + '"?', ok: 'ลบ' }))) return;
      if (kind === 'groups') {
        state.assignments.forEach((a) => (a.groupIds = a.groupIds.filter((g) => g !== item.id)));
        state.assignments = state.assignments.filter((a) => !(a.recurringId && !a.groupIds.length && !TT.isTeacherActivity(state, a)));
      }
      if (kind === 'rooms') state.assignments.forEach((a) => { if (a.roomId === item.id) a.roomId = null; });
      if (kind === 'departments') [...state.teachers, ...state.groups].forEach((t) => { if (t.departmentId === item.id) t.departmentId = ''; });
    }
    state[kind] = state[kind].filter((x) => x !== item);
    commit();
  }

  function findOrCreate(kind, name, extra) {
    const n = norm(name);
    if (!n) return null;
    let it = state[kind].find((x) => norm(x.name) === n);
    if (!it) {
      it = Object.assign({ id: TT.uid(ENT[kind].prefix), name: n }, extra || {});
      state[kind].push(it);
    }
    return it;
  }

  function importEntity(kind, text) {
    const cfg = ENT[kind];
    let records;
    if (kind === 'groups') {
      records = TT.parseGroupRows(text);
    } else {
      records = TT.splitRows(text).map((cells) => {
        // รองรับ "1-2-2" ในช่องเดียว
        if (kind === 'subjects' && /^\d+\s*-\s*\d+\s*-\s*\d+$/.test(cells[2] || '')) {
          const [t, p, n] = cells[2].split('-').map((x) => Number(x.trim()));
          return { code: cells[0], name: cells[1], t, p, n };
        }
        const r = {};
        cfg.fields.forEach((f, i) => (r[f.k] = cells[i] == null ? '' : cells[i]));
        return r;
      }).filter((r) => !cfg.fields.some((f) => norm(r[f.k]) === f.label));
    }
    let added = 0;
    let updated = 0;
    for (const r of records) {
      const keyVal = norm(r[cfg.key]);
      if (!keyVal) continue;
      let item = state[kind].find((x) => norm(x[cfg.key]) === keyVal);
      if (item) updated++;
      else {
        item = { id: TT.uid(cfg.prefix) };
        if (kind === 'teachers' || kind === 'groups') item.unavailable = [];
        state[kind].push(item);
        added++;
      }
      for (const f of cfg.fields) {
        let v = r[f.k];
        if (v == null) continue;
        if (f.type === 'dept') v = v ? (findOrCreate('departments', v) || {}).id || '' : '';
        else if (f.type === 'num') v = v === '' ? '' : Number(v) || 0;
        else if (f.type === 'bool') v = /^(1|y|yes|true|ใช่|✓|x)$/i.test(String(v).trim());
        else v = String(v).trim();
        if (v !== '' || item[f.k] == null) item[f.k] = v;
      }
    }
    commit();
    const dups = kind === 'groups' ? TT.checkData(state).filter((i) => i.type === 'dup-group').length : 0;
    if (dups) setTimeout(() => toast('นำเข้าแล้ว แต่พบกลุ่มเรียนซ้ำ ' + dups + ' ชุด กดปุ่ม "ตรวจสอบ" ด้านบนเพื่อรวม', true), 50);
    return 'เพิ่ม ' + added + ' รายการ, ปรับปรุง ' + updated + ' รายการ';
  }

  /* ------------------------------ วางจาก Excel ------------------------------ */

  function openPaste(title, hint, onImport) {
    const dlg = $('#dlg-paste');
    $('.dlg-title', dlg).textContent = 'วางข้อมูล' + title + 'จาก Excel';
    $('.dlg-hint', dlg).textContent = hint + '\n\nวิธีใช้: เลือกช่องใน Excel → คัดลอก (Ctrl+C) → คลิกในกล่องด้านล่าง → วาง (Ctrl+V)\nถ้ารหัส/ชื่อซ้ำกับที่มีอยู่ ระบบจะปรับปรุงข้อมูลเดิมแทนการเพิ่มใหม่';
    const ta = $('textarea', dlg);
    ta.value = '';
    $('.dlg-ok', dlg).onclick = () => {
      const msg = onImport(ta.value);
      dlg.close();
      if (msg) toast(msg);
    };
    dlg.showModal();
    ta.focus();
  }

  /** นำเข้าแผนการเรียนของกลุ่มเรียน (รหัสกลุ่ม | รหัสวิชา | ชื่อวิชา | ท | ป | น) */
  function openPlanImport() {
    const dlg = $('#dlg-plan');
    const s = state.settings;
    const days = openDays();
    $('#plan-day', dlg).innerHTML = simpleOptions(days, days.includes('พุธ') ? 'พุธ' : days[0]);
    $('#plan-start', dlg).innerHTML = simpleOptions(TT.periods(s).map((p) => [p.no, p.no + ' (' + p.start + ')']), 2);
    const ta = $('textarea', dlg);
    ta.value = '';
    $('.dlg-ok', dlg).onclick = () => {
      if (!ta.value.trim()) { toast('ยังไม่ได้วางข้อมูล', true); return; }
      const res = TT.importStudyPlan(state, ta.value, {
        mergeSections: $('#plan-merge', dlg).checked,
        activity: $('#plan-act', dlg).checked ? { day: $('#plan-day', dlg).value, start: Number($('#plan-start', dlg).value) } : null,
      });
      dlg.close();
      ui.assignTeacher = '__none';
      ui.tab = 'assign';
      commit();
      toast('นำเข้า ' + res.rows + ' แถว · รายวิชาใหม่ ' + res.subjectsAdded + ' · กลุ่มใหม่ ' + res.groupsAdded + ' · รายการรอเลือกครู ' + res.assignmentsAdded +
        (res.merged ? ' (เรียนรวม ' + res.merged + ')' : '') + (res.activities ? ' · วิชากิจกรรมลงตาราง ' + res.activities : '') + (res.existing ? ' · มีอยู่แล้ว ' + res.existing : ''));
      if (res.problems.length) ask({ tone: 'info', title: 'มีบางแถวที่ต้องตรวจ', items: [...new Set(res.problems)].slice(0, 20), cancel: false });
    };
    dlg.showModal();
    ta.focus();
  }

  /* ------------------------------ ภาระงานสอน ------------------------------ */

  /**
   * มอบวิชาให้ครู: ซ้าย = วิชาที่ยังไม่มีครู · ขวา = การ์ดครู
   * คลิกเลือกครู แล้วคลิกวิชาทางซ้ายเพื่อมอบ (หรือลากวิชาไปวางบนการ์ดครู)
   */
  function renderAssign(el) {
    const idx = TT.indexState(state);
    if (ui.assignTeacher && !idx.teachers.get(ui.assignTeacher)) ui.assignTeacher = '';
    const sel = ui.assignTeacher ? idx.teachers.get(ui.assignTeacher) : null;
    const pool = state.assignments.filter((a) => !a.teacherId);
    el.innerHTML =
      '<div class="page-head row"><div><h1>มอบวิชาให้ครู</h1>' +
      '<p><b>① คลิกเลือกครู</b> (ทางขวา) → <b>② คลิกวิชา</b> ทางซ้ายเพื่อมอบให้ครูคนนั้น · หรือลากวิชาไปวางบนการ์ดครู · คลิกวิชาในการ์ดครูเพื่อแก้ไข</p></div>' +
      '<div class="btns tight"><button class="btn" id="b-plan">นำเข้าแผนการเรียน</button><button class="btn" id="b-teacher">+ เพิ่มครู</button></div></div>' +
      '<div class="board">' +
      '<section class="card pool" id="pool" aria-label="วิชาที่ยังไม่มีครู"><div class="card-head"><h2>ยังไม่มีครู</h2>' +
      '<span class="badge ' + (pool.length ? 'warn' : 'ok') + '">' + (pool.length ? pool.length + ' วิชา' : 'มอบครบแล้ว') + '</span></div>' +
      (sel ? '<div class="pool-target">มอบให้: <b>' + esc(sel.name) + '</b></div>' : '<div class="pool-target muted">ยังไม่ได้เลือกครู — คลิกการ์ดครูทางขวาก่อน</div>') +
      '<label class="search">' + ICON.search + '<input type="search" id="pool-q" aria-label="ค้นหาวิชา" placeholder="ค้นหารหัส/ชื่อวิชา หรือกลุ่มเรียน (รวมคลังรายวิชา)" value="' + esc(ui.listFilter) + '"></label>' +
      '<div id="pool-list" class="pool-list"></div></section>' +
      '<section class="teachers"><div class="toolbar"><label class="search">' + ICON.search + '<input type="search" id="t-q" aria-label="ค้นหาครู" placeholder="ค้นหาครู" value="' + esc(ui.teacherFilter || '') + '"></label>' +
      '<span class="spacer"></span><button class="btn small ghost" id="b-paste">วางภาระงานจาก Excel</button></div>' +
      '<div class="tgrid" id="tgrid"></div></section>' +
      '</div>' +
      '<datalist id="subj-list">' + state.subjects.map((x) => '<option value="' + esc(x.code + ' ' + x.name) + '"></option>').join('') +
      catalogMissing().flatMap((c) => c.missing.map((x) => '<option value="' + esc(x.code + ' ' + x.name) + '" label="' + esc(c.name) + '"></option>')).join('') + '</datalist>';

    $('#b-plan', el).onclick = openPlanImport;
    $('#b-teacher', el).onclick = () => { ui.dataTab = 'teachers'; go('data'); $('#dadd').click(); };
    $('#b-paste', el).onclick = () => openPaste('ภาระงานสอน',
      'คอลัมน์: ชื่อครู | รหัสวิชา (หรือชื่อกิจกรรม) | รหัสกลุ่มเรียน (เรียนรวมหลายกลุ่มคั่นด้วย , ) | ห้อง | รูปแบบคาบ (เว้นว่างได้) | Block Course (ใส่ "ใช่") | ทั้งเทอม (ใส่ "ใช่")',
      importAssignments);
    $('#pool-q', el).oninput = (e) => { ui.listFilter = e.target.value; fillPool(); };
    $('#t-q', el).oninput = (e) => { ui.teacherFilter = e.target.value; fillTeachers(); };
    fillPool();
    fillTeachers();
    // ลากวิชาไปวางบนการ์ดครู / ลากกลับมาที่ "ยังไม่มีครู"
    const drop = (target, teacherId) => {
      target.ondragover = (e) => { e.preventDefault(); target.classList.add('drop'); };
      target.ondragleave = () => target.classList.remove('drop');
      target.ondrop = (e) => {
        e.preventDefault();
        target.classList.remove('drop');
        const id = e.dataTransfer.getData('text/plain');
        const a = state.assignments.find((x) => x.id === id);
        if (a) giveTo(a, teacherId());
      };
    };
    drop($('#pool', el), () => '');
    $$('.tcard', el).forEach((c) => drop(c, () => c.dataset.tid));
  }

  // รวมรายการของวิชาเดียวกัน (คนละกลุ่มเรียน) ไว้ด้วยกัน เรียงตามลำดับที่พบครั้งแรก
  function subjGroups(list) {
    const m = new Map();
    list.forEach((a) => { const k = subjKey(a); if (!m.has(k)) m.set(k, []); m.get(k).push(a); });
    return [...m.values()];
  }

  function subjLabel(a, idx) {
    const sj = a.subjectId ? idx.subjects.get(a.subjectId) : null;
    return sj ? sj.code + ' ' + sj.name : a.title || 'กิจกรรม';
  }

  function groupsLabel(a, idx) {
    if (TT.isTeacherActivity(state, a)) {
      const r = state.settings.recurring.find((x) => x.id === a.recurringId);
      const pers = TT.periods(state.settings);
      const st = pers[r.start - 1];
      const en = pers[r.start + (Number(r.len) || 1) - 2];
      return 'ครูทุกคน · วัน' + r.day + (st && en ? ' ' + st.start + '–' + en.end : '');
    }
    return a.groupIds.map((g) => (idx.groups.get(g) || {}).name || '?').join(' + ') || 'ยังไม่ได้เลือกกลุ่มเรียน';
  }

  async function giveTo(a, teacherId) {
    const idx = TT.indexState(state);
    // Home Room: ผู้สอน = ครูที่ปรึกษาของกลุ่ม ให้ชื่อในข้อมูลกลุ่มตรงกันด้วย
    if (a.recurringId && !TT.isTeacherActivity(state, a) && a.groupIds[0]) { if (!(await chooseAdvisor(a.groupIds[0], teacherId || ''))) return; }
    else a.teacherId = teacherId || '';
    commit();
    toast(teacherId ? 'มอบ ' + subjLabel(a, idx) + ' ให้ ' + idx.teachers.get(teacherId).name : 'ย้าย ' + subjLabel(a, idx) + ' กลับไปที่ "ยังไม่มีครู"');
  }

  function fillPool() {
    const idx = TT.indexState(state);
    const q = norm(ui.listFilter).toLowerCase();
    const byGroup = new Map();
    for (const a of state.assignments) {
      if (a.teacherId) continue;
      const g = groupsLabel(a, idx);
      if (q && !(subjLabel(a, idx) + ' ' + g).toLowerCase().includes(q)) continue;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(a);
    }
    // ค้นหาแล้วแสดงวิชาจากคลังรายวิชาด้วย (วิชาที่ยังไม่มีกลุ่มเรียน/ยังไม่ได้มอบ) คลิกแล้วเลือกกลุ่มให้ครูที่เลือก
    let lib = [];
    if (q) {
      const seen = new Set();
      const hit = (x) => (x.code + ' ' + x.name).toLowerCase().includes(q);
      for (const x of state.subjects) if (hit(x) && !seen.has(x.code)) { seen.add(x.code); lib.push({ id: x.id, code: x.code, name: x.name, h: TT.subjectHours(x) }); }
      for (const c of catalogMissing()) for (const x of c.missing) if (hit(x) && !seen.has(x.code)) { seen.add(x.code); lib.push({ code: x.code, name: x.name, h: TT.subjectHours(x), from: c.name }); }
      lib.sort((a, b) => a.code.localeCompare(b.code));
    }
    const libHtml = lib.length
      ? '<div class="pool-group lib"><div class="eg-name">คลังรายวิชา · คลิกแล้วเลือกกลุ่มเรียนให้ครูที่เลือก</div>' + lib.slice(0, 40).map((x) =>
          '<button class="pool-item lib-item" data-lib="' + esc(x.code) + '" title="มอบวิชานี้ให้ครูที่เลือก (เลือกกลุ่มเรียนในขั้นต่อไป)">' +
          '<i class="dot-c"></i><span class="grow">' + esc(x.code + ' ' + x.name) + (x.from ? ' <small class="muted">(' + esc(x.from) + ')</small>' : '') + '</span>' +
          '<small>' + x.h + ' ชม.</small></button>').join('') + (lib.length > 40 ? '<p class="hint">… อีก ' + (lib.length - 40) + ' วิชา พิมพ์ให้ละเอียดขึ้น</p>' : '') + '</div>'
      : '';
    const box = $('#pool-list');
    box.innerHTML = [...byGroup.entries()].sort((x, y) => x[0].localeCompare(y[0], 'th')).map(([g, as]) =>
      '<div class="pool-group"><div class="eg-name">' + esc(g) + '</div>' + as.map((a) =>
        '<button class="pool-item ' + P.colorClass(state, a) + '" draggable="true" data-aid="' + esc(a.id) + '" title="คลิกเพื่อมอบให้ครูที่เลือก หรือลากไปวางบนการ์ดครู">' +
        '<i class="dot-c ' + P.colorClass(state, a) + '"></i><span class="grow">' + esc(subjLabel(a, idx)) + (a.recurringId ? ' ' + ICON.lock : '') + '</span>' +
        '<small>' + TT.assignmentHours(a, idx.subjects) + ' ชม.</small></button>').join('') + '</div>').join('') ||
      (lib.length ? '' : '<p class="ok-line">' + ICON.check + (q ? 'ไม่พบวิชาที่ค้นหา' : 'ทุกวิชามีครูแล้ว') + '</p>' +
      (state.assignments.length ? '' : '<p class="hint">ยังไม่มีรายวิชา กด "นำเข้าแผนการเรียน" ด้านบน</p>'));
    if (libHtml) box.insertAdjacentHTML('beforeend', libHtml);
    $$('[data-lib]', box).forEach((b) => (b.onclick = () => {
      if (!ui.assignTeacher || ui.assignTeacher === '__none') { toast('คลิกเลือกครูทางขวาก่อน แล้วค่อยคลิกวิชา', true); return; }
      const code = b.dataset.lib;
      let sj = state.subjects.find((x) => x.code === code);
      if (!sj) {
        const x = catalogMissing().flatMap((c) => c.missing).find((y) => y.code === code);
        if (!x) return;
        sj = { id: TT.uid('s'), ...x };
        state.subjects.push(sj);
        save();
      }
      editAssignment({ id: TT.uid('a'), teacherId: ui.assignTeacher, subjectId: sj.id, title: '', groupIds: [], roomId: null, blocks: '', blockCourse: false, plan: 'weekly' }, true);
      setTimeout(() => { const gb = $('#e-groups'); if (gb) gb.click(); }, 50); // เปิดเลือกกลุ่มเรียนให้เลย
    }));
    $$('.pool-item:not(.lib-item)', box).forEach((b) => {
      b.ondragstart = (e) => e.dataTransfer.setData('text/plain', b.dataset.aid);
      b.onclick = () => {
        const a = state.assignments.find((x) => x.id === b.dataset.aid);
        if (!ui.assignTeacher) { toast('คลิกเลือกครูทางขวาก่อน แล้วค่อยคลิกวิชา', true); $('#tgrid').classList.add('pulse'); setTimeout(() => $('#tgrid') && $('#tgrid').classList.remove('pulse'), 900); return; }
        giveTo(a, ui.assignTeacher);
      };
    });
  }

  function fillTeachers() {
    const idx = TT.indexState(state);
    const q = norm(ui.teacherFilter || '').toLowerCase();
    const dept = new Map(state.departments.map((d) => [d.id, d.name]));
    const ts = state.teachers.filter((t) => !q || norm(t.name).toLowerCase().includes(q));
    const box = $('#tgrid');
    box.innerHTML = ts.map((t) => {
      const mine = state.assignments.filter((a) => a.teacherId === t.id);
      const week = mine.reduce((n, a) => n + TT.assignmentHours(a, idx.subjects), 0);
      const term = mine.reduce((n, a) => n + hoursInfo(a, idx).total, 0);
      const on = ui.assignTeacher === t.id;
      return '<article class="tcard' + (on ? ' on' : '') + '" data-tid="' + esc(t.id) + '">' +
        '<button class="tc-head" data-pick-t="' + esc(t.id) + '" aria-pressed="' + on + '">' +
        '<span class="tc-name"><b>' + esc(t.name) + '</b><small>' + [dept.get(t.departmentId), mine.length ? subjGroups(mine).length + ' วิชา' : ''].filter(Boolean).map(esc).join(' · ') + '</small></span>' +
        '<span class="tc-hours"><b>' + week + '</b> ชม./สัปดาห์<small>' + term + ' ชม./เทอม</small></span></button>' +
        (on ? '<div class="tc-hint">' + ICON.check + 'เลือกอยู่ — คลิกวิชาทางซ้ายเพื่อมอบให้ครูคนนี้</div>' : '') +
        '<div class="tc-list">' + (subjGroups(mine).map((list) => {
          const chip = (a, label) =>
            '<div class="tchip ' + P.colorClass(state, a) + '" draggable="true" data-aid="' + esc(a.id) + '">' +
            '<button class="tchip-main" data-edit="' + esc(a.id) + '" title="คลิกเพื่อแก้ไข">' +
            '<span class="grow">' + label + '</span>' +
            '<span class="tchip-h">' + TT.assignmentHours(a, idx.subjects) + '</span></button>' +
            (a.recurringId
              ? '<button class="btn icon ghost" data-unrec="' + esc(a.id) + '" aria-label="เอาออก" title="' + (TT.isTeacherActivity(state, a) ? 'เอาครูคนนี้ออกจาก ' + esc(a.title) : 'เอาครูคนนี้ออกจาก ' + esc(a.title) + ' ของกลุ่มนี้ (กลุ่มยังมี ' + esc(a.title) + ' แบบยังไม่มีครู)') + '">' + ICON.x + '</button>'
              : '<button class="btn icon ghost" data-unassign="' + esc(a.id) + '" aria-label="ยกเลิกการมอบ" title="ย้ายกลับไปที่ ยังไม่มีครู">' + ICON.x + '</button>') +
            '</div>';
          const term = (a) => (TT.isTerm(a) ? ' · ทั้งเทอม' : '');
          if (list.length === 1) return chip(list[0], '<b>' + esc(subjLabel(list[0], idx)) + '</b><small>' + esc(groupsLabel(list[0], idx)) + term(list[0]) + '</small>');
          // วิชาเดียวกันหลายกลุ่ม: เขียนชื่อวิชาครั้งเดียว แล้วแยกกลุ่มไว้ข้างใต้
          return '<div class="tsubj ' + P.colorClass(state, list[0]) + '"><div class="tsubj-h"><b>' + esc(subjLabel(list[0], idx)) + '</b><small>' + list.length + ' กลุ่ม</small></div>' +
            list.map((a) => chip(a, '<small class="g">' + esc(groupsLabel(a, idx)) + term(a) + '</small>')).join('') + '</div>';
        }).join('') || '<p class="hint">ยังไม่มีวิชา</p>') + '</div>' +
        '<button class="btn small ghost tc-add" data-new="' + esc(t.id) + '">+ เพิ่มวิชาให้ครูคนนี้</button>' +
        '</article>';
    }).join('') || '<div class="card empty-state">ยังไม่มีครู กด "+ เพิ่มครู" ด้านบน</div>';
    $$('[data-pick-t]', box).forEach((b) => (b.onclick = () => { ui.assignTeacher = ui.assignTeacher === b.dataset.pickT ? '' : b.dataset.pickT; render(); }));
    $$('[data-edit]', box).forEach((b) => (b.onclick = () => editAssignment(state.assignments.find((a) => a.id === b.dataset.edit))));
    $$('[data-unassign]', box).forEach((b) => (b.onclick = () => giveTo(state.assignments.find((a) => a.id === b.dataset.unassign), '')));
    $$('[data-unrec]', box).forEach((b) => (b.onclick = async () => {
      const a = state.assignments.find((x) => x.id === b.dataset.unrec);
      const r = a && state.settings.recurring.find((x) => x.id === a.recurringId);
      if (!r) return;
      const t = state.teachers.find((x) => x.id === a.teacherId) || {};
      if (r.scope === 'teacher') {
        if (!(await ask({ title: 'เอา ' + t.name + ' ออกจาก ' + r.title + '?', msg: 'ครูคนนี้จะไม่มี ' + r.title + ' ในตาราง (เอากลับได้ที่ ตั้งค่า → เงื่อนไข → การ์ด ' + r.title + ')', ok: 'เอาออก' }))) return;
        r.exclude = [...new Set([...(r.exclude || []), t.id])];
        TT.applyRecurring(state, r.id);
        commit();
        toast('เอา ' + t.name + ' ออกจาก ' + r.title + ' แล้ว');
        return;
      }
      const g = state.groups.find((x) => x.id === a.groupIds[0]) || {};
      if (!(await ask({ title: 'เอา ' + t.name + ' ออกจาก ' + r.title + ' ของ ' + (g.name || g.code) + '?',
        msg: 'กลุ่มนี้ยังมี ' + r.title + ' ที่เดิม แต่ยังไม่มีครูที่ปรึกษา — เลือกครูใหม่ได้ทางซ้าย (ยังไม่มีครู) หรือที่ ตั้งค่า → เงื่อนไข', ok: 'เอาออก' }))) return;
      TT.setAdvisor(state, g.id, '');
      commit();
      toast((g.name || g.code) + ' ยังไม่มีครูที่ปรึกษา · เลือกครูใหม่ได้');
    }));
    $$('[data-new]', box).forEach((b) => (b.onclick = () => editAssignment({ id: TT.uid('a'), teacherId: b.dataset.new, subjectId: null, title: '', groupIds: [], roomId: null, blocks: '', blockCourse: false, plan: 'weekly' }, true)));
    $$('.tchip[draggable]', box).forEach((c) => (c.ondragstart = (e) => e.dataTransfer.setData('text/plain', c.dataset.aid)));
  }

  /** หน้าต่างแก้ไขรายวิชา (ครู กลุ่ม ห้อง ชั่วโมง การจัด) */
  function editAssignment(a, isNew) {
    const dlg = $('#dlg-edit');
    const idx = TT.indexState(state);
    const draft = { ...a, groupIds: a.groupIds.slice() };
    const rec = !!a.recurringId;
    const teacherAct = rec && TT.isTeacherActivity(state, a);
    const hrRec = rec && !teacherAct; // Home Room: 1 รายการ = 1 กลุ่ม ผู้สอน = ครูที่ปรึกษา
    const sj = a.subjectId ? idx.subjects.get(a.subjectId) : null;
    const hours = TT.assignmentHours(a, idx.subjects);
    const hi = hoursInfo(a, idx);
    dlg.innerHTML =
      '<h3>' + (isNew ? 'เพิ่มวิชา' : 'แก้ไขรายวิชา') + '</h3>' +
      '<div class="form-grid">' +
      '<label class="field span2">วิชา / กิจกรรม' + (rec ? '<input value="' + esc(a.title) + ' (กิจกรรมประจำ)" disabled>'
        : '<input id="e-subj" list="subj-list" placeholder="พิมพ์รหัสหรือชื่อวิชา" value="' + esc(sj ? sj.code + ' ' + sj.name : a.title) + '">') + '</label>' +
      '<label class="field">' + (hrRec ? 'ครูที่ปรึกษา' : 'ครูผู้สอน') + '<select id="e-teacher"' + (teacherAct ? ' disabled' : '') + '>' + options(state.teachers, a.teacherId, (t) => t.name, '- ยังไม่มีครู -') + '</select></label>' +
      (hrRec
        ? '<label class="field">กลุ่มเรียน (ที่ปรึกษา)<select id="e-hrgroup">' + sortGroups(state.groups).map(({ g }) => {
            const other = state.assignments.find((x) => x.recurringId === a.recurringId && x.groupIds[0] === g.id && x.id !== a.id);
            const who = other && other.teacherId ? (idx.teachers.get(other.teacherId) || {}).name : '';
            return '<option value="' + esc(g.id) + '"' + (g.id === a.groupIds[0] ? ' selected' : '') + '>' + esc(g.name || g.code) + (g.id === a.groupIds[0] ? '' : who ? ' (ที่ปรึกษา: ' + esc(who) + ')' : ' (ยังไม่มีครู)') + '</option>';
          }).join('') + '</select></label>'
        : '<div class="field">กลุ่มเรียน<button type="button" class="btn" id="e-groups"' + (rec ? ' disabled' : '') + '>' + esc(groupsLabel(draft, idx)) + '</button></div>') +
      '<label class="field">ห้อง/สถานที่<select id="e-room">' + options(state.rooms, a.roomId, (r) => r.name, '-') + '</select></label>' +
      '<label class="field">ชม./สัปดาห์<input type="number" min="1" max="40" id="e-hours" value="' + hours + '"' + (rec ? ' disabled' : '') + '></label>' +
      (rec ? '' :
        '<label class="field">การจัด<select id="e-plan"><option value="weekly"' + (TT.isTerm(a) ? '' : ' selected') + '>ตารางรายสัปดาห์ (ทุกสัปดาห์)</option>' +
        '<option value="term"' + (TT.isTerm(a) ? ' selected' : '') + '>ตารางทั้งเทอม (วางรายวันจนครบ)</option></select></label>' +
        '<label class="field e-weekly">แบ่งคาบ (เว้นว่าง = อัตโนมัติ)<input id="e-blocks" value="' + esc(a.blocks) + '" placeholder="เช่น 2+2"></label>' +
        '<label class="chk e-weekly"><input type="checkbox" id="e-bc"' + (a.blockCourse ? ' checked' : '') + '> Block Course (เรียนข้ามพักกลางวันได้)</label>' +
        '<label class="field e-term">วันละ (ชม.)<input type="number" min="1" max="13" id="e-hpd" value="' + TT.hoursPerDay(a) + '"></label>' +
        '<label class="field e-term">ชั่วโมงทั้งเทอม (เว้นว่าง = อัตโนมัติ)<input type="number" min="1" id="e-total" value="' + (Number(a.totalHours) > 0 ? a.totalHours : '') + '" placeholder="' + hours * hi.weeks + '"></label>') +
      '</div>' +
      '<p class="hint">ต้องสอนทั้งเทอม <b>' + hi.total + ' ชม.</b> (' + hours + ' ชม./สัปดาห์ × ' + hi.weeks + ' สัปดาห์)</p>' +
      '<div class="btns spread"><span>' + (isNew || rec ? '' : '<button class="btn danger" id="e-del">ลบ</button><button class="btn" id="e-dup">ทำสำเนาให้อีกกลุ่ม</button>') + '</span>' +
      '<span><button class="btn" id="e-cancel">ยกเลิก</button><button class="btn primary" id="e-save">บันทึก</button></span></div>';
    const showPlan = () => {
      const term = $('#e-plan', dlg) && $('#e-plan', dlg).value === 'term';
      $$('.e-weekly', dlg).forEach((x) => (x.hidden = term));
      $$('.e-term', dlg).forEach((x) => (x.hidden = !term));
    };
    if (!rec) { $('#e-plan', dlg).onchange = showPlan; showPlan(); }
    // เลือกวิชาแล้วใส่ ชม./สัปดาห์ ตาม ท+ป ของวิชานั้นให้ (แก้ต่อเองได้)
    const subjIn = $('#e-subj', dlg);
    if (subjIn) subjIn.onchange = () => {
      const text = norm(subjIn.value);
      const code = text.split(' ')[0];
      const found = state.subjects.find((x) => norm(x.code) === code || norm(x.code + ' ' + x.name) === text) ||
        catalogMissing().flatMap((c) => c.missing).find((x) => x.code === code);
      if (!found) return;
      const h = TT.subjectHours(found);
      if (h) { $('#e-hours', dlg).value = h; const bl = $('#e-blocks', dlg); if (bl) bl.value = ''; }
    };
    const gb = $('#e-groups', dlg);
    if (gb) gb.onclick = () => pickGroups(draft, () => { gb.textContent = groupsLabel(draft, TT.indexState(state)); });
    $('#e-cancel', dlg).onclick = () => dlg.close();
    $('#e-save', dlg).onclick = async () => {
      if (hrRec) {
        // เปลี่ยนกลุ่ม/ครูที่ปรึกษาของ Home Room: กลุ่มเดิมกลับไปเป็น "ยังไม่มีครู"
        const oldG = a.groupIds[0];
        const newG = $('#e-hrgroup', dlg).value;
        const tId = $('#e-teacher', dlg).value;
        const prev = state.assignments.find((x) => x.recurringId === a.recurringId && x.groupIds[0] === newG);
        const replaced = newG !== oldG && prev && prev.teacherId && prev.teacherId !== tId ? (idx.teachers.get(prev.teacherId) || {}).name : '';
        const prevOld = state.groups.find((x) => x.id === oldG) || {};
        const keepOld = prevOld.advisor;
        if (newG !== oldG) TT.setAdvisor(state, oldG, '');
        if (!(await chooseAdvisor(newG, tId))) { if (newG !== oldG) { prevOld.advisor = keepOld; TT.syncAdvisors(state); } return; }
        const r = { others: [] };
        const room = $('#e-room', dlg).value || null;
        state.assignments.forEach((x) => { if (x.recurringId === a.recurringId && x.groupIds[0] === newG) x.roomId = room; });
        dlg.close();
        commit();
        const g = state.groups.find((x) => x.id === newG) || {};
        const t = state.teachers.find((x) => x.id === tId);
        toast(a.title + ' ' + (g.name || g.code) + ' → ' + (t ? t.name : 'ยังไม่มีครู') + (replaced ? ' (แทน ' + replaced + ')' : '') +
          (r.others.length ? ' · เป็นที่ปรึกษา ' + r.others.map((x) => x.name || x.code).join(', ') + ' ด้วย' : ''), !!(replaced || r.others.length));
        return;
      }
      if (!rec) {
        const text = norm($('#e-subj', dlg).value);
        const code = text.split(' ')[0];
        let found = state.subjects.find((x) => norm(x.code) === code || norm(x.code + ' ' + x.name) === text || norm(x.name) === text);
        if (!found) {
          // รหัสจากรายวิชาสำเร็จรูป (เช่น 2/2568): เพิ่มรายวิชาให้เลย
          const fromCat = catalogMissing().flatMap((c) => c.missing).find((x) => x.code === code);
          if (fromCat) { found = { id: TT.uid('s'), ...fromCat }; state.subjects.push(found); }
        }
        if (!found && /^\d{4,5}[-*]\d{4}$/.test(code)) { toast('ไม่พบรหัสวิชา ' + code + ' เพิ่มได้ที่ ข้อมูล → รายวิชา', true); return; }
        if (!text) { toast('ใส่ชื่อวิชาหรือกิจกรรมก่อน', true); return; }
        a.subjectId = found ? found.id : null;
        a.title = found ? '' : text;
        a.groupIds = draft.groupIds;
        a.plan = $('#e-plan', dlg).value;
        const n = Math.max(1, Math.min(40, Math.round(Number($('#e-hours', dlg).value) || 1)));
        const blocks = norm($('#e-blocks', dlg).value);
        a.blockCourse = $('#e-bc', dlg).checked;
        if (a.plan === 'term') a.blocks = String(n);
        else if (blocks && TT.parsePattern(blocks) && TT.parsePattern(blocks).reduce((x, y) => x + y, 0) === n) a.blocks = blocks;
        else if (blocks && TT.parsePattern(blocks)) { a.blocks = blocks; toast('รูปแบบคาบ ' + blocks + ' ไม่เท่ากับ ' + n + ' ชม. ใช้ตามรูปแบบคาบ', true); }
        else a.blocks = found && TT.subjectHours(found) === n ? '' : TT.defaultPattern(n, a.blockCourse);
        a.hoursPerDay = Number($('#e-hpd', dlg).value) || 4;
        const tot = Math.round(Number($('#e-total', dlg).value) || 0);
        a.totalHours = tot > 0 ? tot : '';
      }
      if (!teacherAct) a.teacherId = $('#e-teacher', dlg).value;
      a.roomId = $('#e-room', dlg).value || null;
      if (isNew) state.assignments.push(a);
      dlg.close();
      commit();
      toast('บันทึกแล้ว');
    };
    const del = $('#e-del', dlg);
    if (del) del.onclick = async () => {
      if (!(await ask({ tone: 'danger', title: 'ลบวิชานี้?', msg: 'คาบที่จัดไว้จะถูกนำออกจากตารางด้วย', ok: 'ลบ' }))) return;
      state.assignments = state.assignments.filter((x) => x !== a);
      dlg.close();
      commit();
    };
    const dup = $('#e-dup', dlg);
    if (dup) dup.onclick = () => {
      dlg.close();
      editAssignment({ ...a, id: TT.uid('a'), groupIds: [], recurringId: undefined }, true);
    };
    dlg.showModal();
  }

  /** ชั่วโมงที่ต้องสอน/จัดแล้ว ของรายการหนึ่ง (รายสัปดาห์ และทั้งเทอม) */
  function hoursInfo(a, idx) {
    const weeks = TT.weeksFor(state, a);
    const weekly = TT.assignmentHours(a, idx.subjects);
    if (TT.isTerm(a)) {
      const st = TT.termStatus(state, a, idx.subjects);
      return { weekly, weeks, total: st.total, placedTotal: st.placed, term: true, custom: Number(a.totalHours) > 0 };
    }
    const lens = TT.assignmentBlocks(a, idx.subjects);
    const placedWeekly = state.placements.filter((p) => p.assignmentId === a.id).reduce((n, p) => n + (lens[p.blockIndex] || 0), 0);
    return { weekly, weeks, total: weekly * weeks, placedWeekly, placedTotal: placedWeekly * weeks, term: false };
  }



  function pickGroups(a, onDone) {
    const dlg = $('#dlg-groups');
    const chosen = new Set(a.groupIds);
    const list = $('.glist', dlg);
    const search = $('input[type=search]', dlg);
    const fill = () => {
      const q = norm(search.value).toLowerCase();
      list.innerHTML = sortGroups(state.groups).map((x) => x.g)
        .filter((g) => chosen.has(g.id) || !q || [g.code, g.name, g.level, g.major].join(' ').toLowerCase().includes(q))
        .map((g) => '<label class="chk"><input type="checkbox" value="' + esc(g.id) + '"' + (chosen.has(g.id) ? ' checked' : '') + '> ' +
          esc(g.name) + ' <small>' + esc(g.code) + (g.level ? ' · ' + esc(g.level) : '') + '</small></label>').join('') ||
        '<p class="hint">ยังไม่มีกลุ่มเรียน เพิ่มได้ที่ ข้อมูล → กลุ่มเรียน</p>';
      $$('input', list).forEach((cb) => (cb.onchange = () => (cb.checked ? chosen.add(cb.value) : chosen.delete(cb.value))));
    };
    search.value = '';
    search.oninput = fill;
    fill();
    $('.dlg-ok', dlg).onclick = () => {
      a.groupIds = state.groups.filter((g) => chosen.has(g.id)).map((g) => g.id);
      dlg.close();
      if (onDone) onDone();
      else commit();
    };
    dlg.showModal();
    search.focus();
  }

  function importAssignments(text) {
    let added = 0;
    const problems = [];
    for (const cells of TT.splitRows(text)) {
      const [tName, subj, groupsText, roomName, pattern, bc, termCol] = cells;
      if (!norm(tName) || /^(ครู|ชื่อครู)$/.test(norm(tName))) continue;
      const teacher = findOrCreate('teachers', tName, { qualification: '', departmentId: '', major: '', duty: '', unavailable: [] });
      const code = norm(subj);
      const sj = state.subjects.find((s) => norm(s.code) === code);
      if (!sj && /^\d{4,5}-\d{4}$/.test(code)) { problems.push('ไม่พบรหัสวิชา ' + code); continue; }
      const groupIds = [];
      for (const gt of String(groupsText || '').split(/[,;]/).map(norm).filter(Boolean)) {
        const g = state.groups.find((x) => norm(x.code) === gt || norm(x.name) === gt);
        if (g) groupIds.push(g.id);
        else problems.push('ไม่พบกลุ่มเรียน ' + gt);
      }
      const room = norm(roomName) && norm(roomName) !== '-' ? findOrCreate('rooms', roomName, { shared: false }) : null;
      state.assignments.push({
        id: TT.uid('a'),
        teacherId: teacher.id,
        subjectId: sj ? sj.id : null,
        title: sj ? '' : code,
        groupIds,
        roomId: room ? room.id : null,
        blocks: TT.parsePattern(pattern) ? norm(pattern) : '',
        blockCourse: /^(1|y|yes|true|ใช่|✓|x)$/i.test(norm(bc)),
        plan: /^(1|y|yes|true|ใช่|✓|x|ทั้งเทอม)$/i.test(norm(termCol)) ? 'term' : 'weekly',
      });
      added++;
    }
    commit();
    if (problems.length) ask({ tone: 'info', title: 'นำเข้า ' + added + ' รายการ แต่มีบางแถวที่ต้องตรวจ', items: [...new Set(problems)].slice(0, 20), cancel: false });
    return 'เพิ่มภาระงาน ' + added + ' รายการ';
  }

  /* -------------------------------- จัดตาราง -------------------------------- */

  const VIEWS = {
    teacher: { label: 'ครู', list: () => state.teachers, name: (x) => x.name, match: (a, id) => a.teacherId === id },
    group: { label: 'กลุ่มเรียน', list: () => state.groups, name: (x) => x.name, match: (a, id) => a.groupIds.includes(id) },
    room: { label: 'ห้อง', list: () => state.rooms, name: (x) => x.name, match: (a, id) => a.roomId === id },
  };

  function parseKey(key) {
    const i = key.lastIndexOf('#');
    return { assignmentId: key.slice(0, i), blockIndex: Number(key.slice(i + 1)) };
  }

  function entityIdsOf(a, view) {
    if (view === 'teacher') return a.teacherId ? [a.teacherId] : [];
    if (view === 'group') return a.groupIds;
    return a.roomId ? [a.roomId] : [];
  }

  /** ชั่วโมงทั้งหมด / ที่วางแล้ว / งานที่เหลือ ของแต่ละคน ในโหมดที่ดูอยู่ */
  function entityStats(blocks) {
    const stats = new Map();
    const bump = (id, total, placed, pending) => {
      if (!stats.has(id)) stats.set(id, { total: 0, placed: 0, pending: 0 });
      const st = stats.get(id);
      st.total += total;
      st.placed += placed;
      st.pending += pending;
    };
    if (ui.cal === 'term') {
      const subjects = new Map(state.subjects.map((x) => [x.id, x]));
      for (const a of state.assignments.filter(TT.isTerm)) {
        const st = TT.termStatus(state, a, subjects);
        entityIdsOf(a, ui.view).forEach((id) => bump(id, st.total, st.placed, st.remaining ? 1 : 0));
      }
    } else {
      for (const b of blocks) entityIdsOf(b.assignment, ui.view).forEach((id) => bump(id, b.len, b.placement ? b.len : 0, b.placement ? 0 : 1));
    }
    return stats;
  }

  function entityGroups(ents, view) {
    const buckets = new Map();
    const put = (k, x) => { if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(x); };
    if (view === 'teacher') {
      const dept = new Map(state.departments.map((d) => [d.id, d.name]));
      ents.forEach((t) => put(dept.get(t.departmentId) || 'ไม่ระบุแผนกวิชา', t));
    } else if (view === 'group') {
      ents.slice().sort((x, y) => TT.gradeRank(TT.groupGrade(state, x)) - TT.gradeRank(TT.groupGrade(state, y)) || String(x.code).localeCompare(String(y.code)))
        .forEach((g) => put(TT.groupGrade(state, g) || 'ไม่ทราบชั้นปี', g));
    } else {
      ents.forEach((r) => put(r.shared ? 'ใช้พร้อมกันได้' : 'ห้องเรียน / โรงฝึกงาน', r));
    }
    return [...buckets.entries()];
  }

  function renderSchedule(el) {
    const v = VIEWS[ui.view];
    const ents = v.list();
    if (!ents.find((x) => x.id === ui.viewId)) ui.viewId = ents[0] ? ents[0].id : '';
    const ent = ents.find((x) => x.id === ui.viewId);
    const blocks = TT.allBlocks(state);
    const conflicts = TT.findConflicts(state);
    const term = ui.cal === 'term';
    if (ui.view === 'room' || !ent || term) ui.mode = 'place';
    const termCount = state.assignments.filter(TT.isTerm).length;

    if (!termCount && term) { ui.cal = 'week'; return renderSchedule(el); }
    el.innerHTML =
      (termCount ? '<div class="seg cal-seg" role="group" aria-label="โหมดตาราง">' +
        '<button data-cal="week" aria-pressed="' + !term + '" class="' + (term ? '' : 'active') + '">ตารางรายสัปดาห์</button>' +
        '<button data-cal="term" aria-pressed="' + term + '" class="' + (term ? 'active' : '') + '">ตารางทั้งเทอม (' + termCount + ' วิชา)</button></div>' : '') +
      '<div class="sched">' +
      '<aside class="side-list" aria-label="รายชื่อ">' +
      '<div class="seg full" role="group" aria-label="มุมมอง">' + Object.entries(VIEWS).map(([k, x]) =>
        '<button data-view="' + k + '" aria-pressed="' + (k === ui.view) + '" class="' + (k === ui.view ? 'active' : '') + '">' + x.label + '</button>').join('') + '</div>' +
      '<label class="search">' + ICON.search + '<input type="search" id="lfilter" aria-label="ค้นหา" placeholder="ค้นหา' + v.label + '" value="' + esc(ui.listFilter) + '"></label>' +
      '<div class="elist" id="elist"></div></aside>' +
      '<section class="sched-main">' + (ent
        ? schedHeader(ent) + (term ? '<div class="sticky-tools">' + termToolbar() + termStrip(ent) + '</div><div class="grid-card" id="termwrap">' + termGrid(ent, conflicts) + '</div>'
          : '<div class="sticky-tools">' + weekToolbar(ent) + '</div><div class="grid-card" id="gridwrap">' + gridFor(ent, conflicts) + '</div>' + legend())
        : '<div class="card empty-state">ยังไม่มี' + v.label + ' เพิ่มได้ที่แท็บ <b>ข้อมูล</b></div>') + '</section>' +
      '<aside class="side-panel">' + (term ? termSide(ent, conflicts) : sidePanel(ent, blocks, conflicts)) + '</aside>' +
      '</div>';

    fillEntityList(blocks);
    $$('[data-cal]', el).forEach((b) => (b.onclick = () => { ui.cal = b.dataset.cal; ui.selected = null; ui.termPick = null; ui.termSel = null; render(); }));
    $$('[data-view]', el).forEach((b) => (b.onclick = () => { ui.view = b.dataset.view; ui.viewId = ''; ui.listFilter = ''; ui.selected = null; ui.termPick = null; ui.termSel = null; render(); }));
    $('#lfilter', el).oninput = (e) => { ui.listFilter = e.target.value; fillEntityList(blocks); };
    $$('[data-gorules]', el).forEach((b) => (b.onclick = () => go('rules')));
    $$('[data-go-check]', el).forEach((b) => (b.onclick = () => go('check')));
    const tw = $('#to-work', el);
    if (tw) tw.onclick = () => { ui.assignTeacher = ent.id; ui.listFilter = ''; go('assign'); };
    const sc = $('#show-conf', el);
    if (sc) sc.onclick = () => { ui.showConflicts = !ui.showConflicts; render(); };
    // คลิกจุดที่ชน: เปิดครู/กลุ่มนั้น สลับโหมดตาราง เลือกคาบ และเลื่อนไปสัปดาห์ที่ชน
    $$('[data-ci]', el).forEach((b) => (b.onclick = () => {
      const c = conflicts.list[Number(b.dataset.ci)];
      if (!c) return;
      // อยู่ที่ครู/กลุ่มที่เกี่ยวข้องอยู่แล้ว → อยู่ที่เดิม ไม่งั้นเปิดคนแรกที่โดน
      const cur = { teacher: 't', group: 'g', room: 'r' }[ui.view] + ':' + ui.viewId;
      const rk = (c.resources || []).includes(cur) ? cur : c.resource;
      if (rk) {
        const t = rk[0];
        ui.view = t === 't' ? 'teacher' : t === 'g' ? 'group' : 'room';
        ui.viewId = rk.slice(2);
        ui.listFilter = '';
      }
      const sk = c.keys.find((k) => k.startsWith('S:'));
      if (sk) { ui.cal = 'term'; ui.termSel = sk.slice(2); ui.termPick = null; ui.selected = null; }
      else { ui.cal = 'week'; ui.selected = c.keys[0] || null; ui.termSel = null; }
      render();
      setTimeout(() => {
        const target = c.week ? $('#tw-' + c.week) : $('#gridwrap');
        const sticky = $('.sticky-tools');
        if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - (sticky ? sticky.offsetHeight : 0) - 80, behavior: 'smooth' });
      }, 60);
    }));
    const ca = $('#clear-all', el);
    if (ca) ca.onclick = async () => {
      if (!(await ask({ tone: 'danger', title: 'ล้างตารางรายสัปดาห์ของทุกคน?', msg: 'นำคาบที่ไม่ได้ล็อกออก (กิจกรรมประจำและคาบที่ล็อกไว้จะอยู่เหมือนเดิม)', ok: 'ล้าง' }))) return;
      state.placements = state.placements.filter((p) => p.locked);
      commit();
    };
    const gt = $('#go-term', el);
    if (gt) gt.onclick = () => { ui.cal = 'term'; ui.selected = null; render(); };
    if (!ent) return;
    if (term) bindTerm(el, ent);
    else bindGrid(el, ent);
  }

  function fillEntityList(blocks) {
    const v = VIEWS[ui.view];
    const q = norm(ui.listFilter).toLowerCase();
    const ents = v.list().filter((x) => !q || [x.name, x.code, x.level, x.major].join(' ').toLowerCase().includes(q));
    const stats = entityStats(blocks);
    const box = $('#elist');
    box.innerHTML = entityGroups(ents, ui.view).map(([name, list]) =>
      '<div class="eg"><div class="eg-name">' + esc(name) + '</div>' + list.map((x) => {
        const st = stats.get(x.id) || { total: 0, placed: 0, pending: 0 };
        const badge = !st.total ? '' : st.pending
          ? '<span class="badge warn" title="' + (ui.cal === 'term' ? 'เหลือ ' + (st.total - st.placed) + ' ชั่วโมง' : 'เหลือ ' + st.pending + ' ก้อน') + '">เหลือ ' + (ui.cal === 'term' ? st.total - st.placed : st.pending) + '</span>'
          : '<span class="badge ok">ครบ</span>';
        return '<button class="eitem' + (x.id === ui.viewId ? ' active' : '') + '" data-ent="' + esc(x.id) + '">' +
          '<span class="ei-text"><span class="ei-name">' + esc(v.name(x)) + '</span><span class="ei-sub">' +
          (ui.view === 'group' ? esc(x.code) + ' · ' : '') + st.placed + ' / ' + st.total + ' ชม.' + (ui.cal === 'term' ? ' ทั้งเทอม' : '') + '</span></span>' + badge + '</button>';
      }).join('') + '</div>').join('') || '<p class="hint">ไม่พบ' + v.label + '</p>';
    $$('[data-ent]', box).forEach((b) => (b.onclick = () => { ui.viewId = b.dataset.ent; ui.selected = null; ui.termPick = null; ui.termSel = null; render(); }));
  }

  function schedHeader(ent) {
    const idx = TT.indexState(state);
    let meta = '';
    if (ui.view === 'teacher') {
      const sum = TT.teacherSummary(state, ent.id);
      const dept = idx.departments.get(ent.departmentId);
      meta = [dept ? 'แผนก' + dept.name : '', sum.totals.h + ' ชม./สัปดาห์', 'ท. ' + sum.totals.t + ' ป. ' + sum.totals.p + ' น. ' + sum.totals.n].filter(Boolean).map(esc).join(' · ');
    } else if (ui.view === 'group') {
      meta = [ent.code, ent.level, ent.major, ent.advisor ? 'ครูที่ปรึกษา ' + ent.advisor : ''].filter(Boolean).map(esc).join(' · ');
    } else {
      meta = !state.settings.checkRooms ? 'ไม่ตรวจห้องชนกัน (เปิดได้ที่เงื่อนไข)' : ent.shared ? 'ใช้พร้อมกันได้หลายกลุ่ม (ไม่ตรวจชน)' : 'ตรวจห้องชนกัน';
    }
    return '<div class="sched-head"><div><h1>' + (ui.view === 'teacher'
      ? '<button class="title-link" id="to-work" title="ดู/เพิ่มรายวิชาที่สอน">' + esc(ent.name) + '<span class="arrow">รายวิชาที่สอน →</span></button>'
      : esc(VIEWS[ui.view].name(ent))) + '</h1><p>' + meta + '</p></div>' +
      (ui.cal === 'term'
        ? '<div class="sched-actions"><button class="btn" id="term-clear">ล้างตารางทั้งเทอมของ' + esc(VIEWS[ui.view].label) + 'นี้</button>' +
          '<button class="btn danger" id="term-clear-all">ล้างตารางทั้งเทอมทั้งหมด</button></div>'
        : '<div class="sched-actions"><button class="btn" id="clear-one">ล้างตารางนี้</button>' +
          '<button class="btn primary" id="auto">' + ICON.check + 'จัดอัตโนมัติ</button></div>') + '</div>';
  }

  /* ---------- ตารางรายสัปดาห์ ---------- */

  /** แถบเครื่องมือ: แสดงตลอด ใช้ได้เมื่อเลือกคาบ */
  /** เครื่องมือของกิจกรรมประจำ (Home Room / PLC) ตอนเลือกก้อนในตาราง */
  function recurringTools(a) {
    const r = state.settings.recurring.find((x) => x.id === a.recurringId);
    if (!r) return '';
    const teacherScope = r.scope === 'teacher';
    const g = !teacherScope && state.groups.find((x) => x.id === (a.groupIds || [])[0]);
    const dayChoices = teacherScope ? state.settings.days.slice() : (openDays().includes(r.day) ? openDays() : [r.day, ...openDays()]);
    const pers = TT.periods(state.settings);
    return '<div class="tool-group rec-tools"><span class="tg-label">' + ICON.lock + '<b>' + esc(r.title) + '</b></span>' +
      (g ? '<label class="tl">ครูที่ปรึกษา ' + esc(g.name || g.code) + '<select id="t-adv">' +
        '<option value="">- ยังไม่มีครู -</option>' + state.teachers.map((t) => '<option value="' + esc(t.id) + '"' + (t.id === a.teacherId ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('') +
        '</select></label>' : '') +
      '</div><div class="tool-group rec-tools"><span class="tg-label">ทุก' + (teacherScope ? 'คน' : 'กลุ่ม') + '</span>' +
      '<select id="t-rday" aria-label="วัน">' + simpleOptions(dayChoices.map((d) => [d, 'วัน' + d]), r.day) + '</select>' +
      '<select id="t-rstart" aria-label="เริ่มคาบ">' + simpleOptions(pers.map((p) => [p.no, 'คาบ ' + p.no + ' · ' + p.start]), r.start) + '</select>' +
      '<select id="t-rlen" aria-label="จำนวนคาบ">' + simpleOptions([1, 2, 3, 4].map((n) => [n, n + ' คาบ']), r.len) + '</select></div>' +
      '<span class="spacer"></span><button class="btn small ghost" id="t-cancel">ยกเลิกการเลือก</button>';
  }

  function weekToolbar(ent) {
    const idx = TT.indexState(state);
    let sel = null;
    if (ui.selected) {
      const { assignmentId, blockIndex } = parseKey(ui.selected);
      const a = idx.assignments.get(assignmentId);
      if (a && !TT.isTerm(a)) {
        const len = TT.assignmentBlocks(a, idx.subjects)[blockIndex];
        if (len) sel = { a, blockIndex, len, pl: TT.findPlacement(state, assignmentId, blockIndex), next: TT.assignmentBlocks(a, idx.subjects)[blockIndex + 1] };
      }
    }
    const can = sel && !sel.a.recurringId;
    const dis = (ok) => (ok ? '' : ' disabled');
    const canUnav = ui.view !== 'room';
    let hint;
    if (!sel) hint = 'คลิกการ์ด "ยังไม่ได้จัด" ทางขวา แล้วคลิกช่องสีเขียวในตาราง · หรือคลิกคาบในตารางเพื่อย้าย/แก้ไข · หรือกด "จัดอัตโนมัติ"';
    else if (sel.a.recurringId) hint = 'กิจกรรมประจำ (ล็อก) · เปลี่ยนครูที่ปรึกษา หรือวัน/เวลาของทุก' + (TT.isTeacherActivity(state, sel.a) ? 'คน' : 'กลุ่ม') + ' ได้จากแถบด้านบน';
    else {
      const sj = sel.a.subjectId ? idx.subjects.get(sel.a.subjectId) : null;
      hint = 'เลือก <b>' + esc(sj ? sj.code : sel.a.title) + '</b> · ' + sel.len + ' คาบ' +
        (sel.pl ? ' · ' + esc(state.settings.days[sel.pl.day]) + ' คาบ ' + sel.pl.start + (sel.len > 1 ? '–' + (sel.pl.start + sel.len - 1) : '') : ' · ยังไม่ได้วาง') +
        ' — คลิกช่องสีเขียวเพื่อ' + (sel.pl ? 'ย้าย' : 'วาง');
    }
    let split = '<option value="">แบ่งเวลา…</option>';
    if (can) for (let h = 1; h < sel.len; h++) split += '<option value="' + h + '">หัว ' + h + ' + ท้าย ' + (sel.len - h) + '</option>';
    return '<div class="tools" role="toolbar" aria-label="เครื่องมือจัดตาราง">' +
      '<div class="tool-group">' + (canUnav
        ? '<div class="seg" role="group" aria-label="โหมด"><button data-mode="place" aria-pressed="' + (ui.mode === 'place') + '" class="' + (ui.mode === 'place' ? 'active' : '') + '">วางคาบ</button>' +
          '<button data-mode="unav" aria-pressed="' + (ui.mode === 'unav') + '" class="' + (ui.mode === 'unav' ? 'active' : '') + '">เวลาไม่ว่าง</button></div>'
        : '') + '</div>' + (sel && sel.a.recurringId ? recurringTools(sel.a) : '') + (!can ? '' :
      '<div class="tool-group"><span class="tg-label">' + ICON.scissors + '</span>' +
      '<select id="t-split" aria-label="แบ่งเวลา"' + dis(can && sel.len > 1) + '>' + split + '</select>' +
      '<button class="btn small" id="t-merge"' + dis(can && sel.next) + '>รวมก้อนถัดไป</button></div>' +
      '<div class="tool-group"><span class="tg-label">หัว</span>' +
      '<button class="btn small" data-rs="1,0"' + dis(can && sel.pl) + ' aria-label="เพิ่มคาบที่หัว">+1</button>' +
      '<button class="btn small" data-rs="-1,0"' + dis(can && sel.pl && sel.len > 1) + ' aria-label="ลดคาบที่หัว">−1</button>' +
      '<span class="tg-label">ท้าย</span>' +
      '<button class="btn small" data-rs="0,1"' + dis(can) + ' aria-label="เพิ่มคาบที่ท้าย">+1</button>' +
      '<button class="btn small" data-rs="0,-1"' + dis(can && sel.len > 1) + ' aria-label="ลดคาบที่ท้าย">−1</button></div>' +
      '<div class="tool-group"><button class="btn small" id="t-lock"' + dis(can && sel.pl) + '>' + ICON.lock + (sel && sel.pl && sel.pl.locked ? 'ปลดล็อก' : 'ล็อก') + '</button>' +
      '<button class="btn small danger" id="t-remove"' + dis(can && sel.pl) + '>เอาออก</button></div>' +
      '<span class="spacer"></span><button class="btn small ghost" id="t-cancel">ยกเลิกการเลือก</button>') +
      '</div><div class="tool-hint' + (sel ? ' on' : '') + '">' + (ui.mode === 'unav'
        ? ICON.info + '<span><b>โหมดเวลาไม่ว่าง:</b> คลิกช่องว่างเพื่อสลับ ว่าง / ไม่ว่าง (ช่องลายเทา = ไม่ว่าง)</span>'
        : ICON.info + '<span>' + hint + '</span>') + '</div>';
  }

  function legend() {
    return '<div class="legend">' +
      '<span><i class="lg c0"></i><i class="lg c3"></i><i class="lg c6"></i>สีตามรายวิชา</span><span><i class="lg can"></i>วางได้</span><span><i class="lg bad"></i>ชนกัน</span>' +
      '<span><i class="lg fixed"></i>กิจกรรมประจำ (ล็อก)</span><span><i class="lg hatch"></i>ห้ามจัด / ไม่ว่าง</span><span class="bc-tag">BC</span><span>= Block Course</span></div>';
  }

  function gridFor(ent, conflicts) {
    const v = VIEWS[ui.view];
    const items = P.cellItems(state, (a) => v.match(a, ent.id), ui.view, true).map((it) => {
      const bad = conflicts.byPlacement.get(it.key);
      it.cls = [it.color, bad ? 'conflict' : '', it.placement.locked ? 'locked' : '', it.recurring ? 'fixed' : '',
        ui.selected === it.key ? 'selected' : '', it.assignment.blockCourse ? 'bc' : '', it.len === 1 ? 'w1' : ''].join(' ');
      if (bad) it.title += '\n⚠ ' + [...bad].join('\n⚠ ');
      if (it.placement.locked) it.html = '<span class="lock" title="ล็อกไว้">' + ICON.lock + '</span>' + it.html;
      return it;
    });
    return buildGrid({ state, items, editable: true, unavailable: new Set(ent.unavailable || []), blocked: TT.blockedCells(state.settings) });
  }

  function blockLabel(a, len, idx, extra) {
    const s = a.subjectId ? idx.subjects.get(a.subjectId) : null;
    const who = ui.view === 'teacher'
      ? a.groupIds.map((g) => (idx.groups.get(g) || {}).name).filter(Boolean).join(', ')
      : (idx.teachers.get(a.teacherId) || {}).name || 'ยังไม่มีครู';
    return '<span class="ch-top"><b>' + esc(s ? s.code : a.title || 'กิจกรรม') + (a.blockCourse ? ' <span class="bc-tag">BC</span>' : '') + '</b><span class="ch-len">' + len + '</span></span>' +
      '<span class="ch-sub">' + esc(s ? s.name : '') + '</span>' +
      (who ? '<span class="ch-who">' + esc(who) + '</span>' : '') + (extra || '');
  }

  function sidePanel(ent, blocks, conflicts) {
    const v = VIEWS[ui.view];
    const idx = TT.indexState(state);
    let html = '';
    if (ent) {
      const mine = blocks.filter((b) => v.match(b.assignment, ent.id));
      const pending = mine.filter((b) => !b.placement);
      const sel = ui.selected && mine.find((b) => b.key === ui.selected);
      const bad = sel && conflicts.byPlacement.get(sel.key);
      if (bad) html += badBox(bad);
      html += '<section class="card"><div class="card-head"><h2>ยังไม่ได้จัด</h2><span class="muted">' + pending.length + ' ก้อน</span></div>' +
        (pending.length
          ? '<p class="hint">ลากการ์ดไปวาง หรือคลิกการ์ดแล้วคลิกช่องสีเขียว</p>' + pending.map((b) => '<button class="chip ' + P.colorClass(state, b.assignment) + (ui.selected === b.key ? ' selected' : '') + '" draggable="true" data-key="' + esc(b.key) + '">' +
            blockLabel(b.assignment, b.len + ' คาบ', idx) + '</button>').join('')
          : '<p class="ok-line">' + ICON.check + 'จัดครบแล้ว</p>') +
        '</section>';
      const termMine = state.assignments.filter((a) => TT.isTerm(a) && v.match(a, ent.id));
      if (termMine.length) {
        html += '<section class="card soft"><h2>ตารางทั้งเทอม</h2><p class="hint">มี ' + termMine.length + ' วิชาที่จัดแบบทั้งเทอม (ไม่อยู่ในตารางรายสัปดาห์)</p>' +
          '<button class="btn small" id="go-term">ไปที่ตารางทั้งเทอม →</button></section>';
      }
    }
    if (conflicts.list.length) html += overviewCard(conflicts, blocks);
    return html;
  }

  function overviewCard(conflicts, blocks) {
    const total = blocks.length;
    const placed = blocks.filter((b) => b.placement).length;
    return '<section class="card"><h2>ภาพรวมทั้งวิทยาลัย</h2>' +
      '<div class="stat"><span>ตารางรายสัปดาห์</span><b>' + placed + ' / ' + total + ' ก้อน</b></div>' +
      '<div class="bar"><i style="width:' + (total ? Math.round((placed / total) * 100) : 0) + '%"></i></div>' +
      (conflicts.list.length
        ? '<button class="linkish bad" id="show-conf">' + ICON.info + 'ชนกัน ' + conflicts.list.length + ' จุด ' + (ui.showConflicts ? '▴' : '▾') + '</button>' +
          (ui.showConflicts ? '<div class="conf-list">' + conflicts.list.map((c, i) =>
            '<button class="conf-item" data-ci="' + i + '" title="คลิกเพื่อไปดูจุดที่ชน">' +
            '<span class="ci-when">' + esc(state.settings.days[c.day]) + ' คาบ ' + c.periods.join(', ') +
            (c.week ? ' <span class="badge warn">ตารางทั้งเทอม · สัปดาห์ที่ ' + c.week + '</span>' : ' <span class="badge">ตารางรายสัปดาห์</span>') + '</span>' +
            '<span class="ci-msg">' + esc(c.message.replace(/ — ตารางทั้งเทอม สัปดาห์ที่ \d+$/, '')) + '</span>' +
            '<span class="ci-go">ไปดูจุดนี้ →</span></button>').join('') + '</div>' : '')
        : '<p class="ok-line">' + ICON.check + 'ไม่มีคาบชนกัน</p>') +
      (ui.lastUnplaced.length ? '<div class="bad-box"><div>' + ICON.info + 'จัดอัตโนมัติแล้ว แต่วางไม่ได้ ' + ui.lastUnplaced.length + ' ก้อน (เวลาเต็ม) ดูรายชื่อที่มีป้าย "เหลือ"</div>' +
        '<button class="linkish" id="dismiss-un">ปิด</button></div>' : '') +
      (TT.checkData(state).length ? '<button class="linkish" data-go-check>' + ICON.info + 'มีเรื่องที่ควรตรวจ ' + TT.checkData(state).length + ' เรื่อง (กลุ่มซ้ำ ฯลฯ) →</button>' : '') +
      (ui.cal === 'term' ? '' : '<button class="btn small ghost" id="clear-all">ล้างคาบที่ไม่ล็อกทั้งหมด</button>') +
      '</section>';
  }

  function rulesCard() {
    const s = state.settings;
    return '<section class="card"><div class="card-head"><h2>เงื่อนไขที่ใช้อยู่</h2><button class="linkish" data-gorules>แก้ไข</button></div><ul class="rule-list">' +
      s.recurring.map((r) => '<li><i class="dot accent"></i><span><b>' + esc(r.title) + '</b> ทุกวัน' + esc(r.day) + ' คาบ ' + r.start + (r.len > 1 ? '–' + (r.start + r.len - 1) : '') +
        (state.assignments.some((a) => a.recurringId === r.id) ? '' : ' <span class="muted">(ยังไม่ได้สร้าง)</span>') + '</span></li>').join('') +
      s.closedDays.filter((d) => s.days.includes(d)).map((d) => '<li><i class="dot"></i><span><b>วัน' + esc(d) + '</b> ห้ามจัดตาราง</span></li>').join('') +
      s.blocked.map((b) => '<li><i class="dot"></i><span><b>' + esc(b.label || 'ห้ามจัด') + '</b> วัน' + esc(b.day) + ' คาบ ' + b.from + (b.to > b.from ? '–' + b.to : '') + '</span></li>').join('') +
      '<li><i class="dot"></i><span>ก้อนคาบข้ามช่วงพักได้เฉพาะ Block Course</span></li></ul></section>';
  }

  function highlight(key) {
    clearHighlight();
    if (!key) return;
    const { assignmentId, blockIndex } = parseKey(key);
    const a = state.assignments.find((x) => x.id === assignmentId);
    if (!a || a.recurringId) return;
    const idx = TT.indexState(state);
    const cache = { idx, pers: TT.periods(state.settings), occ: TT.buildOccupancy(state, idx, key), blocked: TT.blockedCells(state.settings) };
    const len = TT.assignmentBlocks(a, idx.subjects)[blockIndex];
    $$('#gridwrap td.empty[data-p]').forEach((td) => {
      const d = Number(td.dataset.d);
      const p = Number(td.dataset.p);
      const st = TT.snapStart(state, a, blockIndex, d, p, cache);
      if (st == null) {
        td.classList.add('nospan');
        td.title = TT.checkPlacement(state, a, blockIndex, d, p, cache).reasons.join('\n');
        return;
      }
      const r = TT.checkPlacement(state, a, blockIndex, d, st, cache);
      const span = 'คาบ ' + st + (len > 1 ? '–' + (st + len - 1) : '');
      td.classList.add(r.ok ? 'can' : 'clash');
      td.title = (r.ok ? 'วางได้: ' : 'ชน: ') + span + (r.ok ? '' : '\n' + r.reasons.join('\n'));
    });
  }

  function clearHighlight() {
    $$('#gridwrap td.can, #gridwrap td.clash, #gridwrap td.nospan').forEach((td) => {
      td.classList.remove('can', 'clash', 'nospan');
      td.removeAttribute('title');
    });
  }

  async function placeAt(key, day, start) {
    const { assignmentId, blockIndex } = parseKey(key);
    const a = state.assignments.find((x) => x.id === assignmentId);
    if (!a) return;
    if (a.recurringId) { toast('กิจกรรมประจำย้ายได้ที่หน้าเงื่อนไข', true); return; }
    // คลิก/วางที่ไหนก็ได้ในช่วงของก้อน ระบบเลื่อนคาบเริ่มให้พอดี (เช่น ก้อน 3 คาบ คลิก 20:00 → 19:00–22:00)
    const snapped = TT.snapStart(state, a, blockIndex, day, start);
    if (snapped == null) { toast(TT.checkPlacement(state, a, blockIndex, day, start).reasons[0], true); return; }
    start = snapped;
    const r = TT.checkPlacement(state, a, blockIndex, day, start);
    if (!r.ok && !(await conflictAsk(r.reasons, 'วาง'))) return;
    const old = TT.findPlacement(state, assignmentId, blockIndex);
    state.placements = state.placements.filter((p) => p !== old);
    state.placements.push({ assignmentId, blockIndex, day, start, locked: old ? old.locked : false });
    ui.selected = null;
    commit();
  }

  function toggleUnavailable(ent, day, p) {
    const k = TT.cellKey(day, p);
    ent.unavailable = ent.unavailable || [];
    const i = ent.unavailable.indexOf(k);
    if (i >= 0) ent.unavailable.splice(i, 1);
    else ent.unavailable.push(k);
    commit();
  }

  function bindGrid(el, ent) {
    const v = VIEWS[ui.view];
    const wrap = $('#gridwrap', el);
    wrap.onclick = (e) => {
      const td = e.target.closest('td[data-p]');
      if (!td) return;
      const d = Number(td.dataset.d);
      const p = Number(td.dataset.p);
      if (ui.mode === 'unav') {
        if (!td.dataset.key) toggleUnavailable(ent, d, p);
        return;
      }
      if (td.dataset.key) {
        ui.selected = ui.selected === td.dataset.key ? null : td.dataset.key;
        render();
      } else if (ui.selected) {
        placeAt(ui.selected, d, p);
      }
    };
    const startDrag = (e, key) => {
      if (ui.mode !== 'place') return e.preventDefault();
      e.dataTransfer.setData('text/plain', key);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => highlight(key), 0);
    };
    $$('[draggable][data-key]', el).forEach((n) => {
      n.ondragstart = (e) => startDrag(e, n.dataset.key);
      n.ondragend = clearHighlight;
    });
    wrap.ondragover = (e) => { if (e.target.closest('td[data-p]')) e.preventDefault(); };
    wrap.ondrop = (e) => {
      const td = e.target.closest('td[data-p]');
      const key = e.dataTransfer.getData('text/plain');
      if (!td || !key) return;
      e.preventDefault();
      placeAt(key, Number(td.dataset.d), Number(td.dataset.p));
    };
    $$('.chip[data-key]', el).forEach((c) => (c.onclick = () => { ui.selected = ui.selected === c.dataset.key ? null : c.dataset.key; render(); }));
    $$('[data-mode]', el).forEach((b) => (b.onclick = () => { ui.mode = b.dataset.mode; ui.selected = null; render(); }));
    const on = (sel, fn) => { const b = $(sel, el); if (b) b.onclick = fn; };
    on('#auto', runAuto);
    on('#clear-one', async () => {
      if (!(await ask({ tone: 'danger', title: 'ล้างตารางของ "' + v.name(ent) + '"?', msg: 'นำคาบที่ไม่ได้ล็อกออกจากตาราง', ok: 'ล้าง' }))) return;
      const ids = new Set(state.assignments.filter((a) => v.match(a, ent.id)).map((a) => a.id));
      state.placements = state.placements.filter((p) => p.locked || !ids.has(p.assignmentId));
      commit();
    });
    on('#dismiss-un', () => { ui.lastUnplaced = []; render(); });

    if (!ui.selected) return;
    const { assignmentId, blockIndex } = parseKey(ui.selected);
    const cur = TT.findPlacement(state, assignmentId, blockIndex);
    on('#t-cancel', () => { ui.selected = null; render(); });
    const selA = state.assignments.find((x) => x.id === assignmentId);
    const advSel = $('#t-adv', el);
    if (advSel && selA) advSel.onchange = async () => {
      const g = state.groups.find((x) => x.id === selA.groupIds[0]) || {};
      if (!(await chooseAdvisor(g.id, advSel.value))) { render(); return; }
      commit();
      const t = state.teachers.find((x) => x.id === advSel.value);
      toast(t ? 'ครูที่ปรึกษา ' + (g.name || g.code) + ' → ' + t.name : (g.name || g.code) + ' ยังไม่มีครูที่ปรึกษา');
    };
    ['day', 'start', 'len'].forEach((k) => {
      const inp = $('#t-r' + k, el);
      const rec = selA && state.settings.recurring.find((x) => x.id === selA.recurringId);
      if (!inp || !rec) return;
      inp.onchange = async () => {
        // ลองย้ายในสำเนาก่อน ถ้าจะชนกับวิชาที่จัดไว้ ถามก่อน
        const trial = JSON.parse(JSON.stringify(state));
        const tr = trial.settings.recurring.find((x) => x.id === rec.id);
        tr[k] = k === 'day' ? inp.value : Number(inp.value);
        const res = TT.applyRecurring(trial, rec.id);
        if (res.error) { toast(res.error, true); render(); return; }
        const mine = new Set(trial.assignments.filter((x) => x.recurringId === rec.id).map((x) => x.id));
        const clashes = TT.findConflicts(trial).list.filter((c) => c.keys.some((key) => mine.has(key.split('#')[0])));
        const conf = clashes.length;
        if (conf && !(await ask({ title: 'ย้าย ' + rec.title + ' แล้วจะชนกัน ' + conf + ' จุด', items: clashes.slice(0, 6).map((c) => c.message).concat(conf > 6 ? ['… อีก ' + (conf - 6) + ' จุด'] : []),
          q: 'ย้ายต่อไหม? (วิชาที่ชนต้องย้ายออกเองภายหลัง)', ok: 'ย้ายต่อ', cancel: 'ไม่ย้าย' }))) { render(); return; }
        rec[k] = tr[k];
        TT.applyRecurring(state, rec.id);
        commit();
        toast('ย้าย ' + rec.title + ' ทุก' + (rec.scope === 'teacher' ? 'คน' : 'กลุ่ม') + ' ไปวัน' + rec.day + ' คาบ ' + rec.start + (rec.len > 1 ? '–' + (rec.start + rec.len - 1) : '') +
          (conf ? ' · ชนกับวิชาที่จัดไว้ ' + conf + ' จุด (ดูที่รายการชนกัน)' : ''), !!conf);
      };
    });
    on('#t-lock', () => { cur.locked = !cur.locked; commit(); });
    on('#t-remove', () => { state.placements = state.placements.filter((p) => p !== cur); ui.selected = null; commit(); });
    on('#t-merge', () => {
      TT.mergeWithNext(state, assignmentId, blockIndex);
      commit();
      if (cur && !TT.findPlacement(state, assignmentId, blockIndex)) toast('รวมแล้ว แต่ก้อนใหม่คร่อมช่วงพัก จึงย้ายไปรอจัดใหม่', true);
    });
    const sp = $('#t-split', el);
    if (sp) sp.onchange = () => {
      if (!sp.value) return;
      TT.splitBlock(state, assignmentId, blockIndex, Number(sp.value));
      commit();
      toast('แบ่งแล้ว ลากส่วนท้ายไปวางที่อื่นได้');
    };
    $$('[data-rs]', el).forEach((b) => (b.onclick = () => {
      const [dh, dt] = b.dataset.rs.split(',').map(Number);
      const r = TT.resizeBlock(state, assignmentId, blockIndex, dh, dt);
      if (!r.ok) { toast(r.reason, true); return; }
      commit();
      const bad = TT.findConflicts(state).byPlacement.get(ui.selected);
      if (bad) toast('ปรับแล้ว แต่ชนกัน: ' + [...bad][0], true);
    }));
    if (ui.mode === 'place') highlight(ui.selected);
  }

  function runAuto() {
    const pending = TT.allBlocks(state).filter((b) => !b.placement).length;
    if (!pending) { toast('ทุกก้อนถูกจัดแล้ว ถ้าต้องการจัดใหม่ให้กด "ล้างคาบที่ไม่ล็อกทั้งหมด" ก่อน'); return; }
    const btn = $('#auto');
    btn.disabled = true;
    btn.textContent = 'กำลังจัด…';
    setTimeout(() => {
      const res = TT.autoSchedule(state, { timeLimit: 4000 });
      state.placements.push(...res.placements);
      ui.lastUnplaced = res.unplaced;
      ui.selected = null;
      commit();
      toast(res.complete ? 'จัดครบทั้งหมด ' + res.placements.length + ' ก้อน' : 'วางได้ ' + res.placements.length + ' ก้อน · วางไม่ได้ ' + res.unplaced.length + ' ก้อน', !res.complete);
    }, 30);
  }

  /* ---------- ตารางทั้งเทอม ---------- */

  function termToolbar() {
    const x = ui.termSel && state.sessions.find((y) => y.id === ui.termSel);
    const dis = (ok) => (ok ? '' : ' disabled');
    const idx = TT.indexState(state);
    let hint;
    if (x) {
      const a = idx.assignments.get(x.assignmentId);
      const sj = a && a.subjectId ? idx.subjects.get(a.subjectId) : null;
      const pers = TT.periods(state.settings);
      hint = 'เลือก <b>' + esc(sj ? sj.code : a.title) + '</b> สัปดาห์ที่ ' + x.week + ' วัน' + esc(state.settings.days[x.day]) + ' คาบ ' + x.start + '–' + (x.start + x.len - 1) +
        ' (' + (pers[x.start - 1] || {}).start + '–' + (pers[x.start + x.len - 2] || {}).end + ', ' + x.len + ' ชม.) — คลิกช่องสีเขียวเพื่อย้าย (สัปดาห์ไหนก็ได้) หรือลากไปวาง';
    } else if (ui.termPick) {
      const a = idx.assignments.get(ui.termPick);
      const sj = a && a.subjectId ? idx.subjects.get(a.subjectId) : null;
      const st = a && TT.termStatus(state, a, idx.subjects);
      hint = a ? 'กำลังวาง <b>' + esc(sj ? sj.code : a.title) + '</b> ครั้งละ ' + Math.min(st.hpd, st.remaining) + ' ชม. เหลือ ' + st.remaining + ' ชม. — คลิกช่องสีเขียวในตารางสัปดาห์ไหนก็ได้ ต่อไปเรื่อย ๆ จนครบ' : '';
    } else hint = 'เลือกวิชาทางขวา แล้วคลิกคาบในตารางของสัปดาห์ที่ต้องการ (หรือลากวาง) · สีเทา = ตารางรายสัปดาห์ · คลิกช่องสีที่วางแล้วเพื่อใช้เครื่องมือหรือย้าย';
    let split = '<option value="">แบ่งเวลา…</option>';
    if (x) for (let h = 1; h < x.len; h++) split += '<option value="' + h + '">หัว ' + h + ' + ท้าย ' + (x.len - h) + '</option>';
    if (!x) {
      return '<div class="tools" role="toolbar" aria-label="เครื่องมือตารางทั้งเทอม"><div class="tool-hint on">' + ICON.info + '<span>' + hint + '</span></div></div>';
    }
    return '<div class="tools" role="toolbar" aria-label="เครื่องมือตารางทั้งเทอม">' +
      '<div class="tool-group"><span class="tg-label">' + ICON.scissors + '</span>' +
      '<select id="ts-split" aria-label="แบ่งเวลา"' + dis(x && x.len > 1) + '>' + split + '</select></div>' +
      '<div class="tool-group"><span class="tg-label">หัว</span>' +
      '<button class="btn small" data-trs="1,0"' + dis(x && x.start > 1) + ' aria-label="เพิ่มชั่วโมงที่หัว">+1</button>' +
      '<button class="btn small" data-trs="-1,0"' + dis(x && x.len > 1) + ' aria-label="ลดชั่วโมงที่หัว">−1</button>' +
      '<span class="tg-label">ท้าย</span>' +
      '<button class="btn small" data-trs="0,1"' + dis(x) + ' aria-label="เพิ่มชั่วโมงที่ท้าย">+1</button>' +
      '<button class="btn small" data-trs="0,-1"' + dis(x && x.len > 1) + ' aria-label="ลดชั่วโมงที่ท้าย">−1</button></div>' +
      '<div class="tool-group"><button class="btn small danger" id="ts-remove"' + dis(x) + '>เอาออก</button></div>' +
      '<span class="spacer"></span><button class="btn small ghost" id="ts-cancel">ยกเลิกการเลือก</button>' +
      '</div><div class="tool-hint' + (x || ui.termPick ? ' on' : '') + '">' + ICON.info + '<span>' + hint + '</span></div>';
  }

  /** แถบเลขสัปดาห์ (ค้างไว้ใต้หัวหน้าเว็บ) คลิกเพื่อเลื่อนไปตารางสัปดาห์นั้น */
  function termStrip(ent) {
    const v = VIEWS[ui.view];
    const idx = TT.indexState(state);
    const hrs = new Map();
    for (const x of state.sessions) {
      const a = idx.assignments.get(x.assignmentId);
      if (a && v.match(a, ent.id)) hrs.set(x.week, (hrs.get(x.week) || 0) + x.len);
    }
    let html = '<nav class="week-strip" aria-label="ไปยังสัปดาห์"><span class="ws-label">สัปดาห์</span>';
    for (let w = 1; w <= state.settings.weeks; w++) {
      const h = hrs.get(w) || 0;
      html += '<button data-jump="' + w + '" class="' + (h ? 'has' : '') + '" title="สัปดาห์ที่ ' + w + (h ? ' · ทั้งเทอม ' + h + ' ชม.' : '') + '"><b>' + w + '</b><small>' + (h ? h + 'ชม.' : '–') + '</small></button>';
    }
    return html + '</nav>';
  }

  /** ตารางทั้งเทอม = ตาราง วัน × คาบ แบบเดียวกับรายสัปดาห์ 18 ตาราง (สัปดาห์ละ 1 ตาราง) */
  function termGrid(ent, conflicts) {
    const s = state.settings;
    const v = VIEWS[ui.view];
    const idx = TT.indexState(state);
    const blocked = TT.blockedCells(s);
    const unav = new Set(ent.unavailable || []);
    // ตารางรายสัปดาห์ของคนนี้ แสดงเป็นสีเทาในทุกสัปดาห์ (แก้ไม่ได้จากตรงนี้)
    const weekly = P.cellItems(state, (a) => v.match(a, ent.id), ui.view, true).map((it) => ({
      ...it, static: true, cls: 'ghost' + (it.recurring ? ' fixed' : ''), title: it.title + '\n(ตารางรายสัปดาห์ — ทุกสัปดาห์)',
    }));
    const byWeek = new Map();
    for (const x of state.sessions) {
      const a = idx.assignments.get(x.assignmentId);
      if (!a || !v.match(a, ent.id)) continue;
      if (!byWeek.has(x.week)) byWeek.set(x.week, []);
      byWeek.get(x.week).push({ x, a });
    }
    const sessItem = ({ x, a }) => {
      const sj = a.subjectId ? idx.subjects.get(a.subjectId) : null;
      const room = a.roomId ? idx.rooms.get(a.roomId) : null;
      const teacher = idx.teachers.get(a.teacherId);
      const groups = a.groupIds.map((g) => (idx.groups.get(g) || {}).name).filter(Boolean);
      const lines = [esc(sj ? sj.code : a.title) + ' <small>' + x.len + ' ชม.</small>'];
      if (ui.view !== 'room' && room) lines.push(esc(room.name));
      if (ui.view !== 'teacher') lines.push(teacher ? esc(teacher.name) : '<span class="no-teacher">ยังไม่มีครู</span>');
      if (ui.view !== 'group' && groups.length) lines.push(esc(groups.join(', ')));
      const bad = conflicts.byPlacement.get('S:' + x.id);
      return {
        key: 'S:' + x.id,
        day: x.day,
        start: x.start,
        len: x.len,
        cls: [P.colorClass(state, a), bad ? 'conflict' : '', ui.termSel === x.id ? 'selected' : '', x.len === 1 ? 'w1' : ''].join(' '),
        title: (sj ? sj.code + ' ' + sj.name : a.title) + '\nสัปดาห์ที่ ' + x.week + (bad ? '\n⚠ ' + [...bad].join('\n⚠ ') : ''),
        html: lines.map((l, i) => '<div class="' + (i ? 'c-line' : 'c-code') + '">' + l + '</div>').join(''),
      };
    };
    let grids = '';
    for (let w = 1; w <= s.weeks; w++) {
      const list = byWeek.get(w) || [];
      const hrs = list.reduce((n, it) => n + it.x.len, 0);
      const ended = ui.view === 'group' && w > TT.weeksForGroup(state, ent);
      grids += '<div class="term-week' + (ended ? ' ended' : '') + '" data-week="' + w + '" id="tw-' + w + '">' +
        '<div class="tw-head"><b>สัปดาห์ที่ ' + w + '</b><span>' + (ended ? 'จบภาคเรียน ' + TT.groupLevel(ent) + ' แล้ว (' + TT.weeksForGroup(state, ent) + ' สัปดาห์)'
          : hrs ? 'ทั้งเทอม ' + hrs + ' ชม.' : 'ยังไม่มีวิชาทั้งเทอม') + '</span></div>' +
        buildGrid({ state, items: weekly.concat(list.map(sessItem)), editable: true, unavailable: unav, blocked }) + '</div>';
    }
    return '<div class="legend term-legend"><span><i class="lg ghost"></i>ตารางรายสัปดาห์ (ทุกสัปดาห์)</span><span><i class="lg c0"></i><i class="lg c3"></i><i class="lg c6"></i>วิชาทั้งเทอม</span>' +
      '<span><i class="lg can"></i>วางได้</span><span><i class="lg hatch"></i>ห้ามจัด / ไม่ว่าง</span></div>' + grids;
  }

  function termSide(ent, conflicts) {
    if (!ent) return rulesCard();
    const v = VIEWS[ui.view];
    const idx = TT.indexState(state);
    const mine = state.assignments.filter((a) => TT.isTerm(a) && v.match(a, ent.id));
    let html = '<section class="card"><div class="card-head"><h2>วิชาทั้งเทอม</h2><span class="muted">' + mine.length + ' วิชา</span></div>';
    if (!mine.length) {
      html += '<p class="hint">ยังไม่มีวิชาที่จัดแบบทั้งเทอม ตั้งได้ที่หน้า <b>ภาระงานสอน</b> → ช่อง "การจัด" เลือก "ทั้งเทอม"</p>';
    } else {
      html += mine.map((a) => {
        const st = TT.termStatus(state, a, idx.subjects);
        const pct = st.total ? Math.round((st.placed / st.total) * 100) : 0;
        return '<div class="term-item' + (ui.termPick === a.id ? ' picked' : '') + '">' +
          '<button class="chip ' + P.colorClass(state, a) + (ui.termPick === a.id ? ' selected' : '') + '" draggable="true" data-term="' + esc(a.id) + '">' +
          blockLabel(a, st.placed + '/' + st.total + ' ชม.', idx,
            '<span class="bar mini"><i style="width:' + pct + '%"></i></span>' +
            '<span class="ch-who">ครบ ' + st.total + ' ชม. = ' + st.fullDays + ' วัน' + (st.extra ? ' + ' + st.extra + ' ชม.' : '') + ' · วางแล้ว ' + st.days + ' วัน</span>') +
          '</button>' +
          '<div class="term-ctl"><label>วันละ <input type="number" min="1" max="13" data-hpd="' + esc(a.id) + '" value="' + st.hpd + '" aria-label="ชั่วโมงต่อวัน"> ชม.</label>' +
          '<label>เริ่มคาบ <select data-tstart="' + esc(a.id) + '" aria-label="คาบเริ่มที่ต้องการ">' + simpleOptions(TT.periods(state.settings).map((p) => [p.no, String(p.no)]), a.termStart || 1) + '</select></label></div>' +
          '<div class="term-ctl"><label>เติมอัตโนมัติตั้งแต่สัปดาห์ <select data-tfrom="' + esc(a.id) + '" aria-label="เริ่มสัปดาห์">' +
          simpleOptions(Array.from({ length: state.settings.weeks }, (_, i) => i + 1), 1) + '</select></label>' +
          '<button class="btn small" data-tfill="' + esc(a.id) + '"' + (st.remaining ? '' : ' disabled') + '>เติม</button>' +
          '<button class="btn small ghost" data-tclr="' + esc(a.id) + '"' + (st.placed ? '' : ' disabled') + '>ล้าง</button></div></div>';
      }).join('');
    }
    html += '</section>';
    const bad = ui.termSel && conflicts.byPlacement.get('S:' + ui.termSel);
    if (bad) html = badBox(bad) + html;
    return html;
  }

  function highlightTerm(assignmentId, skipId) {
    $$('#termwrap td.can, #termwrap td.clash, #termwrap td.nospan').forEach((td) => {
      td.classList.remove('can', 'clash', 'nospan');
      td.removeAttribute('title');
    });
    const a = state.assignments.find((x) => x.id === assignmentId);
    if (!a) return;
    const moving = skipId && state.sessions.find((y) => y.id === skipId);
    const st = TT.termStatus(state, a);
    const len = moving ? moving.len : Math.min(st.hpd, st.remaining);
    if (!len) return;
    const cache = TT.termCache(state, skipId);
    $$('#termwrap [data-week]').forEach((wk) => {
      const w = Number(wk.dataset.week);
      $$('td.empty[data-p]', wk).forEach((td) => {
        const d = Number(td.dataset.d);
        const start = TT.snapSession(state, a, w, d, Number(td.dataset.p), len, skipId, cache);
        if (start == null) { td.classList.add('nospan'); return; }
        const r = TT.checkSession(state, a, w, d, start, len, skipId, cache);
        td.classList.add(r.ok ? 'can' : 'clash');
        td.title = (r.ok ? 'วางได้: ' : 'ชน: ') + 'คาบ ' + start + '–' + (start + len - 1) + (r.ok ? '' : '\n' + r.reasons.join('\n'));
      });
    });
  }

  /** วางวิชาทั้งเทอมที่สัปดาห์/วัน/คาบที่คลิก (เลื่อนคาบเริ่มให้พอดี ถ้าว่างไม่พอจะลดชั่วโมงลง) */
  async function termPlace(assignmentId, week, day, p) {
    const a = state.assignments.find((x) => x.id === assignmentId);
    if (!a) return;
    const st = TT.termStatus(state, a);
    if (!st.remaining) { toast('ครบ ' + st.total + ' ชั่วโมงแล้ว', true); return; }
    const cache = TT.termCache(state);
    let len = Math.min(st.hpd, st.remaining);
    let start = null;
    for (let n = len; n >= 1 && start == null; n--) {
      const s0 = TT.snapSession(state, a, week, day, p, n, null, cache);
      if (s0 != null && TT.checkSession(state, a, week, day, s0, n, null, cache).ok) { start = s0; len = n; }
    }
    if (start == null) {
      start = TT.snapSession(state, a, week, day, p, len, null, cache);
      if (start == null) { toast('ช่วงนี้วาง ' + len + ' ชม. ไม่ได้ (เลยคาบสุดท้าย)', true); return; }
      const chk = TT.checkSession(state, a, week, day, start, len, null, cache);
      if (!(await conflictAsk(chk.reasons, 'วาง'))) return;
    }
    TT.addSession(state, assignmentId, week, day, { start, len });
    const after = TT.termStatus(state, a);
    if (!after.remaining) { ui.termPick = null; toast('ครบ ' + after.total + ' ชั่วโมงแล้ว (' + after.days + ' วัน)'); }
    else if (len < Math.min(st.hpd, st.remaining)) toast('ช่วงนั้นว่างไม่พอ วางได้ ' + len + ' ชม. เหลืออีก ' + after.remaining + ' ชม.');
    commit();
  }

  /** ย้ายวันที่วางไว้ ไปสัปดาห์/วัน/คาบใหม่ */
  async function termMove(sessionId, week, day, p) {
    const x = state.sessions.find((y) => y.id === sessionId);
    if (!x) return;
    const a = state.assignments.find((y) => y.id === x.assignmentId);
    const start = TT.snapSession(state, a, week, day, p, x.len, x.id);
    if (start == null) { toast('ช่วงนี้วาง ' + x.len + ' ชม. ไม่ได้ (เลยคาบสุดท้าย)', true); return; }
    const chk = TT.checkSession(state, a, week, day, start, x.len, x.id);
    if (!chk.ok && !(await conflictAsk(chk.reasons, 'ย้าย'))) return;
    Object.assign(x, { week, day, start });
    commit();
  }

  function bindTerm(el, ent) {
    const wrap = $('#termwrap', el);
    const v = VIEWS[ui.view];
    const at = (td) => [Number(td.closest('[data-week]').dataset.week), Number(td.dataset.d), Number(td.dataset.p)];
    $$('[data-jump]', el).forEach((b) => (b.onclick = () => {
      const t = $('#tw-' + b.dataset.jump);
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    wrap.onclick = (e) => {
      const td = e.target.closest('[data-week] td[data-p]');
      if (!td) return;
      const key = td.dataset.key;
      if (key && key.startsWith('S:')) { const id = key.slice(2); ui.termSel = ui.termSel === id ? null : id; ui.termPick = null; render(); return; }
      if (ui.mode === 'unav' || key) return;
      if (ui.termPick) termPlace(ui.termPick, ...at(td));
      else if (ui.termSel) termMove(ui.termSel, ...at(td));
    };
    wrap.ondragover = (e) => { if (e.target.closest('[data-week] td[data-p]')) e.preventDefault(); };
    wrap.ondrop = (e) => {
      const td = e.target.closest('[data-week] td[data-p]');
      const data = e.dataTransfer.getData('text/plain');
      if (!td || !data) return;
      e.preventDefault();
      const [kind, id] = data.split(':');
      if (kind === 'term') termPlace(id, ...at(td));
      else if (kind === 'sess') termMove(id, ...at(td));
    };
    $$('#termwrap td[data-key^="S:"]', el).forEach((n) => (n.ondragstart = (e) => {
      const id = n.dataset.key.slice(2);
      e.dataTransfer.setData('text/plain', 'sess:' + id);
      const x = state.sessions.find((y) => y.id === id);
      if (x) setTimeout(() => highlightTerm(x.assignmentId, id), 0);
    }));
    $$('[data-term]', el).forEach((c) => {
      c.onclick = () => { ui.termPick = ui.termPick === c.dataset.term ? null : c.dataset.term; ui.termSel = null; render(); };
      c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', 'term:' + c.dataset.term); setTimeout(() => highlightTerm(c.dataset.term), 0); };
    });
    $$('[data-hpd]', el).forEach((inp) => (inp.onchange = () => {
      const a = state.assignments.find((x) => x.id === inp.dataset.hpd);
      a.hoursPerDay = Math.max(1, Math.min(13, Number(inp.value) || 4));
      commit();
    }));
    $$('[data-tstart]', el).forEach((sel) => (sel.onchange = () => {
      const a = state.assignments.find((x) => x.id === sel.dataset.tstart);
      a.termStart = Number(sel.value) || 1;
      commit();
    }));
    $$('[data-tfill]', el).forEach((b) => (b.onclick = () => {
      const id = b.dataset.tfill;
      const from = Number($('[data-tfrom="' + id + '"]', el).value) || 1;
      const r = TT.fillTerm(state, id, from);
      commit();
      toast(r.remaining ? 'เติมได้ ' + r.added + ' ชม. ยังเหลือ ' + r.remaining + ' ชม. (เวลาไม่พอ)' : 'เติมครบแล้ว (' + r.added + ' ชม.)', !!r.remaining);
    }));
    $$('[data-tclr]', el).forEach((b) => (b.onclick = async () => {
      if (!(await ask({ tone: 'danger', title: 'ล้างวันที่วางไว้ทั้งหมดของวิชานี้?', ok: 'ล้าง' }))) return;
      state.sessions = state.sessions.filter((x) => x.assignmentId !== b.dataset.tclr);
      commit();
    }));
    const clr = $('#term-clear', el);
    if (clr) clr.onclick = async () => {
      if (!(await ask({ tone: 'danger', title: 'ล้างตารางทั้งเทอมของ "' + v.name(ent) + '"?', msg: 'วันที่วางไว้ทั้งหมดของทุกวิชาจะถูกนำออก', ok: 'ล้าง' }))) return;
      const ids = new Set(state.assignments.filter((a) => v.match(a, ent.id)).map((a) => a.id));
      state.sessions = state.sessions.filter((x) => !ids.has(x.assignmentId));
      ui.termSel = null;
      commit();
    };
    const clrAll = $('#term-clear-all', el);
    if (clrAll) clrAll.onclick = async () => {
      const n = state.sessions.length;
      if (!n) { toast('ยังไม่มีวันที่วางไว้ในตารางทั้งเทอม'); return; }
      const subj = new Set(state.sessions.map((x) => x.assignmentId)).size;
      if (!(await ask({ tone: 'danger', title: 'ล้างตารางทั้งเทอมทั้งหมด (ทุกครู ทุกกลุ่ม)?',
        msg: 'วันที่วางไว้ ' + n + ' วัน ของ ' + subj + ' วิชาจะถูกนำออกทั้งหมด · ตารางรายสัปดาห์ไม่เปลี่ยน · ควรบันทึกไฟล์สำรองก่อน', ok: 'ล้างทั้งหมด' }))) return;
      state.sessions = [];
      ui.termSel = null;
      ui.termPick = null;
      commit();
      toast('ล้างตารางทั้งเทอมแล้ว ' + n + ' วัน');
    };
    $$('[data-trs]', el).forEach((b) => (b.onclick = () => {
      const [dh, dt] = b.dataset.trs.split(',').map(Number);
      const r = TT.resizeSession(state, ui.termSel, dh, dt);
      if (!r.ok) { toast(r.reason, true); return; }
      commit();
      const bad = TT.findConflicts(state).byPlacement.get('S:' + ui.termSel);
      if (bad) toast('ปรับแล้ว แต่ชนกัน: ' + [...bad][0], true);
    }));
    const tsp = $('#ts-split', el);
    if (tsp) tsp.onchange = () => {
      if (!tsp.value) return;
      TT.splitSession(state, ui.termSel, Number(tsp.value));
      commit();
      toast('แบ่งแล้ว คลิก/ลากส่วนท้ายไปวางวันหรือสัปดาห์อื่นได้');
    };
    const tc = $('#ts-cancel', el);
    if (tc) tc.onclick = () => { ui.termSel = null; render(); };
    const rm = $('#ts-remove', el);
    if (rm) rm.onclick = () => { state.sessions = state.sessions.filter((x) => x.id !== ui.termSel); ui.termSel = null; commit(); };
    if (ui.termPick) highlightTerm(ui.termPick);
    else if (ui.termSel) {
      const x = state.sessions.find((y) => y.id === ui.termSel);
      if (x) highlightTerm(x.assignmentId, x.id);
    }
  }

  /* ---------------------------------- พิมพ์ ---------------------------------- */

  function renderPrint(el) {
    const type = ui.printType;
    const termIds = (match) => state.assignments.some((a) => TT.isTerm(a) && match(a));
    let list = type === 'teacher' ? state.teachers : type === 'group' ? state.groups : type === 'room' ? state.rooms
      : type === 'termt' ? state.teachers.filter((t) => termIds((a) => a.teacherId === t.id))
        : state.groups.filter((g) => termIds((a) => a.groupIds.includes(g.id)));
    if (type === 'teacher' && ui.printDept) list = list.filter((t) => t.departmentId === ui.printDept);
    if (ui.printId && !list.find((x) => x.id === ui.printId)) ui.printId = '';
    const chosen = ui.printId ? list.filter((x) => x.id === ui.printId) : list;
    const nameOf = (x) => (type === 'group' || type === 'termg' ? x.name + ' (' + x.code + ')' : x.name);

    el.innerHTML =
      '<div class="page-head no-print"><h1>พิมพ์</h1><p>กระดาษ A4 แนวนอน · ต้องการไฟล์ PDF ให้เลือกเครื่องพิมพ์ "บันทึกเป็น PDF" (Save as PDF)</p></div>' +
      '<div class="toolbar no-print">' +
      '<div class="seg" role="group" aria-label="ประเภท">' + [['teacher', 'ตารางสอนรายครู'], ['group', 'ตารางเรียนรายกลุ่ม'], ['room', 'ตารางการใช้ห้อง'], ['termt', 'ทั้งเทอม (ครู)'], ['termg', 'ทั้งเทอม (กลุ่มเรียน)']].map(([k, label]) =>
        '<button data-ptype="' + k + '" aria-pressed="' + (type === k) + '" class="' + (type === k ? 'active' : '') + '">' + label + '</button>').join('') + '</div>' +
      (type === 'teacher' ? '<select id="pdept" aria-label="แผนกวิชา">' + options(state.departments, ui.printDept, (d) => 'แผนก' + d.name, 'ทุกแผนกวิชา') + '</select>' : '') +
      '<select id="pid" aria-label="เลือก"><option value="">ทั้งหมด (' + list.length + ')</option>' + list.map((x) =>
        '<option value="' + esc(x.id) + '"' + (x.id === ui.printId ? ' selected' : '') + '>' + esc(nameOf(x)) + '</option>').join('') + '</select>' +
      (type === 'teacher' ? '<label class="chk"><input type="checkbox" id="pdetail"' + (ui.printDetail ? ' checked' : '') + '> หน้ารายละเอียดคาบสอน (หน้า 2)</label>' : '') +
      '<span class="spacer"></span><button class="btn primary" id="pgo">พิมพ์ / บันทึกเป็น PDF</button></div>' +
      '<div id="print-area">' + (chosen.length ? chosen.map((x) =>
        type === 'teacher' ? P.teacherPages(state, x, ui.printDetail) : type === 'group' ? P.groupPage(state, x) : type === 'room' ? P.roomPage(state, x)
          : P.termPage(state, x, type === 'termg' ? 'group' : 'teacher')).join('')
        : '<p class="hint">' + (type.startsWith('term') ? 'ยังไม่มีวิชาที่จัดแบบทั้งเทอม' : 'ไม่มีข้อมูลให้พิมพ์') + '</p>') + '</div>';

    $$('[data-ptype]', el).forEach((b) => (b.onclick = () => { ui.printType = b.dataset.ptype; ui.printId = ''; render(); }));
    const pd = $('#pdept', el);
    if (pd) pd.onchange = (e) => { ui.printDept = e.target.value; ui.printId = ''; render(); };
    $('#pid', el).onchange = (e) => { ui.printId = e.target.value; render(); };
    const det = $('#pdetail', el);
    if (det) det.onchange = (e) => { ui.printDetail = e.target.checked; render(); };
    $('#pgo', el).onclick = () => window.print();
  }

  /* ---------------------------------- เริ่ม ---------------------------------- */

  document.addEventListener('DOMContentLoaded', () => {
    $$('dialog .dlg-cancel').forEach((b) => (b.onclick = () => b.closest('dialog').close()));
    const menu = $('#hdr-menu');
    $$('[data-menu]', menu).forEach((b) => (b.onclick = () => {
      menu.open = false;
      const k = b.dataset.menu;
      if (k === 'export') exportBackup();
      else if (k === 'school') { ui.dataTab = 'school'; go('data'); }
      else go(k);
    }));
    document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (ui.selected || ui.termPick || ui.termSel) && !document.querySelector('dialog[open]')) {
        ui.selected = null;
        ui.termPick = null;
        ui.termSel = null;
        render();
      }
    });
    TT.sanitizePlacements(state);
    render();
  });
})();
