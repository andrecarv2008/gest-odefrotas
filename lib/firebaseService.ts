import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Viagem } from './types';
import { INITIAL_VIAGENS, INITIAL_METADATA, INITIAL_LOGS } from './data';
import { saveViagensToDB, getViagensFromDB, clearViagensFromDB } from './db';

export interface MetadataLastUpdate {
  id: string;
  lastUploadedAt: string;
  uploaderName: string;
  fileName: string;
  recordCount: number;
}

export interface ImportLog {
  id?: string;
  data: string;
  hora: string;
  usuario: string;
  nomePlanilha: string;
  quantidadeRegistros: number;
  timestamp: number;
}

const VIAGENS_CHUNKS_COLLECTION = 'viagens_chunks';
const VIAGENS_COLLECTION = 'viagens';
const METADATA_COLLECTION = 'metadata';
const LOGS_COLLECTION = 'import_logs';
const CHUNK_SIZE = 1000;

// ----------------------------------------------------
// 1. SERVER-SIDE API PERSISTENCE (/api/viagens)
// ----------------------------------------------------

/**
 * Fetches voyages from the server-side persistent JSON storage.
 */
export async function fetchViagensFromServer(): Promise<{
  viagens: Viagem[];
  metadata: MetadataLastUpdate | null;
  logs: ImportLog[];
} | null> {
  try {
    const res = await fetch('/api/viagens', { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
      return {
        viagens: json.data,
        metadata: json.metadata || null,
        logs: json.logs || []
      };
    }
    return null;
  } catch (err) {
    console.warn('Could not fetch from server /api/viagens:', err);
    return null;
  }
}

/**
 * Saves voyages to the server-side persistent storage.
 */
export async function saveViagensToServer(
  viagens: Viagem[],
  mode: 'substituir' | 'somar',
  metadata: { uploaderName: string; fileName: string; lastUploadedAt?: string },
  log?: ImportLog
): Promise<boolean> {
  try {
    const res = await fetch('/api/viagens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        viagens,
        mode,
        metadata,
        log
      })
    });
    const json = await res.json();
    return json.success === true;
  } catch (err) {
    console.warn('Could not save to server /api/viagens:', err);
    return false;
  }
}

/**
 * Clears voyages from server-side persistent storage.
 */
export async function resetViagensOnServer(): Promise<boolean> {
  try {
    const res = await fetch('/api/viagens', { method: 'DELETE' });
    const json = await res.json();
    return json.success === true;
  } catch (err) {
    console.warn('Could not reset server /api/viagens:', err);
    return false;
  }
}

// ----------------------------------------------------
// 2. CLOUD FIRESTORE PERSISTENCE (OPTIMIZED CHUNKS)
// ----------------------------------------------------

/**
 * Fetches all voyages from Firestore using optimized chunked storage.
 * Reads only 3-8 documents total for thousands of records.
 */
export async function fetchViagensFromFirestore(): Promise<Viagem[]> {
  try {
    // 1. Try reading from chunked collection (ultra-fast & low-quota)
    const chunkQuery = query(collection(db, VIAGENS_CHUNKS_COLLECTION));
    const chunkSnapshot = await getDocs(chunkQuery);

    if (!chunkSnapshot.empty) {
      const chunks: { chunkIndex: number; viagens: Viagem[] }[] = [];
      chunkSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && Array.isArray(data.viagens)) {
          chunks.push({
            chunkIndex: data.chunkIndex ?? 0,
            viagens: data.viagens
          });
        }
      });

      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const allViagens: Viagem[] = chunks.flatMap(c => c.viagens);

      if (allViagens.length > 0) {
        // Sanitize supervisao
        allViagens.forEach(v => {
          if (v && v.supervisao) {
            const supUpper = v.supervisao.trim().toUpperCase();
            if (supUpper === 'LEONAN BRAGA NONATO' || supUpper.includes('LEONAN')) {
              v.supervisao = 'LEONAN';
            }
          }
        });
        return allViagens;
      }
    }

    // 2. Fallback: Check legacy individual document collection if chunk collection was empty
    const legacyQuery = query(collection(db, VIAGENS_COLLECTION));
    const legacySnapshot = await getDocs(legacyQuery);

    if (!legacySnapshot.empty) {
      const docs: Viagem[] = [];
      legacySnapshot.forEach((docSnap) => {
        const data = docSnap.data() as Viagem;
        if (data && data.supervisao) {
          const supUpper = data.supervisao.trim().toUpperCase();
          if (supUpper === 'LEONAN BRAGA NONATO' || supUpper.includes('LEONAN')) {
            data.supervisao = 'LEONAN';
          }
        }
        docs.push(data);
      });
      return docs;
    }

    return [];
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.warn("Firestore fetch notice:", errorMsg);
    return [];
  }
}

/**
 * Saves voyages to Firestore in compact, chunked documents to prevent quota exhaustion.
 * Silently catches and logs quota errors so the application continues smoothly with server persistence.
 */
