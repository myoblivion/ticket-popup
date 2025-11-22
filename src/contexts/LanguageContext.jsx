// src/contexts/LanguageContext.jsx
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig'; // Make sure this path is correct
import { translations } from '../translations'; // We will create this file next

// 1. Create the context
export const LanguageContext = createContext();

// 2. Create the provider component
export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState('en'); // Default to English
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On user login, check their saved preference from Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists() && docSnap.data().preferredLanguage) {
            const userLang = docSnap.data().preferredLanguage;
            setLanguageState(userLang); // Set to 'en' or 'ko' from Firestore
          } else {
            setLanguageState('en'); // Default to 'en' if not set
          }
        } catch (error) {
          console.error("Error fetching language preference:", error);
          setLanguageState('en'); // Default on error
        }
      } else {
        setLanguageState('en'); // Default if logged out
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 3. Function to change language and save preference
  const setLanguage = useCallback(async (newLang) => {
    if (newLang !== 'en' && newLang !== 'ko') newLang = 'en'; // Safety check

    setLanguageState(newLang); // Update state immediately

    // Save preference to Firestore for the current user
    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          preferredLanguage: newLang
        }, { merge: true });
      } catch (error) {
        console.error("Failed to save language preference:", error);
        // The state is already updated optimistically
      }
    }
  }, [user]);

  // 4. Translation function 't'
  // This function takes a key (e.g., 'header.dashboard') and returns the string
  const t = useCallback((key) => {
    if (!key) return '';
    const keys = key.split('.'); // 'header.dashboard' -> ['header', 'dashboard']
    let result = translations[language]; // Start with 'en' or 'ko' object
    
    try {
      for (const k of keys) {
        result = result[k];
      }
      // If result is not found (e.g., missing translation), return the key itself
      return result || key;
    } catch (error) {
      return key; // Return the key on error
    }
  }, [language]); // Re-create this function only if 'language' changes

  // 5. Provide the values to children
  const value = {
    language,
    setLanguage,
    t,
    loadingLanguage: loading
  };

  // Don't render the app until the language has been loaded
  if (loading) {
    // You can replace this with a better full-page loader
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

// 6. Custom hook for easy access (optional, but good practice)
export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};