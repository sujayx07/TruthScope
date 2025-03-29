import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TruthScope',
  description: 'AI-powered browser extension analyzes news articles and social media posts in real-time',
  generator: 'TruthScope',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
