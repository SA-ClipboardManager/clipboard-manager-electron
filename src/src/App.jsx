import { useState } from 'react';
import './App.css';
import './styles/color.css';
import './styles/typography.css';

import CloseIcon from './assets/X.svg';

import MainView from './features/MainView/MainView';

const App = () => {
  // 로그인
  // const [loginInfo, setLoginInfo] = useState({ isLoggedIn: false, userId: null });

  // clipboard monitor
  // const { item, refetch, toggleSelect, addItem, setItemFromSearchResult, getSelectedItemIds, setItem } = useClipboardRecords(); // TODO

  // TODO: 임시 상태 / 스텁 - 실제 훅으로 대체
  const [isTagChecked, setIsTagChecked] = useState(true);
  const [fileType, setFileType] = useState('all');
  const [filteredItems, setFilteredItems] = useState([]); // 실제 데이터로 교체

  // TODO: 스텁 (나중에 useClipboardRecords에서 제공하는 함수로 교체)
  const refetch = () => {};
  const addItem = () => {};
  const toggleSelect = () => {};

  return (
    <>
      <div className="container">
        <div className="top-bar">
          {/* 손잡이 */}
          <div className="handle"></div>

          {/* 닫기 버튼 */}
          <div className="close-button">
            <img
              src={CloseIcon}
              alt="닫기 버튼"
              onClick={() => window.electronAPI.closeWindow()} // TODO
            />
          </div>

          <div className="content">
            {/* TODO: 검색창 */}
            {/* <div>
              <SearchBar
                setItemsFromSearchResult={setItemsFromSearchResult}
                refetch={refetch}
                loginInfo={loginInfo}
                setLoginInfo={setLoginInfo}
              />
            </div> */}

            {/* TODO: 태그, 필터 */}
            {/*
            <div>
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
            */}

            {/* TODO: 기록보기 */}
            <div>
              <MainView
                isTagChecked={isTagChecked}
                items={filteredItems}
                refetch={refetch}
                addItem={addItem}
                toggleSelect={toggleSelect}
                fileType={fileType}
                setFileType={setFileType}
              />
            </div>
          </div>

          {/* TODO: 하단 */}
          {/*
          <div className="bottom-bar">
            <BottomBar
              getSelectedItemIds={getSelectedItemIds}
              refetch={refetch}
              setItems={setItems}
              loginInfo={loginInfo}
            />
          </div>
          */}
        </div>
      </div>
    </>
  );
};

export default App;
