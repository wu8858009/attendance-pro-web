/* 特休/補休（對應桌面版 Tab 4） */
(function () {
  "use strict";
  const C = window.Core, U = window.UI, { h, clear, msg } = U, X = U.COLORS, { EMP_TYPE_LABEL, Logic } = C, empLabel = window.empLabel, num = window.numOf;
  const TYPE_LABEL = { annual_use: "🌴 特休使用", comp_earn: "➕ 補休取得", comp_use: "➖ 補休使用", bereavement_use: "🖤 喪假使用", ot_pay: "💰 加班費申請", typhoon_leave: "🌀 颱風假" };
  const TYPE_KEY = { "特休使用": "annual_use", "補休取得": "comp_earn", "補休使用": "comp_use", "喪假使用": "bereavement_use", "加班費申請": "ot_pay", "颱風假": "typhoon_leave" };

  Object.assign(window.App.prototype, {
    buildLeaveTab() {
      const t = this.tabs["🌴 特休/補休"];
      // 特休
      this.alEmp = new U.OptionMenu([], () => this.renderAnnualCard());
      this.annualStats = h("div", { class: "chips" });
      this.annualBar = h("i");
      this.annualLabel = h("div", { class: "sub", style: { margin: "2px 0 10px" } });
      this.alDate = new U.DateEntry();
      this.alDate.set(C.todayIso());
      this.alHours = new U.OptionMenu(["4", "8", "12", "16", "20", "24", "28", "32"]);
      this.alNote = U.input("例如：返鄉、個人事務");
      const al = U.card(h("div", { class: "pad" }, U.sectionHeader("🌴", "特休計算", "僅正職員工，每次請休以4小時為單位"),
        U.label("選擇正職員工"), h("div", { class: "mb8" }, this.alEmp), this.annualStats,
        h("div", { class: "prog", style: { height: "8px", borderRadius: "4px", marginTop: "10px" } }, this.annualBar), this.annualLabel, h("div", { class: "divider" }),
        U.sub("登記特休使用", { class: "lbl sub wr", style: { margin: "8px 0 4px" } }),
        h("div", { class: "grid3 mb8 wr" }, h("div", {}, U.label("日期"), this.alDate), h("div", {}, U.label("使用時數"), this.alHours), h("div", {}, U.label("備註(選填)"), this.alNote)),
        U.primary("🌴 登記特休使用", () => this.addAnnualUsage(), { class: "btn primary full wr" })));
      // 補休
      this.compMonth = null;
      this.clEmp = new U.OptionMenu([], () => { this.renderCompCard(); this.autofillCompEntry(true); });
      this.compMonthLabel = h("span", { style: { padding: "0 4px" } });
      this.compNext = U.btn("ghost", "▶", () => this.shiftCompMonth(1));
      this.compToday = U.btn("ghost", "回本月", () => this.shiftCompMonth(null));
      this.compStats = h("div", { class: "chips" });
      this.clType = new U.OptionMenu(["取得補休(加班換休)", "使用補休"], () => this.autofillCompEntry(true));
      this.clDate = new U.DateEntry(() => this.autofillCompEntry());
      this.clDate.set(C.todayIso());
      this.clDate.input.addEventListener("change", () => this.autofillCompEntry());
      this.clHint = h("div", { style: { fontSize: "11px", color: X.tealL, alignSelf: "center" } });
      const upd = () => this.updateCompHours();
      this.clStart = new U.TimeDropdown("09:00", upd);
      this.clEnd = new U.TimeDropdown("10:00", upd);
      this.clHours = U.input("", { disabled: true });
      this.clNote = U.input("例如：對應7/10加班2小時");
      const cl = U.card(h("div", { class: "pad" }, U.sectionHeader("➖", "補休管理", "取得與使用皆以0.5小時為單位，每月1日自動歸0"),
        U.label("選擇員工"), h("div", { class: "mb8" }, this.clEmp),
        h("div", { class: "row mb4" }, U.btn("ghost", "◀", () => this.shiftCompMonth(-1)), this.compMonthLabel, this.compNext, this.compToday), h("div", { class: "mb8" }, this.compStats), h("div", { class: "wr" }, h("div", { class: "divider" }),
        h("div", { class: "grid3 mb8" }, h("div", {}, U.label("類型"), this.clType), h("div", {}, U.label("日期"), this.clDate), this.clHint),
        h("div", { class: "grid3 mb8" }, h("div", {}, U.label("開始時間"), this.clStart), h("div", {}, U.label("結束時間"), this.clEnd), h("div", {}, U.label("時數(自動計算，0.5為單位)"), this.clHours)),
        U.label("備註(選填)"), h("div", { class: "mb8" }, this.clNote),
        U.primary("➕ 新增補休紀錄", () => this.addCompEntry(), { class: "btn primary full" }))));
      this.updateCompHours();
      // 喪假
      this.blEmp = new U.OptionMenu([]);
      this.blRelation = new U.OptionMenu(C.BEREAVEMENT_RELATIONS.map((x) => x[0]), () => this.onRelationChange());
      this.blDate = new U.DateEntry();
      this.blDate.set(C.todayIso());
      this.blDays = U.input("");
      this.blNote = U.input("例如：往生者稱謂");
      const bl = U.card(h("div", { class: "pad" }, U.sectionHeader("🖤", "喪假登記", "依親屬關係自動帶入建議天數（勞工請假規則第3條），全時／PT工讀生皆適用"),
        U.label("選擇員工"), h("div", { class: "mb8" }, this.blEmp), U.label("親屬關係"), h("div", { class: "mb8" }, this.blRelation),
        h("div", { class: "grid3 mb8" }, h("div", {}, U.label("起始日期"), this.blDate), h("div", {}, U.label("天數(依關係帶入，可調整)"), this.blDays), h("div", {}, U.label("備註(選填)"), this.blNote)),
        U.primary("🖤 新增喪假登記", () => this.addBereavement(), { class: "btn primary full" })));
      bl.classList.add("wr");
      this.onRelationChange();
      // 全部假別紀錄
      const r = () => this.renderLeaveLedger();
      this.leaveFilterEmp = new U.OptionMenu(["全部員工"], r);
      this.leaveFilterType = new U.OptionMenu(["全部類型"].concat(Object.keys(TYPE_KEY)), r);
      this.leaveStats = h("div", { class: "chips mb8" });
      this.leaveTree = new U.Table([{ key: "date", title: "日期", width: 95 }, { key: "emp", title: "員工", width: 80 }, { key: "type", title: "類型", width: 110 }, { key: "hours", title: "時數", width: 60 }, { key: "note", title: "備註", width: 200, ell: true, left: true }], { maxHeight: 360 });
      const ledger = U.card(h("div", { class: "pad", style: { paddingBottom: 0 } }, U.sectionHeader("📜", "全部假別紀錄", "可依員工、類型篩選"),
        h("div", { class: "row mb8" }, h("div", { style: { width: "180px" } }, this.leaveFilterEmp), h("div", { style: { width: "140px" } }, this.leaveFilterType),
          U.ghost("🔄 清除篩選", () => { this.leaveFilterEmp.set("全部員工"); this.leaveFilterType.set("全部類型"); r(); })), this.leaveStats),
      this.leaveTree, h("div", { style: { textAlign: "right", padding: "0 10px 10px" } }, U.danger("🗑 刪除選取紀錄", () => this.deleteSelectedLeave(), { class: "btn danger wr" })));
      t.append(h("div", { class: "pair" }, al, cl), h("div", { class: "pair" }, bl, ledger));
    },
    refreshLeaveCombos() {
      const setOpt = (menu, values, fallback) => {
        const cur = menu.get();
        menu.configure(values.length ? values : [fallback]);
        menu.set(values.includes(cur) ? cur : (values[0] || fallback));
      };
      setOpt(this.alEmp, this.db.employees.filter((e) => e.type === "fulltime").map((e) => e.name), "尚無正職員工");
      const all = this.L.sortedEmployees().map(empLabel);
      setOpt(this.clEmp, all, "請先新增員工");
      setOpt(this.blEmp, all, "請先新增員工");
      const filters = ["全部員工"].concat(all), cur = this.leaveFilterEmp.get();
      this.leaveFilterEmp.configure(filters);
      this.leaveFilterEmp.set(filters.includes(cur) ? cur : "全部員工");
    },
    getAlEmployee() { return this.db.employees.find((e) => e.name === this.alEmp.get() && e.type === "fulltime") || null; },
    empByLabel(v) { return this.db.employees.find((e) => empLabel(e) === v) || null; },
    onRelationChange() {
      const hit = C.BEREAVEMENT_RELATIONS.find((x) => x[0] === this.blRelation.get());
      if (hit) this.blDays.value = String(hit[1]);
    },
    async addBereavement() {
      const emp = this.empByLabel(this.blEmp.get());
      if (!emp) { await msg.warn("提醒", "請先新增員工"); return; }
      const date = this.blDate.get().trim();
      if (!C.parseDate(date)) { await msg.warn("提醒", "日期格式需為 YYYY-MM-DD"); return; }
      const days = num(this.blDays.value);
      if (Number.isNaN(days)) { await msg.warn("提醒", "天數需為數字"); return; }
      if (days <= 0) { await msg.warn("提醒", "天數需大於0"); return; }
      const relation = this.blRelation.get(), perDay = emp.normalHours ? Number(emp.normalHours) : 8, note = this.blNote.value.trim();
      this.db.leaveLedger.push({ id: C.newId(), empId: emp.id, date, type: "bereavement_use", hours: days * perDay, days, relation, note: `${relation}｜${C.g(days)}天` + (note ? `｜${note}` : "") });
      this.persist();
      this.blNote.value = "";
      await msg.info("完成", `已登記 ${emp.name} 喪假 ${C.g(days)} 天（${relation}）`);
      this.renderLeaveLedger();
    },
    renderAnnualCard() {
      if (!this.annualStats) return;
      const s = clear(this.annualStats), emp = this.getAlEmployee(), reset = () => { this.annualBar.style.width = "0"; this.annualLabel.textContent = ""; };
      if (!emp) { s.append(U.sub("尚無正職員工，請先於「員工設定」新增並填寫到職日")); reset(); return; }
      if (!emp.hireDate) { s.append(U.colored(`⚠ ${emp.name} 尚未設定到職日，請至「員工設定」補齊`, X.orange)); reset(); return; }
      const b = C.annualLeaveBalance(this.db, emp), ratio = b.entitledHours ? b.used / b.entitledHours : 0, remain = 1 - ratio;
      const color = remain < 0.2 ? X.red : remain < 0.5 ? X.orange : X.green;
      s.append(U.chip("👔", C.formatServiceDuration(emp.hireDate), "年資", X.tealL).el, U.chip("📆", `${b.entitledDays} 天`, "本期特休天數", X.gold).el, U.chip("✅", `${C.hr(b.used)}hr`, "已使用", X.teal).el, U.chip("🟢", `${C.hr(b.remaining)}hr`, "剩餘", color).el);
      this.annualBar.style.background = color;
      this.annualBar.style.width = Math.min(1, ratio) * 100 + "%";
      this.annualLabel.textContent = `已使用 ${C.pct0(ratio * 100)}%　｜　本期週期起算日：${b.periodStart}（週年制，每年以到職日週年重新計算）`;
    },
    async addAnnualUsage() {
      const emp = this.getAlEmployee();
      if (!emp) { await msg.warn("提醒", "請先選擇正職員工"); return; }
      if (!emp.hireDate) { await msg.warn("提醒", "請先於員工設定填寫到職日"); return; }
      const date = this.alDate.get().trim();
      if (!C.parseDate(date)) { await msg.warn("提醒", "日期格式需為 YYYY-MM-DD"); return; }
      const hours = Number(this.alHours.get()), b = C.annualLeaveBalance(this.db, emp);
      if (hours > b.remaining && !(await msg.ask("確認", `剩餘特休僅 ${C.hr(b.remaining)} 小時，本次仍要登記嗎？`))) return;
      this.db.leaveLedger.push({ id: C.newId(), empId: emp.id, date, type: "annual_use", hours, note: this.alNote.value.trim() });
      this.persist();
      this.alNote.value = "";
      await msg.info("完成", `已登記 ${emp.name} 特休 ${C.pf(hours)} 小時`);
      this.renderAnnualCard(); this.renderLeaveLedger();
    },
    renderCompCard() {
      if (!this.compStats) return;
      const s = clear(this.compStats), emp = this.empByLabel(this.clEmp.get());
      if (!emp) { s.append(U.sub("請先新增員工")); return; }
      const now = C.thisMonth();
      if (this.compMonth && this.compMonth >= now) this.compMonth = null;
      const b = C.compLeaveBalance(this.db, emp.id, this.compMonth), m = Number(b.month.slice(5, 7)), cur = b.month === now;
      this.compMonthLabel.textContent = `${b.month.slice(0, 4)}年${m}月` + (cur ? "（本月）" : "（已結算，僅供查詢）");
      this.compMonthLabel.style.color = cur ? "var(--text)" : X.orange;
      this.compNext.disabled = cur; this.compToday.disabled = cur;
      s.append(U.chip("➕", `${C.hr(b.earned)}hr`, `${m}月累積取得`, X.teal).el, U.chip("✅", `${C.hr(b.used)}hr`, `${m}月已使用`, X.tealL).el, U.chip("🟢", `${C.hr(b.remaining)}hr`, `${m}月剩餘`, b.remaining > 0 ? X.green : X.sub).el);
    },
    shiftCompMonth(delta) {
      const now = C.thisMonth();
      if (delta === null) this.compMonth = null;
      else {
        const target = C.shiftMonthKey(this.compMonth || now, delta);
        this.compMonth = target >= now ? null : target;
      }
      this.renderCompCard();
    },
    updateCompHours() {
      let mins = C.timeToMinutes(this.clEnd.get()) - C.timeToMinutes(this.clStart.get());
      if (mins <= 0) mins += 1440;
      this.clHours.value = C.g(C.pyRound((mins / 60) * 2) / 2);
    },
    autofillCompEntry(pickDate) {
      if (!this.clHint) return;
      const emp = this.empByLabel(this.clEmp.get());
      if (!emp) { this.clHint.textContent = ""; return; }
      const want = this.clType.get().startsWith("取得") ? "ot" : "leave", kind = want === "ot" ? "加班" : "請假";
      const hint = (text, color) => { this.clHint.textContent = text; this.clHint.style.color = color; };
      const clearAuto = () => {
        if (this.clNote.value.trim() === this.clAutoNote) this.clNote.value = "";
        this.clAutoNote = null;
      };
      let rec = null, info = null;
      if (pickDate) {
        for (const [pRec, pEmp] of this.L.getPendingForMonth(null)) {
          if (pEmp.id !== emp.id) continue;
          const p = this.L.recordSendSpan(pRec);
          if (p && p[0] === want && !(want === "ot" && p[4] !== "加班單補休") && !(want === "leave" && pRec.dayType === "typhoon")) { rec = pRec; info = p; break; }
        }
        if (!rec) { clearAuto(); hint(`✅ ${emp.name} 目前沒有待登記的${kind}時段`, X.green); return; }
        this.clDate.set(rec.date);
      } else {
        const ds = this.clDate.get().trim();
        for (const dRec of this.db.records) {
          if (dRec.empId !== emp.id || dRec.date !== ds) continue;
          const p = this.L.recordSendSpan(dRec);
          if (p && p[0] === want && !(want === "leave" && dRec.dayType === "typhoon")) { rec = dRec; info = p; break; }
        }
        if (!rec) { clearAuto(); hint(`ℹ 此日無${kind}紀錄，請手動輸入時間`, X.sub); return; }
      }
      const [, start, end, , form] = info;
      const hhmm = (m) => C.pad2(Math.floor((m % 1440) / 60)) + ":" + C.pad2(m % 60);
      this.clStart.set(hhmm(start)); this.clEnd.set(hhmm(end));
      this.updateCompHours();
      const d = C.parseDate(rec.date), md = `${C.monthOf(d)}/${C.dayOf(d)}`;
      const auto = `對應${md}${form}${Logic.decTime(start)}-${Logic.decTime(end)}`;
      const cur = this.clNote.value.trim();
      if (!cur || cur === this.clAutoNote) { this.clNote.value = auto; this.clAutoNote = auto; }
      const filed = this.db.leaveLedger.some((l) => l.empId === emp.id && l.date === rec.date && l.type === (want === "ot" ? "comp_earn" : "comp_use"));
      if (filed) hint(`⚠ ${md} 已登記過，請確認是否重複`, X.orange);
      else hint(`🔍 已偵測 ${md} ${form} ${hhmm(start)}-${hhmm(end)}`, X.tealL);
    },
    async addCompEntry() {
      const emp = this.empByLabel(this.clEmp.get());
      if (!emp) { await msg.warn("提醒", "請先選擇員工"); return; }
      const date = this.clDate.get().trim();
      if (!C.parseDate(date)) { await msg.warn("提醒", "日期格式需為 YYYY-MM-DD"); return; }
      const hours = C.pyRound(Number(this.clHours.value || 0) * 2) / 2;
      if (hours <= 0) { await msg.warn("提醒", "時數需大於0"); return; }
      const type = this.clType.get().startsWith("取得") ? "comp_earn" : "comp_use";
      if (type === "comp_use") {
        const b = C.compLeaveBalance(this.db, emp.id, C.monthKey(date));
        if (hours > b.remaining && !(await msg.ask("確認", `剩餘補休僅 ${C.hr(b.remaining)} 小時，是否仍要登記？`))) return;
      }
      this.db.leaveLedger.push({ id: C.newId(), empId: emp.id, date, type, hours, note: this.clNote.value.trim() });
      this.persist();
      this.clNote.value = "";
      await msg.info("完成", `已登記 ${emp.name} ${type === "comp_earn" ? "取得補休" : "使用補休"} ${C.pf(hours)} 小時`);
      this.renderCompCard(); this.renderLeaveLedger();
      this.autofillCompEntry(true);
    },
    renderLeaveLedger() {
      if (!this.leaveTree) return;
      const fe = this.leaveFilterEmp.get(), ft = this.leaveFilterType.get(), rows = [], shown = [];
      for (const l of this.db.leaveLedger.slice().sort((a, b) => C.cmp(b.date, a.date))) {
        const emp = this.L.findEmp(l.empId);
        if (!emp || (fe !== "全部員工" && fe !== empLabel(emp)) || (ft !== "全部類型" && l.type !== TYPE_KEY[ft])) continue;
        rows.push({ key: l.id, cells: [l.date, emp.name, TYPE_LABEL[l.type] || l.type, `${C.hr(l.hours)}hr`, l.note || ""] });
        shown.push(l);
      }
      this.leaveTree.render(rows);
      const n = (t) => shown.filter((l) => l.type === t).length;
      clear(this.leaveStats).append(U.chip("📜", shown.length, "篩選結果筆數", X.tealL).el, U.chip("🌴", n("annual_use"), "特休使用", X.gold).el, U.chip("➕", n("comp_earn"), "補休取得", X.teal).el, U.chip("➖", n("comp_use"), "補休使用", X.sub).el,
        U.chip("🖤", n("bereavement_use"), "喪假使用", X.purple).el, U.chip("💰", n("ot_pay"), "加班費申請", X.orange).el, U.chip("🌀", n("typhoon_leave"), "颱風假", X.purple).el);
    },
    async deleteSelectedLeave() {
      const id = this.leaveTree.first();
      if (!id) { await msg.info("提醒", "請先選取要刪除的紀錄"); return; }
      if (!(await msg.ask("確認刪除", "確定刪除此筆假別紀錄？"))) return;
      this.db.leaveLedger = this.db.leaveLedger.filter((l) => l.id !== id);
      this.persist();
      this.renderAnnualCard(); this.renderCompCard(); this.renderLeaveLedger();
    },
  });
  void EMP_TYPE_LABEL;
})();
