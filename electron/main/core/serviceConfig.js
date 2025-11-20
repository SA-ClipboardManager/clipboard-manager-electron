const LocalRepository = require('../../modules/local-data/LocalRepository');
// const CloudServiceModule = require('../../modules/cloud-sync/CloudService');
// const CloudService = CloudServiceModule?.CloudService || CloudServiceModule;
// const { AuthService } = require('../../modules/authService/AuthService');
// const { EtcService } = require('../../modules/etc/EtcService.js');

// AuthService 모듈은 { AuthService }로 내보내거나 default로 내보낼 수 있으니 둘 다 지원
const AuthModule = require('../../modules/authService/AuthService');
const AuthService = AuthModule?.AuthService || AuthModule;

// EtcService 모듈도 네임드/기본 내보내기 둘 다 처리
const EtcModule = require('../../modules/etc/EtcService.js');
const EtcService = EtcModule?.EtcService || EtcModule;

//TODO ClipMonitor Service 완성되면 연결하기
module.exports = {
  LocalRepository: () => new LocalRepository(),

  // CloudService: (services) => new CloudService(services.LocalRepository),

  AuthService: () => new AuthService(),

  EtcService: (services) => new EtcService(services.LocalRepository),
};
