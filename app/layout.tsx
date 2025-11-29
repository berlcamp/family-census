import Maintenance from '@/components/Maintenance'
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
  const isMaintenance = true

  if (isMaintenance) {
    return (
      <html lang="en">
        <body className="dark:bg-[#191919]" suppressHydrationWarning>
          <Maintenance />
        </body>
      </html>
    )
  }

  return (
    <html lang="en">
      <body className="dark:bg-[#191919]" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
