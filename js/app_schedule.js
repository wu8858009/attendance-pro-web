/* 排班班表（對應桌面版 Tab 3b：週班表、本週上班名單、排班視窗、批量休假、班表照片匯入） */
(function () {
  "use strict";
  const C = window.Core, U = window.UI, { h, clear, msg } = U, X = U.COLORS, { Logic, EMP_TYPE_LABEL, WEEKDAY_LABELS } = C;

  Object.assign(window.App.prototype, {
    buildScheduleTab() {
      const t = this.tabs["🗓️ 排班班表"];
      this.scheduleWeekStart = C.weekStart(C.today());
      this.weekLabel = h("span", { style: { font: "700 14px var(--font)", padding: "0 6px" } });
      const legend = h("div", { class: "legend" }, [["var(--teal)", "已排班"], ["var(--ghost)", "休假／指休／喪假／特休"], ["var(--surface)", "未排班"], ["var(--red)", "假日"], ["var(--teal-l)", "今天"]]
        .map(([c, s]) => h("span", { class: "sub" }, h("i", { style: { background: c } }), s)));
      this.rosterSummary = h("span", { class: "sub" });
      this.rosterGrid = h("div", { class: "roster" });
      this.scheduleStats = h("div", { class: "chips mb8", style: { padding: "0 16px" } });
      this.scheduleGrid = h("div", { class: "sg" });
      t.append(
        U.accentCard(X.teal, h("div", { class: "pad" },
          h("div", { class: "row mb8", style: { justifyContent: "space-between", alignItems: "flex-start" } },
            U.sectionHeader("🗓️", "員工排週班", "以週為單位安排員工班表，點擊下方格子會在原地彈出視窗新增或修改班別"),
            h("div", { style: { textAlign: "right" } },
              h("div", { class: "row", style: { justifyContent: "flex-end" } }, U.btn("blue", "📷 讀取照片  Ctrl+O", () => this.scheduleImportPhoto()), U.ghost("📋 貼上截圖  Ctrl+V", () => this.scheduleImportClipboard())),
              h("div", { class: "sub", text: "從班表照片／截圖自動排入本週班表", style: { marginTop: "4px" } }))),
          h("div", { class: "row", style: { gap: "8px 40px" } },
            h("div", { class: "row" }, U.ghost("‹ 上週", () => this.changeWeek(-1)), this.weekLabel, U.ghost("下週 ›", () => this.changeWeek(1)), U.ghost("本週", () => this.changeWeek(0, true))), legend))),
        U.accentCard(X.green, h("div", { class: "pad" }, h("div", { class: "row mb8" }, h("div", { class: "sec", style: { margin: 0 } }, h("div", { class: "badge", text: "👥" }), h("div", { class: "sec-t", text: "本週上班名單" })), this.rosterSummary), this.rosterGrid)),
        U.accentCard(X.gold, h("div", { style: { padding: "12px 16px 0" } }, U.sectionHeader("📅", "本週班表", "點擊格子可彈出視窗新增或修改班別；「－」代表尚未排班；姓名旁的▲▼可調整員工顯示順序；🌴 可勾選本週一～日中要排休的日子，批量設定")),
          this.scheduleStats, h("div", { class: "sg-wrap" }, this.scheduleGrid)));
      this.updateWeekLabel();
    },
    updateWeekLabel() {
      const s = this.scheduleWeekStart;
      this.weekLabel.textContent = `${C.fmtYmd(s)} ～ ${C.fmtYmd(C.addDays(s, 6))}`;
      this.renderScheduleGrid();
    },
    changeWeek(delta, reset) {
      this.scheduleWeekStart = reset ? C.weekStart(C.today()) : C.addDays(this.scheduleWeekStart, 7 * delta);
      this.closeShiftPopup();
      this.updateWeekLabel();
    },
    ensureCalendarYear(year) {
      const key = String(year);
      if (this.calendar[key] || this.calFetching.has(year)) return;
      this.calFetching.add(year);
      fetch(`https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`).then((r) => (r.ok ? r.json() : null)).then((raw) => {
        if (!raw) return;
        const m = {};
        raw.forEach((it) => { m[it.date] = it; });
        this.calendar[key] = m;
        try {
          const saved = JSON.parse(localStorage.getItem("att_calendar") || "{}");
          saved[key] = m;
          localStorage.setItem("att_calendar", JSON.stringify(saved));
        } catch (_e) { /* 只是快取 */ }
        this.renderScheduleGrid();
      }).catch(() => {}).finally(() => this.calFetching.delete(year));
    },
    isRestday(d) {      // [是否休息日, 是否有官方行事曆佐證]
      const y = this.calendar[String(C.yearOf(d))];
      if (!y) { this.ensureCalendarYear(C.yearOf(d)); return [C.weekday(d) >= 5, false]; }
      const rec = y[C.calKey(d)];
      if (!rec) return [C.weekday(d) >= 5, false];
      return [!!rec.isHoliday, true];
    },
    renderWeekRoster() {
      const start = this.scheduleWeekStart, dates = [...Array(7).keys()].map((i) => C.addDays(start, i));
      const now = new Date(), today = C.todayIso(), nowMin = now.getHours() * 60 + now.getMinutes();
      const emps = this.L.scheduledEmployees().filter((e) => this.L.empShownInWeek(e, start));
      const shifts = new Map();
      const a0 = C.iso(dates[0]), a6 = C.iso(dates[6]);
      this.db.shiftSchedule.forEach((s) => { if (a0 <= s.date && s.date <= a6) shifts.set(s.empId + "|" + s.date, s); });
      const minutes = (t) => { const [hh, mm] = (t || "0:0").split(":"); return +hh * 60 + +mm; };
      const short = (t) => { const [hh, mm] = t.split(":"); return mm === "00" ? String(+hh) : `${+hh}:${mm}`; };
      let totalWork = 0, totalOff = 0;
      const cols = dates.map((d, i) => {
        const ds = C.iso(d), working = [], off = [];
        for (const e of emps) {
          const s = shifts.get(e.id + "|" + ds);
          if (!s) continue;
          if (s.isOff) { const t = s.offType || "休假"; off.push([t === "休假" ? e.name : `${e.name}(${t})`, e.id]); continue; }
          const segs = [];
          for (const seg of s.segments || []) {
            if (seg.in && seg.out) { const a = minutes(seg.in), b = minutes(seg.out); segs.push([a, b <= a ? b + 1440 : b, `${short(seg.in)}-${short(seg.out)}`]); }
          }
          if (!segs.length) continue;
          segs.sort((x, y) => x[0] - y[0] || x[1] - y[1] || C.cmp(x[2], y[2]));
          working.push([segs[0][0], e.name, segs.map((x) => x[2]).join("、"), ds === today && segs.some(([a, b]) => a <= nowMin && nowMin < b), e.id]);
        }
        working.sort((x, y) => x[0] - y[0] || C.cmp(x[1], y[1]));
        totalWork += working.length; totalOff += off.length;
        const holiday = C.taiwanHolidayLabel(this.calendar, d), [rest, confirmed] = this.isRestday(d);
        const color = ds === today ? X.tealL : rest ? (confirmed ? X.red : "#38bdf8") : holiday === "補班" ? X.orange : "var(--text)";
        const body = h("div", { class: "roster-b", style: { color: working.length ? "var(--text)" : "var(--sub)" } });
        if (!working.length) body.append("（無人上班）");
        working.forEach(([, name, times, on, id], n) => {
          if (n) body.append("\n");
          if (on) body.append("● ");
          body.append(h("span", { class: "emp", text: name, onclick: () => this.jumpToRow(id) }), `  ${times}`);
        });
        const offEl = h("div", { class: "roster-o" });
        off.forEach(([lbl, id], n) => offEl.append(n === 0 ? "休：" : "、", h("span", { class: "emp", text: lbl, onclick: () => this.jumpToRow(id) })));
        return h("div", { class: "roster-c" + (ds === today ? " today" : "") },
          h("div", { class: "roster-h", style: { color }, text: `${WEEKDAY_LABELS[i]}  ${C.fmtMd(d)}\n${working.length} 人` + (holiday ? `　${holiday}` : "") }), body, offEl);
      });
      clear(this.rosterGrid).append(...cols);
      const inWeek = a0 <= today && today <= a6 ? "　·　● 目前在班" : "";
      this.rosterSummary.textContent = `${C.fmtMd(dates[0])} ～ ${C.fmtMd(dates[6])}　·　上班共 ${totalWork} 人次　·　休假 ${totalOff} 人次${inWeek}`;
    },
    jumpToRow(empId) {
      const row = (this.scheduleRows || {})[empId];
      if (!row) return;
      row.name.scrollIntoView({ block: "center", behavior: "smooth" });
      if (this.hlOff) this.hlOff();
      row.name.classList.add("hl");
      row.cells.forEach((c) => c.classList.add("hl"));
      const off = () => { row.name.classList.remove("hl"); row.cells.forEach((c) => c.classList.remove("hl")); clearTimeout(job); this.hlOff = null; };
      const job = setTimeout(off, 1800);
      this.hlOff = off;
    },
    cellHeight() { return Math.round(22 + Number(this.db.settings.scheduleCellFontSize || 10) * 3.6); },
    cellFont(n) {
      const base = Number(this.db.settings.scheduleCellFontSize || 10);
      return n <= 2 ? base : n <= 4 ? Math.max(6, base - 1) : Math.max(6, base - 2);
    },
    renderScheduleGrid() {
      if (!this.scheduleGrid) return;
      this.renderWeekRoster();
      const start = this.scheduleWeekStart, dates = [...Array(7).keys()].map((i) => C.addDays(start, i)), today = C.todayIso();
      const labels = dates.map((d) => C.taiwanHolidayLabel(this.calendar, d)), hasLabel = labels.some(Boolean);
      const grid = document.createDocumentFragment();
      grid.append(h("div", {}));
      dates.forEach((d, i) => {
        const [rest, confirmed] = this.isRestday(d);
        let bg = "transparent", color = "var(--sub)";
        if (C.iso(d) === today) { bg = X.teal; color = "#04241f"; }
        else if (rest) color = confirmed ? X.red : "#38bdf8";
        else if (labels[i] === "補班") color = X.orange;
        grid.append(h("div", { class: "sg-h", style: { background: bg, color }, text: `${WEEKDAY_LABELS[i]}\n${C.fmtMd(d)}` + (hasLabel ? `\n${labels[i] || " "}` : "") }));
      });
      const employees = this.L.scheduledEmployees().filter((e) => this.L.empShownInWeek(e, start));
      const byKey = new Map(this.db.shiftSchedule.slice().reverse().map((s) => [s.empId + "|" + s.date, s]));
      this.renderScheduleStats(employees, dates, byKey);
      this.scheduleRows = {};
      if (!employees.length) grid.append(h("div", { class: "sub", style: { gridColumn: "1 / -1", padding: "10px 0" }, text: "尚無在職員工可排班（請至「員工設定」新增或將員工設為在職中）" }));
      const height = this.cellHeight();
      employees.forEach((emp, r) => {
        const name = h("div", { class: "sg-n" },
          h("div", { class: "ord" }, h("button", { text: "▲", type: "button", disabled: r === 0, onclick: () => this.moveEmployeeOrder(emp.id, -1, true) }), h("button", { text: "▼", type: "button", disabled: r === employees.length - 1, onclick: () => this.moveEmployeeOrder(emp.id, 1, true) })),
          h("span", { class: "nm", text: emp.name }), h("button", { class: "off-b", text: "🌴", type: "button", onclick: () => this.openBatchOff(emp.id) }));
        grid.append(name);
        const cells = dates.map((d) => {
          const shift = byKey.get(emp.id + "|" + C.iso(d));
          let text = "－", bg = "var(--surface)", color = "var(--sub)", n = 1;
          if (shift && shift.isOff) { text = shift.offType || "休假"; bg = "var(--ghost)"; color = "var(--text)"; }
          else if (shift) {
            const lines = [];
            for (const seg of shift.segments || []) {
              if (!seg.in || !seg.out) continue;
              if (seg.note) lines.push(seg.note);
              lines.push(`${seg.in}-${seg.out}`);
            }
            text = lines.length ? lines.join("\n") : "－";
            n = Math.max(1, lines.length);
            bg = X.teal; color = "#04241f";
          }
          const cell = h("button", { class: "cell", type: "button", text, style: { background: bg, color, height: height + "px", fontSize: this.cellFont(n) + "px" }, onclick: () => this.openShiftPopup(emp.id, d) });
          grid.append(cell);
          return cell;
        });
        this.scheduleRows[emp.id] = { name, cells };
      });
      clear(this.scheduleGrid).append(grid);
    },
    renderScheduleStats(employees, dates, byKey) {
      let sch = 0, off = 0;
      for (const e of employees) for (const d of dates) {
        const s = byKey.get(e.id + "|" + C.iso(d));
        if (s && s.isOff) off++; else if (s) sch++;
      }
      clear(this.scheduleStats).append(U.chip("👥", employees.length, "本週排班人數", X.tealL).el, U.chip("🟦", sch, "已排班格數", X.teal).el, U.chip("🌴", off, "休假／指休格數", X.gold).el,
        U.chip("➖", Math.max(0, employees.length * 7 - sch - off), "尚未排班格數", X.sub).el);
    },

    // ---- 排班視窗 ----
    openShiftPopup(empId, d) {
      const emp = this.L.findEmp(empId);
      if (!emp) return;
      this.closeShiftPopup();
      const shift = this.L.findShift(empId, C.iso(d));
      const P = this.popup = { empId, dateIso: C.iso(d), editingId: shift ? shift.id : null, segments: [] };
      const exOff = shift && shift.isOff, exType = shift ? shift.offType : null;
      const mk = (type, text, key) => {
        const i = h("input", { type: "checkbox", checked: !!exOff && exType === type, onchange: () => this.onOffToggle(key) });
        P[key] = i;
        return h("label", { class: "check" }, i, text);
      };
      P.annual = null;
      const offRow = h("div", { class: "row", style: { background: "var(--row-alt)", borderRadius: "8px", padding: "5px 8px", gap: "6px 16px" } },
        mk("休假", "休假（不排班）", "leave"), mk("指休", "指休（不排班）", "designated"), emp.type === "fulltime" ? mk("特休", "特休（不排班）", "annual") : null, mk("喪假", "喪假（不排班）", "bereavement"));
      P.segFrame = h("div", {});
      P.addBtn = U.ghost("➕ 新增時段（最多3段）", () => { if (P.segments.length < 3) this.addShiftSeg(); });
      P.note = U.input("例如：支援門市", { value: (shift && shift.note) || "" });
      const panel = h("div", { class: "dlg card-bg panel" }, h("div", { class: "accent", style: { background: X.teal } }), h("div", { style: { padding: "10px 12px" } },
        U.sectionHeader("🗓️", emp.name, `${C.fmtYmd(d)}（${WEEKDAY_LABELS[C.weekday(d)]}）`), h("div", { class: "mb8" }, offRow), P.segFrame, h("div", { class: "mb8" }, P.addBtn), h("div", { class: "divider" }),
        U.label("備註(選填)"), h("div", { class: "mb8" }, P.note),
        h("div", { class: "row", style: { flexWrap: "nowrap", gap: "6px" } }, U.primary(shift ? "💾 儲存修改" : "➕ 新增班別", () => this.saveShift(), { class: "btn primary grow", style: { height: "32px" } }),
          shift ? U.danger("🗑 刪除", () => this.deleteShift(), { style: { height: "32px" } }) : null, U.ghost("✖", () => this.closeShiftPopup(), { style: { height: "32px" } }))));
      P.overlay = U.modal(panel, { clear: true, onOutside: () => this.closeShiftPopup() });
      if (shift) this.resetShiftSegs(shift.segments || []);
      else this.resetShiftSegs(this.anyOff() ? [] : [{ in: "09:00", out: "18:00" }]);
    },
    closeShiftPopup() { if (this.popup) { this.popup.overlay.remove(); this.popup = null; U.closePop(); } },
    offKeys() { return ["leave", "designated", "bereavement", "annual"]; },
    anyOff() { return this.offKeys().some((k) => this.popup[k] && this.popup[k].checked); },
    onOffToggle(which) {
      const P = this.popup;
      if (P[which] && P[which].checked) this.offKeys().forEach((k) => { if (k !== which && P[k]) P[k].checked = false; });
      if (this.anyOff()) this.resetShiftSegs([]);
      else if (!P.segments.length) this.resetShiftSegs([{ in: "09:00", out: "18:00" }]);
    },
    addShiftSeg(defIn = "09:00", defOut = "18:00", defNote = "", removable = true) {
      const P = this.popup, idx = P.segments.length;
      const fIn = new U.TimeDropdown(defIn), fOut = new U.TimeDropdown(defOut);
      const tags = new U.TagPicker(this.db.settings.shiftNoteTags, defNote ? defNote.split("、") : []);
      const seg = { in: fIn, out: fOut, tags };
      seg.row = h("div", { class: "seg-card" }, h("div", { text: `⏱ 時段 ${idx + 1}`, style: { font: "700 11px var(--font)", color: X.teal, marginBottom: "3px" } }),
        h("div", { style: { display: "grid", gridTemplateColumns: removable ? "1fr 1fr 32px" : "1fr 1fr", gap: "0 8px", alignItems: "end" } }, h("div", {}, U.sub("上班"), fIn), h("div", {}, U.sub("下班"), fOut), removable ? U.danger("✖", () => {
          seg.row.remove(); P.segments.splice(P.segments.indexOf(seg), 1); this.updateShiftAddBtn();
        }, { style: { padding: 0 } }) : null),
        h("div", { class: "sub", text: "備註標籤(可複選)", style: { margin: "6px 0 3px" } }), tags);
      P.segFrame.append(seg.row);
      P.segments.push(seg);
      this.updateShiftAddBtn();
    },
    updateShiftAddBtn() {
      const P = this.popup;
      P.addBtn.style.display = P.segments.length >= 3 || P.leave.checked || P.designated.checked ? "none" : "";
    },
    resetShiftSegs(segments) {
      const P = this.popup;
      clear(P.segFrame);
      P.segments = [];
      segments.forEach((s, i) => this.addShiftSeg(s.in || "09:00", s.out || "18:00", s.note || "", i > 0));
      this.updateShiftAddBtn();
    },
    async saveShift() {
      const P = this.popup, emp = this.L.findEmp(P.empId);
      if (!emp) { await msg.warn("提醒", "找不到員工資料，可能已被刪除"); this.closeShiftPopup(); this.renderScheduleGrid(); return; }
      const isAnnual = !!(P.annual && P.annual.checked), isBer = P.bereavement.checked, isDes = P.designated.checked, isOff = P.leave.checked || isDes || isBer || isAnnual;
      if (isAnnual && !emp.hireDate) { await msg.warn("提醒", "請先於「員工設定」填寫到職日，才能計算特休並設定特休"); return; }
      const offType = isAnnual ? "特休" : isBer ? "喪假" : isDes ? "指休" : isOff ? "休假" : null;
      const segments = isOff ? [] : P.segments.map((s) => ({ in: s.in.get().trim(), out: s.out.get().trim(), note: s.tags.getChecked().join("、") })).filter((s) => s.in && s.out);
      if (!isOff && !segments.length) { await msg.warn("提醒", "請至少填寫一段完整的上下班時間，或勾選休假／指休／喪假／特休"); return; }
      const note = P.note.value.trim();
      let shiftId;
      if (P.editingId) {
        const shift = this.db.shiftSchedule.find((s) => s.id === P.editingId);
        if (!shift) { await msg.warn("提醒", "找不到原始班別資料，可能已被刪除"); this.closeShiftPopup(); this.renderScheduleGrid(); return; }
        Object.assign(shift, { isOff, offType, segments, note });
        shiftId = shift.id;
      } else {
        shiftId = C.newId();
        this.db.shiftSchedule.push({ id: shiftId, empId: emp.id, date: P.dateIso, isOff, offType, segments, note });
      }
      this.L.syncAnnualLedgerForShift(shiftId, emp.id, P.dateIso, isAnnual);
      this.persist();
      this.closeShiftPopup();
      this.renderScheduleGrid(); this.renderAnnualCard(); this.renderLeaveLedger();
    },
    async deleteShift() {
      const P = this.popup;
      if (!P.editingId || !(await msg.ask("確認刪除", "確定刪除此班別？"))) return;
      this.L.syncAnnualLedgerForShift(P.editingId, P.empId, P.dateIso, false);
      this.db.shiftSchedule = this.db.shiftSchedule.filter((s) => s.id !== P.editingId);
      this.persist();
      this.closeShiftPopup();
      this.renderScheduleGrid(); this.renderAnnualCard(); this.renderLeaveLedger();
    },
    openBatchOff(empId) {
      const emp = this.L.findEmp(empId);
      if (!emp) return;
      this.closeShiftPopup();
      const week = [...Array(7).keys()].map((i) => C.addDays(this.scheduleWeekStart, i));
      const days = week.map((d) => [d, h("input", { type: "checkbox" })]);
      const types = ["休假", "指休", "喪假"].concat(emp.type === "fulltime" ? ["特休"] : []);
      const radios = types.map((t, i) => [t, h("input", { type: "radio", name: "offType", checked: i === 0 })]);
      let ov;
      const apply = async () => {
        const list = days.filter(([, c]) => c.checked).map(([d]) => d);
        if (!list.length) { await msg.warn("提醒", "請至少勾選一天"); return; }
        const offType = radios.find(([, r]) => r.checked)[0];
        if (offType === "特休" && !emp.hireDate) { await msg.warn("提醒", "請先於「員工設定」填寫到職日，才能計算特休並設定特休"); return; }
        const over = list.filter((d) => { const s = this.L.findShift(empId, C.iso(d)); return s && !s.isOff; }).length;
        if (over > 0 && !(await msg.ask("確認覆蓋", `勾選的日子中有 ${over} 天已排定上班班別，套用後將覆蓋為休假，是否繼續？`))) return;
        list.forEach((d) => this.L.setShiftOff(empId, C.iso(d), offType));
        this.persist();
        this.renderScheduleGrid(); this.renderAnnualCard(); this.renderLeaveLedger();
        ov.remove();
      };
      ov = U.modal(h("div", { class: "dlg", style: { width: "380px" } }, h("div", { class: "accent", style: { background: X.teal } }), h("div", { class: "pad" },
        U.sectionHeader("🌴", `${emp.name}　批量休假`, `勾選本週（${C.fmtMd(week[0])}～${C.fmtMd(week[6])}）要排休的日子`),
        h("div", { class: "mb4" }, days.map(([d, c]) => h("div", { style: { padding: "2px 0" } }, h("label", { class: "check" }, c, `週${WEEKDAY_LABELS[C.weekday(d)]}　${C.fmtMd(d)}`)))),
        h("div", { class: "row mb8" }, U.ghost("全選", () => days.forEach(([, c]) => { c.checked = true; })), U.ghost("全不選", () => days.forEach(([, c]) => { c.checked = false; }))),
        h("div", { class: "row mb8", style: { gap: "4px 16px" } }, radios.map(([t, r]) => h("label", { class: "check" }, r, t))),
        h("div", { class: "row", style: { flexWrap: "nowrap", gap: "6px" } }, U.primary("✅ 套用", apply, { class: "btn primary grow", style: { height: "32px" } }), U.ghost("✖ 取消", () => ov.remove(), { style: { height: "32px" } })))));
    },

    // ---- 從照片／剪貼簿讀取班表 ----
    async scheduleImportPhoto() {
      const f = await U.pickFile("image/*");
      if (f) this.scheduleReadImage(f);
    },
    async scheduleImportClipboard() {
      try {
        if (navigator.clipboard && navigator.clipboard.read) {
          for (const item of await navigator.clipboard.read()) {
            const type = item.types.find((x) => x.startsWith("image/"));
            if (type) { this.scheduleReadImage(await item.getType(type)); return; }
          }
          await msg.info("提示", "剪貼簿裡沒有圖片。\n請先截圖或複製班表圖片，再按這個按鈕。");
          return;
        }
      } catch (_e) { /* 瀏覽器不允許直接讀剪貼簿時，改提示用快捷鍵 */ }
      await msg.info("提示", "這個瀏覽器不允許按鈕直接讀取剪貼簿。\n請在排班班表頁按 Ctrl+V 貼上截圖。");
    },
    async scheduleReadImage(blob) {
      if (this.ocrBusy) return;
      this.ocrBusy = true;
      this.closeShiftPopup();
      const detail = h("div", { class: "sub", text: "正在偵測班表格線…", style: { margin: "6px 0 10px" } });
      const bar = h("i"), prog = h("div", { class: "prog ind" }, bar);
      const ov = U.modal(h("div", { class: "dlg card-bg", style: { width: "368px" } }, h("div", { class: "accent", style: { background: X.teal } }), h("div", { style: { padding: "18px 24px" } },
        h("div", { text: "📷 讀取班表照片", style: { font: "700 14px var(--font)" } }), detail, prog)));
      const glyphs = this.db.nameGlyphs, nameLib = {};
      for (const e of this.db.employees) if ((glyphs[e.id] || []).length) (nameLib[e.name] = nameLib[e.name] || []).push(...glyphs[e.id]);
      try {
        const res = await window.OCR.readSchedule(blob, (done, total, stage) => {
          if (stage) { detail.textContent = stage; return; }
          prog.classList.remove("ind");
          bar.style.width = (done / total) * 100 + "%";
          detail.textContent = `辨識班表內容中…  ${done} / ${total} 格`;
        }, { names: nameLib });
        ov.remove();
        await this.scheduleApplyPhoto(res);
      } catch (e) {
        ov.remove();
        await msg.error("讀取失敗", String(e.message || e));
      }
      this.ocrBusy = false;
    },
    ocrCellToSegments(text) {
      const m = /^(\d{1,2}(?:\.5)?)-(\d{1,2}(?:\.5)?)$/.exec(text || "");
      if (!m) return null;
      const hhmm = (v) => { v = parseFloat(v) % 24; return C.pad2(Math.floor(v)) + ":" + (v % 1 ? "30" : "00"); };
      return [{ in: hhmm(m[1]), out: hhmm(m[2]), note: "" }];
    },
    async scheduleApplyPhoto(res) {
      if (res.monday && C.iso(res.monday) !== C.iso(this.scheduleWeekStart)) { this.scheduleWeekStart = res.monday; this.updateWeekLabel(); }
      const monday = this.scheduleWeekStart, dates = [...Array(7).keys()].map((i) => C.addDays(monday, i));
      const employees = this.L.scheduledEmployees().filter((e) => this.L.empShownInWeek(e, monday));
      const names = res.names, pairs = [];
      names.forEach((nm, i) => { if (nm) employees.forEach((e) => pairs.push([C.seqRatio(nm, e.name), i, e.id])); });
      pairs.sort((a, b) => b[0] - a[0]);
      const rowEmp = new Map(), used = new Set(), sure = new Set();
      for (const [score, i, id] of pairs) {
        if (score < 0.6) break;
        if (!rowEmp.has(i) && !used.has(id)) { rowEmp.set(i, id); used.add(id); if (score === 1) sure.add(i); }
      }
      const revive = [];
      names.forEach((nm, i) => {
        if (rowEmp.has(i) || !nm) return;
        const emp = this.db.employees.find((e) => e.name === nm && !used.has(e.id) && e.isActive === false);
        if (emp) { revive.push(emp); rowEmp.set(i, emp.id); used.add(emp.id); sure.add(i); }
      });
      for (let round = 0; round < names.length; round++) {
        let best = null;
        names.forEach((nm, i) => {
          if (rowEmp.has(i) || !nm) return;
          const A = Array.from(nm);
          const cands = employees.filter((e) => !used.has(e.id) && Array.from(e.name).length === A.length)
            .map((e) => [Array.from(e.name).filter((ch, k) => ch === A[k]).length, e.id]).sort((a, b) => b[0] - a[0] || C.cmp(b[1], a[1]));
          if (cands.length && cands[0][0] >= 1 && (cands.length === 1 || cands[0][0] > cands[1][0]) && (!best || cands[0][0] > best[0])) best = [cands[0][0], i, cands[0][1]];
        });
        if (!best) break;
        rowEmp.set(best[1], best[2]);
        used.add(best[2]);
      }
      const newEmps = [], roles = res.roles || names.map(() => "");
      let nextOrder = Math.max(-1, ...this.db.employees.map((e) => ("scheduleOrder" in e ? e.scheduleOrder : -1))) + 1;
      const firstDay = (cells, workOnly) => {
        const work = dates.filter((d, k) => cells[k] && cells[k] !== "休" && cells[k] !== "?");
        const any = workOnly ? [] : dates.filter((d, k) => cells[k]);
        const pick = work.length ? work : any;
        return pick.length ? C.iso(pick[0]) : null;
      };
      names.forEach((nm, i) => {
        if (rowEmp.has(i) || !nm || !res.rows[i].some(Boolean)) return;
        const role = roles[i] || "", full = role.startsWith("正職") || role === "店長" || role === "副店長";
        const emp = { id: C.newId(), empNo: "", name: nm, type: full ? "fulltime" : "pt", normalHours: full ? 8 : "", hireDate: firstDay(res.rows[i]) || "", hireDateAuto: true, scheduleOrder: nextOrder++, isActive: true };
        newEmps.push(emp);
        rowEmp.set(i, emp.id);
        sure.add(i);
        used.add(emp.id);
      });
      const writes = [];
      let unsure = 0;
      for (const [i, id] of rowEmp) {
        dates.forEach((d, k) => {
          const text = res.rows[i][k];
          if (text === "?") unsure++;
          else if (text === "休" || this.ocrCellToSegments(text)) writes.push([id, C.iso(d), text]);
        });
      }
      if (!writes.length) {
        await msg.info("讀取完成", "照片裡沒有可以對應到員工的班別。\n讀到的姓名：" + (names.filter(Boolean).join("、") || "（無）"));
        return;
      }
      if (writes.some(([id, ds]) => this.L.findShift(id, ds))) {
        if (!(await msg.ask("覆蓋班表", `${C.fmtYmd(dates[0])} ～ ${C.fmtMd(dates[6])} 已有部分員工排班，\n要用照片讀到的內容覆蓋嗎？`))) return;
      }
      this.db.employees.push(...newEmps);
      revive.forEach((e) => Logic.markActive(e));
      for (const [id, ds, text] of writes) {
        if (text === "休") { this.L.setShiftOff(id, ds, "休假"); continue; }
        const segments = this.ocrCellToSegments(text), shift = this.L.findShift(id, ds);
        let sid;
        if (shift) { Object.assign(shift, { isOff: false, offType: null, segments }); sid = shift.id; }
        else { sid = C.newId(); this.db.shiftSchedule.push({ id: sid, empId: id, date: ds, isOff: false, offType: null, segments, note: "" }); }
        this.L.syncAnnualLedgerForShift(sid, id, ds, false);
      }
      const hireMoved = [];
      for (const [i, id] of rowEmp) {
        const emp = this.L.findEmp(id);
        if (emp && emp.hireDateAuto && !newEmps.includes(emp)) {
          const fd = firstDay(res.rows[i], true);
          if (fd && (!emp.hireDate || fd < emp.hireDate)) { emp.hireDate = fd; hireMoved.push(emp); }
        }
      }
      const glyphs = this.db.nameGlyphs;
      for (const i of sure) {
        const img = (res.nameImgs || [])[i], id = rowEmp.get(i);
        const lst = glyphs[id] || (glyphs[id] = []);
        if (img && !lst.includes(img)) { lst.push(img); lst.splice(0, Math.max(0, lst.length - 5)); }
      }
      const blank = new Set();
      names.forEach((nm, i) => { if (!nm && !res.rows[i].some(Boolean)) blank.add(i); });
      const prevStart = C.iso(C.addDays(monday, -7)), weekEnd = C.iso(dates[6]), monIso = C.iso(monday);
      const prevIds = new Set(this.db.shiftSchedule.filter((s) => prevStart <= s.date && s.date < monIso).map((s) => s.empId));
      const laterIds = new Set(this.db.shiftSchedule.filter((s) => s.date > weekEnd).map((s) => s.empId));
      const unreadable = names.map((_, i) => i).filter((i) => !rowEmp.has(i) && !blank.has(i));
      let resigned = [];
      if (!unreadable.length) {
        resigned = employees.filter((e) => prevIds.has(e.id) && !used.has(e.id) && !laterIds.has(e.id));
        for (const e of resigned) {
          const last = this.L.lastWorkDate(e.id, monIso) || "";
          this.L.markResigned(e, last > prevStart ? last : prevStart);
        }
      }
      this.persist();
      if (newEmps.length || revive.length || resigned.length || hireMoved.length) { this.refreshEmployeeCombos(); this.renderEmployees(); }
      this.renderScheduleGrid(); this.renderAnnualCard(); this.renderLeaveLedger();
      const lines = [`已讀取照片 ${res.rows.length - blank.size} 位人員，對應到 ${rowEmp.size} 位員工，寫入 ${writes.length} 格班表（${C.fmtMd(dates[0])} ～ ${C.fmtMd(dates[6])}）。`];
      const skipped = names.map((nm, i) => (!rowEmp.has(i) && !blank.has(i) ? nm || "（讀不出姓名）" : null)).filter(Boolean);
      if (newEmps.length) lines.push("\n已自動新增員工：" + newEmps.map((e) => `${e.name}（${EMP_TYPE_LABEL[e.type]}，到職 ${e.hireDate || "未知"}）`).join("、") + "\n（到職日＝班表第一天上班日，可到「員工設定」修改）");
      if (hireMoved.length) lines.push("\n到職日往前調整：" + hireMoved.map((e) => `${e.name} → ${e.hireDate}`).join("、"));
      if (revive.length) lines.push("\n已改回在職：" + revive.map((e) => e.name).join("、"));
      if (skipped.length) lines.push("\n照片中讀不出姓名、已略過：" + skipped.join("、"));
      if (resigned.length) lines.push("\n上週有排班、這週照片沒有，已設為離職：" + resigned.map((e) => e.name).join("、") + "\n（只是請長假的話，請到「員工設定」改回在職；之後照片再出現也會自動改回）");
      const missing = employees.filter((e) => !used.has(e.id) && !resigned.includes(e)).map((e) => e.name);
      if (missing.length) {
        lines.push("\n照片中沒有找到的員工：" + missing.join("、"));
        if (unreadable.length) lines.push("（照片有讀不出姓名的列，這次不自動設定離職）");
      }
      if (unsure) lines.push(`\n有 ${unsure} 格時間讀不出來，未寫入，請自行補上。`);
      await msg.info("讀取完成", lines.join("\n"));
    },
  });
})();
