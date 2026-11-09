/* 班表照片辨識：移植桌面版 _ocr_schedule（找表格線 → 找員工列 → 每格多組參數投票），用 tesseract.js 在瀏覽器內執行，照片不會上傳。
   桌面版的姓名另外用 Windows 內建 OCR，瀏覽器沒有這個功能，姓名只靠 Tesseract 加上「姓名字形記憶」。 */
(function () {
  "use strict";
  const C = window.Core;
  const TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  // (放大倍率, 二值化門檻, psm)；依序嘗試，兩種讀法一致就提前結束
  const VARIANTS = [[6, 200, 7], [5, 190, 7], [7, 190, 7], [6, 180, 7], [6, 200, 13], [4, 180, 13], [8, 190, 13], [10, 200, 13], [4, 220, 13], [10, 220, 13], [12, 200, 13], [10, 200, 7]];
  const ROLE_FULL = ["副店長", "店長"], ROLE_SUFFIX = ["組長", "服務員", "廚師", "吧檯", "外場", "內場", "O", "S/O", "R"];

  function loadScript(url) {
    return new Promise((ok, no) => {
      if (window.Tesseract) { ok(); return; }
      const s = document.createElement("script");
      s.src = url; s.onload = ok; s.onerror = () => no(new Error("無法載入文字辨識元件，請檢查網路連線"));
      document.head.append(s);
    });
  }

  // ---- Lanczos 縮放（對應 PIL LANCZOS）----
  const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
  const lanczos = (x) => (x > -3 && x < 3 ? sinc(x) * sinc(x / 3) : 0);
  function coeffs(inSize, outSize) {
    const scale = inSize / outSize, fs = Math.max(scale, 1), support = 3 * fs, out = new Array(outSize);
    for (let i = 0; i < outSize; i++) {
      const center = (i + 0.5) * scale;
      const x0 = Math.max(0, Math.floor(center - support + 0.5)), x1 = Math.min(inSize, Math.floor(center + support + 0.5));
      const w = new Float64Array(x1 - x0);
      let sum = 0;
      for (let x = x0; x < x1; x++) { const v = lanczos((x + 0.5 - center) / fs); w[x - x0] = v; sum += v; }
      for (let k = 0; k < w.length; k++) w[k] /= sum;
      out[i] = [x0, w];
    }
    return out;
  }
  function resample(src, sw, sh, dw, dh, ch) {     // src: 每像素 ch 個 byte
    const clip = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
    const cx = coeffs(sw, dw), tmp = new Uint8Array(dw * sh * ch);
    for (let y = 0; y < sh; y++) for (let x = 0; x < dw; x++) {
      const [x0, w] = cx[x];
      for (let c = 0; c < ch; c++) {
        let v = 0;
        for (let k = 0; k < w.length; k++) v += src[(y * sw + x0 + k) * ch + c] * w[k];
        tmp[(y * dw + x) * ch + c] = clip(v);
      }
    }
    const cy = coeffs(sh, dh), dst = new Uint8Array(dw * dh * ch);
    for (let y = 0; y < dh; y++) {
      const [y0, w] = cy[y];
      for (let x = 0; x < dw; x++) for (let c = 0; c < ch; c++) {
        let v = 0;
        for (let k = 0; k < w.length; k++) v += tmp[((y0 + k) * dw + x) * ch + c] * w[k];
        dst[(y * dw + x) * ch + c] = clip(v);
      }
    }
    return dst;
  }

  // ---- 灰階小圖 {w, h, d} ----
  function crop(g, x0, y0, x1, y1) {
    const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0), d = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = g.d[(y + y0) * g.w + x + x0];
    return { w, h, d };
  }
  function anyDark(g, thr) {       // [每列是否有墨, 每欄是否有墨]
    const rows = new Array(g.h).fill(false), cols = new Array(g.w).fill(false);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.d[y * g.w + x] < thr) { rows[y] = true; cols[x] = true; }
    return [rows, cols];
  }
  const firstLast = (a) => [a.indexOf(true), a.lastIndexOf(true)];
  function toCanvas(g) {
    const c = document.createElement("canvas");
    c.width = g.w; c.height = g.h;
    const ctx = c.getContext("2d"), img = ctx.createImageData(g.w, g.h);
    for (let i = 0; i < g.d.length; i++) { const v = g.d[i], p = i * 4; img.data[p] = v; img.data[p + 1] = v; img.data[p + 2] = v; img.data[p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  function binarizedPad(seg, scale, thr) {
    const sw = seg.w * scale, sh = seg.h * scale, d = resample(seg.d, seg.w, seg.h, sw, sh, 1);
    const w = sw + 60, h = sh + 60, out = new Uint8Array(w * h).fill(255);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) out[(y + 30) * w + x + 30] = d[y * sw + x] < thr ? 0 : 255;
    return { w, h, d: out };
  }
  function inkSeg(g) {
    const [rows, cols] = anyDark(g, 150);
    if (!rows.includes(true)) return null;
    const [y0, y1] = firstLast(rows), [x0, x1] = firstLast(cols);
    return crop(g, x0, y0, x1 + 1, y1 + 1);
  }
  function segNorm(seg, H) {
    const w = Math.max(1, C.pyRound((seg.w * H) / seg.h));
    return { w, h: H, d: resample(seg.d, seg.w, seg.h, w, H, 1) };
  }
  function gaussian(g, sigma) {
    const r = Math.ceil(sigma * 3), k = [];
    let sum = 0;
    for (let i = -r; i <= r; i++) { const v = Math.exp((-i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
    const K = k.map((v) => v / sum), at = (i, n) => Math.max(0, Math.min(n - 1, i));
    const t = new Float64Array(g.w * g.h), o = new Float64Array(g.w * g.h);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { let v = 0; for (let i = -r; i <= r; i++) v += g.d[y * g.w + at(x + i, g.w)] * K[i + r]; t[y * g.w + x] = v; }
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { let v = 0; for (let i = -r; i <= r; i++) v += t[at(y + i, g.h) * g.w + x] * K[i + r]; o[y * g.w + x] = v; }
    return o;
  }
  function segFeat(seg) {          // 固定高度、置左補白，轉成零均值單位向量（內積 = 相似度）
    const H = 32, W = 160, im = segNorm(seg, H), blur = gaussian(im, 1.5), f = new Float64Array(H * W).fill(255), w = Math.min(W, im.w);
    for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) f[y * W + x] = blur[y * im.w + x];
    let mean = 0;
    for (let i = 0; i < f.length; i++) { f[i] = 255 - f[i]; mean += f[i]; }
    mean /= f.length;
    let n = 0;
    for (let i = 0; i < f.length; i++) { f[i] -= mean; n += f[i] * f[i]; }
    n = Math.sqrt(n);
    if (n) for (let i = 0; i < f.length; i++) f[i] /= n;
    return f;
  }
  const segPack = (seg) => toCanvas(segNorm(seg, 32)).toDataURL("image/png").split(",")[1];
  function imageToGray(bitmap) {
    const c = document.createElement("canvas");
    c.width = bitmap.width; c.height = bitmap.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data, d = new Uint8Array(c.width * c.height);
    for (let i = 0; i < d.length; i++) d[i] = px[i * 4];
    return { w: c.width, h: c.height, d };
  }
  async function segUnpack(b64) {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    return imageToGray(await createImageBitmap(new Blob([bytes], { type: "image/png" })));
  }

  function fixRole(text) {
    const t = (text || "").replace(/\|/g, "").replace(/ /g, "").trim();
    if (!t) return "";
    const chars = Array.from(t), sep = chars.findIndex((ch) => "-~－—一".includes(ch));
    let pre, suf;
    if (sep >= 0) { pre = chars.slice(0, sep).join(""); suf = chars.slice(sep + 1).join(""); }
    else if (chars.includes("職")) { const k = chars.indexOf("職") + 1; pre = chars.slice(0, k).join(""); suf = chars.slice(k).join(""); }
    else return C.closeMatch(t, ROLE_FULL, 0.5) || t;
    const prefix = pre.charAt(0) === "正" ? "正職" : "兼職";
    suf = suf.replace(/0/g, "O").replace(/。/g, "O").replace(/○/g, "O");
    const low = suf.toLowerCase();
    if (low === "o" || low === "r" || low === "s/o") return `${prefix}-${low === "s/o" ? "S/O" : suf.toUpperCase()}`;
    const m = C.closeMatch(suf, ROLE_SUFFIX, 0.4);
    return `${prefix}-${m || suf}`;
  }

  // ---- Tesseract 工作池 ----
  class Pool {
    constructor(lang, size) { this.lang = lang; this.size = size; this.free = []; this.wait = []; this.made = null; }
    async init() {
      if (!this.made) {
        const opt = { langPath: new URL("tessdata/", location.href).href, gzip: false, cacheMethod: "none" };
        this.made = Promise.all(Array.from({ length: this.size }, () => window.Tesseract.createWorker(this.lang, 1, opt))).then((w) => { this.all = w; this.free = w.slice(); });
      }
      await this.made;
    }
    acquire() { return this.free.length ? Promise.resolve(this.free.pop()) : new Promise((ok) => this.wait.push(ok)); }
    release(w) { const next = this.wait.shift(); if (next) next(w); else this.free.push(w); }
    async read(g, params) {
      await this.init();
      const w = await this.acquire();
      try {
        await w.setParameters(params);
        return (await w.recognize(toCanvas(g))).data.text;
      } finally { this.release(w); }
    }
    async stop() { if (this.all) await Promise.all(this.all.map((w) => w.terminate())); }
  }

  const half = (x) => { const v = parseFloat(x); return Math.trunc(v) + (v % 1 ? 0.5 : 0); };
  const plausible = (s, e) => s >= 6 && s <= 23.5 && s < e && e <= 30 && e - s >= 2 && e - s <= 16;
  function median(a) { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
  function peaks(f, thr) {
    const out = [];
    f.forEach((v, i) => {
      if (v <= thr) return;
      if (out.length && i - out[out.length - 1][1] <= 2) out[out.length - 1][1] = i; else out.push([i, i]);
    });
    return out.map(([s, e]) => Math.floor((s + e) / 2));
  }

  async function readSchedule(blob, progress, libs) {
    await loadScript(TESS_URL);
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width < 300 || bitmap.height < 200) throw new Error("圖片太小，請使用清楚的班表截圖。");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    let W = canvas.width, H = canvas.height, rgba = ctx.getImageData(0, 0, W, H).data;
    if (Math.abs(W - 950) > 30) {       // 統一縮放到約 950 px 寬（辨識參數依此調校）
      const nh = Math.max(1, C.pyRound((H * 950) / W));
      rgba = resample(rgba, W, H, 950, nh, 4);
      W = 950; H = nh;
    }
    const R = (x, y) => rgba[(y * W + x) * 4], G = (x, y) => rgba[(y * W + x) * 4 + 1], B = (x, y) => rgba[(y * W + x) * 4 + 2];

    // 表格線：深色且低飽和（排除紅字 / 黃底）
    const colSum = new Array(W).fill(0), rowSum = new Array(H).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const r = R(x, y), g = G(x, y), b = B(x, y);
      if ((r + g + b) / 3 < 190 && Math.max(r, g, b) - Math.min(r, g, b) < 70) { colSum[x]++; rowSum[y]++; }
    }
    const V = peaks(colSum.map((v) => v / H), 0.3);
    let Hs = peaks(rowSum.map((v) => v / W), 0.3);
    if (V.length < 8 || Hs.length < 4) throw new Error("看不出班表的表格線，請確認照片是正面、清楚的班表截圖。");
    const med = median(Hs.slice(1).map((y, i) => y - Hs[i]));
    const fixed = [Hs[0]];
    for (let i = 0; i + 1 < Hs.length; i++) {       // 表格線漏抓 → 依標準列高切開
      const y0 = Hs[i], y1 = Hs[i + 1], k = C.pyRound((y1 - y0) / med);
      if (k >= 2 && Math.abs(y1 - y0 - k * med) < 0.25 * med) for (let j = 1; j < k; j++) fixed.push(Math.trunc(y0 + ((y1 - y0) * j) / k));
      fixed.push(y1);
    }
    Hs = fixed;
    const xs = V.slice(-8), rows = Hs.slice(0, -1).map((y, i) => [y, Hs[i + 1]]);
    const greenOf = (x0, y0, x1, y1) => {
      const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0), d = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = G(x + x0, y + y0);
      return { w, h, d, x0, y0 };
    };
    const cell = (r, i) => greenOf(xs[i] + 3, rows[r][0] + 3, xs[i + 1] - 2, rows[r][1] - 2);
    function kind(c) {
      if (!c.w || !c.h) return "empty";
      let off = 0, ink = 0;
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
        const r = R(x + c.x0, y + c.y0), g = G(x + c.x0, y + c.y0), b = B(x + c.x0, y + c.y0);
        if (r > 200 && g > 200 && b < 140) off++;
        if (r > 130 && g < 130 && b < 130 && r - g > 60) ink++;
      }
      if (off / (c.w * c.h) > 0.35) return "off";
      return ink >= 12 ? "text" : "empty";
    }
    function lineImages(c, scale, thr) {
      const [rw] = anyDark(c, 170), bands = [];
      let s = null;
      rw.forEach((v, i) => { if (v && s === null) s = i; if (!v && s !== null) { bands.push([s, i]); s = null; } });
      if (s !== null) bands.push([s, rw.length]);
      if (!bands.length) return [];
      const merged = [bands[0]];
      for (const b of bands.slice(1)) { const last = merged[merged.length - 1]; if (b[0] - last[1] <= 2) last[1] = b[1]; else merged.push(b); }
      return merged.map(([y0, y1]) => {
        const seg = crop(c, 0, Math.max(0, y0 - 2), c.w, Math.min(c.h, y1 + 2)), [, cols] = anyDark(seg, 170), [x0, x1] = firstLast(cols);
        return binarizedPad(crop(seg, Math.max(0, x0 - 2), 0, Math.min(seg.w, x1 + 3), seg.h), scale, thr);
      });
    }
    const digits = new Pool("eng", Math.min(4, navigator.hardwareConcurrency || 4)), chinese = new Pool("chi_tra", 2);
    const RANGE = /(\d{1,2}(?:\.\d+)?)\s*-\s*(\d{1,2}(?:\.\d+)?)/g;
    async function votesForLine(c, idx, variants) {
      const votes = new Map(), first = new Map();
      for (const [scale, thr, psm] of variants || VARIANTS) {
        const ims = lineImages(c, scale, thr);
        if (idx >= ims.length) break;
        const t = (await digits.read(ims[idx], { tessedit_pageseg_mode: String(psm), tessedit_char_whitelist: "0123456789.-" })).trim();
        for (const m of t.matchAll(RANGE)) {
          let s = half(m[1]);
          const e = half(m[2]);
          if (s === 1 && e > 6 && e <= 30) s = 11;        // 開頭的 11 常被讀成單一個 1
          if (plausible(s, e)) {
            const k = `${C.g(s)}-${C.g(e)}`;
            votes.set(k, (votes.get(k) || 0) + 1);
            if (!first.has(k)) first.set(k, first.size);
            break;
          }
        }
        const top = Array.from(votes.values()).sort((a, b) => b - a);
        if (top.length && top[0] >= 2 && (top.length === 1 || top[0] > top[1])) break;
      }
      let best = null;
      for (const [k, n] of votes) if (best === null || n > votes.get(best) || (n === votes.get(best) && first.get(k) < first.get(best))) best = k;
      return best;
    }
    const readTime = async (c, quick) => {
      if (quick) return votesForLine(c, 0, VARIANTS.slice(0, 2));
      return (await votesForLine(c, 0)) || votesForLine(c, 1);
    };
    async function readNumber(c) {
      const seg = inkSeg(c);
      if (!seg) return null;
      const t = (await digits.read(binarizedPad(seg, 5, 150), { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789" })).trim();
      return /^\d+$/.test(t) && +t >= 1 && +t <= 31 ? +t : null;
    }
    async function readText(c, n) {
      const seg = inkSeg(c);
      if (!seg) return "";
      const votes = new Map();
      for (const [scale, thr, psm] of [[4, 170, 7], [3, 170, 7], [6, 170, 7], [4, 150, 7], [4, 190, 7], [4, 170, 13]].slice(0, n)) {
        const t = (await chinese.read(binarizedPad(seg, scale, thr), { tessedit_pageseg_mode: String(psm) })).trim().replace(/\s/g, "");
        if (t) votes.set(t, (votes.get(t) || 0) + 1);
      }
      let best = "", cnt = 0;
      for (const [k, v] of votes) if (v > cnt) { best = k; cnt = v; }
      return best;
    }

    try {
      progress(0, 0, "正在偵測班表格線…");
      await digits.init();
      const kinds = rows.map((_, r) => [...Array(7).keys()].map((i) => kind(cell(r, i))));
      const firstOff = kinds.findIndex((ks) => ks.includes("off"));
      let start = null;
      for (let r = 0; r < kinds.length; r++) {
        if (firstOff >= 0 && r >= firstOff) break;
        if (!kinds[r].includes("text")) continue;
        const found = await Promise.all(kinds[r].map((k, i) => (k === "text" ? readTime(cell(r, i), true) : null)));
        if (found.some(Boolean)) { start = r; break; }
      }
      if (start === null) start = firstOff >= 0 ? firstOff : null;
      if (start === null) throw new Error("照片裡沒有讀到任何上班時間，請確認是班表截圖。");
      let last = start;
      kinds.forEach((ks, r) => { if (r >= start && ks.some((k) => k !== "empty")) last = r; });
      const staff = [];
      for (let r = start; r <= last; r++) staff.push(r);

      const jobs = [];
      staff.forEach((r) => { for (let i = 0; i < 7; i++) if (kinds[r][i] === "text") jobs.push([r, i]); });
      const nameCol = V.length >= 9 ? [V[V.length - 9], V[V.length - 8]] : null, roleCol = V.length >= 10 ? [V[V.length - 10], V[V.length - 9]] : null;
      const columnCell = (col, r) => greenOf(col[0] + 3, rows[r][0] + 3, col[1] - 2, rows[r][1] - 2);

      const buildLib = async (lib) => {
        const out = [];
        for (const nm of Object.keys(lib || {})) for (const b of lib[nm]) { try { out.push([nm, segFeat(await segUnpack(b))]); } catch (_e) { /* 壞掉的字形略過 */ } }
        return out;
      };
      const nameLib = await buildLib((libs || {}).names);
      const libMatch = (seg, lib) => {
        if (!seg || !seg.w || !seg.h || !lib.length) return null;
        const f = segFeat(seg), per = new Map();
        for (const [nm, g] of lib) {
          let s = 0;
          for (let i = 0; i < f.length; i++) s += f[i] * g[i];
          per.set(nm, Math.max(per.has(nm) ? per.get(nm) : -1, s));
        }
        const ranked = Array.from(per.entries()).sort((a, b) => b[1] - a[1]);
        return ranked.length && ranked[0][1] >= 0.85 && (ranked.length === 1 || ranked[0][1] - ranked[1][1] >= 0.08) ? ranked[0][0] : null;
      };
      const nameSegs = staff.map((r) => (nameCol ? inkSeg(columnCell(nameCol, r)) : null));
      const nameHit = nameSegs.map((s) => libMatch(s, nameLib));
      const textJobs = [];
      if (nameCol) staff.forEach((r, k) => {
        if (nameHit[k] === null) textJobs.push(["name", r, nameCol, 6]);
        if (roleCol) textJobs.push(["role", r, roleCol, 3]);
      });
      const total = jobs.length + textJobs.length;
      let done = 0;
      const tick = () => { done++; progress(done, total); };
      progress(0, total);
      const read = new Map(), texts = new Map();
      await Promise.all(jobs.map(async ([r, i]) => { read.set(r + "," + i, await readTime(cell(r, i))); tick(); }));
      await Promise.all(textJobs.map(async ([k, r, col, n]) => { texts.set(k + "," + r, await readText(columnCell(col, r), n)); tick(); }));

      const names = staff.map((r, k) => nameHit[k] || texts.get("name," + r) || "");
      const roles = staff.map((r) => fixRole(texts.get("role," + r) || ""));
      let unsure = 0;
      const out = staff.map((r) => [...Array(7).keys()].map((i) => {
        const k = kinds[r][i];
        if (k === "off") return "休";
        if (k === "empty") return "";
        const v = read.get(r + "," + i);
        if (v) return v;
        unsure++;
        return "?";
      }));

      // 由表頭日期推算這是哪一週（讀不到就用目前所選週）
      let monday = null;
      for (let r = 0; r < Math.min(start, 3) && !monday; r++) {
        const nums = await Promise.all([...Array(7).keys()].map((i) => (kinds[r][i] === "empty" ? readNumber(cell(r, i)) : null)));
        if (nums.filter(Boolean).length < 3) continue;
        const today = C.today(), first = C.addDays(today, -(C.weekday(today) + 7 * 20));
        let best = null, bestScore = 0;
        for (let k = 0; k < 45; k++) {
          const d = C.addDays(first, 7 * k);
          const score = nums.filter((n, i) => n && C.dayOf(C.addDays(d, i)) === n).length;
          if (score > bestScore || (score === bestScore && score && best && Math.abs(C.daysBetween(d, today)) < Math.abs(C.daysBetween(best, today)))) { best = d; bestScore = score; }
        }
        if (bestScore >= 3) monday = best;
      }
      return { monday, rows: out, unsure, names, roles, nameImgs: nameSegs.map((s) => (s && s.w ? segPack(s) : "")) };
    } finally {
      await Promise.all([digits.stop(), chinese.stop()]);
    }
  }
  window.OCR = { readSchedule, fixRole };
})();
