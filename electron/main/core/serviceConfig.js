const { CloudService } = require("../../modules/cloud-sync/CloudService");

const serviceConfig = {
  // CloudService 구현체의 인스턴스를 생성하는 팩토리 함수
  CloudService: (app) => new CloudService(app),
};

// 2. export 대신 module.exports를 사용하여 객체를 내보냄
module.exports = {
  serviceConfig,
};
