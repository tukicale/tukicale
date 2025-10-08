import { Ad10s } from './Ad10s';
import { Ad20s } from './Ad20s';
import { Ad30s } from './Ad30s';
import { Ad40s } from './Ad40s';
import { Ad50s } from './Ad50s';
import { Ad50sPlus } from './Ad50sPlus';
import { AdDefault } from './AdDefault';

export const AgeBasedAdCard = () => {
  const ageGroup = typeof window !== 'undefined' 
    ? localStorage.getItem('tukicale_age_group') || '' 
    : '';
  
  switch(ageGroup) {
    case '10代':
      return <Ad10s />;
    case '20代':
      return <Ad20s />;
    case '30代':
      return <Ad30s />;
    case '40代':
      return <Ad40s />;
    case '50代':
      return <Ad50s />;
    case '50代以上':
      return <Ad50sPlus />;
    default:
      return <AdDefault />;
  }
};

export { BannerAd } from './BannerAd';