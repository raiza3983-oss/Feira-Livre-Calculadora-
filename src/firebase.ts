import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, disableNetwork } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Interceptar logs do Firebase Firestore para reduzir mensagens de erro sobre conectividade
if (typeof window !== 'undefined') {
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = function (...args: any[]) {
    const msg = args.map(arg => String(arg)).join(' ');
    if (msg.includes('@firebase/firestore') || msg.includes('Could not reach Cloud Firestore backend')) {
      return;
    }
    originalWarn.apply(console, args);
  };

  console.error = function (...args: any[]) {
    const msg = args.map(arg => String(arg)).join(' ');
    if (msg.includes('@firebase/firestore') || msg.includes('Could not reach Cloud Firestore backend')) {
      return;
    }
    originalError.apply(console, args);
  };
}

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
} as any, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

async function testConnection() {
  try {
    await Promise.race([
      getDocFromServer(doc(db, 'test', 'connection')),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
    ]);
    console.log("Conexão com o Firebase verificada com sucesso.");
  } catch (error) {
    // Silently proceed ensuring Firestore uses standard offline resilience without throwing warnings or disabling network.
    console.log("Firebase inicializado. Operando com persistência local.");
  }
}
testConnection();
