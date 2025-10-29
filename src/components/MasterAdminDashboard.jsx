// MasterAdminDashboard.jsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
  limit as firestoreLimit,
  startAfter,
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import Spinner from './Spinner';
import TeamProjectTable from './TeamProjectTable';

// Modals (kept as your originals)
import InviteMemberModal from './InviteMemberModal';
import AnnounceModal from './AnnounceModal';
import ScheduleMeetingModal from './ScheduleMeetingModal';
// import NotificationsModal from './NotificationsModal'; // Handled by MainLayout
import EditUpdateModal from './EditUpdateModal';
import AnnounceMultiTeamModal from './AnnounceMultiTeamModal';
// REMOVED MasterAdminChatModal import

// --- Icons (kept) ---
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
const UserGroupIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.08-.986-.234-1.224M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.08-.986.234-1.224M12 11c-1.657 0-3-1.343-3-3s1.343-3 3-3 3 1.343 3 3-1.343 3-3 3zM3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);
// REMOVED ChatIcon as it's not used here

// --- Utility: formatDate ---
const formatDate = (value, { dateOnly = false, fallback = '' } = {}) => {
  if (!value) return fallback;
  try {
    let d;
    if (typeof value === 'object' && typeof value.toDate === 'function') { d = value.toDate(); }
    else if (value instanceof Date) { d = value; }
    else if (typeof value === 'string') { const parsed = new Date(value); if (!isNaN(parsed)) d = parsed; else return value; }
    else { return String(value); }
    return dateOnly ? d.toLocaleDateString() : d.toLocaleString();
  } catch (err) { console.error('formatDate error', err, value); return String(value); }
};

// ---------- Constants for pagination / UI ----------
const TEAMS_PAGE_SIZE = 18;
const USERS_PAGE_SIZE = 30;
const DEBOUNCE_MS = 350;

