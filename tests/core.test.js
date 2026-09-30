// รันด้วย: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
const { sampleState } = require('../js/sample.js');

function mini() {
  const s = TT.emptyState();
  s.teachers.push({ id: 't1', name: 'ครู ก', unavailable: [] }, { id: 't2', name: 'ครู ข', unavailable: [] });
  s.groups.push({ id: 'g1', code: '1', name: 'กลุ่ม 1', unavailable: [] }, { id: 'g2', code: '2', name: 'กลุ่ม 2', unavailable: [] });
  s.subjects.push({ id: 's1', code: '20000-1401', name: 'คณิต', t: 2, p: 0, n: 2 }, { id: 's2', code: '30000-1301', name: 'วิทย์', t: 2, p: 2, n: 3 });
  s.rooms.push({ id: 'r1', name: 'ห้อง 1', shared: false }, { id: 'r2', name: 'สถานประกอบการ', shared: true });
  return s;
}

test('โครงสร้างคาบเริ่มต้น: 13 คาบ มีพักกลางวันหลังคาบ 3', () => {
  const pers = TT.periods(TT.emptyState().settings);
  assert.strictEqual(pers.length, 13);
  assert.strictEqual(pers[0].start, '08:00');
  assert.strictEqual(pers[3].start, '12:00');
  assert.notStrictEqual(pers[2].seg, pers[3].seg);
  assert.strictEqual(TT.canSpan(pers, 2, 3, false), false, 'คาบ 2-4 คร่อมพักกลางวัน');
  assert.strictEqual(TT.canSpan(pers, 2, 3, true), true, 'Block Course ข้ามพักได้');
  assert.strictEqual(TT.canSpan(pers, 12, 3, true), false, 'เกินคาบสุดท้าย');
});

test('รูปแบบคาบเริ่มต้นจากชั่วโมง', () => {
  assert.strictEqual(TT.defaultPattern(3), '3');
  assert.strictEqual(TT.defaultPattern(4), '2+2');
  assert.strictEqual(TT.defaultPattern(6), '3+3');
  assert.strictEqual(TT.defaultPattern(7, true), '7');
  assert.deepStrictEqual(TT.parsePattern('2 + 1'), [2, 1]);
  assert.strictEqual(TT.parsePattern('abc'), null);
});

test('ตรวจชน: ครูเดียวกันสองที่ / ห้องใช้ร่วมได้ไม่นับชน', () => {
  const s = mini();
  s.assignments.push(
    { id: 'a1', teacherId: 't1', subjectId: 's1', groupIds: ['g1'], roomId: 'r2', blocks: '2' },
    { id: 'a2', teacherId: 't2', subjectId: 's1', groupIds: ['g2'], roomId: 'r2', blocks: '2' },
    { id: 'a3', teacherId: 't1', subjectId: 's1', groupIds: ['g2'], roomId: 'r1', blocks: '2' },
  );
  s.placements.push({ assignmentId: 'a1', blockIndex: 0, day: 0, start: 1 }, { assignmentId: 'a2', blockIndex: 0, day: 0, start: 1 });
  assert.strictEqual(TT.findConflicts(s).list.length, 0, 'ห้องใช้ร่วมได้ ไม่ชน');
  s.placements.push({ assignmentId: 'a3', blockIndex: 0, day: 0, start: 2 });
  const c = TT.findConflicts(s);
  assert.ok(c.list.some((x) => x.message.includes('ครู ครู ก')), 'ครู ก ชน');
  assert.ok(c.list.some((x) => x.message.includes('กลุ่ม 2')), 'กลุ่ม 2 ชน');
  const chk = TT.checkPlacement(s, s.assignments[2], 0, 1, 1);
  assert.strictEqual(chk.ok, true);
});

test('เวลาไม่ว่างของครู', () => {
  const s = mini();
  s.teachers[0].unavailable = ['0|1'];
  s.assignments.push({ id: 'a1', teacherId: 't1', subjectId: 's1', groupIds: ['g1'], roomId: null, blocks: '2' });
  const r = TT.checkPlacement(s, s.assignments[0], 0, 0, 1);
  assert.strictEqual(r.ok, false);
  assert.match(r.reasons[0], /ไม่ว่าง/);
});

test('sanitize ลบคาบที่คร่อมพัก และคาบของภาระงานที่ถูกลบ', () => {
  const s = mini();
  s.assignments.push({ id: 'a1', teacherId: 't1', subjectId: 's1', groupIds: ['g1'], blocks: '2' });
  s.placements.push({ assignmentId: 'a1', blockIndex: 0, day: 0, start: 3 }, { assignmentId: 'gone', blockIndex: 0, day: 0, start: 1 });
  assert.strictEqual(TT.sanitizePlacements(s), 2);
});

