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
  title: "TukiCale(月カレ) - 不規則な生理周期も管理できる完全無料アプリ",
  description: "生理不順でも安心して使える生理管理アプリ。Googleカレンダー連携で予定と一緒に管理。完全プライベート・無料。",
  keywords: ["生理管理", "生理アプリ", "生理不順", "生理周期", "月経管理", "Googleカレンダー", "プライベート", "無料", "不規則な周期"],
  authors: [{ name: "TukiCale" }],
  creator: "TukiCale",
  publisher: "TukiCale",
  manifest: "/manifest.v2.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TukiCale",
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: "https://tukicale.sukissco.com",
    title: "TukiCale(月カレ) - 不規則な生理周期も管理できる完全無料アプリ",
    description: "生理不順でも安心して使える生理管理アプリ。Googleカレンダー連携で予定と一緒に管理。完全プライベート・無料。",
    siteName: "TukiCale",
    images: [
      {
        url: "https://tukicale.sukissco.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "TukiCale - 生理管理アプリ",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TukiCale(月カレ) - 不規則な生理周期も管理",
    description: "生理不順でも安心。完全プライベートな生理管理アプリ",
    images: ["https://tukicale.sukissco.com/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "あなたのGoogle Search Console認証コード（後で追加）",
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