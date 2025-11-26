// HomePage.jsx
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { onAuthStateChanged } from "firebase/auth";
import { 
  collection, query, where, orderBy, doc, getDoc, onSnapshot, deleteDoc, getDocs, updateDoc, serverTimestamp 
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

const PencilIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>;

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

// --- Edit Modal Component ---
const EditProjectModal = ({ isOpen, onClose, project, onSave }) => {
    const { t } = useContext(LanguageContext);
    const [teamName, setTeamName] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('not_started');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (project) {
            setTeamName(project.teamName || '');
            setDescription(project.description || '');
            setStatus(project.status || 'not_started');
        }
    }, [project]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const updates = {
                teamName,
                // Only send description if it's a main project (no parentTeamId)
                ...(!project.parentTeamId && { description }),
                // Only send status if it's a sub-project (has parentTeamId)
                ...(project.parentTeamId && { status })
            };
            await onSave(project.id, updates);
            onClose();
        } catch (error) {
            console.error("Error updating:", error);
            alert("Failed to update project");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !project) return null;

    const isSubProject = !!project.parentTeamId;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <h3 className="text-xl font-bold mb-4 text-gray-800">
                    {t('common.edit', 'Edit')} {isSubProject ? 'Sub-Project' : 'Project'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('common.name', 'Project Name')}
                        </label>
                        <input 
                            type="text" 
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                            required 
                        />
                    </div>

                    {!isSubProject && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {t('common.description', 'Description')}
                            </label>
                            <textarea 
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                                rows="3"
                            />
                        </div>
                    )}

                    {isSubProject && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {t('common.status', 'Status')}
                            </label>
                            <select 
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="not_started">{t('status.not_started', 'Not Started')}</option>
                                <option value="in_progress">{t('status.in_progress', 'In Progress')}</option>
                                <option value="paused">{t('status.paused', 'Paused')}</option>
                                <option value="completed">{t('status.completed', 'Completed')}</option>
                            </select>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-6">
                        <button 
                            type="button" 
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                        >
                            {t('common.cancel', 'Cancel')}
                        </button>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {loading ? t('common.saving', 'Saving...') : t('common.save', 'Save Changes')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- TeamCard Component ---
const TeamCard = ({ 
    team, 
    subProjects, 
    onAddSubProject, 
    currentUser, 
    userRole, 
    onDeleteSubProject, 
    onDeleteTeam,
    onEditTeam 
}) => {
  const { t } = useContext(LanguageContext);

  const canManage = currentUser && (
    team.createdBy === currentUser.uid || 
    userRole === 'Master Admin' ||
    team.roles?.[currentUser.uid] === 'admin'
  );

  return (
    <div className="bg-white rounded-lg shadow-md border-2 border-gray-800 flex flex-col h-full overflow-hidden">
      {/* 1. Main Project Header */}
      <div className="p-5 border-b-2 border-gray-800 bg-white min-h-[120px] relative group flex justify-between items-start">
        
        {/* Left side: Title & Description */}
        <Link to={`/team/${team.id}`} className="block flex-1 min-w-0 pr-2">
            <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-700 transition-colors truncate" title={team.teamName}>
                {team.teamName}
            </h3>
            <p className="text-sm text-gray-500 mt-2 line-clamp-2" title={team.description}>
                {team.description || t('home.noDescription', 'Main Project Dashboard')}
            </p>
        </Link>

        {/* Right side: Action Buttons */}
        <div className="flex-shrink-0 ml-2 flex gap-1">
            {canManage ? (
                <>
                    <button 
                        onClick={(e) => {
                            e.preventDefault(); e.stopPropagation(); onEditTeam(team);
                        }}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
                        title={t('common.edit', 'Edit Team')}
                    >
                        <PencilIcon />
                    </button>
                    <button 
                        onClick={(e) => {
                            e.preventDefault(); e.stopPropagation(); onDeleteTeam(team);
                        }}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                        title={t('common.delete', 'Delete Team')}
                    >
                        <TrashIcon />
                    </button>
                </>
            ) : (
                <div className="text-gray-300 p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                </div>
            )}
        </div>
      </div>

      {/* 2. Sub-Projects Stack */}
      <div className="bg-gray-50 flex-1 p-2 space-y-2">
        {subProjects.length > 0 ? (
            subProjects.map((sub) => (
                <div key={sub.id} className="flex items-center gap-1">
                    <Link 
                        to={`/team/${sub.id}`}
                        className="flex-1 block bg-white border-2 border-gray-800 rounded p-3 hover:bg-blue-50 transition-all shadow-sm group flex justify-between items-center min-w-0"
                    >
                        <span className="font-bold text-gray-800 text-sm truncate pr-2">
                            {sub.teamName}
                        </span>
                        <span className={`flex-shrink-0 text-[10px] uppercase font-bold px-2 py-1 rounded border ${getStatusColor(sub.status)}`}>
                            {t(`status.${sub.status || 'not_started'}`, sub.status?.replace('_', ' ') || 'Not Started')}
                        </span>
                    </Link>
                    {canManage && (
                        <div className="flex flex-col gap-1">
                            <button 
                                onClick={() => onEditTeam(sub)}
                                className="bg-white border-2 border-gray-800 p-1.5 rounded hover:bg-blue-50 hover:border-blue-500 hover:text-blue-600 transition-all flex-shrink-0"
                                title={t('common.edit', 'Edit')}
                            >
                                <PencilIcon />
                            </button>
                            <button 
                                onClick={() => onDeleteSubProject(sub)}
                                className="bg-white border-2 border-gray-800 p-1.5 rounded hover:bg-red-50 hover:border-red-500 hover:text-red-600 transition-all flex-shrink-0"
                                title={t('home.deleteSubProject', 'Delete')}
                            >
                                <TrashIcon />
                            </button>
                        </div>
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
  
  // Delete Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [subProjectToDelete, setSubProjectToDelete] = useState(null);
  const [parentTeamToDelete, setParentTeamToDelete] = useState(null); 
  
  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState(null);

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
            const myManagedParents = loadedTeams.filter(team => 
                !team.parentTeamId && (
                    team.createdBy === currentUser.uid || 
                    team.roles?.[currentUser.uid] === 'admin' ||
                    currentRole === 'Master Admin'
                )
            );

            const managedParentIds = myManagedParents.map(t => t.id);
            let extraSubProjects = [];

            if (managedParentIds.length > 0 && currentRole !== 'Master Admin') {
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

            // Merge and Remove Duplicates
            const finalTeams = [...loadedTeams, ...extraSubProjects].filter((team, index, self) => 
                index === self.findIndex((t) => (t.id === team.id))
            );

            // Sort
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

  const handleOpenEditModal = (project) => {
    setProjectToEdit(project);
    setIsEditModalOpen(true);
  };

  const handleUpdateProject = async (projectId, updates) => {
    try {
        const docRef = doc(db, "teams", projectId);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp()
        });
    } catch (err) {
        console.error("Error updating project:", err);
        throw err; // Re-throw to be caught in modal
    }
  };

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
                    <TeamCard 
                        key={parent.id} 
                        team={parent} 
                        subProjects={children} 
                        currentUser={user} 
                        userRole={userRole} 
                        onAddSubProject={handleOpenSubModal} 
                        onDeleteSubProject={handleOpenDeleteModal} 
                        onDeleteTeam={handleOpenDeleteParentModal}
                        onEditTeam={handleOpenEditModal}
                    />
                );
              })
            )}
          </div>
        )}
      </section>

      <CreateTeamModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onTeamCreated={handleRefresh} />
      <CreateSubTeamModal isOpen={isSubProjectModalOpen} onClose={() => setIsSubProjectModalOpen(false)} parentTeamId={targetParent?.id} parentTeamName={targetParent?.teamName} onTeamCreated={handleRefresh} />
      <EditProjectModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} project={projectToEdit} onSave={handleUpdateProject} />
      <NotificationsModal isOpen={isNotificationsModalOpen} onClose={() => setIsNotificationsModalOpen(false)} />
      <ConfirmationModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} onConfirm={handleConfirmDelete} title={deleteTitle} message={deleteMessage} isDeleting={true} />
    </>
  );
};

export default HomePage;