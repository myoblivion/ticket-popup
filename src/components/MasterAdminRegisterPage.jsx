import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// --- NEW IMPORTS ---
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from '../firebaseConfig';

const MasterAdminRegisterPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    
    if (password.length < 10) {
        setError('Password must be at least 10 characters long for security.');
        return;
    }

    setLoading(true);

    try {
      // 1. Create the user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Create the user document in Firestore with the Master Admin role
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        uid: user.uid,
        email: email,
        displayName: 'Master Admin', // Set a default display name
        role: 'Master Admin', // --- SET THE ROLE ---
        createdAt: serverTimestamp()
      });
      
      alert('Master Admin account created successfully in Firebase. Redirecting to login...');
      navigate('/login');

    } catch (err) {
      console.error("Master Admin registration error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered.');
      } else {
        setError('Failed to create account. See console for details.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Register Master Admin</h2>
        <p className="text-center text-gray-500 text-sm mb-4">
          This will create a permanent account in Firebase.
        </p>
        {error && <p className="mb-4 text-red-600 bg-red-100 p-3 rounded-md text-sm">{error}</p>}
        <form onSubmit={handleRegister}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="email">
              Master Admin Email
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              id="email"
              type="email"
              placeholder="master@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="password">
              Master Admin Password
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              id="password"
              type="password"
              placeholder="Min. 10 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="confirmPassword">
              Confirm Password
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              id="confirmPassword"
              type="password"
              placeholder="Repeat password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button
            className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full disabled:opacity-50"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Registering...' : 'Register Master Admin'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MasterAdminRegisterPage;