# DoseGuard AI — Deployment & Operations Guide

## 1. Prerequisites

- **Node.js**: v20+ or v24+ (`node --version`)
- **npm**: v10+ (`npm --version`)
- **AWS CLI v2**: Installed and configured with an AWS IAM principal (`aws sts get-caller-identity`)
- **Target Region**: `ap-south-1` (Mumbai) or your preferred AWS region

---

## 2. Step-by-Step Build, Test & CDK Deployment

### Step 1: Install Dependencies, Build & Run Automated Tests
From the monorepo root (`doseguard-ai/`):

```bash
npm install
npm run build
npm test
```

### Step 2: Synthesize & Inspect the AWS CDK CloudFormation Template
```bash
cd infrastructure
npx cdk synth
npx cdk diff
```

### Step 3: Bootstrap & Deploy the AWS CDK Stack
If your AWS account/region has not been bootstrapped for AWS CDK v2 yet:
```bash
npx cdk bootstrap
```

Deploy all serverless resources (`DoseGuardAIStack`):
```bash
npx cdk deploy --all --outputs-file cdk-outputs.json
```

`DoseGuardAIStack` provisions and outputs:
- `AwsRegion`
- `ApiGatewayUrl`
- `CognitoUserPoolId`
- `CognitoUserPoolClientId`
- `FrontendBucketName`
- `ReportsBucketName`
- `CloudFrontDistributionId`
- `CloudFrontPublicUrl`
- `StepFunctionsStateMachineArn`
- `SnsAlertsTopicArn`

### Step 4: Configure Frontend Environment & Deploy to S3 + CloudFront
Create `frontend/.env.production` from the CDK outputs:
```bash
cat <<EOF > ../frontend/.env.production
VITE_AWS_REGION=<AwsRegion>
VITE_API_BASE_URL=<ApiGatewayUrl>
VITE_COGNITO_USER_POOL_ID=<CognitoUserPoolId>
VITE_COGNITO_CLIENT_ID=<CognitoUserPoolClientId>
EOF
```
*(Alternatively, you can paste these four values directly into the **AWS CDK Stack Connection** panel on the `/auth` page in the browser).*

Build the frontend and upload static assets to the private S3 bucket:
```bash
cd ../frontend
npm run build
aws s3 sync dist/ s3://<FrontendBucketName> --delete
aws cloudfront create-invalidation --distribution-id <CloudFrontDistributionId> --paths "/*"
```

---

## 3. Amazon SNS / SES Notification Notes

- **Amazon SNS Topic (`DoseGuardAI-MedicationAlerts`)**:
  - To receive email alerts during the live demo, subscribe your demo email address to the `SnsAlertsTopicArn` topic (`aws sns subscribe --topic-arn <SnsAlertsTopicArn> --protocol email --notification-endpoint <your-email>`) and click **Confirm subscription** in the verification email from AWS Notifications.
  - All notifications are also persisted in `DoseGuard-Notifications` in DynamoDB and displayed in real time on the Patient Dashboard, Caregiver Dashboard, and Analytics Alert History.

---

## 4. Resource Tagging & Cost Controls

Every resource in `DoseGuardAIStack` is tagged with:
- `Project = DoseGuardAI`
- `Environment = Hackathon`

Cost controls enforced in CDK:
- DynamoDB tables use `BillingMode.PAY_PER_REQUEST` (on-demand) and TTL cleanup.
- CloudWatch LogGroups enforce `RetentionDays.ONE_WEEK` (7 days).
- S3 Reports bucket enforces a 30-day object expiration lifecycle rule.
- Zero EC2 instances, NAT Gateways, or RDS instances.

---

## 5. Resource Cleanup Command (Post-Evaluation)

When you wish to tear down all AWS resources created by DoseGuard AI, run:

```bash
cd infrastructure
npx cdk destroy --all
```

**What this command deletes**:
- Removes the CloudFront distribution and both S3 buckets (`autoDeleteObjects: true`).
- Deletes the API Gateway HTTP API, all 10 Lambda functions, and CloudWatch log groups.
- Deletes the Step Functions State Machine, EventBridge Scheduler IAM role, SNS Topic, Cognito User Pool, and all 8 DynamoDB tables.
*(Do not run this command while judges are actively testing your public demo URL).*

