/* 模型层：识别接口抽象。
   默认实现为阿里云百炼 OpenAI 兼容模式（千问视觉模型）。
   换其他大模型只需改此文件中的 baseUrl/model 配置或替换 estimate() 内部实现。 */

const AI = (function () {

  const KEY = 'calorie.ai.cfg';

  function cfg() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { c = {}; }
    return {
      baseUrl: c.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: c.model || 'qwen3.7-plus',
      key: c.key || 'sk-ws-H.ERLDLHH.wGb1.MEQCIB-hDXKtiLCBmRIhXl76zYa9qBB1AcdSJ7PB4SO1XLA7AiBUv-vOB_2eykKPrOqQsf4ISTG9TEHM62dFtEFfajxkww',
    };
  }

  function save(c) {
    localStorage.setItem(KEY, JSON.stringify(c));
  }

  function isConfigured() {
    const c = cfg();
    return !!(c.key && c.model);
  }

  const PROMPT = `你是一位严谨的营养师。请识别图片中的食物，逐项估算：
1. 食物名称（中文）
2. 大致分量（克或碗/份等日常单位）
3. 该分量对应的卡路里（千卡/kcal）
4. 该分量对应的蛋白质（克/g）、碳水化合物（克/g）、脂肪（克/g）

要求：
- 只输出 JSON，不要任何多余文字或 markdown 代码块标记
- JSON 结构为 {"items":[{"name":"食物名","portion":"150克","kcal":220,"protein":8.5,"carbs":42.3,"fat":2.1}],"total":220,"note":"简短备注"}
- kcal 为整数，total 为各项之和；protein/carbs/fat 为克数，保留一位小数，无法确定时给合理估算值
- 识别不清或图片中没有食物时，items 返回空数组，note 说明原因`;

  /* 识别一张餐食图片，返回 {items, total, note, raw} */
  async function estimate(imageDataUrl) {
    const c = cfg();
    if (!c.key) throw new Error('尚未配置大模型 API Key，请到「设置」中填写');
    if (!c.model) throw new Error('尚未配置模型名称，请到「设置」中填写');

    const res = await fetch(c.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + c.key,
      },
      body: JSON.stringify({
        model: c.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageDataUrl } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try {
        const err = await res.json();
        msg = (err.error && (err.error.message || err.error.code)) || msg;
      } catch (e) { /* ignore */ }
      throw new Error('识别接口返回错误：' + msg);
    }

    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';

    let parsed;
    try {
      const cleaned = String(content).replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // 容错：直接解析失败时，用正则提取 JSON 块（兼容模型输出带前后缀的情况）
      const m = String(content).match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch (e2) {
          throw new Error('识别结果解析失败，请重试或手动添加');
        }
      } else {
        throw new Error('识别结果解析失败，请重试或手动添加');
      }
    }

    const items = Array.isArray(parsed.items) ? parsed.items.map(it => ({
      name: String(it.name || '未知食物'),
      portion: String(it.portion || ''),
      kcal: Math.max(0, Math.round(Number(it.kcal) || 0)),
      protein: Math.max(0, Number(it.protein) || 0),
      carbs: Math.max(0, Number(it.carbs) || 0),
      fat: Math.max(0, Number(it.fat) || 0),
    })) : [];

    const total = Math.round(Number(parsed.total) || items.reduce((s, it) => s + it.kcal, 0));
    return { items, total, note: parsed.note || '', raw: content };
  }

  /* 测试连通性：发一条最小请求 */
  async function test() {
    const c = cfg();
    if (!c.key || !c.model) throw new Error('请先填写 API Key 和模型名称');
    const res = await fetch(c.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + c.key,
      },
      body: JSON.stringify({
        model: c.model,
        messages: [{ role: 'user', content: '回复"ok"两个字即可' }],
        max_tokens: 10,
      }),
    });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try {
        const err = await res.json();
        msg = (err.error && (err.error.message || err.error.code)) || msg;
      } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    return '连接正常';
  }

  return { cfg, save, isConfigured, estimate, test, PROMPT };
})();
