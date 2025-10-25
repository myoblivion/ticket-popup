import React, { useEffect, useState, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import Header from './Header';
import Spinner from './Spinner';
import TeamProjectTable from './TeamProjectTable'; // Import the project table

// --- Modals ---
import InviteMemberModal from './InviteMemberModal';
import AnnounceModal from './AnnounceModal';
import ScheduleMeetingModal from './ScheduleMeetingModal';
import NotificationsModal from './NotificationsModal';
import EditUpdateModal from './EditUpdateModal';
import AnnounceMultiTeamModal from './AnnounceMultiTeamModal'; // *** NEW IMPORT ***

// --- Icons ---
const UsersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);
const TableIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);
const MegaphoneIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3.434C19.44 2.13 20 2.63 20 3.434V6" />
  </svg>
);


// --- Utility: formatDate ---
const formatDate = (value, { dateOnly = false, fallback = '' } = {}) => {
  if (!value) return fallback;
  try {
    let d;
    if (typeof value === 'object' && typeof value.toDate === 'function') {
      d = value.toDate();
    } else if (value instanceof Date) {
      d = value;
    } else if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!isNaN(parsed)) d = parsed;
      else return value;
    } else {
      return String(value);
    }
    return dateOnly ? d.toLocaleDateString() : d.toLocaleString();
  } catch (err) {
    console.error('formatDate error', err, value);
    return String(value);
  }
};


