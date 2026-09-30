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
      },
      departments: [],
      teachers: [],
      subjects: [],
      groups: [],
      rooms: [],
      assignments: [],
      placements: [],
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
    for (const k of ['departments', 'teachers', 'subjects', 'groups', 'rooms', 'assignments', 'placements']) {
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

  function placementKey(assignmentId, blockIndex) {
    return assignmentId + '#' + blockIndex;
  }

  /** รหัสทรัพยากรที่ห้ามชน: ครู กลุ่มเรียน และห้องที่ไม่ได้ตั้งเป็น "ใช้ร่วมได้" */
  function resourceKeys(a, idx) {
    const keys = [];
    if (a.teacherId) keys.push('t:' + a.teacherId);
    for (const g of a.groupIds || []) keys.push('g:' + g);
    if (a.roomId) {
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
      if (!canSpan(pers, pl.start, blocks[pl.blockIndex], !!a.blockCourse)) return false;
      seen.add(key);
      return true;
    });
    return before - state.placements.length;
  }

  /** ทุกก้อนคาบที่ต้องจัด พร้อมสถานะว่าวางแล้วหรือยัง */
  function allBlocks(state) {
    const idx = indexState(state);
    const placed = new Map(state.placements.map((p) => [placementKey(p.assignmentId, p.blockIndex), p]));
    const out = [];
    for (const a of state.assignments) {
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
      return { ok: false, span: false, reasons: ['วางไม่ได้: เกินคาบสุดท้าย หรือคร่อมช่วงพัก (ถ้าต้องการเรียนข้ามพัก ให้ติ๊ก Block Course)'] };
    }
    const reasons = new Set();
    for (const rk of resourceKeys(a, idx)) {
      const m = occ.get(rk);
      const un = unavailableOf(rk, idx);
      for (let p = start; p < start + len; p++) {
        const ck = cellKey(day, p);
        const others = m && m.get(ck);
        if (others && others.some((k) => k !== skip)) reasons.add(resourceName(rk, idx) + ' มีคาบอื่นแล้ว');
        if (un && un.has(ck)) reasons.add(resourceName(rk, idx) + ' ไม่ว่าง');
      }
    }
    return { ok: reasons.size === 0, span: true, reasons: [...reasons] };
  }

  /** หาคาบที่ชนกันทั้งหมด */
  function findConflicts(state) {
    const idx = indexState(state);
    const occ = buildOccupancy(state, idx);
    const byPlacement = new Map();
    const list = new Map();
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
        if (keys.length > 1) add(keys, resourceName(rk, idx) + ' ชนกัน', day, p, rk);
        if (un && un.has(ck)) add(keys, resourceName(rk, idx) + ' ไม่ว่างในคาบนี้', day, p, rk);
      }
    }
    const items = [...list.values()].map((x) => ({ ...x, keys: [...x.keys], periods: x.periods.sort((a, b) => a - b) }));
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
          : { code: a.title || 'กิจกรรม', name: '', t: '', p: '', n: '', h: 0, isSubject: false });
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
    buildOccupancy,
    findConflicts,
    teacherSummary,
    autoSchedule,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
  else root.TT = TT;
})(typeof window !== 'undefined' ? window : globalThis);
