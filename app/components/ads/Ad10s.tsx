import { AdBase } from './AdBase';

export const Ad10s = () => {
  // ★★★ 10代リンクを設定 ★★★
  const items = [
    { text: 'PMSに悩んだら/めぐルナ', link: 'https://t.afi-b.com/visit.php?a=n7456d-y247580t&p=m939301Ank' },
    { text: '土・日のみ日帰り参加治験モニター多数', link: 'https://track.affiliate-b.com/visit.php?a=A8204g-E275103W&p=m939301A' },
    { text: '痛くないVIO脱毛体験', link: 'https://t.afi-b.com/visit.php?a=j10352y-u347826e&p=m939301A' }
  ];
  
  return (
    <AdBase
      title="はじめての生理管理"
      description="自分の体のリズムを知ることから始めよう"
      items={items}
    />
  );
};