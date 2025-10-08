import { AdBase } from './AdBase';

export const Ad50s = () => {
  // ★★★ 50代リンクを設定 ★★★
  const items = [
    { text: '更年期ケア', link: 'https://example.com/menopause-care-50s-link' },
    { text: '骨密度サポート', link: 'https://example.com/bone-density-50s-link' },
    { text: '健康食品', link: 'https://example.com/health-food-50s-link' }
  ];
  
  return (
    <AdBase
      title="50代の健康管理"
      description="更年期を快適に過ごすために"
      items={items}
    />
  );
};