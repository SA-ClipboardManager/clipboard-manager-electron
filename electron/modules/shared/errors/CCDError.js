// src/modules/CCDError.js
class CCDError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CCDError";
    this.code = code;
    this.timestamp = new Date().toISOString();
    this.details = {
      module: "",
      severity: "error",
      ...details,
    };

    Error.captureStackTrace(this, this.constructor);
  }

  static create(code, details = {}) {
    console.warn("CCDError.create called with:", code, details);
    const errorMap = {
      // 🔐 인증/회원 관련
      E610: "데이터베이스 오류",
      // E611: "입력값 오류",

      // 🔍 검색/요청 처리
      E620: "서버 미응답",
      E621: "검색 처리 실패",

      // 📋 복사/붙여넣기/저장 관련
      E630: "붙여넣기 실패",
      E631: "로컬 저장 실패",
      E632: "클라우드 저장 실패",
      E633: "로컬 DB 접근 오류",

      // ☁️ 동기화 및 업로드
      E640: "동기화 방향 오류",
      E641: "데이터 매핑 또는 변환 실패",
      E642: "데이터 동기화 충돌",
      E643: "데이터 포맷 불일치 오류",

      // 🗑️ 삭제/공간/설정/전송 관련
      E650: "데이터 삭제 실패",
      E651: "저장 공간 부족",
      E652: "설정 저장 실패",
      E653: "데이터 전송 실패",
      E654: "데이터 생성 실패",
      E655: "데이터 조회 실패",
      E656: "데이터 수정 실패",

      // 🤖 AI 분류 및 임베딩 관련
      E660: "이미지 분류 실패",
      E661: "태그 생성 오류",
      E662: "태그 저장 실패",
      E663: "텍스트 임베딩 실패",
      E664: "이미지 유사도 계산 오류",
      E665: "클라우드 데이터 접근 실패",
      E666: "이미지 임베딩 불러오기 실패",
      E667: "유사도 계산 로직 오류",
      E668: "이미지 임베딩 실패",
      E669: "MobileNetV3 모델 로드 실패"
    };

    const message = errorMap[code] || "알 수 없는 오류가 발생했습니다";
    return new CCDError(code, message, details);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp,
        ...this.details,
      },
    };
  }
}

module.exports = CCDError;