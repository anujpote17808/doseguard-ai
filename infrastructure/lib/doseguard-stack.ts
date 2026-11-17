import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';

export class DoseGuardStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // 1. AMAZON COGNITO — User Pool & App Client
    // =========================================================================
    const userPool = new cognito.UserPool(this, 'DoseGuardUserPool', {
      userPoolName: 'DoseGuardAI-Users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('DoseGuardWebClient', {
      userPoolClientName: 'DoseGuardAI-WebClient',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      preventUserExistenceErrors: true,
    });

    // =========================================================================
    // 2. AMAZON S3 & CLOUDFRONT — Private Frontend & Private Reports Storage
    // =========================================================================
    const frontendBucket = new s3.Bucket(this, 'DoseGuardFrontendBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const reportsBucket = new s3.Bucket(this, 'DoseGuardReportsBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: 'ExpireGeneratedReportsAfter30Days',
          expiration: cdk.Duration.days(30),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 300,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const oac = new cloudfront.S3OriginAccessControl(this, 'DoseGuardFrontendOAC', {
      description: 'Origin Access Control for DoseGuard AI private frontend S3 bucket',
    });

    const distribution = new cloudfront.Distribution(this, 'DoseGuardCloudFront', {
      comment: 'DoseGuard AI Frontend HTTPS Distribution',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // =========================================================================
    // 3. AMAZON DYNAMODB — Encrypted On-Demand Tables with GSI & TTL
    // =========================================================================
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'DoseGuard-Users',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const medicationsTable = new dynamodb.Table(this, 'MedicationsTable', {
      tableName: 'DoseGuard-Medications',
      partitionKey: { name: 'patientId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'medicationId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const dosesTable = new dynamodb.Table(this, 'DosesTable', {
      tableName: 'DoseGuard-Doses',
      partitionKey: { name: 'patientId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'doseId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const caregiversTable = new dynamodb.Table(this, 'CaregiversTable', {
      tableName: 'DoseGuard-Caregivers',
      partitionKey: { name: 'patientId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'caregiverId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    caregiversTable.addGlobalSecondaryIndex({
      indexName: 'CaregiverPatientsIndex',
      partitionKey: { name: 'caregiverId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'patientId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const invitationsTable = new dynamodb.Table(this, 'InvitationsTable', {
      tableName: 'DoseGuard-Invitations',
      partitionKey: { name: 'tokenHash', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    invitationsTable.addGlobalSecondaryIndex({
      indexName: 'PatientInvitationsIndex',
      partitionKey: { name: 'patientId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const notificationsTable = new dynamodb.Table(this, 'NotificationsTable', {
      tableName: 'DoseGuard-Notifications',
      partitionKey: { name: 'recipientUserId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'notificationId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const reportsTable = new dynamodb.Table(this, 'ReportsTable', {
      tableName: 'DoseGuard-Reports',
      partitionKey: { name: 'patientId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'reportId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const auditTable = new dynamodb.Table(this, 'AuditTable', {
      tableName: 'DoseGuard-Audit',
      partitionKey: { name: 'patientId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'auditId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // =========================================================================
    // 4. AMAZON SNS — Medication Reminders & Caregiver Escalation Topic
    // =========================================================================
    const alertsTopic = new sns.Topic(this, 'DoseGuardAlertsTopic', {
      topicName: 'DoseGuardAI-MedicationAlerts',
      displayName: 'DoseGuard AI Alerts',
    });

    // =========================================================================
    // 5. AWS LAMBDA & STEP FUNCTIONS — Core Workflow & API Handlers
    // =========================================================================
    const bundledCodePath = path.join(__dirname, '../../backend/dist/bundled');
    const frontendOrigin = `https://${distribution.distributionDomainName}`;

    const baseEnv: Record<string, string> = {
      USERS_TABLE: usersTable.tableName,
      MEDICATIONS_TABLE: medicationsTable.tableName,
      DOSES_TABLE: dosesTable.tableName,
      CAREGIVERS_TABLE: caregiversTable.tableName,
      INVITATIONS_TABLE: invitationsTable.tableName,
      NOTIFICATIONS_TABLE: notificationsTable.tableName,
      REPORTS_TABLE: reportsTable.tableName,
      AUDIT_TABLE: auditTable.tableName,
      REPORTS_BUCKET: reportsBucket.bucketName,
      SNS_TOPIC_ARN: alertsTopic.topicArn,
      ALLOWED_ORIGIN: frontendOrigin,
      SCHEDULER_GROUP_NAME: 'default',
    };

    const createDoseGuardLambda = (id: string, handlerFile: string, extraEnv?: Record<string, string>) => {
      const logGroup = new logs.LogGroup(this, `${id}LogGroup`, {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      return new lambda.Function(this, id, {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: `${handlerFile}.handler`,
        code: lambda.Code.fromAsset(bundledCodePath),
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        environment: {
          ...baseEnv,
          ...(extraEnv || {}),
        },
        logGroup,
      });
    };

    // Workflow Lambdas
    const reminderWorkflowFn = createDoseGuardLambda('ReminderWorkflowFunction', 'reminderWorkflowHandler');
    const workflowStatusCheckFn = createDoseGuardLambda(
      'WorkflowStatusCheckFunction',
      'workflowStatusCheckHandler'
    );

    // Grant least-privilege permissions to Workflow Lambdas
    medicationsTable.grantReadData(reminderWorkflowFn);
    dosesTable.grantReadWriteData(reminderWorkflowFn);
    notificationsTable.grantReadWriteData(reminderWorkflowFn);
    auditTable.grantWriteData(reminderWorkflowFn);
    alertsTopic.grantPublish(reminderWorkflowFn);

    dosesTable.grantReadWriteData(workflowStatusCheckFn);
    caregiversTable.grantReadData(workflowStatusCheckFn);
    notificationsTable.grantReadWriteData(workflowStatusCheckFn);
    auditTable.grantWriteData(workflowStatusCheckFn);
    alertsTopic.grantPublish(workflowStatusCheckFn);

    // Step Functions Standard Workflow Definition
    const evaluateReminderStep = new tasks.LambdaInvoke(this, 'EvaluateAndSendReminder', {
      lambdaFunction: reminderWorkflowFn,
      payloadResponseOnly: true,
    });
    evaluateReminderStep.addRetry({
      errors: ['Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException', 'States.TaskFailed'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2.0,
    });

    const waitResponseWindow = new sfn.Wait(this, 'WaitForPatientResponseWindow', {
      time: sfn.WaitTime.secondsPath('$.responseWindowSeconds'),
    });

    const verifyStatusAndEscalateStep = new tasks.LambdaInvoke(this, 'VerifyDoseStatusAndEscalate', {
      lambdaFunction: workflowStatusCheckFn,
      payloadResponseOnly: true,
    });
    verifyStatusAndEscalateStep.addRetry({
      errors: ['Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException', 'States.TaskFailed'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2.0,
    });

    const skippedInactiveState = new sfn.Succeed(this, 'MedicationInactiveSkipped');
    const alreadyTakenState = new sfn.Succeed(this, 'DoseAlreadyConfirmedBeforeReminder');
    const workflowCompletedState = new sfn.Succeed(this, 'WorkflowCompletedSuccessfully');
    const workflowFailedState = new sfn.Fail(this, 'WorkflowExecutionFailed', {
      cause: 'Unhandled error in DoseGuard reminder workflow',
      error: 'WORKFLOW_EXECUTION_ERROR',
    });

    evaluateReminderStep.addCatch(workflowFailedState, { resultPath: '$.errorInfo' });
    verifyStatusAndEscalateStep.addCatch(workflowFailedState, { resultPath: '$.errorInfo' });

    const definition = evaluateReminderStep.next(
      new sfn.Choice(this, 'CheckInitialReminderDecision')
        .when(sfn.Condition.stringEquals('$.action', 'SKIPPED_INACTIVE'), skippedInactiveState)
        .when(sfn.Condition.stringEquals('$.action', 'ALREADY_TAKEN'), alreadyTakenState)
        .otherwise(waitResponseWindow.next(verifyStatusAndEscalateStep).next(workflowCompletedState))
    );

    const stateMachineLogGroup = new logs.LogGroup(this, 'DoseGuardStateMachineLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const reminderStateMachine = new sfn.StateMachine(this, 'DoseGuardReminderStateMachine', {
      stateMachineName: 'DoseGuardAI-ReminderAndEscalationWorkflow',
      stateMachineType: sfn.StateMachineType.STANDARD,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      logs: {
        destination: stateMachineLogGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: false,
      },
      tracingEnabled: true,
    });

    // EventBridge Scheduler Execution Role (allows EventBridge Scheduler to start Step Functions workflow)
    const schedulerExecutionRole = new iam.Role(this, 'DoseGuardSchedulerExecutionRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Allows Amazon EventBridge Scheduler to trigger DoseGuard Step Functions workflow',
    });
    reminderStateMachine.grantStartExecution(schedulerExecutionRole);

    // API Handler Lambdas
    const userProfileFn = createDoseGuardLambda('UserProfileFunction', 'userProfileHandler');
    const medicationFn = createDoseGuardLambda('MedicationFunction', 'medicationHandler', {
      STATE_MACHINE_ARN: reminderStateMachine.stateMachineArn,
      SCHEDULER_ROLE_ARN: schedulerExecutionRole.roleArn,
    });
    const doseFn = createDoseGuardLambda('DoseFunction', 'doseHandler', {
      STATE_MACHINE_ARN: reminderStateMachine.stateMachineArn,
    });
    const caregiverInvitationFn = createDoseGuardLambda(
      'CaregiverInvitationFunction',
      'caregiverInvitationHandler'
    );
    const caregiverAuthFn = createDoseGuardLambda(
      'CaregiverAuthorizationFunction',
      'caregiverAuthorizationHandler'
    );
    const analyticsFn = createDoseGuardLambda('AnalyticsFunction', 'analyticsHandler');
    const notificationFn = createDoseGuardLambda('NotificationFunction', 'notificationHandler');
    const reportFn = createDoseGuardLambda('ReportFunction', 'reportHandler');

    // Least-Privilege IAM Grants per Handler
    usersTable.grantReadWriteData(userProfileFn);

    medicationsTable.grantReadWriteData(medicationFn);
    caregiversTable.grantReadData(medicationFn);
    auditTable.grantWriteData(medicationFn);
    medicationFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'scheduler:CreateSchedule',
          'scheduler:UpdateSchedule',
          'scheduler:DeleteSchedule',
          'scheduler:GetSchedule',
        ],
        resources: [
          `arn:aws:scheduler:${this.region}:${this.account}:schedule/default/dg-med-*`,
        ],
      })
    );
    medicationFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [schedulerExecutionRole.roleArn],
        conditions: {
          StringEquals: {
            'iam:PassedToService': 'scheduler.amazonaws.com',
          },
        },
      })
    );

    medicationsTable.grantReadData(doseFn);
    dosesTable.grantReadWriteData(doseFn);
    caregiversTable.grantReadData(doseFn);
    notificationsTable.grantReadWriteData(doseFn);
    auditTable.grantWriteData(doseFn);
    alertsTopic.grantPublish(doseFn);
    reminderStateMachine.grantStartExecution(doseFn);

    usersTable.grantReadData(caregiverInvitationFn);
    invitationsTable.grantReadWriteData(caregiverInvitationFn);
    caregiversTable.grantReadWriteData(caregiverInvitationFn);
    notificationsTable.grantReadWriteData(caregiverInvitationFn);
    auditTable.grantWriteData(caregiverInvitationFn);

    caregiversTable.grantReadWriteData(caregiverAuthFn);
    invitationsTable.grantReadWriteData(caregiverAuthFn);
    auditTable.grantWriteData(caregiverAuthFn);

    medicationsTable.grantReadData(analyticsFn);
    dosesTable.grantReadWriteData(analyticsFn);
    caregiversTable.grantReadData(analyticsFn);
    notificationsTable.grantReadData(analyticsFn);

    notificationsTable.grantReadWriteData(notificationFn);

    medicationsTable.grantReadData(reportFn);
    dosesTable.grantReadWriteData(reportFn);
    caregiversTable.grantReadData(reportFn);
    reportsTable.grantReadWriteData(reportFn);
    auditTable.grantWriteData(reportFn);
    reportsBucket.grantReadWrite(reportFn);

    // =========================================================================
    // 6. AMAZON API GATEWAY HTTP API — JWT Authorizer, CORS & Rate Limiting
    // =========================================================================
    const jwtAuthorizer = new authorizers.HttpUserPoolAuthorizer(
      'DoseGuardCognitoAuthorizer',
      userPool,
      {
        userPoolClients: [userPoolClient],
      }
    );

    const httpApi = new apigwv2.HttpApi(this, 'DoseGuardHttpApi', {
      apiName: 'DoseGuardAI-HttpApi',
      description: 'DoseGuard AI Serverless HTTP API',
      corsPreflight: {
        allowOrigins: [frontendOrigin, 'http://localhost:5173'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Authorization', 'Content-Type'],
        maxAge: cdk.Duration.days(1),
      },
    });

    // Restrict S3 Reports Bucket CORS to the deployed CloudFront origin and localhost dev
    const cfnReportsBucket = reportsBucket.node.defaultChild as s3.CfnBucket;
    cfnReportsBucket.corsConfiguration = {
      corsRules: [
        {
          allowedMethods: ['GET'],
          allowedOrigins: [frontendOrigin, 'http://localhost:5173'],
          allowedHeaders: ['*'],
          maxAge: 300,
        },
      ],
    };

    // Apply default stage throttling / rate limiting
    const cfnStage = httpApi.defaultStage?.node.defaultChild as apigwv2.CfnStage | undefined;
    if (cfnStage) {
      cfnStage.defaultRouteSettings = {
        throttlingBurstLimit: 50,
        throttlingRateLimit: 25,
      };
    }

    // Public Health Route
    httpApi.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('HealthIntegration', userProfileFn),
    });

    // Profile Routes
    httpApi.addRoutes({
      path: '/api/v1/me',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PATCH],
      integration: new integrations.HttpLambdaIntegration('UserProfileIntegration', userProfileFn),
      authorizer: jwtAuthorizer,
    });

    // Medication Routes
    const medIntegration = new integrations.HttpLambdaIntegration('MedicationIntegration', medicationFn);
    httpApi.addRoutes({
      path: '/api/v1/medications',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: medIntegration,
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/api/v1/medications/{id}',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PATCH, apigwv2.HttpMethod.DELETE],
      integration: medIntegration,
      authorizer: jwtAuthorizer,
    });

    // Dose Routes
    const doseIntegration = new integrations.HttpLambdaIntegration('DoseIntegration', doseFn);
    httpApi.addRoutes({
      path: '/api/v1/doses/today',
      methods: [apigwv2.HttpMethod.GET],
      integration: doseIntegration,
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/api/v1/doses/history',
      methods: [apigwv2.HttpMethod.GET],
      integration: doseIntegration,
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/api/v1/doses/{id}/confirm',
      methods: [apigwv2.HttpMethod.POST],
      integration: doseIntegration,
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/api/v1/doses/{id}/mark-missed',
      methods: [apigwv2.HttpMethod.POST],
      integration: doseIntegration,
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/api/v1/doses/trigger-workflow',
      methods: [apigwv2.HttpMethod.POST],
      integration: doseIntegration,
      authorizer: jwtAuthorizer,
    });

    // Caregiver Invitation & Authorization Routes
    const caregiverInviteIntegration = new integrations.HttpLambdaIntegration(
      'CaregiverInvitationIntegration',
      caregiverInvitationFn
    );
    httpApi.addRoutes({
      path: '/api/v1/caregivers/invitations',
      methods: [apigwv2.HttpMethod.POST],
      integration: caregiverInviteIntegration,
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/api/v1/caregivers/invitations/redeem',
      methods: [apigwv2.HttpMethod.POST],
      integration: caregiverInviteIntegration,
      authorizer: jwtAuthorizer,
    });

    const caregiverAuthIntegration = new integrations.HttpLambdaIntegration(
      'CaregiverAuthIntegration',
      caregiverAuthFn
    );
    httpApi.addRoutes({
      path: '/api/v1/caregivers',
      methods: [apigwv2.HttpMethod.GET],
      integration: caregiverAuthIntegration,
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/api/v1/caregivers/{id}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: caregiverAuthIntegration,
      authorizer: jwtAuthorizer,
    });

    // Analytics Routes
    const analyticsIntegration = new integrations.HttpLambdaIntegration(
      'AnalyticsIntegration',
      analyticsFn
    );
    httpApi.addRoutes({
      path: '/api/v1/analytics/summary',
      methods: [apigwv2.HttpMethod.GET],
      integration: analyticsIntegration,
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/api/v1/analytics/adherence',
      methods: [apigwv2.HttpMethod.GET],
      integration: analyticsIntegration,
      authorizer: jwtAuthorizer,
    });

    // Notification Routes
    const notificationIntegration = new integrations.HttpLambdaIntegration(
      'NotificationIntegration',
      notificationFn
    );
    httpApi.addRoutes({
      path: '/api/v1/notifications',
      methods: [apigwv2.HttpMethod.GET],
      integration: notificationIntegration,
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/api/v1/notifications/{id}/read',
      methods: [apigwv2.HttpMethod.PATCH],
      integration: notificationIntegration,
      authorizer: jwtAuthorizer,
    });

    // Report Routes
    const reportIntegration = new integrations.HttpLambdaIntegration('ReportIntegration', reportFn);
    httpApi.addRoutes({
      path: '/api/v1/reports',
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.GET],
      integration: reportIntegration,
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/api/v1/reports/{id}/download',
      methods: [apigwv2.HttpMethod.GET],
      integration: reportIntegration,
      authorizer: jwtAuthorizer,
    });

    // =========================================================================
    // 7. STACK OUTPUTS
    // =========================================================================
    new cdk.CfnOutput(this, 'AwsRegion', { value: this.region });
    new cdk.CfnOutput(this, 'ApiGatewayUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'CognitoUserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'CognitoUserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'FrontendBucketName', { value: frontendBucket.bucketName });
    new cdk.CfnOutput(this, 'ReportsBucketName', { value: reportsBucket.bucketName });
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'CloudFrontPublicUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'StepFunctionsStateMachineArn', { value: reminderStateMachine.stateMachineArn });
    new cdk.CfnOutput(this, 'SnsAlertsTopicArn', { value: alertsTopic.topicArn });
  }
}

