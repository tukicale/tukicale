"use client"
import React, { useState, useEffect } from 'react';
import { TikTokCard } from './components/TikTokCard';
import { AgeBasedAdCard, BannerAd } from './components/ads/index';
import { CalendarTextAd } from './components/ads';

type Period = {
  id: number;
  startDate: string;
  endDate: string;
  days: number;
  memo?: string;
};

type IntercourseRecord = {
  id: number;
  date: string;
  contraception: string;
  partner: string;
  memo: string;
};

type HealthRecord = {
  id: number;
  date: string;
  type: '不正出血' | '頭痛' | '腹痛' | '吐き気' | 'その他';
  memo: string;
};

type Records = {
  periods: Period[];
  intercourse: IntercourseRecord[];
  health: HealthRecord[];
  ageGroup?: string;
};

type BulkRecord = {
  id: number;
  startDate: string;
  endDate: string;
};

type SyncSettings = {
  period: boolean;
  fertile: boolean;
  pms: boolean;
  intercourse: boolean;
  health: boolean;
};

// ============ Google API連携関数 ============

const DRIVE_FILE_NAME = 'tukicale_data.json';
const CALENDAR_NAME = 'TukiCale';

const getAccessToken = async () => {
  const token = localStorage.getItem('tukicale_access_token');
  if (!token) return null;
  
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + token);
    if (response.ok) return token;
  } catch (e) {
    console.error('Token validation error:', e);
  }
  
  return null;
};

const saveToDrive = async (data: Records) => {
  const token = await getAccessToken();
  if (!token) return false;
  
  try {
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FILE_NAME}'&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    if (!searchResponse.ok) throw new Error('Drive search failed');
    
    const searchData = await searchResponse.json();
    const jsonData = JSON.stringify(data);
    
    if (searchData.files && searchData.files.length > 0) {
      const fileId = searchData.files[0].id;
      const response = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: jsonData
        }
      );
      
      return response.ok;
    } else {
      const metadata = {
        name: DRIVE_FILE_NAME,
        mimeType: 'application/json'
      };
      
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([jsonData], { type: 'application/json' }));
      
      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form
        }
      );
      
      return response.ok;
    }
  } catch (error) {
    console.error('Save to Drive error:', error);
    return false;
  }
};

const getOrCreateCalendar = async () => {
  const token = await getAccessToken();
  if (!token) return null;
  
  try {
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    if (!response.ok) throw new Error('Calendar list failed');
    
    const data = await response.json();
    const calendar = data.items?.find((cal: { summary: string; id: string }) => cal.summary === CALENDAR_NAME);
    
    if (calendar) return calendar.id;
    
    const createResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ summary: CALENDAR_NAME })
      }
    );
    
    if (!createResponse.ok) throw new Error('Calendar creation failed');
    
    const newCalendar = await createResponse.json();
    return newCalendar.id;
  } catch (error) {
    console.error('Get/Create calendar error:', error);
    return null;
  }
};

const getNextDay = (dateStr: string): string => {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);
  return date.toISOString().split('T')[0];
};

const groupConsecutiveDates = (dates: string[]): { start: string; end: string }[] => {
  if (dates.length === 0) return [];
  
  const sorted = [...dates].sort();
  const groups: { start: string; end: string }[] = [];
  let currentGroup = { start: sorted[0], end: sorted[0] };
  
  for (let i = 1; i < sorted.length; i++) {
    const prevDate = new Date(sorted[i - 1]);
    const currDate = new Date(sorted[i]);
    const diffDays = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      currentGroup.end = sorted[i];
    } else {
      groups.push({ ...currentGroup });
      currentGroup = { start: sorted[i], end: sorted[i] };
    }
  }
  
  groups.push(currentGroup);
  return groups;
};

