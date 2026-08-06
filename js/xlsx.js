/* 迷你 xlsx 生成器：纯前端生成标准 .xlsx（zip stored + SpreadsheetML）。
   零外部依赖，不依赖 CDN 与 SheetJS。 */

const XLSX_JS = (function () {

  function xmlEscape(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function utf8(str) {
    return new TextEncoder().encode(str);
  }

  /* ---------- CRC32 ---------- */
  const crcTable = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------- 工作表 XML ---------- */
  function colName(i) {
    let n = i + 1, s = '';
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function buildSheetXml(sheet) {
    const rows = sheet.rows || [];
    const cols = sheet.cols || [];
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    if (cols.length) {
      xml += '<cols>';
      cols.forEach((w, i) => {
        xml += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (w || 10) + '" customWidth="1"/>';
      });
      xml += '</cols>';
    }
    xml += '<sheetData>';
    rows.forEach((row, ri) => {
      xml += '<row r="' + (ri + 1) + '">';
      row.forEach((cell, ci) => {
        const ref = colName(ci) + (ri + 1);
        if (cell == null) return;
        const style = cell.s ? ' s="' + cell.s + '"' : '';
        if (cell.t === 'n') {
          xml += '<c r="' + ref + '"' + style + '><v>' + Number(cell.v) + '</v></c>';
        } else {
          xml += '<c r="' + ref + '" t="inlineStr"' + style + '><is><t>' + xmlEscape(cell.v) + '</t></is></c>';
        }
      });
      xml += '</row>';
    });
    xml += '</sheetData></worksheet>';
    return utf8(xml);
  }

  /* ---------- 包内固定文件 ---------- */
  function contentTypesXml(sheetNames) {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    xml += '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">';
    xml += '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>';
    xml += '<Default Extension="xml" ContentType="application/xml"/>';
    xml += '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
    xml += '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    sheetNames.forEach((n, i) => {
      xml += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    });
    xml += '</Types>';
    return utf8(xml);
  }

  function relsXml() {
    return utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>');
  }

  function workbookXml(sheetNames) {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    xml += '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    xml += '<sheets>';
    sheetNames.forEach((n, i) => {
      xml += '<sheet name="' + xmlEscape(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
    });
    xml += '</sheets></workbook>';
    return utf8(xml);
  }

  function workbookRelsXml(sheetCount) {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    xml += '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    for (let i = 0; i < sheetCount; i++) {
      xml += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    }
    xml += '<Relationship Id="rId' + (sheetCount + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    xml += '</Relationships>';
    return utf8(xml);
  }

  function stylesXml() {
    return utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>');
  }

  /* ---------- zip（stored，无压缩） ---------- */
  function buildZip(entries) {
    const chunks = [];
    let offset = 0;
    const central = [];

    entries.forEach(e => {
      const nameBytes = utf8(e.name);
      const data = e.data;

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);        /* version needed */
      local.setUint16(6, 0x0800, true);    /* UTF-8 flag */
      local.setUint16(8, 0, true);         /* method: stored */
      local.setUint16(10, 0, true);        /* mod time */
      local.setUint16(12, 0, true);        /* mod date */
      local.setUint32(14, e.crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);        /* extra len */

      chunks.push(new Uint8Array(local.buffer), nameBytes, data);
      central.push({ nameBytes, data, crc: e.crc, offset });
      offset += 30 + nameBytes.length + data.length;
    });

    const cdStart = offset;
    const cdChunks = [];

    central.forEach(e => {
      const rec = new DataView(new ArrayBuffer(46));
      rec.setUint32(0, 0x02014b50, true);
      rec.setUint16(4, 20, true);          /* version made by */
      rec.setUint16(6, 20, true);          /* version needed */
      rec.setUint16(8, 0x0800, true);      /* UTF-8 flag */
      rec.setUint16(10, 0, true);          /* method */
      rec.setUint16(12, 0, true);
      rec.setUint16(14, 0, true);
      rec.setUint32(16, e.crc, true);
      rec.setUint32(20, e.data.length, true);
      rec.setUint32(24, e.data.length, true);
      rec.setUint16(28, e.nameBytes.length, true);
      rec.setUint16(30, 0, true);          /* extra */
      rec.setUint16(32, 0, true);          /* comment */
      rec.setUint16(34, 0, true);          /* disk */
      rec.setUint16(36, 0, true);          /* internal attrs */
      rec.setUint32(38, 0, true);          /* external attrs */
      rec.setUint32(42, e.offset, true);
      cdChunks.push(new Uint8Array(rec.buffer), e.nameBytes);
    });

    const cdSize = cdChunks.reduce((s, c) => s + c.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(4, 0, true);
    eocd.setUint16(6, 0, true);
    eocd.setUint16(8, central.length, true);
    eocd.setUint16(10, central.length, true);
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, cdStart, true);
    eocd.setUint16(20, 0, true);

    const total = chunks.reduce((s, c) => s + c.length, 0)
      + cdChunks.reduce((s, c) => s + c.length, 0) + 22;
    const out = new Uint8Array(total);
    let pos = 0;
    chunks.forEach(c => { out.set(c, pos); pos += c.length; });
    cdChunks.forEach(c => { out.set(c, pos); pos += c.length; });
    out.set(new Uint8Array(eocd.buffer), pos);

    return out;
  }

  /* ---------- 组装工作簿 ---------- */
  function buildWorkbook(sheets) {
    const sheetNames = sheets.map(s => s.name);
    const entries = [];

    sheets.forEach((s, i) => {
      const xml = buildSheetXml(s);
      entries.push({
        name: 'xl/worksheets/sheet' + (i + 1) + '.xml',
        data: xml,
        crc: crc32(xml),
      });
    });

    const parts = [
      { name: '[Content_Types].xml', data: contentTypesXml(sheetNames) },
      { name: '_rels/.rels', data: relsXml() },
      { name: 'xl/workbook.xml', data: workbookXml(sheetNames) },
      { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml(sheets.length) },
      { name: 'xl/styles.xml', data: stylesXml() },
    ];
    parts.forEach(p => entries.unshift({ name: p.name, data: p.data, crc: crc32(p.data) }));

    return buildZip(entries);
  }

  /* ---------- 触发下载 ---------- */
  function download(filename, bytes) {
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return { buildWorkbook, download };
})();