test('สรุปตารางสอนครูจากข้อมูลตัวอย่างตรงกับ PDF (ท13 ป8 น16 ช28)', () => {
  const s = sampleState(TT);
  const t = s.teachers[0];
  const sum = TT.teacherSummary(s, t.id);
  assert.deepStrictEqual(sum.totals, { t: 13, p: 8, n: 16, h: 28 });
  assert.strictEqual(sum.scheduled, 28);
  assert.strictEqual(sum.subjects.find((x) => x.code === '20000-1301').h, 9);
  assert.strictEqual(TT.findConflicts(s).list.length, 0);
});

test('จัดอัตโนมัติ: วางครบ ไม่ชน ไม่ขยับคาบเดิม และ Block Course ข้ามพักได้', () => {
  const s = sampleState(TT);
  const before = JSON.stringify(s.placements);
  const res = TT.autoSchedule(s, { seed: 1, timeLimit: 2000 });
  assert.strictEqual(res.complete, true);
  s.placements.push(...res.placements);
  assert.ok(JSON.stringify(s.placements).startsWith(before.slice(0, -1)));
  assert.strictEqual(TT.findConflicts(s).list.length, 0);
  assert.strictEqual(TT.allBlocks(s).filter((b) => !b.placement).length, 0);
  const bc = s.assignments.find((a) => a.blockCourse);
  const pl = s.placements.find((p) => p.assignmentId === bc.id);
  assert.notStrictEqual(pl.day, 0, 'ครูช่างยนต์ไม่ว่างวันจันทร์คาบ 1-3 → Block Course 7 คาบลงวันจันทร์ไม่ได้');
  assert.ok(s.placements.every((p) => p.day !== 4), 'วันศุกร์ห้ามจัด');
});

test('วันห้ามจัดและช่วงห้ามจัด', () => {
  const s = mini();
  s.settings.closedDays = ['ศุกร์'];
  s.settings.blocked = [{ id: 'b1', label: 'ประชุมครู', day: 'จันทร์', from: 8, to: 9 }];
  s.assignments.push({ id: 'a1', teacherId: 't1', subjectId: 's1', groupIds: ['g1'], blocks: '2' });
  const b = TT.blockedCells(s.settings);
  assert.strictEqual(b.size, 13 + 2);
  assert.strictEqual(TT.checkPlacement(s, s.assignments[0], 0, 4, 1).ok, false);
  assert.match(TT.checkPlacement(s, s.assignments[0], 0, 0, 9).reasons.join(), /ประชุมครู/);
  assert.strictEqual(TT.checkPlacement(s, s.assignments[0], 0, 0, 1).ok, true);
  s.placements.push({ assignmentId: 'a1', blockIndex: 0, day: 4, start: 1 });
  assert.ok(TT.findConflicts(s).list.some((c) => /ศุกร์/.test(c.message)));
});

test('Home Room: ครูที่ปรึกษา 1 คนได้ 1 กลุ่มก่อน ที่เหลือเว้นว่าง และล็อกไว้วันพุธคาบ 1', () => {
  const s = mini();
  s.groups.push({ id: 'g3', code: '3', name: 'กลุ่ม 3', unavailable: [], advisor: 'ไม่มีในรายชื่อ' });
  s.groups[0].advisor = 'ครู ก';
  s.groups[1].advisor = 'ครู  ก';
  const res = TT.applyRecurring(s, 'rec_homeroom');
  assert.deepStrictEqual([res.created, res.withTeacher, res.duplicate, res.notFound, res.noAdvisor], [3, 1, 1, 1, 0]);
  const hr = s.assignments.filter((a) => a.recurringId === 'rec_homeroom');
  assert.strictEqual(hr.find((a) => a.groupIds[0] === 'g1').teacherId, 't1');
  assert.strictEqual(hr.find((a) => a.groupIds[0] === 'g2').teacherId, '');
  assert.ok(s.placements.every((p) => p.day === 2 && p.start === 1 && p.locked));
  // กรอกครูเองแล้วสร้างซ้ำ: ไม่ทับครูที่ใส่ไว้ และไม่สร้างซ้ำ
  hr.find((a) => a.groupIds[0] === 'g2').teacherId = 't2';
  const again = TT.applyRecurring(s, 'rec_homeroom');
  assert.strictEqual(again.created, 0);
  assert.strictEqual(again.withTeacher, 2);
  assert.strictEqual(s.assignments.filter((a) => a.recurringId).length, 3);
  assert.strictEqual(TT.findConflicts(s).list.length, 0);
  s.settings.closedDays = ['พุธ'];
  assert.ok(TT.applyRecurring(s, 'rec_homeroom').error);
  assert.strictEqual(TT.removeRecurring(s, 'rec_homeroom'), 3);
  assert.strictEqual(s.placements.length, 0);
});

