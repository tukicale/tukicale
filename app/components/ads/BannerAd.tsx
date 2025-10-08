export const BannerAd = () => {
  // ★★★ リンクを設定 ★★★
  const adLink = "https://example.com/your-banner-affiliate-link";
  
  return (
    <a 
      href={adLink}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full hover:opacity-90 transition-opacity"
    >
      <div className="bg-gradient-to-r from-blue-100 to-purple-100 dark:from-gray-800 dark:to-gray-700 p-4 text-center rounded-lg">
        <p className="text-xs text-gray-700 dark:text-gray-300 mb-1">あなたにおすすめ</p>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">生理周期管理をもっと快適に</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">[AD]</p>
      </div>
    </a>
  );
};