// HomePage.jsx
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { onAuthStateChanged } from "firebase/auth";
import { 
  collection, query, where, orderBy, doc, getDoc, onSnapshot, deleteDoc, getDocs 
} from "firebase/firestore";
import { auth, db } from '../firebaseConfig';
import { LanguageContext } from '../contexts/LanguageContext';

// Modals
import CreateTeamModal from './CreateTeamModal';
import CreateSubTeamModal from './CreateSubTeamModal';
import NotificationsModal from './NotificationsModal';
import ConfirmationModal from './ConfirmationModal'; 

// --- Icons ---
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;

const Spinner = () => (
  <div className="flex justify-center items-center py-6">
    <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

const getStatusColor = (status) => {
    switch(status) {
        case 'completed': return 'bg-green-100 text-green-700 border-green-200';
        case 'in_progress': return 'bg-blue-100 text-blue-700 border-blue-200';
        case 'paused': return 'bg-red-100 text-red-700 border-red-200';
        default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
};

// --- TeamCard Component ---
const TeamCard = ({ team, subProjects, onAddSubProject, currentUser, userRole, onDeleteSubProject, onDeleteTeam }) => {
  const { t } = useContext(LanguageContext);

  const canManage = currentUser && (
    team.createdBy === currentUser.uid || 
    userRole === 'Master Admin' ||
    team.roles?.[currentUser.uid] === 'admin'
  );

  return (
    <div className="bg-white rounded-lg shadow-md border-2 border-gray-800 flex flex-col h-full overflow-hidden">
      <div className="p-5 border-b-2 border-gray-800 bg-white min-h-[120px] relative group">
        <Link to={`/team/${team.id}`} className="block h-full">
            <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-700 transition-colors pr-8">
                {team.teamName}
            </h3>
            <p className="text-sm text-gray-500 mt-2 line-clamp-2 pr-8">
                {team.description || t('home.noDescription', 'Main Project Dashboard')}
            </p>
        </Link>
        <div className="absolute top-4 right-4">
            {canManage ? (
                <button 
                    onClick={(e) => {
                        e.preventDefault(); e.stopPropagation(); onDeleteTeam(team);
                    }}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                    title={t('common.delete', 'Delete Team')}
                >
                    <TrashIcon />
                </button>
            ) : (
                <div className="text-gray-300 p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                </div>
            )}
        </div>
      </div>

      <div className="bg-gray-50 flex-1 p-2 space-y-2">
        {subProjects.length > 0 ? (
            subProjects.map((sub) => (
                <div key={sub.id} className="flex items-center gap-1">
                    <Link 
                        to={`/team/${sub.id}`}
                        className="flex-1 block bg-white border-2 border-gray-800 rounded p-3 hover:bg-blue-50 transition-all shadow-sm group flex justify-between items-center"
                    >
                        <span className="font-bold text-gray-800 text-sm truncate pr-2">
                            {sub.teamName}
                        </span>
                        <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${getStatusColor(sub.status)}`}>
                            {t(`status.${sub.status || 'not_started'}`, sub.status?.replace('_', ' ') || 'Not Started')}
                        </span>
                    </Link>
                    {canManage && (
                        <button 
                            onClick={() => onDeleteSubProject(sub)}
                            className="bg-white border-2 border-gray-800 p-3 rounded hover:bg-red-50 hover:border-red-500 hover:text-red-600 transition-all"
                            title={t('home.deleteSubProject', 'Delete Sub-Project')}
                        >
                            <TrashIcon />
                        </button>
                    )}
                </div>
            ))
        ) : (
            <div className="text-center py-4 text-gray-400 text-xs italic border-2 border-dashed border-gray-200 rounded">
                {t('home.noSubProjects', 'No sub-projects yet')}
            </div>
        )}
        {canManage && (
            <button 
                onClick={() => onAddSubProject(team)}
                className="w-full py-2 border-2 border-dashed border-gray-400 text-gray-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded font-bold text-xl transition-all flex items-center justify-center"
                title={t('home.addSubProject', 'Add Sub-Project')}
            >
                +
            </button>
        )}
      </div>
    </div>
  );
};

// --- Main HomePage Component ---
const HomePage = () => {
  const { t } = useContext(LanguageContext);
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null); 
  const [allTeams, setAllTeams] = useState([]); 
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubProjectModalOpen, setIsSubProjectModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [subProjectToDelete, setSubProjectToDelete] = useState(null);
  const [parentTeamToDelete, setParentTeamToDelete] = useState(null); 
  const [targetParent, setTargetParent] = useState(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setAllTeams([]);
        navigate('/login', { replace: true });
        return;
      }
      
      setUser(currentUser);

      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(userDocRef);
        let currentRole = null;
        if (docSnap.exists()) {
            currentRole = docSnap.data().role;
            setUserRole(currentRole);
        }

        const teamsRef = collection(db, "teams");
        let q;

        if (currentRole === 'Master Admin') {
            q = query(teamsRef, orderBy("createdAt", "desc"));
        } else {
            // Standard User: Get teams where they are explicitly a member
            q = query(teamsRef, where("members", "array-contains", currentUser.uid), orderBy("createdAt", "desc"));
        }

        const unsubscribeTeams = onSnapshot(q, async (snapshot) => {
            const loadedTeams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // --- CRITICAL FIX: Fetch sub-projects for teams I manage but am not a member of ---
            // 1. Identify parents where I am Admin/Creator
            const myManagedParents = loadedTeams.filter(team => 
                !team.parentTeamId && (
                    team.createdBy === currentUser.uid || 
                    team.roles?.[currentUser.uid] === 'admin' ||
                    currentRole === 'Master Admin'
                )
            );

            const managedParentIds = myManagedParents.map(t => t.id);
            let extraSubProjects = [];

            // 2. Fetch sub-projects for these parents (max 10 at a time for 'in' query)
            if (managedParentIds.length > 0 && currentRole !== 'Master Admin') {
                // Only needed if not Master Admin (Master Admin fetches everything anyway)
                const chunks = [];
                for (let i = 0; i < managedParentIds.length; i += 10) {
                    chunks.push(managedParentIds.slice(i, i + 10));
                }

                for (const chunk of chunks) {
                    const qSubs = query(teamsRef, where("parentTeamId", "in", chunk));
                    const subSnap = await getDocs(qSubs);
                    const subs = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                    extraSubProjects = [...extraSubProjects, ...subs];
                }
            }

            // 3. Merge and Remove Duplicates
            const finalTeams = [...loadedTeams, ...extraSubProjects].filter((team, index, self) => 
                index === self.findIndex((t) => (t.id === team.id))
            );

            // 4. Sort
            finalTeams.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

            setAllTeams(finalTeams);
            setIsLoading(false);
        }, (err) => {
            console.error("Fetch error:", err);
            setError(t('home.loadError', 'Failed to load teams.'));
            setIsLoading(false);
        });

        return () => unsubscribeTeams();

      } catch (err) { 
          console.error(err); 
          setIsLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [navigate, t]);

  // Handlers
  const handleOpenDeleteModal = (subProject) => {
    setSubProjectToDelete(subProject);
    setParentTeamToDelete(null);
    setDeleteModalOpen(true);
  };

  const handleOpenDeleteParentModal = (team) => {
    setParentTeamToDelete(team);
    setSubProjectToDelete(null);
    setDeleteModalOpen(true);
  }

  const handleConfirmDelete = async () => {
    try {
        if (subProjectToDelete) { await deleteDoc(doc(db, "teams", subProjectToDelete.id)); } 
        else if (parentTeamToDelete) { await deleteDoc(doc(db, "teams", parentTeamToDelete.id)); }
        setDeleteModalOpen(false);
        setSubProjectToDelete(null);
        setParentTeamToDelete(null);
    } catch (error) {
        console.error("Error deleting:", error);
        alert(t('common.deleteError', 'Failed to delete.'));
    }
  };

  const parentTeams = allTeams.filter(team => !team.parentTeamId);
  const subTeams = allTeams.filter(team => team.parentTeamId);

  const handleOpenSubModal = (parentTeam) => {
    setTargetParent(parentTeam);
    setIsSubProjectModalOpen(true);
  };

  // Callback to refresh list (simple hack to force re-eval if needed, though snapshot handles mostly)
  const handleRefresh = () => { /* snapshot listener handles updates */ };

  let deleteTitle = "", deleteMessage = "";
  if (subProjectToDelete) {
      deleteTitle = t('home.deleteSubTitle', 'Delete Sub-Project?');
      deleteMessage = `${t('home.deleteSubConfirmPre', 'Delete')} "${subProjectToDelete.teamName}"?`;
  } else if (parentTeamToDelete) {
      deleteTitle = t('common.confirmDeleteTeam', 'Delete this team?');
      deleteMessage = `${t('home.deleteSubConfirmPre', 'Delete')} "${parentTeamToDelete.teamName}"?`;
  }

  return (
    <>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800 tracking-tight">{t('home.yourProjects', 'Your Projects')}</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => setIsCreateModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded shadow hover:shadow-lg transition-all">
              {t('home.createMainProject', '+ New Main Project')}
            </button>
          </div>
        </div>

        {isLoading && <Spinner />}
        {error && <div className="text-center text-red-600 bg-red-100 p-3 rounded-md">{error}</div>}
        
        {!isLoading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-8">
            {parentTeams.length === 0 ? (
              <p className="text-gray-500 col-span-full text-center py-12 text-lg">{t('home.noTeams', "You haven't joined any projects yet.")}</p>
            ) : (
              parentTeams.map((parent) => {
                const children = subTeams.filter(sub => sub.parentTeamId === parent.id);
                return (
                    <TeamCard key={parent.id} team={parent} subProjects={children} currentUser={user} userRole={userRole} onAddSubProject={handleOpenSubModal} onDeleteSubProject={handleOpenDeleteModal} onDeleteTeam={handleOpenDeleteParentModal} />
                );
              })
            )}
          </div>
        )}
      </section>

      <CreateTeamModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onTeamCreated={handleRefresh} />
      <CreateSubTeamModal isOpen={isSubProjectModalOpen} onClose={() => setIsSubProjectModalOpen(false)} parentTeamId={targetParent?.id} parentTeamName={targetParent?.teamName} onTeamCreated={handleRefresh} />
      <NotificationsModal isOpen={isNotificationsModalOpen} onClose={() => setIsNotificationsModalOpen(false)} />
      <ConfirmationModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} onConfirm={handleConfirmDelete} title={deleteTitle} message={deleteMessage} isDeleting={true} />
    </>
  );
};

export default HomePage;