const syncToCalendar = async (
  records: Records, 
  settings: SyncSettings, 
  getAverageCycle: () => number, 
  getFertileDays: () => string[], 
  getPMSDays: () => string[], 
  getNextPeriodDays: () => string[]
) => {
  const token = await getAccessToken();
  if (!token) return false;
  
  const calendarId = await getOrCreateCalendar();
  if (!calendarId) return false;
  
  try {
    // 既存イベントを全て削除
    const eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${new Date(new Date().getFullYear() - 1, 0, 1).toISOString()}&maxResults=2500`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    if (eventsResponse.ok) {
      const eventsData = await eventsResponse.json() as { items?: Array<{ id: string }> };
      
      // 全イベントを削除
      for (const event of eventsData.items || []) {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${event.id}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          }
        );
      }
      
      // 削除完了を待つ
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const events: Array<{
      summary: string;
      start: { date: string };
      end: { date: string };
      colorId: string;
    }> = [];
    
    if (settings.period) {
      records.periods.forEach(period => {
        events.push({
          summary: '生理',
          start: { date: period.startDate },
          end: { date: getNextDay(period.endDate) },
          colorId: '11'
        });
      });
    }
    
if (settings.fertile) {
  const fertileDays = getFertileDays();
  if (fertileDays.length > 0) {
    const groupedFertile = groupConsecutiveDates(fertileDays);
    groupedFertile.forEach(group => {
      events.push({
        summary: '妊娠可能日',
        start: { date: group.start },
        end: { date: getNextDay(group.end) },
        colorId: '10'
      });
    });
  }
}

if (settings.pms) {
  const pmsDays = getPMSDays();
  if (pmsDays.length > 0) {
    const groupedPMS = groupConsecutiveDates(pmsDays);
    groupedPMS.forEach(group => {
      events.push({
        summary: 'PMS予測',
        start: { date: group.start },
        end: { date: getNextDay(group.end) },
        colorId: '5'
      });
    });
  }
}
    
if (settings.period) {
  const nextPeriodDays = getNextPeriodDays();
  if (nextPeriodDays.length > 0) {
    const groupedNext = groupConsecutiveDates(nextPeriodDays);
    groupedNext.forEach(group => {
      events.push({
        summary: '次回生理予測',
        start: { date: group.start },
        end: { date: getNextDay(group.end) },
        colorId: '4'
      });
    });
  }
}
    
    if (settings.intercourse) {
      records.intercourse.forEach(record => {
        events.push({
          summary: '●',
          start: { date: record.date },
          end: { date: getNextDay(record.date) },
          colorId: '8'
        });
      });
    }
    
    if (settings.health) {
      (records.health || []).forEach(record => {
        events.push({
          summary: `体調: ${record.type}`,
          start: { date: record.date },
          end: { date: getNextDay(record.date) },
          colorId: '6'
        });
      });
    }
    
    // 新しいイベントを作成
    for (const event of events) {
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(event)
        }
      );
    }
    
    return true;
  } catch (error) {
    console.error('Sync to calendar error:', error);
    return false;
  }
};

const StatsView = ({ records, getAverageCycle, getAveragePeriodLength, setShowIntercourseList, useIntercourseRecord }: {
  records: Records;
  getAverageCycle: () => number;
  getAveragePeriodLength: () => number;
  setShowIntercourseList: (show: boolean) => void;
  useIntercourseRecord: boolean;
}) => {
  return (
    <div className="space-y-4">
    <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">マイデータ</h2>
    
    {/* 統計情報を1つの枠にまとめる */}
    <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600 dark:text-gray-300">平均周期</span>
        <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{getAverageCycle()}日</span>
      </div>
      
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600 dark:text-gray-300">平均生理期間</span>
        <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{getAveragePeriodLength()}日</span>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600 dark:text-gray-300">次回生理予定</span>
        <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {records.periods.length > 0 ? 
            (() => {
              const lastPeriod = [...records.periods].sort((a, b) => 
                new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
              )[0];
              const nextDate = new Date(lastPeriod.startDate);
              nextDate.setDate(nextDate.getDate() + getAverageCycle());
              return `${nextDate.getMonth() + 1}/${nextDate.getDate()}`;
            })()
            : '---'
          }
        </span>
      </div>

      {useIntercourseRecord && records.intercourse.length > 0 && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 dark:text-gray-300">SEX記録</span>
          <button 
            onClick={() => setShowIntercourseList(true)}
            className="text-sm text-blue-600 hover:underline"
          >
            詳細を確認
          </button>
        </div>
      )}
    </div>

    {/* TikTokコミュニティカード */}
    <TikTokCard />
    
    {/* おすすめアイテムバナー */}
    <BannerAd />
    
    {/* 年齢別広告カード */}
    <AgeBasedAdCard />
  </div>
  );
};
    

const AgeGroupSettings = ({ records, setRecords }: {
  records: Records;
  setRecords: (records: Records) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border rounded-lg p-4">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">年齢層設定</h3>
        <span className="text-gray-600 dark:text-gray-300">{isExpanded ? '−' : '+'}</span>
      </button>
      
      {isExpanded && (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 mb-3">
            あなたに合った情報をお届けするために年齢層を設定できます
          </p>
          <div className="space-y-2">
            {['10代', '20代', '30代', '40代', '50代', '50代以上', '回答しない'].map((age) => (
              <label key={age} className="flex items-center gap-2 cursor-pointer">
                <div className="relative">
                  <input 
                    type="radio" 
                    name="ageGroupSetting" 
                    value={age}
                    checked={records.ageGroup === age}
                    onChange={(e) => {
                      const newRecords = {
                        ...records,
                        ageGroup: e.target.value
                      };
                      setRecords(newRecords);
                      localStorage.setItem('tukicale_age_group', e.target.value);
                      saveToDrive(newRecords);
                    }}
                    className="sr-only peer"
                  />
                  <i className={`${records.ageGroup === age ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle'} text-xl`} style={records.ageGroup === age ? {color: '#91AEBD'} : {color: '#9CA3AF'}}></i>
                </div>
                <span className="text-sm text-gray-900 dark:text-gray-100">{age}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const SettingsView = ({ 
  isGoogleAuthed, 
  handleLogout, 
  setShowBulkAddModal, 
  setShowRecordsList, 
  setShowDeleteConfirm, 
  setCurrentView,
  records,
  setRecords,
  syncSettings,
  setSyncSettings,
  getAverageCycle,
  getFertileDays,
  getPMSDays,
  getNextPeriodDays,
  useIntercourseRecord,
  setUseIntercourseRecord
}: {
  isGoogleAuthed: boolean;
  handleLogout: () => void;
  setShowBulkAddModal: (show: boolean) => void;
  setShowRecordsList: (show: boolean) => void;
  setShowDeleteConfirm: (show: boolean) => void;
  setCurrentView: (view: string) => void;
  records: Records;
  setRecords: (records: Records) => void;
  syncSettings: SyncSettings;
  setSyncSettings: (settings: SyncSettings) => void;
  getAverageCycle: () => number;
  getFertileDays: () => string[];
  getPMSDays: () => string[];
  getNextPeriodDays: () => string[];
  useIntercourseRecord: boolean;
  setUseIntercourseRecord: (value: boolean) => void;
}) => (
  <div className="space-y-4">
    <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">設定</h2>
    
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <i className="fa-brands fa-google-drive text-gray-600 dark:text-gray-300"></i>
        Googleカレンダー連携
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
        {isGoogleAuthed ? '連携済み' : '未連携'}
      </p>
      {isGoogleAuthed && (
        <div className="space-y-2">
<button 
          onClick={handleLogout}
          className="w-full text-gray-700 dark:text-gray-900 px-4 py-2 rounded"
          style={{backgroundColor: '#E3D0DA'}}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#CBA9BA'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#E3D0DA'}
        >
          ログアウト
        </button>
        </div>
      )}
    </div>

    <AgeGroupSettings records={records} setRecords={setRecords} />

    <div className="border rounded-lg p-4">
      <button 
        onClick={() => {
          const newValue = !useIntercourseRecord;
          setUseIntercourseRecord(newValue);
          localStorage.setItem('tukicale_use_intercourse_record', newValue.toString());
        }}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-start gap-2">
          <div className="relative pt-1">
            <i className={`${useIntercourseRecord ? 'fa-solid fa-square-check text-xl' : 'fa-regular fa-square text-gray-400 text-xl'}`} style={useIntercourseRecord ? {color: '#91AEBD'} : {}}></i>
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">性交渉記録を使用する</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              オフにすると、カレンダーやマイデータから性交渉関連の機能が非表示になります
            </p>
          </div>
        </div>
      </button>
    </div>

    <SyncSettings 
      records={records}
      syncSettings={syncSettings}
      setSyncSettings={setSyncSettings}
      getAverageCycle={getAverageCycle}
      getFertileDays={getFertileDays}
      getPMSDays={getPMSDays}
      getNextPeriodDays={getNextPeriodDays}
    />
    
    <HelpSection setCurrentView={setCurrentView} />

    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">データ一括登録</h3>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
        手帳やメモの記録を登録・編集・削除できます
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        ※1度に20件登録できます
      </p>
      <div className="space-y-2">
<button 
          onClick={() => setShowBulkAddModal(true)}
          className="w-full text-gray-700 dark:text-gray-900 px-4 py-2 rounded"
          style={{backgroundColor: '#C2D2DA'}}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#91AEBD'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#C2D2DA'}
        >
          過去の生理記録を登録
        </button>

        <button 
          onClick={() => setShowRecordsList(true)}
          className="w-full border border-gray-300 dark:border-gray-600 px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800"
        >
          登録済み記録を確認
        </button>
      </div>
    </div>

    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">データ管理</h3>
      <div className="space-y-2">
<button 
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full text-gray-700 dark:text-gray-900 px-4 py-2 rounded"
          style={{backgroundColor: '#E3D0DA'}}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#CBA9BA'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#E3D0DA'}
        >
          すべてのデータを削除
        </button>
      </div>
    </div>
  </div>
);

const SyncSettings = ({ 
  records, 
  syncSettings, 
  setSyncSettings, 
  getAverageCycle, 
  getFertileDays, 
  getPMSDays, 
  getNextPeriodDays 
}: {
  records: Records;
  syncSettings: SyncSettings;
  setSyncSettings: (settings: SyncSettings) => void;
  getAverageCycle: () => number;
  getFertileDays: () => string[];
  getPMSDays: () => string[];
  getNextPeriodDays: () => string[];
}) => {
  const [showIntercourseInfo, setShowIntercourseInfo] = useState(false);
  const [localSettings, setLocalSettings] = useState<SyncSettings>(syncSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalSettings(syncSettings);
  }, [syncSettings]);

  const handleChange = (key: keyof SyncSettings, value: boolean) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    localStorage.setItem('tukicale_sync_settings', JSON.stringify(localSettings));
    setSyncSettings(localSettings);
    
    await syncToCalendar(records, localSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
    
    setHasChanges(false);
    setIsSaving(false);
  };

return (
  <div className="border rounded-lg p-4">
    <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">同期設定</h3>
<div className="space-y-2 mb-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <div className="relative">
          <input 
            type="checkbox" 
            checked={localSettings.period}
            onChange={(e) => handleChange('period', e.target.checked)}
            className="sr-only peer"
          />
          <i className={`${localSettings.period ? 'fa-solid fa-square-check text-xl' : 'fa-regular fa-square text-gray-400 text-xl'}`} style={localSettings.period ? {color: '#91AEBD'} : {}}></i>
        </div>
        <span className="text-sm text-gray-900 dark:text-gray-100">生理期間を同期</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <div className="relative">
          <input 
            type="checkbox" 
            checked={localSettings.fertile}
            onChange={(e) => handleChange('fertile', e.target.checked)}
            className="sr-only peer"
          />
          <i className={`${localSettings.fertile ? 'fa-solid fa-square-check text-xl' : 'fa-regular fa-square text-gray-400 text-xl'}`} style={localSettings.fertile ? {color: '#91AEBD'} : {}}></i>
        </div>
        <span className="text-sm text-gray-900 dark:text-gray-100">妊娠可能日を同期</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <div className="relative">
          <input 
            type="checkbox" 
            checked={localSettings.pms}
            onChange={(e) => handleChange('pms', e.target.checked)}
            className="sr-only peer"
          />
          <i className={`${localSettings.pms ? 'fa-solid fa-square-check text-xl' : 'fa-regular fa-square text-gray-400 text-xl'}`} style={localSettings.pms ? {color: '#91AEBD'} : {}}></i>
        </div>
        <span className="text-sm text-gray-900 dark:text-gray-100">PMS予測を同期</span>
      </label>
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <div className="relative">
            <input 
              type="checkbox" 
              checked={localSettings.intercourse}
              onChange={(e) => handleChange('intercourse', e.target.checked)}
              className="sr-only peer"
            />
            <i className={`${localSettings.intercourse ? 'fa-solid fa-square-check text-xl' : 'fa-regular fa-square text-gray-400 text-xl'}`} style={localSettings.intercourse ? {color: '#91AEBD'} : {}}></i>
          </div>
          <span className="text-sm text-gray-900 dark:text-gray-100">SEXを同期</span>
          <button 
            type="button" 
            onClick={() => setShowIntercourseInfo(!showIntercourseInfo)} 
            className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 flex items-center justify-center text-xs text-gray-900 dark:text-gray-100"
          >
            <i className="fa-solid fa-circle-info text-blue-600"></i>
          </button>
        </label>
        {showIntercourseInfo && (
          <div className="mt-2 p-3 bg-blue-50 dark:bg-gray-800 rounded text-xs text-gray-700 dark:text-gray-300">
            <p className="font-semibold mb-1">カレンダーに表示される内容：</p>
            <p className="mb-2">「◯」などの記号のみ（カスタマイズ可能）</p>
            <p className="font-semibold mb-1">同期されない情報：</p>
            <ul className="list-disc ml-4">
              <li>パートナー名</li>
              <li>避妊具使用状況</li>
              <li>メモ</li>
            </ul>
            <p className="mt-2 text-gray-600 dark:text-gray-300">詳細情報はアプリ内にのみ保存されます。</p>
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <div className="relative">
          <input 
            type="checkbox" 
            checked={localSettings.health}
            onChange={(e) => handleChange('health', e.target.checked)}
            className="sr-only peer"
          />
          <i className={`${localSettings.health ? 'fa-solid fa-square-check text-xl' : 'fa-regular fa-square text-gray-400 text-xl'}`} style={localSettings.health ? {color: '#91AEBD'} : {}}></i>
        </div>
        <span className="text-sm text-gray-900 dark:text-gray-100">体調記録を同期</span>
      </label>
    </div>      
    {hasChanges && (
<button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full text-gray-700 dark:text-gray-900 px-4 py-2 rounded disabled:opacity-50 flex items-center justify-center gap-2 mt-3"
        style={{backgroundColor: '#C2D2DA'}}
        onMouseEnter={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#91AEBD')}
        onMouseLeave={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#C2D2DA')}
  >
        {isSaving ? (
      <>
            <div className="w-4 h-4 border-2 text-gray-700 dark:text-gray-900 border-t-transparent rounded-full animate-spin"></div>
            保存中...
          </>
        ) : '変更を保存してGoogleカレンダーに反映'}
      </button>
    )}
  </div>
);
};

const HelpSection = ({ setCurrentView }: {
  setCurrentView: (view: string) => void;
}) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <>
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">ヘルプ・よくある質問</h3>
        
        <div className="space-y-2">
          <div className="border-b pb-2">
            <button onClick={() => toggleSection('free')} className="w-full text-left flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded px-2">
              <span className="text-sm font-medium">TukiCaleは利用料無料ですか？</span>
              <span>{expandedSection === 'free' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'free' && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300">
                <p className="mb-2"><strong>はい、完全無料です！</strong></p>
                <ul className="list-disc ml-4 space-y-1 mb-3">
                  <li>アプリの全機能を無料でご利用いただけます</li>
                  <li>登録料や月額料金は一切かかりません</li>
                  <li>Googleアカウントがあればすぐに始められます</li>
                </ul>
                <p className="mb-2"><strong>無料で提供できる理由：</strong></p>
                <p className="mb-2">アプリ内に表示される広告収益により、無料でのサービス提供を実現しています。広告収益はアプリの運営・改善に使用されます。</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">※将来的に有料プランを追加する可能性がありますが、基本機能は引き続き無料でご利用いただけます。</p>
              </div>
            )}
          </div>

          <div className="border-b pb-2">
            <button onClick={() => toggleSection('data')} className="w-full text-left flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded px-2">
              <span className="text-sm font-medium">データはどこに保存されますか？</span>
              <span>{expandedSection === 'data' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'data' && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300">
                <p className="mb-2"><strong>Googleドライブに保存：</strong></p>
                <ul className="list-disc ml-4 space-y-1 mb-3">
                  <li>生理記録・SEX記録などの詳細データ</li>
                  <li>あなたのGoogleアカウントにのみ保存</li>
                  <li>端末間で自動同期</li>
                </ul>
                <p className="mb-2"><strong>Googleカレンダーに同期：</strong></p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>生理期間</li>
                  <li>妊娠可能日</li>
                  <li>PMS予測</li>
                  <li>SEX</li>
                </ul>
              </div>
            )}
          </div>

          <div className="border-b pb-2">
            <button onClick={() => toggleSection('privacy')} className="w-full text-left flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded px-2">
              <span className="text-sm font-medium">プライバシーは保護されますか？</span>
              <span>{expandedSection === 'privacy' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'privacy' && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300">
                <p className="mb-2 font-semibold">完全にプライベートです：</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>データはあなたのGoogleアカウントにのみ保存</li>
                  <li>私たち（開発者・運営者）はデータを見ることができません</li>
                  <li>第三者に共有されません</li>
                  <li>性交日の詳細情報はGoogleカレンダーにはマーク以外表示されません。入力があれば、マイデータのみで後から確認できます</li>
                </ul>
              </div>
            )}
          </div>

          <div className="border-b pb-2">
            <button onClick={() => toggleSection('prediction')} className="w-full text-left flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded px-2">
              <span className="text-sm font-medium">予測はどう計算されていますか？</span>
              <span>{expandedSection === 'prediction' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'prediction' && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300">
                <p className="mb-2"><strong>妊娠可能日：</strong></p>
                <p className="mb-2">過去の生理周期から平均を計算し、排卵日（生理開始の約14日前）の前後3日間を表示</p>
                <p className="mb-2"><strong>PMS予測：</strong></p>
                <p className="mb-2">次回生理予定日の3〜10日前を表示</p>
                <p className="mb-2"><strong>次回生理予定：</strong></p>
                <p>過去の平均周期から計算（不規則な場合は目安です）</p>
              </div>
            )}
          </div>

          <div className="border-b pb-2">
            <button onClick={() => toggleSection('irregular')} className="w-full text-left flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded px-2">
              <span className="text-sm font-medium">不規則な周期でも使えますか？</span>
              <span>{expandedSection === 'irregular' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'irregular' && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300">
                <p className="mb-2"><strong>はい、使えます！</strong></p>
                <p className="mb-2">このアプリは、生理不順の運営者自身が機種変更時にデータ移行できず、人気アプリでは「周期が不規則すぎる」と数年分のデータを保存できなかった経験から生まれました。</p>
                <p className="mb-2">同じ悩みを持つ方でも安心して使えるよう、不規則な周期にも対応する設計になっています。</p>                <p>予測は過去のデータの平均から計算されるため、記録が2回以上あれば表示されます。データが増えると平均値がより安定します。</p>
              </div>
            )}
          </div>

          <div className="border-b pb-2">
            <button onClick={() => toggleSection('multidevice')} className="w-full text-left flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded px-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <i className="fa-solid fa-circle-info text-blue-600"></i>
                複数端末で使用する場合の注意
              </span>
              <span>{expandedSection === 'multidevice' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'multidevice' && (
              <div className="mt-2 p-3 bg-blue-50 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300 border-2 border-blue-200 dark:border-blue-900">
                <p className="mb-3 font-semibold text-blue-700 dark:text-blue-400">PCとスマホなど、複数端末でご使用の方へ</p>
                <ul className="list-disc ml-4 space-y-1 mb-3">
                  <li>他の端末で編集した場合は、画面を更新（リロード）してください</li>
                  <li>同時編集すると、後から保存した方が優先されます</li>
                  <li>可能ならば編集中は他の端末での操作をお控えください</li>
                </ul>
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 p-2 rounded">
                  <i className="fa-regular fa-lightbulb text-yellow-500 mr-1"></i>
                  ヘッダー右上の<i className="fa-solid fa-rotate-right mx-1"></i>ボタンで最新データに更新できます
                </p>
              </div>
            )}
          </div>

<div className="border-b pb-2">
            <button onClick={() => toggleSection('edit')} className="w-full text-left flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded px-2">
              <span className="text-sm font-medium">記録の修正・削除方法</span>
              <span>{expandedSection === 'edit' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'edit' && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300">
                <p className="mb-2"><strong>登録済み記録の編集：</strong></p>
                <p className="mb-2">
                  <button 
                    onClick={() => {
                      setCurrentView('settings');
                      setExpandedSection(null);
                    }}
                    className="inline-flex items-center px-1 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    title="設定を開く"
                  >
                    <i className="fa-solid fa-gear text-gray-600 dark:text-gray-300"></i>
                  </button>
                  設定から「登録済み記録を確認」を選択
                </p>
                <ul className="list-disc ml-4 space-y-1 mb-3">
                  <li><i className="fa-solid fa-pen-to-square text-gray-600 dark:text-gray-300"></i> 記録を修正</li>
                  <li><i className="fa-solid fa-trash text-gray-600 dark:text-gray-300"></i> 記録を削除</li>
                </ul>
                <p className="text-xs text-gray-600 dark:text-gray-300">※削除した記録は復元できません</p>
              </div>
            )}
          </div>

          <div className="border-b pb-2">
            <button onClick={() => toggleSection('sexrecord')} className="w-full text-left flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded px-2">
              <span className="text-sm font-medium">SEX記録はどこで確認できますか？</span>
              <span>{expandedSection === 'sexrecord' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'sexrecord' && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300">
                <p className="mb-2"><strong>マイデータ画面で確認：</strong></p>
                <ol className="list-decimal ml-4 space-y-1 mb-3">
                  <li>
                    ヘッダーの「
                    <button 
              onClick={() => {
                setCurrentView('stats');
                setExpandedSection(null);
              }}
              className="inline-flex items-center mx-1 px-1 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              title="マイデータを開く"
>
              <i className="fa-solid fa-user-circle text-gray-600 dark:text-gray-300 text-xs"></i>
            </button>
                 マイデータ」を選択
               </li>
               <li>SEX記録が1件以上ある場合、「SEX記録」カードが表示されます</li>
               <li>「詳細を確認」ボタンをタップすると、記録の詳細（日付・避妊具使用状況・パートナー・メモ）が確認できます</li>
             </ol>
             <p className="text-xs text-gray-600 dark:text-gray-300">※記録が0件の場合、カードは表示されません</p>
           </div>
          )}
          </div>

          <div className="border-b pb-2">
            <button onClick={() => toggleSection('sexrecordOnOff')} className="w-full text-left flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded px-2">
              <span className="text-sm font-medium">性交渉記録機能のON/OFF設定</span>
              <span>{expandedSection === 'sexrecordOnOff' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'sexrecordOnOff' && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300">
                <p className="mb-2"><strong>性交渉記録機能をオフにすることができます：</strong></p>
                <ol className="list-decimal ml-4 space-y-1 mb-3">
                  <li>
                    <button 
                      onClick={() => {
                        setCurrentView('settings');
                        setExpandedSection(null);
                      }}
                      className="inline-flex items-center px-1 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      title="設定を開く"
                    >
                      <i className="fa-solid fa-gear text-gray-600 dark:text-gray-300"></i>
                    </button>
                    設定から「性交渉記録を使用する」のチェックボックスを確認
                  </li>
                  <li>チェックを外すと、カレンダーやマイデータから性交渉関連の機能が非表示になります</li>
                  <li>オフにしても既存の記録は削除されず、再度オンにすれば表示されます</li>
                </ol>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">※プライバシーを重視する方や、共有端末で使用する方におすすめの設定です</p>
              </div>
            )}
          </div>
          <div className="border-b pb-2">
            <button onClick={() => toggleSection('sync')} className="w-full text-left flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded px-2">
              <span className="text-sm font-medium">カレンダーの同期について</span>
              <span>{expandedSection === 'sync' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'sync' && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300">
                <p className="mb-2"><strong>データ入力中にカレンダーにリアルタイムで同期されます。</strong></p>
                <ul className="list-disc ml-4 space-y-1 mb-3">
                  <li>生理記録を追加・編集・削除すると、即座にGoogleドライブに保存</li>
                  <li>同期設定でONにしている項目は、Googleカレンダーにも即座に反映</li>
                  <li>一括登録の場合も、登録ボタンを押した瞬間に全て同期</li>
                </ul>
                <p className="text-gray-600 dark:text-gray-300 text-xs">※データの流れは <strong>TukiCale → Google</strong> の一方向です</p>
              </div>
            )}
          </div>

