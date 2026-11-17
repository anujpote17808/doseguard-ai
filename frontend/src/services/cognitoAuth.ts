import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

export interface AwsRuntimeConfig {
  region: string;
  apiBaseUrl: string;
  userPoolId: string;
  userPoolClientId: string;
}

const RUNTIME_CONFIG_STORAGE_KEY = 'doseguard_aws_runtime_config';

export function getRuntimeConfig(): AwsRuntimeConfig {
  const savedRaw = localStorage.getItem(RUNTIME_CONFIG_STORAGE_KEY);
  if (savedRaw) {
    try {
      const parsed = JSON.parse(savedRaw) as Partial<AwsRuntimeConfig>;
      if (parsed.apiBaseUrl && parsed.userPoolId && parsed.userPoolClientId) {
        return {
          region: parsed.region || import.meta.env.VITE_AWS_REGION || 'ap-south-1',
          apiBaseUrl: parsed.apiBaseUrl.replace(/\/$/, ''),
          userPoolId: parsed.userPoolId,
          userPoolClientId: parsed.userPoolClientId,
        };
      }
    } catch {
      // ignore invalid JSON
    }
  }

  return {
    region: import.meta.env.VITE_AWS_REGION || 'ap-south-1',
    apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
    userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
  };
}

export function setRuntimeConfig(config: AwsRuntimeConfig): void {
  localStorage.setItem(RUNTIME_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function isCognitoConfigured(): boolean {
  const cfg = getRuntimeConfig();
  return Boolean(
    cfg.userPoolId &&
      cfg.userPoolClientId &&
      !cfg.userPoolId.includes('XXXXXXXXX') &&
      cfg.apiBaseUrl
  );
}

function getUserPool(): CognitoUserPool {
  const cfg = getRuntimeConfig();
  if (!cfg.userPoolId || !cfg.userPoolClientId || cfg.userPoolId.includes('XXXXXXXXX')) {
    throw new Error(
      'Amazon Cognito User Pool is not configured yet. Deploy the CDK stack and configure VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID.'
    );
  }
  return new CognitoUserPool({
    UserPoolId: cfg.userPoolId,
    ClientId: cfg.userPoolClientId,
  });
}

export async function cognitoSignUp(
  email: string,
  password: string,
  fullName: string
): Promise<{ userConfirmed: boolean; userSub: string }> {
  const pool = getUserPool();
  const attributes = [
    new CognitoUserAttribute({ Name: 'email', Value: email.trim() }),
    new CognitoUserAttribute({ Name: 'name', Value: fullName.trim() }),
  ];

  return new Promise((resolve, reject) => {
    pool.signUp(email.trim(), password, attributes, [], (err, result) => {
      if (err || !result) {
        reject(err || new Error('Sign up failed'));
        return;
      }
      resolve({
        userConfirmed: result.userConfirmed,
        userSub: result.userSub,
      });
    });
  });
}

export async function cognitoConfirmSignUp(email: string, code: string): Promise<void> {
  const pool = getUserPool();
  const cognitoUser = new CognitoUser({
    Username: email.trim(),
    Pool: pool,
  });

  return new Promise((resolve, reject) => {
    cognitoUser.confirmRegistration(code.trim(), true, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export async function cognitoSignIn(
  email: string,
  password: string
): Promise<{ idToken: string; email: string; sub: string }> {
  const pool = getUserPool();
  const cognitoUser = new CognitoUser({
    Username: email.trim(),
    Pool: pool,
  });

  const authDetails = new AuthenticationDetails({
    Username: email.trim(),
    Password: password,
  });

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session: CognitoUserSession) => {
        const idToken = session.getIdToken().getJwtToken();
        const payload = session.getIdToken().decodePayload();
        resolve({
          idToken,
          email: payload.email || email.trim(),
          sub: payload.sub,
        });
      },
      onFailure: (err) => {
        reject(err);
      },
    });
  });
}

export async function cognitoForgotPassword(email: string): Promise<void> {
  const pool = getUserPool();
  const cognitoUser = new CognitoUser({
    Username: email.trim(),
    Pool: pool,
  });

  return new Promise((resolve, reject) => {
    cognitoUser.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
      inputVerificationCode: () => resolve(),
    });
  });
}

export async function cognitoConfirmPasswordReset(
  email: string,
  verificationCode: string,
  newPassword: string
): Promise<void> {
  const pool = getUserPool();
  const cognitoUser = new CognitoUser({
    Username: email.trim(),
    Pool: pool,
  });

  return new Promise((resolve, reject) => {
    cognitoUser.confirmPassword(verificationCode.trim(), newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

export async function cognitoGetCurrentSessionToken(): Promise<string | null> {
  if (!isCognitoConfigured()) {
    return null;
  }
  try {
    const pool = getUserPool();
    const currentUser = pool.getCurrentUser();
    if (!currentUser) return null;

    return await new Promise<string | null>((resolve) => {
      currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session || !session.isValid()) {
          resolve(null);
          return;
        }
        resolve(session.getIdToken().getJwtToken());
      });
    });
  } catch {
    return null;
  }
}

export function cognitoSignOut(): void {
  try {
    if (!isCognitoConfigured()) return;
    const pool = getUserPool();
    const currentUser = pool.getCurrentUser();
    if (currentUser) {
      currentUser.signOut();
    }
  } catch {
    // ignore
  }
}

