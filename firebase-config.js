// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsOXbnTJVxK6n011MFoIsXr9E-IebIpCM",
  authDomain: "hptter-97f19.firebaseapp.com",
  projectId: "hptter-97f19",
  storageBucket: "hptter-97f19.firebasestorage.app",
  messagingSenderId: "820558172740",
  appId: "1:820558172740:web:6fd880c53a1215ed1ba211"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
