import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
} from "firebase/auth";
import { auth } from "../firebase-config.js";
import { getAllowedEmail } from "./access-config.js";

const googleProvider = new GoogleAuthProvider();
const NOT_ALLOWED_KEY = "k-rez-not-allowed";

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function takeNotAllowedError() {
  const hadError = sessionStorage.getItem(NOT_ALLOWED_KEY);
  sessionStorage.removeItem(NOT_ALLOWED_KEY);
  return Boolean(hadError);
}

export async function enforceAllowedUser(user) {
  if (!user) return null;
  const allowedEmail = await getAllowedEmail();
  if (user.email === allowedEmail) return user;
  sessionStorage.setItem(NOT_ALLOWED_KEY, "1");
  await signOut(auth);
  return null;
}

export function signOutUser() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function onTokenChange(callback) {
  return onIdTokenChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export async function getIdToken(forceRefresh = false) {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken(forceRefresh);
}
