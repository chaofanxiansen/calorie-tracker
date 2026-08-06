# 热量账本 · Calorie Ledger

记录每日饮食与运动的卡路里账本。拍照识别食物热量、按 MET 公式计算运动消耗、多设备云端同步、Excel 导出复盘。零后端、零外部依赖，纯静态，可直接托管在 GitHub Pages。

## 功能

- **拍照估卡路里**：调用大模型视觉接口（默认通义千问 qwen-vl-max），识别照片中的食物与分量，估算每项及总卡路里，可逐项修改后一键入账
- **运动消耗**：内置 30 种常见运动的 MET 代谢当量表，按「MET × 体重 × 时长」计算消耗
- **每日账本**：摄入 / 消耗 / 净余额，按日期归档
- **多设备同步**：Supabase 云数据库（PostgREST 直连，无需 SDK），手机记录、电脑复盘
- **离线兜底**：未配置云端或未登录时，自动降级为浏览器本地存储，登录后一键合并上传
- **Excel 导出**：明细 + 每日汇总双工作表，纯前端生成标准 .xlsx，零依赖
- **模型可换**：识别接口统一封装，千问 / GPT / 智谱等 OpenAI 兼容接口改配置即切换

## 目录结构

```
calorie-tracker/
├── index.html          # 单页应用
├── css/style.css       # 样式（暖纸 Hana 风）
├── js/
│   ├── met.js          # MET 代谢当量表 + 消耗计算
│   ├── ai.js           # 模型层（千问 OpenAI 兼容，可插拔）
│   ├── store.js        # 存储层（Supabase REST + Auth，本地兜底）
│   ├── xlsx.js         # 手写迷你 xlsx 生成器（无 SheetJS）
│   ├── export.js       # Excel / JSON 导出
│   └── app.js          # 主逻辑
├── supabase.sql        # 数据库建表 + 行级安全脚本
└── README.md
```

## 部署步骤

### 1. 推送到 GitHub Pages

```bash
# 在 calorie-tracker 目录下
git init
git add .
git commit -m "热量账本 v1"
git remote add origin https://github.com/你的用户名/calorie-tracker.git
git push -u origin main
```

然后在仓库 Settings → Pages → Source 选择 `main` 分支根目录，等一两分钟即可通过 `https://你的用户名.github.io/calorie-tracker/` 访问。

### 2. 配置 Supabase（多设备同步）

1. 打开 https://supabase.com 注册并新建项目（区域建议选 Singapore，国内访问更快）
2. 进入项目 → SQL Editor，整段粘贴执行 `supabase.sql`
3. 进入项目 → Authentication → Providers → Email，确认「Confirm email」已关闭（默认关闭），否则注册后需要点邮件链接
4. 记下两个值：项目顶部 `Connect` 弹窗或 Settings → API Keys 中的 `Project URL`（形如 `https://xxxx.supabase.co`）和 `publishable key`（形如 `sb_publishable_...`，新版密钥格式；旧版 anon key 已弃用）
5. 打开网站「设置」页，填入 URL 与 publishable key，点「测试云端连接」，然后点「登录 / 注册」创建账号

> 注意：`sb_secret_...`（secret key）等同旧版 service_role，拥有管理员权限、绕过 RLS，只能放在你自己控制的服务器环境，绝不要填入网站前端或发到任何聊天/公共场合。若曾泄露，请立即在 Settings → API Keys 中删除重建。

### 3. 配置大模型识别

1. 打开阿里云百炼控制台 https://bailian.console.aliyun.com 创建 API Key
2. 打开网站「设置」页：
   - 接口地址：`https://dashscope.aliyuncs.com/compatible-mode/v1`（默认已填）
   - 模型名称：`qwen-vl-max`（也可填 qwen-vl-plus，价格更低）
   - API Key：粘贴你的 key
3. 点「测试识别接口」，显示「连接正常」即可

### 4. 使用

- **手机**：打开网站 → 今日 → 拍照识别 → 确认入账；记录运动选类型填时长
- **电脑**：历史 / 统计视图复盘，设置页导出 Excel 或 JSON 备份

## 成本参考

- 识别：每天 4 张照片约 7000~8000 token，qwen-vl-max 月成本约 1 元；百炼新用户每个模型送 100 万 token 免费额度
- 存储：Supabase 免费层 500MB 数据库，个人记录（每天十几条文本）可用数年
- 托管：GitHub Pages 免费

## 说明

- API Key 保存在你自己的浏览器 localStorage 中，不进入代码仓库，仅在调用时从浏览器直发大模型接口。个人自用风险可控；如介意暴露，可后续加一层 Cloudflare Worker 代理
- 拍照图片在前端压缩至 1280px 后仅用于识别，不存储、不上传云端，隐私数据留在手机本地
- 识别结果为估算值，误差 ±20% 属正常，建议按自己常吃的食物在手动添加中校准
