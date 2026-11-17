# DoseGuard AI — Automated Test Results Report

## Execution Summary

- **Test Runner**: `Vitest v2.1.9`
- **Command Executed**: `npm test` (`vitest run`)
- **Total Test Suites**: `3 passed (3)`
- **Total Automated Tests**: `22 passed (22)`

---

## 1. Backend Unit Tests (`tests/unit/backend.unit.test.ts`)

| # | Test Case | Status |
| :--- | :--- | :--- |
| 1 | Medication creation persists to DynamoDB and creates EventBridge schedule (`dg-med-*`) | **PASS** |
| 2 | Medication updates modify DynamoDB record and synchronize EventBridge schedule (`DISABLED` when paused) | **PASS** |
| 3 | Medication deletion removes record and deletes EventBridge schedule | **PASS** |
| 4 | Dose confirmation transitions `PENDING` to `TAKEN` and records timestamp & actor | **PASS** |
| 5 | Duplicate dose confirmation returns `200 OK` with `idempotent: true` without creating duplicate state | **PASS** |
| 6 | Missed-dose workflow escalates unconfirmed dose to connected caregivers | **PASS** |
| 7 | Caregiver invitation creation generates `DG-XXXX-XXXX-XXXX-XXXX` passcode and stores only SHA-256 hash | **PASS** |
| 8 & 9 | Caregiver invitation expiration check and revocation prevent subsequent redemption (`410 GONE`) | **PASS** |
| 10 | Caregiver permission checks enforce `VIEW_ONLY` (allows `GET`, rejects `POST/PATCH/DELETE` with `403`) | **PASS** |
| 11 | Analytics aggregation computes daily, weekly, monthly adherence percentages from DynamoDB records | **PASS** |
| 12 | Report authorization writes CSV/JSON to private S3 bucket and issues 5-minute presigned download URL | **PASS** |
| 13 | Registration / first-login profile provisioning (`GET /api/v1/me`), profile update (`PATCH /api/v1/me`), and `/health` endpoint | **PASS** |
| 14 | Notification listing (`GET /api/v1/notifications`) and mark-as-read (`PATCH /api/v1/notifications/{id}/read`) | **PASS** |

---

## 2. Security & Tenant Isolation Tests (`tests/security/security.test.ts`)

| # | Security Test Case | Status |
| :--- | :--- | :--- |
| 1 | Unauthenticated API request rejected with `401 UNAUTHORIZED` | **PASS** |
| 2 | Invalid / empty JWT `sub` claim rejected with `401 UNAUTHORIZED` | **PASS** |
| 3 | User A cannot read or delete User B's medication by changing `patientId` (`403 FORBIDDEN`) | **PASS** |
| 4 | User A cannot confirm User B's scheduled dose (`403 FORBIDDEN`) | **PASS** |
| 5 | Unconnected caregiver cannot access patient dose or medication data (`403 FORBIDDEN`) | **PASS** |
| 6 | Self-redemption (`400`) and expired invitation redemption (`410`) are rejected | **PASS** |
| 7 | Redeemed invitation cannot be reused by another user (`409 CONFLICT` atomic single-use check) | **PASS** |
| 8 | Revoked caregiver access is immediately rejected on subsequent API calls (`403 FORBIDDEN`) | **PASS** |
| 9 | Private S3 adherence reports cannot be downloaded by unauthorized users (`403 FORBIDDEN`) | **PASS** |

---

## 3. Workflow & Scheduler Integration Tests (`tests/integration/workflow.integration.test.ts`)

| # | Integration Test Case | Status |
| :--- | :--- | :--- |
| 1, 2 & 3 | Medication creation, update, and deletion synchronize `cron(...)` and `ENABLED`/`DISABLED` state in EventBridge Scheduler | **PASS** |
| 4 & 5 | Workflow trigger starts Step Functions state machine execution with configurable `responseWindowSeconds` | **PASS** |
| 6 | Confirmed dose during Step Functions wait window results in `CONFIRMED_IN_TIME` and prevents caregiver escalation (`caregiversNotified: 0`) | **PASS** |
| 7 & 8 | Unconfirmed dose triggers `ESCALATED_TO_CAREGIVERS` and duplicate workflow execution does not send duplicate SNS alerts | **PASS** |

