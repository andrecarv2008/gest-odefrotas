export type User = { email?: string | null; emailVerified?: boolean; uid: string; displayName?: string | null };
export const getAuth = (_a?: any) => ({});
export const onAuthStateChanged = (_auth: any, cb: (u: User | null) => void) => { setTimeout(() => cb(null), 0); return () => {}; };
export class GoogleAuthProvider {}
export const signInWithPopup = async (..._a: any[]): Promise<any> => { throw new Error('Login Google indisponível nesta versão. Use a troca de perfil Administrador/Leitor.'); };
export const signOut = async (..._a: any[]) => {};
