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

  /** เนื้อหาในช่องตารางตามมุมมอง */
  function cellItems(state, filter, view, forEditor) {
    const idx = TT.indexState(state);
    const items = [];
    for (const pl of state.placements) {
      const a = idx.assignments.get(pl.assignmentId);
      if (!a || !filter(a)) continue;
      const len = TT.assignmentBlocks(a, idx.subjects)[pl.blockIndex];
      const s = a.subjectId ? idx.subjects.get(a.subjectId) : null;
      const room = a.roomId ? idx.rooms.get(a.roomId) : null;
      const teacher = idx.teachers.get(a.teacherId);
      const groups = a.groupIds.map((g) => idx.groups.get(g)).filter(Boolean).map((g) => g.name || g.code);
      const lines = [esc(s ? s.code : a.title || 'กิจกรรม') + (a.blockCourse ? ' <small>(Block Course)</small>' : '')];
      if (view !== 'room' && room) lines.push(esc(room.name));
      if (view !== 'teacher' && teacher) lines.push(esc(teacher.name));
      else if (view !== 'teacher' && forEditor) lines.push('<span class="no-teacher">ยังไม่มีครู</span>');
      if (view !== 'group' && groups.length) lines.push(esc(groups.join(', ')));
      items.push({
        key: TT.placementKey(a.id, pl.blockIndex),
        day: pl.day,
        start: pl.start,
        len,
        assignment: a,
        placement: pl,
        recurring: !!a.recurringId,
        title: s ? s.code + ' ' + s.name : a.title,
        html: lines.map((l, i) => '<div class="' + (i === 0 ? 'c-code' : 'c-line') + '">' + l + '</div>').join(''),
      });
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

  root.TTPrint = { cellItems, teacherPages, groupPage, roomPage };
})(typeof window !== 'undefined' ? window : globalThis);
