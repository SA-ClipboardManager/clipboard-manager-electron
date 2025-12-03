import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  loadClipboardRecords,
  onClipboardUpdated,
  offClipboardUpdated,
  onInitialSyncComplete,
  offInitialSyncComplete,
  onSyncNotification,
  offSyncNotification,
  onCloudDataCleared,
  offCloudDataCleared,
  onUploadSuccess,
  offUploadSuccess,
  onUploadFailed,
  offUploadFailed,
  onItemUpdated,
  offItemUpdated,
  deleteItem,
} from "./electronService";

const useClipboardRecords = () => {
  const [items, setItems] = useState([]);

  // 포맷 공통 함수
  const formatItem = (item) => {
    const formatted = {
      ...item,
      selected: false,
      itemId: item.itemId ?? item.id ?? uuidv4(),
      type:
        item.type === "txt"
          ? "text"
          : item.type === "img"
          ? "image"
          : item.type,
      timestamp: item.created_at ?? item.createdAt ?? Date.now(),
      fileName: item.fileName ?? "unnamed",
      ext: item.format?.split("/")?.[1] ?? "unknown",
      shared: item.shared ?? (item.isSynced ? "both" : "local"),
      tags: item.tags ?? [],
    };

    // 이미지인 경우 src와 thumbnail_path 설정
    if (item.type === "img") {
      // 썸네일 경로 우선, 없으면 content 사용
      formatted.src = item.meta?.thumbnail_path || item.content;
      formatted.thumbnail_path = item.meta?.thumbnail_path;
      formatted.file_path = item.meta?.file_path;
      formatted.content = item.content;
    } else if (item.type === "txt") {
      formatted.content = item.content;
    }

    return formatted;
  };

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

  // 실시간 동기화 알림 처리 (다른 디바이스에서 변경)
  useEffect(() => {
    const handler = (data) => {
      console.log("[sync-notification] Other device changed:", data);
      // 서버에서 새 데이터가 들어왔으므로 전체 재조회
      refetch();
    };
    onSyncNotification?.(handler);
    return () => offSyncNotification?.(handler);
  }, [refetch]);

  // 로그아웃 시 클라우드 데이터 삭제 알림 처리
  useEffect(() => {
    const handler = () => {
      console.log("[cloud-data-cleared] Refreshing UI after logout cleanup");
      refetch();
    };
    onCloudDataCleared?.(handler);
    return () => {
      offCloudDataCleared?.(handler);
    };
  }, [refetch]);

  // 업로드 성공 이벤트 처리
  useEffect(() => {
    const handleUploadSuccess = (data) => {
      console.log("[Upload Success] Received:", {
        itemId: data.itemId,
        hasItem: !!data.item,
        item: data.item,
      });

      // data.item에 업데이트된 전체 정보가 있으면 병합
      if (data.item) {
        const updatedItem = formatItem(data.item);
        console.log("[Upload Success] Formatted item:", updatedItem);

        setItems((prev) => {
          const updated = prev.map((item) => {
            if (item.itemId === data.itemId || item.id === data.itemId) {
              console.log("[Upload Success] Updating item:", {
                before: item,
                after: { ...item, ...updatedItem, shared: "both" },
              });
              return { ...item, ...updatedItem, shared: "both" };
            }
            return item;
          });
          return updated;
        });
      } else {
        // item 정보가 없으면 shared만 업데이트 (fallback)
        setItems((prev) =>
          prev.map((item) =>
            item.itemId === data.itemId || item.id === data.itemId
              ? { ...item, shared: "both" }
              : item
          )
        );
      }
    };

    const handleItemUpdated = (updatedItem) => {
      console.log("[Item Updated] Received:", updatedItem);
      const formatted = formatItem(updatedItem);
      console.log("[Item Updated] Formatted:", formatted);

      setItems((prev) => {
        const updated = prev.map((item) => {
          if (item.itemId === updatedItem.id || item.id === updatedItem.id) {
            console.log("[Item Updated] Updating item:", {
              before: item,
              after: { ...item, ...formatted },
            });
            return { ...item, ...formatted };
          }
          return item;
        });
        return updated;
      });
    };

    const handleUploadFailed = (data) => {
      console.warn("[Upload Failed]", data.itemId, data.error);
      // UI에 실패 표시를 원하면 여기서 처리
    };

    onUploadSuccess?.(handleUploadSuccess);
    onItemUpdated?.(handleItemUpdated);
    onUploadFailed?.(handleUploadFailed);

    return () => {
      offUploadSuccess?.(handleUploadSuccess);
      offItemUpdated?.(handleItemUpdated);
      offUploadFailed?.(handleUploadFailed);
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
