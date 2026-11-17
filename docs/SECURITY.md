# DoseGuard AI — Security Model & Threat Mitigation

## 1. Authentication & Identity Derivation

1. **Amazon Cognito User Pool**:
   - Handles all user sign-up, email verification, password reset, and SRP authentication flows.
   - Plaintext passwords are never transmitted to or stored in DynamoDB or Lambda logs.
2. **API Gateway Cognito JWT Authorizer**:
   - Every `/api/v1/*` route requires a valid Cognito `idToken` bearer token verified at the API Gateway edge before invoking Lambda.
3. **Zero-Trust Identity Extraction (`extractAuthPrincipal`)**:
   - Backend handlers derive the authenticated caller's `userId` exclusively from `event.requestContext.authorizer.jwt.claims.sub`.
   - Requests without a verified `sub` claim immediately fail with `401 UNAUTHORIZED`.

---

## 2. Tenant Isolation & Caregiver Authorization (`assertPatientAccess`)

- Every DynamoDB table partitions patient data by `patientId` (or `userId`).
- Whenever an endpoint accepts an optional `patientId` query parameter or body field, the handler calls `assertPatientAccess(principal.userId, targetPatientId, requiredPermission)`:
  - **Self-Access**: Allowed when `principal.userId === targetPatientId`.
  - **Caregiver Access**: Queries `DoseGuard-Caregivers` for key `{ patientId: targetPatientId, caregiverId: principal.userId }`.
  - Verifies `connection.status === 'ACTIVE'`. If missing or `REVOKED`, throws `403 FORBIDDEN_PATIENT_ACCESS`.
  - **Granular Permission Enforcement**: Write operations (`POST/PATCH/DELETE /api/v1/medications`, dose status changes) require `MANAGE_MEDICATIONS`. Caregivers with `VIEW_ONLY` receive `403 FORBIDDEN_INSUFFICIENT_PERMISSION`.

---

## 3. Cryptographic Caregiver Invitations

1. **High-Entropy Generation**:
   - `generateSecurePasscode()` uses Node.js `crypto.randomBytes(8)` (128-bit cryptographic entropy) formatted as `DG-XXXX-XXXX-XXXX-XXXX`.
2. **No Plaintext Secret Storage**:
   - Only the SHA-256 hex digest (`tokenHash`) is stored as the partition key in `DoseGuard-Invitations`.
   - The raw passcode is returned once in the `201 Created` response to the patient and never stored or logged.
3. **Atomic Single-Use Redemption**:
   - Redemption executes a conditional `UpdateCommand` on `DoseGuard-Invitations`:
     ```text
     ConditionExpression: attribute_exists(tokenHash) AND #status = :pending AND expiresAt > :now AND patientId <> :cid
     ```
   - This single atomic DynamoDB operation prevents:
     - Self-redemption (`patientId <> :cid`)
     - Replay / reuse of already redeemed tokens (`#status = :pending`)
     - Redemption of revoked invitations
     - Redemption of expired invitations (`expiresAt > :now`)
4. **Automatic Expiration Cleanup**:
   - `DoseGuard-Invitations` configures DynamoDB TTL on the `ttl` attribute.

---

## 4. Private S3 Storage & Presigned Report Downloads

- Both `DoseGuardFrontendBucket` and `DoseGuardReportsBucket` enforce:
  - `BlockPublicAccess.BLOCK_ALL`
  - `BucketEncryption.S3_MANAGED` (SSE-S3 AES-256 encryption at rest)
  - `enforceSSL: true` (rejects any non-HTTPS transport)
- **Frontend Bucket**: Accessible only by Amazon CloudFront via Origin Access Control (OAC).
- **Reports Bucket**: Never publicly accessible. When a user requests `GET /api/v1/reports/{id}/download`:
  1. Lambda verifies `assertPatientAccess(principal.userId, report.patientId, 'VIEW_ONLY')`.
  2. Lambda signs a short-lived `GetObjectCommand` URL expiring in **300 seconds (5 minutes)**.
  3. The presigned issuance is recorded in `DoseGuard-Audit`.

---

## 5. Idempotency & Privacy-Safe Logging

- **Idempotent Dose Records**: Deterministic sort key `${medicationId}#${scheduledDate}#${scheduledTime}` with conditional `attribute_not_exists(doseId)` prevents duplicate dose generation.
- **Idempotent Notifications**: Deterministic `notificationId` (`reminder#${doseId}#${patientId}` and `missed#${doseId}#${caregiverId}`) with conditional `attribute_not_exists(notificationId)` ensures Step Functions retries never send duplicate emails or alerts.
- **PHI-Minimal Logging & Subjects**:
  - Structured JSON logs strip `passcode`, `token`, and `authorization` fields.
  - External SNS email subjects use generic safety alerts (`DoseGuard AI: Caregiver Escalation Alert`) rather than exposing sensitive clinical conditions in email headers.
- **Clinical Scope Honesty**:
  - DoseGuard AI does not claim HIPAA certification and does not fabricate AI clinical diagnosis or dosage advice.

