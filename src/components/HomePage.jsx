import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { onAuthStateChanged } from "firebase/auth"; // Keep this for user check
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { auth, db } from '../firebaseConfig'; // Keep auth import if needed elsewhere, db for teams
import CreateTeamModal from './CreateTeamModal';
import Header from './Header'; // <-- Import the new Header component

// Spinner component
const Spinner = () => (
    <div className="flex justify-center items-center py-6">
      <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);


const HomePage = () => {
  const navigate = useNavigate();
  // Keep user state if needed for fetching, but header handles display/logout
  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [errorTeams, setErrorTeams] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Auth state listener - mainly to get UID for fetching
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser); // Keep user object if needed for queries
        fetchTeams(currentUser.uid);
      } else {
        // Redirect logic might be better handled solely in App.jsx's ProtectedRoute
        // but can be kept here as a fallback
        setUser(null);
        navigate('/login');
      }
    });
    return () => unsubscribeAuth();
  }, [navigate]);

  // Fetch teams function remains the same
  const fetchTeams = async (userId) => {
    // ... same fetchTeams logic ...
     if (!userId) {
        setTeams([]);
        setIsLoadingTeams(false);
        return;
    };
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

  // Modal handlers remain the same
  const openCreateTeamModal = () => setIsCreateModalOpen(true);
  const closeCreateTeamModal = () => setIsCreateModalOpen(false);
  const handleTeamCreated = () => {
      if(user) { fetchTeams(user.uid); }
  };

  return (
    // Removed h-screen from here, Header controls height now. Added min-h-screen for background.
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
        {/* === Use the Header Component === */}
        <Header />

        {/* Main Content Area with Padding */}
        {/* max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 matches header for consistent width */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {/* Teams Section */}
            <section>
                <div className="flex justify-between items-center mb-6"> {/* Increased margin-bottom */}
                    <h2 className="text-2xl font-semibold text-gray-800">Your Teams</h2>
                    <button
                        onClick={openCreateTeamModal}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-md shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out"
                    >
                      + Create Team
                    </button>
                </div>

                {/* Teams List */}
                {isLoadingTeams && <Spinner />}
                {errorTeams && <div className="text-center text-red-600 bg-red-100 p-3 rounded-md">{errorTeams}</div>}
                {!isLoadingTeams && !errorTeams && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"> {/* Increased gap */}
                    {teams.length === 0 ? (
                        <p className="text-gray-500 col-span-full text-center py-8">You haven't created or joined any teams yet.</p>
                    ) : (
                        teams.map((team) => (
                        <Link
                            key={team.id}
                            to={`/team/${team.id}`}
                            className="block bg-white p-5 rounded-lg shadow border border-gray-200 hover:shadow-lg hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-all duration-200 ease-in-out group" // Added group for potential hover effects inside
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

        {/* Render the Modal */}
        <CreateTeamModal
            isOpen={isCreateModalOpen}
            onClose={closeCreateTeamModal}
            onTeamCreated={handleTeamCreated}
        />
    </div>
  );
};

export default HomePage;