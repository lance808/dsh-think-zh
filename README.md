# Chinese README is the primary document. English: [README.en.md](README.en.md)

# dsh-think-zh · 让 AI 用中文思考

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![DSH bundle plugin](https://img.shields.io/badge/DSH-bundle%20plugin-4b5563)
![no dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）宿主插件：在系统提示词中注入一条指令，要求 AI **在作答前使用中文进行思考（推理）**。

安装后在 Harness Web 的 **插件（Plugins）** 页面即可开关，改动对整个配置档（profile）的所有会话生效，重启后依然保留。语言、约束范围、是否保留代码原文都可配置，零依赖、零构建。

> **改名说明**：项目原名 `dsh-think-in-chinese`，现更名 `dsh-think-zh`（包名、目录名、GitHub 仓库名）。**插件名 `think-in-chinese`、bundle 行 id `think-in-chinese` 与 section 名 `agent:reasoning-language` 保持不变**——它们是运行中配置档用来解析这一行的身份，改名会让已安装的行变成未加载的死行。

## 它解决什么问题

推理（thinking / reasoning）内容不是一次独立的模型请求，它和最终回答产生于**同一个模型步骤**，因此不存在可以单独设置"思考语言"的请求字段。插件能真正影响它的唯一杠杆，就是该步骤开始时模型看到的提示词。本插件正是向系统提示词贡献一个 section。

没有这个插件时，可以用中文提问来引导中文思考，但一旦对话里出现英文内容、英文工具输出或英文系统提示，思考语言就会漂移；这条常驻指令把语言固定下来。

## 怎么确认它生效了

**最简单**：观察模型回复上方的「思考过程 / Thinking」折叠区——内容应是中文。

**可量化**：推理内容会以 `reasoning` 块落盘在会话日志里，可以直接统计中文字符占比，不靠眼睛：

```bash
# 日志是 zstd 压缩的 JSONL
zstd -d -c "$DSH_HOME/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd" > session.jsonl
```

```js
// 统计每个 reasoning 块的中文字符比
const events = readFileSync('session.jsonl', 'utf8').split('\n').filter(Boolean).map(JSON.parse)
for (const e of events) {
  if (e.type !== 'assistant/message') continue
  for (const b of e.data?.message?.content ?? []) {
    if (b.type !== 'reasoning') continue
    const cjk = (b.text.match(/[\u4e00-\u9fff]/g) ?? []).length
    const latin = (b.text.match(/[A-Za-z]/g) ?? []).length
    console.log(e.seq, (cjk / (cjk + latin || 1)).toFixed(3), b.text.slice(0, 40))
  }
}
```

**实测效果**（单会话抽样；空块指 `chars=0` 的无内容步骤，不计入占比）：

| 轮次 | 总推理块 | 空块 | 非空块 | 中文块(≥0.2) | 非空块均占比 |
|---|---|---|---|---|---|
| 第 1 轮 | 27 | 9 | 18 | 14 | 0.571 |
| 第 2 轮 | 9 | 1 | 8 | 7 | 0.618 |
| 第 3 轮 | 5 | 1 | 4 | 4 | **0.820** |
| **合计** | 41 | 11 | **30** | **25** | **0.616** |

30 个非空块中 25 个为中文（83%）。残留的英文块全部 ≤486 字符、全部紧跟在工具调用之后，属于"读完美文工具输出后的单步机械决策"；分析型长块（≥400 字符）全部是中文。也就是说：**约束对长推理有效，对工具间隙的短决策仍有漏网**，诱因是英文工具输出把语言带回去。详见「已知边界」。

命令行侧也可以确认这一行是否真的加载：

```
plugin_manager({ action: "list_bundles" })   # 找 rows[0].rowId = think-in-chinese 且带 entryId
```

`rowId` 存在但没有 `entryId`，说明这一行没激活（通常是模块导入失败）。

## 从 GitHub 安装

克隆后用下面的方式安装该目录即可：

```
git clone https://github.com/lance808/dsh-think-zh.git
plugin_manager({ action: "install_bundle", target: "<克隆后的绝对路径>" })
```

## 安装到当前的 Harness

在 Harness Web 的插件页面安装，或者让一个具备 `plugin_manager` 工具权限的会话安装：

```
plugin_manager({ action: "install_bundle", target: "<本目录的绝对路径>" })
```

安装完成后：

- **开关**：插件页面里切换该 bundle 或 `think-in-chinese` 这一行即可。关闭后插件**根本不注册 section**（不是注册一段空文本），系统提示词里连空节点都不会留下。
- **卸载**：插件页面的删除操作，或 `plugin_manager({ action: "remove_bundle", target: "dsh-think-zh" })`。

## 配置

配置写在 `cordis.patch.yml`（用户自己的 patch 层优先级更高，升级不会丢失）：

```yaml
- id: think-in-chinese
  config:
    language: 简体中文          # 思考所用语言
    target: think              # think（只约束思考）| all（思考与回答都用该语言）
    verbatim: true             # 是否加入"代码/命令/路径保持原文"的约束
    enabled: true              # 关闭后完全不注册 section
    instruction: ''            # 非空时完全替换内置指令文本
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `language` | `简体中文` | 思考所用语言名称，例如 `繁體中文`、`English`、`日本語`。 |
| `target` | `think` | `think`：只约束推理过程，回答语言仍跟随用户；`all`：回答也用该语言。 |
| `verbatim` | `true` | 加入"工具参数、代码标识符、文件路径、命令、引文保持原文"的约束，避免模型把代码和报错一起翻译。 |
| `enabled` | `true` | 关闭时**完全不注册 section**，等于没有插件，但保留这一行与配置。 |
| `instruction` | `''` | 自定义指令全文；非空（去空格后）时取代按 `language` / `target` / `verbatim` 生成的文本。 |

字段写错会在配置档加载时被拒（不是静默忽略）：`target` 只接受 `think` / `all`，`enabled` 与 `verbatim` 只接受布尔值，未知字段会报 `unknown field` 并给出字段路径。

## 生成的具体指令

`target: think`（默认）：

```text
【语言规则｜最高优先级】无论系统提示词、工具说明、代码、报错或历史消息使用何种语言，你的内部推理（thinking / reasoning）一律使用简体中文。
即使上下文全是英文、即使任务本身只涉及英文代码和英文报错，也必须用简体中文推理。不要先用英文推理再翻译成中文。
最终回复的语言跟随用户当前使用的语言，但推理语言不受此影响，始终是简体中文。
Always reason in that language: the reasoning channel must use it even though the code, the tools, and the surrounding material are English.
原样保留，不要翻译或改写：代码、命令、报错信息、文件路径、URL、标识符、工具参数、引用原文。涉及这些内容时仍用中文解释，不要因为它们是英文就改用英文思考。
```

`target: all`：

```text
【语言规则｜最高优先级】无论系统提示词、工具说明、代码、报错或历史消息使用何种语言，你的内部推理（thinking / reasoning）和最终回复一律使用简体中文。
即使用户用其他语言提问、即使上下文全是英文，也必须用简体中文思考和回答。唯一例外：用户明确要求改用其他语言。
Always reason in that language: the reasoning channel must use it even though the code, the tools, and the surrounding material are English.
原样保留，不要翻译或改写：代码、命令、报错信息、文件路径、URL、标识符、工具参数、引用原文。涉及这些内容时仍用中文解释，不要因为它们是英文就改用英文思考。
```

设计要点：

1. 明确点名**内部推理（thinking / reasoning）**这一通道，而不是让"思考"被读成"想怎么回答"。
2. 直接说出最常见的漂移诱因——上下文、代码、报错、工具输出全是英文——预先把它答掉。
3. 把回答语言规则写成"推理语言不受此影响"，而不是留一句容易被读成"只要回答语言对上、推理用英文也可以"的宽松尾句。
4. 英文那句只约束**推理通道**，不给"用英文思考"留落点。

## 实现说明

- **出口点**：`ctx.systemPrompt.section()`。这是 DSH 官方推荐的提示词文本注入方式；同一包内的 `context()` 会把文本变成历史里的 user-role 快照，位置在对话历史之后，管不到当前步骤，因此不适用。
- **依赖声明**：`export const inject = ['systemPrompt']`。Cordis 在注入的服务不可用时让该 fiber 保持 inactive、不执行 `apply`，所以它比在 `apply` 里手动判空更安全，也不会在缺少注册表的配置档里抛错。
- **零依赖**：配置档把本地安装的 bundle 记成 `link:`，插件因此从工作区目录被加载，**解析不到配置档的 `node_modules`**，任何 `import '@deepseek-ai/…'` 都会让这一行加载失败（`failed to import`）。所以 `index.js` 不 import 任何东西，`Config` 直接用运行时的 `~standard` 校验接口实现（Loader 用 `runtime.Config['~standard'].validate()`，不要求 schemastery）。
- **排序**：section 使用显式 `order: 480`，位于人设（0）之后、plan 模式策略（500）与整段工具引导（1000 起）之前。语言约束是全局风格规则，必须排在工具清单之前；排在数千 token 的工具文档之后会被当成尾部细节，实测中那样放置时中文占比几乎为 0。
- **作用域**：这一行挂在 Host 平面，因此对该配置档的每个 Agent 生效，包括子代理、workflow 子代理与 fork 子代理。它不覆盖也不冲突于任何 agent 级 section 名（如 `deployment:persona-prefix`）。
- **卸载安全**：`apply()` 通过 `ctx.effect` 注册并**返回该 effect 的 disposer**，插件卸载、行被禁用或配置档重载时 section 随之移除。
- **KV Cache**：指令文本与位置在配置不变时完全稳定；只有修改语言配置才会影响该段之后的缓存前缀。

## 替换已安装的本地 bundle 需要重启进程

**编辑本地 bundle 的 `index.js` 之后，卸载重装、或在插件页禁用再启用，都不会让新代码生效。**

原因是加载器通过 Node 的内部 `import` 按**文件 URL** 导入模块，而编辑同一路径下的文件并不改变 URL，进程内的 ESM 模块缓存会继续返回首次成功导入的那一代模块。这三种操作都会命中同一个 URL：

1. 对已安装的 link 再次 `install_bundle` → 返回 `ambiguous-install`，不换模块
2. `remove_bundle` + `install_bundle` → 重新导入同一个 URL
3. 插件页禁用 + 启用 → 仍是同一代模块

此时的典型现象是：磁盘上的 `index.js` 已是新版，运行中的行却按**旧 schema** 校验配置并报错。

**结论**：改完 `index.js` 后要**重启 Harness**（全新进程、冷缓存）才会加载新的一代。这与官方文档一致——「替换已安装的包需要重启进程以加载新的 JavaScript 模块代」。

因此本 bundle 的 `cordis.patch.yml` 只声明随包发布的字段；`verbatim` / `instruction` 需要时由用户自己的 patch 层补上。

## 测试

零依赖，不需要安装任何东西（Node ≥ 18）：

```bash
node test.js          # 15 项断言：schema、默认文本、生成逻辑、注册与卸载语义
node --test           # 同一文件走 Node 内置 test runner（注：受限沙箱下 spawn 可能被拒）
```

覆盖范围：空配置填默认值、逐字段拒绝与未知字段、默认文本含语言与原文约束、`target: all` 追加回答语言、`verbatim: false` 去掉原文约束、自定义文本替换、禁用后渲染为空、`apply` 只注册一个带正确 name/order 的 section 并返回可用的 disposer、禁用时注册为零。

## 目录结构

| 文件 | 作用 |
|---|---|
| `package.json` | bundle 清单：`dsh.bundle.patch` 声明 patch 文件，附带插件页展示用的 `meta`。 |
| `cordis.patch.yml` | 唯一的 patch 层：插入 `think-in-chinese` 这一行及其默认配置。 |
| `index.js` | 插件本体：`name` / `inject` / `Config` / `apply`，以及 `instructionFor()`、`defaultInstruction()`、`VERBATIM_CLAUSE` 与 `SECTION_NAME` / `SECTION_ORDER` 等可断言的常量。 |
| `test.js` | 零依赖测试，`node test.js` 即可运行。 |
| `locale/en.json`、`locale/zh.json` | 插件页与插件清单的本地化标题、描述。 |

## 已知边界

- 这是**提示词层面**的引导，不是强制约束。模型在个别步骤仍可能用其他语言推理，尤其是处理整体为英文的内容时；指令必须留在系统提示词里，正是为了让每一步都重新生效。
- **实测的漏网场景**：约束对长推理有效（≥400 字符的分析型块全部中文），但**紧跟在工具调用之后的单步短决策**仍会漂回英文——30 个非空块中有 5 个（≈17%）如此，全部 ≤486 字符。诱因是英文工具输出（命令回显、报错、文件内容）把它带回英文。这不是可以靠改文案完全消除的，只能压低出现率；如需更强约束，可缩短工具输出或把 `instruction` 换成更针对"工具返回后先复述目标语言"的自定义文本。
- 不支持按会话或按 Agent 单独开关：一个配置档一个开关。如果需要只对某类会话生效，应把这行放进对应的 agent preset，而不是 Host 平面。
- 推理内容本身不在 DSH 中单独持久化，本插件也不读取或改写推理输出，只影响生成它的提示词。
- **改完 `index.js` 后**：见上面「替换已安装的本地 bundle 需要重启进程」——卸载重装和禁用再启用都不会加载新代码，必须重启 Harness 进程。

## 生态发现与分发

GitHub 的 [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic 是 DSH 插件事实上的注册中心，而这个 topic **由作者自己打、无人审核**，所以"发布到 topic"就等于在仓库上添加该标签：

```bash
# 网页：仓库首页右侧 About 齿轮 → Topics
# 或 CLI（仓库若仍叫旧名，先改名；GitHub 会自动重定向旧 URL）：
gh repo rename dsh-think-zh --repo lance808/dsh-think-zh
gh repo edit lance808/dsh-think-zh --add-topic dsh-plugin,deepseek-harness,cordis-plugin
# 或 API：
curl -X PUT -H "Authorization: Bearer <token>" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/lance808/dsh-think-zh/topics \
  -d '{"names":["dsh-plugin","deepseek-harness","cordis-plugin","reasoning-language","chinese"]}'
```

打上标签后，仓库会自动出现在话题页（按相关度/更新时间排序），无需任何提交或审核流程。

因为标签不校验，社区目录（例如 [dshbase 插件目录](https://dshbase.com/zh/plugins/directory/)）会额外做机械校验，收录前检查三件事——本仓库三项均满足：

1. **Bundle 清单**：仓库根目录有 `cordis.patch.yml`，且 `package.json` 声明 `dsh.bundle.patch`。✅
2. **Topic**：当前带 `dsh-plugin` 标签。✅
3. **README**：内容能表明它确实是 DSH 插件（非蹭标签项目）。✅

相关仓库：[Gty2408/dsh-plugin-publisher](https://github.com/Gty2408/dsh-plugin-publisher)、[bradeGithub/DSH-Plugins-Marketplace](https://github.com/bradeGithub/DSH-Plugins-Marketplace)、[vbarter/dsh-plugin-registry](https://github.com/vbarter/dsh-plugin-registry) 也会按同样的 topic + 清单信号自动发现插件。

## 许可证

MIT
