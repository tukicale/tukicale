import { AdBase } from './AdBase';

export const Ad30s = () => {
  // ★★★ 30代リンクを設定 ★★★
  const items = [
    { text: '妊活サプリメント', link: 'https://example.com/pregnancy-supplement-link' },
    { text: '排卵検査薬', link: 'https://example.com/ovulation-test-30s-link' },
    { text: '産後ケア用品', link: 'https://example.com/postpartum-care-link' }
  ];
  
  return (
    <AdBase
      title="妊活・産後ケア"
      description="あなたのタイミングを大切に"
      items={items}
    />
  );
};