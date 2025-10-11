import { AdBase } from './AdBase';

export const Ad40s = () => {
  // ★★★ 40代リンクを設定 ★★★
  const items = [
    { text: '更年期サプリ・ベルタエクリズム', link: 'https://t.afi-b.com/visit.php?a=515507D-75039744&p=m939301A' },
    { text: '95%の満足度！はじめてのエクオール', link: 'https://t.afi-b.com/visit.php?a=v8597u-y289437o&p=m939301A' },
    { text: '芸能人、スポーツ選手も愛用中！酵素ドリンク', link: 'https://t.afi-b.com/visit.php?a=w5803m-X185955K&p=m939301A' }
  ];
  
  return (
    <AdBase
      title="40代の体の変化に。"
      description="更年期に備えた健康管理を"
      items={items}
    />
  );
};