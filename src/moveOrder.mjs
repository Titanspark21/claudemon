export const nextMoveSlot = (from, delta, total) => {
  return (from + delta + total) % total
}

export const reorderMoveSlots = (slots, from, to) => {
  if (from === to) return slots

  const next = slots.slice()
  const [held] = next.splice(from, 1)

  next.splice(to, 0, held)

  return next
}
