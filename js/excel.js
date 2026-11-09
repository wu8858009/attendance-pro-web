/* Excel 匯出：版面對應桌面版 export_excel（儀表板＋出勤明細＋員工統計摘要＋每日工時分佈）。
   ExcelJS 不支援圖表，產生後再用 JSZip 把兩張長條圖的 XML 放進儀表板。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.Excel = factory(root.Core);
})(typeof self !== "undefined" ? self : this, function (C) {
  "use strict";
  const LIBS = ["https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js", "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"];
  const FONT = "微軟正黑體", NAVY = "0D2438", TEAL = "14B8A6", GOLD = "D4AF37", RED = "F87171", ORANGE = "FB923C", GREEN = "4ADE80", TEXT = "1F2937", SUB = "6B7280", CARD = "F7FAFC", LINE = "E2E8F0";
  const argb = (h) => ({ argb: "FF" + h });
  const fill = (h) => ({ type: "pattern", pattern: "solid", fgColor: argb(h) });
  const font = (size, color, extra) => Object.assign({ name: FONT, size, color: argb(color) }, extra || {});
  const side = (style, color) => ({ style, color: argb(color) });
  const CENTER = { horizontal: "center", vertical: "middle" }, LEFT1 = { horizontal: "left", vertical: "middle", indent: 1 };
  const colL = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };

  function loadLibs() {
    return Promise.all(LIBS.map((url) => new Promise((ok, no) => {
      if ((url.includes("exceljs") && window.ExcelJS) || (url.includes("jszip") && window.JSZip)) { ok(); return; }
      const s = document.createElement("script");
      s.src = url; s.onload = ok; s.onerror = () => no(new Error("無法載入 Excel 元件，請檢查網路連線"));
      document.head.append(s);
    })));
  }
  function styled(cell, st) { cell.style = Object.assign({}, cell.style, st); }   // 合併格共用 style 物件，每格要換新物件
  function range(ws, r0, c0, r1, c1, st) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) styled(ws.getCell(r, c), st);
  }
  function mergeBar(ws, r0, r1, st, value, height) {     // A～L 整列橫幅
    ws.mergeCells(r0, 1, r1, 12);
    range(ws, r0, 1, r1, 12, st);
    if (value !== undefined) ws.getCell(r0, 1).value = value;
    if (height) ws.getRow(r0).height = height;
  }
  function kpiCard(ws, row0, col0, span, icon, text, label, accent) {
    const c1 = col0 + span - 1, line = side("thin", LINE);
    const part = (r, st, value, height) => {
      ws.mergeCells(r, col0, r, c1);
      range(ws, r, col0, r, c1, st);
      if (value !== undefined) ws.getCell(r, col0).value = value;
      ws.getRow(r).height = height;
    };
    part(row0, { fill: fill(accent) }, undefined, 5);
    part(row0 + 1, { fill: fill(CARD), font: font(18, accent, { bold: true }), alignment: CENTER }, `${icon}  ${text}`, 30);
    part(row0 + 2, { fill: fill(CARD), font: font(10, SUB), alignment: CENTER }, label, 18);
    for (let r = row0; r <= row0 + 2; r++) for (let c = col0; c <= c1; c++) {
      const cell = ws.getCell(r, c), b = {};
      if (c === col0) b.left = line;
      if (c === c1) b.right = line;
      if (r === row0) b.top = line;
      if (r === row0 + 2) b.bottom = line;
      styled(cell, { border: b });
    }
    return row0 + 2;
  }

  async function build(L, month, libs) {
    const ExcelJS = (libs && libs.ExcelJS) || (await loadLibs(), window.ExcelJS), JSZip = (libs && libs.JSZip) || window.JSZip;
    const S = L.computeMonthStats(month), set = L.db.settings, cap = set.otMonthlyCap, capExt = set.otMonthlyCapExtended, issues = L.computeComplianceIssues(month);
    const recs = L.db.records.filter((r) => C.monthKey(r.date) === month).sort((a, b) => C.cmp(a.date, b.date));
    const perEmp = Array.from(S.perEmp.values()).sort((a, b) => b.otHours - a.otHours);
    const headFont = font(10, "FFFFFF", { bold: true }), norm = font(10, TEXT), headFill = fill(NAVY), otFill = fill("FFF2E0"), leaveFill = fill("FDE7E7"), stripe = fill("F5F8FA");
    const thin = side("thin", "D8DEE4"), border = { left: thin, right: thin, top: thin, bottom: thin };
    const wb = new ExcelJS.Workbook();
    wb.title = `出勤月報表 ${month}`;
    wb.creator = "員工出勤管理系統 PRO";
    const page = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true };
    const sheet = (name, tab, views) => wb.addWorksheet(name, { properties: tab ? { tabColor: argb(tab) } : {}, views: [Object.assign({ showGridLines: false }, views)], pageSetup: page });
    const ws0 = sheet("儀表板", TEAL), ws1 = sheet("出勤明細", NAVY, { state: "frozen", ySplit: 2 }), ws2 = sheet("員工統計摘要", GOLD, { state: "frozen", ySplit: 1 }), ws3 = sheet("每日工時分佈", null, { state: "frozen", ySplit: 1 });
    const widths = (ws, list) => list.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const header = (ws, row, names) => names.forEach((t, i) => { const c = ws.getCell(row, i + 1); c.value = t; c.style = { font: headFont, fill: headFill, alignment: CENTER, border }; });
    const dataBar = (ref) => ({ ref, rules: [{ type: "dataBar", priority: 1, cfvo: [{ type: "num", value: 0 }, { type: "max" }], color: argb(TEAL), showValue: true }] });

    // 每日工時分佈
    header(ws3, 1, ["日期", "星期", "總工時(hr)", "出勤人數"]);
    const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
    let dailyLast = 1;
    for (let day = 1; day <= C.monthDays(y, m); day++) {
      const d = C.mkDate(y, m, day), ds = C.iso(d);
      dailyLast = day + 1;
      [`${m}/${day}`, C.WEEKDAY_LABELS[C.weekday(d)], C.fmtHours(S.dailyHours[ds] || 0), S.dailyHeads[ds] || 0].forEach((v, i) => {
        const c = ws3.getCell(dailyLast, i + 1);
        c.value = v;
        c.style = Object.assign({ font: norm, border, alignment: CENTER }, C.weekday(d) >= 5 ? { fill: stripe } : {}, i === 2 ? { numFmt: "0.0" } : {});
      });
    }
    ws3.addConditionalFormatting(dataBar(`C2:C${dailyLast}`));
    widths(ws3, [10, 8, 14, 10]);

    // 出勤明細
    const detailHeads = ["日期", "員工", "類型", "日別", "時段(含地點)", "休息(分)", "應班時數", "實際工時", "狀態", "加班時數", "備註"];
    ws1.mergeCells(1, 1, 1, detailHeads.length);
    range(ws1, 1, 1, 1, detailHeads.length, { fill: fill(TEAL), font: font(14, "FFFFFF", { bold: true }), alignment: CENTER });
    ws1.getCell(1, 1).value = `📋 出勤報表　${month}`;
    ws1.getRow(1).height = 28;
    header(ws1, 2, detailHeads);
    ws1.getRow(2).height = 20;
    const statusColors = { ot: "C2410C", leave: "B91C1C", normal: "15803D" }, fmts = { 5: "0", 6: "0.0", 7: "0.0", 9: "0.0" };
    let row = 3;
    recs.forEach((rec, idx) => {
      const emp = L.findEmp(rec.empId);
      if (!emp) return;
      const r = L.calcRecord(rec);
      const f = r.flag === "ot" ? otFill : r.flag === "leave" ? leaveFill : idx % 2 === 1 ? stripe : null;
      [rec.date, emp.name, C.EMP_TYPE_LABEL[emp.type], C.DAYTYPE_LABEL[rec.dayType], C.formatSegmentsText(rec), rec.breakMin, rec.scheduledHours, C.fmtHours(r.actualHours), C.STATUS_MAP[r.flag], C.fmtHours(r.otHours || 0), rec.note || null].forEach((v, i) => {
        const c = ws1.getCell(row, i + 1);
        c.value = v;
        c.style = Object.assign({ font: i === 8 ? font(10, statusColors[r.flag], { bold: true }) : norm, border, alignment: CENTER }, f ? { fill: f } : {}, fmts[i] ? { numFmt: fmts[i] } : {});
      });
      row++;
    });
    const detailLast = row - 1;
    widths(ws1, [12, 10, 10, 10, 26, 8, 8, 8, 10, 8, 22]);
    if (detailLast >= 3) {
      ws1.autoFilter = `A2:${colL(detailHeads.length)}${detailLast}`;
      ws1.addConditionalFormatting({ ref: `J3:J${detailLast}`, rules: [{ type: "colorScale", priority: 1, cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }], color: [argb("FFFFFF"), argb("FDE0B0"), argb("FB923C")] }] });
    }

    // 員工統計摘要
    header(ws2, 1, ["員工", "類型", "出勤天數", "加班時數", "缺勤時數"]);
    ws2.getRow(1).height = 20;
    perEmp.forEach((pe, idx) => {
      [pe.name, C.EMP_TYPE_LABEL[pe.type], pe.days, C.fmtHours(pe.otHours), C.fmtHours(pe.leaveShort)].forEach((v, i) => {
        const c = ws2.getCell(idx + 2, i + 1);
        c.value = v;
        c.style = Object.assign({ font: norm, border, alignment: CENTER }, idx % 2 === 1 ? { fill: stripe } : {}, i === 3 ? { numFmt: "0.0" } : i === 4 ? { numFmt: '0.0;-0.0;"-"' } : {});
      });
    });
    const sumLast = perEmp.length + 1;
    if (sumLast >= 2) {
      const ref = `D2:D${sumLast}`, bgStyle = (bg, color) => ({ fill: { type: "pattern", pattern: "solid", bgColor: argb(bg) }, font: { color: argb(color), bold: true } });
      ws2.addConditionalFormatting(dataBar(ref));
      ws2.addConditionalFormatting({ ref, rules: [
        { type: "cellIs", priority: 2, operator: "between", formulae: [cap, capExt], style: bgStyle("FFF2E0", "C2410C") },
        { type: "cellIs", priority: 3, operator: "greaterThan", formulae: [capExt], style: bgStyle("FDE7E7", "B91C1C") },
      ] });
      const total = sumLast + 1, totalSt = { fill: fill(CARD), font: font(10, NAVY, { bold: true }), border, alignment: CENTER };
      ws2.mergeCells(total, 1, total, 2);
      range(ws2, total, 1, total, 2, totalSt);
      ws2.getCell(total, 1).value = "合計";
      [["C", (p) => p.days], ["D", (p) => C.fmtHours(p.otHours)], ["E", (p) => C.fmtHours(p.leaveShort)]].forEach(([letter, get], i) => {
        const c = ws2.getCell(total, 3 + i);
        c.value = { formula: `SUM(${letter}2:${letter}${sumLast})`, result: perEmp.reduce((t, p) => t + get(p), 0) };
        c.style = Object.assign({ numFmt: "0.0" }, totalSt);
      });
      ws2.autoFilter = `A1:E${sumLast}`;
    }
    widths(ws2, [14, 10, 10, 10, 10]);

    // 儀表板
    widths(ws0, new Array(12).fill(9.6));
    mergeBar(ws0, 1, 2, { fill: fill(NAVY), font: font(20, "FFFFFF", { bold: true }), alignment: CENTER }, `📊 員工出勤月報表　${month}`, 30);
    ws0.getRow(2).height = 24;
    let r = 3;
    const n = new Date(), stamp = `${C.todayIso()} ${C.pad2(n.getHours())}:${C.pad2(n.getMinutes())}`;
    mergeBar(ws0, r, r, { fill: fill(CARD), font: font(10, SUB), alignment: LEFT1 }, `產出時間：${stamp}　｜　僅供內部行政試算輔助使用，非正式法律意見，實際仍以公司規章與最新法令為準。`, 18);
    r += 2;
    const section = (at, text) => {
      ws0.mergeCells(at, 1, at, 12);
      range(ws0, at, 1, at, 12, { font: font(13, NAVY, { bold: true }), border: { bottom: side("medium", TEAL) }, alignment: { horizontal: "left", vertical: "middle" } });
      ws0.getCell(at, 1).value = text;
      ws0.getRow(at).height = 22;
    };
    section(r, "🎯 本月關鍵指標 KPI");
    r += 2;
    const nOver = S.overtimeViolations.length, nCap = S.otCapViolations.length, rest = S.weeklyRestRate;
    const kpis = [
      [[nOver ? "🔴" : "✅", `${nOver} 次`, "超時違規次數（單日逾12hr）", nOver ? RED : GREEN], [nCap ? "🔴" : "✅", `${nCap} 次`, `違規加班次數（逾${C.g(cap)}/${C.g(capExt)}hr）`, nCap ? RED : GREEN],
        ["🗓", rest === null ? "-" : `${C.pct0(rest)}%`, "週休使用率（一例一休）", rest === null || rest >= 100 ? GREEN : rest >= 90 ? GOLD : RED], ["👥", `${S.headcount} 人`, "本月出勤人數", TEAL]],
      [["🟠", `${S.otCount} 筆`, "需加班單筆數", ORANGE], ["🔴", `${S.leaveCount} 筆`, "需請假單筆數", RED], ["⏱", `${C.hr(S.totalOtHours)} 小時`, "當月加班總時數", TEAL], ["🟢", `${S.normalCount} 筆`, "正常出勤筆數", GREEN]],
      [["📈", `${C.pct0(S.attendanceRate)}%`, "出勤正常率", GREEN], ["⏲", `${C.hr(S.avgHours)} 小時`, "平均每筆工時", TEAL], ["🌴", `${C.pct0(S.annualRate)}%`, "特休使用率(本期)", GOLD], ["🔄", `${C.pct0(S.compRate)}%`, "補休使用率", TEAL]],
    ];
    for (const line of kpis) {
      let last = r;
      line.forEach(([icon, text, label, accent], idx) => { last = kpiCard(ws0, r, idx * 3 + 1, 3, icon, text, label, accent); });
      r = last + 2;
    }
    r += 1;
    section(r, "🛡️ 勞基法遵循檢查摘要");
    r += 2;
    if (!issues.length) {
      mergeBar(ws0, r, r, { fill: fill("E9F9F1"), font: font(11, "15803D", { bold: true }), alignment: LEFT1 }, "✅ 本月未偵測到明顯違規項目，勞基法遵循狀況良好。", 20);
      r += 1;
    } else {
      const high = issues.filter((i) => i[1] === "high").length, mid = issues.length - high;
      mergeBar(ws0, r, r, { fill: fill(high ? "FDEEEE" : "FFF6E5"), font: font(11, NAVY, { bold: true }), alignment: LEFT1 }, `🔴 高風險 ${high} 項　🟠 中風險 ${mid} 項（完整清單請見「出勤管理系統」勞基法遵循檢查頁）`, 20);
      r += 1;
      for (const [name, level, text] of issues.slice(0, 6)) {
        mergeBar(ws0, r, r, { font: font(10, level === "high" ? "B91C1C" : "C2410C"), alignment: LEFT1 }, `${level === "high" ? "🔴" : "🟠"} 【${name}】${text}`, 16);
        r += 1;
      }
      if (issues.length > 6) {
        mergeBar(ws0, r, r, { font: font(9, SUB, { italic: true }), alignment: LEFT1 }, `…其餘 ${issues.length - 6} 項請至系統內查看完整清單。`, 16);
        r += 1;
      }
    }
    r += 2;
    section(r, "🏆 員工加班時數排行（前8名）");
    r += 2;
    const charts = [];
    const topN = Math.min(8, perEmp.filter((p) => p.otHours > 0).length);
    const emptyLine = (text) => { mergeBar(ws0, r, r, { font: font(10, SUB), alignment: LEFT1 }, text); r += 2; };
    if (topN > 0) {
      charts.push({ dir: "bar", row: r, title: null, serName: "員工統計摘要!$D$1", head: "加班時數", cat: `員工統計摘要!$A$2:$A$${1 + topN}`, val: `員工統計摘要!$D$2:$D$${1 + topN}`, cats: perEmp.slice(0, topN).map((p) => p.name), vals: perEmp.slice(0, topN).map((p) => C.fmtHours(p.otHours)), labels: true });
      r += 17;
    } else emptyLine("本月無加班資料可供繪製圖表。");
    r += 1;
    section(r, "📆 每日工時分佈（全公司）");
    r += 2;
    if (Object.values(S.dailyHours).some((h) => h > 0)) {
      const cats = [], vals = [];
      for (let day = 1; day <= C.monthDays(y, m); day++) { cats.push(`${m}/${day}`); vals.push(C.fmtHours(S.dailyHours[C.iso(C.mkDate(y, m, day))] || 0)); }
      charts.push({ dir: "col", row: r, title: "工時(hr)", serName: "每日工時分佈!$C$1", head: "總工時(hr)", cat: `每日工時分佈!$A$2:$A$${dailyLast}`, val: `每日工時分佈!$C$2:$C$${dailyLast}`, cats, vals });
      r += 17;
    } else emptyLine("本月無出勤工時可供繪製圖表。");
    ws0.mergeCells(r, 1, r, 12);
    range(ws0, r, 1, r, 12, { font: font(8, SUB, { italic: true }), alignment: { horizontal: "left", vertical: "middle" } });
    ws0.getCell(r, 1).value = "本報表由「員工出勤管理系統 PRO」自動產生。";

    const buffer = await wb.xlsx.writeBuffer();
    return addCharts(buffer, charts, JSZip);
  }

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function chartXml(ch) {
    const strCache = (arr) => `<c:strCache><c:ptCount val="${arr.length}"/>${arr.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join("")}</c:strCache>`;
    const numCache = `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${ch.vals.length}"/>${ch.vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("")}</c:numCache>`;
    const labels = ch.labels ? `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>` : "";
    const axTitle = ch.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${esc(ch.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:style val="10"/><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/><c:barChart><c:barDir val="${ch.dir}"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>'${ch.serName.replace("!", "'!")}</c:f>${strCache([ch.head])}</c:strRef></c:tx><c:spPr><a:solidFill><a:srgbClr val="${TEAL}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>${labels}<c:cat><c:strRef><c:f>'${ch.cat.replace("!", "'!")}</c:f>${strCache(ch.cats)}</c:strRef></c:cat><c:val><c:numRef><c:f>'${ch.val.replace("!", "'!")}</c:f>${numCache}</c:numRef></c:val></c:ser><c:gapWidth val="150"/><c:axId val="10"/><c:axId val="100"/></c:barChart><c:catAx><c:axId val="10"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${ch.dir === "col" ? "b" : "l"}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="100"/><c:crosses val="autoZero"/></c:catAx><c:valAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${ch.dir === "col" ? "l" : "b"}"/><c:majorGridlines/>${axTitle}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="10"/><c:crosses val="autoZero"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  }
  async function addCharts(buffer, charts, JSZip) {
    const zip = await JSZip.loadAsync(buffer);
    const type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (!charts.length) return toBlob(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), type);
    const anchor = (ch, i) => `<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${ch.row - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="7920000" cy="2880000"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`;
    zip.file("xl/drawings/drawing1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${charts.map(anchor).join("")}</xdr:wsDr>`);
    zip.file("xl/drawings/_rels/drawing1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${charts.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i + 1}.xml"/>`).join("")}</Relationships>`);
    charts.forEach((ch, i) => zip.file(`xl/charts/chart${i + 1}.xml`, chartXml(ch)));

    const relPath = "xl/worksheets/_rels/sheet1.xml.rels", relFile = zip.file(relPath);
    const relXml = relFile ? await relFile.async("string") : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    zip.file(relPath, relXml.replace("</Relationships>", `<Relationship Id="rIdChartDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`));
    let sheet = await zip.file("xl/worksheets/sheet1.xml").async("string");
    if (!/xmlns:r=/.test(sheet.slice(0, 600))) sheet = sheet.replace("<worksheet ", `<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" `);
    const tag = `<drawing r:id="rIdChartDrawing"/>`;     // 依 OOXML 元素順序放在 pageSetup 之後
    const m = /<pageSetup[^>]*\/>/.exec(sheet);
    sheet = m ? sheet.replace(m[0], m[0] + tag) : sheet.replace("</worksheet>", tag + "</worksheet>");
    zip.file("xl/worksheets/sheet1.xml", sheet);
    let ct = await zip.file("[Content_Types].xml").async("string");
    ct = ct.replace("</Types>", `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>${charts.map((_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("")}</Types>`);
    zip.file("[Content_Types].xml", ct);
    return toBlob(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), type);
  }
  const toBlob = (bytes, type) => (typeof Blob !== "undefined" ? new Blob([bytes], { type }) : bytes);
  return { build };
});
