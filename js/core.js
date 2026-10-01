/*
 * ตรรกะหลักของโปรแกรมจัดตารางสอน (ไม่ยุ่งกับหน้าจอ)
 * ใช้ได้ทั้งในเบราว์เซอร์ (window.TT) และใน Node (require) สำหรับทดสอบ
 */
(function (root) {
  'use strict';

  const ALL_DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function defaultColumns() {
    const cols = [{ type: 'break', label: 'กิจกรรมหน้าเสาธง', start: '07:40', end: '08:00' }];
    const hh = (n) => String(n).padStart(2, '0') + ':00';
    for (let h = 8; h < 22; h++) {
      if (h === 11) cols.push({ type: 'break', label: 'พักกลางวัน', start: '11:00', end: '12:00' });
      else cols.push({ type: 'period', start: hh(h), end: hh(h + 1) });
    }
    return cols;
  }

  const HOMEROOM_NAME = 'กิจกรรมโฮมรูม (ชั่วโมงพบครูที่ปรึกษา)';

  /** ชื่อเต็มของกิจกรรมประจำ (ใช้ในรายการวิชาของใบตารางสอน) */
  function activityName(state, a) {
    const rec = a.recurringId && (state.settings.recurring || []).find((r) => r.id === a.recurringId);
    if (rec && rec.name) return rec.name;
    return /^home\s*room$/i.test(String(a.title || '').trim()) ? HOMEROOM_NAME : '';
  }

  function defaultRecurring() {
    return { id: 'rec_homeroom', title: 'Home Room', name: HOMEROOM_NAME, day: 'พุธ', start: 1, len: 1 };
  }

  /** PLC: กิจกรรมของครูทุกคน (ยกเว้นที่ติ๊กออก) วันศุกร์ 17:00–19:00 วางได้แม้เป็นวันห้ามจัด */
  function defaultPLC() {
    return { id: 'rec_plc', title: 'PLC', name: 'ชุมชนการเรียนรู้ทางวิชาชีพ (PLC)', scope: 'teacher', day: 'ศุกร์', start: 9, len: 2, exclude: [] };
  }

  /** กิจกรรมประจำของครู (ไม่ผูกกับกลุ่มเรียน) */
  function isTeacherActivity(state, a) {
    const rec = a && a.recurringId && (state.settings.recurring || []).find((r) => r.id === a.recurringId);
    return !!(rec && rec.scope === 'teacher');
  }

  function emptyState() {
    return {
      version: 1,
      settings: {
        collegeName: '',
        logo: '',
        semester: '1',
        year: '2568',
        days: ALL_DAYS.slice(0, 5),
        columns: defaultColumns(),
        signers: { curriculumHead: '', viceDirector: '', director: '' },
        closedDays: ['ศุกร์'],
        blocked: [],
        recurring: [defaultRecurring(), defaultPLC()],
        plcAdded: true,
        weeks: 18,
        levelWeeks: { 'ปวช.': 18, 'ปวส.': 15 },
        checkRooms: false,
      },
      departments: [],
      teachers: [],
      subjects: [],
      groups: [],
      rooms: [],
      assignments: [],
      placements: [],
      sessions: [],
    };
  }

  /** เติมฟิลด์ที่ขาด (เผื่อไฟล์เก่า/ไฟล์ที่นำเข้า) */
  function normalizeState(s) {
    const base = emptyState();
    s = s && typeof s === 'object' ? s : {};
    const out = Object.assign({}, base, s);
    out.settings = Object.assign({}, base.settings, s.settings || {});
    out.settings.signers = Object.assign({}, base.settings.signers, (s.settings || {}).signers || {});
    if (!Array.isArray(out.settings.columns) || !out.settings.columns.length) out.settings.columns = defaultColumns();
    if (!Array.isArray(out.settings.days) || !out.settings.days.length) out.settings.days = base.settings.days;
    for (const k of ['closedDays', 'blocked', 'recurring']) {
      if (!Array.isArray(out.settings[k])) out.settings[k] = base.settings[k];
    }
    // ข้อมูลเดิมที่ยังไม่มี PLC: เพิ่มให้ครั้งเดียว (ถ้าลบทิ้งภายหลังจะไม่เพิ่มกลับมา)
    if (!(s.settings || {}).plcAdded) {
      if (!out.settings.recurring.some((r) => r.scope === 'teacher')) out.settings.recurring.push(defaultPLC());
      out.settings.plcAdded = true;
    }
    out.settings.levelWeeks = Object.assign({}, base.settings.levelWeeks, out.settings.levelWeeks || {});
    for (const k of Object.keys(out.settings.levelWeeks)) out.settings.levelWeeks[k] = Math.max(1, Math.min(40, Number(out.settings.levelWeeks[k]) || 18));
    // จำนวนตารางในโหมดทั้งเทอม = จำนวนสัปดาห์มากที่สุด
    out.settings.weeks = Math.max(...Object.values(out.settings.levelWeeks));
    for (const k of ['departments', 'teachers', 'subjects', 'groups', 'rooms', 'assignments', 'placements', 'sessions']) {
      if (!Array.isArray(out[k])) out[k] = [];
    }
    for (const t of out.teachers) if (!Array.isArray(t.unavailable)) t.unavailable = [];
    for (const g of out.groups) if (!Array.isArray(g.unavailable)) g.unavailable = [];
    for (const a of out.assignments) if (!Array.isArray(a.groupIds)) a.groupIds = [];
    return out;
  }

  /** รายการคาบเรียน (ไม่รวมช่วงพัก) พร้อมหมายเลขช่วง (segment) ที่ไม่มีพักคั่น */
  function periods(settings) {
    const list = [];
    let seg = 0;
    let prevPeriod = false;
    settings.columns.forEach((c, colIndex) => {
      if (c.type === 'break') {
        if (prevPeriod) seg++;
        prevPeriod = false;
      } else {
        list.push({ no: list.length + 1, start: c.start, end: c.end, seg, colIndex });
        prevPeriod = true;
      }
    });
    return list;
  }

  /**
   * ช่องที่ห้ามจัดสำหรับทุกคน: วันที่ตั้งเป็น "ห้ามจัด" และช่วงเวลาห้ามจัดเพิ่มเติม
   * คืนค่า Map("day|period" → เหตุผล)
   */
  function blockedCells(settings) {
    const out = new Map();
    const P = periods(settings).length;
    settings.days.forEach((name, d) => {
      if ((settings.closedDays || []).includes(name)) {
        for (let p = 1; p <= P; p++) out.set(cellKey(d, p), 'วัน' + name + 'ห้ามจัดตาราง');
      }
    });
    for (const b of settings.blocked || []) {
      const d = settings.days.indexOf(b.day);
      if (d < 0) continue;
      const from = Math.max(1, Number(b.from) || 1);
      const to = Math.min(P, Number(b.to) || from);
      for (let p = from; p <= to; p++) if (!out.has(cellKey(d, p))) out.set(cellKey(d, p), 'ช่วงห้ามจัด' + (b.label ? ': ' + b.label : ''));
    }
    return out;
  }

  /** วางก้อนยาว len คาบ เริ่มคาบ start ได้ไหม (Block Course ข้ามช่วงพักได้) */
  function canSpan(pers, start, len, crossBreaks) {
    if (start < 1 || len < 1 || start + len - 1 > pers.length) return false;
    return crossBreaks || pers[start - 1].seg === pers[start + len - 2].seg;
  }

  function subjectHours(s) {
    return s ? (Number(s.t) || 0) + (Number(s.p) || 0) : 0;
  }

  /** รูปแบบการแบ่งคาบเริ่มต้นจากจำนวนชั่วโมง เช่น 3 → "3", 4 → "2+2", 6 → "3+3" */
  function defaultPattern(hours, blockCourse) {
    hours = Math.max(0, Math.floor(hours));
    if (!hours) return '';
    if (blockCourse || hours <= 3) return String(hours);
    const arr = [];
    while (hours > 4) { arr.push(3); hours -= 3; }
    if (hours === 4) arr.push(2, 2);
    else if (hours > 0) arr.push(hours);
    return arr.join('+');
  }

  function parsePattern(str) {
    if (str == null) return null;
    const parts = String(str).split(/[+,\s]+/).filter(Boolean);
    if (!parts.length) return null;
    const nums = parts.map((x) => parseInt(x, 10));
    return nums.every((n) => n > 0 && n < 50) ? nums : null;
  }

  function indexState(state) {
    const by = (arr) => new Map(arr.map((x) => [x.id, x]));
    return {
      checkRooms: !!(state.settings && state.settings.checkRooms),
      departments: by(state.departments),
      teachers: by(state.teachers),
      subjects: by(state.subjects),
      groups: by(state.groups),
      rooms: by(state.rooms),
      assignments: by(state.assignments),
    };
  }

  /** ก้อนคาบของภาระงาน เช่น [2,2] */
  function assignmentBlocks(a, subjectsById) {
    const parsed = parsePattern(a.blocks);
    if (parsed) return parsed;
    const s = a.subjectId ? subjectsById.get(a.subjectId) : null;
    const hours = s ? subjectHours(s) : 1;
    return parsePattern(defaultPattern(hours, a.blockCourse)) || [];
  }

  function assignmentHours(a, subjectsById) {
    return assignmentBlocks(a, subjectsById).reduce((x, y) => x + y, 0);
  }

  /** วิชาที่จัดแบบ "ตารางทั้งเทอม" (วางเป็นรายวันใน 18 สัปดาห์ จนครบชั่วโมง) */
  function isTerm(a) {
    return !!a && a.plan === 'term';
  }

  function hoursPerDay(a) {
    return Math.max(1, Math.min(13, Number(a.hoursPerDay) || 4));
  }

  /**
   * ระดับของกลุ่มเรียน: ดูจากช่องระดับชั้น (ปวช./ปวส.) ถ้าไม่มี ใช้หลักที่ 3 ของรหัสกลุ่ม (2 = ปวช., 3 = ปวส.)
   * เช่น 692190101 = ปวช., 693190501 = ปวส.
   */
  function groupLevel(g) {
    if (!g) return '';
    if (/ปวส/.test(g.level || '')) return 'ปวส.';
    if (/ปวช/.test(g.level || '')) return 'ปวช.';
    const c = String(g.code || '').trim();
    if (/^\d{9}$/.test(c)) return c[2] === '3' ? 'ปวส.' : c[2] === '2' ? 'ปวช.' : '';
    return '';
  }

  /**
   * ชั้นปีของกลุ่ม เช่น "ปวช.1" "ปวส.2"
   * ดูจากช่องระดับชั้น → ชื่อกลุ่ม (ปวช.2…, ปวช1…, ส.2…) → รหัสกลุ่ม 9 หลัก (ปีเข้า + ระดับ เทียบกับปีการศึกษาในข้อมูลสถานศึกษา)
   */
  function groupGrade(state, g) {
    if (!g) return '';
    const fromText = (t) => {
      const m = String(t || '').match(/(ปวช|ปวส)\.?\s*(\d)/);
      if (m) return m[1] + '.' + m[2];
      const s2 = String(t || '').trim().match(/^ส\.?\s*(\d)/);
      return s2 ? 'ปวส.' + s2[1] : '';
    };
    const t = fromText(g.level) || fromText(g.name);
    if (t) return t;
    const c = String(g.code || '').trim();
    const year = Number((state && state.settings && state.settings.year) || 0) % 100;
    if (/^\d{9}$/.test(c) && year && (c[2] === '2' || c[2] === '3')) {
      const max = c[2] === '2' ? 3 : 2;
      const n = year - Number(c.slice(0, 2)) + 1;
      if (n >= 1 && n <= max) return (c[2] === '2' ? 'ปวช.' : 'ปวส.') + n;
    }
    return '';
  }

  /** ลำดับชั้นปีสำหรับเรียง: ปวช.1 ปวช.2 ปวช.3 ปวส.1 ปวส.2 แล้วค่อยกลุ่มที่ไม่ทราบ */
  const GRADE_ORDER = ['ปวช.1', 'ปวช.2', 'ปวช.3', 'ปวส.1', 'ปวส.2'];
  function gradeRank(grade) {
    const i = GRADE_ORDER.indexOf(grade);
    return i < 0 ? 99 : i;
  }

  function weeksForGroup(state, g) {
    const lw = state.settings.levelWeeks || {};
    return lw[groupLevel(g)] || state.settings.weeks;
  }

  /** จำนวนสัปดาห์ของรายการ: ตามระดับของกลุ่มเรียน (เรียนรวมต่างระดับใช้ค่ามากสุด) */
  function weeksFor(state, a) {
    const gs = (a.groupIds || []).map((id) => state.groups.find((g) => g.id === id)).filter(Boolean);
    return gs.length ? Math.max(...gs.map((g) => weeksForGroup(state, g))) : state.settings.weeks;
  }

  /** ชั่วโมงทั้งเทอม = ชม./สัปดาห์ × จำนวนสัปดาห์ของระดับ (ปวช. 18, ปวส. 15) หรือค่าที่กำหนดเอง */
  function termTotal(state, a, subjectsById) {
    if (Number(a.totalHours) > 0) return Number(a.totalHours);
    const subjects = subjectsById || new Map(state.subjects.map((x) => [x.id, x]));
    return assignmentHours(a, subjects) * weeksFor(state, a);
  }

  function placementKey(assignmentId, blockIndex) {
    return assignmentId + '#' + blockIndex;
  }

  /**
   * รหัสทรัพยากรที่ห้ามชน: ครู กลุ่มเรียน
   * ห้องจะตรวจเฉพาะเมื่อเปิด "ตรวจห้องเรียนชนกัน" ในเงื่อนไข (ค่าเริ่มต้นไม่ตรวจ) และห้องไม่ได้ตั้งเป็น "ใช้ร่วมได้"
   */
  function resourceKeys(a, idx) {
    const keys = [];
    if (a.teacherId) keys.push('t:' + a.teacherId);
    for (const g of a.groupIds || []) keys.push('g:' + g);
    if (a.roomId && idx.checkRooms) {
      const r = idx.rooms.get(a.roomId);
      if (r && !r.shared) keys.push('r:' + a.roomId);
    }
    return keys;
  }

  /** ลบ/แก้คาบที่ใช้ไม่ได้แล้ว (ภาระงานถูกลบ, เปลี่ยนรูปแบบก้อน, เปลี่ยนโครงสร้างเวลา) */
  function sanitizePlacements(state) {
    const idx = indexState(state);
    const pers = periods(state.settings);
    const seen = new Set();
    const before = state.placements.length;
    state.placements = state.placements.filter((pl) => {
      const a = idx.assignments.get(pl.assignmentId);
      if (!a) return false;
      const blocks = assignmentBlocks(a, idx.subjects);
      if (pl.blockIndex >= blocks.length) return false;
      const key = placementKey(pl.assignmentId, pl.blockIndex);
      if (seen.has(key)) return false;
      if (pl.day < 0 || pl.day >= state.settings.days.length) return false;
      if (isTerm(a)) return false;
      if (!canSpan(pers, pl.start, blocks[pl.blockIndex], !!a.blockCourse)) return false;
      seen.add(key);
      return true;
    });
    state.sessions = (state.sessions || []).filter((x) => {
      const a = idx.assignments.get(x.assignmentId);
      return isTerm(a) && x.week >= 1 && x.week <= Math.min(state.settings.weeks, weeksFor(state, a)) &&
        x.day >= 0 && x.day < state.settings.days.length && canSpan(pers, x.start, x.len, true);
    });
    return before - state.placements.length;
  }

  /** ทุกก้อนคาบที่ต้องจัด พร้อมสถานะว่าวางแล้วหรือยัง */
  function allBlocks(state) {
    const idx = indexState(state);
    const placed = new Map(state.placements.map((p) => [placementKey(p.assignmentId, p.blockIndex), p]));
    const out = [];
    for (const a of state.assignments) {
      if (isTerm(a)) continue;
      assignmentBlocks(a, idx.subjects).forEach((len, blockIndex) => {
        const key = placementKey(a.id, blockIndex);
        out.push({ key, assignment: a, blockIndex, len, placement: placed.get(key) || null });
      });
    }
    return out;
  }

  function cellKey(day, period) {
    return day + '|' + period;
  }

  /** ตารางการใช้ทรัพยากร: resourceKey → Map(cellKey → [placementKey]) */
  function buildOccupancy(state, idx, skipKey) {
    const occ = new Map();
    for (const pl of state.placements) {
      const key = placementKey(pl.assignmentId, pl.blockIndex);
      if (key === skipKey) continue;
      const a = idx.assignments.get(pl.assignmentId);
      if (!a) continue;
      const len = assignmentBlocks(a, idx.subjects)[pl.blockIndex] || 0;
      for (const rk of resourceKeys(a, idx)) {
        let m = occ.get(rk);
        if (!m) occ.set(rk, (m = new Map()));
        for (let p = pl.start; p < pl.start + len; p++) {
          const ck = cellKey(pl.day, p);
          if (!m.has(ck)) m.set(ck, []);
          m.get(ck).push(key);
        }
      }
    }
    return occ;
  }

  /** การใช้ทรัพยากรของตารางทั้งเทอม: resourceKey → Map("week|day|period" → [sessionId]) */
  function buildSessionOccupancy(state, idx, skipId) {
    const occ = new Map();
    for (const x of state.sessions || []) {
      if (x.id === skipId) continue;
      const a = idx.assignments.get(x.assignmentId);
      if (!a) continue;
      for (const rk of resourceKeys(a, idx)) {
        let m = occ.get(rk);
        if (!m) occ.set(rk, (m = new Map()));
        for (let p = x.start; p < x.start + x.len; p++) {
          const k = x.week + '|' + x.day + '|' + p;
          if (!m.has(k)) m.set(k, []);
          m.get(k).push(x.id);
        }
      }
    }
    return occ;
  }

  /** ตารางทั้งเทอมที่ตกวัน/คาบนี้ (ทุกสัปดาห์): resourceKey → Map("day|period" → [สัปดาห์]) */
  function sessionWeeksByCell(state, idx) {
    const out = new Map();
    for (const x of state.sessions || []) {
      const a = idx.assignments.get(x.assignmentId);
      if (!a) continue;
      for (const rk of resourceKeys(a, idx)) {
        let m = out.get(rk);
        if (!m) out.set(rk, (m = new Map()));
        for (let p = x.start; p < x.start + x.len; p++) {
          const k = cellKey(x.day, p);
          if (!m.has(k)) m.set(k, []);
          m.get(k).push(x.week);
        }
      }
    }
    return out;
  }

  function resourceName(rk, idx) {
    const [type, id] = [rk.slice(0, 1), rk.slice(2)];
    if (type === 't') return 'ครู ' + ((idx.teachers.get(id) || {}).name || '?');
    if (type === 'g') return 'กลุ่มเรียน ' + ((idx.groups.get(id) || {}).name || '?');
    return 'ห้อง ' + ((idx.rooms.get(id) || {}).name || '?');
  }

  function unavailableOf(rk, idx) {
    const id = rk.slice(2);
    const ent = rk[0] === 't' ? idx.teachers.get(id) : rk[0] === 'g' ? idx.groups.get(id) : null;
    return ent && ent.unavailable ? new Set(ent.unavailable) : null;
  }

  function spanReason(pers, start, len) {
    const last = pers[pers.length - 1];
    if (start + len - 1 > pers.length) {
      return 'ก้อนนี้ยาว ' + len + ' คาบ ถ้าเริ่มคาบ ' + start + ' จะเลยคาบสุดท้าย (' + (last ? last.end : '') + ') — เลือกคาบที่เริ่มเร็วขึ้น แบ่งเวลา หรือเพิ่มคาบที่หน้าเงื่อนไข';
    }
    return 'ก้อนนี้ยาว ' + len + ' คาบ ถ้าเริ่มคาบ ' + start + ' จะคร่อมช่วงพัก (ถ้าต้องการเรียนข้ามพัก ให้ติ๊ก Block Course)';
  }

  /**
   * ผู้ใช้คลิกคาบ p: หาคาบเริ่มที่ทำให้ก้อนครอบคาบ p และไม่เลยขอบ/คร่อมพัก
   * ลองเริ่มที่ p ก่อน แล้วถอยทีละคาบ เลือกตำแหน่งที่ไม่ชนก่อน ถ้าไม่มีเลยคืนตำแหน่งแรกที่วางได้ (ชน)
   */
  function snapStart(state, a, blockIndex, day, p, cache) {
    const idx = (cache && cache.idx) || indexState(state);
    const pers = (cache && cache.pers) || periods(state.settings);
    const len = assignmentBlocks(a, idx.subjects)[blockIndex];
    let fallback = null;
    for (let st = p; st >= Math.max(1, p - len + 1); st--) {
      if (!canSpan(pers, st, len, !!a.blockCourse)) continue;
      if (checkPlacement(state, a, blockIndex, day, st, cache).ok) return st;
      if (fallback == null) fallback = st;
    }
    return fallback;
  }

  /**
   * ตรวจว่าถ้าวางก้อน (assignment, len) ที่ day/start จะชนอะไรบ้าง
   * คืนค่า { ok, span, reasons[] }
   */
  function checkPlacement(state, a, blockIndex, day, start, cache) {
    const idx = (cache && cache.idx) || indexState(state);
    const skip = placementKey(a.id, blockIndex);
    const occ = (cache && cache.occ) || buildOccupancy(state, idx, skip);
    const pers = (cache && cache.pers) || periods(state.settings);
    const len = assignmentBlocks(a, idx.subjects)[blockIndex];
    if (!canSpan(pers, start, len, !!a.blockCourse)) {
      return { ok: false, span: false, reasons: [spanReason(pers, start, len)] };
    }
    const reasons = new Set();
    const blocked = (cache && cache.blocked) || blockedCells(state.settings);
    for (let p = start; p < start + len; p++) {
      const why = blocked.get(cellKey(day, p));
      if (why) reasons.add(why);
    }
    const termCells = (cache && cache.termCells) || sessionWeeksByCell(state, idx);
    for (const rk of resourceKeys(a, idx)) {
      const m = occ.get(rk);
      const tm = termCells.get(rk);
      const un = unavailableOf(rk, idx);
      for (let p = start; p < start + len; p++) {
        const ck = cellKey(day, p);
        const others = m && m.get(ck);
        if (others) others.filter((k) => k !== skip).forEach((k) => reasons.add(resourceName(rk, idx) + ': มี ' + describeWith(state, idx, cache)(k) + ' อยู่แล้ว'));
        const weeks = tm && tm.get(ck);
        if (weeks) reasons.add(resourceName(rk, idx) + ' มีตารางทั้งเทอมสัปดาห์ที่ ' + [...new Set(weeks)].sort((x, y) => x - y).slice(0, 4).join(', ') + (new Set(weeks).size > 4 ? ' …' : ''));
        if (un && un.has(ck)) reasons.add(resourceName(rk, idx) + ' ไม่ว่าง');
      }
    }
    return { ok: reasons.size === 0, span: true, reasons: [...reasons] };
  }

  /** คำอธิบายสั้นของคาบ/ช่วงทั้งเทอม เช่น "20000-1301 พุธ 14:00–16:00" (ใช้ในข้อความชนกัน) */
  function describer(state, idx) {
    const pers = periods(state.settings);
    const days = state.settings.days;
    let sess, pls;
    const index = () => {
      sess = new Map((state.sessions || []).map((x) => [x.id, x]));
      pls = new Map(state.placements.map((pl) => [placementKey(pl.assignmentId, pl.blockIndex), pl]));
    };
    index();
    const label = (a) => {
      const sj = a && a.subjectId ? idx.subjects.get(a.subjectId) : null;
      return sj ? sj.code : (a && a.title) || 'กิจกรรม';
    };
    const time = (start, len) => ((pers[start - 1] || {}).start || '?') + '–' + ((pers[start + len - 2] || {}).end || '?');
    return (key) => {
      if (String(key).startsWith('S:')) {
        if (!sess.has(key.slice(2))) index(); // ข้อมูลเปลี่ยนหลังสร้าง (เช่นใช้ซ้ำใน cache)
        const x = sess.get(key.slice(2));
        if (!x) return '?';
        return label(idx.assignments.get(x.assignmentId)) + ' ' + (days[x.day] || '') + ' ' + time(x.start, x.len);
      }
      if (!pls.has(key)) index();
      const pl = pls.get(key);
      if (!pl) return '?';
      const a = idx.assignments.get(pl.assignmentId);
      const len = a ? assignmentBlocks(a, idx.subjects)[pl.blockIndex] || 1 : 1;
      return label(a) + ' ' + (days[pl.day] || '') + ' ' + time(pl.start, len);
    };
  }

  function describeWith(state, idx, cache) {
    if (!cache) return describer(state, idx);
    return cache.desc || (cache.desc = describer(state, idx));
  }

  /** หาคาบที่ชนกันทั้งหมด */
  function findConflicts(state) {
    const idx = indexState(state);
    const occ = buildOccupancy(state, idx);
    const desc = describer(state, idx);
    const byPlacement = new Map();
    const list = new Map();
    const mark = (k, msg) => {
      if (!byPlacement.has(k)) byPlacement.set(k, new Set());
      byPlacement.get(k).add(msg);
    };
    // การชนกันระหว่างคาบ: 1 คู่ = 1 รายการ (รวมครู/กลุ่มที่โดนไว้ในรายการเดียว)
    const pairs = new Map();
    const addPair = (keys, day, p, rk, week) => {
      const ks = [...new Set(keys)].sort();
      const pk = day + '@' + ks.join(',');
      if (!pairs.has(pk)) pairs.set(pk, { day, periods: [], ks, names: [], resource: rk, resources: [], week });
      const it = pairs.get(pk);
      if (!it.resources.includes(rk)) it.resources.push(rk);
      if (!it.periods.includes(p)) it.periods.push(p);
      const nm = resourceName(rk, idx);
      if (!it.names.includes(nm)) it.names.push(nm);
    };
    // ข้อความของแต่ละคาบบอกว่าชนกับอะไร วันไหน เวลาเท่าไร
    const each = (keys, others, fmt, day, p, rk, week) => {
      keys.forEach((k) => {
        const o = others.filter((x) => x !== k);
        if (o.length) mark(k, fmt(o.map(desc).join(', ')));
      });
      addPair(keys.concat(others), day, p, rk, week);
    };
    const add = (keys, msg, day, p, resource) => {
      for (const k of keys) {
        if (!byPlacement.has(k)) byPlacement.set(k, new Set());
        byPlacement.get(k).add(msg);
      }
      const lk = msg + '@' + day;
      if (!list.has(lk)) list.set(lk, { message: msg, resource, day, periods: [], keys: new Set() });
      const item = list.get(lk);
      if (!item.periods.includes(p)) item.periods.push(p);
      keys.forEach((k) => item.keys.add(k));
    };
    for (const [rk, m] of occ) {
      const un = unavailableOf(rk, idx);
      for (const [ck, keys] of m) {
        const [day, p] = ck.split('|').map(Number);
        if (keys.length > 1) each(keys, keys, (o) => resourceName(rk, idx) + ': ชนกับ ' + o, day, p, rk);
        if (un && un.has(ck)) add(keys, resourceName(rk, idx) + ' ไม่ว่างในคาบนี้', day, p, rk);
      }
    }
    // ตารางทั้งเทอม: ชนกันเองในสัปดาห์เดียวกัน หรือชนกับตารางรายสัปดาห์
    const sOcc = buildSessionOccupancy(state, idx);
    for (const [rk, m] of sOcc) {
      const weekly = occ.get(rk);
      const un = unavailableOf(rk, idx);
      for (const [k, ids] of m) {
        const [w, d, p] = k.split('|').map(Number);
        const keys = ids.map((id) => 'S:' + id);
        if (ids.length > 1) each(keys, keys, (o) => resourceName(rk, idx) + ': ซ้อนกับ ' + o + ' (สัปดาห์ที่ ' + w + ')', d, p, rk, w);
        const wk = weekly && weekly.get(cellKey(d, p));
        if (wk) {
          each(keys, wk, (o) => resourceName(rk, idx) + ': ชนกับตารางรายสัปดาห์ ' + o, d, p, rk, w);
          each(wk, keys, (o) => resourceName(rk, idx) + ': ชนกับตารางทั้งเทอม ' + o + ' (สัปดาห์ที่ ' + w + ')', d, p, rk, w);
        }
        if (un && un.has(cellKey(d, p))) add(keys, resourceName(rk, idx) + ' ไม่ว่าง (ทั้งเทอม สัปดาห์ที่ ' + w + ')', d, p, rk);
      }
    }
    const blocked = blockedCells(state.settings);
    for (const x of state.sessions || []) {
      for (let p = x.start; p < x.start + x.len; p++) {
        const why = blocked.get(cellKey(x.day, p));
        const a = idx.assignments.get(x.assignmentId);
        if (why && a) add(['S:' + x.id], why + ' (ทั้งเทอม สัปดาห์ที่ ' + x.week + ')', x.day, p, resourceKeys(a, idx)[0] || '');
      }
    }
    if (blocked.size) {
      for (const pl of state.placements) {
        const a = idx.assignments.get(pl.assignmentId);
        if (!a || a.recurringId) continue; // กิจกรรมประจำตั้งวัน/เวลาไว้เอง (เช่น PLC วันศุกร์) ไม่นับว่าผิด
        const len = assignmentBlocks(a, idx.subjects)[pl.blockIndex] || 0;
        const key = placementKey(a.id, pl.blockIndex);
        const rk = resourceKeys(a, idx)[0] || '';
        for (let p = pl.start; p < pl.start + len; p++) {
          const why = blocked.get(cellKey(pl.day, p));
          if (why) add([key], why, pl.day, p, rk);
        }
      }
    }
    const items = [...list.values()].map((x) => ({ ...x, keys: [...x.keys], periods: x.periods.sort((a, b) => a - b) }));
    for (const x of pairs.values()) {
      const term = x.ks.some((k) => k.startsWith('S:'));
      const label = (k) => desc(k) + (k.startsWith('S:') ? '' : term ? ' (ทุกสัปดาห์)' : '');
      items.push({
        message: x.names.join(' · ') + ': ' + x.ks.map(label).join(' ซ้อนกับ ') + (term ? ' — ตารางทั้งเทอม สัปดาห์ที่ ' + x.week : ''),
        resource: x.resource, resources: x.resources, day: x.day, periods: x.periods.sort((a, b) => a - b), keys: x.ks, week: term ? x.week : null,
      });
    }
    items.sort((a, b) => a.day - b.day || a.periods[0] - b.periods[0]);
    return { byPlacement, list: items };
  }

  /** สรุปข้อมูลตารางสอนของครู 1 คน (ใช้พิมพ์) */
  function teacherSummary(state, teacherId) {
    const idx = indexState(state);
    const pers = periods(state.settings);
    const mine = state.assignments.filter((a) => a.teacherId === teacherId);
    const subj = new Map();
    for (const a of mine) {
      const s = a.subjectId ? idx.subjects.get(a.subjectId) : null;
      const key = s ? 's:' + s.id : 'x:' + (a.title || 'กิจกรรม');
      if (!subj.has(key)) {
        subj.set(key, s
          ? { code: s.code, name: s.name, t: Number(s.t) || 0, p: Number(s.p) || 0, n: Number(s.n) || 0, h: 0, isSubject: true }
          : { code: a.title || 'กิจกรรม', name: activityName(state, a), t: '', p: '', n: '', h: 0, isSubject: false });
      }
      subj.get(key).h += assignmentHours(a, idx.subjects);
    }
    const subjects = [...subj.values()].sort((x, y) => (y.isSubject - x.isSubject) || String(x.code).localeCompare(String(y.code)));
    const totals = { t: 0, p: 0, n: 0, h: 0 };
    for (const s of subjects) {
      if (s.isSubject) { totals.t += s.t; totals.p += s.p; totals.n += s.n; }
      totals.h += s.h;
    }
    const rows = [];
    const mineIds = new Set(mine.map((a) => a.id));
    for (const pl of state.placements) {
      if (!mineIds.has(pl.assignmentId)) continue;
      const a = idx.assignments.get(pl.assignmentId);
      const len = assignmentBlocks(a, idx.subjects)[pl.blockIndex];
      const s = a.subjectId ? idx.subjects.get(a.subjectId) : null;
      const room = a.roomId ? idx.rooms.get(a.roomId) : null;
      const groups = (a.groupIds || []).map((g) => idx.groups.get(g)).filter(Boolean);
      const base = {
        day: pl.day,
        start: pl.start,
        end: pl.start + len - 1,
        time: (pers[pl.start - 1] || {}).start + ' - ' + (pers[pl.start + len - 2] || {}).end,
        subjectCode: s ? s.code : '',
        subjectName: s ? s.name : a.title || 'กิจกรรม',
        room: room ? room.name : '',
        blockCourse: !!a.blockCourse,
      };
      if (!groups.length) rows.push({ ...base, group: '' });
      for (const g of groups) rows.push({ ...base, group: g.code || g.name });
    }
    rows.sort((x, y) => x.day - y.day || x.start - y.start || String(x.group).localeCompare(String(y.group)));
    const scheduled = state.placements
      .filter((pl) => mineIds.has(pl.assignmentId))
      .reduce((sum, pl) => sum + (assignmentBlocks(idx.assignments.get(pl.assignmentId), idx.subjects)[pl.blockIndex] || 0), 0);
    return { subjects, totals, rows, scheduled };
  }

  /* ---------------------------- จัดตารางอัตโนมัติ ---------------------------- */

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * จัดก้อนคาบที่ยังไม่ได้วางให้อัตโนมัติ โดยไม่ขยับคาบที่วางไว้แล้ว
   * ใช้การค้นหาแบบย้อนกลับ (backtracking) เลือกก้อนที่มีที่ลงน้อยที่สุดก่อน
   * คืนค่า { placements: [...ใหม่], unplaced: [block], complete }
   */
  function autoSchedule(state, opts) {
    opts = opts || {};
    const rng = mulberry32(opts.seed != null ? opts.seed : Date.now());
    const deadline = Date.now() + (opts.timeLimit || 3000);
    const idx = indexState(state);
    const pers = periods(state.settings);
    const P = pers.length;
    const D = state.settings.days.length;
    const occ = new Map();
    const grid = (rk) => {
      let g = occ.get(rk);
      if (!g) occ.set(rk, (g = new Uint16Array(D * P)));
      return g;
    };
    for (const ent of [...state.teachers.map((t) => ['t:' + t.id, t]), ...state.groups.map((g) => ['g:' + g.id, g])]) {
      for (const ck of ent[1].unavailable || []) {
        const [d, p] = ck.split('|').map(Number);
        if (d < D && p >= 1 && p <= P) grid(ent[0])[d * P + p - 1]++;
      }
    }
    const blockedArr = new Uint8Array(D * P);
    for (const ck of blockedCells(state.settings).keys()) {
      const [d, p] = ck.split('|').map(Number);
      blockedArr[d * P + p - 1] = 1;
    }
    for (const x of state.sessions || []) {
      const a = idx.assignments.get(x.assignmentId);
      if (!a || x.day >= D) continue;
      for (const rk of resourceKeys(a, idx)) {
        for (let p = x.start; p < x.start + x.len && p <= P; p++) grid(rk)[x.day * P + p - 1]++;
      }
    }
    const aDays = new Map();
    const groupDay = new Map();
    const bump = (a, keys, d, s, len, delta) => {
      for (const rk of keys) {
        const g = grid(rk);
        for (let p = s; p < s + len; p++) g[d * P + p - 1] += delta;
      }
      if (!aDays.has(a.id)) aDays.set(a.id, new Int16Array(D));
      aDays.get(a.id)[d] += delta;
      for (const gid of a.groupIds || []) {
        if (!groupDay.has(gid)) groupDay.set(gid, new Int16Array(D));
        groupDay.get(gid)[d] += delta * len;
      }
    };

    const units = [];
    for (const b of allBlocks(state)) {
      const keys = resourceKeys(b.assignment, idx);
      if (b.placement) bump(b.assignment, keys, b.placement.day, b.placement.start, b.len, 1);
      else units.push({ block: b, a: b.assignment, len: b.len, keys });
    }

    const positions = [];
    for (let d = 0; d < D; d++) for (let s = 1; s <= P; s++) positions.push([d, s]);

    const fits = (u, d, s) => {
      if (!canSpan(pers, s, u.len, !!u.a.blockCourse)) return false;
      for (let p = s; p < s + u.len; p++) if (blockedArr[d * P + p - 1]) return false;
      for (const rk of u.keys) {
        const g = grid(rk);
        for (let p = s; p < s + u.len; p++) if (g[d * P + p - 1] > 0) return false;
      }
      return true;
    };
    const score = (u, d, s) => {
      let sc = rng() * 2 + s * 0.4;
      const ad = aDays.get(u.a.id);
      if (ad && ad[d]) sc += 25;
      for (const gid of u.a.groupIds || []) {
        const gd = groupDay.get(gid);
        if (gd) sc += gd[d] * 0.6;
      }
      return sc;
    };
    const candidates = (u, cap) => {
      const out = [];
      for (const [d, s] of positions) {
        if (fits(u, d, s)) {
          out.push([d, s]);
          if (out.length >= cap) break;
        }
      }
      return out;
    };

    const remaining = new Set(units.map((_, i) => i));
    const stack = [];
    let best = [];
    let timedOut = false;

    function rec() {
      if (stack.length > best.length) best = stack.slice();
      if (!remaining.size) return true;
      if (Date.now() > deadline) { timedOut = true; return false; }
      let bi = -1;
      let bc = null;
      for (const i of remaining) {
        const c = candidates(units[i], bc ? bc.length : Infinity);
        if (!c.length) return false;
        if (!bc || c.length < bc.length || (c.length === bc.length && units[i].len > units[bi].len)) {
          bi = i;
          bc = c;
        }
      }
      const u = units[bi];
      const full = candidates(u, Infinity)
        .map(([d, s]) => ({ d, s, sc: score(u, d, s) }))
        .sort((x, y) => x.sc - y.sc);
      remaining.delete(bi);
      for (const c of full) {
        bump(u.a, u.keys, c.d, c.s, u.len, 1);
        stack.push({ i: bi, d: c.d, s: c.s });
        if (rec()) return true;
        stack.pop();
        bump(u.a, u.keys, c.d, c.s, u.len, -1);
        if (timedOut) break;
      }
      remaining.add(bi);
      return false;
    }

    const complete = rec();
    let chosen = complete ? stack : best;

    if (!complete) {
      // รีเซ็ตให้เหลือแค่ผลที่ดีที่สุด แล้ววางก้อนที่เหลือเท่าที่ลงได้
      while (stack.length) {
        const t = stack.pop();
        bump(units[t.i].a, units[t.i].keys, t.d, t.s, units[t.i].len, -1);
      }
      for (const t of best) bump(units[t.i].a, units[t.i].keys, t.d, t.s, units[t.i].len, 1);
      chosen = best.slice();
      const used = new Set(chosen.map((t) => t.i));
      const rest = units.map((_, i) => i).filter((i) => !used.has(i)).sort((x, y) => units[y].len - units[x].len);
      for (const i of rest) {
        const u = units[i];
        const c = candidates(u, Infinity)
          .map(([d, s]) => ({ d, s, sc: score(u, d, s) }))
          .sort((x, y) => x.sc - y.sc)[0];
        if (c) {
          bump(u.a, u.keys, c.d, c.s, u.len, 1);
          chosen.push({ i, d: c.d, s: c.s });
        }
      }
    }

    const placedIdx = new Set(chosen.map((t) => t.i));
    return {
      placements: chosen.map((t) => ({
        assignmentId: units[t.i].a.id,
        blockIndex: units[t.i].block.blockIndex,
        day: t.d,
        start: t.s,
        locked: false,
      })),
      unplaced: units.filter((_, i) => !placedIdx.has(i)).map((u) => u.block),
      complete: placedIdx.size === units.length,
    };
  }

  /* ------------------------------ ตารางทั้งเทอม ------------------------------ */

  function termStatus(state, a, subjectsById) {
    const total = termTotal(state, a, subjectsById);
    const mine = (state.sessions || []).filter((x) => x.assignmentId === a.id);
    const placed = mine.reduce((n, x) => n + x.len, 0);
    const hpd = hoursPerDay(a);
    return {
      total,
      placed,
      remaining: Math.max(0, total - placed),
      hpd,
      days: new Set(mine.map((x) => x.week + '|' + x.day)).size,
      fullDays: Math.floor(total / hpd),
      extra: total % hpd,
    };
  }

  /** ตรวจว่าวาง session (สัปดาห์ week วัน day คาบ start ยาว len) ได้ไหม */
  function checkSession(state, a, week, day, start, len, skipId, cache) {
    const idx = (cache && cache.idx) || indexState(state);
    const pers = (cache && cache.pers) || periods(state.settings);
    if (!canSpan(pers, start, len, true)) return { ok: false, span: false, reasons: ['เกินคาบสุดท้ายของวัน'] };
    const wf = weeksFor(state, a);
    if (week > wf) return { ok: false, span: false, reasons: ['ภาคเรียนของกลุ่มนี้มี ' + wf + ' สัปดาห์ (สัปดาห์ที่ ' + week + ' จบภาคเรียนแล้ว)'] };
    const weekly = (cache && cache.weekly) || buildOccupancy(state, idx);
    const sOcc = (cache && cache.sOcc) || buildSessionOccupancy(state, idx, skipId);
    const blocked = (cache && cache.blocked) || blockedCells(state.settings);
    const reasons = new Set();
    const d = (k) => describeWith(state, idx, cache)(k);
    for (let p = start; p < start + len; p++) {
      const why = blocked.get(cellKey(day, p));
      if (why) reasons.add(why);
    }
    for (const rk of resourceKeys(a, idx)) {
      const w = weekly.get(rk);
      const sm = sOcc.get(rk);
      const un = unavailableOf(rk, idx);
      for (let p = start; p < start + len; p++) {
        const wk = w && w.get(cellKey(day, p));
        if (wk) wk.forEach((k) => reasons.add(resourceName(rk, idx) + ': มี ' + d(k) + ' (ตารางรายสัปดาห์)'));
        const ids = sm && sm.get(week + '|' + day + '|' + p);
        if (ids) ids.filter((id) => id !== skipId).forEach((id) => reasons.add(resourceName(rk, idx) + ': มี ' + d('S:' + id) + ' อยู่แล้ว (สัปดาห์ที่ ' + week + ')'));
        if (un && un.has(cellKey(day, p))) reasons.add(resourceName(rk, idx) + ' ไม่ว่าง');
      }
    }
    return { ok: reasons.size === 0, span: true, reasons: [...reasons] };
  }

  function termCache(state, skipId) {
    const idx = indexState(state);
    return { idx, pers: periods(state.settings), weekly: buildOccupancy(state, idx), sOcc: buildSessionOccupancy(state, idx, skipId), blocked: blockedCells(state.settings) };
  }

  /**
   * ผู้ใช้คลิกคาบ p ในตารางของสัปดาห์ week: หาคาบเริ่มให้ session ยาว len ครอบคาบ p
   * เลือกตำแหน่งที่ไม่ชนก่อน ถ้าไม่มีคืนตำแหน่งแรกที่ไม่เลยขอบ (ชน) หรือ null
   */
  function snapSession(state, a, week, day, p, len, skipId, cache) {
    cache = cache || termCache(state, skipId);
    let fallback = null;
    for (let st = p; st >= Math.max(1, p - len + 1); st--) {
      const r = checkSession(state, a, week, day, st, len, skipId, cache);
      if (!r.span) continue;
      if (r.ok) return st;
      if (fallback == null) fallback = st;
    }
    return fallback;
  }

  /** หาคาบเริ่มที่ว่างในวันนั้น (ลองคาบเริ่มที่ต้องการก่อน) */
  function findFreeStart(state, a, week, day, len, cache, skipId) {
    const P = cache.pers.length;
    const pref = Math.max(1, Number(a.termStart) || 1);
    const starts = [];
    for (let s = 1; s + len - 1 <= P; s++) starts.push(s);
    starts.sort((x, y) => (x >= pref ? 0 : 1) - (y >= pref ? 0 : 1) || Math.abs(x - pref) - Math.abs(y - pref));
    for (const s of starts) if (checkSession(state, a, week, day, s, len, skipId, cache).ok) return s;
    return null;
  }

  /**
   * วางวิชาทั้งเทอม 1 วัน: ยาว = ชม./วัน (หรือเท่าที่เหลือ) ถ้าวันนั้นไม่พอจะลดเหลือเท่าที่ว่าง
   * คืนค่า { ok, session, reason }
   */
  function addSession(state, assignmentId, week, day, opts) {
    opts = opts || {};
    const a = state.assignments.find((x) => x.id === assignmentId);
    if (!isTerm(a)) return { ok: false, reason: 'วิชานี้ไม่ได้ตั้งเป็นตารางทั้งเทอม' };
    const st = termStatus(state, a);
    if (!st.remaining) return { ok: false, reason: 'ครบ ' + st.total + ' ชั่วโมงแล้ว' };
    const cache = termCache(state);
    let len = Math.min(opts.len || st.hpd, st.remaining);
    if (opts.start) {
      const r = checkSession(state, a, week, day, opts.start, len, null, cache);
      if (!r.span) return { ok: false, reason: r.reasons[0] };
      const x = { id: uid('s'), assignmentId, week, day, start: opts.start, len };
      state.sessions.push(x);
      return { ok: true, session: x, conflicts: r.reasons };
    }
    for (; len >= 1; len--) {
      const s = findFreeStart(state, a, week, day, len, cache);
      if (s) {
        const x = { id: uid('s'), assignmentId, week, day, start: s, len };
        state.sessions.push(x);
        return { ok: true, session: x };
      }
    }
    return { ok: false, reason: 'วันนี้ไม่มีเวลาว่างพอ' };
  }

  /** เติมวิชาทั้งเทอมต่อเนื่องทีละวัน ตั้งแต่สัปดาห์ fromWeek จนครบชั่วโมง */
  function fillTerm(state, assignmentId, fromWeek) {
    const a = state.assignments.find((x) => x.id === assignmentId);
    if (!isTerm(a)) return { added: 0, remaining: 0 };
    const closed = new Set(state.settings.closedDays || []);
    let added = 0;
    for (let w = Math.max(1, fromWeek || 1); w <= Math.min(state.settings.weeks, weeksFor(state, a)); w++) {
      for (let d = 0; d < state.settings.days.length; d++) {
        if (closed.has(state.settings.days[d])) continue;
        if (state.sessions.some((x) => x.assignmentId === a.id && x.week === w && x.day === d)) continue;
        if (!termStatus(state, a).remaining) return { added, remaining: 0 };
        const r = addSession(state, a.id, w, d);
        if (r.ok) added += r.session.len;
      }
    }
    return { added, remaining: termStatus(state, a).remaining };
  }

  /** เลื่อนเวลา session ทั้งก้อน (delta คาบ) */
  function shiftSession(state, sessionId, delta) {
    const x = state.sessions.find((y) => y.id === sessionId);
    if (!x) return { ok: false, reason: 'ไม่พบ' };
    const start = x.start + delta;
    const pers = periods(state.settings);
    if (!canSpan(pers, start, x.len, true)) return { ok: false, reason: start < 1 ? 'เป็นคาบแรกของวันแล้ว' : 'เลื่อนต่อไม่ได้ จะเลยคาบสุดท้าย (' + pers[pers.length - 1].end + ')' };
    x.start = start;
    return { ok: true };
  }

  /**
   * เพิ่ม/ลดชั่วโมงของ session ที่หัว (dHead) หรือท้าย (dTail)
   * เพิ่มได้ไม่เกินชั่วโมงทั้งเทอมที่เหลือ
   */
  function resizeSession(state, sessionId, dHead, dTail) {
    if (dTail === undefined) { dTail = dHead; dHead = 0; }
    const x = state.sessions.find((y) => y.id === sessionId);
    if (!x) return { ok: false, reason: 'ไม่พบ' };
    const len = x.len + dHead + dTail;
    const start = x.start - dHead;
    if (len < 1) return { ok: false, reason: 'ต้องมีอย่างน้อย 1 ชั่วโมง' };
    const pers = periods(state.settings);
    if (start < 1) return { ok: false, reason: 'เป็นคาบแรกของวันแล้ว' };
    if (!canSpan(pers, start, len, true)) return { ok: false, reason: 'เลยคาบสุดท้ายของวัน (' + pers[pers.length - 1].end + ')' };
    const a = state.assignments.find((y) => y.id === x.assignmentId);
    if (dHead + dTail > 0 && a && termStatus(state, a).remaining < dHead + dTail) {
      return { ok: false, reason: 'ครบชั่วโมงทั้งเทอมแล้ว ลดชั่วโมงวันอื่นก่อน แล้วค่อยเพิ่มวันนี้' };
    }
    x.start = start;
    x.len = len;
    return { ok: true };
  }

  /** แบ่ง session เป็นหัว (headLen ชม.) + ท้าย (ส่วนที่เหลือ) ส่วนท้ายวางต่อจากหัวทันที ย้ายแยกได้ */
  function splitSession(state, sessionId, headLen) {
    const x = state.sessions.find((y) => y.id === sessionId);
    if (!x || !(headLen >= 1 && headLen < x.len)) return null;
    const tail = { id: uid('s'), assignmentId: x.assignmentId, week: x.week, day: x.day, start: x.start + headLen, len: x.len - headLen };
    x.len = headLen;
    state.sessions.push(tail);
    return tail;
  }

  /* ------------------------------ ตรวจสอบข้อมูล ------------------------------ */

  /** ชื่อสำหรับเทียบซ้ำ: ตัดช่องว่าง จุด ขีด และตัวพิมพ์ เช่น "ปวช.3 ช่างยนต์67" = "ปวช3ช่างยนต์ 67" */
  function looseName(x) {
    return String(x || '').toLowerCase().replace(/[\s.\-_/()]+/g, '');
  }

  function dupBuckets(list, keyFn) {
    const m = new Map();
    for (const x of list) {
      const k = keyFn(x);
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return [...m.values()].filter((xs) => xs.length > 1);
  }

  /**
   * ตรวจข้อมูลทั้งหมด เน้นกลุ่มเรียน: ซ้ำในรายชื่อ, ลงวิชาเดียวกันซ้ำ, เรียนชนกัน, ชั่วโมงเกินเวลาที่มี
   * คืนค่า [{ level: 'error'|'warn', type, title, detail, groupIds?, teacherId?, assignmentIds? }]
   */
  function checkData(state) {
    const idx = indexState(state);
    const issues = [];
    const gname = (g) => (g.name || '(ไม่มีชื่อ)') + (g.code ? ' (' + g.code + ')' : '');

    // 1) กลุ่มเรียนซ้ำในรายชื่อ
    const byCode = dupBuckets(state.groups, (g) => String(g.code || '').trim());
    const seen = new Set();
    for (const gs of byCode) {
      gs.forEach((g) => seen.add(g.id));
      issues.push({ level: 'error', type: 'dup-group', title: 'กลุ่มเรียนรหัสซ้ำ: ' + String(gs[0].code).trim(),
        detail: gs.map(gname).join(' · '), groupIds: gs.map((g) => g.id) });
    }
    for (const gs of dupBuckets(state.groups, (g) => looseName(g.name))) {
      if (gs.every((g) => seen.has(g.id))) continue;
      issues.push({ level: 'warn', type: 'dup-group', title: 'ชื่อกลุ่มเรียนซ้ำกัน (รหัสต่างกัน)',
        detail: gs.map(gname).join(' · ') + ' — ถ้าเป็นกลุ่มเดียวกันให้รวม ถ้าคนละกลุ่มให้ตั้งชื่อให้ต่างกัน', groupIds: gs.map((g) => g.id) });
    }

    // 2) กลุ่มเรียนลงวิชาเดียวกันซ้ำ
    const pairs = new Map();
    for (const a of state.assignments) {
      if (!a.subjectId) continue;
      for (const g of a.groupIds || []) {
        const k = g + '|' + a.subjectId;
        if (!pairs.has(k)) pairs.set(k, []);
        pairs.get(k).push(a);
      }
    }
    for (const [k, as] of pairs) {
      if (as.length < 2) continue;
      const [gid, sid] = k.split('|');
      const g = idx.groups.get(gid);
      const sj = idx.subjects.get(sid);
      const who = as.map((a) => (idx.teachers.get(a.teacherId) || {}).name || 'ยังไม่มีครู').join(', ');
      issues.push({ level: 'warn', type: 'dup-subject', title: 'กลุ่ม ' + (g ? g.name : '?') + ' ลงวิชา ' + (sj ? sj.code : '') + ' ซ้ำ ' + as.length + ' รายการ',
        detail: (sj ? sj.name : '') + ' · ผู้สอน: ' + who + ' — ถ้าตั้งใจแบ่งคาบ ให้ใช้รูปแบบคาบ (เช่น 2+2) ในรายการเดียว',
        groupIds: [gid], assignmentIds: as.map((a) => a.id), teacherId: as[0].teacherId });
    }

    // 3) กลุ่มเรียนเรียนชนกัน (รายสัปดาห์ / ทั้งเทอม)
    const conf = findConflicts(state);
    const byGroup = new Map();
    for (const c of conf.list) {
      if (!c.resource || c.resource[0] !== 'g') continue;
      const gid = c.resource.slice(2);
      if (!byGroup.has(gid)) byGroup.set(gid, []);
      byGroup.get(gid).push(state.settings.days[c.day] + ' คาบ ' + c.periods.join(','));
    }
    for (const [gid, where] of byGroup) {
      const g = idx.groups.get(gid);
      issues.push({ level: 'error', type: 'group-clash', title: 'กลุ่ม ' + (g ? g.name : '?') + ' มีเรียนซ้อนเวลากัน ' + where.length + ' จุด',
        detail: where.slice(0, 5).join(' · ') + (where.length > 5 ? ' …' : ''), groupIds: [gid] });
    }

    // 4) ชั่วโมงรายสัปดาห์ของกลุ่มเกินเวลาที่มีให้จัด
    const P = periods(state.settings).length;
    const blocked = blockedCells(state.settings);
    const capacity = state.settings.days.length * P - blocked.size;
    const need = new Map();
    for (const a of state.assignments) {
      if (isTerm(a)) continue;
      const h = assignmentHours(a, idx.subjects);
      for (const g of a.groupIds || []) need.set(g, (need.get(g) || 0) + h);
    }
    for (const g of state.groups) {
      const free = capacity - (g.unavailable || []).filter((k) => !blocked.has(k)).length;
      const n = need.get(g.id) || 0;
      if (n > free) {
        issues.push({ level: 'error', type: 'group-overload', title: 'กลุ่ม ' + g.name + ' ชั่วโมงเกินเวลาที่มี',
          detail: 'ต้องเรียน ' + n + ' ชม./สัปดาห์ แต่มีเวลาให้จัด ' + free + ' ชม. (ไม่รวมวันห้ามจัด/เวลาไม่ว่าง)', groupIds: [g.id] });
      }
    }

    // 5) รายการที่ไม่มีกลุ่มเรียน / ข้อมูลอื่นซ้ำ
    for (const a of state.assignments) {
      if (!(a.groupIds || []).length && !isTeacherActivity(state, a)) {
        const sj = a.subjectId ? idx.subjects.get(a.subjectId) : null;
        issues.push({ level: 'warn', type: 'no-group', title: 'ยังไม่ได้เลือกกลุ่มเรียน: ' + (sj ? sj.code + ' ' + sj.name : a.title || 'ไม่มีชื่อ'),
          detail: 'ผู้สอน: ' + ((idx.teachers.get(a.teacherId) || {}).name || 'ยังไม่มีครู'), assignmentIds: [a.id], teacherId: a.teacherId });
      }
    }
    for (const ts of dupBuckets(state.teachers, (t) => looseName(t.name))) {
      issues.push({ level: 'warn', type: 'dup-teacher', title: 'ชื่อครูซ้ำ', detail: ts.map((t) => t.name).join(' · ') });
    }
    for (const ss of dupBuckets(state.subjects, (x) => String(x.code || '').trim())) {
      issues.push({ level: 'warn', type: 'dup-subjectcode', title: 'รหัสวิชาซ้ำ: ' + ss[0].code, detail: ss.map((x) => x.name).join(' · ') });
    }
    const rank = { error: 0, warn: 1 };
    return issues.sort((x, y) => rank[x.level] - rank[y.level]);
  }

  /** รวมกลุ่มเรียนที่ซ้ำ: ย้ายทุกอย่างของ dropId ไปที่ keepId แล้วลบ dropId */
  function mergeGroups(state, keepId, dropId) {
    const keep = state.groups.find((g) => g.id === keepId);
    const drop = state.groups.find((g) => g.id === dropId);
    if (!keep || !drop || keep === drop) return false;
    for (const k of ['level', 'major', 'size', 'advisor', 'name', 'code']) if (!keep[k] && drop[k]) keep[k] = drop[k];
    keep.unavailable = [...new Set([...(keep.unavailable || []), ...(drop.unavailable || [])])];
    const keepRec = new Set(state.assignments.filter((a) => a.recurringId && a.groupIds.includes(keepId)).map((a) => a.recurringId));
    const removed = new Set();
    for (const a of state.assignments) {
      if (!a.groupIds.includes(dropId)) continue;
      if (a.recurringId && keepRec.has(a.recurringId)) { removed.add(a.id); continue; }
      a.groupIds = [...new Set(a.groupIds.map((g) => (g === dropId ? keepId : g)))];
    }
    state.assignments = state.assignments.filter((a) => !removed.has(a.id));
    state.placements = state.placements.filter((p) => !removed.has(p.assignmentId));
    state.groups = state.groups.filter((g) => g !== drop);
    return true;
  }

  /* ------------------------------ นำเข้าแผนการเรียน ------------------------------ */

  /** วิชากิจกรรม (กิจกรรมองค์การวิชาชีพ, กิจกรรมในสถานประกอบการ ฯลฯ) */
  function isActivitySubject(sj) {
    return !!sj && /^\s*กิจกรรม/.test(sj.name || '') && !(Number(sj.t) > 0);
  }

  /** กลุ่มรหัสต่างกันแค่หลักสุดท้าย = รุ่น/สาขาเดียวกันคนละห้อง เช่น 693190501 (สายตรง) กับ 693190502 (ม.6) */
  function sectionKey(code) {
    const c = String(code || '').trim();
    return c.length > 1 ? c.slice(0, -1) : c;
  }

  /**
   * นำเข้าแผนการเรียน: แต่ละแถว = รหัสกลุ่ม | รหัสวิชา | ชื่อวิชา | ท | ป | น | ชื่อกลุ่มเรียน (ไม่บังคับ)
   * - สร้างรายวิชา/กลุ่มเรียนที่ยังไม่มี
   * - สร้างรายการภาระงาน (ยังไม่มีครู) ต่อวิชาต่อกลุ่ม ถ้า opts.mergeSections ให้กลุ่มรหัสต่างกันแค่หลักสุดท้ายเรียนรวม
   * - วิชากิจกรรม วางล็อกไว้ที่ opts.activity = { day, start, len } (เช่น พุธ คาบ 2–3)
   */
  function importStudyPlan(state, text, opts) {
    opts = Object.assign({ mergeSections: true, activity: null }, opts || {});
    const res = { rows: 0, subjectsAdded: 0, groupsAdded: 0, assignmentsAdded: 0, merged: 0, existing: 0, activities: 0, problems: [] };
    const bySubject = new Map();
    for (const cells of splitRows(text)) {
      let [gcode, scode, name, t, p, n, gname] = cells.map((c) => String(c == null ? '' : c).trim());
      if (!gcode || /รหัส/.test(gcode + scode)) continue;
      if (/^\d+\s*-\s*\d+\s*-\s*\d+$/.test(t || '')) { gname = p; [t, p, n] = t.split('-').map((x) => x.trim()); }
      if (!scode) { res.problems.push('แถวที่ไม่มีรหัสวิชา (กลุ่ม ' + gcode + ')'); continue; }
      res.rows++;
      let sj = state.subjects.find((x) => String(x.code).trim() === scode);
      if (!sj) {
        sj = { id: uid('s'), code: scode, name: name || scode, t: Number(t) || 0, p: Number(p) || 0, n: Number(n) || 0 };
        state.subjects.push(sj);
        res.subjectsAdded++;
      } else if (!sj.name && name) sj.name = name;
      let g = state.groups.find((x) => String(x.code).trim() === gcode);
      if (!g) {
        g = { id: uid('g'), code: gcode, name: gname || gcode, level: '', major: '', size: '', advisor: '', unavailable: [] };
        state.groups.push(g);
        res.groupsAdded++;
      } else if ((!g.name || g.name === g.code) && gname) g.name = gname;
      if (!bySubject.has(sj.id)) bySubject.set(sj.id, { sj, groups: [] });
      const list = bySubject.get(sj.id).groups;
      if (!list.includes(g)) list.push(g);
    }
    const days = state.settings.days;
    for (const { sj, groups } of bySubject.values()) {
      const parts = new Map();
      for (const g of groups) {
        const k = opts.mergeSections ? sectionKey(g.code) : g.id;
        if (!parts.has(k)) parts.set(k, []);
        parts.get(k).push(g);
      }
      for (const gs of parts.values()) {
        const ids = gs.map((g) => g.id);
        const already = state.assignments.find((a) => a.subjectId === sj.id && ids.some((id) => (a.groupIds || []).includes(id)));
        if (already) { res.existing++; continue; }
        const a = { id: uid('a'), teacherId: '', subjectId: sj.id, title: '', groupIds: ids, roomId: null, blocks: '', blockCourse: false, plan: 'weekly' };
        state.assignments.push(a);
        res.assignmentsAdded++;
        if (ids.length > 1) res.merged++;
        if (opts.activity && isActivitySubject(sj)) {
          const d = days.indexOf(opts.activity.day);
          const len = assignmentHours(a, new Map([[sj.id, sj]]));
          if (d >= 0 && canSpan(periods(state.settings), Number(opts.activity.start), len, true)) {
            state.placements.push({ assignmentId: a.id, blockIndex: 0, day: d, start: Number(opts.activity.start), locked: true });
            res.activities++;
          } else res.problems.push('วาง ' + sj.code + ' ที่วัน' + opts.activity.day + ' คาบ ' + opts.activity.start + ' ไม่ได้');
        }
      }
    }
    return res;
  }

  /* ------------------------------ กิจกรรมประจำ ------------------------------ */

  const normName = (x) => String(x || '').replace(/\s+/g, ' ').trim();

  /**
   * สร้าง/อัปเดตกิจกรรมประจำ (เช่น Home Room) ให้ทุกกลุ่มเรียน แล้วล็อกไว้ที่วัน/คาบที่กำหนด
   * ผู้สอน = ครูที่ปรึกษาของกลุ่ม โดยครู 1 คนได้ 1 กลุ่มก่อน
   * กลุ่มที่ไม่มีชื่อครูที่ปรึกษา / ไม่พบชื่อในรายชื่อครู / ครูได้กลุ่มอื่นไปแล้ว จะเว้นว่างไว้ให้เลือกเอง
   * ภาระงานที่มีอยู่แล้ว (รวมถึงกิจกรรมชื่อเดียวกันที่สร้างเอง) จะถูกใช้ต่อ และไม่เปลี่ยนครูที่ใส่ไว้แล้ว
   */
  function applyRecurring(state, recId) {
    const rec = state.settings.recurring.find((r) => r.id === recId);
    if (!rec) return { error: 'ไม่พบกิจกรรม' };
    const day = state.settings.days.indexOf(rec.day);
    if (day < 0) return { error: 'วัน' + rec.day + 'ไม่ได้แสดงในตาราง' };
    if (rec.scope !== 'teacher' && (state.settings.closedDays || []).includes(rec.day)) return { error: 'วัน' + rec.day + 'ตั้งเป็นห้ามจัด' };
    const len = Math.max(1, Number(rec.len) || 1);
    const start = Number(rec.start) || 1;
    if (!canSpan(periods(state.settings), start, len, true)) return { error: 'คาบที่เลือกเกินคาบสุดท้าย' };
    if (rec.scope === 'teacher') return applyTeacherActivity(state, rec, day, start, len);

    const title = normName(rec.title).toLowerCase();
    const byGroup = new Map();
    for (const a of state.assignments) {
      const mine = a.recurringId === rec.id ||
        (!a.recurringId && !a.subjectId && normName(a.title).toLowerCase() === title && (a.groupIds || []).length === 1);
      if (!mine) continue;
      const g = (a.groupIds || [])[0];
      if (g && !byGroup.has(g)) {
        a.recurringId = rec.id;
        byGroup.set(g, a);
      }
    }
    const keep = new Set(byGroup.values());
    const removedIds = new Set(state.assignments.filter((a) => a.recurringId === rec.id && !keep.has(a)).map((a) => a.id));
    state.assignments = state.assignments.filter((a) => !removedIds.has(a.id));

    const teachers = new Map(state.teachers.map((t) => [normName(t.name), t]));
    const used = new Set([...keep].map((a) => a.teacherId).filter(Boolean));
    const res = { groups: state.groups.length, created: 0, withTeacher: 0, noAdvisor: 0, notFound: 0, duplicate: 0, error: '' };
    for (const g of state.groups) {
      let a = byGroup.get(g.id);
      if (!a) {
        a = { id: uid('a'), teacherId: '', subjectId: null, title: rec.title, groupIds: [g.id], roomId: null, blocks: '', blockCourse: false, recurringId: rec.id };
        state.assignments.push(a);
        res.created++;
      }
      a.title = rec.title;
      a.subjectId = null;
      a.blocks = String(len);
      a.blockCourse = false;
      if (!a.teacherId) {
        const name = normName(g.advisor);
        const t = name ? teachers.get(name) : null;
        if (!name) res.noAdvisor++;
        else if (!t) res.notFound++;
        else if (used.has(t.id)) res.duplicate++; // Home Room เวลาเดียวกัน ครู 1 คนสอนได้ 1 กลุ่ม
        else {
          a.teacherId = t.id;
          used.add(t.id);
        }
      }
      if (a.teacherId) res.withTeacher++;
      state.placements = state.placements.filter((p) => p.assignmentId !== a.id);
      state.placements.push({ assignmentId: a.id, blockIndex: 0, day, start, locked: true });
    }
    state.placements = state.placements.filter((p) => !removedIds.has(p.assignmentId));
    return res;
  }

  /**
   * ให้ Home Room (กิจกรรมประจำของกลุ่ม) ตรงกับ "ครูที่ปรึกษา" ในข้อมูลกลุ่มเรียนเสมอ
   * - กลุ่มที่ยังไม่มี Home Room (เพิ่มกลุ่มทีหลัง) → สร้างให้
   * - ชื่อครูที่ปรึกษาตรงกับรายชื่อครู → เป็นผู้สอน Home Room
   * - ชื่อไม่พบในรายชื่อครู → Home Room ยังไม่มีครู · ไม่มีชื่อแต่ Home Room มีครู → ใส่ชื่อให้ข้อมูลกลุ่ม
   */
  function syncAdvisors(state) {
    let changed = 0;
    for (const r of state.settings.recurring || []) {
      if (r.scope === 'teacher') continue;
      const mine = state.assignments.filter((a) => a.recurringId === r.id);
      if (!mine.length) continue; // ยังไม่ได้สร้าง
      const have = new Set(mine.map((a) => (a.groupIds || [])[0]));
      if (state.groups.some((g) => !have.has(g.id))) { applyRecurring(state, r.id); changed++; }
      const list = state.assignments.filter((x) => x.recurringId === r.id);
      const groupOf = (a) => state.groups.find((x) => x.id === (a.groupIds || [])[0]);
      const wantOf = (a) => { const g = groupOf(a); const t = g && normName(g.advisor) ? findTeacherByName(state, g.advisor) : null; return t ? t.id : ''; };
      // Home Room เวลาเดียวกันทุกกลุ่ม: ครู 1 คนได้ 1 กลุ่ม — กลุ่มที่ตรงอยู่แล้วได้ก่อน
      const used = new Set(list.filter((a) => a.teacherId && a.teacherId === wantOf(a)).map((a) => a.teacherId));
      for (const a of list) {
        const g = groupOf(a);
        if (!g) continue;
        const name = normName(g.advisor);
        if (name) {
          let want = wantOf(a);
          if (want && want !== a.teacherId && used.has(want)) want = '';
          if (want) used.add(want);
          if (a.teacherId !== want) { a.teacherId = want; changed++; }
        } else if (a.teacherId) {
          const t = state.teachers.find((x) => x.id === a.teacherId);
          if (t) { g.advisor = t.name; changed++; } else { a.teacherId = ''; changed++; }
        }
      }
    }
    return changed;
  }

  /** หาครูจากชื่อ (ไม่สนช่องว่าง/จุด) */
  function findTeacherByName(state, name) {
    const k = looseName(name);
    return k ? state.teachers.find((t) => looseName(t.name) === k) || null : null;
  }

  /**
   * เปลี่ยนครูที่ปรึกษาของกลุ่ม: ใส่ชื่อในข้อมูลกลุ่ม และเป็นผู้สอน Home Room (กิจกรรมประจำของกลุ่ม) ของกลุ่มนั้น
   * คืนค่ากลุ่มอื่นที่ครูคนนี้เป็นที่ปรึกษาอยู่แล้ว (ไว้เตือน)
   */
  function setAdvisor(state, groupId, teacherId) {
    const g = state.groups.find((x) => x.id === groupId);
    const t = teacherId ? state.teachers.find((x) => x.id === teacherId) : null;
    if (!g) return { others: [] };
    g.advisor = t ? t.name : '';
    const groupRecs = new Set((state.settings.recurring || []).filter((r) => r.scope !== 'teacher').map((r) => r.id));
    for (const a of state.assignments) {
      if (groupRecs.has(a.recurringId) && (a.groupIds || [])[0] === groupId) a.teacherId = t ? t.id : '';
    }
    const others = t ? state.groups.filter((x) => x.id !== groupId && looseName(x.advisor) === looseName(t.name)) : [];
    return { others };
  }

  /** กิจกรรมของครู (เช่น PLC): ครูทุกคนยกเว้นที่ติ๊กออก 1 รายการต่อครู ล็อกไว้ */
  function applyTeacherActivity(state, rec, day, start, len) {
    const exclude = new Set(rec.exclude || []);
    const want = state.teachers.filter((t) => !exclude.has(t.id));
    const byTeacher = new Map();
    const drop = new Set();
    for (const a of state.assignments) {
      if (a.recurringId !== rec.id) continue;
      if (a.teacherId && !byTeacher.has(a.teacherId) && want.some((t) => t.id === a.teacherId)) byTeacher.set(a.teacherId, a);
      else drop.add(a.id);
    }
    state.assignments = state.assignments.filter((a) => !drop.has(a.id));
    state.placements = state.placements.filter((p) => !drop.has(p.assignmentId));
    const res = { teachers: want.length, excluded: state.teachers.length - want.length, created: 0, groups: 0, withTeacher: want.length, error: '' };
    for (const t of want) {
      let a = byTeacher.get(t.id);
      if (!a) {
        a = { id: uid('a'), teacherId: t.id, subjectId: null, title: rec.title, groupIds: [], roomId: null, blocks: '', blockCourse: false, recurringId: rec.id };
        state.assignments.push(a);
        res.created++;
      }
      a.title = rec.title;
      a.blocks = String(len);
      a.groupIds = [];
      state.placements = state.placements.filter((p) => p.assignmentId !== a.id);
      state.placements.push({ assignmentId: a.id, blockIndex: 0, day, start, locked: true });
    }
    return res;
  }

  /** ลบกิจกรรมประจำพร้อมภาระงานที่สร้างจากกิจกรรมนั้น */
  function removeRecurring(state, recId) {
    const ids = new Set(state.assignments.filter((a) => a.recurringId === recId).map((a) => a.id));
    state.assignments = state.assignments.filter((a) => !ids.has(a.id));
    state.placements = state.placements.filter((p) => !ids.has(p.assignmentId));
    state.settings.recurring = state.settings.recurring.filter((r) => r.id !== recId);
    return ids.size;
  }

  /** อ่านรายการรายวิชา "รหัส | ชื่อ | ท | ป | น" (ข้ามหัวตาราง) */
  function parseSubjectRows(text) {
    return splitRows(text)
      .filter((c) => /^\d{4,5}[-*]\d{4}$/.test(normName(c[0])))
      .map((c) => ({ code: normName(c[0]), name: normName(c[1]), t: Number(c[2]) || 0, p: Number(c[3]) || 0, n: Number(c[4]) || 0 }));
  }

  /** เพิ่มรายวิชาจากรายการ เฉพาะรหัสที่ยังไม่มี (ไม่ทับข้อมูลเดิม) */
  function addSubjects(state, text) {
    const have = new Set(state.subjects.map((x) => normName(x.code)));
    const res = { added: 0, existing: 0 };
    for (const r of parseSubjectRows(text)) {
      if (have.has(r.code)) { res.existing++; continue; }
      state.subjects.push({ id: uid('s'), ...r });
      have.add(r.code);
      res.added++;
    }
    return res;
  }

  /* --------------------------- แบ่ง / รวม / ปรับความยาวก้อนคาบ --------------------------- */

  function findPlacement(state, assignmentId, blockIndex) {
    return state.placements.find((p) => p.assignmentId === assignmentId && p.blockIndex === blockIndex) || null;
  }

  function blocksOf(state, a) {
    const subjects = new Map(state.subjects.map((x) => [x.id, x]));
    return assignmentBlocks(a, subjects).slice();
  }

  /** แบ่งก้อนคาบเป็นหัว (headLen คาบ) และท้าย (ส่วนที่เหลือ) ถ้าวางอยู่แล้ว ส่วนท้ายจะวางต่อจากหัวทันที */
  function splitBlock(state, assignmentId, blockIndex, headLen) {
    const a = state.assignments.find((x) => x.id === assignmentId);
    if (!a) return false;
    const blocks = blocksOf(state, a);
    const L = blocks[blockIndex];
    if (!(headLen >= 1 && headLen < L)) return false;
    blocks.splice(blockIndex, 1, headLen, L - headLen);
    a.blocks = blocks.join('+');
    for (const p of state.placements) if (p.assignmentId === assignmentId && p.blockIndex > blockIndex) p.blockIndex++;
    const head = findPlacement(state, assignmentId, blockIndex);
    if (head) state.placements.push({ assignmentId, blockIndex: blockIndex + 1, day: head.day, start: head.start + headLen, locked: !!head.locked });
    return true;
  }

  /** รวมก้อนคาบกับก้อนถัดไป (ตำแหน่งตามก้อนแรก ถ้าก้อนแรกยังไม่ได้วาง ก้อนที่รวมแล้วจะรอจัดใหม่) */
  function mergeWithNext(state, assignmentId, blockIndex) {
    const a = state.assignments.find((x) => x.id === assignmentId);
    if (!a) return false;
    const blocks = blocksOf(state, a);
    if (blockIndex + 1 >= blocks.length) return false;
    blocks.splice(blockIndex, 2, blocks[blockIndex] + blocks[blockIndex + 1]);
    a.blocks = blocks.join('+');
    state.placements = state.placements.filter((p) => !(p.assignmentId === assignmentId && p.blockIndex === blockIndex + 1));
    for (const p of state.placements) if (p.assignmentId === assignmentId && p.blockIndex > blockIndex + 1) p.blockIndex--;
    const head = findPlacement(state, assignmentId, blockIndex);
    if (head && !canSpan(periods(state.settings), head.start, blocks[blockIndex], !!a.blockCourse)) {
      state.placements = state.placements.filter((p) => p !== head);
    }
    return true;
  }

  /**
   * เพิ่ม/ลดคาบที่หัว (dHead) หรือท้าย (dTail) ของก้อน เช่น เพิ่มเวลาให้ Block Course
   * คืนค่า { ok, reason }
   */
  function resizeBlock(state, assignmentId, blockIndex, dHead, dTail) {
    const a = state.assignments.find((x) => x.id === assignmentId);
    if (!a) return { ok: false, reason: 'ไม่พบภาระงาน' };
    const blocks = blocksOf(state, a);
    const pl = findPlacement(state, assignmentId, blockIndex);
    if (!pl) { dTail += dHead; dHead = 0; }
    const L2 = blocks[blockIndex] + dHead + dTail;
    if (L2 < 1) return { ok: false, reason: 'ก้อนคาบต้องมีอย่างน้อย 1 คาบ' };
    if (pl) {
      const s2 = pl.start - dHead;
      if (!canSpan(periods(state.settings), s2, L2, !!a.blockCourse)) {
        return { ok: false, reason: a.blockCourse ? 'เกินคาบแรก/คาบสุดท้ายของวัน' : 'คร่อมช่วงพักหรือเกินขอบตาราง (ถ้าต้องการเรียนข้ามพัก ให้ติ๊ก Block Course)' };
      }
      pl.start = s2;
    }
    blocks[blockIndex] = L2;
    a.blocks = blocks.join('+');
    return { ok: true };
  }

  /* ------------------------------ วางข้อมูลจาก Excel ------------------------------ */

  /** แยกข้อความที่คัดลอกจาก Excel เป็นแถว/คอลัมน์ (คั่นด้วยแท็บ ถ้าไม่มีแท็บใช้จุลภาค) */
  function splitRows(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map((line) => (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) => c.trim()))
      .filter((cells) => cells.some((c) => c));
  }

  /**
   * อ่านรายชื่อกลุ่มเรียน รองรับรูปแบบที่ส่งออกจากระบบของวิทยาลัย เช่น
   * "ปวช.3/1  (ปวช.67) ช่างยนต์  672010101  ปวช.3 ช่างยนต์67  เครื่องกลและยานยนต์  2  ชื่อครูที่ปรึกษา"
   * หรือแบบง่าย "รหัสกลุ่ม  ชื่อกลุ่มเรียน"
   */
  function parseGroupRows(text) {
    const out = [];
    for (const cells of splitRows(text)) {
      const ci = cells.findIndex((c) => /^\d{6,12}$/.test(c));
      if (ci < 0) {
        if (cells.filter(Boolean).length >= 2 && !/รหัส/.test(cells.join(''))) {
          const [code, name] = cells.filter(Boolean);
          out.push({ code, name, level: '', major: '', size: '', advisor: '' });
        }
        continue;
      }
      const before = cells.slice(0, ci).filter(Boolean);
      const after = cells.slice(ci + 1);
      const name = after[0] || '';
      const rest = after.slice(1);
      const sizeAt = rest.findIndex((c) => /^\d+$/.test(c));
      const level = before.find((c) => /^ปว[ชส]\.?\s*\d/.test(c)) || '';
      const majorCell = before.find((c) => c !== level) || '';
      out.push({
        code: cells[ci],
        name,
        level,
        major: majorCell.replace(/^\([^)]*\)\s*/, ''),
        size: sizeAt >= 0 ? Number(rest[sizeAt]) : '',
        advisor: sizeAt >= 0 ? rest.slice(sizeAt + 1).find(Boolean) || '' : '',
      });
    }
    return out;
  }

  const TT = {
    ALL_DAYS,
    defaultRecurring,
    isActivitySubject,
    sectionKey,
    importStudyPlan,
    looseName,
    checkData,
    mergeGroups,
    isTerm,
    groupLevel,
    weeksForGroup,
    weeksFor,
    hoursPerDay,
    termTotal,
    termStatus,
    checkSession,
    snapSession,
    termCache,
    snapStart,
    shiftSession,
    addSession,
    fillTerm,
    resizeSession,
    splitSession,
    buildSessionOccupancy,
    blockedCells,
    applyRecurring,
    removeRecurring,
    findPlacement,
    splitBlock,
    mergeWithNext,
    resizeBlock,
    splitRows,
    parseGroupRows,
    uid,
    defaultColumns,
    emptyState,
    normalizeState,
    periods,
    canSpan,
    subjectHours,
    defaultPattern,
    parsePattern,
    indexState,
    assignmentBlocks,
    assignmentHours,
    placementKey,
    resourceKeys,
    sanitizePlacements,
    allBlocks,
    cellKey,
    checkPlacement,
    findTeacherByName,
    groupGrade,
    gradeRank,
    GRADE_ORDER,
    syncAdvisors,
    setAdvisor,
    parseSubjectRows,
    addSubjects,
    defaultPLC,
    isTeacherActivity,
    buildOccupancy,
    findConflicts,
    teacherSummary,
    autoSchedule,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
  else root.TT = TT;
})(typeof window !== 'undefined' ? window : globalThis);
