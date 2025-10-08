import { AdBase } from './AdBase';

export const Ad30s = () => {
  // ★★★ 30代リンクを設定 ★★★
  const items = [
    { text: '葉酸×ショウガが新しい 妊活×温活', link: 'https://t.afi-b.com/visit.php?a=811337j-Y378481g&p=m939301A' },
    { text: 'EggMe 卵巣年齢検査キット', link: 'https://track.affiliate-b.com/visit.php?a=A8204g-E275103W&p=m939301A' },
    { text: '田村淳プロデュース婚活サービス', link: 'https://t.afi-b.com/visit.php?a=B10421P-7351572A&p=m939301A' }
  ];
  
  return (
    <AdBase
      title="婚活・妊活・産後ケア"
      description="あなたのタイミングを大切に"
      items={items}
    />
  );
};