import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { db, storage, auth } from '../firebaseConfig';
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  deleteDoc,
  getDocs // NEW: For fetching history
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  // NEW: Added uploadBytes for new features (though not strictly needed for this implementation, keeping the potential import)
} from 'firebase/storage';
import './NotePopup.css';
import { LanguageContext } from '../contexts/LanguageContext';

/* ---------- Icons ---------- */
const PaperClipIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.414a4 4 0 00-5.656-5.656l-6.415 6.415a6 6 0 108.486 8.486L20.5 13" />
  </svg>
);
const ChatBubbleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
const PencilIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" />
  </svg>
);
const ImageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l-1.586-1.586a2 2 0 00-2.828 0L6 14m6-6l.01.01" />
  </svg>
);
const DetailsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const HistoryIcon = () => ( // NEW ICON
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const UserGroupIcon = () => ( // NEW ICON
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20v-2a3 3 0 015.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M12 11a4 4 0 110-8 4 4 0 010 8z" />
  </svg>
);


/* ---------- Small spinners ---------- */
const Spinner = () => <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>;
const MiniSpinner = () => <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>;

/* ---------- ModalShell (overlay & scroll lock) ---------- */
const ModalShell = ({ children, onClose }) => {
  const width = 1200;
  const maxWidth = '95vw';
  const maxHeight = '90vh';

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-[1001] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{ width: `${width}px`, maxWidth, maxHeight, height: '85vh' }}
      >
        {children}
      </div>
    </div>
  );
};

/* ---------- Editor toolbar ---------- */
const EditorToolbar = ({ onFormat, onInsertLink, showLinkInput, linkUrl, setLinkUrl, onApplyLink, onCancelLink }) => {
  const btn = "p-1.5 border border-gray-300 rounded cursor-pointer min-w-[30px] bg-white hover:bg-gray-100";
  const select = "py-1 px-1.5 border border-gray-300 rounded bg-white text-sm";
  const colorInputStyle = "p-0 border-none w-7 h-7 cursor-pointer bg-transparent";
  const linkInputStyle = "border border-gray-400 rounded px-2 py-1 text-sm outline-none";

  const handleMouseDown = (e, cmd, val = null) => { e.preventDefault(); onFormat(cmd, val); };
  return (
    <div className="flex gap-2 p-2 border-b border-gray-200 flex-wrap bg-gray-50 relative">
      <button onMouseDown={(e) => handleMouseDown(e, 'bold')} className={`${btn} font-bold`}>B</button>
      <button onMouseDown={(e) => handleMouseDown(e, 'italic')} className={`${btn} italic`}>I</button>
      <button onMouseDown={(e) => handleMouseDown(e, 'underline')} className={`${btn} underline`}>U</button>
      <button onMouseDown={(e) => handleMouseDown(e, 'strikeThrough')} className={`${btn} line-through`}>S</button>

      <select onChange={(e) => onFormat('fontSize', e.target.value)} className={select}>
        <option value="3">Normal</option>
        <option value="5">Large</option>
        <option value="1">Small</option>
      </select>

      <input type="color" onInput={(e) => onFormat('foreColor', e.target.value)} className={colorInputStyle} />

      <button onMouseDown={(e) => { e.preventDefault(); onInsertLink(); }} className={btn}>🔗</button>
      <button onMouseDown={(e) => { e.preventDefault(); onFormat('unlink'); }} className={btn}>Unlink</button>

      {showLinkInput && (
        <div className="absolute top-full left-2 bg-white border border-gray-300 shadow-lg p-2 rounded-lg z-20 flex gap-2 mt-1">
          <input id="note-link-input" type="text" className={linkInputStyle} placeholder="https://example.com" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} autoFocus onMouseDown={(e) => e.stopPropagation()} />
          <button onMouseDown={(e) => { e.preventDefault(); onApplyLink(); }} className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">Apply</button>
          <button onMouseDown={(e) => { e.preventDefault(); onCancelLink(); }} className="px-3 py-1 bg-gray-200 text-sm rounded hover:bg-gray-300">Cancel</button>
        </div>
      )}
    </div>
  );
};

/* ---------- Utility: remove anchors inside a Node (unwrap them) ---------- */
function unwrapAnchors(node) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => n.nodeName === 'A' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
  });
  const anchors = [];
  let cur;
  while ((cur = walker.nextNode())) anchors.push(cur);
  anchors.forEach(a => {
    const parent = a.parentNode;
    if (!parent) return;
    while (a.firstChild) parent.insertBefore(a.firstChild, a);
    parent.removeChild(a);
  });
}

/* ===================================================================
  MODIFIED: Task Details Display Component (Integrated Task fields)
===================================================================
*/
const DetailItem = ({ label, value }) => {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</dt>
      <dd className="text-sm text-gray-900 truncate" title={value}>{value}</dd>
    </div>
  );
};

