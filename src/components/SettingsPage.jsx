import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from '../firebaseConfig';
import { useTranslation } from 'react-i18next'; // 1. IMPORT THE HOOK

const SettingsPage = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation(); // 2. USE THE HOOK
  
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language); // 3. Set default from i18n
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch user data including language preference
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
            setUser(currentUser);
            setEmail(currentUser.email || '');
            const userDocRef = doc(db, "users", currentUser.uid);
            try {
                const docSnap = await getDoc(userDocRef);
                if (docSnap.exists()) {
                    const userData = docSnap.data();
                    setDisplayName(userData.displayName || '');
                    
                    const userLang = userData.preferredLanguage || 'en';
                    setSelectedLanguage(userLang);

                    // *** FIX 2: Only change language if it's different ***
                    if (i18n.language !== userLang) {
                      i18n.changeLanguage(userLang);
                    }
                    // *** END FIX ***

                } else {
                    setDisplayName('');
                    // *** FIX 2 (part 2): Apply same logic for default ***
                    if (i18n.language !== 'en') {
                      i18n.changeLanguage('en'); 
                    }
                    // *** END FIX ***
                }
            } catch (fetchError) {
                console.error("Error fetching user document:", fetchError);
                setError(t('settings.errorMsg')); // 5. Use t() for error
            } finally {
                setIsLoading(false);
            }
        } else {
            navigate('/login', { replace: true });
        }
    });
    return () => unsubscribe();
  }, [navigate, i18n, t]); // This dependency array is now safe

  // Handle saving display name AND language
  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) { setError("Not logged in."); return; }
    setIsSaving(true);
    setError('');
    setSuccessMessage('');
    const userDocRef = doc(db, "users", user.uid);
    try {
      await setDoc(userDocRef, {
        displayName: displayName.trim(),
        email: user.email,
        preferredLanguage: selectedLanguage
      }, { merge: true });

      // *** FIX 1: Await the async language change ***
      const newT = await i18n.changeLanguage(selectedLanguage); 
      setSuccessMessage(newT('settings.successMsg')); // Use the new t function
      // *** END FIX ***
      
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (saveError) {
      console.error("Error saving settings:", saveError);
      setError(t('settings.errorMsg')); // 5. Use t() for error
    } finally {
      setIsSaving(false);
    }
  };

  // 8. NEW HANDLER FOR LANGUAGE CHANGE
  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setSelectedLanguage(newLang);
    // You can change language instantly on select, or wait for save
    // i18n.changeLanguage(newLang); // Uncomment this to change language instantly
  };

  // 5. USE t() TO REPLACE ALL YOUR STATIC TEXT
  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-semibold text-gray-800 mb-6">{t('settings.title')}</h1>

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
                        
                        <div className="mb-6">
                          <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="language">
                            {t('settings.languageLabel')}
                          </label>
                          <div className="relative">
                            <select
                                id="language"
                                className="shadow-sm appearance-none border border-gray-300 rounded w-full py-2 px-3 text-gray-900 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                                value={selectedLanguage}
                                onChange={handleLanguageChange} // 9. Use new handler
                            >
                                <option value="en">English</option>
                                <option value="ko">한국어 (Korean)</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{t('settings.languageHint')}</p>
                        </div>

                        <div className="flex items-center justify-end pt-4 border-t border-gray-200">
                            <button
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-md shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 inline-flex items-center justify-center transition ease-in-out duration-150"
                              type="submit" disabled={isSaving}
                            >
                              {isSaving && ( /* Simple spinner SVG */
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              )}
                              {isSaving ? t('common.saving') : t('common.saveChanges')}
                            </button>
                        </div>
                    </form>
                </>
            )}
        </div>
        <div className="mt-6 text-center">
            <Link to="/home" className="text-sm text-blue-600 hover:text-blue-800 hover:underline">
                {t('common.backToDashboard')}
            </Link>
        </div>
      </div>
    </>
  );
};
 
export default SettingsPage;