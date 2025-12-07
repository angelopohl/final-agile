// services/userService.js
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

export const UserService = {
  // Buscar usuario por Email (Reemplaza a findByEmail)
  findByEmail: async (email) => {
    const usersRef = collection(db, "usuarios");
    const q = query(usersRef, where("email", "==", email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) return null;

    // Retornamos el primer usuario encontrado
    const userDoc = querySnapshot.docs[0];
    return { id: userDoc.id, ...userDoc.data() };
  },

  // Crear usuario nuevo (Reemplaza a save)
  createUser: async (userData) => {
    // Usamos el email como ID del documento para evitar duplicados fácilmente
    // y para búsquedas rápidas (NoSQL best practice)
    const userRef = doc(db, "usuarios", userData.email);

    const newUser = {
      ...userData,
      createdAt: new Date().toISOString(),
      role: userData.role || "USER", // Por defecto USER, pero puede ser ADMIN
    };

    await setDoc(userRef, newUser);
    return newUser;
  },
};
