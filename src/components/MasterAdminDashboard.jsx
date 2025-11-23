// MasterAdminDashboard.jsx
import React, { useEffect, useState, useCallback, useRef, useContext, useMemo } from 'react';
import { Link } from 'react-router-dom'; 
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
  where,
  addDoc,
  serverTimestamp,
  deleteField
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import Spinner from './Spinner';
import TeamProjectTable from './TeamProjectTable';

// --- NEW CALENDAR IMPORTS ---
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// Modals
import InviteMemberModal from './InviteMemberModal';
import AnnounceModal from './AnnounceModal';
import ScheduleMeetingModal from './ScheduleMeetingModal';
import EditUpdateModal from './EditUpdateModal';
import AnnounceMultiTeamModal from './AnnounceMultiTeamModal';
import CreateSubTeamModal from './CreateSubTeamModal'; // <--- ADDED THIS IMPORT

// --- NEW: Handovers & FAQ Section imports ---
import HandoversSection from './EndorsementModal';
import FAQSection from './FAQSection';

// --- NEW LANGUAGE CONTEXT IMPORT ---
import { LanguageContext } from '../contexts/LanguageContext.jsx';

// --- Setup Calendar Localizer ---
const localizer = momentLocalizer(moment);

// --- Constants & Helpers for Sub-projects ---
const getStatusColor = (status) => {
    switch(status) {
        case 'completed': return 'bg-green-100 text-green-700 border-green-200';
        case 'in_progress': return 'bg-blue-100 text-blue-700 border-blue-200';
        case 'paused': return 'bg-red-100 text-red-700 border-red-200';
        default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
};

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
const UserGroupIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.08-.986-.234-1.224M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.08-.986.234-1.224M12 11c-1.657 0-3-1.343-3-3s1.343-3 3-3 3 1.343 3 3-1.343 3-3 3zM3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);
const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const HandoversIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M12 4v4m-7 8a2 2 0 012-2h10a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z" />
  </svg>
);

// --- NEW: FAQ Icon ---
const FAQIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// --- NEW: Trash Icon ---
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);


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

// --- NEW CALENDAR HELPER FUNCTIONS ---
const normalizeValueToDate = (val) => {
  if (!val) return null;
  if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate();
  if (val instanceof Date) return val;
  const parsed = new Date(val);
  if (!isNaN(parsed)) return parsed;
  return null;
};

// ---------- Constants for pagination / UI ----------
const TEAMS_PAGE_SIZE = 18;
const USERS_PAGE_SIZE = 30;
const DEBOUNCE_MS = 350;

