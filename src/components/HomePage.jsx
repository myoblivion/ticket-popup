// HomePage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, getDocs, query, where, orderBy, doc, getDoc } from "firebase/firestore";
import { auth, db } from '../firebaseConfig';
import CreateTeamModal from './CreateTeamModal';
import Header from './Header';
import NotificationsModal from './NotificationsModal';
// --- REMOVED MasterAdminModal ---

// Spinner component
const Spinner = () => (
  <div className="flex justify-center items-center py-6">
    <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

const HomePage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [errorTeams, setErrorTeams] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  
  // --- REMOVED all isMasterAdmin and isMasterModalOpen states ---

  // Fetch teams for a normal user (teams where they are a member)
  const fetchTeamsForUser = async (userId) => {
    if (!userId) {
      setTeams([]);
      setIsLoadingTeams(false);
      return;
    }
    setIsLoadingTeams(true);
    setErrorTeams(null);
    try {
      const teamsCollectionRef = collection(db, "teams");
      const q = query(teamsCollectionRef, where("members", "array-contains", userId), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const teamsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTeams(teamsData);
    } catch (err) {
      console.error("Error fetching teams:", err);
      setErrorTeams("Failed to load teams.");
    } finally {
      setIsLoadingTeams(false);
    }
  };

  // --- REMOVED fetchAllTeams ---

  // --- MODIFIED: Auth state listener ---
  // Now redirects admins to the new dashboard
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        
        // --- MODIFIED: Check role and redirect if Admin ---
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userDocRef);

          if (docSnap.exists() && docSnap.data().role === 'Master Admin') {
            // User is Master Admin -> REDIRECT
            navigate('/admin-dashboard', { replace: true });
          } else {
            // User is a regular user -> Stay here and load teams
            fetchTeamsForUser(currentUser.uid); 
          }
        } catch (err) {
          console.error("Error fetching user role:", err);
          fetchTeamsForUser(currentUser.uid); // Default to regular user on error
        }
        // --- END MODIFICATION ---
        
      } else {
        // No user, clear all state and go to login.
        setUser(null);
        setTeams([]);
        navigate('/login');
      }
    });

    return () => unsubscribeAuth();
  }, [navigate]);

  // Modal handlers
  const openCreateTeamModal = () => setIsCreateModalOpen(true);
  const closeCreateTeamModal = () => setIsCreateModalOpen(false);
  const handleTeamCreated = () => {
    // Only fetches user teams now
    if (user) fetchTeamsForUser(user.uid);
  };

  // --- REMOVED handleMasterLogout ---

  return (
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
      <Header onNotificationClick={() => setIsNotificationsModalOpen(true)} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <section>
          <div className="flex justify-between items-center mb-6">
            {/* --- MODIFIED: Simplified Title --- */}
            <h2 className="text-2xl font-semibold text-gray-800">
              Your Teams
            </h2>

            {/* --- MODIFIED: Removed Admin Button --- */}
            <div className="flex items-center gap-3">
              <button
                onClick={openCreateTeamModal}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-md shadow"
              >
                + Create Team
              </button>
            </div>
          </div>

          {isLoadingTeams && <Spinner />}
          {errorTeams && <div className="text-center text-red-600 bg-red-100 p-3 rounded-md">{errorTeams}</div>}
          {!isLoadingTeams && !errorTeams && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {teams.length === 0 ? (
                // --- MODIFIED: Simplified Message ---
                <p className="text-gray-500 col-span-full text-center py-8">
                  You haven't created or joined any teams yet.
                </p>
              ) : (
                teams.map((team) => (
                  <Link
                    key={team.id}
                    to={`/team/${team.id}`}
                    className="block bg-white p-5 rounded-lg shadow border border-gray-200 hover:shadow-lg hover:border-blue-300 transition-all duration-200 ease-in-out group"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">{team.teamName}</h3>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2 h-10">{team.description || 'No description'}</p>
                  </Link>
                ))
              )}
            </div>
          )}
        </section>
      </main>

      <CreateTeamModal
        isOpen={isCreateModalOpen}
        onClose={closeCreateTeamModal}
        onTeamCreated={handleTeamCreated}
      />

      <NotificationsModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
      />

      {/* --- REMOVED MasterAdminModal --- */}
    </div>
  );
};

export default HomePage;