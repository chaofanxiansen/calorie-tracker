/* 存储层：Supabase（PostgREST + Auth）直连，零 SDK 依赖。
   未配置或未登录时自动降级为浏览器本地存储，保证功能始终可用。 */

const Store = (function () {

  const CFG_KEY = 'calorie.sb.cfg';
  const SES_KEY = 'calorie.sb.session';
  const LOCAL_KEY = 'calorie.local.records';
  const LOCAL_ID_PREFIX = 'local-';

  let onAuthChange = null;

  function cfg() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { c = {}; }
    return {
      url: c.url || 'https://dgacvzaqcgyngadsdkkz.supabase.co',
      key: c.key || 'sb_publishable_pHc_kDy8FNRmIspbG7yE8g_T9VCNYOM',
    };
  }

  function saveCfg(c) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }

  function session() {
    try { return JSON.parse(localStorage.getItem(SES_KEY) || 'null'); } catch (e) { return null; }
  }

  function saveSession(s) {
    if (s) localStorage.setItem(SES_KEY, JSON.stringify(s));
    else localStorage.removeItem(SES_KEY);
  }

  function isCloudReady() {
    const c = cfg();
    return !!(c.url && c.key);
  }

  function currentUser() {
    const s = session();
    return s && s.user ? s.user : null;
  }

  function notify() { if (onAuthChange) onAuthChange(currentUser()); }

  function setOnAuthChange(fn) { onAuthChange = fn; }

  function headers(extra) {
    const c = cfg();
    return Object.assign({
      'apikey': c.key,
      'Content-Type': 'application/json',
    }, extra || {});
  }

  function authHeaders() {
    const s = session();
    return headers(s && s.access_token ? { 'Authorization': 'Bearer ' + s.access_token } : {});
  }

  /* ---------- Auth ---------- */

  async function refreshToken() {
    const c = cfg();
    const s = session();
    if (!s || !s.refresh_token) return false;
    try {
      const res = await fetch(c.url.replace(/\/+$/, '') + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.access_token) {
        saveSession({ access_token: data.access_token, refresh_token: data.refresh_token || s.refresh_token, user: s.user });
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  async function signup(email, password) {
    const c = cfg();
    if (!isCloudReady()) throw new Error('请先配置 Supabase URL 和 anon key');
    const res = await fetch(c.url.replace(/\/+$/, '') + '/auth/v1/signup', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.msg || data.error_description || data.error || '注册失败');
    if (data.access_token) {
      saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
      notify();
    }
    return data;
  }

  async function signin(email, password) {
    const c = cfg();
    if (!isCloudReady()) throw new Error('请先配置 Supabase URL 和 anon key');
    const res = await fetch(c.url.replace(/\/+$/, '') + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.msg || data.error_description || data.error || '登录失败');
    saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
    notify();
    return data;
  }

  async function ensureAuth() {
    if (!currentUser()) return false;
    // 检查 token 是否即将过期（简单策略：每次请求前尝试 refresh）
    return await refreshToken();
  }

  async function signout() {
    const c = cfg();
    const s = session();
    if (c.url && s && s.access_token) {
      try {
        await fetch(c.url.replace(/\/+$/, '') + '/auth/v1/logout', {
          method: 'POST',
          headers: authHeaders(),
        });
      } catch (e) { /* 忽略登出请求失败 */ }
    }
    saveSession(null);
    notify();
  }

  /* ---------- 本地存储兜底 ---------- */

  function localAll() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch (e) { return []; }
  }

  function localSave(list) { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); }

  function genLocalId() {
    return LOCAL_ID_PREFIX + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- 统一数据接口 ---------- */

  async function listRecords(dateStr) {
    if (isCloudReady() && currentUser()) return cloudList([{ field: 'record_date', op: 'eq', value: dateStr }]);
    return localAll().filter(r => r.record_date === dateStr);
  }

  async function listMonth(monthStr) {
    const parts = monthStr.split('-').map(Number);
    const endY = parts[1] === 12 ? parts[0] + 1 : parts[0];
    const endM = parts[1] === 12 ? 1 : parts[1] + 1;
    const end = endY + '-' + String(endM).padStart(2, '0') + '-01';
    const start = monthStr + '-01';
    if (isCloudReady() && currentUser()) {
      return cloudList([
        { field: 'record_date', op: 'gte', value: start },
        { field: 'record_date', op: 'lt', value: end },
      ]);
    }
    return localAll().filter(r => r.record_date >= start && r.record_date < end);
  }

  async function cloudList(filters) {
    const c = cfg();
    const params = ['select=*'];
    for (const f of filters) params.push(f.field + '=' + f.op + '.' + encodeURIComponent(f.value));
    params.push('order=created_at.asc');
    const url = c.url.replace(/\/+$/, '') + '/rest/v1/records?' + params.join('&');
    await ensureAuth(); // 确保 token 有效
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error('云端查询失败 HTTP ' + res.status);
    return res.json();
  }

  async function addRecords(records) {
    if (isCloudReady() && currentUser()) {
      const c = cfg();
      const url = c.url.replace(/\/+$/, '') + '/rest/v1/records';
      await ensureAuth(); // 确保 token 有效
      const res = await fetch(url, {
        method: 'POST',
        headers: Object.assign(authHeaders(), { 'Prefer': 'return=representation' }),
        body: JSON.stringify(records),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body.message) || ('云端保存失败 HTTP ' + res.status));
      }
      return res.json();
    }
    const list = localAll();
    const saved = records.map(r => Object.assign({}, r, {
      id: r.id || genLocalId(),
      user_id: null,
      created_at: r.created_at || new Date().toISOString(),
    }));
    localSave(list.concat(saved));
    return saved;
  }

  async function deleteRecord(id) {
    if (String(id).startsWith(LOCAL_ID_PREFIX) || !(isCloudReady() && currentUser())) {
      localSave(localAll().filter(r => r.id !== id));
      return;
    }
    const c = cfg();
    const url = c.url.replace(/\/+$/, '') + '/rest/v1/records?id=eq.' + encodeURIComponent(id);
    await ensureAuth(); // 确保 token 有效
    const res = await fetch(url, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) throw new Error('删除失败 HTTP ' + res.status);
  }

  async function updateRecord(id, updates) {
    if (String(id).startsWith(LOCAL_ID_PREFIX) || !(isCloudReady() && currentUser())) {
      const list = localAll();
      const idx = list.findIndex(r => r.id === id);
      if (idx >= 0) {
        Object.assign(list[idx], updates);
        localSave(list);
      }
      return;
    }
    const c = cfg();
    const url = c.url.replace(/\/+$/, '') + '/rest/v1/records?id=eq.' + encodeURIComponent(id);
    await ensureAuth();
    const res = await fetch(url, {
      method: 'PATCH',
      headers: Object.assign(authHeaders(), { 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('更新失败 HTTP ' + res.status);
  }

  /* 登录后把本地记录合并上云（幂等：云端已有同 日期+类型+名称+kcal 则跳过） */
  async function mergeLocalToCloud() {
    if (!(isCloudReady() && currentUser())) return 0;
    const local = localAll();
    if (!local.length) return 0;

    const cloud = await cloudList([]); /* 全量拉取做去重 */
    const seen = new Set(cloud.map(r => [r.record_date, r.type, r.name, r.kcal].join('|')));

    const toUpload = local.filter(r => !seen.has([r.record_date, r.type, r.name, r.kcal].join('|')));
    if (toUpload.length) {
      await addRecords(toUpload.map(r => ({
        record_date: r.record_date,
        type: r.type,
        meal: r.meal || null,
        name: r.name,
        kcal: r.kcal,
        detail: r.detail || {},
      })));
    }
    localSave([]);
    return toUpload.length;
  }

  /* ---------- 用户资料同步 ---------- */

  async function getProfile() {
    if (!(isCloudReady() && currentUser())) return null;
    const c = cfg();
    const url = c.url.replace(/\/+$/, '') + '/rest/v1/user_profiles?select=*&user_id=eq.' + currentUser().id;
    await ensureAuth();
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    return data.length > 0 ? data[0] : null;
  }

  async function saveProfile(profile) {
    if (!(isCloudReady() && currentUser())) return;
    const c = cfg();
    const userId = currentUser().id;
    await ensureAuth();

    // 先尝试更新
    const updateUrl = c.url.replace(/\/+$/, '') + '/rest/v1/user_profiles?user_id=eq.' + userId;
    const updateRes = await fetch(updateUrl, {
      method: 'PATCH',
      headers: Object.assign(authHeaders(), { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }),
      body: JSON.stringify({ ...profile, updated_at: new Date().toISOString() }),
    });

    if (updateRes.ok) {
      const data = await updateRes.json();
      if (data.length > 0) return data[0];
    }

    // 如果没有记录，则插入
    const insertUrl = c.url.replace(/\/+$/, '') + '/rest/v1/user_profiles';
    const insertRes = await fetch(insertUrl, {
      method: 'POST',
      headers: Object.assign(authHeaders(), { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }),
      body: JSON.stringify({ user_id: userId, ...profile }),
    });

    if (!insertRes.ok) throw new Error('保存资料失败');
    const data = await insertRes.json();
    return data[0];
  }

  return {
    cfg, saveCfg, isCloudReady, currentUser,
    setOnAuthChange,
    signup, signin, signout,
    listRecords, listMonth, addRecords, deleteRecord, updateRecord,
    mergeLocalToCloud,
    getProfile, saveProfile,
  };
})();