test('แบ่งก้อนเป็นหัว/ท้าย รวมกลับ และเพิ่มเวลาให้ Block Course', () => {
  const s = mini();
  s.assignments.push({ id: 'a1', teacherId: 't1', subjectId: 's2', groupIds: ['g1'], blocks: '4', blockCourse: false });
  s.placements.push({ assignmentId: 'a1', blockIndex: 0, day: 0, start: 4, locked: true });
  assert.strictEqual(TT.splitBlock(s, 'a1', 0, 3), true);
  assert.strictEqual(s.assignments[0].blocks, '3+1');
  const tail = TT.findPlacement(s, 'a1', 1);
  assert.deepStrictEqual([tail.day, tail.start, tail.locked], [0, 7, true]);
  assert.strictEqual(TT.findConflicts(s).list.length, 0);
  assert.strictEqual(TT.mergeWithNext(s, 'a1', 0), true);
  assert.strictEqual(s.assignments[0].blocks, '4');
  assert.strictEqual(s.placements.length, 1);
  // ก้อนปกติขยายข้ามพักกลางวันไม่ได้ / Block Course ได้
  assert.strictEqual(TT.resizeBlock(s, 'a1', 0, 1, 0).ok, false);
  s.assignments[0].blockCourse = true;
  assert.strictEqual(TT.resizeBlock(s, 'a1', 0, 3, 0).ok, true);
  assert.deepStrictEqual([s.assignments[0].blocks, TT.findPlacement(s, 'a1', 0).start], ['7', 1]);
  assert.strictEqual(TT.resizeBlock(s, 'a1', 0, 0, 1).ok, true);
  assert.strictEqual(TT.assignmentHours(s.assignments[0], new Map(s.subjects.map((x) => [x.id, x]))), 8);
  assert.strictEqual(TT.resizeBlock(s, 'a1', 0, 0, -8).ok, false);
});

test('จัดอัตโนมัติ: เมื่อเวลาไม่พอ วางเท่าที่ได้และรายงานที่เหลือ', () => {
  const s = mini();
  s.settings.days = ['จันทร์'];
  s.settings.columns = s.settings.columns.slice(0, 3); // เสาธง + 2 คาบ
  for (let i = 0; i < 3; i++) s.assignments.push({ id: 'a' + i, teacherId: 't1', subjectId: null, title: 'x', groupIds: ['g1'], blocks: '1' });
  const res = TT.autoSchedule(s, { seed: 3, timeLimit: 500 });
  assert.strictEqual(res.placements.length, 2);
  assert.strictEqual(res.unplaced.length, 1);
  assert.strictEqual(res.complete, false);
});

test('อ่านรายชื่อกลุ่มเรียนที่คัดลอกจากระบบวิทยาลัย', () => {
  const text = [
    'ปวช.3/1\t(ปวช.67) ช่างยนต์\t672010101\tปวช.3 ช่างยนต์67\tเครื่องกลและยานยนต์\t2 \tครู ก  ทดสอบ\t',
    '\tปวส.2/2\t(ปวส.67) เทคนิคอุตสาหกรรม\t683011102\tส.2เทคอุตฯม.6\tอุตสาหกรรมการผลิต\t17 \tครู ข  ทดสอบ',
    '692010401\tปวช1.ไฟฟ้า 69',
  ].join('\n');
  const rows = TT.parseGroupRows(text);
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows[0], { code: '672010101', name: 'ปวช.3 ช่างยนต์67', level: 'ปวช.3/1', major: 'ช่างยนต์', size: 2, advisor: 'ครู ก  ทดสอบ' });
  assert.strictEqual(rows[1].level, 'ปวส.2/2');
  assert.strictEqual(rows[1].major, 'เทคนิคอุตสาหกรรม');
  assert.strictEqual(rows[1].size, 17);
  assert.strictEqual(rows[2].name, 'ปวช1.ไฟฟ้า 69');
});

