"use client"

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

function readDuration(variable: string, fallback: number) {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(variable)) || fallback
}

function replay(element: HTMLElement, className: string) {
  element.classList.remove(className)
  element.getBoundingClientRect()
  element.classList.add(className)
}

const defaultFormat = (value: number) => value.toLocaleString("en-US")

function stablePrefixLength(previous: string, next: string) {
  if (previous.length !== next.length) return 0
  let length = 0
  while (length < next.length && previous[length] === next[length]) length += 1
  return length
}

function staggerFor(position: number, changedLength: number) {
  if (position === changedLength - 2) return "1"
  if (position === changedLength - 1 && changedLength > 1) return "2"
  return undefined
}

export function AnimatedNumber({
  value,
  format = defaultFormat,
  className,
}: {
  value: number
  format?: (value: number) => string
  className?: string
}) {
  const groupRef = useRef<HTMLSpanElement>(null)
  const previous = useRef(value)
  const text = format(value)
  const [texts, setTexts] = useState({ current: text, previous: text })
  if (texts.current !== text) setTexts({ current: text, previous: texts.current })

  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group || previous.current === value) return
    previous.current = value
    replay(group, "is-animating")
  }, [value])

  const stable = stablePrefixLength(texts.previous, text)
  const characters = text.split("")
  const changedLength = characters.length - stable
  return (
    <span ref={groupRef} className={cn("t-digit-group tabular-nums", className)} aria-label={text}>
      {characters.map((character, index) =>
        index < stable ? (
          <span key={`stable-${index}`} aria-hidden className="inline-block">
            {character}
          </span>
        ) : (
          <span key={`${text}-${index}`} aria-hidden className="t-digit" data-stagger={staggerFor(index - stable, changedLength)}>
            {character}
          </span>
        ),
      )}
    </span>
  )
}

export function TextSwap({ text, className }: { text: string; className?: string }) {
  const elementRef = useRef<HTMLSpanElement>(null)
  const [initialText] = useState(text)
  const shown = useRef(text)

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element || shown.current === text) return
    shown.current = text
    element.classList.add("is-exit")
    const timer = window.setTimeout(() => {
      element.textContent = text
      element.classList.remove("is-exit")
      element.classList.add("is-enter-start")
      element.getBoundingClientRect()
      element.classList.remove("is-enter-start")
    }, readDuration("--text-swap-dur", 200))
    return () => window.clearTimeout(timer)
  }, [text])

  return (
    <span ref={elementRef} className={cn("t-text-swap", className)} aria-live="polite">
      {initialText}
    </span>
  )
}

export function IconSwap({ active, first, second, className }: { active: "a" | "b"; first: ReactNode; second: ReactNode; className?: string }) {
  return (
    <span className={cn("t-icon-swap", className)} data-state={active}>
      <span className="t-icon" data-icon="a">
        {first}
      </span>
      <span className="t-icon" data-icon="b">
        {second}
      </span>
    </span>
  )
}
