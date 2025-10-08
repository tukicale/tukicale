type AdBaseProps = {
  title: string;
  description: string;
  items: string[];
  children?: React.ReactNode;
};

export const AdBase = ({ title, description, items, children }: AdBaseProps) => {
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
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {children || (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-right">
            <a 
              href="/ad-info" 
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:underline"
            >
              [AD]
            </a>
          </div>
        )}
      </div>
    </div>
  );
};