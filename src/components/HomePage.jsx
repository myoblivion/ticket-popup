// HomePage.jsx
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { onAuthStateChanged } from "firebase/auth";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  doc, 
  getDoc, 
  updateDoc, 
  onSnapshot 
} from "firebase/firestore";
import { auth, db } from '../firebaseConfig';
import { LanguageContext } from '../contexts/LanguageContext'; // Import the Context
import CreateTeamModal from './CreateTeamModal';
import NotificationsModal from './NotificationsModal';

// Spinner component
const Spinner = () => (
  <div className="flex justify-center items-center py-6">
    <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

// --- Constants & Helpers for Sub-projects ---
const SUBPROJECT_STATUS_CONFIG = [
  { key: 'not_started', color: 'bg-gray-100 text-gray-600 border-gray-300' },
  { key: 'in_progress', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { key: 'pending', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { key: 'paused', color: 'bg-red-100 text-red-700 border-red-300' },
  { key: 'completed', color: 'bg-green-100 text-green-700 border-green-300' },
];

// --- TeamCard Component ---
const TeamCard = ({ team }) => {
  const { t } = useContext(LanguageContext); // Use Context Hook
  const [newSubProjectName, setNewSubProjectName] = useState('');

  // Helper to update the team document
  const updateTeamSubProjects = async (updatedSubProjects) => {
    try {
      const teamRef = doc(db, 'teams', team.id);
      await updateDoc(teamRef, { subProjects: updatedSubProjects });
    } catch (error) {
      console.error("Error updating sub-projects:", error);
      alert("Failed to update sub-project.");
    }
  };

  const handleAddSubProject = (e) => {
    e.preventDefault();
    if (!newSubProjectName.trim()) return;

    const newItem = {
      id: Date.now().toString(),
      title: newSubProjectName.trim(),
      status: 'not_started'
    };

    const updatedList = [...(team.subProjects || []), newItem];
    updateTeamSubProjects(updatedList);
    setNewSubProjectName('');
  };

  const handleStatusChange = (subProjectId, newStatus) => {
    const currentList = team.subProjects || [];
    const updatedList = currentList.map(item => {
      if (item.id === subProjectId) {
        return { ...item, status: newStatus };
      }
      return item;
    });
    updateTeamSubProjects(updatedList);
  };

  const handleDeleteSubProject = (subProjectId) => {
    if (!window.confirm(t('home.confirmDeleteSub', 'Delete this sub-project?'))) return;
    const currentList = team.subProjects || [];
    const updatedList = currentList.filter(item => item.id !== subProjectId);
    updateTeamSubProjects(updatedList);
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 flex flex-col h-full hover:shadow-md transition-shadow duration-200">
      {/* Header Area - Links to Team Page */}
      <Link to={`/team/${team.id}`} className="p-5 block border-b border-gray-100 hover:bg-gray-50 transition-colors rounded-t-lg">
        <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-blue-600">{team.teamName}</h3>
        <p className="text-sm text-gray-600 mt-1 line-clamp-2 min-h-[2.5rem]">
            {team.description || t('home.noDescription', 'No description')}
        </p>
      </Link>

      {/* Sub-projects Section */}
      <div className="p-4 flex-1 flex flex-col bg-gray-50/50">
        <div className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wider">
            {t('home.subProjects', 'Sub-projects / Progress')}
        </div>
        
        {/* List */}
        <div className="space-y-2 mb-4 flex-1">
          {(!team.subProjects || team.subProjects.length === 0) && (
            <p className="text-xs text-gray-400 italic">
                {t('home.noSubProjects', 'No sub-projects yet.')}
            </p>
          )}
          {(team.subProjects || []).map(sub => {
            const currentStatusKey = sub.status || 'not_started';
            const statusConfig = SUBPROJECT_STATUS_CONFIG.find(s => s.key === currentStatusKey) || SUBPROJECT_STATUS_CONFIG[0];
            
            return (
              <div key={sub.id} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200 shadow-sm gap-2">
                <span className="text-sm text-gray-800 font-medium truncate flex-1" title={sub.title}>{sub.title}</span>
                
                {/* Status Dropdown */}
                <select
                  value={currentStatusKey}
                  onChange={(e) => handleStatusChange(sub.id, e.target.value)}
                  className={`text-xs px-2 py-1 rounded border outline-none cursor-pointer appearance-none text-center font-medium min-w-[90px] ${statusConfig.color}`}
                  style={{
                    WebkitAppearance: 'none', 
                    MozAppearance: 'none',
                    textAlignLast: 'center' 
                  }}
                >
                  {SUBPROJECT_STATUS_CONFIG.map(config => (
                    <option key={config.key} value={config.key} className="bg-white text-gray-800 text-left">
                      {/* Translation with fallback to key */}
                      {t(`status.${config.key}`, config.key)}
                    </option>
                  ))}
                </select>

                {/* Delete Button */}
                <button 
                  onClick={() => handleDeleteSubProject(sub.id)}
                  className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50"
                  title={t('common.delete', 'Delete')}
                >
                  &times;
                </button>
              </div>
            );
          })}
        </div>

        {/* Add Form */}
        <form onSubmit={handleAddSubProject} className="mt-auto pt-3 border-t border-gray-200">
          <div className="flex gap-2">
            <input
              type="text"
              value={newSubProjectName}
              onChange={(e) => setNewSubProjectName(e.target.value)}
              placeholder={t('home.addSubProject', 'Add sub-project...')}
              className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!newSubProjectName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1.5 flex items-center justify-center disabled:opacity-50 disabled:hover:bg-blue-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Main HomePage Component ---
const HomePage = () => {
  const { t } = useContext(LanguageContext); // Use Context Hook
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [errorTeams, setErrorTeams] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);

  // Fetch teams using onSnapshot for real-time updates
  useEffect(() => {
    if (!user) return;

    setIsLoadingTeams(true);
    const teamsCollectionRef = collection(db, "teams");
    const q = query(teamsCollectionRef, where("members", "array-contains", user.uid), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const teamsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTeams(teamsData);
      setIsLoadingTeams(false);
    }, (err) => {
      console.error("Error fetching teams:", err);
      // Using admin error key as fallback or generic string
      setErrorTeams(t('admin.loadTeamsError', 'Failed to load teams.'));
      setIsLoadingTeams(false);
    });

    return () => unsubscribe();
  }, [user, t]);

  // Auth state listener
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userDocRef);

          if (docSnap.exists()) {
            const userData = docSnap.data();
            
            // Note: We don't set language here anymore manually. 
            // The LanguageContext provider usually handles the initial load from the user profile.

            if (userData.role === 'Master Admin') {
              navigate('/admin-dashboard', { replace: true });
            }
          }
        } catch (err) {
          console.error("Error fetching user role:", err);
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
  
  return (
    <>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-800">
            {t('home.yourTeams', 'Your Teams')}
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={openCreateTeamModal}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-md shadow"
            >
              {t('home.createTeam', '+ Create Team')}
            </button>
          </div>
        </div>

        {isLoadingTeams && <Spinner />}
        {errorTeams && <div className="text-center text-red-600 bg-red-100 p-3 rounded-md">{errorTeams}</div>}
        
        {!isLoadingTeams && !errorTeams && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {teams.length === 0 ? (
              <p className="text-gray-500 col-span-full text-center py-8">
                {t('home.noTeams', "You haven't created or joined any teams yet.")}
              </p>
            ) : (
              teams.map((team) => (
                <TeamCard key={team.id} team={team} />
              ))
            )}
          </div>
        )}
      </section>

      <CreateTeamModal
        isOpen={isCreateModalOpen}
        onClose={closeCreateTeamModal}
        onTeamCreated={() => {}} 
      />

       <NotificationsModal
         isOpen={isNotificationsModalOpen}
         onClose={() => setIsNotificationsModalOpen(false)}
       />
    </>
  );
};

export default HomePage;