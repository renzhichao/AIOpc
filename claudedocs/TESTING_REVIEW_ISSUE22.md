# TESTING REVIEW REPORT: Issue #22 - Dashboard Session Recovery

**Document Version**: 1.0
**Review Date**: 2026-03-19
**Reviewer**: Claude Code (Quality Engineer)
**FIP Documents Reviewed**:
- FIP-022: Frontend Implementation (Dashboard Session Recovery)
- FIP-022-BACKEND: Backend Technical Implementation Plan
**Issue**: #22
**Priority**: P0 (Critical User Experience Feature)

---

## EXECUTIVE SUMMARY

### Overall Assessment: **CONDITIONAL APPROVAL** ✅⚠️

**Approval Status**: The FIP documents demonstrate strong technical planning and comprehensive implementation details. However, several critical testing gaps must be addressed before full approval can be granted.

### Key Strengths
- Comprehensive technical architecture with clear separation of concerns
- Detailed component and API design with code examples
- Performance considerations addressed (pagination, caching, virtual scrolling)
- Security awareness (authentication, authorization validation)
- Well-structured implementation phases with clear deliverables

### Critical Gaps Requiring Resolution
1. **Missing Test Strategy**: No dedicated testing section in frontend FIP
2. **Insufficient Acceptance Criteria**: Several criteria are not objectively testable
3. **Performance Testing Undefined**: Load testing approach not specified
4. **Edge Case Coverage**: Incomplete boundary condition analysis
5. **Data Migration Testing**: No rollback testing strategy defined

### Approval Decision
**CONDITIONAL APPROVAL** - Implementation may proceed **PROVIDED** that:
1. All critical testing gaps (Section 2) are addressed before Phase 1 completion
2. A comprehensive Test Plan is created and approved (template provided in Section 9)
3. Performance benchmarks are established and validated (Section 4)
4. Security testing requirements are integrated (Section 5)

---

## 1. TEST COVERAGE ANALYSIS

### 1.1 Unit Testing Coverage

#### Frontend Components

**Status**: ⚠️ PARTIAL - Needs Enhancement

**Coverage Analysis**:

| Component Type | Test Requirements | Status | Gaps |
|----------------|------------------|--------|------|
| **React Components** (5 new) | Props validation, user interactions, state changes | ⚠️ PARTIAL | No test specifications provided |
| **Custom Hooks** (3 new) | Hook logic, error handling, edge cases | ❌ MISSING | No test cases defined |
| **API Services** (1 new) | API calls, error handling, token management | ❌ MISSING | No unit test specifications |
| **Context Providers** (1 new) | State management, provider behavior | ❌ MISSING | No test scenarios defined |
| **Utility Functions** (2 new) | Date/text formatting, edge cases | ❌ MISSING | No test coverage mentioned |

**Critical Missing Test Scenarios**:

```typescript
// ❌ NOT ADDRESSED: InstanceCard Component Tests
describe('InstanceCard', () => {
  // REQUIRED TESTS:
  it('should display instance information correctly')
  it('should handle missing instance name gracefully')
  it('should navigate to chat on quick enter button click')
  it('should navigate to conversation history on history button click')
  it('should display conversation preview when available')
  it('should handle empty conversation count')
  it('should format relative time correctly')
  it('should apply correct status badge styling')
  it('should be accessible via keyboard navigation')
  it('should handle mobile responsive layout')
  // ZERO of these tests are specified in FIP
});

// ❌ NOT ADDRESSED: useConversationRestore Hook Tests
describe('useConversationRestore', () => {
  // REQUIRED TESTS:
  it('should restore conversation with messages')
  it('should handle conversationId=null gracefully')
  it('should handle API errors with proper error state')
  it('should convert message formats correctly')
  it('should handle empty message lists')
  it('should retry failed restoration')
  it('should set loading state appropriately')
  it('should clear state on conversationId change')
  // ZERO of these tests are specified in FIP
});
```

**Required Test Coverage**: **>80%** (stated in acceptance criteria but not broken down by component)

#### Backend Services

**Status**: ⚠️ PARTIAL - Mentions testing but lacks specifics

**Coverage Analysis**:

| Layer | Test Requirements | Status | Gaps |
|-------|------------------|--------|------|
| **Entities** (2 new) | Validation, relationships, serialization | ⚠️ PARTIAL | Entity validation tests not defined |
| **Repositories** (2 new) | CRUD operations, query optimization, transaction handling | ❌ MISSING | No repository test scenarios |
| **Services** (3 new) | Business logic, error handling, edge cases | ❌ MISSING | Service layer tests not specified |
| **Controllers** (2 new) | Request/response handling, status codes, validation | ❌ MISSING | Controller test cases undefined |
| **Middleware** (auth) | JWT validation, user context injection | ❌ MISSING | No auth test scenarios |

**Backend FIP Section 11 (Testing Strategy) Analysis**:
- ✅ Mentions Jest for unit testing
- ✅ References test coverage requirements
- ❌ Does NOT provide specific test cases
- ❌ Does NOT specify mocking strategy for external dependencies
- ❌ Does NOT address database transaction testing
- ❌ Does NOT define test data fixtures or factories

### 1.2 Integration Testing Coverage

**Status**: ❌ CRITICAL GAP - Severely Inadequate

**Required Integration Tests** (NOT defined in FIPs):

#### API Integration Tests
```typescript
// ❌ NOT ADDRESSED: API Contract Testing
describe('Conversation API Integration', () => {
  // REQUIRED TEST SCENARIOS:
  describe('GET /api/instances/:id/conversations', () => {
    it('should return paginated conversation list')
    it('should respect limit and offset parameters')
    it('should return 401 for unauthenticated requests')
    it('should return 403 for non-owner access')
    it('should handle non-existent instance gracefully')
    it('should include proper CORS headers')
    it('should validate response schema')
    it('should handle database connection errors')
  });

  describe('POST /api/instances/:id/conversations', () => {
    it('should create conversation with valid data')
    it('should validate title length constraints')
    it('should associate conversation with authenticated user')
    it('should return 400 for invalid payload')
    it('should handle duplicate conversation creation')
    it('should trigger message_count trigger')
  });

  describe('GET /api/conversations/:id', () => {
    it('should return conversation with messages')
    it('should return 404 for non-existent conversation')
    it('should enforce user ownership')
    it('should paginate large message lists')
    it('should include tool_calls in response')
  });

  describe('WebSocket + Conversation Sync', () => {
    it('should save WebSocket messages to conversation')
    it('should handle message save failures gracefully')
    it('should maintain message ordering')
    it('should deduplicate messages')
    it('should handle concurrent message saves')
  });
  // NONE of these integration test scenarios are defined
});
```

#### Database Integration Tests
```typescript
// ❌ NOT ADDRESSED: Database Behavior Tests
describe('Database Integration', () => {
  // REQUIRED TEST SCENARIOS:
  it('should enforce foreign key constraints')
  it('should cascade delete messages on conversation deletion')
  it('should update message_count trigger correctly')
  it('should handle concurrent conversation creation')
  it('should rollback on service layer errors')
  it('should maintain referential integrity')
  it('should handle database connection pool exhaustion')
  it('should validate JSONB metadata structure')
  // NONE specified in FIP
});
```

**Critical Gap**: No integration test strategy defined despite complex database triggers and cascade relationships.

### 1.3 End-to-End Testing Coverage

**Status**: ⚠️ PARTIAL - Mentions E2E but lacks detailed scenarios

**Frontend FIP Reference**:
- Section 7.1 Phase 5: Mentions "E2E测试用例" as deliverable
- Section 7.2: States "E2E 测试通过率 100%" as acceptance criterion
- ❌ Does NOT define specific E2E test scenarios
- ❌ Does NOT specify test data setup requirements
- ❌ Does NOT address test environment configuration

**Required E2E Test Scenarios** (NOT defined):

```typescript
// ❌ NOT ADDRESSED: Critical User Journey Tests
describe('Dashboard Session Recovery E2E', () => {
  // REQUIRED USER JOURNEYS:

  test('Journey 1: First-time user views instances and starts conversation', async ({ page }) => {
    // 1. Login via Feishu OAuth
    // 2. View Dashboard with claimed instances
    // 3. Click "Enter Conversation" on instance
    // 4. Send message
    // 5. Verify message appears in UI
    // 6. Refresh page
    // 7. Verify conversation persisted
    // NOT SPECIFIED IN FIP
  });

  test('Journey 2: User views and restores conversation history', async ({ page }) => {
    // 1. Login to Dashboard
    // 2. Click "View History" on instance
    // 3. View paginated conversation list
    // 4. Click on historical conversation
    // 5. Verify all messages restored
    // 6. Send new message
    // 7. Verify appended to conversation
    // NOT SPECIFIED IN FIP
  });

  test('Journey 3: User renames and deletes conversations', async ({ page }) => {
    // 1. Navigate to conversation list
    // 2. Open actions menu for conversation
    // 3. Rename conversation
    // 4. Verify title updated
    // 5. Delete conversation
    // 6. Verify removed from list
    // NOT SPECIFIED IN FIP
  });

  test('Journey 4: User handles pagination', async ({ page }) => {
    // Setup: Create 25+ conversations
    // 1. Navigate to conversation list
    // 2. Verify first 20 conversations shown
    // 3. Scroll to bottom
    // 4. Click "Load More"
    // 5. Verify next batch loaded
    // 6. Verify pagination state maintained
    // NOT SPECIFIED IN FIP
  });

  test('Journey 5: Error handling and recovery', async ({ page }) => {
    // 1. Simulate network error during message send
    // 2. Verify error message displayed
    // 3. Verify retry option available
    // 4. Retry and verify success
    // 5. Simulate auth token expiry
    // 6. Verify redirect to login
    // NOT SPECIFIED IN FIP
  });
});
```

**E2E Testing Gaps**:
- No test data management strategy (how to create test conversations?)
- No test user provisioning (Feishu OAuth test accounts?)
- No cleanup strategy between tests
- No test isolation approach
- No flaky test mitigation strategy

---

## 2. ACCEPTANCE CRITERIA REVIEW

### 2.1 Testability Analysis

**Overall Assessment**: ⚠️ **MANY CRITERIA ARE NOT OBJECTIVELY TESTABLE**

#### Functionality Acceptance Criteria

**Frontend FIP Section 7.3 Analysis**:

| Criterion | Testable? | Issues | Recommendations |
|-----------|-----------|--------|-----------------|
| **FR-1.1**: Dashboard shows user's claimed instances | ✅ YES | - | Define specific test data scenarios |
| **FR-1.2**: Instance card displays complete information | ⚠️ PARTIAL | What defines "complete"? | Specify all required fields |
| **FR-1.3**: Quick enter button works normally | ⚠️ PARTIAL | "Works normally" is subjective | Define specific navigation behavior |
| **FR-2.1**: Conversation list shows all conversations | ⚠️ PARTIAL | How to verify "all"? | Specify pagination test cases |
| **FR-2.2**: Supports paginated loading | ✅ YES | - | Define test scenarios for edge cases |
| **FR-2.3**: Create new conversation works | ✅ YES | - | Define error cases |
| **FR-3.1**: Historical messages fully displayed | ⚠️ PARTIAL | How to verify "fully"? | Specify message count test cases |
| **FR-3.2**: Can continue conversation after restore | ✅ YES | - | Define "continue" behavior |
| **FR-3.3**: New messages auto-save to conversation | ⚠️ PARTIAL | How to verify "auto-save"? | Specify save timing and failure handling |