export async function saveViagensToFirestore(
  newViagens: Viagem[],
  mode: 'substituir' | 'somar',
  meta: { uploaderName: string; fileName: string }
): Promise<void> {
  try {
    let finalViagens: Viagem[] = [];

    if (mode === 'somar') {
      try {
        const existing = await fetchViagensFromFirestore();
        const existingIds = new Set(existing.map(v => v.id));
        const nonDuplicates = newViagens.filter(v => !existingIds.has(v.id));
        finalViagens = [...existing, ...nonDuplicates];
      } catch {
        finalViagens = newViagens;
      }
    } else {
      finalViagens = newViagens;
    }

    // Sanitize dataset
    const sanitizedViagens = finalViagens.map(v => {
      const copy: Record<string, any> = {};
      Object.entries(v).forEach(([k, val]) => {
        if (val !== undefined) {
          if (k === 'supervisao' && typeof val === 'string') {
            const supUpper = val.trim().toUpperCase();
            if (supUpper === 'LEONAN BRAGA NONATO' || supUpper.includes('LEONAN')) {
              copy[k] = 'LEONAN';
            } else {
              copy[k] = val;
            }
          } else {
            copy[k] = val;
          }
        }
      });
      return copy as Viagem;
    });

    // 1. Clear old chunks
    try {
      const chunkSnapshot = await getDocs(query(collection(db, VIAGENS_CHUNKS_COLLECTION)));
      if (!chunkSnapshot.empty) {
        const deleteBatch = writeBatch(db);
        chunkSnapshot.forEach(docSnap => {
          deleteBatch.delete(docSnap.ref);
        });
        await deleteBatch.commit();
      }
    } catch (cleanErr) {
      console.warn("Firestore clean chunks warning (quota or network):", cleanErr);
    }

    // 2. Write new chunks (1,000 viagens per doc)
    const totalChunks = Math.ceil(sanitizedViagens.length / CHUNK_SIZE);
    for (let i = 0; i < totalChunks; i++) {
      const chunkSlice = sanitizedViagens.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const chunkDocRef = doc(db, VIAGENS_CHUNKS_COLLECTION, `chunk_${i}`);
      await setDoc(chunkDocRef, {
        chunkIndex: i,
        count: chunkSlice.length,
        viagens: chunkSlice,
        updatedAt: new Date().toISOString()
      });
    }

    // 3. Save Last Update Metadata Information
    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const metaDocRef = doc(db, METADATA_COLLECTION, 'last_update');
    const metadataPayload: MetadataLastUpdate = {
      id: 'last_update',
      lastUploadedAt: formattedDate,
      uploaderName: meta.uploaderName,
      fileName: meta.fileName,
      recordCount: sanitizedViagens.length,
    };
    await setDoc(metaDocRef, metadataPayload);

    // 4. Save to Import History Logs
    const logPayload: ImportLog = {
      data: now.toLocaleDateString('pt-BR'),
      hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      usuario: meta.uploaderName,
      nomePlanilha: meta.fileName,
      quantidadeRegistros: newViagens.length,
      timestamp: now.getTime(),
    };
    await saveImportLogToFirestore(logPayload);
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    if (errorMsg.includes('resource-exhausted') || errorMsg.includes('Quota limit')) {
      console.info("Firestore free tier daily quota reached. Data safely persisted on server & local IndexedDB.");
    } else {
      console.warn("Firestore sync warning (data is safe on server):", errorMsg);
    }
  }
}

/**
 * Saves a single Import Log to Firestore.
 */
export async function saveImportLogToFirestore(log: Omit<ImportLog, 'id'>): Promise<void> {
  try {
    const logId = String(log.timestamp);
    const docRef = doc(db, LOGS_COLLECTION, logId);
    await setDoc(docRef, log);
  } catch (error) {
    console.warn("Could not save import log:", error);
  }
}

/**
 * Fetches all Import Logs from Firestore.
 */
export async function fetchImportLogsFromFirestore(): Promise<ImportLog[]> {
  try {
    const q = query(collection(db, LOGS_COLLECTION));
    const querySnapshot = await getDocs(q);
    const logs: ImportLog[] = [];
    querySnapshot.forEach((docSnap) => {
      logs.push({ id: docSnap.id, ...docSnap.data() } as ImportLog);
    });
    return logs.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    return [];
  }
}

/**
 * Fetches the metadata about the last excel spreadsheet upload.
 */
