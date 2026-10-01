/* ข้อมูลตัวอย่าง อ้างอิงรูปแบบจากตารางสอนภาคเรียนที่ 1/2568 (ชื่อบุคคลเป็นชื่อสมมติ) */
(function (root) {
  'use strict';

  function sampleState(TT) {
    const s = TT.emptyState();
    s.settings.collegeName = 'วิทยาลัยเสริมทักษะพระภิกษุ สามเณร';
    s.settings.semester = '1';
    s.settings.year = '2568';
    s.settings.signers = {
      curriculumHead: 'ชื่อหัวหน้างานพัฒนาหลักสูตรฯ',
      viceDirector: 'ชื่อรองผู้อำนวยการฝ่ายวิชาการ',
      director: 'ชื่อผู้อำนวยการ',
    };
    s.settings.closedDays = ['ศุกร์'];

    const add = (list, prefix, obj) => {
      const o = Object.assign({ id: TT.uid(prefix) }, obj);
      list.push(o);
      return o;
    };

    const dGen = add(s.departments, 'd', { name: 'สามัญสัมพันธ์', head: 'ชื่อหัวหน้าแผนกสามัญ' });
    const dMech = add(s.departments, 'd', { name: 'ช่างยนต์', head: 'ชื่อหัวหน้าแผนกช่างยนต์' });
    const dIT = add(s.departments, 'd', { name: 'เทคโนโลยีสารสนเทศ', head: 'ชื่อหัวหน้าแผนกสารสนเทศ' });

    const t1 = add(s.teachers, 't', { name: 'ครูตัวอย่าง คณิตศาสตร์', qualification: 'ศึกษาศาสตรบัณฑิต', departmentId: dGen.id, major: 'คณิตศาสตร์', duty: '', unavailable: [] });
    const t2 = add(s.teachers, 't', { name: 'ครูตัวอย่าง ภาษาไทย', qualification: 'ศึกษาศาสตรบัณฑิต', departmentId: dGen.id, major: 'ภาษาไทย', duty: '', unavailable: [] });
    const t3 = add(s.teachers, 't', { name: 'ครูตัวอย่าง ช่างยนต์', qualification: 'ครุศาสตร์อุตสาหกรรมบัณฑิต', departmentId: dMech.id, major: 'ช่างยนต์', duty: 'งานทะเบียน', unavailable: ['0|1', '0|2', '0|3'] });
    const t4 = add(s.teachers, 't', { name: 'ครูตัวอย่าง คอมพิวเตอร์', qualification: 'วิทยาศาสตรบัณฑิต', departmentId: dIT.id, major: 'เทคโนโลยีสารสนเทศ', duty: '', unavailable: [] });

    const subj = {};
    for (const [code, name, t, p, n] of [
      ['20000-1301', 'วิทยาศาสตร์พื้นฐานอาชีพ', 1, 2, 2],
      ['20000-1401', 'คณิตศาสตร์พื้นฐานอาชีพ', 2, 0, 2],
      ['30000-1301', 'วิทยาศาสตร์งานอาชีพธุรกิจและบริการ', 2, 2, 3],
      ['30000-1305', 'วิทยาศาสตร์งานอาชีพเครื่องกลและการผลิต', 2, 2, 3],
      ['30000-1404', 'แคลคูลัส 1', 3, 0, 3],
      ['30000-1407', 'คณิตศาสตร์อุตสาหกรรม', 3, 0, 3],
      ['30000-2005', 'กิจกรรมในสถานประกอบการ 1', 0, 2, 0],
      ['20000-1101', 'ภาษาไทยพื้นฐาน', 1, 2, 2],
      ['30000-1101', 'ทักษะภาษาไทยเชิงวิชาชีพ', 1, 2, 2],
      ['20101-2001', 'งานเครื่องยนต์เบื้องต้น', 1, 6, 3],
      ['20204-2004', 'ระบบปฏิบัติการเบื้องต้น', 1, 2, 2],
      ['30204-2001', 'การเขียนโปรแกรมเว็บ', 1, 3, 2],
    ]) subj[code] = add(s.subjects, 's', { code, name, t, p, n });

    const grp = {};
    // ครูที่ปรึกษา: ใช้สร้าง Home Room (ครู 1 คนได้ 1 กลุ่มก่อน กลุ่มที่ไม่มีชื่อจะเว้นว่าง)
    for (const [code, name, level, major, advisor] of [
      ['672010301', 'ปวช.2 ช่างเชื่อมโลหะ 67', 'ปวช.2/1', 'ช่างเชื่อมโลหะ', ''],
      ['682190101', 'ปวช.1 สารสนเทศ 68', 'ปวช.1/1', 'เทคโนโลยีสารสนเทศ', t2.name],
      ['682010101', 'ปวช.1 ช่างยนต์ 68', 'ปวช.1/1', 'ช่างยนต์', t3.name],
      ['672190101', 'ปวช.2 สารสนเทศ 67', 'ปวช.2/1', 'เทคโนโลยีสารสนเทศ', ''],
      ['673190501', 'ส.2 แอนิเมชัน 67 ตรง', 'ปวส.2/1', 'คอมพิวเตอร์เกมและแอนิเมชัน', ''],
      ['673190502', 'ส.2 แอนิเมชัน 67 ม.6', 'ปวส.2/2', 'คอมพิวเตอร์เกมและแอนิเมชัน', ''],
      ['683011101', 'ส.1 เทคอุตฯ ตรง', 'ปวส.1/1', 'เทคนิคอุตสาหกรรม', t1.name],
      ['683011102', 'ส.1 เทคอุตฯ ม.6', 'ปวส.1/2', 'เทคนิคอุตสาหกรรม', ''],
      ['673010101', 'ส.2 เครื่องกล ตรง', 'ปวส.2/1', 'เทคนิคเครื่องกล', ''],
      ['673010102', 'ส.2 เครื่องกล ม.6', 'ปวส.2/2', 'เทคนิคเครื่องกล', ''],
      ['683010101', 'ส.1 เครื่องกล 68 สายตรง', 'ปวส.1/1', 'เทคนิคเครื่องกล', ''],
      ['683010102', 'ส.1 เครื่องกล 68 ม.6', 'ปวส.1/2', 'เทคนิคเครื่องกล', ''],
      ['673011102', 'ส.2 เทคอุตฯ ม.6', 'ปวส.2/2', 'เทคนิคอุตสาหกรรม', t1.name],
      ['673190503', 'ส.2 แอนิเมชัน 67 ทวิ', 'ปวส.2/3', 'คอมพิวเตอร์เกมและแอนิเมชัน', t4.name],
    ]) grp[code] = add(s.groups, 'g', { code, name, level, major, size: '', advisor, unavailable: [] });
    // ตัวอย่างข้อมูลผิด: วางรายชื่อกลุ่มซ้ำ (ชื่อเขียนต่างกันนิดหน่อย) ให้หน้า "ตรวจสอบ" จับได้ และกดรวมได้
    add(s.groups, 'g', { code: '672190101', name: 'ปวช.2สารสนเทศ67', level: 'ปวช.2/1', major: 'เทคโนโลยีสารสนเทศ', size: '', advisor: '', unavailable: [] });

    const r4 = add(s.rooms, 'r', { name: 'ห้องเรียนสามัญ 4', shared: false });
    const r5 = add(s.rooms, 'r', { name: 'ห้องเรียนสามัญ 5', shared: false });
    const rWs = add(s.rooms, 'r', { name: 'โรงฝึกงานช่างยนต์', shared: false });
    const rTK = add(s.rooms, 'r', { name: 'สถานประกอบการ ทค.', shared: true });
    const rTO = add(s.rooms, 'r', { name: 'สถานประกอบการ ทอ.', shared: true });
    const rCom = add(s.rooms, 'r', { name: 'ห้องปฏิบัติการคอมพิวเตอร์ 1', shared: false });

    const assign = (teacher, subjectCode, groupCodes, room, blocks, extra) =>
      add(s.assignments, 'a', Object.assign({
        teacherId: teacher.id,
        subjectId: subjectCode ? subj[subjectCode].id : null,
        title: '',
        groupIds: groupCodes.map((c) => grp[c].id),
        roomId: room ? room.id : null,
        blocks: blocks || '',
        blockCourse: false,
      }, extra || {}));

    const place = (a, blockIndex, day, start) => s.placements.push({ assignmentId: a.id, blockIndex, day, start, locked: false });

    // ครูคนที่ 1: วางคาบไว้ตามตารางจริงในไฟล์ตัวอย่าง
    place(assign(t1, '20000-1301', ['672010301'], r4, '3'), 0, 0, 1);
    const a2 = assign(t1, '20000-1301', ['682190101'], r4, '2+1');
    place(a2, 0, 0, 8);
    place(a2, 1, 3, 1);
    place(assign(t1, '20000-1301', ['682010101'], r4, '3'), 0, 1, 1);
    place(assign(t1, '20000-1401', ['672190101'], r4, '2'), 0, 1, 8);
    const a5 = assign(t1, '30000-1301', ['673190501', '673190502'], r4, '2+2');
    place(a5, 0, 1, 4);
    place(a5, 1, 3, 9);
    place(assign(t1, '30000-1305', ['683010101', '683010102'], r4, '4'), 0, 2, 4);
    place(assign(t1, '30000-1404', ['673010101', '673010102'], rTK, '3'), 0, 1, 10);
    place(assign(t1, '30000-1407', ['683011101', '683011102'], r4, '3'), 0, 0, 5);
    place(assign(t1, null, ['673011102'], null, '1', { title: 'Home Room' }), 0, 2, 1);
    place(assign(t1, '30000-2005', ['673011102'], rTO, '2'), 0, 2, 2);

    // ครูคนที่ 2 และ 3: ยังไม่ได้วาง ลองกด "จัดอัตโนมัติ" ได้
    assign(t2, '20000-1101', ['682190101'], r5, '');
    assign(t2, '20000-1101', ['682010101'], r5, '');
    // ตารางทั้งเทอม (กลุ่ม ปวส. เรียน 15 สัปดาห์): 3 ชม./สัปดาห์ × 15 = 45 ชม. วางวันละ 4 ชม. (11 วัน + 1 ชม.)
    assign(t2, '30000-1101', ['683011101', '683011102'], r5, '3', { plan: 'term', hoursPerDay: 4 });
    assign(t3, '20101-2001', ['682010101'], rWs, '7', { blockCourse: true });
    assign(t3, null, ['682010101'], null, '1', { title: 'Home Room' });

    // ตารางทั้งเทอมของครูคอมพิวเตอร์
    // - ระบบปฏิบัติการ (ปวช. 18 สัปดาห์) 3 ชม. × 18 = 54 ชม. วันละ 6 ชม. เริ่มคาบ 4 (12:00) = 9 วัน เริ่มสัปดาห์ที่ 3
    const osA = assign(t4, '20204-2004', ['672190101'], rCom, '3', { plan: 'term', hoursPerDay: 6, termStart: 4 });
    // - เขียนโปรแกรมเว็บ (ปวส. 15 สัปดาห์) 4 ชม. × 15 = 60 ชม. วันละ 4 ชม. ช่วงเย็น 17:00–21:00 = 15 วัน (วางไว้ถึงสัปดาห์ที่ 3 ยังไม่ครบ ลองกด "เติม" ต่อได้)
    const webA = assign(t4, '30204-2001', ['673190501', '673190502'], rCom, '4', { plan: 'term', hoursPerDay: 4, termStart: 9 });
    // - ภาษาไทยเชิงวิชาชีพของครูภาษาไทย (ตั้งเป็นทั้งเทอมไว้ด้านบน)
    const langA = s.assignments.find((a) => a.subjectId === subj['30000-1101'].id);

    // Home Room ทุกวันพุธ คาบ 1 ของทุกกลุ่ม (ใช้ภาระงาน Home Room ที่มีอยู่แล้วต่อ)
    TT.applyRecurring(s, s.settings.recurring[0].id);
    // PLC ครูทุกคน วันศุกร์ 17:00–19:00 (วันศุกร์ห้ามจัดวิชาอื่น)
    const plc = s.settings.recurring.find((r) => r.scope === 'teacher');
    if (plc) TT.applyRecurring(s, plc.id);

    TT.fillTerm(s, langA.id, 1);
    TT.fillTerm(s, osA.id, 3);
    TT.fillTerm(s, webA.id, 1);
    s.sessions = s.sessions.filter((x) => x.assignmentId !== webA.id || x.week <= 3);
    return s;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { sampleState };
  else root.TTSample = { sampleState };
})(typeof window !== 'undefined' ? window : globalThis);