**Critical Issues**:

1. **"Complete information" (FR-1.2)** is subjective:
   - **Problem**: No definition of what fields constitute "complete"
   - **Testing Challenge**: Cannot create pass/fail test
   - **Recommendation**: Specify exact field list:
     ```typescript
     // ACCEPTANCE CRITERIA IMPROVEMENT:
     ✅ TESTABLE: "Instance card MUST display:
     - instance.name OR instance.instance_id (truncated to 8 chars)
     - instance.status (with StatusBadge component)
     - instance.last_accessed_at (formatted as relative time)
     - instance.conversation_count (number)
     - instance.last_conversation_preview.title (if exists)
     - Last conversation preview.created_at (if exists)"
     ```

2. **"Works normally" (FR-1.3, FR-2.3)** is subjective:
   - **Problem**: No objective measure of "normal"
   - **Testing Challenge**: Subjective interpretation by testers
   - **Recommendation**: Specify exact behaviors:
     ```typescript
     // ACCEPTANCE CRITERIA IMPROVEMENT:
     ✅ TESTABLE: "Quick enter button:
     - MUST navigate to /instances/:instanceId/chat
     - MUST pass conversation parameter if last conversation exists
     - MUST complete navigation within 100ms of click
     - MUST show loading state during navigation"
     ```

3. **"Fully displayed" (FR-3.1)** is ambiguous:
   - **Problem**: No definition of "fully" for varying message counts
   - **Testing Challenge**: Cannot verify without message count threshold
   - **Recommendation**: Specify message pagination:
     ```typescript
     // ACCEPTANCE CRITERIA IMPROVEMENT:
     ✅ TESTABLE: "Historical messages:
     - MUST load first 50 messages immediately
     - MUST paginate additional messages in batches of 50
     - MUST display message_count in header
     - MUST support scroll-to-bottom for all messages
     - MUST handle conversations with 0, 1, 50, 100+ messages"
     ```

#### Performance Acceptance Criteria

**Frontend FIP Section 7.3 Analysis**:

| Metric | Target | Testable? | Issues |
|--------|--------|-----------|--------|
| Dashboard load time | < 500ms | ✅ YES | Need measurement methodology |
| Conversation list load | < 500ms | ✅ YES | Need to define dataset size |
| Conversation restore | < 1s | ⚠️ PARTIAL | Need to specify message count |
| First Contentful Paint | < 1.5s | ✅ YES | Need test environment spec |
| Time to Interactive | < 3s | ✅ YES | Need device/network specs |

**Critical Performance Testing Gaps**:

1. **Dataset Size Not Specified**:
   ```typescript
   // ❌ PROBLEM: "Conversation list load < 500ms"
   // Question: For how many conversations?

   // ✅ IMPROVEMENT: Specify test datasets:
   "Conversation list load time:
   - Dataset A: 20 conversations (< 500ms)
   - Dataset B: 100 conversations (< 500ms with pagination)
   - Dataset C: 1000 conversations (< 500ms with pagination)
   - Measured from API call initiation to render completion
   - Tested on: Chrome 120, desktop, 4G network simulation"
   ```

2. **Message Count Not Specified**:
   ```typescript
   // ❌ PROBLEM: "Conversation restore < 1s"
   // Question: For how many messages?

   // ✅ IMPROVEMENT: Specify test scenarios:
   "Conversation restore time:
   - Scenario A: 10 messages (< 500ms)
   - Scenario B: 50 messages (< 1s)
   - Scenario C: 200 messages (< 2s with virtual scrolling)
   - Scenario D: 1000 messages (< 3s with pagination)
   - Measured from API call to last message render"
   ```

3. **Test Environment Not Specified**:
   ```typescript
   // ❌ PROBLEM: No environment specs

   // ✅ IMPROVEMENT: Define test baseline:
   "Performance testing environment:
   - Device: Desktop (i7-12700K, 16GB RAM)
   - Browser: Chrome 120 (clean profile)
   - Network: 4G simulation (10Mbps down, 5ms latency)
   - Server Load: < 50% CPU, < 70% memory
   - Database: 100 conversations per user, 50 messages per conversation"
   ```

### 2.2 Edge Cases and Boundary Conditions

**Status**: ❌ CRITICAL GAP - Not systematically addressed

**Required Edge Case Testing** (NOT defined in FIPs):

#### Numerical Boundaries
```typescript
// ❌ NOT ADDRESSED: Boundary Testing
describe('Boundary Conditions', () => {
  // CONVERSATION COUNT BOUNDARIES:
  it('should handle 0 conversations')
  it('should handle 1 conversation')
  it('should handle exactly 20 conversations (pagination threshold)')
  it('should handle 21 conversations (tests pagination)')
  it('should handle 100 conversations (multiple pages)')
  it('should handle 1000 conversations (stress test)')

  // MESSAGE COUNT BOUNDARIES:
  it('should handle conversation with 0 messages')
  it('should handle conversation with 1 message')
  it('should handle conversation with 50 messages (virtual scroll threshold)')
  it('should handle conversation with 51 messages')
  it('should handle conversation with 500 messages')
  it('should handle conversation with 10000 messages (extreme case)')

  // TEXT LENGTH BOUNDARIES:
  it('should handle empty message content')
  it('should handle 1 character message')
  it('should handle 10000 character message')
  it('should handle message with special characters')
  it('should handle message with emoji')
  it('should handle message with markdown formatting')

  // TIME BOUNDARIES:
  it('should handle conversation created just now')
  it('should handle conversation created 59 seconds ago')
  it('should handle conversation created 60 seconds ago (display threshold)')
  it('should handle conversation created 24 hours ago')
  it('should handle conversation created 7 days ago (display threshold)')
  it('should handle conversation created 1 year ago')

  // ALL NOT SPECIFIED IN FIP
});
```

#### State Transition Edge Cases
```typescript
// ❌ NOT ADDRESSED: State Transition Tests
describe('State Transitions', () => {
  // AUTH STATE TRANSITIONS:
  it('should handle token expiry during conversation load')
  it('should handle logout during conversation restore')
  it('should handle login state change mid-conversation')

  // NETWORK STATE TRANSITIONS:
  it('should handle network disconnection during message send')
  it('should handle network reconnection and message sync')
  it('should handle slow network during pagination')

  // INSTANCE STATE TRANSITIONS:
  it('should handle instance going offline during conversation')
  it('should handle instance being deleted while viewing')
  it('should handle instance ownership transfer')

  // CONVERSATION STATE TRANSITIONS:
  it('should handle conversation being deleted by another session')
  it('should handle conversation being renamed by another session')
  it('should handle rapid consecutive state changes')

  // ALL NOT SPECIFIED IN FIP
});
```

#### Error State Edge Cases
```typescript
// ❌ NOT ADDRESSED: Error State Tests
describe('Error States', () => {
  // API ERROR CASES:
  it('should handle 400 Bad Request responses')
  it('should handle 401 Unauthorized during active session')
  it('should handle 403 Forbidden when accessing conversations')
  it('should handle 404 Not Found for deleted conversations')
  it('should handle 409 Conflict for duplicate operations')
  it('should handle 429 Rate Limiting')
  it('should handle 500 Internal Server Error')
  it('should handle 503 Service Unavailable')
  it('should handle network timeout errors')
  it('should handle malformed JSON responses')
  it('should handle truncated responses')

  // DATABASE ERROR CASES:
  it('should handle database connection failures')
  it('should handle constraint violations')
  it('should handle transaction rollback')
  it('should handle deadlocks')

  // WEBSOCKET ERROR CASES:
  it('should handle WebSocket disconnection')
  it('should handle WebSocket message send failures')
  it('should handle WebSocket handshake failures')

  // ALL NOT SPECIFIED IN FIP
});
```

### 2.3 User Experience Scenarios

**Status**: ⚠️ PARTIAL - Some scenarios covered, many missing

**Covered in Frontend FIP**:
- ✅ Basic user flow (Dashboard → Instance → Chat)
- ✅ Conversation list viewing
- ✅ Conversation restoration

**Missing User Experience Scenarios**:

```typescript
// ❌ NOT ADDRESSED: UX Edge Cases
describe('User Experience Edge Cases', () => {
  // MULTI-TAB/MULTI-DEVICE SCENARIOS:
  it('should handle same user logged in on multiple tabs')
  it('should handle conversation updates across tabs')
  it('should handle concurrent conversation creation')
  it('should handle same user on desktop + mobile')

  // BROWSER BEHAVIOR SCENARIOS:
  it('should handle back button navigation')
  it('should handle browser refresh mid-conversation')
  it('should handle browser forward button')
  it('should handle tab closing and reopening')
  it('should handle browser history manipulation')

  // ACCESSIBILITY SCENARIOS:
  it('should be navigable via keyboard only')
  it('should work with screen reader')
  it('should support high contrast mode')
  it('should support font scaling up to 200%')
  it('should support reduced motion preference')

  // INTERNATIONALIZATION SCENARIOS:
  it('should handle Chinese characters in messages')
  it('should handle RTL languages (if supported)')
  it('should handle timezone differences')
  it('should handle date formatting for different locales')

  // MOBILE-SPECIFIC SCENARIOS:
  it('should handle device orientation changes')
  it('should handle touch gestures (swipe, pinch)')
  it('should handle virtual keyboard appearance/disappearance')
  it('should handle low memory warnings')

  // ALL NOT SPECIFIED IN FIP
});
```

---

## 3. QUALITY GATES ANALYSIS

### 3.1 Definition of Done

**Status**: ⚠️ PARTIAL - Incomplete DoD criteria

**Frontend FIP Section 7.3 Analysis**:

**Current DoD Checklist**:
```
✅ Functionality验收 (FR-1, FR-2, FR-3)
✅ Performance验收 (5 metrics)
✅ Compatibility验收 (4 criteria)
```

**Critical Missing DoD Criteria**:

| Category | Missing Criteria | Priority | Impact |
|----------|-----------------|----------|--------|
| **Testing** | ❌ Unit test coverage report | P0 | Cannot verify code quality |
| **Testing** | ❌ Integration test results | P0 | Cannot verify system integration |
| **Testing** | ❌ E2E test results with pass rate | P0 | Cannot verify user journeys |
| **Code Quality** | ❌ Code review completion | P0 | No quality gate defined |
| **Code Quality** | ❌ TypeScript strict mode compliance | P1 | Type safety risk |
| **Code Quality** | ❌ Linting (ESLint) with zero errors | P1 | Code consistency |
| **Documentation** | ❌ API documentation update | P1 | Integration risk |
| **Documentation** | ❌ Component documentation (Storybook) | P2 | Maintainability |
| **Security** | ❌ Security review completion | P0 | Vulnerability risk |
| **Security** | ❌ Dependency vulnerability scan | P0 | Supply chain risk |
| **Performance** | ❌ Bundle size impact analysis | P1 | Performance regression risk |
| **Performance** | ❌ Memory leak testing | P1 | Long-running stability |
| **Accessibility** | ❌ WCAG 2.1 AA compliance testing | P1 | Legal/accessibility risk |

**Recommended Enhanced DoD**:

