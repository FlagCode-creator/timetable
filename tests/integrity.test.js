// ชุดทดสอบความสอดคล้องของข้อมูลทั้งระบบ: หลังทำงานแต่ละแบบ ข้อมูลต้องเชื่อมโยงกันถูกต้องเสมอ
const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
const { sampleState } = require('../js/sample.js');
const invariants = require('./invariants.js');
require('../js/plans.js');

const ok = (s, step) => assert.deepStrictEqual(invariants(s), [], step);
// เลียนแบบ save()/commit() ของหน้าจอ
const sync = (s) => { TT.syncAdvisors(s); TT.syncRecurringPlacements(s); TT.sanitizePlacements(s); };

test('ข้อมูลตัวอย่าง ถูกต้องครบทุกข้อ', () => ok(TT.normalizeState(sampleState(TT)), 'sample'));

test('แผนแผนกคอม 2/2569 → ครู → Home Room/PLC → มอบวิชา → จัดอัตโนมัติ', () => {
  const s = TT.normalizeState(TT.emptyState());
  TT.importStudyPlan(s, globalThis.TTPlans[0].text, { mergeSections: true, activity: { day: 'พุธ', start: 2 } });
  ['ครู ก', 'ครู ข', 'ครู ค', 'ครู ง'].forEach((n, i) => s.teachers.push({ id: 't' + i, name: n, unavailable: [] }));
  s.groups[0].advisor = 'ครู ก';
  s.groups[1].advisor = 'ครู ก'; // ซ้ำ: กลุ่มหลังต้องว่าง (Home Room เวลาเดียวกัน)
  s.settings.recurring.forEach((r) => TT.applyRecurring(s, r.id));
  sync(s); ok(s, 'สร้าง Home Room/PLC');
  s.assignments.filter((a) => !a.teacherId && !a.recurringId).forEach((a, i) => (a.teacherId = 't' + (i % 4)));
  const res = TT.autoSchedule(s, { seed: 1, timeLimit: 3000 });
  s.placements.push(...res.placements);
  sync(s); ok(s, 'จัดอัตโนมัติ');
  assert.ok(s.placements.filter((p) => s.assignments.find((a) => a.id === p.assignmentId).recurringId).every((p) => p.locked), 'กิจกรรมประจำล็อกเสมอ');
});

test('ซ่อนวัน/ปิดวันแล้วเปิดกลับ: Home Room และ PLC กลับมาที่เดิมเอง ไม่ถูกจัดอัตโนมัติไปที่อื่น', () => {
  const s = TT.normalizeState(sampleState(TT));
  const fri = s.settings.days.indexOf('ศุกร์');
  // ซ่อนวันศุกร์ (เหมือน changeDays ในหน้าจอ)
  s.placements = s.placements.filter((p) => p.day !== fri);
  s.settings.days = s.settings.days.filter((d) => d !== 'ศุกร์');
  sync(s); ok(s, 'ซ่อนวันศุกร์');
  const res = TT.autoSchedule(s, { seed: 1, timeLimit: 2000 });
  assert.ok(res.placements.every((p) => !s.assignments.find((a) => a.id === p.assignmentId).recurringId), 'จัดอัตโนมัติไม่แตะกิจกรรมประจำ');
  s.settings.days.push('ศุกร์');
  sync(s); ok(s, 'เอาวันศุกร์กลับ');
  const plc = s.assignments.filter((a) => a.recurringId === 'rec_plc');
  assert.ok(plc.length && plc.every((a) => s.placements.some((p) => p.assignmentId === a.id && p.day === s.settings.days.indexOf('ศุกร์') && p.locked)));
});

test('ลดชั่วโมงวิชาทั้งเทอม: วันที่วางไว้ถูกตัดให้ไม่เกินชั่วโมงใหม่', () => {
  const s = TT.normalizeState(sampleState(TT));
  const a = s.assignments.find((x) => x.plan === 'term' && TT.termStatus(s, x).placed > 10);
  a.totalHours = 10;
  sync(s);
  assert.strictEqual(TT.termStatus(s, a).placed, 10);
  ok(s, 'หลังตัด');
});
