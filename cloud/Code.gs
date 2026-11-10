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
var SESSIONS_VALID_AFTER = 1794274011408;   // 這個時間以前發出的登入全部失效，要重新輸入帳號密碼
var CELL_LIMIT = 49000;
var LAW_URL = "https://law.moj.gov.tw/LawClass/LawAll.aspx?PCode=N0030001";
var ADMIN = "admin";
var MODULES = ["report", "punch", "records", "employees", "schedule", "leave", "settings"];
var EMP_MODULES = ["report", "records", "schedule", "leave"];   // 員工帳號只能開放這幾項，而且只能看
// 每種資料可由哪些功能的「可編輯」權限寫入（排班會連動假別與員工、合併員工會連動全部）
var WRITE_BY = {
  employees: ["employees", "schedule"], records: ["punch", "records", "employees"], leaveLedger: ["punch", "report", "leave", "schedule", "employees"],
  shiftSchedule: ["schedule", "employees"], nameGlyphs: ["schedule", "employees"], settings: ["settings"]
};

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
    var user = tokenUser_(req.token);
    if (!user) return json_({ error: "auth" });
    if (req.action === "rev") return json_(rev_());       // 幾秒一次，不讀帳號資料
    var acc = accounts_()[user];
    if (!acc) return json_({ error: "auth" });
    if (req.action === "logout") return json_(logout_(req));
    if (req.action === "changePassword") return json_(changePassword_(req, acc));
    if (acc.must) return json_({ error: "must_change" });
    var priv = { load: load_, apply: apply_, lawCheck: lawCheck_ };
    if (priv[req.action]) return json_(priv[req.action](req, acc));
    var adminOnly = { restore: restore_, accountsList: accountsList_, accountSave: accountSave_, accountsBatch: accountsBatch_, accountReset: accountReset_, accountDelete: accountDelete_ };
    if (!adminOnly[req.action]) return json_({ error: "unknown_action" });
    if (!acc.admin) return json_({ error: "forbidden" });
    return json_(adminOnly[req.action](req, acc));
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
function status_(req) {
  var p = props_();
  var salt = p.getProperty("salt");
  if (!salt) { salt = randomToken_(); p.setProperty("salt", salt); }
  var out = { needsSetup: !p.getProperty("pwHash"), salt: salt };
  if (req && req.names && !out.needsSetup) out.logins = loginChoices_();
  return out;
}
function loginChoices_() {              // 登入畫面的下拉選單：管理員、幹部，加上目前在職的員工
  var all = accounts_(), byEmp = {}, out = [];
  Object.keys(all).sort().forEach(function (k) {
    var a = all[k];
    if (a.empId) byEmp[a.empId] = a;
    else if (a.admin) out.unshift({ u: a.u, label: "管理員（" + a.u + "）", has: true });
    else out.push({ u: a.u, label: a.name + "（幹部）", has: true });
  });
  readAll_("employees").filter(function (e) { return e.isActive !== false; })
    .sort(function (a, b) { return (a.scheduleOrder === undefined ? 9999 : a.scheduleOrder) - (b.scheduleOrder === undefined ? 9999 : b.scheduleOrder); })
    .forEach(function (e) { var a = byEmp[e.id]; out.push({ u: a ? a.u : "", label: e.name, has: !!a }); });
  return out;
}
function hashKey_(salt, key) { return sha_(salt + ":" + key); }
function accKey_(u) { return "acc_" + sha_(u); }
function normUser_(u) { return String(u === undefined || u === null ? "" : u).trim().toLowerCase(); }

