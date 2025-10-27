import React, { useState, useEffect, useCallback } from 'react'; // Added useCallback
import { Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from '../firebaseConfig';

const SettingsPage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  // --- NEW: State for language ---
  const [selectedLanguage, setSelectedLanguage] = useState('en'); // Default to English
  // --- END NEW ---
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
                    // --- NEW: Load preferred language ---
                    setSelectedLanguage(userData.preferredLanguage || 'en'); // Default to 'en' if not set
                    // --- END NEW ---
                } else {
                    setDisplayName('');
                    setSelectedLanguage('en'); // Default if doc doesn't exist
                }
            } catch (fetchError) {
                console.error("Error fetching user document:", fetchError);
                setError("Could not load profile data.");
            } finally {
                setIsLoading(false);
            }
        } else {
            // No user logged in, redirect to login
            navigate('/login', { replace: true });
        }
    });
    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [navigate]);

  // Handle saving display name AND language
  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) { setError("Not logged in."); return; }
    setIsSaving(true);
    setError('');
    setSuccessMessage('');
    const userDocRef = doc(db, "users", user.uid);
    try {
      // Use setDoc with merge: true to create/update the document
      await setDoc(userDocRef, {
        displayName: displayName.trim(),
        email: user.email, // Ensure email is also stored/updated if needed
        // --- NEW: Save preferred language ---
        preferredLanguage: selectedLanguage
        // --- END NEW ---
      }, { merge: true }); // merge: true prevents overwriting other fields
      setSuccessMessage("Settings updated successfully!");
      setTimeout(() => setSuccessMessage(''), 3000); // Clear message after 3 seconds
    } catch (saveError) {
      console.error("Error saving settings:", saveError);
      setError("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 py-8"> {/* Added py-8 for vertical padding */}
          <h1 className="text-2xl font-semibold text-gray-800 mb-6">User Settings</h1>

          {/* Content Box */}
          <div className="max-w-xl mx-auto bg-white p-6 rounded-lg shadow-md border border-gray-200">
              {isLoading ? (
                  <div className="text-center text-gray-500">Loading settings...</div>
              ) : (
                  <>
                      {error && <p className="mb-4 text-red-600 bg-red-100 p-3 rounded-md text-sm">{error}</p>}
                      {successMessage && <p className="mb-4 text-green-600 bg-green-100 p-3 rounded-md text-sm">{successMessage}</p>}

                      <form onSubmit={handleSave}>
                          {/* Email Field (Read-only) */}
                          <div className="mb-5">
                              <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="email">
                              Email
                              </label>
                              <input
                              className="shadow-sm appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight bg-gray-100 cursor-not-allowed"
                              id="email"
                              type="email"
                              value={email}
                              readOnly
                              />
                          </div>

                          {/* Display Name Field (Editable) */}
                          <div className="mb-5"> {/* Changed mb-6 to mb-5 */}
                              <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="displayName">
                              Display Name
                              </label>
                              <input
                              className="shadow-sm appearance-none border border-gray-300 rounded w-full py-2 px-3 text-gray-900 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              id="displayName"
                              type="text"
                              placeholder="Your Name"
                              value={displayName}
                              onChange={(e) => setDisplayName(e.target.value)}
                              />
                              <p className="text-xs text-gray-500 mt-1">This name will be displayed to other team members.</p>
                          </div>

                          {/* --- NEW: Language Selection --- */}
                          <div className="mb-6">
                            <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="language">
                                Preferred Language
                            </label>
                            <div className="relative">
                                <select
                                    id="language"
                                    className="shadow-sm appearance-none border border-gray-300 rounded w-full py-2 px-3 text-gray-900 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8" // Added pr-8 for arrow space
                                    value={selectedLanguage}
                                    onChange={(e) => setSelectedLanguage(e.target.value)}
                                >
                                    <option value="en">English</option>
                                    <option value="ko">한국어 (Korean)</option>
                                    {/* Add more language options here as needed */}
                                    {/* <option value="es">Español (Spanish)</option> */}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Select your preferred display language for the interface.</p>
                          </div>
                          {/* --- END NEW --- */}


                          {/* Save Button */}
                          <div className="flex items-center justify-end pt-4 border-t border-gray-200">
                              <button
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-md shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 inline-flex items-center justify-center transition ease-in-out duration-150"
                              type="submit"
                              disabled={isSaving}
                              >
                              {isSaving && ( /* Simple spinner SVG */
                                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                              )}
                              {isSaving ? 'Saving...' : 'Save Changes'}
                              </button>
                          </div>
                      </form>
                  </>
              )}
          </div>
          {/* Back link */}
          <div className="mt-6 text-center">
              <Link
                  to="/home" // Or appropriate dashboard link
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                  &larr; Back to Dashboard
              </Link>
          </div>
      </div> {/* End of padding container */}
    </>
  );
};

export default SettingsPage;