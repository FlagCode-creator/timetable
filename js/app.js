/* หน้าจอหลักของโปรแกรมจัดตารางสอน */
(function () {
  'use strict';
  const TT = window.TT;
  const { buildGrid, esc } = window.TTGrid;
  const P = window.TTPrint;
  const STORE_KEY = 'timetable.v1';

  let state = load();
  const ui = {
    tab: isEmpty() ? 'settings' : 'schedule',
    dataTab: 'groups',
    dataFilter: '',
    assignTeacher: '',
    view: 'teacher',
    viewId: '',
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

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const options = (list, value, labelFn, empty) =>
    (empty != null ? '<option value="">' + esc(empty) + '</option>' : '') +
    list.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === value ? ' selected' : '') + '>' + esc(labelFn(x)) + '</option>').join('');

  /* --------------------------------- เค้าโครง --------------------------------- */

  const TABS = [
    ['settings', '1. ตั้งค่า'],
    ['data', '2. ข้อมูลพื้นฐาน'],
    ['assign', '3. ภาระงานสอน'],
    ['schedule', '4. จัดตาราง'],
    ['print', '5. พิมพ์'],
  ];

  function render() {
    $('#tabs').innerHTML = TABS.map(([k, label]) =>
      '<button class="tab' + (ui.tab === k ? ' active' : '') + '" data-tab="' + k + '">' + label + '</button>').join('');
    $$('#tabs .tab').forEach((b) => (b.onclick = () => { ui.tab = b.dataset.tab; ui.selected = null; render(); }));
    const main = $('#main');
    const intro = isEmpty()
      ? '<div class="notice">ยังไม่มีข้อมูล เริ่มกรอกที่แท็บ "ข้อมูลพื้นฐาน" หรือ <button class="btn small" id="load-sample">โหลดข้อมูลตัวอย่าง</button> เพื่อลองใช้งานก่อน</div>'
      : '';
    const fn = { settings: renderSettings, data: renderData, assign: renderAssign, schedule: renderSchedule, print: renderPrint }[ui.tab];
    main.innerHTML = intro + '<div id="view"></div>';
    fn($('#view'));
    const ls = $('#load-sample');
    if (ls) ls.onclick = loadSample;
  }

  function loadSample() {
    if (!isEmpty() && !confirm('ข้อมูลปัจจุบันจะถูกแทนที่ด้วยข้อมูลตัวอย่าง ต้องการทำต่อไหม?')) return;
    state = TT.normalizeState(window.TTSample.sampleState(TT));
    ui.viewId = '';
    ui.tab = 'schedule';
    commit();
    toast('โหลดข้อมูลตัวอย่างแล้ว');
  }

  /* --------------------------------- ตั้งค่า --------------------------------- */

  function renderSettings(el) {
    const s = state.settings;
    const cols = s.columns;
    el.innerHTML =
      '<div class="cards">' +
      '<section class="card"><h3>ข้อมูลสถานศึกษา</h3>' +
      '<label>ชื่อสถานศึกษา<input data-set="collegeName" value="' + esc(s.collegeName) + '"></label>' +
      '<div class="row2"><label>ภาคเรียนที่<select data-set="semester">' +
      ['1', '2', '3'].map((x) => '<option' + (s.semester === x ? ' selected' : '') + '>' + x + '</option>').join('') +
      '</select></label><label>ปีการศึกษา<input data-set="year" value="' + esc(s.year) + '" inputmode="numeric"></label></div>' +
      '<label>ตราสถานศึกษา (ใช้ในหัวกระดาษ)<input type="file" id="logo-file" accept="image/*"></label>' +
      (s.logo ? '<div class="logo-prev"><img src="' + esc(s.logo) + '" alt=""><button class="btn small" id="logo-del">ลบตรา</button></div>' : '') +
      '</section>' +
      '<section class="card"><h3>ผู้ลงนามท้ายตาราง</h3>' +
      '<label>หัวหน้างานพัฒนาหลักสูตรการเรียนการสอน<input data-sign="curriculumHead" value="' + esc(s.signers.curriculumHead) + '"></label>' +
      '<label>รองผู้อำนวยการฝ่ายวิชาการ<input data-sign="viceDirector" value="' + esc(s.signers.viceDirector) + '"></label>' +
      '<label>ผู้อำนวยการ<input data-sign="director" value="' + esc(s.signers.director) + '"></label>' +
      '<p class="hint">ชื่อหัวหน้าแผนกวิชากรอกที่ ข้อมูลพื้นฐาน → แผนกวิชา</p></section>' +
      '<section class="card"><h3>วันที่มีการเรียนการสอน</h3><div class="days">' +
      TT.ALL_DAYS.map((d) => '<label class="chk"><input type="checkbox" data-day="' + esc(d) + '"' + (s.days.includes(d) ? ' checked' : '') + '> ' + esc(d) + '</label>').join('') +
      '</div></section>' +
      '<section class="card"><h3>สำรอง / ย้ายข้อมูล</h3>' +
      '<p class="hint">ข้อมูลเก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น ควรบันทึกไฟล์สำรองเป็นระยะ และใช้ไฟล์นี้ส่งต่อให้เครื่องอื่น</p>' +
      '<div class="btns"><button class="btn" id="export">บันทึกไฟล์สำรอง</button>' +
      '<label class="btn">เปิดไฟล์สำรอง<input type="file" id="import" accept=".json,application/json" hidden></label>' +
      '<button class="btn" id="sample">โหลดข้อมูลตัวอย่าง</button></div>' +
      '<div class="btns"><button class="btn" id="new-term">เริ่มภาคเรียนใหม่</button>' +
      '<button class="btn danger" id="wipe">ล้างข้อมูลทั้งหมด</button></div>' +
      '<p class="hint">"เริ่มภาคเรียนใหม่" เก็บครู รายวิชา กลุ่มเรียน ห้อง ไว้ แต่ล้างภาระงานและตาราง</p></section>' +
      '</div>' +
      '<section class="card wide"><h3>โครงสร้างคาบเรียน</h3>' +
      '<p class="hint">ช่วงพัก เช่น กิจกรรมหน้าเสาธง/พักกลางวัน จะเป็นแถบแนวตั้งในตาราง และก้อนคาบจะคร่อมช่วงพักไม่ได้ ยกเว้นวิชาที่ติ๊ก Block Course<br>' +
      'แนะนำให้ตั้งส่วนนี้ให้เรียบร้อยก่อนเริ่มจัดตาราง เพราะการเพิ่ม/ลบคาบจะทำให้เลขคาบที่จัดไว้เลื่อน</p>' +
      '<table class="data"><thead><tr><th>ประเภท</th><th>คาบที่ / ชื่อช่วงพัก</th><th>เริ่ม</th><th>สิ้นสุด</th><th></th></tr></thead><tbody>' +
      cols.map((c, i) => {
        const no = c.type === 'period' ? cols.slice(0, i + 1).filter((x) => x.type === 'period').length : '';
        return '<tr data-col="' + i + '"><td><select data-cf="type"><option value="period"' + (c.type === 'period' ? ' selected' : '') + '>คาบเรียน</option>' +
          '<option value="break"' + (c.type === 'break' ? ' selected' : '') + '>ช่วงพัก</option></select></td>' +
          '<td>' + (c.type === 'break' ? '<input data-cf="label" value="' + esc(c.label) + '">' : 'คาบที่ ' + no) + '</td>' +
          '<td><input type="time" data-cf="start" value="' + esc(c.start) + '"></td><td><input type="time" data-cf="end" value="' + esc(c.end) + '"></td>' +
          '<td class="nowrap"><button class="btn small" data-cmove="-1" title="เลื่อนขึ้น">↑</button><button class="btn small" data-cmove="1" title="เลื่อนลง">↓</button>' +
          '<button class="btn small danger" data-cdel title="ลบ">✕</button></td></tr>';
      }).join('') +
      '</tbody></table><div class="btns"><button class="btn" id="col-add">+ เพิ่มคาบต่อท้าย</button><button class="btn" id="col-reset">คืนค่าเริ่มต้น (13 คาบ 08:00–22:00)</button></div></section>';

    $$('[data-set]', el).forEach((inp) => (inp.onchange = () => { s[inp.dataset.set] = inp.value.trim(); save(); }));
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
    $$('[data-day]', el).forEach((cb) => (cb.onchange = () => {
      const next = TT.ALL_DAYS.filter((d) => (d === cb.dataset.day ? cb.checked : s.days.includes(d)));
      if (!next.length) { cb.checked = true; return; }
      changeDays(next);
    }));
    $$('tr[data-col]', el).forEach((tr) => {
      const i = Number(tr.dataset.col);
      $$('[data-cf]', tr).forEach((inp) => (inp.onchange = () => {
        cols[i][inp.dataset.cf] = inp.value;
        if (inp.dataset.cf === 'type' && inp.value === 'break' && !cols[i].label) cols[i].label = 'พัก';
        commit();
      }));
      $('[data-cdel]', tr).onclick = () => { cols.splice(i, 1); commit(); };
      $$('[data-cmove]', tr).forEach((b) => (b.onclick = () => {
        const j = i + Number(b.dataset.cmove);
        if (j < 0 || j >= cols.length) return;
        [cols[i], cols[j]] = [cols[j], cols[i]];
        commit();
      }));
    });
    $('#col-add', el).onclick = () => {
      const last = cols[cols.length - 1];
      const start = last ? last.end : '08:00';
      const [h, m] = start.split(':').map(Number);
      cols.push({ type: 'period', start, end: String(Math.min(23, h + 1)).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0') });
      commit();
    };
    $('#col-reset', el).onclick = () => { if (confirm('คืนค่าโครงสร้างคาบเริ่มต้น?')) { s.columns = TT.defaultColumns(); commit(); } };
    $('#export', el).onclick = () => download('ตารางสอน-' + s.semester + '-' + s.year + '.json', JSON.stringify(state, null, 1));
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
      if (!confirm('ล้างภาระงานสอนและตารางทั้งหมด (เก็บครู รายวิชา กลุ่มเรียน ห้องไว้)?\nแนะนำให้บันทึกไฟล์สำรองของภาคเรียนเดิมก่อน')) return;
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
      pasteHint: 'คอลัมน์: ชื่อ-สกุล | วุฒิการศึกษา | แผนกวิชา | สาขาวิชา | หน้าที่พิเศษ',
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
    const cfg = ENT[ui.dataTab];
    const list = state[ui.dataTab];
    el.innerHTML =
      '<div class="subtabs">' + Object.entries(ENT).map(([k, c]) =>
        '<button class="subtab' + (k === ui.dataTab ? ' active' : '') + '" data-sub="' + k + '">' + c.title + ' <span class="count">' + state[k].length + '</span></button>').join('') + '</div>' +
      '<div class="toolbar"><input type="search" id="dfilter" placeholder="ค้นหา..." value="' + esc(ui.dataFilter) + '">' +
      '<button class="btn primary" id="dadd">+ เพิ่ม' + cfg.title + '</button><button class="btn" id="dpaste">วางจาก Excel</button>' +
      '<span class="spacer"></span><span class="hint">แก้ไขในช่องได้ทันที ระบบบันทึกอัตโนมัติ</span></div>' +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
      cfg.fields.map((f) => '<th>' + esc(f.label) + '</th>').join('') +
      (ui.dataTab === 'subjects' ? '<th>ชม./สัปดาห์</th>' : '') + '<th>ใช้ใน<br>ภาระงาน</th><th></th></tr></thead><tbody id="dbody"></tbody></table></div>';

    $$('[data-sub]', el).forEach((b) => (b.onclick = () => { ui.dataTab = b.dataset.sub; ui.dataFilter = ''; render(); }));
    $('#dfilter', el).oninput = (e) => { ui.dataFilter = e.target.value; fillDataBody(); };
    $('#dadd', el).onclick = () => {
      const item = { id: TT.uid(cfg.prefix) };
      cfg.fields.forEach((f) => (item[f.k] = f.type === 'bool' ? false : ''));
      if (ui.dataTab === 'teachers' || ui.dataTab === 'groups') item.unavailable = [];
      list.push(item);
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

  function fillDataBody() {
    const kind = ui.dataTab;
    const cfg = ENT[kind];
    const q = norm(ui.dataFilter).toLowerCase();
    const deptName = (id) => (state.departments.find((d) => d.id === id) || {}).name || '';
    const rows = state[kind].filter((it) => !q || cfg.fields.some((f) =>
      String(f.type === 'dept' ? deptName(it[f.k]) : it[f.k] == null ? '' : it[f.k]).toLowerCase().includes(q)));
    const body = $('#dbody');
    body.innerHTML = rows.map((it) =>
      '<tr data-id="' + esc(it.id) + '">' + cfg.fields.map((f) => {
        if (f.type === 'dept') return '<td><select data-f="' + f.k + '">' + options(state.departments, it[f.k], (d) => d.name, '-') + '</select></td>';
        if (f.type === 'bool') return '<td class="c"><input type="checkbox" data-f="' + f.k + '"' + (it[f.k] ? ' checked' : '') + '></td>';
        return '<td><input data-f="' + f.k + '" value="' + esc(it[f.k]) + '" style="width:' + (f.w || 8) + 'em"' + (f.type === 'num' ? ' inputmode="numeric"' : '') + '></td>';
      }).join('') +
      (kind === 'subjects' ? '<td class="c hrs">' + TT.subjectHours(it) + '</td>' : '') +
      '<td class="c">' + (usageCount(kind, it.id) || '') + '</td>' +
      '<td><button class="btn small danger" data-del title="ลบ">✕</button></td></tr>').join('') ||
      '<tr><td colspan="9" class="empty-row">ยังไม่มีข้อมูล กด "+ เพิ่ม" หรือ "วางจาก Excel"</td></tr>';

    $$('tr[data-id]', body).forEach((tr) => {
      const item = state[kind].find((x) => x.id === tr.dataset.id);
      $$('[data-f]', tr).forEach((inp) => (inp.onchange = () => {
        const f = cfg.fields.find((x) => x.k === inp.dataset.f);
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
    if (kind === 'teachers' || kind === 'subjects') {
      if (!confirm('ลบ "' + label + '"?' + (n ? '\nภาระงานสอนที่เกี่ยวข้อง ' + n + ' รายการจะถูกลบด้วย' : ''))) return;
      state.assignments = state.assignments.filter((a) => (kind === 'teachers' ? a.teacherId : a.subjectId) !== item.id);
    } else {
      if (!confirm('ลบ "' + label + '"?')) return;
      if (kind === 'groups') state.assignments.forEach((a) => (a.groupIds = a.groupIds.filter((g) => g !== item.id)));
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
        const r = {};
        let fields = cfg.fields;
        // รองรับ "1-2-2" ในช่องเดียว
        if (kind === 'subjects' && /^\d+\s*-\s*\d+\s*-\s*\d+$/.test(cells[2] || '')) {
          const [t, p, n] = cells[2].split('-').map((x) => Number(x.trim()));
          return { code: cells[0], name: cells[1], t, p, n };
        }
        fields.forEach((f, i) => (r[f.k] = cells[i] == null ? '' : cells[i]));
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

  function renderAssign(el) {
    const idx = TT.indexState(state);
    const placedCount = new Map();
    for (const p of state.placements) placedCount.set(p.assignmentId, (placedCount.get(p.assignmentId) || 0) + 1);
    const list = state.assignments.filter((a) => !ui.assignTeacher || a.teacherId === ui.assignTeacher);
    const teacherHours = ui.assignTeacher ? list.reduce((n, a) => n + TT.assignmentHours(a, idx.subjects), 0) : 0;

    el.innerHTML =
      '<p class="hint">ภาระงาน 1 แถว = ครู 1 คน สอนวิชา 1 วิชา ให้กลุ่มเรียน 1 กลุ่ม (หรือหลายกลุ่มที่เรียนรวมกันในเวลาเดียวกัน)<br>' +
      'ถ้าสอนวิชาเดียวกันให้หลายกลุ่ม<b>แยกเวลากัน</b> ให้เพิ่มเป็นคนละแถว · รูปแบบคาบ เช่น "3" = เรียนติดกัน 3 คาบ, "2+2" = แบ่งเป็น 2 ครั้ง ครั้งละ 2 คาบ · ' +
      '<b>Block Course</b> = เรียนติดกันเป็นก้อนใหญ่ข้ามพักกลางวันได้ เช่น "7"</p>' +
      '<div class="toolbar"><label>ครู <select id="afilter">' + options(state.teachers, ui.assignTeacher, (t) => t.name, 'ทั้งหมด') + '</select></label>' +
      '<button class="btn primary" id="aadd">+ เพิ่มภาระงาน</button><button class="btn" id="apaste">วางจาก Excel</button>' +
      '<span class="spacer"></span>' + (ui.assignTeacher ? '<span class="pill">รวม ' + teacherHours + ' ชม./สัปดาห์</span>' : '<span class="pill">' + state.assignments.length + ' รายการ</span>') + '</div>' +
      '<div class="table-wrap"><table class="data assign"><thead><tr><th>ครู</th><th>วิชา / กิจกรรม</th><th>กลุ่มเรียน</th><th>ห้อง/สถานที่</th><th>รูปแบบคาบ</th><th>ชม.</th><th>Block<br>Course</th><th>จัดแล้ว</th><th></th></tr></thead><tbody>' +
      (list.map((a) => {
        const blocks = TT.assignmentBlocks(a, idx.subjects);
        const sj = a.subjectId ? idx.subjects.get(a.subjectId) : null;
        const def = TT.defaultPattern(sj ? TT.subjectHours(sj) : 1, a.blockCourse);
        const done = placedCount.get(a.id) || 0;
        const mismatch = sj && TT.subjectHours(sj) !== blocks.reduce((x, y) => x + y, 0);
        return '<tr data-id="' + esc(a.id) + '">' +
          '<td><select data-af="teacherId">' + options(state.teachers, a.teacherId, (t) => t.name, '- เลือกครู -') + '</select></td>' +
          '<td><select data-af="subjectId" class="subj-sel"><option value="">— กิจกรรม (ไม่มีรหัสวิชา) —</option>' +
          state.subjects.map((s) => '<option value="' + esc(s.id) + '"' + (s.id === a.subjectId ? ' selected' : '') + '>' + esc(s.code + ' ' + s.name) + '</option>').join('') + '</select>' +
          (a.subjectId ? '' : '<input data-af="title" placeholder="เช่น Home Room" value="' + esc(a.title) + '">') + '</td>' +
          '<td class="groups-cell"><button class="btn small" data-pick>' + (a.groupIds.length
            ? a.groupIds.map((g) => esc((idx.groups.get(g) || {}).name || '?')).join('<br>')
            : 'เลือกกลุ่มเรียน…') + '</button></td>' +
          '<td><select data-af="roomId">' + options(state.rooms, a.roomId, (r) => r.name, '-') + '</select></td>' +
          '<td><input data-af="blocks" value="' + esc(a.blocks) + '" placeholder="' + esc(def) + '" style="width:5em"></td>' +
          '<td class="c' + (mismatch ? ' warn' : '') + '"' + (mismatch ? ' title="ไม่ตรงกับ ท.+ป. ของรายวิชา (' + TT.subjectHours(sj) + ')"' : '') + '>' + blocks.reduce((x, y) => x + y, 0) + '</td>' +
          '<td class="c"><input type="checkbox" data-af="blockCourse"' + (a.blockCourse ? ' checked' : '') + '></td>' +
          '<td class="c ' + (done >= blocks.length ? 'ok' : 'todo') + '">' + done + '/' + blocks.length + '</td>' +
          '<td class="nowrap"><button class="btn small" data-dup title="ทำสำเนา (เช่น วิชาเดียวกันแต่อีกกลุ่มเรียน)">⧉</button><button class="btn small danger" data-del title="ลบ">✕</button></td></tr>';
      }).join('') || '<tr><td colspan="9" class="empty-row">ยังไม่มีภาระงาน</td></tr>') +
      '</tbody></table></div>';

    $('#afilter', el).onchange = (e) => { ui.assignTeacher = e.target.value; render(); };
    $('#aadd', el).onclick = () => {
      state.assignments.push({ id: TT.uid('a'), teacherId: ui.assignTeacher || '', subjectId: null, title: '', groupIds: [], roomId: null, blocks: '', blockCourse: false });
      commit();
    };
    $('#apaste', el).onclick = () => openPaste('ภาระงานสอน',
      'คอลัมน์: ชื่อครู | รหัสวิชา (หรือชื่อกิจกรรม เช่น Home Room) | รหัสกลุ่มเรียน (เรียนรวมหลายกลุ่มคั่นด้วย , ) | ห้อง | รูปแบบคาบ (เว้นว่างได้) | Block Course (ใส่ "ใช่")',
      importAssignments);
    $$('tr[data-id]', el).forEach((tr) => {
      const a = state.assignments.find((x) => x.id === tr.dataset.id);
      $$('[data-af]', tr).forEach((inp) => (inp.onchange = () => {
        const k = inp.dataset.af;
        a[k] = inp.type === 'checkbox' ? inp.checked : inp.value === '' && (k === 'subjectId' || k === 'roomId') ? null : inp.value.trim();
        if (k === 'blocks' && a.blocks && !TT.parsePattern(a.blocks)) toast('รูปแบบคาบไม่ถูกต้อง ใช้ตัวเลขคั่นด้วย + เช่น 2+2', true);
        commit();
      }));
      $('[data-pick]', tr).onclick = () => pickGroups(a);
      $('[data-dup]', tr).onclick = () => {
        const copy = { ...a, id: TT.uid('a'), groupIds: [] };
        state.assignments.splice(state.assignments.indexOf(a) + 1, 0, copy);
        commit();
        pickGroups(copy);
      };
      $('[data-del]', tr).onclick = () => {
        if (!confirm('ลบภาระงานนี้? คาบที่จัดไว้จะถูกนำออกจากตารางด้วย')) return;
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
        '<p class="hint">ยังไม่มีกลุ่มเรียน เพิ่มได้ที่ ข้อมูลพื้นฐาน → กลุ่มเรียน</p>';
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
      const [tName, subj, groupsText, roomName, pattern, bc] = cells;
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
      });
      added++;
    }
    commit();
    if (problems.length) alert('นำเข้า ' + added + ' รายการ แต่มีปัญหา:\n' + [...new Set(problems)].slice(0, 20).join('\n'));
    return 'เพิ่มภาระงาน ' + added + ' รายการ';
  }

  /* -------------------------------- จัดตาราง -------------------------------- */

  const VIEWS = {
    teacher: { label: 'ครู', list: () => state.teachers, name: (x) => x.name, match: (a, id) => a.teacherId === id, rk: 't' },
    group: { label: 'กลุ่มเรียน', list: () => state.groups, name: (x) => x.name + ' (' + x.code + ')', match: (a, id) => a.groupIds.includes(id), rk: 'g' },
    room: { label: 'ห้อง', list: () => state.rooms, name: (x) => x.name, match: (a, id) => a.roomId === id, rk: 'r' },
  };

  function parseKey(key) {
    const i = key.lastIndexOf('#');
    return { assignmentId: key.slice(0, i), blockIndex: Number(key.slice(i + 1)) };
  }

  function renderSchedule(el) {
    const v = VIEWS[ui.view];
    const ents = v.list();
    if (!ents.find((x) => x.id === ui.viewId)) ui.viewId = ents[0] ? ents[0].id : '';
    const ent = ents.find((x) => x.id === ui.viewId);
    const blocks = TT.allBlocks(state);
    const pendingBy = new Map();
    for (const b of blocks) if (!b.placement) for (const e of ents) if (v.match(b.assignment, e.id)) pendingBy.set(e.id, (pendingBy.get(e.id) || 0) + 1);
    const conflicts = TT.findConflicts(state);
    const totalBlocks = blocks.length;
    const placedBlocks = blocks.filter((b) => b.placement).length;
    const canUnav = ui.view !== 'room' && ent;
    if (!canUnav) ui.mode = 'place';

    el.innerHTML =
      '<div class="toolbar">' +
      '<div class="seg">' + Object.entries(VIEWS).map(([k, x]) => '<button data-view="' + k + '" class="' + (k === ui.view ? 'active' : '') + '">' + x.label + '</button>').join('') + '</div>' +
      '<button class="btn small" data-step="-1" title="ก่อนหน้า">‹</button>' +
      '<select id="vsel">' + ents.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === ui.viewId ? ' selected' : '') + '>' +
        esc(v.name(x)) + (pendingBy.get(x.id) ? ' — เหลือ ' + pendingBy.get(x.id) : '') + '</option>').join('') + '</select>' +
      '<button class="btn small" data-step="1" title="ถัดไป">›</button>' +
      (canUnav ? '<div class="seg"><button data-mode="place" class="' + (ui.mode === 'place' ? 'active' : '') + '">วางคาบ</button>' +
        '<button data-mode="unav" class="' + (ui.mode === 'unav' ? 'active' : '') + '">กำหนดเวลาไม่ว่าง</button></div>' : '') +
      '<span class="spacer"></span>' +
      '<button class="btn primary" id="auto">จัดอัตโนมัติ</button>' +
      '<button class="btn" id="clear-one" ' + (ent ? '' : 'disabled') + '>ล้างตารางนี้</button>' +
      '<button class="btn" id="clear-all">ล้างทั้งหมด</button></div>' +
      '<div class="status">จัดแล้ว <b>' + placedBlocks + '/' + totalBlocks + '</b> ก้อน' +
      (conflicts.list.length
        ? ' · <button class="linkish bad" id="show-conf">ชนกัน ' + conflicts.list.length + ' จุด ▾</button>'
        : ' · <span class="ok">ไม่มีคาบชนกัน</span>') +
      (ui.mode === 'unav' ? ' · <b>โหมดกำหนดเวลาไม่ว่าง:</b> คลิกช่องว่างเพื่อสลับ ว่าง/ไม่ว่าง (ช่องลายเทา = ไม่ว่าง)' : '') + '</div>' +
      (ui.showConflicts && conflicts.list.length ? '<div class="conf-list">' + conflicts.list.map((c) =>
        '<button class="linkish" data-res="' + esc(c.resource) + '">' + esc(state.settings.days[c.day]) + ' คาบ ' + c.periods.join(', ') + ': ' + esc(c.message) + '</button>').join('') + '</div>' : '') +
      (ui.lastUnplaced.length ? '<div class="notice bad">จัดอัตโนมัติแล้ว แต่ยังวางไม่ได้ ' + ui.lastUnplaced.length + ' ก้อน (เวลาของครู/กลุ่มเรียน/ห้องเต็ม) ดูได้ในรายการ "ยังไม่ได้จัด" ของแต่ละคน ' +
        '<button class="btn small" id="dismiss-un">ปิด</button></div>' : '') +
      '<div class="sched">' +
      '<div class="grid-wrap" id="gridwrap">' + (ent ? gridFor(ent, conflicts) : '<p class="hint">ยังไม่มี' + v.label + ' เพิ่มได้ที่แท็บ ข้อมูลพื้นฐาน</p>') + '</div>' +
      '<aside class="side">' + (ent ? sidePanel(ent, blocks, conflicts) : '') + '</aside></div>';

    $$('[data-view]', el).forEach((b) => (b.onclick = () => { ui.view = b.dataset.view; ui.viewId = ''; ui.selected = null; render(); }));
    $$('[data-mode]', el).forEach((b) => (b.onclick = () => { ui.mode = b.dataset.mode; ui.selected = null; render(); }));
    $('#vsel', el).onchange = (e) => { ui.viewId = e.target.value; ui.selected = null; render(); };
    $$('[data-step]', el).forEach((b) => (b.onclick = () => {
      const i = ents.findIndex((x) => x.id === ui.viewId) + Number(b.dataset.step);
      if (ents[i]) { ui.viewId = ents[i].id; ui.selected = null; render(); }
    }));
    $('#auto', el).onclick = runAuto;
    $('#clear-one', el).onclick = () => {
      if (!ent || !confirm('นำคาบที่ไม่ได้ล็อกของ "' + v.name(ent) + '" ออกจากตาราง?')) return;
      const ids = new Set(state.assignments.filter((a) => v.match(a, ent.id)).map((a) => a.id));
      state.placements = state.placements.filter((p) => p.locked || !ids.has(p.assignmentId));
      commit();
    };
    $('#clear-all', el).onclick = () => {
      if (!confirm('นำคาบที่ไม่ได้ล็อกของทุกคนออกจากตาราง?')) return;
      state.placements = state.placements.filter((p) => p.locked);
      commit();
    };
    const sc = $('#show-conf', el);
    if (sc) sc.onclick = () => { ui.showConflicts = !ui.showConflicts; render(); };
    $$('[data-res]', el).forEach((b) => (b.onclick = () => {
      const [t, id] = [b.dataset.res[0], b.dataset.res.slice(2)];
      ui.view = t === 't' ? 'teacher' : t === 'g' ? 'group' : 'room';
      ui.viewId = id;
      render();
    }));
    const du = $('#dismiss-un', el);
    if (du) du.onclick = () => { ui.lastUnplaced = []; render(); };
    if (ent) bindGrid(el, ent);
  }

  function gridFor(ent, conflicts) {
    const v = VIEWS[ui.view];
    const items = P.cellItems(state, (a) => v.match(a, ent.id), ui.view).map((it) => {
      const bad = conflicts.byPlacement.get(it.key);
      it.cls = [bad ? 'conflict' : '', it.placement.locked ? 'locked' : '', ui.selected === it.key ? 'selected' : '', it.assignment.blockCourse ? 'bc' : ''].join(' ');
      if (bad) it.title += '\n⚠ ' + [...bad].join('\n⚠ ');
      if (it.placement.locked) it.html = '<span class="lock" title="ล็อกไว้">🔒</span>' + it.html;
      return it;
    });
    return buildGrid({ state, items, editable: true, unavailable: new Set(ent.unavailable || []) });
  }

  function blockLabel(b, idx) {
    const a = b.assignment;
    const s = a.subjectId ? idx.subjects.get(a.subjectId) : null;
    const who = ui.view === 'teacher'
      ? a.groupIds.map((g) => (idx.groups.get(g) || {}).name).filter(Boolean).join(', ')
      : (idx.teachers.get(a.teacherId) || {}).name || '';
    return '<b>' + esc(s ? s.code : a.title || 'กิจกรรม') + '</b> · ' + b.len + ' คาบ' + (a.blockCourse ? ' · Block Course' : '') +
      '<br><small>' + esc(s ? s.name : '') + (who ? ' — ' + esc(who) : '') + '</small>';
  }

  function sidePanel(ent, blocks, conflicts) {
    const v = VIEWS[ui.view];
    const idx = TT.indexState(state);
    const mine = blocks.filter((b) => v.match(b.assignment, ent.id));
    const pending = mine.filter((b) => !b.placement);
    let html = '';
    const sel = ui.selected && mine.find((b) => b.key === ui.selected);
    if (sel && sel.placement) {
      const bad = conflicts.byPlacement.get(sel.key);
      html += '<div class="card sel-card"><h4>คาบที่เลือก</h4><div>' + blockLabel(sel, idx) + '</div>' +
        '<div class="hint">' + esc(state.settings.days[sel.placement.day]) + ' คาบ ' + sel.placement.start + (sel.len > 1 ? '–' + (sel.placement.start + sel.len - 1) : '') + '</div>' +
        (bad ? '<div class="bad">⚠ ' + [...bad].map(esc).join('<br>⚠ ') + '</div>' : '') +
        '<p class="hint">คลิกช่องสีเขียวเพื่อย้าย หรือลากไปวาง</p>' +
        '<div class="btns"><button class="btn small" id="sel-lock">' + (sel.placement.locked ? 'ปลดล็อก' : 'ล็อก (จัดอัตโนมัติจะไม่ขยับ)') + '</button>' +
        '<button class="btn small danger" id="sel-remove">เอาออกจากตาราง</button><button class="btn small" id="sel-cancel">ยกเลิก</button></div></div>';
    }
    html += '<h4>ยังไม่ได้จัด (' + pending.length + ')</h4>';
    html += pending.length
      ? '<p class="hint">ลากไปวางในตาราง หรือคลิกเลือกแล้วคลิกช่องสีเขียว</p>' + pending.map((b) =>
        '<div class="chip' + (ui.selected === b.key ? ' selected' : '') + '" draggable="true" data-key="' + esc(b.key) + '">' + blockLabel(b, idx) + '</div>').join('')
      : '<p class="hint ok">จัดครบแล้ว ✓</p>';
    const hours = mine.reduce((n, b) => n + b.len, 0);
    const placedHours = mine.filter((b) => b.placement).reduce((n, b) => n + b.len, 0);
    html += '<p class="hint">ลงตารางแล้ว ' + placedHours + '/' + hours + ' ชั่วโมง</p>';
    return html;
  }

  function highlight(key) {
    clearHighlight();
    if (!key) return;
    const { assignmentId, blockIndex } = parseKey(key);
    const a = state.assignments.find((x) => x.id === assignmentId);
    if (!a) return;
    const idx = TT.indexState(state);
    const cache = { idx, pers: TT.periods(state.settings), occ: TT.buildOccupancy(state, idx, key) };
    $$('#gridwrap td.empty[data-p]').forEach((td) => {
      const r = TT.checkPlacement(state, a, blockIndex, Number(td.dataset.d), Number(td.dataset.p), cache);
      td.classList.add(r.ok ? 'can' : r.span ? 'clash' : 'nospan');
      td.title = r.ok ? 'วางได้' : r.reasons.join('\n');
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
    const r = TT.checkPlacement(state, a, blockIndex, day, start);
    if (!r.span) { toast(r.reasons[0], true); return; }
    if (!r.ok && !confirm('คาบนี้จะชนกัน:\n- ' + r.reasons.join('\n- ') + '\n\nต้องการวางต่อไหม?')) return;
    const old = state.placements.find((p) => p.assignmentId === assignmentId && p.blockIndex === blockIndex);
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
    const wrap = $('#gridwrap', el);
    // คลิก
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
    // ลากวาง
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
    // แผงด้านข้าง
    $$('.chip[data-key]', el).forEach((c) => (c.onclick = () => { ui.selected = ui.selected === c.dataset.key ? null : c.dataset.key; render(); }));
    const cur = ui.selected && state.placements.find((p) => TT.placementKey(p.assignmentId, p.blockIndex) === ui.selected);
    const lock = $('#sel-lock', el);
    if (lock) lock.onclick = () => { cur.locked = !cur.locked; commit(); };
    const rm = $('#sel-remove', el);
    if (rm) rm.onclick = () => { state.placements = state.placements.filter((p) => p !== cur); ui.selected = null; commit(); };
    const cc = $('#sel-cancel', el);
    if (cc) cc.onclick = () => { ui.selected = null; render(); };
    if (ui.selected && ui.mode === 'place') highlight(ui.selected);
  }

  function runAuto() {
    const pending = TT.allBlocks(state).filter((b) => !b.placement).length;
    if (!pending) { toast('ทุกก้อนถูกจัดแล้ว ถ้าต้องการจัดใหม่ให้กด "ล้างทั้งหมด" ก่อน (คาบที่ล็อกไว้จะไม่ถูกล้าง)'); return; }
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

  /* ---------------------------------- พิมพ์ ---------------------------------- */

  function renderPrint(el) {
    const type = ui.printType;
    let list = type === 'teacher' ? state.teachers : type === 'group' ? state.groups : state.rooms;
    if (type === 'teacher' && ui.printDept) list = list.filter((t) => t.departmentId === ui.printDept);
    if (ui.printId && !list.find((x) => x.id === ui.printId)) ui.printId = '';
    const chosen = ui.printId ? list.filter((x) => x.id === ui.printId) : list;
    const nameOf = (x) => (type === 'group' ? x.name + ' (' + x.code + ')' : x.name);

    el.innerHTML =
      '<div class="toolbar no-print">' +
      '<select id="ptype"><option value="teacher"' + (type === 'teacher' ? ' selected' : '') + '>ตารางสอนรายครู</option>' +
      '<option value="group"' + (type === 'group' ? ' selected' : '') + '>ตารางเรียนรายกลุ่มเรียน</option>' +
      '<option value="room"' + (type === 'room' ? ' selected' : '') + '>ตารางการใช้ห้อง/สถานที่</option></select>' +
      (type === 'teacher' ? '<select id="pdept">' + options(state.departments, ui.printDept, (d) => 'แผนก' + d.name, 'ทุกแผนกวิชา') + '</select>' : '') +
      '<select id="pid"><option value="">ทั้งหมด (' + list.length + ')</option>' + list.map((x) =>
        '<option value="' + esc(x.id) + '"' + (x.id === ui.printId ? ' selected' : '') + '>' + esc(nameOf(x)) + '</option>').join('') + '</select>' +
      (type === 'teacher' ? '<label class="chk"><input type="checkbox" id="pdetail"' + (ui.printDetail ? ' checked' : '') + '> พิมพ์หน้ารายละเอียดคาบสอน (หน้า 2)</label>' : '') +
      '<span class="spacer"></span><button class="btn primary" id="pgo">พิมพ์ / บันทึกเป็น PDF</button></div>' +
      '<p class="hint no-print">กระดาษ A4 แนวนอน · ถ้าต้องการไฟล์ PDF ให้เลือกเครื่องพิมพ์ "บันทึกเป็น PDF" (Save as PDF)</p>' +
      '<div id="print-area">' + (chosen.length ? chosen.map((x) =>
        type === 'teacher' ? P.teacherPages(state, x, ui.printDetail) : type === 'group' ? P.groupPage(state, x) : P.roomPage(state, x)).join('')
        : '<p class="hint">ไม่มีข้อมูลให้พิมพ์</p>') + '</div>';

    $('#ptype', el).onchange = (e) => { ui.printType = e.target.value; ui.printId = ''; render(); };
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
    $('#hdr-export').onclick = () => download('ตารางสอน-' + state.settings.semester + '-' + state.settings.year + '.json', JSON.stringify(state, null, 1));
    TT.sanitizePlacements(state);
    render();
  });
})();
