import React, { useState, useRef, useEffect } from 'react';
import '../../styles/color.css';
import { getSettings, updateSettings, onCloudUploadStatusChange, toggleCloudUpload } from '../../utils/electronService';

const SettingModal = ({ onClose, refetch, setItems, loginInfo }) => {
  const cloudToggleRef = useRef(null);

  const [isVisible, setIsVisible] = useState(false);
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [localLimitOpen, setLocalLimitOpen] = useState(false);
  const [cloudLimitOpen, setCloudLimitOpen] = useState(false);
  const [retention, setRetention] = useState('7일');
  const [localLimit, setLocalLimit] = useState('30개');
  const modalRef = useRef(null);
  const [cloudLimit, setCloudLimit] = useState('30개');

  const [isAutoCloudSave, setIsAutoCloudSave] = useState(false);
  const iconRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      // 아이콘이나 모달 둘 다 아닌 경우에만 닫기
      if (modalRef.current && !modalRef.current.contains(event.target) && iconRef.current && !iconRef.current.contains(event.target)) {
        setIsVisible(false);
        setRetentionOpen(false);
        setLocalLimitOpen(false);
        setCloudLimitOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  useEffect(() => {
    console.log('로그인 정보:', loginInfo);
  }, [loginInfo]);
  useEffect(() => {
    const fetchInitialSettings = async () => {
      try {
        const settings = await getSettings(); // 메인 프로세스에서 설정 가져옴
        console.log('초기 설정값 수신:', settings);
        if (settings) {
          if (settings.localLimit) setLocalLimit(`${settings.localLimit}개`);
          // if (settings.cloudLimit) setCloudLimit(`${settings.cloudLimit}개`);
          if (settings.retentionDays) {
            // retentionOptions 기준 문자열로 매핑 필요
            const matchedRetention = retentionOptions.find((opt) => extractNumber(opt) === settings.retentionDays);
            if (matchedRetention) setRetention(matchedRetention);
          }
        }
      } catch (err) {
        console.error('초기 설정값 로드 실패:', err);
      }
    };

    fetchInitialSettings();
  }, []);

  useEffect(() => {
    const fetchInitialSettings = async () => {
      try {
        const response = await getSettings();
        console.log('초기 설정값 수신:', response);

        if (response.success && response.settings) {
          const settings = response.settings;

          if (settings.local_limit) setLocalLimit(`${settings.local_limit}개`);
          if (settings.day_limit) {
            const matchedRetention = retentionOptions.find((opt) => extractNumber(opt) === settings.day_limit);
            if (matchedRetention) setRetention(matchedRetention);
          }

          if (settings.max_count_cloud) {
            setCloudLimit(`${settings.max_count_cloud}개`); // ✅ 최초 클라우드 개수 설정
          }
        }
      } catch (err) {
        console.error('초기 설정값 로드 실패:', err);
      }
    };

    fetchInitialSettings();
  }, []);

  useEffect(() => {
    onCloudUploadStatusChange((status) => {
      setIsAutoCloudSave(status);
    });
  }, []);

  const retentionOptions = ['1일', '7일', '10일', '30일', '∞'];
  const limitOptions = ['10개', '30개', '50개'];
  const handleApplySetting = async () => {
    const settings = {
      retentionDays: extractNumber(retention), // ex) "7"
      localLimit: extractNumber(localLimit), // ex) "30"
      cloudLimit: extractNumber(cloudLimit), // ex) "10"
    };
    // 디버깅용 콘솔 출력
    console.log('전송될 settings 객체:', settings);
    console.log('원본 문자열 상태들:', {
      settings,
    });
    try {
      const response = await updateSettings(settings);
      if (response.success) {
        const updatedItems = response.data;
        setItems(updatedItems);
        onClose(); // 모달 닫기
        await refetch(); // 기록 다시 불러오기
        setIsVisible(false);
      } else {
        console.error('설정 전송 실패', response.error);
        setItems([]);
      }
    } catch (err) {
      console.error('IPC 오류:', err);
    }
  };
  useEffect(() => {
    if (isVisible) {
      setTimeout(() => {
        console.log('강제 리렌더링 발생');
      }, 0);
    }
  }, [isVisible]);

  // 숫자만 추출하는 헬퍼 함수
  const extractNumber = (text) => {
    const match = text.match(/\d+/); // 정규표현식: 숫자 하나 이상
    return match ? Number(match[0]) : null; // 숫자가 없으면 null
  };

  return (
    <div className="relative">
      <div
        className="cursor-pointer"
        onClick={() => setIsVisible((prev) => !prev)}
        ref={iconRef}
      >
        <img
          src="settings.svg"
          alt="Settings"
          className="w-[3.2rem] h-[3.2rem] text-blue-700"
        />
      </div>

      {isVisible && (
        <div
          className="    
          bg-[var(--white)]
          shadow-[0_0.1rem_2.5rem_0_rgba(0,0,0,0.10)]
          rounded-[0.7rem]
          gap-2 text-blue-700 
          h-[22.6rem] w-[26rem]
          flex justify-between flex-row
          absolute
          z-100
          bottom-[4rem]
          right-[-1.4rem]"
        >
          <div
            ref={modalRef}
            className="absolute right-0 bottom-0 w-full
            pl-[2.6rem] pr-[1.5rem] h-full
            pt-[1.6rem]
            pb-[2rem]"
          >
            <div
              className="
              text-[var(--blue-200)]
              text-center
              !font-pretendard
              text-[1.4rem]
              pb-[0.9rem]
              font-[var(--font-sb)]
              leading-normal
              w-full
            "
            >
              Settings
            </div>
            <hr className="mb-[1.2rem]" />

            <div className="relative mb-4 flex flex-row justify-between">
              <div className="">
                <div
                  className="
                  text-[var(--blue-200)]
                  !font-pretendard
                  text-[1.2rem]
                  not-italic
                  font-[var(--font-md)]
                  leading-normal
                "
                >
                  보관 기간
                </div>
                <div
                  className="
                text-[var(--blue-100)]
                !font-pretendard
                text-[0.9rem]
                not-italic
                font-[var(--font-rg)]
                leading-normal
              "
                >
                  최대 보관 기간 설정
                </div>
              </div>
              <div
                className="rounded px-2 py-1 text-blue-700 cursor-pointer"
                onClick={() => {
                  setRetentionOpen(!retentionOpen);
                  setLocalLimitOpen(false);
                  setCloudLimitOpen(false);
                }}
              >
                {retention} ▼
              </div>
              {retentionOpen && (
                <div className="absolute top-6 left-[17.5rem]  w-[4.4rem] items-center flex flex-col z-[999] bg-white border mt-1 rounded shadow text-sm">
                  {retentionOptions.map((opt) => (
                    <div
                      key={opt}
                      className=" px-2 py-1 hover:bg-blue-50 cursor-pointer text-blue-700 h-[2rem]"
                      onClick={() => {
                        setRetention(opt);
                        setRetentionOpen(false);
                      }}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 최대 개수 설정 */}
            <div className="mb-4 flex flex-row relative justify-between">
              <div className="">
                <div
                  className="
                text-[var(--blue-200)]
                !font-pretendard
                text-[1.2rem]
                not-italic
                font-[var(--font-md)]
                leading-normal
              "
                >
                  최대 개수
                </div>
                <div
                  className="
                text-[var(--blue-100)]
                !font-pretendard
                text-[0.9rem]
                not-italic
                font-[var(--font-rg)]
                leading-normal
              "
                >
                  최대 보관 개수 설정
                </div>
              </div>
              <div className="flex flex-row relative">
                <div className="flex items-center gap-1">
                  <img
                    src="folder.svg"
                    className="w-6 h-6 cursor-pointer"
                    onClick={() => {
                      setLocalLimitOpen(!localLimitOpen);
                      setRetentionOpen(false);
                      setCloudLimitOpen(false);
                    }}
                    alt="Local Limit"
                  />
                  <div
                    className="text-blue-700 text-sm cursor-pointer select-none flex items-center"
                    onClick={() => {
                      setLocalLimitOpen(!localLimitOpen);
                      setRetentionOpen(false);
                      setCloudLimitOpen(false);
                    }}
                  >
                    {localLimit} ▼
                  </div>
                </div>

                {localLimitOpen && (
                  <div className="absolute top-full left-2  bg-white border rounded shadow text-sm w-[4.4rem] items-center flex flex-col">
                    {limitOptions.map((opt) => (
                      <div
                        key={opt + '-local'}
                        className="px-2 py-1 hover:bg-blue-50 cursor-pointer text-blue-700 h-[2rem]"
                        onClick={() => {
                          setLocalLimit(opt);
                          setLocalLimitOpen(false);
                        }}
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-row relative">
                <div className={`flex items-center gap-1 ${!loginInfo.isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <img
                    src="cloud.svg"
                    className={`w-6 h-6 }`}
                    onClick={() => {
                      if (!loginInfo.isLoggedIn) return;
                      setCloudLimitOpen(!cloudLimitOpen);
                      setRetentionOpen(false);
                      setLocalLimitOpen(false);
                    }}
                    alt="Cloud Limit"
                  />
                  <div
                    className={`text-blue-700 text-sm select-none flex items-center `}
                    onClick={() => {
                      if (!loginInfo.isLoggedIn) return;
                      setCloudLimitOpen(!cloudLimitOpen);
                      setRetentionOpen(false);
                      setLocalLimitOpen(false);
                    }}
                  >
                    {cloudLimit} ▼
                  </div>
                </div>

                {cloudLimitOpen && loginInfo.isLoggedIn && (
                  <div className="absolute top-full left-2 mt-1 z-[999] bg-white border rounded shadow text-sm w-[4.4rem] items-center flex flex-col">
                    {limitOptions.map((opt) => (
                      <div
                        key={opt + '-cloud'}
                        className="px-2 py-1 hover:bg-blue-50 cursor-pointer text-blue-700 h-[2rem]"
                        onClick={() => {
                          setCloudLimit(opt);
                          setCloudLimitOpen(false);
                        }}
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/*클라우드 자동 업로드 여부 토글 */}
            <div className="flex items-center justify-between w-full ">
              {/* 텍스트 영역 */}
              <div className="flex flex-col">
                <div className="">
                  <div
                    className="
                text-[var(--blue-200)]
                !font-pretendard
                text-[1.2rem]
                not-italic
                font-[var(--font-md)]
                leading-normal
              "
                  >
                    자동 클라우드 저장
                  </div>
                  <div
                    className="
                text-[var(--blue-100)]
                !font-pretendard
                text-[0.9rem]
                not-italic
                font-[var(--font-rg)]
                leading-normal
              "
                  >
                    복사 항목에 대한 클라우드 자동 업로드
                  </div>
                </div>
              </div>

              {/* 토글 스위치 */}
              <div
                ref={cloudToggleRef}
                onClick={() => {
                  if (!loginInfo.isLoggedIn) return;
                  toggleCloudUpload(); // 메인 프로세스로 토글 신호 보내기
                  console.log('클라우드 업로드 여부 토글 신호 전송됨(렌더러->메인)');
                }}
                className={`
            w-[3.4rem] h-[1.9rem] rounded-full p-[0.2rem]
            transition-all duration-200
            ${loginInfo.isLoggedIn ? (isAutoCloudSave ? 'bg-[var(--blue-200)]' : 'bg-gray-300') : 'bg-gray-200 opacity-60'}
          `}
              >
                <div
                  className={`
              w-[1.5rem] h-[1.5rem] rounded-full bg-white shadow
              transform transition-transform duration-200
              ${isAutoCloudSave ? 'translate-x-[1.5rem]' : 'translate-x-0'}
            `}
                />
              </div>
            </div>
            <div className="flex justify-center mt-6">
              <button
                className="text-[var(--blue-200)] text-[1.4rem] font-[600] underline !font-pretendard"
                onClick={handleApplySetting}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingModal;
