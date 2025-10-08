import { AdBase } from './AdBase';

export const Ad50sPlus = () => {
  // ★★★ 50代＋リンクを設定 ★★★
  const items = [
    { text: '更年期ケア', link: 'https://example.com/menopause-care-link' },
    { text: '骨密度サポート', link: 'https://example.com/bone-density-link' },
    { text: '健康食品', link: 'https://example.com/health-food-link' }
  ];
  
  return (
    <AdBase
      title="健康的な毎日を"
      description="更年期を快適に過ごすために"
      items={items}
    />
  );
};