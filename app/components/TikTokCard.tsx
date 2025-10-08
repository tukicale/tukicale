export const TikTokCard = () => {
  return (
    <div className="p-4 rounded-lg" style={{backgroundColor: '#C2D2DA'}}>
      <div className="text-sm text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
        <i className="fa-brands fa-tiktok text-gray-900 dark:text-gray-100"></i>
        コミュニティに参加
      </div>
      <p className="text-xs text-gray-800 dark:text-gray-100 mb-3">
        TukiCaleユーザーと交流して、使い方のヒントや体験談をシェアしよう！
      </p>
      <a
        href="https://www.tiktok.com/@tukicale_app"
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full text-center px-4 py-2 rounded-lg transition-colors text-sm text-white bg-gray-800 dark:bg-gray-700 hover:bg-gray-900 dark:hover:bg-gray-600"
      >
        <i className="fa-brands fa-tiktok mr-2"></i>
        @tukicale_app をフォロー
      </a>
    </div>
  );
};