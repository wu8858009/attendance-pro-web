/* 登入操作紀錄（只有管理員看得到）：每個人的最後登入／最後操作，以及完整的紀錄清單 */
(function () {
  "use strict";
  const C = window.Core, U = window.UI, { h, clear, msg } = U, X = U.COLORS;
  const TAB = "🧾 登入操作紀錄";
  const KINDS = { 全部類型: "", 登入登出: "login", 資料異動: "data", 帳號與密碼: "account" };
  const ALL = "全部人員";
  const personLabel = (p) => (p.name && p.name !== p.username ? `${p.name}（${p.username}）` : p.username);
  const csvCell = (v) => { let s = String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };

  Object.assign(window.App.prototype, {
    buildAuditTab() {
      if (!this.me.admin) return;
      const t = this.tabs[TAB], go = () => this.renderAudit();
      this.auPeople = [];
      this.auUser = new U.OptionMenu([ALL], go);
      this.auKind = new U.OptionMenu(Object.keys(KINDS), go);
      this.auFrom = new U.DateEntry(go);
      this.auFrom.set(C.iso(C.addDays(C.today(), -30)));
      this.auTo = new U.DateEntry(go);
      this.auTo.set(C.todayIso());
      this.auStats = h("div", { class: "chips mb8" });
      this.auSum = new U.Table([
        { key: "name", title: "人員", width: 180, left: true }, { key: "login", title: "最後登入時間", width: 170 }, { key: "action", title: "最後操作時間", width: 170 }, { key: "count", title: "登入次數", width: 80 },
      ], { maxHeight: 300, onSelect: () => this.auPickPerson() });
      this.auTree = new U.Table([
        { key: "time", title: "時間", width: 160 }, { key: "who", title: "人員", width: 130, left: true }, { key: "act", title: "動作", width: 90 }, { key: "detail", title: "內容", width: 420, ell: true, left: true },
      ], { maxHeight: 460, onSelect: () => this.auShowDetail() });
      this.auDetail = h("div", { class: "sub", style: { padding: "0 16px 12px", whiteSpace: "pre-wrap", minHeight: "20px" } });
      t.append(
        U.card(h("div", { style: { padding: "12px 16px 0" } }, U.sectionHeader("🧾", "人員總覽", "每個帳號最後一次登入與操作的時間；點一下人員可篩選下方清單")), this.auSum),
        U.card(h("div", { class: "pad" }, U.sectionHeader("🔍", "篩選條件", "紀錄保存在 Google 試算表的「操作紀錄」工作表，最多保留最近約 2 萬筆"),
          h("div", { class: "grid4 mb8" }, h("div", {}, U.sub("人員"), this.auUser), h("div", {}, U.sub("類型"), this.auKind), h("div", {}, U.sub("起始日期"), this.auFrom), h("div", {}, U.sub("結束日期"), this.auTo)),
          h("div", { class: "row" }, U.primary("🔄 重新整理", go), U.ghost("⬇ 匯出 CSV", () => this.exportAudit())), h("div", { style: { marginTop: "10px" } }, this.auStats))),
        U.card(h("div", { style: { padding: "12px 16px 0" } }, U.sectionHeader("📜", "紀錄清單", "最新的在最上面；點選一筆可看完整內容")), this.auTree, this.auDetail));
    },
    auQuery() {
      const label = this.auUser.get(), who = this.auPeople.find((p) => personLabel(p) === label);
      return { user: who ? who.username : "", kind: KINDS[this.auKind.get()], from: this.auFrom.get().trim(), to: this.auTo.get().trim() };
    },
    async renderAudit() {
      if (!this.me.admin || !this.auTree) return;
      const token = (this.auToken = (this.auToken || 0) + 1);
      let r;
      try { r = await this.store.call("auditList", this.auQuery()); } catch (_e) { return; }
      if (token !== this.auToken || r.error) return;
      this.auRows = r.rows;
      this.auPeople = r.summary.slice().sort((a, b) => C.cmp(b.lastLogin, a.lastLogin) || C.cmp(a.username, b.username));
      const cur = this.auUser.get(), names = [ALL].concat(this.auPeople.map(personLabel));
      this.auUser.configure(names);
      this.auUser.set(names.includes(cur) ? cur : ALL);
      this.auSum.render(this.auPeople.map((p) => ({ key: p.username, cells: [personLabel(p), p.lastLogin || "－", p.lastAction || "－", String(p.logins)] })));
      this.auTree.render(r.rows.map((x, i) => ({ key: String(i), cls: x.action === "登入失敗" ? "c-leave" : "", cells: [x.time, x.name || x.username, x.action, x.detail] })));
      clear(this.auStats).append(U.chip("📜", r.matched, "符合筆數", X.tealL).el, U.chip("👀", r.rows.length, "目前顯示", X.gold).el);
      clear(this.auDetail);
      if (r.matched > r.rows.length) this.auDetail.textContent = `符合的紀錄較多，只顯示最新 ${r.rows.length} 筆，可縮小日期範圍查看更早的紀錄。`;
    },
    auPickPerson() {
      const p = this.auPeople.find((x) => x.username === this.auSum.first());
      if (!p || this.auUser.get() === personLabel(p)) return;
      this.auUser.set(personLabel(p));
      this.renderAudit();
    },
    auShowDetail() {
      const row = (this.auRows || [])[Number(this.auTree.first())];
      this.auDetail.textContent = row ? `${row.time}　${row.name || row.username}　${row.action}${row.detail ? "\n" + row.detail : ""}` : "";
    },
    async exportAudit() {
      const q = this.auQuery();
      let r;
      try { r = await this.store.call("auditList", q); } catch (_e) { await msg.error("錯誤", "連線失敗，請再試一次"); return; }
      if (!r.rows || !r.rows.length) { await msg.info("提醒", "沒有符合的紀錄可匯出"); return; }
      const lines = [["時間", "帳號", "姓名", "動作", "內容"].map(csvCell).join(",")].concat(r.rows.map((x) => [x.time, x.username, x.name, x.action, x.detail].map(csvCell).join(",")));
      U.download(`登入操作紀錄_${q.from || "全部"}_${q.to || C.todayIso()}.csv`, "﻿" + lines.join("\r\n"), "text/csv");
    },
  });
})();
