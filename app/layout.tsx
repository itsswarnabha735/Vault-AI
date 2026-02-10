import type { Metadata } from 'next';
import { Playfair_Display, DM_Sans, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/providers/Providers';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  weight: ['400', '500', '600'],
  display: 'swap',
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
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${playfair.variable} ${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
