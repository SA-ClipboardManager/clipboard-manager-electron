const LocalRepository = require( '../../modules/local-data/LocalRepository');
const CloudService= require ('../../modules/cloud-sync/CloudService');
const AuthService = require ('../../modules/authService/AuthService');
const EtcService = require ('../../modules/etc/EtcService.js');


//TODO ClipMonitor Service 완성되면 연결하기
module.exports = {
    LocalRepository: () => new LocalRepository(),

    CloudService: (services) => new CloudService(services.LocalRepository),

    AuthService: () => new AuthService(),

    EtcService: (services) => new EtcService(services.LocalRepository),
};