// ---------- AnnouncementsSection (unchanged) ----------
const AnnouncementsSection = ({ teamId, refreshTrigger, isAdmin, onEdit }) => {
  const [updates, setUpdates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnnouncements = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const announcementsRef = collection(db, `teams/${teamId}/announcements`);
      const q = query(announcementsRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      setUpdates(querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error("Error fetching announcements:", err); setError("Failed to load updates."); }
    finally { setIsLoading(false); }
  }, [teamId]);

  useEffect(() => { fetchAnnouncements(); }, [teamId, fetchAnnouncements, refreshTrigger]);

  const handleDelete = async (updateId) => {
    if (!window.confirm("Delete this item?")) return;
    try { await deleteDoc(doc(db, `teams/${teamId}/announcements`, updateId)); setUpdates(prev => prev.filter(u => u.id !== updateId)); }
    catch (err) { console.error("Failed to delete update:", err); setError("Failed to delete."); }
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border h-full">
      <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Updates & Announcements</h3>
      {isLoading && <Spinner />}
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      {!isLoading && updates.length === 0 && ( <p className="text-sm text-gray-500 italic">No updates yet.</p> )}
      {!isLoading && updates.length > 0 && (
        <ul className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
          {updates.map(update => (
            <li key={update.id} className={`text-sm p-3 border-l-4 rounded-r bg-gray-50 ${update.type === 'meeting' ? 'border-blue-500' : 'border-green-500'}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1">
                  {update.type === 'meeting' ? (
                    <>
                      <strong className="font-medium text-blue-700">Meeting:</strong> {update.title} <br />
                      <span className="text-xs text-gray-500">Starts: {formatDate(update.startDateTime) || 'N/A'}</span>
                      {update.endDateTime && <span className="text-xs text-gray-500"> - Ends: {formatDate(update.endDateTime)}</span>}
                      {update.description && <p className="text-xs text-gray-600 mt-1 line-clamp-4">{update.description}</p>}
                      {update.meetingLink && ( <a href={update.meetingLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs mt-1 block">Join Meeting</a> )}
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

// ---------- MembersSection (unchanged) ----------
const MembersSection = ({ membersDetails, teamData, canManageMembers, onChangeRole, onInviteClick }) => {
  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border h-full">
      <div className="flex justify-between items-center mb-3 border-b pb-2">
        <h3 className="text-lg font-semibold text-gray-700">Members</h3>
        {canManageMembers && ( <button onClick={onInviteClick} className="text-xs bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-3 rounded-md shadow-sm transition-colors">+ Invite</button> )}
      </div>
      {membersDetails.length > 0 ? (
        <ul className="list-none space-y-2 max-h-[420px] overflow-y-auto pr-2">
          {membersDetails.map((member) => {
            const uid = member.uid;
            const isCreator = teamData?.createdBy === uid;
            const roleMap = teamData?.roles || {};
            const roleRaw = isCreator ? 'creator' : (roleMap?.[uid] || 'member');
            const roleLabel = roleRaw === 'creator' ? 'Creator' : (roleRaw === 'admin' ? 'Admin' : 'Member');
            return (
              <li key={uid} className="flex items-center justify-between gap-3 bg-gray-50 p-2.5 rounded-md">
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-sm font-semibold text-blue-800">{(member.displayName || member.email || '?')[0].toUpperCase()}</span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-gray-800 truncate" title={member.displayName || member.email}>{member.displayName || member.email || `UID: ${member.uid}`} <span className="text-xs text-gray-500">({roleLabel})</span></span>
                    <div className="text-xs text-gray-500">{member.email}</div>
                  </div>
                </div>
                {canManageMembers ? (
                  <div className="flex items-center gap-2">
                    {isCreator ? ( <div className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded border border-yellow-200">Creator</div> ) : (
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
      ) : ( <p className="text-sm text-gray-500 italic">No members listed yet.</p> )}
    </div>
  );
};

// ---------- UserManagementSection (unchanged) ----------
const UserManagementSection = ({ allUsers, allTeams, loadingUsers, errorUsers, onLoadMoreUsers, hasMoreUsers, onToggleCompact }) => {
  const findTeamsForUser = useCallback((userId) => {
    return allTeams.filter(team => team.members?.includes(userId))
              .map(team => ({ id: team.id, teamName: team.teamName || `Team ${team.id}` }));
  }, [allTeams]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center text-gray-800"><UserGroupIcon /> All Registered Users ({allUsers.length})</h3>
        <div className="flex items-center gap-2">
          <button onClick={onToggleCompact} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">Toggle Compact</button>
        </div>
      </div>

      {loadingUsers && <Spinner />}
      {errorUsers && <p className="text-red-600 text-sm">{errorUsers}</p>}
      {!loadingUsers && !errorUsers && (
        <div className="space-y-4 max-h-[58vh] overflow-y-auto pr-2 custom-scrollbar">
          {allUsers.length === 0 ? (
            <p className="text-gray-500 italic text-center py-4">No users found in the system.</p>
          ) : (
            allUsers.map(user => {
              const userTeams = findTeamsForUser(user.uid);
              const role = user.role || 'Member';
              const isAdmin = role === 'Master Admin';
              return (
                <div key={user.uid} className="bg-gray-50 p-4 rounded-md border border-gray-200 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 flex items-center flex-wrap">
                      <span className="truncate mr-2">{user.displayName || user.email || user.uid}</span>
                      {isAdmin ? ( <span className="whitespace-nowrap ml-auto sm:ml-2 text-xs font-bold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full">MASTER ADMIN</span> ) : ( <span className="whitespace-nowrap ml-auto sm:ml-2 text-xs font-medium bg-gray-200 text-gray-700 px-2.5 py-0.5 rounded-full">{role}</span> )}
                    </p>
                    <p className="text-xs text-gray-600 truncate">{user.email || 'No Email Provided'}</p>
                    <p className="text-xs text-gray-400 font-mono mt-1 truncate">UID: {user.uid}</p>
                  </div>
                  <div className="text-xs text-gray-700 sm:text-right flex-shrink-0 sm:max-w-[40%]">
                    <p className="font-medium mb-1 text-gray-500">Member of:</p>
                    {userTeams.length > 0 ? (
                      <div className="flex flex-wrap gap-1 sm:justify-end">
                        {userTeams.map(team => ( <span key={team.id} className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium" title={team.teamName}>{team.teamName}</span> ))}
                      </div>
                    ) : ( <p className="italic text-gray-500">Not in any teams</p> )}
                  </div>
                </div>
              );
            })
          )}

          {/* Load more users control */}
          {hasMoreUsers && (
            <div className="flex justify-center">
              <button onClick={onLoadMoreUsers} className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50">Load more users</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------- Main Dashboard Component ----------
export default function MasterAdminDashboard() {
  // Lists + pagination state
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [teamsLastDoc, setTeamsLastDoc] = useState(null);
  const [teamsHasMore, setTeamsHasMore] = useState(true);
  const [teamsViewCompact, setTeamsViewCompact] = useState(false);
  const [teamsSearch, setTeamsSearch] = useState('');

  const [allUsers, setAllUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [usersLastDoc, setUsersLastDoc] = useState(null);
  const [usersHasMore, setUsersHasMore] = useState(true);
  const [usersViewCompact, setUsersViewCompact] = useState(false);
  const [usersSearch, setUsersSearch] = useState('');

  // selected team + details
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [activeTab, setActiveTab] = useState('projects');
  const [teamData, setTeamData] = useState(null);
  const [membersDetails, setMembersDetails] = useState([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // announcements refresh key & modals
  const [announcementRefreshKey, setAnnouncementRefreshKey] = useState(0);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isAnnounceModalOpen, setIsAnnounceModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  // const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false); // Handled by MainLayout
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [isMultiAnnounceModalOpen, setIsMultiAnnounceModalOpen] = useState(false);
  // *** REMOVED CHAT MODAL STATE ***

  // debounce refs
  const teamsDebounceRef = useRef(null);
  const usersDebounceRef = useRef(null);

  // helpers
  const refreshAnnouncements = useCallback(() => { setAnnouncementRefreshKey(prev => prev + 1); }, []);

  const openEditModal = (update) => { setEditTarget(update); setIsEditModalOpen(true); };
  const closeEditModal = () => { setEditTarget(null); setIsEditModalOpen(false); };
  const onInviteCompleteRefresh = () => { if (selectedTeam) fetchTeamDetails(selectedTeam.id); };

  // --------- Teams: paginated fetch (cursor-based) ----------
  const fetchTeamsPage = useCallback(async ({ reset = false, pageSize = TEAMS_PAGE_SIZE } = {}) => {
    setTeamsLoading(true);
    setTeamsError('');
    try {
      const teamsCollectionRef = collection(db, 'teams');
      let q;
      if (reset || !teamsLastDoc) {
        q = query(teamsCollectionRef, orderBy('createdAt', 'desc'), firestoreLimit(pageSize));
      } else {
        q = query(teamsCollectionRef, orderBy('createdAt', 'desc'), startAfter(teamsLastDoc), firestoreLimit(pageSize));
      }
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data(), members: d.data().members || [] }));
      if (reset) {
        setTeams(docs);
      } else {
        setTeams(prev => [...prev, ...docs]);
      }
      setTeamsLastDoc(snap.docs[snap.docs.length - 1] || null);
      setTeamsHasMore(snap.docs.length === pageSize);
    } catch (err) {
      console.error('Failed to load teams:', err);
      setTeamsError('Failed to load teams.');
    } finally {
      setTeamsLoading(false);
    }
  }, [teamsLastDoc]);

  // --------- Users: paginated fetch ----------
  const fetchUsersPage = useCallback(async ({ reset = false, pageSize = USERS_PAGE_SIZE } = {}) => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const usersRef = collection(db, 'users');
      let q;
      if (reset || !usersLastDoc) {
        q = query(usersRef, orderBy('email', 'asc'), firestoreLimit(pageSize));
      } else {
        q = query(usersRef, orderBy('email', 'asc'), startAfter(usersLastDoc), firestoreLimit(pageSize));
      }
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      if (reset) setAllUsers(docs); else setAllUsers(prev => [...prev, ...docs]);
      setUsersLastDoc(snap.docs[snap.docs.length - 1] || null);
      setUsersHasMore(snap.docs.length === pageSize);
    } catch (err) {
      console.error('Failed to load users:', err);
      setUsersError('Failed to load user list.');
    } finally {
      setUsersLoading(false);
    }
  }, [usersLastDoc]);

  // --------- Team details & members fetch ----------
  const fetchTeamDetails = useCallback(async (teamId) => {
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
        // fetch members in parallel
        const memberPromises = memberUIDs.map(uid => getDoc(doc(db, "users", uid)));
        const memberDocsSnap = await Promise.all(memberPromises);
        setMembersDetails(memberDocsSnap.map((userDoc, index) => {
          const uid = memberUIDs[index];
          return userDoc.exists() ? { uid, ...userDoc.data() } : { uid, displayName: null, email: 'Profile not found' };
        }));
      } else {
        setMembersDetails([]);
      }
    } catch (err) {
      console.error("Error fetching team details:", err);
      setTeamsError("Failed to load selected team details.");
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  // --------- Role change ----------
  const changeRole = async (memberUid, newRole) => {
    if (!teamData || teamData.createdBy === memberUid) return; // keep creator as-is
    try {
      const teamDocRef = doc(db, 'teams', teamData.id);
      const permsForRole = newRole === 'admin' ? { announcements: true, schedule: true } : { announcements: false, schedule: false };
      await updateDoc(teamDocRef, { [`roles.${memberUid}`]: newRole, [`permissions.${memberUid}`]: permsForRole });
      setTeamData(prev => ({ ...prev, roles: { ...(prev?.roles || {}), [memberUid]: newRole }, permissions: { ...(prev?.permissions || {}), [memberUid]: permsForRole } }));
    } catch (err) { console.error('Failed to change role:', err); alert('Failed to change role.'); }
  };

  // --------- Delete team ----------
  const handleDeleteTeam = async (teamId) => {
    if (!window.confirm('Delete this team?')) return;
    try {
      await deleteDoc(doc(db, 'teams', teamId));
      setTeams(prev => prev.filter(t => t.id !== teamId));
      if (selectedTeam?.id === teamId) setSelectedTeam(null);
    } catch (err) { console.error('Failed to delete team:', err); alert('Failed to delete team.'); }
  };

  // --------- Handlers for selecting and viewing a team ----------
  const handleViewTeam = (team) => { setSelectedTeam(team); setActiveTab('projects'); };
  useEffect(() => {
    if (selectedTeam) fetchTeamDetails(selectedTeam.id);
    else { setTeamData(null); setMembersDetails([]); }
  }, [selectedTeam, fetchTeamDetails]);

  // --------- Initial load ----------
  useEffect(() => {
    // load first page for teams and users
    fetchTeamsPage({ reset: true });
    fetchUsersPage({ reset: true });
  }, []); // eslint-disable-line

  // --------- Search debounce for teams (client-side search on fetched pages) ----------
  const handleTeamsSearchChange = (v) => {
    setTeamsSearch(v);
    if (teamsDebounceRef.current) clearTimeout(teamsDebounceRef.current);
    teamsDebounceRef.current = setTimeout(() => {
      fetchTeamsPage({ reset: true });
    }, DEBOUNCE_MS);
  };

  const handleUsersSearchChange = (v) => {
    setUsersSearch(v);
    if (usersDebounceRef.current) clearTimeout(usersDebounceRef.current);
    usersDebounceRef.current = setTimeout(() => {
      fetchUsersPage({ reset: true });
    }, DEBOUNCE_MS);
  };

  // Apply simple client-side filtering for list render (based on what we fetched)
  const filteredTeams = teamsSearch.trim() === '' ? teams : teams.filter(t => {
    const q = teamsSearch.toLowerCase();
    return (t.teamName || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) || (t.id || '').toLowerCase().includes(q);
  });

  const filteredUsers = usersSearch.trim() === '' ? allUsers : allUsers.filter(u => {
    const q = usersSearch.toLowerCase();
    return (u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.uid || '').toLowerCase().includes(q);
  });

  // Tab classes (kept)
  const tabClass = (tabName) => {
    const base = "inline-flex items-center pb-3 px-1 border-b-2 font-medium text-sm";
    return activeTab === tabName ? `${base} border-blue-500 text-blue-600` : `${base} border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300`;
  };

  // Simple UI controls
  const isInitialLoading = teamsLoading || usersLoading;

  return (
    <>
      <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
        <main className="flex-1 w-full py-6">
          <div className="flex justify-between items-center mb-6 px-4 sm:px-6 lg:px-8">
            <div>
              <h2 className="text-2xl font-semibold text-gray-800">Master Admin Dashboard</h2>
              <p className="text-sm text-gray-500 mt-1">Manage teams, users and announcements</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                aria-label="Search teams"
                value={teamsSearch}
                onChange={(e) => handleTeamsSearchChange(e.target.value)}
                placeholder="Search teams..."
                className="text-sm px-3 py-2 rounded border border-gray-300 bg-white"
              />
              <input
                aria-label="Search users"
                value={usersSearch}
                onChange={(e) => handleUsersSearchChange(e.target.value)}
                placeholder="Search users..."
                className="text-sm px-3 py-2 rounded border border-gray-300 bg-white"
              />
              {/* --- REMOVED "View All Chats" BUTTON --- */}
              <button onClick={() => setIsMultiAnnounceModalOpen(true)} disabled={teams.length === 0} className="inline-flex items-center bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 px-3 rounded-md shadow-sm transition-colors disabled:opacity-50">
                <MegaphoneIcon /> Send Global Announcement
              </button>
            </div>
          </div>

          {isInitialLoading && <div className="px-4 sm:px-6 lg:px-8"><Spinner /></div>}

          {(teamsError || usersError) && (
            <div className="text-center text-red-600 bg-red-100 p-3 rounded-md mx-4 sm:mx-6 lg:mx-8 mb-6">
              {teamsError && <p>{teamsError}</p>}
              {usersError && <p>{usersError}</p>}
            </div>
          )}

          {!isInitialLoading && (
            <>
              {/* 1) Teams list (paginated + compact toggle) */}
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mx-4 sm:mx-6 lg:mx-8 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">All Teams ({filteredTeams.length})</h3>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setTeamsViewCompact(v => !v); }} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">{teamsViewCompact ? 'Grid View' : 'Compact View'}</button>
                    <button onClick={() => fetchTeamsPage({ reset: true })} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">Refresh</button>
                  </div>
                </div>

                {filteredTeams.length === 0 ? (
                  <p className="text-gray-500">No teams found.</p>
                ) : teamsViewCompact ? (
                  // Compact list for many items
                  <div className="max-h-[52vh] overflow-y-auto pr-2 space-y-2">
                    {filteredTeams.map(team => (
                      <div key={team.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-100">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{team.teamName} <span className="text-xs text-gray-500 ml-2">({team.members?.length || 0})</span></div>
                          <div className="text-xs text-gray-400 truncate">{team.description || 'No description'}</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleDeleteTeam(team.id)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">Delete</button>
                          <button onClick={() => handleViewTeam(team)} className={`text-xs px-2 py-1 rounded ${selectedTeam?.id === team.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}>{selectedTeam?.id === team.id ? 'Selected' : 'View'}</button>
                        </div>
                      </div>
                    ))}
                    {teamsHasMore && (
                      <div className="flex justify-center">
                        <button onClick={() => fetchTeamsPage({ reset: false })} className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50">Load more teams</button>
                      </div>
                    )}
                  </div>
                ) : (
                  // Card grid view (better for small numbers)
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredTeams.map(team => (
                      <div key={team.id} className={`bg-white rounded-lg shadow-sm border flex flex-col justify-between transition-shadow hover:shadow-md ${ selectedTeam?.id === team.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200' }`}>
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-gray-900 truncate pr-2">{team.teamName}</span>
                            <span className="flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><UsersIcon /> {team.members?.length || 0}</span>
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-2 min-h-[32px]">{team.description || 'No description'}</p>
                          <p className="text-xs text-gray-400 mt-3 font-mono truncate">ID: {team.id}</p>
                        </div>
                        <div className="flex items-center justify-end gap-2 p-3 bg-gray-50 border-t border-gray-100 rounded-b-lg">
                          <button onClick={() => handleDeleteTeam(team.id)} className="text-xs px-3 py-1.5 rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition-colors">Delete</button>
                          <button onClick={() => handleViewTeam(team)} className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${ selectedTeam?.id === team.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100' }`}>{selectedTeam?.id === team.id ? 'Selected' : 'View'}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2) Users (paginated + compact) */}
              <div className="mx-4 sm:mx-6 lg:mx-8 mb-8">
                <UserManagementSection
                  allUsers={filteredUsers}
                  allTeams={teams}
                  loadingUsers={usersLoading}
                  errorUsers={usersError}
                  onLoadMoreUsers={() => fetchUsersPage({ reset: false })}
                  hasMoreUsers={usersHasMore}
                  onToggleCompact={() => setUsersViewCompact(v => !v)}
                />
              </div>

              {/* 3) Selected Team Details */}
              {selectedTeam && (
                <div className="bg-white rounded-t-lg shadow-md border border-gray-200 mx-4 sm:mx-6 lg:mx-8">
                  <div className="p-6 flex justify-between items-center px-4 sm:px-6 lg:px-8">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-800">Managing Team: <span className="text-blue-600">{selectedTeam.teamName}</span></h3>
                      <p className="text-sm text-gray-500">{selectedTeam.description || 'No description.'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setSelectedTeam(null)} className="text-sm font-medium text-gray-600 hover:text-red-500">&times; Close</button>
                    </div>
                  </div>

                  <div className="px-4 sm:px-6 lg:px-8 pb-4 border-b border-gray-200 flex gap-2">
                    <button onClick={() => setIsAnnounceModalOpen(true)} className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md shadow-sm">Announce to This Team</button>
                    <button onClick={() => setIsScheduleModalOpen(true)} className="bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md shadow-sm">Schedule Meeting</button>
                  </div>

                  <div className="px-4 sm:px-6 lg:px-8 border-b border-gray-200">
                    <nav className="flex space-x-6" aria-label="Tabs">
                      <button onClick={() => setActiveTab('projects')} className={tabClass('projects')}><TableIcon /> Projects</button>
                      <button onClick={() => setActiveTab('members')} className={tabClass('members')}><UsersIcon /> Members</button>
                      <button onClick={() => setActiveTab('updates')} className={tabClass('updates')}><MegaphoneIcon /> Updates</button>
                    </nav>
                  </div>

                  <div className="min-h-[360px] p-4">
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
            </>
          )}
        </main>
      </div>

      {/* --- Modals --- */}
      {selectedTeam && (
        <>
          <InviteMemberModal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} teamId={selectedTeam.id} onInvited={onInviteCompleteRefresh} />
          <AnnounceModal isOpen={isAnnounceModalOpen} onClose={() => setIsAnnounceModalOpen(false)} teamId={selectedTeam.id} onAnnouncementPosted={refreshAnnouncements} />
          <ScheduleMeetingModal isOpen={isScheduleModalOpen} onClose={() => setIsScheduleModalOpen(false)} teamId={selectedTeam.id} onMeetingScheduled={refreshAnnouncements} />
          <EditUpdateModal isOpen={isEditModalOpen} onClose={closeEditModal} teamId={selectedTeam.id} updateId={editTarget?.id} updateType={editTarget?.type} initialData={editTarget} onSaved={refreshAnnouncements} />
        </>
      )}
      {/* <NotificationsModal isOpen={isNotificationsModalOpen} onClose={() => setIsNotificationsModalOpen(false)} /> */}
      <AnnounceMultiTeamModal isOpen={isMultiAnnounceModalOpen} onClose={() => setIsMultiAnnounceModalOpen(false)} allTeams={teams} onAnnouncementSent={() => { if (selectedTeam) refreshAnnouncements(); }} />
      
      {/* --- REMOVED MasterAdminChatModal RENDER --- */}
    </>
  );
}