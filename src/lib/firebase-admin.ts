import {
  fsAddDoc,
  fsGetDoc,
  fsQuery,
  verifyIdToken as verifyFirebaseIdToken,
  type FsDocData,
  type FsDocSnapshot,
} from "./firestore-rest";

export async function adminDb() {
  return {
    doc(path: string) {
      return {
        get: async (): Promise<FsDocSnapshot> => {
          const snap = await fsGetDoc(path);
          return snap ?? { exists: false, data: () => ({}) };
        },
      };
    },
    collection(name: string) {
      return {
        where: (field: string, op: string, value: unknown) => ({
          get: async (): Promise<{ docs: Array<{ id: string; data: () => FsDocData }> }> => ({
            docs: await fsQuery(name, field, op, value),
          }),
        }),
        add: async (fields: FsDocData) => ({ id: await fsAddDoc(name, fields) }),
      };
    },
  };
}

export async function adminAuth() {
  return {
    verifyIdToken: async (token: string) => verifyFirebaseIdToken(token),
  };
}
