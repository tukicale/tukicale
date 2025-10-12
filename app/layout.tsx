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
  description: "不規則な周期もOK、完全プライベートな生理管理アプリ",
  manifest: "/manifest.v2.json",
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