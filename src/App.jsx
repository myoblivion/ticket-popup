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

// --- NEW IMPORT ---
import MasterAdminDashboard from './components/MasterAdminDashboard';

// ProtectedRoute stays the same. It correctly checks for any logged-in user.
// The logic to redirect *which* page they see is now in HomePage.jsx
const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(null); 

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user); 
    });
    return () => unsubscribe(); 
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
        <Route path="/register-master-admin" element={<MasterAdminRegisterPage />} />

        {/* Protected Routes 
          /home is now the "gate"
        */}
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        
        {/* --- NEW ROUTE FOR ADMIN DASHBOARD --- */}
        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute>
              <MasterAdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/team/:teamId" 
          element={
            <ProtectedRoute>
              <TeamView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings" 
          element={ <ProtectedRoute> <SettingsPage /> </ProtectedRoute> }
        />
         <Route
          path="/"
          element={
            <ProtectedRoute>
              <Navigate to="/home" replace />
            </ProtectedRoute>
           }
         />
         <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;