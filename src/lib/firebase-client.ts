import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const config = {
  apiKey: "AIzaSyAz2gNxH5ItL-0Zp0OWoTqCwRrwsJq7-sw",
  authDomain: "choltihomedecor-a2db3.firebaseapp.com",
  projectId: "choltihomedecor-a2db3",
  storageBucket: "choltihomedecor-a2db3.firebasestorage.app",
  messagingSenderId: "656524477508",
  appId: "1:656524477508:web:01cac1dde2733ddb61a811",
};

const isBrowser = typeof window !== "undefined";

const app = isBrowser
  ? getApps().length
    ? getApps()[0]
    : initializeApp(config)
  : undefined;

export const clientAuth = (isBrowser ? getAuth(app!) : undefined) as ReturnType<typeof getAuth>;
export const clientDb = (isBrowser ? getFirestore(app!) : undefined) as ReturnType<typeof getFirestore>;
export const clientStorage = (isBrowser ? getStorage(app!) : undefined) as ReturnType<typeof getStorage>;
