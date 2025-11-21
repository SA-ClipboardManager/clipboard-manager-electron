const DatabaseContext = require("../../infrastructure/database/DatabaseContext");
const ClipboardRepository = require("../../infrastructure/repositories/ClipboardRepository");
const SyncRepository = require("../../infrastructure/repositories/SyncRepository");
const {
  TokenStorage,
} = require("../../modules/authService/token-storage/TokenStorage");
const { AuthService } = require("../../modules/authService/AuthService");
const { CloudService } = require("../../modules/cloud/CloudService");
const {
  ClipboardService,
} = require("../../modules/clipboard/ClipboardService");
const EtcService = require("../../modules/etc/EtcService");
require("dotenv").config();

class serviceConfig {
  constructor() {
    this.infrastructure = {};
    this.repositories = {};
    this.services = {};
  }

  /**
   * DB 초기화
   */
  initializeInfrastructure() {
    // DB Context 초기화 (Singleton)
    const dbContext = new DatabaseContext();
    dbContext.initialize();

    this.infrastructure.dbContext = dbContext;
    console.log("[serviceConfig] Infrastructure initialized.");
  }

  /**
   *리포지토리 초기화 (DB Context 주입)
   */
  initializeRepositories() {
    const { dbContext } = this.infrastructure;

    // 도메인별 리포지토리 분리 생성
    this.repositories.clipboardRepo = new ClipboardRepository(dbContext);
    this.repositories.syncRepo = new SyncRepository(dbContext);

    console.log("[serviceConfig] Repositories initialized.");
  }

  /**
   * 서비스 초기화 (리포지토리 및 타 서비스 주입)
   */
  initializeServices() {
    const { clipboardRepo, syncRepo } = this.repositories;
    const apiBaseURL = process.env.CLOUD_API_BASE_URL;
    console.log("⭐⭐⭐⭐");
    console.log(apiBaseURL);

    const tokenStorage = new TokenStorage();

    const authService = new AuthService(tokenStorage, { apiBaseURL });

    const cloudService = new CloudService(syncRepo, {
      tokenStorage,
      authService,
      apiBaseURL,
    });

    const clipboardService = new ClipboardService(clipboardRepo);

    const etcService = new EtcService(clipboardRepo, clipboardService);

    this.services = {
      TokenStorage: tokenStorage,
      AuthService: authService,
      CloudService: cloudService,
      ClipboardService: clipboardService,
      EtcService: etcService,
    };

    console.log("[serviceConfig] Services initialized.");
  }

  /**
   *
   */
  getServices() {
    return this.services;
  }
}

module.exports = serviceConfig;
