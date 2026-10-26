export function initializeApp(): never {
  throw new Error("firebase-admin is not supported on Cloudflare Workers");
}

export function getApps(): never[] {
  return [];
}

export function cert(): never {
  throw new Error("firebase-admin is not supported on Cloudflare Workers");
}

export function getFirestore(): never {
  throw new Error("firebase-admin is not supported on Cloudflare Workers");
}

export function getAuth(): never {
  throw new Error("firebase-admin is not supported on Cloudflare Workers");
}
