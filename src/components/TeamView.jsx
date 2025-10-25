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
  serverTimestamp
} from "firebase/firestore";
import { db, auth } from '../firebaseConfig';
import { onAuthStateChanged } from "firebase/auth";
import Header from './Header';
import InviteMemberModal from './InviteMemberModal';
import AnnounceModal from './AnnounceModal';
import ScheduleMeetingModal from './ScheduleMeetingModal';
import TeamProjectTable from './TeamProjectTable';
import NotificationsModal from './NotificationsModal';

// Spinner component
const Spinner = () => (
  <div className="flex justify-center items-center py-10">
    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

// Utility to format Firestore Timestamp / Date / ISO-string
const formatDate = (value, { dateOnly = false, fallback = '' } = {}) => {
  if (!value) return fallback;
  try {
    let d;
    // Firestore Timestamp has toDate()
    if (typeof value === 'object' && typeof value.toDate === 'function') {
      d = value.toDate();
    } else if (value instanceof Date) {
      d = value;
    } else if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!isNaN(parsed)) d = parsed;
      else return value;
    } else {
      // unknown shape
      return String(value);
    }
    return dateOnly ? d.toLocaleDateString() : d.toLocaleString();
  } catch (err) {
    console.error('formatDate error', err, value);
    return String(value);
  }
};

