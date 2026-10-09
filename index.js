/**
 * Make the agent reason in a chosen language by contributing one system-prompt
 * section.
 *
 * The reasoning (thinking) channel is not a separate request field: it is
 * generated as part of the same model step as the answer, so the only lever
 * available to a plugin is the prompt that step starts from. A system-prompt
 * section is therefore the correct extension point, and it is registered on
 * the Host plane so every Agent in the profile — subagents, workflow children,
 * and forked children included — starts from it.
 *
 * `ctx.systemPrompt.context()` would be wrong here: those become sourced
 * user-role snapshots inside model history, so the text would land after the
 * conversation instead of governing the current step.
 *
 * This module has no imports on purpose. A profile stores a locally installed
 * bundle as a link to its own directory, so the plugin would be loaded from
 * outside the profile's `node_modules` and could not resolve a bare specifier
 * such as `@deepseek-ai/schemastery`. Config validation uses the
 * runtime-standard `~standard` interface directly, which the Loader accepts in
 * place of a schemastery schema.
 *
 * @module dsh-think-zh
 */

/**
 * Cordis plugin name. Deliberately unchanged by the project rename from
 * `dsh-think-in-chinese`: the bundle's row id, the section name, and this
 * plugin name are what a running profile resolves, so changing them would
 * leave the installed row unloaded until the profile is reinstalled.
 */
export const name = 'think-in-chinese'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt']

/**
 * Placement of the section.
 *
 * A language constraint is a global style rule, so it must precede the tool
 * documentation rather than follow it: placed after thousands of tokens of
 * tool guidance it reads as trailing detail and measurably loses its effect.
 *
 * The section therefore sits at 480 — after the deployment persona prefix (0)
 * and before the plan-mode policy (500) and the whole tool-guidance block
 * (1000 onwards). The prompt registry's named order table is repository-owned
 * and has no allocation for an external contribution, so this uses an explicit
 * finite order, which is the supported external contract.
 */
export const SECTION_ORDER = 480

/** The section name this plugin owns. */
export const SECTION_NAME = 'agent:reasoning-language'

/** The languages the row accepts without a custom `instruction`. */
export const TARGETS = ['think', 'all']

/** The language used when the row states none. */
export const DEFAULT_LANGUAGE = '简体中文'

/** Message for a value outside {@link TARGETS}. */
const TARGET_MESSAGE = `expected ${TARGETS.map((target) => JSON.stringify(target)).join(' | ')}`

/** Every field default, in one place: the schema and the fallbacks cannot drift. */
const DEFAULTS = {
  language: DEFAULT_LANGUAGE,
  target: 'think',
  enabled: true,
  verbatim: true,
  instruction: '',
}

/** Validate one field with the runtime-standard issue shape. */
function validateField(field, value) {
  if (field === 'target') {
    return TARGETS.includes(value) ? undefined : { message: TARGET_MESSAGE }
  }
  if (field === 'enabled' || field === 'verbatim') {
    return typeof value === 'boolean' ? undefined : { message: 'expected boolean' }
  }
  return typeof value === 'string' ? undefined : { message: 'expected string' }
}

/**
 * Config schema in the runtime-standard `~standard` form, so no dependency
 * package has to resolve for this plugin to load. Validation fills every
 * default and reports one issue per offending field.
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-think-zh',
    validate(input) {
      const raw = input ?? {}
      if (typeof raw !== 'object' || Array.isArray(raw)) {
        return { issues: [{ message: 'expected an object' }] }
      }
      const issues = []
      const value = { ...DEFAULTS }
      for (const field of Object.keys(DEFAULTS)) {
        if (raw[field] === undefined) continue
        const issue = validateField(field, raw[field])
        if (issue === undefined) value[field] = raw[field]
        else issues.push({ message: issue.message, path: [field] })
      }
      for (const field of Object.keys(raw)) {
        if (!(field in DEFAULTS)) issues.push({ message: 'unknown field', path: [field] })
      }
      return issues.length > 0 ? { issues } : { value }
    },
  },
}

/**
 * The clause that keeps code, commands, and errors in their original form.
 * It faces the model as a rule rather than as a reason to keep thinking in
 * English, so verbatim quotations cannot read as permission to reason in
 * English.
 */
