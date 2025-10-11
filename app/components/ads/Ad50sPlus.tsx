import { AdBase } from './AdBase';

export const Ad50sPlus = () => {
  // ★★★ 50代＋リンクを設定 ★★★
  const items = [
    { text: '更年期サプリ・ベルタエクリズム', link: 'https://t.afi-b.com/visit.php?a=515507D-75039744&p=m939301A' },
    { text: '95%の満足度！はじめてのエクオール', link: 'https://t.afi-b.com/visit.php?a=v8597u-y289437o&p=m939301A' },
    { text: '価値ある価格と安心。宝石の買取', link: 'https://t.afi-b.com/visit.php?a=k15160l-2494699X&p=m939301A' }
  ];
  
  return (
    <AdBase
      title="60代以上の健康維持に"
      description="体調の変化を記録して健やかな毎日を"
      items={items}
    />
  );
};