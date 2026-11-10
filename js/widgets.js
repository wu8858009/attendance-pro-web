/* 共用介面元件：對應桌面版的 make_card、CTkOptionMenu、DateEntry、TimeDropdown、TagPickerButton、messagebox、Treeview */
(function () {
  "use strict";
  const C = window.Core;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "text") el.textContent = v;
      else if (k in el && k !== "list") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.el instanceof Node ? kid.el : kid);
    }
    return el;
  }
  const clear = (el) => { el.replaceChildren(); return el; };

  const COLORS = {
    teal: "#14b8a6", tealL: "#5eead4", gold: "#d4af37", red: "#f87171", orange: "#fb923c", green: "#4ade80", purple: "#a78bfa", sub: "var(--sub)", text: "var(--text)",
  };
  const label = (text, opt) => h("span", Object.assign({ class: "lbl", text }, opt || {}));
  const sub = (text, opt) => h("span", Object.assign({ class: "lbl sub", text }, opt || {}));
  const colored = (text, color, opt) => h("div", Object.assign({ text, style: { color, whiteSpace: "pre-wrap" } }, opt || {}));
  function card(...kids) { return h("div", { class: "card" }, kids); }
  function accentCard(accent, ...kids) { return h("div", { class: "card" }, h("div", { class: "accent", style: { background: accent } }), kids); }
  function sectionHeader(icon, title, subtitle) {
    return h("div", { class: "sec" }, h("div", { class: "badge", text: icon }),
      h("div", { style: { minWidth: 0 } }, h("div", { class: "sec-t", text: title }), subtitle ? h("div", { class: "sec-s", text: subtitle }) : null));
  }
  const btn = (cls, text, onclick, opt) => h("button", Object.assign({ class: "btn " + cls, text, onclick, type: "button" }, opt || {}));
  const primary = (text, fn, opt) => btn("primary", text, fn, opt);
  const ghost = (text, fn, opt) => btn("ghost", text, fn, opt);
  const danger = (text, fn, opt) => btn("danger", text, fn, opt);
  const chip = (icon, value, lbl, accent) => {
    const v = h("b", { text: `${icon} ${value}`, style: { color: accent } });
    const el = h("div", { class: "chip" }, v, h("span", { class: "sub", text: lbl }));
    return { el, value: v };
  };
  const input = (placeholder, opt) => h("input", Object.assign({ type: "text", placeholder: placeholder || "", autocomplete: "off" }, opt || {}));

  class OptionMenu {
    constructor(values, onChange) {
      this.el = h("select", { class: "menu", onchange: () => onChange && onChange(this.get()) });
      this.configure(values || []);
    }
    configure(values) {
      const cur = this.el.value;
      this.values = values;
      clear(this.el);
      for (const v of values) this.el.append(h("option", { value: v, text: v }));
      if (values.includes(cur)) this.el.value = cur;
    }
    get() { return this.el.value; }
    set(v) {
      if (!Array.from(this.el.options).some((o) => o.value === v)) this.el.append(h("option", { value: v, text: v }));
      this.el.value = v;
    }
  }

  // ---- 浮動清單：點外面或按 Esc 關閉 ----
  let openPop = null;
  function closePop() { if (openPop) { openPop.remove(); openPop = null; } }
  function showPop(pop, anchor) {
    closePop();
    document.body.append(pop);
    const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(4, Math.min(r.left, innerWidth - pw - 4)) + "px";
    pop.style.top = (r.bottom + 2 + ph > innerHeight ? Math.max(4, r.top - ph - 2) : r.bottom + 2) + "px";
    openPop = pop;
  }
  document.addEventListener("pointerdown", (e) => { if (openPop && !openPop.contains(e.target) && !e.target.closest("[data-pop]")) closePop(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });

  class DateEntry {
    constructor(onSelect) {
      this.onSelect = onSelect;
      this.input = input("");
      this.btn = h("button", { class: "btn cal", type: "button", text: "📅", "data-pop": "1", onclick: () => this.toggle() });
      this.el = h("div", { class: "date" }, this.input, this.btn);
    }
    get() { return this.input.value; }
    set(v) { this.input.value = v; }
    toggle() {
      if (this.pop && this.pop === openPop) { closePop(); return; }
      const base = C.parseDate(this.get().trim()) || C.today();
      this.y = C.yearOf(base); this.m = C.monthOf(base); this.selected = base;
      this.pop = h("div", { class: "pop" });
      this.render();
      showPop(this.pop, this.btn);
    }
    render() {
      const go = (dy, dm) => () => {
        this.m += dm; this.y += dy;
        if (this.m === 0) { this.m = 12; this.y--; }
        if (this.m === 13) { this.m = 1; this.y++; }
        this.render();
      };
      const head = h("div", { class: "cal-h" },
        h("button", { text: "«", onclick: go(-1, 0), type: "button" }), h("button", { text: "‹", onclick: go(0, -1), type: "button" }),
        h("span", { text: `${this.y} 年 ${C.pad2(this.m)} 月` }),
        h("button", { text: "›", onclick: go(0, 1), type: "button" }), h("button", { text: "»", onclick: go(1, 0), type: "button" }));
      const grid = h("div", { class: "cal-g" });
      C.WEEKDAY_LABELS.forEach((w, i) => grid.append(h("div", { text: w, style: { color: i >= 5 ? "#f87171" : "var(--sub)" } })));
      const first = C.mkDate(this.y, this.m, 1), last = C.mkDate(this.y, this.m, C.monthDays(this.y, this.m));
      const t = C.iso(C.today()), sel = C.iso(this.selected);
      for (let d = C.addDays(first, -C.weekday(first)); d <= C.addDays(last, 6 - C.weekday(last)); d = C.addDays(d, 1)) {
        const ds = C.iso(d), dd = d;
        let color = "var(--text)";
        if (C.monthOf(d) !== this.m) color = "#5b6b80"; else if (C.weekday(d) >= 5) color = "#38bdf8";
        let bg = "transparent";
        if (ds === t) bg = "#4a3d1f";
        if (ds === sel) bg = "#1f3b36";
        grid.append(h("div", { class: "d", text: C.dayOf(d), style: { color, background: bg }, onclick: () => {
          this.set(C.iso(dd)); closePop(); if (this.onSelect) this.onSelect();
        } }));
      }
      clear(this.pop).append(head, grid);
    }
  }

  class TimeDropdown {
    constructor(initial, onSelect) {
      this.onSelect = onSelect;
      this.value = initial || C.TIME_OPTIONS_30MIN[0];
      this.el = h("button", { class: "btn time-btn", type: "button", text: this.value, "data-pop": "1", onclick: () => this.toggle() });
    }
    get() { return this.value; }
    set(v) { this.value = v; this.el.textContent = v; }
    toggle() {
      if (this.pop && this.pop === openPop) { closePop(); return; }
      const list = h("div", { class: "time-list" });
      let cur = null;
      for (const v of C.TIME_OPTIONS_30MIN) {
        const it = h("div", { text: v, class: v === this.value ? "cur" : "", onclick: () => {
          this.set(v); closePop(); if (this.onSelect) this.onSelect(v);
        } });
        if (v === this.value) cur = it;
        list.append(it);
      }
      this.pop = h("div", { class: "pop" }, list);
      showPop(this.pop, this.el);
      if (cur) list.scrollTop = cur.offsetTop - 90;
    }
  }

  class TagPicker {
    constructor(tags, checked) {
      this.tags = tags;
      this.checked = new Set((checked || []).filter((t) => tags.includes(t)));
      this.el = h("button", { class: "btn full", type: "button", "data-pop": "1", style: { background: "var(--surface)", textAlign: "left" }, onclick: () => this.toggle() });
      this.refresh();
    }
    refresh() {
      const sel = this.getChecked();
      this.el.textContent = sel.length ? sel.join("、") : "🏷 選擇備註標籤";
    }
    getChecked() { return this.tags.filter((t) => this.checked.has(t)); }
    toggle() {
      if (this.pop && this.pop === openPop) { closePop(); return; }
      this.pop = h("div", { class: "pop tag-pop" });
      if (!this.tags.length) this.pop.append(h("span", { class: "sub", text: "尚未設定標籤（請至「軟體設定」新增）" }));
      for (const t of this.tags) {
        this.pop.append(h("label", { class: "check" }, h("input", { type: "checkbox", checked: this.checked.has(t), onchange: (e) => {
          if (e.target.checked) this.checked.add(t); else this.checked.delete(t);
          this.refresh();
        } }), t));
      }
      showPop(this.pop, this.el);
    }
  }

  // ---- 對話框 ----
  function modal(content, opt) {
    opt = opt || {};
    const ov = h("div", { class: "overlay" + (opt.clear ? " clear" : "") }, content);
    if (opt.onOutside) ov.addEventListener("pointerdown", (e) => { if (e.target === ov) opt.onOutside(); });
    document.body.append(ov);
    return ov;
  }
  function messageBox(title, text, buttons) {
    return new Promise((resolve) => {
      closePop();
      const done = (v) => { document.removeEventListener("keydown", onKey, true); ov.remove(); resolve(v); };
      const onKey = (e) => {
        if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); done(buttons[0][1]); }
        else if (e.key === "Escape" && buttons.length > 1) { e.stopPropagation(); done(buttons[1][1]); }
      };
      const row = h("div", { class: "msg-r" }, buttons.map(([t, v], i) => btn(i === 0 ? "primary" : "ghost", t, () => done(v))));
      const ov = modal(h("div", { class: "dlg card-bg msg" }, h("div", { class: "msg-t", text: title }), h("div", { class: "msg-b", text }), row));
      ov.style.zIndex = 95;
      document.addEventListener("keydown", onKey, true);
    });
  }
  const msg = {
    info: (t, m) => messageBox(t, m, [["確定", true]]),
    warn: (t, m) => messageBox(t, m, [["確定", true]]),
    error: (t, m) => messageBox(t, m, [["確定", true]]),
    ask: (t, m) => messageBox(t, m, [["是", true], ["否", false]]),
  };

  // ---- 表格（對應 ttk.Treeview）----
  class Table {
    constructor(cols, opt) {
      opt = opt || {};
      this.cols = cols;
      this.opt = opt;
      this.thead = h("tr");
      this.ths = cols.map((c) => {
        const th = h("th", { text: c.title || "", style: { minWidth: (c.width || 60) + "px" }, class: c.sort ? "sortable" : "", onclick: c.sort ? () => opt.onSort(c.key) : null });
        this.thead.append(th);
        return th;
      });
      this.tbody = h("tbody");
      this.el = h("div", { class: "tw", style: opt.height ? { height: opt.height + "px" } : { maxHeight: (opt.maxHeight || 420) + "px" }, tabIndex: 0, onkeydown: (e) => {
        if (e.key === "Enter" && opt.onEnter) { e.preventDefault(); opt.onEnter(); }
      } }, h("table", { class: "t" }, h("thead", {}, this.thead), this.tbody));
      this.rows = [];
      this.selection = new Set();
      this.anchor = -1;
    }
    setHeader(key, text) { this.ths[this.cols.findIndex((c) => c.key === key)].textContent = text; }
    render(rows, keepKey) {      // rows: [{ key, cells: [...], cls, title? }]
      const keep = keepKey ? new Set([keepKey]) : (this.opt.keepSelection ? this.selection : new Set());
      this.rows = rows;
      this.selection = new Set(rows.filter((r) => keep.has(r.key)).map((r) => r.key));
      const frag = document.createDocumentFragment();
      rows.forEach((r, idx) => {
        const tr = h("tr", { class: (r.cls || "") + (this.selection.has(r.key) ? " sel" : "") });
        r.tr = tr;
        this.cols.forEach((c, i) => {
          const text = r.cells[i];
          const td = h("td", { text: text === null || text === undefined ? "" : text, class: (c.left ? "l " : "") + (c.ell ? "ell" : ""), title: c.ell ? String(text) : null });
          if (c.onClick) { td.classList.add("trash"); td.addEventListener("click", (e) => { e.stopPropagation(); c.onClick(r); }); }
          tr.append(td);
        });
        tr.addEventListener("click", (e) => this.click(r, idx, e));
        if (this.opt.onDouble) tr.addEventListener("dblclick", () => this.opt.onDouble(r));
        frag.append(tr);
      });
      clear(this.tbody).append(frag);
    }
    click(r, idx, e) {
      if (r.noSelect) return;
      if (this.opt.multi && (e.ctrlKey || e.metaKey)) {
        if (this.selection.has(r.key)) this.selection.delete(r.key); else this.selection.add(r.key);
        this.anchor = idx;
      } else if (this.opt.multi && e.shiftKey && this.anchor >= 0) {
        this.selection = new Set(this.rows.slice(Math.min(idx, this.anchor), Math.max(idx, this.anchor) + 1).map((x) => x.key));
      } else {
        this.selection = new Set([r.key]);
        this.anchor = idx;
      }
      this.paint();
      if (this.opt.onSelect) this.opt.onSelect();
    }
    paint() { this.rows.forEach((r) => r.tr.classList.toggle("sel", this.selection.has(r.key))); }
    selected() { return Array.from(this.selection); }
    first() { return this.selected()[0]; }
    scrollToSelected() { const r = this.rows.find((x) => this.selection.has(x.key)); if (r) r.tr.scrollIntoView({ block: "nearest" }); }
  }

  function download(filename, blobOrText, type) {
    const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type: type || "text/plain;charset=utf-8" });
    const a = h("a", { href: URL.createObjectURL(blob), download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  function pickFile(accept) {
    return new Promise((resolve) => {
      const i = h("input", { type: "file", accept, style: { display: "none" }, onchange: () => { resolve(i.files[0] || null); i.remove(); } });
      document.body.append(i);
      i.click();
    });
  }
  async function copyText(text, fallbackEl) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_e) {
      if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); return document.execCommand("copy"); }
      return false;
    }
  }

  function pwBox(input) {                   // 密碼欄右側的顯示／隱藏按鈕
    const eye = h("button", { class: "pw-eye", type: "button", text: "👁", tabIndex: -1, title: "顯示密碼", onclick: () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      eye.textContent = show ? "🙈" : "👁";
      eye.title = show ? "隱藏密碼" : "顯示密碼";
      input.focus();
    } });
    return h("div", { class: "pw-box" }, input, eye);
  }
  window.UI = { pwBox, h, append, clear, COLORS, label, sub, colored, card, accentCard, sectionHeader, btn, primary, ghost, danger, chip, input, OptionMenu, DateEntry, TimeDropdown, TagPicker, modal, msg, Table, download, pickFile, copyText, closePop };
})();
