// HomePage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where, orderBy, doc, getDoc } from "firebase/firestore";
import { auth, db } from '../firebaseConfig';
import CreateTeamModal from './CreateTeamModal';
import NotificationsModal from './NotificationsModal';

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

  // Fetch teams for a normal user
  const fetchTeamsForUser = async (userId) => {
    // ... (fetch logic remains the same)
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

  // Auth state listener
  useEffect(() => {
    // ... (auth logic remains the same)
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userDocRef);

          if (docSnap.exists() && docSnap.data().role === 'Master Admin') {
            navigate('/admin-dashboard', { replace: true });
          } else {
            fetchTeamsForUser(currentUser.uid);
          }
        } catch (err) {
          console.error("Error fetching user role:", err);
          fetchTeamsForUser(currentUser.uid);
        }

      } else {
        setUser(null);
        setTeams([]);
        navigate('/login', { replace: true });
      }
    });
    return () => unsubscribeAuth();
  }, [navigate]);

  // Modal handlers
  const openCreateTeamModal = () => setIsCreateModalOpen(true);
  const closeCreateTeamModal = () => setIsCreateModalOpen(false);
  const handleTeamCreated = () => {
    if (user) fetchTeamsForUser(user.uid);
  };

  return (
    <>
      {/* *** ADDED PADDING AND WIDTH CLASSES HERE *** */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-800">
            Your Teams
          </h2>
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

      <CreateTeamModal
        isOpen={isCreateModalOpen}
        onClose={closeCreateTeamModal}
        onTeamCreated={handleTeamCreated}
      />

       {/* Keeping NotificationsModal here temporarily is okay */}
       <NotificationsModal
         isOpen={isNotificationsModalOpen}
         onClose={() => setIsNotificationsModalOpen(false)}
       />
    </>
  );
};

export default HomePage;