// --- AnnouncementsSection ---
const AnnouncementsSection = ({ teamId, refreshTrigger, isAdmin, onEdit }) => {
  const [updates, setUpdates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnnouncements = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const announcementsRef = collection(db, `teams/${teamId}/announcements`);
      const q = query(announcementsRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedUpdates = querySnapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setUpdates(fetchedUpdates);
    } catch (err) {
      console.error("Error fetching announcements:", err);
      setError("Failed to load announcements and meetings.");
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchAnnouncements();
  }, [teamId, fetchAnnouncements, refreshTrigger]);

  const handleDelete = async (updateId) => {
    const ok = window.confirm("Delete this announcement/meeting? This cannot be undone.");
    if (!ok) return;
    try {
      const docRef = doc(db, `teams/${teamId}/announcements`, updateId);
      await deleteDoc(docRef);
      setUpdates(prev => prev.filter(u => u.id !== updateId));
    } catch (err) {
      console.error("Failed to delete update:", err);
      setError("Failed to delete item. See console.");
    }
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border h-full">
      <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Updates & Announcements</h3>
      {isLoading && <Spinner />}
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      {!isLoading && updates.length === 0 && (
        <p className="text-sm text-gray-500 italic">No announcements or meetings yet.</p>
      )}
      {!isLoading && updates.length > 0 && (
        <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {updates.map(update => (
            <li key={update.id} className={`text-sm p-3 border-l-4 rounded-r bg-gray-50 ${update.type === 'meeting' ? 'border-blue-500' : 'border-green-500'}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1">
                 {update.type === 'meeting' ? (
                    <>
                      <strong className="font-medium text-blue-700">Meeting:</strong> {update.title} <br />
                      <span className="text-xs text-gray-500">Starts: {formatDate(update.startDateTime) || 'N/A'}</span>
                      {update.endDateTime && <span className="text-xs text-gray-500"> - Ends: {formatDate(update.endDateTime)}</span>}
                      {update.description && <p className="text-xs text-gray-600 mt-1">{update.description}</p>}
                      {update.meetingLink && (
                        <a href={update.meetingLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs mt-1 block">
                          Join Meeting
                        </a>
                      )}
                      <p className="text-xs text-gray-500 mt-2">Scheduled by: {update.creatorDisplayName} at {formatDate(update.createdAt, { dateOnly: true })}</p>
                    </>
                  ) : (
                    <>
                      <strong className="font-medium text-green-700">Announcement:</strong> {update.text} <br />
                      <p className="text-xs text-gray-500">By: {update.creatorDisplayName} at {formatDate(update.createdAt, { dateOnly: true })}</p>
                    </>
                  )}
                </div>
                {isAdmin && (
                   <div className="flex-shrink-0 flex items-start gap-1 ml-3">
                     <button onClick={() => onEdit(update)} className="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-2 py-1 rounded">Edit</button>
                     <button onClick={() => handleDelete(update.id)} className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded">Remove</button>
                   </div>
                 )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};


// --- MembersSection ---
const MembersSection = ({ membersDetails, teamData, canManageMembers, onChangeRole, onInviteClick }) => {
  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border h-full">
      <div className="flex justify-between items-center mb-3 border-b pb-2">
        <h3 className="text-lg font-semibold text-gray-700">Members</h3>
        {canManageMembers && (
          <button onClick={onInviteClick} className="text-xs bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-3 rounded-md shadow-sm transition-colors">
            + Invite
          </button>
        )}
      </div>
      {membersDetails.length > 0 ? (
        <ul className="list-none space-y-2 max-h-96 overflow-y-auto pr-2">
          {membersDetails.map((member) => {
            const uid = member.uid;
            const isCreator = teamData?.createdBy === uid;
            const roleMap = teamData?.roles || {};
            const roleRaw = isCreator ? 'creator' : (roleMap?.[uid] || 'member');
            const roleLabel = roleRaw === 'creator' ? 'Creator' : (roleRaw === 'admin' ? 'Admin' : 'Member');
            return (
              <li key={uid} className="flex items-center justify-between gap-3 bg-gray-50 p-2.5 rounded-md">
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-sm font-semibold text-blue-800">
                    {(member.displayName || member.email || '?')[0].toUpperCase()}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-gray-800 truncate" title={member.displayName || member.email}>
                      {member.displayName || member.email || `UID: ${member.uid}`} <span className="text-xs text-gray-500">({roleLabel})</span>
                    </span>
                    <div className="text-xs text-gray-500">
                      {member.email}
                    </div>
                  </div>
                </div>
                {canManageMembers ? (
                  <div className="flex items-center gap-2">
                    {isCreator ? (
                      <div className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded border border-yellow-200">Creator</div>
                    ) : (
                      <select value={roleRaw} onChange={(e) => onChangeRole(uid, e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1 bg-white hover:border-gray-400" title="Change role">
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 italic">No members listed yet.</p>
      )}
    </div>
  );
};


// --- Main Dashboard Component ---
function MasterAdminDashboard() {
  const [teams, setTeams] = useState([]); // List of all teams {id, teamName, ...}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedTeam, setSelectedTeam] = useState(null); // Currently selected team object
  const [activeTab, setActiveTab] = useState('projects');

  // State for the *details* of the selected team
  const [teamData, setTeamData] = useState(null); // Full doc data for selectedTeam
  const [membersDetails, setMembersDetails] = useState([]); // Resolved user profiles for selectedTeam
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [announcementRefreshKey, setAnnouncementRefreshKey] = useState(0); // Trigger for announcement refresh

  // Modal states
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isAnnounceModalOpen, setIsAnnounceModalOpen] = useState(false); // For single team
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [isMultiAnnounceModalOpen, setIsMultiAnnounceModalOpen] = useState(false); // *** NEW STATE ***

  // --- Callbacks and Data Fetching Logic ---
  const refreshAnnouncements = useCallback(() => {
     setAnnouncementRefreshKey(prevKey => prevKey + 1);
   }, []);

  const changeRole = async (memberUid, newRole) => {
    if (!teamData) return;
    if (teamData.createdBy === memberUid) {
      alert("Cannot change creator's role.");
      return;
    }
    try {
      const teamDocRef = doc(db, 'teams', teamData.id);
      const permsForRole = newRole === 'admin' ? { announcements: true, schedule: true } : { announcements: false, schedule: false };
      await updateDoc(teamDocRef, {
        [`roles.${memberUid}`]: newRole,
        [`permissions.${memberUid}`]: permsForRole
      });
      // Optimistic update of local state
      setTeamData(prev => ({
        ...prev,
        roles: { ...(prev?.roles || {}), [memberUid]: newRole },
        permissions: { ...(prev?.permissions || {}), [memberUid]: permsForRole }
      }));
    } catch (err) {
      console.error('Failed to change role:', err);
      alert('Failed to change role. See console.');
    }
  };

  const openEditModal = (update) => {
    setEditTarget(update);
    setIsEditModalOpen(true);
  };
  const closeEditModal = () => {
    setEditTarget(null);
    setIsEditModalOpen(false);
  };
   const onInviteCompleteRefresh = () => {
     if (selectedTeam) {
       fetchTeamDetails(selectedTeam.id); // Re-fetch details to show new member
     }
   };

  const fetchAllTeams = async () => {
    setLoading(true);
    setError('');
    try {
      const teamsCollectionRef = collection(db, 'teams');
      const q = query(teamsCollectionRef, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTeams(arr);
    } catch (err) {
      console.error('Failed to load teams:', err);
      setError('Failed to load teams.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamDetails = async (teamId) => {
    if (!teamId) return;
    setIsLoadingDetails(true);
    setTeamData(null);
    setMembersDetails([]);
    try {
      const teamDocRef = doc(db, "teams", teamId);
      const teamDocSnap = await getDoc(teamDocRef);
      if (!teamDocSnap.exists()) throw new Error("Team not found.");

      const fetchedTeamData = { id: teamDocSnap.id, ...teamDocSnap.data() };
      setTeamData(fetchedTeamData);

      const memberUIDs = fetchedTeamData.members || [];
      if (memberUIDs.length > 0) {
        const memberPromises = memberUIDs.map(uid => getDoc(doc(db, "users", uid)));
        const memberDocsSnap = await Promise.all(memberPromises);
        const memberInfo = memberDocsSnap.map((userDoc, index) => {
          const uid = memberUIDs[index];
          if (userDoc.exists()) {
            const userData = userDoc.data();
            return { uid, displayName: userData.displayName || null, email: userData.email || 'No email' };
          } else {
            return { uid, displayName: null, email: 'Profile not found' };
          }
        });
        setMembersDetails(memberInfo);
      } else {
        setMembersDetails([]);
      }
    } catch (err) {
      console.error("Error fetching team details:", err);
      setError("Failed to load team details.");
    } finally {
      setIsLoadingDetails(false);
    }
  };


  useEffect(() => {
    fetchAllTeams();
  }, []);

  useEffect(() => {
    if (selectedTeam) {
      fetchTeamDetails(selectedTeam.id);
    } else {
      setTeamData(null);
      setMembersDetails([]);
    }
  }, [selectedTeam]);

  const handleViewTeam = (team) => {
    setSelectedTeam(team);
    setActiveTab('projects');
  };

  const handleDeleteTeam = async (teamId) => {
     const ok = window.confirm('Delete this team? This cannot be undone.');
     if (!ok) return;
     try {
       await deleteDoc(doc(db, 'teams', teamId));
       setTeams(prev => prev.filter(t => t.id !== teamId));
       if (selectedTeam && selectedTeam.id === teamId) {
         setSelectedTeam(null); // Clear selection if deleted
       }
     } catch (err) {
       console.error('Failed to delete team:', err);
       alert('Failed to delete team. Check console.');
     }
   };

  const tabClass = (tabName) => {
    const base = "inline-flex items-center pb-3 px-1 border-b-2 font-medium text-sm";
    if (activeTab === tabName) {
      return `${base} border-blue-500 text-blue-600`;
    }
    return `${base} border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300`;
  };

  return (
    <>
      <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
        <Header onNotificationClick={() => setIsNotificationsModalOpen(true)} />

        <main className="flex-1 w-full py-6">

          <div className="flex justify-between items-center mb-6 px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-semibold text-gray-800">
              Master Admin Dashboard
            </h2>
            {/* *** Global Announcement Button *** */}
            <button
              onClick={() => setIsMultiAnnounceModalOpen(true)}
              disabled={loading || teams.length === 0}
              className="inline-flex items-center bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 px-4 rounded-md shadow-sm transition-colors disabled:opacity-50"
            >
              <MegaphoneIcon /> Send Global Announcement
            </button>
          </div>

          {loading && <Spinner />}
          {error && (
             <div className="text-center text-red-600 bg-red-100 p-3 rounded-md mx-4 sm:mx-6 lg:mx-8">
               {error}
             </div>
           )}

          {/* --- PART 1: Grid of All Teams --- */}
          {!loading && !error && (
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mx-4 sm:mx-6 lg:mx-8">
              <h3 className="text-lg font-semibold mb-4">All Teams ({teams.length})</h3>
              {teams.length === 0 ? (
                <p className="text-gray-600">No teams found in the system.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {teams.map(team => (
                    <div
                      key={team.id}
                      className={`bg-white rounded-lg shadow-sm border flex flex-col justify-between transition-shadow hover:shadow-md ${
                        selectedTeam?.id === team.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                      }`}
                    >
                      {/* Card Body */}
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-gray-900 truncate pr-2">{team.teamName}</span>
                          <span className="flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            <UsersIcon /> {team.members?.length || 0}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2 min-h-[32px]">{team.description || 'No description'}</p>
                        <p className="text-xs text-gray-400 mt-3 font-mono truncate">ID: {team.id}</p>
                      </div>
                      {/* Card Footer (buttons) */}
                      <div className="flex items-center justify-end gap-2 p-3 bg-gray-50 border-t border-gray-100 rounded-b-lg">
                        <button onClick={() => handleDeleteTeam(team.id)} className="text-xs px-3 py-1.5 rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition-colors">Delete</button>
                        <button
                          onClick={() => handleViewTeam(team)}
                          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                            selectedTeam?.id === team.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                          }`}
                        >
                          {selectedTeam?.id === team.id ? 'Selected' : 'View'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* --- End of Part 1 --- */}


          {/* --- PART 2: Selected Team Details --- */}
          {selectedTeam && (
            <div className="mt-8 bg-white rounded-t-lg shadow-md border border-gray-200">
              {/* Header */}
              <div className="p-6 flex justify-between items-center px-4 sm:px-6 lg:px-8">
                <div>
                  <h3 className="text-xl font-semibold text-gray-800">
                    Managing Team: <span className="text-blue-600">{selectedTeam.teamName}</span>
                  </h3>
                  <p className="text-sm text-gray-500">{selectedTeam.description || 'No description.'}</p>
                </div>
                <button
                  onClick={() => setSelectedTeam(null)}
                  className="text-sm font-medium text-gray-600 hover:text-red-500"
                >
                  &times; Close
                </button>
              </div>

              {/* Admin Actions (for selected team) */}
              <div className="px-4 sm:px-6 lg:px-8 pb-4 border-b border-gray-200 flex gap-2">
                <button
                  onClick={() => setIsAnnounceModalOpen(true)} // Single team announce
                  className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md shadow-sm"
                >
                  Announce to This Team
                </button>
                <button
                  onClick={() => setIsScheduleModalOpen(true)}
                  className="bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md shadow-sm"
                >
                  Schedule Meeting
                </button>
              </div>

              {/* Tabs */}
              <div className="px-4 sm:px-6 lg:px-8 border-b border-gray-200">
                <nav className="flex space-x-6" aria-label="Tabs">
                  <button onClick={() => setActiveTab('projects')} className={tabClass('projects')}>
                    <TableIcon /> Projects
                  </button>
                  <button onClick={() => setActiveTab('members')} className={tabClass('members')}>
                    <UsersIcon /> Members
                  </button>
                  <button onClick={() => setActiveTab('updates')} className={tabClass('updates')}>
                    <MegaphoneIcon /> Updates
                  </button>
                </nav>
              </div>

              {/* Tab Content */}
              <div className="min-h-[400px]">
                {isLoadingDetails && ( <div className="p-6 flex justify-center"><Spinner /></div> )}
                {!isLoadingDetails && teamData && (
                  <>
                    {activeTab === 'projects' && ( <TeamProjectTable teamId={selectedTeam.id} /> )}
                    {activeTab === 'members' && ( <div className="p-4 sm:p-6 lg:p-8"><MembersSection membersDetails={membersDetails} teamData={teamData} canManageMembers={true} onChangeRole={changeRole} onInviteClick={() => setIsInviteModalOpen(true)} /></div> )}
                    {activeTab === 'updates' && ( <div className="p-4 sm:p-6 lg:p-8"><AnnouncementsSection teamId={selectedTeam.id} refreshTrigger={announcementRefreshKey} isAdmin={true} onEdit={openEditModal}/></div> )}
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* --- Modals --- */}

      {/* Modals for Selected Team */}
      {selectedTeam && (
        <>
          <InviteMemberModal
            isOpen={isInviteModalOpen}
            onClose={() => setIsInviteModalOpen(false)}
            teamId={selectedTeam.id}
            onInvited={onInviteCompleteRefresh}
          />
          <AnnounceModal
             isOpen={isAnnounceModalOpen}
             onClose={() => setIsAnnounceModalOpen(false)}
             teamId={selectedTeam.id}
             onAnnouncementPosted={refreshAnnouncements}
           />
          <ScheduleMeetingModal
             isOpen={isScheduleModalOpen}
             onClose={() => setIsScheduleModalOpen(false)}
             teamId={selectedTeam.id}
             onMeetingScheduled={refreshAnnouncements}
           />
          <EditUpdateModal
            isOpen={isEditModalOpen}
            onClose={closeEditModal}
            teamId={selectedTeam.id}
            updateId={editTarget?.id}
            updateType={editTarget?.type}
            initialData={editTarget}
            onSaved={refreshAnnouncements}
          />
        </>
      )}

      {/* Global Modals */}
      <NotificationsModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
       />
      {/* *** Multi-Team Announce Modal Render *** */}
      <AnnounceMultiTeamModal
        isOpen={isMultiAnnounceModalOpen}
        onClose={() => setIsMultiAnnounceModalOpen(false)}
        allTeams={teams} // Pass the list of all teams
        onAnnouncementSent={() => {
            console.log("Multi-team announcement sent.");
            // Optionally refresh announcement list if viewing a specific team
            if (selectedTeam) {
              refreshAnnouncements();
            }
        }}
      />
    </>
  );
}

export default MasterAdminDashboard;