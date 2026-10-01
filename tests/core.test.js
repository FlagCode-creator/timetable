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

test('ตรวจสอบกลุ่มเรียนซ้ำ: รหัสซ้ำ ชื่อซ้ำ ลงวิชาซ้ำ เรียนชนกัน ชั่วโมงเกิน และรวมกลุ่ม', () => {
  const s = mini();
  s.groups.push({ id: 'g1b', code: '1', name: 'กลุ่ม1', unavailable: [] });           // รหัสซ้ำกับ g1
  s.groups.push({ id: 'g9', code: '9', name: 'กลุ่ม 2', unavailable: [] });           // ชื่อซ้ำกับ g2 (รหัสต่าง)
  s.assignments.push(
    { id: 'a1', teacherId: 't1', subjectId: 's1', groupIds: ['g1'], blocks: '2' },
    { id: 'a2', teacherId: 't2', subjectId: 's1', groupIds: ['g1'], blocks: '2' },   // g1 ลงวิชา s1 ซ้ำ
    { id: 'a3', teacherId: 't2', subjectId: 's2', groupIds: ['g1b'], blocks: '4' },
  );
  s.placements.push({ assignmentId: 'a1', blockIndex: 0, day: 0, start: 1 }, { assignmentId: 'a2', blockIndex: 0, day: 0, start: 2 });
  const types = TT.checkData(s).map((i) => i.type + ':' + i.level);
  assert.ok(types.includes('dup-group:error'), 'รหัสซ้ำ');
  assert.ok(types.includes('dup-group:warn'), 'ชื่อซ้ำรหัสต่าง');
  assert.ok(types.includes('dup-subject:warn'), 'ลงวิชาซ้ำ');
  assert.ok(types.includes('group-clash:error'), 'เรียนชนกัน');
  assert.strictEqual(TT.looseName('ปวช.3 ช่างยนต์67'), TT.looseName('ปวช3ช่างยนต์ 67'));

  // ชั่วโมงเกิน: มี 1 วัน 2 คาบ แต่ต้องเรียน 4 ชม.
  const t = mini();
  t.settings.days = ['จันทร์'];
  t.settings.columns = t.settings.columns.slice(0, 3);
  t.assignments.push({ id: 'x', teacherId: 't1', subjectId: 's2', groupIds: ['g1'], blocks: '2+2' });
  assert.ok(TT.checkData(t).some((i) => i.type === 'group-overload'));

  // รวมกลุ่มซ้ำ: ภาระงานของ g1b ย้ายไป g1
  assert.strictEqual(TT.mergeGroups(s, 'g1', 'g1b'), true);
  assert.ok(!s.groups.some((g) => g.id === 'g1b'));
  assert.deepStrictEqual(s.assignments.find((a) => a.id === 'a3').groupIds, ['g1']);
  assert.ok(!TT.checkData(s).some((i) => i.type === 'dup-group' && i.level === 'error'));
});

test('ข้อมูลตัวอย่างตารางทั้งเทอม: ครบตามที่ตั้ง ไม่ชนกัน และจับกลุ่มซ้ำได้', () => {
  const s = sampleState(TT);
  const term = s.assignments.filter(TT.isTerm).map((a) => TT.termStatus(s, a));
  assert.strictEqual(term.length, 3);
  assert.strictEqual(term.filter((x) => x.remaining === 0).length, 2);
  assert.ok(term.some((x) => x.remaining > 0), 'มีวิชาที่ยังวางไม่ครบให้ลองต่อ');
  assert.strictEqual(TT.findConflicts(s).list.length, 0);
  const dup = TT.checkData(s).filter((i) => i.type === 'dup-group');
  assert.strictEqual(dup.length, 1);
});

test('ห้องเรียนชนกัน: ค่าเริ่มต้นไม่ตรวจ เปิดตรวจได้ที่เงื่อนไข', () => {
  const s = mini();
  s.assignments.push(
    { id: 'a1', teacherId: 't1', subjectId: 's1', groupIds: ['g1'], roomId: 'r1', blocks: '2' },
    { id: 'a2', teacherId: 't2', subjectId: 's1', groupIds: ['g2'], roomId: 'r1', blocks: '2' },
  );
  s.placements.push({ assignmentId: 'a1', blockIndex: 0, day: 0, start: 1 }, { assignmentId: 'a2', blockIndex: 0, day: 0, start: 1 });
  assert.strictEqual(TT.findConflicts(s).list.length, 0, 'ห้องเดียวกันเวลาเดียวกันไม่นับชน');
  assert.strictEqual(TT.checkPlacement(s, s.assignments[1], 0, 0, 1).ok, true);
  s.settings.checkRooms = true;
  assert.ok(TT.findConflicts(s).list.some((c) => /ห้อง/.test(c.message)));
});

