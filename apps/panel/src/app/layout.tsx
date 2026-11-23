import type { Metadata } from "next"
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import Script from "next/script"

import { AppShell } from "@/components/shell/app-shell"
import { TooltipProvider } from "@/components/ui/tooltip"
import { THEME_SCRIPT } from "@/lib/theme-script"
import { cn } from "@/lib/utils"

import "./globals.css"

const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" })
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono" })

export const metadata: Metadata = {
  title: "Argus",
  description: "FiveM server management",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("dark antialiased", plexSans.variable, plexMono.variable)}>
      <body>
        <Script id="theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <TooltipProvider delayDuration={400}>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  )
}
