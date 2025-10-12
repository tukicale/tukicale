import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TukiCale(月カレ)",
  description: "完全プライベート・無料の生理管理アプリ。不規則な周期もOK",
  manifest: "/manifest.v2.json",
  metadataBase: new URL('https://tukicale.sukissco.com'),
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: 'https://tukicale.sukissco.com/',
    siteName: 'TukiCale',
    title: 'TukiCale(月カレ) - 完全プライベート・無料の生理管理アプリ',
    description: '完全プライベート・無料で使える生理管理アプリ。Googleカレンダー連携で予定と一緒に管理。不規則な周期もOK。',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'TukiCale - 生理管理アプリ',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TukiCale(月カレ) - 完全プライベート・無料の生理管理アプリ',
    description: '完全プライベート・無料で使える生理管理アプリ。Googleカレンダー連携で予定と一緒に管理。不規則な周期もOK。',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TukiCale",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
<head>
  <meta name="google-site-verification" content="zUjP5mf9_dXQR9Hgb6qZgXm1Nf1PdQvTUGup-JeyTOg" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
  <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
  <link 
    rel="stylesheet" 
    href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" 
  />
  <script dangerouslySetInnerHTML={{
    __html: `
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js');
        });
      }
    `
  }} />
</head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}