/* 員工出勤管理系統 PRO 網頁版後端（綁定在 Google 試算表的 Apps Script）。
   每筆資料一列：id ＋ 方便人看的欄位 ＋ 最後一欄完整 JSON（程式只讀 JSON）。
   部署：執行身分「我」、存取權「任何人」；資料靠網頁登入的密碼保護。 */

var SHEETS = {
  employees: { name: "員工", head: ["id", "員工編號", "姓名", "類型", "標準工時", "到職日", "在職", "離職日", "data"] },
  records: { name: "出勤紀錄", head: ["id", "日期", "員工", "日別", "時段", "休息(分)", "應班", "備註", "data"] },
  leaveLedger: { name: "假別紀錄", head: ["id", "日期", "員工", "類型", "時數", "備註", "data"] },
  shiftSchedule: { name: "排班", head: ["id", "日期", "員工", "班別", "備註", "data"] },
  nameGlyphs: { name: "姓名字形", head: ["id", "員工", "張數", "data"] },
  settings: { name: "設定", head: ["id", "data"] }
};
var COLLECTIONS = Object.keys(SHEETS);
var SESSION_DAYS = 30;
var CELL_LIMIT = 49000;
var LAW_URL = "https://law.moj.gov.tw/LawClass/LawAll.aspx?PCode=N0030001";

// 第一次部署後在編輯器手動執行一次：跳出 Google 授權並建立工作表
function authorizeOnce() {
  ensureSheets_();
  UrlFetchApp.fetch(LAW_URL, { muteHttpExceptions: true, validateHttpsCertificates: false });
}

function doGet() { return json_({ ok: true, app: "attendance" }); }

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: "bad_request" }); }
  try {
    var pub = { status: status_, setup: setup_, login: login_ };
    if (pub[req.action]) return json_(pub[req.action](req));
    if (!validToken_(req.token)) return json_({ error: "auth" });
    var priv = { logout: logout_, rev: rev_, load: load_, apply: apply_, restore: restore_, lawCheck: lawCheck_, changePassword: changePassword_ };
    if (!priv[req.action]) return json_({ error: "unknown_action" });
    return json_(priv[req.action](req));
  } catch (err) {
    return json_({ error: "server", message: String(err && err.message || err) });
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function props_() { return PropertiesService.getScriptProperties(); }
function b64_(bytes) { return Utilities.base64Encode(bytes); }
function sha_(s) { return b64_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function same_(a, b) {            // 長度相同時逐字比到底，比對時間不洩漏相同的位數
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function randomToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ""); }
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---- 密碼：瀏覽器先用 PBKDF2 算出 key（salt 由這裡發），這裡只存 key 的雜湊 ----
function status_() {
  var p = props_();
  var salt = p.getProperty("salt");
  if (!salt) { salt = randomToken_(); p.setProperty("salt", salt); }
  return { needsSetup: !p.getProperty("pwHash"), salt: salt };
}
function checkKey_(key) {
  return same_(sha_(props_().getProperty("salt") + ":" + key), props_().getProperty("pwHash") || "");
}
function issueToken_() {
  var t = randomToken_();
  props_().setProperty("tok_" + sha_(t), String(Date.now() + SESSION_DAYS * 86400000));
  pruneTokens_();
  return t;
}
function pruneTokens_() {
  var p = props_(), all = p.getProperties(), now = Date.now();
  Object.keys(all).forEach(function (k) { if (k.indexOf("tok_") === 0 && Number(all[k]) < now) p.deleteProperty(k); });
}
function validToken_(t) {
  if (!t) return false;
  var exp = props_().getProperty("tok_" + sha_(String(t)));
  return !!exp && Number(exp) > Date.now();
}
function setup_(req) {
  return withLock_(function () {
    if (props_().getProperty("pwHash")) return { error: "already_setup" };
    if (!req.key) return { error: "bad_request" };
    status_();
    props_().setProperty("pwHash", sha_(props_().getProperty("salt") + ":" + req.key));
    ensureSheets_();
    return { token: issueToken_() };
  });
}
function login_(req) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get("loginFails") || 0);
  if (fails >= 10) return { error: "locked" };          // 連續錯太多次先鎖 10 分鐘
  if (!props_().getProperty("pwHash")) return { error: "needs_setup" };
  if (!req.key || !checkKey_(req.key)) {
    cache.put("loginFails", String(fails + 1), 600);
    return { error: "wrong_password" };
  }
  cache.remove("loginFails");
  return { token: issueToken_() };
}
function logout_(req) { props_().deleteProperty("tok_" + sha_(String(req.token))); return { ok: true }; }
function changePassword_(req) {
  if (!checkKey_(req.key || "")) return { error: "wrong_password" };
  if (!req.newKey) return { error: "bad_request" };
  var p = props_();
  p.setProperty("pwHash", sha_(p.getProperty("salt") + ":" + req.newKey));
  var all = p.getProperties();
  Object.keys(all).forEach(function (k) { if (k.indexOf("tok_") === 0) p.deleteProperty(k); });   // 其他裝置全部登出
  return { token: issueToken_() };
}

