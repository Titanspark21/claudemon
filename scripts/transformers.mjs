export const transformResponseHookEvent = (payload) => {
  if (!payload) return null

  return {
    session_id: payload.session_id,
    cwd: payload.cwd,
    hook_event_name: payload.hook_event_name,
    tool_name: payload.tool_name,
    message: payload.message,
  }
}

export const transformResponsePromptEvent = (payload) => {
  if (!payload) return null

  return {
    session_id: payload.session_id,
    cwd: payload.cwd,
    prompt: payload.prompt,
    user_prompt: payload.user_prompt,
  }
}
