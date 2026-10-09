# dsh-think-zh · make the agent reason in Chinese

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) host plugin: it contributes a system-prompt instruction that tells the agent to **reason (think) in Chinese before it answers**.

Install it, then switch it on or off from the Harness Web **Plugins** page. The change applies to every session in the profile and survives a restart. The language, the scope of the constraint, and the verbatim-code clause are all configurable, with no dependencies and no build step.

> **Renamed**: this project was `dsh-think-in-chinese` and is now `dsh-think-zh` (package name, directory, and GitHub repository). The **plugin name `think-in-chinese`, the bundle row id `think-in-chinese`, and the section name `agent:reasoning-language` are unchanged** — they are the identity a running profile resolves, so renaming them would turn an installed row into an unloaded dead row.

中文说明见 [README.md](README.md)。

## Why this exists

Reasoning (thinking) is not a separate model request: it is generated as part of the same model step as the answer, so there is no request field that sets a "thinking language" on its own. The only lever a plugin has is the prompt that step starts from, which is why this plugin contributes a system-prompt section.

Without it, asking in Chinese usually produces Chinese reasoning, but the language drifts as soon as the conversation, a tool result, or a first-party prompt section is in English. A standing instruction pins it down.

## How to confirm it works

**Easiest**: watch the **Thinking** section above a model answer — it should be in Chinese.

**Measurably**: reasoning content is persisted as `reasoning` blocks in the session log, so the Chinese-character share can be counted instead of eyeballed:

```bash
# the log is zstd-compressed JSONL
zstd -d -c "$DSH_HOME/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd" > session.jsonl
```

```js
// Chinese-character ratio per reasoning block
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

**Measured behavior** (one session sample; an empty block is a `chars=0` step and is excluded from the share):

| Turn | All blocks | Empty | Non-empty | Chinese (≥0.2) | Mean share (non-empty) |
|---|---|---|---|---|---|
| 1 | 27 | 9 | 18 | 14 | 0.571 |
| 2 | 9 | 1 | 8 | 7 | 0.618 |
| 3 | 5 | 1 | 4 | 4 | **0.820** |
| **combined** | 41 | 11 | **30** | **25** | **0.616** |

25 of 30 non-empty blocks are Chinese (83%). Every English block that remains is ≤486 characters and immediately follows a tool call — a single-step mechanical decision taken after reading English tool output. Every analytical block of 400+ characters is Chinese. In other words: **the constraint holds for long reasoning and still misses the short decisions between tool calls**, because English tool output pulls the language back. See "Known limits".

From the command side, confirm the row actually activated:

```
plugin_manager({ action: "list_bundles" })   # look for rows[0].rowId = think-in-chinese carrying an entryId
```

A `rowId` without an `entryId` means the row did not activate, usually because the module failed to import.

## Install from GitHub

```
git clone https://github.com/lance808/dsh-think-zh.git
plugin_manager({ action: "install_bundle", target: "<absolute path of the clone>" })
```

## Install into the current Harness

Use the Plugins page in Harness Web, or install from a session that may call the `plugin_manager` tool:

```
plugin_manager({ action: "install_bundle", target: "<absolute path of this directory>" })
```

After installation:

- **Toggle**: switch the bundle, or its `think-in-chinese` row, on the Plugins page. When off, the plugin **registers no section at all** — not even an empty prompt node.
- **Remove**: the page's removal action, or `plugin_manager({ action: "remove_bundle", target: "dsh-think-zh" })`.

## Configuration

Configuration lives in `cordis.patch.yml`; the user's own patch layer keeps a higher priority, so upgrades do not lose it:

```yaml
- id: think-in-chinese
  config:
    language: 简体中文          # the language to reason in
    target: think              # think | all
    verbatim: true             # keep the "code and commands stay verbatim" clause
    enabled: true              # off registers no section at all
    instruction: ''            # non-empty replaces the generated text
