import { expect, test } from 'vitest'
import {
  transformResponseHookEvent,
  transformResponsePromptEvent,
} from './transformers.mjs'

test('Should map only the hook fields the activity hook consumes', () => {
  const event = transformResponseHookEvent({
    session_id: 'aaa',
    cwd: '/tmp/project',
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
    message: 'Claude needs your permission',
    transcript_path: '/tmp/transcript.jsonl',
    permission_mode: 'default',
    tool_input: { file_path: '/tmp/a.txt' },
  })

  expect(event).toEqual({
    session_id: 'aaa',
    cwd: '/tmp/project',
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
    message: 'Claude needs your permission',
  })
  expect(event).not.toHaveProperty('transcript_path')
  expect(event).not.toHaveProperty('permission_mode')
  expect(event).not.toHaveProperty('tool_input')
})

test('Should keep every mapped hook key present when the payload omits them', () => {
  const event = transformResponseHookEvent({
    session_id: 'bbb',
    hook_event_name: 'SessionStart',
  })

  expect(Object.keys(event)).toEqual([
    'session_id',
    'cwd',
    'hook_event_name',
    'tool_name',
    'message',
  ])
  expect(event.cwd).toBeUndefined()
  expect(event.tool_name).toBeUndefined()
  expect(event.message).toBeUndefined()
})

test('Should map no hook event when the payload is not an object', () => {
  expect(transformResponseHookEvent(null)).toBeNull()
})

test('Should map both prompt spellings and drop the rest of the payload', () => {
  const event = transformResponsePromptEvent({
    session_id: 'ccc',
    cwd: '/tmp/project',
    prompt: 'catch a pikachu',
    user_prompt: 'catch a bulbasaur',
    hook_event_name: 'UserPromptSubmit',
    transcript_path: '/tmp/transcript.jsonl',
  })

  expect(event).toEqual({
    session_id: 'ccc',
    cwd: '/tmp/project',
    prompt: 'catch a pikachu',
    user_prompt: 'catch a bulbasaur',
  })
  expect(event).not.toHaveProperty('hook_event_name')
  expect(event).not.toHaveProperty('transcript_path')
})

test('Should keep every mapped prompt key present when only user_prompt arrives', () => {
  const event = transformResponsePromptEvent({
    session_id: 'ddd',
    user_prompt: 'catch a bulbasaur',
  })

  expect(Object.keys(event)).toEqual([
    'session_id',
    'cwd',
    'prompt',
    'user_prompt',
  ])
  expect(event.prompt).toBeUndefined()
  expect(event.user_prompt).toBe('catch a bulbasaur')
})

test('Should map no prompt event when the payload is not an object', () => {
  expect(transformResponsePromptEvent(null)).toBeNull()
})
