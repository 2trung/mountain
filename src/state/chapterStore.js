import { useSyncExternalStore } from 'react'

let current = 0
const listeners = new Set()

export const getChapter = () => current

export const setChapter = (index) => {
  if (index === current) return
  current = index
  for (const l of listeners) l()
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useChapter = () => useSyncExternalStore(subscribe, getChapter)