```yaml
# Definition of Done for Issue #22
# Must be satisfied before feature can be marked "Complete"

code_quality:
  - type: code_review
    criteria: "Approved by 2 reviewers, all comments addressed"
    priority: P0

  - type: typescript_strict_mode
    criteria: "Zero TypeScript errors in strict mode"
    priority: P1

  - type: linting
    criteria: "Zero ESLint errors, zero warnings"
    priority: P1

testing:
  - type: unit_test_coverage
    criteria: ">80% coverage for new code, >70% overall"
    priority: P0
    evidence: "Coverage report uploaded to CI/CD"

  - type: integration_tests
    criteria: "100% pass rate for all integration test suites"
    priority: P0
    evidence: "CI/CD test results"

  - type: e2e_tests
    criteria: "100% pass rate for critical user journeys"
    priority: P0
    evidence: "Playwright test report with screenshots"

  - type: edge_case_tests
    criteria: "All defined edge cases covered"
    priority: P1
    evidence: "Test case matrix with pass/fail status"

security:
  - type: vulnerability_scan
    criteria: "Zero HIGH/CRITICAL vulnerabilities in dependencies"
    priority: P0
    evidence: "npm audit / Snyk report"

  - type: authorization_testing
    criteria: "All user data access controls verified"
    priority: P0
    evidence: "Security test results"

  - type: input_validation
    criteria: "All user inputs sanitized and validated"
    priority: P0
    evidence: "Input validation test suite"

performance:
  - type: load_testing
    criteria: "Support 100 concurrent users with <2s response time"
    priority: P0
    evidence: "Load test report (k6/Artillery)"

  - type: bundle_size
    criteria: "<100KB additional JavaScript gzipped"
    priority: P1
    evidence: "Bundle analysis report"

  - type: memory_leaks
    criteria: "No memory leaks in 24-hour soak test"
    priority: P1
    evidence: "Chrome DevTools memory profile"

documentation:
  - type: api_documentation
    criteria: "All new API endpoints documented"
    priority: P1
    evidence: "OpenAPI/Swagger spec updated"

  - type: component_documentation
    criteria: "All new components in Storybook"
    priority: P2
    evidence: "Storybook deployment URL"

accessibility:
  - type: a11y_testing
    criteria: "WCAG 2.1 AA compliance, Lighthouse a11y score >90"
    priority: P1
    evidence: "Lighthouse + axe DevTools report"
```

### 3.2 Code Review Checkpoints

**Status**: ❌ MISSING - No review process defined

**Required Code Review Gates**:

```yaml
# Code Review Process for Issue #22

phase_1_review: # After Phase 1 (Types + API Services)
  reviewers:
    - frontend_lead
    - backend_lead (for API contract validation)

  checklist:
    - "Type definitions match backend API contracts"
    - "API service error handling is comprehensive"
    - "Utility functions have 100% test coverage"
    - "JSDoc comments complete for all public APIs"
    - "No TypeScript any types used"
    - "Console.log statements removed"

  approval_criteria: "All reviewers approve, zero blocking comments"

phase_2_review: # After Phase 2 (Dashboard Instance List)
  reviewers:
    - frontend_lead
    - ux_designer

  checklist:
    - "Component follows existing design system"
    - "Responsive design works on mobile/tablet/desktop"
    - "Loading states implemented for all async operations"
    - "Error states are user-friendly"
    - "Accessibility attributes (ARIA) present"
    - "Unit tests cover all user interactions"
    - "Storybook stories created for components"

  approval_criteria: "Design approval + code approval"

phase_3_review: # After Phase 3 (Conversation List)
  reviewers:
    - frontend_lead
    - qa_engineer

  checklist:
    - "Pagination logic handles edge cases (0, 1, 20, 21 items)"
    - "Infinite scroll or manual pagination choice justified"
    - "Empty state guides user to next action"
    - "Optimistic updates implemented for delete/rename"
    - "Undo functionality for destructive actions"
    - "E2E tests cover full user journey"
    - "Performance metrics meet targets (<500ms load)"

  approval_criteria: "QA approval + performance validation"

phase_4_review: # After Phase 4 (Conversation Restore)
  reviewers:
    - frontend_lead
    - backend_lead
    - security_engineer

  checklist:
    - "Message format conversion preserves all data"
    - "WebSocket + REST API race conditions handled"
    - "Message save failures don't block UI"
    - "Large conversation loads don't block UI (virtual scrolling)"
    - "User can only access their own conversations (auth check)"
    - "URL parameter validation prevents XSS"
    - "Conversation ID format validated (UUID)"
    - "Memory leaks tested with 1000+ messages"

  approval_criteria: "Security approval + memory leak testing"

phase_5_review: # Final Review Before Merge
  reviewers:
    - tech_lead
    - product_manager
    - qa_lead

  checklist:
    - "All acceptance criteria met (with evidence)"
    - "All tests passing (unit, integration, E2E)"
    - "Performance benchmarks met"
    - "Security review passed"
    - "Accessibility score >90"
    - "Documentation complete"
    - "No console errors or warnings"
    - "Bundle size impact within limits"
    - "Backward compatibility maintained"
    - "Migration plan tested (for database changes)"

  approval_criteria: "Unanimous approval from all reviewers"
```

### 3.3 Pre-Deployment Validation

**Status**: ❌ MISSING - No deployment gates defined

**Required Pre-Deployment Checks**:

```yaml
# Pre-Deployment Validation Checklist

environment_validation:
  - task: "Verify database migration scripts tested on staging"
    evidence: "Migration run log with rollback test"

  - task: "Verify environment variables documented"
    evidence: "Updated .env.example file"

  - task: "Verify feature flag implementation (if applicable)"
    evidence: "Feature flag configuration tested"

  - task: "Verify API version compatibility"
    evidence: "API contract tests pass"

smoke_tests:
  - task: "Run critical user journey smoke tests"
    evidence: "Smoke test results (100% pass required)"

  - task: "Verify authentication flow end-to-end"
    evidence: "Auth flow test result"

  - task: "Verify conversation creation and retrieval"
    evidence: "Conversation CRUD test result"

  - task: "Verify WebSocket + conversation sync"
    evidence: "Integration test result"

performance_validation:
  - task: "Run load test with expected production traffic"
    evidence: "Load test report (p95 <2s, p99 <5s)"

  - task: "Verify database query performance"
    evidence: "Slow query log analysis (<100ms for all queries)"

  - task: "Verify API response times under load"
    evidence: "API performance dashboard snapshot"

security_validation:
  - task: "Run dependency vulnerability scan"
    evidence: "npm audit / Snyk report (zero HIGH/CRITICAL)"

  - task: "Verify CORS configuration"
    evidence: "CORS test results"

  - task: "Verify rate limiting configuration"
    evidence: "Rate limiting test results"

  - task: "Verify input sanitization"
    evidence: "Security test results (XSS, SQL injection)"

monitoring_setup:
  - task: "Configure application performance monitoring"
    evidence: "APM dashboard URLs"

  - task: "Configure error tracking (Sentry, etc.)"
    evidence: "Error tracking integration verified"

  - task: "Configure database performance monitoring"
    evidence: "Database monitoring dashboard"

  - task: "Set up alerts for critical metrics"
    evidence: "Alert configuration documentation"

rollback_plan:
  - task: "Database rollback script tested"
    evidence: "Rollback test result"

  - task: "Feature flag for immediate disable"
    evidence: "Feature flag configuration"

  - task: "Code rollback procedure documented"
    evidence: "Runbook link in incident response doc"

  - task: "Data migration rollback verified"
    evidence: "Rollback test with production-like data"
```

---

## 4. PERFORMANCE TESTING REQUIREMENTS

### 4.1 Load Testing Strategy

**Status**: ❌ CRITICAL GAP - No load testing defined

**Required Load Testing Scenarios**:

```typescript
// ❌ NOT ADDRESSED: Load Testing Requirements
// Load testing is mentioned in Section 7.3 but not defined

// REQUIRED: Load Test Scenarios
describe('Load Testing Requirements', () => {
  // SCENARIO 1: Concurrent Users
  test('Dashboard page load under concurrent users', async () => {
    // REQUIRED TEST CONFIGURATION:
    const loadTestConfig = {
      scenario: 'simulate_100_concurrent_users_accessing_dashboard',
      users: 100,
      rampUpDuration: '60s', // Ramp up over 1 minute
      testDuration: '10m', // Sustain for 10 minutes

      // Performance Targets (NOT SPECIFIED IN FIP):
      targets: {
        p50_response_time: '<500ms',
        p95_response_time: '<1s',
        p99_response_time: '<2s',
        error_rate: '<0.1%', // Maximum 1 error per 1000 requests
        throughput: '>100 requests/second'
      },

      // Success Criteria (NOT SPECIFIED IN FIP):
      successCriteria: {
        cpu_usage: '<70%',
        memory_usage: '<80%',
        database_connection_pool: '<80% utilization',
        no_memory_leaks: 'memory stable over 10 minutes',
        no_degradation: 'response time does not increase over test duration'
      }
    };

    // Test Steps:
    // 1. Ramp up to 100 concurrent users over 60 seconds
    // 2. Each user repeatedly accesses Dashboard page
    // 3. Measure response times, error rates, resource usage
    // 4. Verify targets are met
    // NOT SPECIFIED IN FIP
  });

  // SCENARIO 2: Conversation List Pagination
  test('Conversation list pagination under load', async () => {
    const loadTestConfig = {
      scenario: 'pagination_load_with_large_conversation_sets',
      users: 50, // 50 concurrent users
      dataset: '1000 conversations per user',

      targets: {
        p50_response_time: '<300ms',
        p95_response_time: '<500ms',
        p99_response_time: '<1s',
        database_query_time: '<100ms', // Specific DB query target
        pagination_accuracy: '100%' // No duplicate or missing conversations
      },

      // Pagination Edge Cases to Test:
      edgeCases: [
        'First page load (empty cache)',
        'Middle page load (offset=100)',
        'Last page load (offset=980)',
        'Beyond dataset (offset=2000)',
        'Concurrent same-page loads',
        'Consecutive pagination by same user'
      ]
      // NOT SPECIFIED IN FIP
    });

  // SCENARIO 3: Conversation Message Loading
  test('Large conversation restore under load', async () => {
    const loadTestConfig = {
      scenario: 'restore_large_conversations_under_load',
      users: 30, // 30 concurrent users restoring conversations
      dataset: [
        '50 messages (small)',
        '200 messages (medium)',
        '1000 messages (large)',
        '5000 messages (extreme)'
      ],

      targets: {
        p50_initial_load: '<500ms', // Time to first message render
        p95_full_load: '<2s', // Time to all messages render
        virtual_scroll_performance: '<50ms per scroll event',
        memory_per_conversation: '<50MB' // Memory usage target
      },

      // Browser Performance Metrics:
      browserMetrics: {
        first_contentful_paint: '<1s',
        largest_contentful_paint: '<2s',
        cumulative_layout_shift: '<0.1',
        first_input_delay: '<100ms',
        time_to_interactive: '<3s'
      }
      // NOT SPECIFIED IN FIP
    });

  // SCENARIO 4: Message Sending Throughput
  test('Concurrent message sending with conversation persistence', async () => {
    const loadTestConfig = {
      scenario: 'concurrent_message_sends_with_auto_save',
      users: 50, // 50 concurrent users
      messages_per_user: 10, // Each sends 10 messages
      send_interval: '2s', // Send every 2 seconds

      targets: {
        message_save_p95: '<500ms', // Time to save to database
        websocket_send_p95: '<200ms', // Time to send via WebSocket
        message_order_accuracy: '100%', // No message reordering
        no_duplicate_messages: '0 duplicates', // Message deduplication
        conversation_consistency: '100%' // All messages in conversation
      },

      // Concurrency Edge Cases:
      edgeCases: [
        'Same conversation from multiple tabs',
        'Rapid consecutive sends (burst)',
        'Network latency spikes',
        'Database connection pool exhaustion',
        'WebSocket reconnection during send'
      ]
      // NOT SPECIFIED IN FIP
    });

  // ALL LOAD TEST SCENARIOS NOT DEFINED IN FIP
});
```

