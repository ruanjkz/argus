import Link from "next/link"

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/70 px-5 py-3">
        <h1 className="text-sm font-semibold">{title}</h1>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">not built yet</p>
      </header>
      <div className="flex flex-1 items-start justify-center overflow-auto px-6 pt-[14vh]">
        <div className="w-full max-w-md">
          <p className="text-base font-semibold">{title} is next on the list</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          <Link
            href="/"
            className="press mt-6 inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
