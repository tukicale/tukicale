import React from 'react';

export const CalendarTextAd = () => {
  const [showAdInfo, setShowAdInfo] = React.useState(false);
  
  // ★★★ アフィリエイトリンクとテキストを設定 ★★★
  const adLink = "https://t.afi-b.com/visit.php?a=c14775F-J510209T&p=m939301A";
  const adText = "PayPayポイント10,000円分キャンペーン";
  
  return (
    <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-4">
      <a 
        href={adLink}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:text-blue-600 dark:hover:text-blue-400 hover:underline mb-2"
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {adText}
        </p>
      </a>
      <div className="flex justify-end items-center">
        <button 
          type="button" 
          onClick={() => setShowAdInfo(!showAdInfo)} 
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
        >
          [AD]
        </button>
      </div>
      {showAdInfo && (
        <div className="mt-2 p-3 bg-blue-50 dark:bg-gray-700 rounded text-xs text-gray-700 dark:text-gray-300 space-y-2">
          <p>TukiCaleは無料でご利用いただけるよう、広告を掲載しています。</p>
          <p>掲載されている商品やサービスは、年齢層や生理周期管理に関連するものを選定しています。広告収益はアプリの運営・改善に使用されます。</p>
        </div>
      )}
    </div>
  );
};

export const BannerAd = () => {
  return (
    <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg text-center">
      <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
        あなたにおすすめ
      </p>
      <p className="text-base text-blue-900 dark:text-blue-100 font-semibold mt-1">
        生理周期管理をもっと快適に
      </p>
      <div className="flex justify-end mt-2">
        <span className="text-xs text-blue-700 dark:text-blue-300">[AD]</span>
      </div>
    </div>
  );
};

export const AgeBasedAdCard = () => {
  const ageGroup = typeof window !== 'undefined' ? localStorage.getItem('tukicale_age_group') : null;
  
  const getAdContent = () => {
    switch(ageGroup) {
      case '10代':
        return 'はじめての生理管理。自分の体のリズムを知ることから始めよう';
      case '20代':
        return '妊活・ライフプラン。将来のために、今からできること';
      case '30代':
        return '婚活・妊活・産後ケア。あなたのタイミングを大切に';
      case '40代':
        return '40代の体の変化に。更年期に備えた健康管理を';
      case '50代':
        return '50代の健康管理。更年期と向き合う毎日をサポート';
      case '60代以上':
        return '60代以上の健康維持に。体調の変化を記録して健やかな毎日を';
      default:
        return 'あなたに合った健康情報をお届けします';
    }
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">[AD]</span>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {getAdContent()}
      </p>
    </div>
  );
};