### 4.2 Stress Testing Requirements

**Status**: ❌ MISSING - No stress testing defined

**Required Stress Testing Scenarios**:

```yaml
# Stress Testing Requirements (NOT IN FIP)

# SCENARIO 1: Maximum Conversation Count
stress_test_1:
  name: "Dashboard with maximum claimed instances"
  setup:
    user_instances: 1000 # Extreme case
    conversations_per_instance: 100
  actions:
    - Load Dashboard with all instances
    - Scroll through instance list
    - Filter/search instances (if feature exists)
  success_criteria:
    - Page renders within 5 seconds
    - No browser crashes
    - Memory usage < 500MB
    - No errors in console

# SCENARIO 2: Maximum Message Count
stress_test_2:
  name: "Conversation with maximum messages"
  setup:
    conversation_message_count: 10000 # Extreme case
    message_size: "1000 characters average"
  actions:
    - Restore conversation
    - Scroll through all messages
    - Send new message
    - Search messages (if feature exists)
  success_criteria:
    - First render within 3 seconds
    - Smooth scrolling (60fps)
    - Send message succeeds
    - Memory usage stable (no leaks)

# SCENARIO 3: Concurrent Session Recovery
stress_test_3:
  name: "Multiple users restoring conversations simultaneously"
  setup:
    concurrent_users: 200
    conversations_per_user: 5
    messages_per_conversation: 100
  actions:
    - All users restore conversations simultaneously
    - Each user sends messages
    - Random users paginate conversations
  success_criteria:
    - p95 response time < 5s
    - Error rate < 1%
    - Database connection pool not exhausted
    - WebSocket connections stable

# SCENARIO 4: Network Stress
stress_test_4:
  name: "Poor network conditions"
  setup:
    network_conditions:
      - "3G" (1.6 Mbps down, 750ms latency)
      - "Offline mode" (simulate disconnection)
      - "Intermittent" (packet loss 10%)
  actions:
    - Restore conversation over slow network
    - Send message during packet loss
    - Reconnect after disconnection
  success_criteria:
    - App remains responsive
    - Graceful error messages
    - Auto-reconnect succeeds
    - No data loss

# NOT SPECIFIED IN FIP
```

### 4.3 Database Query Performance Testing

**Status**: ❌ CRITICAL GAP - No database performance testing defined

**Required Database Performance Tests**:

```typescript
// ❌ NOT ADDRESSED: Database Query Performance
describe('Database Query Performance Tests', () => {
  // CRITICAL QUERIES TO TEST:

  test('Conversation list query with pagination', async () => {
    // Query to test:
    // SELECT * FROM conversations
    // WHERE user_id = ? AND instance_id = ?
    // ORDER BY last_message_at DESC
    // LIMIT ? OFFSET ?

    const performance_requirements = {
      small_dataset: {
        rows: 20,
        target_time: '<10ms',
        index_usage: 'idx_conversations_user_instance'
      },
      medium_dataset: {
        rows: 1000,
        target_time: '<50ms',
        index_usage: 'idx_conversations_user_last_message'
      },
      large_dataset: {
        rows: 100000,
        target_time: '<100ms',
        index_usage: 'idx_conversations_user_last_message',
        pagination_required: true
      }
    };

    // Test each dataset size and verify:
    // 1. Query execution time
    // 2. Index usage (EXPLAIN ANALYZE)
    // 3. Memory usage
    // 4. Result set size
    // NOT SPECIFIED IN FIP
  });

  test('Conversation messages query with large result set', async () => {
    // Query to test:
    // SELECT * FROM conversation_messages
    // WHERE conversation_id = ?
    // ORDER BY created_at ASC
    // LIMIT ?

    const performance_requirements = {
      small_conversation: {
        message_count: 10,
        target_time: '<5ms',
        index_usage: 'idx_messages_conversation_created'
      },
      large_conversation: {
        message_count: 10000,
        target_time: '<200ms',
        index_usage: 'idx_messages_conversation_created',
        batch_loading: true // Should load in batches
      }
    };

    // Additional tests:
    // - Fetching first page (LIMIT 50)
    // - Fetching middle page (OFFSET 5000)
    // - Fetching last page (OFFSET 9950)
    // NOT SPECIFIED IN FIP
  });

  test('Conversation creation with trigger overhead', async () => {
    // Query to test:
    // INSERT INTO conversations (...)
    // - Trigger: update_conversation_message_count

    const performance_requirements = {
      single_insert: {
        target_time: '<20ms',
        trigger_execution: '<10ms'
      },
      concurrent_inserts: {
        users: 100,
        inserts_per_user: 10,
        target_p95_time: '<50ms',
        no_trigger_locks: true
      }
    };

    // Verify:
    // 1. Trigger does not cause deadlocks
    // 2. Trigger does not significantly slow inserts
    // 3. Trigger correctly updates message_count
    // NOT SPECIFIED IN FIP
  });

  test('User instances query with JOINs', async () => {
    // Query to test (from backend API):
    // SELECT i.*, COUNT(c.id) as conversation_count
    // FROM instances i
    // LEFT JOIN conversations c ON i.id = c.instance_id
    // WHERE i.owner_id = ?
    // GROUP BY i.id
    // ORDER BY i.last_accessed_at DESC

    const performance_requirements = {
      few_instances: {
        instance_count: 5,
        target_time: '<30ms',
        join_optimization: 'Hash Join or Nested Loop'
      },
      many_instances: {
        instance_count: 1000,
        target_time: '<200ms',
        index_usage: 'idx_instances_owner_id'
      }
    };

    // Verify:
    // 1. Query uses appropriate indexes
    // 2. JOIN strategy is optimal
    // 3. GROUP BY does not cause performance issues
    // NOT SPECIFIED IN FIP
  });

  // ALL DATABASE PERFORMANCE TESTS NOT DEFINED
});
```

### 4.4 Frontend Rendering Performance Testing

**Status**: ⚠️ PARTIAL - Mentions virtual scrolling but no test methodology

**Required Rendering Performance Tests**:

```typescript
// ❌ NOT ADDRESSED: Frontend Rendering Performance
describe('Frontend Rendering Performance', () => {
  // CRITICAL RENDERING SCENARIOS:

  test('Dashboard page with many instances', async () => {
    // Test: Rendering 100 instance cards

    const performance_targets = {
      first_contentful_paint: '<1.5s', // Specified in FIP ✅
      time_to_interactive: '<3s', // Specified in FIP ✅
      total_blocking_time: '<300ms', // NOT specified ❌
      cumulative_layout_shift: '<0.1', // NOT specified ❌
      speed_index: '<3s', // NOT specified ❌
      largest_contentful_paint: '<2.5s' // NOT specified ❌
    };

    // Measurement methodology:
    // 1. Use Chrome DevTools Performance tab
    // 2. Use Lighthouse CI in automated tests
    // 3. Use WebPageTest for network simulation
    // NOT SPECIFIED IN FIP
  });

  test('Conversation list with virtual scrolling', async () => {
    // Test: Scrolling through 1000 conversations

    const performance_targets = {
      initial_render: '<500ms', // First 20 items
      scroll_fps: '>55fps', // Maintain smooth scrolling
      scroll_jank: '<5%', // Janky frames < 5%
      memory_increment: '<10MB per 100 items', // Memory usage
      gc_frequency: '<1 per second' // Garbage collection
    };

    // Test methodology:
    // 1. Load 1000 conversations
    // 2. Scroll from top to bottom
    // 3. Measure FPS and jank using Chrome DevTools
    // 4. Monitor memory usage for leaks
    // NOT SPECIFIED IN FIP (virtual scrolling mentioned in Section 8.1 but no tests)
  });

  test('Message list with 1000+ messages', async () => {
    // Test: Rendering large conversation

    const performance_targets = {
      first_message_render: '<500ms',
      virtual_scroll_init: '<200ms',
      scroll_performance: '>55fps',
      markdown_rendering: '<50ms per message',
      code_block_rendering: '<100ms per code block',
      memory_stability: 'no increase after initial load'
    };

    // Edge cases:
    // - Messages with long code blocks
    // - Messages with many emoji
    // - Messages with markdown tables
    // - Messages with image attachments (if supported)
    // NOT SPECIFIED IN FIP
  });

  test('Component re-render optimization', async () => {
    // Test: Verify React.memo and useMemo usage

    const test_cases = [
      {
        component: 'InstanceCard',
        trigger: 'Parent component state change',
        expected_behavior: 'Should NOT re-render if props unchanged',
        test_method: 'React DevTools Profiler'
      },
      {
        component: 'ConversationList',
        trigger: 'New conversation added',
        expected_behavior: 'Should NOT re-render existing cards',
        test_method: 'React DevTools Profiler'
      },
      {
        component: 'MessageList',
        trigger: 'New message received',
        expected_behavior: 'Should NOT re-render existing messages',
        test_method: 'React DevTools Profiler'
      }
    ];
    // NOT SPECIFIED IN FIP
  });

  // ALL RENDERING PERFORMANCE TESTS NOT DEFINED
});
```

---

## 5. SECURITY TESTING REQUIREMENTS

### 5.1 Authorization Testing

**Status**: ⚠️ PARTIAL - Auth mentioned but no test scenarios

**Critical Authorization Test Scenarios**:

```typescript
// ❌ NOT ADDRESSED: Authorization Testing
describe('Authorization and Access Control', () => {
  // CRITICAL AUTHZ TESTS:

  test('User can only access their own conversations', async () => {
    // Setup: Create 2 users with conversations
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const user1_conversation = await createConversation(user1.id);

    // Test: User2 tries to access User1's conversation
    const response = await request(app)
      .get(`/api/conversations/${user1_conversation.id}`)
      .set('Authorization', `Bearer ${user2.token}`);

    // Expected: 403 Forbidden
    expect(response.status).toBe(403);

    // Test: User1 can access their own conversation
    const response2 = await request(app)
      .get(`/api/conversations/${user1_conversation.id}`)
      .set('Authorization', `Bearer ${user1.token}`);

    // Expected: 200 OK
    expect(response2.status).toBe(200);

    // NOT SPECIFIED IN FIP
  });

  test('User can only see their own instances on dashboard', async () => {
    // Setup: Create instances owned by different users
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    await createInstance({ owner_id: user1.id });
    await createInstance({ owner_id: user2.id });

    // Test: User1 requests dashboard
    const response = await request(app)
      .get('/api/user/instances')
      .set('Authorization', `Bearer ${user1.token}`);

    // Expected: Only user1's instances returned
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].owner_id).toBe(user1.id);

    // NOT SPECIFIED IN FIP
  });

  test('Conversation ownership cannot be transferred', async () => {
    // Test: Attempt to update conversation.user_id
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const conversation = await createConversation(user1.id);

    const response = await request(app)
      .patch(`/api/conversations/${conversation.id}`)
      .set('Authorization', `Bearer ${user1.token}`)
      .send({ user_id: user2.id });

    // Expected: 400 Bad Request (user_id is immutable)
    expect(response.status).toBe(400);

    // NOT SPECIFIED IN FIP
  });

  test('Instance ownership enforced on conversation creation', async () => {
    // Setup: User1 owns instance1, User2 tries to create conversation
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const instance1 = await createInstance({ owner_id: user1.id });

    const response = await request(app)
      .post(`/api/instances/${instance1.id}/conversations`)
      .set('Authorization', `Bearer ${user2.token}`)
      .send({ title: 'Test Conversation' });

    // Expected: 403 Forbidden
    expect(response.status).toBe(403);

    // NOT SPECIFIED IN FIP
  });

  // ALL AUTHORIZATION TESTS NOT DEFINED
});
```

