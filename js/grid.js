/* สร้างตาราง วัน × คาบ เป็น HTML ใช้ร่วมกันระหว่างหน้าจัดตารางและหน้าพิมพ์ */
(function (root) {
  'use strict';
  const TT = root.TT;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** แยกก้อนที่คร่อมช่วงพัก (Block Course) เป็นหลายชิ้นตามช่วงคาบ */
  function splitBySegment(pers, item) {
    const pieces = [];
    let cur = null;
    for (let p = item.start; p < item.start + item.len; p++) {
      const seg = pers[p - 1].seg;
      if (!cur || cur.seg !== seg) {
        cur = { seg, start: p, len: 0, item };
        pieces.push(cur);
      }
      cur.len++;
    }
    return pieces;
  }

  /**
   * opts:
   *  state, items: [{ key, day, start, len, html, cls, title }]
   *  editable: ใส่ data-d / data-p ให้ช่องว่างเพื่อคลิก/ลากวาง
   *  unavailable: Set ของ "day|period" ที่ไม่ว่าง
   */
  function buildGrid(opts) {
    const s = opts.state.settings;
    const cols = s.columns;
    const pers = TT.periods(s);
    const perByCol = new Map(pers.map((p) => [p.colIndex, p]));
    const unav = opts.unavailable || new Set();

    // จัดชิ้นเป็นแถวย่อย (lane) ต่อวัน กรณีมีคาบซ้อนกันจะได้เห็นทั้งหมด
    const lanesByDay = s.days.map(() => []);
    const byDay = s.days.map(() => []);
    for (const it of opts.items) {
      if (it.day >= 0 && it.day < s.days.length && TT.canSpan(pers, it.start, it.len, true)) byDay[it.day].push(it);
    }
    byDay.forEach((items, d) => {
      items.sort((a, b) => a.start - b.start || b.len - a.len);
      const laneEnd = [];
      for (const it of items) {
        let l = laneEnd.findIndex((end) => end < it.start);
        if (l < 0) { l = laneEnd.length; laneEnd.push(0); }
        laneEnd[l] = it.start + it.len - 1;
        if (!lanesByDay[d][l]) lanesByDay[d][l] = [];
        for (const piece of splitBySegment(pers, it)) lanesByDay[d][l].push(piece);
      }
      if (!lanesByDay[d].length) lanesByDay[d].push([]);
    });
    const totalRows = lanesByDay.reduce((n, lanes) => n + lanes.length, 0);

    let html = '<table class="tt-grid' + (opts.editable ? ' editable' : '') + '"><thead><tr><th class="corner">เวลา</th>';
    for (const c of cols) html += '<th class="time' + (c.type === 'break' ? ' brk' : '') + '">' + esc(c.start) + ' - ' + esc(c.end) + '</th>';
    // แถว "วัน/คาบ" ต้องอยู่ใน tbody เดียวกับแถววัน เพื่อให้ช่วงพัก rowspan ลงไปครบทุกวัน
    html += '</tr></thead><tbody><tr><th class="corner">วัน/คาบ</th>';
    cols.forEach((c, ci) => {
      if (c.type === 'break') html += '<td class="break" rowspan="' + (totalRows + 1) + '"><span>' + esc(c.label) + '</span></td>';
      else html += '<th class="pno">' + perByCol.get(ci).no + '</th>';
    });
    html += '</tr>';

    s.days.forEach((dayName, d) => {
      const lanes = lanesByDay[d];
      lanes.forEach((pieces, l) => {
        html += '<tr class="' + (l === 0 ? 'day-first' : 'day-lane') + '">';
        if (l === 0) html += '<th class="day" rowspan="' + lanes.length + '">' + esc(dayName) + '</th>';
        const startAt = new Map(pieces.map((pc) => [pc.start, pc]));
        let skipUntil = 0;
        cols.forEach((c, ci) => {
          if (c.type === 'break') return;
          const p = perByCol.get(ci).no;
          if (p <= skipUntil) return;
          const pc = startAt.get(p);
          if (pc) {
            const it = pc.item;
            skipUntil = p + pc.len - 1;
            const attrs = opts.editable
              ? ' data-key="' + esc(it.key) + '" data-d="' + d + '" data-p="' + it.start + '" draggable="true"'
              : '';
            html += '<td class="blk ' + esc(it.cls || '') + '" colspan="' + pc.len + '"' + attrs +
              (it.title ? ' title="' + esc(it.title) + '"' : '') + '>' + it.html + '</td>';
          } else {
            const ck = TT.cellKey(d, p);
            const attrs = opts.editable ? ' data-d="' + d + '" data-p="' + p + '"' : '';
            html += '<td class="empty' + (unav.has(ck) ? ' unav' : '') + '"' + attrs + '></td>';
          }
        });
        html += '</tr>';
      });
    });
    html += '</tbody></table>';
    return html;
  }

  root.TTGrid = { buildGrid, esc };
})(typeof window !== 'undefined' ? window : globalThis);