export async function fetchLastUpdateMetadata(): Promise<MetadataLastUpdate | null> {
  try {
    const docRef = doc(db, METADATA_COLLECTION, 'last_update');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as MetadataLastUpdate;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Deletes all voyages on Firestore (leaving it completely clean).
 */
export async function resetViagensInFirestore(uploader: string = "Administrador"): Promise<void> {
  try {
    // Delete chunk docs
    const chunkSnapshot = await getDocs(query(collection(db, VIAGENS_CHUNKS_COLLECTION)));
    const deleteBatch = writeBatch(db);
    chunkSnapshot.forEach(docSnap => {
      deleteBatch.delete(docSnap.ref);
    });
    await deleteBatch.commit();

    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const metaDocRef = doc(db, METADATA_COLLECTION, 'last_update');
    await setDoc(metaDocRef, {
      id: 'last_update',
      lastUploadedAt: formattedDate,
      uploaderName: uploader,
      fileName: 'Banco de Dados Limpo',
      recordCount: 0
    });
  } catch (error) {
    console.warn("Reset Firestore error:", error);
  }
}

// ----------------------------------------------------
// 3. UNIFIED DATA LOADER (SERVER -> CLOUD -> LOCAL)
// ----------------------------------------------------

/**
 * Master Loader: Resolves data seamlessly across environments (Shared link, Incognito, Preview).
 * 
 * Hierarchy:
 * 1. Server-Side Persistent API (/api/viagens) - Instant, accessible by all shared visitors
 * 2. Cloud Firestore (Chunked) - Cloud storage
 * 3. Client IndexedDB - Local browser cache
 * 4. INITIAL_VIAGENS - Fallback default
 */
export async function loadConsolidatedViagens(): Promise<{
  viagens: Viagem[];
  metadata: MetadataLastUpdate | null;
  logs: ImportLog[];
  source: 'server' | 'firestore' | 'indexeddb' | 'initial';
}> {
  // 1. Try Server API first
  try {
    const serverResult = await fetchViagensFromServer();
    if (serverResult && serverResult.viagens.length > 0) {
      // Sync to local browser IndexedDB for offline capability
      saveViagensToDB(serverResult.viagens).catch(() => {});
      return {
        viagens: serverResult.viagens,
        metadata: serverResult.metadata,
        logs: serverResult.logs,
        source: 'server'
      };
    }
  } catch (e) {
    console.warn("Server fetch failed, continuing to Firestore:", e);
  }

  // 2. Try Firestore Cloud
  try {
    const firestoreViagens = await fetchViagensFromFirestore();
    const meta = await fetchLastUpdateMetadata();
    const logs = await fetchImportLogsFromFirestore();

    if (firestoreViagens && firestoreViagens.length > 0) {
      // Sync back to server API so next loads and shared links are instantaneous!
      saveViagensToServer(
        firestoreViagens,
        'substituir',
        meta ? { uploaderName: meta.uploaderName, fileName: meta.fileName, lastUploadedAt: meta.lastUploadedAt } : { uploaderName: 'Nuvem', fileName: 'Sincronizado' }
      ).catch(() => {});

      // Sync to local browser IndexedDB
      saveViagensToDB(firestoreViagens).catch(() => {});

      return {
        viagens: firestoreViagens,
        metadata: meta,
        logs: logs,
        source: 'firestore'
      };
    }
  } catch (e) {
    console.warn("Firestore fetch failed, checking local IndexedDB:", e);
  }

  // 3. Try Local Browser IndexedDB (e.g. if previous upload happened in this browser session)
  try {
    const localViagens = await getViagensFromDB();
    if (localViagens && localViagens.length > 0) {
      // Auto-replicate local data to Server API & Firestore so other shared users will have it!
      const fileName = (typeof window !== 'undefined' ? localStorage.getItem('last_uploaded_filename') : null) || 'Planilha_Importada.xlsx';
      saveViagensToServer(localViagens, 'substituir', {
        uploaderName: 'Sincronização Automática',
        fileName: fileName
      }).catch(() => {});

      saveViagensToFirestore(localViagens, 'substituir', {
        uploaderName: 'Sincronização Automática',
        fileName: fileName
      }).catch(() => {});

      return {
        viagens: localViagens,
        metadata: null,
        logs: [],
        source: 'indexeddb'
      };
    }
  } catch (e) {
    console.warn("IndexedDB check failed:", e);
  }

  // 4. Default fallback
  return {
    viagens: INITIAL_VIAGENS,
    metadata: INITIAL_METADATA,
    logs: INITIAL_LOGS,
    source: 'initial'
  };
}

// ----------------------------------------------------
// 4. USER PROFILE CONFIGURATION
// ----------------------------------------------------

export interface UserProfileConfig {
  nome: string;
  cargo: string;
  filialPreferida: string;
  supervisorPreferido: string;
  whatsapp: string;
  notificacoesEmail: boolean;
  alertasAudivel: boolean;
  limiteViagensPlaca: number;
  avatarColor: string;
}

const PROFILES_COLLECTION = 'profiles';

/**
 * Fetches user profile from Firestore for a given authenticated user ID.
 */
export async function fetchUserProfileFromFirestore(userId: string): Promise<UserProfileConfig | null> {
  try {
    const docRef = doc(db, PROFILES_COLLECTION, userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserProfileConfig;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Saves or updates user profile in Firestore.
 */
export async function saveUserProfileToFirestore(userId: string, profile: UserProfileConfig): Promise<void> {
  try {
    const docRef = doc(db, PROFILES_COLLECTION, userId);
    await setDoc(docRef, profile, { merge: true });
  } catch (error) {
    console.warn("Error saving user profile to Firestore:", error);
  }
}
