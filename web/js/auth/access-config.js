import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase-config.js";

const CONFIG_DOC = doc(db, "config", "access");

export async function getAllowedEmail() {
  const snapshot = await getDoc(CONFIG_DOC);
  return snapshot.exists() ? snapshot.data().allowedEmail : null;
}
