
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
} from "firebase/auth";


// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCAN0Jjy-EyZix6ZengqKTftqdJTj1TNV4",
  authDomain: "recuerdos-6fb23.firebaseapp.com",
  projectId: "recuerdos-6fb23",
  storageBucket: "recuerdos-6fb23.firebasestorage.app",
  messagingSenderId: "821295873180",
  appId: "1:821295873180:web:7087d0f2406e3fa54e4159"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();