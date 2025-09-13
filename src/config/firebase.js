// src/config/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAhziJbG5Pxg0UYvq784YH4zXpsdKfh7AY",
  authDomain: "bigfoot-connect.firebaseapp.com",
  projectId: "bigfoot-connect",
  storageBucket: "bigfoot-connect.appspot.com",
  messagingSenderId: "177999879162",
  appId: "1:177999879162:web:a1ea739930cac97475e243",
  measurementId: "G-WEY300P1S7"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;