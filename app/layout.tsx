import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Family Census',
  description: 'Family Census'
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="dark:bg-[#191919]" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
