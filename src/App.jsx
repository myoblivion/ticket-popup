// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from "firebase/auth";
import { auth } from './firebaseConfig';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import HomePage from './components/HomePage';
import './index.css';
import TeamView from './components/TeamView';
import SettingsPage from './components/SettingsPage';
import MasterAdminRegisterPage from './components/MasterAdminRegisterPage';
import MasterAdminDashboard from './components/MasterAdminDashboard';
// import './i18n'; // --- REMOVE THIS ---

// --- NEW IMPORTS ---
import { LanguageProvider } from './contexts/LanguageContext.jsx'; // Import the provider (CHANGED)
import MainLayout from './components/MainLayout';
// --- END NEW IMPORTS ---


// ProtectedRoute stays the same
const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(null);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
    });
    return () => unsubscribe();
  }, []);

  if (isAuthenticated === null) {
    // Optional: Render a full-page spinner or skeleton here
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    // Wrap the *entire app* in the LanguageProvider
    <LanguageProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/register-master-admin" element={<MasterAdminRegisterPage />} />

          {/* --- Protected Routes --- */}
          {/* Wrap the MainLayout with ProtectedRoute */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout /> {/* This layout now contains Header, Chat button, Modals */}
              </ProtectedRoute>
            }
          >
            {/* Routes rendered INSIDE MainLayout via <Outlet /> */}
            <Route path="/home" element={<HomePage />} />
            <Route path="/admin-dashboard" element={<MasterAdminDashboard />} />
            
            {/* --- MODIFIED ROUTES --- */}
            <Route path="/team/:teamId/task/:taskId" element={<TeamView />} />
            {/* --- NEW HANDOVER ROUTE --- */}
            <Route path="/team/:teamId/handover/:handoverId" element={<TeamView />} />
            <Route path="/team/:teamId" element={<TeamView />} />
            {/* --- END MODIFICATION --- */}
            
            <Route path="/settings" element={<SettingsPage />} />

            {/* Default route for logged-in users */}
            <Route path="/" element={<Navigate to="/" replace />} />

          </Route> {/* End of Protected Routes group */}

          {/* Catch-all route (can redirect to login or home depending on auth) */}
          {/* This might need adjustment based on ProtectedRoute's loading state handling */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </Router>
    </LanguageProvider>
  );
}

export default App;