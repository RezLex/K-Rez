import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase-config.js";
import { SONGS_COLLECTION } from "./firestore-paths.js";
import { getCurrentUser } from "../auth/auth-service.js";

function emptyVersion() {
  return { tipo: "archivo", url: "", offsetSeconds: 0 };
}

export async function listSongsForUser(uid) {
  const q = query(
    collection(db, SONGS_COLLECTION),
    where("ownerUid", "==", uid),
    orderBy("nombre")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getSong(songId) {
  const ref = doc(db, SONGS_COLLECTION, songId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

export async function createSong({ nombre, artista, key = "", bpm = null }) {
  const user = getCurrentUser();
  const data = {
    nombre,
    artista,
    key,
    bpm,
    ownerUid: user.uid,
    letra: [],
    secciones: [],
    versiones: {
      original: emptyVersion(),
      karaoke: emptyVersion(),
    },
  };
  const ref = await addDoc(collection(db, SONGS_COLLECTION), data);
  return { id: ref.id, ...data };
}

export function updateSongMeta(songId, patch) {
  const ref = doc(db, SONGS_COLLECTION, songId);
  return updateDoc(ref, patch);
}

export function updateVersion(songId, versionKey, patch) {
  const ref = doc(db, SONGS_COLLECTION, songId);
  const fieldPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    fieldPatch[`versiones.${versionKey}.${key}`] = value;
  }
  return updateDoc(ref, fieldPatch);
}

export function updateVersionOffset(songId, versionKey, offsetSeconds) {
  return updateVersion(songId, versionKey, { offsetSeconds });
}

export function updateLyrics(songId, letraArray) {
  const ref = doc(db, SONGS_COLLECTION, songId);
  return updateDoc(ref, { letra: letraArray });
}

export function updateSections(songId, seccionesArray) {
  const ref = doc(db, SONGS_COLLECTION, songId);
  return updateDoc(ref, { secciones: seccionesArray });
}

export function deleteSong(songId) {
  return deleteDoc(doc(db, SONGS_COLLECTION, songId));
}
