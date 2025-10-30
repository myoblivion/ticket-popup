// TeamView.jsx
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
  where,
  addDoc
} from "firebase/firestore";
import { db, auth } from '../firebaseConfig';
import { onAuthStateChanged } from "firebase/auth";
import InviteMemberModal from './InviteMemberModal';
import AnnounceModal from './AnnounceModal';
import ScheduleMeetingModal from './ScheduleMeetingModal';
import TeamProjectTable from './TeamProjectTable';
import EditUpdateModal from './EditUpdateModal';
import EndorsementModal from './EndorsementModal';

// --- Calendar Imports ---
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// --- Setup Calendar Localizer ---
const localizer = momentLocalizer(moment);

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

// ---------- Helper utilities (FOR CALENDAR) ----------
const normalizeValueToDate = (val) => {
  if (!val) return null;
  if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate();
  if (val instanceof Date) return val;
  const parsed = new Date(val);
  if (!isNaN(parsed)) return parsed;
  return null;
};

// Checks if a Date object has a time component (is not midnight)
const hasTimeComponent = (d) => {
  if (!d || !(d instanceof Date)) return false;
  return d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0 || d.getMilliseconds() !== 0;
};

const msInDay = 24 * 60 * 60 * 1000;


// --- AnnouncementsSection (unchanged) ---
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
      const fetchedUpdates = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setUpdates(fetchedUpdates);
    } catch (err) {
      console.error("Error fetching announcements:", err);
      setErrorAnnouncements("Failed to load announcements and meetings.");
    } finally {
      setIsLoadingAnnouncements(false);
    }
  }, [teamId]);

  useEffect(() => { fetchAnnouncements(); }, [teamId, fetchAnnouncements, refreshTrigger]);

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

// --- MembersSection (unchanged) ---
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

// --- ManualNoteModal (MODIFIED) ---
const ManualNoteModal = ({ isOpen, onClose, modalData, onSave, onDelete, isAdmin }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState(''); // <-- ADDED

  useEffect(() => {
    if (!isOpen) return;
    if (modalData?.type === 'new') {
      setTitle('');
      setDescription(''); // <-- ADDED
    }
    if (modalData?.type === 'view') {
      setTitle(modalData?.event?.title?.replace(/^Note:\s*/i, '') || '');
      setDescription(modalData?.event?.description || ''); // <-- ADDED
    }
  }, [isOpen, modalData]);

  if (!isOpen) return null;

  const isNew = modalData?.type === 'new';
  const isView = modalData?.type === 'view';
  const event = modalData?.event;

  const handleSave = async () => {
    if (!title) return; // Only title is required to save
    const start = modalData.start instanceof Date ? modalData.start : new Date(modalData.start);
    const end = modalData.end instanceof Date ? modalData.end : new Date(modalData.end);
    await onSave(title, description, start, end); // <-- PASS DESCRIPTION
    onClose();
  };

  const handleDelete = async () => {
    if (!event || !event.id) return;
    await onDelete(event.id);
    onClose();
  };

  let modalTitle = 'Calendar Event';
  if (isNew) modalTitle = `Add Note for ${moment(modalData.start).format('MMM D, YYYY')}`;
  if (isView && event) modalTitle = event.title;

  return (
    <div aria-modal="true" role="dialog" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      {/* --- Changed max-w-md to max-w-lg --- */}
      <div className="relative z-10 w-full max-w-lg bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">{modalTitle}</h3>

        {isNew && (
          <div className="space-y-4">
            {/* --- ADDED wrapper div --- */}
            <div>
              <label htmlFor="noteTitle" className="block text-sm font-medium text-gray-700">Note Title</label>
              <input id="noteTitle" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="e.g., Team Holiday" />
            </div>

            {/* --- ADDED this block --- */}
            <div>
              <label htmlFor="noteDescription" className="block text-sm font-medium text-gray-700">Note Body / Description</label>
              <textarea
                id="noteDescription"
                rows="4"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Add details here..."
              />
            </div>
            {/* --- END of new block --- */}
          </div>
        )}

        {isView && event && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600"><strong>Event:</strong> {event.title}</p>
            {/* --- ADDED this block --- */}
            {event.description && (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                <strong>Description:</strong> {event.description}
              </p>
            )}
            {/* --- END of new block --- */}
            <p className="text-sm text-gray-600"><strong>Date:</strong> {moment(event.start).format('lll')}</p>
            <p className="text-sm text-gray-600"><strong>Type:</strong> <span className="capitalize">{event.type}</span></p>
          </div>
        )}

        <div className="flex justify-end items-center gap-3 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md">Cancel</button>

          {isNew && (
            <button type="button" onClick={handleSave} disabled={!title} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md disabled:bg-gray-400">Save Note</button>
          )}

          {isView && event?.type === 'manual' && isAdmin && (
            <button type="button" onClick={handleDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md">Delete Note</button>
          )}
        </div>
      </div>
    </div>
  );
};