// ---------- AnnouncementsSection (ADDED LANGUAGE HOOK) ----------
const AnnouncementsSection = ({ teamId, refreshTrigger, isAdmin, onEdit }) => {
  const { t } = useContext(LanguageContext); 
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
    } catch (err) {
      console.error("Error fetching announcements:", err);
      setError(t('admin.updatesError')); 
    }
    finally { setIsLoading(false); }
  }, [teamId, t]);

  useEffect(() => { fetchAnnouncements(); }, [teamId, fetchAnnouncements, refreshTrigger]);

  const handleDelete = async (updateId) => {
    if (!window.confirm(t('common.confirmDelete'))) return; 
    try {
      await deleteDoc(doc(db, `teams/${teamId}/announcements`, updateId));
      setUpdates(prev => prev.filter(u => u.id !== updateId));
    }
    catch (err) {
      console.error("Failed to delete update:", err);
      setError(t('common.deleteError')); 
    }
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border h-full">
      <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">{t('admin.tabUpdates')}</h3>
      {isLoading && <Spinner />}
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      {!isLoading && updates.length === 0 && ( <p className="text-sm text-gray-500 italic">{t('admin.noUpdates')}</p> )}
      {!isLoading && updates.length > 0 && (
        <ul className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
          {updates.map(update => (
            <li key={update.id} className={`text-sm p-3 border-l-4 rounded-r bg-gray-50 ${update.type === 'meeting' ? 'border-blue-500' : 'border-green-500'}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1">
                  {update.type === 'meeting' ? (
                    <>
                      <strong className="font-medium text-blue-700">{t('admin.meeting')}</strong> {update.title} <br />
                      <span className="text-xs text-gray-500">{t('admin.starts')} {formatDate(update.startDateTime) || 'N/A'}</span>
                      {update.endDateTime && <span className="text-xs text-gray-500"> - {t('admin.ends')} {formatDate(update.endDateTime)}</span>}
                      {update.description && <p className="text-xs text-gray-600 mt-1 line-clamp-4">{update.description}</p>}
                      {update.meetingLink && ( <a href={update.meetingLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs mt-1 block">{t('admin.joinMeeting')}</a> )}
                      <p className="text-xs text-gray-500 mt-2">{t('admin.scheduledBy')} {update.creatorDisplayName} at {formatDate(update.createdAt, { dateOnly: true })}</p>
                    </>
                  ) : (
                    <>
                      <strong className="font-medium text-green-700">{t('admin.announcement')}</strong> {update.text} <br />
                      <p className="text-xs text-gray-500">{t('admin.by')} {update.creatorDisplayName} at {formatDate(update.createdAt, { dateOnly: true })}</p>
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

// ---------- MembersSection (MODIFIED: Added onRemoveMember prop and button) ----------
const MembersSection = ({ membersDetails, teamData, canManageMembers, onChangeRole, onInviteClick, onRemoveMember }) => {
  const { t } = useContext(LanguageContext); 

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border h-full">
      <div className="flex justify-between items-center mb-3 border-b pb-2">
        <h3 className="text-lg font-semibold text-gray-700">{t('admin.tabMembers')}</h3>
        {canManageMembers && ( <button onClick={onInviteClick} className="text-xs bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-3 rounded-md shadow-sm transition-colors">{t('admin.invite')}</button> )}
      </div>
      {membersDetails.length > 0 ? (
        <ul className="list-none space-y-2 max-h-[420px] overflow-y-auto pr-2">
          {membersDetails.map((member) => {
            const uid = member.uid;
            const isCreator = teamData?.createdBy === uid;
            const roleMap = teamData?.roles || {};
            const roleRaw = isCreator ? 'creator' : (roleMap?.[uid] || 'member');
            const roleLabel = roleRaw === 'creator' ? t('admin.creator') : (roleRaw === 'admin' ? t('admin.admin') : t('common.member'));
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
                    {isCreator ? ( <div className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded border border-yellow-200">{t('admin.creator')}</div> ) : (
                       
                      <>
                        <select value={roleRaw} onChange={(e) => onChangeRole(uid, e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1 bg-white hover:border-gray-400" title={t('admin.changeRole')}>
                          <option value="admin">{t('admin.admin')}</option>
                          <option value="member">{t('common.member')}</option>
                        </select>
                        {/* --- Remove Member Button --- */}
                        <button
                          onClick={() => onRemoveMember(uid)}
                          className="p-1.5 text-red-600 hover:bg-red-100 rounded-md"
                          title={t('common.remove')}
                        >
                          <TrashIcon />
                        </button>
                      </>
                       
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : ( <p className="text-sm text-gray-500 italic">{t('admin.noMembers')}</p> )}
    </div>
  );
};


// ---------- UserManagementSection (MODIFIED: Added onDeleteUser prop and button) ----------
const UserManagementSection = ({ allUsers, allTeams, loadingUsers, errorUsers, onLoadMoreUsers, hasMoreUsers, onToggleCompact, usersViewCompact, onDeleteUser }) => {
  const { t } = useContext(LanguageContext); 

  const findTeamsForUser = useCallback((userId) => {
    return allTeams.filter(team => {
      // Handle both string array and object array for members
      return team.members?.some(member => {
        if (typeof member === 'string') return member === userId;
        if (typeof member === 'object' && member.uid) return member.uid === userId;
        return false;
      });
    })
    .map(team => ({ id: team.id, teamName: team.teamName || `Team ${team.id}` }));
  }, [allTeams]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center text-gray-800"><UserGroupIcon /> {t('admin.allRegisteredUsers')} ({allUsers.length})</h3>
        <div className="flex items-center gap-2">
          <button onClick={onToggleCompact} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">
            {usersViewCompact ? t('common.gridView') : t('common.compactView')}
          </button>
        </div>
      </div>

      {loadingUsers && <Spinner />}
      {errorUsers && <p className="text-red-600 text-sm">{errorUsers}</p>}
      {!loadingUsers && !errorUsers && (
        <div className="space-y-4 max-h-[58vh] overflow-y-auto pr-2 custom-scrollbar">
          {allUsers.length === 0 ? (
            <p className="text-gray-500 italic text-center py-4">{t('admin.noUsers')}</p>
          ) : (
            usersViewCompact ? (
              <div className="space-y-1">
                {allUsers.map(user => {
                  const userTeams = findTeamsForUser(user.uid);
                  const role = user.role || 'Member';
                  const isAdmin = role === 'Master Admin';
                  return (
                    <div key={user.uid} className="flex items-center justify-between gap-3 p-2 bg-gray-50 rounded border border-gray-100 text-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-sm font-semibold text-blue-800">
                          {(user.displayName || user.email || '?')[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-800">
                            {user.displayName || user.email || user.uid}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{user.email || t('admin.noEmail')}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 ml-3">
                        <div className="text-xs whitespace-nowrap">
                          {isAdmin ? (
                            <span className="inline-block text-xs font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">{t('admin.masterShort')}</span>
                          ) : (
                            <span className="inline-block text-xs font-medium bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">{t('common.member')}</span>
                          )}
                        </div>

                        <div className="hidden sm:flex sm:items-center sm:gap-1 sm:max-w-[200px]">
                          {userTeams.length > 0 ? userTeams.slice(0,3).map(t => (
                            <span key={t.id} className="inline-block text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">{t.teamName}</span>
                          )) : (<span className="text-xs italic text-gray-500">{t('admin.noTeams')}</span>)}
                        </div>
                         
                        {/* --- NEW DELETE USER BUTTON (COMPACT) --- */}
                        {!isAdmin && (
                          <button
                            onClick={() => onDeleteUser(user.uid, user.email)}
                            className="p-1.5 text-red-600 hover:bg-red-100 rounded-md"
                            title={t('common.delete')}
                          >
                            <TrashIcon />
                          </button>
                        )}
                        {/* --- END NEW BUTTON --- */}
                      </div>
                    </div>
                  );
                })}
              </div>
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
                        {isAdmin ? ( <span className="whitespace-nowrap ml-auto sm:ml-2 text-xs font-bold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full">{t('header.masterAdmin').toUpperCase()}</span> ) : ( <span className="whitespace-nowrap ml-auto sm:ml-2 text-xs font-medium bg-gray-200 text-gray-700 px-2.5 py-0.5 rounded-full">{t('common.member')}</span> )}
                      </p>
                      <p className="text-xs text-gray-600 truncate">{user.email || t('admin.noEmailProvided')}</p>
                      <p className="text-xs text-gray-400 font-mono mt-1 truncate">UID: {user.uid}</p>
                    </div>
                    <div className="text-xs text-gray-700 sm:text-right flex-shrink-0 sm:max-w-[40%]">
                      <p className="font-medium mb-1 text-gray-500">{t('admin.memberOf')}:</p>
                      {userTeams.length > 0 ? (
                        <div className="flex flex-wrap gap-1 sm:justify-end">
                          {userTeams.map(team => ( <span key={team.id} className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium" title={team.teamName}>{team.teamName}</span> ))}
                        </div>
                      ) : ( <p className="italic text-gray-500">{t('admin.notInTeams')}</p> )}
                       
                      {/* --- NEW DELETE USER BUTTON (GRID) --- */}
                      {!isAdmin && (
                        <button
                          onClick={() => onDeleteUser(user.uid, user.email)}
                          className="inline-flex items-center gap-1 mt-3 text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                          title={t('common.delete')}
                        >
                          <TrashIcon /> {t('common.delete')}
                        </button>
                      )}
                      {/* --- END NEW BUTTON --- */}
                    </div>
                  </div>
                );
              })
            )
          )}

          {hasMoreUsers && (
            <div className="flex justify-center">
              <button onClick={onLoadMoreUsers} className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50">{t('common.loadMoreUsers')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------- NEW: ManualNoteModal (ADDED LANGUAGE HOOK) ----------
const ManualNoteModal = ({ isOpen, onClose, modalData, onSave, onDelete, isAdmin }) => {
  const { t } = useContext(LanguageContext); 
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (modalData?.type === 'new') {
      setTitle('');
      setDescription('');
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
    if (!title) return; // Only title is required
    const start = modalData.start instanceof Date ? modalData.start : new Date(modalData.start);
    const end = modalData.end instanceof Date ? modalData.end : new Date(modalData.end);
    await onSave(title, description, start, end); // Pass description
    onClose();
  };

  const handleDelete = async () => {
    if (!event || !event.id) return;
    await onDelete(event.id);
    onClose();
  };

  let modalTitle = t('calendar.modalTitle');
  if (isNew) modalTitle = `${t('calendar.addNoteTitle')} ${moment(modalData.start).format('MMM D, YYYY')}`;
  if (isView && event) modalTitle = event.title;

  return (
    <div aria-modal="true" role="dialog" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">{modalTitle}</h3>

        {isNew && (
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

        {isView && event && (
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
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md">{t('common.cancel')}</button>
          {isNew && (
            <button type="button" onClick={handleSave} disabled={!title} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md disabled:bg-gray-400">{t('common.saveNote')}</button>
          )}
          {isView && event?.type === 'manual' && isAdmin && (
            <button type="button" onClick={handleDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md">{t('common.deleteNote')}</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------- NEW: TeamCalendar (ADDED LANGUAGE HOOK & Completed tab) ----------
const TeamCalendar = ({ teamId, isAdmin, refreshTrigger }) => {
  const { t } = useContext(LanguageContext); 
  const [events, setEvents] = useState([]); // active events: meetings + notes + non-completed tasks
  const [completedEvents, setCompletedEvents] = useState([]); // completed tickets shown separately
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);

  // date/view state so toolbar navigation works reliably
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('month');

  // mode toggle
  const [calendarMode, setCalendarMode] = useState('calendar'); // 'calendar' | 'completed'

  // --- NEW: Create memoized messages object for calendar toolbar ---
  const messages = useMemo(() => ({
    today: t('calendar.today'),
    previous: t('calendar.previous'),
    next: t('calendar.next'),
    month: t('calendar.month'),
    week: t('calendar.week'),
    day: t('calendar.day'),
    agenda: t('calendar.agenda'),
    allDay: t('calendar.allDay', 'All Day'),
    date: t('calendar.date', 'Date'),
    time: t('calendar.time', 'Time'),
    event: t('calendar.event', 'Event'),
    showMore: total => t('calendar.showMore', `+ ${total} more`),
    noEventsInRange: t('calendar.noEventsInRange', 'There are no events in this range.'),
  }), [t]);

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

        // Completed timestamp fallback: prefer endDate, then completedAt, updatedAt, createdAt
        const completedAt =
          endDate ||
          normalizeValueToDate(data.completedAt) ||
          normalizeValueToDate(data.updatedAt) ||
          normalizeValueToDate(data.createdAt) ||
          null;

        if (isCompleted) {
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
          // For active tasks, prefer endDate (due) or startDate to display on calendar
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

      const calendarEvents = [...activeTaskEvents, ...meetingEvents, ...noteEvents];

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
    setModalData({ type: 'view', event });
    setIsNoteModalOpen(true);
  }, []);

  const handleDoubleClickEvent = useCallback((event) => {
    setModalData({ type: 'view', event });
    setIsNoteModalOpen(true);
  }, []);

  const handleSaveNote = useCallback(async (title, description, start, end) => {
    if (!title || !teamId) return;
    try {
      const newNote = {
        title,
        description,
        start: start instanceof Date ? start : new Date(start),
        end: end instanceof Date ? end : new Date(end),
        allDay: true,
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

  const eventPropGetter = useCallback((event) => {
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

  if (loading) return <Spinner />;

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="text-lg font-semibold">{t('admin.tabCalendar')}</h3>
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

      {calendarMode === 'calendar' && (
        <div style={{ height: 520, padding: '1rem' }}>
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

      {calendarMode === 'completed' && (
        <div style={{ height: 520, padding: '1rem' }}>
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
        onSave={handleSaveNote}
        onDelete={handleDeleteNote}
        isAdmin={isAdmin}
      />
    </div>
  );
};


// ---------- Main Dashboard Component ----------
export default function MasterAdminDashboard() {
  const { t } = useContext(LanguageContext); 

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
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [isMultiAnnounceModalOpen, setIsMultiAnnounceModalOpen] = useState(false);

  // --- NEW: Create Sub Team Modal State ---
  const [isSubProjectModalOpen, setIsSubProjectModalOpen] = useState(false);
  const [subProjectTargetParent, setSubProjectTargetParent] = useState(null);

  // debounce refs
  const teamsDebounceRef = useRef(null);
  const usersDebounceRef = useRef(null);

  // helpers
  const refreshAnnouncements = useCallback(() => { setAnnouncementRefreshKey(prev => prev + 1); }, []);

  const openEditModal = (update) => { setEditTarget(update); setIsEditModalOpen(true); };
  const closeEditModal = () => { setEditTarget(null); setIsEditModalOpen(false); };
  const onInviteCompleteRefresh = () => { if (selectedTeam) fetchTeamDetails(selectedTeam.id); };

  // --- NEW: Handler for opening sub-project creation modal ---
  const handleOpenSubModal = (parentTeam) => {
    setSubProjectTargetParent(parentTeam);
    setIsSubProjectModalOpen(true);
  };
  
  // Callback when sub-project created -> refresh teams
  const handleSubProjectCreated = () => {
    fetchTeamsPage({ reset: true });
  }


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
      setTeamsError(t('admin.loadTeamsError')); 
    } finally {
      setTeamsLoading(false);
    }
  }, [teamsLastDoc, t]); 

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
      setUsersError(t('admin.loadUsersError')); 
    } finally {
      setUsersLoading(false);
    }
  }, [usersLastDoc, t]); 

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
       
      const validMemberUIDs = memberUIDs
        .map(member => (typeof member === 'object' && member.uid) ? member.uid : (typeof member === 'string' ? member : null))
        .filter(uid => uid && typeof uid === 'string' && uid.trim() !== '');
      const uniqueMemberUIDs = [...new Set(validMemberUIDs)];

      if (uniqueMemberUIDs.length > 0) {
        const memberPromises = uniqueMemberUIDs.map(uid => getDoc(doc(db, "users", uid)));
        const memberDocsSnap = await Promise.all(memberPromises);
        setMembersDetails(memberDocsSnap.map((userDoc, index) => {
          const uid = uniqueMemberUIDs[index];
          return userDoc.exists() ? { uid, ...userDoc.data() } : { uid, displayName: null, email: t('admin.profileNotFound') }; 
        }));
      } else {
        setMembersDetails([]);
      }
    } catch (err) {
      console.error("Error fetching team details:", err);
      setTeamsError(t('admin.loadTeamDetailsError')); 
    } finally {
      setIsLoadingDetails(false);
    }
  }, [t]); 

  // --------- Role change ----------
  const changeRole = async (memberUid, newRole) => {
    if (!teamData || teamData.createdBy === memberUid) return;
    try {
      const teamDocRef = doc(db, 'teams', teamData.id);
      const permsForRole = newRole === 'admin' ? { announcements: true, schedule: true } : { announcements: false, schedule: false };
      await updateDoc(teamDocRef, { [`roles.${memberUid}`]: newRole, [`permissions.${memberUid}`]: permsForRole });
      setTeamData(prev => ({ ...prev, roles: { ...(prev?.roles || {}), [memberUid]: newRole }, permissions: { ...(prev?.permissions || {}), [memberUid]: permsForRole } }));
    } catch (err) {
      console.error('Failed to change role:', err);
      alert(t('admin.changeRoleError')); 
    }
  };

  // --------- Delete team ----------
  const handleDeleteTeam = async (teamId) => {
    if (!window.confirm(t('common.confirmDeleteTeam'))) return; 
    try {
      await deleteDoc(doc(db, 'teams', teamId));
      setTeams(prev => prev.filter(t => t.id !== teamId));
      if (selectedTeam?.id === teamId) setSelectedTeam(null);
    } catch (err) {
      console.error('Failed to delete team:', err);
      alert(t('common.deleteTeamError')); 
    }
  };

  // --------- Remove member from team ----------
  const handleRemoveMember = async (memberUid) => {
    if (!teamData || !teamData.id || !memberUid) return;

    if (teamData.createdBy === memberUid) {
      alert(t('admin.cannotRemoveCreator', 'Cannot remove the team creator.')); 
      return;
    }

    if (!window.confirm(t('common.confirmDelete', 'Are you sure you want to delete this?'))) {
      return;
    }

    try {
      const teamDocRef = doc(db, 'teams', teamData.id);

      // Create new arrays/objects by filtering/deleting
      const newMembers = (teamData.members || []).filter(uid => uid !== memberUid);
       
      const newRoles = { ...(teamData.roles || {}) };
      delete newRoles[memberUid];
       
      const newPermissions = { ...(teamData.permissions || {}) };
      delete newPermissions[memberUid];

      // Update Firestore
      await updateDoc(teamDocRef, {
        members: newMembers,
        roles: newRoles,
        permissions: newPermissions
      });

      // Update local state immediately for UI responsiveness
      setTeamData(prev => ({
        ...prev,
        members: newMembers,
        roles: newRoles,
        permissions: newPermissions
      }));
      setMembersDetails(prev => prev.filter(m => m.uid !== memberUid));

    } catch (err) {
      console.error('Failed to remove member:', err);
      alert(t('admin.removeMemberError', 'Failed to remove member. Please try again.')); 
    }
  };

  // --------- Delete User (from /users collection) ----------
  const handleDeleteUser = async (userId, userEmail) => {
    if (!userId) return;

    // Stronger confirmation for a destructive action
    const confirmMsg = t(
      'admin.confirmDeleteUser', 
      `Are you sure you want to permanently delete the user document for "${userEmail || userId}"? This action CANNOT be undone and only deletes their database record, not their login account.`,
      { email: userEmail || userId } // Pass email for interpolation
    );

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      const userDocRef = doc(db, 'users', userId);
      await deleteDoc(userDocRef);

      // Update local state immediately
      setAllUsers(prev => prev.filter(u => u.uid !== userId));
       
      // Also, if this user was in the currently viewed team, refresh that list
      if (selectedTeam && membersDetails.some(m => m.uid === userId)) {
        setMembersDetails(prev => prev.filter(m => m.uid !== userId));
      }
       
      alert(t('admin.deleteUserSuccess', 'User document deleted successfully. Note: Their Auth account (login) may still exist.'));

    } catch (err) {
      console.error('Failed to delete user document:', err);
      alert(t('admin.deleteUserError', 'Failed to delete user document. Please try again.'));
    }
  };


  // --------- Handlers for selecting and viewing a team ----------
  const handleViewTeam = (team) => { setSelectedTeam(team); setActiveTab('projects'); };
  useEffect(() => {
    if (selectedTeam) fetchTeamDetails(selectedTeam.id);
    else { setTeamData(null); setMembersDetails([]); }
  }, [selectedTeam, fetchTeamDetails]);

  // --------- Initial load ----------
  useEffect(() => {
    fetchTeamsPage({ reset: true });
    fetchUsersPage({ reset: true });
  }, []); 

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

  // Tab classes
  const tabClass = (tabName) => {
    const base = "inline-flex items-center pb-3 px-1 border-b-2 font-medium text-sm";
    return activeTab === tabName ? `${base} border-blue-500 text-blue-600` : `${base} border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300`;
  };

  // Simple UI controls
  const isInitialLoading = teamsLoading || usersLoading;

  // --- Grouping Logic for Nested Display (LIST VIEW) ---
  // 1. Filter out teams that have NO parent (The Main Boxes)
  const parentTeams = filteredTeams.filter(team => !team.parentTeamId);
  
  // 2. Filter out teams that DO have a parent (The Sub Strips)
  const subTeams = filteredTeams.filter(team => team.parentTeamId);


  return (
    <>
      <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
        <main className="flex-1 w-full py-6">
          <div className="flex justify-between items-center mb-6 px-4 sm:px-6 lg:px-8">
            <div>
              <h2 className="text-2xl font-semibold text-gray-800">{t('admin.title')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('admin.subtitle')}</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                aria-label={t('admin.searchTeams')}
                value={teamsSearch}
                onChange={(e) => handleTeamsSearchChange(e.target.value)}
                placeholder={t('admin.searchTeams')}
                className="text-sm px-3 py-2 rounded border border-gray-300 bg-white"
              />
              <input
                aria-label={t('admin.searchUsers')}
                value={usersSearch}
                onChange={(e) => handleUsersSearchChange(e.target.value)}
                placeholder={t('admin.searchUsers')}
                className="text-sm px-3 py-2 rounded border border-gray-300 bg-white"
              />
              <button onClick={() => setIsMultiAnnounceModalOpen(true)} disabled={teams.length === 0} className="inline-flex items-center bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 px-3 rounded-md shadow-sm transition-colors disabled:opacity-50">
                <MegaphoneIcon /> {t('admin.sendGlobalAnnouncement')}
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
              {/* GRID: Teams on the left, Users on the right (responsive) */}
              <div className="mx-4 sm:mx-6 lg:mx-8 mb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1) Teams list (paginated + compact toggle) */}
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">{t('admin.allTeams')} ({filteredTeams.length})</h3>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setTeamsViewCompact(v => !v); }} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">{teamsViewCompact ? t('common.gridView') : t('common.compactView')}</button>
                      <button onClick={() => fetchTeamsPage({ reset: true })} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">{t('common.refresh')}</button>
                    </div>
                  </div>

                  {/* -------------------- START TEAMS RENDERING LOGIC -------------------- */}
                  {filteredTeams.length === 0 ? (
                    <p className="text-gray-500">{t('admin.noTeamsFound')}</p>
                  ) : (
                    <>
                    {/* --- GRID / COMPACT VIEW (Updated to Nested Card Style) --- */}
                    {teamsViewCompact ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-h-[52vh] overflow-y-auto pr-2">
                            {parentTeams.length === 0 ? (
                                <div className="col-span-full text-center text-gray-500 italic py-4">No main projects found.</div>
                            ) : (
                                parentTeams.map(parent => {
                                    // Use 'teams' (full list) to find children so the card is complete
                                    // even if the search filter is applied (optional choice, but standard for this UI)
                                    // Or use 'subTeams' (filtered) if we only want to show searched children.
                                    // Let's use 'teams' to find children to replicate HomePage logic fully:
                                    const children = teams.filter(t => t.parentTeamId === parent.id);

                                    return (
                                        <div key={parent.id} className="bg-white rounded-lg shadow-md border-2 border-gray-800 flex flex-col h-full overflow-hidden">
                                            
                                            {/* 1. Main Project Header */}
                                            <div className="p-5 border-b-2 border-gray-800 bg-white min-h-[120px] relative group">
                                                {/* Replaced Link with onClick handler to open side panel */}
                                                <div 
                                                    onClick={() => handleViewTeam(parent)} 
                                                    className="block h-full cursor-pointer"
                                                >
                                                    <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-700 transition-colors pr-8">
                                                        {parent.teamName}
                                                    </h3>
                                                    <p className="text-sm text-gray-500 mt-2 line-clamp-2 pr-8">
                                                        {parent.description || t('admin.noDescription')}
                                                    </p>
                                                </div>

                                                {/* ACTION AREA (Absolute Top Right) */}
                                                <div className="absolute top-4 right-4">
                                                    <button 
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleDeleteTeam(parent.id);
                                                        }}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                                                        title={t('common.delete')}
                                                    >
                                                        <TrashIcon />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* 2. Sub-Projects Stack */}
                                            <div className="bg-gray-50 flex-1 p-2 space-y-2">
                                                {children.length > 0 ? (
                                                    children.map((sub) => (
                                                        <div key={sub.id} className="flex items-center gap-1">
                                                            <div 
                                                                onClick={() => handleViewTeam(sub)}
                                                                className="flex-1 block bg-white border-2 border-gray-800 rounded p-3 hover:bg-blue-50 transition-all shadow-sm group flex justify-between items-center cursor-pointer"
                                                            >
                                                                <span className="font-bold text-gray-800 text-sm truncate pr-2">
                                                                    {sub.teamName}
                                                                </span>
                                                                <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${getStatusColor(sub.status)}`}>
                                                                    {t(`status.${sub.status || 'not_started'}`, sub.status?.replace('_', ' ') || 'Not Started')}
                                                                </span>
                                                            </div>

                                                            {/* DELETE SUB-PROJECT BUTTON */}
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteTeam(sub.id);
                                                                }}
                                                                className="bg-white border-2 border-gray-800 p-3 rounded hover:bg-red-50 hover:border-red-500 hover:text-red-600 transition-all"
                                                                title={t('common.delete')}
                                                            >
                                                                <TrashIcon />
                                                            </button>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-center py-4 text-gray-400 text-xs italic border-2 border-dashed border-gray-200 rounded">
                                                        {t('admin.noSubProjects', 'No sub-projects yet')}
                                                    </div>
                                                )}

                                                {/* 3. Add Button */}
                                                <button 
                                                    onClick={() => handleOpenSubModal(parent)}
                                                    className="w-full py-2 border-2 border-dashed border-gray-400 text-gray-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded font-bold text-xl transition-all flex items-center justify-center"
                                                    title={t('home.addSubProject', 'Add Sub-Project')}
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    ) : (
                        /* --- LIST / HIERARCHY VIEW (Original) --- */
                        <div className="max-h-[52vh] overflow-y-auto pr-2 space-y-4">
                            {parentTeams.length === 0 ? (
                                <p className="text-gray-500 italic text-sm p-2">No main projects found matching filter.</p>
                            ) : (
                                parentTeams.map(parent => {
                                    // Find children belonging to this specific parent
                                    const children = subTeams.filter(sub => sub.parentTeamId === parent.id);
                                    
                                    return (
                                        <div key={parent.id} className={`bg-white rounded-lg shadow-sm border flex flex-col transition-shadow hover:shadow-md overflow-hidden ${ selectedTeam?.id === parent.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200' }`}>
                                            {/* Parent Header */}
                                            <div className="p-4 flex justify-between items-start">
                                                <div className="flex-1 min-w-0 mr-2">
                                                    <div className="flex items-center mb-1">
                                                        <span className="font-bold text-gray-900 text-lg truncate mr-2">{parent.teamName}</span>
                                                        <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><UsersIcon /> {parent.members?.length || 0}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 line-clamp-2">{parent.description || t('admin.noDescription')}</p>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <button onClick={() => handleViewTeam(parent)} className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${ selectedTeam?.id === parent.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100' }`}>{selectedTeam?.id === parent.id ? t('common.selected') : t('common.view')}</button>
                                                    <button onClick={() => handleDeleteTeam(parent.id)} className="text-xs px-3 py-1.5 rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition-colors">{t('common.delete')}</button>
                                                </div>
                                            </div>

                                            {/* Sub-Projects Strips (Nested) */}
                                            {children.length > 0 && (
                                                <div className="bg-gray-50 p-2 space-y-1 border-t border-gray-200">
                                                    <p className="text-[10px] uppercase text-gray-400 font-semibold px-1 mb-1">Sub-Projects</p>
                                                    {children.map(sub => (
                                                        <div key={sub.id} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200 shadow-sm hover:bg-blue-50 transition-colors">
                                                            {/* Left Side: Link to Sub View */}
                                                            <button 
                                                                onClick={() => handleViewTeam(sub)}
                                                                className="flex-1 text-left flex items-center justify-between pr-2 min-w-0"
                                                            >
                                                                <span className={`text-sm font-medium truncate ${selectedTeam?.id === sub.id ? 'text-blue-700' : 'text-gray-700'}`}>
                                                                    {sub.teamName}
                                                                </span>
                                                                <span className={`ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${getStatusColor(sub.status)}`}>
                                                                    {t(`status.${sub.status || 'not_started'}`, sub.status?.replace('_', ' ') || 'Not Started')}
                                                                </span>
                                                            </button>

                                                            {/* Right Side: Delete Sub Button */}
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteTeam(sub.id);
                                                                }}
                                                                className="text-gray-400 hover:text-red-600 p-1 rounded-md transition-colors"
                                                                title={t('common.delete')}
                                                            >
                                                                <TrashIcon />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                    
                    {/* Load More Button */}
                    {teamsHasMore && (
                        <div className="flex justify-center pt-2">
                            <button onClick={() => fetchTeamsPage({ reset: false })} className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50">{t('common.loadMoreTeams')}</button>
                        </div>
                    )}
                    </>
                  )}
                  {/* -------------------- END TEAMS RENDERING LOGIC -------------------- */}
                  
                </div>

                {/* 2) Users (paginated + compact) */}
                <div>
                  <UserManagementSection
                    allUsers={filteredUsers}
                    allTeams={teams}
                    loadingUsers={usersLoading}
                    errorUsers={usersError}
                    onLoadMoreUsers={() => fetchUsersPage({ reset: false })}
                    hasMoreUsers={usersHasMore}
                    onToggleCompact={() => setUsersViewCompact(v => !v)}
                    usersViewCompact={usersViewCompact}
                    onDeleteUser={handleDeleteUser}
                  />
                </div>
              </div>

              {/* 3) Selected Team Details (full width below the two-column area) */}
              {selectedTeam && (
                <div className="bg-white rounded-t-lg shadow-md border border-gray-200 mx-4 sm:mx-6 lg:mx-8">
                  <div className="p-6 flex justify-between items-center px-4 sm:px-6 lg:px-8">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-800">{t('admin.managingTeam')} <span className="text-blue-600">{selectedTeam.teamName}</span></h3>
                      <p className="text-sm text-gray-500">{selectedTeam.description || t('admin.noDescription')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setSelectedTeam(null)} className="text-sm font-medium text-gray-600 hover:text-red-500">&times; {t('common.close')}</button>
                    </div>
                  </div>

                  <div className="px-4 sm:px-6 lg:px-8 border-b border-gray-200 flex gap-2">
                    <button onClick={() => setIsAnnounceModalOpen(true)} className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md shadow-sm">{t('admin.announceTeam')}</button>
                    <button onClick={() => setIsScheduleModalOpen(true)} className="bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md shadow-sm">{t('admin.scheduleMeeting')}</button>
                  </div>

                  {/* --- Tabs (Removed Progress Tab) --- */}
                  <div className="px-4 sm:px-6 lg:px-8 border-b border-gray-200">
                    <nav className="flex space-x-6 overflow-x-auto" aria-label="Tabs">
                      <button onClick={() => setActiveTab('projects')} className={tabClass('projects')}><TableIcon /> {t('admin.tabProjects')}</button>
                      <button onClick={() => setActiveTab('calendar')} className={tabClass('calendar')}><CalendarIcon /> {t('admin.tabCalendar')}</button>
                      <button onClick={() => setActiveTab('members')} className={tabClass('members')}><UsersIcon /> {t('admin.tabMembers')}</button>
                      <button onClick={() => setActiveTab('updates')} className={tabClass('updates')}><MegaphoneIcon /> {t('admin.tabUpdates')}</button>
                      <button onClick={() => setActiveTab('handovers')} className={tabClass('handovers')}><HandoversIcon /> {t('admin.tabHandovers', 'Handovers')}</button>
                      <button onClick={() => setActiveTab('faq')} className={tabClass('faq')}><FAQIcon /> {t('admin.tabFAQ', 'FAQ')}</button>
                    </nav>
                  </div>

                  <div className="min-h-[360px]">
                    {isLoadingDetails && ( <div className="p-6 flex justify-center"><Spinner /></div> )}
                    {!isLoadingDetails && teamData && (
                      <>
                        {activeTab === 'projects' && ( 
                          <TeamProjectTable 
                            teamId={selectedTeam.id} 
                            onTaskChange={refreshAnnouncements} 
                            isMasterAdminView={true} 
                          /> 
                        )}
                        
                        {activeTab === 'calendar' && (
                          <div className="bg-white rounded-lg shadow-sm border-t-0 overflow-hidden p-4">
                            <TeamCalendar 
                              teamId={selectedTeam.id} 
                              isAdmin={true} // Master Admin is always admin
                              refreshTrigger={announcementRefreshKey} 
                            />
                          </div>
                        )}
                        
                        {activeTab === 'members' && ( <div className="p-4 sm:p-6 lg:p-8"><MembersSection membersDetails={membersDetails} teamData={teamData} canManageMembers={true} onChangeRole={changeRole} onInviteClick={() => setIsInviteModalOpen(true)} onRemoveMember={handleRemoveMember} /></div> )}
                        
                        {activeTab === 'updates' && ( <div className="p-4 sm:p-6 lg:p-8"><AnnouncementsSection teamId={selectedTeam.id} refreshTrigger={announcementRefreshKey} isAdmin={true} onEdit={openEditModal}/></div> )}

                        {/* --- Handovers tab content --- */}
                        {activeTab === 'handovers' && (
                          <div className="p-4 sm:p-6 lg:p-8">
                            <HandoversSection teamId={selectedTeam.id} />
                          </div>
                        )}

                        {/* --- FAQ tab content --- */}
                        {activeTab === 'faq' && (
                          <div className="p-4 sm:p-6 lg:p-8 h-[600px]">
                            <FAQSection teamId={selectedTeam.id} isAdmin={true} />
                          </div>
                        )}
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
      <AnnounceMultiTeamModal isOpen={isMultiAnnounceModalOpen} onClose={() => setIsMultiAnnounceModalOpen(false)} allTeams={teams} onAnnouncementSent={() => { if (selectedTeam) refreshAnnouncements(); }} />
      
      {/* --- NEW: Create Sub Team Modal --- */}
      <CreateSubTeamModal
        isOpen={isSubProjectModalOpen}
        onClose={() => setIsSubProjectModalOpen(false)}
        parentTeamId={subProjectTargetParent?.id}
        parentTeamName={subProjectTargetParent?.teamName}
        onTeamCreated={handleSubProjectCreated}
      />
    </>
  );
}