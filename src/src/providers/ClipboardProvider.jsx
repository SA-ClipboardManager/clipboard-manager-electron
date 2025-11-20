import React, { createContext, useContext } from 'react';
import useClipboardRecords from '../utils/useClipboardRecords'; // 훅 경로를 맞춰주세요

// Context 생성
const ClipboardContext = createContext(null);

// Provider 컴포넌트
export const ClipboardProvider = ({ children }) => {
  const clipboard = useClipboardRecords(); // 훅 호출
  return <ClipboardContext.Provider value={clipboard}>{children}</ClipboardContext.Provider>;
};

// 소비자 헬퍼 훅
export const useClipboard = () => {
  const ctx = useContext(ClipboardContext);
  if (!ctx) {
    throw new Error('useClipboard must be used inside ClipboardProvider');
  }
  return ctx;
};
