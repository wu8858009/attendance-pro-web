/* 帳號與權限：每個人都能改自己的密碼；管理員可建立幹部／員工帳號並逐項設定權限。
   權限真正的檢查在後端（Code.gs），這裡只負責畫面。 */
(function () {
  "use strict";
  const U = window.UI, { h, clear, msg } = U, X = U.COLORS;
  const MODS = [["report", "📊 月報表"], ["punch", "✏️ 打卡登錄"], ["records", "📋 出勤記錄"], ["employees", "👥 員工設定"], ["schedule", "🗓️ 排班班表"], ["leave", "🌴 特休/補休"], ["settings", "🛠️ 軟體設定"]];
  const EMP_MODS = ["report", "records", "schedule", "leave"];
  const LEVEL = { none: "不可用", view: "只能看", edit: "可編輯" }, LEVEL_KEY = { 不可用: "none", 只能看: "view", 可編輯: "edit" };
  const ERR = { duplicate: "這個帳號名稱已經有人使用", emp_taken: "這位員工已經有帳號了", bad_username: "帳號名稱不可空白，也不可超過 40 字", not_found: "找不到這個帳號，可能已被刪除", forbidden: "沒有權限執行這個動作" };
  const EMP_DEFAULT = { schedule: "view", records: "view", leave: "view" };

  function tempPassword() {                 // 暫時密碼：避開容易看錯的字元
    const set = "abcdefghjkmnpqrstuvwxyz23456789", bytes = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(bytes, (b) => set[b % set.length]).join("");
  }

  Object.assign(window.App.prototype, {
    buildAccountTab() {
      const t = this.tabs["🔐 帳號權限"], me = this.me;
      const pwOld = h("input", { type: "password", placeholder: "目前密碼", autocomplete: "current-password" });
      const pwNew = h("input", { type: "password", placeholder: "新密碼（至少 8 個字元）", autocomplete: "new-password" });
      const changePw = async () => {
        if (pwNew.value.length < 8) { await msg.warn("提醒", "新密碼至少 8 個字元"); return; }
        try {
          const st = await this.store.status(), r = await this.store.changePassword(pwOld.value, pwNew.value, st.salt);
          if (r.error === "wrong_password") { await msg.warn("提醒", "目前密碼錯誤"); return; }
          pwOld.value = ""; pwNew.value = "";
          await msg.info("完成", "密碼已更新，這個帳號的其他裝置需要重新登入");
        } catch (_e) { await msg.error("錯誤", "連線失敗，請再試一次"); }
      };
      const role = me.admin ? "管理員" : me.empId ? "員工（只看得到自己的資料）" : "幹部";
      t.append(U.accentCard(X.purple, h("div", { class: "pad" }, U.sectionHeader("🔐", "我的帳號", `帳號：${me.username}　姓名：${me.name}　身分：${role}`),
        h("div", { class: "grid4 mb8" }, h("div", {}, pwOld), h("div", {}, pwNew), U.primary("更新密碼", changePw, { class: "btn primary" }), U.ghost("登出這台裝置", async () => { await this.store.logout(); location.reload(); })))));
      if (!me.admin) return;
      this.accTree = new U.Table([
        { key: "user", title: "帳號", width: 130 }, { key: "name", title: "姓名", width: 100 }, { key: "role", title: "身分", width: 70 },
        { key: "perms", title: "權限", width: 380, ell: true, left: true }, { key: "state", title: "狀態", width: 110 },
      ], { onDouble: () => this.editSelectedAccount(), maxHeight: 460 });
      this.accStats = h("div", { class: "chips mb8" });
      t.append(U.card(h("div", { class: "pad", style: { paddingBottom: 0 } }, U.sectionHeader("👥", "帳號與權限管理", "幹部逐項設定「不可用／只能看／可編輯」；員工帳號只看得到自己的資料，雙擊可修改權限"), this.accStats,
        h("div", { class: "row mb8" }, U.primary("➕ 新增幹部帳號", () => this.openAccountDialog(null, false)), U.ghost("➕ 新增員工帳號", () => this.openAccountDialog(null, true)), U.ghost("👥 替在職員工批次建立帳號", () => this.batchCreateEmployees()))),
      this.accTree, h("div", { class: "row", style: { padding: "0 10px 10px" } }, h("div", { class: "grow" }), U.ghost("✏️ 修改權限", () => this.editSelectedAccount()), U.ghost("🔑 重設密碼", () => this.resetSelectedAccount()), U.danger("🗑 刪除帳號", () => this.deleteSelectedAccount()))));
    },
    async renderAccounts() {
      if (!this.me.admin || !this.accTree) return;
      let r;
      try { r = await this.store.call("accountsList"); } catch (_e) { return; }
      if (r.error) return;
      this.accounts = r.accounts.sort((a, b) => (b.admin - a.admin) || (!!a.empId - !!b.empId) || a.username.localeCompare(b.username));
      const summary = (a) => a.admin ? "全部功能＋帳號管理" : MODS.filter(([m]) => a.perms[m] !== "none").map(([m, l]) => `${l.split(" ")[1]}${a.perms[m] === "edit" ? "✏" : ""}`).join("、") || "（沒有任何功能）";
      const state = (a) => {
        if (a.empId) { const e = this.L.findEmp(a.empId); if (!e) return "⚠ 找不到員工"; if (e.isActive === false) return "⚠ 已離職"; }
        return a.mustChange ? "待改密碼" : "正常";
      };
      this.accTree.render(this.accounts.map((a) => ({ key: a.username, cls: a.empId && this.L.findEmp(a.empId) && this.L.findEmp(a.empId).isActive === false ? "c-sub" : "", cells: [a.username, a.name, a.admin ? "管理員" : a.empId ? "員工" : "幹部", summary(a), state(a)] })), this.accTree.first());
      clear(this.accStats).append(U.chip("🧑‍💼", this.accounts.filter((a) => !a.empId).length, "管理員／幹部", X.gold).el, U.chip("👤", this.accounts.filter((a) => a.empId).length, "員工帳號", X.tealL).el, U.chip("🔑", this.accounts.filter((a) => a.mustChange).length, "尚未改密碼", X.orange).el);
    },
    selectedAccount() { return (this.accounts || []).find((a) => a.username === this.accTree.first()) || null; },
    async accCall(action, payload) {
      try {
        const r = await this.store.call(action, payload);
        if (r.error) { await msg.warn("提醒", ERR[r.error] || "操作失敗"); return null; }
        return r;
      } catch (_e) { await msg.error("錯誤", "連線失敗，請再試一次"); return null; }
    },
    showTempPasswords(lines, subtitle) {
      this.openLineWindow(lines.join("\n"), { title: "暫時密碼（關閉後就看不到了）", subtitle, boxHeight: 260 });
    },
    openAccountDialog(acc, forEmployee) {
      const isEdit = !!acc, isEmp = isEdit ? !!acc.empId : forEmployee;
      if (isEdit && acc.admin) { msg.info("提醒", "管理員帳號固定擁有全部權限。"); return; }
      const used = new Set((this.accounts || []).filter((a) => a.empId && (!acc || a.username !== acc.username)).map((a) => a.empId));
      const emps = this.db.employees.filter((e) => !used.has(e.id) && (e.isActive !== false || (acc && acc.empId === e.id)));
      const label = (e) => e.name;
      const uname = U.input(isEmp ? "預設使用員工姓名" : "例如：manager1", isEdit ? { value: acc.username, disabled: true } : {});
      const dname = U.input("顯示的姓名", isEdit ? { value: acc.name } : {});
      const empMenu = isEmp ? new U.OptionMenu(emps.length ? emps.map(label) : ["沒有可綁定的員工"], (v) => { if (!isEdit) { uname.value = v; dname.value = v; } }) : null;
      if (empMenu && isEdit) { const cur = this.db.employees.find((e) => e.id === acc.empId); if (cur) empMenu.set(cur.name); }
      if (empMenu && !isEdit && emps.length) { uname.value = emps[0].name; dname.value = emps[0].name; }
      const opts = isEmp ? ["不可用", "只能看"] : ["不可用", "只能看", "可編輯"];
      const menus = {}, rows = MODS.filter(([m]) => !isEmp || EMP_MODS.includes(m)).map(([m, l]) => {
        menus[m] = new U.OptionMenu(opts);
        menus[m].set(LEVEL[(acc ? acc.perms[m] : isEmp ? EMP_DEFAULT[m] : "view") || "none"]);
        return [h("span", { text: l }), menus[m]];
      });
      let ov;
      const save = async () => {
        const username = uname.value.trim();
        if (!username) { await msg.warn("提醒", "請輸入帳號名稱"); return; }
        const emp = isEmp ? emps.find((e) => label(e) === empMenu.get()) : null;
        if (isEmp && !emp) { await msg.warn("提醒", "請選擇要綁定的員工"); return; }
        const perms = {};
        Object.keys(menus).forEach((m) => { perms[m] = LEVEL_KEY[menus[m].get()]; });
        const payload = { username, name: dname.value.trim() || username, empId: emp ? emp.id : "", perms, isNew: !isEdit };
        let temp = null;
        if (!isEdit) {
          temp = tempPassword();
          payload.key = await this.store.keyFor(temp, (await this.store.status()).salt);
        }
        const r = await this.accCall("accountSave", payload);
        if (!r) return;
        ov.remove();
        await this.renderAccounts();
        if (temp) this.showTempPasswords([`帳號：${username}`, `暫時密碼：${temp}`, "第一次登入後要改成自己的密碼"], "請把這組資料交給本人，可複製貼到 LINE");
        else await msg.info("完成", `已更新 ${username} 的權限，對方的畫面幾秒內會跟著變更`);
      };
      ov = U.modal(h("div", { class: "dlg", style: { width: "480px" } }, h("div", { class: "accent", style: { background: X.purple } }), h("div", { class: "pad" },
        U.sectionHeader("🔐", isEdit ? "修改帳號權限" : isEmp ? "新增員工帳號" : "新增幹部帳號", isEmp ? "員工帳號只看得到自己的資料，不能修改" : "逐項設定這個帳號能使用的功能"),
        empMenu ? h("div", { class: "mb8" }, U.label("綁定員工"), empMenu) : null,
        h("div", { class: "grid3 mb8", style: { gridTemplateColumns: "1fr 1fr" } }, h("div", {}, U.label("帳號（登入用）"), uname), h("div", {}, U.label("姓名"), dname)),
        h("div", { class: "divider" }), h("div", { class: "perm-grid mb8" }, rows.flat()),
        isEmp ? null : U.sub("排班或員工設定開「可編輯」時，連動需要會一併讀取出勤與假別資料", { style: { display: "block", marginBottom: "8px" } }),
        h("div", { class: "row", style: { flexWrap: "nowrap" } }, U.primary(isEdit ? "💾 儲存" : "➕ 建立帳號", save, { class: "btn primary tall grow" }), U.danger("✖ 取消", () => ov.remove(), { class: "btn danger tall" })))));
    },
    editSelectedAccount() {
      const a = this.selectedAccount();
      if (!a) { msg.info("提醒", "請先選取帳號"); return; }
      this.openAccountDialog(a);
    },
    async batchCreateEmployees() {
      const accs = this.accounts || [], usedEmp = new Set(accs.map((a) => a.empId)), usedName = new Set(accs.map((a) => a.username));
      const todo = this.db.employees.filter((e) => e.isActive !== false && !usedEmp.has(e.id) && !usedName.has(e.name.trim().toLowerCase()));
      if (!todo.length) { await msg.info("提醒", "在職員工都已經有帳號了"); return; }
      if (!(await msg.ask("批次建立帳號", `要替 ${todo.length} 位在職員工建立帳號嗎？\n帳號為員工姓名，預設可看自己的排班、出勤記錄、特休／補休。\n每人會產生一組不同的暫時密碼，只會顯示這一次。`))) return;
      const st = await this.store.status(), pairs = [];
      for (const e of todo) { const pw = tempPassword(); pairs.push([e, pw, await this.store.keyFor(pw, st.salt)]); }
      const r = await this.accCall("accountsBatch", { list: pairs.map(([e, , key]) => ({ username: e.name.trim(), name: e.name.trim(), empId: e.id, perms: EMP_DEFAULT, key })) });
      if (!r) return;
      await this.renderAccounts();
      const made = new Set(r.made);
      this.showTempPasswords(pairs.filter(([e]) => made.has(e.name.trim().toLowerCase())).map(([e, pw]) => `${e.name.trim()}　暫時密碼：${pw}`), `已建立 ${r.made.length} 個帳號${r.skipped.length ? `，${r.skipped.length} 個略過` : ""}。請個別交給本人，第一次登入後要改密碼`);
    },
    async resetSelectedAccount() {
      const a = this.selectedAccount();
      if (!a) { await msg.info("提醒", "請先選取帳號"); return; }
      if (a.admin) { await msg.info("提醒", "管理員密碼請在上方「我的帳號」更改。"); return; }
      if (!(await msg.ask("重設密碼", `要重設 ${a.username} 的密碼嗎？\n對方所有裝置會立刻登出。`))) return;
      const temp = tempPassword(), key = await this.store.keyFor(temp, (await this.store.status()).salt);
      if (!(await this.accCall("accountReset", { username: a.username, key }))) return;
      await this.renderAccounts();
      this.showTempPasswords([`帳號：${a.username}`, `暫時密碼：${temp}`, "登入後要改成自己的密碼"], "請把這組資料交給本人");
    },
    async deleteSelectedAccount() {
      const a = this.selectedAccount();
      if (!a) { await msg.info("提醒", "請先選取帳號"); return; }
      if (a.admin) { await msg.info("提醒", "管理員帳號不能刪除。"); return; }
      if (!(await msg.ask("確認刪除", `確定刪除帳號 ${a.username}？\n對方會立刻登出，員工的出勤資料不受影響。`))) return;
      if (await this.accCall("accountDelete", { username: a.username })) await this.renderAccounts();
    },
  });
})();
