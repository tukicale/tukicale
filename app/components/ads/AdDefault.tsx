import { AdBase } from './AdBase';

export const AdDefault = () => {
  return (
    <AdBase
      title="おすすめ情報"
      description="女性の気になる部分に"
      items={[
        { text: '幹細胞美容・リポソーム原液', link: 'https://t.afi-b.com/visit.php?a=N14733S-H482148y&p=m939301A' },
        { text: '日本初！電動アイクリーム', link: 'https://t.afi-b.com/visit.php?a=D130474-t432918d&p=m939301A' },
        { text: '芸能人、スポーツ選手も愛用中！酵素ドリンク', link: 'https://t.afi-b.com/visit.php?a=w5803m-X185955K&p=m939301A' }
      ]}
    />
  );
};