# DoseGuard AI — AWS Serverless Challenge Submission Narrative

## Project Name
**DoseGuard AI** — Serverless Medication Safety & Caregiver Escalation Platform

---

## 1. Technical Innovation
DoseGuard AI moves beyond passive CRUD tracking by implementing a **deterministic, stateful closed-loop escalation engine** using **Amazon EventBridge Scheduler** and **AWS Step Functions Standard Workflows**:
- **Per-Medication Timezone Scheduling**: Creating, updating, pausing, or deleting a medication in DynamoDB atomically synchronizes a dedicated `dg-med-<id>` schedule in Amazon EventBridge Scheduler configured with the patient's exact IANA timezone and `FlexibleTimeWindowMode.OFF`.
- **Stateful Wait & Verification Loop**: At dose time, Step Functions invokes `reminderWorkflowHandler` to verify whether the medication is active and whether the dose was already confirmed. If still pending, it dispatches an idempotent reminder, pauses in a `Wait` state (`WaitForPatientResponseWindow`), and then invokes `workflowStatusCheckHandler` to re-verify DynamoDB before escalating to connected caregivers.
- **End-to-End Idempotency**: Composite sort keys (`${medicationId}#${scheduledDate}#${scheduledTime}`) and conditional DynamoDB writes (`attribute_not_exists`) ensure that retries or duplicate workflow triggers never create duplicate dose records or send duplicate caregiver alerts.

---

## 2. Craft, Security & Execution
Security and tenant isolation are enforced at every layer:
- **Zero-Trust Identity**: All `/api/v1/*` routes on Amazon API Gateway HTTP API are protected by an **Amazon Cognito JWT Authorizer**. Every Lambda handler extracts the caller's identity strictly from verified JWT `sub` claims.
- **Cryptographic Caregiver Handshake**: Caregiver invitations use 128-bit random passcodes (`DG-XXXX-XXXX-XXXX-XXXX`) where only the **SHA-256 hash** is stored in DynamoDB. Redemption uses a single atomic conditional expression that blocks self-redemption, expired tokens, revoked invitations, and replay attacks.
- **Private S3 Architecture**: Both the frontend asset bucket (served via **Amazon CloudFront Origin Access Control**) and the adherence report bucket enforce `BlockPublicAccess.BLOCK_ALL`, `SSE-S3` encryption, and SSL-only access. Reports are downloaded exclusively through 5-minute presigned URLs after server-side authorization checks.

---

## 3. Usefulness & Real-World Impact
For elderly patients living independently and the family members who care for them, a missed cardiac, diabetes, or blood-pressure dose can become an avoidable medical emergency.
- Patients get a clean, accessible daily schedule and one-click dose confirmation without clinical jargon or fabricated AI medical advice.
- Family caregivers gain peace of mind: they are not spammed when doses are taken on time, and they are alerted automatically when a scheduled dose goes unconfirmed past the response window.

---

## 4. Creativity & User Experience
Designed as a modern dark-navy and teal healthcare SaaS application, DoseGuard AI makes complex serverless orchestration transparent to the user:
- A live **5-Stage Step Functions Pipeline Visualizer** (`SCHEDULE → REMINDER → PATIENT CONFIRMATION → STATUS CHECK → CAREGIVER ESCALATION`) reflects real workflow states (`SCHEDULED`, `REMINDER_SENT`, `CONFIRMED_IN_TIME`, `ESCALATED`) right on the dashboard.
- Includes an explicit **60-Second Demo Workflow Trigger** alongside the 15-minute production window so judges can observe the full Step Functions reminder, wait, confirmation, and caregiver escalation cycle live in under two minutes.

