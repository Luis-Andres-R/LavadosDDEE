import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const lowerEmail = user.email?.toLowerCase().trim() || '';
        
        const PREDEFINED_USERS: Record<string, { role: 'admin' | 'operator', displayName: string, assignedShift: 'T39' | 'T44' | null, active: boolean }> = {
          'oossdespachocargasqm@gmail.com': { role: 'admin', displayName: 'Administrador', assignedShift: null, active: true },
          'lavadosddeet39@gmail.com': { role: 'operator', displayName: 'Lavador T39', assignedShift: 'T39', active: true },
          'lavadosddee@gmail.com': { role: 'operator', displayName: 'Lavador T44', assignedShift: 'T44', active: true },
          'luis.robles.ramirez@gmail.com': { role: 'admin', displayName: 'Administrador', assignedShift: null, active: true }
        };
        const predefined = PREDEFINED_USERS[lowerEmail];

        try {
          // 1. App obtains auth.currentUser.email & normalizes it
          // 2. App searches in the users collection for any document whose field 'email' matches exactly
          const { query, collection, where, getDocs } = await import('firebase/firestore');
          const q = query(collection(db, 'users'), where('email', '==', lowerEmail));
          const querySnap = await getDocs(q);
          const data = querySnap.empty ? null : querySnap.docs[0].data();

          if (predefined) {
            // Predefined user - always guarantee accurate fields and active=true in local state
            const targetProfile: UserProfile = {
              uid: user.uid,
              email: user.email || lowerEmail,
              role: predefined.role,
              displayName: predefined.displayName,
              assignedShift: predefined.assignedShift,
              active: true
            };

            // Query or check if the exact doc exists under actual UID users/${user.uid}
            const docRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(docRef);
            const uidData = docSnap.exists() ? docSnap.data() : null;

            // Update if doc doesn't exist, has incorrect fields, or has active !== true
            const needsUpdate = !uidData || 
                                uidData.role !== targetProfile.role ||
                                uidData.displayName !== targetProfile.displayName ||
                                uidData.assignedShift !== targetProfile.assignedShift ||
                                uidData.email?.toLowerCase().trim() !== lowerEmail ||
                                !uidData.active;

            if (needsUpdate) {
              try {
                await setDoc(docRef, targetProfile);
              } catch (writeErr) {
                console.error("Error writing predefined user profile to Firestore path:", writeErr);
              }
            }
            setProfile(targetProfile);
          } else if (data) {
            // Found existing user profile in db by email match
            const activeStatus = data.active !== undefined ? data.active : true;
            const targetProfile: UserProfile = {
              uid: user.uid,
              email: data.email || user.email || lowerEmail,
              role: data.role || 'operator',
              displayName: data.displayName || user.displayName || 'Usuario',
              assignedShift: data.assignedShift || null,
              active: activeStatus
            };

            // Sync/Write to users/${user.uid} so our UID is correctly registered
            // which enables Firestore rules to pass for users/${request.auth.uid} matching correctly.
            const docRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists() || docSnap.data()?.active !== activeStatus || docSnap.data()?.role !== targetProfile.role) {
              try {
                await setDoc(docRef, targetProfile);
              } catch (writeErr) {
                console.error("Error syncing operator profile to users UID path:", writeErr);
              }
            }
            setProfile(targetProfile);
          } else {
            // Not registered and not predefined
            setProfile(null);
          }
        } catch (error) {
          console.error("Error querying or syncing user profile:", error);
          // Safety Fallback: If query fails or rules block us but we are predefined, grant active access anyway.
          if (predefined) {
            setProfile({
              uid: user.uid,
              email: lowerEmail,
              role: predefined.role,
              displayName: predefined.displayName,
              assignedShift: predefined.assignedShift,
              active: true
            });
          } else {
            setProfile(null);
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
