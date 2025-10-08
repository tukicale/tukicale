export const BannerAd = () => {
  // ★★★ リンクを設定 ★★★
  const adLink = "https://t.afi-b.com/visit.php?a=H14552a-c477632f&p=m939301A";
  const adImageUrl = "https://t.afi-b.com/lead/H14552a/m939301A/c477632f"; // 画像URL
  
  return (
    <a 
      href={adLink}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full hover:opacity-90 transition-opacity mb-4"
    >
      <img 
        src={adImageUrl} 
        alt="広告バナー" 
        className="w-full h-auto rounded-lg"
      />
    </a>
  );
};