### 5.2 Input Validation and Sanitization

**Status**: ❌ CRITICAL GAP - No input validation tests specified

**Required Input Validation Tests**:

```typescript
// ❌ NOT ADDRESSED: Input Validation Testing
describe('Input Validation and Sanitization', () => {
  // CRITICAL INPUT VALIDATION TESTS:

  describe('Conversation Title Validation', () => {
    const invalid_inputs = [
      { input: '', error: 'Title cannot be empty' },
      { input: ' '.repeat(256), error: 'Title too long' }, // Assuming 255 char limit
      { input: '<script>alert("XSS")</script>', error: 'HTML tags not allowed' },
      { input: "'; DROP TABLE conversations; --", error: 'SQL injection pattern' },
      { input: '\x00\x01\x02', error: 'Control characters not allowed' },
      { input: '../../../../etc/passwd', error: 'Path traversal pattern' }
    ];

    test.each(invalid_inputs)('Rejects invalid title: $input', async ({ input, error }) => {
      const response = await request(app)
        .post(`/api/instances/${instanceId}/conversations`)
        .send({ title: input });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain(error);
      // NOT SPECIFIED IN FIP
    });
  });

  describe('Message Content Validation', () => {
    const invalid_inputs = [
      { input: '', error: 'Message cannot be empty' },
      { input: ' '.repeat(10001), error: 'Message too long' }, // Assuming 10000 char limit
      { input: '<img src=x onerror="alert(1)">', error: 'HTML tags not allowed' },
      { input: '${7*7}', error: 'Template injection pattern' }
    ];

    test.each(invalid_inputs)('Rejects invalid message: $input', async ({ input, error }) => {
      const response = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .send({ content: input, role: 'user' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain(error);
      // NOT SPECIFIED IN FIP
    });
  });

  describe('URL Parameter Validation', () => {
    const invalid_inputs = [
      { input: '../../../etc/passwd', error: 'Path traversal' },
      { input: '"><script>alert(1)</script>', error: 'XSS in URL' },
      { input: 'OR 1=1; DROP TABLE conversations; --', error: 'SQL injection' },
      { input: '\n\r\t', error: 'Control characters' }
    ];

    test.each(invalid_inputs)('Sanitizes URL parameter: $input', async ({ input }) => {
      // Test conversationId parameter in URL
      const response = await request(app)
        .get(`/api/conversations/${encodeURIComponent(input)}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      // NOT SPECIFIED IN FIP
    });
  });

  // ALL INPUT VALIDATION TESTS NOT DEFINED
});
```

### 5.3 Session Security Testing

**Status**: ❌ MISSING - No session security tests

**Required Session Security Tests**:

```typescript
// ❌ NOT ADDRESSED: Session Security Testing
describe('Session Security', () => {
  // CRITICAL SESSION SECURITY TESTS:

  test('JWT token expiration is enforced', async () => {
    // Setup: Create expired token
    const expiredToken = generateJWT({ exp: Math.floor(Date.now() / 1000) - 3600 });

    const response = await request(app)
      .get('/api/user/instances')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Token expired');
    // NOT SPECIFIED IN FIP
  });

  test('Invalid JWT token is rejected', async () => {
    const invalidTokens = [
      'not-a-jwt',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid',
      'Bearer token-without-jwt',
      'Bearer ' + 'A'.repeat(10000) // Oversized token
    ];

    for (const token of invalidTokens) {
      const response = await request(app)
        .get('/api/user/instances')
        .set('Authorization', token);

      expect(response.status).toBe(401);
    }
    // NOT SPECIFIED IN FIP
  });

  test('Session fixation is prevented', async () => {
    // Test: Session ID changes after login
    const sessionBeforeLogin = extractSessionId(cookies);

    await request(app)
      .post('/api/auth/login')
      .send({ feishu_code: 'valid_code' });

    const sessionAfterLogin = extractSessionId(cookies);

    expect(sessionAfterLogin).not.toBe(sessionBeforeLogin);
    // NOT SPECIFIED IN FIP
  });

  test('CSRF protection is enabled', async () => {
    // Test: State-changing operation requires CSRF token
    const response = await request(app)
      .post(`/api/instances/${instanceId}/conversations`)
      .send({ title: 'Test' })
      // No CSRF token

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('CSRF');
    // NOT SPECIFIED IN FIP
  });

  // ALL SESSION SECURITY TESTS NOT DEFINED
});
```

### 5.4 Data Privacy Testing

**Status**: ❌ CRITICAL GAP - No data privacy tests

**Required Data Privacy Tests**:

```typescript
// ❌ NOT ADDRESSED: Data Privacy Testing
describe('Data Privacy', () => {
  // CRITICAL DATA PRIVACY TESTS:

  test('User data isolation is enforced', async () => {
    // Setup: Create users with conversations
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const user1_conversation = await createConversation(user1.id, {
      messages: [
        { role: 'user', content: 'User1 private message' },
        { role: 'assistant', content: 'Assistant response' }
      ]
    });

    // Test: User2 cannot access User1's data
    const response = await request(app)
      .get(`/api/conversations/${user1_conversation.id}`)
      .set('Authorization', `Bearer ${user2.token}`);

    expect(response.status).toBe(403);

    // Verify: User1's data not leaked in error message
    expect(response.body).not.toContain('User1 private message');
    // NOT SPECIFIED IN FIP
  });

  test('Deleted conversations are permanently removed', async () => {
    const conversation = await createConversation(userId);
    const conversationId = conversation.id;

    // Delete conversation
    await request(app)
      .delete(`/api/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${token}`);

    // Attempt to recreate conversation with same ID
    const response = await request(app)
      .post(`/api/instances/${instanceId}/conversations`)
      .send({ id: conversationId, title: 'Recreated' });

    // Expected: 400 (ID cannot be reused)
    expect(response.status).toBe(400);

    // Verify: Database does not contain old messages
    const dbMessages = await db.query(
      'SELECT * FROM conversation_messages WHERE conversation_id = $1',
      [conversationId]
    );
    expect(dbMessages.rows).toHaveLength(0);
    // NOT SPECIFIED IN FIP
  });

  test('Archived conversations are hidden by default', async () => {
    const conversation = await createConversation(userId, { is_archived: true });

    const response = await request(app)
      .get(`/api/instances/${instanceId}/conversations`)
      .set('Authorization', `Bearer ${token}`);

    // Expected: Archived conversation not in list
    expect(response.body.data).not.toContainEqual(
      expect.objectContaining({ id: conversation.id })
    );

    // Expected: Available with explicit filter
    const response2 = await request(app)
      .get(`/api/instances/${instanceId}/conversations?includeArchived=true`)
      .set('Authorization', `Bearer ${token}`);

    expect(response2.body.data).toContainEqual(
      expect.objectContaining({ id: conversation.id })
    );
    // NOT SPECIFIED IN FIP
  });

  // ALL DATA PRIVACY TESTS NOT DEFINED
});
```

---

## 6. TESTING RECOMMENDATIONS

### 6.1 Critical Actions Required Before Implementation

**Priority 0 (Blocking Issues)**:

1. **Create Comprehensive Test Plan** (Section 9.1 Template)
   - Define all test scenarios with acceptance criteria
   - Specify test data requirements and fixtures
   - Establish test environment configuration
   - Define test automation strategy
   - **Estimated Effort**: 3-5 days
   - **Owner**: QA Lead + Frontend/Backend Leads

2. **Define Acceptance Criteria with Objective Metrics**
   - Replace subjective criteria ("works normally") with objective measures
   - Specify exact performance targets for all metrics
   - Define dataset sizes for performance tests
   - Specify test environment baseline
   - **Estimated Effort**: 2-3 days
   - **Owner**: Product Manager + Tech Lead

3. **Design Security Test Suite**
   - Define authorization test matrix
   - Specify input validation test cases
   - Create session security test scenarios
   - Design data privacy verification tests
   - **Estimated Effort**: 3-4 days
   - **Owner**: Security Engineer + QA Lead

4. **Establish Performance Testing Framework**
   - Select load testing tools (k6, Artillery, etc.)
   - Define load test scenarios and targets
   - Create database performance baseline
   - Set up automated performance regression testing
   - **Estimated Effort**: 4-5 days
   - **Owner**: Performance Engineer + Backend Lead

### 6.2 Testing Infrastructure Recommendations

**Required Testing Infrastructure**:

```yaml
# Testing Infrastructure Stack

unit_testing:
  framework: "Jest (Frontend + Backend)"
  coverage_tool: "Istanbul/nyc"
  ci_integration: "GitHub Actions"
  requirements:
    - "Parallel test execution"
    - "Watch mode for development"
    - "Coverage reports uploaded to Codecov"

integration_testing:
  framework: "Jest + Supertest (Backend API)"
  database: "PostgreSQL Test Container"
  ci_integration: "GitHub Actions"
  requirements:
    - "Test database isolation (transactions)"
    - "Test data fixtures and factories"
    - "API contract validation"

e2e_testing:
  framework: "Playwright"
  browsers: ["Chromium", "Firefox", "WebKit"]
  ci_integration: "GitHub Actions"
  requirements:
    - "Headless execution for CI"
    - "Video recording on failure"
    - "Screenshot capture for assertions"
    - "Test data seeding API"

load_testing:
  tool: "k6"
  ci_integration: "GitHub Actions (scheduled)"
  monitoring: "Grafana + Prometheus"
  requirements:
    - "Gradual ramp-up simulation"
    - "Custom metrics for KPIs"
    - "Performance baseline comparison"

security_testing:
  sca_tool: "Snyk or Dependabot"
  sast_tool: "ESLint security plugins"
  dependency_check: "npm audit"
  requirements:
    - "Automated vulnerability scanning"
    - "Secret detection (gitleaks)"
  ```

### 6.3 Test Data Management Strategy

**Required Test Data Strategy**:

```typescript
// Test Data Fixtures and Factories

// ❌ NOT ADDRESSED IN FIP: Test Data Management
// REQUIRED: Comprehensive test data strategy

/**
 * Test Data Factory Pattern
 */
class TestDataFactory {
  /**
   * Create test conversation with realistic data
   */
  static createConversation(overrides?: Partial<Conversation>) {
    return {
      id: generateUUID(),
      instance_id: generateUUID(),
      user_id: generateUUID(),
      title: 'Test Conversation',
      preview: 'This is a test conversation',
      message_count: 5,
      created_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      is_archived: false,
      metadata: {},
      ...overrides
    };
  }

  /**
   * Create test message with various content types
   */
  static createMessage(overrides?: Partial<ConversationMessage>) {
    return {
      id: generateUUID(),
      conversation_id: generateUUID(),
      role: 'user',
      content: 'Test message content',
      tool_calls: null,
      tool_results: null,
      created_at: new Date().toISOString(),
      metadata: null,
      ...overrides
    };
  }