// --- TeamCalendar (MODIFIED) ---
const TeamCalendar = ({ teamId, isAdmin, refreshTrigger }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);

  // date/view state so toolbar navigation works reliably
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('month');

  const fetchCalendarData = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const tasksQuery = query(collection(db, 'teams', teamId, 'tasks'));
      const meetingsQuery = query(collection(db, 'teams', teamId, 'announcements'), where('type', '==', 'meeting'));
      const notesQuery = query(collection(db, 'teams', teamId, 'calendarNotes'));

      const [taskDocs, meetingDocs, noteDocs] = await Promise.all([
        getDocs(tasksQuery),
        getDocs(meetingsQuery),
        getDocs(notesQuery),
      ]);

      // --- Task events ---
      const taskEvents = taskDocs.docs
        .filter(d => d.data().startDate && d.data().endDate) // Ensure both dates exist
        .map(d => {
          const data = d.data();
          const startDate = normalizeValueToDate(data.startDate);
          const endDate = normalizeValueToDate(data.endDate);

          if (!startDate || !endDate) return null;

          // --- THIS IS THE FIX ---
          // Use 'ticketNo' (from table) first, then 'title', then ID
          const title = `Ticket: ${data.ticketNo || data.title || d.id}`;
          // --- END OF FIX ---

          // Make sure end date is at least the start date for calendar
          const safeEndDate = (endDate < startDate) ? startDate : endDate;

          return {
            id: d.id,
            title: title,
            start: startDate, 
            end: safeEndDate,     
            allDay: true, // Tasks are always all-day
            type: 'ticket',
          };
        })
        .filter(Boolean); // Remove any null (invalid) events

      // --- Meeting events ---
      const meetingEvents = meetingDocs.docs.map(d => {
        const data = d.data();
        const start = normalizeValueToDate(data.startDateTime) || new Date();
        const end = normalizeValueToDate(data.endDateTime) || start;
        
        // Meetings are NOT all-day
        return {
          id: d.id,
          title: `Meeting: ${data.title || 'Untitled'}`,
          start,
          end: (end > start) ? end : new Date(start.getTime() + 30 * 60 * 1000), // Default 30min
          allDay: false, 
          type: 'meeting',
        };
      });

      // --- Note events ---
      const noteEvents = noteDocs.docs.map(d => {
        const data = d.data();
        const start = normalizeValueToDate(data.start) || new Date();
        
        // Notes are all-day
        return {
          id: d.id,
          title: `Note: ${data.title || 'Note'}`,
          description: data.description || '', // <-- ADDED
          start: start,
          end: start, // All-day notes just need a start date
          allDay: true,
          type: 'manual',
        };
      });

      setEvents([...taskEvents, ...meetingEvents, ...noteEvents]);
    } catch (err) {
      console.error("Error fetching calendar data:", err);
    } finally {
      setLoading(false);
    }
  }, [teamId]);


  useEffect(() => { fetchCalendarData(); }, [fetchCalendarData, refreshTrigger]);

  // handlers:
  const handleSelectSlot = useCallback(({ start, end }) => {
    setModalData({ type: 'new', start, end });
    if (isAdmin) setIsNoteModalOpen(true);
  }, [isAdmin]);

  const handleSelectEvent = useCallback((event) => {
    setModalData({ type: 'view', event });
    setIsNoteModalOpen(true);
  }, []);

  const handleDoubleClickEvent = useCallback((event) => {
    setModalData({ type: 'view', event });
    setIsNoteModalOpen(true);
  }, []);

  const handleSaveNote = useCallback(async (title, description, start, end) => { // <-- ADDED description
    if (!title || !teamId) return;
    try {
      const newNote = {
        title,
        description, // <-- ADDED
        start: start instanceof Date ? start : new Date(start),
        end: end instanceof Date ? end : new Date(end),
        allDay: true, // Notes are all-day
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'teams', teamId, 'calendarNotes'), newNote);
      await fetchCalendarData();
    } catch (err) {
      console.error("Error adding manual note:", err);
    }
  }, [teamId, fetchCalendarData]);

  const handleDeleteNote = useCallback(async (eventId) => {
    if (!teamId || !eventId) return;
    try {
      await deleteDoc(doc(db, 'teams', teamId, 'calendarNotes', eventId));
      await fetchCalendarData();
    } catch (err) {
      console.error("Error deleting note:", err);
    }
  }, [teamId, fetchCalendarData]);

  const eventPropGetter = useCallback((event) => ({
    style: { cursor: 'pointer' },
    'data-type': event.type,
  }), []);

  if (loading) return <Spinner />;

  return (
    <div style={{ height: 600, padding: '1rem' }}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        date={currentDate}
        view={currentView}
        onNavigate={(date) => setCurrentDate(date)}
        onView={(view) => setCurrentView(view)}
        style={{ height: '100%' }}
        selectable={true}
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
        onDoubleClickEvent={handleDoubleClickEvent}
        eventPropGetter={eventPropGetter}
        popup={true}
        showMultiDayTimes={true} // This will show multi-day timed events in the time grid
      />

      <ManualNoteModal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        modalData={modalData}
        onSave={handleSaveNote}
        onDelete={handleDeleteNote}
        isAdmin={isAdmin}
      />
    </div>
  );
};