<div className="border-b pb-2">
            <button onClick={() => toggleSection('calendarWarning')} className="w-full text-left flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded px-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation text-yellow-500"></i>
                Googleカレンダーで直接編集・削除しないでください
              </span>
              <span>{expandedSection === 'calendarWarning' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'calendarWarning' && (
              <div className="mt-2 p-3 bg-white dark:bg-gray-900 rounded text-sm text-gray-700 dark:text-gray-300 border-2 border-red-200 dark:border-red-900">
                <p className="mb-3 font-semibold text-red-700 dark:text-red-400">Googleカレンダー側で変更しないでください</p>
                <p className="mb-2"><strong>理由：</strong></p>
                <ul className="list-disc ml-4 space-y-1 mb-3">
                  <li>Googleカレンダー側で変更しても、TukiCaleには反映されません</li>
                  <li>TukiCaleで再同期すると、カレンダーの手動変更は上書きされます</li>
                  <li>データの整合性が保てなくなる可能性があります</li>
                </ul>
                <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1 flex items-center gap-1">
                  <i className="fa-regular fa-lightbulb text-yellow-500"></i>
                  正しい使い方：
                </p>
                <p>すべての編集・削除は<strong>TukiCaleアプリ内</strong>で行ってください。</p>
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">Googleカレンダーは「表示用」として使用します。</p>
              </div>
            )}
          </div>
          <div className="border rounded-lg mt-4">
            <button onClick={() => toggleSection('contact')} className="w-full text-left py-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded-t-lg border-b flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                フィードバック・機能リクエスト
              </span>
              <span>{expandedSection === 'contact' ? '−' : '+'}</span>
            </button>            {expandedSection === 'contact' && (
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <p className="mb-2">バグ報告や機能リクエストをお待ちしています！</p>
                  <p className="mb-2"><i className="fa-brands fa-tiktok text-gray-900 dark:text-gray-100"></i><strong>TikTokでご連絡ください：</strong></p>
                  <p className="mb-2">
                    <a 
                      href="https://www.tiktok.com/@tukicale_app" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      <i className="fa-brands fa-tiktok text-gray-900 dark:text-gray-100"></i>@tukicale_app
                    </a>
                    の固定動画のコメント欄にお願いします
                  </p>
                  <ul className="list-disc ml-4 space-y-1 text-xs text-gray-600 dark:text-gray-300 mt-2">
                    <li>バグを見つけたら具体的に教えてください</li>
                    <li>「こんな機能が欲しい！」も大歓迎</li>
                    <li>使いにくい部分があれば教えてください</li>
                  </ul>
                  <p className="mt-2 text-gray-600 dark:text-gray-300 text-xs">※皆さんのフィードバックで一緒に良いアプリを作っていきましょう！</p>
                </div>
              </div>
            )}
            <button onClick={() => setShowTerms(true)} className="w-full text-left py-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 border-b">
              <span className="text-sm font-medium flex items-center gap-2">
                <i className="fa-solid fa-file text-gray-600 dark:text-gray-300"></i>
                利用規約
              </span>
            </button>
            <button onClick={() => setShowPrivacy(true)} className="w-full text-left py-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded-b-lg">
              <span className="text-sm font-medium flex items-center gap-2">
                <i className="fa-solid fa-lock text-gray-600 dark:text-gray-300"></i>
                プライバシーポリシー
              </span>
            </button>
          </div>
        </div>
      </div>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </>
  );
};

const TermsModal = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 10003}}>
    <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-2xl flex flex-col" style={{maxHeight: '90vh'}}>
      <div className="p-6 border-b">
        <h3 className="text-lg font-semibold">利用規約</h3>
      </div>
      <div className="flex-1 px-6 py-4 overflow-y-auto text-sm">
        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">第1条（適用）</h4>
        <p className="mb-4">本規約は、TukiCale運営チーム（以下「当チーム」）が提供する生理管理アプリ「TukiCale」（以下「本サービス」）の利用条件を定めるものです。ユーザーは本規約に同意した上で本サービスを利用するものとします。</p>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">第2条（サービス内容）</h4>
        <p className="mb-4">本サービスは、生理周期の記録・管理を支援するためのアプリケーションです。予測機能はあくまで参考情報であり、医療行為ではありません。</p>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">第3条（利用資格）</h4>
        <p className="mb-4">本サービスは、Googleアカウントを保有するすべての方がご利用いただけます。未成年者が利用する場合は、保護者の方と相談の上でご利用ください。</p>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">第4条（禁止事項）</h4>
        <ul className="list-disc ml-6 mb-4 space-y-1">
          <li>法令または公序良俗に違反する行為</li>
          <li>犯罪行為に関連する行為</li>
          <li>本サービスの運営を妨害する行為</li>
          <li>他のユーザーに迷惑をかける行為</li>
          <li>不正アクセスまたはこれを試みる行為</li>
        </ul>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">第5条（免責事項）</h4>
        <ul className="list-disc ml-6 mb-4 space-y-1">
          <li>本サービスの予測機能は参考情報であり、正確性を保証するものではありません</li>
          <li>本サービスは医療行為ではなく、診断・治療の代替とはなりません</li>
          <li>本サービスの利用により生じた損害について、当チームは一切の責任を負いません</li>
          <li>システム障害等により一時的にサービスが利用できない場合があります</li>
        </ul>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">第6条（サービスの変更・終了）</h4>
        <p className="mb-4">当チームは、ユーザーへの事前通知なく、本サービスの内容を変更または終了することができるものとします。</p>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">第7条（お問い合わせ）</h4>
        <p className="mb-4">
          本サービスに関するお問い合わせは、TikTok（<a 
            href="https://www.tiktok.com/@tukicale_app" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            <i className="fa-brands fa-tiktok text-gray-900 dark:text-gray-100"></i>@tukicale_app
          </a>）のコメント欄よりお願いいたします。
        </p>

        <p className="text-gray-600 dark:text-gray-300 mt-6">最終更新日：2025年10月6日</p>
      </div>
      <div className="p-6 border-t">
        <button onClick={onClose} className="w-full border px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800">閉じる</button>
      </div>
    </div>
  </div>
);

const PrivacyModal = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 10003}}>
    <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-2xl flex flex-col" style={{maxHeight: '90vh'}}>
      <div className="p-6 border-b">
        <h3 className="text-lg font-semibold">プライバシーポリシー</h3>
      </div>
      <div className="flex-1 px-6 py-4 overflow-y-auto text-sm">
        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">1. 収集する情報</h4>
        <p className="mb-2">本サービスでは、以下の情報を収集します：</p>
        <ul className="list-disc ml-6 mb-4 space-y-1">
          <li>生理開始日・終了日</li>
          <li>性行為の記録（避妊具使用状況、パートナー情報、メモ）</li>
          <li>Googleアカウント情報（メールアドレス、プロフィール情報）</li>
        </ul>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">2. 情報の利用目的</h4>
        <p className="mb-2">収集した情報は、以下の目的で利用します：</p>
        <ul className="list-disc ml-6 mb-4 space-y-1">
          <li>生理周期の記録・管理</li>
          <li>妊娠可能日・PMS予測の提供</li>
          <li>Googleカレンダーへの同期</li>
          <li>サービスの改善</li>
        </ul>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">3. 情報の保存場所</h4>
        <p className="mb-4">すべてのデータは、ユーザーのGoogleドライブに保存されます。当チームのサーバーには保存されません。</p>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">4. 第三者への提供</h4>
        <p className="mb-4">当チームは、ユーザーの個人情報を第三者に提供することはありません。ただし、以下の場合を除きます：</p>
        <ul className="list-disc ml-6 mb-4 space-y-1">
          <li>ユーザーの同意がある場合</li>
          <li>法令に基づく場合</li>
        </ul>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">5. Google APIの利用</h4>
        <p className="mb-4">本サービスは、Google Drive API及びGoogle Calendar APIを利用しています。これらのAPIを通じて取得した情報は、本サービスの提供目的以外には使用しません。</p>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">6. データの削除</h4>
        <p className="mb-4">ユーザーは、設定画面から「すべてのデータを削除」を実行することで、アプリ内のすべてのデータを削除できます。Googleドライブ上のデータは、Google Driveから直接削除してください。</p>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">7. セキュリティ</h4>
        <p className="mb-4">当チームは、個人情報の漏洩、滅失または毀損の防止に努めます。ただし、完全な安全性を保証するものではありません。</p>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">8. 未成年者の利用</h4>
        <p className="mb-4">未成年者が本サービスを利用する場合は、保護者の方と相談の上でご利用ください。本サービスは同意確認の機能を持っておりませんので、保護者の方の責任においてご判断ください。</p>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">9. お問い合わせ</h4>
        <p className="mb-2">本ポリシーに関するお問い合わせは、以下までお願いいたします：</p>
        <p className="mb-4">
          TikTok: <a 
            href="https://www.tiktok.com/@tukicale_app" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            @tukicale_app
          </a>のコメント欄
        </p>

        <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">10. プライバシーポリシーの変更</h4>
        <p className="mb-4">当チームは、本ポリシーを予告なく変更することがあります。変更後のポリシーは、本アプリ上に掲載した時点で効力を生じるものとします。</p>

        <p className="text-gray-600 dark:text-gray-300 mt-6">最終更新日：2025年10月6日</p>
      </div>
      <div className="p-6 border-t">
        <button onClick={onClose} className="w-full border px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800">閉じる</button>
      </div>
    </div>
  </div>
);

const LoginScreen = ({ onLogin, isLoading }: { onLogin: () => void; isLoading: boolean }) => {
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900 p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6">
        <div className="flex justify-center mb-4">
          <div className="flex items-center gap-2">
            <i className="fa-regular fa-moon text-3xl text-gray-400"></i>
            <h1 className="text-3xl text-gray-700 dark:text-gray-300">TukiCale</h1>
          </div>
        </div>

        <div className="text-center mb-6">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">
            生理記録を簡単管理
          </h2>
          <p className="text-xs text-gray-600 dark:text-gray-300 mb-1">
            Googleカレンダーに一括登録
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            データはあなたのGoogleドライブに保存
          </p>
        </div>

        <div className="space-y-1.5 mb-6">
          {[
            { title: '不規則な周期もOK', desc: 'どんな周期でも記録できます' },
            { title: '完全プライベート', desc: 'データは第三者に共有されません' },
            { title: '自動予測', desc: '妊娠可能日・PMS予測' },
            { title: '機種変更が簡単', desc: '新しいスマホでログインするだけ' },
            { title: 'マルチデバイス対応', desc: '複数の端末で同時に使える' }
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2">
<div className="w-5 h-5 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className="fa-solid fa-check text-blue-400"></i>
              </div>              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{item.title}</p>
                <p className="text-xs text-gray-600 dark:text-gray-300">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onLogin}
          disabled={isLoading}
          className="w-full bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors flex items-center justify-center gap-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 rounded-full animate-spin"></div>
              <span>ログイン中...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Googleでログイン</span>
            </>
          )}
        </button>

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
          ログインすることで、
          <button 
            onClick={(e) => {
              e.preventDefault();
              setShowTerms(true);
            }} 
            className="underline mx-1 hover:text-gray-700 dark:text-gray-300 cursor-pointer"
          >
            利用規約
          </button>
          と
          <button 
            onClick={(e) => {
              e.preventDefault();
              setShowPrivacy(true);
            }} 
            className="underline mx-1 hover:text-gray-700 dark:text-gray-300 cursor-pointer"
          >
            プライバシーポリシー
          </button>
          に同意したものとみなされます
        </p>
      </div>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  );
};

const DatePicker = ({ selectedDate, onSelect, onClose }: {
  selectedDate: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}) => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (selectedDate) {
      const date = new Date(selectedDate);
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }
    return today;
  });
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    return { daysInMonth, startingDayOfWeek };
  };

  const formatDateString = (year: number, month: number, day: number): string => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  };

  const isSelected = (day: number): boolean => {
    if (!selectedDate) return false;
    const checkDate = formatDateString(viewDate.getFullYear(), viewDate.getMonth(), day);
    return checkDate === selectedDate;
  };

  const renderCalendar = () => {
    const { daysInMonth, startingDayOfWeek } = getDaysInMonth(viewDate);
    const days = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="h-10"></div>);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDateString(viewDate.getFullYear(), viewDate.getMonth(), day);
      days.push(
        <button
          key={day}
          type="button"
          onClick={() => onSelect(dateStr)}
          className={`h-10 rounded flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 ${isSelected(day) ? 'bg-gray-200 dark:bg-gray-600 font-semibold' : ''}`}
        >
          {day}
        </button>
      );
    }
    
    return days;
  };

