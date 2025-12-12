import React, { useState, useRef, useEffect } from 'react';
import '../../styles/color.css';

import uploadUrl from '../../../assets/UploadCloud.svg';
import downloadUrl from '../../../assets/DownloadCloud.svg';

import { uploadSelectedItems, downloadSelectedItems, onUploadSuccess, offUploadSuccess, onUploadFailed, offUploadFailed } from '../../utils/electronService';

const Toast = ({ message, type }) => {
  const textColor = type === 'error' ? 'text-red-700' : 'text-blue-700';

  return (
    <div className="relative flex items-center gap-2 z-20 bottom-[1rem]">
      <div
        className={`
        fixed left-4 bottom-0 !text-[1.4rem]  
        text-[var(--blue-300)]
        text-center
        !font-pretendard
        text-[1.4rem]
        not-italic
        font-[var(--font-rg)]
        leading-normal
        w-[9.6rem]
        h-[3.5rem]
        bg-white
        shadow-xl
        rounded-xl
        !justify-center
        !items-center
        text-center
        bottom-[3rem]
        left-[3rem]
        flex
        ${textColor}`}
      >
        {message}
      </div>
    </div>
  );
};

const BottomBar = ({ getSelectedItemIds, refetch, setItems, loginInfo }) => {
  const [toasts, setToasts] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploadToastId, setUploadToastId] = useState(null);
  const uploadToastIdRef = useRef(null);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  // 업로드 완료/실패 이벤트를 구독해 실제 완료 시점에 토스트 표시
  useEffect(() => {
    const handleSuccess = () => {
      const toastId = uploadToastIdRef.current;
      if (toastId) {
        removeToast(toastId);
        uploadToastIdRef.current = null;
        setUploadToastId(null);
      }
      showToast('업로드 성공!', 'info');
    };

    const handleFailed = (data) => {
      const toastId = uploadToastIdRef.current;
      if (toastId) {
        removeToast(toastId);
        uploadToastIdRef.current = null;
        setUploadToastId(null);
      }
      showToast(`업로드 실패: ${data?.error || ''}`.trim(), 'error');
    };

    onUploadSuccess?.(handleSuccess);
    onUploadFailed?.(handleFailed);

    return () => {
      offUploadSuccess?.(handleSuccess);
      offUploadFailed?.(handleFailed);
    };
  }, []);

  const showToast = (message, type, durationMs = 2000) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);

    if (durationMs && durationMs > 0) {
      setTimeout(() => {
        removeToast(id);
      }, durationMs);
    }

    return id;
  };

  return (
    <div
      style={{ WebkitAppRegion: 'no-drag' }} // 클릭 이벤트 허용
      className="flex justify-between items-center w-[36rem] "
    >
      {/* 왼쪽 업로드 / 다운로드 */}
      <div className="flex gap-6 items-center">
        <div
          className={`flex flex-col items-center text-blue-700 ${!loginInfo.isLoggedIn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          onClick={async () => {
            if (!loginInfo.isLoggedIn) {
              showToast('로그인 후 이용 가능합니다.', 'error');
              return;
            }

            const selectedIds = getSelectedItemIds();
            console.log('선택된 id 목록: ::', selectedIds);

            if (selectedIds.length === 0) {
              showToast('선택된 항목이 없습니다.', 'error');
              return;
            }

            const toastId = showToast('업로드 중...', 'info', null); // 완료/실패 시까지 유지
            setUploadToastId(toastId);
            uploadToastIdRef.current = toastId;
            try {
              const result = await uploadSelectedItems(selectedIds);
              console.log('결과: ', result);

              // IPC 호출 자체가 실패한 경우만 즉시 실패 처리
              if (!result?.success) {
                // 요청 자체 실패면 진행 토스트를 대체
                removeToast(toastId);
                setUploadToastId(null);
                uploadToastIdRef.current = null;
                showToast(result?.message || '업로드 요청 실패', 'error');
              }
              // 성공 시 토스트는 업로드 완료 이벤트에서 처리됨
            } catch (err) {
              console.error('업로드 중 오류:', err);
              // 진행 토스트 제거 후 오류 표기
              removeToast(toastId);
              setUploadToastId(null);
              uploadToastIdRef.current = null;
              showToast('오류 발생', 'error');
            }
          }}
        >
          <img
            src={uploadUrl}
            alt="Upload"
            className="w-[3.2rem] h-[3.2rem] mb-1"
          />
          <span className="text-xs underline"></span>
        </div>

        <div
          className={`flex flex-col items-center text-blue-700 ${!loginInfo.isLoggedIn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          onClick={async () => {
            if (!loginInfo.isLoggedIn) {
              showToast('로그인 후 이용 가능합니다.', 'error');
              return;
            }

            const selectedIds = getSelectedItemIds();
            console.log('selectedIds:', selectedIds);

            if (selectedIds.length === 0) {
              showToast('선택된 항목이 없습니다.', 'error');
              return;
            }

            showToast('다운로드 중...', 'info');
            try {
              const result = await downloadSelectedItems(selectedIds);
              console.log('다운로드 결과:', result);
              if (result.downloadResult) {
                showToast('다운로드 성공!', 'info');
              } else {
                showToast('다운로드 실패', 'error');
              }
            } catch (err) {
              console.error('다운로드 중 오류:', err);
              showToast('오류 발생', 'error');
            }
          }}
        ></div>
      </div>
      <div className="absolute top-[48rem] flex flex-col items-end z-50">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
          />
        ))}
      </div>
    </div>
  );
};
export default BottomBar;
