"use client"

import { useCallback, useEffect, useRef } from "react"

function readMs(variable: string, fallback: number) {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(variable))
  return Number.isFinite(value) ? value : fallback
}

export function useFieldError<Field extends HTMLElement>() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<Field>(null)
  const shakeTimer = useRef<number | null>(null)
  const revertTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (shakeTimer.current !== null) window.clearTimeout(shakeTimer.current)
      if (revertTimer.current !== null) window.clearTimeout(revertTimer.current)
    },
    [],
  )

  const clear = useCallback(() => {
    if (revertTimer.current !== null) window.clearTimeout(revertTimer.current)
    revertTimer.current = null
    wrapRef.current?.classList.remove("is-error")
    wrapRef.current?.querySelector(".t-input")?.classList.remove("is-error")
  }, [])

  const show = useCallback(() => {
    const wrap = wrapRef.current
    const box = wrap?.querySelector<HTMLElement>(".t-input")
    if (!wrap || !box) return
    wrap.classList.add("is-error")
    box.classList.add("is-error")
    box.classList.remove("is-shaking")
    void box.offsetWidth
    box.classList.add("is-shaking")
    const shakeMs = readMs("--shake-dur-a", 80) * 2 + readMs("--shake-dur-b", 60) * 2
    if (shakeTimer.current !== null) window.clearTimeout(shakeTimer.current)
    shakeTimer.current = window.setTimeout(() => box.classList.remove("is-shaking"), shakeMs + 20)
    if (revertTimer.current !== null) window.clearTimeout(revertTimer.current)
    revertTimer.current = window.setTimeout(() => {
      revertTimer.current = null
      wrap.classList.remove("is-error")
      box.classList.remove("is-error")
    }, shakeMs + readMs("--revert-hold", 3000))
    fieldRef.current?.focus()
  }, [])

  return { wrapRef, fieldRef, show, clear }
}
