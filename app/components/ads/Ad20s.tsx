import { AdBase } from './AdBase';

export const Ad20s = () => {
  // ★★★ 20代リンクを設定 ★★★
  const items = [
    { text: '葉酸サプリ', link: 'https://example.com/folic-acid-link' },
    { text: '排卵検査薬', link: 'https://example.com/ovulation-test-link' },
    { text: '月経カップ・吸水ショーツ', link: 'https://example.com/menstrual-cup-link' }
  ];
  
  return (
    <AdBase
      title="妊活・ライフプラン"
      description="将来のために、今からできること"
      items={items}
    />
  );
};