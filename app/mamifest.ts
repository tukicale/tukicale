import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TukiCale（月カレ）',
    short_name: 'TukiCale',
    description: '生理管理アプリ',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ec4899',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}