// src/components/SettingsPage.jsx
import React, { useState, useEffect, useCallback, useContext } from 'react'; // --- IMPORT useContext ---
import { Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  writeBatch
} from "firebase/firestore";
import { auth, db } from '../firebaseConfig';
// --- REMOVE I18N IMPORT ---
// import { useTranslation } from 'react-i18next';
// --- END I18N IMPORT ---

// --- NEW CONTEXT IMPORT ---
import { LanguageContext } from '../contexts/LanguageContext.jsx'; // Import our new context
// --- END NEW CONTEXT IMPORT ---

const CHUNK_SIZE = 400; // Firestore batch safe chunk (<=500)

const SettingsPage = () => {
  const navigate = useNavigate();
  // --- USE CONTEXT HOOK ---
  // Get language (current state), setLanguage (function to change), and t (translator)
  const { language, setLanguage, t } = useContext(LanguageContext);
  // --- END CONTEXT HOOK ---

  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null); // full user document data
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  
  // This state now holds the *selection* in the dropdown,
  // which might be different from the *saved* language in the context.
  const [selectedLanguage, setSelectedLanguage] = useState(language); // Init from context
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Admin-only: whether to apply to all users
  const [applyToAllUsers, setApplyToAllUsers] = useState(false);
  
  // Sync local dropdown state if global context changes
  // (e.g., after LanguageProvider finishes loading from Firestore)
  useEffect(() => {
    setSelectedLanguage(language);
  }, [language]);

  // Fetch user data (display name, email, role)
  // We NO LONGER need to fetch or set language here; LanguageContext does it.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setIsLoading(true); // Start loading user-specific data
        setUser(currentUser);
        setEmail(currentUser.email || '');

        const userDocRef = doc(db, "users", currentUser.uid);
        try {
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            const userData = docSnap.data();
            setUserDoc(userData || null);
            setDisplayName(userData.displayName || '');
            // Language is handled by LanguageContext,
            // and the effect above syncs it to selectedLanguage
          } else {
            // no user doc
            setUserDoc(null);
            setDisplayName('');
          }
        } catch (fetchError) {
          console.error("Error fetching user document:", fetchError);
          setError(t('settings.errorMsg') || 'Failed to load settings.');
        } finally {
          setIsLoading(false); // Finish loading user-specific data
        }
      } else {
        navigate('/login', { replace: true });
      }
    });
    return () => unsubscribe();
  }, [navigate, t]); // Add 't' as a dependency since it's used in setError

  // update all users' preferredLanguage (batched, chunked)
  // This function does not need to change.
  const updateAllUsersLanguage = useCallback(async (newLang, setProgress) => {
    try {
      const usersCol = collection(db, 'users');
      const usersSnap = await getDocs(usersCol);
      const docs = usersSnap.docs;
      if (!docs.length) return { updated: 0 };

      let updated = 0;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((d) => {
          const ref = doc(db, 'users', d.id);
          batch.update(ref, { preferredLanguage: newLang });
        });
        await batch.commit();
        updated += chunk.length;
        if (typeof setProgress === 'function') setProgress(updated / docs.length);
      }

      return { updated };
    } catch (err) {
      console.error("Error updating all users' language:", err);
      throw err;
    }
  }, []); // This function has no dependencies on component state

  // Save handler
  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) { setError(t('settings.notLoggedIn') || 'Not logged in.'); return; }
    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      // 1) Save current user's non-language settings
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, {
        displayName: displayName.trim(),
        email: user.email,
        // preferredLanguage will be saved by setLanguage()
      }, { merge: true });

      // 2) Change UI language AND save preference for current user
      // We call the function from our context.
      // This will update the React state AND save to Firestore.
      await setLanguage(selectedLanguage);

      // 3) If admin asked to apply to all users: run batched updates and also save app default
      if (applyToAllUsers && userDoc && (userDoc.role === 'Master Admin' || userDoc.role === 'master_admin' || userDoc.isAdmin)) {
        setSuccessMessage(t('settings.applyingToAll') || 'Applying language to all users...');
        await updateAllUsersLanguage(selectedLanguage);
        // set global default
        await setDoc(doc(db, 'appSettings', 'ui'), { defaultLanguage: selectedLanguage }, { merge: true });
      }

      // final success
      setSuccessMessage(t('settings.successMsg') || 'Settings saved.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (saveError) {
      console.error("Error saving settings:", saveError);
      setError(t('settings.errorMsg') || 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  // Change language selection handler
  // This function just updates the *local* dropdown state.
  // The language is only applied when the user clicks SAVE.
  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setSelectedLanguage(newLang);
  };

  // The 'loadingLanguage' state from context is already handled by the Provider
  // so we only need to worry about 'isLoading' for the user doc.
  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-xl mx-auto">

          <h1 className="text-2xl font-semibold text-gray-800 mb-6 text-center sm:text-left">
      {t('settings.title')}
    </h1>
        <div className="max-w-xl mx-auto bg-white p-6 rounded-lg shadow-md border border-gray-200">
            {isLoading ? (
                <div className="text-center text-gray-500">{t('settings.loading')}</div>
            ) : (
                <>
                    {error && <p className="mb-4 text-red-600 bg-red-100 p-3 rounded-md text-sm">{error}</p>}
                    {successMessage && <p className="mb-4 text-green-600 bg-green-100 p-3 rounded-md text-sm">{successMessage}</p>}

                    <form onSubmit={handleSave}>
                        <div className="mb-5">
                            <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="email">
                                {t('settings.emailLabel')}
                            </label>
                            <input
                              className="shadow-sm appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight bg-gray-100 cursor-not-allowed"
                              id="email" type="email" value={email} readOnly
                            />
                        </div>

                        <div className="mb-5">
                            <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="displayName">
                                {t('settings.displayNameLabel')}
                            </label>
                            <input
                              className="shadow-sm appearance-none border border-gray-300 rounded w-full py-2 px-3 text-gray-900 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              id="displayName" type="text" placeholder={t('settings.displayNameLabel')}
                              value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                            />
                            <p className="text-xs text-gray-500 mt-1">{t('settings.displayNameHint')}</p>
                        </div>
                        
                        <div className="mb-4">
                          <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="language">
                            {t('settings.languageLabel')}
                          </label>
                          <div className="relative">
                            <select
                                id="language"
                                className="shadow-sm appearance-none border border-gray-300 rounded w-full py-2 px-3 text-gray-900 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                                value={selectedLanguage} // Controlled by local state
                                onChange={handleLanguageChange} // Update local state
                            >
                                <option value="en">English</option>
                                <option value="ko">한국어 (Korean)</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                          </div>

                          {/* Inform user: language will apply after Save */}
                          <p className="text-xs text-gray-500 mt-1">
                            {t('settings.languageWillApplyAfterSave') || 'Language will apply after you click Save.'}
                          </p>
                        </div>

                        {/* Admin-only: apply to all users (no change here) */}
                        {userDoc && (userDoc.role === 'Master Admin' || userDoc.role === 'master_admin' || userDoc.isAdmin) && (
                          <div className="mb-6">
                            <label className="inline-flex items-center">
                              <input
                                type="checkbox"
                                className="form-checkbox h-4 w-4 text-blue-600"
                                checked={applyToAllUsers}
                                onChange={(e) => setApplyToAllUsers(e.target.checked)}
                              />
                              <span className="ml-2 text-sm text-gray-700">{t('settings.applyToAllUsers') || 'Apply this language to ALL users (admin only)'}</span>
                            </label>
                            <p className="text-xs text-gray-500 mt-1">{t('settings.applyToAllHint') || 'This will update every user document and set the app default.'}</p>
                          </div>
                        )}

                        <div className="flex items-center justify-end pt-4 border-t border-gray-200">
                            <button
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-md shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 inline-flex items-center justify-center transition ease-in-out duration-150"
                              type="submit" disabled={isSaving}
                            >
                              {isSaving && (
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              )}
                              {/* Use t() from context */}
                              {isSaving ? t('common.saving') : t('common.saveChanges')}
                            </button>
                        </div>
                    </form>
                </>
            )}
        </div>
        <div className="mt-6 text-center">
            <Link to="/home" className="text-sm text-blue-600 hover:text-blue-800 hover:underline">
                {/* Use t() from context */}
                {t('common.backToDashboard')}
            </Link>
        </div>
      </div>
      </div>
    </>
  );
};

export default SettingsPage;