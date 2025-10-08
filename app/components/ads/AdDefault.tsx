import { AdBase } from './AdBase';

export const AdDefault = () => {
  return (
    <AdBase
      title="おすすめ情報"
      description="生理周期管理をもっと快適に"
      items={[
        { text: '生理用品', link: '#' },
        { text: 'サプリメント', link: '#' },
        { text: 'ヘルスケアアイテム', link: '#' }
      ]}
    />
  );
};