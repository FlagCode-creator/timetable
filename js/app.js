/* หน้าจอหลักของโปรแกรมจัดตารางสอน */
(function () {
  'use strict';
  const TT = window.TT;
  const { buildGrid, esc } = window.TTGrid;
  const P = window.TTPrint;
  const STORE_KEY = 'timetable.v1';

  let state = load();
  const ui = {
    tab: isEmpty() ? 'data' : 'schedule',
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
    TT.sanitizePlacements(state);
    save();
    render();
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
    ['data', 'ข้อมูล'],
    ['assign', 'ภาระงานสอน'],
    ['schedule', 'จัดตาราง'],
    ['print', 'พิมพ์'],
  ];

  function render() {
    $('#steps').innerHTML = TABS.map(([k, label], i) =>
      '<button class="step' + (ui.tab === k ? ' active' : '') + '" data-tab="' + k + '"' + (ui.tab === k ? ' aria-current="page"' : '') + '>' +
      '<span class="num">' + (i + 1) + '</span>' + label + '</button>').join('');
    $$('#steps .step').forEach((b) => (b.onclick = () => go(b.dataset.tab)));
    const rules = $('#hdr-rules');
    rules.classList.toggle('active', ui.tab === 'rules');
    rules.onclick = () => go('rules');
    const issues = TT.checkData(state);
    const errors = issues.filter((i) => i.level === 'error').length;
    const badge = $('#hdr-check-n');
    badge.textContent = issues.length || '';
    badge.className = 'count-badge' + (errors ? ' bad' : issues.length ? ' warn' : '');
    const chk = $('#hdr-check');
    chk.classList.toggle('active', ui.tab === 'check');
    chk.onclick = () => go('check');
    $('#hdr-term').textContent = 'ภาคเรียน ' + state.settings.semester + '/' + state.settings.year;

    const main = $('#main');
    const keepY = window.scrollY;
    main.className = 'tab-' + ui.tab;
    const intro = isEmpty() && ui.tab !== 'rules' && ui.tab !== 'check'
      ? '<div class="notice">' + ICON.info + '<span>ยังไม่มีข้อมูล เริ่มกรอกที่ <b>ข้อมูล</b> หรือลองใช้ข้อมูลตัวอย่างก่อน</span><button class="btn small" id="load-sample">โหลดข้อมูลตัวอย่าง</button></div>'
      : '';
    const fn = { data: renderData, assign: renderAssign, schedule: renderSchedule, print: renderPrint, rules: renderRules, check: renderCheck }[ui.tab];
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

  function loadSample() {
    if (!isEmpty() && !confirm('ข้อมูลปัจจุบันจะถูกแทนที่ด้วยข้อมูลตัวอย่าง ต้องการทำต่อไหม?')) return;
    state = TT.normalizeState(window.TTSample.sampleState(TT));
    ui.viewId = '';
    ui.tab = 'schedule';
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

    $$('[data-keep]', el).forEach((b) => (b.onclick = () => {
      const i = issues[Number(b.dataset.issue)];
      const keep = b.dataset.keep;
      const others = i.groupIds.filter((g) => g !== keep);
      const names = others.map((g) => (idx.groups.get(g) || {}).name).join(', ');
      if (!confirm('รวม "' + names + '" เข้ากับ "' + idx.groups.get(keep).name + '"?\nรายวิชาและตารางของกลุ่มที่รวมจะย้ายมาที่กลุ่มนี้ แล้วลบกลุ่มที่ซ้ำออก')) return;
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
        toast(r.title + ' ครบ ' + res.groups + ' กลุ่ม · มีครู ' + res.withTeacher + ' กลุ่ม · ว่าง ' + (res.groups - res.withTeacher) + ' กลุ่ม');
      };
      $('[data-rdel]', box).onclick = () => {
        const n = state.assignments.filter((a) => a.recurringId === r.id).length;
        if (!confirm('ลบกิจกรรม "' + r.title + '"?' + (n ? '\nภาระงานที่สร้างไว้ ' + n + ' รายการจะถูกลบด้วย' : ''))) return;
        TT.removeRecurring(state, r.id);
        commit();
      };
      const nb = $('[data-rnone]', box);
      if (nb) nb.onclick = () => { ui.assignTeacher = '__none'; go('assign'); };
    });
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
            ' <button class="linkish" data-rnone>เลือกครูที่หน้าภาระงาน</button></span></li>'
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
      '<button class="btn primary block" data-rgo>' + (mine.length ? 'อัปเดต' : 'สร้าง') + ' ' + esc(r.title) + ' ให้ทุกกลุ่ม</button>' +
      '</div>';
  }

  function setDayMode(d, mode) {
    const s = state.settings;
    const cur = dayMode(d);
    if (cur === mode) return;
    const di = s.days.indexOf(d);
    if (mode === 'closed' && di >= 0) {
      const n = state.placements.filter((p) => p.day === di).length;
      if (n && !confirm('วัน' + d + 'มีคาบที่จัดไว้ ' + n + ' ก้อน จะถูกนำออกจากตาราง ต้องการทำต่อไหม?')) return render();
      state.placements = state.placements.filter((p) => p.day !== di);
    }
    s.closedDays = s.closedDays.filter((x) => x !== d);
    if (mode === 'closed') s.closedDays.push(d);
    const next = TT.ALL_DAYS.filter((x) => (x === d ? mode !== 'hidden' : s.days.includes(x)));
    if (!next.length) { toast('ต้องมีอย่างน้อย 1 วัน', true); return render(); }
    if (next.join() !== s.days.join()) changeDays(next);
    else commit();
  }

  /** เปลี่ยนวันเรียน โดยย้ายคาบที่จัดไว้/เวลาไม่ว่าง ให้อยู่วันเดิม */
  function changeDays(next) {
    const s = state.settings;
    const map = s.days.map((d) => next.indexOf(d));
    const lost = state.placements.filter((p) => map[p.day] < 0).length;
    if (lost && !confirm('มีคาบที่จัดไว้ในวันที่เอาออก ' + lost + ' ก้อน ซึ่งจะถูกนำออกจากตาราง ต้องการทำต่อไหม?')) return render();
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
    $('#col-reset', el).onclick = () => { if (confirm('คืนค่าโครงสร้างคาบเริ่มต้น?')) { state.settings.columns = TT.defaultColumns(); commit(); } };
  }

  /* ------------------------------ ข้อมูลพื้นฐาน ------------------------------ */

  const ENT = {
    groups: {
      title: 'กลุ่มเรียน', prefix: 'g', key: 'code',
      fields: [
        { k: 'level', label: 'ระดับชั้น', w: 6 },
        { k: 'code', label: 'รหัสกลุ่ม', w: 8 },
        { k: 'name', label: 'ชื่อกลุ่มเรียน', w: 14 },
        { k: 'major', label: 'สาขาวิชา', w: 12 },
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
      r.onload = () => {
        try {
          const next = TT.normalizeState(JSON.parse(r.result));
          if (!confirm('แทนที่ข้อมูลปัจจุบันด้วยข้อมูลจากไฟล์ "' + f.name + '"?')) return;
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
    $('#new-term', el).onclick = () => {
      if (!confirm('ล้างภาระงานสอนและตารางทั้งหมด (เก็บครู รายวิชา กลุ่มเรียน ห้อง เงื่อนไขไว้)?\nแนะนำให้บันทึกไฟล์สำรองของภาคเรียนเดิมก่อน')) return;
      state.assignments = [];
      state.placements = [];
      commit();
    };
    $('#wipe', el).onclick = () => {
      if (!confirm('ล้างข้อมูลทั้งหมด? ย้อนกลับไม่ได้')) return;
      state = TT.emptyState();
      commit();
    };
  }

  function renderEntity(el) {
    const cfg = ENT[ui.dataTab];
    el.innerHTML =
      '<div class="toolbar"><label class="search">' + ICON.search + '<input type="search" id="dfilter" aria-label="ค้นหา" placeholder="ค้นหา' + cfg.title + '" value="' + esc(ui.dataFilter) + '"></label>' +
      '<span class="spacer"></span><button class="btn" id="dpaste">วางจาก Excel</button><button class="btn primary" id="dadd">+ เพิ่ม' + cfg.title + '</button></div>' +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
      cfg.fields.map((f) => '<th>' + esc(f.label) + '</th>').join('') +
      (ui.dataTab === 'subjects' ? '<th>ชม./สัปดาห์</th>' : '') + '<th>ใช้ใน<br>ภาระงาน</th><th></th></tr></thead><tbody id="dbody"></tbody></table></div>' +
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
    fillDataBody();
  }

  function usageCount(kind, id) {
    return state.assignments.filter((a) =>
      kind === 'teachers' ? a.teacherId === id
        : kind === 'subjects' ? a.subjectId === id
          : kind === 'groups' ? a.groupIds.includes(id)
            : kind === 'rooms' ? a.roomId === id
              : state.teachers.some((t) => t.departmentId === id && t.id === a.teacherId)).length;
  }

  function fillDeptList() {
    const dl = $('#dept-list');
    if (dl) dl.innerHTML = state.departments.filter((d) => norm(d.name)).map((d) => '<option value="' + esc(d.name) + '"></option>').join('');
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
    body.innerHTML = rows.map((it) =>
      '<tr data-id="' + esc(it.id) + '"' + (dupIds.has(it.id) ? ' class="dup-row-t" title="กลุ่มเรียนนี้ซ้ำกับกลุ่มอื่น ดูที่ ตรวจสอบ"' : '') + '>' + cfg.fields.map((f) => {
        // พิมพ์ชื่อแผนกใหม่ได้เลย (สร้างให้อัตโนมัติ) หรือเลือกจากรายการที่มีอยู่
        if (f.type === 'dept') return '<td><input data-f="' + f.k + '" list="dept-list" aria-label="' + esc(f.label) + '" placeholder="พิมพ์หรือเลือก" value="' + esc(deptName(it[f.k])) + '" style="width:' + (f.w || 8) + 'em"></td>';
        if (f.type === 'bool') return '<td class="c"><input type="checkbox" data-f="' + f.k + '" aria-label="' + esc(f.label) + '"' + (it[f.k] ? ' checked' : '') + '></td>';
        return '<td><input data-f="' + f.k + '" aria-label="' + esc(f.label) + '" value="' + esc(it[f.k]) + '" style="width:' + (f.w || 8) + 'em"' + (f.type === 'num' ? ' inputmode="numeric"' : '') + '></td>';
      }).join('') +
      (kind === 'subjects' ? '<td class="c hrs">' + TT.subjectHours(it) + '</td>' : '') +
      '<td class="c muted">' + (dupIds.has(it.id) ? '<button class="badge bad-b" data-go-check>ซ้ำ</button> ' : '') + (usageCount(kind, it.id) || '') + '</td>' +
      '<td><button class="btn icon danger" data-del aria-label="ลบ">' + ICON.x + '</button></td></tr>').join('') ||
      '<tr><td colspan="9" class="empty-row">ยังไม่มีข้อมูล กด "+ เพิ่ม" หรือ "วางจาก Excel"</td></tr>';
    fillDeptList();

    $$('[data-go-check]', body).forEach((b) => (b.onclick = () => go('check')));
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
        item[f.k] = f.type === 'bool' ? inp.checked : f.type === 'num' ? (inp.value === '' ? '' : Number(inp.value) || 0) : inp.value.trim();
        if (kind === 'subjects') $('.hrs', tr).textContent = TT.subjectHours(item);
        save();
      }));
      $('[data-del]', tr).onclick = () => deleteEntity(kind, item);
    });
  }

  function deleteEntity(kind, item) {
    const n = usageCount(kind, item.id);
    const label = item.name || item.code || 'รายการนี้';
    if (kind === 'teachers') {
      if (!confirm('ลบ "' + label + '"?' + (n ? '\nภาระงานสอนที่เกี่ยวข้องจะถูกลบด้วย (กิจกรรมประจำจะเหลือไว้แบบยังไม่มีครู)' : ''))) return;
      state.assignments.forEach((a) => { if (a.recurringId && a.teacherId === item.id) a.teacherId = ''; });
      state.assignments = state.assignments.filter((a) => a.teacherId !== item.id);
    } else if (kind === 'subjects') {
      if (!confirm('ลบ "' + label + '"?' + (n ? '\nภาระงานสอนที่เกี่ยวข้อง ' + n + ' รายการจะถูกลบด้วย' : ''))) return;
      state.assignments = state.assignments.filter((a) => a.subjectId !== item.id);
    } else {
      if (!confirm('ลบ "' + label + '"?')) return;
      if (kind === 'groups') {
        state.assignments.forEach((a) => (a.groupIds = a.groupIds.filter((g) => g !== item.id)));
        state.assignments = state.assignments.filter((a) => !(a.recurringId && !a.groupIds.length));
      }
      if (kind === 'rooms') state.assignments.forEach((a) => { if (a.roomId === item.id) a.roomId = null; });
      if (kind === 'departments') state.teachers.forEach((t) => { if (t.departmentId === item.id) t.departmentId = ''; });
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

  /* ------------------------------ ภาระงานสอน ------------------------------ */

  /** เลือกครูทางซ้าย แล้วดู/เพิ่มรายวิชาที่สอนของครูคนนั้น */
  function renderAssign(el) {
    const noneCount = state.assignments.filter((a) => !a.teacherId).length;
    if (ui.assignTeacher !== '__none' && !state.teachers.find((t) => t.id === ui.assignTeacher)) {
      ui.assignTeacher = state.teachers[0] ? state.teachers[0].id : noneCount ? '__none' : '';
    }
    if (ui.assignTeacher === '__none' && !noneCount) ui.assignTeacher = state.teachers[0] ? state.teachers[0].id : '';

    el.innerHTML =
      '<div class="work">' +
      '<aside class="side-list" aria-label="รายชื่อครู">' +
      '<div class="side-title">ครู <span class="muted">' + state.teachers.length + ' คน</span></div>' +
      '<label class="search">' + ICON.search + '<input type="search" id="wfilter" aria-label="ค้นหาครู" placeholder="ค้นหาครู" value="' + esc(ui.listFilter) + '"></label>' +
      '<div class="elist" id="wlist"></div>' +
      '<button class="btn small ghost" id="w-add-teacher">+ เพิ่มครู</button></aside>' +
      '<section class="work-main" id="work-main"></section></div>' +
      '<datalist id="subj-list">' + state.subjects.map((s) => '<option value="' + esc(s.code + ' ' + s.name) + '"></option>').join('') + '</datalist>';

    fillTeacherList();
    $('#wfilter', el).oninput = (e) => { ui.listFilter = e.target.value; fillTeacherList(); };
    $('#w-add-teacher', el).onclick = () => { ui.dataTab = 'teachers'; go('data'); $('#dadd').click(); };
    renderTeacherWork($('#work-main', el));
  }

  function fillTeacherList() {
    const idx = TT.indexState(state);
    const q = norm(ui.listFilter).toLowerCase();
    const hours = new Map();
    const count = new Map();
    for (const a of state.assignments) {
      const k = a.teacherId || '__none';
      hours.set(k, (hours.get(k) || 0) + TT.assignmentHours(a, idx.subjects));
      count.set(k, (count.get(k) || 0) + 1);
    }
    const ents = state.teachers.filter((t) => !q || norm(t.name).toLowerCase().includes(q));
    const item = (id, name, sub, badge) =>
      '<button class="eitem' + (id === ui.assignTeacher ? ' active' : '') + '" data-teacher="' + esc(id) + '">' +
      '<span class="ei-text"><span class="ei-name">' + esc(name) + '</span><span class="ei-sub">' + sub + '</span></span>' + badge + '</button>';
    const none = count.get('__none')
      ? '<div class="eg">' + item('__none', 'ยังไม่มีครู', count.get('__none') + ' รายการ (เช่น Home Room)', '<span class="badge warn">' + count.get('__none') + '</span>') + '</div>'
      : '';
    const box = $('#wlist');
    const groups = entityGroups(ents, 'teacher');
    box.innerHTML = none + groups.map(([name, list]) =>
      '<div class="eg"><div class="eg-name">' + esc(name) + '</div>' + list.map((t) =>
        item(t.id, t.name, (hours.get(t.id) || 0) + ' ชม./สัปดาห์ · ' + (count.get(t.id) || 0) + ' รายการ',
          count.get(t.id) ? '' : '<span class="badge">ว่าง</span>')).join('') + '</div>').join('') ||
      '<p class="hint">ยังไม่มีครู เพิ่มได้ที่ ข้อมูล → ครู</p>';
    $$('[data-teacher]', box).forEach((b) => (b.onclick = () => { ui.assignTeacher = b.dataset.teacher; render(); }));
  }

  function renderTeacherWork(el) {
    const idx = TT.indexState(state);
    const none = ui.assignTeacher === '__none';
    const t = none ? null : idx.teachers.get(ui.assignTeacher);
    if (!none && !t) {
      el.innerHTML = '<div class="card empty-state">ยังไม่มีครู เริ่มจาก <b>ข้อมูล → ครู</b> หรือ "วางจาก Excel"</div>';
      return;
    }
    const list = state.assignments.filter((a) => (none ? !a.teacherId : a.teacherId === t.id));
    const placedCount = new Map();
    for (const p of state.placements) placedCount.set(p.assignmentId, (placedCount.get(p.assignmentId) || 0) + 1);

    let head;
    if (none) {
      head = '<div class="work-head"><div><h1>ยังไม่มีครู</h1><p>ภาระงานที่ยังไม่ได้ระบุผู้สอน เลือกครูในช่องแรกของแต่ละแถว</p></div></div>';
    } else {
      const dept = idx.departments.get(t.departmentId);
      const sum = TT.teacherSummary(state, t.id);
      const termHours = list.filter(TT.isTerm).reduce((n, a) => n + TT.termTotal(state, a, idx.subjects), 0);
      const weeklyBlocks = TT.allBlocks(state).filter((b) => b.assignment.teacherId === t.id);
      const placed = weeklyBlocks.filter((b) => b.placement).length;
      head = '<div class="work-head"><div><h1>' + esc(t.name) + '</h1><p>' +
        [dept ? 'แผนก' + dept.name : '', t.qualification, t.major ? 'สาขา' + t.major : '', t.duty ? 'หน้าที่พิเศษ: ' + t.duty : ''].filter(Boolean).map(esc).join(' · ') + '</p></div>' +
        '<div class="work-actions"><button class="btn" id="w-edit">แก้ไขข้อมูลครู</button><button class="btn primary" id="w-sched">ไปจัดตาราง →</button></div></div>' +
        '<div class="stats">' +
        '<div class="stat-tile"><span>ชั่วโมงสอน</span><b>' + sum.totals.h + '</b><small>ชม./สัปดาห์</small></div>' +
        '<div class="stat-tile"><span>ท. / ป. / น.</span><b>' + sum.totals.t + ' / ' + sum.totals.p + ' / ' + sum.totals.n + '</b><small>รวมทุกรายวิชา</small></div>' +
        '<div class="stat-tile"><span>รายการ</span><b>' + list.length + '</b><small>วิชา/กิจกรรม</small></div>' +
        '<div class="stat-tile"><span>ตารางรายสัปดาห์</span><b>' + placed + ' / ' + weeklyBlocks.length + '</b><small>ก้อนที่จัดแล้ว</small></div>' +
        (termHours ? '<div class="stat-tile"><span>ตารางทั้งเทอม</span><b>' + termHours + '</b><small>ชม. ทั้งเทอม</small></div>' : '') +
        '</div>';
    }

    el.innerHTML = head +
      '<section class="card"><div class="card-head"><div><h2>รายวิชาที่สอน</h2><p>พิมพ์รหัสหรือชื่อวิชาในช่องแรก · เรียนรวมหลายกลุ่มในคาบเดียวกันให้เลือกหลายกลุ่ม · สอนแยกเวลาให้เพิ่มเป็นคนละแถว</p></div>' +
      '<div class="btns tight"><button class="btn" id="apaste">วางจาก Excel</button>' + (none ? '' : '<button class="btn primary" id="aadd">+ เพิ่มรายวิชาที่สอน</button>') + '</div></div>' +
      '<div class="table-wrap flat"><table class="data assign"><thead><tr>' + (none ? '<th>ครู</th>' : '') +
      '<th>วิชา / กิจกรรม</th><th>กลุ่มเรียน</th><th>ห้อง/สถานที่</th><th>ชม./สัปดาห์</th><th>การจัด</th><th>รายละเอียดการจัด</th><th>สถานะ</th><th></th></tr></thead><tbody>' +
      (list.map((a) => assignRow(a, idx, placedCount, none)).join('') ||
        '<tr><td colspan="9" class="empty-row">ยังไม่มีรายวิชา กด "+ เพิ่มรายวิชาที่สอน"</td></tr>') +
      '</tbody></table></div></section>' +
      '<div class="tip">' + ICON.info + '<span><b>ตารางรายสัปดาห์</b> = เรียนเวลาเดิมทุกสัปดาห์ (แบ่งคาบได้ เช่น 2+2, ติ๊ก Block Course ถ้าเรียนข้ามพักกลางวัน) · ' +
      '<b>ตารางทั้งเทอม</b> = วางเป็นรายวันใน ' + state.settings.weeks + ' สัปดาห์จนครบชั่วโมง เช่น 3 ชม./สัปดาห์ × ' + state.settings.weeks + ' = ' + 3 * state.settings.weeks + ' ชม. วันละ 4 ชม.</span></div>';

    const e1 = $('#w-edit', el);
    if (e1) e1.onclick = () => { ui.dataTab = 'teachers'; ui.dataFilter = t.name; go('data'); };
    const e2 = $('#w-sched', el);
    if (e2) e2.onclick = () => { ui.view = 'teacher'; ui.viewId = t.id; ui.listFilter = ''; go('schedule'); };
    const add = $('#aadd', el);
    if (add) add.onclick = () => {
      state.assignments.push({ id: TT.uid('a'), teacherId: t.id, subjectId: null, title: '', groupIds: [], roomId: null, blocks: '', blockCourse: false, plan: 'weekly' });
      commit();
      const rows = $$('#work-main tr[data-id]');
      const inp = rows.length && $('[data-subj]', rows[rows.length - 1]);
      if (inp) inp.focus();
    };
    $('#apaste', el).onclick = () => openPaste('ภาระงานสอน',
      'คอลัมน์: ชื่อครู | รหัสวิชา (หรือชื่อกิจกรรม) | รหัสกลุ่มเรียน (เรียนรวมหลายกลุ่มคั่นด้วย , ) | ห้อง | รูปแบบคาบ (เว้นว่างได้) | Block Course (ใส่ "ใช่") | ทั้งเทอม (ใส่ "ใช่")',
      importAssignments);
    bindAssignRows(el);
  }

  function assignRow(a, idx, placedCount, showTeacher) {
    const blocks = TT.assignmentBlocks(a, idx.subjects);
    const sj = a.subjectId ? idx.subjects.get(a.subjectId) : null;
    const hours = blocks.reduce((x, y) => x + y, 0);
    const rec = !!a.recurringId;
    const term = TT.isTerm(a);
    const def = TT.defaultPattern(hours, a.blockCourse);
    const mismatch = sj && !a.blockCourse && TT.subjectHours(sj) !== hours;
    let status;
    if (term) {
      const st = TT.termStatus(state, a, idx.subjects);
      status = '<td class="c ' + (st.remaining ? 'todo' : 'ok') + '">' + st.placed + '/' + st.total + '<small>ชม.</small></td>';
    } else {
      const done = placedCount.get(a.id) || 0;
      status = '<td class="c ' + (done >= blocks.length ? 'ok' : 'todo') + '">' + done + '/' + blocks.length + '<small>ก้อน</small></td>';
    }
    let detail;
    if (rec) detail = '<span class="muted">ทุกวัน' + esc((state.settings.recurring.find((r) => r.id === a.recurringId) || {}).day || '') + ' (ล็อก)</span>';
    else if (term) {
      const st = TT.termStatus(state, a, idx.subjects);
      detail = '<span class="inline-f">วันละ <input type="number" min="1" max="13" data-af="hoursPerDay" aria-label="ชั่วโมงต่อวัน" value="' + st.hpd + '" style="width:3.6em"> ชม.</span>' +
        '<small class="muted">รวม ' + st.total + ' ชม. = ' + st.fullDays + ' วัน' + (st.extra ? ' + ' + st.extra + ' ชม.' : '') + '</small>';
    } else {
      detail = '<span class="inline-f">แบ่งคาบ <input data-af="blocks" aria-label="รูปแบบคาบ" value="' + esc(a.blocks) + '" placeholder="' + esc(def) + '" style="width:4.6em"></span>' +
        '<label class="chk small"><input type="checkbox" data-af="blockCourse"' + (a.blockCourse ? ' checked' : '') + '> Block Course</label>';
    }
    return '<tr data-id="' + esc(a.id) + '"' + (rec ? ' class="rec-row"' : '') + '>' +
      (showTeacher ? '<td><select data-af="teacherId" aria-label="ครู" class="need">' + options(state.teachers, a.teacherId, (x) => x.name, '- เลือกครู -') + '</select></td>' : '') +
      '<td><div class="subj-cell"><i class="dot-c ' + P.colorClass(state, a) + '"></i>' + (rec
        ? '<span class="rec-title">' + ICON.lock + esc(a.title) + '</span>'
        : '<input data-subj list="subj-list" aria-label="วิชา" placeholder="พิมพ์รหัส/ชื่อวิชา" value="' + esc(sj ? sj.code + ' ' + sj.name : a.title) + '">') +
      '</div>' + (sj ? '<small class="muted tpn">' + sj.t + '-' + sj.p + '-' + sj.n + '</small>' : '') + '</td>' +
      '<td class="groups-cell">' + (rec
        ? esc(a.groupIds.map((g) => (idx.groups.get(g) || {}).name || '?').join(', '))
        : '<button class="btn small" data-pick>' + (a.groupIds.length
          ? a.groupIds.map((g) => esc((idx.groups.get(g) || {}).name || '?')).join('<br>')
          : 'เลือกกลุ่มเรียน…') + '</button>') + '</td>' +
      '<td><select data-af="roomId" aria-label="ห้อง">' + options(state.rooms, a.roomId, (r) => r.name, '-') + '</select></td>' +
      '<td class="c">' + (rec ? hours : '<input type="number" min="1" max="40" data-hours aria-label="ชั่วโมงต่อสัปดาห์" value="' + hours + '" style="width:3.6em"' +
        (mismatch ? ' class="warn-in" title="ไม่ตรงกับ ท.+ป. ของรายวิชา (' + TT.subjectHours(sj) + ')"' : '') + '>') + '</td>' +
      '<td>' + (rec ? '<span class="muted">กิจกรรมประจำ</span>' : '<select data-af="plan" aria-label="การจัด"><option value="weekly"' + (term ? '' : ' selected') + '>รายสัปดาห์</option><option value="term"' + (term ? ' selected' : '') + '>ทั้งเทอม</option></select>') + '</td>' +
      '<td class="detail-cell">' + detail + '</td>' + status +
      '<td class="nowrap">' + (rec ? '' : '<button class="btn icon" data-dup aria-label="ทำสำเนา" title="ทำสำเนา (วิชาเดียวกัน อีกกลุ่มเรียน)">⧉</button><button class="btn icon danger" data-del aria-label="ลบ">' + ICON.x + '</button>') + '</td></tr>';
  }

  function bindAssignRows(el) {
    $$('tr[data-id]', el).forEach((tr) => {
      const a = state.assignments.find((x) => x.id === tr.dataset.id);
      $$('[data-af]', tr).forEach((inp) => (inp.onchange = () => {
        const k = inp.dataset.af;
        a[k] = inp.type === 'checkbox' ? inp.checked : inp.value === '' && k === 'roomId' ? null : inp.value.trim();
        if (k === 'hoursPerDay') a[k] = Number(inp.value) || 4;
        if (k === 'blocks' && a.blocks && !TT.parsePattern(a.blocks)) toast('รูปแบบคาบไม่ถูกต้อง ใช้ตัวเลขคั่นด้วย + เช่น 2+2', true);
        if (k === 'plan' && a.plan === 'term') toast('ย้ายไปจัดที่ จัดตาราง → ตารางทั้งเทอม');
        commit();
      }));
      const subj = $('[data-subj]', tr);
      if (subj) subj.onchange = () => {
        const text = norm(subj.value);
        const code = text.split(' ')[0];
        const found = state.subjects.find((x) => norm(x.code) === code || norm(x.code + ' ' + x.name) === text || norm(x.name) === text);
        if (found) {
          a.subjectId = found.id;
          a.title = '';
        } else if (/^\d{4,5}-\d{4}$/.test(code)) {
          toast('ไม่พบรหัสวิชา ' + code + ' เพิ่มได้ที่ ข้อมูล → รายวิชา', true);
          return render();
        } else {
          a.subjectId = null;
          a.title = text;
        }
        commit();
      };
      const hrs = $('[data-hours]', tr);
      if (hrs) hrs.onchange = () => {
        const n = Math.max(1, Math.min(40, Math.round(Number(hrs.value) || 1)));
        a.blocks = TT.isTerm(a) ? String(n) : TT.defaultPattern(n, a.blockCourse);
        commit();
      };
      const pick = $('[data-pick]', tr);
      if (pick) pick.onclick = () => pickGroups(a);
      const dup = $('[data-dup]', tr);
      if (dup) dup.onclick = () => {
        const copy = { ...a, id: TT.uid('a'), groupIds: [] };
        state.assignments.splice(state.assignments.indexOf(a) + 1, 0, copy);
        commit();
        pickGroups(copy);
      };
      const del = $('[data-del]', tr);
      if (del) del.onclick = () => {
        if (!confirm('ลบรายการนี้? คาบที่จัดไว้จะถูกนำออกจากตารางด้วย')) return;
        state.assignments = state.assignments.filter((x) => x !== a);
        commit();
      };
    });
  }

  function pickGroups(a) {
    const dlg = $('#dlg-groups');
    const chosen = new Set(a.groupIds);
    const list = $('.glist', dlg);
    const search = $('input[type=search]', dlg);
    const fill = () => {
      const q = norm(search.value).toLowerCase();
      list.innerHTML = state.groups
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
      commit();
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
    if (problems.length) alert('นำเข้า ' + added + ' รายการ แต่มีปัญหา:\n' + [...new Set(problems)].slice(0, 20).join('\n'));
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
      ents.forEach((g) => put(g.level ? String(g.level).split('/')[0] : 'ไม่ระบุระดับชั้น', g));
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

    el.innerHTML =
      '<div class="cal-switch" role="group" aria-label="โหมดตาราง">' +
      '<button data-cal="week" aria-pressed="' + !term + '" class="' + (term ? '' : 'active') + '"><b>ตารางรายสัปดาห์</b><small>เรียนเวลาเดิมทุกสัปดาห์</small></button>' +
      '<button data-cal="term" aria-pressed="' + term + '" class="' + (term ? 'active' : '') + '"><b>ตารางทั้งเทอม</b><small>วางรายวันใน ' + state.settings.weeks + ' สัปดาห์จนครบชั่วโมง' + (termCount ? ' · ' + termCount + ' วิชา' : '') + '</small></button>' +
      '</div>' +
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
    $$('[data-res]', el).forEach((b) => (b.onclick = () => {
      const [t, id] = [b.dataset.res[0], b.dataset.res.slice(2)];
      ui.view = t === 't' ? 'teacher' : t === 'g' ? 'group' : 'room';
      ui.viewId = id;
      render();
    }));
    const ca = $('#clear-all', el);
    if (ca) ca.onclick = () => {
      if (!confirm('นำคาบที่ไม่ได้ล็อกของทุกคนออกจากตารางรายสัปดาห์? (กิจกรรมประจำและคาบที่ล็อกไว้จะอยู่เหมือนเดิม)')) return;
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
      (ui.cal === 'term' ? '' : '<div class="sched-actions"><button class="btn" id="clear-one">ล้างตารางนี้</button>' +
        '<button class="btn primary" id="auto">' + ICON.check + 'จัดอัตโนมัติ</button></div>') + '</div>';
  }

  /* ---------- ตารางรายสัปดาห์ ---------- */

  /** แถบเครื่องมือ: แสดงตลอด ใช้ได้เมื่อเลือกคาบ */
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
    if (!sel) hint = 'เลือกคาบในตาราง หรือการ์ด "ยังไม่ได้จัด" ทางขวา เพื่อใช้เครื่องมือ';
    else if (sel.a.recurringId) hint = 'กิจกรรมประจำ แก้วัน/เวลาได้ที่ <button class="linkish" data-gorules>เงื่อนไข</button>';
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
        : '') + '</div>' +
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
      if (bad) html += '<div class="bad-box">' + [...bad].map((m) => '<div>' + ICON.info + esc(m) + '</div>').join('') + '</div>';
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
    html += overviewCard(conflicts, blocks) + rulesCard();
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
          (ui.showConflicts ? '<div class="conf-list">' + conflicts.list.map((c) =>
            '<button class="linkish" data-res="' + esc(c.resource) + '">' + esc(state.settings.days[c.day]) + ' คาบ ' + c.periods.join(', ') + ': ' + esc(c.message) + '</button>').join('') + '</div>' : '')
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

  function placeAt(key, day, start) {
    const { assignmentId, blockIndex } = parseKey(key);
    const a = state.assignments.find((x) => x.id === assignmentId);
    if (!a) return;
    if (a.recurringId) { toast('กิจกรรมประจำย้ายได้ที่หน้าเงื่อนไข', true); return; }
    // คลิก/วางที่ไหนก็ได้ในช่วงของก้อน ระบบเลื่อนคาบเริ่มให้พอดี (เช่น ก้อน 3 คาบ คลิก 20:00 → 19:00–22:00)
    const snapped = TT.snapStart(state, a, blockIndex, day, start);
    if (snapped == null) { toast(TT.checkPlacement(state, a, blockIndex, day, start).reasons[0], true); return; }
    start = snapped;
    const r = TT.checkPlacement(state, a, blockIndex, day, start);
    if (!r.ok && !confirm('คาบนี้จะชนกัน:\n- ' + r.reasons.join('\n- ') + '\n\nต้องการวางต่อไหม?')) return;
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
    on('#clear-one', () => {
      if (!confirm('นำคาบที่ไม่ได้ล็อกของ "' + v.name(ent) + '" ออกจากตาราง?')) return;
      const ids = new Set(state.assignments.filter((a) => v.match(a, ent.id)).map((a) => a.id));
      state.placements = state.placements.filter((p) => p.locked || !ids.has(p.assignmentId));
      commit();
    });
    on('#dismiss-un', () => { ui.lastUnplaced = []; render(); });

    if (!ui.selected) return;
    const { assignmentId, blockIndex } = parseKey(ui.selected);
    const cur = TT.findPlacement(state, assignmentId, blockIndex);
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
      '<span class="spacer"></span>' +
      '<div class="tool-group"><button class="btn small" id="term-clear">ล้างตารางทั้งเทอมนี้</button></div>' +
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
      grids += '<div class="term-week" data-week="' + w + '" id="tw-' + w + '">' +
        '<div class="tw-head"><b>สัปดาห์ที่ ' + w + '</b><span>' + (hrs ? 'ทั้งเทอม ' + hrs + ' ชม.' : 'ยังไม่มีวิชาทั้งเทอม') + '</span></div>' +
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
    if (bad) html = '<div class="bad-box">' + [...bad].map((m) => '<div>' + ICON.info + esc(m) + '</div>').join('') + '</div>' + html;
    return html + rulesCard();
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
  function termPlace(assignmentId, week, day, p) {
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
      if (!confirm('ช่วงนี้จะชนกัน:\n- ' + chk.reasons.join('\n- ') + '\n\nต้องการวางต่อไหม?')) return;
    }
    TT.addSession(state, assignmentId, week, day, { start, len });
    const after = TT.termStatus(state, a);
    if (!after.remaining) { ui.termPick = null; toast('ครบ ' + after.total + ' ชั่วโมงแล้ว (' + after.days + ' วัน)'); }
    else if (len < Math.min(st.hpd, st.remaining)) toast('ช่วงนั้นว่างไม่พอ วางได้ ' + len + ' ชม. เหลืออีก ' + after.remaining + ' ชม.');
    commit();
  }

  /** ย้ายวันที่วางไว้ ไปสัปดาห์/วัน/คาบใหม่ */
  function termMove(sessionId, week, day, p) {
    const x = state.sessions.find((y) => y.id === sessionId);
    if (!x) return;
    const a = state.assignments.find((y) => y.id === x.assignmentId);
    const start = TT.snapSession(state, a, week, day, p, x.len, x.id);
    if (start == null) { toast('ช่วงนี้วาง ' + x.len + ' ชม. ไม่ได้ (เลยคาบสุดท้าย)', true); return; }
    const chk = TT.checkSession(state, a, week, day, start, x.len, x.id);
    if (!chk.ok && !confirm('ช่วงนี้จะชนกัน:\n- ' + chk.reasons.join('\n- ') + '\n\nต้องการย้ายต่อไหม?')) return;
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
    $$('[data-tclr]', el).forEach((b) => (b.onclick = () => {
      if (!confirm('ล้างวันที่วางไว้ทั้งหมดของวิชานี้?')) return;
      state.sessions = state.sessions.filter((x) => x.assignmentId !== b.dataset.tclr);
      commit();
    }));
    const clr = $('#term-clear', el);
    if (clr) clr.onclick = () => {
      if (!confirm('ล้างตารางทั้งเทอมทั้งหมดของ "' + v.name(ent) + '"?')) return;
      const ids = new Set(state.assignments.filter((a) => v.match(a, ent.id)).map((a) => a.id));
      state.sessions = state.sessions.filter((x) => !ids.has(x.assignmentId));
      commit();
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
    $('#hdr-export').onclick = exportBackup;
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
