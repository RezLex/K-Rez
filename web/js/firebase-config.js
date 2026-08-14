import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBN0oZf5NXeo1-15Th6wF-qW9oghxTudSg",
  authDomain: "k-rez-b52a2.firebaseapp.com",
  projectId: "k-rez-b52a2",
  storageBucket: "k-rez-b52a2.firebasestorage.app",
  messagingSenderId: "596694171334",
  appId: "1:596694171334:web:39284ec23d8ba3bb15e1c7"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
