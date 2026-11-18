// Firestore desativado: leituras vazias, escritas ignoradas (dados ficam no armazenamento local do navegador).
const emptySnap = { empty: true, docs: [] as any[], forEach: (_f: any) => {}, exists: () => false, data: () => undefined };
export const getFirestore = (..._a: any[]) => ({});
export const doc = (..._a: any[]) => ({});
export const collection = (..._a: any[]) => ({});
export const getDoc = async (..._a: any[]) => emptySnap;
export const getDocs = async (..._a: any[]) => emptySnap;
export const setDoc = async (..._a: any[]) => {};
export const deleteDoc = async (..._a: any[]) => {};
export const writeBatch = (..._a: any[]) => ({ set() {}, delete() {}, commit: async () => {} });
export const query = (...a: any[]) => a[0];
export const orderBy = (..._a: any[]) => ({});
export const limit = (..._a: any[]) => ({});
export const where = (..._a: any[]) => ({});
export const serverTimestamp = () => Date.now();
export const addDoc = async (..._a: any[]) => ({});
export const onSnapshot = (..._a: any[]) => () => {};
export const Timestamp = { now: () => Date.now() };
