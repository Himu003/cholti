type Firestore = import("firebase-admin/firestore").Firestore;
type Auth = import("firebase-admin/auth").Auth;

async function init() {
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  if (!getApps().length) {
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (inline) initializeApp({ credential: cert(JSON.parse(inline)) });
    else if (keyFile) initializeApp({ credential: cert(keyFile) });
    else throw new Error("Firebase credentials are not set");
  }
}

let cached: Firestore | null = null;

export async function adminDb(): Promise<Firestore> {
  if (!cached) {
    await init();
    const { getFirestore } = await import("firebase-admin/firestore");
    cached = getFirestore();
  }
  return cached;
}

export async function adminAuth(): Promise<Auth> {
  await init();
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth();
}
