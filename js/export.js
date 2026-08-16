/* 导出：Excel（双工作表）与 JSON 备份 */

const Exporter = (function () {

  function fmtDate(iso) {
    return String(iso).slice(0, 10);
  }

  function typeLabel(r) {
    return r.type === 'exercise' ? '运动' : '饮食';
  }

  function detailText(r) {
    const d = r.detail || {};
    const parts = [];
    if (d.portion) parts.push(d.portion);
    if (d.intensity) parts.push(d.intensity);
    if (d.note) parts.push(d.note);
    return parts.join('，');
  }

  /* 导出某月 Excel：工作表1 每日明细，工作表2 每日汇总 */
  async function exportExcel(monthStr) {
    const records = await Store.listMonth(monthStr);
    if (!records.length) throw new Error('该月暂无记录');

    const byDate = {};
    records.forEach(r => {
      const d = fmtDate(r.record_date);
      (byDate[d] = byDate[d] || []).push(r);
    });
    const dates = Object.keys(byDate).sort();

    /* 明细行 */
    const detailRows = [[
      { v: '日期', s: 1 }, { v: '类型', s: 1 }, { v: '餐次', s: 1 },
      { v: '名称', s: 1 }, { v: '卡路里(kcal)', s: 1 },
      { v: '蛋白质(g)', s: 1 }, { v: '碳水(g)', s: 1 }, { v: '脂肪(g)', s: 1 }, { v: '备注', s: 1 },
    ]];
    records.forEach(r => {
      const d = r.detail || {};
      detailRows.push([
        { v: fmtDate(r.record_date) },
        { v: typeLabel(r) },
        { v: r.meal || '' },
        { v: r.name },
        { v: r.kcal, t: 'n' },
        { v: Number(d.protein) || 0, t: 'n' },
        { v: Number(d.carbs) || 0, t: 'n' },
        { v: Number(d.fat) || 0, t: 'n' },
        { v: detailText(r) },
      ]);
    });

    /* 汇总行 */
    const sumRows = [[
      { v: '日期', s: 1 }, { v: '摄入(kcal)', s: 1 }, { v: '消耗(kcal)', s: 1 }, { v: '净余额(kcal)', s: 1 },
    ]];
    dates.forEach(d => {
      const day = byDate[d];
      const intake = day.filter(r => r.type === 'meal').reduce((s, r) => s + Number(r.kcal), 0);
      const burn = day.filter(r => r.type === 'exercise').reduce((s, r) => s + Number(r.kcal), 0);
      sumRows.push([
        { v: d },
        { v: intake, t: 'n' },
        { v: burn, t: 'n' },
        { v: intake - burn, t: 'n' },
      ]);
    });

    const bytes = XLSX_JS.buildWorkbook([
      { name: '每日明细', cols: [12, 7, 8, 22, 13, 10, 10, 10, 26], rows: detailRows },
      { name: '每日汇总', cols: [12, 12, 12, 14], rows: sumRows },
    ]);

    XLSX_JS.download('热量账本_' + monthStr + '.xlsx', bytes);
    return records.length;
  }

  /* 导出 JSON 备份 */
  async function exportJson() {
    const records = await Store.listMonth('0000-01');
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '热量账本备份_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return records.length;
  }

  return { exportExcel, exportJson };
})();
