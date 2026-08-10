/* 热量账本 · 主逻辑 */

(function () {

  const $ = id => document.getElementById(id);

  /* ---------- 工具 ---------- */
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function monthStrOf(dateStr) {
    return String(dateStr).slice(0, 7);
  }

  function fmtDateCn(dateStr) {
    const p = String(dateStr).split('-');
    return p[1] + '月' + p[2] + '日';
  }

  function weekdayCn(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  }

  function getWeight() {
    const w = parseFloat(localStorage.getItem('calorie.weight') || '70');
    return isNaN(w) || w < 30 ? 70 : w;
  }

  /* 根据当前时间自动选择餐次 */
  function getMealByTime() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour <= 10) return '早餐';
    if (hour >= 11 && hour <= 14) return '午餐';
    if (hour >= 15 && hour <= 20) return '晚餐';
    return '宵夜'; // 21-5点
  }

  /* 计算基础代谢率 BMR（Mifflin-St Jeor 公式） */
  function calcBMR() {
    const gender = localStorage.getItem('calorie.gender') || 'male';
    const age = parseInt(localStorage.getItem('calorie.age') || '25');
    const height = parseFloat(localStorage.getItem('calorie.height') || '170');
    const weight = getWeight();
    if (isNaN(age) || isNaN(height) || age < 10 || height < 100) return 0;
    let bmr = 10 * weight + 6.25 * height - 5 * age;
    bmr += (gender === 'male') ? 5 : -161;
    return Math.round(bmr);
  }

  /* 计算每日总能量消耗 TDEE（BMR × 活动系数） */
  function calcTDEE() {
    const bmr = calcBMR();
    if (bmr === 0) return 0;
    const activity = parseFloat(localStorage.getItem('calorie.activity') || '1.2'); // 默认久坐
    return Math.round(bmr * activity);
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  function showOverlay(id) { $(id).classList.remove('hidden'); }
  function hideOverlay(id) { $(id).classList.add('hidden'); }

  /* ---------- 图片压缩 ---------- */
  function compressImage(file, maxSide) {
    maxSide = maxSide || 1280;
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let w = img.width, h = img.height;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
      img.src = url;
    });
  }

  /* ---------- 状态 ---------- */
  const state = {
    today: todayStr(),
    historyMonth: monthStrOf(todayStr()),
    todayRecords: [],
    historyRecords: [],
    statsRecords: [],
    aiPending: [],   /* 待确认入账的识别结果 */
    aiMeal: '午餐',
  };

  /* ---------- 视图切换 ---------- */
  const views = ['today', 'history', 'stats', 'settings'];

  function switchView(name) {
    views.forEach(v => {
      $('view-' + v).classList.toggle('active', v === name);
      document.querySelector('.nav-btn[data-view="' + v + '"]').classList.toggle('active', v === name);
    });
    if (name === 'today') loadToday();
    if (name === 'history') loadHistory();
    if (name === 'stats') loadStats();
    if (name === 'settings') { renderAccount(); pullProfileFromCloud(); }
  }

  /* ---------- 渲染：今日 ---------- */
  async function loadToday() {
    $('today-date').textContent = fmtDateCn(state.today) + ' · 周' + weekdayCn(state.today);
    try {
      state.todayRecords = await Store.listRecords(state.today);
    } catch (e) {
      state.todayRecords = [];
      toast(e.message);
    }
    renderToday();
  }

  function renderToday() {
    const records = state.todayRecords;
    const intake = records.filter(r => r.type === 'meal').reduce((s, r) => s + Number(r.kcal), 0);
    const burn = records.filter(r => r.type === 'exercise').reduce((s, r) => s + Number(r.kcal), 0);
    const net = intake - burn;
    const tdee = calcTDEE();

    $('m-intake').textContent = intake;
    $('m-burn').textContent = burn;
    const netEl = $('m-net');
    netEl.textContent = (net > 0 ? '+' : '') + net;
    netEl.className = 'metric-value' + (net > 0 ? ' positive' : net < 0 ? ' negative' : '');
    $('m-tdee').textContent = tdee || '--';

    /* 饮食列表，按餐次分组 */
    const meals = records.filter(r => r.type === 'meal');
    const groups = {};
    meals.forEach(r => { const k = r.meal || '其他'; (groups[k] = groups[k] || []).push(r); });
    const mealOrder = ['早餐', '午餐', '晚餐', '宵夜', '零食', '其他'];
    const mealEl = $('meal-list');
    mealEl.innerHTML = '';
    if (!meals.length) {
      mealEl.innerHTML = '<p class="empty">今天还没有记录，点「拍照识别」试试</p>';
    } else {
      mealOrder.forEach(k => {
        if (!groups[k]) return;
        const g = groups[k];
        const sum = g.reduce((s, r) => s + Number(r.kcal), 0);
        const block = document.createElement('div');
        block.style.cssText = 'margin-bottom:8px';
        block.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">' +
          '<span class="meal-tag">' + k + '</span>' +
          '<span class="record-meta">' + sum + ' kcal</span></div>';
        g.forEach(r => block.appendChild(recordRow(r)));
        mealEl.appendChild(block);
      });
    }

    /* 运动列表 */
    const exEl = $('exercise-list');
    exEl.innerHTML = '';
    const exs = records.filter(r => r.type === 'exercise');
    if (!exs.length) {
      exEl.innerHTML = '<p class="empty">今天还没有运动</p>';
    } else {
      exs.forEach(r => exEl.appendChild(recordRow(r)));
    }
  }

  function recordRow(r) {
    const row = document.createElement('div');
    row.className = 'record';
    const meta = r.type === 'meal'
      ? (r.detail && r.detail.portion ? r.detail.portion : '')
      : (r.detail && r.detail.minutes ? r.detail.minutes + ' 分钟' : '');
    row.innerHTML =
      '<div class="record-main">' +
      '<div class="record-name">' + esc(r.name) + '</div>' +
      (meta ? '<div class="record-meta">' + esc(meta) + '</div>' : '') +
      '</div>' +
      '<div class="record-kcal' + (r.type === 'exercise' ? ' exercise' : '') + '">' + Number(r.kcal) + '</div>' +
      '<button class="record-edit" title="编辑" aria-label="编辑">✎</button>' +
      '<button class="record-del" title="删除" aria-label="删除">×</button>';
    row.querySelector('.record-edit').addEventListener('click', () => openEdit(r));
    row.querySelector('.record-del').addEventListener('click', async () => {
      if (!confirm('删除这条记录？')) return;
      try {
        await Store.deleteRecord(r.id);
        toast('已删除');
        loadToday();
        loadHistory();
      } catch (e) { toast(e.message); }
    });
    return row;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  /* ---------- 编辑记录 ---------- */
  let editingRecord = null;

  function openEdit(r) {
    editingRecord = r;
    $('edit-date').value = String(r.record_date).slice(0, 10);
    $('edit-meal').value = r.meal || '';
    $('edit-name').value = r.name;
    $('edit-kcal').value = r.kcal;
    $('edit-portion').value = (r.detail && r.detail.portion) || '';
    showOverlay('overlay-edit');
  }

  function bindEdit() {
    $('btn-edit-close').addEventListener('click', () => hideOverlay('overlay-edit'));
    $('btn-edit-save').addEventListener('click', async () => {
      if (!editingRecord) return;
      const updates = {
        record_date: $('edit-date').value,
        name: $('edit-name').value.trim(),
        kcal: Math.round(Number($('edit-kcal').value) || 0),
      };
      if (editingRecord.type === 'meal') {
        updates.meal = $('edit-meal').value || null;
      }
      const detail = editingRecord.detail || {};
      detail.portion = $('edit-portion').value.trim();
      updates.detail = detail;

      if (!updates.name || !(updates.kcal >= 0)) {
        toast('请填写名称和有效卡路里');
        return;
      }

      try {
        await Store.updateRecord(editingRecord.id, updates);
        toast('已更新');
        hideOverlay('overlay-edit');
        editingRecord = null;
        loadToday();
        loadHistory();
      } catch (e) {
        toast(e.message);
      }
    });
  }

  /* ---------- 拍照识别 ---------- */
  function bindPhoto() {
    $('btn-photo').addEventListener('click', () => {
      if (!Store.currentUser()) {
        toast('请先登录后再使用拍照识别');
        openAuth();
        return;
      }
      if (!AI.isConfigured()) {
        toast('请先在「设置」中配置大模型 API');
        switchView('settings');
        return;
      }
      $('photo-input').value = '';
      $('photo-input').click();
    });

    $('btn-ai-close').addEventListener('click', () => hideOverlay('overlay-ai'));

    $('photo-input').addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const body = $('ai-sheet-body');
      state.aiMeal = getMealByTime(); // 自动根据时间选择餐次
      $('ai-sheet-title').textContent = '识别中…';
      body.innerHTML = '<div class="ai-loading">正在分析食物，请稍候</div>';
      $('ai-sheet-total').textContent = '';
      hideOverlay('overlay-meal');
      showOverlay('overlay-ai');
      try {
        const dataUrl = await compressImage(file);
        const result = await AI.estimate(dataUrl);
        state.aiPending = result.items;
        $('ai-sheet-title').textContent = '识别结果 · 估算仅供参考';
        renderAiSheet();
      } catch (err) {
        $('ai-sheet-title').textContent = '识别失败';
        body.innerHTML = '<p class="empty">' + esc(err.message) + '</p><p class="form-hint">可以手动添加，或检查设置中的模型名称与 API Key。</p>';
      }
    });
  }

  function renderAiSheet() {
    const body = $('ai-sheet-body');
    body.innerHTML = '';
    if (!state.aiPending.length) {
      body.innerHTML = '<p class="empty">未能识别出食物，请手动添加。</p>';
      $('ai-sheet-total').textContent = '';
      return;
    }
    state.aiPending.forEach((it, idx) => {
      const item = document.createElement('div');
      item.className = 'ai-item';
      item.innerHTML =
        '<div class="ai-name"><div class="nm">' + esc(it.name) + '</div>' +
        '<div class="pt">' + esc(it.portion || '分量未知') + '</div></div>' +
        '<span class="ai-kcal-label">kcal</span>' +
        '<input type="number" min="0" step="1" value="' + it.kcal + '">' +
        '<button class="record-del" title="移除" aria-label="移除">×</button>';
      item.querySelector('input').addEventListener('input', ev => {
        state.aiPending[idx].kcal = Math.max(0, Math.round(Number(ev.target.value) || 0));
        updateAiTotal();
      });
      item.querySelector('.record-del').addEventListener('click', () => {
        state.aiPending.splice(idx, 1);
        renderAiSheet();
      });
      body.appendChild(item);
    });
    updateAiTotal();
  }

  function updateAiTotal() {
    const total = state.aiPending.reduce((s, it) => s + it.kcal, 0);
    $('ai-sheet-total').textContent = '合计约 ' + total + ' kcal';
  }

  function bindAiConfirm() {
    $('btn-ai-confirm').addEventListener('click', async () => {
      if (!state.aiPending.length) { hideOverlay('overlay-ai'); return; }
      const meal = state.aiMeal;
      const records = state.aiPending.map(it => ({
        record_date: state.today,
        type: 'meal',
        meal,
        name: it.name,
        kcal: it.kcal,
        detail: { portion: it.portion },
      }));
      try {
        await Store.addRecords(records);
        toast('已记入 ' + meal + '，共 ' + records.reduce((s, r) => s + r.kcal, 0) + ' kcal');
        state.aiPending = [];
        hideOverlay('overlay-ai');
        loadToday();
      } catch (e) { toast(e.message); }
    });
  }

  /* ---------- 手动添加饮食 ---------- */
  function bindManualMeal() {
    $('btn-manual-meal').addEventListener('click', () => {
      $('meal-name').value = '';
      $('meal-kcal').value = '';
      $('meal-note').value = '';
      $('meal-type').value = getMealByTime(); // 自动根据时间选择餐次
      showOverlay('overlay-meal');
    });
    $('btn-meal-close').addEventListener('click', () => hideOverlay('overlay-meal'));
    $('btn-meal-save').addEventListener('click', async () => {
      const name = $('meal-name').value.trim();
      const kcal = Math.round(Number($('meal-kcal').value));
      if (!name || !(kcal >= 0)) { toast('请填写食物名称和卡路里'); return; }
      try {
        await Store.addRecords([{
          record_date: state.today,
          type: 'meal',
          meal: $('meal-type').value,
          name,
          kcal,
          detail: { portion: $('meal-note').value.trim() },
        }]);
        toast('已记入 ' + name);
        hideOverlay('overlay-meal');
        loadToday();
      } catch (e) { toast(e.message); }
    });
  }

  /* ---------- 添加运动 ---------- */
  function fillExerciseSelect() {
    const sel = $('ex-type');
    sel.innerHTML = MET_TABLE.map(m => '<option value="' + esc(m.name) + '">' + esc(m.name) + '（MET ' + m.met + '）</option>').join('');
  }

  function updateExercisePreview() {
    const met = metByName($('ex-type').value);
    const minutes = Math.max(1, Math.round(Number($('ex-minutes').value) || 0));
    const kcal = calcBurn(met, getWeight(), minutes);
    $('ex-preview').textContent = '预计消耗 ' + kcal + ' kcal（' + $('ex-type').value + ' · ' + minutes + ' 分钟 · 体重 ' + getWeight() + 'kg）';
    return kcal;
  }

  function bindExercise() {
    $('btn-exercise').addEventListener('click', () => {
      $('ex-minutes').value = '30';
      updateExercisePreview();
      showOverlay('overlay-exercise');
    });
    $('btn-ex-close').addEventListener('click', () => hideOverlay('overlay-exercise'));
    $('ex-type').addEventListener('change', updateExercisePreview);
    $('ex-minutes').addEventListener('input', updateExercisePreview);
    $('btn-ex-save').addEventListener('click', async () => {
      const met = metByName($('ex-type').value);
      const minutes = Math.max(1, Math.round(Number($('ex-minutes').value) || 0));
      if (!met) { toast('请选择运动类型'); return; }
      const kcal = calcBurn(met, getWeight(), minutes);
      try {
        await Store.addRecords([{
          record_date: state.today,
          type: 'exercise',
          name: $('ex-type').value,
          kcal,
          detail: { minutes, met },
        }]);
        toast('已记录 ' + $('ex-type').value + '，消耗 ' + kcal + ' kcal');
        hideOverlay('overlay-exercise');
        loadToday();
      } catch (e) { toast(e.message); }
    });
  }

  /* ---------- 历史 ---------- */
  async function loadHistory() {
    try {
      state.historyRecords = await Store.listMonth(state.historyMonth);
    } catch (e) {
      state.historyRecords = [];
      toast(e.message);
    }
    renderHistory();
  }

  function renderHistory() {
    const el = $('history-list');
    el.innerHTML = '';
    const records = state.historyRecords;
    if (!records.length) {
      el.innerHTML = '<p class="empty">该月暂无记录</p>';
      return;
    }
    const byDate = {};
    records.forEach(r => { const d = String(r.record_date).slice(0, 10); (byDate[d] = byDate[d] || []).push(r); });
    const dates = Object.keys(byDate).sort().reverse();

    dates.forEach(d => {
      const day = byDate[d];
      const intake = day.filter(r => r.type === 'meal').reduce((s, r) => s + Number(r.kcal), 0);
      const burn = day.filter(r => r.type === 'exercise').reduce((s, r) => s + Number(r.kcal), 0);
      const net = intake - burn;

      const group = document.createElement('div');
      group.className = 'day-group';
      group.innerHTML =
        '<div class="day-group-head">' +
        '<span class="date">' + fmtDateCn(d) + ' 周' + weekdayCn(d) + '</span>' +
        '<span class="day-sum">摄入 ' + intake + ' · 消耗 <span class="burn">' + burn + '</span> · 净值 ' + (net > 0 ? '+' : '') + net + '</span>' +
        '</div>';
      day.forEach(r => group.appendChild(recordRow(r)));
      el.appendChild(group);
    });
  }

  /* ---------- 统计 ---------- */
  async function loadStats() {
    const dates = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    }
    const months = [...new Set(dates.map(d => monthStrOf(d)))];
    let all = [];
    try {
      for (const m of months) {
        const rs = await Store.listMonth(m);
        all = all.concat(rs);
      }
    } catch (e) {
      all = [];
      toast(e.message);
    }
    state.statsRecords = all;
    renderStats(dates);
  }

  function renderStats(dates) {
    const data = dates.map(d => {
      const day = state.statsRecords.filter(r => String(r.record_date).slice(0, 10) === d);
      return {
        date: d,
        intake: day.filter(r => r.type === 'meal').reduce((s, r) => s + Number(r.kcal), 0),
        burn: day.filter(r => r.type === 'exercise').reduce((s, r) => s + Number(r.kcal), 0),
      };
    });

    const max = Math.max(1, ...data.map(x => Math.max(x.intake, x.burn)));
    const W = 560, H = 210, padB = 24, padT = 8, barW = 9, gap = 2;
    const step = (W - 20) / data.length;
    const chartH = H - padB - padT;

    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" style="width:100%;height:auto">';
    svg += '<title>近两周摄入与消耗</title>';

    data.forEach((x, i) => {
      const cx = 14 + i * step + step / 2;
      const hI = Math.round(x.intake / max * chartH);
      const hB = Math.round(x.burn / max * chartH);
      svg += '<rect x="' + (cx - barW - gap / 2) + '" y="' + (H - padB - hI) + '" width="' + barW + '" height="' + hI + '" rx="1" fill="#537D96"/>';
      svg += '<rect x="' + (cx + gap / 2) + '" y="' + (H - padB - hB) + '" width="' + barW + '" height="' + hB + '" rx="1" fill="#7BAE7F"/>';
      if (i % 2 === 0 || i === data.length - 1) {
        svg += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#8E9196" font-family="sans-serif">' + String(x.date).slice(5).replace('-', '/') + '</text>';
      }
    });
    svg += '</svg>';
    $('chart-wrap').innerHTML = svg;

    const withRecords = data.filter(x => x.intake > 0 || x.burn > 0);
    const avgIntake = withRecords.length ? Math.round(withRecords.reduce((s, x) => s + x.intake, 0) / withRecords.length) : 0;
    const avgBurn = withRecords.length ? Math.round(withRecords.reduce((s, x) => s + x.burn, 0) / withRecords.length) : 0;
    const totalBurn = data.reduce((s, x) => s + x.burn, 0);
    const activeDays = withRecords.length;

    $('stat-notes').innerHTML =
      '有记录 ' + activeDays + ' 天 · 日均摄入 ' + avgIntake + ' kcal · 日均消耗 ' + avgBurn +
      ' kcal · 两周运动共消耗 ' + totalBurn + ' kcal。' +
      (avgIntake > 0 ? '若目标是控制体重，参考值：减脂期日摄入建议低于消耗 300~500 kcal。' : '记录几天后这里会有你的个人画像。');
  }

  /* ---------- 设置 ---------- */
  /* 以云端为准：登录后强制从云端拉取并覆盖本地（性别/年龄/身高/体重/活动系数） */
  async function pullProfileFromCloud() {
    if (!Store.currentUser()) return;
    try {
      const profile = await Store.getProfile();
      if (profile) {
        localStorage.setItem('calorie.gender', profile.gender || 'male');
        localStorage.setItem('calorie.age', profile.age || '25');
        localStorage.setItem('calorie.height', profile.height || '170');
        localStorage.setItem('calorie.weight', profile.weight || '70');
        localStorage.setItem('calorie.activity', profile.activity || '1.2');
        $('cfg-gender').value = profile.gender || 'male';
        $('cfg-age').value = profile.age || '25';
        $('cfg-height').value = profile.height || '170';
        $('cfg-weight').value = profile.weight || '70';
        loadToday();
      }
    } catch (e) { /* 网络失败时保持本地数据 */ }
  }

  function loadConfigForms() {
    $('cfg-gender').value = localStorage.getItem('calorie.gender') || 'male';
    $('cfg-age').value = localStorage.getItem('calorie.age') || '25';
    $('cfg-height').value = localStorage.getItem('calorie.height') || '170';
    $('cfg-weight').value = getWeight();
    $('export-month').value = monthStrOf(todayStr());
  }

  function bindSettings() {
    $('cfg-weight').addEventListener('change', async e => {
      const w = parseFloat(e.target.value);
      if (w >= 30 && w <= 250) { 
        localStorage.setItem('calorie.weight', w); 
        toast('体重已保存'); 
        await syncProfileToCloud();
        loadToday(); 
      }
    });

    $('cfg-gender').addEventListener('change', async e => {
      localStorage.setItem('calorie.gender', e.target.value);
      toast('性别已保存');
      await syncProfileToCloud();
      loadToday();
    });

    $('cfg-age').addEventListener('change', async e => {
      const age = parseInt(e.target.value);
      if (age >= 10 && age <= 120) { 
        localStorage.setItem('calorie.age', age); 
        toast('年龄已保存'); 
        await syncProfileToCloud();
        loadToday(); 
      }
    });

    $('cfg-height').addEventListener('change', async e => {
      const h = parseFloat(e.target.value);
      if (h >= 100 && h <= 250) { 
        localStorage.setItem('calorie.height', h); 
        toast('身高已保存'); 
        await syncProfileToCloud();
        loadToday(); 
      }
    });

    $('btn-export-excel').addEventListener('click', async () => {
      const m = $('export-month').value;
      if (!m) { toast('请选择月份'); return; }
      try {
        const n = await Exporter.exportExcel(m);
        toast('已导出 ' + n + ' 条记录');
      } catch (e) { toast(e.message); }
    });

    $('btn-export-json').addEventListener('click', async () => {
      try {
        const n = await Exporter.exportJson();
        toast('已备份 ' + n + ' 条记录');
      } catch (e) { toast(e.message); }
    });
  }

  /* 同步用户资料到云端 */
  async function syncProfileToCloud() {
    if (!Store.currentUser()) return;
    const profile = {
      gender: localStorage.getItem('calorie.gender') || 'male',
      age: parseInt(localStorage.getItem('calorie.age') || '25'),
      height: parseFloat(localStorage.getItem('calorie.height') || '170'),
      weight: parseFloat(localStorage.getItem('calorie.weight') || '70'),
      activity: parseFloat(localStorage.getItem('calorie.activity') || '1.2'),
    };
    try {
      await Store.saveProfile(profile);
    } catch (e) {
      console.warn('同步资料到云端失败:', e.message);
    }
  }

  function renderAccount() {
    const el = $('account-panel');
    const user = Store.currentUser();
    const localCount = JSON.parse(localStorage.getItem('calorie.local.records') || '[]').length;

    if (user) {
      el.innerHTML =
        '<div class="account-line">' +
        '<div><div style="font-size:.9rem">已登录</div><div class="email">' + esc(user.email) + '</div></div>' +
        '<button class="btn ghost" id="btn-signout">退出登录</button>' +
        '</div>' +
        (localCount ? '<div class="form-row" style="margin-top:10px"><span class="form-hint">本机还有 ' + localCount + ' 条未上传的记录</span>' +
          '<button class="btn" id="btn-merge">上传到云端</button></div>' : '');
      const bo = el.querySelector('#btn-signout');
      if (bo) bo.addEventListener('click', async () => {
        await Store.signout();
        toast('已退出');
        renderAccount();
      });
      const bm = el.querySelector('#btn-merge');
      if (bm) bm.addEventListener('click', async () => {
        try {
          const n = await Store.mergeLocalToCloud();
          toast(n ? '已上传 ' + n + ' 条记录' : '本地没有需要上传的新记录');
          renderAccount();
          loadToday();
        } catch (e) { toast(e.message); }
      });
    } else {
      el.innerHTML =
        '<div class="account-line">' +
        '<div><div style="font-size:.9rem">未登录</div>' +
        '<div class="form-hint">未登录时记录保存在本机浏览器，登录后可多设备同步</div></div>' +
        '<button class="btn" id="btn-open-auth">登录 / 注册</button>' +
        '</div>' +
        (localCount ? '<div class="form-hint" style="margin-top:8px">本机已有 ' + localCount + ' 条本地记录</div>' : '');
      const ba = el.querySelector('#btn-open-auth');
      if (ba) ba.addEventListener('click', openAuth);
    }
  }

  /* ---------- 登录弹层 ---------- */
  let authMode = 'login';

  function openAuth() {
    authMode = 'login';
    $('auth-title').textContent = '登录';
    $('btn-auth-submit').textContent = '登录';
    $('btn-auth-toggle').textContent = '没有账号？注册';
    $('auth-msg').textContent = '';
    showOverlay('overlay-auth');
  }

  function bindAuth() {
    $('btn-auth-close').addEventListener('click', () => hideOverlay('overlay-auth'));
    $('btn-auth-toggle').addEventListener('click', () => {
      authMode = authMode === 'login' ? 'signup' : 'login';
      $('auth-title').textContent = authMode === 'login' ? '登录' : '注册';
      $('btn-auth-submit').textContent = authMode === 'login' ? '登录' : '注册';
      $('btn-auth-toggle').textContent = authMode === 'login' ? '没有账号？注册' : '已有账号？登录';
      $('auth-msg').textContent = '';
    });
    $('btn-auth-submit').addEventListener('click', async () => {
      const email = $('auth-email').value.trim();
      const pass = $('auth-pass').value;
      if (!email || pass.length < 6) { $('auth-msg').textContent = '请填写有效邮箱和至少 6 位密码'; return; }
      $('auth-msg').textContent = '处理中…';
      try {
        if (authMode === 'login') {
          await Store.signin(email, pass);
          toast('登录成功');
        } else {
          const res = await Store.signup(email, pass);
          if (res.access_token) { toast('注册成功'); }
          else { $('auth-msg').textContent = '注册成功，请到邮箱点击确认链接后登录'; return; }
        }
        hideOverlay('overlay-auth');
        renderAccount();
        const n = await Store.mergeLocalToCloud();
        if (n) toast('已同步 ' + n + ' 条本地记录');
        // 以云端为准：登录后强制从云端覆盖本地个人数据
        await pullProfileFromCloud();
        loadConfigForms();
        loadToday();
      } catch (e) {
        $('auth-msg').textContent = e.message;
      }
    });
  }

  /* ---------- 登录状态标签 ---------- */
  function updateLoginTag() {
    $('login-state-tag').textContent = Store.currentUser() ? '已登录 · 云端同步' : '本机模式';
  }

  /* ---------- 初始化 ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    fillExerciseSelect();
    bindPhoto();
    bindAiConfirm();
    bindManualMeal();
    bindExercise();
    bindSettings();
    bindAuth();
    bindEdit();
    loadConfigForms();

    $('history-month').value = state.historyMonth;
    $('history-month').addEventListener('change', e => {
      state.historyMonth = e.target.value;
      loadHistory();
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    /* 识别结果餐次选择 */
    $('ai-sheet-title').addEventListener('click', () => {
      const next = { '早餐': '午餐', '午餐': '晚餐', '晚餐': '加餐', '加餐': '早餐' }[state.aiMeal] || '午餐';
      state.aiMeal = next;
      $('ai-sheet-title').textContent = '识别结果 · 记入' + next;
    });

    Store.setOnAuthChange(updateLoginTag);
    updateLoginTag();
    if (Store.currentUser()) {
      pullProfileFromCloud();          // 个人信息：云端覆盖本地
      Store.mergeLocalToCloud();       // 卡路里记录：补传本地新记录到云端（不覆盖云端）
    }
    switchView('today');
  });

})();
