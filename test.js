import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  apply,
  Config,
  DEFAULT_LANGUAGE,
  defaultInstruction,
  instructionFor,
  name,
  SECTION_NAME,
  SECTION_ORDER,
  TARGETS,
  VERBATIM_CLAUSE,
  inject,
} from './index.js'

/** Validate a raw row config through the exported schema. */
function validate(raw) {
  return Config['~standard'].validate(raw)
}

/**
 * A context stub that records what the plugin registered and whether the
 * returned disposer actually disposes it, which is what a real unload does.
 */
function stubContext() {
  const sections = []
  const disposed = []
  return {
    sections,
    disposed,
    ctx: {
      effect(setup) {
        const disposer = setup()
        const wrapped = () => {
          disposed.push(true)
          return disposer()
        }
        return wrapped
      },
      systemPrompt: {
        section(section) {
          sections.push(section)
          return () => {
            const index = sections.indexOf(section)
            if (index >= 0) sections.splice(index, 1)
          }
        },
      },
    },
  }
}

test('declares the plugin identity, its one service, and the placement', () => {
  assert.equal(name, 'think-in-chinese')
  assert.deepEqual(inject, ['systemPrompt'])
  assert.equal(SECTION_NAME, 'agent:reasoning-language')
  // 480 is deliberately before the plan-mode policy (500) and the whole
  // tool-guidance block (1000+): a language constraint placed after the tool
  // documentation loses its effect.
  assert.equal(SECTION_ORDER, 480)
  assert.deepEqual(TARGETS, ['think', 'all'])
  assert.equal(DEFAULT_LANGUAGE, '简体中文')
})

test('fills every default from an empty config', () => {
  const result = validate({})
  assert.equal(result.issues, undefined)
  assert.deepEqual(result.value, {
    language: DEFAULT_LANGUAGE,
    target: 'think',
    enabled: true,
    verbatim: true,
    instruction: '',
  })
})

test('accepts a partial config and keeps the stated values', () => {
  const result = validate({ language: 'English', target: 'all', verbatim: false })
  assert.equal(result.issues, undefined)
  assert.equal(result.value.language, 'English')
  assert.equal(result.value.target, 'all')
  assert.equal(result.value.verbatim, false)
  assert.equal(result.value.enabled, true)
})

test('reports one issue per offending field, including unknown fields', () => {
  const result = validate({ target: 'nope', enabled: 'yes', extra: 1 })
  assert.equal(result.value, undefined)
  assert.equal(result.issues.length, 3)
  assert.deepEqual(
    result.issues.map((issue) => issue.path).sort(),
    [['enabled'], ['extra'], ['target']],
  )
  assert.match(result.issues.find((issue) => issue.path[0] === 'target').message, /"think" \| "all"/)
})

test('rejects a non-object config', () => {
  assert.equal(validate('chinese').issues.length, 1)
  assert.equal(validate([]).issues.length, 1)
})

test('the default instruction names the reasoning channel and the English-context trigger', () => {
  const text = defaultInstruction()
  assert.ok(text.includes('内部推理'), 'names the reasoning channel, not just "thinking"')
  assert.ok(text.includes(`一律使用${DEFAULT_LANGUAGE}`), 'states the reasoning language')
  assert.ok(text.includes('必须用简体中文推理'), 'answers the all-English-context trigger in advance')
  assert.ok(text.includes('即使上下文全是英文'), 'names English material as the trigger')
  assert.ok(text.includes('不要先用英文推理'), 'forbids the translate-afterwards pattern')
  assert.ok(text.includes(VERBATIM_CLAUSE), 'keeps code, commands, and error text verbatim')
})

test('the answer-language rule never reads as permission to reason in English', () => {
  const text = defaultInstruction()
  // A permissive tail — "最终回复的语言仍以用户当前使用的语言为准" — would read as
  // a licence to keep the reasoning English. It must not appear.
  assert.ok(!text.includes('最终回复的语言仍以用户当前使用的语言为准'))
  assert.ok(text.includes('推理语言不受此影响'), 'separates the answer rule from the reasoning rule')
})

test('the English restatement is present but is not the primary carrier', () => {
  const text = defaultInstruction()
  assert.ok(text.includes('Always reason in that language'))
  assert.ok(text.indexOf('内部推理') < text.indexOf('Always reason'), 'Chinese precedence comes first')
})

test('target "all" constrains the answer language too', () => {
  const text = defaultInstruction({ language: '繁體中文', target: 'all' })
  assert.ok(text.includes('一律使用繁體中文'))
  assert.ok(text.includes('用繁體中文思考和回答'))
})

test('verbatim false drops the clause that protects code and commands', () => {
  const text = defaultInstruction({ verbatim: false })
  assert.ok(!text.includes(VERBATIM_CLAUSE))
  assert.ok(text.includes('Always reason in that language'))
})

test('a custom instruction replaces the generated text, and a blank one does not', () => {
  assert.equal(instructionFor({ instruction: '只用中文思考。' }), '只用中文思考。')
  assert.equal(instructionFor({ instruction: '  只用中文思考。  ' }), '只用中文思考。')
  assert.equal(instructionFor({ instruction: '   ' }), defaultInstruction())
})

test('a disabled row renders nothing', () => {
  assert.equal(instructionFor({ enabled: false }), '')
})

test('apply registers exactly one ordered section and returns its disposer', () => {
  const { ctx, sections, disposed } = stubContext()
  const dispose = apply(ctx, validate({}).value)

  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, SECTION_NAME)
  assert.equal(sections[0].order, SECTION_ORDER)
  assert.equal(sections[0].text, defaultInstruction())
  assert.equal(typeof dispose, 'function')

  dispose()
  assert.equal(disposed.length, 1)
  assert.equal(sections.length, 0)
})

test('apply tolerates a config the schema never saw', () => {
  const { ctx, sections } = stubContext()
  apply(ctx, undefined)
  assert.equal(sections.length, 1)
  assert.equal(sections[0].text, defaultInstruction())
})

test('a disabled row registers nothing at all', () => {
  const { ctx, sections, disposed } = stubContext()
  const dispose = apply(ctx, validate({ enabled: false }).value)
  assert.equal(sections.length, 0)
  assert.equal(dispose, undefined)
  assert.equal(disposed.length, 0)
})
