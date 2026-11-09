/* 月報表（對應桌面版 Tab 5） */
(function () {
  "use strict";
  const C = window.Core, U = window.UI, { h, clear, msg } = U, X = U.COLORS, { EMP_TYPE_LABEL, EMP_TYPE_KEY, DAYTYPE_LABEL, WEEKDAY_LABELS } = C;
  const hrFmt = (v) => `${C.hr(v)}hr`;

  function drawHbar(el, items) {
    clear(el);
    if (!items.length) { el.append(h("div", { class: "hb-e", text: "本月無資料" })); return; }
    const max = Math.max(...items.map((x) => x[1])) || 1;
    for (const [lbl, val, color] of items) {
      el.append(h("div", { class: "hb-r" }, h("div", { class: "hb-l", text: lbl, title: lbl }), h("div", { class: "hb-t" }, h("i", { style: { width: (val / max) * 100 + "%", background: color } })), h("div", { class: "hb-v", text: hrFmt(val) })));
    }
  }
  function drawVbar(el, items) {
    clear(el);
    el._items = items;
    const width = el.clientWidth, height = el.clientHeight;
    if (!items.length || !items.some((x) => x[1] > 0)) { el.append(h("div", { class: "hb-e", text: "本月無資料" })); return; }
    if (width < 10) return;
    const NS = "http://www.w3.org/2000/svg";
    const s = (tag, a, text) => { const n = document.createElementNS(NS, tag); for (const k in a) n.setAttribute(k, a[k]); if (text !== undefined) n.textContent = text; return n; };
    const svg = s("svg", { viewBox: `0 0 ${width} ${height}` });
    const max = Math.max(...items.map((x) => x[1])) || 1, padL = 44, padR = 10, padT = 22, padB = 22;
    const plotW = Math.max(20, width - padL - padR), plotH = Math.max(20, height - padT - padB), n = items.length, slot = plotW / n, barW = Math.max(3, slot * 0.64), base = padT + plotH;
    for (const f of [0, 0.5, 1]) {
      const y = base - plotH * f;
      svg.append(s("line", { x1: padL, x2: padL + plotW, y1: y, y2: y, stroke: "var(--border)" }), s("text", { x: padL - 4, y: y + 3, "text-anchor": "end", fill: "var(--sub)", "font-size": 9 }, hrFmt(max * f)));
    }
    const every = slot >= 18 ? 1 : slot >= 9 ? 2 : 5;
    const tip = h("div", { class: "vb-tip", style: { display: "none" } });
    items.forEach(([lbl, val, color, tt], i) => {
      const mid = padL + slot * i + slot / 2;
      if (val > 0) {
        const top = base - (val / max) * plotH;
        const r = s("rect", { x: mid - barW / 2, y: top, width: barW, height: base - top, fill: color });
        const show = () => {
          tip.textContent = tt;
          tip.style.display = "";
          const half = tip.offsetWidth / 2;
          tip.style.left = Math.min(Math.max(mid, padL + half + 4), width - half - 4) + "px";
          tip.style.top = Math.max(top - 4, tip.offsetHeight + 2) + "px";
        };
        r.addEventListener("pointerenter", show);
        r.addEventListener("pointerdown", show);
        r.addEventListener("pointerleave", () => { tip.style.display = "none"; });
        svg.append(r);
      }
      if (i % every === 0 || i === n - 1) svg.append(s("text", { x: mid, y: base + 14, "text-anchor": "middle", fill: "var(--sub)", "font-size": 9 }, lbl));
    });
    const nz = items.filter((x) => x[1] > 0).map((x) => x[1]), avg = nz.reduce((a, b) => a + b, 0) / nz.length, y = base - (avg / max) * plotH;
    svg.append(s("line", { x1: padL, x2: padL + plotW, y1: y, y2: y, stroke: X.gold, "stroke-dasharray": "4 3" }), s("text", { x: padL + plotW, y: y - 3, "text-anchor": "end", fill: X.gold, "font-size": 9, "font-weight": 700 }, `平均 ${hrFmt(avg)}`));
    el.append(svg, tip);
  }

  Object.assign(window.App.prototype, {
    buildReportTab() {
      const t = this.tabs["📊 月報表"];
      this.reportMonth = new U.OptionMenu([], () => this.renderReport());
      this.kpis = h("div", { class: "kpis" });
      this.violationAlert = h("div", { class: "alert", style: { display: "none" } });
      this.otChart = h("div", { class: "hb" });
      this.daytypeChart = h("div", { class: "hb" });
      this.dailyChart = h("div", { class: "vb" });
      this.dailyPeak = h("span", { class: "sub", style: { fontSize: "11px" } });
      new ResizeObserver(() => { if (this.dailyChart._items) drawVbar(this.dailyChart, this.dailyChart._items); }).observe(this.dailyChart);
      this.reportTypeFilter = new U.OptionMenu(["全部類型"].concat(C.EMP_TYPE_OPTIONS), () => this.applyReportTypeFilter());
      this.reportSort = "ot"; this.reportReverse = true;
      const s = true, onSort = (c) => this.onReportSort(c);
      this.reportTree = new U.Table([{ key: "name", title: "員工", width: 80, sort: s }, { key: "type", title: "類型", width: 80, sort: s }, { key: "days", title: "出勤天數", width: 70, sort: s }, { key: "ot", title: "加班時數", width: 70, sort: s }, { key: "leaveshort", title: "缺勤時數", width: 70, sort: s }], { onSort, maxHeight: 300 });
      this.pendingTree = new U.Table([{ key: "emp", title: "員工", width: 70 }, { key: "text", title: "送單內容", width: 300, left: true, ell: true }, { key: "file", title: "送出後登記為", width: 180 }], {
        multi: true, onDouble: () => this.markPendingSubmitted(), onEnter: () => this.markPendingSubmitted(), height: 245,
      });
      this.pendingMap = new Map();
      this.complianceBox = h("div", { class: "comp" });
      const stats = U.card(h("div", { class: "row", style: { padding: "12px 16px 6px", justifyContent: "space-between" } }, h("div", { class: "sec", style: { margin: 0 } }, h("div", { class: "badge", text: "🧾" }), h("div", {}, h("div", { class: "sec-t", text: "各員工加班／缺勤統計" }), h("div", { class: "sec-s", text: "點擊欄位標題可排序" }))),
        h("div", { style: { width: "120px" } }, this.reportTypeFilter)), this.reportTree);
      const pending = h("div", { style: { minWidth: 0 } },
        h("div", { class: "row mb4" }, U.ghost("⬇ 匯出 CSV", () => this.exportCsv()), U.ghost("⬇ 匯出 Excel", () => this.exportExcel()), U.primary("📋 複製待辦通知到LINE", () => this.openLineWindow(this.L.buildLineMessage(this.reportMonth.get() || C.thisMonth())))),
        U.card(h("div", { style: { padding: "12px 16px 0" } }, U.sectionHeader("⏳", "待處理事項", "選取後按「已送出」（或雙擊／Enter）登記到「特休/補休」，可 Ctrl／Shift 多選"),
          h("div", { class: "row mb8" }, U.primary("✅ 選取已送出  Enter", () => this.markPendingSubmitted()), U.ghost("✅ 全部已送出", () => this.markPendingSubmitted(true)))), this.pendingTree));
      t.append(
        U.card(h("div", { class: "pad" }, h("div", { class: "row", style: { gap: "16px" } }, h("div", { class: "sec", style: { margin: 0 } }, h("div", { class: "badge", text: "📊" }), h("div", {}, h("div", { class: "sec-t", text: "月報表" }), h("div", { class: "sec-s", text: "選擇月份查看統計數據與勞基法遵循檢查" }))), h("div", { style: { width: "140px" } }, this.reportMonth)), this.kpis, this.violationAlert)),
        U.card(h("div", { style: { padding: "12px 16px 0" } }, U.sectionHeader("📈", "圖表分析", "員工加班時數排行／日別類型工時／每日工時分佈")),
          h("div", { class: "charts" },
            h("div", { class: "chart-w" }, h("div", { class: "sub mb4", text: "🏆 員工加班時數排行" }), this.otChart), h("div", { class: "chart-w" }, h("div", { class: "sub mb4", text: "📅 日別類型工時分布" }), this.daytypeChart),
            h("div", { class: "chart-w wide" }, h("div", { class: "chart-t" }, h("span", { class: "sub", text: "📆 每日工時分佈（全公司）" }), this.dailyPeak), this.dailyChart))),
        h("div", { class: "pair" }, stats, pending),
        U.card(h("div", { style: { padding: "12px 16px 0" } }, U.sectionHeader("🛡️", "勞基法遵循檢查", "月加班上限／例假／班距／休息時間，依風險等級標示")), this.complianceBox));
    },
    refreshReportMonth() {
      const months = this.recordMonths(), cur = this.reportMonth.get();
      this.reportMonth.configure(months);
      this.reportMonth.set(months.includes(cur) ? cur : C.thisMonth());
    },
    renderReport() {
      if (!this.kpis) return;
      const month = this.reportMonth.get() || C.thisMonth(), S = this.L.computeMonthStats(month), set = this.db.settings;
      const cap = set.otMonthlyCap, capExt = set.otMonthlyCapExtended, nOver = S.overtimeViolations.length, nCap = S.otCapViolations.length, rest = S.weeklyRestRate;
      const rateColor = (r, good, warn) => (r === null ? X.sub : r >= good ? X.green : r >= warn ? X.gold : X.red);
      const cards = [
        [nOver ? "🔴" : "✅", "超時違規次數", nOver, nOver ? X.red : X.green, nOver > 0, "單日工時上限 12hr"],
        [nCap ? "🔴" : "✅", "違規加班次數", nCap, nCap ? X.red : X.green, nCap > 0, `月上限 ${C.g(cap)}/${C.g(capExt)}hr・3個月138hr`],
        ["⏱", "當月加班總時數", hrFmt(S.totalOtHours), X.tealL, false, "加班費預算參考"], ["🟠", "需加班單筆數", S.otCount, X.orange, false, ""],
        ["📈", "出勤正常率", `${C.pct0(S.attendanceRate)}%`, rateColor(S.totalRecords ? S.attendanceRate : null, 90, 75), false, "無需加班／請假單"],
        ["🗓", "週休使用率", rest === null ? "-" : `${C.pct0(rest)}%`, rateColor(rest, 100, 90), false, rest === null ? "本月尚無完整週" : `一例一休・${S.weeklyRestWeeks}週`],
        ["🌴", "特休使用率(本期)", `${C.pct0(S.annualRate)}%`, X.gold, false, "正職本期特休消化"], ["🔄", "補休使用率", `${C.pct0(S.compRate)}%`, X.teal, false, ""],
        ["🔴", "需請假單筆數", S.leaveCount, X.red, false, ""], ["🟢", "正常出勤筆數", S.normalCount, X.green, false, ""], ["⏲", "平均每筆工時", hrFmt(S.avgHours), X.tealL, false, ""], ["👥", "本月出勤人數", S.headcount, X.purple, false, ""],
      ];
      clear(this.kpis).append(...cards.map(([icon, lbl, val, accent, alarm, hint]) => h("div", { class: "kpi" + (alarm ? " alarm" : "") }, h("div", { class: "accent", style: { background: accent } }), h("div", { class: "v", text: `${icon} ${val}`, style: { color: accent } }), h("div", { class: "n", text: lbl }), h("div", { class: "h", text: hint || " " }))));
      const lines = [];
      S.overtimeViolations.slice(0, 5).forEach(([d, name, hrs]) => lines.push(`🔴 超時｜${d.slice(5).replace("-", "/")} ${name} 當日工時 ${hrFmt(hrs)}（逾12hr）`));
      if (nOver > 5) lines.push(`　…另有 ${nOver - 5} 筆超時紀錄`);
      S.otCapViolations.slice(0, 5).forEach(([name, level, text]) => lines.push(`${level === "high" ? "🔴" : "🟠"} 加班｜${name} ${text}`));
      if (nCap > 5) lines.push(`　…另有 ${nCap - 5} 筆違規加班`);
      this.violationAlert.style.display = lines.length ? "" : "none";
      this.violationAlert.textContent = "🚨 勞基法違規警示：以下項目可能於勞檢時遭裁罰，請盡速調整排班或補正\n" + lines.join("\n");

      const ranked = Array.from(S.perEmp.values()).sort((a, b) => b.otHours - a.otHours).filter((p) => p.otHours > 0).slice(0, 8);
      drawHbar(this.otChart, ranked.map((p) => [p.name, p.otHours, p.otHours > cap ? X.orange : X.teal]));
      const dc = { weekday: X.teal, restday: X.orange, holiday: X.gold, mandatory: X.red, typhoon: X.purple };
      drawHbar(this.daytypeChart, Object.keys(dc).filter((k) => S.daytypeHours[k] > 0).map((k) => [DAYTYPE_LABEL[k], S.daytypeHours[k], dc[k]]));

      const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
      const peaks = Object.entries(S.dailyHours).sort((a, b) => b[1] - a[1]).slice(0, 3).filter((x) => x[1] > 0).map((x) => x[0]);
      const items = [];
      for (let day = 1; day <= C.monthDays(y, m); day++) {
        const d = C.mkDate(y, m, day), ds = C.iso(d), hrs = S.dailyHours[ds] || 0;
        items.push([String(day), hrs, peaks.includes(ds) ? X.orange : C.weekday(d) >= 5 ? X.purple : X.teal, `${m}/${day}（${WEEKDAY_LABELS[C.weekday(d)]}）總工時 ${hrFmt(hrs)}・${S.dailyHeads[ds] || 0}人`]);
      }
      drawVbar(this.dailyChart, items);
      this.dailyPeak.textContent = peaks.length ? `🟧 高峰日：${peaks.map((d) => `${Number(d.slice(8))}日`).join("、")}　🟪 週末　滑鼠移到直條可看明細` : "";

      this.reportRowsAll = Array.from(S.perEmp.values());
      this.applyReportTypeFilter();

      const pending = this.L.getPendingForMonth(month);
      this.pendingMap = new Map();
      if (!pending.length) this.pendingTree.render([{ key: "_none", noSelect: true, cells: ["", "✅ 本月無待處理的加班單／請假單", ""] }]);
      else {
        this.pendingTree.render(pending.map(([rec, emp, r]) => {
          this.pendingMap.set(rec.id, rec);
          const plan = this.L.pendingFilePlan(rec);
          return { key: rec.id, cells: [emp.name, `${r.flag === "ot" ? "🟠" : "🔴"} ${this.L.recordNoticeText(rec, true)}`, plan ? `${plan[2]} ${hrFmt(plan[1])}` : "-"] };
        }));
      }
      this.renderCompliance(month);
    },
    applyReportTypeFilter() {
      const sel = this.reportTypeFilter.get();
      this.reportRows = sel === "全部類型" ? this.reportRowsAll.slice() : this.reportRowsAll.filter((p) => p.type === EMP_TYPE_KEY[sel]);
      this.populateReportTree();
    },
    onReportSort(col) {
      if (this.reportSort === col) this.reportReverse = !this.reportReverse;
      else { this.reportSort = col; this.reportReverse = ["days", "ot", "leaveshort"].includes(col); }
      this.populateReportTree();
    },
    populateReportTree() {
      const keys = { name: (p) => p.name, type: (p) => EMP_TYPE_LABEL[p.type], days: (p) => p.days, ot: (p) => p.otHours, leaveshort: (p) => p.leaveShort };
      const k = keys[this.reportSort], dir = this.reportReverse ? -1 : 1;
      const rows = this.reportRows.slice().sort((a, b) => dir * (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0));
      const arrow = this.reportReverse ? " ▼" : " ▲", heads = { name: "員工", type: "類型", days: "出勤天數", ot: "加班時數", leaveshort: "缺勤時數" };
      for (const c in heads) this.reportTree.setHeader(c, heads[c] + (c === this.reportSort ? arrow : ""));
      this.reportTree.render(rows.map((p, i) => ({ key: String(i), cells: [p.name, EMP_TYPE_LABEL[p.type], p.days, C.hr(p.otHours), p.leaveShort > 0 ? C.hr(p.leaveShort) : "-"] })));
    },
    renderCompliance(month) {
      const issues = this.L.computeComplianceIssues(month), box = clear(this.complianceBox);
      if (!issues.length) { box.textContent = "✅ 本月未偵測到明顯違規項目，勞基法遵循狀況良好。"; return; }
      const high = issues.filter((i) => i[1] === "high").length;
      box.append(`🔴 高風險 ${high} 項　🟠 中風險 ${issues.length - high} 項\n\n`);
      for (const [name, level, text] of issues) box.append(h("span", { class: level, text: `${level === "high" ? "🔴" : "🟠"} 【${name}】${text}\n` }));
    },
    async markPendingSubmitted(all) {
      const ids = all ? Array.from(this.pendingMap.keys()) : this.pendingTree.selected().filter((i) => this.pendingMap.has(i));
      if (!ids.length) { await msg.info("提醒", "請先點選要標記為已送出的項目（可 Ctrl／Shift 多選）"); return; }
      const plans = [];
      for (const id of ids) {
        const rec = this.pendingMap.get(id), plan = this.L.pendingFilePlan(rec), emp = this.L.findEmp(rec.empId);
        if (plan && emp) plans.push([rec, emp, plan]);
      }
      if (!plans.length) return;
      const need = new Map();
      for (const [rec, emp, [type, hours]] of plans) {
        if (type !== "comp_use") continue;
        const k = emp.id + "|" + C.monthKey(rec.date);
        need.set(k, (need.get(k) || 0) + hours);
      }
      const short = [];
      for (const [k, hrs] of need) {
        const [empId, mon] = k.split("|"), remain = C.compLeaveBalance(this.db, empId, mon).remaining;
        if (hrs > remain) short.push(`${this.L.findEmp(empId).name} ${Number(mon.slice(5, 7))}月（需 ${hrFmt(hrs)}，剩 ${hrFmt(remain)}）`);
      }
      let text = `將以下 ${plans.length} 筆標記為已送出，並登記到「特休/補休」：\n\n` + plans.slice(0, 12).map(([rec, emp, [, hours, label]]) => `・${emp.name} ${C.fmtMd(C.parseDate(rec.date))}　${label} ${hrFmt(hours)}`).join("\n") + (plans.length > 12 ? `\n…另 ${plans.length - 12} 筆` : "");
      if (short.length) text += "\n\n⚠ 補休餘額不足：\n" + short.join("\n");
      if (!(await msg.ask("確認已送出", text))) return;
      for (const [rec, emp, [type, hours]] of plans) {
        this.db.leaveLedger.push({ id: C.newId(), empId: emp.id, date: rec.date, type, hours, note: `由待處理事項登記：${this.L.recordNoticeText(rec, true)}` });
      }
      this.persist();
      this.renderReport(); this.renderCompCard(); this.renderLeaveLedger();
    },
    async exportCsv() {
      const month = this.reportMonth.get(), rows = this.L.csvRows(month);
      if (!this.db.records.some((r) => C.monthKey(r.date) === month)) { await msg.info("提醒", "本月無資料可匯出"); return; }
      const esc = (v) => { const s = String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const name = `出勤報表_${month}.csv`;
      U.download(name, "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n", "text/csv;charset=utf-8");
      await msg.info("完成", `已匯出：${name}`);
    },
    async exportExcel() {
      const month = this.reportMonth.get();
      if (!this.db.records.some((r) => C.monthKey(r.date) === month)) { await msg.info("提醒", "本月無資料可匯出"); return; }
      try {
        const blob = await window.Excel.build(this.L, month);
        const name = `出勤報表_${month}.xlsx`;
        U.download(name, blob);
        await msg.info("完成", `已匯出：${name}`);
      } catch (e) { await msg.error("匯出失敗", String(e.message || e)); }
    },
  });
})();