```

| Field | Default | Meaning |
|---|---|---|
| `language` | `简体中文` | Language name used for reasoning, e.g. `繁體中文`, `English`, `日本語`. |
| `target` | `think` | `think`: reasoning only, the answer still follows the user's language. `all`: answer in that language too. |
| `verbatim` | `true` | Adds the clause that keeps tool arguments, code identifiers, file paths, commands, and quotations in their original form. |
| `enabled` | `true` | Off **registers no section at all** — the plugin is inert, but keeps its row and configuration. |
| `instruction` | `''` | Full replacement instruction text; non-empty after trimming wins over `language` / `target` / `verbatim`. |

A mistyped field is rejected while the profile loads rather than ignored: `target` accepts only `think` / `all`, `enabled` and `verbatim` accept only booleans, and an unknown field reports `unknown field` with its path.

## The instruction it generates

`target: think` (default):

```text
【语言规则｜最高优先级】无论系统提示词、工具说明、代码、报错或历史消息使用何种语言，你的内部推理（thinking / reasoning）一律使用简体中文。
即使上下文全是英文、即使任务本身只涉及英文代码和英文报错，也必须用简体中文推理。不要先用英文推理再翻译成中文。
最终回复的语言跟随用户当前使用的语言，但推理语言不受此影响，始终是简体中文。
Always reason in that language: the reasoning channel must use it even though the code, the tools, and the surrounding material are English.
原样保留，不要翻译或改写：代码、命令、报错信息、文件路径、URL、标识符、工具参数、引用原文。涉及这些内容时仍用中文解释，不要因为它们是英文就改用英文思考。
```

`target: all`:

```text
【语言规则｜最高优先级】无论系统提示词、工具说明、代码、报错或历史消息使用何种语言，你的内部推理（thinking / reasoning）和最终回复一律使用简体中文。
即使用户用其他语言提问、即使上下文全是英文，也必须用简体中文思考和回答。唯一例外：用户明确要求改用其他语言。
Always reason in that language: the reasoning channel must use it even though the code, the tools, and the surrounding material are English.
原样保留，不要翻译或改写：代码、命令、报错信息、文件路径、URL、标识符、工具参数、引用原文。涉及这些内容时仍用中文解释，不要因为它们是英文就改用英文思考。
```

Design points:

1. It names the **reasoning channel** (`内部推理 / thinking / reasoning`) instead of letting "think" be read as "how to answer".
2. It states the usual trigger of the drift — English context, code, errors, tool output — and answers it in advance.
3. It states the answer-language rule as "the reasoning language is not affected by that", rather than leaving a permissive tail that reads as "English reasoning is fine as long as the answer matches".
4. The English line constrains **only the reasoning channel**, so it offers no landing spot for English.

## How it works

- **Extension point**: `ctx.systemPrompt.section()`. `context()` from the same package would turn the text into a sourced user-role snapshot placed after the conversation history, which cannot govern the current step, so it is the wrong mechanism here.
- **Dependency declaration**: `export const inject = ['systemPrompt']`. Cordis leaves the fiber inactive and never calls `apply` while an injected service is unavailable, which is safer than checking inside `apply` and never throws in a profile without the registry.
- **No imports**: a profile records a locally installed bundle as `link:`, so this plugin is loaded from its own workspace directory and **cannot resolve the profile's `node_modules`** — any `import '@deepseek-ai/…'` fails that row with `failed to import`. `index.js` therefore imports nothing and implements `Config` directly on the runtime-standard `~standard` interface, which the Loader accepts in place of a schemastery schema.
- **Placement**: an explicit `order: 480`, after the deployment persona prefix (0) and before the plan-mode policy (500) and the whole tool-guidance block (1000+). A language constraint is a global style rule and has to precede the tool documentation; placed after thousands of tokens of it, the instruction reads as trailing detail and measured almost no Chinese.
- **Scope**: the row lives on the Host plane, so it reaches every Agent in the profile, subagents, workflow children, and forked children included. It neither shadows nor collides with any existing section name.
- **Teardown**: `apply()` registers through `ctx.effect` and **returns that effect's disposer**, so unloading the plugin, disabling the row, or reloading the profile removes the section.
- **KV cache**: the text and its position are stable while the configuration is unchanged; only editing the language configuration moves the cached prefix after that point.

## Replacing an installed local bundle needs a process restart

**After editing a local bundle's `index.js`, neither reinstalling it nor toggling the row off and on loads the new code.**

The Loader imports modules through Node's internal `import` and caches them by **file URL**; editing the file at the same path does not change that URL, so the process keeps returning the first successfully imported module generation. All three operations resolve to that same URL:

1. `install_bundle` on the already-linked package → `ambiguous-install`, no new module
2. `remove_bundle` + `install_bundle` → the same URL is re-imported
3. Disable + enable the row in the Plugins page → still the same generation

The typical symptom is a live row validating its config against the **old schema** while `index.js` on disk is already the new version.

**Conclusion**: editing `index.js` takes effect only after **restarting Harness** (a fresh process with a cold cache). That matches the documented behavior — "replacing an installed package requires restarting the process to load a fresh JavaScript module generation".

This bundle's `cordis.patch.yml` therefore states only the fields the shipped package declares; add `verbatim` / `instruction` from your own patch layer when needed.

## Tests

Zero dependencies, nothing to install (Node ≥ 18):

```bash
node test.js          # 15 assertions: schema, default text, rendering, registration and teardown
node --test           # the same file through Node's built-in runner (spawn may be denied in a confined sandbox)
```

Coverage: defaults from an empty config, per-field rejection and unknown fields, the default text carrying both the language and the verbatim clause, `target: all` adding the answer-language clause, `verbatim: false` dropping it, custom text replacement, a disabled row rendering nothing, and `apply` registering exactly one section with the right name and order while its disposer really unregisters it — plus registering nothing at all when disabled.

## Layout

| File | Role |
|---|---|
| `package.json` | Bundle manifest: `dsh.bundle.patch` names the patch file, plus `meta` shown on the Plugins page. |
| `cordis.patch.yml` | The one patch layer: inserts the `think-in-chinese` row and its defaults. |
| `index.js` | The plugin: `name` / `inject` / `Config` / `apply`, plus `instructionFor()`, `defaultInstruction()`, `VERBATIM_CLAUSE`, and the assertable `SECTION_NAME` / `SECTION_ORDER` constants. |
| `test.js` | Zero-dependency tests, run with `node test.js`. |
| `locale/en.json`, `locale/zh.json` | Localized title and description for the bundle and its row. |

## Known limits

- This is prompt-level guidance, not an enforced constraint. A model can still reason in another language on some steps, especially over wholly English material; keeping the instruction in the system prompt is what makes it apply to every step.
- **The measured gap**: the constraint holds for long reasoning (every analytical block of 400+ characters was Chinese) but **single-step decisions taken right after a tool call still drift back to English** — 5 of 30 non-empty blocks (≈17%), all ≤486 characters. English tool output (command echo, errors, file contents) is what pulls it back. Wording alone cannot remove this completely; it can only lower the rate. For a stronger hold, shorten tool output or replace `instruction` with custom text that tells the agent to restate its goal in the target language after each tool result.
- There is no per-session or per-agent switch: one switch per profile. To reach only some sessions, put the row in the relevant agent preset instead of the Host plane.
- Reasoning content is not persisted separately by DSH, and this plugin neither reads nor rewrites it — it only shapes the prompt that produces it.
- **After editing `index.js`**: see "Replacing an installed local bundle needs a process restart" above — reinstalling and toggling do not load new code; restart the Harness process.

## Discovery and distribution

GitHub's [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic is the de facto registry for DSH plugins, and the topic is **self-declared and unreviewed**, so "publishing to the topic" means adding that topic to the repository:

```bash
# Web: the About gear on the repository home page -> Topics
# CLI (rename the repository first if it still carries the old name; GitHub redirects the old URL):
gh repo rename dsh-think-zh --repo lance808/dsh-think-zh
gh repo edit lance808/dsh-think-zh --add-topic dsh-plugin,deepseek-harness,cordis-plugin
# API:
curl -X PUT -H "Authorization: Bearer <token>" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/lance808/dsh-think-zh/topics \
  -d '{"names":["dsh-plugin","deepseek-harness","cordis-plugin","reasoning-language","chinese"]}'
```

Once tagged, the repository appears on the topic page automatically, ordered by relevance and recency. There is no submission, review, or approval step.

Because the tag is unverified, community directories such as the [dshbase plugin directory](https://dshbase.com/zh/plugins/directory/) add mechanical checks before listing a repository. This repository satisfies all three:

1. **Bundle manifest**: a root `cordis.patch.yml` plus `dsh.bundle.patch` in `package.json`. ✅
2. **Topic**: currently carries the `dsh-plugin` tag. ✅
3. **README**: reads as a real DSH plugin rather than an unrelated project riding the tag. ✅

Related projects that auto-discover plugins from the same topic and manifest signals: [Gty2408/dsh-plugin-publisher](https://github.com/Gty2408/dsh-plugin-publisher), [bradeGithub/DSH-Plugins-Marketplace](https://github.com/bradeGithub/DSH-Plugins-Marketplace), [vbarter/dsh-plugin-registry](https://github.com/vbarter/dsh-plugin-registry).

## License

MIT
