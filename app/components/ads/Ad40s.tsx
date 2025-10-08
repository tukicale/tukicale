import { AdBase } from './AdBase';

export const Ad40s = () => {
  // ★★★ 40代リンクを設定 ★★★
  const items = [
    { text: '更年期サプリ', link: 'https://example.com/menopause-supplement-link' },
    { text: 'PMSサプリ', link: 'https://example.com/pms-supplement-link' },
    { text: '漢方薬', link: 'https://example.com/herbal-medicine-link' }
  ];
  
  return (
    <AdBase
      title="更年期に向けた体づくり"
      description="ホルモンバランスを整えて快適に"
      items={items}
    />
  );
};