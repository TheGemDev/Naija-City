// Firebase is used for sign-in only. Player data lives on Cloudflare (see worker/).

import { initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  linkWithCredential,
  linkWithPopup,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';

// Web config comes from .env (see .env.example). It is public by design once built into the page; access is
// controlled by Firebase Auth and the Worker.
const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};
if (!config.apiKey || !config.projectId) console.error('Firebase is not configured: copy .env.example to .env and fill in VITE_FIREBASE_*.');
const app = initializeApp(config);

// Dev: sign-in is per tab, so two tabs can be two different players. Shared persistence would
// switch every tab to whoever signed in last, and the room would then kick the duplicate.
// No popupRedirectResolver here: given one, Firebase on phones and Safari loads its sign-in iframe and Google's gapi
// script (two more sites, ~130 KB) before it says who is signed in, holding up every start. Only Google sign-in needs
// it, so those calls pass it themselves.
function makeAuth() {
  try {
    return initializeAuth(app, {
      persistence: import.meta.env.DEV ? browserSessionPersistence : [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch {
    return getAuth(app); // hot reload: already initialised
  }
}
export const auth = makeAuth();

/** Set while a Google sign-in has gone off to Google's page and back, so the result is collected on return. */
const REDIRECT_KEY = 'kl-google-redirect';
try {
  if (sessionStorage.getItem(REDIRECT_KEY)) {
    sessionStorage.removeItem(REDIRECT_KEY);
    getRedirectResult(auth, browserPopupRedirectResolver).catch((error) => console.error('Google sign-in did not finish', error));
  }
} catch { /* storage blocked: there was no redirect to finish */ }

/** Latest ID token, kept fresh so pagehide saves can send it synchronously. */
export let cachedToken: string | null = null;

export function watchUser(cb: (u: User | null) => void) {
  return onIdTokenChanged(auth, async (u) => {
    try {
      cachedToken = u ? await u.getIdToken() : null;
    } catch {
      // Offline with an expired token: carry on signed in. The first API call fails, and the session shows offline and retries.
      cachedToken = null;
    }
    cb(u);
  });
}

export async function idToken(): Promise<string | null> {
  const u = auth.currentUser;
  if (!u) return null;
  cachedToken = await u.getIdToken();
  return cachedToken;
}

export async function signInGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider, browserPopupRedirectResolver);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      try { sessionStorage.setItem(REDIRECT_KEY, '1'); } catch { /* the result is then lost; the player signs in again */ }
      await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
    } else throw e;
  }
}

export async function signInEmail(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signUpEmail(email: string, password: string, name: string) {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(user, { displayName: name });
}

/** One tap in: a real account with no email or password, which the player can attach to Google or an email later (linkGoogle, linkEmail). */
export async function signInGuest() {
  await signInAnonymously(auth);
}

/** Attach Google to the guest account in place: the same uid, so the house, money and progress carry over. */
export async function linkGoogle() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  await linkWithPopup(user, new GoogleAuthProvider(), browserPopupRedirectResolver);
  await user.getIdToken(true);
}

/** Attach an email and password to the guest account in place. */
export async function linkEmail(email: string, password: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  await linkWithCredential(user, EmailAuthProvider.credential(email, password));
  await user.getIdToken(true);
}

export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);
export const signOut = () => fbSignOut(auth);

/** Friendly text for Firebase auth error codes. */
export function authMessage(e: unknown): string {
  const code = (e as { code?: string }).code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account with that email. Create one?',
    'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
    'auth/weak-password': 'Password needs at least 6 characters.',
    'auth/popup-closed-by-user': 'Google sign-in was closed.',
    'auth/cancelled-popup-request': 'Google sign-in was closed.',
    'auth/network-request-failed': 'No network. Check your data and try again.',
    'auth/too-many-requests': 'Too many tries. Wait a bit and try again.',
    'auth/operation-not-allowed': 'This sign-in method isn’t switched on yet.',
    'auth/credential-already-in-use': 'That account already exists. Log out, then log in with it. This guest progress would be left behind.',
    'auth/provider-already-linked': 'This account is already saved.',
    'auth/unauthorized-domain': 'This site isn’t allowed to sign in yet.',
  };
  return map[code] ?? 'Something went wrong. Try again.';
}
