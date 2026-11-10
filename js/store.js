/* 資料層：登入、載入、把本機的異動（差異）送到 Google 試算表，並偵測其他裝置的更新。
   桌面版的 persist() 是整份寫檔，這裡改成比對上次同步的內容、只送有變動的列。 */
(function () {
  "use strict";
  const C = window.Core;
  const COLS = ["employees", "records", "leaveLedger", "shiftSchedule"];
  const LS_TOKEN = "att_token", LS_PENDING = "att_pending", LS_PREFS = "att_prefs", LS_REMEMBER = "att_remember", LS_NO_AUTO = "att_no_auto";
  const PREF_KEYS = ["navOrder", "appearanceMode", "scheduleCellFontSize"];   // 沒有軟體設定權限時，這幾項只存在自己的裝置
  const POLL_MS = 4000;

  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 210000 }, base, 256));
  }

  function shiftLabel(s) {
    if (s.isOff) return s.offType || "休假";
    return (s.segments || []).filter((x) => x.in && x.out).map((x) => x.in + "-" + x.out).join(" / ");
  }

  class Store {
    constructor(url) {
      this.url = url;
      this.token = localStorage.getItem(LS_TOKEN) || "";
      this.db = null;
      this.lawCache = {};
      this.rev = 0;
      this.snap = null;
      this.queue = null;       // 尚未送出的 ops
      this.sending = false;
      this.timer = null;
      this.onStatus = () => {};
      this.onRemote = () => {};
      this.onAuthLost = () => {};
      this.onForbidden = () => {};
      this.me = null;
      this.failed = false;
      this.pendingCount = 0;
    }
    async call(action, payload) {
      const res = await fetch(this.url, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ action, token: this.token }, payload || {})), redirect: "follow",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data.error === "auth") { this.setToken(""); this.onAuthLost(); throw new Error("auth"); }
      if (data.error === "server") throw new Error(data.message || "server");
      if (data.error === "must_change" || (data.error === "forbidden" && action === "apply")) throw new Error(data.error);
      return data;
    }
    setToken(t) {
      this.token = t;
      if (t) localStorage.setItem(LS_TOKEN, t); else localStorage.removeItem(LS_TOKEN);
    }
    async status(names) { return this.call("status", names ? { names: true } : null); }
    async setup(password, salt) {
      const r = await this.call("setup", { key: await deriveKey(password, salt) });
      if (r.token) this.setToken(r.token);
      return r;
    }
    keyFor(password, salt) { return deriveKey(password, salt); }
    async loginKey(username, key, auto) {
      const r = await this.call("login", { username, key, auto: !!auto });
      if (r.token) { this.setToken(r.token); localStorage.removeItem(LS_NO_AUTO); }
      return r;
    }
    // 記住帳號密碼：只存瀏覽器算出來的金鑰，不存密碼原文
    remembered() { try { return JSON.parse(localStorage.getItem(LS_REMEMBER) || "null"); } catch (_e) { return null; } }
    remember(u, k) { localStorage.setItem(LS_REMEMBER, JSON.stringify({ u, k })); }
    forget() { localStorage.removeItem(LS_REMEMBER); localStorage.removeItem(LS_NO_AUTO); }
    get noAuto() { return !!localStorage.getItem(LS_NO_AUTO); }
    async changePassword(oldPw, newPw, salt, oldKey) {
      const key = oldKey || await deriveKey(oldPw, salt), newKey = await deriveKey(newPw, salt);
      const r = await this.call("changePassword", { key, newKey });
      if (r.token) {
        this.setToken(r.token);
        const saved = this.remembered();
        if (saved && saved.k === key) this.remember(saved.u, newKey);   // 記住的密碼跟著更新
      }
      return r;
    }
    async logout() {
      try { await this.call("logout"); } catch (_e) { /* 離線時也要能登出 */ }
      this.setToken("");
      localStorage.removeItem(LS_PENDING);
      if (this.remembered()) localStorage.setItem(LS_NO_AUTO, "1");     // 主動登出後不要又自動登入回去
    }

    // ---- 載入 ----
    adopt(data) {
      this.rev = data.rev || 0;
      this.lawCache = data.lawCache || {};
      this.me = data.me || null;
      this.db = C.parseDb(data);
      if (this.prefsLocal) { try { Object.assign(this.db.settings, JSON.parse(localStorage.getItem(LS_PREFS) || "{}")); } catch (_e) { /* 壞了就用共用設定 */ } }
      for (const c of COLS) this.db[c].forEach((it) => { if (!it.id) it.id = C.newId(); });
      this.snap = this.takeSnapshot();
    }
    async load() {
      const data = await this.call("load");
      this.adopt(data);
      const left = localStorage.getItem(LS_PENDING);     // 上次關閉前沒送完的異動
      if (left) {
        try { this.mergeQueue(JSON.parse(left)); this.applyQueueLocally(); this.flushSoon(); } catch (_e) { localStorage.removeItem(LS_PENDING); }
      }
      this.startPolling();
    }
    get prefsLocal() { return !(this.me && (this.me.admin || this.me.perms.settings === "edit")); }
    savePrefs() {
      const o = {};
      PREF_KEYS.forEach((k) => { if (k in this.db.settings) o[k] = this.db.settings[k]; });
      localStorage.setItem(LS_PREFS, JSON.stringify(o));
    }
    takeSnapshot() {
      const s = {};
      for (const c of COLS) s[c] = new Map(this.db[c].map((it) => [it.id, JSON.stringify(it)]));
      s.nameGlyphs = new Map(Object.keys(this.db.nameGlyphs).map((k) => [k, JSON.stringify(this.db.nameGlyphs[k])]));
      s.settings = new Map(Object.keys(this.db.settings).map((k) => [k, JSON.stringify(this.db.settings[k])]));
      s.lawCache = JSON.stringify(this.lawCache);
      return s;
    }

    // ---- 給試算表人看的欄位 ----
    empName(id) { const e = this.db.employees.find((x) => x.id === id); return e ? e.name : id; }
    row(c, it, key) {
      const n = this.empName(it.empId);
      if (c === "employees") return { id: it.id, view: [it.empNo || "", it.name, C.EMP_TYPE_LABEL[it.type] || it.type, it.normalHours === "" ? "-" : it.normalHours, it.hireDate || "", it.isActive === false ? "離職" : "在職", it.resignDate || ""], data: it };
      if (c === "records") return { id: it.id, view: [it.date, n, C.DAYTYPE_LABEL[it.dayType] || it.dayType, C.formatSegmentsText(it), it.breakMin, it.scheduledHours, it.note || ""], data: it };
      if (c === "leaveLedger") return { id: it.id, view: [it.date, n, it.type, it.hours, it.note || ""], data: it };
      if (c === "shiftSchedule") return { id: it.id, view: [it.date, n, shiftLabel(it), it.note || ""], data: it };
      if (c === "nameGlyphs") return { id: key, view: [this.empName(key), it.length], data: { empId: key, images: it } };
      return { id: key, view: [], data: it };
    }
    rowsFor(c) { return this.db[c].map((it) => this.row(c, it)); }

    // ---- 差異 ----
    diff() {
      const ops = {};
      let n = 0;
      for (const c of COLS) {
        const prev = this.snap[c], seen = new Set(), upsert = [], del = [];
        for (const it of this.db[c]) {
          const s = JSON.stringify(it);
          seen.add(it.id);
          if (prev.get(it.id) !== s) { upsert.push(this.row(c, it)); prev.set(it.id, s); }
        }
        for (const id of Array.from(prev.keys())) if (!seen.has(id)) { del.push(id); prev.delete(id); }
        if (upsert.length || del.length) { ops[c] = { upsert, del }; n += upsert.length + del.length; }
      }
      for (const [c, obj] of [["nameGlyphs", this.db.nameGlyphs], ["settings", this.db.settings]]) {
        const prev = this.snap[c], upsert = [], del = [];
        for (const k of Object.keys(obj)) {
          const s = JSON.stringify(obj[k]);
          if (c === "settings" && this.prefsLocal && PREF_KEYS.includes(k)) {
            if (prev.get(k) !== s) { prev.set(k, s); this.savePrefs(); }
            continue;
          }
          if (prev.get(k) !== s) { upsert.push(this.row(c, obj[k], k)); prev.set(k, s); }
        }
        for (const k of Array.from(prev.keys())) if (!(k in obj)) { del.push(k); prev.delete(k); }
        if (upsert.length || del.length) { ops[c] = { upsert, del }; n += upsert.length + del.length; }
      }
      const law = JSON.stringify(this.lawCache);
      if (law !== this.snap.lawCache) {
        this.snap.lawCache = law;
        ops.settings = ops.settings || { upsert: [], del: [] };
        ops.settings.upsert.push({ id: "__lawCache", view: [], data: this.lawCache });
        n++;
      }
      return n ? ops : null;
    }
    mergeQueue(ops) {   // 同一列多次修改只留最後一次；新增後又刪掉也要刪得到
      if (!this.queue) this.queue = {};
      for (const c of Object.keys(ops)) {
        const q = this.queue[c] || (this.queue[c] = { upsert: [], del: [] });
        for (const it of ops[c].upsert) {
          q.upsert = q.upsert.filter((x) => String(x.id) !== String(it.id));
          q.del = q.del.filter((id) => String(id) !== String(it.id));
          q.upsert.push(it);
        }
        for (const id of ops[c].del) {
          q.upsert = q.upsert.filter((x) => String(x.id) !== String(id));
          if (!q.del.some((x) => String(x) === String(id))) q.del.push(id);
        }
      }
      this.pendingCount = Object.values(this.queue).reduce((t, q) => t + q.upsert.length + q.del.length, 0);
      localStorage.setItem(LS_PENDING, JSON.stringify(this.queue));
    }
    applyQueueLocally() {   // 重新載入後，把還沒送出的異動疊回畫面
      for (const c of Object.keys(this.queue || {})) {
        const q = this.queue[c];
        if (COLS.includes(c)) {
          for (const it of q.upsert) {
            const i = this.db[c].findIndex((x) => x.id === it.id);
            if (i >= 0) this.db[c][i] = it.data; else this.db[c].push(it.data);
          }
          this.db[c] = this.db[c].filter((x) => !q.del.includes(x.id));
        } else if (c === "nameGlyphs") {
          q.upsert.forEach((it) => { this.db.nameGlyphs[it.id] = it.data.images; });
          q.del.forEach((id) => delete this.db.nameGlyphs[id]);
        } else if (c === "settings") {
          q.upsert.forEach((it) => { if (it.id === "__lawCache") this.lawCache = it.data; else this.db.settings[it.id] = it.data; });
        }
      }
      this.snap = this.takeSnapshot();
    }

    // ---- 同步 ----
    persist() {
      const ops = this.diff();
      if (!ops) return;
      this.mergeQueue(ops);
      this.flushSoon();
    }
    flushSoon() {
      this.onStatus();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 300);
    }
    get dirty() { return !!this.queue || this.sending; }
    async flush() {
      if (this.sending || !this.queue) return;
      this.sending = true;
      const ops = this.queue;
      this.queue = null;
      this.onStatus();
      try {
        const r = await this.call("apply", { ops });
        const others = r.prevRev !== this.rev;
        this.rev = r.rev;
        this.failed = false;
        if (!this.queue) { localStorage.removeItem(LS_PENDING); this.pendingCount = 0; }
        else localStorage.setItem(LS_PENDING, JSON.stringify(this.queue));
        this.sending = false;
        this.onStatus();
        if (this.queue) this.flushSoon();
        else if (others) this.pullRemote();
      } catch (e) {
        if (e.message === "forbidden") {             // 權限不足：丟棄這批修改，畫面回到雲端的內容
          this.sending = false; this.queue = null; this.pendingCount = 0; this.failed = false;
          localStorage.removeItem(LS_PENDING);
          await this.pullRemote(true);
          this.onForbidden();
          return;
        }
        this.sending = false;
        this.failed = true;
        const later = this.queue;
        this.queue = null;
        this.mergeQueue(ops);
        if (later) this.mergeQueue(later);
        this.onStatus();
        if (e.message !== "auth") { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 8000); }
      }
    }
    async replaceAll(raw) {          // 從備份還原：整份覆蓋
      this.db = C.parseDb(raw);
      for (const c of COLS) this.db[c].forEach((it) => { if (!it.id) it.id = C.newId(); });
      const data = {};
      for (const c of COLS) data[c] = this.rowsFor(c);
      data.nameGlyphs = Object.keys(this.db.nameGlyphs).map((k) => this.row("nameGlyphs", this.db.nameGlyphs[k], k));
      data.settings = Object.keys(this.db.settings).map((k) => this.row("settings", this.db.settings[k], k));
      if (Object.keys(this.lawCache).length) data.settings.push({ id: "__lawCache", view: [], data: this.lawCache });
      this.queue = null;
      this.pendingCount = 0;
      localStorage.removeItem(LS_PENDING);
      const r = await this.call("restore", { data });
      this.rev = r.rev;
      this.snap = this.takeSnapshot();
      this.onStatus();
    }
    startPolling() {
      if (this.poller) return;
      this.poller = setInterval(() => this.poll(), POLL_MS);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) this.poll(); });
      window.addEventListener("focus", () => this.poll());
      window.addEventListener("online", () => this.poll());
    }
    async poll() {
      if (document.hidden || !this.token || this.dirty || this.pulling || this.polling) return;
      this.polling = true;
      try {
        const r = await this.call("rev");
        if (this.failed) { this.failed = false; this.onStatus(); }
        if (r.rev !== this.rev && !this.dirty) await this.pullRemote();
      } catch (_e) { /* 離線：下次再試 */ }
      this.polling = false;
    }
    async pullRemote() {
      if (this.pulling || this.dirty) return;
      this.pulling = true;
      try {
        const data = await this.call("load");
        if (!this.dirty) { this.adopt(data); this.onRemote(); }
      } catch (_e) { /* 下次再試 */ }
      this.pulling = false;
    }
    statusText() {
      if (this.failed) return `⚠ 連線失敗，${this.pendingCount} 筆待上傳（會自動重試）`;
      if (this.dirty) return "☁ 同步中…";
      return "☁ 已同步到 Google 試算表";
    }
  }
  window.Store = Store;
})();
