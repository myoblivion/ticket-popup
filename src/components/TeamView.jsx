// TeamView.jsx
import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
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
import HandoversSection from './EndorsementModal';

// --- Context Import ---
import { LanguageContext } from '../contexts/LanguageContext.jsx';

// --- Calendar Imports ---
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/ko';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// --- Setup Localizer ---
const localizer = momentLocalizer(moment);

// --- Spinner component ---
const Spinner = ({ large = false }) => (
  <div className="flex justify-center items-center py-10">
    <div className={`border-4 border-blue-500 border-t-transparent rounded-full animate-spin ${large ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
  </div>
);

// --- Utility: formatDate (for general use) ---
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

// --- Utility: formatDate (for handovers table YYYY-MM-DD) ---
const formatDateForHandover = (value, { fallback = '' } = {}) => {
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
      return d.toISOString().split('T')[0];
  } catch (err) {
      console.error('formatDate error', err, value);
      return String(value);
  }
};

// --- URL Linkify Utility ---
const linkify = (text) => {
  if (!text) return '';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{part}</a>;
    }
    const lines = part.split('\n');
    return lines.map((line, j) => (
      <React.Fragment key={`${i}-${j}`}>
        {line}
        {j < lines.length - 1 && <br />}
      </React.Fragment>
    ));
  });
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


// --- AnnouncementsSection ---
const AnnouncementsSection = ({ teamId, refreshTrigger, isAdmin, onEdit }) => {
  const { t } = useContext(LanguageContext);
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
      setErrorAnnouncements(t('admin.updatesError'));
    } finally {
      setIsLoadingAnnouncements(false);
    }
  }, [teamId, t]);

  useEffect(() => { fetchAnnouncements(); }, [teamId, fetchAnnouncements, refreshTrigger]);

  const handleDelete = async (updateId) => {
    const ok = window.confirm(t('common.confirmDelete'));
    if (!ok) return;
    try {
      const docRef = doc(db, `teams/${teamId}/announcements`, updateId);
      await deleteDoc(docRef);
      setUpdates(prev => prev.filter(u => u.id !== updateId));
    } catch (err) {
      console.error("Failed to delete update:", err);
      setErrorAnnouncements(t('common.deleteError'));
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow border">
      <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">{t('admin.tabUpdates')}</h3>
      {isLoadingAnnouncements && <Spinner />}
      {errorAnnouncements && <p className="text-red-500 text-sm mt-2">{errorAnnouncements}</p>}
      {!isLoadingAnnouncements && updates.length === 0 && (
        <p className="text-sm text-gray-500 italic">{t('admin.noUpdates')}</p>
      )}
      {!isLoadingAnnouncements && updates.length > 0 && (
        <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {updates.map(update => (
            <li key={update.id} className={`text-sm p-2 border-l-4 rounded-r bg-gray-50 ${update.type === 'meeting' ? 'border-blue-500' : 'border-green-500'}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  {update.type === 'meeting' ? (
                    <>
                      <strong className="font-medium text-blue-700">{t('admin.meeting')}</strong> {update.title} <br />
                      <span className="text-xs text-gray-500">{t('admin.starts')} {formatDate(update.startDateTime) || 'N/A'}</span>
                      {update.endDateTime && <span className="text-xs text-gray-500"> - {t('admin.ends')} {formatDate(update.endDateTime)}</span>}
                      {update.description && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{linkify(update.description)}</p>}
                      {update.meetingLink && (
                        <a href={update.meetingLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs mt-1 block">
                          {t('admin.joinMeeting')}
                        </a>
                      )}
                      <p className="text-xs text-gray-500 mt-2">{t('admin.scheduledBy')} {update.creatorDisplayName} at {formatDate(update.createdAt, { dateOnly: true })}</p>
                    </>
                  ) : (
                    <>
                      <strong className="font-medium text-green-700">{t('admin.announcement')}</strong>
                      <div className="whitespace-pre-wrap break-words">
                        {linkify(update.text)}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">{t('admin.by')} {update.creatorDisplayName} at {formatDate(update.createdAt, { dateOnly: true })}</p>
                    </>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex-shrink-0 flex items-start gap-1 ml-3">
                    <button onClick={() => onEdit(update)} className="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-2 py-1 rounded">{t('common.edit')}</button>
                    <button onClick={() => handleDelete(update.id)} className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded">{t('common.remove')}</button>
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
  const { t } = useContext(LanguageContext);

  return (
    <div className="bg-white p-4 rounded-lg shadow border">
      <div className="flex justify-between items-center mb-3 border-b pb-2">
        <h3 className="text-lg font-semibold text-gray-700">{t('admin.tabMembers')}</h3>
        {canManageMembers && (
          <button
            onClick={onInviteClick}
            className="text-xs bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-3 rounded-md shadow-sm transition-colors"
          >
            {t('admin.invite')}
          </button>
        )}
      </div>
      {membersDetails.length > 0 ? (
        <ul className="list-none space-y-2 max-h-96 overflow-y-auto pr-2">
          {membersDetails.map((member) => {
            const uid = member.uid;
            const isCreator = teamData?.createdBy === uid;
            const isMasterAdmin = member.role === 'Master Admin';
            const roleMap = teamData?.roles || {};
            const roleRaw = isCreator ? 'creator' : (roleMap?.[uid] || 'member');
            const roleLabel = isCreator ? t('admin.creator') : (isMasterAdmin ? t('header.masterAdmin') : (roleRaw === 'admin' ? t('admin.admin') : t('common.member')));

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
                      <div className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded border border-yellow-200">{t('admin.creator')}</div>
                    ) : isMasterAdmin ? (
                      <div className="text-xs px-2 py-1 bg-indigo-100 text-indigo-800 rounded border border-indigo-200">{t('header.masterAdmin')}</div>
                    ) : (
                      <select
                        value={roleRaw}
                        onChange={(e) => onChangeRole(uid, e.target.value)}
                        className="text-xs border rounded px-2 py-1"
                        title={t('admin.changeRole')}
                      >
                        <option value="admin">{t('admin.admin')}</option>
                        <option value="member">{t('common.member')}</option>
                      </select>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2" />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 italic">{t('admin.noMembers')}</p>
      )}
    </div>
  );
};

// --- ManualNoteModal (Translated AND UPDATED with Edit) ---
const ManualNoteModal = ({ isOpen, onClose, modalData, onSave, onDelete, isAdmin }) => {
  const { t } = useContext(LanguageContext);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      return;
    }
    if (modalData?.type === 'new') {
      setTitle('');
      setDescription('');
      setIsEditing(false);
    }
    if (modalData?.type === 'view') {
      setTitle(modalData?.event?.title?.replace(/^Note:\s*/i, '') || '');
      setDescription(modalData?.event?.description || '');
    }
  }, [isOpen, modalData]);

  if (!isOpen) return null;

  const isNew = modalData?.type === 'new';
  const isView = modalData?.type === 'view';
  const event = modalData?.event;

  const handleSave = async () => {
    if (!title) return;

    const eventId = (isView && event?.id) ? event.id : null;
    const start = isNew ? (modalData.start instanceof Date ? modalData.start : new Date(modalData.start)) : event.start;
    const end = isNew ? (modalData.end instanceof Date ? modalData.end : new Date(modalData.end)) : event.end;

    await onSave(title, description, start, end, eventId);

    setIsEditing(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!event || !event.id) return;
    await onDelete(event.id);
    onClose();
  };
  
  const handleCancel = () => {
    if (isEditing) {
      setIsEditing(false);
      setTitle(modalData?.event?.title?.replace(/^Note:\s*/i, '') || '');
      setDescription(modalData?.event?.description || '');
    } else {
      onClose();
    }
  };

  let modalTitle = t('calendar.modalTitle');
  if (isNew) {
    modalTitle = `${t('calendar.addNoteTitle')} ${moment(modalData.start).format('MMM D, YYYY')}`;
  } else if (isView && isEditing) {
    modalTitle = t('calendar.editNoteTitle', 'Edit Note');
  } else if (isView && !isEditing && event) {
    modalTitle = event.title;
  }

  return (
    <div aria-modal="true" role="dialog" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleCancel} />
      <div className="relative z-10 w-full max-w-lg bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">{modalTitle}</h3>

        {(isNew || (isView && isEditing)) && (
          <div className="space-y-4">
            <div>
              <label htmlFor="noteTitle" className="block text-sm font-medium text-gray-700">{t('calendar.noteTitle')}</label>
              <input id="noteTitle" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder={t('calendar.noteTitlePlaceholder')} />
            </div>
            <div>
              <label htmlFor="noteDescription" className="block text-sm font-medium text-gray-700">{t('calendar.noteBody')}</label>
              <textarea
                id="noteDescription"
                rows="4"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder={t('calendar.noteBodyPlaceholder')}
              />
            </div>
          </div>
        )}

        {isView && !isEditing && event && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600"><strong>{t('calendar.event')}</strong> {event.title}</p>
            {event.description && (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                <strong>{t('calendar.description')}</strong> {event.description}
              </p>
            )}
            <p className="text-sm text-gray-600"><strong>{t('calendar.date')}</strong> {moment(event.start).format('lll')}</p>
            <p className="text-sm text-gray-600"><strong>{t('calendar.type')}</strong> <span className="capitalize">{event.type}</span></p>
          </div>
        )}

        <div className="flex justify-end items-center gap-3 mt-6">
          {isView && !isEditing && event?.type === 'manual' && isAdmin && (
            <button 
              type="button" 
              onClick={handleDelete} 
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
            >
              {t('common.deleteNote')}
            </button>
          )}
          
          <button 
            type="button" 
            onClick={handleCancel} 
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>

          {isView && !isEditing && event?.type === 'manual' && isAdmin && (
            <button 
              type="button" 
              onClick={() => setIsEditing(true)} 
              className="px-4 py-2 text-sm font-medium text-white bg-yellow-500 rounded-md hover:bg-yellow-600"
            >
              {t('common.editNote', 'Edit Note')}
            </button>
          )}

          {(isNew || (isView && isEditing)) && (
            <button 
              type="button" 
              onClick={handleSave} 
              disabled={!title} 
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md disabled:bg-gray-400 hover:bg-blue-700"
            >
              {t('common.saveNote')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// --- TeamCalendar (now supports separate Completed calendar) ---
const TeamCalendar = ({ teamId, isAdmin, refreshTrigger, messages }) => {
  const { t } = useContext(LanguageContext);
  const [events, setEvents] = useState([]); // active calendar events (no completed tasks)
  const [completedEvents, setCompletedEvents] = useState([]); // completed tickets as calendar events
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);

  // date/view state so toolbar navigation works reliably
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('month');

  // mode toggle
  const [calendarMode, setCalendarMode] = useState('calendar'); // 'calendar' | 'completed'

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

      const activeTaskEvents = [];
      const completedTaskEvents = [];

      taskDocs.docs.forEach(d => {
        const data = d.data();
        const startDate = normalizeValueToDate(data.startDate);
        const endDate = normalizeValueToDate(data.endDate);
        const status = (data.status || '').toString().toLowerCase();
        const title = `${t('calendar.ticket')} ${data.ticketNo || data.title || d.id}`;

        const isCompleted = status === 'completed' || !!endDate;

        // Determine event date for active tasks (prefer start or due)
        const activeEventDate = startDate || null;

        // For completed tasks, prefer endDate/completedAt, then fallback to createdAt
        const completedAt =
          endDate ||
          normalizeValueToDate(data.completedAt) ||
          normalizeValueToDate(data.updatedAt) ||
          normalizeValueToDate(data.createdAt) ||
          null;

        if (isCompleted) {
          // only add to completedEvents if we have a date to show, fallback to createdAt above
          if (completedAt) {
            completedTaskEvents.push({
              id: d.id,
              title,
              start: completedAt,
              end: completedAt,
              allDay: true,
              type: 'completed-ticket',
              raw: data,
              status,
            });
          }
        } else {
          // Active tasks: only add if there's at least a start/due date to show on calendar
          const eventDate = endDate || startDate || normalizeValueToDate(data.dueDate) || null;
          if (eventDate) {
            activeTaskEvents.push({
              id: d.id,
              title,
              start: eventDate,
              end: eventDate,
              allDay: true,
              type: 'ticket',
              raw: data,
              status,
            });
          }
        }
      });

      // Meeting events
      const meetingEvents = meetingDocs.docs.map(d => {
        const data = d.data();
        const start = normalizeValueToDate(data.startDateTime) || new Date();
        const end = normalizeValueToDate(data.endDateTime) || start;
        return {
          id: d.id,
          title: `${t('calendar.meeting')} ${data.title || t('calendar.untitled')}`,
          start,
          end: (end > start) ? end : new Date(start.getTime() + 30 * 60 * 1000),
          allDay: false,
          type: 'meeting',
          raw: data,
        };
      });

      // Note events
      const noteEvents = noteDocs.docs.map(d => {
        const data = d.data();
        const start = normalizeValueToDate(data.start) || new Date();
        return {
          id: d.id,
          title: `${t('calendar.note')} ${data.title || 'Note'}`,
          description: data.description || '',
          start,
          end: start,
          allDay: true,
          type: 'manual',
          raw: data,
        };
      });

      // Active calendar shows meetings + notes + active tasks (non-completed)
      const calendarEvents = [...activeTaskEvents, ...meetingEvents, ...noteEvents];

      // Completed calendar shows only completedTaskEvents
      setEvents(calendarEvents);
      setCompletedEvents(completedTaskEvents);
    } catch (err) {
      console.error("Error fetching calendar data:", err);
    } finally {
      setLoading(false);
    }
  }, [teamId, t]);

  useEffect(() => { fetchCalendarData(); }, [fetchCalendarData, refreshTrigger]);

  // handlers:
  const handleSelectSlot = useCallback(({ start, end }) => {
    setModalData({ type: 'new', start, end });
    if (isAdmin) setIsNoteModalOpen(true);
  }, [isAdmin]);

  const handleSelectEvent = useCallback((event) => {
    // pass event through - ManualNoteModal expects event.title, event.description, event.start
    setModalData({ type: 'view', event });
    setIsNoteModalOpen(true);
  }, []);

  const handleDoubleClickEvent = useCallback((event) => {
    setModalData({ type: 'view', event });
    setIsNoteModalOpen(true);
  }, []);

  const handleSaveOrUpdateNote = useCallback(async (title, description, start, end, eventId) => {
    if (!title || !teamId) return;
    try {
      if (eventId) {
        const noteRef = doc(db, 'teams', teamId, 'calendarNotes', eventId);
        await updateDoc(noteRef, { title, description });
      } else {
        const newNote = {
          title,
          description,
          start: start instanceof Date ? start : new Date(start),
          end: end instanceof Date ? end : new Date(end),
          allDay: true,
          createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, 'teams', teamId, 'calendarNotes'), newNote);
      }
      await fetchCalendarData();
    } catch (err) {
      console.error("Error saving/updating note:", err);
    }
  }, [teamId, fetchCalendarData]);

  const handleDeleteNote = useCallback(async (eventId) => {
    if (!teamId || !eventId) return;
    if (!window.confirm(t('common.confirmDelete', 'Delete this item?'))) return;
    try {
      await deleteDoc(doc(db, 'teams', teamId, 'calendarNotes', eventId));
      await fetchCalendarData();
    } catch (err) {
      console.error("Error deleting note:", err);
    }
  }, [teamId, fetchCalendarData, t]);

  const eventPropGetter = useCallback((event) => {
    // Differentiate styles for meetings, completed tickets, and others
    if (event.type === 'meeting') {
      return { style: { cursor: 'pointer', backgroundColor: '#dbebff', borderLeft: '4px solid #3b82f6', color: '#0f172a' } };
    }
    if (event.type === 'completed-ticket') {
      return { style: { cursor: 'pointer', backgroundColor: '#f3f4f6', borderLeft: '4px solid #9ca3af', color: '#374151', textDecoration: 'line-through' } };
    }
    if (event.type === 'ticket') {
      return { style: { cursor: 'pointer', backgroundColor: '#ecfdf5', borderLeft: '4px solid #10b981', color: '#064e3b' } };
    }
    if (event.type === 'manual') {
      return { style: { cursor: 'pointer', backgroundColor: '#fff7ed', borderLeft: '4px solid #f59e0b', color: '#7c2d12' } };
    }
    return { style: { cursor: 'pointer' } };
  }, []);

  if (loading) return <Spinner large />;

  return (
    <div className="bg-white rounded-lg shadow border flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-2xl font-semibold text-gray-800">{t('admin.tabCalendar')}</h2>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCalendarMode('calendar')}
            className={`text-sm px-3 py-1 rounded ${calendarMode === 'calendar' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
          >
            {t('admin.tabCalendar')}
          </button>
          <button
            onClick={() => setCalendarMode('completed')}
            className={`text-sm px-3 py-1 rounded ${calendarMode === 'completed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
          >
            {t('common.completed')}
          </button>
        </div>
      </div>

      {/* Calendar (active events) */}
      {calendarMode === 'calendar' && (
        <div className="p-4" style={{ height: '600px' }}>
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
            showMultiDayTimes={true}
            messages={messages}
          />
        </div>
      )}

      {/* Completed tickets calendar */}
      {calendarMode === 'completed' && (
        <div className="p-4" style={{ height: '600px' }}>
          <Calendar
            localizer={localizer}
            events={completedEvents}
            startAccessor="start"
            endAccessor="end"
            date={currentDate}
            view={currentView}
            onNavigate={(date) => setCurrentDate(date)}
            onView={(view) => setCurrentView(view)}
            style={{ height: '100%' }}
            selectable={false}
            onSelectEvent={handleSelectEvent}
            onDoubleClickEvent={handleDoubleClickEvent}
            eventPropGetter={eventPropGetter}
            popup={true}
            showMultiDayTimes={true}
            messages={messages}
          />
        </div>
      )}

      <ManualNoteModal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        modalData={modalData}
        onSave={handleSaveOrUpdateNote}
        onDelete={handleDeleteNote}
        isAdmin={isAdmin}
      />
    </div>
  );
};


// ===================================================================
// --- TeamView (main) ---
// ===================================================================
const TeamView = () => {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const { t, language } = useContext(LanguageContext);
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

  // --- DYNAMICALLY SET MOMENT LOCALE ---
  useEffect(() => {
    moment.locale(language);
  }, [language]);

  // --- DYNAMIC CALENDAR MESSAGES ---
  const calendarMessages = useMemo(() => ({
    allDay: t('calendar.allDay', 'All Day'),
    previous: t('calendar.previous'),
    next: t('calendar.next'),
    today: t('calendar.today'),
    month: t('calendar.month'),
    week: t('calendar.week'),
    day: t('calendar.day'),
    agenda: t('calendar.agenda'),
    date: t('calendar.date', 'Date'),
    time: t('calendar.time', 'Time'),
    event: t('calendar.event', 'Event'),
    showMore: total => t('calendar.showMore', `+ ${total} more`),
    noEventsInRange: t('calendar.noEventsInRange', 'There are no events in this range.'),
  }), [t]);

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
              : { uid: uid, displayName: null, email: t('admin.profileNotFound') };
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
  }, [teamId, currentUser, navigate, t]);

  useEffect(() => { fetchTeamAndMembers(); }, [fetchTeamAndMembers, announcementRefreshKey]);

  const changeRole = async (memberUid, newRole) => {
      if (!teamData || !currentUser || !isAdmin || teamData.createdBy === memberUid) return;
      if (!['admin', 'member'].includes(newRole)) return;
      
      const targetUser = membersDetails.find(m => m.uid === memberUid);
      if (targetUser && targetUser.role === 'Master Admin') {
        alert(t('admin.cannotChangeMasterAdmin', 'You cannot change the team role of a Master Admin.'));
        return;
      }

      const teamDocRef = doc(db, "teams", teamId);
      const rolesUpdate = { ...teamData.roles, [memberUid]: newRole };

      try {
          await updateDoc(teamDocRef, { roles: rolesUpdate });
          setTeamData(prev => ({ ...prev, roles: rolesUpdate }));
      } catch (err) {
          console.error("Error updating role:", err);
          setError(t('admin.changeRoleError'));
      }
  };

  const onInviteCompleteRefresh = () => { fetchTeamAndMembers(); };
  const openEditModal = (update) => { setEditTarget(update); setIsEditModalOpen(true); };
  const closeEditModal = () => { setEditTarget(null); setIsEditModalOpen(false); };

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {isLoading && <Spinner large />}
        {error && <div className="text-center text-red-600 bg-red-100 p-4 rounded-md shadow">{error}</div>}

        {!isLoading && !error && teamData && isAuthorized && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <Link to="/home" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 hover:underline mb-2">
                  &larr; {t('common.backToDashboard')}
                </Link>
                <h1 className="text-3xl font-bold text-gray-900">{teamData.teamName}</h1>
                <p className="text-base text-gray-600 mt-1">{teamData.description || t('admin.noDescription')}</p>
                <p className="text-xs text-gray-500 mt-2">{t('admin.created', 'Created')}: {formatDate(teamData.createdAt, { dateOnly: true }) || 'N/A'}</p>
              </div>

              <div className="flex-shrink-0 flex gap-2 flex-wrap justify-end">
                {isAdmin && (
                  <>
                    <button onClick={() => setIsAnnounceModalOpen(true)} className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md">{t('admin.announceTeam')}</button>
                    <button onClick={() => setIsScheduleModalOpen(true)} className="bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md">{t('admin.scheduleMeeting')}</button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-6">
                <AnnouncementsSection 
                  teamId={teamId} 
                  refreshTrigger={announcementRefreshKey} 
                  isAdmin={isAdmin} 
                  onEdit={openEditModal} 
                />
                <MembersSection 
                  membersDetails={membersDetails} 
                  teamData={teamData} 
                  currentUserUid={currentUser?.uid} 
                  canManageMembers={isAdmin} 
                  onChangeRole={changeRole} 
                  onInviteClick={() => setIsInviteModalOpen(true)} 
                />
              </div>

              <div className="lg:col-span-2">
                <TeamCalendar
                  teamId={teamId}
                  isAdmin={isAdmin}
                  refreshTrigger={announcementRefreshKey}
                  messages={calendarMessages}
                />
              </div>
            </div>
            
            <div>
              <div className="bg-white rounded-lg shadow border overflow-hidden">
                <div className="overflow-x-auto">
                  <TeamProjectTable
                    teamId={teamId}
                    onTaskChange={refreshAnnouncements}
                  />
                </div>
              </div>
            </div>

            <HandoversSection teamId={teamId} />
            
          </div>
        )}
      </div>

      {isAuthorized && teamId && (
        <>
          <InviteMemberModal t={t} isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} teamId={teamId} onInvited={onInviteCompleteRefresh} />
          <AnnounceModal t={t} isOpen={isAnnounceModalOpen} onClose={() => setIsAnnounceModalOpen(false)} teamId={teamId} onAnnouncementPosted={refreshAnnouncements} />
          <ScheduleMeetingModal t={t} isOpen={isScheduleModalOpen} onClose={() => setIsScheduleModalOpen(false)} teamId={teamId} onMeetingScheduled={refreshAnnouncements} />
          
          {isEditModalOpen && editTarget && (
            <EditUpdateModal t={t} isOpen={isEditModalOpen} onClose={closeEditModal} teamId={teamId} updateId={editTarget.id} updateType={editTarget.type} initialData={editTarget} onSaved={refreshAnnouncements} />
          )}
        </>
      )}
    </>
  );
};

export default TeamView;
