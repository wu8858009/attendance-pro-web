/* 員工出勤管理系統 PRO 網頁版：計算核心。
   逐段對應桌面版 attendance_system.py；tools/parity 會用同一份資料比對兩邊的輸出，改這裡時也要跑一次。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAYTYPE_OPTIONS = ["平日", "休息日", "國定假日", "例假日", "颱風假"];
  const DAYTYPE_KEY = { "平日": "weekday", "休息日": "restday", "國定假日": "holiday", "例假日": "mandatory", "颱風假": "typhoon" };
  const DAYTYPE_LABEL = { weekday: "平日", restday: "休息日", holiday: "國定假日", mandatory: "例假日", typhoon: "颱風假" };
  const TIME_OPTIONS_30MIN = [];
  for (let h = 0; h < 24; h++) for (const m of ["00", "30"]) TIME_OPTIONS_30MIN.push(String(h).padStart(2, "0") + ":" + m);
  const EMP_TYPE_OPTIONS = ["正職", "PT工讀生"];
  const EMP_TYPE_KEY = { "正職": "fulltime", "PT工讀生": "pt" };
  const EMP_TYPE_LABEL = { fulltime: "正職", pt: "PT工讀生" };
  const EMP_TYPE_ORDER = { fulltime: 0, pt: 1 };
  const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
  const BEREAVEMENT_RELATIONS = [
    ["父母、養父母、繼父母、配偶喪亡", 8],
    ["祖父母、子女、配偶之父母、配偶之養父母或繼父母喪亡", 6],
    ["曾祖父母、兄弟姊妹、配偶之祖父母喪亡", 3],
  ];
  const DEFAULT_SETTINGS = {
    appearanceMode: "dark", otMonthlyCap: 46, otMonthlyCapExtended: 54, defaultBreakMin: 60,
    shiftNoteTags: ["總公司", "門市", "客戶端", "居家", "外勤"], scheduleCellFontSize: 10, navOrder: [],
  };
  const LAW_CHECK_NAME = "勞動基準法";
  const LAW_CHECK_URL = "https://law.moj.gov.tw/LawClass/LawAll.aspx?PCode=N0030001";
  const STATUS_MAP = { ot: "需加班單", leave: "需請假單", normal: "正常" };

  // ---- Python 數值格式 ----
  function pyRound(x) {   // round()：四捨六入五成雙
    const f = Math.floor(x), d = x - f;
    if (d < 0.5) return f;
    if (d > 0.5) return f + 1;
    return f % 2 === 0 ? f : f + 1;
  }
  const fmtHours = (h) => pyRound(pyRound(h * 100)) / 100;
  const pf = (v) => {     // f"{float}"：整數也帶 .0
    const n = Number(v);
    return Number.isInteger(n) ? n.toFixed(1) : String(n);
  };
  const g = (v) => {      // f"{v:g}"
    const n = Number(v);
    return String(parseFloat(n.toPrecision(6)));
  };
  const pct0 = (v) => String(pyRound(Number(v)));   // f"{v:.0f}"
  const hr = (h) => pf(fmtHours(h));                // f"{fmt_hours(h)}"

  // ---- 日期：內部一律用 UTC 午夜的 Date，只做日曆運算 ----
  const mkDate = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
  const iso = (d) => d.toISOString().slice(0, 10);
  const pad2 = (n) => String(n).padStart(2, "0");
  function today() { const n = new Date(); return mkDate(n.getFullYear(), n.getMonth() + 1, n.getDate()); }
  const todayIso = () => iso(today());
  const thisMonth = () => todayIso().slice(0, 7);
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  const weekday = (d) => (d.getUTCDay() + 6) % 7;   // 週一=0
  const yearOf = (d) => d.getUTCFullYear();
  const monthOf = (d) => d.getUTCMonth() + 1;
  const dayOf = (d) => d.getUTCDate();
  const daysBetween = (a, b) => Math.round((a - b) / 86400000);
  const monthDays = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weekStart = (d) => addDays(d, -weekday(d));
  function validYmd(y, m, d) {
    if (y < 1 || m < 1 || m > 12 || d < 1 || d > monthDays(y, m)) return null;
    return mkDate(y, m, d);
  }
  function parseDate(s) {     // datetime.strptime(s, "%Y-%m-%d")；不合法回傳 null
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s));
    return m ? validYmd(+m[1], +m[2], +m[3]) : null;
  }
  function parseTaiwanDate(raw) {
    raw = String(raw || "").trim();
    if (!raw) return null;
    const groups = raw.split(/[^0-9]+/).filter(Boolean);
    let y, m, d;
    if (groups.length === 1) {
      const t = groups[0];
      if (t.length === 8) { y = t.slice(0, 4); m = t.slice(4, 6); d = t.slice(6, 8); }
      else if (t.length === 7) { y = t.slice(0, 3); m = t.slice(3, 5); d = t.slice(5, 7); }
      else return null;
    } else if (groups.length === 3) { [y, m, d] = groups; } else return null;
    let year = parseInt(y, 10);
    if (y.length <= 3) year += 1911;
    return validYmd(year, parseInt(m, 10), parseInt(d, 10));
  }
  const monthKey = (s) => s.slice(0, 7);
  function shiftMonthKey(month, delta) {
    const y = +month.slice(0, 4), m = +month.slice(5, 7), idx = y * 12 + (m - 1) + delta;
    return String(Math.floor(idx / 12)).padStart(4, "0") + "-" + pad2((((idx % 12) + 12) % 12) + 1);
  }
  const fmtMd = (d) => pad2(monthOf(d)) + "/" + pad2(dayOf(d));
  const fmtYmd = (d) => yearOf(d) + "/" + fmtMd(d);

  function newId() {
    const a = new Uint8Array(5);
    (typeof crypto !== "undefined" ? crypto : require("crypto").webcrypto).getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function parseDb(raw) {
    raw = raw || {};
    const employees = raw.employees || [];
    if (employees.some((e) => !("scheduleOrder" in e))) {
      const ordered = employees.slice().sort((a, b) => {
        const ka = EMP_TYPE_ORDER[a.type] ?? 99, kb = EMP_TYPE_ORDER[b.type] ?? 99;
        return ka - kb || cmp(a.empNo || "", b.empNo || "");
      });
      ordered.forEach((e, i) => { if (!("scheduleOrder" in e)) e.scheduleOrder = i; });
    }
    employees.forEach((e) => { if (!("isActive" in e)) e.isActive = true; });
    return {
      employees, records: raw.records || [], leaveLedger: raw.leaveLedger || [],
      shiftSchedule: raw.shiftSchedule || [], nameGlyphs: raw.nameGlyphs || {},
      settings: Object.assign({}, DEFAULT_SETTINGS, raw.settings || {}),
    };
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  // ---- 台灣行事曆 ----
  function holidayShortName(desc) {
    const name = desc.split("/").pop().split("及")[0].trim();
    const special = { "開國紀念日": "元旦", "農曆除夕": "除夕" };
    if (special[name]) return special[name];
    if (name.includes("光復")) return "光復節";
    return Array.from(name).slice(0, 5).join("");
  }
  const calKey = (d) => String(yearOf(d)) + pad2(monthOf(d)) + pad2(dayOf(d));
  function taiwanHolidayLabel(cache, d) {
    const rec = (x) => (cache[String(yearOf(x))] || {})[calKey(x)];
    const r = rec(d);
    if (!r) return "";
    const desc = (r.description || "").trim();
    if (!r.isHoliday) return desc.includes("補") && desc.includes("上班") ? "補班" : "";
    if (desc && desc !== "補假") return holidayShortName(desc);
    const block = [d];
    for (const step of [-1, 1]) {
      let x = addDays(d, step);
      while (block.length < 16 && (rec(x) || {}).isHoliday) { block.push(x); x = addDays(x, step); }
    }
    if (block.length < 3) return "";
    const names = block.slice().sort((a, b) => a - b).map((x) => (rec(x).description || "").trim());
    const main = names.find((n) => n && !["補假", "小年夜", "農曆除夕"].includes(n));
    if (!main) return "";
    let base = holidayShortName(main);
    const chars = Array.from(base);
    if (chars.length === 3 && "節日".includes(chars[2])) base = chars.slice(0, 2).join("");
    else if (chars.length > 3) base = chars.slice(0, 2).join("");
    return base + "連假";
  }
  function taiwanNationalHoliday(cache, dateStr) {
    const d = parseDate(dateStr);
    if (!d) return "";
    const r = (cache[String(yearOf(d))] || {})[calKey(d)];
    if (!r || !r.isHoliday) return "";
    const desc = (r.description || "").trim();
    return desc && desc !== "補假" ? holidayShortName(desc) : desc ? "補假" : "";
  }

  // ---- 工時 / 加班費核心計算 ----
  function timeToMinutes(t) { const [h, m] = t.split(":"); return parseInt(h, 10) * 60 + parseInt(m, 10); }
  function getSegments(rec) {
    const segs = rec.segments;
    if (segs && segs.length) return segs;
    if (rec.clockIn && rec.clockOut) return [{ in: rec.clockIn, out: rec.clockOut, location: rec.location || "" }];
    return [];
  }
  function formatSegmentsText(rec, sep = " ／ ") {
    const parts = [];
    for (const seg of getSegments(rec)) {
      if (!seg.in || !seg.out) continue;
      parts.push(seg.in + "-" + seg.out + (seg.location ? "@" + seg.location : ""));
    }
    return parts.length ? parts.join(sep) : "-";
  }
  function calcActualHoursSegments(segments, breakMin) {
    let total = 0;
    for (const seg of segments) {
      if (!seg.in || !seg.out) continue;
      const start = timeToMinutes(seg.in);
      let end = timeToMinutes(seg.out);
      if (end === start) continue;   // 上下班同一時間（如颱風假歸零 00:00-00:00）＝沒有工時
      if (end < start) end += 1440;
      total += end - start;
    }
    if (total <= 0) return 0;
    total -= Math.trunc(Number(breakMin || 0));
    if (total < 0) total = 0;
    return total / 60;
  }
  function restdayTierLines(hours) {
    const t1 = Math.min(hours, 2), t2 = Math.min(Math.max(hours - 2, 0), 6), t3 = Math.max(hours - 8, 0);
    const lines = [`前2小時 ${hr(t1)}hr × 1又1/3倍`];
    if (t2 > 0) lines.push(`第3~8小時 ${hr(t2)}hr × 1又2/3倍`);
    if (t3 > 0) lines.push(`第9小時起 ${hr(t3)}hr × 2又2/3倍`);
    return lines;
  }

  function calcAttendance(rec, empType) {
    if (empType === "fulltime" && rec.dayType === "holiday") {
      const result = calcAttendance(Object.assign({}, rec, { dayType: "weekday" }));
      result.dayType = "holiday";
      if (result.flag === "leave") { result.flag = "normal"; result.shortfall = 0; }
      result.detailLines.unshift("正職國定假日出勤：不另計加班（僅超過應班時數部分算加班）");
      return result;
    }
    const actual = calcActualHoursSegments(getSegments(rec), rec.breakMin || 0);
    const scheduled = Number(rec.scheduledHours || 0) || 0;
    const dayType = rec.dayType;
    const result = {
      actualHours: actual, scheduled, dayType, otHours: 0, shortfall: 0, flag: "normal",
      detailLines: [], warnings: [],
    };
    if (dayType === "weekday") {
      if (actual < scheduled - 0.001) {
        result.shortfall = scheduled - actual;
        result.flag = "leave";
      } else if (actual > scheduled + 0.001) {
        const ot = actual - scheduled;
        result.otHours = ot;
        result.flag = "ot";
        const t1 = Math.min(ot, 2), t2 = Math.min(Math.max(ot - 2, 0), 2), t3 = Math.max(ot - 4, 0);
        result.detailLines.push(`平日加班前2小時 ${hr(t1)}hr × 1又1/3倍`);
        if (t2 > 0) result.detailLines.push(`平日加班第3-4小時 ${hr(t2)}hr × 1又2/3倍`);
        if (t3 > 0) {
          result.detailLines.push(`⚠ 超過第4小時 ${hr(t3)}hr（平日單日延長工時原則上限4小時，已逾法定上限，請確認）`);
          result.warnings.push(
            "平日加班已超過4小時法定上限（勞基法第32條），請確認公司是否已依法與工會/勞資會議約定延長（最長至12小時）並注意月加班時數上限。");
        }
      }
    } else if (dayType === "restday") {
      if (actual > 0) {
        result.flag = "ot";
        result.otHours = actual;
        result.detailLines.push("休息日出勤，依實際工作時數計給（107年3月1日修法後已取消4/8/12小時級距）");
        result.detailLines.push(...restdayTierLines(actual));
        if (actual > 12) result.warnings.push("休息日出勤已超過12小時，已逾法定單日工時上限（勞基法第36條）。");
      }
    } else if (dayType === "holiday" && actual > 0) {
      result.flag = "ot";
      result.detailLines.push("國定假日出勤：當日工資照給，另加發一日工資(加倍發給)（勞基法第39條）");
      if (actual > 8) {
        const ot = actual - 8, t1 = Math.min(ot, 2), t2 = Math.max(ot - 2, 0);
        result.otHours = ot;
        result.detailLines.push(`超過8小時部分 前2小時 ${hr(t1)}hr × 1又1/3倍`);
        if (t2 > 0) result.detailLines.push(`超過8小時部分 第3小時起 ${hr(t2)}hr × 1又2/3倍`);
      }
    } else if (dayType === "mandatory" && actual > 0) {
      result.flag = "ot";
      result.warnings.push("例假日原則上不得出勤，僅限天災、事變或突發事件（勞基法第40條），出勤後應於事後補休並加倍發給工資，請確認出勤原因合法性。");
      result.detailLines.push("例假日出勤：工資加倍發給，並應於事後補休");
      if (actual > 8) {
        const ot = actual - 8, t1 = Math.min(ot, 2), t2 = Math.max(ot - 2, 0);
        result.otHours = ot;
        result.detailLines.push(`超過8小時部分 前2小時 ${hr(t1)}hr × 1又1/3倍（依平日加班倍率另計）`);
        if (t2 > 0) result.detailLines.push(`超過8小時部分 第3小時起 ${hr(t2)}hr × 1又2/3倍`);
      }
    } else if (dayType === "typhoon" && actual > 0) {
      result.flag = "ot";
      result.otHours = actual;
      result.detailLines.push("颱風假（天然災害停止上班）仍出勤，比照休息日依實際工作時數計給");
      result.detailLines.push(...restdayTierLines(actual));
      result.warnings.push("颱風假出勤薪資與補休並非勞基法強制規定，屬雇主與勞工協商性質（勞動部「天然災害發生時勞工上下班及工作安全注意事項」），系統暫比照休息日試算，實際給付方式請以公司規章或勞資協議為準。");
      if (actual > 12) result.warnings.push("颱風假出勤已超過12小時，已逾法定單日工時上限（勞基法第36條）。");
    } else if (dayType === "typhoon") {
      result.actualHours = 0;
      result.shortfall = scheduled;
      result.flag = scheduled > 0 ? "leave" : "normal";
      result.detailLines.push(scheduled > 0
        ? "颱風假停止上班、當日未出勤：上下班時間歸零，原應班時數需送請假單（颱風假），不扣特休／補休"
        : "颱風假停止上班：請在「應班時數」填入原本排定的時數，才能計算請假時數");
      return result;
    }

    let maxSeg = 0;
    for (const seg of getSegments(rec)) {
      if (!seg.in || !seg.out) continue;
      const s = timeToMinutes(seg.in);
      let e = timeToMinutes(seg.out);
      if (e <= s) e += 1440;
      maxSeg = Math.max(maxSeg, (e - s) / 60);
    }
    if (maxSeg > 4 && Number(rec.breakMin || 0) < 30) {
      result.warnings.push("單一時段已連續工作逾4小時，休息時間應至少30分鐘（勞基法第35條），目前登記的休息時間不足，請確認實際安排。");
    }
    if (actual > 12 && ["weekday", "holiday", "mandatory"].includes(dayType)) {
      result.warnings.push("當日總工時已超過12小時，已逾勞基法第32條單日工時上限。");
    }
    return result;
  }

  // ---- 特休／補休 ----
  function serviceYearsFloor(hire, ref) {
    if (!hire) return 0;
    const h = parseDate(hire), r = ref || today();
    let years = yearOf(r) - yearOf(h);
    const anniv = validYmd(yearOf(h) + years, monthOf(h), dayOf(h)) || mkDate(yearOf(h) + years, monthOf(h), 28);
    if (anniv > r) years -= 1;
    return Math.max(0, years);
  }
  function serviceDurationYmd(hire, ref) {
    if (!hire) return [0, 0, 0];
    const h = parseDate(hire), r = ref || today();
    if (r < h) return [0, 0, 0];
    let years = yearOf(r) - yearOf(h), months = monthOf(r) - monthOf(h), days = dayOf(r) - dayOf(h);
    if (days < 0) {
      months -= 1;
      const pm = monthOf(r) - 1 || 12, py = monthOf(r) > 1 ? yearOf(r) : yearOf(r) - 1;
      days += monthDays(py, pm);
    }
    if (months < 0) { years -= 1; months += 12; }
    return [years, months, days];
  }
  function formatServiceDuration(hire, ref) {
    const [y, m, d] = serviceDurationYmd(hire, ref);
    return `${y}年${m}月${d}天`;
  }
  function annualLeaveDays(hire) {
    if (!hire) return 0;
    const h = parseDate(hire), idx = monthOf(h) - 1 + 6;
    const y6 = yearOf(h) + Math.floor(idx / 12), m6 = (idx % 12) + 1;
    if (today() < mkDate(y6, m6, Math.min(dayOf(h), monthDays(y6, m6)))) return 0;
    const years = serviceYearsFloor(hire);
    if (years < 1) return 3;
    if (years < 2) return 7;
    if (years < 3) return 10;
    if (years < 5) return 14;
    if (years < 10) return 15;
    return Math.min(15 + (years - 9), 30);
  }
  function currentAnniversaryStart(hire) {
    const h = parseDate(hire), now = today();
    let anniv = validYmd(yearOf(now), monthOf(h), dayOf(h)) || mkDate(yearOf(now), monthOf(h), 28);
    if (anniv > now) {
      anniv = validYmd(yearOf(now) - 1, monthOf(anniv), dayOf(anniv)) || mkDate(yearOf(now) - 1, monthOf(anniv), 28);
    }
    return iso(anniv);
  }
  function annualLeaveBalance(db, emp) {
    const entitledDays = annualLeaveDays(emp.hireDate || "");
    const entitledHours = entitledDays * 8;
    const periodStart = emp.hireDate ? currentAnniversaryStart(emp.hireDate) : null;
    let used = 0;
    for (const l of db.leaveLedger) {
      if (l.empId === emp.id && l.type === "annual_use" && (!periodStart || l.date >= periodStart)) used += Number(l.hours);
    }
    return { entitledDays, entitledHours, used, remaining: Math.max(0, entitledHours - used), periodStart };
  }
  function compLeaveBalance(db, empId, month) {
    month = month || thisMonth();
    let earned = 0, used = 0;
    for (const l of db.leaveLedger) {
      if (l.empId !== empId || String(l.date || "").slice(0, 7) !== month) continue;
      if (l.type === "comp_earn") earned += Number(l.hours);
      if (l.type === "comp_use") used += Number(l.hours);
    }
    return { earned, used, remaining: Math.max(0, earned - used), month };
  }

  // ---- 需要整份資料庫的判定（對應 AttendanceApp 的方法）----
  class Logic {
    constructor(db) { this.db = db; }
    findEmp(id) { return this.db.employees.find((e) => e.id === id) || null; }
    findShift(empId, date) { return this.db.shiftSchedule.find((s) => s.empId === empId && s.date === date) || null; }
    calcRecord(rec, emp) {
      if (emp == null && rec.empId) emp = this.findEmp(rec.empId);
      return calcAttendance(rec, emp ? emp.type : undefined);
    }
    effectiveRecordFlag(rec, r) {
      const shift = this.findShift(rec.empId, rec.date);
      if (shift && shift.isOff && r.actualHours > 0) return ["ot", shift];
      return [r.flag, shift];
    }
    otFormLabel(rec, shift) {
      if (shift === undefined) shift = rec.date ? this.findShift(rec.empId, rec.date) : null;
      return rec.dayType === "restday" || !!(shift && shift.isOff) ? "加班單、加班費" : "加班單補休";
    }
    static decTime(minutes) {
      const v = (((minutes % 1440) + 1440) % 1440) / 60;
      return v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    }
    recordSendHours(rec) {
      const r = this.calcRecord(rec);
      const [flag, shift] = this.effectiveRecordFlag(rec, r);
      if (flag === "leave") return r.shortfall;
      if (flag !== "ot") return 0;
      const emp = this.findEmp(rec.empId);
      const fulltimeHoliday = rec.dayType === "holiday" && emp != null && emp.type === "fulltime";
      const wholeDay = (shift && shift.isOff && r.actualHours > 0) || (rec.dayType !== "weekday" && !fulltimeHoliday);
      return wholeDay ? r.actualHours : (r.otHours || r.actualHours);
    }
    recordSendSpan(rec) {   // [flag, start, end, reason, form]；工時正常回傳 null
      const segs = getSegments(rec).filter((s) => s.in && s.out);
      if (!segs.length) return null;
      const sched = Number(rec.scheduledHours || 0) || 0;
      const r = this.calcRecord(rec);
      const [flag, shift] = this.effectiveRecordFlag(rec, r);
      const span = (seg) => {
        const a = timeToMinutes(seg.in), b = timeToMinutes(seg.out);
        return [a, b <= a ? b + 1440 : b];
      };
      const firstIn = span(segs[0])[0], lastOut = span(segs[segs.length - 1])[1];
      const whole = [firstIn, firstIn + pyRound(r.actualHours * 60)];
      const dayType = rec.dayType, emp = this.findEmp(rec.empId);
      const fulltimeHoliday = dayType === "holiday" && emp != null && emp.type === "fulltime";
      if (flag === "ot") {
        let rng, reason;
        if (shift && shift.isOff && r.actualHours > 0) { rng = whole; reason = `排定${shift.offType || "休假"}日出勤`; }
        else if (dayType !== "weekday" && !fulltimeHoliday) { rng = whole; reason = `${DAYTYPE_LABEL[dayType]}出勤`; }
        else {
          const otMin = pyRound((r.otHours || r.actualHours) * 60);
          rng = [lastOut - otMin, lastOut];
          reason = `超${g(sched)}小時加班`;
        }
        return ["ot", rng[0], rng[1], reason, this.otFormLabel(rec, shift)];
      }
      if (flag === "leave") {
        const shortMin = pyRound(r.shortfall * 60);
        const schedSegs = ((shift || {}).segments || []).filter((s) => s.in && s.out);
        if (dayType === "typhoon") {
          const start = schedSegs.length && !shift.isOff ? span(schedSegs[0])[0] : null;
          return ["leave", start, start !== null ? start + shortMin : null, "颱風假停止上班", "請假單（颱風假）"];
        }
        let rng;
        if (schedSegs.length && !shift.isOff) {
          const sIn = span(schedSegs[0])[0], sOut = span(schedSegs[schedSegs.length - 1])[1];
          if (lastOut < sOut) rng = [lastOut, Math.min(sOut, lastOut + shortMin)];
          else if (firstIn > sIn) rng = [Math.max(sIn, firstIn - shortMin), firstIn];
          else rng = [lastOut, lastOut + shortMin];
        } else rng = [lastOut, lastOut + shortMin];
        return ["leave", rng[0], rng[1], `未滿${g(sched)}小時`, "請假單"];
      }
      return null;
    }
    recordNoticeText(rec, oneLine) {
      const info = this.recordSendSpan(rec);
      if (!info) return null;
      const [flag, start, end, reason, form] = info;
      const d = parseDate(rec.date);
      const rng = start !== null ? `${Logic.decTime(start)}-${Logic.decTime(end)}` : "";
      const sep = oneLine ? "" : "\n";
      const kind = flag === "ot" ? "加班" : "請假";
      return `${monthOf(d)}/${dayOf(d)}送${form}${rng}共${g(fmtHours(this.recordSendHours(rec)))}hr，${kind}原因附上${sep}（${reason}）`;
    }
    pendingFilePlan(rec) {
      const info = this.recordSendSpan(rec);
      if (!info) return null;
      const form = info[4];
      const hours = Math.max(0.5, pyRound(this.recordSendHours(rec) * 2) / 2);
      if (info[0] === "ot") return form === "加班單補休" ? ["comp_earn", hours, "➕ 補休取得"] : ["ot_pay", hours, "💰 加班費申請"];
      if (rec.dayType === "typhoon") return ["typhoon_leave", hours, "🌀 颱風假"];
      return ["comp_use", hours, "➖ 補休使用"];
    }
    getPendingForMonth(month) {
      const filed = new Map();
      for (const l of this.db.leaveLedger) {
        const k = l.empId + "|" + l.date;
        if (!filed.has(k)) filed.set(k, new Set());
        filed.get(k).add(l.type);
      }
      const resolvedBy = { ot: ["comp_earn", "ot_pay"], leave: ["annual_use", "comp_use", "bereavement_use", "typhoon_leave"] };
      const pending = [];
      for (const rec of this.db.records) {
        if (month !== null && monthKey(rec.date) !== month) continue;
        const emp = this.findEmp(rec.empId);
        if (!emp) continue;
        let r = this.calcRecord(rec);
        const [flag] = this.effectiveRecordFlag(rec, r);
        r = Object.assign({}, r, { flag });
        if (flag === "normal") continue;
        const types = filed.get(rec.empId + "|" + rec.date);
        if (types && resolvedBy[flag].some((t) => types.has(t))) continue;
        pending.push([rec, emp, r]);
      }
      pending.sort((a, b) => cmp(a[0].date, b[0].date) || cmp(a[1].name, b[1].name));
      return pending;
    }
    computeLeaveUsageRates(month) {
      let annualEntitled = 0, annualUsed = 0, compEarned = 0, compUsed = 0;
      for (const emp of this.db.employees) {
        if (emp.type !== "fulltime" || !emp.hireDate) continue;
        const b = annualLeaveBalance(this.db, emp);
        annualEntitled += b.entitledHours;
        annualUsed += b.used;
      }
      for (const emp of this.db.employees) {
        const c = compLeaveBalance(this.db, emp.id, month);
        compEarned += c.earned;
        compUsed += c.used;
      }
      return [annualEntitled > 0 ? (annualUsed / annualEntitled) * 100 : 0, compEarned > 0 ? (compUsed / compEarned) * 100 : 0];
    }
    computeOtCapViolations(month) {
      const cap = this.db.settings.otMonthlyCap, capExt = this.db.settings.otMonthlyCapExtended;
      const window = new Set([shiftMonthKey(month, -2), shiftMonthKey(month, -1), month]);
      const monthOt = new Map(), windowOt = new Map();
      for (const rec of this.db.records) {
        const mk = monthKey(rec.date);
        if (!window.has(mk)) continue;
        const ot = this.calcRecord(rec).otHours;
        windowOt.set(rec.empId, (windowOt.get(rec.empId) || 0) + ot);
        if (mk === month) monthOt.set(rec.empId, (monthOt.get(rec.empId) || 0) + ot);
      }
      const out = [];
      for (const emp of this.db.employees) {
        const m = monthOt.get(emp.id) || 0;
        if (m > capExt) out.push([emp.name, "high", `當月加班 ${hr(m)}hr，逾延長上限 ${g(capExt)}hr`]);
        else if (m > cap) out.push([emp.name, "mid", `當月加班 ${hr(m)}hr，逾一般上限 ${g(cap)}hr`]);
        const w = windowOt.get(emp.id) || 0;
        if (w > 138) out.push([emp.name, "high", `近3個月加班合計 ${hr(w)}hr，逾138hr上限`]);
      }
      return out;
    }
    computeWeeklyRestRate(month, empIds) {
      const y = +month.slice(0, 4), m = +month.slice(5, 7), last = monthDays(y, m);
      const cutoff = new Date(Math.min(mkDate(y, m, last), today()));
      const sundays = [];
      for (let d = 1; d <= last; d++) {
        const x = mkDate(y, m, d);
        if (weekday(x) === 6 && x <= cutoff) sundays.push(x);
      }
      if (!sundays.length || !empIds.size) return [null, sundays.length];
      const spanStart = iso(addDays(sundays[0], -6)), spanEnd = iso(sundays[sundays.length - 1]);
      const worked = new Map();
      for (const rec of this.db.records) {
        if (empIds.has(rec.empId) && spanStart <= rec.date && rec.date <= spanEnd && this.calcRecord(rec).actualHours > 0) {
          if (!worked.has(rec.empId)) worked.set(rec.empId, new Set());
          worked.get(rec.empId).add(rec.date);
        }
      }
      let required = 0, taken = 0;
      for (const id of empIds) {
        const emp = this.findEmp(id);
        if (!emp) continue;
        const hire = emp.hireDate || "", resign = emp.resignDate || "", days = worked.get(id) || new Set();
        for (const sun of sundays) {
          const mon = addDays(sun, -6);
          if ((hire && hire > iso(mon)) || (resign && resign < iso(sun))) continue;
          let n = 0;
          for (let k = 0; k < 7; k++) if (days.has(iso(addDays(mon, k)))) n++;
          required += 2;
          taken += Math.min(2, 7 - n);
        }
      }
      if (required === 0) return [null, sundays.length];
      return [(taken / required) * 100, sundays.length];
    }
    computeMonthStats(month) {
      const recs = this.db.records.filter((r) => monthKey(r.date) === month);
      let otCount = 0, leaveCount = 0, normalCount = 0, totalOt = 0, totalActual = 0;
      const perEmp = new Map(), daytypeHours = { weekday: 0, restday: 0, holiday: 0, mandatory: 0, typhoon: 0 };
      const dailyHours = {}, dailyHeads = {}, overtimeViolations = [];
      for (const rec of recs) {
        const emp = this.findEmp(rec.empId);
        if (!emp) continue;
        const r = this.calcRecord(rec);
        totalActual += r.actualHours;
        daytypeHours[rec.dayType] += r.actualHours;
        dailyHours[rec.date] = (dailyHours[rec.date] || 0) + r.actualHours;
        if (r.actualHours > 0) (dailyHeads[rec.date] = dailyHeads[rec.date] || new Set()).add(emp.id);
        if (r.actualHours > 12) overtimeViolations.push([rec.date, emp.name, r.actualHours]);
        if (r.flag === "ot") { otCount++; totalOt += r.otHours || r.actualHours; }
        else if (r.flag === "leave") leaveCount++;
        else normalCount++;
        if (!perEmp.has(emp.id)) perEmp.set(emp.id, { name: emp.name, type: emp.type, otHours: 0, leaveShort: 0, days: 0 });
        const pe = perEmp.get(emp.id);
        pe.days++;
        if (r.flag === "ot") pe.otHours += r.otHours || r.actualHours;
        if (r.flag === "leave") pe.leaveShort += r.shortfall;
      }
      const total = recs.length;
      const [annualRate, compRate] = this.computeLeaveUsageRates(month);
      const [weeklyRestRate, weeklyRestWeeks] = this.computeWeeklyRestRate(month, new Set(recs.map((r) => r.empId)));
      overtimeViolations.sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]) || a[2] - b[2]);
      const heads = {};
      Object.keys(dailyHeads).forEach((k) => { heads[k] = dailyHeads[k].size; });
      return {
        recs, perEmp, daytypeHours, otCount, leaveCount, normalCount, totalOtHours: totalOt, totalActualHours: totalActual,
        totalRecords: total, attendanceRate: total ? (normalCount / total) * 100 : 0, avgHours: total ? totalActual / total : 0,
        annualRate, compRate, dailyHours, dailyHeads: heads, overtimeViolations,
        otCapViolations: this.computeOtCapViolations(month), weeklyRestRate, weeklyRestWeeks, headcount: perEmp.size,
      };
    }
    computeComplianceIssues(month) {
      const issues = [], cap = this.db.settings.otMonthlyCap, capExt = this.db.settings.otMonthlyCapExtended;
      const sum = (arr) => arr.reduce((t, rec) => t + this.calcRecord(rec).otHours, 0);
      for (const emp of this.db.employees) {
        const empRecs = this.db.records.filter((r) => r.empId === emp.id && monthKey(r.date) === month)
          .sort((a, b) => cmp(a.date, b.date));
        if (!empRecs.length) continue;
        const monthOt = sum(empRecs);
        if (monthOt > capExt) issues.push([emp.name, "high", `當月加班時數 ${hr(monthOt)} 小時，已超過延長工時上限 ${g(capExt)} 小時。`]);
        else if (monthOt > cap) issues.push([emp.name, "mid", `當月加班時數 ${hr(monthOt)} 小時，已超過一般上限 ${g(cap)} 小時，需確認是否符合延長工時協議。`]);
        const window = new Set([shiftMonthKey(month, -2), shiftMonthKey(month, -1), month]);
        const three = sum(this.db.records.filter((r) => r.empId === emp.id && window.has(monthKey(r.date))));
        if (three > 138) issues.push([emp.name, "high",
          `近3個月（${shiftMonthKey(month, -2)}～${month}）加班時數合計 ${hr(three)} 小時，已超過勞基法第32條三個月138小時上限。`]);

        const workSet = new Set(this.db.records.filter((r) => r.empId === emp.id && this.calcRecord(r).actualHours > 0).map((r) => r.date));
        const monthWork = Array.from(workSet).filter((d) => monthKey(d) === month).sort();
        if (monthWork.length) {
          const first = parseDate(monthWork[0]), last = parseDate(monthWork[monthWork.length - 1]);
          let mon = addDays(first, -weekday(first));
          while (mon <= last) {
            let n = 0;
            for (let k = 0; k < 7; k++) if (workSet.has(iso(addDays(mon, k)))) n++;
            if (n > 5) issues.push([emp.name, "high", `${iso(mon)} 至 ${iso(addDays(mon, 6))} 該週工作 ${n} 天（休息不足2天），未符合每七日應有一例一休（勞基法第36條）。`]);
            mon = addDays(mon, 7);
          }
          const worked = (x) => workSet.has(iso(x));
          let d = first;
          while (d <= last) {
            if (!worked(d)) { d = addDays(d, 1); continue; }
            let runStart = d, runEnd = d;
            while (worked(addDays(runStart, -1))) runStart = addDays(runStart, -1);
            while (worked(addDays(runEnd, 1))) runEnd = addDays(runEnd, 1);
            const run = daysBetween(runEnd, runStart) + 1;
            if (run > 6) issues.push([emp.name, "high", `${iso(runStart)} 至 ${iso(runEnd)} 連續工作 ${run} 天，例假原則上不得使勞工連續工作逾6日（勞基法第36條）。`]);
            d = addDays(runEnd, 1);
          }
        }

        const workedRecs = empRecs.filter((r) => this.calcRecord(r).actualHours > 0);
        for (let i = 1; i < workedRecs.length; i++) {
          const prev = workedRecs[i - 1], cur = workedRecs[i];
          const ps = getSegments(prev), cs = getSegments(cur);
          if (prev.date === cur.date || !ps.length || !cs.length) continue;
          const pIn = ps[0].in, pOut = ps[ps.length - 1].out;
          let prevOut = parseDate(prev.date).getTime() + timeToMinutes(pOut) * 60000;
          if (timeToMinutes(pOut) <= timeToMinutes(pIn)) prevOut += 86400000;
          const curIn = parseDate(cur.date).getTime() + timeToMinutes(cs[0].in) * 60000;
          const gap = (curIn - prevOut) / 3600000;
          if (gap >= 0 && gap < 11) issues.push([emp.name, "mid", `${prev.date} 下班至 ${cur.date} 上班間隔僅 ${hr(gap)} 小時，未滿11小時（勞基法第34條）。`]);
        }
        for (const rec of empRecs) for (const w of this.calcRecord(rec).warnings) issues.push([emp.name, "high", `${rec.date}：${w}`]);
      }
      return issues;
    }
    buildLineMessage(month) {
      const pending = this.getPendingForMonth(month);
      if (!pending.length) return `📋 出勤待辦通知（${month}）\n\n本月目前無需送出的加班單或請假單／補休登記，狀態正常 ✅`;
      let text = `📋 出勤待辦通知（${month}）\n`;
      const byEmp = new Map();
      for (const [rec, emp] of pending) {
        if (!byEmp.has(emp.id)) byEmp.set(emp.id, [emp, []]);
        byEmp.get(emp.id)[1].push(rec);
      }
      for (const [emp, recs] of byEmp.values()) {
        text += `\n【${emp.name}】\n`;
        text += recs.map((r) => this.recordNoticeText(r) || "").join("\n") + "\n";
      }
      return text + "\n請相關同仁儘速補送單據，謝謝 🙏";
    }
    sortedEmployees() {
      return this.db.employees.slice().sort((a, b) =>
        (EMP_TYPE_ORDER[a.type] ?? 99) - (EMP_TYPE_ORDER[b.type] ?? 99) || cmp(a.empNo || "", b.empNo || ""));
    }
    scheduledEmployees() {
      const so = (e) => ("scheduleOrder" in e ? e.scheduleOrder : 999999);
      return this.db.employees.slice().sort((a, b) =>
        so(a) - so(b) || (EMP_TYPE_ORDER[a.type] ?? 99) - (EMP_TYPE_ORDER[b.type] ?? 99) || cmp(a.empNo || "", b.empNo || ""));
    }
    lastWorkDate(empId, before) {
      let best = null;
      for (const s of this.db.shiftSchedule) {
        if (s.empId === empId && !s.isOff && (before == null || s.date < before) && (best === null || s.date > best)) best = s.date;
      }
      return best;
    }
    resignDate(emp) {
      if (emp.isActive !== false) return null;
      if (emp.resignDate) return emp.resignDate;
      if (emp.resignedFrom) return iso(addDays(parseDate(emp.resignedFrom), -1));
      return this.lastWorkDate(emp.id) || "";
    }
    empShownInWeek(emp, monday) {
      const rd = this.resignDate(emp);
      return rd === null || (!!rd && iso(monday) <= rd);
    }
    suggestResignDate(emp) {
      const t = todayIso();
      let last = null;
      if (emp.id) {
        last = this.lastWorkDate(emp.id);
        if (!last) for (const s of this.db.shiftSchedule) if (s.empId === emp.id && (last === null || s.date > last)) last = s.date;
      }
      return last ? (last < t ? last : t) : t;
    }
    markResigned(emp, date) {
      emp.isActive = false;
      emp.resignDate = date || this.suggestResignDate(emp);
      delete emp.resignedFrom;
    }
    static markActive(emp) { emp.isActive = true; delete emp.resignDate; delete emp.resignedFrom; }
    isWorkdayFor(empId, date) {
      const s = this.findShift(empId, date);
      if (s && !s.isOff && (s.segments || []).some((x) => x.in && x.out)) return true;
      return this.db.records.some((r) => r.empId === empId && r.date === date && calcAttendance(r).actualHours > 0);
    }
    ptSixthWorkdayReason(emp, dateStr) {
      if (!emp || emp.type !== "pt") return null;
      const d = parseDate(dateStr);
      if (!d) return null;
      let all = true;
      for (let k = 1; k <= 5; k++) if (!this.isWorkdayFor(emp.id, iso(addDays(d, -k)))) { all = false; break; }
      if (all) return "前5天已連續上班";
      const monday = addDays(d, -weekday(d));
      let n = 0;
      for (let k = 0; k < weekday(d); k++) if (this.isWorkdayFor(emp.id, iso(addDays(monday, k)))) n++;
      return n >= 5 ? "本週（週一～週日）已上班5天" : null;
    }
    formatShiftCell(empId, date, shift) {
      if (shift === undefined) shift = this.findShift(empId, date);
      if (!shift) return "未排班";
      if (shift.isOff) return shift.offType || "休假";
      const parts = [];
      for (const seg of shift.segments || []) {
        if (!seg.in || !seg.out) continue;
        parts.push(seg.in + "-" + seg.out + (seg.note ? "@" + seg.note : ""));
      }
      return parts.length ? parts.join(" / ") : "未排班";
    }
    syncAnnualLedgerForShift(shiftId, empId, date, isAnnual) {
      const ledger = this.db.leaveLedger;
      const existing = ledger.find((l) => l.scheduleShiftId === shiftId);
      const emp = this.findEmp(empId);
      if (isAnnual && emp && emp.type !== "fulltime") isAnnual = false;
      if (isAnnual) {
        const hours = emp ? Number(emp.normalHours) : 8;
        if (existing) { existing.date = date; existing.hours = hours; }
        else ledger.push({ id: newId(), empId, date, type: "annual_use", hours, note: "由排班表設定特休", scheduleShiftId: shiftId });
      } else if (existing) {
        ledger.splice(ledger.indexOf(existing), 1);
      }
    }
    setShiftOff(empId, date, offType) {
      const shift = this.findShift(empId, date);
      let shiftId;
      if (shift) { shift.isOff = true; shift.offType = offType; shift.segments = []; shiftId = shift.id; }
      else {
        shiftId = newId();
        this.db.shiftSchedule.push({ id: shiftId, empId, date, isOff: true, offType, segments: [], note: "" });
      }
      this.syncAnnualLedgerForShift(shiftId, empId, date, offType === "特休");
    }
    mergeEmployee(srcId, dstId) {
      const db = this.db;
      const dstDates = new Set(db.shiftSchedule.filter((s) => s.empId === dstId).map((s) => s.date));
      const dropped = new Set(db.shiftSchedule.filter((s) => s.empId === srcId && dstDates.has(s.date)).map((s) => s.id));
      db.shiftSchedule = db.shiftSchedule.filter((s) => !dropped.has(s.id));
      db.leaveLedger = db.leaveLedger.filter((l) => !dropped.has(l.scheduleShiftId));
      for (const key of ["shiftSchedule", "records", "leaveLedger"]) for (const it of db[key]) if (it.empId === srcId) it.empId = dstId;
      const glyphs = db.nameGlyphs;
      const dst = glyphs[dstId] || [];
      const merged = dst.concat((glyphs[srcId] || []).filter((x) => !dst.includes(x)));
      delete glyphs[srcId];
      if (merged.length) glyphs[dstId] = merged.slice(-8);
      const s = this.findEmp(srcId), d = this.findEmp(dstId);
      if (s && d && s.isActive !== false) Logic.markActive(d);
      db.employees = db.employees.filter((e) => e.id !== srcId);
    }
    csvRows(month) {
      const recs = this.db.records.filter((r) => monthKey(r.date) === month).sort((a, b) => cmp(a.date, b.date));
      const rows = [["日期", "員工", "類型", "日別", "時段(含地點)", "休息(分)", "應班時數", "實際工時", "狀態", "加班時數", "備註"]];
      for (const rec of recs) {
        const emp = this.findEmp(rec.empId);
        if (!emp) continue;
        const r = this.calcRecord(rec);
        rows.push([rec.date, emp.name, EMP_TYPE_LABEL[emp.type], DAYTYPE_LABEL[rec.dayType], formatSegmentsText(rec),
          pf(rec.breakMin), pf(rec.scheduledHours), hr(r.actualHours), STATUS_MAP[r.flag], hr(r.otHours || 0), rec.note || ""]);
      }
      return rows;
    }
  }

  // ---- difflib ----
  function matchingSize(a, b) {   // SequenceMatcher 的比對區塊總長
    const la = a.length, lb = b.length;
    let total = 0;
    const walk = (alo, ahi, blo, bhi) => {
      if (alo >= ahi || blo >= bhi) return;
      let besti = alo, bestj = blo, bestsize = 0, j2len = new Map();
      for (let i = alo; i < ahi; i++) {
        const next = new Map();
        for (let j = blo; j < bhi; j++) {
          if (a[i] !== b[j]) continue;
          const k = (j2len.get(j - 1) || 0) + 1;
          next.set(j, k);
          if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
        }
        j2len = next;
      }
      if (!bestsize) return;
      total += bestsize;
      walk(alo, besti, blo, bestj);
      walk(besti + bestsize, ahi, bestj + bestsize, bhi);
    };
    walk(0, la, 0, lb);
    return total;
  }
  function seqRatio(a, b) {
    const A = Array.from(a), B = Array.from(b);
    return A.length + B.length ? (2 * matchingSize(A, B)) / (A.length + B.length) : 1;
  }
  function closeMatch(word, options, cutoff) {
    let best = null, bestScore = -1;
    for (const o of options) {
      const s = seqRatio(o, word);     // get_close_matches：seq1=候選、seq2=word
      if (s >= cutoff && (s > bestScore || (s === bestScore && o > best))) { best = o; bestScore = s; }
    }
    return best;
  }

  return {
    DAYTYPE_OPTIONS, DAYTYPE_KEY, DAYTYPE_LABEL, TIME_OPTIONS_30MIN, EMP_TYPE_OPTIONS, EMP_TYPE_KEY, EMP_TYPE_LABEL, EMP_TYPE_ORDER,
    WEEKDAY_LABELS, BEREAVEMENT_RELATIONS, DEFAULT_SETTINGS, LAW_CHECK_NAME, LAW_CHECK_URL, STATUS_MAP,
    pyRound, fmtHours, pf, g, pct0, hr, mkDate, iso, pad2, today, todayIso, thisMonth, addDays, weekday, yearOf, monthOf, dayOf,
    daysBetween, monthDays, weekStart, validYmd, parseDate, parseTaiwanDate, monthKey, shiftMonthKey, fmtMd, fmtYmd, newId, parseDb, cmp,
    holidayShortName, calKey, taiwanHolidayLabel, taiwanNationalHoliday, timeToMinutes, getSegments, formatSegmentsText,
    calcActualHoursSegments, calcAttendance, serviceYearsFloor, formatServiceDuration, annualLeaveDays, currentAnniversaryStart,
    annualLeaveBalance, compLeaveBalance, Logic, seqRatio, closeMatch,
  };
});
