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

    const add = (list, prefix, obj) => {
      const o = Object.assign({ id: TT.uid(prefix) }, obj);
      list.push(o);
      return o;
    };

    const dGen = add(s.departments, 'd', { name: 'สามัญสัมพันธ์', head: 'ชื่อหัวหน้าแผนกสามัญ' });
    const dMech = add(s.departments, 'd', { name: 'ช่างยนต์', head: 'ชื่อหัวหน้าแผนกช่างยนต์' });

    const t1 = add(s.teachers, 't', { name: 'ครูตัวอย่าง คณิตศาสตร์', qualification: 'ศึกษาศาสตรบัณฑิต', departmentId: dGen.id, major: 'คณิตศาสตร์', duty: '', unavailable: [] });
    const t2 = add(s.teachers, 't', { name: 'ครูตัวอย่าง ภาษาไทย', qualification: 'ศึกษาศาสตรบัณฑิต', departmentId: dGen.id, major: 'ภาษาไทย', duty: '', unavailable: [] });
    const t3 = add(s.teachers, 't', { name: 'ครูตัวอย่าง ช่างยนต์', qualification: 'ครุศาสตร์อุตสาหกรรมบัณฑิต', departmentId: dMech.id, major: 'ช่างยนต์', duty: 'งานทะเบียน', unavailable: ['4|1', '4|2', '4|3'] });

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
    ]) subj[code] = add(s.subjects, 's', { code, name, t, p, n });

    const grp = {};
    for (const [code, name] of [
      ['672010301', 'ปวช.2 ช่างเชื่อมโลหะ 67'],
      ['682190101', 'ปวช.1 สารสนเทศ 68'],
      ['682010101', 'ปวช.1 ช่างยนต์ 68'],
      ['672190101', 'ปวช.2 สารสนเทศ 67'],
      ['673190501', 'ส.2 แอนิเมชัน 67 ตรง'],
      ['673190502', 'ส.2 แอนิเมชัน 67 ม.6'],
      ['683011101', 'ส.1 เทคอุตฯ ตรง'],
      ['683011102', 'ส.1 เทคอุตฯ ม.6'],
      ['673010101', 'ส.2 เครื่องกล ตรง'],
      ['673010102', 'ส.2 เครื่องกล ม.6'],
      ['683010101', 'ส.1 เครื่องกล 68 สายตรง'],
      ['683010102', 'ส.1 เครื่องกล 68 ม.6'],
      ['673011102', 'ส.2 เทคอุตฯ ม.6'],
    ]) grp[code] = add(s.groups, 'g', { code, name, unavailable: [] });

    const r4 = add(s.rooms, 'r', { name: 'ห้องเรียนสามัญ 4', shared: false });
    const r5 = add(s.rooms, 'r', { name: 'ห้องเรียนสามัญ 5', shared: false });
    const rWs = add(s.rooms, 'r', { name: 'โรงฝึกงานช่างยนต์', shared: false });
    const rTK = add(s.rooms, 'r', { name: 'สถานประกอบการ ทค.', shared: true });
    const rTO = add(s.rooms, 'r', { name: 'สถานประกอบการ ทอ.', shared: true });

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
    assign(t2, '30000-1101', ['683011101', '683011102'], r5, '');
    assign(t3, '20101-2001', ['682010101'], rWs, '7', { blockCourse: true });
    assign(t3, null, ['682010101'], null, '1', { title: 'Home Room' });

    return s;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { sampleState };
  else root.TTSample = { sampleState };
})(typeof window !== 'undefined' ? window : globalThis);