  /**
   * Create test user instance
   */
  static createUserInstance(overrides?: Partial<UserInstance>) {
    return {
      instance_id: generateUUID(),
      name: 'Test Instance',
      status: 'running',
      last_accessed_at: new Date().toISOString(),
      conversation_count: 3,
      last_conversation_preview: {
        id: generateUUID(),
        title: 'Last Conversation',
        created_at: new Date().toISOString()
      },
      created_at: new Date().toISOString(),
      ...overrides
    };
  }

  /**
   * Create edge case datasets
   */
  static createEdgeCaseDatasets() {
    return {
      empty_conversation: this.createConversation({ message_count: 0 }),
      single_message: this.createConversation({ message_count: 1 }),
      large_conversation: this.createConversation({
        message_count: 10000,
        title: 'Large Conversation Test'
      }),
      long_title: this.createConversation({
        title: 'A'.repeat(255)
      }),
      special_chars: this.createConversation({
        title: '<script>alert("test")</script>',
        preview: 'Test with emoji 🎉 and 中文'
      })
    };
  }

  // NOT SPECIFIED IN FIP
}

/**
 * Test Database Seeding
 */
class TestDatabaseSeeder {
  /**
   * Seed database with test data
   */
  static async seed(options: {
    userCount: number;
    instancesPerUser: number;
    conversationsPerInstance: number;
    messagesPerConversation: number;
  }) {
    // Implementation required
    // NOT SPECIFIED IN FIP
  }

  /**
   * Clean up test data
   */
  static async cleanup() {
    // Implementation required
    // NOT SPECIFIED IN FIP
  }
}
```

### 6.4 Continuous Integration Testing Strategy

**Required CI/CD Testing Pipeline**:

```yaml
# .github/workflows/test.yml
# ❌ NOT ADDRESSED IN FIP: CI/CD Testing Pipeline

name: Test Suite

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  # Unit Tests
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Run unit tests
        run: |
          npm run test:unit -- --coverage
          npm run test:coverage:report
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
      - name: Check coverage threshold
        run: |
          # Fail if coverage < 80%
          npm run test:coverage:check

  # Integration Tests
  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
      - name: Install dependencies
        run: npm ci
      - name: Run database migrations
        run: npm run migration:test
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test_db
      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: integration-test-results
          path: test-results/

  # E2E Tests
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      - name: Run E2E tests
        run: npm run test:e2e
      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: e2e-test-results
          path: playwright-report/
      - name: Upload screenshots on failure
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: e2e-screenshots
          path: test-results/screenshots/

  # Load Tests (Scheduled)
  load-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule'
    steps:
      - uses: actions/checkout@v3
      - name: Run k6 load tests
        uses: grafana/k6-action@v0.3.0
        with:
          filename: tests/load/conversation-api.js
      - name: Upload load test results
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: load-test-results/

  # Security Tests
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run npm audit
        run: npm audit --audit-level=high
      - name: Run Snyk security scan
        uses: snyk/actions/node@master
      - name: Run gitleaks
        uses: gitleaks/gitleaks-action@v2

  # NOT SPECIFIED IN FIP
```

---

## 7. USER ACCEPTANCE TESTING (UAT) REQUIREMENTS

### 7.1 Usability Testing

**Status**: ❌ MISSING - No usability testing defined

**Required Usability Test Scenarios**:

```typescript
// ❌ NOT ADDRESSED: Usability Testing
describe('User Acceptance Testing - Usability', () => {
  // CRITICAL USABILITY TEST SCENARIOS:

  test('First-time user successfully navigates to conversation', async () => {
    // Scenario: New user logs in and starts first conversation
    // Expected: Clear guidance, no confusion
    // Metrics: Time to first message < 30 seconds
    // NOT SPECIFIED IN FIP
  });

  test('User intuitively understands conversation history', async () => {
    // Scenario: User views conversation list for first time
    // Expected: Clear visual hierarchy, intuitive icons
    // Metrics: Correct interpretation rate > 90%
    // NOT SPECIFIED IN FIP
  });

  test('User can easily recover previous conversation', async () => {
    // Scenario: User wants to continue yesterday's conversation
    // Expected: Simple, direct path to conversation
    // Metrics: Steps to recovery ≤ 3 clicks
    // NOT SPECIFIED IN FIP
  });

  test('User understands pagination controls', async () => {
    // Scenario: User has 100+ conversations
    // Expected: Clear load more button or infinite scroll
    // Metrics: User successfully navigates to last conversation
    // NOT SPECIFIED IN FIP
  });

  // ALL USABILITY TESTS NOT DEFINED
});
```

### 7.2 Accessibility Testing

**Status**: ⚠️ PARTIAL - Mentioned in DoD but no specifics

**Required Accessibility Tests**:

```typescript
// ❌ NOT ADDRESSED: Comprehensive Accessibility Testing
describe('Accessibility Testing', () => {
  // WCAG 2.1 AA REQUIREMENTS:

  test('Keyboard navigation works for all features', async () => {
    // Test scenarios:
    // - Navigate Dashboard using Tab key
    // - Activate buttons using Enter/Space
    // - Navigate conversation list using arrow keys
    // - Focus management after modal open/close
    // - Skip navigation link for screen readers
    // Metrics: All features accessible via keyboard only
    // NOT SPECIFIED IN FIP
  });

  test('Screen reader announces all important information', async () => {
    // Test with NVDA (Windows) / VoiceOver (Mac)
    // Verify:
    // - Instance cards announce name and status
    // - Conversation cards announce title and preview
    // - Buttons have accessible labels
    // - Form inputs have associated labels
    // - Live regions announce dynamic updates
    // Metrics: All info announced correctly
    // NOT SPECIFIED IN FIP
  });

  test('Color contrast meets WCAG AA standards', async () => {
    // Verify contrast ratios:
    // - Normal text: 4.5:1 minimum
    // - Large text (18pt+): 3:1 minimum
    // - UI components: 3:1 minimum
    // Metrics: All color combinations pass axe DevTools
    // NOT SPECIFIED IN FIP
  });

  test('UI scales properly for zoom levels', async () => {
    // Test zoom levels:
    // - 200% zoom (required by WCAG)
    // - 400% zoom (reflow test)
    // Verify:
    // - No horizontal scrolling at 200%
    // - Content reflows vertically at 400%
    // - All features remain functional
    // NOT SPECIFIED IN FIP
  });

  test('Reduced motion preference is respected', async () => {
    // Enable prefers-reduced-motion: reduce
    // Verify:
    // - No auto-playing animations
    // - Instant transitions (no fade/slide)
    // - No scrolling parallax
    // NOT SPECIFIED IN FIP
  });

  // MOST ACCESSIBILITY TESTS NOT DEFINED
});
```

### 7.3 Mobile Responsiveness Testing

**Status**: ⚠️ PARTIAL - Responsive design mentioned but no test plan

**Required Mobile Test Scenarios**:

```typescript
// ❌ NOT ADDRESSED: Mobile Testing Strategy
describe('Mobile Responsiveness Testing', () => {
  // DEVICE TESTING MATRIX:

  const devices = [
    { name: 'iPhone SE', width: 375, height: 667, type: 'small' },
    { name: 'iPhone 14', width: 390, height: 844, type: 'medium' },
    { name: 'iPad', width: 768, height: 1024, type: 'tablet' },
    { name: 'Desktop', width: 1920, height: 1080, type: 'desktop' }
  ];

  test.each(devices)('Layout works correctly on $name', async ({ width, height, type }) => {
    // Set viewport size
    await page.setViewportSize({ width, height });

    // Test: Dashboard layout
    await page.goto('/dashboard');
    await expect(page.locator('.instance-list')).toBeVisible();

    if (type === 'small') {
      // Mobile: Single column layout
      await expect(page.locator('.grid-cols-1')).toBeVisible();
    } else if (type === 'tablet') {
      // Tablet: 2 column layout
      await expect(page.locator('.grid-cols-2')).toBeVisible();
    } else {
      // Desktop: 3 column layout
      await expect(page.locator('.grid-cols-3')).toBeVisible();
    }

    // Test: No horizontal scrolling
    const pageWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(width);

    // NOT SPECIFIED IN FIP
  });

  test('Touch interactions work on mobile devices', async () => {
    // Test: Swipe to delete conversation
    const conversationCard = page.locator('.conversation-card').first();
    await conversationCard.swipe('left');

    // Verify: Delete button appears
    await expect(page.locator('.delete-button')).toBeVisible();

    // Test: Tap targets meet minimum size (44x44px)
    const buttons = await page.locator('button').all();
    for (const button of buttons) {
      const box = await button.boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }

    // NOT SPECIFIED IN FIP
  });

  test('Virtual keyboard does not break layout', async () => {
    // Test: Focus on message input
    await page.goto('/instances/test/chat');
    await page.locator('textarea').focus();

    // Simulate virtual keyboard appearing (reduces viewport height)
    await page.setViewportSize({ width: 375, height: 400 }); // Reduced from 667

    // Verify: Input still visible and accessible
    await expect(page.locator('textarea')).toBeInViewport();

    // Verify: Message list does not shift awkwardly
    const messageList = page.locator('.message-list');
    const initialPosition = await messageList.boundingBox();

    // NOT SPECIFIED IN FIP
  });

  // MOST MOBILE TESTS NOT DEFINED
});
```

### 7.4 Cross-Browser Compatibility Testing

**Status**: ❌ MISSING - No browser compatibility specified

**Required Browser Test Matrix**:

```typescript
// ❌ NOT ADDRESSED: Cross-Browser Testing
describe('Cross-Browser Compatibility', () => {
  // BROWSER TESTING MATRIX:

  const browsers = [
    { name: 'Chrome', version: '120+', platform: ['Desktop', 'Android'] },
    { name: 'Firefox', version: '120+', platform: ['Desktop'] },
    { name: 'Safari', version: '17+', platform: ['Desktop', 'iOS'] },
    { name: 'Edge', version: '120+', platform: ['Desktop'] }
  ];

  test.each(browsers)('Core features work in $name $version', async ({ name, version }) => {
    // Test critical user journeys:
    // 1. Login via Feishu OAuth
    // 2. View Dashboard with instances
    // 3. Navigate to conversation list
    // 4. Restore conversation
    // 5. Send new message
    // 6. Verify message persistence

    // Metrics: All features pass without errors
    // NOT SPECIFIED IN FIP
  });

  test('WebSocket works consistently across browsers', async ({ browserName }) => {
    // Test: Establish WebSocket connection
    // Test: Send and receive messages
    // Test: Handle disconnection and reconnection
    // Metrics: Consistent behavior across browsers
    // NOT SPECIFIED IN FIP
  });

  test('Date formatting works across locales', async ({ browserName }) => {
    // Test: Set browser locale to different languages
    // Verify: Relative time formatting adapts
    // Verify: Absolute date formatting adapts
    // Metrics: Correct formatting for zh-CN, en-US
    // NOT SPECIFIED IN FIP
  });

  // ALL CROSS-BROWSER TESTS NOT DEFINED
});
```

---

## 8. QUALITY RISK ASSESSMENT

### 8.1 High-Risk Areas Requiring Mitigation

**Risk 1: Performance Degradation with Large Datasets**

**Risk Level**: 🔴 CRITICAL

**Description**: The feature may become unusably slow with realistic data volumes.

**Indicators**:
- No performance testing for 1000+ conversations
- No database query optimization validation
- No frontend virtual scrolling proof-of-concept

**Mitigation Requirements**:
```yaml
mitigation_plan:
  phase_1:
    - "Create performance test dataset (1000 convos, 100 msgs each)"
    - "Benchmark database queries with EXPLAIN ANALYZE"
    - "Test frontend rendering with Chrome DevTools Performance tab"
    - "Effort: 2-3 days"

  phase_2:
    - "Implement virtual scrolling if needed (react-window)"
    - "Add database query optimization (indexes, query tuning)"
    - "Implement pagination strategy for large lists"
    - "Effort: 3-5 days"

  phase_3:
    - "Load test with k6 (100 concurrent users)"
    - "Set up performance regression testing in CI/CD"
    - "Define performance SLOs and alerts"
    - "Effort: 2-3 days"

  success_criteria:
    - "Dashboard load <500ms with 1000 instances"
    - "Conversation list load <500ms with 10000 conversations"
    - "Conversation restore <2s with 10000 messages"
    - "No memory leaks after 10 minutes of usage"
