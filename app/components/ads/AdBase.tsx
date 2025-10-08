import { useState } from 'react';

type AdItem = {
  text: string;
  link: string;
};

type AdBaseProps = {
  title: string;
  description: string;
  items: AdItem[];
};

export const AdBase = ({ title, description, items }: AdBaseProps) => {
  const [showAdInfo, setShowAdInfo] = useState(false);

  return (
    <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
        {title}
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
        {description}
      </p>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">おすすめアイテム</p>
        <ul className="space-y-1">
          {items.map((item, index) => (
            <li key={index} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
              <span>•</span>
              
               <a href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <button 
            type="button" 
            onClick={() => setShowAdInfo(!showAdInfo)} 
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <i className="fa-solid fa-circle-info"></i>
          </button>
          <span className="text-xs text-gray-400 dark:text-gray-500">[AD]</span>
        </div>
        {showAdInfo && (
          <div className="mt-2 p-3 bg-blue-50 dark:bg-gray-700 rounded text-xs text-gray-700 dark:text-gray-300 space-y-2">
            <p>TukiCaleは無料でご利用いただけるよう、広告を掲載しています。</p>
            <p>掲載されている商品やサービスは、年齢層や生理周期管理に関連するものを選定しています。広告収益はアプリの運営・改善に使用されます。</p>
          </div>
        )}
      </div>
    </div>
  );
};