# YM CF 面板 · 多账号 Cloudflare 管理面板

![版本](https://img.shields.io/badge/版本-v4.0.2-blue) ![部署](https://img.shields.io/badge/部署-Cloudflare%20Pages-orange) ![许可](https://img.shields.io/badge/许可-MIT-green)

把你名下**多个 Cloudflare 账号**装进一个面板：用量监控（Workers / Pages 函数、KV、D1、R2 用量与免费额度、域名流量与来源国家、状态码、热门路径、缓存命中率）+ 在线管理（DNS、域名设置、规则、邮件转发、KV/D1 数据、Pages/Workers 部署、隧道、清缓存）。部署在 Cloudflare Pages 上，**全程免费**，数据只经过你自己的账号。

> 本仓库只包含代码，不包含任何人的账号数据。截图与教程里的账号、域名、数字均为演示数据。

**目录**：[版本亮点](#-版本亮点v40) · [效果预览](#-效果预览) · [快速部署](#-快速部署) · [令牌权限说明](#-api-令牌权限说明重要) · [使用方法](#-使用方法) · [免费额度参考](#-免费额度参考面板进度条的依据) · [升级版本](#-升级版本更新代码) · [Fork 与原站的区别](#-fork-部署与原站的区别) · [故障检查与维修](#️-故障检查与维修) · [版本历史](#-版本) · [常见问题](#-常见问题) · [隐私与安全](#-隐私与安全) · [路线图](#️-路线图)

## 目录

- [🌟 版本亮点（v4.0）](#-版本亮点v40)
- [📸 效果预览](#-效果预览)
- [🚀 快速部署](#-快速部署)
- [🔑 API 令牌权限说明（重要）](#-api-令牌权限说明重要)
- [📖 使用方法](#-使用方法)
- [💰 免费额度参考（面板进度条的依据）](#-免费额度参考面板进度条的依据)
- [🔄 升级版本（更新代码）](#-升级版本更新代码)
- [🔀 Fork 部署与原站的区别](#-fork-部署与原站的区别)
- [🛠️ 故障检查与维修](#️-故障检查与维修)
- [📝 版本](#-版本)
- [❓ 常见问题](#-常见问题)
- [🔐 隐私与安全](#-隐私与安全)
- [🗺️ 路线图](#️-路线图)
- [🙏 参考与致谢](#-参考与致谢)


## 🌟 版本亮点（v4.0）

**看（监控）**

- 👥 **多账号汇总**：任意多个 Cloudflare 账号，首页一张卡一个账号，顶部全账号汇总；每个账号的令牌互不影响
- 📊 **五大产品用量**：Workers 请求/错误/子请求、Pages 函数请求（自动从脚本里拆分）、KV 读/写/删/列、D1 行读/写与查询数、R2 A/B 类操作与存储量
- 🎚️ **免费额度进度条**：三色状态（绿→黄→红），今日视图对照每日免费额度（Workers 10 万/天、KV 读 10 万/写 1000、D1 行读 500 万/写 10 万），30 天视图对照 R2 月额度（A 类 100 万、B 类 1000 万、存储 10 GB）
- 🌐 **站点流量分析**：总请求、总流量、来源国家 Top、**状态码分布、热门路径、缓存命中率、按域名拆分**
- 📈 **请求趋势 + ⚡突刺标记**：今日按 5 分钟粒度、7/30 天按天；最近一期请求量达到此前平均 2 倍以上（且不少于 100 次）时，详情页会标出「用量突刺」
- 🩺 **令牌自检**：账号管理里一键验证全部令牌，并逐项探测各数据源，缺哪项权限一眼可见
- ⬇ **用量报告导出**：详情页一键导出该账号当前视图的 JSON 报告
- 🧰 **资源清单**：域名、Workers 脚本、Pages 项目、D1 数据库、KV 命名空间、R2 存储桶一屏列全

**改（管理，需管理员登录 + 令牌带对应 Edit 权限，见 [权限说明](#-api-令牌权限说明重要)）**

- 🌍 **DNS 记录**：增删改 + 代理开关、**批量删除**、**BIND 导入/导出**、常用预设（SPF / DMARC 一键填入）
- ⚙️ **域名设置**：强制 HTTPS、TLS 1.3、HTTP/2/3、最低 TLS 版本、安全级别（含「正在遭受攻击」）、开发模式、Brotli、机器人战斗模式等 **23 项开关** + **DNSSEC** + **SSL 证书**（通用 SSL 开关、证书包与到期日、**自定义证书上传/删除**）
- 🧱 **规则**：规则集逐条启停；**WAF（网站应用防火墙）自定义规则新建/编辑/删除**（表达式 + 拦截/质询/记录动作）；页面规则（Page Rules）增删改
- 📧 **邮件转发**：邮件路由启停、转发规则增删、catch-all（全收）状态、账号级目标地址列表
- 🗄️ **KV**：键浏览/改值/删/加 + **命名空间新建/改名/删除** + **整个命名空间导入/导出（JSON）**
- 🛢️ **D1**：SQL 控制台（看表、执行、结果表格）+ **新建/删除数据库、导出 SQL、时间旅行恢复（Time Travel）**
- 🚀 **部署**：Pages 部署回滚/重试、项目信息（构建配置、环境变量名）、**新建/删除项目**、绑/解绑自定义域名；Workers 版本部署、绑定与定时触发查看、**查看/上传代码、workers.dev 开关、域名路由增删、删除脚本、实时日志快照**
- 🚇 **隧道（Tunnel）**：列表与连接状态、新建（令牌只显示一次）、公共主机名（ingress）规则编辑、一键生成 CNAME、删除
- 🪣 **R2**：存储桶新建/删除 + **桶内文件管理**（填一次 S3 密钥即可浏览/上传/下载/删除对象）
- 🧹 **清缓存**：整站清除或按网址清除
- 👤 **账号**：成员列表/邀请/移除、账号改名、账单资料、**Cloudflare 官方审计日志**、Web Analytics 站点、**账号级 API 令牌新建/删除**
- 🧩 **产品**：Zero Trust Access 应用与服务令牌、Queues 队列、负载均衡（含源池/健康检查查看）、注册商域名（自动续费/转移锁）、Stream 视频、Images 图片
- 📜 **操作日志**：在面板里做过的修改自动留痕（账号管理里查看，最近 100 条）

**其他**

- 🔒 **令牌安全**：API 令牌只存你自己的 KV、只在服务端调用官方接口、页面永不回显；后台是服务端登录（盐值哈希 + HttpOnly 会话），不是前端假密码；Pages 项目的环境变量只显示名字、永不显示值
- 🌓 深/浅/跟随系统三主题、移动端适配、无任何外部 CDN 依赖（国内网络也能秒开）
- 🔓 可选「未登录公开今日汇总」：只显示各产品今日总数，不含账号名与明细（默认关闭）

## 📸 效果预览

| 桌面端 · 总览 | 账号详情 |
| --- | --- |
| ![桌面端总览](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/preview-desktop.png) | ![账号详情](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/preview-detail.png) |

| 深色模式 | 移动端 |
| --- | --- |
| ![深色模式](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/preview-dark.png) | ![移动端](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/preview-mobile.png) |

## 🚀 快速部署

面板由三部分组成：页面代码（本仓库）+ 一个 KV 命名空间（存账号与设置）+ Pages 项目（托管运行）。三种部署方式任选其一，**推荐方式一**。

### 方式一：Pages 连接 GitHub（推荐，自动更新）

1. **Fork 本仓库**到你的 GitHub 账号。
2. **创建 KV**：Cloudflare 控制台 → 存储和数据库 → KV → 创建命名空间，名字随意（如 `cf-panel-data`）。

![创建 KV 命名空间](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/cf-kv-create.png)
*创建弹窗：① 名称框里填名字（如 cf-panel-data）② 点「创建」；数据位置保持「标准」。*
3. **创建 Pages 项目**：Workers 和 Pages → 创建 → Pages → 连接到 Git → 选你 Fork 的仓库；框架预设选「无」，构建命令与输出目录留空，保存并部署。
4. **绑定 KV（关键）**：Pages 项目 → 设置 → 绑定 → 添加 → KV 命名空间：变量名称必须填 **`PANEL_KV`**，选第 2 步的命名空间；保存后重新部署一次。

![PANEL_KV 绑定](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/cf-panel-bind.png)
*绑好的样子（真实截图）：绑定表里一行 KV 命名空间，变量名 PANEL_KV（图中 ①）。*
5. 打开 `*.pages.dev` 域名，点右上角**「设置管理员」**设好后台账号密码，即可开始添加 CF 账号。

<details>
<summary>📸 部署图片教程（点开看图，6 步）</summary>

![第1步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-deploy-1.png)
![第2步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-deploy-2.png)
![第3步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-deploy-3.png)
![第4步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-deploy-4.png)
![第5步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-deploy-5.png)
![第6步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-deploy-6.png)

</details>

### 方式二：Pages 直接上传

1. 下载本仓库的压缩包（GitHub 仓库页 → Code → Download ZIP）并解压。
2. 同方式一先建好 KV 命名空间。
3. Workers 和 Pages → 创建 → Pages → 上传资产：把解压后的**全部文件**（含 `functions` 文件夹）拖进去部署。
4. 同样绑定 KV（变量名 `PANEL_KV`）后重新部署，再打开域名设置管理员。

> 注意：直接上传方式没有 Git 连接，以后升级要重新下载并上传（见下方升级章节的方式二）。

### 方式三：Wrangler 命令行

```bash
git clone https://github.com/YiMing918/ym-cf-panel.git
cd ym-cf-panel
npx wrangler kv namespace create cf-panel-data
npx wrangler pages deploy . --project-name ym-cf-panel
```

注意：上面第 3 条命令只是**建好了 KV 命名空间**，它和项目还没有任何关系——**还要手动把 KV 绑定到项目上**（wrangler 部署不会自动绑），不绑打开面板会提示初始化失败。部署完接着做：

1. Cloudflare 控制台 → Workers 和 Pages → 打开刚部署的 `ym-cf-panel` 项目 → 设置 → 绑定 → 添加 → **KV 命名空间**。
2. 变量名称填 **`PANEL_KV`**，命名空间选第 3 条命令建的那个（`cf-panel-data`），保存。
3. 回到项目的部署页 **重新部署一次**（或重跑一遍 `npx wrangler pages deploy . --project-name ym-cf-panel`），绑定才生效。
4. 打开 `*.pages.dev` 域名，点右上角「设置管理员」设好后台账号密码——能进到这一步就说明绑定对了。

> 两个名字别搞混：**`cf-panel-data` 是 KV 命名空间的名字**（建 KV 时取的，叫什么都行、可以改）；**`PANEL_KV` 是 Pages 项目里引用它的绑定变量名**（代码只按这个名字找 KV，必须一字不差）。一个是「库的名字」，一个是「代码里叫这个库的名字」。

## 🔑 API 令牌权限说明（重要）

给面板用的令牌在 [API 令牌页](https://dash.cloudflare.com/profile/api-tokens) 创建 →「创建令牌」→「自定义令牌」：

![创建自定义令牌](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/cf-token-form.png)
*创建令牌页：① 先给令牌起名 ② Policies 里选「从头开始 / Custom」，按下面清单一条条加权限。*

| 用途 | 权限 | 说明 |
| --- | --- | --- |
| 用量与流量分析（**必需**） | **Account → Analytics → Read** | Workers/Pages/KV/D1/R2 用量、域名流量都靠它 |
| 域名清单（可选） | Zone → Zone → Read | 显示名下域名列表 |
| 域名流量（可选） | Zone → Analytics → Read | 显示各域名的请求量、流量与来源国家 |
| Workers 清单（可选） | Account → Workers Scripts → Read | 显示脚本列表 |
| Pages 清单（可选） | Account → Cloudflare Pages → Read | 显示 Pages 项目列表 |
| D1 清单（可选） | Account → D1 → Read | 显示数据库名与体积 |
| KV 清单（可选） | Account → Workers KV Storage → Read | 显示命名空间名 |
| R2 清单（可选） | Account → Workers R2 Storage → Read | 显示存储桶列表 |

- 「账户资源」（Account Resources）范围选你要监控的那个账号；有几个账号就建几个令牌（或建一个包含多个账号的令牌也可以，添加账号时重复使用）。
- 上表**全部是只读权限**：能看不能改。缺哪项权限，面板对应区块会显示拉取失败原因，不影响其他区块。
- 添加账号时还需要该账号的 **Account ID**：控制台首页右侧即可复制（32 位）。

**管理功能（v2.0 可选）**：想用详情页「管理」区动手改，在同一令牌里再补这些 **Edit** 权限（只勾你要用的）：

| 功能 | 需要的权限（Edit） |
| --- | --- |
| DNS 记录增删改/导入导出 | Zone → DNS → Edit |
| SSL 模式切换、域名设置开关 | Zone → Zone Settings → Edit |
| 清缓存 | Zone → Cache Purge |
| Pages 绑域名 / 部署回滚重试 / 项目新建删除 | Account → Cloudflare Pages → Edit |
| KV 数据改值 / 命名空间管理 | Account → Workers KV Storage → Edit |
| D1 执行 SQL / 数据库新建删除导出 | Account → D1 → Edit |
| Workers 部署旧版本 | Account → Workers Scripts → Edit |

**扩展功能（v3.0 可选）**：规则、邮件转发、隧道、证书、R2 建桶还需要这些（同样只勾你要用的）：

| 功能 | 需要的权限 |
| --- | --- |
| 规则集启停（WAF/缓存/重定向/转换/限速） | Zone → Rulesets → Edit |
| WAF 托管规则相关 | Zone → Firewall Services → Edit |
| 页面规则增删改 | Zone → Page Rules → Edit |
| SSL 证书状态查看 | Zone → SSL and Certificates → Read（给 Edit 也行） |
| 邮件转发规则 | Zone → Email Routing Rules → Edit |
| 邮件目标地址列表 | Account → Email Routing Addresses → Edit |
| 隧道管理 | Account → Cloudflare Tunnel → Edit |
| R2 存储桶新建/删除 | Account → Workers R2 Storage → Edit |
| 账号子域名等账号信息 | Account → Account Settings → Read |

**全功能（v4.0 可选）**：账号页签与产品页签还需要这些（只用哪个勾哪个）：

| 功能 | 需要的权限 |
| --- | --- |
| 成员邀请/移除 | Account → Members → Edit |
| 账号 API 令牌新建/删除 | Account → API Tokens → Edit |
| 账单资料查看 | Account → Billing → Read |
| 官方审计日志 | Account → Audit Logs → Read |
| 账号改名 | Account → Account Settings → Edit |
| Access 应用/服务令牌 | Account → Access: Apps and Policies → Edit、Access: Service Tokens → Edit |
| Queues 队列 | Account → Workers Queues → Edit |
| 负载均衡 | Account → Load Balancing: Monitors and Pools → Edit + Zone → Load Balancers → Edit |
| 注册商域名开关 | Account → Registrar → Edit |
| Stream / Images | Account → Stream → Edit、Account → Images → Edit |
| Workers 路由 | Zone → Workers Routes → Edit |
| WAF 新建规则 | Account → Account Rulesets → Edit（规则集在账号权限侧） |

**没法用令牌做的事**（Cloudflare 本身的边界，不是面板偷懒）：R2 桶内文件走 S3 协议——在 R2 后台建一个 S3 令牌填进面板即可；真金白银的操作（注册/转移域名、开通付费产品）只能去官方后台付款，面板只做查看与开关。缺权限时对应功能会报出 Cloudflare 的错误信息，不影响其他功能。

<details>
<summary>📸 令牌与使用图片教程（点开看图，9 步）</summary>

![第1步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-use-1.png)
![第2步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-use-2.png)
![第3步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-use-3.png)
![第4步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-use-4.png)
![第5步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-use-5.png)
![第6步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-use-6.png)
![第7步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-use-7.png)
![第8步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-use-8.png)
![第9步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-use-9.png)

</details>

## 📖 使用方法

1. 登录后点右上角「账号管理」→「＋ 添加账号」，填名称、Account ID、API 令牌（保存时自动验令牌）。
2. 首页：顶部是所有账号的汇总；每张账号卡显示核心数字和今日额度条；点「查看详情」进入单账号页。
3. 详情页：脚本请求排行与趋势、流量与来源国家、KV / D1 / R2 明细（分别按命名空间、数据库、存储桶拆分）、资源清单。
4. 顶部可切 **今日 / 7 天 / 30 天**；数据在服务端缓存 2 分钟，点右上角 ⟳ 强制刷新。
5. 「账号管理 → 面板设置」：改面板名称、改管理员密码；可开启「未登录公开今日汇总」（只显示各产品今日总数，不含账号名与明细）。
6. **动手管理**：详情页最下方「🛠️ 管理」区有十个页签（另有「账号」「产品」两区与账号管理里的操作日志）——
   - **DNS 记录**：增删改/开关代理/批量删除；底部有 SPF/DMARC 预设和 BIND 导入/导出；
   - **域名**：切换 SSL 模式、给 Pages 项目绑定/解绑自定义域名；
   - **域名设置**：23 项站点开关（含机器人战斗模式）+ DNSSEC + SSL 证书（通用 SSL 开关、自定义证书上传/删除）；
   - **规则**：各类规则集逐条启停；**WAF 自定义规则新建/编辑/删除**；页面规则新增（跳转/缓存/SSL 三种）/启停/删除；
   - **邮件转发**：邮件路由启停、转发规则增删、目标地址验证状态；
   - **KV 数据**：按命名空间浏览键、改值、删键、加键；新建/改名/删除命名空间；整个命名空间导入/导出 JSON；
   - **D1 控制台**：看表、执行 SQL（**写语句会真实改数据，先看清再执行**）；新建/导出/删除数据库；**时间旅行恢复到过去的时间点**；
   - **部署**：Pages 部署回滚/重试、项目信息与新建/删除项目；Workers 版本部署、绑定与定时触发、**改代码/路由/日志快照**；
   - **R2**：存储桶管理 + **桶内文件**（先在该区保存 S3 密钥）；
   - **隧道**：隧道列表与状态、新建隧道（令牌只显示一次）、编辑公共主机名规则、一键生成 CNAME；
   - **清缓存**：整站清除或按网址清除；
   - **账号**：成员管理、账号改名、账单资料、官方审计日志、Web Analytics 站点、账号级 API 令牌；
   - **产品**：Access 应用与服务令牌、Queues、负载均衡、注册商域名、Stream、Images。
   删除类操作都要点两次确认。某个页签报错说缺权限，就是令牌没给那项权限（对照上方权限表补即可，不用重新部署）。
7. **令牌自检**：「账号管理 → 🩺 令牌自检」逐个账号验证令牌并逐项探测各数据源，缺权限一眼定位；「📜 操作日志」看面板里的全部修改记录。
8. **导出与突刺**：详情页右上角「⬇ 导出报告」下载当前账号用量的 JSON；请求量异常放大时标题旁会出现「⚡ 用量突刺」标记。

## 💰 免费额度参考（面板进度条的依据）

| 产品 | 免费额度 | 面板里在哪看 |
| --- | --- | --- |
| Workers 请求 | 10 万次 / 天 | 今日视图 · 账号卡与详情 |
| KV 读取 / 写入 / 删除 / 列出 | 10 万 / 1000 / 1000 / 1000 次 / 天 | 今日视图 · 详情 |
| D1 行读取 / 行写入 | 500 万 / 10 万行 / 天 | 今日视图 · 详情 |
| D1 存储 | 合计 5 GB | 详情 · D1 区 |
| R2 A 类 / B 类操作 | 100 万 / 1000 万次 / 月 | 30 天视图 · 详情 R2 区 |
| R2 存储 | 10 GB（出站流量免费） | 30 天视图 · 详情 R2 区 |

额度为免费版公开标准，仅供参考，实际以 Cloudflare 官方控制台为准；用量数据来自官方分析接口，为采样统计，与账单口径可能有细微差异。

## 🔄 升级版本（更新代码）

你的账号、令牌、设置都存在 **KV** 里，升级只换代码、**不会动数据**，也不要删除 KV 命名空间或改 `PANEL_KV` 绑定名。

**方式一用户（Git 连接）**：打开你 Fork 的仓库 →「Sync fork」→「Update branch」同步新版，Pages 会自动重新部署；或本地改完 `git push`。
**方式二用户（直接上传）**：下载新版仓库压缩包，重新上传部署一遍即可（KV 绑定保持不变）。

升完打开面板验证：能登录、账号数量对、随便点一个账号能拉到数据。出问题时到 Pages「部署」页把上一个正常版本「回滚到此部署」。

<details>
<summary>📸 升级图片教程（点开看图，4 步）</summary>

![第1步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-upgrade-1.png)
![第2步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-upgrade-2.png)
![第3步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-upgrade-3.png)
![第4步](https://gcore.jsdelivr.net/gh/YiMing918/ym-cf-panel@main/docs/tut-upgrade-4.png)

</details>

## 📝 版本

- **v4.0.2（2026-11-09）**：全量审计修复——列表拉全：域名、Workers 版本、Pages 部署记录、R2 对象、KV 导出等 20 处改为翻页/续页拉全（KV 导出上限由 1000 提升至 10000 并带护栏）；D1 查询等 4 处受平台上限的列表改明示真实总数与截断标记，不再静默少显示。
- **v4.0.1（2026-11-08）**：审计定版——后台登录加失败锁定（同一来源 15 分钟内失败 5 次锁定 15 分钟，计数存 KV）；DNS 记录列表改为翻页拉全（每页 100 条、按接口返回的总页数拉完，不再只取第一页）；新装管理员密码下限提到 6 位（首次设置与改密同口径）。
- **v4.0（2026-11-06）**：全功能版——新增「账号」页签（成员管理、账号改名、账单资料、官方审计日志、Web Analytics、账号级 API 令牌）与「产品」页签（Access、Queues、负载均衡、注册商、Stream、Images）；WAF 自定义规则可新建/编辑/删除；域名设置扩到 23 项并支持自定义证书与通用 SSL 开关；Workers 可查看/上传代码、管理路由、看日志快照；R2 桶内文件管理（S3 密钥）；KV 整体导入/导出；D1 时间旅行恢复；DNS 批量删除；面板操作日志。需给令牌补对应权限（见权限说明的全功能表）。
- **v3.0（2026-11-06）**：对标全网同类面板补齐——流量分析加状态码/热门路径/缓存命中率；新增域名设置（13 项开关 + DNSSEC + 证书状态）、规则（规则集启停 + 页面规则）、邮件转发、隧道管理四个页签；DNS 导入/导出与邮箱预设、KV 命名空间管理、D1 建库/导出、Pages 建项目、R2 建桶、令牌自检、用量突刺标记、报告导出、主题跟随系统。扩展功能需给令牌补对应权限（见权限说明）。
- **v2.0（2026-11-06）**：新增「管理」区——DNS 增删改、SSL 模式、Pages 绑域名、KV 改值、D1 SQL 控制台、Pages/Workers 部署操作、清缓存；令牌补对应 Edit 权限即可启用。
- **v1.0（2026-11-06）**：首发——多账号用量监控（Workers/KV/D1/R2/域名流量）、免费额度进度条、资源清单、公开今日摘要。

## 🔀 Fork 部署与原站的区别

- **空面板开局（隐私设计）**：作者的账号与令牌只存在作者自己部署的 KV 里，Fork 只拿到代码；你部署后添加自己的 CF 账号令牌，管的是你自己的账号。
- **没有「数据自动更新」一说**：面板无定时任务，数据是每次打开时现调 Cloudflare 官方 API 拉的（服务端缓存 2 分钟），谁的面板打开都是最新。
- **代码自动更新靠 Git 连接**：用「方式一 Pages 连接 GitHub」部署的，推送/Sync fork 后 Pages 自动重新部署；用「方式二直接上传」的没有自动更新，升级要重新上传。升级只换代码，不动 KV 里的数据；**不要删 KV 命名空间或改 `PANEL_KV` 绑定名**。
- **云端资源自己建**：Fork 不复制 Secrets 与任何云端资源，KV 要自己建并绑定（变量名 `PANEL_KV`），令牌按「🔑 API 令牌权限说明」最小权限自建。

## 🛠️ 故障检查与维修

- **打开提示初始化失败**：KV 没绑或变量名不是 `PANEL_KV` → Pages 项目「设置 → 绑定」补上后重新部署。
- **整卡加载失败**：令牌失效或 Account ID 填错 → 面板「账号管理」里重填（保存时自动验证）。
- **个别区块报错/清单为空**：令牌缺对应只读权限 → 按权限清单补权限或重建令牌后在账号编辑里换上，不用重新部署。
- **怀疑令牌泄露**：立刻在 CF 后台吊销该令牌并重建，再回面板换新。通用自检入口：账号管理 →「令牌自检」，逐项探测各数据源。其余见下方「❓ 常见问题」。

## ❓ 常见问题

**打开面板提示初始化失败？**
KV 没绑或变量名不是 `PANEL_KV`。到 Pages 项目设置里检查绑定，改完重新部署。

**某个账号整卡拉取失败？**
多半是令牌失效或 Account ID 填错。编辑该账号重新粘贴令牌（保存时会自动验证）。

**只有个别区块报错（如资源清单为空）？**
令牌缺对应产品的 Read 权限。补上权限或重新建令牌后，在账号编辑里换上新令牌。

**Pages 函数请求是怎么统计的？**
Pages 项目的函数调用在官方统计里属于名为 `pages-worker--…` 的脚本，本面板自动把它们拆出来单列；纯静态的 Pages 访问不计入 Workers 请求（在「站点流量」里能看到）。

**额度进度条为什么 7 天视图没有？**
每日额度按天看才准确，所以进度条只在「今日」视图显示；R2 是月额度，只在「30 天」视图显示。

**数据多久更新？**
服务端缓存 2 分钟；官方分析数据本身也有几分钟延迟。点 ⟳ 可强制刷新。

## 🔐 隐私与安全

- 本仓库是纯代码，**不包含任何人的账号、令牌或域名数据**；预览图与教程全部使用演示数据。
- 你添加的账号令牌只保存在**你自己部署的 KV** 中，只由服务端转发到 `api.cloudflare.com`，浏览器端永远拿不到令牌原文（列表里只显示末 4 位）。
- 管理员密码以盐值 SHA-256 哈希存储，会话用 HttpOnly Cookie；「公开汇总」默认关闭。
- 建议给面板绑定自己的域名并开启 Cloudflare Access 或保持密码强度，避免后台暴露在公网被扫。

## 🗺️ 路线图

- 用量告警推送（Telegram / 邮件，额度超阈值或突刺时）
- Workers 单文件部署版（`_worker.js`，多一种部署方式）
- 已在 v4.0 落地：R2 桶内文件管理（S3 密钥）、Workers 日志快照（Tail 会话抓 7 秒）

## 🙏 参考与致谢

本项目在设计上参考了同类开源面板的思路（多账号用量统计、免费额度对照），代码为独立实现：[CF-Workers-UsagePanel](https://github.com/cmliu/CF-Workers-UsagePanel)、CloudFlare Assistant 的账户分析概览。用量数据均来自 Cloudflare 官方 GraphQL 分析接口与 REST API。