test('ตารางทั้งเทอม: วิทย์ 54 ชม. วันละ 4 ชม. → 13 วัน + 2 ชม. และไม่ชนกับตารางรายสัปดาห์', () => {
  const s = mini();
  s.settings.closedDays = ['ศุกร์'];
  s.subjects.push({ id: 's3', code: '30000-1404', name: 'แคลคูลัส', t: 3, p: 0, n: 3 });
  s.assignments.push(
    { id: 'term', teacherId: 't1', subjectId: 's3', groupIds: ['g1'], blocks: '', plan: 'term', hoursPerDay: 4 },
    { id: 'wk', teacherId: 't1', subjectId: 's1', groupIds: ['g2'], blocks: '2' },
  );
  s.placements.push({ assignmentId: 'wk', blockIndex: 0, day: 0, start: 1 });
  const subjects = new Map(s.subjects.map((x) => [x.id, x]));
  assert.strictEqual(TT.termTotal(s, s.assignments[0], subjects), 54);
  const st0 = TT.termStatus(s, s.assignments[0]);
  assert.deepStrictEqual([st0.fullDays, st0.extra], [13, 2]);
  assert.ok(!TT.allBlocks(s).some((b) => b.assignment.id === 'term'), 'วิชาทั้งเทอมไม่อยู่ในตารางรายสัปดาห์');

  const r = TT.fillTerm(s, 'term', 1);
  assert.strictEqual(r.added, 54);
  assert.strictEqual(r.remaining, 0);
  const st = TT.termStatus(s, s.assignments[0]);
  assert.strictEqual(st.days, 14);
  assert.deepStrictEqual(s.sessions.map((x) => x.len).sort((a, b) => a - b)[0], 2);
  assert.ok(s.sessions.every((x) => x.day !== 4), 'ไม่วางวันศุกร์');
  // วันจันทร์ครูติดคาบ 1-2 ทุกสัปดาห์ → session วันจันทร์ต้องเริ่มหลังคาบ 2
  assert.ok(s.sessions.filter((x) => x.day === 0).every((x) => x.start >= 3));
  assert.strictEqual(TT.findConflicts(s).list.length, 0);
  assert.strictEqual(TT.addSession(s, 'term', 18, 0).ok, false, 'ครบแล้ววางเพิ่มไม่ได้');

  // วางตารางรายสัปดาห์ทับ session → ตรวจเจอ
  const chk = TT.checkPlacement(s, s.assignments[1], 0, 1, 1);
  assert.strictEqual(chk.ok, false);
  assert.match(chk.reasons.join(), /ทั้งเทอม/);
  // เปลี่ยนกลับเป็นรายสัปดาห์ → session ถูกล้าง
  s.assignments[0].plan = 'weekly';
  TT.sanitizePlacements(s);
  assert.strictEqual(s.sessions.length, 0);
});

test('คลิกคาบท้าย ๆ (หลัง 20:00): ระบบเลื่อนคาบเริ่มให้ก้อนพอดีกับคาบสุดท้าย', () => {
  const s = mini();
  s.assignments.push({ id: 'a1', teacherId: 't1', subjectId: 's2', groupIds: ['g1'], blocks: '3' });
  const a = s.assignments[0];
  assert.strictEqual(TT.checkPlacement(s, a, 0, 0, 12).ok, false);
  assert.match(TT.checkPlacement(s, a, 0, 0, 12).reasons[0], /เลยคาบสุดท้าย \(22:00\)/);
  assert.strictEqual(TT.snapStart(s, a, 0, 0, 12), 11, 'คลิก 20:00 → วาง 19:00–22:00');
  assert.strictEqual(TT.snapStart(s, a, 0, 0, 13), 11);
  assert.strictEqual(TT.snapStart(s, a, 0, 0, 5), 5, 'ถ้าวางที่จุดคลิกได้ ใช้จุดคลิก');
  // คาบ 3 (10:00) ก้อน 3 คาบคร่อมพักไม่ได้ → เลื่อนเป็นคาบ 1–3
  assert.strictEqual(TT.snapStart(s, a, 0, 0, 3), 1);
  // ถ้ามีคาบอื่นอยู่ 19:00 → เลือกตำแหน่งที่ไม่ชนก่อน ถ้าไม่มีคืนตำแหน่งที่วางได้ (ชน)
  s.assignments.push({ id: 'a2', teacherId: 't1', subjectId: 's1', groupIds: ['g2'], blocks: '1' });
  s.placements.push({ assignmentId: 'a2', blockIndex: 0, day: 0, start: 11 });
  assert.strictEqual(TT.snapStart(s, a, 0, 0, 12), 11);
  assert.strictEqual(TT.checkPlacement(s, a, 0, 0, 11).ok, false);
});

test('ตารางทั้งเทอม: เลื่อนเวลาไปช่วงค่ำได้ถึงคาบสุดท้าย', () => {
  const s = mini();
  s.assignments.push({ id: 'term', teacherId: 't1', subjectId: 's2', groupIds: ['g1'], blocks: '', plan: 'term', hoursPerDay: 4, termStart: 10 });
  const r = TT.addSession(s, 'term', 1, 0);
  assert.strictEqual(r.session.start, 10, 'เริ่มคาบ 10 (18:00) ตามที่ตั้งไว้');
  assert.strictEqual(TT.shiftSession(s, r.session.id, 1).ok, false, '18:00+4 ชม. = 22:00 เลื่อนต่อไม่ได้');
  assert.strictEqual(TT.shiftSession(s, r.session.id, -2).ok, true);
  assert.strictEqual(r.session.start, 8);
});
