const DatabaseContext = require("../../infrastructure/database/DatabaseContext");
const ClipboardRepository = require("../../infrastructure/repositories/ClipboardRepository");
const OutboxRepository = require("../../infrastructure/repositories/OutboxRepository");
const {
  TokenStorage,
} = require("../../modules/authService/token-storage/TokenStorage");
const { AuthService } = require("../../modules/authService/AuthService");
const {
  ClipboardService,
} = require("../../modules/clipboard/ClipboardService");
const CloudService = require("../../modules/cloud/CloudService");
const WebSocketManager = require("../../modules/cloud/WebSocketManager");
const SyncCoordinator = require("../../modules/cloud/SyncCoordinator");
const {
  createAuthenticatedHttpClient,
} = require("../../shared/utility/HttpClient");
// const SearchService = require("../../modules/search/SearchService");
const NotifyService = require("../../modules/notify/notifyService");
const SearchService = require("../../modules/search/SearchService");
require("dotenv").config();

class serviceConfig {
  constructor() {
    this.infrastructure = {};
    this.repositories = {};
    this.services = {};
  }

  initializeInfrastructure() {
    const dbContext = new DatabaseContext();
    dbContext.initialize();
    this.infrastructure.dbContext = dbContext;
    console.log("[serviceConfig] Infrastructure initialized.");
  }

  initializeRepositories() {
    const { dbContext } = this.infrastructure;

    this.repositories.outboxRepo = new OutboxRepository(dbContext.getDb());

    this.repositories.clipboardRepo = new ClipboardRepository(dbContext);

    console.log("[serviceConfig] Repositories initialized.");
  }

  initializeServices() {
    // 1. 필요한 리포지토리 및 환경변수 준비
    const { clipboardRepo, outboxRepo } = this.repositories; // outboxRepo 꺼내기
    const apiBaseURL = process.env.CLOUD_API_BASE_URL;

    // 2. 기초 서비스 생성
    const tokenStorage = new TokenStorage();
    const authService = new AuthService(tokenStorage, { apiBaseURL });
    const webSocketManager = new WebSocketManager(apiBaseURL);

    const uploadClient = createAuthenticatedHttpClient(apiBaseURL, {
      tokenStorage,
      authService,
    });

    // 3. CloudService 생성
    const cloudService = new CloudService({
      outboxRepo: outboxRepo,
      clipboardRepo: clipboardRepo,
      wsManager: webSocketManager,
      authService: authService,
      uploadClient: uploadClient,
      apiBaseURL: apiBaseURL,
    });

    // 4. SyncCoordinator 생성 및 시작 (백그라운드 업로더)
    const syncCoordinator = new SyncCoordinator({
      outboxRepo: outboxRepo,
      cloudService: cloudService,
    });
    const notifyService = new NotifyService(clipboardRepo, clipboardService);
    const searchService = new SearchService(
      clipboardRepo,
      cloudService.axiosInstance
    ); //인증 & 갱신 포함된 axios 주입

    // 앱 시작과 동시에 백그라운드 동기화 루프 시작
    syncCoordinator.start();

    // 5. ClipboardService 생성
    // (이제 cloudService가 정의되었으므로 안전하게 주입 가능)
    const clipboardService = new ClipboardService(clipboardRepo, cloudService);
    const etcService = new EtcService(
      clipboardRepo,
      clipboardService,
      syncCoordinator
    );

    // 6. 서비스 등록
    this.services = {
      TokenStorage: tokenStorage,
      AuthService: authService,
      ClipboardService: clipboardService,
      CloudService: cloudService,
      WebSocketManager: webSocketManager,
      SyncCoordinator: syncCoordinator, // 서비스 목록에 추가
      NotifyService: notifyService,
      SearchService: searchService,
    };

    console.log(
      "[serviceConfig] Services initialized & SyncCoordinator started."
    );
  }

  getServices() {
    return this.services;
  }
}

module.exports = serviceConfig;