// ---- 帳號：每個帳號一筆 Script Property，讀取走快取；原本的管理密碼自動成為 admin ----
function accounts_() {
  var cache = CacheService.getScriptCache(), hit = cache.get("accounts");
  if (hit) return JSON.parse(hit);
  var p = props_(), all = p.getProperties(), out = {};
  Object.keys(all).forEach(function (k) { if (k.indexOf("acc_") === 0) { var a = JSON.parse(all[k]); out[a.u] = a; } });
  if (!out[ADMIN] && all.pwHash) {
    out[ADMIN] = { u: ADMIN, name: "管理員", empId: "", admin: true, perms: {}, s: all.salt, h: all.pwHash };
    p.setProperty(accKey_(ADMIN), JSON.stringify(out[ADMIN]));
  }
  try { cache.put("accounts", JSON.stringify(out), 21600); } catch (e) { /* 太大就不快取 */ }
  return out;
}
function putAccount_(a) { props_().setProperty(accKey_(a.u), JSON.stringify(a)); CacheService.getScriptCache().remove("accounts"); }
function setSecret_(a, key) { a.s = randomToken_(); a.h = hashKey_(a.s, key); }
function normPerms_(perms, empId) {
  var out = {};
  MODULES.forEach(function (m) {
    var v = (perms || {})[m];
    if (v !== "view" && v !== "edit") v = "none";
    if (empId) { if (EMP_MODULES.indexOf(m) < 0) v = "none"; else if (v === "edit") v = "view"; }
    out[m] = v;
  });
  return out;
}
function allEdit_() { var o = {}; MODULES.forEach(function (m) { o[m] = "edit"; }); return o; }
function publicAcc_(a) { return { username: a.u, name: a.name, empId: a.empId || "", admin: !!a.admin, perms: a.admin ? allEdit_() : normPerms_(a.perms, a.empId), mustChange: !!a.must }; }
function tokenDead_(parts) { return parts.e <= Date.now() || parts.e - SESSION_DAYS * 86400000 < SESSIONS_VALID_AFTER; }
function tokenParts_(v) {               // 舊版的登入憑證只存到期時間
  if (String(v).charAt(0) !== "{") return { e: Number(v), u: ADMIN };
  return JSON.parse(v);
}
function issueToken_(user) {
  var t = randomToken_();
  props_().setProperty("tok_" + sha_(t), JSON.stringify({ e: Date.now() + SESSION_DAYS * 86400000, u: user }));
  pruneTokens_();
  return t;
}
function pruneTokens_() {
  var p = props_(), all = p.getProperties();
  Object.keys(all).forEach(function (k) { if (k.indexOf("tok_") === 0 && tokenDead_(tokenParts_(all[k]))) p.deleteProperty(k); });
}
function tokenUser_(t) {                // 幾秒一次的同步檢查走快取，避開 PropertiesService 每日讀取上限
  if (!t) return null;
  var hash = sha_(String(t)), cache = CacheService.getScriptCache(), hit = cache.get("tk2_" + hash);
  if (hit) return hit;
  var v = props_().getProperty("tok_" + hash);
  if (!v) return null;
  var parts = tokenParts_(v);
  if (tokenDead_(parts)) return null;
  cache.put("tk2_" + hash, parts.u, Math.min(21600, Math.floor((parts.e - Date.now()) / 1000)));
  return parts.u;
}
function revokeTokens_(user) {
  var p = props_(), all = p.getProperties(), cache = CacheService.getScriptCache();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf("tok_") !== 0 || tokenParts_(all[k]).u !== user) return;
    p.deleteProperty(k);
    cache.remove("tk2_" + k.slice(4));
  });
}
function setup_(req) {
  return withLock_(function () {
    if (props_().getProperty("pwHash")) return { error: "already_setup" };
    if (!req.key) return { error: "bad_request" };
    status_();
    props_().setProperty("pwHash", hashKey_(props_().getProperty("salt"), req.key));
    CacheService.getScriptCache().remove("accounts");
    ensureSheets_();
    accounts_();
    return { token: issueToken_(ADMIN) };
  });
}
function login_(req) {
  var user = normUser_(req.username) || ADMIN;           // 舊版網頁沒有帳號欄位，視為 admin
  var cache = CacheService.getScriptCache(), failKey = "loginFails_" + sha_(user);
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= 10) return { error: "locked" };           // 同一帳號連續錯太多次先鎖 10 分鐘
  if (!props_().getProperty("pwHash")) return { error: "needs_setup" };
  var acc = accounts_()[user];
  if (!req.key || !acc || !same_(hashKey_(acc.s, req.key), acc.h)) {
    cache.put(failKey, String(fails + 1), 600);
    return { error: "wrong_password" };
  }
  cache.remove(failKey);
  return { token: issueToken_(user), mustChange: !!acc.must };
}
function logout_(req) {
  var hash = sha_(String(req.token));
  props_().deleteProperty("tok_" + hash);
  CacheService.getScriptCache().remove("tk2_" + hash);
  return { ok: true };
}
function changePassword_(req, acc) {
  if (!req.key || !same_(hashKey_(acc.s, req.key), acc.h)) return { error: "wrong_password" };
  if (!req.newKey) return { error: "bad_request" };
  setSecret_(acc, req.newKey);
  delete acc.must;
  if (acc.admin) props_().setProperty("pwHash", hashKey_(props_().getProperty("salt"), req.newKey));
  putAccount_(acc);
  revokeTokens_(acc.u);                                  // 這個帳號的其他裝置全部登出
  return { token: issueToken_(acc.u) };
}