```

**Risk 2: Authorization Bypass Vulnerabilities**

**Risk Level**: 🔴 CRITICAL

**Description**: Users may access conversations they shouldn't due to incomplete authorization checks.

**Indicators**:
- No authorization test matrix defined
- No test for user accessing another user's conversations
- No test for conversation ownership enforcement

**Mitigation Requirements**:
```yaml
mitigation_plan:
  phase_1:
    - "Create authorization test matrix (all API endpoints)"
    - "Test user cannot access another user's conversations"
    - "Test user cannot create conversations for unowned instances"
    - "Test user cannot modify conversation ownership"
    - "Effort: 2-3 days"

  phase_2:
    - "Implement authorization middleware (if not present)"
    - "Add ownership checks to all conversation endpoints"
    - "Add audit logging for authorization failures"
    - "Effort: 3-4 days"

  phase_3:
    - "Security review by security engineer"
    - "Penetration testing for authorization bypass"
    - "Document authorization architecture"
    - "Effort: 2-3 days"

  success_criteria:
    - "All authorization tests pass (100% coverage)"
    - "Security review approved with zero HIGH findings"
    - "Authorization architecture documented"
```

**Risk 3: WebSocket and REST API Race Conditions**

**Risk Level**: 🟡 HIGH

**Description**: Messages sent via WebSocket may not be saved to conversations in correct order.

**Indicators**:
- No race condition testing specified
- No message ordering guarantees defined
- No concurrent message save testing

**Mitigation Requirements**:
```yaml
mitigation_plan:
  phase_1:
    - "Define message ordering requirements"
    - "Test concurrent message sends from same user"
    - "Test rapid consecutive message sends"
    - "Test WebSocket message save failures"
    - "Effort: 2-3 days"

  phase_2:
    - "Implement message queue for saving"
    - "Add optimistic updates with rollback on failure"
    - "Implement message deduplication logic"
    - "Add client-side message ordering"
    - "Effort: 4-5 days"

  phase_3:
    - "Stress test with 100 concurrent users sending messages"
    - "Chaos engineering: simulate network failures"
    - "Set up monitoring for message save failures"
    - "Effort: 2-3 days"

  success_criteria:
    - "Messages always saved in correct order"
    - "No duplicate messages in conversations"
    - "Failed saves don't block UI"
    - "Message save failures are recoverable"
```

**Risk 4: Mobile Usability Issues**

**Risk Level**: 🟡 HIGH

**Description**: Feature may not work well on mobile devices due to lack of mobile-specific testing.

**Indicators**:
- No mobile device testing specified
- No touch interaction testing
- No virtual keyboard handling tests

**Mitigation Requirements**:
```yaml
mitigation_plan:
  phase_1:
    - "Test on real iOS and Android devices"
    - "Test touch interactions (tap, swipe, pinch)"
    - "Test virtual keyboard appearance/disappearance"
    - "Test device orientation changes"
    - "Effort: 3-4 days"

  phase_2:
    - "Implement mobile-specific optimizations"
    - "Add touch-friendly UI elements (min 44x44px)"
    - "Implement swipe gestures for common actions"
    - "Optimize layout for small screens"
    - "Effort": 5-7 days"

  phase_3:
    - "User testing with mobile users"
    - "Accessibility testing on mobile"
    - "Performance testing on mobile devices"
    - "Effort: 2-3 days"

  success_criteria:
    - "All features work on iOS Safari and Chrome Mobile"
    - "Touch interactions work smoothly"
    - "Virtual keyboard doesn't break layout"
    - "Mobile performance scores >90"
```

### 8.2 Risk-Based Testing Prioritization

```yaml
# Risk-Based Testing Matrix

# P0 (Blocking) - Must pass before feature release
p0_tests:
  authorization:
    - "User cannot access another user's conversations"
    - "User cannot create conversations for unowned instances"
    - "Conversation ownership enforced on all operations"

  performance:
    - "Dashboard load <500ms with typical data volume"
    - "Conversation list load <500ms with pagination"
    - "Conversation restore <2s for large conversations"

  data_integrity:
    - "Messages saved correctly to database"
    - "Message ordering preserved"
    - "No duplicate messages"

  critical_paths:
    - "Login → Dashboard → Instance → Chat flow works"
    - "Conversation list → Conversation → Chat flow works"
    - "Message send → WebSocket → Database flow works"

# P1 (High) - Should pass before feature release
p1_tests:
  usability:
    - "First-time user can navigate successfully"
    - "Conversation recovery intuitive"
    - "Error messages are user-friendly"

  edge_cases:
    - "Empty conversation lists handled"
    - "Large conversations (1000+ messages) handled"
    - "Network failures handled gracefully"

  accessibility:
    - "Keyboard navigation works"
    - "Screen reader announces all info"
    - "Color contrast meets WCAG AA"

  mobile:
    - "Touch interactions work"
    - "Virtual keyboard handled"
    - "Responsive layout works"

# P2 (Medium) - Can defer to post-release
p2_tests:
  nice_to_have:
    - "Browser compatibility (all browsers)"
    - "Advanced accessibility (reduced motion, etc.)"
    - "Advanced mobile features (swipe gestures)"
    - "Performance optimization (beyond baseline)"
```

---

## 9. TESTING PLAN TEMPLATE

### 9.1 Comprehensive Test Plan Structure

**Required Document**: `TEST_PLAN_ISSUE22.md` (to be created)

```markdown
# Test Plan: Issue #22 - Dashboard Session Recovery

## 1. Test Scope

### 1.1 In Scope
- Dashboard instance list display
- Conversation list and pagination
- Conversation restoration and message history
- WebSocket + conversation persistence integration
- User authorization and data isolation
- Performance targets (Section 7.3)
- Mobile responsiveness
- Accessibility (WCAG 2.1 AA)

### 1.2 Out of Scope
- Search and filtering functionality (P1 feature)
- Conversation sharing/collaboration
- Advanced analytics/reporting
- Multi-language support

## 2. Test Strategy

### 2.1 Unit Testing
- Framework: Jest
- Coverage Target: >80% for new code
- Execution: Local development + CI/CD

### 2.2 Integration Testing
- Framework: Jest + Supertest
- Coverage: All API endpoints
- Database: Test container with transaction rollback

### 2.3 E2E Testing
- Framework: Playwright
- Browsers: Chromium, Firefox, WebKit
- Execution: CI/CD + pre-release validation

### 2.4 Performance Testing
- Tool: k6 for load testing
- Scenarios: Defined in Section 4.1
- Execution: Scheduled in CI/CD (weekly)

### 2.5 Security Testing
- Tools: npm audit, Snyk, gitleaks
- Scenarios: Defined in Section 5
- Execution: Every PR + pre-release

### 2.6 Accessibility Testing
- Tools: axe DevTools, Lighthouse, NVDA/VoiceOver
- Standard: WCAG 2.1 AA
- Execution: Pre-release validation

## 3. Test Scenarios

[Detailed test scenarios for each testing type - see Sections 2-5]

## 4. Test Data Management

### 4.1 Test Data Fixtures
[Define all test data fixtures using factory pattern]

### 4.2 Test Database Setup
[Database seeding and cleanup procedures]

### 4.3 Test Data Privacy
[Anonymization and privacy procedures for test data]

## 5. Test Environment

### 5.1 Local Development Environment
[Setup instructions for local testing]

### 5.2 CI/CD Testing Environment
[GitHub Actions workflow configuration]

### 5.3 Staging Environment
[Pre-production testing procedures]

## 6. Entry and Exit Criteria

### 6.1 Entry Criteria
- All FIP documents approved
- Test plan reviewed and approved
- Test environment prepared
- Test data fixtures created

### 6.2 Exit Criteria
- All P0 tests passing (100%)
- All P1 tests passing (>95%)
- Performance benchmarks met
- Security review approved
- Accessibility score >90
- Documentation complete

## 7. Defect Management

### 7.1 Severity Definitions
- P0 (Blocking): Feature unusable, data loss risk, security vulnerability
- P1 (High): Major functionality broken, significant usability issue
- P2 (Medium): Minor functionality issue, workaround available
- P3 (Low): Cosmetic issue, nice to have

### 7.2 Defect Reporting
[Template and procedure for reporting defects]

### 7.3 Defect Triage
[Process for triaging and prioritizing defects]

## 8. Test Schedule

### 8.1 Testing Timeline
[Aligned with implementation phases in Section 7]

### 8.2 Milestones
[Key testing milestones and checkpoints]

## 9. Resources

### 9.1 Team Responsibilities
- QA Lead: Test strategy, execution planning
- Frontend Dev: Unit tests, component tests
- Backend Dev: Unit tests, API integration tests
- Security Engineer: Security testing
- Performance Engineer: Load and stress testing

### 9.2 Tools and Infrastructure
[List all testing tools and infrastructure]

## 10. Reporting

### 10.1 Daily Test Report
[Template for daily test status reporting]

### 10.2 Weekly Test Summary
[Template for weekly test summary reporting]

### 10.3 Final Test Report
[Template for final test report with recommendations]

## Appendices

### Appendix A: Test Case Repository
[Link to detailed test cases in test management tool]

### Appendix B: Test Data Samples
[Sample test data for various scenarios]

### Appendix C: Performance Baselines
[Baseline performance measurements for comparison]
```

### 9.2 Test Case Templates

**Required Test Case Documentation**:

```yaml
# Test Case Template