return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 w-80 max-w-full">      
<div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-900 dark:text-gray-100">←</button>
        <div className="flex items-center gap-2 relative">
          {/* 年選択 */}
          <div className="relative">
            <button 
              type="button"
              onClick={() => {
                setShowYearPicker(!showYearPicker);
                setShowMonthPicker(false);
              }}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-base font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-w-[80px]"
            >
              {viewDate.getFullYear()}年
            </button>
            {showYearPicker && (
              <div className="absolute top-full mt-1 left-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg z-50 max-h-60 overflow-y-auto min-w-[100px]">
                {Array.from({length: 21}, (_, i) => currentYear - 10 + i).map(year => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => {
                      setViewDate(new Date(year, viewDate.getMonth(), 1));
                      setShowYearPicker(false);
                    }}
                    className={`block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 whitespace-nowrap ${viewDate.getFullYear() === year ? 'bg-gray-200 dark:bg-gray-600 font-bold' : ''}`}
                  >
                    {year}年
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* 月選択 */}
          <div className="relative">
            <button 
              type="button"
              onClick={() => {
                setShowMonthPicker(!showMonthPicker);
                setShowYearPicker(false);
              }}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-base font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-w-[60px]"
            >
              {viewDate.getMonth() + 1}月
            </button>
            {showMonthPicker && (
              <div className="absolute top-full mt-1 left-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg z-50 max-h-60 overflow-y-auto min-w-[80px]">
                {Array.from({length: 12}, (_, i) => i).map(month => (
                  <button
                    key={month}
                    type="button"
                    onClick={() => {
                      setViewDate(new Date(viewDate.getFullYear(), month, 1));
                      setShowMonthPicker(false);
                    }}
                    className={`block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 whitespace-nowrap ${viewDate.getMonth() === month ? 'bg-gray-200 dark:bg-gray-600 font-bold' : ''}`}
                  >
                    {month + 1}月
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-900 dark:text-gray-100">→</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['日', '月', '火', '水', '木', '金', '土'].map(day => (
          <div key={day} className="text-center text-sm text-gray-500 dark:text-gray-400 h-8 flex items-center justify-center">{day}</div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-1">{renderCalendar()}</div>
      
      <button type="button" onClick={onClose} className="w-full mt-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">閉じる</button>
      </div>
    </div>
  );
};

const PeriodForm = ({ selectedDate, onSubmit, onCancel, getAveragePeriodLength }: {
  selectedDate: Date | null;
  onSubmit: (startDate: string, endDate: string) => Promise<void>;
  onCancel: () => void;
  getAveragePeriodLength: () => number;
}) => {
  const [isSaving, setIsSaving] = useState(false);
    const formatLocalDate = (date: Date | null): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

const [startDate, setStartDate] = useState(formatLocalDate(selectedDate));
  const [endDate, setEndDate] = useState(() => {
    if (!selectedDate) return '';
    const avgLength = getAveragePeriodLength();
    const endDateObj = new Date(selectedDate);
    endDateObj.setDate(endDateObj.getDate() + avgLength - 1);
    return formatLocalDate(endDateObj);
  });

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const formatBulkDisplayDate = (dateStr: string): string => {
    if (!dateStr) return '日付を選択';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">開始日</label>
        <button type="button" onClick={() => setShowStartPicker(!showStartPicker)} className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-gray-50 dark:bg-gray-800 text-left">
          {formatBulkDisplayDate(startDate)}
        </button>
        {showStartPicker && (
          <div className="mt-2"><DatePicker selectedDate={startDate} onSelect={(date) => { setStartDate(date); setShowStartPicker(false); }} onClose={() => setShowStartPicker(false)} /></div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">終了日</label>
        <button type="button" onClick={() => setShowEndPicker(!showEndPicker)} className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-gray-50 dark:bg-gray-800 text-left">
          {formatBulkDisplayDate(endDate)}
        </button>
        {showEndPicker && (
          <div className="mt-2"><DatePicker selectedDate={endDate} onSelect={(date) => { setEndDate(date); setShowEndPicker(false); }} onClose={() => setShowEndPicker(false)} /></div>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={isSaving} className="flex-1 border px-4 py-2 rounded disabled:opacity-50">キャンセル</button>
        <button 
          type="button" 
          onClick={async (e) => { 
            e.preventDefault(); 
            setIsSaving(true);
            await onSubmit(startDate, endDate);
            setIsSaving(false);
          }} 
          disabled={isSaving}
          className="flex-1 text-gray-700 dark:text-gray-900 px-4 py-2 rounded disabled:opacity-50 flex items-center justify-center gap-2" 
          style={{backgroundColor: '#E3D0DA'}} 
          onMouseEnter={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#CBA9BA')} 
          onMouseLeave={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#E3D0DA')}
        >
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-700 dark:border-gray-900 border-t-transparent rounded-full animate-spin"></div>
              保存中...
            </>
          ) : '保存'}
        </button>
      </div>
    </div>
  );
};

const EditPeriodForm = ({ period, onSubmit, onCancel }: {
  period: Period;
  onSubmit: (startDate: string, endDate: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [startDate, setStartDate] = useState(period.startDate);
  const [endDate, setEndDate] = useState(period.endDate);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const formatBulkDisplayDate = (dateStr: string): string => {
    if (!dateStr) return '日付を選択';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">開始日</label>
        <button type="button" onClick={() => setShowStartPicker(!showStartPicker)} className="w-full border rounded px-2 py-1 text-sm text-left bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800">
          {formatBulkDisplayDate(startDate)}
        </button>
        {showStartPicker && (
          <div className="mt-2"><DatePicker selectedDate={startDate} onSelect={(date) => { setStartDate(date); setShowStartPicker(false); }} onClose={() => setShowStartPicker(false)} /></div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">終了日</label>
        <button type="button" onClick={() => setShowEndPicker(!showEndPicker)} className="w-full border rounded px-2 py-1 text-sm text-left bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800">
          {formatBulkDisplayDate(endDate)}
        </button>
        {showEndPicker && (
          <div className="mt-2"><DatePicker selectedDate={endDate} onSelect={(date) => { setEndDate(date); setShowEndPicker(false); }} onClose={() => setShowEndPicker(false)} /></div>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={isSaving} className="flex-1 border px-4 py-2 rounded disabled:opacity-50">キャンセル</button>
        <button 
          type="button" 
          onClick={async () => {
            setIsSaving(true);
            await onSubmit(startDate, endDate);
            setIsSaving(false);
          }} 
          disabled={isSaving}
          className="flex-1 px-4 py-2 rounded text-gray-700 dark:text-gray-900 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{backgroundColor: '#C2D2DA'}}
          onMouseEnter={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#91AEBD')}
          onMouseLeave={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#C2D2DA')}
        >
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-700 dark:border-gray-900 border-t-transparent rounded-full animate-spin"></div>
              更新中...
            </>
          ) : '更新'}
        </button>
      </div>
    </div>
  );
};

const IntercourseForm = ({ selectedDate, onSubmit, onCancel }: {
  selectedDate: Date | null;
  onSubmit: (date: string, contraception: string, partner: string, memo: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const formatLocalDate = (date: Date | null): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [date, setDate] = useState(formatLocalDate(selectedDate));
  const [contraception, setContraception] = useState('不明');
  const [partner, setPartner] = useState('');
  const [memo, setMemo] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const formatBulkDisplayDate = (dateStr: string): string => {
    if (!dateStr) return '日付を選択';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">日付</label>
        <button type="button" onClick={() => setShowDatePicker(!showDatePicker)} className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-gray-50 dark:bg-gray-800 text-left">
          {formatBulkDisplayDate(date)}
        </button>
        {showDatePicker && (
          <div className="mt-2"><DatePicker selectedDate={date} onSelect={(newDate) => { setDate(newDate); setShowDatePicker(false); }} onClose={() => setShowDatePicker(false)} /></div>
        )}
      </div>
<div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">避妊具使用</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" 
              name="contraception" 
              value="使用" 
              checked={contraception === '使用'}
              onChange={(e) => setContraception(e.target.value)}
              className="sr-only"
            />
            <i className={`${contraception === '使用' ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle'} text-xl`} style={contraception === '使用' ? {color: '#737373'} : {color: '#9CA3AF'}}></i>
            <span className="text-sm flex items-center gap-2">
              <i className="fa-solid fa-check text-green-500"></i>
              使用
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" 
              name="contraception" 
              value="不使用" 
              checked={contraception === '不使用'}
              onChange={(e) => setContraception(e.target.value)}
              className="sr-only"
            />
            <i className={`${contraception === '不使用' ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle'} text-xl`} style={contraception === '不使用' ? {color: '#737373'} : {color: '#9CA3AF'}}></i>
            <span className="text-sm flex items-center gap-2">
              <i className="fa-solid fa-xmark text-red-500"></i>
              不使用
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" 
              name="contraception" 
              value="不明" 
              checked={contraception === '不明'}
              onChange={(e) => setContraception(e.target.value)}
              className="sr-only"
            />
            <i className={`${contraception === '不明' ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle'} text-xl`} style={contraception === '不明' ? {color: '#737373'} : {color: '#9CA3AF'}}></i>
            <span className="text-sm flex items-center gap-2">
              <i className="fa-solid fa-question text-gray-500"></i>
              不明
            </span>
          </label>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">パートナー（任意）</label>
        <input type="text" value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="イニシャル、ニックネームなど" className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-gray-50 dark:bg-gray-800" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">メモ（任意）</label>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="体調, その他" className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-gray-50 dark:bg-gray-800" rows={2} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={isSaving} className="flex-1 border px-4 py-2 rounded disabled:opacity-50">キャンセル</button>
        <button 
          type="button" 
          onClick={async (e) => { 
            e.preventDefault(); 
            setIsSaving(true);
            await onSubmit(date, contraception, partner, memo);
            setIsSaving(false);
          }} 
          disabled={isSaving}
          className="flex-1 bg-gray-400 dark:bg-gray-500 text-gray-700 dark:text-gray-900 px-4 py-2 rounded hover:bg-gray-500 dark:hover:bg-gray-600 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-700 dark:border-gray-900 border-t-transparent rounded-full animate-spin"></div>
              保存中...
            </>
          ) : '保存'}
        </button>
      </div>
    </div>
  );
};

const HealthForm = ({ selectedDate, onSubmit, onCancel }: {
  selectedDate: Date | null;
  onSubmit: (date: string, type: string, memo: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const formatLocalDate = (date: Date | null): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [date, setDate] = useState(formatLocalDate(selectedDate));
  const [healthType, setHealthType] = useState('不正出血');
  const [memo, setMemo] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const formatBulkDisplayDate = (dateStr: string): string => {
    if (!dateStr) return '日付を選択';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">日付</label>
        <button type="button" onClick={() => setShowDatePicker(!showDatePicker)} className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-gray-50 dark:bg-gray-800 text-left">
          {formatBulkDisplayDate(date)}
        </button>
        {showDatePicker && (
          <div className="mt-2"><DatePicker selectedDate={date} onSelect={(newDate) => { setDate(newDate); setShowDatePicker(false); }} onClose={() => setShowDatePicker(false)} /></div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">体調の種類</label>
        <div className="space-y-2">
          {['不正出血', '頭痛', '腹痛', '吐き気', 'その他'].map((type) => (
            <label key={type} className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" 
                name="healthType" 
                value={type}
                checked={healthType === type}
                onChange={(e) => setHealthType(e.target.value)}
                className="sr-only"
              />
              <i className={`${healthType === type ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle'} text-xl`} style={healthType === type ? {color: '#FDBA74'} : {color: '#9CA3AF'}}></i>
              <span className="text-sm">{type}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">メモ（任意）</label>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="症状の詳細など" className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-gray-50 dark:bg-gray-800" rows={3} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={isSaving} className="flex-1 border px-4 py-2 rounded disabled:opacity-50">キャンセル</button>
        <button 
          type="button" 
          onClick={async (e) => { 
            e.preventDefault(); 
            setIsSaving(true);
            await onSubmit(date, healthType, memo);
            setIsSaving(false);
          }} 
          disabled={isSaving}
          className="flex-1 bg-orange-300 text-gray-700 dark:text-gray-900 px-4 py-2 rounded hover:bg-orange-400 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-700 dark:border-gray-900 border-t-transparent rounded-full animate-spin"></div>
              保存中...
            </>
          ) : '保存'}
        </button>
      </div>
    </div>
  );
};

const AddModal = ({ selectedDate, modalType, setModalType, addPeriodRecord, addIntercourseRecord, addHealthRecord, setShowAddModal, currentDate, getAveragePeriodLength, useIntercourseRecord }: {
  selectedDate: Date | null;
  modalType: string;
  setModalType: (type: string) => void;
  addPeriodRecord: (startDate: string, endDate: string) => Promise<void>;
  addIntercourseRecord: (date: string, contraception: string, partner: string, memo: string) => Promise<void>;
  addHealthRecord: (date: string, type: string, memo: string) => Promise<void>;
  setShowAddModal: (show: boolean) => void;
  currentDate: Date;
  getAveragePeriodLength: () => number;
  useIntercourseRecord: boolean;
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full my-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
        {selectedDate && `${currentDate.getFullYear()}/${currentDate.getMonth() + 1}/${selectedDate.getDate()}`} の記録
      </h3>
      
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setModalType('period')}
          className={`flex-1 py-2 rounded text-sm ${modalType === 'period' ? 'text-gray-700 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
          style={modalType === 'period' ? {backgroundColor: '#E3D0DA'} : {}}
        >
          生理
        </button>
        <button
          onClick={() => setModalType('health')}
          className={`flex-1 py-2 rounded text-sm ${modalType === 'health' ? 'bg-orange-300 text-gray-700 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
        >
          体調
        </button>
        {useIntercourseRecord && (
          <button
            onClick={() => setModalType('intercourse')}
            className={`flex-1 py-2 rounded text-sm ${modalType === 'intercourse' ? 'bg-gray-400 text-gray-700 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
          >
            SEX
          </button>
        )}
      </div>

      {modalType === 'period' ? (
        <PeriodForm 
          selectedDate={selectedDate}
          onSubmit={addPeriodRecord}
          onCancel={() => setShowAddModal(false)}
          getAveragePeriodLength={getAveragePeriodLength}
        />
      ) : modalType === 'health' ? (
        <HealthForm
          selectedDate={selectedDate}
          onSubmit={addHealthRecord}
          onCancel={() => setShowAddModal(false)}
        />
      ) : (
        <IntercourseForm
          selectedDate={selectedDate}
          onSubmit={addIntercourseRecord}
          onCancel={() => setShowAddModal(false)}
        />
      )}
    </div>
  </div>
);

const DeleteConfirmModal = ({ deleteCalendar, setDeleteCalendar, handleDeleteData, setShowDeleteConfirm }: {
  deleteCalendar: boolean;
  setDeleteCalendar: (value: boolean) => void;
  handleDeleteData: () => void;
  setShowDeleteConfirm: (show: boolean) => void;
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 text-red-600">
        データを削除しますか？
      </h3>
      
      <div className="mb-6 space-y-4">
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input 
              type="checkbox" 
              defaultChecked
              disabled
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium">アプリ内データ</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">生理記録・SEX記録（必須）</p>
            </div>
          </label>
          
          <label className="flex items-start gap-3 cursor-pointer">
            <input 
              type="checkbox"
              checked={deleteCalendar}
              onChange={(e) => setDeleteCalendar(e.target.checked)}
              className="mt-1"
              style={{accentColor: '#B68DA2'}}
            />
            <div>
              <p className="text-sm font-medium">Googleカレンダー</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">同期したイベントも削除</p>
            </div>
          </label>
        </div>
        
        <p className="text-red-600 font-medium text-sm">
          ⚠️ この操作は取り消せません
        </p>
      </div>

      <div className="flex gap-2">
        <button 
          onClick={() => {
            setShowDeleteConfirm(false);
            setDeleteCalendar(false);
          }}
          className="flex-1 border px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800"
        >
          キャンセル
        </button>
<button 
          onClick={handleDeleteData}
          className="flex-1 text-gray-700 dark:text-gray-900 px-4 py-2 rounded"
          style={{backgroundColor: '#E3D0DA'}}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#CBA9BA'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#E3D0DA'}
        >
          削除する
        </button>
      </div>
    </div>
  </div>
);

const BulkAddModal = ({ bulkRecords, setBulkRecords, bulkPickerState, setBulkPickerState, formatBulkDisplayDate, addBulkRecord, removeBulkRecord, updateBulkRecord, submitBulkRecords, setShowBulkAddModal }: {
  bulkRecords: BulkRecord[];
  setBulkRecords: (records: BulkRecord[]) => void;
  bulkPickerState: { recordId: number | null; field: string | null };
  setBulkPickerState: (state: { recordId: number | null; field: string | null }) => void;
  formatBulkDisplayDate: (dateStr: string) => string;
  addBulkRecord: () => void;
  removeBulkRecord: (id: number) => void;
  updateBulkRecord: (id: number, field: 'startDate' | 'endDate', value: string) => void;
  submitBulkRecords: () => Promise<void>;
  setShowBulkAddModal: (show: boolean) => void;
  currentDate: Date;
}) => {
  const [isSaving, setIsSaving] = useState(false);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 overflow-y-auto" style={{zIndex: 9999}}>
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-2xl my-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
        過去の生理記録を一括登録
      </h3>

      <div className="space-y-3 mb-4">
        {bulkRecords.map((record, index) => (
          <div key={record.id} className="border rounded p-3 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">記録 {index + 1}</span>
              {bulkRecords.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBulkRecord(record.id)}
                  className="text-red-600 text-sm hover:underline"
                >
                  削除
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">開始日</label>
                <button
                  type="button"
                  onClick={() => setBulkPickerState({ recordId: record.id, field: 'startDate' })}
                  className="w-full border rounded px-2 py-1 text-sm text-left bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800"
                >
                  {formatBulkDisplayDate(record.startDate)}
                </button>
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">終了日</label>
                <button
                  type="button"
                  onClick={() => setBulkPickerState({ recordId: record.id, field: 'endDate' })}
                  className="w-full border rounded px-2 py-1 text-sm text-left bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800"
                >
                  {formatBulkDisplayDate(record.endDate)}
                </button>
              </div>
            </div>
          </div>
        ))}

        {bulkRecords.length < 20 && (
          <button
            type="button"
            onClick={addBulkRecord}
            className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800"
          >
            + 記録を追加
          </button>
        )}
      </div>

      {bulkPickerState.recordId && (
        <div className="fixed inset-0 bg-white dark:bg-gray-900 flex items-center justify-center" style={{zIndex: 10000}}>
          <div 
            className="absolute inset-0 bg-black bg-opacity-30" 
            onClick={() => setBulkPickerState({ recordId: null, field: null })}
          />
          <div className="relative">
            <DatePicker
              selectedDate={bulkRecords.find(r => r.id === bulkPickerState.recordId)?.[bulkPickerState.field as 'startDate' | 'endDate'] || ''}
              onSelect={(date) => {
                updateBulkRecord(bulkPickerState.recordId!, bulkPickerState.field as 'startDate' | 'endDate', date);
                setBulkPickerState({ recordId: null, field: null });
              }}
              onClose={() => setBulkPickerState({ recordId: null, field: null })}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-4 border-t">
        <button 
          type="button"
          onClick={() => {
            setShowBulkAddModal(false);
            setBulkRecords([{ id: 1, startDate: '', endDate: '' }]);
            setBulkPickerState({ recordId: null, field: null });
          }}
          className="flex-1 border px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800"
        >
          キャンセル
        </button>
<button 
          type="button"
          onClick={async () => {
            setIsSaving(true);
            await submitBulkRecords();
            setIsSaving(false);
          }}
          disabled={isSaving}
          className="flex-1 text-gray-700 dark:text-gray-900 px-4 py-2 rounded flex flex-col items-center disabled:opacity-50"
          style={{backgroundColor: '#C2D2DA'}}
          onMouseEnter={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#91AEBD')}
          onMouseLeave={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#C2D2DA')}
        >
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-700 dark:border-gray-900 border-t-transparent rounded-full animate-spin mb-1"></div>
              <span>登録中...</span>
            </>
          ) : (
            <>
              <span>一括登録</span>
              <span className="text-sm">（{bulkRecords.filter(r => r.startDate && r.endDate).length}件）</span>
            </>
          )}
        </button>

      </div>
    </div>
  </div>
  );
};

const EditPeriodModal = ({ period, updatePeriod, setEditingPeriod }: {
  period: Period;
  updatePeriod: (id: number, startDate: string, endDate: string) => Promise<void>;
  setEditingPeriod: (period: Period | null) => void;
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 10001}}>
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">生理記録を修正</h3>
      <EditPeriodForm
        period={period}
        onSubmit={async (startDate, endDate) => await updatePeriod(period.id, startDate, endDate)}
        onCancel={() => setEditingPeriod(null)}
      />
    </div>
  </div>
);

const DeletePeriodModal = ({ deletePeriod, deletingPeriodId, setDeletingPeriodId }: {
  deletePeriod: (id: number) => Promise<void>;
  deletingPeriodId: number;
  setDeletingPeriodId: (id: number | null) => void;
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await deletePeriod(deletingPeriodId);
    setIsDeleting(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 10002}}>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-sm w-full">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 text-red-600">記録を削除しますか？</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">この操作は取り消せません</p>
        <div className="flex gap-2">
          <button 
            onClick={() => setDeletingPeriodId(null)}
            disabled={isDeleting}
            className="flex-1 border px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button 
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 text-gray-700 dark:text-gray-900 px-4 py-2 rounded disabled:opacity-50 flex items-center justify-center gap-2"
            style={{backgroundColor: '#E3D0DA'}}
            onMouseEnter={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = '#CBA9BA')}
            onMouseLeave={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = '#E3D0DA')}
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                削除中...
              </>
            ) : '削除する'}
          </button>
        </div>
      </div>
    </div>
  );
};

const RecordsList = ({ records, onClose, onEdit, onDelete }: {
  records: Records;
  onClose: () => void;
  onEdit: (period: Period) => void;
  onDelete: (id: number) => void;
}) => {
  const sortedPeriods = [...records.periods].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  
  const periodsByYear: Record<string, Period[]> = {};
  sortedPeriods.forEach(period => {
    const year = new Date(period.startDate).getFullYear().toString();
    if (!periodsByYear[year]) periodsByYear[year] = [];
    periodsByYear[year].push(period);
  });
  
  const years = Object.keys(periodsByYear).sort((a, b) => parseInt(b) - parseInt(a));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 9999}}>
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">登録済み生理記録一覧</h3>
          {records.periods.length > 0 && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">全{records.periods.length}件の記録</p>}
        </div>

        {records.periods.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 flex-1"><p>まだ記録がありません</p></div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {years.map(year => (
                <div key={year}>
                  <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 sticky top-0 bg-white dark:bg-gray-900 py-2 border-b">{year}年 ({periodsByYear[year].length}件)</h4>
                  <div className="space-y-2">
                    {periodsByYear[year].map(period => {
                      const startDate = new Date(period.startDate);
                      const endDate = new Date(period.endDate);
                      const sameMonth = startDate.getMonth() === endDate.getMonth();
                      return (
                        <div key={period.id} className="border rounded p-3 bg-gray-50 dark:bg-gray-800">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                {startDate.getMonth() + 1}/{startDate.getDate()}〜{sameMonth ? '' : `${endDate.getMonth() + 1}/`}{endDate.getDate()} ({period.days}日間)
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => onEdit(period)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 p-1 rounded" title="修正">
                                <i className="fa-solid fa-pen-to-square"></i>
                              </button>
                              <button onClick={() => onDelete(period.id)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 p-1 rounded" title="削除">
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                               );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-6 border-t">
          <button onClick={onClose} className="w-full border px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800">閉じる</button>
        </div>
      </div>
    </div>
  );
};

const IntercourseList = ({ records, onClose, onEdit, onDelete }: {
  records: IntercourseRecord[];
  onClose: () => void;
  onEdit: (record: IntercourseRecord) => void;
  onDelete: (id: number) => void;
}) => {
  const sortedRecords = [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  const recordsByYear: Record<string, IntercourseRecord[]> = {};
  sortedRecords.forEach(record => {
    const year = new Date(record.date).getFullYear().toString();
    if (!recordsByYear[year]) recordsByYear[year] = [];
    recordsByYear[year].push(record);
  });
  
  const years = Object.keys(recordsByYear).sort((a, b) => parseInt(b) - parseInt(a));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 9999}}>
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">SEX記録一覧</h3>
          {records.length > 0 && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">全{records.length}件の記録</p>}
        </div>

        {records.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 flex-1"><p>まだ記録がありません</p></div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {years.map(year => (
                <div key={year}>
                  <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 sticky top-0 bg-white dark:bg-gray-900 py-2 border-b">{year}年 ({recordsByYear[year].length}件)</h4>
                  <div className="space-y-2">
                    {recordsByYear[year].map(record => {
                      const date = new Date(record.date);
                      return (
<div key={record.id} className="border rounded p-3 bg-gray-50 dark:bg-gray-800">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <p className="text-sm font-medium mb-1">{date.getMonth() + 1}月{date.getDate()}日</p>
                              <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                                <p>避妊具：{record.contraception}</p>
                                {record.partner && <p>パートナー：{record.partner}</p>}
                                {record.memo && <p>メモ：{record.memo}</p>}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => onEdit(record)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 p-1 rounded" title="修正">
                                <i className="fa-solid fa-pen-to-square"></i>
                              </button>
                              <button onClick={() => onDelete(record.id)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 p-1 rounded" title="削除">
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                        );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-6 border-t">
          <button onClick={onClose} className="w-full border px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800">閉じる</button>
        </div>
      </div>
    </div>
  );
};

const InitialSyncModal = ({ onSave }: {
  onSave: (settings: SyncSettings) => void;
}) => {
  const [settings, setSettings] = useState<SyncSettings>({
    period: true,
    fertile: true,
    pms: true,
    intercourse: false,
    health: false
  });
  const [ageGroup, setAgeGroup] = useState<string>('');
  const [showIntercourseInfo, setShowIntercourseInfo] = useState(false);
  const [useIntercourse, setUseIntercourse] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      // 下から10px以内までスクロールしたら有効化
      if (scrollTop + clientHeight >= scrollHeight - 10) {
        setHasScrolledToBottom(true);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 10004}}>
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full flex flex-col" style={{maxHeight: '90vh'}}>
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">初期設定</h3>
        </div>
        
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-4"
        >
          {/* 同期設定 */}
          <h4 className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">Googleカレンダー同期</h4>
          <div className="space-y-3">
<label className="flex items-center gap-2 cursor-pointer">
              <div className="relative">
                <input 
                  type="checkbox" 
                  checked={settings.period}
                  onChange={(e) => setSettings({...settings, period: e.target.checked})}
                  className="sr-only peer"
                />
                <i className={`${settings.period ? 'fa-solid fa-square-check text-xl' : 'fa-regular fa-square text-gray-400 text-xl'}`} style={settings.period ? {color: '#91AEBD'} : {}}></i>
              </div>
              <span className="text-sm text-gray-900 dark:text-gray-100">生理期間を同期</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative">
                <input 
                  type="checkbox" 
                  checked={settings.fertile}
                  onChange={(e) => setSettings({...settings, fertile: e.target.checked})}
                  className="sr-only peer"
                />
                <i className={`${settings.fertile ? 'fa-solid fa-square-check text-xl' : 'fa-regular fa-square text-gray-400 text-xl'}`} style={settings.fertile ? {color: '#91AEBD'} : {}}></i>
              </div>
              <span className="text-sm text-gray-900 dark:text-gray-100">妊娠可能日を同期</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative">
                <input 
                  type="checkbox" 
                  checked={settings.pms}
                  onChange={(e) => setSettings({...settings, pms: e.target.checked})}
                  className="sr-only peer"
                />
                <i className={`${settings.pms ? 'fa-solid fa-square-check text-xl' : 'fa-regular fa-square text-gray-400 text-xl'}`} style={settings.pms ? {color: '#91AEBD'} : {}}></i>
              </div>
              <span className="text-sm text-gray-900 dark:text-gray-100">PMS予測を同期</span>
            </label>            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative">
                  <input 
                    type="checkbox" 
                    checked={settings.intercourse}
                    onChange={(e) => setSettings({...settings, intercourse: e.target.checked})}
                    className="sr-only peer"
                  />
                  <i className={`${settings.intercourse ? 'fa-solid fa-square-check text-xl' : 'fa-regular fa-square text-gray-400 text-xl'}`} style={settings.intercourse ? {color: '#91AEBD'} : {}}></i>
                </div>
                <span className="text-sm text-gray-900 dark:text-gray-100">SEXを同期</span>
                <button 
                  type="button" 
                  onClick={() => setShowIntercourseInfo(!showIntercourseInfo)} 
                  className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 flex items-center justify-center text-xs text-gray-900 dark:text-gray-100"
                >
                  <i className="fa-solid fa-circle-info text-blue-600"></i>
                </button>
              </label>              
              {showIntercourseInfo && (
                <div className="mt-2 p-3 bg-blue-50 dark:bg-gray-700 rounded text-xs text-gray-700 dark:text-gray-300">
                  <p className="font-semibold mb-1">カレンダーに表示される内容：</p>
                  <p className="mb-2">「●」などの記号のみ（カスタマイズ可能）</p>
                  <p className="font-semibold mb-1">同期されない情報：</p>
                  <ul className="list-disc ml-4">
                    <li>パートナー名</li>
                    <li>避妊具使用状況</li>
                    <li>メモ</li>
                  </ul>
                  <p className="mt-2 text-gray-600 dark:text-gray-300">詳細情報はアプリ内にのみ保存されます。</p>
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative">
                <input 
                  type="checkbox" 
                  checked={settings.health}
                  onChange={(e) => setSettings({...settings, health: e.target.checked})}
                  className="sr-only peer"
                />
                <i className={`${settings.health ? 'fa-solid fa-square-check text-xl' : 'fa-regular fa-square text-gray-400 text-xl'}`} style={settings.health ? {color: '#91AEBD'} : {}}></i>
              </div>
              <span className="text-sm text-gray-900 dark:text-gray-100">体調記録を同期</span>
            </label>
          </div>
          
          {/* 性交渉記録のON/OFF */}
          <div className="mt-6">
            <h4 className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">性交渉記録機能</h4>
            <label className="flex items-start gap-2 cursor-pointer">
              <div className="relative pt-1">
                <input 
                  type="checkbox" 
                  checked={useIntercourse}
                  onChange={(e) => setUseIntercourse(e.target.checked)}
                  className="sr-only peer"
                />
                <i className={`${useIntercourse ? 'fa-solid fa-square-check text-xl' : 'fa-regular fa-square text-gray-400 text-xl'}`} style={useIntercourse ? {color: '#91AEBD'} : {}}></i>
              </div>
              <div>
                <span className="text-sm text-gray-900 dark:text-gray-100">性交渉記録を使用する</span>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                  オフにすると、カレンダーやマイデータから性交渉関連の機能が非表示になります。後から設定で変更できます。
                </p>
              </div>
            </label>
          </div>
          
          {/* 年齢層選択 */}
          <div className="mt-6">
            <h4 className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">年齢層（任意）</h4>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
              あなたに合った情報をお届けするために教えてください
            </p>
            <div className="grid grid-cols-4 gap-2">
              {['10代', '20代', '30代', '40代', '50代', '50代以上', '回答しない'].map((age) => (
                <label key={age} className="flex items-center gap-1 cursor-pointer">
                  <div className="relative">
                    <input 
                      type="radio" 
                      name="ageGroup" 
                      value={age}
                      checked={ageGroup === age}
                      onChange={(e) => setAgeGroup(e.target.value)}
                      className="sr-only peer"
                    />
                    <i className={`${ageGroup === age ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle'} text-lg`} style={ageGroup === age ? {color: '#91AEBD'} : {color: '#9CA3AF'}}></i>
                  </div>
                  <span className="text-xs text-gray-900 dark:text-gray-100">{age}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          {!hasScrolledToBottom && (
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-2">
              ↓ 最後までスクロールしてください
            </p>
          )}
          <button 
            disabled={!hasScrolledToBottom}
            onClick={() => {
              // 年齢層をlocalStorageに保存
              if (ageGroup && ageGroup !== '回答しない') {
                localStorage.setItem('tukicale_age_group', ageGroup);
              }
              // 性交渉記録の使用設定を保存
              localStorage.setItem('tukicale_use_intercourse_record', useIntercourse.toString());
              onSave(settings);
            }}
            className="w-full text-gray-700 dark:text-gray-900 px-4 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{backgroundColor: '#C2D2DA'}}
            onMouseEnter={(e) => !hasScrolledToBottom ? null : e.currentTarget.style.backgroundColor = '#91AEBD'}
            onMouseLeave={(e) => !hasScrolledToBottom ? null : e.currentTarget.style.backgroundColor = '#C2D2DA'}
          >
            設定を保存して始める
          </button>
        </div>
      </div>
    </div>
  );
  };

const NotificationModal = ({ message, type, onClose }: {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) => {
  useEffect(() => {
    if (type === 'success') {
      const timer = setTimeout(() => {
        onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [type, onClose]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4" style={{zIndex: 10005}}>
<div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-sm w-full shadow-xl">
        <div className="flex flex-col items-center justify-center gap-3 min-h-[60px]">
          {type === 'success' && (
            <i className="fas fa-check-circle text-4xl" style={{color: '#8DB68D'}}></i>
          )}
          <p className="text-center whitespace-pre-line">{message}</p>
        </div>
        {type === 'error' && (
          <button 
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg font-medium mt-4 text-gray-700 dark:text-gray-900"
            style={{backgroundColor: '#E3D0DA'}}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#CBA9BA'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#E3D0DA'}
          >
            OK
          </button>
        )}
      </div>
    </div>
  );
};

const DayDetailModal = ({ date, periods, intercourse, health, onClose, onEditPeriod, onDeletePeriod, onEditIntercourse, onDeleteIntercourse, onEditHealth, onDeleteHealth, onAddNew, useIntercourseRecord }: {
  date: Date;
  periods: Period[];
  intercourse: IntercourseRecord[];
  health: HealthRecord[];
  onClose: () => void;
  onEditPeriod: (period: Period) => void;
  onDeletePeriod: (id: number) => void;
  onEditIntercourse: (record: IntercourseRecord) => void;
  onDeleteIntercourse: (id: number) => void;
  onEditHealth: (record: HealthRecord) => void;
  onDeleteHealth: (id: number) => void;
  onAddNew: () => Promise<void>;
  useIntercourseRecord: boolean;
}) => {

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 9999}}>
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">{date.getMonth() + 1}月{date.getDate()}日の記録</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {periods.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">生理記録 ({periods.length}件)</h4>
              <div className="space-y-2">
                {periods.map(period => {
                  const startDate = new Date(period.startDate);
                  const endDate = new Date(period.endDate);
                  const sameMonth = startDate.getMonth() === endDate.getMonth();
                  return (
                    <div key={period.id} className="border rounded p-3 bg-red-50 dark:bg-gray-800">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {startDate.getMonth() + 1}/{startDate.getDate()}〜{sameMonth ? '' : `${endDate.getMonth() + 1}/`}{endDate.getDate()} ({period.days}日間)
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => onEditPeriod(period)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded" title="修正">
                            <i className="fa-solid fa-pen-to-square"></i>
                          </button>
                          <button onClick={() => onDeletePeriod(period.id)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded" title="削除">
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {health.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">体調記録 ({health.length}件)</h4>
              <div className="space-y-2">
                {health.map(record => (
                  <div key={record.id} className="border rounded p-3 bg-orange-50 dark:bg-gray-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium mb-1">{record.type}</p>
                        {record.memo && (
                          <div className="text-xs text-gray-600 dark:text-gray-300">
                            <p>メモ：{record.memo}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => onEditHealth(record)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded" title="修正">
                          <i className="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button onClick={() => onDeleteHealth(record.id)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded" title="削除">
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {useIntercourseRecord && intercourse.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">SEX記録 ({intercourse.length}件)</h4>
              <div className="space-y-2">
                {intercourse.map(record => (
                  <div key={record.id} className="border rounded p-3 bg-gray-50 dark:bg-gray-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                          <p>避妊具：{record.contraception}</p>
                          {record.partner && <p>パートナー：{record.partner}</p>}
                          {record.memo && <p>メモ：{record.memo}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => onEditIntercourse(record)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded" title="修正">
                          <i className="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button onClick={() => onDeleteIntercourse(record.id)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded" title="削除">
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t space-y-2">
          <button 
            onClick={async () => await onAddNew()} 
            className="w-full px-4 py-2 rounded text-gray-700 dark:text-gray-900"
            style={{backgroundColor: '#C2D2DA'}}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#91AEBD'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#C2D2DA'}
          >
            この日に新しい記録を追加
          </button>
          <button onClick={onClose} className="w-full border px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

const EditIntercourseModal = ({ record, updateIntercourse, setEditingIntercourse }: {
  record: IntercourseRecord;
  updateIntercourse: (id: number, date: string, contraception: string, partner: string, memo: string) => void;
  setEditingIntercourse: (record: IntercourseRecord | null) => void;
}) => {
  const [date, setDate] = useState(record.date);
  const [contraception, setContraception] = useState(record.contraception);
  const [partner, setPartner] = useState(record.partner);
  const [memo, setMemo] = useState(record.memo);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const formatBulkDisplayDate = (dateStr: string): string => {
    if (!dateStr) return '日付を選択';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 10001}}>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">SEX記録を修正</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">日付</label>
            <button type="button" onClick={() => setShowDatePicker(!showDatePicker)} className="w-full border rounded px-2 py-1 text-sm text-left bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800">
              {formatBulkDisplayDate(date)}
            </button>
            {showDatePicker && (
              <div className="mt-2"><DatePicker selectedDate={date} onSelect={(newDate) => { setDate(newDate); setShowDatePicker(false); }} onClose={() => setShowDatePicker(false)} /></div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">避妊具使用</label>
            <select value={contraception} onChange={(e) => setContraception(e.target.value)} className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 [&>option]:text-gray-900 [&>option]:dark:text-gray-100">
              <option value="不明" className="text-gray-900 dark:text-gray-100">❓ 不明</option>
              <option value="使用" className="text-gray-900 dark:text-gray-100">✅ 使用</option>
              <option value="不使用" className="text-gray-900 dark:text-gray-100">❌ 不使用</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">パートナー（任意）</label>
            <input type="text" value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="イニシャル、ニックネームなど" className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-gray-900" />
          </div>
<div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">メモ（任意）</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="体調, その他" className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-gray-900" rows={2} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditingIntercourse(null)} className="flex-1 border px-4 py-2 rounded">キャンセル</button>
            <button 
              type="button" 
              onClick={() => updateIntercourse(record.id, date, contraception, partner, memo)} 
              className="flex-1 text-gray-700 dark:text-gray-900 px-4 py-2 rounded"
              style={{backgroundColor: '#C2D2DA'}}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#91AEBD'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#C2D2DA'}
            >
              更新
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const EditHealthModal = ({ record, updateHealth, setEditingHealth }: {
  record: HealthRecord;
  updateHealth: (id: number, date: string, type: string, memo: string) => void;
  setEditingHealth: (record: HealthRecord | null) => void;
}) => {
  const [date, setDate] = useState(record.date);
  const [healthType, setHealthType] = useState<'不正出血' | '頭痛' | '腹痛' | '吐き気' | 'その他'>(record.type);
  const [memo, setMemo] = useState(record.memo);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const formatBulkDisplayDate = (dateStr: string): string => {
    if (!dateStr) return '日付を選択';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 10001}}>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">体調記録を修正</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">日付</label>
            <button type="button" onClick={() => setShowDatePicker(!showDatePicker)} className="w-full border rounded px-2 py-1 text-sm text-left bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800">
              {formatBulkDisplayDate(date)}
            </button>
            {showDatePicker && (
              <div className="mt-2"><DatePicker selectedDate={date} onSelect={(newDate) => { setDate(newDate); setShowDatePicker(false); }} onClose={() => setShowDatePicker(false)} /></div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">体調の種類</label>
            <div className="space-y-2">
              {['不正出血', '頭痛', '腹痛', '吐き気', 'その他'].map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input 
                type="radio" 
                name="healthType" 
                value={type}
                checked={healthType === type}
                onChange={(e) => setHealthType(e.target.value as '不正出血' | '頭痛' | '腹痛' | '吐き気' | 'その他')}
                className="sr-only"
              />
                  <i className={`${healthType === type ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle'} text-xl`} style={healthType === type ? {color: '#FDBA74'} : {color: '#9CA3AF'}}></i>
                  <span className="text-sm">{type}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">メモ（任意）</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="症状の詳細など" className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-gray-900" rows={3} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditingHealth(null)} className="flex-1 border px-4 py-2 rounded">キャンセル</button>
            <button 
              type="button" 
              onClick={() => updateHealth(record.id, date, healthType, memo)} 
              className="flex-1 bg-orange-300 text-gray-700 dark:text-gray-900 px-4 py-2 rounded hover:bg-orange-400"
            >
              更新
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const DeleteIntercourseModal = ({ deleteIntercourse, deletingIntercourseId, setDeletingIntercourseId }: {
  deleteIntercourse: (id: number) => Promise<void>;
  deletingIntercourseId: number;
  setDeletingIntercourseId: (id: number | null) => void;
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await deleteIntercourse(deletingIntercourseId);
    setIsDeleting(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 10002}}>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-sm w-full">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 text-red-600">SEX記録を削除しますか？</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">この操作は取り消せません</p>
        <div className="flex gap-2">
          <button 
            onClick={() => setDeletingIntercourseId(null)} 
            disabled={isDeleting}
            className="flex-1 border px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button 
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 text-gray-700 dark:text-gray-900 px-4 py-2 rounded disabled:opacity-50 flex items-center justify-center gap-2"
            style={{backgroundColor: '#E3D0DA'}}
            onMouseEnter={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = '#CBA9BA')}
            onMouseLeave={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = '#E3D0DA')}
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                削除中...
              </>
            ) : '削除する'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DeleteHealthModal = ({ deleteHealth, deletingHealthId, setDeletingHealthId }: {
  deleteHealth: (id: number) => Promise<void>;
  deletingHealthId: number;
  setDeletingHealthId: (id: number | null) => void;
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await deleteHealth(deletingHealthId);
    setIsDeleting(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 10002}}>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-sm w-full">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 text-red-600">体調記録を削除しますか?</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">この操作は取り消せません</p>
        <div className="flex gap-2">
          <button 
            onClick={() => setDeletingHealthId(null)} 
            disabled={isDeleting}
            className="flex-1 border px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button 
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 text-gray-700 dark:text-gray-900 px-4 py-2 rounded disabled:opacity-50 flex items-center justify-center gap-2"
            style={{backgroundColor: '#E3D0DA'}}
            onMouseEnter={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = '#CBA9BA')}
            onMouseLeave={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = '#E3D0DA')}
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                削除中...
              </>
            ) : '削除する'}
          </button>
        </div>
      </div>
    </div>
  );
};

const PeriodTrackerApp = () => {
  const [currentView, setCurrentView] = useState('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [records, setRecords] = useState<Records>({
    periods: [],
    intercourse: [],
    health: []
  });;
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [modalType, setModalType] = useState('period');
  const [isGoogleAuthed, setIsGoogleAuthed] = useState(false);
  const [showLoginScreen, setShowLoginScreen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteCalendar, setDeleteCalendar] = useState(false);
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [bulkRecords, setBulkRecords] = useState<BulkRecord[]>([{ id: 1, startDate: '', endDate: '' }]);
  const [bulkPickerState, setBulkPickerState] = useState<{ recordId: number | null; field: string | null }>({ recordId: null, field: null });
  const [showRecordsList, setShowRecordsList] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<Period | null>(null);
  const [deletingPeriodId, setDeletingPeriodId] = useState<number | null>(null);
  const [showIntercourseList, setShowIntercourseList] = useState(false);
  const [showInitialSyncModal, setShowInitialSyncModal] = useState(false);
  const [syncSettings, setSyncSettings] = useState<SyncSettings>({
    period: true,
    fertile: true,
    pms: true,
    intercourse: false,
    health: false
  });
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [showDayDetailModal, setShowDayDetailModal] = useState(false);
  const [selectedDayData, setSelectedDayData] = useState<{
    date: Date;
    periods: Period[];
    intercourse: IntercourseRecord[];
    health: HealthRecord[];
  } | null>(null);
  const [deletingIntercourseId, setDeletingIntercourseId] = useState<number | null>(null);
const [editingIntercourse, setEditingIntercourse] = useState<IntercourseRecord | null>(null);
  const [editingHealth, setEditingHealth] = useState<HealthRecord | null>(null);
  const [deletingHealthId, setDeletingHealthId] = useState<number | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  const [useIntercourseRecord, setUseIntercourseRecord] = useState(false);

  const loadFromDrive = async () => {
    const token = await getAccessToken();
    if (!token) return null;
    
    try {
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FILE_NAME}'&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!searchResponse.ok) return null;
      
      const searchData = await searchResponse.json();
      
      if (searchData.files && searchData.files.length > 0) {
        const fileId = searchData.files[0].id;
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.ok) {
          const data = await response.json();
          return data;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Load from Drive error:', error);
      return null;
    }
  };

  const handleReload = async () => {
    setIsReloading(true);
    
    try {
      // Googleドライブから最新データを取得
      const driveData = await loadFromDrive();
      
      if (driveData) {
        setRecords(driveData);
        localStorage.setItem('myflow_data', JSON.stringify(driveData));
        
        // 年齢層をlocalStorageに復元
        if (driveData.ageGroup) {
          localStorage.setItem('tukicale_age_group', driveData.ageGroup);
        }
        
        // Googleカレンダーも同期
        await syncToCalendar(driveData, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
        
        setNotification({
          message: '最新データに更新しました',
          type: 'success'
        });
      } else {
        setNotification({
          message: 'データの読み込みに失敗しました',
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Reload error:', error);
      setNotification({
        message: 'エラーが発生しました',
        type: 'error'
      });
    } finally {
      setIsReloading(false);
    }
  };

  useEffect(() => {

    const params = new URLSearchParams(window.location.search);
    const token = params.get('access_token');
    const refreshToken = params.get('refresh_token');

// 既存のトークンとセットアップ状態を確認
    const savedToken = localStorage.getItem('tukicale_access_token');
    const hasCompletedInitialSetup = localStorage.getItem('tukicale_initial_setup_completed');
    const savedData = localStorage.getItem('myflow_data');
    const savedSyncSettings = localStorage.getItem('tukicale_sync_settings');

    // データが存在する場合は、セットアップ完了済みとみなす
    const hasData = savedData && JSON.parse(savedData).periods && JSON.parse(savedData).periods.length > 0;

    if (token) {
      // 新規ログイン(OAuth リダイレクト後)
      localStorage.setItem('tukicale_access_token', token);
      if (refreshToken) {
        localStorage.setItem('tukicale_refresh_token', refreshToken);
      }
      setIsGoogleAuthed(true);
      setShowLoginScreen(false);

      // データがない場合かつ初期設定が未完了の場合のみ、初期設定モーダルを表示
      if (!hasCompletedInitialSetup && !hasData) {
        setShowInitialSyncModal(true);
      } else if (hasData && !hasCompletedInitialSetup) {
        // データがある場合は、自動的に初期設定完了フラグを立てる
        localStorage.setItem('tukicale_initial_setup_completed', 'true');
      }
} else if (savedToken) {
      // 既存ログイン(トークンが保存されている)
      setIsGoogleAuthed(true);
      setShowLoginScreen(false);
           
      // データがあるのに初期設定フラグがない場合、フラグを立てる
      if (hasData && !hasCompletedInitialSetup) {
        localStorage.setItem('tukicale_initial_setup_completed', 'true');
      }
    } else {
      // トークンがない場合のみログイン画面を表示
      setShowLoginScreen(true);
    }
    
    // 同期設定を読み込み
    if (savedSyncSettings) {
      setSyncSettings(JSON.parse(savedSyncSettings));
    }
    
    // 性交渉記録の使用設定を読み込み
    if (typeof window !== 'undefined') {
      const savedUseIntercourse = localStorage.getItem('tukicale_use_intercourse_record');
      if (savedUseIntercourse !== null) {
        setUseIntercourseRecord(savedUseIntercourse === 'true');
      }
    }
    
    // データを読み込み
    if (savedData) {
      setRecords(JSON.parse(savedData));
    }

    setCurrentDate(new Date());
    setIsInitializing(false);
  }, []);

  useEffect(() => {
    localStorage.setItem('myflow_data', JSON.stringify(records));
  }, [records]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    return { daysInMonth, startingDayOfWeek };
  };

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isToday = (day: number): boolean => {
  const today = new Date();
  return day === today.getDate() && 
         currentDate.getMonth() === today.getMonth() && 
         currentDate.getFullYear() === today.getFullYear();
};

  const getRecordForDate = (day: number) => {
    const dateStr = formatDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
    
    const period = records.periods.find(p => 
      dateStr >= p.startDate && dateStr <= p.endDate
    );
    
    const intercourse = records.intercourse.find(i => i.date === dateStr);
    const health = (records.health || []).find(h => h.date === dateStr);
    
    const fertile = getFertileDays().includes(dateStr);
    const pms = getPMSDays().includes(dateStr);
    const nextPeriod = getNextPeriodDays().includes(dateStr);
    
    return { period, intercourse, health, fertile, pms, nextPeriod };
  };

const getAverageCycle = (): number => {
    if (records.periods.length < 2) return 28;
    
    const sortedPeriods = [...records.periods].sort((a, b) => 
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
    
    let totalDays = 0;
    for (let i = 1; i < sortedPeriods.length; i++) {
      const days = Math.floor(
        (new Date(sortedPeriods[i].startDate).getTime() - new Date(sortedPeriods[i-1].startDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      totalDays += days;
    }
    
    return Math.round(totalDays / (sortedPeriods.length - 1)) || 28;
  };

  const getAveragePeriodLength = (): number => {
    if (records.periods.length === 0) return 5;
    
    const avgLength = Math.round(
      records.periods.reduce((sum, p) => sum + p.days, 0) / records.periods.length
    );
    
    return avgLength || 5;
  };

const getFertileDays = () => {
    if (records.periods.length === 0) return [];
    
    const lastPeriod = [...records.periods].sort((a, b) => 
      new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    )[0];
    
    const avgCycle = getAverageCycle();
    const ovulationDay = new Date(lastPeriod.startDate);
    ovulationDay.setDate(ovulationDay.getDate() + avgCycle - 14);
    
    // 最新の生理終了日より後の日付のみ予測を表示
    const lastPeriodEnd = new Date(lastPeriod.endDate);
    
    const fertileDays = [];
    for (let i = -3; i <= 3; i++) {
      const day = new Date(ovulationDay);
      day.setDate(day.getDate() + i);
      // 最新生理の終了日より後の日付のみ追加
      if (day > lastPeriodEnd) {
        fertileDays.push(formatDate(day));
      }
    }
    
    return fertileDays;
  };

const getPMSDays = () => {
    if (records.periods.length === 0) return [];
    
    const lastPeriod = [...records.periods].sort((a, b) => 
      new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    )[0];
    
    const avgCycle = getAverageCycle();
    const nextPeriod = new Date(lastPeriod.startDate);
    nextPeriod.setDate(nextPeriod.getDate() + avgCycle);
    
    // 最新の生理終了日より後の日付のみ予測を表示
    const lastPeriodEnd = new Date(lastPeriod.endDate);
    
    const pmsDays = [];
    for (let i = -10; i <= -3; i++) {
      const day = new Date(nextPeriod);
      day.setDate(day.getDate() + i);
      // 最新生理の終了日より後の日付のみ追加
      if (day > lastPeriodEnd) {
        pmsDays.push(formatDate(day));
      }
    }
    
    return pmsDays;
  };

const getNextPeriodDays = () => { 
  if (records.periods.length === 0) {
    return [];
  }
  
  const lastPeriod = [...records.periods].sort((a, b) => 
    new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  )[0];

  const avgCycle = getAverageCycle();
 
  const avgPeriodLength = records.periods.length > 0 
    ? Math.round(records.periods.reduce((sum, p) => sum + p.days, 0) / records.periods.length)
    : 5;
 
  const nextPeriodStart = new Date(lastPeriod.startDate);
  nextPeriodStart.setDate(nextPeriodStart.getDate() + avgCycle);
  
  // 最新の生理終了日より後の日付のみ予測を表示
  const lastPeriodEnd = new Date(lastPeriod.endDate);
 
  const nextPeriodDays = [];
  for (let i = 0; i < avgPeriodLength; i++) {
    const day = new Date(nextPeriodStart);
    day.setDate(day.getDate() + i);
    // 最新生理の終了日より後の日付のみ追加
    if (day > lastPeriodEnd) {
      nextPeriodDays.push(formatDate(day));
    }
  }
  
  return nextPeriodDays;
};

  const handleDayClick = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const dateStr = formatDate(date);
    
    // その日の生理記録を取得
    const dayPeriods = records.periods.filter(p => 
      dateStr >= p.startDate && dateStr <= p.endDate
    );
    
    // その日のSEX記録を取得（useIntercourseRecordがtrueの場合のみ）
    const dayIntercourse = useIntercourseRecord ? records.intercourse.filter(i => i.date === dateStr) : [];
    
    // その日の体調記録を取得
    const dayHealth = (records.health || []).filter(h => h.date === dateStr);
    
    // 記録がある場合は詳細モーダル、ない場合は追加モーダル
    if (dayPeriods.length > 0 || dayIntercourse.length > 0 || dayHealth.length > 0) {
      setSelectedDayData({
        date,
        periods: dayPeriods,
        intercourse: dayIntercourse,
        health: dayHealth
      });
      setShowDayDetailModal(true);
    } else {
      setSelectedDate(date);
      setShowAddModal(true);
    }
  };

const addPeriodRecord = async (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
    const newPeriod = {
      id: Date.now(),
      startDate,
      endDate,
      days
    };
  
    const newRecords = {
      ...records,
      periods: [...records.periods, newPeriod]
    };
    
    setRecords(newRecords);
    
    // 保存と同期を確実に完了させる
    await saveToDrive(newRecords);
    await syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
  
    setShowAddModal(false);
    
    setNotification({
      message: '生理記録を登録しました',
      type: 'success'
    });
  };

const updatePeriod = async (id: number, startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
    const newRecords = {
      ...records,
      periods: records.periods.map(p => p.id === id ? { ...p, startDate, endDate, days } : p)
    };
    
    setRecords(newRecords);
    setEditingPeriod(null);
    
    // 保存と同期を確実に完了させる
    await saveToDrive(newRecords);
    await syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
    
    setNotification({
      message: '生理記録を更新しました',
      type: 'success'
    });
  };

const deletePeriod = async (id: number) => {
  const newRecords = {
    ...records,
    periods: records.periods.filter(p => p.id !== id)
  };
  
  setRecords(newRecords);
  await saveToDrive(newRecords);
  await syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
  setDeletingPeriodId(null);
  setNotification({
    message: '生理記録を削除しました',
    type: 'success'
  });
};

const deleteIntercourse = async (id: number) => {
  const newRecords = {
    ...records,
    intercourse: records.intercourse.filter(i => i.id !== id)
  };
  
  setRecords(newRecords);
  await saveToDrive(newRecords);
  await syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
  setDeletingIntercourseId(null);
  setNotification({
    message: 'SEX記録を削除しました',
    type: 'success'
  });
};

const updateIntercourse = async (id: number, date: string, contraception: string, partner: string, memo: string) => {
  const newRecords = {
    ...records,
    intercourse: records.intercourse.map(i => 
      i.id === id ? { ...i, date, contraception, partner, memo } : i
    )
  };
  
  setRecords(newRecords);
  await saveToDrive(newRecords);
  await syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
  setEditingIntercourse(null);
  setNotification({
    message: 'SEX記録を更新しました',
    type: 'success'
  });
};

const updateHealth = async (id: number, date: string, type: string, memo: string) => {
  const newRecords = {
    ...records,
    health: (records.health || []).map(h => 
      h.id === id ? { ...h, date, type: type as '不正出血' | '頭痛' | '腹痛' | '吐き気' | 'その他', memo } : h
    )
  };
  
  setRecords(newRecords);
  await saveToDrive(newRecords);
  await syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
  setEditingHealth(null);
  setNotification({
    message: '体調記録を更新しました',
    type: 'success'
  });
};

const deleteHealth = async (id: number) => {
  const newRecords = {
    ...records,
    health: (records.health || []).filter(h => h.id !== id)
  };
  
  setRecords(newRecords);
  await saveToDrive(newRecords);
  await syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
  setDeletingHealthId(null);
  setNotification({
    message: '体調記録を削除しました',
    type: 'success'
  });
};

const addIntercourseRecord = async (date: string, contraception: string, partner: string, memo: string) => {
    const newRecord = {
      id: Date.now(),
      date,
      contraception,
      partner,
      memo
    };
    
    const newRecords = {
      ...records,
      intercourse: [...records.intercourse, newRecord]
    };
    
    setRecords(newRecords);
    
    // 保存と同期を確実に完了させる
    await saveToDrive(newRecords);
    await syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
    
    setShowAddModal(false);
    
    setNotification({
      message: 'SEX記録を登録しました',
      type: 'success'
    });
  };

  const addHealthRecord = async (date: string, type: string, memo: string) => {
    const newRecord = {
      id: Date.now(),
      date,
      type: type as '不正出血' | '頭痛' | '腹痛' | '吐き気' | 'その他',
      memo
    };
    
    const newRecords = {
      ...records,
      health: [...(records.health || []), newRecord]
    };
    
    setRecords(newRecords);
    
    // 保存と同期を確実に完了させる
    await saveToDrive(newRecords);
    await syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
    
    setShowAddModal(false);
    
    setNotification({
      message: '体調記録を登録しました',
      type: 'success'
    });
  };

  const renderCalendar = () => {
    const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);
    const days = [];
    
for (let i = 0; i < startingDayOfWeek; i++) {
days.push(<div key={`empty-${i}`} className="h-14 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"></div>);
}    
for (let day = 1; day <= daysInMonth; day++) {
      const { period, intercourse, health, fertile, pms, nextPeriod } = getRecordForDate(day);
      
      days.push(
<div
          key={day}
          onClick={() => handleDayClick(day)}
          className={`h-14 border border-gray-200 dark:border-gray-700 p-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-gray-800 relative`}
          style={isToday(day) ? {backgroundColor: '#C2D2DA'} : {}}
        >
          <div className={`text-sm font-medium ${isToday(day) ? 'text-gray-900' : ''}`}>{day}</div>
          <div className="flex flex-wrap gap-0.5 mt-1">
            {period && <div className="w-2 h-2 rounded-full bg-red-400" title="生理"></div>}
            {nextPeriod && !period && <div className="w-2 h-2 rounded-full bg-red-200" title="次回生理予測"></div>}
            {fertile && <div className="w-2 h-2 rounded-full bg-green-300" title="妊娠可能日"></div>}
            {pms && <div className="w-2 h-2 rounded-full bg-yellow-300" title="PMS予測"></div>}
            {health && <div className="w-2 h-2 rounded-full bg-orange-300" title="体調"></div>}
            {useIntercourseRecord && intercourse && <div className="w-2 h-2 rounded-full bg-gray-300" title="SEX"></div>}
          </div>
        </div>
      );
    }
        
    return days;
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const handleGoogleLogin = () => {
    setIsLoading(true);
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/api/auth`;
    const scope = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/calendar',
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: clientId as string,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scope,
      access_type: 'offline',
      prompt: 'consent',
    })}`;

    window.location.href = authUrl;
  };

const handleLogout = () => {
  localStorage.removeItem('tukicale_access_token');
  localStorage.removeItem('tukicale_refresh_token');
  localStorage.removeItem('tukicale_initial_setup_completed');
  setIsGoogleAuthed(false);
  setShowLoginScreen(true);
};

const handleDeleteData = async () => {
  const newRecords = {
    periods: [],
    intercourse: [],
    health: []
  };
  
  setRecords(newRecords);
  localStorage.removeItem('myflow_data');
  
  // Google Driveのデータも削除
  await saveToDrive(newRecords);
  
  if (deleteCalendar) {
    // Googleカレンダーのイベントも削除
    await syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
    setNotification({
      message: 'アプリ内のデータとGoogleカレンダーのイベントを削除しました',
      type: 'success'
    });
  } else {
    setNotification({
      message: 'アプリ内のデータを削除しました\nGoogleカレンダーのイベントは残っています',
      type: 'success'
    });
  }
  
  setShowDeleteConfirm(false);
  setDeleteCalendar(false);
};

  const addBulkRecord = () => {
    if (bulkRecords.length < 20) {
      setBulkRecords([...bulkRecords, { id: Date.now(), startDate: '', endDate: '' }]);
    }
  };

  const removeBulkRecord = (id: number) => {
    if (bulkRecords.length > 1) {
      setBulkRecords(bulkRecords.filter(r => r.id !== id));
    }
  };

  const updateBulkRecord = (id: number, field: 'startDate' | 'endDate', value: string) => {
    setBulkRecords(bulkRecords.map(r => {
      if (r.id === id) {
        const updated = { ...r, [field]: value };
if (field === 'startDate' && value && !r.endDate) {
          const startDateObj = new Date(value);
          const endDateObj = new Date(startDateObj);
          const avgLength = getAveragePeriodLength();
          endDateObj.setDate(startDateObj.getDate() + avgLength - 1);
          updated.endDate = formatDate(endDateObj);
        }
        return updated;
      }
      return r;
    }));
  };

const submitBulkRecords = async () => {
    const validRecords = bulkRecords.filter(r => r.startDate && r.endDate);
    
    if (validRecords.length === 0) {
      setNotification({
        message: '開始日と終了日を入力してください',
        type: 'error'
      });
      return;
    }

    const newPeriods = validRecords.map(r => {
      const days = Math.floor((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return {
        id: Date.now() + Math.random(),
        startDate: r.startDate,
        endDate: r.endDate,
        days
      };
    });

    const newRecords = {
      ...records,
      periods: [...records.periods, ...newPeriods]
    };

    setRecords(newRecords);
    setShowBulkAddModal(false);
    setBulkRecords([{ id: 1, startDate: '', endDate: '' }]);
    
    // 保存と同期を確実に完了させる
    await saveToDrive(newRecords);
    await syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);

    setNotification({
      message: `${validRecords.length}件の生理期間を登録しました`,
      type: 'success'
    });
  };

  const formatBulkDisplayDate = (dateStr: string): string => {
    if (!dateStr) return '日付を選択';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

const handleSaveSyncSettings = (newSettings: SyncSettings) => {
    setSyncSettings(newSettings);
    localStorage.setItem('tukicale_sync_settings', JSON.stringify(newSettings));
    localStorage.setItem('tukicale_initial_setup_completed', 'true');
    
    // 年齢層をRecordsに保存してGoogleドライブに同期
    const ageGroup = localStorage.getItem('tukicale_age_group') || '';
    const updatedRecords = {
      ...records,
      ageGroup
    };
    setRecords(updatedRecords);
    saveToDrive(updatedRecords);
    
    syncToCalendar(updatedRecords, newSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
    setShowInitialSyncModal(false);
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <i className="fa-regular fa-moon text-5xl text-gray-400 animate-pulse"></i>
          <p className="text-gray-600 dark:text-gray-300">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (showLoginScreen) {
    return <LoginScreen onLogin={handleGoogleLogin} isLoading={isLoading} />;
  }

return (
    <div className="max-w-4xl mx-auto p-4 bg-white dark:bg-gray-900 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 
          className="text-lg font-semibold text-gray-600 dark:text-gray-300 dark:text-gray-300 flex items-center gap-2 cursor-pointer hover:opacity-70"
          onClick={() => setCurrentView('calendar')}
        >
          <i className="fa-regular fa-moon"></i>
          TukiCale
        </h1>
        <div className="flex gap-2">
          <button
            onClick={handleReload}
            disabled={isReloading}
            className="p-2 rounded hover:border hover:border-gray-300 dark:border-gray-600 disabled:opacity-50"
            title="最新データに更新"
          >
            {isReloading ? (
              <div className="w-4 h-4 border-2 border-gray-600 dark:border-gray-300 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <i className="fa-solid fa-rotate-right text-gray-600 dark:text-gray-300"></i>
            )}
          </button>
          <button
            onClick={() => setCurrentView('calendar')}
            className={`p-2 rounded ${currentView === 'calendar' ? 'border-2 border-gray-600' : 'hover:border hover:border-gray-300 dark:border-gray-600'}`}
            title="カレンダー"
          >
            <i className="fa-regular fa-calendar-days text-gray-600 dark:text-gray-300"></i>
          </button>
          <button
            onClick={() => setCurrentView('stats')}
            className={`p-2 rounded ${currentView === 'stats' ? 'border-2 border-gray-600' : 'hover:border hover:border-gray-300 dark:border-gray-600'}`}
            title="マイデータ"
          >
            <i className="fa-solid fa-user-circle text-gray-600 dark:text-gray-300"></i>
          </button>
          <button
            onClick={() => setCurrentView('settings')}
            className={`p-2 rounded ${currentView === 'settings' ? 'border-2 border-gray-600' : 'hover:border hover:border-gray-300 dark:border-gray-600'}`}
            title="設定"
          >
            <i className="fa-solid fa-gear text-gray-600 dark:text-gray-300"></i>
          </button>
        </div>
      </div>


{currentView === 'calendar' && (
        <>
          <div className="flex items-center justify-between mb-4 gap-2">
            <button onClick={prevMonth} className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-900 dark:text-gray-100">
              ←
            </button>
            <div className="flex gap-2 items-center relative">
              {/* 年選択 */}
              <div className="relative">
                <button 
                  type="button"
                  onClick={() => {
                    setShowYearPicker(!showYearPicker);
                    setShowMonthPicker(false);
                  }}
                  className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-lg font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-w-[100px]"
                >
                  {currentDate.getFullYear()}年
                </button>
                {showYearPicker && (
                  <div className="absolute top-full mt-1 left-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
                    {Array.from({length: 21}, (_, i) => new Date().getFullYear() - 10 + i).map(year => (
                      <button
                        key={year}
                        type="button"
                        onClick={() => {
                          setCurrentDate(new Date(year, currentDate.getMonth(), 1));
                          setShowYearPicker(false);
                        }}
                        className={`block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${currentDate.getFullYear() === year ? 'bg-gray-200 dark:bg-gray-600 font-bold' : ''}`}
                      >
                        {year}年
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* 月選択 */}
              <div className="relative">
                <button 
                  type="button"
                  onClick={() => {
                    setShowMonthPicker(!showMonthPicker);
                    setShowYearPicker(false);
                  }}
                  className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-lg font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-w-[70px]"
                >
                  {currentDate.getMonth() + 1}月
                </button>
                {showMonthPicker && (
                  <div className="absolute top-full mt-1 left-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg z-50 max-h-60 overflow-y-auto min-w-[80px]">
                    {Array.from({length: 12}, (_, i) => i).map(month => (
                      <button
                        key={month}
                        type="button"
                        onClick={() => {
                          setCurrentDate(new Date(currentDate.getFullYear(), month, 1));
                          setShowMonthPicker(false);
                        }}
                        className={`block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 whitespace-nowrap ${currentDate.getMonth() === month ? 'bg-gray-200 dark:bg-gray-600 font-bold' : ''}`}
                      >
                        {month + 1}月
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button onClick={nextMonth} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
              →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0 mb-4">
            {['日', '月', '火', '水', '木', '金', '土'].map(day => (
              <div key={day} className="text-center font-semibold p-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                {day}
              </div>
            ))}
            {renderCalendar()}
          </div>

          <div className="flex flex-wrap gap-4 gap-y-1 mb-4 text-sm text-gray-500 dark:text-gray-400">            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <span>生理</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-200"></div>
              <span>次回生理予測</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-300"></div>
              <span>妊娠可能日</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-yellow-300"></div>
              <span>PMS予測</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-orange-300"></div>
              <span>体調</span>
            </div>
            {useIntercourseRecord && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-gray-300"></div>
                <span>SEX</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 mb-4">
            <button 
              onClick={() => setShowBulkAddModal(true)}
              className="flex-1 px-3 py-2 rounded text-sm flex items-center justify-center gap-2 text-gray-700 dark:text-gray-900"
              style={{backgroundColor: '#C2D2DA'}}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#91AEBD'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#C2D2DA'}
            >
              <i className="fa-solid fa-calendar-plus"></i>
              <span>データ一括登録</span>
            </button>
            <button 
              onClick={() => setCurrentView('settings')}
              className="flex-1 px-3 py-2 rounded text-sm flex items-center justify-center gap-2 text-gray-700 dark:text-gray-900"
              style={{backgroundColor: '#C2D2DA'}}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#91AEBD'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#C2D2DA'}
            >
              <i className="fa-solid fa-arrows-rotate"></i>
              <span>同期設定</span>
            </button>
          </div>
        </>
      )}

      {currentView === 'stats' && (
        <StatsView 
          records={records} 
          getAverageCycle={getAverageCycle} 
          getAveragePeriodLength={getAveragePeriodLength} 
          setShowIntercourseList={setShowIntercourseList} 
          useIntercourseRecord={useIntercourseRecord}
        />
      )}

      {currentView === 'settings' && (
        <SettingsView 
          isGoogleAuthed={isGoogleAuthed}
          handleLogout={handleLogout}
          setShowBulkAddModal={setShowBulkAddModal}
          setShowRecordsList={setShowRecordsList}
          setShowDeleteConfirm={setShowDeleteConfirm}
          setCurrentView={setCurrentView}
          records={records}
          setRecords={setRecords}
          syncSettings={syncSettings}
          setSyncSettings={setSyncSettings}
          getAverageCycle={getAverageCycle}
          getFertileDays={getFertileDays}
          getPMSDays={getPMSDays}
          getNextPeriodDays={getNextPeriodDays}
          useIntercourseRecord={useIntercourseRecord}
          setUseIntercourseRecord={setUseIntercourseRecord}
        />
      )}

      {showAddModal && (
        <AddModal
          selectedDate={selectedDate}
          modalType={modalType}
          setModalType={setModalType}
          addPeriodRecord={addPeriodRecord}
          addIntercourseRecord={addIntercourseRecord}
          addHealthRecord={addHealthRecord}
          setShowAddModal={setShowAddModal}
          currentDate={currentDate}
          getAveragePeriodLength={getAveragePeriodLength}
          useIntercourseRecord={useIntercourseRecord}
        />
      )}

      {showDeleteConfirm && (
        <DeleteConfirmModal
          deleteCalendar={deleteCalendar}
          setDeleteCalendar={setDeleteCalendar}
          handleDeleteData={handleDeleteData}
          setShowDeleteConfirm={setShowDeleteConfirm}
        />
      )}

      {showBulkAddModal && (
        <BulkAddModal
          bulkRecords={bulkRecords}
          setBulkRecords={setBulkRecords}
          bulkPickerState={bulkPickerState}
          setBulkPickerState={setBulkPickerState}
          formatBulkDisplayDate={formatBulkDisplayDate}
          addBulkRecord={addBulkRecord}
          removeBulkRecord={removeBulkRecord}
          updateBulkRecord={updateBulkRecord}
          submitBulkRecords={submitBulkRecords}
          setShowBulkAddModal={setShowBulkAddModal}
          currentDate={currentDate}
        />
      )}

      {showRecordsList && (
        <RecordsList
          records={records}
          onClose={() => setShowRecordsList(false)}
          onEdit={(period) => setEditingPeriod(period)}
          onDelete={(id) => setDeletingPeriodId(id)}
        />
      )}

      {editingPeriod && (
        <EditPeriodModal
          period={editingPeriod}
          updatePeriod={updatePeriod}
          setEditingPeriod={setEditingPeriod}
        />
      )}

      {deletingPeriodId && (
        <DeletePeriodModal
          deletePeriod={deletePeriod}
          deletingPeriodId={deletingPeriodId}
          setDeletingPeriodId={setDeletingPeriodId}
        />
      )}

      {showIntercourseList && (
        <IntercourseList
          records={records.intercourse}
          onClose={() => setShowIntercourseList(false)}
          onEdit={(record) => setEditingIntercourse(record)}
          onDelete={(id) => setDeletingIntercourseId(id)}
        />
      )}

      {showDayDetailModal && selectedDayData && (
        <DayDetailModal
          date={selectedDayData.date}
          periods={selectedDayData.periods}
          intercourse={selectedDayData.intercourse}
          health={selectedDayData.health}
          onClose={() => setShowDayDetailModal(false)}
          onEditPeriod={(period: Period) => {
            setEditingPeriod(period);
            setShowDayDetailModal(false);
          }}
          onDeletePeriod={(id: number) => {
            setDeletingPeriodId(id);
            setShowDayDetailModal(false);
          }}
          onEditIntercourse={(record: IntercourseRecord) => {
            setEditingIntercourse(record);
            setShowDayDetailModal(false);
          }}
          onDeleteIntercourse={(id: number) => {
            setDeletingIntercourseId(id);
            setShowDayDetailModal(false);
          }}
          onEditHealth={(record: HealthRecord) => {
            setEditingHealth(record);
            setShowDayDetailModal(false);
          }}
          onDeleteHealth={(id: number) => {
            setDeletingHealthId(id);
            setShowDayDetailModal(false);
          }}
          onAddNew={async () => {
            setSelectedDate(selectedDayData.date);
            setShowDayDetailModal(false);
            setShowAddModal(true);
          }}
          useIntercourseRecord={useIntercourseRecord}
        />
      )}

      {editingIntercourse && (
        <EditIntercourseModal
          record={editingIntercourse}
          updateIntercourse={updateIntercourse}
          setEditingIntercourse={setEditingIntercourse}
        />
      )}

      {deletingIntercourseId && (
        <DeleteIntercourseModal
          deleteIntercourse={deleteIntercourse}
          deletingIntercourseId={deletingIntercourseId}
          setDeletingIntercourseId={setDeletingIntercourseId}
        />
      )}

      {editingHealth && (
        <EditHealthModal
          record={editingHealth}
          updateHealth={updateHealth}
          setEditingHealth={setEditingHealth}
        />
      )}

      {deletingHealthId && (
        <DeleteHealthModal
          deleteHealth={deleteHealth}
          deletingHealthId={deletingHealthId}
          setDeletingHealthId={setDeletingHealthId}
        />
      )}

      {showInitialSyncModal && (
        <InitialSyncModal
          onSave={handleSaveSyncSettings}
        />
      )}

      {notification && (
        <NotificationModal
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {currentView === 'calendar' && (
        <>
          {/* テキスト広告 */}
          <CalendarTextAd />
        </>
      )}

      {/* フッター：コピーライト */}
      <footer className="mt-4 pt-4 pb-4">
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            ©TukiCale 2025
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PeriodTrackerApp;