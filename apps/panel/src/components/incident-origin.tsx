import type { IncidentOrigin } from "@/lib/mock"

export function IncidentOriginText({ origin }: { origin: IncidentOrigin }) {
  if (origin.uncommitted) return <>This line was edited on the server and is not in the repository.</>
  return (
    <>
      <span className="font-mono text-[11px]">{origin.commit}</span> by {origin.author}: {origin.summary}
    </>
  )
}
