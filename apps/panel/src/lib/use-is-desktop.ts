"use client"

import { useEffect, useState } from "react"

export function useIsDesktop() {
  const [desktop, setDesktop] = useState(true)
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)")
    const update = () => setDesktop(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return desktop
}
