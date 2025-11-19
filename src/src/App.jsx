import { useState } from 'react';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import './App.css';

function App() {
  const [count, setCount] = useState(0);

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
      <div>
        <a
          href="https://vite.dev"
          target="_blank"
        >
          <img
            src={viteLogo}
            className="logo"
            alt="Vite logo"
          />
        </a>
        <a
          href="https://react.dev"
          target="_blank"
        >
          <img
            src={reactLogo}
            className="logo react"
            alt="React logo"
          />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>count is {count}</button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">Click on the Vite and React logos to learn more</p>

      <div className="text-3xl font-bold text-red-500">Tailwind OK!</div>
    </>
  );
}

export default App;
