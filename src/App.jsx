import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from "firebase/auth";
import { auth } from './firebaseConfig';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import HomePage from './components/HomePage';
import './index.css';
import TeamView from './components/TeamView';
import SettingsPage from './components/SettingsPage'; // <-- Import SettingsPage
// Simple component to handle redirects based on auth state
const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(null); // null = loading, true = logged in, false = logged out

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user); // Set to true if user exists, false otherwise
    });
    return () => unsubscribe(); // Cleanup listener
  }, []);

  if (isAuthenticated === null) {
    return <div>Loading...</div>; // Or a spinner component
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected Route for Home Page */}
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/team/:teamId" // <-- New route with teamId parameter
          element={
            <ProtectedRoute>
              <TeamView />
            </ProtectedRoute>
          }
        />
        {/* Add Route for SettingsPage */}
        <Route
          path="/settings" // <-- New route
          element={ <ProtectedRoute> <SettingsPage /> </ProtectedRoute> }
        />
         {/* Redirect root path to /home if logged in, otherwise /login */}
         <Route
          path="/"
          element={
            <ProtectedRoute>
              <Navigate to="/home" replace />
            </ProtectedRoute>
           }
         />

         {/* Fallback for unknown routes */}
         <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </Router>
  );
}

export default App;