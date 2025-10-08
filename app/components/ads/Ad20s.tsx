import { AdBase } from './AdBase';

export const Ad20s = () => {
  // ★★★ 20代リンクを設定 ★★★
  const items = [
    { text: 'PMSに悩んだら/めぐルナ', link: 'https://t.afi-b.com/visit.php?a=n7456d-y247580t&p=m939301Ank' },
    { text: '女性用ニオイ除去専用石鹸「BANANA LEAF」', link: 'https://t.afi-b.com/visit.php?a=L12838c-Q427382r&p=m939301A' },
    { text: '痛くないVIO脱毛体験', link: 'https://t.afi-b.com/visit.php?a=j10352y-u347826e&p=m939301A' }
  ];
  
  return (
    <AdBase
      title="妊活・ライフプラン"
      description="将来のために、今からできること"
      items={items}
    />
  );
};