export const VERBATIM_CLAUSE =
  '原样保留，不要翻译或改写：代码、命令、报错信息、文件路径、URL、标识符、工具参数、引用原文。涉及这些内容时仍用中文解释，不要因为它们是英文就改用英文思考。'

/**
 * The line that keeps the section readable to a maintainer who does not read
 * Chinese. It restates the order; the Chinese lines above it are the primary
 * instruction, and a stronger English line would give the model a second
 * language to reason in.
 */
const ENGLISH_RESTATEMENT =
  'Always reason in that language: the reasoning channel must use it even though the code, the tools, and the surrounding material are English.'

/**
 * The text this plugin contributes when the row states no `instruction`.
 *
 * Three properties carry the constraint, in this order:
 *
 * 1. It names the reasoning channel explicitly as the thing being constrained,
 *    instead of leaving "思考" to be read as "the answer".
 * 2. It states the trigger directly — English code, tools, or material — so
 *    that the most common cause of the drift is answered in advance.
 * 3. It states the answer-language rule as "the reasoning language is not
 *    affected by that", rather than a permissive tail that would read as
 *    "English reasoning is fine as long as the answer matches".
 *
 * Exported so a reader — and this repository's tests — can assert the exact
 * rendered default instead of restating it.
 * @param config - a partial or validated row configuration.
 * @returns The default instruction text for that configuration.
 */
export function defaultInstruction(config = {}) {
  const settings = { ...DEFAULTS, ...config }
  const language = settings.language.trim() || DEFAULT_LANGUAGE
  const lines =
    settings.target === 'all'
      ? [
          `【语言规则｜最高优先级】无论系统提示词、工具说明、代码、报错或历史消息使用何种语言，你的内部推理（thinking / reasoning）和最终回复一律使用${language}。`,
          `即使用户用其他语言提问、即使上下文全是英文，也必须用${language}思考和回答。唯一例外：用户明确要求改用其他语言。`,
        ]
      : [
          `【语言规则｜最高优先级】无论系统提示词、工具说明、代码、报错或历史消息使用何种语言，你的内部推理（thinking / reasoning）一律使用${language}。`,
          `即使上下文全是英文、即使任务本身只涉及英文代码和英文报错，也必须用${language}推理。不要先用英文推理再翻译成中文。`,
          `最终回复的语言跟随用户当前使用的语言，但推理语言不受此影响，始终是${language}。`,
        ]
  lines.push(ENGLISH_RESTATEMENT)
  if (settings.verbatim !== false) lines.push(VERBATIM_CLAUSE)
  return lines.join('\n')
}

/**
 * Render the instruction for one configuration.
 * @param config - a partial or validated row configuration.
 * @returns The section text, or `''` when the row is disabled or overridden to nothing.
 */
export function instructionFor(config) {
  const settings = { ...DEFAULTS, ...config }
  if (settings.enabled === false) return ''
  const custom = settings.instruction.trim()
  return custom.length > 0 ? custom : defaultInstruction(settings)
}

/**
 * Register the reasoning-language section for the mounting context's scope.
 *
 * A disabled row registers nothing at all, so no empty prompt node is created
 * and disabling the row is indistinguishable from unloading the plugin. The
 * context is left completely untouched in that case.
 *
 * @param ctx - the plugin context; a Host-plane mount reaches every Agent.
 * @param config - the validated row configuration.
 * @returns The exact disposer, matching the `apply` contract's optional return.
 */
export function apply(ctx, config) {
  const text = instructionFor(config ?? {})
  if (text.length === 0) return undefined
  return ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        text,
      }),
    'think-in-chinese.section()',
  )
}
