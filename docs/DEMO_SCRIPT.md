# DoseGuard AI — 3-Minute Public Demo Video Script

**Target Duration**: 2 minutes 45 seconds  
**Format**: Live screen recording of the deployed DoseGuard AI application + AWS Management Console

---

## [0:00 – 0:25] The Problem & Closed-Loop Architecture
- **Visual**: Open the **DoseGuard AI Landing Page** (`/`), scrolling smoothly to the **AWS Step Functions Standard Workflow** pipeline banner (`SCHEDULE → REMINDER → PATIENT CONFIRMATION → STATUS CHECK → CAREGIVER ESCALATION`).
- **Narration**:
  > "Millions of elderly patients take critical daily medications, yet conventional pill reminder apps stop at displaying a notification. If a patient forgets or is unwell, family caregivers have no idea a dose was missed.
  > Meet **DoseGuard AI**—a 100% serverless medication safety and caregiver escalation platform built on AWS Lambda, API Gateway, DynamoDB, S3, EventBridge Scheduler, and AWS Step Functions."

---

## [0:25 – 0:55] Cognito Authentication & Timezone-Aware Medication Scheduling
- **Visual**:
  1. Sign in via **Amazon Cognito** (`/auth`) as a patient (`Eleanor Vance`).
  2. Navigate to **Medications** (`/medications`) and add `Atorvastatin 20mg` scheduled at `08:00` in `Asia/Kolkata`.
  3. Briefly switch to the **AWS Console → Amazon EventBridge Scheduler** to show the newly provisioned schedule `dg-med-<id>` with `FlexibleTimeWindow: OFF` and IANA timezone `Asia/Kolkata`.
- **Narration**:
  > "Authenticated via Amazon Cognito JWTs, a patient adds their medication schedule and IANA timezone. Our Lambda backend persists the record to DynamoDB and immediately provisions a deterministic recurring rule in Amazon EventBridge Scheduler."

---

## [0:55 – 1:30] Scenario A: Patient Confirmation Prevents Escalation
- **Visual**:
  1. Navigate to **Dose Confirmation** (`/doses`).
  2. Click **Run Step Functions Workflow (60s Demo Window)** to launch an execution of `DoseGuardAI-ReminderAndEscalationWorkflow`.
  3. Show the **AWS Step Functions Console** visual graph pausing on `WaitForPatientResponseWindow`.
  4. In the DoseGuard AI portal, click **Confirm as Taken**.
  5. Show the Step Functions execution completing via `VerifyDoseStatusAndEscalate` with outcome `CONFIRMED_IN_TIME` and `caregiversNotified: 0`.
- **Narration**:
  > "When a dose is due, Step Functions sends an idempotent patient reminder and enters a configurable wait window—15 minutes in production, or 60 seconds for our live demo. When the patient confirms the dose on time, Step Functions verifies the DynamoDB status and completes cleanly without troubling the caregiver."

---

## [1:30 – 2:10] Scenario B: Single-Use Caregiver Invitation & Automatic Missed-Dose Escalation
- **Visual**:
  1. Open **Caregiver Access** (`/caregivers`), generate a single-use SHA-256 hashed passcode (`DG-XXXX-XXXX-XXXX-XXXX`), and redeem it in the caregiver account.
  2. Trigger a second Step Functions workflow for an unconfirmed dose (`Metoprolol 50mg`) and do not confirm it.
  3. Show the Step Functions execution transitioning to `ESCALATED_TO_CAREGIVERS` and open the **Caregiver Dashboard** (`/caregiver-portal`) to display the live missed-dose escalation alert.
- **Narration**:
  > "Patients invite caregivers using cryptographically random single-use passcodes stored as SHA-256 hashes in DynamoDB. When a dose remains unconfirmed after the response window, Step Functions automatically marks the dose as MISSED and dispatches an idempotent escalation alert to connected caregivers."

---

## [2:10 – 2:45] Real-Time Analytics & Private S3 Presigned Reports
- **Visual**:
  1. Open **Adherence Analytics** (`/analytics`) to show the Recharts Taken vs. Missed bar chart and daily adherence trend line.
  2. Open **S3 Reports** (`/reports`), generate a 30-day CSV report stored in the private `DoseGuardReportsBucket`, and click **Presigned Download** to download via a 5-minute presigned URL.
- **Narration**:
  > "Finally, patients and authorized caregivers can inspect real-time adherence analytics and export compliance reports stored in a private encrypted Amazon S3 bucket accessed exclusively through 5-minute presigned URLs. With DoseGuard AI, no missed medication dose ever goes unnoticed."

