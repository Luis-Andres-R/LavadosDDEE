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
        // Fetch role from Firestore
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        
        const adminEmails = [
          'oossdespachocargasqm@gmail.com',
          'luis.robles.ramirez@gmail.com' // System user
        ];
        const operatorEmails = ['lavadosddee@gmail.com'];
        
        const lowerEmail = user.email?.toLowerCase() || '';
        let forcedRole: 'admin' | 'operator' | null = null;
        
        if (adminEmails.some(e => e.toLowerCase() === lowerEmail)) {
          forcedRole = 'admin';
        } else if (operatorEmails.some(e => e.toLowerCase() === lowerEmail)) {
          forcedRole = 'operator';
        }

        try {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (forcedRole && (data.role !== forcedRole || !data.active)) {
              const updatedProfile: UserProfile = {
                ...data,
                uid: user.uid,
                email: user.email || '',
                role: forcedRole,
                displayName: user.displayName || 'Usuario',
                active: true
              };
              await setDoc(docRef, updatedProfile);
              setProfile(updatedProfile);
            } else {
              setProfile({ uid: user.uid, ...data } as UserProfile);
            }
          } else {
            if (forcedRole) {
              const newProfile: UserProfile = {
                uid: user.uid,
                email: user.email || '',
                role: forcedRole,
                displayName: user.displayName || 'Usuario',
                active: true
              };
              await setDoc(docRef, newProfile);
              setProfile(newProfile);
            } else {
              setProfile(null);
            }
          }
        } catch (error) {
          console.error("Error syncing user profile:", error);
          setProfile(null);
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
