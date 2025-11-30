import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  loadClipboardRecords,
  onClipboardUpdated,
  offClipboardUpdated,
  onInitialSyncComplete,
  offInitialSyncComplete,
  deleteItem,
} from "./electronService";

const useClipboardRecords = () => {
  const [items, setItems] = useState([]);

  // 포맷 공통 함수
  const formatItem = (item) => ({
    ...item,
    selected: false,
    itemId: item.itemId ?? item.id ?? uuidv4(),
    type:
      item.type === "txt" ? "text" : item.type === "img" ? "image" : item.type,
    src: item.type === "img" ? item.content : undefined,
    content: item.type === "txt" ? item.content : undefined,
    timestamp: item.created_at ?? Date.now(),
    fileName: item.fileName ?? "unnamed",
    ext: item.format?.split("/")?.[1] ?? "unknown",
    shared: item.shared ?? "local",
    tags: item.tags ?? [],
  });

  //메인프로세스에서 전체 클립보드 기록 가져오기
  const refetch = useCallback(async () => {
    try {
      const response = await loadClipboardRecords(true);
      if (response.success) {
        const formatted = response.data.map(formatItem);
        setItems(formatted);
      } else {
        console.error("불러오기 실패:", response);
      }
    } catch (err) {
      console.error("에러:", err);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  //클립보드 실시간 업데이트 (증분 병합)
  useEffect(() => {
    const handler = (incomingItems) => {
      // incomingItems가 없거나 비어있으면 안전하게 전체 재조회
      if (
        !incomingItems ||
        !Array.isArray(incomingItems) ||
        incomingItems.length === 0
      ) {
        console.log("clipboard-updated: 빈 payload 수신, 전체 재조회 실행");
        refetch();
        return;
      }

      console.log("clipboard-updated 수신 → 증분 병합", incomingItems);
      const formattedNew = incomingItems.map(formatItem);

      setItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.itemId));
        // 기존에 없는 항목만 추가 (앞쪽에 추가하여 최신 순으로 유지)
        const toAdd = formattedNew.filter((it) => !existingIds.has(it.itemId));
        if (toAdd.length === 0) return prev;
        return [...toAdd, ...prev];
      });
    };

    onClipboardUpdated?.(handler);
    return () => {
      offClipboardUpdated?.(handler);
    };
  }, [refetch]);

  // 초기 동기화 완료 시 UI 갱신 (전체 재조회)
  useEffect(() => {
    const handler = (info) => {
      console.log("[initial-sync-complete]", info);
      // 서버 데이터가 로컬 DB에 반영되었으므로 화면 갱신
      refetch();
    };
    onInitialSyncComplete?.(handler);
    return () => offInitialSyncComplete?.(handler);
  }, [refetch]);

  // 업로드 성공 이벤트 처리
  useEffect(() => {
    const handleUploadSuccess = (data) => {
      console.log("[Upload Success]", data.itemId);
      setItems((prev) =>
        prev.map((item) =>
          item.itemId === data.itemId || item.id === data.itemId
            ? { ...item, shared: "both" }
            : item
        )
      );
    };

    const handleUploadFailed = (data) => {
      console.warn("[Upload Failed]", data.itemId, data.error);
      // UI에 실패 표시를 원하면 여기서 처리
    };

    window.electron?.ipcRenderer?.on("upload-success", (event, data) =>
      handleUploadSuccess(data)
    );
    window.electron?.ipcRenderer?.on("upload-failed", (event, data) =>
      handleUploadFailed(data)
    );

    return () => {
      window.electron?.ipcRenderer?.removeListener(
        "upload-success",
        handleUploadSuccess
      );
      window.electron?.ipcRenderer?.removeListener(
        "upload-failed",
        handleUploadFailed
      );
    };
  }, []);

  useEffect(() => {
    console.log("현재 items 상태:", items);
  }, [items]);

  const toggleSelect = (itemId) => {
    console.log("현재 선택된 item: ", itemId);
    setItems((prev) =>
      prev.map((item) =>
        item.itemId === itemId ? { ...item, selected: !item.selected } : item
      )
    );
  };

  //  드래그앤드랍으로 받은 아이템 추가
  const addItem = (newItem) => {
    console.log("newitem: ", newItem);
    const itemId = newItem.itemId ?? uuidv4();

    setItems((prev) => {
      const isDuplicate = prev.some(
        (item) =>
          item.itemId === newItem.itemId || // 이미 UUID가 같은 항목이 있다면 중복
          (item.type === newItem.type &&
            item.content === newItem.content &&
            item.timestamp === newItem.timestamp)
      );
      if (isDuplicate) return prev;

      return [
        {
          ...newItem,
          selected: false,
          itemId,
          timestamp: newItem.timestamp ?? Date.now(),
          fileName: newItem.fileName ?? "unnamed",
          ext: newItem.ext ?? "unknown",
          path: newItem.path ?? "",
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
      type:
        item.type === "txt"
          ? "text"
          : item.type === "img"
          ? "image"
          : item.type,
      src: item.type === "img" ? item.content : undefined,
      content: item.type === "txt" ? item.content : undefined,
      timestamp: item.created_at ?? Date.now(),
      fileName: item.fileName ?? "unnamed",
      ext: item.format?.split("/")?.[1] ?? "unknown",
      shared: item.shared ?? "local",
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
