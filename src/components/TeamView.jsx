import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  doc,
  getDoc,
  collection,
  query,
  getDocs,
  orderBy,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  setDoc // Import setDoc
} from "firebase/firestore";
import { db, auth } from '../firebaseConfig';
import { onAuthStateChanged } from "firebase/auth";
import InviteMemberModal from './InviteMemberModal';
import AnnounceModal from './AnnounceModal';
import ScheduleMeetingModal from './ScheduleMeetingModal';
import TeamProjectTable from './TeamProjectTable';
// import NotificationsModal from './NotificationsModal'; // Handled by MainLayout now
import EditUpdateModal from './EditUpdateModal';
import EndorsementModal from './EndorsementModal'; // *** IMPORT THE NEW MODAL ***

// --- Spinner component ---
const Spinner = () => (
  <div className="flex justify-center items-center py-10">
    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
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
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
  const [errorAnnouncements, setErrorAnnouncements] = useState(null);

  const fetchAnnouncements = useCallback(async () => {
    setIsLoadingAnnouncements(true);
    setErrorAnnouncements(null);
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
      setErrorAnnouncements("Failed to load announcements and meetings.");
    } finally {
      setIsLoadingAnnouncements(false);
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
      setErrorAnnouncements("Failed to delete item. See console.");
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow border h-full">
      <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Updates & Announcements</h3>
      {isLoadingAnnouncements && <Spinner />}
      {errorAnnouncements && <p className="text-red-500 text-sm mt-2">{errorAnnouncements}</p>}
      {!isLoadingAnnouncements && updates.length === 0 && (
        <p className="text-sm text-gray-500 italic">No announcements or meetings yet.</p>
      )}
      {!isLoadingAnnouncements && updates.length > 0 && (
        <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {updates.map(update => (
            <li key={update.id} className={`text-sm p-2 border-l-4 rounded-r bg-gray-50 ${update.type === 'meeting' ? 'border-blue-500' : 'border-green-500'}`}>
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
const MembersSection = ({ membersDetails, teamData, currentUserUid, canManageMembers, onChangeRole, onInviteClick }) => {
  return (
    <div className="bg-white p-4 rounded-lg shadow border h-full">
      <div className="flex justify-between items-center mb-3 border-b pb-2">
        <h3 className="text-lg font-semibold text-gray-700">Members</h3>
        {canManageMembers && (
          <button
            onClick={onInviteClick}
            className="text-xs bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-3 rounded-md shadow-sm transition-colors"
          >
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
              <li key={uid} className="flex items-center justify-between gap-3 bg-gray-50 p-2 rounded">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="flex-shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full bg-blue-100 text-sm font-semibold text-blue-800">
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
                      <div className="text-xs px-2 py-1 bg-yellow-50 rounded border text-yellow-800">Creator</div>
                    ) : (
                      <select
                        value={roleRaw}
                        onChange={(e) => onChangeRole(uid, e.target.value)}
                        className="text-xs border rounded px-2 py-1"
                        title="Change role"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    )}
                  </div>
                ) : (
                    <div className="flex items-center gap-2">
                    </div>
                )}
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


// --- TeamView Component ---
const TeamView = () => {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [teamData, setTeamData] = useState(null);
  const [membersDetails, setMembersDetails] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [announcementRefreshKey, setAnnouncementRefreshKey] = useState(0);

  // Modal States
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isAnnounceModalOpen, setIsAnnounceModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  // const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false); // Handled by Layout
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  // *** NEW STATE FOR ENDORSEMENT MODAL ***
  const [isEndorsementModalOpen, setIsEndorsementModalOpen] = useState(false);


  // Role Checks
  const isTeamCreator = teamData?.createdBy === currentUser?.uid;
  const currentUserRole = teamData?.roles?.[currentUser?.uid] || 'member';
  const isAdmin = currentUserRole === 'admin' || isTeamCreator;

  // Callbacks & Data Fetching
  const refreshAnnouncements = useCallback(() => {
     setAnnouncementRefreshKey(prevKey => prevKey + 1);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      // Re-evaluate authorization or redirect if user logs out while viewing
      if (!user && teamId) {
          navigate('/login', { replace: true });
      }
    });
    return unsubscribe;
  }, [navigate, teamId]); // Added teamId dependency


  useEffect(() => {
    const fetchTeamAndMembers = async () => {
      if (!teamId) { setError("No team ID provided."); setIsLoading(false); return; }
      if (!currentUser) { console.log("User not available yet, waiting..."); return; } // Wait for user

      setIsLoading(true); setError(null); setTeamData(null); setMembersDetails([]); setIsAuthorized(false);

      try {
        const teamDocRef = doc(db, "teams", teamId);
        const teamDocSnap = await getDoc(teamDocRef);

        if (!teamDocSnap.exists()) { setError("Team not found."); setIsLoading(false); return; }

        const fetchedTeamData = teamDocSnap.data();

        // Check if current user is a member
        const memberUIDs = fetchedTeamData.members || [];
        const isMember = memberUIDs.some(member =>
             (typeof member === 'object' && member.uid === currentUser.uid) ||
             (typeof member === 'string' && member === currentUser.uid)
        );

        if (!isMember) {
            console.warn("Access Denied: User not a member.");
            // Consider showing an "Access Denied" message instead of redirecting immediately
            // setError("You are not authorized to view this team.");
            navigate('/home', { replace: true }); // Or redirect as before
            setIsLoading(false);
            return;
        }

        setIsAuthorized(true);
        setTeamData({ id: teamDocSnap.id, ...fetchedTeamData });

        // Fetch details only for actual members listed
        const actualMemberUIDs = memberUIDs.map(m => typeof m === 'object' ? m.uid : m);
        if (actualMemberUIDs.length > 0) {
          const memberPromises = actualMemberUIDs.map(uid => getDoc(doc(db, "users", uid)));
          const memberDocsSnap = await Promise.all(memberPromises);
          const memberInfo = memberDocsSnap.map((userDoc, index) => {
            const uid = actualMemberUIDs[index];
            return userDoc.exists()
                 ? { uid: uid, ...userDoc.data() }
                 : { uid: uid, displayName: null, email: 'Profile not found' }; // Handle missing profiles
          });
          setMembersDetails(memberInfo);
        } else {
          setMembersDetails([]);
        }

      } catch (err) {
        console.error("Error fetching team/members:", err);
        setError("Failed to load team data. Please check permissions or network.");
      } finally {
        setIsLoading(false);
      }
    };

     fetchTeamAndMembers(); // Fetch immediately if teamId and currentUser are available

  }, [teamId, currentUser, navigate]); // Rerun when teamId or currentUser changes

  // Function to change member role
    const changeRole = async (memberUid, newRole) => {
       if (!teamData || !currentUser || !isAdmin || teamData.createdBy === memberUid) {
           console.warn("Role change condition not met.");
           return; // Don't allow changing creator's role or if not admin
       }
       if (!['admin', 'member'].includes(newRole)) {
           console.error("Invalid role specified:", newRole);
           return;
       }

       const teamDocRef = doc(db, "teams", teamId);
       const rolesUpdate = { ...teamData.roles }; // Copy existing roles
       rolesUpdate[memberUid] = newRole; // Set the new role

       try {
           await updateDoc(teamDocRef, { roles: rolesUpdate });
           console.log(`Role for ${memberUid} updated to ${newRole}`);
           // Optimistically update local state or rely on useEffect refresh
           setTeamData(prev => ({ ...prev, roles: rolesUpdate }));
       } catch (err) {
           console.error("Error updating role:", err);
           setError("Failed to update member role.");
       }
    };


  // Refresh member list after invite (could also just refetch everything)
  const onInviteCompleteRefresh = () => {
     // Trigger a refetch by changing the dependency key (or implement more granular update)
     console.log("Invite complete, potentially refreshing member list...");
     // You might want to refetch just the members or the whole team data
     // For simplicity, changing announcementRefreshKey also refetches team data in the current setup
     setAnnouncementRefreshKey(k => k + 1);
  };

  // Open Edit Modal for Announcements/Meetings
  const openEditModal = (update) => {
    setEditTarget(update);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditTarget(null);
    setIsEditModalOpen(false);
  };

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 py-8"> {/* Added py-8 */}

        {isLoading && <Spinner />}
        {error && <div className="text-center text-red-600 bg-red-100 p-4 rounded-md shadow">{error}</div>}

        {!isLoading && !error && teamData && isAuthorized && (
          <>
            {/* Back Link & Admin Buttons */}
            <div className="mb-6 flex flex-wrap justify-between items-center gap-y-2"> {/* Added flex-wrap */}
              <Link to="/home" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 hover:underline">
                &larr; Back to Teams
              </Link>
              {/* --- ADDED ENDORSEMENT BUTTON --- */}
              <div className="flex gap-2 flex-wrap"> {/* Added flex-wrap */}
                 <button
                    onClick={() => setIsEndorsementModalOpen(true)}
                    className="bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md shadow-sm transition-colors"
                 >
                     View Endorsements
                 </button>
                 {isAdmin && (
                     <>
                         <button
                             onClick={() => setIsAnnounceModalOpen(true)}
                             className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md shadow-sm transition-colors"
                         >
                             Announce
                         </button>
                         <button
                             onClick={() => setIsScheduleModalOpen(true)}
                             className="bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md shadow-sm transition-colors"
                         >
                             Schedule Meeting
                         </button>
                     </>
                 )}
              </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                  <h1 className="text-3xl font-bold text-gray-800 mb-2">{teamData.teamName}</h1>
                  <p className="text-base text-gray-600">{teamData.description || 'No description provided.'}</p>
                  <p className="text-xs text-gray-500 mt-3">Created: {formatDate(teamData.createdAt, { dateOnly: true }) || 'N/A'}</p>
                </div>
                {/* WRAP ANNOUNCEMENTS WITH ADDITIONAL BOTTOM MARGIN TO INCREASE SPACING */}
                <div className="mb-8">
                  <AnnouncementsSection
                    teamId={teamId}
                    refreshTrigger={announcementRefreshKey}
                    isAdmin={isAdmin}
                    onEdit={openEditModal}
                  />
                </div>
              </div>

              {/* Right Column */}
              <div className="lg:col-span-1">
                <MembersSection
                  membersDetails={membersDetails}
                  teamData={teamData}
                  currentUserUid={currentUser?.uid}
                  canManageMembers={isAdmin}
                  onChangeRole={changeRole}
                  onInviteClick={() => setIsInviteModalOpen(true)}
                />
              </div>

              {/* Bottom Row - Project Table */}
              {/* INCREASED TOP MARGIN TO ADD MORE SPACING BETWEEN ANNOUNCEMENTS/UPDATES AND THE PROJECT TASKS */}
              <div className="lg:col-span-3 mt-12">
                <TeamProjectTable teamId={teamId} />
              </div>
            </div>
          </>
        )}
      </div> {/* End of padding container */}


      {/* Render Modals (only if authorized) */}
      {isAuthorized && teamId && (
        <>
          <InviteMemberModal
            isOpen={isInviteModalOpen}
            onClose={() => setIsInviteModalOpen(false)}
            teamId={teamId}
            onInvited={onInviteCompleteRefresh}
          />
          <AnnounceModal
            isOpen={isAnnounceModalOpen}
            onClose={() => setIsAnnounceModalOpen(false)}
            teamId={teamId}
            onAnnouncementPosted={refreshAnnouncements}
          />
          <ScheduleMeetingModal
            isOpen={isScheduleModalOpen}
            onClose={() => setIsScheduleModalOpen(false)}
            teamId={teamId}
            onMeetingScheduled={refreshAnnouncements}
          />
           {/* --- RENDER ENDORSEMENT MODAL --- */}
           <EndorsementModal
              isOpen={isEndorsementModalOpen}
              onClose={() => setIsEndorsementModalOpen(false)}
              teamId={teamId}
           />
          {/* NotificationsModal is handled by MainLayout */}
          {/* <NotificationsModal isOpen={isNotificationsModalOpen} onClose={() => setIsNotificationsModalOpen(false)} /> */}

          {isEditModalOpen && editTarget && (
            <EditUpdateModal
              isOpen={isEditModalOpen}
              onClose={closeEditModal}
              teamId={teamId}
              updateId={editTarget.id}
              updateType={editTarget.type}
              initialData={editTarget}
              onSaved={refreshAnnouncements}
            />
          )}
        </>
      )}
    </>
  );
};

export default TeamView;
