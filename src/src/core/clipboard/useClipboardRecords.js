import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import electronApi from '../ipc/electronApi';

const formatItem = (item) => ({
  ...item,
  selected: !!item.selected,
  itemId: item.itemId ?? item.id ?? uuidv4(),
  type: item.type === 'txt' ? 'text' : item.type === 'img' ? 'image' : item.type,
  src: item.type === 'img' ? item.content : undefined,
  content: item.content ?? '',
  timestamp: item.created_at ?? Date.now(),
  fileName: item.fileName ?? 'unnamed',
  ext: item.format?.split('/')?.[1] ?? 'unknown',
  shared: item.shared ?? 'local',
  tags: item.tags ?? [],
});

export default function useClipboardRecords({ subscribe = true } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await electronApi.loadClipboardRecords(true);
      if (res && res.success && Array.isArray(res.data)) {
        const formatted = res.data.map(formatItem);
        if (mountedRef.current) setItems(formatted);
        return formatted;
      } else {
        const msg = res ? JSON.stringify(res) : 'no response';
        throw new Error('loadClipboardRecords failed: ' + msg);
      }
    } catch (err) {
      if (mountedRef.current) setError(err);
      console.error('useClipboardRecords.refetch error', err);
      return [];
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refetch();
    return () => {
      mountedRef.current = false;
    };
  }, [refetch]);

  useEffect(() => {
    if (!subscribe) return;
    const handler = () => {
      // 간단히 갱신; 필요 시 debounce 적용
      refetch();
    };
    const unsubscribe = electronApi.onClipboardUpdated(handler);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      else electronApi?.offClipboardUpdated?.(handler);
    };
  }, [refetch, subscribe]);

  const toggleSelect = useCallback((itemId) => {
    setItems((prev) => prev.map((it) => (it.itemId === itemId ? { ...it, selected: !it.selected } : it)));
  }, []);

  const addItem = useCallback((newItem) => {
    const itemId = newItem.itemId ?? uuidv4();
    setItems((prev) => {
      const isDuplicate = prev.some((it) => it.itemId === newItem.itemId || (it.type === newItem.type && it.content === newItem.content && it.timestamp === newItem.timestamp));
      if (isDuplicate) return prev;
      return [formatItem({ ...newItem, itemId }), ...prev];
    });
  }, []);

  const setItemsFromSearchResult = useCallback((newItems) => {
    const formatted = Array.isArray(newItems) ? newItems.map(formatItem) : [];
    setItems(formatted);
  }, []);

  const getSelectedItemIds = useCallback(() => items.filter((it) => it.selected).map((it) => it.itemId), [items]);

  const pasteItem = useCallback(async (itemId) => {
    try {
      return await electronApi.pasteItem(itemId);
    } catch (err) {
      console.error('pasteItem error', err);
      throw err;
    }
  }, []);

  const uploadItems = useCallback(async (itemIds = []) => {
    try {
      return await electronApi.uploadItems(itemIds);
    } catch (err) {
      console.error('uploadItems error', err);
      throw err;
    }
  }, []);

  return {
    items,
    loading,
    error,
    refetch,
    toggleSelect,
    addItem,
    setItemsFromSearchResult,
    getSelectedItemIds,
    setItems,

    // ipc operations
    pasteItem,
    uploadItems,
  };
}
