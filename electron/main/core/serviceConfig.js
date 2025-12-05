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

    console.log("[serviceConfig] Environment variables:");
    console.log("[serviceConfig] CLOUD_API_BASE_URL =", apiBaseURL);
    console.log(
      "[serviceConfig] All env keys:",
      Object.keys(process.env).filter(
        (k) => k.includes("CLOUD") || k.includes("API")
      )
    );

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
      outboxRepo,
      clipboardRepo,
      wsManager: webSocketManager,
      authService,
      uploadClient,
      apiBaseURL,
    });

    // 4. ClipboardService 먼저 생성 (다른 서비스가 참조할 수 있도록)
    const clipboardService = new ClipboardService(clipboardRepo, cloudService);

    // 5. SyncCoordinator 생성 및 시작 (백그라운드 업로더)
    const syncCoordinator = new SyncCoordinator({
      outboxRepo,
      cloudService,
    });
    syncCoordinator.start(); // 동기화 루프 시작

    // 6. 부가 서비스 생성 (ClipboardService 의존 가능)
    const notifyService = new NotifyService(
      clipboardRepo,
      clipboardService,
      cloudService
    );
    const searchService = new SearchService(clipboardRepo, uploadClient); // 인증 & 갱신 포함된 axios 주입 (CloudService.uploadClient 재사용)

    // 6. 서비스 등록
    this.services = {
      TokenStorage: tokenStorage,
      AuthService: authService,
      ClipboardService: clipboardService,
      CloudService: cloudService,
      WebSocketManager: webSocketManager,
      SyncCoordinator: syncCoordinator,
      NotifyService: notifyService,
      SearchService: searchService,
      ClipboardRepository: clipboardRepo, // AuthModule에서 사용
      DatabaseContext: this.infrastructure.dbContext, // CloudModule에서 TaggingSync 생성 시 사용
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
