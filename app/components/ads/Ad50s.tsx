import { AdBase } from './AdBase';

export const Ad50s = () => {
  // ★★★ 50代リンクを設定 ★★★
  const items = [
    { text: '更年期サプリ・ベルタエクリズム', link: 'https://t.afi-b.com/visit.php?a=515507D-75039744&p=m939301A' },
    { text: '95%の満足度！はじめてのエクオール', link: 'https://t.afi-b.com/visit.php?a=v8597u-y289437o&p=m939301A' },
    { text: '芸能人、スポーツ選手も愛用中！酵素ドリンク', link: 'https://t.afi-b.com/visit.php?a=w5803m-X185955K&p=m939301A' }
  ];
  
  return (
    <AdBase
      title="50代の健康管理"
      description="更年期と向き合う毎日をサポート"
      items={items}
    />
  );
};