test('ตารางทั้งเทอมแบบ 18 ตาราง: คลิกคาบในสัปดาห์ใดก็ได้ ระบบหาคาบเริ่มให้พอดี', () => {
  const s = mini();
  s.assignments.push(
    { id: 'term', teacherId: 't1', subjectId: 's2', groupIds: ['g1'], blocks: '', plan: 'term', hoursPerDay: 4 },
    { id: 'wk', teacherId: 't1', subjectId: 's1', groupIds: ['g2'], blocks: '2' },
  );
  s.placements.push({ assignmentId: 'wk', blockIndex: 0, day: 0, start: 4 });   // จันทร์ 12:00-14:00 ทุกสัปดาห์
  const a = s.assignments[0];
  assert.strictEqual(TT.snapSession(s, a, 5, 0, 13, 4), 10, 'คลิก 21:00 → 18:00–22:00');
  assert.strictEqual(TT.snapSession(s, a, 5, 0, 7, 4), 7, 'คลิก 15:00 → 15:00–19:00 (หลบคาบประจำ 12–14)');
  assert.strictEqual(TT.snapSession(s, a, 5, 0, 5, 4), 5, 'คลิก 13:00 ชนคาบประจำทุกตำแหน่ง → คืนตำแหน่งที่คลิก (ชน ให้ผู้ใช้ยืนยัน)');
  const r = TT.addSession(s, 'term', 5, 0, { start: 7, len: 4 });
  assert.deepStrictEqual([r.session.week, r.session.start, r.session.len], [5, 7, 4]);
  assert.strictEqual(TT.findConflicts(s).list.length, 0);
});

test('ตารางทั้งเทอม: แบ่งหัว/ท้าย และ +1/−1 ที่หัวหรือท้าย (ไม่เกินชั่วโมงทั้งเทอม)', () => {
  const s = mini();
  s.assignments.push({ id: 'term', teacherId: 't1', subjectId: 's1', groupIds: ['g1'], blocks: '', plan: 'term', hoursPerDay: 4 });  // 2 ชม. × 18 = 36
  const r = TT.addSession(s, 'term', 3, 1, { start: 5, len: 4 });
  const id = r.session.id;
  const tail = TT.splitSession(s, id, 1);
  assert.deepStrictEqual([r.session.start, r.session.len, tail.start, tail.len, tail.week, tail.day], [5, 1, 6, 3, 3, 1]);
  assert.strictEqual(TT.resizeSession(s, id, 1, 0).ok, true, 'หัว +1');
  assert.deepStrictEqual([r.session.start, r.session.len], [4, 2]);
  assert.strictEqual(TT.resizeSession(s, id, -1, 0).ok, true, 'หัว −1');
  assert.deepStrictEqual([r.session.start, r.session.len], [5, 1]);
  assert.strictEqual(TT.resizeSession(s, id, 0, -1).ok, false, 'เหลือ 1 ชม. ลดไม่ได้');
  // เติมจนครบ 36 แล้วเพิ่มไม่ได้
  TT.fillTerm(s, 'term', 4);
  assert.strictEqual(TT.termStatus(s, s.assignments[0]).remaining, 0);
  const res = TT.resizeSession(s, id, 0, 1);
  assert.strictEqual(res.ok, false);
  assert.match(res.reason, /ครบชั่วโมงทั้งเทอม/);
});

test('นำเข้าแผนการเรียนแผนกคอม 2/2569: เรียนรวมสายตรง/ม.6 และวิชากิจกรรมลงพุธ 09:00–11:00', () => {
  const fs = require('fs');
  const path = require('path');
  const text = fs.readFileSync(path.join(__dirname, '..', 'data', 'แผนการเรียน-แผนกคอม-2-2569.tsv'), 'utf8');
  const s = TT.emptyState();
  s.settings.closedDays = ['ศุกร์'];
  const res = TT.importStudyPlan(s, text, { mergeSections: true, activity: { day: 'พุธ', start: 2, len: 2 } });
  assert.strictEqual(res.rows, 54);
  assert.strictEqual(res.groupsAdded, 6);
  assert.strictEqual(s.groups.find((g) => g.code === '693190502').name, 'ส.1แอนิเมชัน69ม.6');
  assert.ok(s.subjects.some((x) => x.code === '20000*2002'), 'คงรหัส 20000*2002 ตามเอกสาร');
  // 12 + 11 + 7 + (8 วิชาเรียนรวมสายตรง/ม.6 + 1 ปรับพื้นฐาน) + 7 = 46 รายการ
  assert.strictEqual(res.assignmentsAdded, 46);
  assert.strictEqual(res.merged, 8);
  const game = s.subjects.find((x) => x.code === '21901-2009');
  assert.strictEqual(s.assignments.filter((a) => a.subjectId === game.id).length, 2, 'ปวช.1 69 กับ ปวช.3 67 ไม่รวมกัน (คนละรุ่น)');
  assert.ok(s.assignments.every((a) => !a.teacherId), 'ยังไม่มีครู รอเลือก');
  assert.strictEqual(res.activities, 5);
  assert.ok(s.placements.every((p) => p.day === 2 && p.start === 2 && p.locked));
  assert.strictEqual(TT.findConflicts(s).list.length, 0);
  // โครงงาน 0-6-2 = 6 ชม. แบ่ง 3+3
  const proj = s.subjects.find((x) => x.code === '21901-2023');
  assert.deepStrictEqual(TT.assignmentBlocks(s.assignments.find((a) => a.subjectId === proj.id), new Map(s.subjects.map((x) => [x.id, x]))), [3, 3]);
  // นำเข้าซ้ำไม่สร้างซ้ำ
  const again = TT.importStudyPlan(s, text, { mergeSections: true, activity: { day: 'พุธ', start: 2, len: 2 } });
  assert.strictEqual(again.assignmentsAdded, 0);
  assert.strictEqual(again.existing, 46);
  assert.strictEqual(TT.checkData(s).filter((i) => i.type === 'group-overload').length, 0, 'ชั่วโมงทุกกลุ่มลงได้');
});

