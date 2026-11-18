import webpush from 'web-push';

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Validates and retrieves the authoritative server-side VAPID credentials.
 * Throws a descriptive error if environment variables are missing or misconfigured.
 */
export function getVapidConfig(): VapidConfig {
  const publicKey =
    process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@abanoub.app';

  if (!publicKey) {
    throw new Error(
      'VAPID Public Key is not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY in your environment.'
    );
  }

  if (!privateKey) {
    throw new Error(
      'VAPID Private Key is not configured on the server. Set VAPID_PRIVATE_KEY in your environment.'
    );
  }

  return { publicKey, privateKey, subject };
}

let isVapidConfigured = false;

/**
 * Initializes web-push with permanent server-side VAPID details once.
 */
export function initWebPush(): void {
  if (isVapidConfigured) return;

  const { publicKey, privateKey, subject } = getVapidConfig();
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    isVapidConfigured = true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to initialize web-push VAPID credentials: ${msg}`);
  }
}

/**
 * Safe status checker for diagnostic dashboards (never leaks private key).
 */
export function checkVapidStatus(): {
  isConfigured: boolean;
  publicKeyPresent: boolean;
  privateKeyPresent: boolean;
  subject: string;
  publicKeyPreview?: string;
  error?: string;
} {
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || 'mailto:admin@abanoub.app';

  if (!pub || !priv) {
    return {
      isConfigured: false,
      publicKeyPresent: Boolean(pub),
      privateKeyPresent: Boolean(priv),
      subject: subj,
      error: !pub ? 'Public key missing' : 'Private key missing on server',
    };
  }

  return {
    isConfigured: true,
    publicKeyPresent: true,
    privateKeyPresent: true,
    subject: subj,
    publicKeyPreview: `${pub.slice(0, 10)}...${pub.slice(-6)}`,
  };
}
