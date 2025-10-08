import { AdBase } from './AdBase';

export const Ad10s = () => {
  // ★★★ 10代リンクを設定 ★★★
  const items = [
    { text: '生理用ナプキン（初心者向け）', link: 'https://example.com/napkin-link' },
    { text: '生理痛緩和グッズ', link: 'https://example.com/pain-relief-link' },
    { text: '生理の基礎知識', link: 'https://example.com/basic-knowledge-link' }
  ];
  
  return (
    <AdBase
      title="はじめての生理管理"
      description="自分の体のリズムを知ることから始めよう"
      items={items}
    />
  );
};