test_case:
  id: "TC-001"
  title: "User can view claimed instances on Dashboard"
  priority: "P0"
  type: "Functional"
  status: "Draft"

  description:
    "Verify that when a user logs in and navigates to Dashboard,
     all instances they have claimed are displayed in the instance list."

  preconditions:
    - "User has completed Feishu OAuth login"
    - "User has claimed at least 1 instance"
    - "Instances have associated conversations"

  test_data:
    user_id: "test-user-001"
    instances:
      - instance_id: "inst-001"
        name: "Test Instance 1"
        status: "running"
        conversation_count: 5
      - instance_id: "inst-002"
        name: "Test Instance 2"
        status: "stopped"
        conversation_count: 0

  test_steps:
    - step: 1
      action: "Navigate to /dashboard"
      expected_result: "Dashboard page loads successfully"

    - step: 2
      action: "Locate 'My Instances' section"
      expected_result: "Section is visible below stats cards"

    - step: 3
      action: "Verify instance cards are displayed"
      expected_result:
        "Instance cards displayed in grid layout (1 col mobile, 2 col tablet, 3 col desktop)"

    - step: 4
      action: "Verify instance information on card"
      expected_result:
        "Card displays: instance name, status badge, last accessed time,
         conversation count, last conversation preview (if exists)"

    - step: 5
      action: "Verify instance card actions"
      expected_result:
        "'Enter Conversation' button and 'View History' button are visible and clickable"

  test_scenarios:
    - scenario: "Happy path with 3 instances"
      data:
        instance_count: 3
      expected_result: "All 3 instances displayed"

    - scenario: "Edge case with 0 instances"
      data:
        instance_count: 0
      expected_result: "Empty state message displayed"

    - scenario: "Edge case with 100 instances"
      data:
        instance_count: 100
      expected_result: "First 20 displayed, pagination available"

  postconditions:
    - "No console errors or warnings"
    - "No visual layout issues"
    - "Performance target met: Dashboard load <500ms"

  automation:
    automated: true
    framework: "Playwright"
    script_path: "tests/e2e/dashboard-instance-list.spec.ts"

  references:
    - "Frontend FIP Section 3.1: Dashboard Page Enhancement"
    - "Frontend FIP Section 3.2: InstanceCard Component"
    - "Acceptance Criterion FR-1.1"
```

---

## 10. FINAL RECOMMENDATIONS

### 10.1 Summary of Critical Actions

**Before Implementation Begins (MUST COMPLETE)**:

1. ✅ **Create Comprehensive Test Plan** (Section 9.1)
   - Effort: 3-5 days
   - Owner: QA Lead
   - Approver: Tech Lead

2. ✅ **Refine Acceptance Criteria** (Section 2.1)
   - Replace all subjective criteria with objective measures
   - Specify exact performance targets with dataset sizes
   - Define test environment baseline
   - Effort: 2-3 days
   - Owner: Product Manager + Tech Lead

3. ✅ **Design Security Test Suite** (Section 5)
   - Authorization test matrix
   - Input validation test cases
   - Session security tests
   - Data privacy verification
   - Effort: 3-4 days
   - Owner: Security Engineer + QA Lead

4. ✅ **Establish Performance Testing Framework** (Section 4)
   - Select and configure load testing tools
   - Create performance test scenarios
   - Set up automated performance regression testing
   - Effort: 4-5 days
   - Owner: Performance Engineer + Backend Lead

**During Implementation (INTEGRATE INTO PHASES)**:

5. ✅ **Implement Continuous Testing** (Section 6.4)
   - Set up CI/CD testing pipeline
   - Automate test execution on every PR
   - Enforce coverage thresholds
   - Effort: 2-3 days (can be done in parallel with Phase 1)
   - Owner: DevOps Engineer

6. ✅ **Create Test Data Management Strategy** (Section 6.3)
   - Implement test data factories
   - Set up test database seeding
   - Create edge case datasets
   - Effort: 2-3 days (can be done in parallel with Phase 1)
   - Owner: QA Engineer

7. ✅ **Document Test Cases** (Section 9.2)
   - Create detailed test cases for all scenarios
   - Link test cases to acceptance criteria
   - Set up test case management tool
   - Effort: Ongoing throughout implementation
   - Owner: QA Team

### 10.2 Conditional Approval Criteria

**This FIP is CONDITIONALLY APPROVED provided that**:

1. **All critical actions (10.1) are completed before Phase 1 end**
2. **Test Plan is approved by QA Lead, Tech Lead, and Product Manager**
3. **Security review is completed with zero HIGH/CRITICAL findings**
4. **Performance benchmarks are established and validated**
5. **Accessibility requirements are defined and testable**

**Approval Checklist**:

```yaml
conditional_approval_checklist:
  test_plan_created:
    status: "PENDING"
    approvers: ["QA Lead", "Tech Lead", "Product Manager"]
    evidence: "Approved TEST_PLAN_ISSUE22.md"

  acceptance_criteria_refined:
    status: "PENDING"
    approvers: ["Product Manager", "Tech Lead"]
    evidence: "Updated acceptance criteria document"

  security_tests_designed:
    status: "PENDING"
    approvers: ["Security Engineer", "QA Lead"]
    evidence: "Security test scenarios document"

  performance_framework_established:
    status: "PENDING"
    approvers: ["Performance Engineer", "Backend Lead"]
    evidence: "Load test scripts and baseline measurements"

  continuous_testing_configured:
    status: "PENDING"
    approvers: ["DevOps Engineer", "QA Lead"]
    evidence: "GitHub Actions workflow with test automation"

phase_1_completion_gate:
  criteria:
    - "All P0 test scenarios defined"
    - "Test data factories implemented"
    - "Unit test coverage >80% for new code"
    - "Integration tests passing"
    - "Security review completed"

phase_2_completion_gate:
  criteria:
    - "All P0 + P1 test scenarios defined"
    - "E2E tests for dashboard flow passing"
    - "Performance benchmarks met"
    - "Accessibility score >90"

phase_3_completion_gate:
  criteria:
    - "All test scenarios executed"
    - "P0 tests: 100% pass rate"
    - "P1 tests: >95% pass rate"
    - "Performance targets validated under load"
    - "Security review approved"
    - "UAT feedback addressed"

final_release_gate:
  criteria:
    - "All acceptance criteria met with evidence"
    - "All P0 and P1 tests passing"
    - "Performance benchmarks met in staging"
    - "Security review approved with zero HIGH findings"
    - "Accessibility score >90 in production"
    - "Documentation complete"
    - "Rollback plan tested"
```

### 10.3 Risk Mitigation Summary

**Key Risks and Mitigations**:

| Risk | Impact | Probability | Mitigation | Owner |
|------|--------|-------------|------------|-------|
| Performance degradation with large datasets | 🔴 HIGH | 🟡 MEDIUM | Implement virtual scrolling, pagination, load testing | Frontend Lead + Performance Engineer |
| Authorization bypass vulnerabilities | 🔴 CRITICAL | 🟡 MEDIUM | Comprehensive authz testing, security review | Security Engineer + Backend Lead |
| WebSocket/REST race conditions | 🟡 MEDIUM | 🟡 MEDIUM | Message queue implementation, chaos testing | Backend Lead + QA Engineer |
| Mobile usability issues | 🟡 MEDIUM | 🟡 MEDIUM | Real device testing, touch interaction testing | Frontend Lead + QA Engineer |
| Incomplete test coverage | 🔴 HIGH | 🟡 MEDIUM | Enforce coverage thresholds, test case review | QA Lead + Tech Lead |

### 10.4 Next Steps

**Immediate Actions (This Week)**:

1. **Schedule Test Planning Workshop** (Day 1-2)
   - Attendees: QA Lead, Tech Lead, Product Manager, Security Engineer
   - Agenda: Review testing gaps, define test plan structure
   - Output: Test plan outline

2. **Create Test Plan Document** (Day 3-5)
   - Owner: QA Lead
   - Based on template in Section 9.1
   - Review cycle: QA Lead → Tech Lead → Product Manager

3. **Refine Acceptance Criteria** (Day 3-4)
   - Owner: Product Manager + Tech Lead
   - Replace subjective criteria with objective measures
   - Specify performance targets and test environment

4. **Set Up Testing Infrastructure** (Day 4-5)
   - Owner: DevOps Engineer + QA Lead
   - Configure CI/CD testing pipeline
   - Set up test databases and containers

**Week 2 Actions (After Planning Complete)**:

5. **Implement Test Data Factories** (Day 6-8)
   - Owner: QA Engineer
   - Create factory pattern for test data
   - Set up edge case datasets

6. **Design Security Test Suite** (Day 6-9)
   - Owner: Security Engineer + QA Lead
   - Authorization test matrix
   - Input validation tests
   - Session security tests

7. **Establish Performance Testing Framework** (Day 6-10)
   - Owner: Performance Engineer + Backend Lead
   - Configure k6 or Artillery
   - Create baseline measurements
   - Set up automated performance regression testing

**Week 3 Actions (Before Phase 1 End)**:

8. **Review and Approve Test Plan** (Day 11-12)
   - Reviewers: All stakeholders
   - Approvals: QA Lead, Tech Lead, Product Manager, Security Engineer
   - Final approval: Engineering Manager

9. **Validate Test Infrastructure** (Day 12-13)
   - Run smoke tests on all infrastructure
   - Verify CI/CD pipeline execution
   - Validate test data factories

10. **Conduct Test Plan Review Meeting** (Day 14-15)
    - Present final test plan
    - Get sign-off from all stakeholders
    - Mark Phase 1 complete

---

## 11. CONCLUSION

### Overall Assessment

The FIP documents for Issue #22 demonstrate **strong technical planning** with comprehensive component design, API specifications, and implementation phases. However, **critical testing gaps** prevent unconditional approval at this time.

### Strengths

✅ **Well-structured architecture** with clear separation of concerns
✅ **Detailed component specifications** with code examples
✅ **Performance considerations** addressed (pagination, caching, virtual scrolling)
✅ **Security awareness** evident in authentication/authorization mentions
✅ **Phased implementation approach** with clear deliverables

### Critical Gaps

❌ **No comprehensive test strategy** - Testing mentioned but not detailed
❌ **Subjective acceptance criteria** - Many criteria not objectively testable
❌ **Missing performance testing** - Load/stress testing not defined
❌ **Incomplete security testing** - Authorization/input validation tests not specified
❌ **No edge case coverage** - Boundary conditions not systematically addressed
❌ **UAT requirements undefined** - Usability, accessibility, mobile testing not specified

### Approval Decision

**CONDITIONAL APPROVAL** ✅⚠️

The implementation may proceed **PROVIDED** that:

1. All critical testing gaps (Section 2) are addressed **before Phase 1 completion**
2. A comprehensive Test Plan is created and approved (template in Section 9.1)
3. Performance benchmarks are established and validated (Section 4)
4. Security testing requirements are integrated (Section 5)
5. All conditional approval criteria (Section 10.2) are met

### Risk Level

**MEDIUM-HIGH RISK** 🟡🔴

**Rationale**:
- High-quality technical design reduces implementation risk
- Critical testing gaps increase quality and security risk
- Complexity of WebSocket + REST integration increases technical risk
- Performance and usability requirements are ambitious

**Risk Mitigation**:
- Address all critical testing gaps before implementation
- Implement continuous testing from Phase 1
- Conduct frequent security and performance reviews
- Maintain close collaboration between QA, development, and product teams

### Final Recommendation

**PROCEED WITH CAUTION** - The feature is well-designed but requires significant testing infrastructure and planning before implementation can begin safely. The conditional approval ensures that quality and security are prioritized alongside feature delivery.

**Estimated Additional Effort**: 10-15 days for testing infrastructure and planning before Phase 1 completion. This effort is **critical for preventing quality and security issues** that would be far more expensive to fix post-release.

**Quality Engineering confidence**: **HIGH** that with the recommended improvements, this feature can be delivered successfully with acceptable quality and security posture.

---

**Report Approved By**: [Quality Engineer Name]
**Report Date**: 2026-03-19
**Review Status**: CONDITIONAL APPROVAL ✅⚠️
**Next Review**: After Test Plan completion (expected 2026-03-26)

**Document Version**: 1.0
**Last Updated**: 2026-03-19