// ---- 帳號管理（只有管理員能呼叫）----
function validNewAcc_(req, all) {
  var u = normUser_(req.username);
  if (!u || u.length > 40) return "bad_username";
  if (all[u]) return "duplicate";
  if (!req.key) return "bad_request";
  if (req.empId && Object.keys(all).some(function (k) { return all[k].empId === req.empId; })) return "emp_taken";
  return "";
}
function newAcc_(req) {
  var a = { u: normUser_(req.username), name: String(req.name || req.username).trim(), empId: req.empId || "", admin: false, perms: normPerms_(req.perms, req.empId), must: true };
  setSecret_(a, req.key);
  return a;
}
function accountsList_() {
  var all = accounts_();
  return { accounts: Object.keys(all).map(function (k) { return publicAcc_(all[k]); }) };
}
function accountSave_(req) {
  return withLock_(function () {
    var all = accounts_(), u = normUser_(req.username), a = all[u];
    if (req.isNew) {
      var err = validNewAcc_(req, all);
      if (err) return { error: err };
      a = newAcc_(req);
    } else {
      if (!a) return { error: "not_found" };
      if (a.admin) return { error: "forbidden" };
      if (req.empId && Object.keys(all).some(function (k) { return k !== u && all[k].empId === req.empId; })) return { error: "emp_taken" };
      a.name = String(req.name || a.name).trim();
      a.empId = req.empId || "";
      a.perms = normPerms_(req.perms, a.empId);
    }
    putAccount_(a);
    return { rev: bump_() };                             // 版本號變動，對方的畫面幾秒內跟著更新權限
  });
}
function accountsBatch_(req) {
  return withLock_(function () {
    var all = accounts_(), made = [], skipped = [], batch = {};
    (req.list || []).forEach(function (item) {
      var err = validNewAcc_(item, all);
      if (err) { skipped.push({ username: item.username, error: err }); return; }
      var a = newAcc_(item);
      all[a.u] = a;
      batch[accKey_(a.u)] = JSON.stringify(a);
      made.push(a.u);
    });
    if (made.length) { props_().setProperties(batch); CacheService.getScriptCache().remove("accounts"); }
    return { made: made, skipped: skipped, rev: bump_() };
  });
}
function accountReset_(req) {
  return withLock_(function () {
    var a = accounts_()[normUser_(req.username)];
    if (!a) return { error: "not_found" };
    if (a.admin) return { error: "forbidden" };
    if (!req.key) return { error: "bad_request" };
    setSecret_(a, req.key);
    a.must = true;
    putAccount_(a);
    revokeTokens_(a.u);
    return { ok: true };
  });
}
function accountDelete_(req) {
  return withLock_(function () {
    var a = accounts_()[normUser_(req.username)];
    if (!a) return { error: "not_found" };
    if (a.admin) return { error: "forbidden" };
    props_().deleteProperty(accKey_(a.u));
    CacheService.getScriptCache().remove("accounts");
    revokeTokens_(a.u);
    return { rev: bump_() };
  });
}
function canRead_(acc) {
  var p = acc.admin ? allEdit_() : normPerms_(acc.perms, acc.empId);
  var on = function (m) { return p[m] !== "none"; }, heavy = p.schedule === "edit" || p.employees === "edit";   // 排班、員工編輯會連動出勤與假別
  var calc = on("report") || on("punch") || on("records") || on("leave") || heavy;
  return { records: calc, leaveLedger: calc, shiftSchedule: calc || on("schedule"), nameGlyphs: heavy && !acc.empId };
}
function canApply_(acc, ops) {
  if (acc.admin) return true;
  if (acc.empId) return false;
  var p = normPerms_(acc.perms, "");
  return Object.keys(ops || {}).every(function (c) {
    var o = ops[c];
    if (!o || (!(o.upsert || []).length && !(o.del || []).length)) return true;
    return (WRITE_BY[c] || []).some(function (m) { return p[m] === "edit"; });
  });
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
function sheet_(c) {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(SHEETS[c].name);
  if (sh) return sh;
  ensureSheets_();
  return ss.getSheetByName(SHEETS[c].name);
}
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
function revision_() {
  var cache = CacheService.getScriptCache(), v = cache.get("rev");
  if (v !== null) return Number(v);
  v = Number(props_().getProperty("rev") || 0);
  cache.put("rev", String(v), 21600);
  return v;
}
function bump_() {
  var r = Number(props_().getProperty("rev") || 0) + 1;
  props_().setProperty("rev", String(r));
  CacheService.getScriptCache().put("rev", String(r), 21600);
  return r;
}

function rev_() { return { rev: revision_() }; }

function load_(req, acc) {
  var out = { rev: revision_(), me: publicAcc_(acc) }, can = canRead_(acc);
  ["employees", "records", "leaveLedger", "shiftSchedule"].forEach(function (c) {
    if (c !== "employees" && !can[c]) { out[c] = []; return; }
    var rows = readAll_(c);
    if (acc.empId) rows = rows.filter(function (x) { return (c === "employees" ? x.id : x.empId) === acc.empId; });   // 員工只拿得到自己的資料
    out[c] = rows;
  });
  var glyphs = {};
  if (can.nameGlyphs) readAll_("nameGlyphs").forEach(function (g) { glyphs[g.empId] = g.images; });
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

function apply_(req, acc) {
  if (!canApply_(acc, req.ops)) return { error: "forbidden" };
  return withLock_(function () {
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
