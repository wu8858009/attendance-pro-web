/* 勞工局說明、使用說明書、農民曆、軟體設定（對應桌面版其餘分頁） */
(function () {
  "use strict";
  const C = window.Core, U = window.UI, { h, clear, msg } = U, X = U.COLORS, CT = window.Content;
  const num = window.numOf, ALM_FROM = 2020, ALM_TO = 2040;

  function helpCard(icon, title, subtitle, lines, accent) {
    accent = accent || X.teal;
    return U.accentCard(accent, h("div", { style: { padding: "10px 16px 14px" } },
      h("div", { class: "row", style: { gap: "0" } }, h("div", { class: "sec", style: { margin: 0 } }, h("div", { class: "badge", text: icon }), h("div", { class: "sec-t", text: title })), subtitle ? h("span", { class: "pill", text: subtitle, style: { color: accent } }) : null),
      h("div", { style: { marginTop: "10px" } }, lines.map((line) => {
        if (line.startsWith("・")) return h("div", { class: "hl-row" }, h("span", { class: "hl-b", text: "●", style: { color: accent } }), h("span", { class: "sub", text: line.slice(1).trim() }));
        if (line.startsWith("　")) return h("div", { class: "hl-row" }, h("span", { class: "hl-b" }), h("span", { class: "sub", text: line.trim() }));
        return h("div", { text: line, style: { marginBottom: "3px" } });
      }))));
  }

  Object.assign(window.App.prototype, {
    buildHelpTab() {
      const t = this.tabs["📖 勞工局說明"];
      const q = new U.Table([{ key: "d", title: "日別", width: 100 }, { key: "t", title: "時數級距", width: 280 }, { key: "r", title: "加班費倍率", width: 220 }], { maxHeight: 400 });
      q.render(CT.qref.map((r, i) => ({ key: String(i), cls: "c-" + r[3], cells: r.slice(0, 3) })));
      t.append(
        U.card(h("div", { class: "pad" }, U.sectionHeader("📖", "勞動法規說明", "本頁彙整系統試算所依據的勞動基準法規定，方便對照"), h("div", { class: "sub", style: { whiteSpace: "pre-wrap" }, text: "以下說明僅供內部行政試算輔助參考，非正式法律意見；\n實際發薪、請假與加班認定，仍請以公司規章及勞動部／當地勞工局最新公告為準。" }))),
        U.card(h("div", { style: { padding: "12px 16px 0" } }, U.sectionHeader("⚡", "加班費倍率速查表", "依日別與時數級距對照，詳細規則請見下方各卡片說明")), q),
        CT.helpCards.map((c) => helpCard(...c)),
        U.card(h("div", { class: "pad" }, U.sectionHeader("🔗", "官方資源查詢"), h("div", { class: "sub mb8", style: { whiteSpace: "pre-wrap" }, text: "可至勞動部全球資訊網查詢最新法規、公告及各地方勞工局／勞動局的\n諮詢申訴窗口資訊。" }),
          U.primary("🔗 開啟勞動部全球資訊網", () => window.open("https://www.mol.gov.tw/", "_blank", "noopener")))));
    },
    buildManualTab() {
      const t = this.tabs["📘 使用說明書"], cards = [];
      const toc = h("div", { class: "toc" }, CT.manual.map(([icon, title], i) => U.ghost(`${i + 1}. ${icon} ${title}`, () => cards[i].scrollIntoView({ behavior: "smooth", block: "start" }))));
      t.append(U.accentCard(X.teal, h("div", { class: "pad" }, h("div", { class: "row", style: { justifyContent: "space-between" } }, h("div", { class: "sec", style: { margin: 0 } }, h("div", { class: "badge", text: "📘" }), h("div", {}, h("div", { class: "sec-t", text: "員工出勤管理系統 PRO 使用說明書" }), h("div", { class: "sec-s", text: "點下方章節可直接跳到該段說明" }))),
        U.ghost("⬇ 匯出說明書 (TXT)", () => this.exportManual())), toc)));
      CT.manual.forEach(([icon, title, sub, lines, accent], i) => { const c = helpCard(icon, `${i + 1}. ${title}`, sub, lines, accent); cards.push(c); t.append(c); });
      t.append(helpCard("ℹ️", "聲明", "", ["本軟體僅供內部行政試算輔助使用，非正式法律意見；", "實際發薪、請假與加班認定，仍請以公司規章及勞動部／當地勞工局最新公告為準。"], X.sub));
    },
    async exportManual() {
      const out = ["員工出勤管理系統 PRO 使用說明書", "=".repeat(30), ""];
      CT.manual.forEach(([, title, sub, lines], i) => {
        out.push(`${i + 1}. ${title}` + (sub ? `（${sub}）` : ""), "-".repeat(30));
        lines.forEach((l) => out.push(l.startsWith("・") ? "  ・" + l.slice(1).trim() : l.startsWith("　") ? "    " + l.trim() : l));
        out.push("");
      });
      out.push("本軟體僅供內部行政試算輔助使用，非正式法律意見；", "實際發薪、請假與加班認定，仍請以公司規章及勞動部／當地勞工局最新公告為準。");
      U.download("員工出勤管理系統_使用說明書.txt", "﻿" + out.join("\n"));
    },

    // ==================== 農民曆 ====================
    buildAlmanacTab() {
      const t = this.tabs["🏮 農民曆"];
      this.almDate = new U.DateEntry(() => this.renderAlmanac());
      this.almDate.set(C.todayIso());
      this.almDate.input.addEventListener("keydown", (e) => { if (e.key === "Enter") this.renderAlmanac(); });
      this.almSummary = h("div", { style: { padding: "16px 20px" } });
      this.almDetail = h("div", { class: "alm-d pad" });
      const yj = (title, accent) => { const body = h("div", { style: { fontSize: "14px" } }); return [U.accentCard(accent, h("div", { style: { padding: "12px 16px" } }, h("div", { class: "alm-yj", text: title, style: { background: accent } }), body)), body]; };
      const [goodC, good] = yj("宜", X.green), [badC, bad] = yj("忌", X.red);
      this.almGood = good; this.almBad = bad;
      this.almHours = h("div", { class: "chips", style: { padding: "0 16px 14px" } });
      this.almCache = new Map();
      t.append(
        U.card(h("div", { class: "row pad", style: { justifyContent: "space-between" } }, h("div", { class: "sec", style: { margin: 0 } }, h("div", { class: "badge", text: "🏮" }), h("div", {}, h("div", { class: "sec-t", text: "農民曆" }), h("div", { class: "sec-s", text: "農曆日期、節氣、干支生肖、每日宜忌與沖煞，僅供參考" }))),
          h("div", { class: "row" }, U.ghost("◀ 前一天", () => this.shiftAlmanac(-1)), h("div", { style: { width: "150px" } }, this.almDate), U.ghost("後一天 ▶", () => this.shiftAlmanac(1)), U.primary("今天", () => this.shiftAlmanac(null))))),
        h("div", { class: "pair p23" }, U.accentCard(X.gold, this.almSummary), U.card(this.almDetail)), h("div", { class: "pair" }, goodC, badC),
        U.card(h("div", { style: { padding: "12px 16px 0" } }, U.sectionHeader("🕰️", "時辰吉凶", "十二時辰的干支與吉凶")), this.almHours));
    },
    shiftAlmanac(delta) {
      const cur = C.parseDate(this.almDate.get().trim()) || C.today();
      this.almDate.set(C.iso(delta === null ? C.today() : C.addDays(cur, delta)));
      this.renderAlmanac();
    },
    async almanacInfo(d) {
      const y = C.yearOf(d);
      if (y < ALM_FROM || y > ALM_TO) return null;
      if (!this.almCache.has(y)) this.almCache.set(y, fetch(`almanac/${y}.json`).then((r) => r.json()));
      return (await this.almCache.get(y))[C.iso(d)];
    },
    async renderAlmanac() {
      if (!this.almSummary) return;
      const d = C.parseDate(this.almDate.get().trim());
      if (!d) { await msg.warn("提醒", "日期格式需為 YYYY-MM-DD"); return; }
      const token = (this.almToken = (this.almToken || 0) + 1);
      let info = null, err = `網頁版收錄 ${ALM_FROM}～${ALM_TO} 年的農民曆，這一天不在範圍內`;
      try { info = await this.almanacInfo(d); } catch (_e) { err = "讀取農民曆資料失敗，請檢查網路"; }
      if (token !== this.almToken) return;
      const S = clear(this.almSummary), D = clear(this.almDetail), H = clear(this.almHours);
      if (!info) { S.append(U.colored(err, X.orange)); this.almGood.textContent = ""; this.almBad.textContent = ""; return; }
      const wd = "一二三四五六日"[C.weekday(d)], mName = info.lunarMonth.slice(0, -1), mSize = info.lunarMonth.slice(-1);
      S.append(U.sub(`國曆 ${C.yearOf(d)}年${C.monthOf(d)}月${C.dayOf(d)}日（星期${wd}）`), h("div", { class: "alm-big", text: `${mName}${info.lunarDay}` }), h("div", { text: `農曆 ${info.lunarYear}（生肖${info.zodiac}）・${mName}${mSize}`, style: { fontSize: "14px", margin: "2px 0 8px" } }));
      if (info.solarTerm) S.append(U.colored(`🌾 今日節氣：${info.solarTerm}`, X.tealL));
      else {
        const nd = C.parseDate(info.nextTermDate);
        S.append(U.colored(`🌾 下個節氣：${info.nextTerm}（${C.monthOf(nd)}/${C.dayOf(nd)}，還有 ${C.daysBetween(nd, d)} 天）`, X.sub));
      }
      const yellow = info.dayKind === "黃道日";
      S.append(U.colored(`${yellow ? "🟢" : "🟠"} ${info.dayGod}・${info.dayKind}`, yellow ? X.green : X.orange, { style: { color: yellow ? X.green : X.orange, marginTop: "4px" } }), h("div", { class: "alm-c", text: `⚠ 沖煞：${info.clash}　${info.sha}` }));
      if (info.festivals) S.append(U.colored(`🙏 ${info.festivals}`, X.purple, { style: { color: X.purple, marginTop: "8px" } }));
      [["干支", info.ganzhi], ["納音", info.nayin], ["季節", info.season], ["建除", `${info.officer}日`], ["二十八宿", info.star28], ["星座", info.starZodiac], ["胎神", info.fetalGod], ["吉神方位", info.directions.join("　")],
        ["吉神宜趨", info.goodGods.join("、") || "無"], ["凶神宜忌", info.badGods.join("、") || "無"], ["彭祖百忌", info.pengTaboo], ["吉凶等級", info.level]].forEach(([k, v]) => D.append(h("span", { class: "sub", text: k }), h("span", { text: v })));
      this.almGood.textContent = info.good.join("、") || "諸事不宜";
      this.almBad.textContent = info.bad.join("、") || "無";
      for (const [[branch, span], gz, luck] of info.hours) {
        const good = luck === "吉";
        H.append(h("div", { class: "alm-hour", style: { borderColor: good ? X.green : "var(--border)" } }, h("b", { text: `${branch}時` }), h("span", { class: "sub", text: ` ${span}　${gz} ` }), h("b", { text: luck, style: { color: good ? X.green : X.red } })));
      }
    },

    // ==================== 軟體設定 ====================
    buildSettingsTab() {
      const t = this.tabs["🛠️ 軟體設定"];
      this.setAppearance = new U.OptionMenu(["深色", "淺色"], (v) => this.changeAppearance(v));
      this.appearanceChip = h("span", { class: "chip", style: { fontWeight: 700, color: X.tealL } });
      this.setCap = U.input(""); this.setCapExt = U.input(""); this.setBreak = U.input("");
      this.lawStatus = h("div", { class: "sub mb8" });
      this.setFont = h("input", { type: "range", min: 8, max: 16, step: 1, oninput: () => this.onFontSize() });
      this.fontLabel = h("b", { text: "10", style: { width: "24px" } });
      this.tagCount = h("span", {});
      this.tagsFrame = h("div", { class: "row mb8" });
      this.newTag = U.input("輸入新標籤名稱，例如：外勤", { onkeydown: (e) => { if (e.key === "Enter") this.addTag(); } });
      const pwOld = h("input", { type: "password", placeholder: "目前密碼", autocomplete: "current-password" }), pwNew = h("input", { type: "password", placeholder: "新密碼（至少 8 個字元）", autocomplete: "new-password" });
      const changePw = async () => {
        if (pwNew.value.length < 8) { await msg.warn("提醒", "新密碼至少 8 個字元"); return; }
        try {
          const st = await this.store.status(), r = await this.store.changePassword(pwOld.value, pwNew.value, st.salt);
          if (r.error === "wrong_password") { await msg.warn("提醒", "目前密碼錯誤"); return; }
          pwOld.value = ""; pwNew.value = "";
          await msg.info("完成", "密碼已更新，其他裝置需要重新登入");
        } catch (_e) { await msg.error("錯誤", "連線失敗，請再試一次"); }
      };
      t.append(
        U.accentCard(X.tealL, h("div", { class: "pad" }, U.sectionHeader("🎨", "外觀設定", "切換介面深色／淺色模式（本系統以深色為主要設計，淺色模式效果有限）"), h("div", { class: "row" }, "外觀模式", h("div", { style: { width: "120px" } }, this.setAppearance), this.appearanceChip))),
        U.accentCard(X.orange, h("div", { class: "pad" }, U.sectionHeader("⏱️", "加班相關預設值", "影響月報表加班上限警示燈號，以及打卡登錄分頁的預設值"),
          h("div", { class: "grid4 mb8" }, h("div", {}, U.label("月加班上限(小時)"), this.setCap), h("div", {}, U.label("月加班延長上限(小時)"), this.setCapExt), h("div", {}, U.label("預設休息時間(分鐘)"), this.setBreak)),
          U.sub("⚖️ 延長工時上限需經工會／勞資會議同意（勞基法第32條），且每3個月合計不得超過138小時", { style: { marginBottom: "8px" } }), U.primary("💾 儲存設定", () => this.saveOt(), { class: "btn primary tall full" }))),
        U.accentCard(X.gold, h("div", { class: "pad" }, U.sectionHeader("⚖️", "法規異動偵測", "連線法務部「全國法規資料庫」比對勞動基準法官方頁面的修正日期是否變動；僅負責偵測並提醒人工確認，不會自動修改本軟體的試算邏輯"), this.lawStatus,
          h("div", { class: "row" }, U.primary("🔎 立即檢查勞基法是否有修正", () => this.checkLaw(true), { class: "btn primary tall" }), U.ghost("🔗 開啟官方法規頁面", () => window.open(C.LAW_CHECK_URL, "_blank", "noopener"), { class: "btn ghost tall" })))),
        U.accentCard(X.teal, h("div", { class: "pad" }, U.sectionHeader("🗓️", "排班班表顯示設定", "調整「本週班表」卡片內文字大小，拖曳後立即套用"), h("div", { class: "row", style: { flexWrap: "nowrap" } }, h("span", { text: "卡片文字大小", style: { whiteSpace: "nowrap" } }), this.setFont, this.fontLabel))),
        U.accentCard(X.gold, h("div", { class: "pad" }, h("div", { class: "row mb8" }, h("div", { class: "sec", style: { margin: 0 } }, h("div", { class: "badge", text: "🏷️" }), h("div", {}, h("div", { class: "sec-t", text: "時段備註標籤設定" }), h("div", { class: "sec-s", text: "設定「排班班表」時段可勾選的備註標籤（地點／職務等），供快速標記" }))), this.tagCount),
          this.tagsFrame, h("div", { class: "row", style: { flexWrap: "nowrap" } }, h("div", { class: "grow" }, this.newTag), U.primary("➕ 新增標籤", () => this.addTag(), { style: { height: "36px" } })))),
        U.accentCard(X.red, h("div", { class: "pad" }, U.sectionHeader("💾", "資料備份／還原", "目前資料儲存於：Google 試算表"),
          h("div", { class: "banner mb8" }, h("div", { class: "accent", style: { background: X.red } }), h("div", { style: { padding: "8px 12px", color: X.red }, text: "⚠️ 「從備份還原」將覆蓋目前所有資料（員工、出勤、假別、排班、設定），且無法復原，請確認備份檔案來源正確" })),
          h("div", { class: "row" }, U.primary("📤 匯出備份", () => this.exportBackup(), { class: "btn primary tall" }), U.danger("📥 從備份還原", () => this.restoreBackup(), { class: "btn danger tall" })))),
        U.accentCard(X.purple, h("div", { class: "pad" }, U.sectionHeader("🔐", "登入與帳號", "網頁版用密碼保護資料；更換密碼後其他裝置需重新登入"),
          h("div", { class: "grid4 mb8" }, h("div", {}, pwOld), h("div", {}, pwNew), U.primary("更新密碼", changePw, { class: "btn primary" }), U.ghost("登出這台裝置", async () => { await this.store.logout(); location.reload(); })))));
      this.renderLawStatus();
    },
    loadSettingsIntoForm() {
      if (!this.setCap) return;
      const s = this.db.settings;
      this.setAppearance.set(s.appearanceMode === "light" ? "淺色" : "深色");
      this.renderAppearanceChip();
      this.setCap.value = C.g(s.otMonthlyCap); this.setCapExt.value = C.g(s.otMonthlyCapExtended); this.setBreak.value = C.g(s.defaultBreakMin);
      const font = Number(s.scheduleCellFontSize || 10);
      this.setFont.value = font; this.fontLabel.textContent = font;
      this.renderTags();
    },
    renderAppearanceChip() { this.appearanceChip.textContent = this.setAppearance.get() === "深色" ? "🌙 深色模式運作中" : "☀️ 淺色模式運作中"; },
    changeAppearance(label) {
      const mode = label === "深色" ? "dark" : "light";
      document.body.dataset.mode = mode;
      this.db.settings.appearanceMode = mode;
      this.persist();
      this.renderAppearanceChip();
    },
    onFontSize() {
      const size = Math.round(Number(this.setFont.value));
      this.fontLabel.textContent = size;
      this.db.settings.scheduleCellFontSize = size;
      clearTimeout(this.fontJob);
      this.fontJob = setTimeout(() => this.persist(), 300);
      this.renderScheduleGrid();
    },
    renderTags() {
      const tags = this.db.settings.shiftNoteTags;
      clear(this.tagCount).append(U.chip("🏷️", tags.length, "個標籤", X.gold).el);
      const f = clear(this.tagsFrame);
      if (!tags.length) { f.append(U.sub("尚未設定任何標籤")); return; }
      tags.forEach((tag) => f.append(h("span", { class: "tag-chip" }, tag, h("button", { text: "✖", type: "button", onclick: () => this.removeTag(tag) }))));
    },
    async addTag() {
      const name = this.newTag.value.trim();
      if (!name) return;
      if (this.db.settings.shiftNoteTags.includes(name)) { await msg.warn("提醒", "此標籤已存在"); return; }
      this.db.settings.shiftNoteTags.push(name);
      this.persist();
      this.newTag.value = "";
      this.renderTags();
    },
    async removeTag(tag) {
      if (!(await msg.ask("確認移除", `確定要移除標籤「${tag}」嗎？`))) return;
      this.db.settings.shiftNoteTags = this.db.settings.shiftNoteTags.filter((t) => t !== tag);
      this.persist();
      this.renderTags();
    },
    async saveOt() {
      const cap = num(this.setCap.value), ext = num(this.setCapExt.value), br = num(this.setBreak.value);
      if ([cap, ext, br].some(Number.isNaN)) { await msg.warn("提醒", "請確認欄位皆為數字"); return; }
      if (ext < cap) { await msg.warn("提醒", "延長工時上限需大於或等於一般上限"); return; }
      Object.assign(this.db.settings, { otMonthlyCap: cap, otMonthlyCapExtended: ext, defaultBreakMin: br });
      this.persist();
      this.renderReport();
      await msg.info("完成", "已儲存設定；預設休息時間將於下次開啟打卡登錄頁時套用。");
    },
    renderLawStatus() {
      const c = this.store.lawCache;
      this.lawStatus.textContent = c.laborStandardsActDate ? `目前記錄的修正日期：${c.laborStandardsActDate}` + (c.lastCheckedAt ? `（上次檢查：${c.lastCheckedAt}）` : "") : "尚未檢查過，點擊「立即檢查」以建立比對基準。";
    },
    async checkLaw(manual) {
      if (this.lawRunning) { if (manual) await msg.info("請稍候", "已在檢查中，請稍候。"); return; }
      this.lawRunning = true;
      let result = null;
      try { result = (await this.store.call("lawCheck")).result; } catch (_e) { /* 視同失敗 */ }
      this.lawRunning = false;
      if (!result) {
        if (manual) await msg.warn("檢查失敗", `無法連線至全國法規資料庫官方頁面，請確認網路連線後再試一次。\n${C.LAW_CHECK_URL}`);
        this.renderLawStatus();
        return;
      }
      const cached = this.store.lawCache.laborStandardsActDate, changed = !!cached && cached !== result, n = new Date();
      this.store.lawCache = { laborStandardsActDate: result, lastCheckedAt: `${C.todayIso()} ${C.pad2(n.getHours())}:${C.pad2(n.getMinutes())}` };
      this.persist();
      this.renderLawStatus();
      if (changed) await msg.warn(`⚠ 偵測到${C.LAW_CHECK_NAME}異動`, `官方「全國法規資料庫」顯示${C.LAW_CHECK_NAME}的修正日期已從「${cached}」變更為「${result}」。\n\n本軟體不會自動修改加班／工時試算邏輯，請人工至官方網站確認本次修法內容，\n並視需要調整程式後再繼續使用試算結果：\n${C.LAW_CHECK_URL}`);
      else if (manual) await msg.info("檢查完成", cached ? `目前${C.LAW_CHECK_NAME}修正日期為「${result}」，與上次記錄相同，未偵測到異動。` : `目前${C.LAW_CHECK_NAME}修正日期為「${result}」，已記錄供下次比對之用。`);
    },
    async exportBackup() {
      const name = `attendance_backup_${C.todayIso()}.json`;
      U.download(name, JSON.stringify(this.db, null, 2), "application/json");
      await msg.info("完成", `已匯出備份：${name}`);
    },
    async restoreBackup() {
      const f = await U.pickFile(".json,application/json");
      if (!f) return;
      let raw;
      try { raw = JSON.parse(await f.text()); } catch (_e) { await msg.error("錯誤", "無法讀取此檔案，請確認是否為有效的備份 JSON 檔"); return; }
      if (!(await msg.ask("確認還原", "還原備份將覆蓋目前所有資料（員工、出勤、假別、排班、設定），確定要繼續嗎？"))) return;
      try { await this.store.replaceAll(raw); }
      catch (_e) { await msg.error("錯誤", "上傳到 Google 試算表失敗，請檢查網路後再試一次"); return; }
      this.L.db = this.store.db;
      document.body.dataset.mode = this.db.settings.appearanceMode;
      this.loadSettingsIntoForm();
      this.refreshAll();
      await msg.info("完成", "已還原備份資料");
    },
  });
})();
