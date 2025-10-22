import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from '../firebaseConfig';
import Header from './Header'; // <-- Import the Header component

const SettingsPage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // useEffect for fetching data remains the same...
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
            setUser(currentUser);
            setEmail(currentUser.email || '');
            const userDocRef = doc(db, "users", currentUser.uid);
            try {
                const docSnap = await getDoc(userDocRef);
                if (docSnap.exists()) {
                    setDisplayName(docSnap.data().displayName || '');
                } else { setDisplayName(''); }
            } catch (fetchError) { setError("Could not load profile data."); }
            finally { setIsLoading(false); }
        } else { navigate('/login'); }
    });
    return () => unsubscribe();
  }, [navigate]);

  // handleSave function remains the same...
  const handleSave = async (e) => {
    // ... same save logic ...
    e.preventDefault();
    if (!user) { setError("Not logged in."); return; }
    setIsSaving(true);
    setError('');
    setSuccessMessage('');
    const userDocRef = doc(db, "users", user.uid);
    try {
      await setDoc(userDocRef, {
        displayName: displayName.trim(),
        email: user.email
      }, { merge: true });
      setSuccessMessage("Display name updated successfully!");
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (saveError) { setError("Failed to save display name."); }
    finally { setIsSaving(false); }
  };


  return (
    // Main container using flex column layout
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
        {/* Render the consistent Header */}
        <Header />

        {/* Main Content Area with consistent padding and max-width */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
             {/* Optional: Add a title for the page */}
             <h1 className="text-2xl font-semibold text-gray-800 mb-6">User Settings</h1>

             {/* Content Box (keeps the max-w-xl centered within the main area) */}
             <div className="max-w-xl mx-auto bg-white p-6 rounded-lg shadow-md border border-gray-200">
                {isLoading ? (
                     <div>Loading settings...</div> // Simple loading indicator
                ) : (
                    <>
                        {error && <p className="mb-4 text-red-600 bg-red-100 p-3 rounded-md text-sm">{error}</p>}
                        {successMessage && <p className="mb-4 text-green-600 bg-green-100 p-3 rounded-md text-sm">{successMessage}</p>}

                        <form onSubmit={handleSave}>
                            {/* Email Field */}
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

                            {/* Display Name Field */}
                            <div className="mb-6">
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

                            {/* Save Button */}
                            <div className="flex items-center justify-end pt-4 border-t border-gray-200">
                                <button
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-md shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 inline-flex items-center justify-center transition ease-in-out duration-150"
                                type="submit"
                                disabled={isSaving}
                                >
                                {isSaving && ( /* Simple spinner */
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" /* ... */ ></svg>
                                )}
                                {isSaving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </>
                )}
             </div>
             {/* Back link could also go outside the white box if preferred */}
             <div className="mt-6 text-center">
                 <Link
                    to="/home"
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                 >
                    &larr; Back to Dashboard
                 </Link>
             </div>
        </main>
    </div>
  );
};

export default SettingsPage;