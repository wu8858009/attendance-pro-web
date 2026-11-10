/* 主程式：啟動、登入、外框、打卡登錄、出勤記錄、員工設定（對應桌面版 AttendanceApp 前半） */
(function () {
  "use strict";
  const C = window.Core, U = window.UI, { h, clear, msg } = U, X = U.COLORS;
  const { DAYTYPE_KEY, DAYTYPE_LABEL, EMP_TYPE_LABEL, EMP_TYPE_KEY, Logic } = C;
  const empLabel = (e) => `${e.name}（${EMP_TYPE_LABEL[e.type]}）`;
  const num = (s) => { const t = String(s).trim(); return t !== "" && Number.isFinite(Number(t)) ? Number(t) : NaN; };

  const NAV_DEFS = [
    ["📊 月報表", "📊", "月報表"], ["✏️ 打卡登錄", "✏️", "打卡登錄"], ["📋 出勤記錄", "📋", "出勤記錄"], ["👥 員工設定", "👥", "員工設定"],
    ["🗓️ 排班班表", "🗓️", "排班班表"], ["🌴 特休/補休", "🌴", "特休/補休"], ["📖 勞工局說明", "📖", "勞工局說明"], ["🛠️ 軟體設定", "🛠️", "軟體設定"],
    ["📘 使用說明書", "📘", "使用說明書"], ["🏮 農民曆", "🏮", "農民曆"], ["🔐 帳號權限", "🔐", "帳號權限"],
  ];
  // 各分頁對應的權限項目；沒列出的分頁（說明、農民曆、帳號）每個人都能開
  const NAV_MOD = { "📊 月報表": "report", "✏️ 打卡登錄": "punch", "📋 出勤記錄": "records", "👥 員工設定": "employees", "🗓️ 排班班表": "schedule", "🌴 特休/補休": "leave", "🛠️ 軟體設定": "settings" };
  const FLAG_META = { ot: ["🟠", X.orange], leave: ["🔴", X.red], normal: ["🟢", X.green] };

  class App {
    constructor() {
      this.store = new window.Store(window.CONFIG.CLOUD_URL);
      this.calendar = {};
      this.calFetching = new Set();
      this.L = new Logic({});
    }
    get db() { return this.store.db; }
    root() { return document.getElementById("root"); }
    get me() { return this.store.me || { perms: {}, admin: false, name: "", username: "" }; }
    perm(m) { return this.me.perms[m] || "none"; }
    can(m) { return this.perm(m) === "edit"; }
    tabAllowed(n) { const m = NAV_MOD[n]; return !m || this.perm(m) !== "none"; }

    // ---- 啟動與登入 ----
    static boot() { window.app = new App(); window.app.start(); }
    async start() {
      if (!window.CONFIG.CLOUD_URL) {
        clear(this.root()).append(h("div", { class: "center" }, "尚未設定後端網址（js/config.js 的 CLOUD_URL）"));
        return;
      }
      await this.loadCalendarBase();
      if (this.store.token) { await this.enter(); return; }
      await this.showLogin();
    }
    async loadCalendarBase() {
      try { this.calendar = await (await fetch("data/taiwan_calendar.json")).json(); } catch (_e) { this.calendar = {}; }
      try { Object.assign(this.calendar, JSON.parse(localStorage.getItem("att_calendar") || "{}")); } catch (_e) { /* 快取壞了就重抓 */ }
    }
    splash(text) {
      const prog = h("div", { class: "prog ind" }, h("i"));
      this.splashText = h("div", { class: "sub", text, style: { marginBottom: "10px" } });
      clear(this.root()).append(h("div", { class: "center" }, h("div", { class: "card login" }, h("div", { class: "pad" },
        h("div", { class: "sec" }, h("div", { class: "badge", text: "⏱" }), h("div", {}, h("div", { class: "sec-t", text: "員工出勤管理系統 PRO" }), h("div", { class: "sec-s", text: "Enterprise Attendance & Overtime Console" }))),
        this.splashText, prog))));
    }
    async showLogin(notice) {
      this.splash("連線中…");
      let st;
      try { st = await this.store.status(); }
      catch (_e) {
        this.splashText.textContent = "無法連線到 Google 試算表，請檢查網路後重新整理。";
        return;
      }
      const setup = st.needsSetup;
      const user = setup ? null : h("input", { type: "text", autocomplete: "username", placeholder: "帳號", value: localStorage.getItem("att_user") || "" });
      const pw = h("input", { type: "password", autocomplete: setup ? "new-password" : "current-password", placeholder: "密碼" });
      const pw2 = setup ? h("input", { type: "password", autocomplete: "new-password", placeholder: "再輸入一次密碼" }) : null;
      const err = h("div", { class: "err", text: notice || "", style: { minHeight: "20px", margin: "6px 0" } });
      const go = U.primary(setup ? "設定密碼並開始使用" : "登入", null, { class: "btn primary taller" });
      const submit = async () => {
        if (setup && pw.value.length < 8) { err.textContent = "密碼至少 8 個字元"; return; }
        if (setup && pw.value !== pw2.value) { err.textContent = "兩次輸入的密碼不一致"; return; }
        if (!pw.value || (user && !user.value.trim())) { err.textContent = "請輸入帳號與密碼"; return; }
        go.disabled = true; err.textContent = setup ? "設定中…" : "登入中…";
        try {
          const r = setup ? await this.store.setup(pw.value, st.salt) : await this.store.login(user.value.trim(), pw.value, st.salt);
          if (r.token) { if (user) localStorage.setItem("att_user", user.value.trim()); await this.enter(); return; }
          err.textContent = { wrong_password: "帳號或密碼錯誤", locked: "錯誤次數過多，請 10 分鐘後再試", already_setup: "密碼已設定過，請重新整理後登入" }[r.error] || "登入失敗";
        } catch (_e) { err.textContent = "連線失敗，請再試一次"; }
        go.disabled = false;
      };
      go.addEventListener("click", submit);
      const form = h("div", { class: "pad" },
        h("div", { class: "sec" }, h("div", { class: "badge", text: "⏱" }), h("div", {}, h("div", { class: "sec-t", text: "員工出勤管理系統 PRO" }), h("div", { class: "sec-s", text: setup ? "第一次使用：請設定管理密碼" : "請輸入帳號與密碼" }))),
        user ? h("div", { class: "mb8" }, user) : null, h("div", { class: "mb8" }, pw), pw2 ? h("div", { class: "mb8" }, pw2) : null, err, go);
      form.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
      clear(this.root()).append(h("div", { class: "center" }, h("div", { class: "card login" }, form)));
      (user && !user.value ? user : pw).focus();
    }
    showForceChange() {                 // 暫時密碼第一次登入，要改成自己的密碼才能使用
      const oldPw = h("input", { type: "password", autocomplete: "current-password", placeholder: "暫時密碼" });
      const pw1 = h("input", { type: "password", autocomplete: "new-password", placeholder: "新密碼（至少 8 個字元）" });
      const pw2 = h("input", { type: "password", autocomplete: "new-password", placeholder: "再輸入一次新密碼" });
      const err = h("div", { class: "err", style: { minHeight: "20px", margin: "6px 0" } });
      const go = U.primary("更新密碼並開始使用", null, { class: "btn primary taller" });
      const submit = async () => {
        if (pw1.value.length < 8) { err.textContent = "新密碼至少 8 個字元"; return; }
        if (pw1.value !== pw2.value) { err.textContent = "兩次輸入的新密碼不一致"; return; }
        if (pw1.value === oldPw.value) { err.textContent = "新密碼不能和暫時密碼相同"; return; }
        go.disabled = true; err.textContent = "更新中…";
        try {
          const st = await this.store.status(), r = await this.store.changePassword(oldPw.value, pw1.value, st.salt);
          if (r.token) { await this.enter(); return; }
          err.textContent = r.error === "wrong_password" ? "暫時密碼錯誤" : "更新失敗";
        } catch (_e) { err.textContent = "連線失敗，請再試一次"; }
        go.disabled = false;
      };
      go.addEventListener("click", submit);
      const form = h("div", { class: "pad" },
        h("div", { class: "sec" }, h("div", { class: "badge", text: "🔐" }), h("div", {}, h("div", { class: "sec-t", text: "請設定自己的密碼" }), h("div", { class: "sec-s", text: "這是第一次登入或密碼已被重設，改好才能繼續使用" }))),
        h("div", { class: "mb8" }, oldPw), h("div", { class: "mb8" }, pw1), h("div", { class: "mb8" }, pw2), err, go,
        U.ghost("登出", async () => { await this.store.logout(); location.reload(); }, { style: { marginTop: "8px" } }));
      form.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
      clear(this.root()).append(h("div", { class: "center" }, h("div", { class: "card login" }, form)));
      oldPw.focus();
    }
    async enter() {
      this.splash("讀取 Google 試算表資料…");
      try { await this.store.load(); }
      catch (e) {
        if (e.message === "auth") { await this.showLogin("登入已過期，請重新登入"); return; }
        if (e.message === "must_change") { this.showForceChange(); return; }
        this.splashText.textContent = "讀取資料失敗，請檢查網路後重新整理。";
        return;
      }
      this.L.db = this.store.db;
      this.store.onStatus = () => this.refreshFooter();
      this.meJson = JSON.stringify(this.store.me);
      this.store.onRemote = () => {                     // 只更新畫面，不重帶正在填的表單；權限被改了就整頁重開
        if (JSON.stringify(this.store.me) !== this.meJson) { location.reload(); return; }
        this.L.db = this.store.db; this.refreshAll();
      };
      this.store.onForbidden = () => { this.L.db = this.store.db; this.refreshAll(); msg.warn("沒有權限", "這個帳號不能做這項修改，內容已還原。"); };
      this.store.onAuthLost = () => this.showLogin("登入已過期，請重新登入");
      window.addEventListener("beforeunload", (e) => { if (this.store.dirty) { e.preventDefault(); e.returnValue = ""; } });
      this.buildShell();
      document.body.dataset.mode = this.db.settings.appearanceMode;
      this.buildEntryTab(); this.buildRecordsTab(); this.buildEmployeesTab(); this.buildScheduleTab(); this.buildLeaveTab();
      this.buildReportTab(); this.buildHelpTab(); this.buildSettingsTab(); this.buildManualTab(); this.buildAlmanacTab(); this.buildAccountTab();
      for (const [n] of NAV_DEFS) if (NAV_MOD[n] && !this.can(NAV_MOD[n])) this.tabs[n].classList.add("ro");
      this.selectTab(this.navOrder.includes("✏️ 打卡登錄") ? "✏️ 打卡登錄" : this.navOrder.find((n) => NAV_MOD[n]) || this.navOrder[0]);
      this.refreshAll();
      this.bindShortcuts();
      if (this.can("settings")) this.checkLaw(false);
    }

    // ---- 外框 ----
    buildShell() {
      const wd = C.WEEKDAY_LABELS[C.weekday(C.today())];
      this.burger = h("button", { class: "burger", text: "☰", type: "button", onclick: () => this.sidebar.classList.toggle("open") });
      const hdr = h("div", { class: "hdr" },
        h("div", { class: "hdr-left" }, this.burger, h("div", { class: "logo", text: "⏱" }),
          h("div", {}, h("div", { class: "hdr-title" }, "員工出勤管理系統", h("span", { class: "pro", text: "PRO" })), h("div", { class: "hdr-sub", text: "Enterprise Attendance & Overtime Console" }))),
        h("div", { class: "hdr-right" }, h("div", { class: "hdr-date", text: `📅 ${C.todayIso()}（星期${wd}）` }), h("div", { class: "hdr-note", text: `👤 ${this.me.name || this.me.username}　內部行政試算輔助工具` })));

      this.navList = h("div", {});
      this.sidebar = h("div", { class: "sidebar" }, h("div", { class: "side-h", text: "功能選單" }), h("div", { class: "side-s", text: "拖曳項目可調整順序" }),
        h("button", { class: "side-k", text: "⌨ 快捷鍵說明（F1）", type: "button", onclick: () => this.showShortcutHelp() }), this.navList);
      this.navLabels = {};
      NAV_DEFS.forEach(([n, i, t]) => { this.navLabels[n] = [i, t]; });
      const saved = (this.db.settings.navOrder || []).filter((n) => this.navLabels[n]);
      this.navOrder = saved.concat(NAV_DEFS.map((d) => d[0]).filter((n) => !saved.includes(n))).filter((n) => this.tabAllowed(n));
      this.navItems = {};
      this.navOrder.forEach((n) => this.makeNav(n));
      this.repackNav();

      this.content = h("div", { class: "content" });
      this.tabs = {};
      for (const [n] of NAV_DEFS) { this.tabs[n] = h("div", { class: "tab" }); this.content.append(this.tabs[n]); }
      this.footerStat = h("span");
      this.footerSync = h("span", { class: "r" });
      const ftr = h("div", { class: "ftr" }, this.footerStat, this.footerSync);
      clear(this.root()).append(h("div", { class: "app" }, hdr, h("div", { class: "body" }, this.sidebar, this.content), ftr));
    }
    makeNav(name) {
      const [icon, text] = this.navLabels[name];
      const key = h("span", { class: "nav-k" });
      const row = h("div", { class: "nav" }, h("span", { class: "nav-i", text: icon }), h("span", { class: "nav-t", text }), key);
      row.keyEl = key;
      row.addEventListener("pointerdown", (e) => this.navDragStart(e, name));
      this.navItems[name] = row;
    }
    repackNav() {
      clear(this.navList);
      this.navOrder.forEach((n, i) => {
        this.navList.append(this.navItems[n]);
        this.navItems[n].keyEl.textContent = i < 10 ? `Ctrl+${(i + 1) % 10}` : "";
      });
    }
    navDragStart(e, name) {
      this.selectTab(name);
      const rowH = this.navItems[name].offsetHeight + 6, top = this.navList.getBoundingClientRect().top;
      let moved = false;
      const move = (ev) => {
        const idx = Math.max(0, Math.min(this.navOrder.length - 1, Math.floor((ev.clientY - top) / rowH)));
        const cur = this.navOrder.indexOf(name);
        if (idx !== cur) { this.navOrder.splice(idx, 0, this.navOrder.splice(cur, 1)[0]); this.repackNav(); moved = true; }
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        if (moved) { this.db.settings.navOrder = this.navOrder.slice(); this.persist(); }
        else this.sidebar.classList.remove("open");
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    }
    selectTab(name) {
      for (const n in this.tabs) this.tabs[n].classList.toggle("on", n === name);
      this.navSelected = name;
      for (const n in this.navItems) this.navItems[n].classList.toggle("sel", n === name);
      this.onTabChange();
    }
    onTabChange() {
      const n = this.navSelected;
      if (n === "✏️ 打卡登錄") this.applyScheduleToEntry(true);
      else if (n === "📋 出勤記錄") { this.refreshRecordsFilters(); this.renderRecords(); }
      else if (n === "👥 員工設定") this.renderEmployees();
      else if (n === "🗓️ 排班班表") this.renderScheduleGrid();
      else if (n === "🌴 特休/補休") { this.refreshLeaveCombos(); this.renderAnnualCard(); this.renderCompCard(); this.renderLeaveLedger(); this.autofillCompEntry(true); }
      else if (n === "📊 月報表") { this.refreshReportMonth(); this.renderReport(); }
      else if (n === "🛠️ 軟體設定") this.loadSettingsIntoForm();
      else if (n === "🏮 農民曆") this.renderAlmanac();
      else if (n === "🔐 帳號權限") this.renderAccounts();
    }
    refreshAll() {
      this.refreshEmployeeCombos(); this.refreshRecordsFilters(); this.renderEmployees(); this.renderRecords(); this.renderScheduleGrid();
      this.refreshLeaveCombos(); this.renderAnnualCard(); this.renderCompCard(); this.renderLeaveLedger(); this.refreshReportMonth();
      this.renderReport(); this.loadSettingsIntoForm(); this.refreshFooter();
    }
    persist() { this.store.persist(); this.refreshFooter(); }
    refreshFooter() {
      if (!this.footerStat) return;
      const active = this.db.employees.filter((e) => e.isActive !== false).length;
      this.footerStat.textContent = `員工人數：${active}　｜　出勤紀錄：${this.db.records.length} 筆　｜　假別紀錄：${this.db.leaveLedger.length} 筆`;
      this.footerSync.textContent = this.store.statusText();
      this.footerSync.classList.toggle("err", this.store.failed);
    }
    bindShortcuts() {
      document.addEventListener("keydown", (e) => {
        if (document.querySelector(".overlay") && e.key !== "Escape") return;
        if (e.key === "F1") { e.preventDefault(); this.showShortcutHelp(); return; }
        if (e.key === "Escape") { this.closeShiftPopup(); return; }
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        if (/^[0-9]$/.test(e.key)) {
          const n = e.key === "0" ? 10 : Number(e.key);
          if (n <= this.navOrder.length) { e.preventDefault(); this.selectTab(this.navOrder[n - 1]); }
        } else if (e.key.toLowerCase() === "o" && this.navSelected === App.SCHEDULE_TAB) { e.preventDefault(); this.scheduleImportPhoto(); }
      });
      document.addEventListener("paste", (e) => {     // 游標在文字框裡時照常貼上文字，不當成讀取截圖
        if (this.navSelected !== App.SCHEDULE_TAB || /INPUT|TEXTAREA/.test(document.activeElement.tagName) || document.querySelector(".overlay")) return;
        const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
        if (item) { e.preventDefault(); this.scheduleReadImage(item.getAsFile()); }
        else msg.info("提示", "剪貼簿裡沒有圖片。\n請先截圖或複製班表圖片，再按這個按鈕。");
      });
      setInterval(() => { if (this.navSelected === App.SCHEDULE_TAB && !document.hidden) this.renderWeekRoster(); }, 60000);
    }
    showShortcutHelp() {
      msg.info("快捷鍵說明",
        "任何頁面\n    Ctrl + 1～9　切換到左側選單第 1～9 個分頁\n    Ctrl + 0　　 切換到左側選單第 10 個分頁\n" +
        "　　　　　　　　（依目前選單排列順序，拖曳調整後跟著變）\n    F1　　　　　 顯示這個說明\n\n完整功能說明請看左側選單「📘 使用說明書」\n\n" +
        "排班班表頁\n    Ctrl + O　　 讀取班表照片\n    Ctrl + V　　 貼上截圖讀取班表\n　　　　　　　　（游標在文字框裡時照常貼上文字）");
    }
    statusBanner(flag, title, subtitle) {
      const [icon, accent] = FLAG_META[flag];
      return h("div", { class: "banner" }, h("div", { class: "accent", style: { background: accent } }),
        h("div", { class: "b" }, h("div", { class: "t", text: `${icon}  ${title}`, style: { color: accent } }), subtitle ? h("div", { class: "sub", text: subtitle, style: { marginTop: "2px" } }) : null));
    }
    openLineWindow(text, opt) {
      opt = Object.assign({ subtitle: "可編輯後再複製，貼到LINE群組通知同仁", modal: true, boxHeight: 320 }, opt);
      const box = h("textarea", { value: text, style: { height: opt.boxHeight + "px", background: "var(--surface)", border: "0", borderRadius: "10px", padding: "8px", resize: "vertical", fontSize: "12px" } });
      const toast = h("span", { style: { color: X.green, fontWeight: 700, fontSize: "12px" } });
      let job = null;
      const win = { alive: true };
      const close = () => { win.alive = false; host.remove(); };
      const doCopy = async () => {
        await U.copyText(box.value, box);
        toast.textContent = "✅ 已複製，可直接貼到LINE";
        clearTimeout(job);
        job = setTimeout(() => { toast.textContent = ""; }, 1500);
      };
      const panel = h("div", { class: "dlg pad", style: { width: "560px", maxWidth: "100%" } },
        U.sectionHeader("📋", opt.title || "待辦通知內容", opt.subtitle), h("div", { class: "mb8" }, box),
        h("div", { class: "row" }, U.primary("📋 複製文字", doCopy), U.ghost("關閉", close), toast));
      const host = opt.modal ? U.modal(panel) : h("div", { class: "float" }, panel);
      if (!opt.modal) document.body.append(host);
      win.box = box;
      win.close = close;
      return win;
    }

    // ==================== 打卡登錄 ====================
    buildEntryTab() {
      const t = this.tabs["✏️ 打卡登錄"];
      this.fEmp = new U.OptionMenu([], () => this.applyScheduleToEntry());
      this.fDaytype = new U.OptionMenu(C.DAYTYPE_OPTIONS, (v) => this.onEntryDaytypeChange(v));
      this.fDaytype.set("平日");
      this.fDate = new U.DateEntry(() => this.applyScheduleToEntry());
      this.fDate.set(C.todayIso());
      this.fDate.input.addEventListener("change", () => this.onEntryDateTyped());
      this.fDate.input.addEventListener("keydown", (e) => { if (e.key === "Enter") this.onEntryDateTyped(); });
      this.segmentsFrame = h("div", {});
      this.entrySegments = [];
      this.segmentAddBtn = U.ghost("➕ 新增時段（最多3段）", () => { if (this.entrySegments.length < 3) { this.addSegmentRow(); this.updatePreview(); } });
      this.addSegmentRow("09:00", "18:00", false);
      this.fBreak = U.input("", { value: C.g(this.db.settings.defaultBreakMin), oninput: () => this.onBreakKey() });
      this.lastBreakVal = this.fBreak.value.trim();
      this.fSchedDisplay = h("div", { text: "-", style: { font: "700 15px var(--font)", color: X.tealL, lineHeight: "28px" } });
      this.fSchedPt = U.input("留空=不限", { oninput: () => this.updatePreview(), style: { display: "none", maxWidth: "110px" } });
      this.fNote = U.input("例如：客戶臨時加單、補休安排...");
      this.previewFrame = h("div", {});
      this.quickLeaveFrame = h("div", { class: "row", style: { marginTop: "10px" } });

      const basic = U.card(h("div", { class: "pad" },
        U.sectionHeader("📇", "新增出勤紀錄", "選擇員工、日別與日期，填寫上下班時段（最多3段）、休息時間與備註"),
        h("div", { class: "grid4 mb4" },
          h("div", {}, U.label("員工"), this.fEmp), h("div", {}, U.label("日別"), this.fDaytype),
          h("div", { class: "s2" }, U.label("日期 (YYYY-MM-DD)"), h("div", { class: "row", style: { flexWrap: "nowrap" } }, h("div", { class: "grow" }, this.fDate), U.ghost("今天", () => { this.fDate.set(C.todayIso()); this.applyScheduleToEntry(); })))),
        h("div", { class: "divider" }), this.segmentsFrame, this.segmentAddBtn, h("div", { class: "divider" }),
        h("div", { class: "grid4 mb4" },
          h("div", { class: "s2" }, U.label("休息時間(分鐘)"), this.fBreak),
          h("div", { class: "s2" }, U.label("應班時數(排定工時)"), this.fSchedDisplay, this.fSchedPt)),
        U.label("備註(選填)"), this.fNote));
      const preview = U.card(h("div", { class: "pad", style: { display: "flex", flexDirection: "column", height: "100%" } },
        U.sectionHeader("🔍", "判定預覽", "系統依目前輸入的時段即時試算，可送出前先行確認"),
        h("div", { class: "grow" }, this.previewFrame, this.quickLeaveFrame),
        U.primary("💾 儲存紀錄並自動判定", () => this.saveRecord(), { class: "btn primary taller wr", style: { marginTop: "14px" } })));
      const note = h("div", { class: "pad" }, U.sectionHeader("ℹ️", "判定邏輯說明"),
        [["🟠", "實際工時 > 應班時數 → 需送出加班單，依勞基法試算加班費倍率"], ["🔴", "實際工時 < 應班時數 → 需送出請假單，並可一鍵登記特休／補休"],
          ["🛡️", "另會檢查休息時間、單日工時上限、換班間隔等基本合規事項"]].map(([i, s]) => h("div", { class: "row mb4", style: { flexWrap: "nowrap" } }, h("span", { text: i }), h("span", { class: "sub", text: s }))));
      t.append(h("div", { class: "pair p32" }, basic, preview), U.card(note));
      this.entryHint = null;
    }
    addSegmentRow(defIn = "09:00", defOut = "18:00", removable = true) {
      const idx = this.entrySegments.length;
      const fIn = new U.TimeDropdown(defIn, () => this.updatePreview());
      const fOut = new U.TimeDropdown(defOut, () => { this.updatePreview(); this.scheduleEntryNotice(); });
      const loc = U.input("例如：總公司、客戶端、居家", { oninput: () => this.updatePreview() });
      const seg = { in: fIn, out: fOut, loc };
      seg.row = h("div", { class: "grid3 mb8", style: removable ? { gridTemplateColumns: "1fr 1fr 1fr 32px" } : null },
        h("div", {}, U.label(`時段${idx + 1} 上班`), fIn), h("div", {}, U.label(`時段${idx + 1} 下班`), fOut), h("div", {}, U.label("地點(選填)"), loc),
        removable ? U.danger("✖", () => this.removeSegmentRow(seg), { style: { padding: 0 } }) : null);
      this.segmentsFrame.append(seg.row);
      this.entrySegments.push(seg);
      this.updateSegmentAddBtn();
      return seg;
    }
    removeSegmentRow(seg) {
      seg.row.remove();
      this.entrySegments.splice(this.entrySegments.indexOf(seg), 1);
      this.updateSegmentAddBtn();
      this.updatePreview();
    }
    updateSegmentAddBtn() { this.segmentAddBtn.style.display = this.entrySegments.length >= 3 ? "none" : ""; }
    getEntrySegments() {
      return this.entrySegments.map((s) => ({ in: s.in.get().trim(), out: s.out.get().trim(), location: s.loc.value.trim() })).filter((s) => s.in && s.out);
    }
    resetEntrySegments(segments) {
      this.entrySegments.forEach((s) => s.row.remove());
      this.entrySegments = [];
      segments.forEach((seg, i) => {
        const s = this.addSegmentRow(seg.in || "09:00", seg.out || "18:00", i > 0);
        s.loc.value = seg.location || seg.note || "";
      });
      this.updateSegmentAddBtn();
    }
    onBreakKey() {
      const v = this.fBreak.value.trim();
      if (v === this.lastBreakVal) return;
      this.lastBreakVal = v;
      this.updatePreview();
      if (!Number.isNaN(num(v))) this.scheduleEntryNotice();
    }
    scheduleEntryNotice() { clearTimeout(this.noticeJob); this.noticeJob = setTimeout(() => this.showEntryNotice(), 800); }
    buildEntryNotice() {
      const emp = this.selectedEntryEmp(), dateStr = this.fDate.get().trim(), segs = this.getEntrySegments();
      if (!emp || !segs.length || !C.parseDate(dateStr)) return null;
      const breakMin = num(this.fBreak.value || "0");
      const sched = this.getScheduledHours(emp, segs, breakMin);
      if (Number.isNaN(breakMin) || Number.isNaN(sched)) return null;
      return this.L.recordNoticeText({ date: dateStr, dayType: DAYTYPE_KEY[this.fDaytype.get()], segments: segs, clockIn: segs[0].in, clockOut: segs[segs.length - 1].out, breakMin, scheduledHours: sched, empId: emp.id });
    }
    showEntryNotice() {
      const text = this.buildEntryNotice(), win = this.noticeWin, alive = win && win.alive;
      if (text === null) { if (alive) win.box.value = "✅ 目前工時正常，無需送加班單／請假單"; return; }
      if (alive) { win.box.value = text; return; }
      const emp = this.selectedEntryEmp();
      this.noticeWin = this.openLineWindow(text, { subtitle: `${emp.name}：依調整後的下班時間自動計算，可編輯後再複製貼到LINE`, modal: false, boxHeight: 140 });
    }
    selectedEntryEmp() { return (this.empListAll || []).find((e) => empLabel(e) === this.fEmp.get()) || null; }
    refreshEmployeeCombos() {
      this.empListAll = this.L.sortedEmployees().filter((e) => e.isActive !== false);
      const names = this.empListAll.map(empLabel), cur = this.fEmp.get();
      this.fEmp.configure(names.length ? names : ["請先新增員工"]);
      this.fEmp.set(names.includes(cur) ? cur : (names[0] || "請先新增員工"));
      this.refreshSchedDisplay();
      this.applyScheduleToEntry(true);
    }
    refreshSchedDisplay() {
      const emp = this.selectedEntryEmp(), id = emp ? emp.id : null;
      if (emp && emp.type === "pt") {
        this.fSchedDisplay.style.display = "none"; this.fSchedPt.style.display = "";
        if (id !== this.lastSchedEmpId) this.fSchedPt.value = "";
      } else {
        this.fSchedPt.style.display = "none"; this.fSchedDisplay.style.display = "";
        this.fSchedDisplay.textContent = emp ? `${C.g(emp.normalHours)} hr（依員工設定）` : "-";
      }
      this.lastSchedEmpId = id;
      return emp;
    }
    getScheduledHours(emp, segs, breakMin) {
      if (emp.type === "pt") {
        const raw = this.fSchedPt.value.trim();
        if (raw && raw !== "-") return num(raw);
        if (DAYTYPE_KEY[this.fDaytype.get()] === "typhoon") {
          const shift = this.L.findShift(emp.id, this.fDate.get().trim());
          return shift && !shift.isOff ? C.calcActualHoursSegments(shift.segments || [], breakMin) : 0;
        }
        return C.calcActualHoursSegments(segs, breakMin);
      }
      return Number(emp.normalHours);
    }
    onEntryDaytypeChange(value) {
      if (value === "颱風假") this.resetEntrySegments([{ in: "00:00", out: "00:00" }]);
      else if (this.entryPrevDaytype === "颱風假") {
        this.resetEntrySegments([{ in: "09:00", out: "18:00" }]);
        this.applyScheduleToEntry();
        this.fDaytype.set(value);
      }
      this.entryPrevDaytype = value;
      this.updatePreview();
    }
    onEntryDateTyped() { if (C.parseDate(this.fDate.get().trim())) this.applyScheduleToEntry(true); }
    applyScheduleToEntry(onlyIfChanged) {
      if (!this.empListAll) return;
      let emp = this.selectedEntryEmp();
      const dateStr = this.fDate.get().trim();
      const shift = emp && dateStr ? this.L.findShift(emp.id, dateStr) : null;
      const key = JSON.stringify([emp ? emp.id : null, dateStr, shift]);
      if (onlyIfChanged && key === this.entryAppliedKey) return;
      this.entryAppliedKey = key;
      this.entryHint = null;
      emp = this.refreshSchedDisplay();
      if (emp && dateStr) {
        const holiday = C.taiwanNationalHoliday(this.calendar, dateStr);
        if (shift && shift.isOff) {
          this.entryHint = `⚠ 排班表顯示當日排定為${shift.offType || "休假"}，日別已設為「${holiday ? "國定假日" : "休息日"}」；如為例假日出勤請手動改為「例假日」`;
        } else if (shift) {
          const segs = (shift.segments || []).filter((s) => s.in && s.out);
          if (segs.length) {
            this.resetEntrySegments(segs);
            if (shift.note && !this.fNote.value.trim()) this.fNote.value = shift.note;
            this.entryHint = "✅ 已依「排班班表」帶入當日排定時段與日別，請視實際狀況調整";
          }
        } else this.entryHint = "ℹ 排班班表當日未排班，請手動輸入上下班時間";
        if (holiday) {
          this.fDaytype.set("國定假日");
          this.entryHint = (this.entryHint || "") + `（${holiday}）`;
        } else {
          this.fDaytype.set(shift && shift.isOff ? "休息日" : "平日");
          const sixth = !(shift && shift.isOff) ? this.L.ptSixthWorkdayReason(emp, dateStr) : null;
          if (sixth) {
            this.fDaytype.set("休息日");
            this.entryHint = (this.entryHint || "") + `\n⚠ PT工讀生${sixth}，今天為第6天，日別已自動設為「休息日」`;
          }
        }
      }
      this.entryPrevDaytype = this.fDaytype.get();
      this.updatePreview();
    }
    updatePreview() {
      const pf = clear(this.previewFrame), qf = clear(this.quickLeaveFrame);
      if (!this.empListAll) return;
      const emp = this.selectedEntryEmp();
      if (!emp) { pf.append(U.sub("請先於「員工設定」新增員工")); return; }
      const segs = this.getEntrySegments();
      if (!segs.length) { pf.append(U.sub("請至少填寫一段完整的上下班時間")); return; }
      const breakMin = num(this.fBreak.value || "0"), sched = Number.isNaN(breakMin) ? NaN : this.getScheduledHours(emp, segs, breakMin);
      if (Number.isNaN(breakMin) || Number.isNaN(sched)) { pf.append(U.colored("請確認時間格式為 HH:MM，數值欄位需為數字", X.red)); return; }
      const rec = { empId: emp.id, date: this.fDate.get().trim(), dayType: DAYTYPE_KEY[this.fDaytype.get()], segments: segs, breakMin, scheduledHours: sched };
      let r = this.L.calcRecord(rec, emp);
      const [flag, shift] = this.L.effectiveRecordFlag(rec, r);
      r = Object.assign({}, r, { flag });
      const typhoon = rec.dayType === "typhoon";
      const title = { ot: `需送出${this.L.otFormLabel(rec, shift)}`, leave: typhoon ? "需送出請假單（颱風假）" : "需送出請假單", normal: "工時正常" }[flag];
      const subtitle = {
        ot: `實際工時 ${C.hr(r.actualHours)}hr｜加班 ${C.hr(r.otHours || r.actualHours)}hr`,
        leave: `實際工時 ${C.hr(r.actualHours)}hr，較排定少 ${C.hr(r.shortfall)}hr`, normal: `實際工時 ${C.hr(r.actualHours)}hr`,
      }[flag];
      pf.append(this.statusBanner(flag, title, subtitle));
      if (this.entryHint) pf.append(h("div", { class: "pl sub", style: { whiteSpace: "pre-wrap" }, text: this.entryHint }));
      if ((flag === "ot" || typhoon) && r.detailLines.length) pf.append(h("div", { class: "pl sub" }, r.detailLines.map((l) => h("div", { text: `・${l}` }))));
      if (r.warnings.length) pf.append(h("div", { class: "pl" }, r.warnings.map((w) => U.colored(`⚠ ${w}`, X.orange))));
      if (flag === "leave" && !typhoon && this.can("punch")) {
        const clH = Math.max(0.5, Math.ceil(r.shortfall / 0.5) * 0.5);
        if (emp.type === "fulltime") {
          const alH = [4, 8].find((x) => Math.abs(r.shortfall - x) < 0.01);
          qf.append(alH ? U.btn("ghost", `🌴 登記特休 ${alH}hr`, () => this.quickRegisterAnnual(emp.id, this.fDate.get().trim(), alH))
            : U.btn("ghost", "🌴 登記特休（限缺4／8hr）", null, { disabled: true }));
        }
        qf.append(U.btn("ghost", `➖ 登記補休 ${C.pf(clH)}hr`, () => this.quickRegisterComp(emp.id, this.fDate.get().trim(), clH)));
      }
    }
    async quickRegisterAnnual(empId, date, hours) {
      const emp = this.L.findEmp(empId);
      if (emp && emp.type !== "fulltime") { await msg.warn("提醒", "特休僅限正職員工使用，PT工讀生請改登記補休"); return; }
      if (!emp || !emp.hireDate) { await msg.warn("提醒", "請先於員工設定填寫到職日"); return; }
      this.db.leaveLedger.push({ id: C.newId(), empId, date, type: "annual_use", hours, note: "由出勤缺口自動登記" });
      this.persist();
      await msg.info("完成", `已登記 ${emp.name} 特休 ${hours} 小時`);
      this.renderAnnualCard(); this.renderLeaveLedger();
    }
    async quickRegisterComp(empId, date, hours) {
      const emp = this.L.findEmp(empId);
      if (!emp) return;
      const bal = C.compLeaveBalance(this.db, empId, C.monthKey(date));
      if (hours > bal.remaining && !(await msg.ask("確認", `剩餘補休僅 ${C.hr(bal.remaining)} 小時，是否仍要登記？`))) return;
      this.db.leaveLedger.push({ id: C.newId(), empId, date, type: "comp_use", hours, note: "由出勤缺口自動登記" });
      this.persist();
      await msg.info("完成", `已登記 ${emp.name} 使用補休 ${C.pf(hours)} 小時`);
      this.renderCompCard(); this.renderLeaveLedger();
    }
    async saveRecord() {
      const emp = this.selectedEntryEmp();
      if (!emp) { await msg.warn("提醒", "請先新增並選擇員工"); return; }
      const dateStr = this.fDate.get().trim();
      if (!C.parseDate(dateStr)) { await msg.warn("提醒", "日期格式需為 YYYY-MM-DD"); return; }
      const segs = this.getEntrySegments();
      if (!segs.length) { await msg.warn("提醒", "請至少填寫一段完整的上下班時間"); return; }
      const breakMin = num(this.fBreak.value || "0"), sched = Number.isNaN(breakMin) ? NaN : this.getScheduledHours(emp, segs, breakMin);
      if (Number.isNaN(breakMin) || Number.isNaN(sched)) { await msg.warn("提醒", "時數需為數字"); return; }
      const rec = { id: C.newId(), empId: emp.id, date: dateStr, dayType: DAYTYPE_KEY[this.fDaytype.get()], segments: segs, clockIn: segs[0].in, clockOut: segs[segs.length - 1].out, breakMin, scheduledHours: sched, note: this.fNote.value.trim() };
      if (this.db.records.some((r) => r.empId === emp.id && r.date === dateStr)) {
        await msg.warn("重複登錄", `${emp.name} 在 ${dateStr} 已有出勤紀錄，不能重複輸入。\n如需修改，請先到「出勤記錄」刪除原本那筆再重新登錄。`);
        return;
      }
      this.db.records.push(rec);
      this.persist();
      const r = this.L.calcRecord(rec);
      const [flag, shift] = this.L.effectiveRecordFlag(rec, r);
      await msg.info("儲存完成", flag === "ot" ? `已儲存：⚠ 判定需送出${this.L.otFormLabel(rec, shift)}（加班約 ${C.hr(r.otHours || r.actualHours)} 小時）`
        : flag === "leave" ? `已儲存：⚠ 判定需送出請假單（缺少 ${C.hr(r.shortfall)} 小時）` : "已儲存：✅ 工時正常");
      this.fNote.value = "";
      this.refreshRecordsFilters(); this.refreshReportMonth(); this.updatePreview();
    }

    // ==================== 出勤記錄 ====================
    buildRecordsTab() {
      const t = this.tabs["📋 出勤記錄"], r = () => this.renderRecords();
      this.filterEmp = new U.OptionMenu(["全部員工"], r);
      this.filterMonth = new U.OptionMenu(["全部月份"], r);
      this.filterFlag = new U.OptionMenu(["全部狀態", "需加班單", "需請假單", "正常"], r);
      this.recStats = h("div", { class: "chips", style: { marginTop: "14px" } });
      this.recTree = new U.Table([
        { key: "date", title: "日期", width: 95 }, { key: "emp", title: "員工", width: 90 }, { key: "daytype", title: "日別", width: 70 }, { key: "shift", title: "排定班表", width: 150 },
        { key: "time", title: "時段(含地點)", width: 200 }, { key: "sched", title: "應班", width: 50 }, { key: "actual", title: "實際", width: 50 }, { key: "status", title: "狀態", width: 100 },
        { key: "del", title: "", width: 40, onClick: (row) => this.deleteRecord(row.key) },
      ], { onSelect: () => this.showRecordDetail() });
      this.recDetail = h("div", {});
      t.append(
        U.card(h("div", { class: "pad" }, U.sectionHeader("🔍", "篩選條件", "依員工、月份、狀態縮小查詢範圍"),
          h("div", { class: "grid4" }, h("div", {}, U.sub("員工"), this.filterEmp), h("div", {}, U.sub("月份"), this.filterMonth), h("div", {}, U.sub("狀態"), this.filterFlag),
            U.ghost("🔄 清除篩選", () => { this.filterEmp.set("全部員工"); this.filterMonth.set("全部月份"); this.filterFlag.set("全部狀態"); r(); })), this.recStats)),
        U.card(h("div", { style: { padding: "12px 16px 0" } }, U.sectionHeader("📋", "出勤紀錄清單", "點擊列表中的紀錄可於下方查看完整判定詳情")), this.recTree),
        U.card(h("div", { class: "pad" }, U.sectionHeader("🔎", "紀錄詳情", "選取上方紀錄以查看完整判定明細"), this.recDetail)));
    }
    refreshRecordsFilters() {
      const names = ["全部員工"].concat(this.db.employees.map(empLabel)), cur = this.filterEmp.get();
      this.filterEmp.configure(names);
      this.filterEmp.set(names.includes(cur) ? cur : "全部員工");
      const months = this.recordMonths(), mCur = this.filterMonth.get(), opts = ["全部月份"].concat(months);
      this.filterMonth.configure(opts);
      this.filterMonth.set(opts.includes(mCur) ? mCur : "全部月份");
    }
    recordMonths() {
      const months = Array.from(new Set(this.db.records.map((r) => C.monthKey(r.date)))).sort().reverse(), cur = C.thisMonth();
      if (!months.includes(cur)) months.unshift(cur);
      return months;
    }
    renderRecords() {
      const fe = this.filterEmp.get(), fm = this.filterMonth.get(), ff = this.filterFlag.get();
      const recs = this.db.records.slice().sort((a, b) => C.cmp(b.date, a.date)), rows = [];
      for (const rec of recs) {
        const emp = this.L.findEmp(rec.empId);
        if (!emp || (fe !== "全部員工" && fe !== empLabel(emp)) || (fm !== "全部月份" && C.monthKey(rec.date) !== fm)) continue;
        const r = this.L.calcRecord(rec), [flag, shift] = this.L.effectiveRecordFlag(rec, r);
        if (ff !== "全部狀態" && C.STATUS_MAP[flag] !== ff) continue;
        let status = C.STATUS_MAP[flag];
        if (flag === "ot" && r.flag !== "ot") status += "（休假出勤）";
        rows.push({ key: rec.id, cls: "c-" + flag, status, cells: [rec.date, emp.name, DAYTYPE_LABEL[rec.dayType], this.L.formatShiftCell(rec.empId, rec.date, shift), C.formatSegmentsText(rec, " / "), C.pf(rec.scheduledHours), C.hr(r.actualHours), status, this.can("records") ? "🗑" : ""] });
      }
      this.recTree.render(rows, this.recTree.first());
      const ot = rows.filter((x) => x.status.startsWith("需加班單")).length, lv = rows.filter((x) => x.status.startsWith("需請假單")).length, nm = rows.filter((x) => x.status === "正常").length;
      clear(this.recStats).append(U.chip("📋", rows.length, "篩選結果筆數", X.tealL).el, U.chip("🟠", ot, "需加班單", X.orange).el, U.chip("🔴", lv, "需請假單", X.red).el, U.chip("🟢", nm, "正常", X.green).el);
      this.showRecordDetail();
    }
    showRecordDetail() {
      const d = clear(this.recDetail), id = this.recTree.first(), rec = this.db.records.find((x) => x.id === id);
      if (!rec) { d.append(U.sub("請點選上方紀錄以查看詳情")); return; }
      const r = this.L.calcRecord(rec), [flag, shift] = this.L.effectiveRecordFlag(rec, r);
      let title, sub;
      if (flag === "ot" && r.flag !== "ot") { title = `需送出${this.L.otFormLabel(rec, shift)}`; sub = `排班表當日排定為${shift.offType || "休假"}，仍有出勤 ${C.hr(r.actualHours)} 小時`; }
      else if (flag === "ot") { title = `需送出${this.L.otFormLabel(rec, shift)}`; sub = `加班 ${C.hr(r.otHours || r.actualHours)} 小時`; }
      else if (flag === "leave") { title = "需送出請假單"; sub = `較排定少 ${C.hr(r.shortfall)} 小時`; }
      else { title = "工時正常"; sub = `實際工時 ${C.hr(r.actualHours)} 小時`; }
      d.append(this.statusBanner(flag, title, sub), h("div", { class: "pl" },
        h("div", { class: "sub", text: `🕒 時段：${C.formatSegmentsText(rec)}` }),
        flag === "ot" && r.flag === "ot" ? r.detailLines.map((l) => h("div", { class: "sub", text: `・${l}` })) : null,
        r.warnings.map((w) => U.colored(`⚠ ${w}`, X.orange)),
        rec.note ? h("div", { class: "sub", text: `📝 備註：${rec.note}`, style: { marginTop: "4px" } }) : null));
    }
    async deleteRecord(id) {
      if (!this.can("records")) return;
      if (!(await msg.ask("確認刪除", "確定刪除此筆紀錄？"))) return;
      this.db.records = this.db.records.filter((r) => r.id !== id);
      this.persist();
      this.refreshRecordsFilters(); this.renderRecords();
    }

    // ==================== 員工設定 ====================
    buildEmployeesTab() {
      const t = this.tabs["👥 員工設定"];
      this.empStats = h("div", { class: "chips mb8" });
      this.eSearch = U.input("搜尋姓名或員工編號…", { oninput: () => this.renderEmployees() });
      this.eShowInactive = h("input", { type: "checkbox", onchange: () => this.renderEmployees() });
      this.empTree = new U.Table([
        { key: "empno", title: "員工編號", width: 90 }, { key: "name", title: "姓名", width: 100 }, { key: "type", title: "類型", width: 90 }, { key: "hours", title: "標準工時", width: 80 },
        { key: "hire", title: "到職日", width: 100 }, { key: "years", title: "年資", width: 100 }, { key: "status", title: "在職狀態／離職日", width: 160 },
      ], { onDouble: (row) => { const e = this.L.findEmp(row.key); if (e) this.openEmployeeDialog(e); }, maxHeight: 520 });
      t.append(U.card(h("div", { class: "pad" },
        U.sectionHeader("📇", "員工清單", "雙擊列表中的員工可載入修改；選取後可用「上移／下移」調整順序，此順序會同步套用到「排班班表」"), this.empStats,
        h("div", { class: "row mb8" }, h("span", { text: "🔍" }), h("div", { class: "grow", style: { minWidth: "140px" } }, this.eSearch), U.ghost("✖ 清除", () => { this.eSearch.value = ""; this.renderEmployees(); }),
          h("label", { class: "check" }, this.eShowInactive, "顯示離職員工"), U.primary("➕ 新增員工", () => this.openEmployeeDialog(), { class: "btn primary wr" }))),
      this.empTree, h("div", { class: "row", style: { padding: "0 10px 10px" } }, U.ghost("▲ 上移", () => this.moveSelectedEmp(-1), { class: "btn ghost wr" }), U.ghost("▼ 下移", () => this.moveSelectedEmp(1), { class: "btn ghost wr" }), h("div", { class: "grow" }),
        U.ghost("✏️ 編輯選取員工", () => { const e = this.L.findEmp(this.empTree.first()); if (e) this.openEmployeeDialog(e); else msg.info("提醒", "請先選取要編輯的員工"); }, { class: "btn ghost wr" }), U.danger("🗑 刪除選取員工", () => this.deleteSelectedEmp(), { class: "btn danger wr" }))));
    }
    renderEmployees(keep) {
      const kw = this.eSearch.value.trim().toLowerCase(), showIn = this.eShowInactive.checked || !!kw, rows = [], shown = [];
      for (const e of this.L.scheduledEmployees()) {
        const active = e.isActive !== false;
        if ((!active && !showIn) || (kw && !e.name.toLowerCase().includes(kw) && !(e.empNo || "").toLowerCase().includes(kw))) continue;
        const hours = e.type === "fulltime" ? `${C.pf(e.normalHours)}hr` : (e.normalHours ? `${C.g(e.normalHours)}hr` : "-");
        rows.push({ key: e.id, cls: active ? "" : "c-sub", cells: [e.empNo || "-", e.name, EMP_TYPE_LABEL[e.type], hours, e.hireDate || "-", e.hireDate ? C.formatServiceDuration(e.hireDate) : "-", active ? "🟢 在職" : `⚪ 離職 ${this.L.resignDate(e) || ""}`.trimEnd()] });
        shown.push(e);
      }
      this.empTree.render(rows, keep || this.empTree.first());
      if (keep) this.empTree.scrollToSelected();
      clear(this.empStats).append(U.chip("📇", shown.length, "顯示筆數", X.tealL).el, U.chip("🟢", shown.filter((e) => e.isActive !== false).length, "在職中", X.green).el,
        U.chip("👔", shown.filter((e) => e.type === "fulltime").length, "正職", X.gold).el, U.chip("🅿️", shown.filter((e) => e.type === "pt").length, "PT工讀生", X.teal).el);
    }
    openEmployeeDialog(emp) {
      if (!this.can("employees")) return;
      const isEdit = !!emp, F = {};
      F.empno = U.input("例如：A001"); F.name = U.input("例如：王小明");
      F.type = new U.OptionMenu(C.EMP_TYPE_OPTIONS, () => toggleHire());
      F.hours = U.input("8 或 -", { onfocus: (e) => e.target.select() });
      const hireLbl = U.label("");
      const fmt = (el, digitsOnly) => {
        const raw = el.value.trim();
        if (digitsOnly && !/^[0-9]{7,8}$/.test(raw)) return;
        const d = C.parseTaiwanDate(raw);
        if (d && raw !== C.iso(d)) el.value = C.iso(d);
      };
      F.hire = U.input("西元 2023-05-01 或民國 112-05-01", { oninput: (e) => fmt(e.target, true), onchange: (e) => fmt(e.target, false) });
      F.active = h("input", { type: "checkbox", checked: true, onchange: () => toggleResign() });
      F.resign = U.input("西元 2026-09-06 或民國 115-09-06", { oninput: (e) => fmt(e.target, true), onchange: (e) => fmt(e.target, false) });
      const resignWrap = h("div", { class: "row s2", style: { flexWrap: "nowrap", display: "none" } }, h("span", { text: "離職日", style: { whiteSpace: "nowrap" } }), F.resign);
      const toggleHire = () => {
        const full = F.type.get() === "正職";
        F.hours.value = full ? "8" : "-";
        hireLbl.textContent = full ? "到職日 (YYYY-MM-DD，用於自動試算特休)" : "到職日 (YYYY-MM-DD)";
      };
      const toggleResign = () => {
        if (F.active.checked) { resignWrap.style.display = "none"; return; }
        resignWrap.style.display = "flex";
        if (!F.resign.value.trim()) F.resign.value = this.L.suggestResignDate(emp || {});
      };
      let ov;
      const close = () => ov.remove();
      const panel = h("div", { class: "dlg", style: { width: "640px" } }, h("div", { class: "accent", style: { background: X.teal } }), h("div", { class: "pad" },
        U.sectionHeader("👤", isEdit ? "編輯員工" : "新增員工", "建立員工基本資料與標準工時設定"),
        h("div", { class: "grid4 mb8" }, h("div", {}, U.label("員工編號"), F.empno), h("div", {}, U.label("姓名"), F.name), h("div", {}, U.label("類型"), F.type),
          h("div", {}, U.label("標準每日工時（PT可留空「-」）"), F.hours)),
        h("div", { class: "divider" }),
        h("div", { class: "grid4 mb8" }, h("div", { class: "s2" }, hireLbl, F.hire)),
        h("div", { class: "grid4 mb8", style: { alignItems: "center" } }, h("label", { class: "check s2" }, F.active, "在職中（取消勾選代表已離職）"), resignWrap),
        h("div", { class: "row", style: { flexWrap: "nowrap" } }, U.primary(isEdit ? "💾 儲存修改" : "➕ 新增員工", () => this.saveEmployee(F, emp, close), { class: "btn primary tall grow" }), U.danger("✖ 取消", close, { class: "btn danger tall" }))));
      ov = U.modal(panel);
      if (emp) {
        F.empno.value = emp.empNo || ""; F.name.value = emp.name; F.type.set(EMP_TYPE_LABEL[emp.type]); F.hire.value = emp.hireDate || "";
        F.active.checked = emp.isActive !== false; F.resign.value = this.L.resignDate(emp) || "";
        toggleResign(); toggleHire();
        F.hours.value = emp.normalHours ? C.pf(emp.normalHours) : "-";
      } else { F.type.set("正職"); toggleHire(); }
    }
    async saveEmployee(F, editing, close) {
      const name = F.name.value.trim();
      if (!name) { await msg.warn("提醒", "請輸入姓名"); return; }
      const etype = EMP_TYPE_KEY[F.type.get()], rawH = F.hours.value.trim();
      let normal;
      if (etype === "fulltime") {
        normal = num(rawH || "8");
        if (Number.isNaN(normal)) { await msg.warn("提醒", "標準工時需為數字"); return; }
      } else if (rawH === "" || rawH === "-") normal = "";
      else {
        normal = num(rawH);
        if (Number.isNaN(normal)) { await msg.warn("提醒", "應班時數需為數字，或留空「-」表示不限制"); return; }
      }
      const hire = F.hire.value.trim();
      if (hire && !C.parseDate(hire)) { await msg.warn("提醒", "到職日格式需為 YYYY-MM-DD"); return; }
      let resign = "";
      if (!F.active.checked) {
        const raw = F.resign.value.trim();
        if (raw) {
          const d = C.parseTaiwanDate(raw);
          if (!d) { await msg.warn("提醒", "離職日格式需為 YYYY-MM-DD（或民國 115-09-06）"); return; }
          resign = C.iso(d);
          if (hire && resign < hire) { await msg.warn("提醒", "離職日不能早於到職日"); return; }
        }
      }
      const empNo = F.empno.value.trim();
      if (editing) {
        const emp = this.db.employees.find((e) => e.id === editing.id);
        if (!emp) { await msg.warn("提醒", "找不到原始員工資料，可能已被刪除"); close(); return; }
        const dup = this.db.employees.find((e) => e.id !== emp.id && e.name === name);
        if (dup && emp.name !== name) {
          if (!(await msg.ask("合併員工", `「${name}」已經是員工了。\n\n要把「${emp.name}」合併到「${name}」嗎？\n「${emp.name}」的班表、出勤紀錄、假別紀錄都會移到「${name}」，然後刪除「${emp.name}」。\n（兩人同一天都有排班時，保留「${name}」原本的班）`))) return;
          const old = emp.name;
          this.L.mergeEmployee(emp.id, dup.id);
          this.persist();
          close();
          this.refreshEmployeeCombos(); this.renderEmployees(); this.renderScheduleGrid(); this.renderAnnualCard(); this.renderLeaveLedger();
          await msg.info("完成", `已將「${old}」合併到「${name}」`);
          return;
        }
        const wasActive = emp.isActive !== false;
        if (hire !== (emp.hireDate || "")) delete emp.hireDateAuto;
        Object.assign(emp, { empNo, name, type: etype, normalHours: normal, hireDate: hire });
        if (F.active.checked) Logic.markActive(emp);
        else this.L.markResigned(emp, resign || (wasActive ? null : this.L.resignDate(emp)));
        this.persist();
        close();
        await msg.info("完成", `已更新員工：${name}`);
      } else {
        const next = Math.max(-1, ...this.db.employees.map((e) => ("scheduleOrder" in e ? e.scheduleOrder : -1))) + 1;
        const emp = { id: C.newId(), empNo, name, type: etype, normalHours: normal, hireDate: hire, scheduleOrder: next, isActive: F.active.checked };
        if (!emp.isActive) this.L.markResigned(emp, resign || null);
        this.db.employees.push(emp);
        this.persist();
        close();
        await msg.info("完成", `已新增員工：${name}`);
      }
      this.refreshEmployeeCombos(); this.renderEmployees();
    }
    moveEmployeeOrder(empId, dir, activeOnly) {
      if (!this.can("employees") && !this.can("schedule")) return;
      const ordered = this.L.scheduledEmployees();
      if (activeOnly) {
        const wk = this.scheduleWeekStart, idxs = [];
        ordered.forEach((e, i) => { if (this.L.empShownInWeek(e, wk)) idxs.push(i); });
        const sub = idxs.map((i) => ordered[i]), idx = sub.findIndex((e) => e.id === empId), ni = idx + dir;
        if (idx < 0 || ni < 0 || ni >= sub.length) return;
        [sub[idx], sub[ni]] = [sub[ni], sub[idx]];
        idxs.forEach((pos, i) => { ordered[pos] = sub[i]; });
      } else {
        const idx = ordered.findIndex((e) => e.id === empId), ni = idx + dir;
        if (idx < 0 || ni < 0 || ni >= ordered.length) return;
        [ordered[idx], ordered[ni]] = [ordered[ni], ordered[idx]];
      }
      ordered.forEach((e, i) => { e.scheduleOrder = i; });
      this.persist();
      this.renderEmployees(empId);
      this.renderScheduleGrid();
    }
    async moveSelectedEmp(dir) {
      const id = this.empTree.first();
      if (!id) { await msg.info("提醒", "請先選取要調整順序的員工"); return; }
      this.moveEmployeeOrder(id, dir);
    }
    async deleteSelectedEmp() {
      const id = this.empTree.first();
      if (!id) { await msg.info("提醒", "請先選取要刪除的員工"); return; }
      if (!(await msg.ask("確認刪除", "確定刪除此員工？相關出勤紀錄仍會保留但需手動清理。"))) return;
      this.db.employees = this.db.employees.filter((e) => e.id !== id);
      delete this.db.nameGlyphs[id];
      this.persist();
      this.refreshEmployeeCombos(); this.renderEmployees();
    }
  }
  App.SCHEDULE_TAB = "🗓️ 排班班表";
  window.App = App;
  window.empLabel = empLabel;
  window.numOf = num;
})();