test('จำนวนสัปดาห์ตามระดับ: ปวช. 18 / ปวส. 15 (4 ชม. × 15 = 60 ชม.)', () => {
  const s = TT.normalizeState(TT.emptyState());
  s.groups.push(
    { id: 'v', code: '692190101', name: 'ปวช1.สารสนเทศ 69', unavailable: [] },
    { id: 's', code: '693190501', name: 'ส.1แอนิเมชัน69สายตรง', unavailable: [] },
    { id: 'x', code: 'X1', name: 'กลุ่มอื่น', level: 'ปวส.2/1', unavailable: [] },
  );
  s.teachers.push({ id: 't', name: 'ครู', unavailable: [] });
  s.subjects.push({ id: 'w', code: '31905-2007', name: 'การสร้างแอนิเมชัน', t: 1, p: 3, n: 2 });
  assert.deepStrictEqual(s.groups.map(TT.groupLevel), ['ปวช.', 'ปวส.', 'ปวส.']);
  const a = { id: 'a', teacherId: 't', subjectId: 'w', groupIds: ['s'], blocks: '', plan: 'term', hoursPerDay: 4 };
  s.assignments.push(a);
  assert.strictEqual(TT.weeksFor(s, a), 15);
  assert.strictEqual(TT.termTotal(s, a), 60);
  assert.strictEqual(TT.checkSession(s, a, 16, 0, 1, 4).ok, false, 'ปวส. สัปดาห์ที่ 16 จบภาคเรียนแล้ว');
  TT.fillTerm(s, 'a', 1);
  assert.ok(s.sessions.every((x) => x.week <= 15));
  assert.strictEqual(TT.termStatus(s, a).placed, 60);
  a.groupIds = ['v'];
  assert.strictEqual(TT.termTotal(s, a), 72, 'ปวช. 4 × 18');
  // ตั้งค่า ปวส. เป็น 18 ได้
  s.settings.levelWeeks['ปวส.'] = 18;
  a.groupIds = ['s'];
  assert.strictEqual(TT.termTotal(s, a), 72);
});

test('ข้อความชนกันบอกว่าชนกับอะไร วันไหน เวลาเท่าไร', () => {
  const s = TT.normalizeState(TT.emptyState());
  s.groups.push({ id: 'g', code: '682190101', name: 'ปวช.2 ช่างเชื่อม', unavailable: [] });
  s.teachers.push({ id: 't', name: 'ครูเอ', unavailable: [] });
  s.subjects.push({ id: 'w', code: '20000-1301', name: 'วิทยาศาสตร์', t: 1, p: 2, n: 2 });
  const a = { id: 'a', teacherId: 't', subjectId: 'w', groupIds: ['g'], blocks: '', plan: 'term', hoursPerDay: 2 };
  s.assignments.push(a);
  const wed = s.settings.days.indexOf('พุธ');
  TT.addSession(s, 'a', 1, wed, { start: 5, len: 2 }); // 13:00–15:00
  const chk = TT.checkSession(s, a, 1, wed, 6, 2); // 14:00–16:00 ซ้อนคาบ 6
  assert.strictEqual(chk.ok, false);
  assert.ok(chk.reasons.some((r) => r.includes('20000-1301 พุธ 13:00–15:00')), chk.reasons.join(' | '));
  TT.addSession(s, 'a', 1, wed, { start: 6, len: 2 });
  const msgs = TT.findConflicts(s).list.map((c) => c.message);
  assert.ok(msgs.some((m) => m.includes('ซ้อนกับ 20000-1301 พุธ 14:00–16:00')), msgs.join(' | '));
  assert.ok(msgs.some((m) => m.includes('ซ้อนกับ 20000-1301 พุธ 13:00–15:00')), msgs.join(' | '));
});
