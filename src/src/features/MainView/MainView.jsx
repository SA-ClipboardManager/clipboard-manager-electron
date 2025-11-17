import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ItemCard from './ItemCard';
import ContextMenu from './ContextMenu';
import './MainView.module.css';

const MainView = ({ isTagChecked, item = [], toggleSelect, addItem, refetch, fileType = 'all', setFileType }) => {
  const [activeItemId, setActiveItemId] = useState(null);
  const containerRefs = useRef({});

  // 외부 클릭으로 컨텍스트 닫기
  const handlePaste = useCallback(async (id) => {
    try {
      const res = await window.electronAPI.pasteItem(id);
      if (!res.paste) console.warn('클립보드 복사 실패:', res.error);
    } catch (err) {
      console.error('IPC 에러:', err);
    }
  }, []);

  const handleDelete = useCallback(
    async (itemId, deleteOption) => {
      try {
        const res = await window.electronAPI.deleteItem(itemId, deleteOption);
        if (res.deletionResult && res.refreshReq) {
          refetch();
          setActiveItemId(null);
        }
      } catch (err) {
        console.error('삭제 중 오류:', err);
      }
    },
    [refetch]
  );

  const toggleModal = useCallback((id) => setActiveItemId((prev) => (prev === id ? null : id)), []);

  // 파일 타입 필터 캐싱
  const visibleItems = useMemo(() => {
    return Array.isArray(item)
      ? item.filter((item) => {
          if (fileType === 'img') return item.type === 'image';
          if (fileType === 'txt') return item.type === 'text';
          return true;
        })
      : [];
  }, [item, fileType]);

  const needScroll = visibleItems.length > 6;

  return (
    <div
      className={`mainview-container ${needScroll ? 'scrollable' : ''}`}
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      {visibleItems.map((item) => (
        <div
          key={item.itemId}
          ref={(el) => (containerRefs.current[item.itemId] = el)}
          className="mainview-item"
        >
          <ItemCard
            item={item}
            isTagChecked={isTagChecked}
            onPaste={handlePaste}
            onToggleSelect={toggleSelect}
            onContextMenu={() => toggleModal(item.itemId)}
          />
          {activeItemId === item.itemId && (
            <ContextMenu
              item={item}
              onDelete={handleDelete}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default React.memo(MainView);
