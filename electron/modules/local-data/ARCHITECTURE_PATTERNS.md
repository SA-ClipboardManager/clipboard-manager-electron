# LocalRepository 아키텍처 패턴 제안

## 현재 상태 분석

현재 `LocalRepository`는 약 700줄의 단일 클래스로 다음 책임들을 모두 포함하고 있습니다:
- 데이터베이스 초기화 및 스키마 관리
- CRUD 작업 (Clipboard Items)
- 태그 관리
- 이미지 메타데이터 관리
- Outbox 패턴 (동기화 대기열)
- FTS5 검색
- 파일 시스템 작업
- 트랜잭션 관리

## 추천 아키텍처 패턴

### 1. **Repository Pattern (리포지토리 패턴) - 개선**
현재 이미 부분적으로 적용되어 있지만, 더 세분화할 수 있습니다.

**구조:**
```
ILocalRepository (Facade)
├── IClipboardRepository (Clipboard CRUD)
├── ITagRepository (Tag 관리)
├── IImageMetaRepository (이미지 메타데이터)
├── IOutboxRepository (동기화 대기열)
└── ISearchRepository (검색 기능)
```

**장점:**
- 단일 책임 원칙 준수
- 각 리포지토리를 독립적으로 테스트 가능
- 필요시 다른 구현체로 교체 용이

**⚠️ 주의사항: 테이블 조인 문제**

Repository를 완전히 분리하면 조인이 어려워질 수 있습니다:

**문제 상황:**
```javascript
// 현재: 한 번의 쿼리로 조인
const item = db.prepare(`
  SELECT c.*, im.*, GROUP_CONCAT(t.name) as tags
  FROM clipboard c
  LEFT JOIN image_meta im ON c.id = im.data_id
  LEFT JOIN data_tag dt ON c.id = dt.data_id
  LEFT JOIN tag t ON dt.tag_id = t.tag_id
  WHERE c.id = ?
`).get(id);

// 분리 시: 여러 Repository 호출 (N+1 문제 발생 가능)
const item = await clipboardRepo.get(id);
const meta = await imageMetaRepo.getByDataId(id);
const tags = await tagRepo.getByDataId(id);
```

**해결 방안:**

#### 방안 1: Aggregate Root Repository (추천)
`ClipboardRepository`가 Aggregate Root로서 관련된 모든 데이터를 조인하여 가져옵니다.

```javascript
class ClipboardRepository {
  // Aggregate Root로서 관련 엔티티도 함께 조회
  async getWithRelations(id) {
    return this.db.prepare(`
      SELECT c.*, im.*, GROUP_CONCAT(t.name) as tags
      FROM clipboard c
      LEFT JOIN image_meta im ON c.id = im.data_id
      LEFT JOIN data_tag dt ON c.id = dt.data_id
      LEFT JOIN tag t ON dt.tag_id = t.tag_id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(id);
  }
  
  // 단순 CRUD는 각 Repository에서
  async get(id) {
    return this.db.prepare('SELECT * FROM clipboard WHERE id = ?').get(id);
  }
}

// TagRepository는 태그 자체의 CRUD만 담당
class TagRepository {
  async create(tag) { /* ... */ }
  async update(tagId, data) { /* ... */ }
  async delete(tagId) { /* ... */ }
}
```

**장점:**
- 조인 쿼리 성능 유지
- Aggregate Root 개념으로 도메인 경계 명확화
- 각 Repository는 자신의 엔티티 CRUD에 집중

#### 방안 2: Query Service Pattern
복잡한 조인 쿼리를 전담하는 Query Service를 별도로 둡니다.

```javascript
class ClipboardQueryService {
  constructor(db) {
    this.db = db;
  }
  
