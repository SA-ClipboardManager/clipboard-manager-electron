import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { loadClipboardRecords, onClipboardUpdated, offClipboardUpdated, deleteItem } from './electronService';

const useClipboardRecords = () => {
  const [items, setItems] = useState([]);

  //메인프로세스에서 전체 클립보드 기록 가져오기기
  const refetch = useCallback(async () => {
    try {
      const response = await loadClipboardRecords(true);
      // console.log("📦 loadClipboardRecords 응답:", response);
      if (response.success) {
        const formatted = response.data.map((item) => ({
          ...item,
          selected: false,
          itemId: item.itemId ?? item.id ?? uuidv4(),
          type: item.type === 'txt' ? 'text' : item.type === 'img' ? 'image' : item.type,
          src: item.type === 'img' ? item.content : undefined,
          content: item.type === 'txt' ? item.content : undefined,
          timestamp: item.created_at ?? Date.now(),
          fileName: item.fileName ?? 'unnamed',
          ext: item.format?.split('/')?.[1] ?? 'unknown',
          shared: item.shared ?? 'local',
          tags: item.tags ?? [],
        }));
        setItems(formatted);
      } else {
        console.error('불러오기 실패:', response);
      }
    } catch (err) {
      console.error('에러:', err);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  //클립보드 실시간 업데이트 데이터
  useEffect(() => {
    const handler = () => {
      console.log('📥 클립보드 감지됨 → 자동 refetch()');
      refetch();
    };

    onClipboardUpdated?.(handler);
    return () => {
      offClipboardUpdated?.(handler);
    };
  }, [refetch]);

  useEffect(() => {
    console.log('🧾 현재 items 상태:', items);
  }, [items]);

  const toggleSelect = (itemId) => {
    console.log('현재 선택된 item!!: ', itemId);
    setItems((prev) => prev.map((item) => (item.itemId === itemId ? { ...item, selected: !item.selected } : item)));
  };

  //  드래그앤드랍으로 받은 아이템 추가
  const addItem = (newItem) => {
    console.log('neneenwitem: ', newItem);
    const itemId = newItem.itemId ?? uuidv4();

    setItems((prev) => {
      const isDuplicate = prev.some(
        (item) =>
          item.itemId === newItem.itemId || // 이미 UUID가 같은 항목이 있다면 중복
          (item.type === newItem.type && item.content === newItem.content && item.timestamp === newItem.timestamp)
      );
      if (isDuplicate) return prev;

      return [
        {
          ...newItem,
          selected: false,
          itemId,
          timestamp: newItem.timestamp ?? Date.now(),
          fileName: newItem.fileName ?? 'unnamed',
          ext: newItem.ext ?? 'unknown',
          path: newItem.path ?? '',
        },
        ...prev,
      ];
    });
  };
  const setItemsFromSearchResult = (newItems) => {
    const formatted = newItems.map((item) => ({
      ...item,
      selected: false,
      itemId: item.itemId ?? item.id ?? uuidv4(),
      type: item.type === 'txt' ? 'text' : item.type === 'img' ? 'image' : item.type,
      src: item.type === 'img' ? item.content : undefined,
      content: item.type === 'txt' ? item.content : undefined,
      timestamp: item.created_at ?? Date.now(),
      fileName: item.fileName ?? 'unnamed',
      ext: item.format?.split('/')?.[1] ?? 'unknown',
      shared: item.shared ?? 'local',
      tags: item.tags ?? [],
    }));
    setItems(formatted);
  };

  const getSelectedItemIds = useCallback(() => {
    return items.filter((item) => item.selected).map((item) => item.itemId);
  }, [items]);

  return {
    items,
    refetch,
    toggleSelect,
    addItem,
    setItemsFromSearchResult,
    getSelectedItemIds,
    setItems,
  };
};

export default useClipboardRecords;