// --- TeamView (main) ---
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
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [isEndorsementModalOpen, setIsEndorsementModalOpen] = useState(false);

  const isTeamCreator = teamData?.createdBy === currentUser?.uid;
  const currentUserRole = teamData?.roles?.[currentUser?.uid] || 'member';
  const isAdmin = currentUserRole === 'admin' || isTeamCreator;

  const refreshAnnouncements = useCallback(() => { setAnnouncementRefreshKey(k => k + 1); }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user && teamId) navigate('/login', { replace: true });
    });
    return unsub;
  }, [navigate, teamId]);

  const fetchTeamAndMembers = useCallback(async () => {
    if (!teamId) { setError("No team ID provided."); setIsLoading(false); return; }
    if (!currentUser) { console.log("User not available yet, waiting..."); return; }

    setIsLoading(true); setError(null); setTeamData(null); setMembersDetails([]); setIsAuthorized(false);

    try {
      const teamDocRef = doc(db, "teams", teamId);
      const teamDocSnap = await getDoc(teamDocRef);

      if (!teamDocSnap.exists()) { setError("Team not found."); setIsLoading(false); return; }

      const fetchedTeamData = teamDocSnap.data();
      const memberUIDs = fetchedTeamData.members || [];
      const isMember = memberUIDs.some(member =>
        (typeof member === 'object' && member.uid === currentUser.uid) ||
        (typeof member ==='string' && member === currentUser.uid)
      );

      if (!isMember) {
        console.warn("Access Denied: User not a member.");
        navigate('/home', { replace: true });
        setIsLoading(false);
        return;
      }

      setIsAuthorized(true);
      setTeamData({ id: teamDocSnap.id, ...fetchedTeamData });

      const allMemberUIDs = memberUIDs.map(m => typeof m === 'object' ? m.uid : m);
      const uniqueMemberUIDs = [...new Set(allMemberUIDs)];

      if (uniqueMemberUIDs.length > 0) {
        const memberPromises = uniqueMemberUIDs.map(uid => getDoc(doc(db, "users", uid)));
        const memberDocsSnap = await Promise.all(memberPromises);

        const memberInfo = memberDocsSnap.map((userDoc, index) => {
          const uid = uniqueMemberUIDs[index];
          return userDoc.exists()
              ? { uid: uid, ...userDoc.data() }
              : { uid: uid, displayName: null, email: 'Profile not found' };
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
  }, [teamId, currentUser, navigate]);

  useEffect(() => { fetchTeamAndMembers(); }, [fetchTeamAndMembers, announcementRefreshKey]);

  const changeRole = async (memberUid, newRole) => {
      if (!teamData || !currentUser || !isAdmin || teamData.createdBy === memberUid) return;
      if (!['admin', 'member'].includes(newRole)) return;

      const teamDocRef = doc(db, "teams", teamId);
      const rolesUpdate = { ...teamData.roles, [memberUid]: newRole };

      try {
          await updateDoc(teamDocRef, { roles: rolesUpdate });
          setTeamData(prev => ({ ...prev, roles: rolesUpdate }));
      } catch (err) {
          console.error("Error updating role:", err);
          setError("Failed to update member role.");
      }
  };

  const onInviteCompleteRefresh = () => { fetchTeamAndMembers(); };
  const openEditModal = (update) => { setEditTarget(update); setIsEditModalOpen(true); };
  const closeEditModal = () => { setEditTarget(null); setIsEditModalOpen(false); };

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {isLoading && <Spinner />}
        {error && <div className="text-center text-red-600 bg-red-100 p-4 rounded-md shadow">{error}</div>}

        {!isLoading && !error && teamData && isAuthorized && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <Link to="/home" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 hover:underline mb-2">
                  &larr; Back to Teams
                </Link>
                <h1 className="text-3xl font-bold text-gray-900">{teamData.teamName}</h1>
                <p className="text-base text-gray-600 mt-1">{teamData.description || 'No description provided.'}</p>
                <p className="text-xs text-gray-500 mt-2">Created: {formatDate(teamData.createdAt, { dateOnly: true }) || 'N/A'}</p>
              </div>

              <div className="flex-shrink-0 flex gap-2 flex-wrap justify-end">
                <button onClick={() => setIsEndorsementModalOpen(true)} className="bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md">View Endorsements</button>
                {isAdmin && (
                  <>
                    <button onClick={() => setIsAnnounceModalOpen(true)} className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md">Announce</button>
                    <button onClick={() => setIsScheduleModalOpen(true)} className="bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md">Schedule Meeting</button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <AnnouncementsSection teamId={teamId} refreshTrigger={announcementRefreshKey} isAdmin={isAdmin} onEdit={openEditModal} />
              </div>
              <div className="lg:col-span-1">
                <MembersSection membersDetails={membersDetails} teamData={teamData} currentUserUid={currentUser?.uid} canManageMembers={isAdmin} onChangeRole={changeRole} onInviteClick={() => setIsInviteModalOpen(true)} />
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Team Calendar</h2>
              <div className="bg-white rounded-lg shadow border overflow-hidden">
                <TeamCalendar teamId={teamId} isAdmin={isAdmin} refreshTrigger={announcementRefreshKey} />
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Team Project Tasks</h2>
              <TeamProjectTable
                teamId={teamId}
                onTaskChange={refreshAnnouncements}
              />
            </div>
            
          </div>
        )}
      </div>

      {isAuthorized && teamId && (
        <>
          <InviteMemberModal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} teamId={teamId} onInvited={onInviteCompleteRefresh} />
          <AnnounceModal isOpen={isAnnounceModalOpen} onClose={() => setIsAnnounceModalOpen(false)} teamId={teamId} onAnnouncementPosted={refreshAnnouncements} />
          <ScheduleMeetingModal isOpen={isScheduleModalOpen} onClose={() => setIsScheduleModalOpen(false)} teamId={teamId} onMeetingScheduled={refreshAnnouncements} />
          <EndorsementModal isOpen={isEndorsementModalOpen} onClose={() => setIsEndorsementModalOpen(false)} teamId={teamId} />
          {isEditModalOpen && editTarget && (
            <EditUpdateModal isOpen={isEditModalOpen} onClose={closeEditModal} teamId={teamId} updateId={editTarget.id} updateType={editTarget.type} initialData={editTarget} onSaved={refreshAnnouncements} />
          )}
        </>
      )}
    </>
  );
};

export default TeamView;