// --- AnnouncementsSection: displays announcements/meetings and shows edit/delete for admins/creator
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

  // Deletion handler (we prompt and then delete)
  const handleDelete = async (updateId) => {
    const ok = window.confirm("Delete this announcement/meeting? This cannot be undone.");
    if (!ok) return;
    try {
      const docRef = doc(db, `teams/${teamId}/announcements`, updateId);
      await deleteDoc(docRef);
      // local refresh
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

                {/* Edit/Delete controls for admins/creator */}
                {isAdmin && (
                  <div className="flex-shrink-0 flex items-start gap-1 ml-3">
                    <button
                      onClick={() => onEdit(update)}
                      className="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-2 py-1 rounded"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(update.id)}
                      className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded"
                    >
                      Remove
                    </button>
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

// MembersSection
// only two editable roles for non-creator rows: 'admin' or 'member'
const MembersSection = ({ membersDetails, teamData, currentUserUid, canManageMembers, onChangeRole, onInviteClick }) => {
  return (
    <div className="bg-white p-4 rounded-lg shadow border h-full">
      <div className="flex justify-between items-center mb-3 border-b pb-2">
        <h3 className="text-lg font-semibold text-gray-700">Members</h3>

        {/* Invite button shown to managers (creator or admin) */}
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

                {/* management controls (only for creator/admin of current team) */}
                {canManageMembers ? (
                  <div className="flex items-center gap-2">
                    {/* Role selector - disable changing creator's role */}
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

                    {/* show badges for admin (admins have both permissions by rule) */}
                    {roleRaw === 'admin' && (
                      <>
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Ann</span>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Sch</span>
                      </>
                    )}
                  </div>
                ) : (
                  // show permission badges for regular users (based on role)
                  <div className="flex items-center gap-2">
                    {roleRaw === 'admin' && <><span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Ann</span><span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Sch</span></>}
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
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);

  // EDIT modal for announcements/meetings
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // { id, type, data }

  // Determine if the current user created the team
  const isTeamCreator = teamData?.createdBy === currentUser?.uid;
  // Determine if current user is admin as per roles map
  const currentUserRole = teamData?.roles?.[currentUser?.uid] || 'member';
  const isAdmin = currentUserRole === 'admin' || isTeamCreator;

  // Callback to refresh announcements/meetings
  const refreshAnnouncements = useCallback(() => {
    setAnnouncementRefreshKey(prevKey => prevKey + 1);
  }, []);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return unsubscribe;
  }, []);

  // Fetch team & members and check auth/authorization
  useEffect(() => {
    const fetchTeamAndMembers = async () => {
      if (!teamId) {
        setError("No team ID provided.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setTeamData(null);
      setMembersDetails([]);
      setIsAuthorized(false);

      try {
        const teamDocRef = doc(db, "teams", teamId);
        const teamDocSnap = await getDoc(teamDocRef);

        if (!teamDocSnap.exists()) {
          setError("Team not found.");
          setIsLoading(false);
          return;
        }

        const fetchedTeamData = teamDocSnap.data();

        // AUTH: must be logged in
        if (!currentUser) {
          console.warn("Access Denied: User not logged in. Redirecting to login.");
          navigate('/');
          setIsLoading(false);
          return;
        }

        // Must be member of team to access view
        if (!fetchedTeamData.members || !fetchedTeamData.members.includes(currentUser.uid)) {
          console.warn("Access Denied: User is not a member of this team. Redirecting to home.");
          navigate('/home');
          setIsLoading(false);
          return;
        }

        // Success
        setIsAuthorized(true);
        setTeamData({ id: teamDocSnap.id, ...fetchedTeamData });

        // fetch member details
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
        console.error("Error fetching team/members:", err);
        setError("Failed to load data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTeamAndMembers();
  }, [teamId, currentUser, navigate, announcementRefreshKey]);

  // change role (creator/admin can change). When admin = both permissions true; member = both false
  const changeRole = async (memberUid, newRole) => {
    if (!teamData || !currentUser) return;
    if (!isAdmin) {
      alert("Only the team creator or admins can change roles.");
      return;
    }

    // prevent changing creator via UI
    if (teamData.createdBy === memberUid) {
      alert("Cannot change creator's role.");
      return;
    }

    try {
      const teamDocRef = doc(db, 'teams', teamId);
      const permsForRole = newRole === 'admin' ? { announcements: true, schedule: true } : { announcements: false, schedule: false };

      await updateDoc(teamDocRef, {
        [`roles.${memberUid}`]: newRole,
        [`permissions.${memberUid}`]: permsForRole
      });

      // update local state optimistically
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

  // Callback after InviteMemberModal completes successfully to refresh team data quickly
  const onInviteCompleteRefresh = () => {
    setAnnouncementRefreshKey(k => k + 1);
  };

  // Open edit modal for an update object
  const openEditModal = (update) => {
    setEditTarget(update);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditTarget(null);
    setIsEditModalOpen(false);
  };

  // Save edits from modal: update the announcement doc
  const handleSaveUpdate = async (updateId, updateType, newData) => {
    try {
      const ref = doc(db, `teams/${teamId}/announcements`, updateId);
      // For meetings we expect newData.startDateTime/newData.endDateTime to be either Date or null
      const payload = { ...newData, updatedAt: serverTimestamp() };
      await updateDoc(ref, payload);
      // trigger refresh in parent listing
      refreshAnnouncements();
      closeEditModal();
    } catch (err) {
      console.error("Failed to update announcement/meeting:", err);
      alert("Failed to save update. See console.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
      <Header onNotificationClick={() => setIsNotificationsModalOpen(true)} />

      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
        {isLoading && <Spinner />}
        {error && <div className="text-center text-red-600 bg-red-100 p-4 rounded-md shadow">{error}</div>}

        {!isLoading && !error && teamData && isAuthorized && (
          <>
            <div className="mb-6 flex justify-between items-center">
              <Link to="/home" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 hover:underline">
                &larr; Back to Teams
              </Link>
              {/* Admin Action Buttons */}
              {isAdmin && (
                <div className="flex gap-2">
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
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                  <h1 className="text-3xl font-bold text-gray-800 mb-2">{teamData.teamName}</h1>
                  <p className="text-base text-gray-600">{teamData.description || 'No description provided.'}</p>
                  <p className="text-xs text-gray-500 mt-3">Created: {formatDate(teamData.createdAt, { dateOnly: true }) || 'N/A'}</p>
                </div>

                <AnnouncementsSection
                  teamId={teamId}
                  refreshTrigger={announcementRefreshKey}
                  isAdmin={isAdmin}
                  onEdit={(update) => openEditModal(update)}
                />
              </div>

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

              <div className="lg:col-span-3 mt-8">
                <TeamProjectTable teamId={teamId} />
              </div>
            </div>
          </>
        )}
      </main>

      {/* Render Modals (only if authorized) */}
      {isAuthorized && (
        <>
          <InviteMemberModal
            isOpen={isInviteModalOpen}
            onClose={() => setIsInviteModalOpen(false)}
            teamId={teamId}
            onInvited={() => onInviteCompleteRefresh()}
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
          <NotificationsModal
            isOpen={isNotificationsModalOpen}
            onClose={() => setIsNotificationsModalOpen(false)}
          />

          {/* Edit modal for announcement/meeting */}
          {isEditModalOpen && editTarget && (
            <EditUpdateModal
              isOpen={isEditModalOpen}
              onClose={closeEditModal}
              teamId={teamId}
              updateId={editTarget.id}
              updateType={editTarget.type}
              initialData={editTarget}
              onSaved={() => refreshAnnouncements()}
            />
          )}
        </>
      )}
    </div>
  );
};

export default TeamView;

/* ------------------------------------------------------------------
  EditUpdateModal: edits announcement or meeting in teams/{teamId}/announcements/{updateId}
  - For type === 'announcement' -> edit text
  - For type === 'meeting' -> edit title, description, meetingLink, startDateTime, endDateTime
-------------------------------------------------------------------*/
function EditUpdateModal({ isOpen, onClose, teamId, updateId, updateType, initialData = {}, onSaved }) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Announcement fields
  const [text, setText] = useState(initialData.text || '');

  // Meeting fields
  const [title, setTitle] = useState(initialData.title || '');
  const [description, setDescription] = useState(initialData.description || '');
  const [meetingLink, setMeetingLink] = useState(initialData.meetingLink || '');
  // store ISO local date-time strings for inputs (YYYY-MM-DDTHH:mm)
  const tsToLocalInput = (ts) => {
    if (!ts) return '';
    try {
      const d = (ts && typeof ts.toDate === 'function') ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
      if (isNaN(d)) return '';
      const iso = d.toISOString();
      return iso.slice(0, 16);
    } catch (err) {
      console.error('tsToLocalInput error', err, ts);
      return '';
    }
  };
  const [startDateTimeLocal, setStartDateTimeLocal] = useState(tsToLocalInput(initialData.startDateTime));
  const [endDateTimeLocal, setEndDateTimeLocal] = useState(tsToLocalInput(initialData.endDateTime));

  useEffect(() => {
    if (!isOpen) return;
    // initialize from initialData each time modal opens
    setError('');
    if (updateType === 'announcement') {
      setText(initialData.text || '');
    } else {
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      setMeetingLink(initialData.meetingLink || '');
      setStartDateTimeLocal(tsToLocalInput(initialData.startDateTime));
      setEndDateTimeLocal(tsToLocalInput(initialData.endDateTime));
    }
  }, [isOpen, initialData, updateType]);

  if (!isOpen) return null;

  const close = () => {
    if (typeof onClose === 'function') onClose();
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      const ref = doc(db, `teams/${teamId}/announcements`, updateId);
      if (updateType === 'announcement') {
        await updateDoc(ref, {
          text: text || '',
          updatedAt: serverTimestamp()
        });
      } else {
        // meeting
        const toUpdate = {
          title: title || '',
          description: description || '',
          meetingLink: meetingLink || '',
          updatedAt: serverTimestamp()
        };

        // convert local inputs back to Date objects
        if (startDateTimeLocal) {
          const s = new Date(startDateTimeLocal);
          if (!isNaN(s)) toUpdate.startDateTime = s;
        } else {
          toUpdate.startDateTime = null;
        }
        if (endDateTimeLocal) {
          const e = new Date(endDateTimeLocal);
          if (!isNaN(e)) toUpdate.endDateTime = e;
        } else {
          toUpdate.endDateTime = null;
        }

        await updateDoc(ref, toUpdate);
      }

      if (typeof onSaved === 'function') onSaved();
      close();
    } catch (err) {
      console.error("Failed to save update:", err);
      setError("Failed to save. See console.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = window.confirm("Delete this item? This action cannot be undone.");
    if (!ok) return;
    try {
      const ref = doc(db, `teams/${teamId}/announcements`, updateId);
      await deleteDoc(ref);
      if (typeof onSaved === 'function') onSaved();
      close();
    } catch (err) {
      console.error("Failed to delete:", err);
      setError("Failed to delete. See console.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800">{updateType === 'announcement' ? 'Edit Announcement' : 'Edit Meeting'}</h3>
          <button onClick={close} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>

        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

        {updateType === 'announcement' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Announcement Text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full border rounded p-2"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
              <input type="datetime-local" value={startDateTimeLocal} onChange={(e) => setStartDateTimeLocal(e.target.value)} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
              <input type="datetime-local" value={endDateTimeLocal} onChange={(e) => setEndDateTimeLocal(e.target.value)} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Link</label>
              <input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full border rounded p-2" />
            </div>
          </div>
        )}

        <div className="flex justify-between items-center gap-2 mt-6 border-t pt-4">
          <div className="flex items-center gap-2">
            <button onClick={handleDelete} className="px-3 py-2 bg-red-100 text-red-700 rounded text-sm">Delete</button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={close} className="px-3 py-2 bg-gray-200 rounded">Cancel</button>
            <button onClick={handleSave} disabled={isSaving} className="px-3 py-2 bg-blue-600 text-white rounded">
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
