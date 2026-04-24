// lib/firebase.ts
// This file initializes the Firebase connection and exports the database.
// Every other file that needs to read/write data imports from here.

import { initializeApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBXeNYWi4VxbAKdhdogoUvSyckvSEYdN2c",
  authDomain: "match-test-36175.firebaseapp.com",
  databaseURL: "https://match-test-36175-default-rtdb.firebaseio.com",
  projectId: "match-test-36175",
  storageBucket: "match-test-36175.firebasestorage.app",
  messagingSenderId: "304695829208",
  appId: "1:304695829208:web:6817d4b3609ed1e57badad",
};

// Only initialize once — Next.js can run this file multiple times during dev
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getDatabase(app);
