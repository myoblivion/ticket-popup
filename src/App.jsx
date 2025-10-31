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
import './i18n'; // Import the i18n configuration
// --- NEW IMPORT ---
import MainLayout from './components/MainLayout'; // Import the layout

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
          <Route path="/team/:teamId" element={<TeamView />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* Default route for logged-in users */}
          <Route path="/" element={<Navigate to="/home" replace />} />

        </Route> {/* End of Protected Routes group */}

        {/* Catch-all route (can redirect to login or home depending on auth) */}
        {/* This might need adjustment based on ProtectedRoute's loading state handling */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </Router>
  );
}

export default App;