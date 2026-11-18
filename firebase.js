import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAlWw4S4S51BPeQ5nZcvWkof_WTByi8jqM",
  authDomain: "elokala-94f23.firebaseapp.com",
  databaseURL: "https://elokala-94f23-default-rtdb.firebaseio.com",
  projectId: "elokala-94f23",
  storageBucket: "elokala-94f23.firebasestorage.app",
  messagingSenderId: "184742763022",
  appId: "1:184742763022:web:a608712aa9cf1725a37a5f"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