// MODIFIED: Pass handleUpdateField for new editable fields
const TaskDetailsDisplay = ({ taskData, t, membersList = [], handleUpdateField }) => {
  if (!taskData) return null;

  const getMemberLabel = (uid) => {
    if (!uid) return null;
    const member = membersList.find(m => m.uid === uid);
    return member ? member.displayName || member.label : uid; // Use displayName or fallback
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return '-';
    try {
      if (dateValue.toDate) return dateValue.toDate().toLocaleDateString();
      return dateValue;
    } catch (e) {
      return dateValue;
    }
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return '-';
    try {
      return timestamp.toDate().toLocaleString();
    } catch (e) {
      return '-';
    }
  }

  return (
    <div className="p-4 border-b border-gray-200 bg-white">
      <h3 className="text-sm font-semibold mb-3 pb-2 flex items-center text-gray-700">
        <DetailsIcon /> {t('common.details', 'Details')}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <DetailItem label={t('tickets.priority', 'Priority')} value={taskData.priority} />
        <DetailItem label={t('tickets.category', 'Category')} value={taskData.category} />
        <DetailItem label={t('tickets.type', 'Type')} value={taskData.type} />
        <DetailItem label={t('tickets.status', 'Status')} value={taskData.status} />

        <DetailItem label={t('tickets.csManager', 'CS Manager')} value={getMemberLabel(taskData.csManager)} />
        <DetailItem label={t('tickets.qaManager', 'QA Manager')} value={getMemberLabel(taskData.qaManager)} />
        <DetailItem label={t('tickets.developer', 'Developer')} value={getMemberLabel(taskData.developer)} />

        <DetailItem label={t('tickets.startDate', 'Start Date')} value={formatDate(taskData.startDate)} />
        <DetailItem label={t('tickets.endDate', 'End Date')} value={formatDate(taskData.endDate)} />
      </dl>

      {/* --- NEW/UPDATED Fields from TaskDetailsModal --- */}
      <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-3">
        {/* Creation Date (Display Only) */}
        <DetailItem label={t('taskDetail.creationDate', 'Created At')} value={formatDateTime(taskData.createdAt)} />
        {/* Actual Start Date (Display Only) */}
        <DetailItem label={t('taskDetail.actualStartDate', 'Actual Start')} value={formatDateTime(taskData.actualStartDate)} />
        {/* Actual Completion Date (Display Only) */}
        <DetailItem label={t('taskDetail.actualCompletionDate', 'Actual Completed')} value={formatDateTime(taskData.actualCompletionDate)} />

        {/* Company Goal Due Date (Editable) */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{t('taskDetail.goalDueDate', 'Goal Due Date')}</label>
          <input
            type="date"
            className="w-full p-1.5 border border-gray-300 rounded text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            value={taskData.companyGoalDueDate || ''}
            onChange={(e) => handleUpdateField('companyGoalDueDate', e.target.value)}
          />
        </div>
        {/* Task Priority (Editable) */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{t('taskDetail.priority', 'Task Priority')}</label>
          <select
            className="w-full p-1.5 border border-gray-300 rounded text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            value={taskData.taskPriority || 'Normal'}
            onChange={(e) => handleUpdateField('taskPriority', e.target.value)}
          >
            <option value="Low">Low</option>
            <option value="Normal">Normal</option>
            <option value="Urgent">Urgent</option>
          </select>
        </div>
        {/* Task Phase (Editable) */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{t('taskDetail.phase', 'Task Phase')}</label>
          <select
            className="w-full p-1.5 border border-gray-300 rounded text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            value={taskData.taskPhase || 'Not Started'}
            onChange={(e) => handleUpdateField('taskPhase', e.target.value)}
          >
            <option value="Not Started">Not Started</option>
            <option value="In Progress">In Progress</option>
            <option value="Review">Review</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
        {/* Deployment Stage (Editable) */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{t('taskDetail.deploymentStage', 'Deployment Stage')}</label>
          <select
            className="w-full p-1.5 border border-gray-300 rounded text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            value={taskData.deploymentStage || 'Not Yet'}
            onChange={(e) => handleUpdateField('deploymentStage', e.target.value)}
          >
            <option value="Not Yet">Not Yet</option>
            <option value="Staging">Staging</option>
            <option value="Production">Production</option>
          </select>
        </div>
      </div>
    </div>
  );
};


/* ===================================================================
  MODIFIED: Assignees Section (Inline dropdown)
===================================================================
*/
const AssigneesSection = ({ teamId, taskId, taskData, membersList, t }) => {
  // Removed isAssigneeModalOpen state

  const getMemberFromUid = (uid) => membersList.find(m => m.uid === uid);

  // New: Handle selection from the dropdown immediately
  const handleAssigneeSelect = async (e) => {
    const memberUid = e.target.value;
    if (!memberUid || !taskData) return;
    if (taskData.assignees?.some(a => a.uid === memberUid)) {
        e.target.value = ''; // Reset dropdown
        return; // Already assigned
    }

    const member = getMemberFromUid(memberUid);
    if (!member) return;

    const assigneeObj = {
      uid: memberUid,
      displayName: member?.displayName || member?.email || 'Unknown',
      status: 'Assigned',
      assignedAt: new Date(),
      currentSessionStart: null,
    };

    const taskRef = doc(db, 'teams', teamId, 'tasks', taskId);
    const historyRef = collection(db, 'teams', teamId, 'tasks', taskId, 'assignmentHistory');

    try {
      await updateDoc(taskRef, { assignees: arrayUnion(assigneeObj) });

      const user = auth.currentUser;
      await addDoc(historyRef, {
        assignerName: user.displayName || user.email || 'Admin',
        workerName: member?.displayName || 'Unknown',
        assignedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error adding assignee:", error);
    }
    // Reset dropdown visually
    e.target.value = '';
  };


  const handleStartWork = async (assignee) => {
    if (!taskData) return;
    const updatedAssignees = taskData.assignees.map(a => {
      if (a.uid === assignee.uid) {
        return { ...a, status: 'In Progress', currentSessionStart: new Date() };
      }
      return a;
    });

    const taskRef = doc(db, 'teams', teamId, 'tasks', taskId);
    try {
      await updateDoc(taskRef, {
        assignees: updatedAssignees,
        actualStartDate: taskData.actualStartDate || serverTimestamp()
      });
    } catch (error) {
      console.error("Error starting work:", error);
    }
  };

  const handleStopWork = async (assignee) => {
    if (!taskData || !assignee.currentSessionStart) {
      alert(t('taskDetail.noActiveSession', "No active session found."));
      return;
    }
    const endTime = new Date();
    const startTime = assignee.currentSessionStart.toDate ? assignee.currentSessionStart.toDate() : new Date(assignee.currentSessionStart);
    const diffSeconds = Math.floor((endTime - startTime) / 1000);

    const updatedAssignees = taskData.assignees.map(a => {
      if (a.uid === assignee.uid) {
        return { ...a, status: 'Stop Work', currentSessionStart: null };
      }
      return a;
    });

    const taskRef = doc(db, 'teams', teamId, 'tasks', taskId);
    const workRef = collection(db, 'teams', teamId, 'tasks', taskId, 'workHistory');

    try {
      await updateDoc(taskRef, { assignees: updatedAssignees });

      await addDoc(workRef, {
        workerName: assignee.displayName,
        startTime: startTime,
        endTime: endTime,
        workTimeSeconds: diffSeconds
      });
    } catch (error) {
      console.error("Error stopping work:", error);
    }
  };

  if (!taskData) return null;

  // Filter out members already assigned to the task
  const assignedUids = taskData.assignees?.map(a => a.uid) || [];
  // Ensure we use displayName or email (as per your request) and filter out assigned members
  // Also, explicitly filter out any members where displayName and email are both falsy, which might be the source of the empty options.
  const unassignedMembers = membersList.filter(m => 
    !assignedUids.includes(m.uid) && (m.displayName || m.email)
  );

  return (
    <div className="p-4 border-t border-gray-200 bg-gray-50">
      <h3 className="text-sm font-semibold mb-3 flex items-center text-gray-700">
        <UserGroupIcon /> {t('taskDetail.assignedEmployees', 'Assigned Employees')}
      </h3>

      <div className="flex justify-between items-center mb-3">
        <h4 className="font-semibold text-sm mr-2">{t('taskDetail.assignees', 'Assignees')}</h4>

        {/* Inline Select/Dropdown for Assignment */}
        <select
          onChange={handleAssigneeSelect}
          value={''} // Controlled to reset after selection
          className="bg-white border border-gray-300 text-gray-700 text-xs rounded-md px-2 py-1.5 focus:ring-blue-500 focus:border-blue-500 w-1/2 cursor-pointer"
        >
          <option value="" disabled className="text-gray-400">{t('taskDetail.setAssignee', 'Select Member...')}</option>
          {unassignedMembers.length === 0 ? (
            <option disabled>{t('admin.allAssigned', 'All members assigned')}</option>
          ) : (
            unassignedMembers.map(m => (
              // This is where the name/email is used for the option display
              <option key={m.uid} value={m.uid}>
                {m.displayName || m.email}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="bg-white p-3 rounded border border-gray-200 min-h-[60px] space-y-2 max-h-40 overflow-y-auto">
        {(!taskData.assignees || taskData.assignees.length === 0) && (
          <p className="text-gray-400 text-sm italic">{t('admin.noMembers', 'No members assigned.')}</p>
        )}
        <ul className="space-y-2">
          {taskData.assignees?.map((assignee, idx) => (
            <li key={assignee.uid || idx} className="flex items-center justify-between p-1 rounded hover:bg-gray-50">
              <span className="text-sm font-medium text-gray-700 truncate mr-2">
                {/* Display name or email in the assigned list */}
                {assignee.displayName || assignee.email} <span className="text-gray-400 text-xs">({assignee.status})</span>
              </span>
              <div className="space-x-1.5 flex-shrink-0">
                {assignee.status !== 'In Progress' ? (
                  <button onClick={() => handleStartWork(assignee)} className="text-green-600 text-xs border border-green-600 px-2 py-0.5 rounded hover:bg-green-50">
                    {t('taskDetail.startWork', 'Start Work')}
                  </button>
                ) : (
                  <button onClick={() => handleStopWork(assignee)} className="text-red-600 text-xs border border-red-600 px-2 py-0.5 rounded hover:bg-red-50">
                    {t('taskDetail.stopWork', 'Stop Work')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};


/* ===================================================================
  NEW: History Section (from TaskDetailsModal)
===================================================================
*/
const HistorySection = ({ teamId, taskId, t }) => {
  const [showHistory, setShowHistory] = useState(false);
  const [assignmentHistory, setAssignmentHistory] = useState([]);
  const [workHistory, setWorkHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!showHistory || !taskId || !teamId) return;

    const fetchHistories = async () => {
      setLoading(true);
      try {
        const assignRef = collection(db, 'teams', teamId, 'tasks', taskId, 'assignmentHistory');
        const qAssign = query(assignRef, orderBy('assignedAt', 'desc'));
        const assignSnap = await getDocs(qAssign);
        setAssignmentHistory(assignSnap.docs.map(d => d.data()));

        const workRef = collection(db, 'teams', teamId, 'tasks', taskId, 'workHistory');
        const qWork = query(workRef, orderBy('endTime', 'desc'));
        const workSnap = await getDocs(qWork);
        setWorkHistory(workSnap.docs.map(d => d.data()));
      } catch (err) {
        console.error("Error fetching history", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistories();
  }, [showHistory, taskId, teamId]);

  const formatTime = (timestamp) => {
    if (!timestamp) return '-';
    try {
      return timestamp.toDate().toLocaleString();
    } catch (e) {
      return '-';
    }
  };

  const formatWorkTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
  };

  return (
    <div className="p-4 border-t border-gray-200 bg-white">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold flex items-center text-gray-700">
          <HistoryIcon /> {t('taskDetail.historyTitle', 'History')}
        </h3>
        <button onClick={() => setShowHistory(!showHistory)} className="bg-gray-200 text-gray-700 text-xs px-3 py-1 rounded hover:bg-gray-300">
          {showHistory ? t('taskDetail.hide', 'Hide') : t('taskDetail.show', 'Show')}
        </button>
      </div>

      {showHistory && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-4"><MiniSpinner /></div>
          ) : (
            <>
              {/* Assignment History Table */}
              <div>
                <h4 className="font-semibold text-xs mb-1 text-gray-600">{t('taskDetail.changeHistory', 'Assignment Log')}</h4>
                <div className="overflow-x-auto border rounded max-h-40">
                  <table className="w-full text-xs text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-1.5">{t('taskDetail.assigner', 'Assigner')}</th>
                        <th className="px-3 py-1.5">{t('taskDetail.worker', 'Worker')}</th>
                        <th className="px-3 py-1.5">{t('taskDetail.assignmentTime', 'Time')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignmentHistory.length > 0 ? assignmentHistory.map((h, i) => (
                        <tr key={i} className="bg-white border-b hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-medium">{h.assignerName}</td>
                          <td className="px-3 py-1.5">{h.workerName}</td>
                          <td className="px-3 py-1.5">{formatTime(h.assignedAt)}</td>
                          {/* Note: Unassignment Time field is not available in this data structure */}
                        </tr>
                      )) : (
                        <tr><td colSpan="3" className="px-3 py-3 text-center text-gray-400">{t('taskDetail.noHistory', 'No history.')}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Work History Table */}
              <div>
                <h4 className="font-semibold text-xs mb-1 text-gray-600">{t('taskDetail.workHistory', 'Work Log')}</h4>
                <div className="overflow-x-auto border rounded max-h-40">
                  <table className="w-full text-xs text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-1.5">{t('taskDetail.worker', 'Worker')}</th>
                        <th className="px-3 py-1.5">{t('taskDetail.start', 'Start')}</th>
                        <th className="px-3 py-1.5">{t('taskDetail.end', 'End')}</th>
                        <th className="px-3 py-1.5 text-right">{t('taskDetail.workTime', 'Duration')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workHistory.length > 0 ? workHistory.map((h, i) => (
                        <tr key={i} className="bg-white border-b hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-medium">{h.workerName}</td>
                          <td className="px-3 py-1.5">{formatTime(h.startTime)}</td>
                          <td className="px-3 py-1.5">{formatTime(h.endTime)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{formatWorkTime(h.workTimeSeconds)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan="4" className="px-3 py-3 text-center text-gray-400">{t('taskDetail.noHistory', 'No history.')}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};


/* ===================================================================
  ORIGINAL: Comment Section Component (PRESERVED as requested)
===================================================================
*/
const CommentSection = ({ teamId, taskId }) => {
  const { t } = useContext(LanguageContext);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const commentsEndRef = useRef(null);

  const [commentImage, setCommentImage] = useState(null);
  const [commentImagePreview, setCommentImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [editingComment, setEditingComment] = useState(null);
  const [editText, setEditText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const currentUserId = auth.currentUser?.uid;

  useEffect(() => {
    const commentsRef = collection(db, 'teams', teamId, 'tasks', taskId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedComments = [];
      snapshot.forEach((doc) => {
        fetchedComments.push({ id: doc.id, ...doc.data() });
      });
      setComments(fetchedComments);
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching comments: ", err);
      setError(t('comments.loadError'));
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [teamId, taskId, t]);

  useEffect(() => {
    if (!editingComment) {
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments, editingComment]);

  const handleImageSelect = (file) => {
    if (file && file.type.startsWith('image/')) {
      setCommentImage(file);
      setCommentImagePreview(URL.createObjectURL(file));
      setError(null);
    } else {
      setError('Please select a valid image file.');
    }
  };

  const onFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageSelect(e.target.files[0]);
      e.target.value = null;
    }
  };

  const handleCommentPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleImageSelect(file);
          break;
        }
      }
    }
  };

  const clearImage = () => {
    setCommentImage(null);
    if (commentImagePreview) {
      URL.revokeObjectURL(commentImagePreview);
      setCommentImagePreview(null);
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    const text = newComment.trim();
    if ((!text && !commentImage) || !currentUserId) return;

    setIsUploading(true);
    setError(null);

    const { displayName, email } = auth.currentUser;
    const authorName = displayName || email || 'Anonymous';

    let imageUrl = null;
    let imagePath = null;

    try {
      if (commentImage) {
        const storagePath = `comment_images/${teamId}/${taskId}/${Date.now()}-${commentImage.name}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = await uploadBytesResumable(storageRef, commentImage);
        imageUrl = await getDownloadURL(uploadTask.ref);
        imagePath = storagePath;
      }

      await addDoc(collection(db, 'teams', teamId, 'tasks', taskId, 'comments'), {
        text: text,
        authorId: currentUserId,
        authorName: authorName,
        createdAt: serverTimestamp(),
        imageUrl: imageUrl,
        imagePath: imagePath,
      });

      setNewComment('');
      clearImage();

    } catch (err) {
      console.error("Error posting comment: ", err);
      setError(t('comments.postError'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteComment = async (comment) => {
    if (comment.authorId !== currentUserId) return;
    if (!window.confirm(t('common.confirmDelete', 'Are you sure you want to delete this comment?'))) return;

    try {
      if (comment.imagePath) {
        const imageRef = ref(storage, comment.imagePath);
        await deleteObject(imageRef);
      }

      const commentRef = doc(db, 'teams', teamId, 'tasks', taskId, 'comments', comment.id);
      await deleteDoc(commentRef);

    } catch (err) {
      console.error("Error deleting comment: ", err);
      setError(t('comments.deleteError', 'Failed to delete comment.'));
    }
  };

  const startEdit = (comment) => {
    setEditingComment(comment);
    setEditText(comment.text);
  };

  const cancelEdit = () => {
    setEditingComment(null);
    setEditText('');
  };

  const handleSaveEdit = async () => {
    if (!editingComment || isUpdating) return;

    setIsUpdating(true);
    const commentRef = doc(db, 'teams', teamId, 'tasks', taskId, 'comments', editingComment.id);

    try {
      await updateDoc(commentRef, {
        text: editText,
        editedAt: serverTimestamp()
      });
      cancelEdit();
    } catch (err) {
      console.error("Error updating comment: ", err);
      setError(t('comments.editError', 'Failed to save edit.'));
    } finally {
      setIsUpdating(false);
    }
  };

  const formatCommentTime = (timestamp) => {
    if (!timestamp) return '...';
    try {
      return timestamp.toDate().toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch (e) {
      return '...';
    }
  };

  return (
    <div className="flex flex-col bg-gray-50 border-t border-gray-200 flex-1 min-h-0">
      <h3 className="text-sm font-semibold p-3 border-b border-gray-200 flex items-center text-gray-700 flex-shrink-0">
        <ChatBubbleIcon /> {t('comments.title')}
      </h3>

      {isLoading && <div className="flex-1 flex items-center justify-center p-4"><Spinner /></div>}

      {error && <div className="text-red-600 p-3 text-sm">{error}</div>}

      <ul className="list-none p-3 m-0 space-y-3 flex-1 overflow-y-auto">
        {!isLoading && comments.length === 0 && (
          <li className="text-sm text-gray-500 italic text-center py-4">
            {t('comments.none')}
          </li>
        )}
        {comments.map(comment => (
          <li key={comment.id} className="text-sm group relative">
            {editingComment?.id === comment.id ? (
              <div className="bg-white border border-blue-500 rounded-md p-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows="3"
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={cancelEdit}
                    className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={isUpdating || !editText.trim()}
                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isUpdating ? <MiniSpinner /> : t('common.save', 'Save')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-2 rounded-md hover:bg-gray-100">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-800 text-[13px]">{comment.authorName}</span>
                  <span className="text-xs text-gray-500">
                    {comment.editedAt && <span className="italic mr-1">({t('common.edited', 'edited')})</span>}
                    {formatCommentTime(comment.createdAt)}
                  </span>
                </div>
                {comment.text && (
                  <p className="text-gray-700 whitespace-pre-wrap break-words m-0 mt-0.5">
                    {comment.text}
                  </p>
                )}
                {comment.imageUrl && (
                  <a href={comment.imageUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      src={comment.imageUrl}
                      alt="Comment attachment"
                      className="mt-2 max-w-full max-h-48 rounded-md border border-gray-200 cursor-pointer"
                    />
                  </a>
                )}
                {currentUserId === comment.authorId && (
                  <div className="absolute top-0 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(comment)}
                      title={t('common.edit', 'Edit')}
                      className="p-1 rounded-full bg-white text-gray-600 hover:text-blue-600 hover:bg-gray-100 shadow"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={() => handleDeleteComment(comment)}
                      title={t('common.delete', 'Delete')}
                      className="p-1 rounded-full bg-white text-gray-600 hover:text-red-600 hover:bg-gray-100 shadow"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
        <div ref={commentsEndRef} />
      </ul>

      <div className="p-3 border-t border-gray-200 bg-white flex-shrink-0">
        <form onSubmit={handlePostComment}>
          {commentImagePreview && (
            <div className="relative inline-block mb-2">
              <img src={commentImagePreview} alt="Preview" className="max-h-24 rounded-md border border-gray-200" />
              <button
                type="button"
                onClick={clearImage}
                className="absolute -top-2 -right-2 bg-gray-700 text-white rounded-full p-0.5 leading-none"
                aria-label="Remove image"
              >
                <XIcon />
              </button>
            </div>
          )}
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onPaste={handleCommentPaste}
            placeholder={t('comments.placeholder')}
            rows="3"
            className="w-full border border-gray-300 rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isUploading}
          />
          <div className="flex justify-between items-center mt-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={onFileChange}
              accept="image/*"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-gray-500 hover:text-blue-600 p-1 disabled:opacity-50"
              title="Attach image"
            >
              <ImageIcon />
            </button>

            <button
              type="submit"
              disabled={(!newComment.trim() && !commentImage) || isUploading}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-md font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 flex items-center justify-center min-w-[80px]"
            >
              {isUploading ? <MiniSpinner /> : t('comments.post')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
/* ===================================================================
  End of Original Comment Component
===================================================================
*/


/* ===================================================================
  MODIFIED: NotePopupContent (Main Layout)
===================================================================
*/
const NotePopupContent = ({ teamId, taskId, columnKey, onClose, membersList }) => {
  const { t } = useContext(LanguageContext);
  const [saveStatus, setSaveStatus] = useState('loading');
  const [initialHtml, setInitialHtml] = useState(null);

  // Task/Detail State
  const [taskData, setTaskData] = useState(null);

  // files state
  const [files, setFiles] = useState([]);
  const [fileUploadProgress, setFileUploadProgress] = useState(null);
  const [fileError, setFileError] = useState('');
  const [isDeletingFile, setIsDeletingFile] = useState(null);

  // link UI
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkSelectionRef = useRef(null);

  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const lastSavedHtmlRef = useRef(null);
  const isMountedRef = useRef(true);
  const injectedRef = useRef(false);

  const getFilesFieldName = React.useCallback(() => `${columnKey}_files`, [columnKey]);

  /* ---------- load initial content & task data ---------- */
  useEffect(() => {
    isMountedRef.current = true;
    injectedRef.current = false;
    if (!teamId || !taskId || !columnKey) {
      setSaveStatus('error');
      console.error('Missing props teamId/taskId/columnKey');
      return;
    }
    (async () => {
      setSaveStatus('loading');
      setFiles([]);
      setTaskData(null);
      try {
        const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
        const snap = await getDoc(docRef);
        let noteHtml = '', noteFiles = [];
        if (snap.exists()) {
          const data = snap.data();
          noteHtml = data[columnKey] || '';
          noteFiles = data[getFilesFieldName()] || [];

          // Listener is better for taskData but sync fetch here ensures initial load integrity
          setTaskData(data);
        }
        if (isMountedRef.current) {
          setInitialHtml(noteHtml);
          setFiles(noteFiles);
          lastSavedHtmlRef.current = noteHtml;
          setSaveStatus('idle');
        }
      } catch (err) {
        console.error('fetch note/task error', err);
        if (isMountedRef.current) {
          setInitialHtml('');
          setFiles([]);
          setSaveStatus('error');
          setTaskData(null);
        }
      }
    })();
    return () => { isMountedRef.current = false; if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [teamId, taskId, columnKey, getFilesFieldName]);

  useEffect(() => {
    if (initialHtml === null) return;
    if (editorRef.current && !injectedRef.current) {
      editorRef.current.innerHTML = initialHtml;
      injectedRef.current = true;
    }
  }, [initialHtml]);

  /* ---------- Task Field Update Handler (from TaskDetailsModal) ---------- */
  const handleUpdateField = useCallback(async (field, value) => {
    if (!taskData) return;
    try {
      const taskRef = doc(db, 'teams', teamId, 'tasks', taskId);
      await updateDoc(taskRef, { [field]: value });
      // Optimistically update local state for immediate feedback
      setTaskData(prev => ({ ...prev, [field]: value }));
    } catch (error) {
      console.error("Error updating field:", error);
    }
  }, [teamId, taskId, taskData]);


  /* ---------- autosave (for main note) ---------- */
  const saveToFirebase = useCallback(async (html) => {
    if (html === lastSavedHtmlRef.current) { setSaveStatus('idle'); return; }
    const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
    try {
      await updateDoc(docRef, { [columnKey]: html });
      if (isMountedRef.current) { lastSavedHtmlRef.current = html; setSaveStatus('saved'); setTimeout(() => { if (isMountedRef.current) setSaveStatus('idle'); }, 1500); }
    } catch (err) {
      console.error('Autosave error', err);
      if (isMountedRef.current) setSaveStatus('error');
    }
  }, [teamId, taskId, columnKey]);

  const handleInput = useCallback(() => {
    if (showLinkInput) setShowLinkInput(false);
    if (saveStatus === 'loading') return;
    setSaveStatus('saving');
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      if (editorRef.current) saveToFirebase(editorRef.current.innerHTML);
    }, 1200);
  }, [showLinkInput, saveStatus, saveToFirebase]);

  /* ---------- image paste/upload (for main editor) ---------- */
  const handleImageUpload = (file) => {
    if (!file || !editorRef.current || !file.type.startsWith('image/')) return;
    const placeholderId = `upload-placeholder-${Date.now()}`;
    const blobUrl = URL.createObjectURL(file);
    const imgHtml = `<img src="${blobUrl}" id="${placeholderId}" alt="Uploading..." style="max-width:90%; opacity:.5; filter:blur(3px); border-radius:4px; display:block; margin:8px 0;" />`;
    document.execCommand('insertHTML', false, imgHtml);

    const storagePath = `notes_images/${teamId}/${taskId}/${columnKey}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);
    setFileUploadProgress('Uploading image (0%)...');
    uploadTask.on('state_changed',
      (snap) => {
        const progress = (snap.bytesTransferred / snap.totalBytes) * 100;
        if (isMountedRef.current) setFileUploadProgress(`Uploading image (${Math.round(progress)}%)...`);
      },
      (err) => {
        console.error('Image upload failed', err);
        if (isMountedRef.current) { setFileUploadProgress('Image upload failed.'); setTimeout(() => setFileUploadProgress(null), 3000); }
        const placeholder = editorRef.current?.querySelector(`#${placeholderId}`);
        if (placeholder) placeholder.remove();
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          if (isMountedRef.current && editorRef.current) {
            const placeholder = editorRef.current.querySelector(`#${placeholderId}`);
            if (placeholder) {
              placeholder.src = url;
              placeholder.style.opacity = '1';
              placeholder.style.filter = 'none';
              placeholder.removeAttribute('id');
              placeholder.alt = 'Image';
              handleInput();
            }
          }
          if (isMountedRef.current) { setFileUploadProgress('Upload complete!'); setTimeout(() => setFileUploadProgress(null), 3000); }
        } catch (err) {
          console.error('getDownloadURL failed', err);
          if (isMountedRef.current) setFileUploadProgress('Upload failed.');
        }
      }
    );
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    let found = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) { e.preventDefault(); handleImageUpload(file); found = true; break; }
      }
    }
    if (!found) {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    }
  };

  const handleEditorClick = (e) => {
    const isSpecialClick = e.ctrlKey || e.metaKey;
    if (isSpecialClick) {
      const anchor = e.target.closest('a');
      if (anchor && anchor.href) {
        e.preventDefault();
        window.open(anchor.href, '_blank', 'noopener,noreferrer');
      }
    }
  };

  /* ---------- file upload helpers (for Attachment section) ---------- */
  const handleUploadButtonClick = () => fileInputRef.current?.click();
  const handleFileSelected = (e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = null; };

  const handleFileUpload = (file) => {
    if (!file) return;
    setFileError('');
    const storagePath = `notes_files/${teamId}/${taskId}/${columnKey}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);
    setFileUploadProgress(`Uploading ${file.name} (0%)...`);
    uploadTask.on('state_changed',
      (snap) => {
        const progress = (snap.bytesTransferred / snap.totalBytes) * 100;
        if (isMountedRef.current) setFileUploadProgress(`Uploading ${file.name} (${Math.round(progress)}%)...`);
      },
      (err) => {
        console.error('file upload failed', err);
        if (isMountedRef.current) { setFileError(`Failed to upload ${file.name}`); setFileUploadProgress(null); }
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          const newFile = { name: file.name, url, path: storagePath, createdAt: new Date().toISOString() };
          const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
          const filesField = getFilesFieldName();
          await updateDoc(docRef, { [filesField]: arrayUnion(newFile) });
          if (isMountedRef.current) { setFiles(prev => [...prev, newFile]); setFileUploadProgress('Upload complete!'); setTimeout(() => setFileUploadProgress(null), 3000); }
        } catch (err) {
          console.error('save file meta failed', err);
          if (isMountedRef.current) { setFileError('Upload succeeded but failed to save. Refresh.'); setFileUploadProgress(null); }
        }
      }
    );
  };

  const handleFileDelete = async (fileToDelete) => {
    if (!fileToDelete || !window.confirm(`Delete ${fileToDelete.name}?`)) return;
    setIsDeletingFile(fileToDelete.path);
    setFileError('');
    try {
      const fileRef = ref(storage, fileToDelete.path);
      await deleteObject(fileRef);
      const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const cur = snap.data()[getFilesFieldName()] || [];
        const next = cur.filter(f => f.path !== fileToDelete.path);
        await updateDoc(docRef, { [getFilesFieldName()]: next });
        if (isMountedRef.current) setFiles(next);
      }
    } catch (err) {
      console.error('delete failed', err);
      if (isMountedRef.current) setFileError('Delete failed. Try again.');
    } finally {
      if (isMountedRef.current) setIsDeletingFile(null);
    }
  };

  /* ---------- Link handling improvements ---------- */
  const handleFormat = useCallback((command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  const handleInsertLink = useCallback(() => {
    const sel = window.getSelection();
    let range = null;
    try { if (sel && sel.rangeCount > 0) range = sel.getRangeAt(0).cloneRange(); } catch (e) { range = null; }
    linkSelectionRef.current = null;
    if (range && editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
      let node = range.startContainer;
      while (node && node !== editorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'A') {
          linkSelectionRef.current = { type: 'edit', anchor: node };
          setLinkUrl(node.getAttribute('href') || 'https://');
          setShowLinkInput(true);
          return;
        }
        node = node.parentNode;
      }
    }
    if (range && !range.collapsed && editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
      const placeholderId = `pl-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      let extracted;
      try {
        extracted = range.extractContents();
      } catch (err) {
        const text = (window.getSelection()?.toString()) || '';
        extracted = document.createDocumentFragment();
        extracted.appendChild(document.createTextNode(text));
        try { range.deleteContents(); } catch (e) { /* ignore */ }
      }
      const span = document.createElement('span');
      span.setAttribute('data-link-placeholder', '1');
      span.setAttribute('id', placeholderId);
      span.style.background = 'transparent';
      span.appendChild(extracted);
      range.insertNode(span);
      linkSelectionRef.current = { type: 'placeholder', id: placeholderId };
      setLinkUrl('https://');
      setShowLinkInput(true);
      return;
    }
    if (range && editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
      linkSelectionRef.current = { type: 'caret', range };
    } else {
      linkSelectionRef.current = { type: 'none' };
    }
    setLinkUrl('https://');
    setShowLinkInput(true);
  }, []);

  const removeEmptyAnchors = (root) => {
    const anchors = (root || editorRef.current)?.querySelectorAll('a') || [];
    anchors.forEach(a => {
      if (!a.textContent.trim() && !a.querySelector('img')) {
        const parent = a.parentNode;
        if (parent) parent.removeChild(a);
      }
    });
  };

  const applyLink = useCallback(() => {
    let url = (linkUrl || '').trim();
    if (!editorRef.current) { setShowLinkInput(false); setLinkUrl(''); linkSelectionRef.current = null; return; }
    if (!url) {
      const saved = linkSelectionRef.current;
      if (saved?.type === 'placeholder') {
        const ph = editorRef.current.querySelector(`#${saved.id}`);
        if (ph) {
          const parent = ph.parentNode;
          while (ph.firstChild) parent.insertBefore(ph.firstChild, ph);
          parent.removeChild(ph);
        }
      }
      setShowLinkInput(false);
      setLinkUrl('');
      linkSelectionRef.current = null;
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    try {
      const saved = linkSelectionRef.current;
      const sel = window.getSelection();

      if (saved?.type === 'edit' && saved.anchor) {
        const anchor = saved.anchor;
        anchor.setAttribute('href', url);
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
        if (!anchor.textContent.trim()) anchor.textContent = url;
        const after = document.createRange();
        after.setStartAfter(anchor);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
      } else if (saved?.type === 'placeholder') {
        const ph = editorRef.current.querySelector(`#${saved.id}`);
        if (ph) {
          const frag = document.createDocumentFragment();
          while (ph.firstChild) frag.appendChild(ph.firstChild);
          const temp = document.createElement('div');
          temp.appendChild(frag);
          unwrapAnchors(temp);
          const anchor = document.createElement('a');
          anchor.setAttribute('href', url);
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
          while (temp.firstChild) anchor.appendChild(temp.firstChild);
          ph.parentNode.replaceChild(anchor, ph);
          const after = document.createRange();
          after.setStartAfter(anchor);
          after.collapse(true);
          sel.removeAllRanges();
          sel.addRange(after);
        } else {
          document.execCommand('createLink', false, url);
        }
      } else if (saved?.type === 'caret' && saved.range) {
        const r = saved.range;
        sel.removeAllRanges();
        try { sel.addRange(r); } catch (err) { /* ignore */ }
        let node = r.startContainer;
        while (node && node !== editorRef.current) {
          if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'A') {
            node.setAttribute('href', url);
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
            sel.removeAllRanges();
            const after = document.createRange();
            after.setStartAfter(node);
            after.collapse(true);
            sel.addRange(after);
            removeEmptyAnchors();
            handleInput();
            setShowLinkInput(false);
            setLinkUrl('');
            linkSelectionRef.current = null;
            return;
          }
          node = node.parentNode;
        }
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.textContent = url;
        try {
          r.insertNode(a);
          const after = document.createRange();
          after.setStartAfter(a);
          after.collapse(true);
          sel.removeAllRanges();
          sel.addRange(after);
        } catch (err) {
          document.execCommand('createLink', false, url);
        }
      } else {
        document.execCommand('createLink', false, url);
        const anchors = editorRef.current.querySelectorAll('a[href]');
        if (anchors.length) {
          const a = anchors[anchors.length - 1];
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
          if (!a.textContent.trim()) a.textContent = url;
        }
      }
      removeEmptyAnchors(editorRef.current);
    } catch (err) {
      console.error('applyLink error', err);
      try { document.execCommand('createLink', false, url); } catch (e) { /* ignore */ }
    } finally {
      setShowLinkInput(false);
      setLinkUrl('');
      linkSelectionRef.current = null;
      handleInput();
    }
  }, [linkUrl, handleInput]);

  const cancelLink = useCallback(() => {
    const saved = linkSelectionRef.current;
    if (saved?.type === 'placeholder') {
      const ph = editorRef.current?.querySelector(`#${saved.id}`);
      if (ph) {
        const p = ph.parentNode;
        while (ph.firstChild) p.insertBefore(ph.firstChild, ph);
        p.removeChild(ph);
      }
    }
    setShowLinkInput(false);
    setLinkUrl('');
    linkSelectionRef.current = null;
    editorRef.current?.focus();
  }, []);

  const getStatusMessage = () => {
    switch (saveStatus) {
      case 'saving': return { msg: t('common.saving'), color: '#6b7280' };
      case 'saved': return { msg: t('common.saved'), color: '#16a34a' };
      case 'error': return { msg: t('common.saveError', 'Error saving note'), color: '#dc2626' };
      default: return { msg: '', color: '#6b7280' };
    }
  };
  const status = getStatusMessage();

  /* ---------- RENDER (MODIFIED) ---------- */
  return (
    <div className="w-full h-full bg-white rounded-lg flex flex-col overflow-hidden">
      {/* --- MODIFIED HEADER --- */}
      <div className="flex justify-between items-center border-b border-gray-200 p-4 flex-shrink-0">
        {taskData ? (
          <h2 className="text-xl font-semibold text-gray-800 truncate">
            <span className="font-mono text-blue-600" title={taskData.ticketNo || `Task ${taskId}`}>
              {taskData.ticketNo || `Task ${taskId}`}
            </span>
            {taskData.company && (
              <span className="text-gray-400 font-normal ml-2" title={taskData.company}>
                - {taskData.company}
              </span>
            )}
          </h2>
        ) : (
          <h2 className="text-xl font-semibold text-gray-800">Loading...</h2>
        )}
        <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
          <XIcon />
        </button>
      </div>

      {/* --- LOADING/ERROR STATE --- */}
      {(saveStatus === 'loading' && initialHtml === null) && (
        <div className="flex-1 flex items-center justify-center"><Spinner /></div>
      )}
      {saveStatus === 'error' && (
        <div className="flex-1 flex items-center justify-center text-red-600 p-4">
          Error loading task details. Please close and try again.
        </div>
      )}

      {/* --- MAIN CONTENT (post-load) --- */}
      {(saveStatus !== 'loading' || initialHtml !== null) && taskData && (
        <>
          {/* --- MODIFIED: 2-COLUMN LAYOUT --- */}
          <div className="flex-1 flex overflow-hidden">

            {/* --- Main Content (Left) --- */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {initialHtml === null ? (
                <div className="flex-1 flex items-center justify-center"><Spinner /></div>
              ) : (
                <>
                  <h3 className="text-sm font-semibold p-3 border-b border-gray-200 text-gray-700 flex-shrink-0">
                    Editing Field: <span className="font-mono text-blue-600 ml-1">{columnKey}</span>
                  </h3>
                  <EditorToolbar
                    onFormat={handleFormat}
                    onInsertLink={handleInsertLink}
                    showLinkInput={showLinkInput}
                    linkUrl={linkUrl}
                    setLinkUrl={setLinkUrl}
                    onApplyLink={applyLink}
                    onCancelLink={cancelLink}
                  />
                  <div
                    ref={editorRef}
                    contentEditable
                    onInput={handleInput}
                    onPaste={handlePaste}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => e.preventDefault()}
                    onClick={handleEditorClick}
                    className="note-editor"
                    tabIndex={0}
                    style={{ flex: 1, padding: '12px 16px', overflowY: 'auto', outline: 'none' }}
                  />
                </>
              )}
            </div>

            {/* --- Sidebar (Right) --- */}
            <div className="w-[360px] flex-shrink-0 border-l border-gray-200 flex flex-col overflow-y-auto bg-gray-50">

              {/* --- 1. Details Widget (MODIFIED: passed handleUpdateField) --- */}
              <TaskDetailsDisplay
                taskData={taskData}
                t={t}
                membersList={membersList}
                handleUpdateField={handleUpdateField}
              />

              {/* --- 2. Assignees Widget (MODIFIED: Inline) --- */}
              <AssigneesSection
                teamId={teamId}
                taskId={taskId}
                taskData={taskData}
                membersList={membersList}
                t={t}
              />

              {/* --- 3. History Widget (NEW) --- */}
              <HistorySection
                teamId={teamId}
                taskId={taskId}
                t={t}
              />

              {/* --- 4. Attachments Widget (Existing Note Attachments) --- */}
              <div className="border-t border-gray-200 bg-white">
                <h3 className="text-sm font-semibold p-3 border-b border-gray-200 flex items-center text-gray-700 flex-shrink-0">
                  <PaperClipIcon /> {t('attachments.title')} (Note Field)
                </h3>
                {fileError && <div className="text-red-600 p-3 text-sm">{fileError}</div>}
                <ul className="list-none p-3 m-0 space-y-2 max-h-40 overflow-y-auto">
                  {files.length === 0 && <p className="text-sm text-gray-500 italic">{t('attachments.none')}</p>}
                  {files.map(f => (
                    <li key={f.path} className="bg-gray-50 p-2 border border-gray-200 rounded-md">
                      <div className="text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap text-gray-700" title={f.name}>{f.name}</div>
                      <div className="mt-1.5 flex gap-3">
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                          <DownloadIcon /> {t('common.download')}
                        </a>
                        <button onClick={() => handleFileDelete(f)} disabled={isDeletingFile === f.path} className="text-xs text-red-600 hover:underline flex items-center gap-1 disabled:opacity-50">
                          {isDeletingFile === f.path ? <MiniSpinner /> : <><TrashIcon /> {t('common.delete')}</>}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="p-3 border-t border-gray-200 flex-shrink-0">
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelected} />
                  <button
                    onClick={handleUploadButtonClick}
                    disabled={!!fileUploadProgress || !!isDeletingFile}
                    className="w-full p-2 bg-blue-600 text-white rounded-md font-semibold text-sm disabled:opacity-50 hover:bg-blue-700 flex items-center justify-center"
                  >
                    {fileUploadProgress ? <MiniSpinner /> : t('attachments.upload')}
                  </button>
                </div>
              </div>

              {/* --- 5. Comments Widget (ORIGINAL PRESERVED) --- */}
              <CommentSection teamId={teamId} taskId={taskId} />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center border-t border-gray-200 p-4 flex-shrink-0 bg-white">
            <div className="text-xs">
              <div style={{ color: status.color }} className="font-semibold h-4">{status.msg}</div>
              <div className="text-blue-600 h-4">{fileUploadProgress}</div>
            </div>

            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md text-sm font-medium hover:bg-gray-300">
                {t('common.close')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ---------- Wrapper export (MODIFIED) ---------- */
// Accept ...props and pass membersList down
const NotePopup = (props) => {
  // Pass all props, including membersList, down
  return (
    <ModalShell onClose={props.onClose}>
      <NotePopupContent {...props} />
    </ModalShell>
  );
};

export default NotePopup;