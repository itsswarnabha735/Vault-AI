import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Providers } from '@/components/providers/Providers';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: {
    default: 'Vault AI - Privacy-First Personal Finance',
    template: '%s | Vault AI',
  },
  description:
    'Local-first personal finance app with AI-powered insights. Your data never leaves your device.',
  keywords: [
    'personal finance',
    'privacy',
    'local-first',
    'AI',
    'financial management',
  ],
  authors: [{ name: 'Vault AI Team' }],
  creator: 'Vault AI',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  ),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: 'Vault AI - Privacy-First Personal Finance',
    description: 'Local-first personal finance app with AI-powered insights',
    siteName: 'Vault AI',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vault AI - Privacy-First Personal Finance',
    description: 'Local-first personal finance app with AI-powered insights',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