  async getClipboardItemWithAll(id) {
    // 복잡한 조인 쿼리 전담
    return this.db.prepare(`
      SELECT c.*, im.*, GROUP_CONCAT(t.name) as tags
      FROM clipboard c
      LEFT JOIN image_meta im ON c.id = im.data_id
      LEFT JOIN data_tag dt ON c.id = dt.data_id
      LEFT JOIN tag t ON dt.tag_id = t.tag_id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(id);
  }
  
  async searchWithFilters(query, filters) {
    // 복잡한 검색 쿼리
  }
}

// Repository는 단순 CRUD만
class ClipboardRepository {
  async get(id) {
    return this.db.prepare('SELECT * FROM clipboard WHERE id = ?').get(id);
  }
  async save(item) { /* ... */ }
}
```

**장점:**
- 읽기(Query)와 쓰기(Command) 분리 (CQRS 개념)
- 복잡한 조인 로직을 한 곳에 집중
- Repository는 단순 CRUD에만 집중

#### 방안 3: Unit of Work에서 조인 처리
Unit of Work가 여러 Repository를 조합하여 조인 결과를 만듭니다.

```javascript
class UnitOfWork {
  async getClipboardItemWithRelations(id) {
    // 단일 트랜잭션 내에서 여러 Repository 조합
    const item = await this.clipboardRepo.get(id);
    const meta = await this.imageMetaRepo.getByDataId(id);
    const tags = await this.tagRepo.getByDataId(id);
    
    return { ...item, meta, tags };
  }
}
```

**단점:**
- N+1 쿼리 문제 발생 가능
- 성능 저하 가능성

**권장 접근:**
- **방안 1 (Aggregate Root Repository)** + **방안 2 (Query Service)** 조합
- 읽기 작업: Query Service에서 조인 쿼리 사용
- 쓰기 작업: 각 Repository에서 단일 엔티티 CRUD
- Aggregate Root: Clipboard가 Root이므로 관련 데이터 조회는 ClipboardRepository에서

### 2. **Unit of Work Pattern (작업 단위 패턴)**
트랜잭션 관리와 여러 리포지토리 간의 일관성을 보장합니다.

**예시:**
```javascript
class UnitOfWork {
  constructor(db) {
    this.db = db;
    this.clipboardRepo = new ClipboardRepository(db);
    this.tagRepo = new TagRepository(db);
    this.outboxRepo = new OutboxRepository(db);
  }
  
  async commit() {
    // 모든 변경사항을 하나의 트랜잭션으로 커밋
  }
  
  async rollback() {
    // 롤백 처리
  }
}
```

**장점:**
- 여러 리포지토리 작업을 하나의 트랜잭션으로 묶을 수 있음
- 데이터 일관성 보장
- 현재 `saveClipboardItem`에서 사용하는 패턴을 일반화

### 3. **Data Mapper Pattern (데이터 매퍼 패턴)**
도메인 객체와 데이터베이스 레코드 간의 변환을 분리합니다.

**예시:**
```javascript
class ClipboardMapper {
  toDomain(raw) {
    return {
      id: raw.id,
      type: raw.type,
      format: raw.format,
      content: raw.content,
      createdAt: new Date(raw.created_at * 1000),
      tags: this.mapTags(raw.tags),
      // ...
    };
  }
  
  toPersistence(domain) {
    return {
      id: domain.id,
      type: domain.type,
      format: domain.format,
      content: domain.content,
      created_at: Math.floor(domain.createdAt.getTime() / 1000),
      // ...
    };
  }
}
```

**장점:**
- 도메인 로직과 데이터베이스 스키마 분리
- 스키마 변경 시 영향 범위 최소화
- 현재 `transformItem` 메서드의 역할을 명확히 함

### 4. **Specification Pattern (명세 패턴)**
복잡한 쿼리 조건을 객체로 캡슐화합니다.

**예시:**
```javascript
class ClipboardSpecification {
  static byDateRange(start, end) {
    return {
      toSQL: () => 'created_at BETWEEN ? AND ?',
      params: [start, end]
    };
  }
  
  static byTags(tagNames) {
    return {
      toSQL: () => 'id IN (SELECT data_id FROM data_tag WHERE tag_id IN (...))',
      params: [tagNames]
    };
  }
  
  static and(...specs) {
    // 여러 명세를 AND로 결합
  }
}
```

**장점:**
- 복잡한 쿼리 로직 재사용
- 쿼리 조건을 조합하여 사용 가능
- 테스트 용이

### 5. **Strategy Pattern (전략 패턴)**
다양한 저장소 백엔드를 지원합니다.

**예시:**
```javascript
class StorageStrategy {
  async save(item) { throw new Error('Not implemented'); }
  async get(id) { throw new Error('Not implemented'); }
}

class SQLiteStrategy extends StorageStrategy { /* ... */ }
class IndexedDBStrategy extends StorageStrategy { /* ... */ }
class FileSystemStrategy extends StorageStrategy { /* ... */ }
```

**장점:**
- 런타임에 저장소 전략 변경 가능
- 새로운 저장소 추가 시 기존 코드 수정 최소화

### 6. **Facade Pattern (파사드 패턴)**
복잡한 하위 시스템을 단순한 인터페이스로 제공합니다.

**예시:**
```javascript
class LocalRepositoryFacade {
  constructor(uow, mapper) {
    this.uow = uow;
    this.mapper = mapper;
  }
  
  async saveClipboardItem(item, meta) {
    // 여러 리포지토리를 조합하여 복잡한 작업 수행
    const domainItem = this.mapper.toDomain(item);
    // ... 복잡한 로직
    await this.uow.commit();
  }
}
```

**장점:**
- 기존 `ILocalRepository` 인터페이스 유지
- 내부 구현을 리팩토링해도 외부 코드 변경 불필요

### 7. **Dependency Injection (의존성 주입)**
싱글톤 대신 의존성 주입을 사용합니다.

**현재:**
```javascript
const localRepoInstance = new LocalRepository();
module.exports = { LocalRepository: localRepoInstance };
```

**개선:**
```javascript
class LocalRepositoryFactory {
  static create(config) {
    const db = new Database(config.dbPath);
    const uow = new UnitOfWork(db);
    const mapper = new ClipboardMapper();
    return new LocalRepositoryFacade(uow, mapper);
  }
}
```

**장점:**
- 테스트 시 Mock 객체 주입 가능
- 설정에 따라 다른 구현체 사용 가능
- 싱글톤의 단점(테스트 어려움, 전역 상태) 해소

## 추천 리팩토링 방향

### 단계별 접근

**1단계: Repository 분리 (조인 고려)**
- `ClipboardRepository`: 
  - Aggregate Root로서 관련 데이터 조인 조회 (`getWithRelations`, `getAllWithRelations`)
  - 단순 CRUD 작업
- `TagRepository`: 태그 자체의 CRUD (생성, 수정, 삭제)
- `ImageMetaRepository`: 이미지 메타데이터 CRUD
- `OutboxRepository`: 동기화 대기열 관리
- `ClipboardQueryService` (선택): 복잡한 조인 쿼리 전담

**2단계: Mapper 도입**
- `ClipboardMapper`: 도메인 ↔ DB 변환
- `TagMapper`: 태그 변환

**3단계: Unit of Work 도입**
- 여러 리포지토리 작업을 하나의 트랜잭션으로 관리

**4단계: Facade로 통합**
- 기존 `ILocalRepository` 인터페이스 유지
- 내부적으로 분리된 리포지토리들을 조합

**5단계: Dependency Injection**
- 싱글톤 제거
- Factory 패턴으로 인스턴스 생성

## 예시 구조

```
local-data/
├── interfaces/
│   └── ILocalRepository.js (Facade 인터페이스)
├── repositories/
│   ├── ClipboardRepository.js (Aggregate Root - 조인 포함)
│   ├── TagRepository.js (태그 CRUD만)
│   ├── ImageMetaRepository.js (이미지 메타 CRUD만)
│   └── OutboxRepository.js (동기화 대기열)
├── queries/
│   └── ClipboardQueryService.js (복잡한 조인 쿼리 전담, 선택사항)
├── mappers/
│   ├── ClipboardMapper.js
│   └── TagMapper.js
├── unit-of-work/
│   └── UnitOfWork.js
├── strategies/
│   └── SQLiteStorageStrategy.js
└── LocalRepository.js (Facade 구현체)
```

**구조 설명:**
- `ClipboardRepository`: Aggregate Root로서 `getClipboardItem`, `getAllClipboardItems` 등에서 조인 쿼리 사용
- `TagRepository`, `ImageMetaRepository`: 각 엔티티의 CRUD만 담당 (조인 없음)
- `ClipboardQueryService`: 복잡한 검색/필터링 쿼리가 필요할 때 추가

## 선택 가이드

**현재 프로젝트에 가장 적합한 조합:**
1. ✅ **Repository Pattern (Aggregate Root 방식)** - 필수
   - ClipboardRepository가 Aggregate Root로서 조인 쿼리 포함
   - 다른 Repository는 단순 CRUD만 담당
2. ✅ **Data Mapper Pattern** - 강력 추천
3. ✅ **Unit of Work Pattern** - 트랜잭션 관리 개선
4. ✅ **Facade Pattern** - 기존 인터페이스 유지
5. ⚠️ **Query Service Pattern** - 검색/필터링이 매우 복잡해질 때
6. ⚠️ **Specification Pattern** - 검색 조건이 동적으로 조합될 때
7. ⚠️ **Strategy Pattern** - 다른 저장소 지원이 필요할 때

**조인 문제 해결 전략:**
- ✅ **Aggregate Root Repository**: Clipboard가 Root이므로 관련 데이터 조회는 ClipboardRepository에서
- ✅ **단일 쿼리 유지**: 조인 쿼리 성능 유지
- ❌ **완전 분리 지양**: 각 Repository가 자신의 테이블만 접근하면 N+1 문제 발생

## 참고사항

- 점진적 리팩토링 권장 (한 번에 모든 것을 바꾸지 말 것)
- 기존 인터페이스(`ILocalRepository`)는 유지하여 호환성 보장
- 각 패턴을 독립적으로 도입 가능
- 테스트 코드 작성과 함께 진행하면 더 안전함

