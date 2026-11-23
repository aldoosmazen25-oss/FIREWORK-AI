import { initializeApp, getApps } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/meetings.space.created',
  'https://www.googleapis.com/auth/meetings.space.readonly',
] as const;

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const googleAuthProvider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  googleAuthProvider.addScope(scope);
}
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

// Strict in-memory token cache (never written to localStorage/sessionStorage)
let cachedWorkspaceAccessToken: string | null = null;

export function getWorkspaceAccessToken(): string | null {
  return cachedWorkspaceAccessToken;
}

export function clearWorkspaceAccessToken() {
  cachedWorkspaceAccessToken = null;
}

export function subscribeAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedWorkspaceAccessToken = null;
    }
    callback(user);
  });
}

export async function signInWithGoogleWorkspace(): Promise<{
  user: User;
  idToken: string;
  workspaceToken: string | null;
}> {
  const result = await signInWithPopup(auth, googleAuthProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  cachedWorkspaceAccessToken = credential?.accessToken ?? null;
  const idToken = await result.user.getIdToken();
  return {
    user: result.user,
    idToken,
    workspaceToken: cachedWorkspaceAccessToken,
  };
}

export async function signInWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  const idToken = await result.user.getIdToken();
  return { user: result.user, idToken };
}

export async function registerWithEmail(fullName: string, email: string, password: string) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (fullName.trim()) {
    await updateProfile(result.user, { displayName: fullName.trim() });
  }
  try {
    await sendEmailVerification(result.user);
  } catch {
    // Verification email optional if not configured
  }
  const idToken = await result.user.getIdToken();
  return { user: result.user, idToken };
}

export async function requestPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export async function signOutAccount() {
  cachedWorkspaceAccessToken = null;
  await signOut(auth);
}

export async function getFreshIdToken(): Promise<string | null> {
  const current = auth.currentUser;
  if (!current) return null;
  return await current.getIdToken();
}
