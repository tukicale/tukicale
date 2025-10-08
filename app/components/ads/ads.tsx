import React from 'react';

export const CalendarTextAd = () => {
  // ★★★ ここにアフィリエイトリンクを設定 ★★★
  const adLink = "https://example.com/your-affiliate-link";
  const adText = "生理周期を記録して、あなたの健康をサポート。TukiCaleで簡単管理を始めましょう。";
  
  return (
    <a 
      href={adLink}
      target="_blank"
      rel="noopener noreferrer"
      className="block mb-4 p-3 hover:opacity-80 transition-opacity cursor-pointer"
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">[AD]</span>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {adText}
      </p>
    </a>
  );
};

export const BannerAd = () => {
  return (
    <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg text-center">
      <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
        バナー広告エリア
      </p>
    </div>
  );
};

export const AgeBasedAdCard = () => {
  const ageGroup = typeof window !== 'undefined' ? localStorage.getItem('tukicale_age_group') : null;
  
  const getAdContent = () => {
    switch(ageGroup) {
      case '10代':
        return '10代の健康管理に。生理周期を記録して、自分の体を知ろう。';
      case '20代':
        return '20代の忙しいあなたに。スマホで簡単に生理周期を管理。';
      case '30代':
        return '30代のライフプランに。妊活や体調管理をサポート。';
      case '40代':
        return '40代の体の変化に。更年期に備えた健康管理を。';
      case '50代以上':
        return '50代以上の健康維持に。体調の変化を記録して健やかな毎日を。';
      default:
        return 'あなたに合った健康情報をお届けします。';
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