// ---- 試算表 ----
function ensureSheets_() {
  var ss = SpreadsheetApp.getActive();
  COLLECTIONS.forEach(function (c) {
    var def = SHEETS[c], sh = ss.getSheetByName(def.name);
    if (!sh) sh = ss.insertSheet(def.name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, sh.getMaxRows(), def.head.length).setNumberFormat("@");   // 全部當文字，日期不被自動轉換
      sh.getRange(1, 1, 1, def.head.length).setValues([def.head]).setFontWeight("bold");
      sh.setFrozenRows(1);
    }
  });
}
function sheet_(c) { return SpreadsheetApp.getActive().getSheetByName(SHEETS[c].name); }
function safe_(v) {               // 使用者輸入的文字不能被試算表當成公式
  var s = v === null || v === undefined ? "" : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function toRow_(c, item) {        // item = { id, view: [...], data: {...} }
  var n = SHEETS[c].head.length;
  var row = [String(item.id)];
  var view = item.view || [];
  for (var i = 0; i < n - 2; i++) row.push(safe_(view[i]));
  var s = JSON.stringify(item.data);
  if (s.length > CELL_LIMIT) throw new Error("單筆資料過大：" + c + " " + item.id);
  row.push(s);
  return row;
}
function readAll_(c) {
  var sh = sheet_(c), last = sh.getLastRow();
  if (last < 2) return [];
  var n = SHEETS[c].head.length;
  return sh.getRange(2, n, last - 1, 1).getValues().map(function (r) { return JSON.parse(r[0]); });
}
function revision_() { return Number(props_().getProperty("rev") || 0); }
function bump_() { var r = revision_() + 1; props_().setProperty("rev", String(r)); return r; }

function rev_() { return { rev: revision_() }; }

function load_() {
  ensureSheets_();
  var out = { rev: revision_() };
  ["employees", "records", "leaveLedger", "shiftSchedule"].forEach(function (c) { out[c] = readAll_(c); });
  var glyphs = {};
  readAll_("nameGlyphs").forEach(function (g) { glyphs[g.empId] = g.images; });
  out.nameGlyphs = glyphs;
  var settings = {}, sh = sheet_("settings"), last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) { settings[r[0]] = JSON.parse(r[1]); });
  out.lawCache = settings.__lawCache || {};
  delete settings.__lawCache;
  out.settings = settings;
  return out;
}

function applyCollection_(c, ops) {
  if (!ops || (!(ops.upsert || []).length && !(ops.del || []).length)) return;
  var sh = sheet_(c), n = SHEETS[c].head.length, last = sh.getLastRow();
  var ids = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
  var rowOf = {};
  ids.forEach(function (r, i) { rowOf[String(r[0])] = i + 2; });
  var fresh = [];
  (ops.upsert || []).forEach(function (item) {
    var row = toRow_(c, item), at = rowOf[String(item.id)];
    if (at) sh.getRange(at, 1, 1, n).setValues([row]);
    else { fresh.push(row); rowOf[String(item.id)] = -1; }
  });
  if (fresh.length) {
    sh.getRange(last + 1, 1, fresh.length, n).setNumberFormat("@").setValues(fresh);
  }
  var rows = (ops.del || []).map(function (id) { return rowOf[String(id)]; }).filter(function (r) { return r > 0; });
  rows.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
}

function apply_(req) {
  return withLock_(function () {
    ensureSheets_();
    var before = revision_();
    COLLECTIONS.forEach(function (c) { applyCollection_(c, (req.ops || {})[c]); });
    return { rev: bump_(), prevRev: before };
  });
}

function restore_(req) {           // 整份覆蓋：從備份還原、第一次匯入桌面版資料
  return withLock_(function () {
    ensureSheets_();
    COLLECTIONS.forEach(function (c) {
      var sh = sheet_(c), n = SHEETS[c].head.length, last = sh.getLastRow();
      if (last >= 2) sh.getRange(2, 1, last - 1, n).clearContent();
      var rows = ((req.data || {})[c] || []).map(function (item) { return toRow_(c, item); });
      if (rows.length) sh.getRange(2, 1, rows.length, n).setNumberFormat("@").setValues(rows);
    });
    return { rev: bump_() };
  });
}

// ---- 法規異動偵測：瀏覽器不能跨網域讀法務部頁面，由這裡抓 ----
function lawCheck_() {
  var html;
  var opt = { muteHttpExceptions: true, headers: { "User-Agent": "Mozilla/5.0" } };
  try {
    html = UrlFetchApp.fetch(LAW_URL, opt).getContentText();
  } catch (err) {
    opt.validateHttpsCertificates = false;   // gov.tw 憑證鏈相容性問題；公開法規頁、不傳任何資料
    try { html = UrlFetchApp.fetch(LAW_URL, opt).getContentText(); } catch (e2) { return { result: null }; }
  }
  var text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, "");
  var m = /修正日期[：:]?民國(\d+)年(\d+)月(\d+)日/.exec(text);
  return { result: m ? "民國" + m[1] + "年" + m[2] + "月" + m[3] + "日" : null };
}
