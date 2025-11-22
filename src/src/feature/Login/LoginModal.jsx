import React, { useState, useRef, useEffect } from 'react';
import { twMerge } from 'tailwind-merge';

import '../../styles/color.css';
import useDisableDuringSubmit from '../../utils/useDisableDuringSubmit.js';
import { loginUser, logoutUser, registerUser } from '../../utils/electronService.js';

const LoginModal = ({ loginInfo, setLoginInfo }) => {
  const [loginSuccess, setLoginSuccess] = useState('');
  const [loginError, setLoginError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');
  const [joinError, setJoinError] = useState('');

  const [modalState, setModalState] = useState(null);
  const [userId, setUserId] = useState(''); // 로그인 성공 시 저장될 유저 ID
  const ref = useRef(null);
  const [pw, setPw] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [idError, setIdError] = useState('');
  const [pwError, setPwError] = useState('');
  const loginBtnRef = useRef(null);
  const joinBtnRef = useRef(null);
  const isDisabled = modalState === 'login'; // ex: 로그인 중이면 비활성화
  const avatarRef = useRef(null);

  // 공백만으로 구성된 입력을 막기 위한 정규식: ^\s+$ 는 공백으로만 구성된 문자열
  const isWhitespaceOnly = (str) => /^\s+$/.test(str);
  useDisableDuringSubmit(isSubmitted, loginBtnRef);

  useEffect(() => {
    if (loginInfo.isLoggedIn && modalState !== 'loggedIn') {
      console.log('loginInfo 갱신됨, modalState 변경 중...');
      setModalState('loggedIn');
    }
  }, [loginInfo.isLoggedIn, loginInfo.userId]);

  useEffect(() => {
    if (modalState === 'JoinIn') {
      setJoinError('');
      setJoinSuccess('');
    } else if (modalState === 'login') {
      setLoginError('');
      setLoginSuccess('');
    }
  }, [modalState]);

  useEffect(() => {
    function handleClickOutside(event) {
      const clickedOutsideModal = ref.current && !ref.current.contains(event.target);
      const clickedOutsideAvatar = avatarRef.current && !avatarRef.current.contains(event.target);

      if (clickedOutsideModal && clickedOutsideAvatar) {
        setModalState(null);
        setIsSubmitted(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogin = async () => {
    setLoginSuccess('');
    setLoginError('');

    setIsSubmitted(true);

    if (userId.length < 8 || pw.length < 8) {
      setLoginError('ID와 PW는 8자 이상이어야 합니다.');
      return;
    }
    if (userId.length < 8 || pw.length < 8 || isWhitespaceOnly(userId) || isWhitespaceOnly(pw)) {
      setLoginError('ID와 PW는 8자 이상의 공백이 아닌 문자여야 합니다.');
      return;
    }

    if (!userId || !pw) {
      setLoginError('ID 또는 PW를 입력해주세요');
      return;
    }

    try {
      const response = await loginUser(userId, pw);

      if (response && response.success) {
        setLoginSuccess(response.message || '로그인 성공');
        setLoginError('');
        setLoginInfo({ isLoggedIn: true, userId });
      } else {
        setLoginError(response?.message || '로그인 실패: 계정 정보를 확인하세요.');
        setLoginSuccess('');
      }
    } catch (error) {
      console.error('로그인 중 오류 발생:', error);
      setLoginError('로그인 중 오류가 발생했습니다.');
      setLoginSuccess('');
    } finally {
      setIsSubmitted(false);
    }
    console.log('에러:', loginError, '성공:', loginSuccess);
  };
  const handleLogout = async () => {
    try {
      await logoutUser(); // payload.js에서 user-logout 호출
      setLoginInfo({ isLoggedIn: false, userId: null }); // 상태 초기화
      setModalState(null); // 모달 닫기
    } catch (err) {
      console.error('로그아웃 중 오류 발생:', err);
    }
  };

  const handleJoin = async () => {
    setIsSubmitted(true);
    if (userId.length < 8 || pw.length < 8) {
      setJoinError('ID와 PW는 8자 이상이어야 합니다.');
      return;
    }
    if (userId.length < 8 || pw.length < 8 || isWhitespaceOnly(userId) || isWhitespaceOnly(pw)) {
      setJoinError('ID와 PW는 8자 이상의 공백이 아닌 문자여야 합니다.');
      return;
    }
    if (!userId || !pw) {
      setJoinError('ID 또는 PW를 입력해주세요');
      return;
    }

    try {
      const { joinResultMsg } = await registerUser(userId, pw);

      if (joinResultMsg === 'success') {
        setJoinSuccess('회원가입 성공');
        setTimeout(() => {
          setModalState(null);
          setJoinSuccess(''); // 이후 다시 열었을 때 남지 않도록 초기화
        }, 1000); // 1초 후 모달 닫기
      } else if (joinResultMsg === 'duplication') {
        setJoinError('이미 존재하는 ID입니다.');
        setJoinSuccess('');
      } else {
        setJoinError('회원가입에 실패했습니다. 다시 시도해주세요.');
        // setModalState(null);
        setJoinSuccess('');
      }
    } catch (err) {
      console.error('회원가입 중 에러:', err);
      setJoinError('알 수 없는 오류가 발생했습니다.');
      setJoinSuccess('');
    } finally {
      setIsSubmitted(false);
    }

    setUserId(userId); // ID 반영
    setPw(pw);
  };

  const handleIDChange = (value) => {
    setUserId(value);
  };
  const handlePwChange = (value) => {
    // 상태 업데이트
    setPw(value);
  };

  return (
    <div
      style={{ WebkitAppRegion: 'no-drag' }} // 클릭 이벤트 허용
      className="relative inline-block"
    >
      {/* 아바타 */}
      <img
        src="/avatar.svg"
        alt="User Avatar"
        ref={avatarRef}
        className="ml-3 w-[5.3rem] h-[5.3rem]  cursor-pointer object-cover"
        onClick={(e) => {
          e.stopPropagation(); // 외부 클릭으로 잘못 간주되지 않게

          setModalState((prev) => {
            if (prev === 'menu' || prev === 'login' || prev === 'JoinIn' || prev === 'loggedIn') {
              return null; // 열린 상태면 닫기
            } else {
              return loginInfo.isLoggedIn ? 'loggedIn' : 'menu';
            }
          });
        }}
      />

      {/* 모달 영역 */}
      {modalState !== null && (
        <div
          ref={ref}
          className="absolute  flex flex-col
           right-0 mt-2 min-w-[14.2rem] min-h-[15.5rem] bg-white rounded-xl   
           shadow-[0_0.1rem_2.5rem_0_rgba(0,0,0,0.10)]
            p-4 z-10"
          style={{ WebkitAppRegion: 'no-drag' }} // 클릭 이벤트 허용
        >
          {/* 로그인 전 메뉴 */}
          {modalState === 'menu' && (
            <>
              <div
                className="
                  text-[var(--blue-200)]
                  text-center
                  !font-pretendard
                  text-[1.4rem]
                  not-italic
                  font-[600]
                  leading-normal
                  flex
                  justify-center
                  px-auto     
                  w-auto   
                  pb-[0.8rem]        
                "
              >
                User
              </div>
              <hr className="mb-2" />
              <div className="flex flex-col gap-[1rem] pt-[1.4rem] pb-[2.2rem]">
                <div
                  className="
                        text-[var(--blue-200)]
                        !font-pretendard
                        text-[1.2rem]
                        font-[var(--font-md)]
                        leading-normal
                        text-center
                        cursor-pointer
                        b-[2rem]
                    "
                  onClick={() => setModalState('login')}
                >
                  Login
                </div>
                <div
                  ref={joinBtnRef}
                  disabled={isSubmitted}
                  className="
                        text-[var(--blue-200)]
                        !font-pretendard
                        text-[1.2rem]
                        font-[var(--font-md)]
                        leading-normal
                        text-center
                        cursor-pointer
                    "
                  onClick={() => setModalState('JoinIn')}
                >
                  Join
                </div>
              </div>
            </>
          )}

          {/* 로그인 입력 폼 */}
          {modalState === 'login' && (
            <div className="w-[14.2rem] h-[15.4rem] bg-[var(--white)] mb-[1.2rem] pb-[2rem]">
              <div
                className="
                    text-[var(--blue-200)]
                    text-center
                    !font-pretendard
                    text-[1.4rem]
                    pb-[0.9rem]
                    font-[var(--font-sb)]
                    leading-normal
              "
              >
                Login
              </div>
              <hr className="mb-2" />
              <div className="flex flex-col gap-2  pt-[1.4rem] px-[1.8rem] ">
                <label
                  className=" 
                  text-[var(--blue-200)]
                  text-[1.2rem]
                  font-[var(--font-md)]
                  flex
                  !font-pretendard
                  not-italic
                  font-[var(--font-md)]
                  leading-normal justify-between items-center
                "
                >
                  ID
                  <div className="flex flex-row">
                    <input
                      type="text"
                      maxLength={20}
                      placeholder="ID"
                      value={userId}
                      onChange={(e) => handleIDChange(e.target.value)}
                      className="!w-[8.3rem] px-2 py-1 ml-[0.rem] rounded-md bg-gray-100 text-gray-800"
                    />
                  </div>
                </label>
                <label
                  className="
                  text-[var(--blue-200)]
                  !font-pretendard
                  text-[1.2rem]
                  font-[var(--font-md)]
                  leading-normal
                  flex justify-between items-center
                "
                >
                  PW
                  <div className="flex flex-col">
                    <input
                      type="password"
                      placeholder="PW"
                      value={pw}
                      maxLength={20}
                      onChange={(e) => handlePwChange(e.target.value)}
                      className="!w-[8.3rem] px-2 py-1 ml-[0.2rem] rounded-md bg-gray-100 text-gray-800"
                    />
                  </div>
                </label>
              </div>

              <div
                className="
                   text-center
                   text-center
                   !font-inter
                   text-[0.9rem]
                   font-[var( --font-rg)]
                   leading-normal
                   text-[var(--red)]
                   mt-[1rem]
                  "
              >
                {(loginError || loginSuccess) && (
                  <div className={twMerge('text-center text-[0.9rem] mt-[1rem] !font-inter font-[var(--font-rg)] leading-normal', loginError ? 'text-[var(--red)]' : '!text-blue-200')}>
                    {loginError || loginSuccess}
                  </div>
                )}
              </div>

              <button
                className={twMerge(
                  'text-[var(--blue-200)] text-center !font-pretendard text-[1.1rem] font-[var(--font-rg)] leading-normal  underline text-center justify-center  flex  w-full text-center  mb-[1.2rem] pb-[1.3rem] pt-[1.2rem]',
                  isSubmitted && loginError ? 'text-gray-400' : 'text-[var(--blue-200)]'
                )}
                onClick={handleLogin}
                ref={loginBtnRef}
                disabled={isSubmitted}
              >
                Login
              </button>
            </div>
          )}

          {/* 로그인 성공 후 */}
          {modalState === 'loggedIn' && (
            <>
              <div
                className="
                  text-[var(--blue-200)]
                  text-center
                  !font-pretendard
                  text-[1.4rem]
                  not-italic
                  font-[600]
                  leading-normal
                  flex
                  justify-center
                  px-auto     
                  w-auto   
                  w-[1.]
                  pb-[0.8rem]    
                  h-auto
                "
              >
                User
              </div>
              <hr className="mb-2" />
              <div className="py-[1.9rem] pl-[2rem]">
                <div
                  className="
                      text-[var(--blue-200)]
                      !font-pretendard
                      text-[1.4rem]
                      not-italic
                      font-[var(--font-md)]
                      leading-normal
                      pb-[0.4rem]
                "
                >
                  ID
                </div>
                <div
                  className="
                      text-[var(--blue-200)]
                      !font-pretendard
                      text-[1.2rem]
                      not-italic
                      font-[var(--font-rg)]
                      leading-normal
                "
                  onClick={() => console.log('loginInfo.userId: ', loginInfo.userId)}
                >
                  {loginInfo.userId}
                </div>
              </div>
              <div
                className="flex justify-center text-center 
                             text-[1.1rem] font-[var(--font-rg)] leading-normal 
                             text-[var(--red)] underline cursor-pointer pb-[1.6rem]"
                onClick={handleLogout}
              >
                Logout
              </div>
            </>
          )}

          {/* 회원가입 입력 폼 */}
          {modalState === 'JoinIn' && (
            <div className="w-[14.2rem]   bg-[var(--white)]">
              <div
                className="
                    text-[var(--blue-200)]
                    text-center
                    !font-pretendard
                    text-[1.4rem]
                    pb-[0.9rem]
                    font-[var(--font-sb)]
                    leading-normal
              "
              >
                Join
              </div>
              <hr className="mb-2" />
              <div className="flex flex-col gap-2 px-[2rem] pt-[1.4rem]  ">
                <label
                  className=" 
                  text-[var(--blue-200)]
                  text-[1.2rem]
                  font-[var(--font-md)]
                  flex
                  !font-pretendard
                  not-italic
                  font-[var(--font-md)]
                  leading-normal justify-between items-center
                "
                >
                  ID
                  <input
                    type="text"
                    maxLength={20}
                    placeholder="ID"
                    onChange={(e) => setUserId(e.target.value)}
                    className="!w-[8.3rem]  px-2 py-1 ml-[0.917rem] rounded-md bg-gray-100 text-gray-800 flex-1"
                  />
                </label>
                <label
                  className="
                  text-[var(--blue-200)]
                  !font-pretendard
                  text-[1.2rem]
                  not-italic
                  font-[var(--font-md)]
                  leading-normal
                  flex justify-between items-center
                "
                >
                  PW
                  <input
                    type="password"
                    placeholder="PW"
                    maxLength={20}
                    onChange={(e) => setPw(e.target.value)}
                    className="!w-[8.3rem] ml-2 px-2 py-1 ml-[0.2rem] rounded-md bg-gray-100 text-gray-800 flex-1"
                  />
                </label>
                {(joinError || joinSuccess) && (
                  <div
                    className={twMerge(
                      'text-center  text-[0.9rem] mt-[1rem] mb-[0.6rem] !font-inter font-[var(--font-rg)] leading-normal flex w-full justify-center ',
                      joinError ? 'text-[var(--red)]' : '!text-blue-200'
                    )}
                  >
                    {joinError || joinSuccess}
                  </div>
                )}
                <button
                  className={twMerge(
                    'text-[var(--blue-200)] text-center !font-pretendard text-[1.1rem] font-[var(--font-rg)]  leading-normal  underline text-center justify-center  flex  w-full text-center ',
                    isSubmitted && joinError ? 'text-gray-400' : 'text-[var(--blue-200)]'
                  )}
                  onClick={handleJoin}
                >
                  Join
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default LoginModal;
