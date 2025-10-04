"use client"

import React, { useState, useEffect } from 'react';

type Period = {
  id: number;
  startDate: string;
  endDate: string;
  days: number;
};

type IntercourseRecord = {
  id: number;
  date: string;
  contraception: string;
  partner: string;
  memo: string;
};

type Records = {
  periods: Period[];
  intercourse: IntercourseRecord[];
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

const loadFromDrive = async () => {
  const token = await getAccessToken();
  if (!token) return null;
  
  try {
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FILE_NAME}'&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    if (!searchResponse.ok) throw new Error('Drive search failed');
    
    const searchData = await searchResponse.json();
    
    if (searchData.files && searchData.files.length > 0) {
      const fileId = searchData.files[0].id;
      
      const fileResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!fileResponse.ok) throw new Error('Drive read failed');
      
      return await fileResponse.json();
    }
    
    return null;
  } catch (error) {
    console.error('Load from Drive error:', error);
    return null;
  }
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
    const eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${new Date(new Date().getFullYear() - 1, 0, 1).toISOString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    if (eventsResponse.ok) {
      const eventsData = await eventsResponse.json() as { items?: Array<{ id: string }> };
      for (const event of eventsData.items || []) {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${event.id}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          }
        );
      }
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
    
    if (settings.fertile && records.periods.length >= 2) {
      const fertileDays = getFertileDays();
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
    
    if (settings.pms && records.periods.length >= 2) {
      const pmsDays = getPMSDays();
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
    
    if (settings.period && records.periods.length >= 2) {
      const nextPeriodDays = getNextPeriodDays();
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

const PeriodTrackerApp = () => {
  const [currentView, setCurrentView] = useState('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [records, setRecords] = useState<Records>({
    periods: [],
    intercourse: []
  });
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
    intercourse: false
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
  } | null>(null);
  const [deletingIntercourseId, setDeletingIntercourseId] = useState<number | null>(null);
  const [editingIntercourse, setEditingIntercourse] = useState<IntercourseRecord | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

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
      // 新規ログイン（OAuth リダイレクト後）
      localStorage.setItem('tukicale_access_token', token);
      if (refreshToken) {
        localStorage.setItem('tukicale_refresh_token', refreshToken);
      }
      setIsGoogleAuthed(true);
      setShowLoginScreen(false);

      window.history.replaceState({}, '', '/');
            // Googleドライブからデータ読み込み
      loadFromDrive().then(driveData => {
        if (driveData) {
          setRecords(driveData);
        }
      });

      // データがない場合かつ初期設定が未完了の場合のみ、初期設定モーダルを表示
      if (!hasCompletedInitialSetup && !hasData) {
        setShowInitialSyncModal(true);
      } else if (hasData && !hasCompletedInitialSetup) {
        // データがある場合は、自動的に初期設定完了フラグを立てる
        localStorage.setItem('tukicale_initial_setup_completed', 'true');
      }
} else if (savedToken) {
      // 既存ログイン（トークンが保存されている）
      setIsGoogleAuthed(true);
      setShowLoginScreen(false);
      
      // Googleドライブからデータ読み込み
      loadFromDrive().then(driveData => {
        if (driveData) {
          setRecords(driveData);
        }
      });
      
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
    return date.toISOString().split('T')[0];
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
    
    const fertile = getFertileDays().includes(dateStr);
    const pms = getPMSDays().includes(dateStr);
    const nextPeriod = getNextPeriodDays().includes(dateStr);
    
    return { period, intercourse, fertile, pms, nextPeriod };
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

  const getFertileDays = () => {
    if (records.periods.length === 0) return [];
    
    const lastPeriod = [...records.periods].sort((a, b) => 
      new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    )[0];
    
    const avgCycle = getAverageCycle();
    const ovulationDay = new Date(lastPeriod.startDate);
    ovulationDay.setDate(ovulationDay.getDate() + avgCycle - 14);
    
    const fertileDays = [];
    for (let i = -3; i <= 3; i++) {
      const day = new Date(ovulationDay);
      day.setDate(day.getDate() + i);
      fertileDays.push(formatDate(day));
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
    
    const pmsDays = [];
    for (let i = -10; i <= -3; i++) {
      const day = new Date(nextPeriod);
      day.setDate(day.getDate() + i);
      pmsDays.push(formatDate(day));
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
 
  const nextPeriodDays = [];
  for (let i = 0; i < avgPeriodLength; i++) {
    const day = new Date(nextPeriodStart);
    day.setDate(day.getDate() + i);
    nextPeriodDays.push(formatDate(day));
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
    
    // その日のSEX記録を取得
    const dayIntercourse = records.intercourse.filter(i => i.date === dateStr);
    
    // 記録がある場合は詳細モーダル、ない場合は追加モーダル
    if (dayPeriods.length > 0 || dayIntercourse.length > 0) {
      setSelectedDayData({
        date,
        periods: dayPeriods,
        intercourse: dayIntercourse
      });
      setShowDayDetailModal(true);
    } else {
      setSelectedDate(date);
      setShowAddModal(true);
    }
  };

const addPeriodRecord = (startDate: string, endDate: string) => {
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
    saveToDrive(newRecords);
    syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
  
    setShowAddModal(false);
  };

const updatePeriod = (id: number, startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
    const newRecords = {
      ...records,
      periods: records.periods.map(p => p.id === id ? { ...p, startDate, endDate, days } : p)
    };
    
    setRecords(newRecords);
    saveToDrive(newRecords);
    syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
    setEditingPeriod(null);
    setNotification({
      message: '✓ 生理記録を更新しました',
      type: 'success'
    });
  };

const deletePeriod = (id: number) => {
    const newRecords = {
      ...records,
      periods: records.periods.filter(p => p.id !== id)
    };
    
    setRecords(newRecords);
    saveToDrive(newRecords);
    syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
    setDeletingPeriodId(null);
    setNotification({
      message: '✓ 生理記録を削除しました',
      type: 'success'
    });
  };

const deleteIntercourse = (id: number) => {
    const newRecords = {
      ...records,
      intercourse: records.intercourse.filter(i => i.id !== id)
    };
    
    setRecords(newRecords);
    saveToDrive(newRecords);
    syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
    setDeletingIntercourseId(null);
    setNotification({
      message: '✓ SEX記録を削除しました',
      type: 'success'
    });
  };

const updateIntercourse = (id: number, date: string, contraception: string, partner: string, memo: string) => {
    const newRecords = {
      ...records,
      intercourse: records.intercourse.map(i => 
        i.id === id ? { ...i, date, contraception, partner, memo } : i
      )
    };
    
    setRecords(newRecords);
    saveToDrive(newRecords);
    syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
    setEditingIntercourse(null);
    setNotification({
      message: '✓ SEX記録を更新しました',
      type: 'success'
    });
  };

const addIntercourseRecord = (date: string, contraception: string, partner: string, memo: string) => {
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
    saveToDrive(newRecords);
    syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
    
    setShowAddModal(false);
  };

  const renderCalendar = () => {
    const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);
    const days = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="h-20 border border-gray-100 dark:border-gray-700"></div>);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const { period, intercourse, fertile, pms, nextPeriod } = getRecordForDate(day);
      
      days.push(
        <div
          key={day}
          onClick={() => handleDayClick(day)}
          className={`h-20 border border-gray-100 dark:border-gray-700 p-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 dark:bg-gray-800 relative
            ${isToday(day) ? 'bg-blue-50 border-blue-300' : ''}`}
        >
          <div className="text-sm font-medium">{day}</div>
          <div className="flex flex-wrap gap-0.5 mt-1">
            {period && <div className="w-2 h-2 rounded-full bg-red-300" title="生理"></div>}
            {nextPeriod && !period && <div className="w-2 h-2 rounded-full bg-red-200" title="次回生理予測"></div>}
            {fertile && <div className="w-2 h-2 rounded-full bg-green-300" title="妊娠可能日"></div>}
            {pms && <div className="w-2 h-2 rounded-full bg-yellow-300" title="PMS予測"></div>}
            {intercourse && <div className="w-2 h-2 rounded-full bg-gray-300" title="SEX"></div>}
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

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentDate(new Date(parseInt(e.target.value), currentDate.getMonth(), 1));
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentDate(new Date(currentDate.getFullYear(), parseInt(e.target.value), 1));
  };

  const handleGoogleLogin = () => {
    setIsLoading(true);
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/api/auth`;
    const scope = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/calendar.events',
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
  localStorage.removeItem('tukicale_sync_settings');
  localStorage.removeItem('tukicale_initial_setup_completed');
  setIsGoogleAuthed(false);
  setShowLoginScreen(true);
  setSyncSettings({
    period: true,
    fertile: true,
    pms: true,
    intercourse: false
  });
};

  const handleDeleteData = () => {
    setRecords({
      periods: [],
      intercourse: []
    });
    localStorage.removeItem('myflow_data');
    
    if (deleteCalendar) {
      setNotification({
        message: '✓ アプリ内のデータとGoogleカレンダーのイベントを削除しました',
        type: 'success'
      });
    } else {
      setNotification({
        message: '✓ アプリ内のデータを削除しました\nGoogleカレンダーのイベントは残っています',
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
          endDateObj.setDate(startDateObj.getDate() + 6);
          updated.endDate = formatDate(endDateObj);
        }
        return updated;
      }
      return r;
    }));
  };

const submitBulkRecords = () => {
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
    saveToDrive(newRecords);
    syncToCalendar(newRecords, syncSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);

    setNotification({
      message: `✓ ${validRecords.length}件の生理期間を登録しました`,
      type: 'success'
    });
    setShowBulkAddModal(false);
    setBulkRecords([{ id: 1, startDate: '', endDate: '' }]);
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
    syncToCalendar(records, newSettings, getAverageCycle, getFertileDays, getPMSDays, getNextPeriodDays);
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
            <i className="fa-solid fa-table text-gray-600 dark:text-gray-300"></i>
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
            <div className="flex gap-2 items-center">
              <select 
                value={currentDate.getFullYear()} 
                onChange={handleYearChange}
                className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-lg font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {Array.from({length: 11}, (_, i) => new Date().getFullYear() - 10 + i).map(year => (
                  <option key={year} value={year}>{year}年</option>
                ))}
              </select>
              <select 
                value={currentDate.getMonth()} 
                onChange={handleMonthChange}
                className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-lg font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {Array.from({length: 12}, (_, i) => i).map(month => (
                  <option key={month} value={month}>{month + 1}月</option>
                ))}
              </select>
            </div>
            <button onClick={nextMonth} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
              →
            </button>
          </div>

          <div className="flex gap-2 mb-4">
            <button 
              onClick={() => setShowBulkAddModal(true)}
              className="flex-1 bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm hover:bg-blue-100 flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-calendar-plus"></i>
              <span>過去データ一括登録</span>
            </button>
            <button 
              onClick={() => setCurrentView('settings')}
              className="flex-1 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-2 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-arrows-rotate"></i>
              <span>同期設定</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-4 mb-4 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-300"></div>
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
              <div className="w-3 h-3 rounded-full bg-gray-300"></div>
              <span>SEX</span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-0 mb-4">
            {['日', '月', '火', '水', '木', '金', '土'].map(day => (
              <div key={day} className="text-center font-semibold p-2 bg-gray-50 dark:bg-gray-800">
                {day}
              </div>
            ))}
            {renderCalendar()}
          </div>
        </>
      )}

      {currentView === 'stats' && (
        <StatsView records={records} getAverageCycle={getAverageCycle} setShowIntercourseList={setShowIntercourseList} />
      )}

      {currentView === 'settings' && (
        <SettingsView 
          isGoogleAuthed={isGoogleAuthed}
          handleLogout={handleLogout}
          setShowBulkAddModal={setShowBulkAddModal}
          setShowRecordsList={setShowRecordsList}
          setShowDeleteConfirm={setShowDeleteConfirm}
          setCurrentView={setCurrentView}
        />
      )}

      {showAddModal && (
        <AddModal
          selectedDate={selectedDate}
          modalType={modalType}
          setModalType={setModalType}
          addPeriodRecord={addPeriodRecord}
          addIntercourseRecord={addIntercourseRecord}
          setShowAddModal={setShowAddModal}
          currentDate={currentDate}
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
          onClose={() => setShowDayDetailModal(false)}
          onEditPeriod={(period) => {
            setEditingPeriod(period);
            setShowDayDetailModal(false);
          }}
          onDeletePeriod={(id) => {
            setDeletingPeriodId(id);
            setShowDayDetailModal(false);
          }}
          onEditIntercourse={(record) => {
            setEditingIntercourse(record);
            setShowDayDetailModal(false);
          }}
          onDeleteIntercourse={(id) => {
            setDeletingIntercourseId(id);
            setShowDayDetailModal(false);
          }}
          onAddNew={() => {
            setSelectedDate(selectedDayData.date);
            setShowDayDetailModal(false);
            setShowAddModal(true);
          }}
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
    </div>
  );
};

const StatsView = ({ records, getAverageCycle, setShowIntercourseList }: {
  records: Records;
  getAverageCycle: () => number;
  setShowIntercourseList: (show: boolean) => void;
}) => (
  <div className="space-y-4">
    <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">マイデータ</h2>
    
    <div className="bg-pink-50 dark:bg-gray-800 p-4 rounded-lg">
      <div className="text-sm text-gray-600 dark:text-gray-300">平均周期</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-gray-900 dark:text-gray-100">{getAverageCycle()}日</div>
    </div>
    
    <div className="bg-purple-50 dark:bg-gray-800 p-4 rounded-lg">
      <div className="text-sm text-gray-600 dark:text-gray-300">次回生理予定</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-gray-900 dark:text-gray-100">
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
      </div>
    </div>
    
    <div className="bg-blue-50 dark:bg-gray-800 p-4 rounded-lg">
      <div className="text-sm text-gray-600 dark:text-gray-300">記録された生理回数</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-gray-900 dark:text-gray-100">{records.periods.length}回</div>
    </div>

    {records.intercourse.length > 0 && (
      <div className="bg-green-50 dark:bg-gray-800 p-4 rounded-lg">
        <div className="text-sm text-gray-600 dark:text-gray-300">SEX記録</div>
        <button 
          onClick={() => setShowIntercourseList(true)}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          詳細を確認
        </button>
      </div>
    )}
  </div>
);

const SettingsView = ({ isGoogleAuthed, handleLogout, setShowBulkAddModal, setShowRecordsList, setShowDeleteConfirm, setCurrentView }: {
  isGoogleAuthed: boolean;
  handleLogout: () => void;
  setShowBulkAddModal: (show: boolean) => void;
  setShowRecordsList: (show: boolean) => void;
  setShowDeleteConfirm: (show: boolean) => void;
  setCurrentView: (view: string) => void;
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
        <button 
          onClick={handleLogout}
          className="w-full border border-red-300 text-red-600 px-4 py-2 rounded hover:bg-red-50"
        >
          ログアウト
        </button>
      )}
    </div>

    <SyncSettings />
    <HelpSection setCurrentView={setCurrentView} />

    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">過去データ一括登録</h3>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
        手帳やメモの記録を登録・編集・削除できます
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        ※1度に20件登録できます
      </p>
      <div className="space-y-2">
        <button 
          onClick={() => setShowBulkAddModal(true)}
          className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
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
          className="w-full border border-red-300 text-red-600 px-4 py-2 rounded hover:bg-red-50"
        >
          すべてのデータを削除
        </button>
      </div>
    </div>
  </div>
);

const SyncSettings = () => {
  const [showIntercourseInfo, setShowIntercourseInfo] = useState(false);
  const [localSettings, setLocalSettings] = useState<SyncSettings>({
    period: true,
    fertile: true,
    pms: true,
    intercourse: false
  });

  useEffect(() => {
    const saved = localStorage.getItem('tukicale_sync_settings');
    if (saved) {
      setLocalSettings(JSON.parse(saved));
    }
  }, []);

  const handleChange = (key: keyof SyncSettings, value: boolean) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    localStorage.setItem('tukicale_sync_settings', JSON.stringify(newSettings));
  };

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">同期設定</h3>
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input 
            type="checkbox" 
            checked={localSettings.period}
            onChange={(e) => handleChange('period', e.target.checked)}
          />
          <span className="text-sm text-gray-900 dark:text-gray-100">生理期間を同期</span>
        </label>
        <label className="flex items-center gap-2">
          <input 
            type="checkbox" 
            checked={localSettings.fertile}
            onChange={(e) => handleChange('fertile', e.target.checked)}
          />
          <span className="text-sm text-gray-900 dark:text-gray-100">妊娠可能日を同期</span>
        </label>
        <label className="flex items-center gap-2">
          <input 
            type="checkbox" 
            checked={localSettings.pms}
            onChange={(e) => handleChange('pms', e.target.checked)}
          />
          <span className="text-sm text-gray-900 dark:text-gray-100">PMS予測を同期</span>
        </label>
        <div>
          <label className="flex items-center gap-2">
            <input 
              type="checkbox" 
              checked={localSettings.intercourse}
              onChange={(e) => handleChange('intercourse', e.target.checked)}
            />
            <span className="text-sm text-gray-900 dark:text-gray-100">SEXを同期</span>
            <button type="button" onClick={() => setShowIntercourseInfo(!showIntercourseInfo)} className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 flex items-center justify-center text-xs text-gray-900 dark:text-gray-100">
              ⓘ
            </button>
          </label>
          {showIntercourseInfo && (
            <div className="mt-2 p-3 bg-blue-50 dark:bg-gray-800 rounded text-xs text-gray-700 dark:text-gray-300 dark:text-gray-300">
              <p className="font-semibold mb-1">📅 カレンダーに表示される内容：</p>
              <p className="mb-2">「●」などの記号のみ（カスタマイズ可能）</p>
              <p className="font-semibold mb-1">🔒 同期されない情報：</p>
              <ul className="list-disc ml-4">
                <li>パートナー名</li>
                <li>避妊具使用状況</li>
                <li>メモ</li>
              </ul>
              <p className="mt-2 text-gray-600 dark:text-gray-300">詳細情報はアプリ内にのみ保存されます。</p>
            </div>
          )}
        </div>
      </div>
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
                  <li>私たち（開発者）はデータを見ることができません</li>
                  <li>第三者に共有されません</li>
                  <li>性交日の詳細情報はGoogleカレンダーには表示されません。入力があれば、マイデータのみで表示されます</li>
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
                    className="inline-flex items-center px-1 py-0.5 rounded hover:bg-gray-200"
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
              <i className="fa-solid fa-table text-gray-600 dark:text-gray-300 text-xs"></i>
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
                <span className="text-red-600">⚠️</span>
                Googleカレンダーで直接編集・削除しないでください
              </span>
              <span>{expandedSection === 'calendarWarning' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'calendarWarning' && (
              <div className="mt-2 p-3 bg-white dark:bg-gray-900 rounded text-sm text-gray-700 dark:text-gray-300 border-2 border-red-200">
                <p className="mb-3 font-semibold text-red-700">Googleカレンダー側で変更しないでください</p>
                <p className="mb-2"><strong>理由：</strong></p>
                <ul className="list-disc ml-4 space-y-1 mb-3">
                  <li>Googleカレンダー側で変更しても、TukiCaleには反映されません</li>
                  <li>TukiCaleで再同期すると、カレンダーの手動変更は上書きされます</li>
                  <li>データの整合性が保てなくなる可能性があります</li>
                </ul>
                <p className="font-semibold text-blue-700 mb-1">✅ 正しい使い方：</p>
                <p>すべての編集・削除は<strong>TukiCaleアプリ内</strong>で行ってください。</p>
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">Googleカレンダーは「表示用」として使用します。</p>
              </div>
            )}
          </div>

          <div className="border rounded-lg mt-4">
            <button onClick={() => toggleSection('contact')} className="w-full text-left py-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded-t-lg border-b flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <i className="fa-solid fa-envelope text-gray-600 dark:text-gray-300"></i> TikTokでご連絡ください
                フィードバック・機能リクエスト
              </span>
              <span>{expandedSection === 'contact' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'contact' && (
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <p className="mb-2">バグ報告や機能リクエストをお待ちしています！</p>
                  <p className="mb-2"><strong>TikTokでご連絡ください：</strong></p>
                  <p className="mb-2">
                    <a 
                      href="https://www.tiktok.com/@tukicale_app" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      @tukicale_app
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
            @tukicale_app
          </a>）のコメント欄よりお願いいたします。
        </p>

        <p className="text-gray-600 dark:text-gray-300 mt-6">最終更新日：2025年1月1日</p>
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

        <p className="text-gray-600 dark:text-gray-300 mt-6">最終更新日：2025年1月1日</p>
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
                <span className="text-green-500 text-xs font-bold">✓</span>
              </div>
              <div>
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
  const [viewDate, setViewDate] = useState<Date>(
    selectedDate ? new Date(selectedDate) : today
  );
  
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
    <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 w-80">
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-900 dark:text-gray-100">←</button>
        <div className="flex items-center gap-2">
          <select 
            value={viewDate.getFullYear()} 
            onChange={(e) => setViewDate(new Date(parseInt(e.target.value), viewDate.getMonth(), 1))}
            className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            {Array.from({length: 11}, (_, i) => currentYear - 10 + i).map(year => (
              <option key={year} value={year}>{year}年</option>
            ))}
          </select>
          <span className="font-semibold">{viewDate.getMonth() + 1}月</span>
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
  );
};

const PeriodForm = ({ selectedDate, onSubmit, onCancel }: {
  selectedDate: Date | null;
  onSubmit: (startDate: string, endDate: string) => void;
  onCancel: () => void;
}) => {
  const formatLocalDate = (date: Date | null): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState(formatLocalDate(selectedDate));
  const [endDate, setEndDate] = useState(formatLocalDate(selectedDate));
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
        <button type="button" onClick={onCancel} className="flex-1 border px-4 py-2 rounded">キャンセル</button>
        <button type="button" onClick={(e) => { e.preventDefault(); onSubmit(startDate, endDate); }} className="flex-1 bg-red-400 text-white px-4 py-2 rounded hover:bg-red-500">保存</button>
      </div>
    </div>
  );
};

const EditPeriodForm = ({ period, onSubmit, onCancel }: {
  period: Period;
  onSubmit: (startDate: string, endDate: string) => void;
  onCancel: () => void;
}) => {
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
        <button type="button" onClick={onCancel} className="flex-1 border px-4 py-2 rounded">キャンセル</button>
        <button type="button" onClick={() => onSubmit(startDate, endDate)} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">更新</button>
      </div>
    </div>
  );
};

const IntercourseForm = ({ selectedDate, onSubmit, onCancel }: {
  selectedDate: Date | null;
  onSubmit: (date: string, contraception: string, partner: string, memo: string) => void;
  onCancel: () => void;
}) => {
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
        <select value={contraception} onChange={(e) => setContraception(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
          <option value="不明" className="text-gray-900 dark:text-gray-100">❓ 不明</option>
          <option value="使用" className="text-gray-900 dark:text-gray-100">✅ 使用</option>
          <option value="不使用" className="text-gray-900 dark:text-gray-100">❌ 不使用</option>
        </select>
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
        <button type="button" onClick={onCancel} className="flex-1 border px-4 py-2 rounded">キャンセル</button>
        <button type="button" onClick={(e) => { e.preventDefault(); onSubmit(date, contraception, partner, memo); }} className="flex-1 bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-8000">保存</button>
      </div>
    </div>
  );
};

const AddModal = ({ selectedDate, modalType, setModalType, addPeriodRecord, addIntercourseRecord, setShowAddModal, currentDate }: {
  selectedDate: Date | null;
  modalType: string;
  setModalType: (type: string) => void;
  addPeriodRecord: (startDate: string, endDate: string) => void;
  addIntercourseRecord: (date: string, contraception: string, partner: string, memo: string) => void;
  setShowAddModal: (show: boolean) => void;
  currentDate: Date;
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full my-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
        {selectedDate && `${currentDate.getFullYear()}/${currentDate.getMonth() + 1}/${selectedDate.getDate()}`} の記録
      </h3>
      
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setModalType('period')}
          className={`flex-1 py-2 rounded ${modalType === 'period' ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
        >
          生理
        </button>
        <button
          onClick={() => setModalType('intercourse')}
          className={`flex-1 py-2 rounded text-sm ${modalType === 'intercourse' ? 'bg-gray-400 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
        >
          SEX
        </button>
      </div>

      {modalType === 'period' ? (
        <PeriodForm 
          selectedDate={selectedDate}
          onSubmit={addPeriodRecord}
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
          className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
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
  submitBulkRecords: () => void;
  setShowBulkAddModal: (show: boolean) => void;
  currentDate: Date;
}) => (
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
          onClick={submitBulkRecords}
          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          一括登録（{bulkRecords.filter(r => r.startDate && r.endDate).length}件）
        </button>
      </div>
    </div>
  </div>
);

const EditPeriodModal = ({ period, updatePeriod, setEditingPeriod }: {
  period: Period;
  updatePeriod: (id: number, startDate: string, endDate: string) => void;
  setEditingPeriod: (period: Period | null) => void;
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 10001}}>
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">生理記録を修正</h3>
      <EditPeriodForm
        period={period}
        onSubmit={(startDate, endDate) => updatePeriod(period.id, startDate, endDate)}
        onCancel={() => setEditingPeriod(null)}
      />
    </div>
  </div>
);

const DeletePeriodModal = ({ deletePeriod, deletingPeriodId, setDeletingPeriodId }: {
  deletePeriod: (id: number) => void;
  deletingPeriodId: number;
  setDeletingPeriodId: (id: number | null) => void;
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 10002}}>
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-sm w-full">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 text-red-600">記録を削除しますか？</h3>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">この操作は取り消せません</p>
      <div className="flex gap-2">
        <button onClick={() => setDeletingPeriodId(null)} className="flex-1 border px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800">キャンセル</button>
        <button onClick={() => deletePeriod(deletingPeriodId)} className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">削除する</button>
      </div>
    </div>
  </div>
);

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
                              <button onClick={() => onEdit(period)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded" title="修正">
                                <i className="fa-solid fa-pen-to-square"></i>
                              </button>
                              <button onClick={() => onDelete(period.id)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded" title="削除">
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
                              <button onClick={() => onEdit(record)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded" title="修正">
                                <i className="fa-solid fa-pen-to-square"></i>
                              </button>
                              <button onClick={() => onDelete(record.id)} className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded" title="削除">
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
    intercourse: false
  });
  const [showIntercourseInfo, setShowIntercourseInfo] = useState(false);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 10004}}>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold mb-2">同期設定</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Googleカレンダーに同期する情報を選択してください。<br/>
          後から設定ページでも変更できます。
        </p>
        
        <div className="space-y-3 mb-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={settings.period}
              onChange={(e) => setSettings({...settings, period: e.target.checked})}
              className="accent-blue-600"
            />
            <span className="text-sm text-gray-900 dark:text-gray-100">生理期間を同期</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={settings.fertile}
              onChange={(e) => setSettings({...settings, fertile: e.target.checked})}
              className="accent-blue-600"
            />
            <span className="text-sm text-gray-900 dark:text-gray-100">妊娠可能日を同期</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={settings.pms}
              onChange={(e) => setSettings({...settings, pms: e.target.checked})}
              className="accent-blue-600"
            />
            <span className="text-sm text-gray-900 dark:text-gray-100">PMS予測を同期</span>
          </label>
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.intercourse}
                  onChange={(e) => setSettings({...settings, intercourse: e.target.checked})}
                  className="accent-blue-600"
                />
                <span className="text-sm text-gray-900 dark:text-gray-100">SEXを同期</span>
                <button 
                  type="button" 
                  onClick={() => setShowIntercourseInfo(!showIntercourseInfo)} 
                  className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 flex items-center justify-center text-xs text-gray-900 dark:text-gray-100"
                >
                  ⓘ
                </button>
              </label>
            </div>
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

        <button 
          onClick={() => onSave(settings)}
          className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 font-medium"
        >
          設定を保存して始める
        </button>
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
        <p className="text-center whitespace-pre-line flex items-center justify-center min-h-[60px]">{message}</p>
        {type === 'error' && (
          <button 
            onClick={onClose}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium mt-4"
          >
            OK
          </button>
        )}
      </div>
    </div>
  );
};

const DayDetailModal = ({ date, periods, intercourse, onClose, onEditPeriod, onDeletePeriod, onEditIntercourse, onDeleteIntercourse, onAddNew }: {
  date: Date;
  periods: Period[];
  intercourse: IntercourseRecord[];
  onClose: () => void;
  onEditPeriod: (period: Period) => void;
  onDeletePeriod: (id: number) => void;
  onEditIntercourse: (record: IntercourseRecord) => void;
  onDeleteIntercourse: (id: number) => void;
  onAddNew: () => void;
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

          {intercourse.length > 0 && (
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
          <button onClick={onAddNew} className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
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
            <button type="button" onClick={() => updateIntercourse(record.id, date, contraception, partner, memo)} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">更新</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const DeleteIntercourseModal = ({ deleteIntercourse, deletingIntercourseId, setDeletingIntercourseId }: {
  deleteIntercourse: (id: number) => void;
  deletingIntercourseId: number;
  setDeletingIntercourseId: (id: number | null) => void;
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{zIndex: 10002}}>
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-sm w-full">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 text-red-600">SEX記録を削除しますか？</h3>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">この操作は取り消せません</p>
      <div className="flex gap-2">
        <button onClick={() => setDeletingIntercourseId(null)} className="flex-1 border px-4 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800">キャンセル</button>
        <button onClick={() => deleteIntercourse(deletingIntercourseId)} className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">削除する</button>
      </div>
    </div>
  </div>
);

export default PeriodTrackerApp;