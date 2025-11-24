import './App.css';
import './index.css';
import React, { useState, useEffect } from 'react';
import './styles/color.css';
import './styles/typography.css';

import closeUrl from '../assets/X.svg';

import BottomBar from './feature/Bottom/BottomBar';
import SearchBar from './feature/Search/SearchBar';
import FilterBar from './feature/Filter/FilterBar';
import MainView from './feature/MainView/MainView';
import { useClipboard } from './providers/ClipboardProvider';
import { closeWindow } from './utils/electronService';

const App = () => {
  const [loginInfo, setLoginInfo] = useState({ isLoggedIn: false, userId: null });
  const [isTagChecked, setIsTagChecked] = useState(true);
  const { items, refetch, toggleSelect, addItem, setItemsFromSearchResult, getSelectedItemIds, setItems } = useClipboard();
  const [sinceRaw, setSinceRaw] = useState('');
  const [untilRaw, setUntilRaw] = useState('');
  const [fileType, setFileType] = useState('all');

  // 입력 상태 (FilterBar에서 입력하는 값)
  const [sinceInput, setSinceInput] = useState('');
  const [untilInput, setUntilInput] = useState('');
  const [locationInput, setLocationInput] = useState('All');

  // 실제 필터링에 사용할 적용 상태
  const [sinceFilter, setSinceFilter] = useState('');
  const [untilFilter, setUntilFilter] = useState('');
  const [filteredItems, setFilteredItems] = useState([]);
  const [locationFilter, setLocationFilter] = useState('All');

  useEffect(() => {
    if (!Array.isArray(items)) return;

    const filtered = items.filter((item) => {
      // Location 필터
      if (locationFilter === 'Local' && item.shared !== 'local') return false;
      if (locationFilter === 'Cloud' && item.shared !== 'cloud') return false;

      // 날짜 필터
      const ts = item.timestamp;
      const date = new Date(ts * 1000);
      const yyyymmdd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

      if (sinceFilter && yyyymmdd < sinceFilter) return false;
      if (untilFilter && yyyymmdd > untilFilter) return false;

      return true;
    });

    setFilteredItems(filtered);
  }, [items, sinceFilter, untilFilter, locationFilter]);

  return (
    <>
      <div
        className="w-full h-full bg-white opacity-87  p-0 overflow-hidden  "
        style={{ WebkitAppRegion: 'drag' }}
      >
        {/* 최상단 손잡이, 닫기 버튼 */}
        <div className="pt-[1.6rem] pb-[2.1rem] flex justify-center relative">
          {/*  손잡이 */}
          <div className="w-[5.6rem]  h-[0.2rem] bg-[var(--blue-200)] [border-[var(--blue-200)]"></div>
          {/* 닫기 버튼  */}
          <div className="absolute z-50 right-8 top-5">
            <img
              src={closeUrl}
              alt="닫기 버튼 "
              style={{ WebkitAppRegion: 'no-drag' }}
              onClick={() => closeWindow()}
            />
          </div>
        </div>
        <div className=" !bg-white/70 px-[3rem]  max-h-[41.7rem]">
          {/* search-bar-zone */}
          <div className="">
            <SearchBar
              setItemsFromSearchResult={setItemsFromSearchResult}
              refetch={refetch}
              loginInfo={loginInfo}
              setLoginInfo={setLoginInfo}
            />
          </div>
          {/* Tag, 필터 2개 zone */}
          <div className="">
            <FilterBar
              isTagChecked={isTagChecked}
              setIsTagChecked={setIsTagChecked}
              sinceInput={sinceInput}
              setSinceInput={setSinceInput}
              untilInput={untilInput}
              setUntilInput={setUntilInput}
              locationInput={locationInput}
              setLocationInput={setLocationInput}
              setLocationFilter={setLocationFilter}
              onApplyFilters={() => {
                setSinceFilter(sinceInput);
                setUntilFilter(untilInput);
                setLocationFilter(locationInput);
              }}
              fileType={fileType}
              setFileType={setFileType}
            />
          </div>
          {/* grid-view 데이터 존 */}
          <div className="">
            <MainView
              isTagChecked={isTagChecked}
              // items={items}
              items={filteredItems}
              refetch={refetch}
              addItem={addItem}
              toggleSelect={toggleSelect}
              fileType={fileType}
              setFileType={setFileType}
            />
          </div>
          {/* 하단 bar */}
        </div>
        <div className="fixed bottom-[2rem] left-[3rem] w-full z-50">
          <BottomBar
            // selectedIds={selectedIds}
            getSelectedItemIds={getSelectedItemIds}
            refetch={refetch}
            setItems={setItems}
            loginInfo={loginInfo}
          />
        </div>
      </div>
    </>
  );
};

export default App;
