// ตรวจความถูกต้อง/การเชื่อมโยงของข้อมูลทั้งระบบ (ใช้ในชุดทดสอบ)
const TT = require("../js/core.js");
module.exports = function invariants(s) {
  const P = [];
  const bad = (m) => P.push(m);
  const ids = (k) => new Set(s[k].map((x) => x.id));
  for (const k of ['teachers', 'groups', 'subjects', 'rooms', 'departments', 'assignments']) {
    if (ids(k).size !== s[k].length) bad('id ซ้ำใน ' + k);
  }
  const T = ids('teachers'), G = ids('groups'), S = ids('subjects'), R = ids('rooms'), D = ids('departments');
  const A = new Map(s.assignments.map((a) => [a.id, a]));
  const recs = new Map((s.settings.recurring || []).map((r) => [r.id, r]));
  for (const a of s.assignments) {
    if (a.teacherId && !T.has(a.teacherId)) bad('assignment ' + a.id + ' ครูไม่มีอยู่');
    if (a.subjectId && !S.has(a.subjectId)) bad('assignment ' + a.id + ' วิชาไม่มีอยู่');
    if (!a.subjectId && !a.title) bad('assignment ' + a.id + ' ไม่มีวิชาและชื่อ');
    for (const g of a.groupIds || []) if (!G.has(g)) bad('assignment ' + a.id + ' กลุ่มไม่มีอยู่ ' + g);
    if (a.roomId && !R.has(a.roomId)) bad('assignment ' + a.id + ' ห้องไม่มีอยู่');
    if (a.recurringId && !recs.has(a.recurringId)) bad('assignment ' + a.id + ' กิจกรรมประจำไม่มีอยู่');
    if (a.recurringId && a.subjectId) bad('กิจกรรมประจำมีรายวิชา ' + a.id);
  }
  for (const t of s.teachers) if (t.departmentId && !D.has(t.departmentId)) bad('ครู ' + t.name + ' แผนกไม่มีอยู่');
  for (const g of s.groups) if (g.departmentId && !D.has(g.departmentId)) bad('กลุ่ม ' + g.name + ' แผนกไม่มีอยู่');
  const pers = TT.periods(s.settings);
  const seen = new Set();
  const subjMap = new Map(s.subjects.map((x) => [x.id, x]));
  for (const pl of s.placements) {
    const a = A.get(pl.assignmentId);
    if (!a) { bad('placement ไม่มี assignment'); continue; }
    if (TT.isTerm(a)) bad('placement ของวิชาทั้งเทอม');
    const blocks = TT.assignmentBlocks(a, subjMap);
    if (pl.blockIndex >= blocks.length) bad('placement blockIndex เกิน ' + a.id);
    const k = pl.assignmentId + '#' + pl.blockIndex;
    if (seen.has(k)) bad('placement ซ้ำ ' + k); seen.add(k);
    if (pl.day < 0 || pl.day >= s.settings.days.length) bad('placement วันไม่อยู่ในตาราง ' + k);
    if (!TT.canSpan(pers, pl.start, blocks[pl.blockIndex], !!a.blockCourse)) bad('placement เกินคาบ ' + k);
    if (a.recurringId && !pl.locked) bad('กิจกรรมประจำไม่ล็อก ' + k);
  }
  for (const x of s.sessions || []) {
    const a = A.get(x.assignmentId);
    if (!a) { bad('session ไม่มี assignment'); continue; }
    if (!TT.isTerm(a)) bad('session ของวิชารายสัปดาห์');
    if (x.week < 1 || x.week > TT.weeksFor(s, a)) bad('session สัปดาห์เกิน');
    if (!TT.canSpan(pers, x.start, x.len, true)) bad('session เกินคาบ');
  }
  for (const a of s.assignments.filter(TT.isTerm)) {
    const st = TT.termStatus(s, a);
    if (st.placed > st.total) bad('ทั้งเทอมวางเกินชั่วโมง ' + a.id + ' ' + st.placed + '/' + st.total);
  }
  // กิจกรรมประจำ
  for (const r of s.settings.recurring || []) {
    const mine = s.assignments.filter((a) => a.recurringId === r.id);
    if (!mine.length) continue;
    const day = s.settings.days.indexOf(r.day);
    const slot = TT.recurringSlotOk(s, r);
    if (!slot.ok) {
      if (s.placements.some((p) => mine.some((a) => a.id === p.assignmentId))) bad(r.title + ' อยู่ในตารางทั้งที่' + slot.reason);
    } else for (const a of mine) {
      const pl = s.placements.find((p) => p.assignmentId === a.id);
      if (!pl) bad(r.title + ' ไม่ได้อยู่ในตาราง (' + (a.groupIds[0] || a.teacherId) + ')');
      else if (pl.day !== day || pl.start !== Number(r.start)) bad(r.title + ' ไม่อยู่วัน/คาบที่ตั้งไว้');
    }
    if (r.scope === 'teacher') {
      const ex = new Set(r.exclude || []);
      for (const id of ex) if (!T.has(id)) bad(r.title + ' exclude ครูที่ไม่มีอยู่');
      const want = s.teachers.filter((t) => !ex.has(t.id)).map((t) => t.id).sort().join();
      const have = mine.map((a) => a.teacherId).sort().join();
      if (want !== have) bad(r.title + ' ไม่ตรงกับรายชื่อครู');
      if (mine.some((a) => (a.groupIds || []).length)) bad(r.title + ' มีกลุ่มเรียน');
    } else {
      const per = new Map();
      for (const a of mine) { const g = a.groupIds[0]; per.set(g, (per.get(g) || 0) + 1); if ((a.groupIds || []).length !== 1) bad(r.title + ' กลุ่มไม่ใช่ 1'); }
      for (const g of s.groups) if ((per.get(g.id) || 0) !== 1) bad(r.title + ' กลุ่ม ' + g.name + ' มี ' + (per.get(g.id) || 0) + ' รายการ');
      const tc = new Map();
      for (const a of mine) if (a.teacherId) tc.set(a.teacherId, (tc.get(a.teacherId) || 0) + 1);
      for (const [t, n] of tc) if (n > 1) bad(r.title + ' ครู ' + t + ' มี ' + n + ' กลุ่ม (เวลาเดียวกัน)');
      const copy = JSON.parse(JSON.stringify(s));
      if (TT.syncAdvisors(copy)) bad(r.title + ' ไม่ตรงกับครูที่ปรึกษาในข้อมูลกลุ่ม');
    }
  }
  // ชั่วโมงสรุปของครู = ผลรวมรายการ
  for (const t of s.teachers) {
    const sum = TT.teacherSummary(s, t.id);
    const h = s.assignments.filter((a) => a.teacherId === t.id).reduce((n, a) => n + TT.assignmentHours(a, subjMap), 0);
    if (sum.totals.h !== h) bad('ชั่วโมงสรุปครู ' + t.name + ' ' + sum.totals.h + ' ≠ ' + h);
  }
  return P;
};
