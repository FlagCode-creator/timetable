/* สร้างหน้าพิมพ์: ตารางสอนรายครู (หน้า 1 + หน้า 2), ตารางเรียนรายกลุ่ม, ตารางการใช้ห้อง */
(function (root) {
  'use strict';
  const TT = root.TT;
  const { buildGrid, esc } = root.TTGrid;

  function sig(name, position, prefix) {
    return '<div class="sig">' + (prefix ? '<div class="sig-pre">' + esc(prefix) + '</div>' : '') +
      '<div>ลงชื่อ......................................................</div>' +
      '<div>(' + (name ? esc(name) : '&nbsp;'.repeat(40)) + ')</div>' +
      '<div>' + esc(position) + '</div></div>';
  }

  function semesterText(s) {
    return esc(s.semester) + '/' + esc(s.year);
  }

  function logo(s) {
    return s.logo ? '<img class="logo" src="' + esc(s.logo) + '" alt="">' : '';
  }

  /** สีประจำวิชา (โทนอ่อน 10 สี) ใช้ตำแหน่งรายวิชาในรายการ เพื่อให้วิชาที่อยู่ติดกันได้สีต่างกัน */
  function colorClass(state, a) {
    if (a.recurringId) return 'cx';
    let n;
    if (a.subjectId) n = state.subjects.findIndex((x) => x.id === a.subjectId);
    else n = [...String(a.title || '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    return 'c' + (Math.max(0, n) % 10);
  }

  /** เนื้อหาในช่องตารางตามมุมมอง */
  /** ชั้น/กลุ่มเรียน + แผนกของกลุ่ม เช่น "ปวช.1 สารสนเทศ 68 · แผนกเทคโนโลยีสารสนเทศ" */
  function classText(idx, groupIds) {
    const gs = groupIds.map((g) => idx.groups.get(g)).filter(Boolean);
    // แผนก: ที่ตั้งไว้ หรือเดาจากสาขา/ชื่อกลุ่ม (เหมือนหน้าข้อมูล)
    const flat = (x) => String(x || '').replace(/[\s.]/g, '');
    const guess = (g) => {
      const m = flat(g.major);
      const n = flat(g.name);
      const d = [...idx.departments.values()].find((x) => { const k = flat(x.name); return k && ((m && (m === k || m.includes(k) || k.includes(m))) || n.includes(k)); });
      return d ? d.name : '';
    };
    const depts = [...new Set(gs.map((g) => (idx.departments.get(g.departmentId) || {}).name || guess(g)).filter(Boolean))];
    return { groups: gs.map((g) => g.name || g.code), dept: depts.length ? 'แผนก' + depts.join(', ') : '' };
  }

  /** เนื้อหาในช่องตารางตามมุมมอง · ใบพิมพ์ (forEditor = false): รหัสวิชา ชื่อวิชา ชั้น/กลุ่ม แผนก (ตารางครู/ห้อง) หรือครู (ตารางกลุ่ม) */
  function cellItems(state, filter, view, forEditor) {
    const idx = TT.indexState(state);
    const items = [];
    const render = (it) => {
      const lines = it.head.slice();
      if (view !== 'group' && it.groups.length) lines.push(esc(it.groups.join(', ') + (!forEditor && it.dept && !it.teacherAct ? ' · ' + it.dept : '')));
      return lines.map((l, i) => '<div class="' + (i === 0 ? 'c-code' : i === 1 && it.named ? 'c-name' : 'c-line') + '">' + l + '</div>').join('') +
        it.tail.map((l) => '<div class="c-line c-room">' + l + '</div>').join('');
    };
    for (const pl of state.placements) {
      const a = idx.assignments.get(pl.assignmentId);
      if (!a || !filter(a)) continue;
      const len = TT.assignmentBlocks(a, idx.subjects)[pl.blockIndex];
      const s = a.subjectId ? idx.subjects.get(a.subjectId) : null;
      const room = a.roomId ? idx.rooms.get(a.roomId) : null;
      const teacher = idx.teachers.get(a.teacherId);
      const cls = classText(idx, a.groupIds);
      // Home Room ครูที่ปรึกษาหลายห้อง (ตารางครู/ห้อง): รวมเป็นช่องเดียว แสดงทุกห้อง
      if (view !== 'group' && a.recurringId) {
        const same = items.find((it) => it.day === pl.day && it.start === pl.start && TT.isCombinedWith(it.assignment, a));
        if (same) {
          same.groups.push(...cls.groups);
          if (cls.dept && !same.dept.includes(cls.dept.slice(4))) same.dept = same.dept ? same.dept + ', ' + cls.dept.slice(4) : cls.dept;
          same.html = render(same);
          continue;
        }
      }
      const head = [esc(s ? s.code : a.title || 'กิจกรรม') + (a.blockCourse ? ' <small>(Block Course)</small>' : '')];
      const named = !forEditor && !!s;
      if (named) head.push(esc(s.name)); // ใบพิมพ์: ชื่อวิชาใต้รหัส
      const tail = [];
      if (view !== 'teacher' && teacher) head.push(esc(teacher.name));
      else if (view !== 'teacher' && forEditor) head.push('<span class="no-teacher">ยังไม่มีครู</span>');
      if (view !== 'room' && room) (forEditor ? head : tail).push(esc(room.name));
      const it = {
        key: TT.placementKey(a.id, pl.blockIndex),
        day: pl.day,
        start: pl.start,
        len,
        assignment: a,
        placement: pl,
        recurring: !!a.recurringId,
        color: colorClass(state, a),
        title: s ? s.code + ' ' + s.name : a.title,
        head,
        tail,
        named,
        teacherAct: TT.isTeacherActivity(state, a),
        groups: cls.groups.slice(),
        dept: cls.dept,
      };
      it.html = render(it);
      items.push(it);
    }
    return items;
  }

  function subjectTable(subjects, totals) {
    const per = Math.max(9, Math.ceil(subjects.length / 2));
    const cells = (x) => x
      ? '<td class="code">' + esc(x.code) + '</td><td class="name">' + esc(x.name) + '</td><td>' + esc(x.t) + '</td><td>' + esc(x.p) + '</td><td>' + esc(x.n) + '</td><td>' + esc(x.h) + '</td>'
      : '<td class="code"></td><td class="name"></td><td></td><td></td><td></td><td></td>';
    let html = '<table class="subj"><thead><tr>';
    for (let k = 0; k < 2; k++) html += '<th>รหัสวิชา</th><th>ชื่อรายวิชา</th><th>ท.</th><th>ป.</th><th>น.</th><th>ช.</th>';
    html += '</tr></thead><tbody>';
    for (let i = 0; i < per; i++) html += '<tr>' + cells(subjects[i]) + cells(subjects[per + i]) + '</tr>';
    html += '<tr class="total"><td colspan="2" class="r">รวม</td><td>' + totals.t + '</td><td>' + totals.p + '</td><td>' + totals.n + '</td><td>' + totals.h + '</td><td colspan="6"></td></tr>';
    return html + '</tbody></table>';
  }

  function teacherPages(state, teacher, withDetail) {
    const s = state.settings;
    const idx = TT.indexState(state);
    const dept = idx.departments.get(teacher.departmentId) || {};
    const sum = TT.teacherSummary(state, teacher.id);
    const items = cellItems(state, (a) => a.teacherId === teacher.id, 'teacher');
    const signers = s.signers;

    let html = '<section class="page">' +
      '<table class="head"><tr><td class="info">' + logo(s) +
      '<div class="college">' + esc(s.collegeName) + '</div>' +
      '<div><b>ภาคเรียน</b> ' + semesterText(s) + '</div>' +
      '<div><b>ผู้สอน</b> ' + esc(teacher.name) + '</div>' +
      '<div><b>วุฒิการศึกษา</b> ' + esc(teacher.qualification) + '</div>' +
      '<div><b>แผนกวิชา</b> ' + esc(dept.name) + '</div>' +
      '<div><b>หน้าที่พิเศษ</b> ' + esc(teacher.duty) + '</div>' +
      '</td><td class="subj-cell">' + subjectTable(sum.subjects, sum.totals) + '</td></tr></table>' +
      buildGrid({ state, items }) +
      '<div class="sigs four">' +
      sig(dept.head, 'หัวหน้าแผนกวิชา') +
      sig(signers.curriculumHead, 'หัวหน้างานพัฒนาหลักสูตรการเรียนการสอน') +
      sig(signers.viceDirector, 'รองผู้อำนวยการฝ่ายวิชาการ') +
      sig(signers.director, 'ผู้อำนวยการ') +
      '</div></section>';

    if (!withDetail) return html;

    html += '<section class="page detail">' +
      '<h2>ตารางสอนภาคเรียนที่ ' + esc(s.semester) + ' ปีการศึกษา ' + esc(s.year) + '</h2>' +
      '<div class="center">' + esc(s.collegeName) + '</div>' +
      '<table class="kv"><tr><td><b>ชื่อผู้สอน</b> ' + esc(teacher.name) + '</td><td><b>แผนกวิชา</b> ' + esc(dept.name) + '</td></tr>' +
      '<tr><td><b>วุฒิการศึกษา</b> ' + esc(teacher.qualification) + '</td><td><b>สาขาวิชา</b> ' + esc(teacher.major) + '</td></tr>' +
      '<tr><td colspan="2"><b>หน้าที่พิเศษ</b> ' + esc(teacher.duty) + '</td></tr></table>' +
      '<div class="subj-list">' + sum.subjects.map((x) =>
        '<div>' + esc(x.code) + ' ' + esc(x.name) + (x.isSubject ? ' <span class="tpn">' + x.t + '-' + x.p + '-' + x.n + '</span>' : '') + '</div>').join('') + '</div>' +
      '<table class="list"><thead><tr><th>วัน</th><th>คาบเรียน</th><th>เวลาเรียน</th><th>กลุ่มเรียน</th><th>รหัสวิชา</th><th>ชื่อวิชา</th><th>ห้อง</th></tr></thead><tbody>' +
      sum.rows.map((r) => '<tr><td>' + esc(s.days[r.day]) + '</td><td>' + r.start + (r.end > r.start ? ' - ' + r.end : '') + '</td><td>' + esc(r.time) +
        '</td><td>' + esc(r.group) + '</td><td>' + esc(r.subjectCode) + '</td><td class="l">' + esc(r.subjectName) + (r.blockCourse ? ' (Block Course)' : '') +
        '</td><td class="l">' + esc(r.room || '-') + '</td></tr>').join('') +
      '</tbody></table>' +
      '<div class="total-line">รวมจำนวนชั่วโมงที่สอน <b>' + sum.totals.h + '</b> ชั่วโมง/สัปดาห์' +
      (sum.scheduled !== sum.totals.h ? ' <span class="warn">(ลงตารางแล้ว ' + sum.scheduled + ' ชั่วโมง)</span>' : '') + '</div>' +
      '<div class="sigs three">' +
      sig(dept.head, 'หัวหน้าแผนกวิชา') +
      sig(signers.viceDirector, 'รองผู้อำนวยการฝ่ายวิชาการ') +
      sig(signers.director, 'ผู้อำนวยการ', 'อนุมัติ') +
      '</div></section>';
    return html;
  }

  function groupPage(state, group) {
    const s = state.settings;
    const idx = TT.indexState(state);
    const mine = state.assignments.filter((a) => a.groupIds.includes(group.id));
    const items = cellItems(state, (a) => a.groupIds.includes(group.id), 'group');
    let total = 0;
    const rows = mine.map((a) => {
      const sj = a.subjectId ? idx.subjects.get(a.subjectId) : null;
      const h = TT.assignmentHours(a, idx.subjects);
      total += h;
      return '<tr><td class="code">' + esc(sj ? sj.code : a.title) + '</td><td class="name">' + esc(sj ? sj.name : '') +
        (a.blockCourse ? ' (Block Course)' : '') + '</td><td>' + (sj ? sj.t + '-' + sj.p + '-' + sj.n : '') + '</td><td>' + h + '</td><td class="name">' +
        esc((idx.teachers.get(a.teacherId) || {}).name) + '</td></tr>';
    }).join('');
    return '<section class="page">' +
      '<table class="head"><tr><td class="info">' + logo(s) +
      '<div class="college">' + esc(s.collegeName) + '</div>' +
      '<div><b>ตารางเรียน ภาคเรียน</b> ' + semesterText(s) + '</div>' +
      '<div><b>กลุ่มเรียน</b> ' + esc(group.name) + ' (' + esc(group.code) + ')</div>' +
      (group.level ? '<div><b>ระดับชั้น</b> ' + esc(group.level) + '</div>' : '') +
      (group.major ? '<div><b>สาขาวิชา</b> ' + esc(group.major) + '</div>' : '') +
      (group.advisor ? '<div><b>ครูที่ปรึกษา</b> ' + esc(group.advisor) + '</div>' : '') +
      (group.size ? '<div><b>จำนวนผู้เรียน</b> ' + esc(group.size) + ' คน</div>' : '') +
      '</td><td class="subj-cell"><table class="subj"><thead><tr><th>รหัสวิชา</th><th>ชื่อรายวิชา</th><th>ท-ป-น</th><th>ชม.</th><th>ครูผู้สอน</th></tr></thead><tbody>' +
      rows + '<tr class="total"><td colspan="3" class="r">รวม</td><td>' + total + '</td><td></td></tr></tbody></table></td></tr></table>' +
      buildGrid({ state, items }) +
      '<div class="sigs three">' +
      sig(group.advisor, 'ครูที่ปรึกษา') +
      sig(s.signers.viceDirector, 'รองผู้อำนวยการฝ่ายวิชาการ') +
      sig(s.signers.director, 'ผู้อำนวยการ') +
      '</div></section>';
  }

  function roomPage(state, room) {
    const s = state.settings;
    const items = cellItems(state, (a) => a.roomId === room.id, 'room');
    return '<section class="page">' +
      '<div class="room-head">' + logo(s) + '<div><div class="college">' + esc(s.collegeName) + '</div>' +
      '<div><b>ตารางการใช้ห้อง/สถานที่</b> ' + esc(room.name) + ' &nbsp; <b>ภาคเรียน</b> ' + semesterText(s) + '</div></div></div>' +
      buildGrid({ state, items }) + '</section>';
  }

  const DAY_ABBR = { 'อาทิตย์': 'อา', 'จันทร์': 'จ', 'อังคาร': 'อ', 'พุธ': 'พ', 'พฤหัสบดี': 'พฤ', 'ศุกร์': 'ศ', 'เสาร์': 'ส' };

  /**
   * ตารางทั้งเทอมแบบวันที่ 1 set (แถว = วันที่ เหมือนตารางกระดาษ)
   * o: { weekly: items ตารางรายสัปดาห์ (day = วันจริง), sessions: [session], sessItem(x) → item, editable, unavailable: Set "day|p", endWeek, seen: Set สัปดาห์ที่ใส่ id แล้ว }
   */
  function termSetGrid(state, st, o) {
    const s = state.settings;
    const P = TT.periods(s).length;
    const blockedReal = TT.blockedCells(s);
    const items = [];
    const blocked = new Map();
    const unav = new Set();
    const rows = st.days.map((x, i) => {
      const block = (why) => { for (let p = 1; p <= P; p++) if (!blocked.has(i + '|' + p)) blocked.set(i + '|' + p, why); };
      if (x.kind === 'off') block(' ');
      else {
        for (const [ck, why] of blockedReal) { const [d, p] = ck.split('|'); if (Number(d) === x.day) blocked.set(i + '|' + p, why); }
        if (o.endWeek && x.week > o.endWeek) block('จบภาคเรียนแล้ว');
        for (const k of o.unavailable || []) { const [d, p] = k.split('|'); if (Number(d) === x.day) unav.add(i + '|' + p); }
        for (const it of o.weekly || []) if (it.day === x.day) items.push(Object.assign({}, it, { day: i }));
        for (const y of o.sessions || []) if (y.week === x.week && y.day === x.day) items.push(Object.assign({}, o.sessItem(y), { day: i }));
      }
      let id = '';
      if (x.kind !== 'off' && o.seen && !o.seen.has(x.week)) { o.seen.add(x.week); id = 'tw-' + x.week; }
      return {
        label: '<span class="dno">' + (x.no || '') + '</span><span class="ddate">' + x.d + '/' + x.m + '/' + x.y + '</span><span class="ddow">' + esc(DAY_ABBR[x.dow] || '') + '</span>',
        cls: 'r-' + x.kind,
        attrs: x.kind === 'off' ? '' : 'data-week="' + x.week + '" data-date="' + x.iso + '"',
        id,
        day: x.day,
      };
    });
    return buildGrid({ state, items, rows, editable: !!o.editable, unavailable: unav, blocked });
  }

  function dateText(x) {
    return x ? x.d + '/' + x.m + '/' + x.y : '';
  }

  /** ตารางทั้งเทอม: หน้าสรุป + ตารางจริงของแต่ละสัปดาห์ (รายสัปดาห์ + ทั้งเทอม) หน้าละ 2 สัปดาห์ */
  function termPage(state, ent, kind) {
    const s = state.settings;
    const idx = TT.indexState(state);
    const match = kind === 'group' ? (a) => a.groupIds.includes(ent.id) : (a) => a.teacherId === ent.id;
    const view = kind === 'group' ? 'group' : 'teacher';
    const mine = state.assignments.filter((a) => TT.isTerm(a) && match(a));
    const weekly = cellItems(state, match, view);
    const rows = mine.map((a) => {
      const sj = a.subjectId ? idx.subjects.get(a.subjectId) : null;
      const st = TT.termStatus(state, a, idx.subjects);
      const who = kind === 'group' ? (idx.teachers.get(a.teacherId) || {}).name || '' : a.groupIds.map((g) => (idx.groups.get(g) || {}).name).filter(Boolean).join(', ');
      return '<tr><td class="code">' + esc(sj ? sj.code : a.title) + '</td><td class="l">' + esc(sj ? sj.name : '') + '</td><td class="l">' + esc(who) +
        '</td><td>' + st.total + '</td><td>' + st.placed + '</td><td>' + st.days + '</td></tr>';
    }).join('');
    const sessItems = (w) => state.sessions.filter((x) => x.week === w && mine.some((a) => a.id === x.assignmentId)).map((x) => {
      const a = idx.assignments.get(x.assignmentId);
      const sj = a.subjectId ? idx.subjects.get(a.subjectId) : null;
      const room = a.roomId ? idx.rooms.get(a.roomId) : null;
      const cls = classText(idx, a.groupIds);
      const who = kind === 'group' ? [(idx.teachers.get(a.teacherId) || {}).name || ''] : [cls.groups.join(', ') + (cls.dept ? ' · ' + cls.dept : '')];
      return { key: 'S:' + x.id, day: x.day, start: x.start, len: x.len,
        html: '<div class="c-code">' + esc(sj ? sj.code : a.title) + ' *</div>' + (sj ? '<div class="c-name">' + esc(sj.name) + '</div>' : '') +
          who.filter(Boolean).map((w) => '<div class="c-line">' + esc(w) + '</div>').join('') + (room ? '<div class="c-line c-room">' + esc(room.name) + '</div>' : '') };
    });
    const head = '<h2>ตารางทั้งเทอม ภาคเรียนที่ ' + esc(s.semester) + ' ปีการศึกษา ' + esc(s.year) + '</h2>' +
      '<div class="center">' + esc(s.collegeName) + ' · ' + (kind === 'group' ? 'กลุ่มเรียน ' : 'ผู้สอน ') + esc(ent.name) + '</div>';
    let html = '<section class="page detail">' + head +
      (rows ? '<table class="list"><thead><tr><th>รหัสวิชา</th><th>ชื่อวิชา</th><th>' + (kind === 'group' ? 'ครูผู้สอน' : 'กลุ่มเรียน') + '</th><th>ชม.ทั้งเทอม</th><th>จัดแล้ว</th><th>จำนวนวัน</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p>ไม่มีวิชาที่จัดแบบทั้งเทอม</p>') +
      '<p class="note">ตารางแต่ละสัปดาห์ในหน้าถัดไป แสดงตารางรายสัปดาห์รวมกับวิชาทั้งเทอม (วิชาทั้งเทอมมีเครื่องหมาย *)</p></section>';
    const cal = TT.termCalendar(state);
    if (cal) {
      // ตามวันที่: 1 set ต่อหน้า เหมือนตารางกระดาษ
      const endWeek = kind === 'group' ? TT.weeksForGroup(state, ent) : 0;
      const sess = state.sessions.filter((x) => mine.some((a) => a.id === x.assignmentId));
      for (const st of cal.sets) {
        html += '<section class="page term-set-page"><div class="tw-title"><b>set ' + st.n + '</b> · ' + dateText(st.from) + ' – ' + dateText(st.to) + ' (' + st.school + ' วันเรียน) · ' +
          esc(ent.name) + ' · ภาคเรียน ' + esc(s.semester) + '/' + esc(s.year) + '</div>' +
          termSetGrid(state, st, { weekly, sessions: sess, sessItem: (x) => sessItems(x.week).find((it) => it.key === 'S:' + x.id), endWeek }) + '</section>';
      }
      return html;
    }
    for (let w = 1; w <= s.weeks; w += 2) {
      html += '<section class="page term-weeks">';
      for (const ww of [w, w + 1]) {
        if (ww > s.weeks) break;
        html += '<div class="tw-print"><div class="tw-title"><b>สัปดาห์ที่ ' + ww + '</b> · ' + esc(ent.name) + ' · ภาคเรียน ' + esc(s.semester) + '/' + esc(s.year) + '</div>' +
          buildGrid({ state, items: weekly.concat(sessItems(ww)) }) + '</div>';
      }
      html += '</section>';
    }
    return html;
  }

  /**
   * ภาระงานสอน (มอบรายวิชาให้ครู) รายแผนก: ครูทุกคนในแผนก + รายวิชา/กลุ่มเรียน/ชั่วโมง ก่อนจัดตาราง
   * dept = { id, name, head } (id '__none' = ครูที่ยังไม่ระบุแผนก)
   */
  function assignPage(state, dept) {
    const s = state.settings;
    const idx = TT.indexState(state);
    const teachers = state.teachers.filter((t) => (dept.id === '__none' ? !idx.departments.get(t.departmentId) : t.departmentId === dept.id));
    const gname = (ids) => ids.map((g) => (idx.groups.get(g) || {}).name || (idx.groups.get(g) || {}).code).filter(Boolean).join(', ');
    let deptTotal = 0;
    let no = 0;
    const body = teachers.map((t) => {
      const mine = state.assignments.filter((a) => a.teacherId === t.id);
      // Home Room ครูที่ปรึกษาหลายห้อง = แถวเดียว ชั่วโมงเดียว
      const rows = [];
      const recRow = new Map();
      for (const a of mine) {
        const sj = a.subjectId ? idx.subjects.get(a.subjectId) : null;
        const h = TT.assignmentHours(a, idx.subjects);
        if (a.recurringId && recRow.has(a.recurringId)) { recRow.get(a.recurringId).groups.push(...a.groupIds); continue; }
        const r = { code: sj ? sj.code : a.title || 'กิจกรรม', name: sj ? sj.name : TT.activityName(state, a), tpn: sj ? [sj.t, sj.p, sj.n].join('-') : '',
          groups: a.groupIds.slice(), h, term: TT.isTerm(a) ? TT.termTotal(state, a, idx.subjects) : 0, combined: a.groupIds.length > 1 && !a.recurringId, act: !sj,
          teacherAct: TT.isTeacherActivity(state, a) };
        if (a.recurringId) recRow.set(a.recurringId, r);
        rows.push(r);
      }
      rows.sort((x, y) => (x.act - y.act) || String(x.code).localeCompare(String(y.code), 'th', { numeric: true }));
      const total = rows.reduce((n, r) => n + r.h, 0);
      deptTotal += total;
      no++;
      const span = Math.max(1, rows.length) + 1;
      const who = '<td rowspan="' + span + '" class="c">' + no + '</td><td rowspan="' + span + '" class="l tname"><b>' + esc(t.name) + '</b>' +
        (t.position ? '<div class="pos">' + esc(t.position) + '</div>' : '') + '</td>';
      const line = (r, i) => '<tr>' + (i === 0 ? who : '') + '<td class="code">' + esc(r.code) + '</td><td class="l">' + esc(r.name) +
        (r.term ? ' <small>(ทั้งเทอม ' + r.term + ' ชม.)</small>' : '') + '</td><td>' + esc(r.tpn) + '</td><td class="l">' +
        (r.teacherAct ? 'ครูทุกคน' : esc(gname(r.groups)) + (r.combined || (r.act && r.groups.length > 1) ? ' <small>(เรียนรวม)</small>' : '')) + '</td><td>' + r.h + '</td></tr>';
      return (rows.length ? rows.map(line).join('') : '<tr>' + who + '<td colspan="5" class="l muted">ยังไม่มีรายวิชา</td></tr>') +
        '<tr class="sum"><td colspan="4" class="r">รวม</td><td>' + total + '</td></tr>';
    }).join('');
    return '<section class="page detail assign-page">' +
      '<div class="room-head">' + logo(s) + '<div><div class="college">' + esc(s.collegeName) + '</div>' +
      '<div><b>ภาระงานสอน (มอบรายวิชาให้ครู)</b> ภาคเรียนที่ ' + esc(s.semester) + ' ปีการศึกษา ' + esc(s.year) + '</div>' +
      '<div><b>แผนกวิชา</b> ' + esc(dept.name) + ' · ครู ' + teachers.length + ' คน · รวม ' + deptTotal + ' ชม./สัปดาห์</div></div></div>' +
      (teachers.length
        ? '<table class="list assign"><thead><tr><th>ที่</th><th>ชื่อ-สกุล</th><th>รหัสวิชา</th><th>ชื่อรายวิชา</th><th>ท-ป-น</th><th>กลุ่มเรียน</th><th>ชม./<br>สัปดาห์</th></tr></thead><tbody>' + body + '</tbody></table>'
        : '<p>ไม่มีครูในแผนกนี้</p>') +
      '<div class="sigs four">' +
      sig(dept.head, 'หัวหน้าแผนกวิชา' + (dept.id === '__none' ? '' : dept.name)) +
      sig(s.signers.curriculumHead, 'หัวหน้างานพัฒนาหลักสูตรการเรียนการสอน') +
      sig(s.signers.viceDirector, 'รองผู้อำนวยการฝ่ายวิชาการ') +
      sig(s.signers.director, 'ผู้อำนวยการ', 'อนุมัติ') +
      '</div></section>';
  }

  /** มอบรายวิชาให้ครู แบบการ์ด (หน้าตาเหมือนการ์ดครูในหน้ามอบวิชาให้ครู) รายแผนก */
  function assignCards(state, dept) {
    const s = state.settings;
    const idx = TT.indexState(state);
    const pers = TT.periods(s);
    const teachers = state.teachers.filter((t) => (dept.id === '__none' ? !idx.departments.get(t.departmentId) : t.departmentId === dept.id));
    const gl = (a) => {
      if (TT.isTeacherActivity(state, a)) {
        const r = s.recurring.find((x) => x.id === a.recurringId) || {};
        const st = pers[r.start - 1];
        const en = pers[r.start + (Number(r.len) || 1) - 2];
        return 'ครูทุกคน · วัน' + (r.day || '') + (st && en ? ' ' + st.start + '–' + en.end : '');
      }
      return a.groupIds.map((g) => (idx.groups.get(g) || {}).name || (idx.groups.get(g) || {}).code).filter(Boolean).join(' + ') || 'ยังไม่ได้เลือกกลุ่มเรียน';
    };
    const label = (a) => { const sj = a.subjectId ? idx.subjects.get(a.subjectId) : null; return sj ? sj.code + ' ' + sj.name : a.title || 'กิจกรรม'; };
    const comb = (a) => (a.groupIds.length > 1 && !a.recurringId ? '<span class="pc-tag">เรียนรวม</span>' : '');
    const term = (a) => (TT.isTerm(a) ? ' · ทั้งเทอม' : '');
    let deptWeek = 0;
    const cards = teachers.map((t) => {
      const mine = state.assignments.filter((a) => a.teacherId === t.id);
      const load = mine.filter((a, i) => !a.recurringId || mine.findIndex((x) => x.recurringId === a.recurringId) === i);
      const week = load.reduce((n, a) => n + TT.assignmentHours(a, idx.subjects), 0);
      const termH = load.reduce((n, a) => n + (TT.isTerm(a) ? TT.termTotal(state, a, idx.subjects) : TT.assignmentHours(a, idx.subjects) * TT.weeksFor(state, a)), 0);
      deptWeek += week;
      const groups = new Map();
      mine.forEach((a) => { const k = a.subjectId ? 's:' + a.subjectId : 'x:' + (a.title || 'กิจกรรม'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); });
      const list = [...groups.values()].map((g) => {
        const c = colorClass(state, g[0]);
        if (g.length === 1) {
          const a = g[0];
          return '<div class="pc-item ' + c + '"><div class="pc-main"><b>' + esc(label(a)) + '</b><small>' + comb(a) + esc(gl(a)) + term(a) + '</small></div><span class="pc-h">' + TT.assignmentHours(a, idx.subjects) + '</span></div>';
        }
        const rec = !!g[0].recurringId;
        return '<div class="pc-frame ' + c + '"><div class="pc-fh"><b>' + esc(label(g[0])) + '</b><small>' + g.length + ' กลุ่ม' + (rec ? '' : ' เรียนแยก') + '</small></div>' +
          g.map((a) => '<div class="pc-sub"><span>' + comb(a) + esc(gl(a)) + term(a) + '</span><span class="pc-h">' + TT.assignmentHours(a, idx.subjects) + '</span></div>').join('') + '</div>';
      }).join('');
      const nSubj = groups.size;
      return '<div class="pc-card"><div class="pc-head"><div><b>' + esc(t.name) + '</b><small>' + [idx.departments.get(t.departmentId) ? idx.departments.get(t.departmentId).name : '', t.position || '', nSubj ? nSubj + ' วิชา' : ''].filter(Boolean).map(esc).join(' · ') + '</small></div>' +
        '<div class="pc-hours"><b>' + week + '</b><small>ชม./สัปดาห์</small><small>' + termH + ' ชม./เทอม</small></div></div>' +
        (list || '<p class="pc-empty">ยังไม่มีรายวิชา</p>') + '</div>';
    }).join('');
    return '<section class="page detail assign-page assign-cards">' +
      '<div class="room-head">' + logo(s) + '<div><div class="college">' + esc(s.collegeName) + '</div>' +
      '<div><b>ภาระงานสอน (มอบรายวิชาให้ครู)</b> ภาคเรียนที่ ' + esc(s.semester) + ' ปีการศึกษา ' + esc(s.year) + '</div>' +
      '<div><b>แผนกวิชา</b> ' + esc(dept.name) + ' · ครู ' + teachers.length + ' คน · รวม ' + deptWeek + ' ชม./สัปดาห์</div></div></div>' +
      (teachers.length ? '<div class="pc-grid">' + cards + '</div>' : '<p>ไม่มีครูในแผนกนี้</p>') +
      '<div class="sigs four">' +
      sig(dept.head, 'หัวหน้าแผนกวิชา' + (dept.id === '__none' ? '' : dept.name)) +
      sig(s.signers.curriculumHead, 'หัวหน้างานพัฒนาหลักสูตรการเรียนการสอน') +
      sig(s.signers.viceDirector, 'รองผู้อำนวยการฝ่ายวิชาการ') +
      sig(s.signers.director, 'ผู้อำนวยการ', 'อนุมัติ') +
      '</div></section>';
  }

  root.TTPrint = { cellItems, colorClass, teacherPages, groupPage, roomPage, termPage, assignPage, assignCards, termSetGrid, dateText };
})(typeof window !== 'undefined' ? window : globalThis);
