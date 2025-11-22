// TeamProjectTable.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom'; // <-- NEW IMPORTS
import { db, auth } from '../firebaseConfig';
import {
  collection,
  query,
  orderBy,
  Timestamp,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  getDoc,
  setDoc,
  getDocs,
  where,
  addDoc,
  serverTimestamp,
  deleteField
} from 'firebase/firestore';
import NotePopup from './NotePopup';
import CreateTaskModal from './CreateTaskModal';

// --- NEW: Language Context ---
import { LanguageContext } from '../contexts/LanguageContext.jsx';

// placeholders (will be overridden by team meta if present)
const DEFAULT_PLACEHOLDERS = {
  members: [
    { uid: 'uid1', label: 'Member One (member1@example.com)' },
    { uid: 'uid2', label: 'Member Two (member2@example.com)' }
  ],
  categories: ['Tech Issue', 'Feature Request', 'Inquiry'],
  types: ['Bug', 'Enhancement', 'Question', 'Backend', 'Frontend']
};
const DEFAULT_PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];
const DEFAULT_STATUS_OPTIONS = ['Not started', 'In progress', 'QA', 'Complete'];

const POPUP_TRIGGER_COLUMNS = ['inquiry']; // This column will open the NotePopup

const INLINE_EDITABLE_COLUMNS = [
  'priority', 'category', 'type', 'status',
  'ticketNo', 'company', 'inquiryDetails', 'notes', // 'inquiry' is not here, it uses the popup
  'csManager', 'qaManager', 'developer',
  'startDate', 'endDate'
];
// These columns will use a <textarea> for editing
const TEXTAREA_COLUMNS = ['ticketNo', 'company', 'inquiryDetails', 'notes'];

// --- REMOVED UI_STRINGS ARRAY ---

const TeamProjectTable = ({ teamId, onTaskChange, isMasterAdminView = false }) => {  // --- NEW: Language Context ---
  const { t } = useContext(LanguageContext);

  // --- NEW: React Router Hooks ---
  const { taskId } = useParams(); // <-- NEW: Gets :taskId from the URL
  const navigate = useNavigate(); // <-- NEW: Gets the navigate function

  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  // This state now holds { taskId, columnKey }
  const [popupTargetInfo, setPopupTargetInfo] = useState(null);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);

  // editingCell: { taskId, columnKey }
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingOriginalValue, setEditingOriginalValue] = useState('');
  const debounceRef = useRef(null);
  const inputRef = useRef(null); // Ref for inputs/textareas
  const selectRef = useRef(null); // Ref for selects

  // saving indicator map
  const [savingStatus, setSavingStatus] = useState({});
  const savingTimersRef = useRef({});

  // NEW: Single state for expanding all columns
  const [isAllExpanded, setIsAllExpanded] = useState(false);

  // --- REMOVED OLD TRANSLATION STATE ---

  // dynamic option lists (load from Firestore team doc if available)
  // membersList is now array of objects: { uid, label }
  const [membersList, setMembersList] = useState(DEFAULT_PLACEHOLDERS.members);
  const [categoriesList, setCategoriesList] = useState(DEFAULT_PLACEHOLDERS.categories);
  const [typesList, setTypesList] = useState(DEFAULT_PLACEHOLDERS.types);

  // Support team-level priorities/status overrides
  const [priorityOptions, setPriorityOptions] = useState(DEFAULT_PRIORITY_OPTIONS);
  const [statusOptions, setStatusOptions] = useState(DEFAULT_STATUS_OPTIONS);

  // invite modal state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  // { headerKey, targetTaskId, applyToEditingCell }
  const [inviteMeta, setInviteMeta] = useState(null);

  // add-option modal state (for category/type/priority/status)
  const [isAddOptionOpen, setIsAddOptionOpen] = useState(false);
  const [addOptionMeta, setAddOptionMeta] = useState(null);
  const [addOptionValue, setAddOptionValue] = useState('');

  // Options Editor modal
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false);

  // --- NEW: Tab State ---
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'completed'

  // --- NEW: Filter State ---
  const [filters, setFilters] = useState({
    company: '',
    developer: '',
    category: ''
  });

  // --- NEW: Sorting State ---
  // Default sort by priority (handled by firestore mostly, but we can default here)
  const [sortConfig, setSortConfig] = useState({ key: 'startDate', direction: 'desc' });

  // --- NEW: Ref to store original document title ---
  const baseTitleRef = useRef(document.title);

  // headers (defined here so translation hook can access it)
  const headers = useMemo(() => [
    { key: 'priority', label: t('tickets.priority'), widthClass: 'w-[110px]', maxWidth: '110px' },
    { key: 'category', label: t('tickets.category'), widthClass: 'w-[140px]', maxWidth: '140px' },
    { key: 'type', label: t('tickets.type'), widthClass: 'w-[140px]', maxWidth: '140px' },
    { key: 'status', label: t('tickets.status'), widthClass: 'w-[120px]', maxWidth: '120px' },
    { key: 'ticketNo', label: t('tickets.ticketNo'), widthClass: 'w-[110px]', maxWidth: '110px' },
    { key: 'company', label: t('tickets.company'), widthClass: 'w-[160px]', maxWidth: '160px' },
    { key: 'inquiry', label: t('tickets.inquiryHeader'), widthClass: 'w-[120px]', maxWidth: '140px' },
    { key: 'inquiryDetails', label: 'Inquiry Details', widthClass: 'w-[280px]', maxWidth: '520px' },
     { key: 'notes', label: t('tickets.notes'), widthClass: 'w-[160px]', maxWidth: '260px' },
    { key: 'csManager', label: t('tickets.csManager'), widthClass: 'w-[160px]', maxWidth: '160px' },
    { key: 'startDate', label: t('tickets.startDate'), widthClass: 'w-[120px]', maxWidth: '120px' },
    { key: 'endDate', label: t('tickets.endDate'), widthClass: 'w-[120px]', maxWidth: '120px' },
    { key: 'qaManager', label: t('tickets.qaManager'), widthClass: 'w-[160px]', maxWidth: '160px' },
    { key: 'developer', label: t('tickets.developer'), widthClass: 'w-[160px]', maxWidth: '160px' },
    { key: 'actions', label: '', widthClass: 'w-[64px] text-center', maxWidth: '64px' }
  ], [t]); // --- ADDED t ---

  // --- Filter tasks based on status ---
  const { activeTasks, completedTasks } = useMemo(() => {
    const active = [];
    const completed = [];
    const completeStatusString = 'Complete'; // This is the raw value

    for (const task of tasks) {
      if (task.status === completeStatusString) {
        completed.push(task);
      } else {
        active.push(task);
      }
    }
    return { activeTasks: active, completedTasks: completed };
  }, [tasks]);

  // Select tasks based on the active tab
  const tasksToDisplay = useMemo(() => {
    return activeTab === 'active' ? activeTasks : completedTasks;
  }, [activeTab, activeTasks, completedTasks]);

  // --- NEW: Apply Filters ---
  const filteredTasksToDisplay = useMemo(() => {
    const { company, developer, category } = filters;

    if (!company && !developer && !category) {
      return tasksToDisplay; // No filters, return original list
    }

    return tasksToDisplay.filter(task => {
      // Company filter (case-insensitive text search)
      if (company) {
        if (!task.company || !task.company.toLowerCase().includes(company.toLowerCase())) {
          return false;
        }
      }

      // Developer filter (exact match on UID)
      if (developer) {
        if (task.developer !== developer) {
          return false;
        }
      }

      // Category filter (exact match on string)
      if (category) {
        if (task.category !== category) {
          return false;
        }
      }

      return true; // Passed all active filters
    });
  }, [tasksToDisplay, filters]);

  // --- NEW: Sorting Logic ---
  const sortedTasks = useMemo(() => {
    // Create a shallow copy to sort
    let data = [...filteredTasksToDisplay];
    
    if (!sortConfig.key) return data;

    return data.sort((a, b) => {
      let valA, valB;

      if (sortConfig.key === 'ticketNo') {
        // Try converting to number for numeric sort, else string sort
        const numA = Number(a.ticketNo);
        const numB = Number(b.ticketNo);
        if (!isNaN(numA) && !isNaN(numB)) {
            valA = numA;
            valB = numB;
        } else {
            valA = (a.ticketNo || '').toLowerCase();
            valB = (b.ticketNo || '').toLowerCase();
        }
      } else if (sortConfig.key === 'startDate') {
        // startDate is usually YYYY-MM-DD string in this component
        const dateA = a.startDate ? new Date(a.startDate) : new Date(0);
        const dateB = b.startDate ? new Date(b.startDate) : new Date(0);
        valA = dateA.getTime();
        valB = dateB.getTime();
      } else {
        // Default fallback (shouldn't reach here if we only enable sort on specific cols)
        return 0;
      }

      if (valA < valB) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (valA > valB) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredTasksToDisplay, sortConfig]);

  // --- NEW: Sort Handler ---
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Load team members / options, and resolve member UIDs to labels if needed
  useEffect(() => {
    if (!teamId) return;
    const teamDocRef = doc(db, 'teams', teamId);
    let unsub = null;

    try {
      unsub = onSnapshot(teamDocRef, async (snap) => {
        if (!snap.exists()) {
          // keep defaults
          setMembersList(DEFAULT_PLACEHOLDERS.members);
          setCategoriesList(DEFAULT_PLACEHOLDERS.categories);
          setTypesList(DEFAULT_PLACEHOLDERS.types);
          setPriorityOptions(DEFAULT_PRIORITY_OPTIONS);
          setStatusOptions(DEFAULT_STATUS_OPTIONS);
          return;
        }
        const data = snap.data();

        // simple string arrays
        if (data.categories && Array.isArray(data.categories)) setCategoriesList(data.categories);
        if (data.types && Array.isArray(data.types)) setTypesList(data.types);
        if (data.priorities && Array.isArray(data.priorities)) setPriorityOptions(data.priorities);
        // Ensure statusOptions is set, otherwise use default
        if (data.statusOptions && Array.isArray(data.statusOptions) && data.statusOptions.length > 0) {
          setStatusOptions(data.statusOptions);
        } else {
          setStatusOptions(DEFAULT_STATUS_OPTIONS);
        }

        // members can be stored as array of uids, array of objects {uid, label}, or a mix
        if (data.members && Array.isArray(data.members)) {
          const resolved = await Promise.all(data.members.map(async (member) => {
            let memberUid;
            let existingLabel = null;

            // Check if 'member' is an object {uid, label} or just a string uid
            if (typeof member === 'object' && member !== null && member.uid) {
              memberUid = member.uid;
              existingLabel = member.label || member.name || member.email;
            } else if (typeof member === 'string') {
              memberUid = member;
            } else {
              // Invalid member data
              console.warn('Skipping invalid member data:', member);
              return null; // Will be filtered out later
            }

            // Guard against empty/invalid UIDs
            if (!memberUid) {
              console.warn('Skipping member with empty UID:', member);
              return null;
            }

            // If we already have a good label from the member object, don't re-fetch
            if (existingLabel) {
              return { uid: memberUid, label: existingLabel };
            }

            // If we only have a UID, fetch the user doc
            try {
              // **THE FIX**: memberUid is now guaranteed to be a string
              const uSnap = await getDoc(doc(db, 'users', memberUid));
              if (uSnap.exists()) {
                const udata = uSnap.data();
                const label = udata.displayName || udata.name || udata.email || memberUid;
                return { uid: memberUid, label };
              } else {
                return { uid: memberUid, label: memberUid }; // Fallback
              }
            } catch (err) {
              // Log the original problematic item (string or object) for better debugging
              console.error('Failed to load user data for:', member, err);
              return { uid: memberUid, label: memberUid }; // Fallback
            }
          }));

          // Filter out any nulls from invalid data
          const validMembers = resolved.filter(m => m !== null);

          // --- FIX: Filter for unique UIDs ---
          const uniqueMembers = Array.from(
            new Map(validMembers.map(m => [m.uid, m])).values()
          );
          setMembersList(uniqueMembers);
          // --- END FIX ---

        } else {
          // no members field -> use defaults
          setMembersList(DEFAULT_PLACEHOLDERS.members);
        }
      }, (err) => {
        console.error('Error listening to team meta:', err);
      });
    } catch (e) {
      // fallback to getDoc once if snapshot listener fails immediately
      (async () => {
        try {
          const snap = await getDoc(teamDocRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.categories && Array.isArray(data.categories)) setCategoriesList(data.categories);
            if (data.types && Array.isArray(data.types)) setTypesList(data.types);
            if (data.priorities && Array.isArray(data.priorities)) setPriorityOptions(data.priorities);
            if (data.statusOptions && Array.isArray(data.statusOptions) && data.statusOptions.length > 0) {
              setStatusOptions(data.statusOptions);
            } else {
              setStatusOptions(DEFAULT_STATUS_OPTIONS);
            }

            if (data.members && Array.isArray(data.members)) {
              if (data.members.length > 0 && typeof data.members[0] === 'object' && data.members[0].uid) {
                // --- FIX: De-duplicate object array ---
                const membersFromObjects = data.members.map(m => ({ uid: m.uid, label: m.label || m.name || m.email || m.uid }));
                const uniqueMembersFromObjects = Array.from(
                  new Map(membersFromObjects.map(m => [m.uid, m])).values()
                );
                setMembersList(uniqueMembersFromObjects);
                // --- END FIX ---
              } else {
                const uids = data.members;
                const resolved = await Promise.all(uids.map(async (uid) => {
                  try {
                    const uSnap = await getDoc(doc(db, 'users', uid));
                    if (uSnap.exists()) {
                      const udata = uSnap.data();
                      const label = udata.displayName || udata.name || udata.email || uid;
                      return { uid, label };
                    } else {
                      return { uid, label: uid };
                    }
                  } catch (err) {
                    console.error('Failed to load user for uid', uid, err);
                    return { uid, label: uid };
                  }
                }));
                // --- FIX: De-duplicate resolved UID array ---
                const uniqueMembersFallback = Array.from(
                  new Map(resolved.map(m => [m.uid, m])).values()
                );
                setMembersList(uniqueMembersFallback);
                // --- END FIX ---
              }
            } else {
              setMembersList(DEFAULT_PLACEHOLDERS.members);
            }
          }
        } catch (err) {
          console.error('Failed to load team options:', err);
        }
      })();
    }

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [teamId]);

  // --- REMOVED TRANSLATION useEffect ---

  // --- REMOVED OLD t function ---

  // --- Firestore realtime listener for tasks ---
  useEffect(() => {
    setIsLoading(true);
    if (!teamId) {
      setError("Invalid Team ID provided.");
      setIsLoading(false);
      return;
    }
    const tasksRef = collection(db, `teams/${teamId}/tasks`);
    const q = query(tasksRef, orderBy('priority', 'asc'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedTasks = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          // Convert Timestamps to YYYY-MM-DD strings for date inputs
          startDate: data.startDate instanceof Timestamp ? data.startDate.toDate().toISOString().slice(0, 10) : (data.startDate || ''),
          endDate: data.endDate instanceof Timestamp ? data.endDate.toDate().toISOString().slice(0, 10) : (data.endDate || ''),
          // Ensure potentially missing fields are empty strings
          notes: data.notes || '',
          inquiryDetails: data.inquiryDetails || '',
          inquiry: data.inquiry || ''
        };
      });
      setTasks(fetchedTasks);
      setIsLoading(false);
    }, (err) => {
      console.error("Error listening to tasks:", err);
      setError("Failed to load tasks in real-time.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [teamId]);

  // --- NEW: This effect opens the popup if a taskId is present in the URL ---
  useEffect(() => {
    if (taskId) {
      // We assume the popup is always for the 'inquiry' column
      // as it's the only one configured to open this popup.
      setPopupTargetInfo({ taskId: taskId, columnKey: 'inquiry' });
      setIsPopupOpen(true);
      document.title = `Task ${taskId} - inquiry`;
    } else {
      // If no taskId, ensure popup is closed
      setIsPopupOpen(false);
      setPopupTargetInfo(null);
      document.title = baseTitleRef.current; // Restore original title
    }
  }, [taskId]); // This effect runs when the taskId in the URL changes


  // --- Helper Functions ---
  const getCellKey = (taskId, headerKey) => `${taskId}-${headerKey}`;

  const setSavingState = (key, state) => {
    setSavingStatus(prev => ({ ...prev, [key]: state }));
    if (savingTimersRef.current[key]) {
      clearTimeout(savingTimersRef.current[key]);
      delete savingTimersRef.current[key];
    }
    if (state === 'saved') {
      savingTimersRef.current[key] = setTimeout(() => {
        setSavingStatus(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        delete savingTimersRef.current[key];
      }, 1200);
    }
  };

  // cleanup timer/debounce refs on unmount
  useEffect(() => {
    return () => {
      Object.values(savingTimersRef.current).forEach(t => clearTimeout(t));
      savingTimersRef.current = {};
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  // --- Save Helpers ---
  const saveDraft = useCallback(async (taskId, columnKey, value) => {
    if (!teamId || !taskId) {
      setError(`Missing teamId/taskId for auto-save.`);
      return;
    }
    const saveKey = getCellKey(taskId, columnKey);
    try {
      setSavingState(saveKey, 'saving');
      const taskDocRef = doc(db, `teams/${teamId}/tasks`, taskId);
      await updateDoc(taskDocRef, { [columnKey]: value });
      setSavingState(saveKey, 'saved');
    } catch (err) {
      console.error("Error auto-saving:", err);
      setError(`Failed to save ${columnKey}.`);
      setTimeout(() => setSavingState(saveKey, null), 1200);
    }
  }, [teamId]);

  const saveAndClose = useCallback(async (taskId, columnKey, value) => {
    if (!teamId || !taskId) {
      setError(`Missing teamId/taskId for save.`);
      return;
    }
    if (debounceRef.current) { // Clear any pending auto-save
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const saveKey = getCellKey(taskId, columnKey);
    try {
      setSavingState(saveKey, 'saving');
      const taskDocRef = doc(db, `teams/${teamId}/tasks`, taskId);
      await updateDoc(taskDocRef, { [columnKey]: value });
      setSavingState(saveKey, 'saved');
    } catch (err) {
      console.error("Error saving:", err);
      setError(`Failed to save ${columnKey}.`);
      setTimeout(() => setSavingState(saveKey, null), 1200);
    } finally {
      setEditingCell(null); // Close editing cell regardless of success/fail
      setEditingValue('');
      setEditingOriginalValue('');
    }
  }, [teamId]);

  // --- Delete Row ---
  const deleteRow = useCallback(async (taskId) => {
    if (!teamId || !taskId) {
      setError('Missing teamId/taskId for deletion.');
      return;
    }
    const key = getCellKey(taskId, 'actions'); // For saving indicator
    const confirmed = window.confirm(t('common.confirmDeleteTask'));
    if (!confirmed) return;
    try {
      setSavingState(key, 'saving');
      const taskDocRef = doc(db, `teams/${teamId}/tasks`, taskId);
      await deleteDoc(taskDocRef);
      // No need for setTasks locally, onSnapshot will handle UI update.
      setSavingState(key, 'saved'); // Briefly show saved then clear
    } catch (err) {
      console.error('Error deleting task:', err);
      setError('Failed to delete task.');
      setTimeout(() => setSavingState(key, null), 1200); // Clear error state after a bit
    }
  }, [teamId, t]);

  // --- Editing State Management ---
  const startEditingCell = (taskId, columnKey, currentValue) => {
    setEditingCell({ taskId, columnKey });
    setEditingValue(currentValue ?? '');
    setEditingOriginalValue(currentValue ?? '');
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditingValue('');
    setEditingOriginalValue('');
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  };

  // Debounced auto-save for text-like columns
  useEffect(() => {
    if (!editingCell) return;
    const { taskId, columnKey } = editingCell;
    const isTextarea = TEXTAREA_COLUMNS.includes(columnKey);
    if (!isTextarea) return; // Only debounce textareas

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      // Don't save if value hasn't changed (though this check might be redundant if Firestore handles it)
      if (editingValue !== editingOriginalValue) {
        saveDraft(taskId, columnKey, editingValue || '');
        // Update original value after successful draft save? Or rely on Firestore listener? Let's rely on listener.
      }
      debounceRef.current = null;
    }, 800);

    // Cleanup function to clear timeout if component unmounts or editing stops
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [editingValue, editingCell, saveDraft, editingOriginalValue]);


  // Auto-focus logic for inputs/selects when editing starts
  useEffect(() => {
    if (editingCell) {
      const isSelect = !TEXTAREA_COLUMNS.includes(editingCell.columnKey) && !['startDate', 'endDate'].includes(editingCell.columnKey);
      const ref = isSelect ? selectRef : inputRef;

      if (ref.current) {
        // Delay focus slightly to ensure element is fully rendered and ready
        setTimeout(() => {
          try {
            ref.current.focus();
            // Move cursor to end for inputs/textareas
            const el = ref.current;
            if (el.setSelectionRange && typeof el.value === 'string') {
              const pos = el.value.length;
              el.setSelectionRange(pos, pos);
            } else if (el.select && !isSelect) { // select() is often for inputs, not dropdowns
              el.select();
            }
          } catch (e) { console.warn("Auto-focus failed:", e); }
        }, 50);
      }
    }
  }, [editingCell]);

  // --- Event Handlers ---
  const handleCellDoubleClick = (e, taskId, columnKey) => {
    e.stopPropagation();
    if (!INLINE_EDITABLE_COLUMNS.includes(columnKey)) return;
    const task = tasks.find(t => t.id === taskId); // find from ALL tasks
    const currentValue = task ? (task[columnKey] ?? '') : '';
    startEditingCell(taskId, columnKey, String(currentValue));
  };

  // --- REPLACED: Click handler for columns that trigger the NotePopup ---
  const handleGenericPopupClick = (e, taskId, columnKey) => {
    e.stopPropagation();
    // Don't open popup if we are already editing this cell
    if (editingCell?.taskId === taskId && editingCell?.columnKey === columnKey) return;

    // Open popup if this column is designated
    if (POPUP_TRIGGER_COLUMNS.includes(columnKey)) {
      // --- NEW: Use React Router's navigate ---
      const modalUrl = `/team/${teamId}/task/${taskId}`;
      const modalTitle = `Task ${taskId} - ${columnKey}`;

      // Use navigate to change URL (this replaces history.pushState)
      navigate(modalUrl);
      document.title = modalTitle;

      // Set React state to show the modal
      setPopupTargetInfo({ taskId, columnKey });
      setIsPopupOpen(true);
      // --- END NEW ---
    }
  };

  // --- REPLACED: Close NotePopup ---
  const closeGenericPopup = () => {
    setIsPopupOpen(false);
    setPopupTargetInfo(null);
    document.title = baseTitleRef.current;

    // Navigate to the base team URL, replacing the history entry
    // This replaces history.back()
    navigate(`/team/${teamId}`, { replace: true });
  };


  // When user chooses a select option (handles regular options, 'Add new...', 'Invite user...')
  const handleSelectChange = async (taskId, columnKey, newValue) => {
    // Handle 'Invite user...' sentinel
    if (['csManager', 'qaManager', 'developer'].includes(columnKey) && newValue === '__INVITE_USER__') {
      setInviteMeta({ headerKey: columnKey, targetTaskId: taskId, applyToEditingCell: editingCell?.taskId === taskId && editingCell?.columnKey === columnKey });
      setIsInviteOpen(true);
      // Don't saveAndClose immediately
      return;
    }

    // Handle 'Add new...' sentinel for string-based dropdowns
    if (['category', 'type', 'priority', 'status'].includes(columnKey) && newValue === '__ADD_NEW__') {
      setAddOptionValue(''); // Clear previous value
      setAddOptionMeta({ headerKey: columnKey, targetTaskId: taskId, applyToEditingCell: editingCell?.taskId === taskId && editingCell?.columnKey === columnKey });
      setIsAddOptionOpen(true);
      // Don't saveAndClose immediately
      return;
    }

    // For regular option selections, save immediately and close the editor
    await saveAndClose(taskId, columnKey, newValue || '');
  };

  // Save when input/textarea blurs
  const handleBlurSave = (taskId, columnKey, value) => {
    // Only save on blur if the value actually changed from the original
    if (value !== editingOriginalValue) {
      saveAndClose(taskId, columnKey, value || '');
    } else {
      cancelEditing(); // If no change, just cancel editing state
    }
  };

  // Handle keyboard events (Enter/Escape) in inputs/textareas
  const handleInputKeyDown = (e) => {
    if (!editingCell) return;
    const { taskId, columnKey } = editingCell;
    const isTextarea = e.target && e.target.tagName === 'TEXTAREA';

    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelEditing();
    } else if (e.key === 'Enter') {
      if (isTextarea) {
        if (e.shiftKey) return; // Allow Shift+Enter for newlines in textareas
        e.preventDefault(); // Prevent default newline insertion
        saveAndClose(taskId, columnKey, editingValue || '');
      } else { // Normal input
        e.preventDefault(); // Prevent form submission if applicable
        saveAndClose(taskId, columnKey, editingValue || '');
      }
    }
  };

  // Toggle table expansion
  const toggleAllColumns = () => setIsAllExpanded(prev => !prev);

  // --- NEW: Filter Handlers ---
  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ company: '', developer: '', category: '' });
  }, []);

  // --- NEW: Task Creation Handler ---
  const handleTaskCreated = () => {
    // This function is now called by the CreateTaskModal
    // when it successfully creates a task OR when it's just closed.

    // 1. Close the modal
    setIsCreateTaskModalOpen(false);

    // 2. Call the onTaskChange prop (which is refreshAnnouncements from TeamView)
    if (onTaskChange) {
      onTaskChange(); // This tells TeamView to refresh the calendar
    }

    // You could also add code here to refresh the table itself if needed,
    // but the onSnapshot listener should handle that automatically.
  };


  // --- Add New Option Logic ---

  // Persists a new string option to the *correct* array field in the team document
  const saveNewOptionToTeam = useCallback(async (headerKey, newLabel) => {
    if (!teamId || !headerKey || !newLabel || !newLabel.trim()) {
      throw new Error('Invalid parameters for saving new option.');
    }
    const teamDocRef = doc(db, 'teams', teamId);
    const normalized = newLabel.trim();

    // Map the column key (from table header) to the Firestore field name
    let fieldName = '';
    if (headerKey === 'category') fieldName = 'categories';
    else if (headerKey === 'type') fieldName = 'types';
    else if (headerKey === 'priority') fieldName = 'priorities';
    else if (headerKey === 'status') fieldName = 'statusOptions';
    else {
      // This should not happen if called correctly
      console.error(`saveNewOptionToTeam called with unhandled headerKey: ${headerKey}`);
      throw new Error(`Cannot save option for unknown field: ${headerKey}`);
    }

    // Use arrayUnion to add the item if the field exists
    try {
      await updateDoc(teamDocRef, { [fieldName]: arrayUnion(normalized) });
    } catch (err) {
      // If the field doesn't exist yet (or doc doesn't exist), use setDoc with merge
      if (err.code === 'not-found' || err.message?.includes('No document to update')) {
        try {
          await setDoc(teamDocRef, { [fieldName]: [normalized] }, { merge: true });
        } catch (setErr) {
          console.error(`Error setting new field ${fieldName}:`, setErr);
          throw setErr; // Re-throw the error from setDoc
        }
      } else {
        console.error(`Error updating field ${fieldName} with arrayUnion:`, err);
        throw err; // Re-throw other update errors
      }
    }
  }, [teamId]);

  // Handles saving the new option entered in the modal
  const handleAddOptionSave = async () => {
    if (!addOptionMeta) return;
    const { headerKey, targetTaskId, applyToEditingCell } = addOptionMeta;
    const value = (addOptionValue || '').trim();
    if (!value) {
      setError('Please enter a value for the new option.');
      return;
    }

    try {
      setIsAddOptionOpen(false); // Close modal optimistically
      setError(null);

      // --- BUG FIX for Status Order ---
      if (headerKey === 'status') {
        // Status requires special handling to insert *before* the last item
        const teamDocRef = doc(db, 'teams', teamId);
        try {
          const snap = await getDoc(teamDocRef);
          let currentStatuses = (snap.exists() && snap.data()?.statusOptions?.length > 0)
            ? [...snap.data().statusOptions] // Important: Work with a copy
            : [...DEFAULT_STATUS_OPTIONS];     // Or a copy of the default

          if (!currentStatuses.includes(value)) { // Only add if it's truly new
            const completeStatus = currentStatuses.pop(); // Remove the last (assumed complete) status
            currentStatuses.push(value);                // Add the new status
            if (completeStatus !== undefined) {      // Add the complete status back at the end
              currentStatuses.push(completeStatus);
            }
            // Overwrite the entire array in Firestore
            await setDoc(teamDocRef, { statusOptions: currentStatuses }, { merge: true });
          }
          // If value already exists, we do nothing to the array, but still apply it below.

        } catch (err) {
          console.error("Failed to update status options array:", err);
          throw new Error(`Failed to save new status option: ${err.message}`); // Propagate error
        }
      } else {
        // For category, type, priority - simply append using the helper
        await saveNewOptionToTeam(headerKey, value);
      }
      // --- END BUG FIX ---

      // Firestore listener (onSnapshot) should update the local state (statusOptions, etc.)

      // Apply the newly added value to the cell that triggered the modal
      if (applyToEditingCell && editingCell) {
        setEditingValue(value); // Update local editing state
        await saveAndClose(editingCell.taskId, editingCell.columnKey, value); // Save to task
      } else if (targetTaskId) { // If not currently editing, but triggered from a specific task row
        await saveAndClose(targetTaskId, headerKey, value);
      }
      // If neither, the option is just added globally, nothing to apply to a specific task cell.

    } catch (err) {
      console.error('Failed to add option:', err);
      setError(`Failed to add ${headerKey} option. See console.`);
      // Re-open modal potentially? Or just show error. Currently shows error banner.
      setIsAddOptionOpen(true); // Re-open on error maybe?
    } finally {
      // Clear modal state whether successful or not, unless re-opened on error
      if (!error) { // Only clear if successful save
        setAddOptionMeta(null);
        setAddOptionValue('');
      }
    }
  };


  const handleAddOptionCancel = () => {
    setIsAddOptionOpen(false);
    setAddOptionMeta(null);
    setAddOptionValue('');
    setError(null); // Clear any errors shown in the modal
  };

  // --- Invite Member Logic ---
  // Called when InviteMemberModal successfully finds/invites a user
  const handleInviteCompleted = async (invitedUid, invitedLabel) => {
    setIsInviteOpen(false);

    // Persist the *new member's UID* to the team's 'members' array (if not already present)
    // Firestore listener will update the local membersList state
    try {
      const teamDocRef = doc(db, 'teams', teamId);
      // It's crucial to check if the team document stores UIDs or objects
      const snap = await getDoc(teamDocRef);
      if (snap.exists()) {
        const data = snap.data();
        const members = data.members || [];
        const isObjectArray = members.length > 0 && typeof members[0] === 'object';

        if (isObjectArray) {
          // Check if member object already exists
          if (!members.some(m => m.uid === invitedUid)) {
            await updateDoc(teamDocRef, { members: arrayUnion({ uid: invitedUid, label: invitedLabel }) });
          }
        } else {
          // Assume array of UIDs
          if (!members.includes(invitedUid)) {
            await updateDoc(teamDocRef, { members: arrayUnion(invitedUid) });
          }
        }
      } else {
        // Team doc doesn't exist, create it with the member
        await setDoc(teamDocRef, { members: [invitedUid] }); // Start with UID array for simplicity
      }

    } catch (err) {
      console.error('Failed to add invited UID to team members array', err);
      // Handle potential errors like permissions or doc not found during update after getDoc check
      setError('Could not update team members list.');
    }

    // Apply the invited user's UID to the task cell that triggered the invite
    if (inviteMeta?.applyToEditingCell && editingCell) {
      setEditingValue(invitedUid); // Update local editing state
      await saveAndClose(editingCell.taskId, editingCell.columnKey, invitedUid); // Save to task
    } else if (inviteMeta?.targetTaskId && inviteMeta?.headerKey) { // Triggered from a specific task row but not editing
      await saveAndClose(inviteMeta.targetTaskId, inviteMeta.headerKey, invitedUid);
    }

    setInviteMeta(null); // Clear invite metadata
  };

  const handleInviteCanceled = () => {
    setIsInviteOpen(false);
    setInviteMeta(null);
  };

  // --- Options Editor Modal Helpers (Passed down) ---
  const persistTeamArrayField = async (fieldName, arr) => {
    if (!teamId) throw new Error('Missing teamId');
    const teamRef = doc(db, 'teams', teamId);
    try {
      await setDoc(teamRef, { [fieldName]: arr }, { merge: true }); // Use setDoc + merge for simplicity
    } catch (err) {
      console.error(`Failed to persist ${fieldName}:`, err);
      throw err; // Re-throw to be caught in the modal
    }
  };

  const saveMemberLabel = async (uid, newLabel) => {
    if (!teamId) throw new Error('Missing teamId');
    const teamRef = doc(db, 'teams', teamId);
    try {
      const snap = await getDoc(teamRef);
      if (!snap.exists()) throw new Error('Team document not found.');

      const data = snap.data();
      const members = data.members || [];
      let newMembers;

      // Ensure we're working with objects
      if (members.length > 0 && typeof members[0] === 'object' && members[0].uid) {
        newMembers = members.map(m => (m.uid === uid ? { ...m, label: newLabel } : m));
      } else {
        // Convert existing UIDs to objects if necessary
        newMembers = members.map(mUid => (mUid === uid ? { uid, label: newLabel } : { uid: mUid, label: mUid }));
        // Add the member if they somehow weren't in the list (shouldn't happen with onSnapshot)
        if (!newMembers.some(m => m.uid === uid)) {
          newMembers.push({ uid, label: newLabel });
        }
      }
      await updateDoc(teamRef, { members: newMembers });
      // onSnapshot will update local state
    } catch (err) {
      console.error("Failed to save member label:", err);
      throw err;
    }
  };

  const removeMember = async (uid) => {
    if (!teamId) throw new Error('Missing teamId');
    if (!window.confirm('Remove this member from the team? This also removes their roles/permissions.')) return;
    const teamRef = doc(db, 'teams', teamId);
    try {
      const snap = await getDoc(teamRef);
      if (!snap.exists()) return; // Nothing to remove from

      const data = snap.data();
      const members = data.members || [];
      let updateData = {};

      // Handle both array types
      if (members.length > 0 && typeof members[0] === 'object') {
        updateData.members = members.filter(m => m.uid !== uid);
      } else {
        updateData.members = arrayRemove(uid); // Use arrayRemove for UID arrays
      }

      // Atomically remove roles/permissions if they exist
      updateData[`roles.${uid}`] = deleteField();
      updateData[`permissions.${uid}`] = deleteField();

      await updateDoc(teamRef, updateData);
      // onSnapshot will update local state
    } catch (err) {
      console.error("Failed to remove member:", err);
      throw err;
    }
  };

  const addMemberObject = async (uid, label) => {
    if (!teamId || !uid || !label) throw new Error('Missing info for adding member.');
    const teamRef = doc(db, 'teams', teamId);
    try {
      const snap = await getDoc(teamRef);
      const data = snap.exists() ? snap.data() : {};
      let members = data.members || [];
      let newMembers;

      // Standardize to object array
      if (members.length > 0 && typeof members[0] === 'object') {
        // Already objects, just add if not present
        if (!members.some(m => m.uid === uid)) {
          newMembers = [...members, { uid, label }];
        } else {
          newMembers = members; // Already exists
        }
      } else {
        // Convert existing UIDs to objects and add the new one
        newMembers = members.map(mUid => ({ uid: mUid, label: mUid }));
        if (!newMembers.some(m => m.uid === uid)) {
          newMembers.push({ uid, label });
        }
      }

      if (newMembers !== members) { // Only update if changed
        await setDoc(teamRef, { members: newMembers }, { merge: true });
      }
      // onSnapshot will update local state
    } catch (err) {
      console.error("Failed to add member object:", err);
      throw err;
    }
  };

  // --- Mappings for dynamic values ---
  const categoryKeyMap = {
    'Tech Issue': 'tickets.techIssue',
    'Feature Request': 'tickets.featureRequest',
    'Inquiry': 'tickets.inquiry'
  };

  // Add other maps as needed for 'type', 'priority', 'status'
  // For now, will just translate category or fallback
  const translateDynamic = (val, map) => {
    return t(map[val] || val);
  };

  // --- Cell Renderer ---
  const renderCellContent = (task, header) => {
    const isEditingThisCell = editingCell?.taskId === task.id && editingCell?.columnKey === header.key;
    const rawValue = task[header.key];
    const displayValue = rawValue !== undefined && rawValue !== null ? String(rawValue) : '';

    // --- Actions Column ---
    if (header.key === 'actions') {
      return (
        <div className="flex items-center justify-center gap-2 px-2 py-2">
          <button
            onClick={(e) => { e.stopPropagation(); deleteRow(task.id); }}
            title={t("common.deleteTask")}
            className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-500"
            aria-label={`${t("common.deleteTask")} ${task.id}`}
          >
            {/* Simple Trash Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      );
    }

    // --- Editing UI ---
    if (isEditingThisCell) {
      // Select (dropdown) columns
      if (['priority', 'category', 'type', 'status', 'csManager', 'qaManager', 'developer'].includes(header.key)) {
        let options = [];
        let isMemberSelect = false;
        switch (header.key) {
          case 'priority': options = priorityOptions; break;
          case 'category': options = categoriesList; break;
          case 'type': options = typesList; break;
          case 'status': options = statusOptions; break;
          default: // csManager, qaManager, developer
            options = membersList; // membersList is array of objects {uid,label}
            isMemberSelect = true;
        }

        return (
          <select
            ref={selectRef}
            value={editingValue} // For members, this is UID; for others, it's the string value
            onChange={(e) => {
              const newValue = e.target.value;
              setEditingValue(newValue); // Update local state immediately
              handleSelectChange(task.id, header.key, newValue); // Trigger save/modal logic
            }}
            onBlur={() => {
              // Delay blur slightly to allow onChange to fire first
              setTimeout(() => {
                // Check if we are *still* editing this cell (e.g., didn't switch to modal)
                if (editingCell?.taskId === task.id && editingCell?.columnKey === header.key) {
                  cancelEditing(); // If still editing, cancel (as select has no explicit save button)
                }
              }, 150);
            }}
            className="absolute inset-0 w-full h-full px-2 py-1 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm z-10"
            onKeyDown={handleInputKeyDown} // Handle Escape key
          >
            <option value="">{t('common.empty')}</option>
            {/* Render options */}
            {isMemberSelect
              ? membersList.map(m => <option key={m.uid} value={m.uid}>{t(m.label)}</option>)
              : options.map(opt => <option key={opt} value={opt}>{translateDynamic(opt, categoryKeyMap)}</option>) // Use translateDynamic
            }
            {/* Sentinel options */}
            {isMemberSelect
              ? <option value="__INVITE_USER__">{t('admin.inviteUser')}</option>
              : <option value="__ADD_NEW__">{t('common.addNew')}</option>
            }
            {/* Show original value if it's no longer in the list (e.g., removed member/option) */}
            {isMemberSelect && editingOriginalValue && !membersList.some(m => m.uid === editingOriginalValue) && (
              <option value={editingOriginalValue} disabled>{editingOriginalValue} (removed)</option>
            )}
            {!isMemberSelect && editingOriginalValue && !options.includes(editingOriginalValue) && (
              <option value={editingOriginalValue} disabled>{editingOriginalValue} (removed)</option>
            )}
          </select>
        );
      }

      // Date columns
      if (header.key === 'startDate' || header.key === 'endDate') {
        return (
          <input
            ref={inputRef}
            type="date"
            value={editingValue} // Should be in 'YYYY-MM-DD' format
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={(e) => handleBlurSave(task.id, header.key, e.target.value)}
            onKeyDown={handleInputKeyDown}
            className="absolute inset-0 w-full h-full px-3 py-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm z-10"
          />
        );
      }

      // Text-like columns (use textarea)
      if (TEXTAREA_COLUMNS.includes(header.key)) {
        return (
          <textarea
            ref={inputRef}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={(e) => handleBlurSave(task.id, header.key, e.target.value)}
            onKeyDown={handleInputKeyDown}
            rows={Math.max(3, (String(editingValue || '').split('\n').length))} // Auto-expand rows
            className="absolute inset-0 w-full h-full min-h-[80px] p-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm resize-y z-10 shadow-lg"
          />
        );
      }
      // Fallback for any other INLINE_EDITABLE_COLUMNS (shouldn't happen with current config)
      return (
        <input
          ref={inputRef}
          type="text"
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={(e) => handleBlurSave(task.id, header.key, e.target.value)}
          onKeyDown={handleInputKeyDown}
          className="absolute inset-0 w-full h-full px-3 py-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm z-10"
        />
      );
    }

    // --- Static Display UI (Not Editing) ---

    // Inquiry column always shows '(open)' button
    if (header.key === 'inquiry') {
      return (
        <div className="px-4 py-2.5">
          <button
            onClick={(e) => { handleGenericPopupClick(e, task.id, header.key); }}
            className="text-left w-full text-sm text-blue-600 hover:underline focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
            type="button"
          >
            {t('common.open')}
          </button>
        </div>
      );
    }

    // Member columns: Display label instead of UID
    if (['csManager', 'qaManager', 'developer'].includes(header.key)) {
      const foundMember = membersList.find(m => m.uid === displayValue);
      const label = foundMember ? foundMember.label : displayValue; // Show UID if not found
      const textToShow = t(label) || '-'; // This t is for the label, which might be a key or plain text
      return (
        <div
          className={`px-4 py-2.5 text-sm text-gray-700 ${isAllExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}
          title={textToShow}
        >
          {textToShow}
        </div>
      );
    }

    // Dynamic value columns (Category, Type, Priority, Status)
    if (['category', 'type', 'priority', 'status'].includes(header.key)) {
      const textToShow = translateDynamic(displayValue, categoryKeyMap) || '-';
      return (
        <div
          className={`px-4 py-2.5 text-sm text-gray-700 ${isAllExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}
          title={textToShow}
        >
          {textToShow}
        </div>
      );
    }

    // Default static display for other columns
    const textToShow = t(displayValue) || '-'; // t() will just return the value if not found
    return (
      <div
        className={`px-4 py-2.5 text-sm text-gray-700 ${isAllExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}
        title={textToShow}
      >
        {textToShow}
      </div>
    );
  };


  // --- Main Component Return ---
  return (
    <>
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        {/* Header Section */}
        <div className="px-6 pt-4 pb-3 flex flex-wrap justify-between items-center gap-y-2 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800">{t('tickets.title')}</h3>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Language Selector (REMOVED) */}

            {/* Expand/Collapse Button */}
            <button
              onClick={toggleAllColumns}
              title={isAllExpanded ? t('common.collapseAll') : t('common.expandAll')}
              className="text-sm py-1.5 px-3 rounded border bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {isAllExpanded ? t('common.collapseAll') : t('common.expandAll')}
            </button>
            {/* Edit Dropdowns Button */}
            <button
              onClick={() => setIsOptionsModalOpen(true)}
              title={t('admin.editOptions', 'Edit dropdown options')} // Added translation
              className="text-sm py-1.5 px-3 rounded border bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {t('admin.editOptions', 'Edit Options')}
            </button>
            {/* New Task Button */}
            <button
              onClick={() => setIsCreateTaskModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 px-4 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              {t('common.newTicket')}
            </button>
          </div>
        </div>

        {/* --- NEW: Filter Bar --- */}
        <div className="px-6 py-3 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm font-medium text-gray-700">{t('tickets.filters')}</span>

          {/* Company Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-company" className="text-sm text-gray-600">{t('tickets.filterByCompany')}</label>
            <input
              type="text"
              id="filter-company"
              value={filters.company}
              onChange={(e) => handleFilterChange('company', e.target.value)}
              placeholder={t('tickets.companyName')}
              className="text-sm py-1 px-2 rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Developer Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-developer" className="text-sm text-gray-600">{t('tickets.filterByDeveloper')}</label>
            <select
              id="filter-developer"
              value={filters.developer}
              onChange={(e) => handleFilterChange('developer', e.target.value)}
              className="text-sm py-1 px-2 rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{t('tickets.allDevelopers')}</option>
              {membersList.map(m => (
                <option key={m.uid} value={m.uid}>{m.label}</option> // Labels are already fine, no need to t()
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-category" className="text-sm text-gray-600">{t('tickets.filterByCategory')}</label>
            <select
              id="filter-category"
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
              className="text-sm py-1 px-2 rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{t('tickets.allCategories')}</option>
              {categoriesList.map(c => (
                <option key={c} value={c}>{translateDynamic(c, categoryKeyMap)}</option>
              ))}
            </select>
          </div>

          {/* Clear Button */}
          {(filters.company || filters.developer || filters.category) && (
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:underline focus:outline-none"
            >
              {t('common.clearFilters')}
            </button>
          )}
        </div>

        {/* Tabs Section */}
        <div className="px-6 border-b border-gray-200">
          <nav className="flex space-x-4 -mb-px" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('active')}
              className={`
                whitespace-nowrap py-3 px-1 border-b-2
                font-medium text-sm transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded-t-sm
                ${activeTab === 'active'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              {t('common.active')}
              <span className={`
                rounded-full px-2 py-0.5 ml-2 text-xs font-medium
                ${activeTab === 'active'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'}
              `}>
                {activeTasks.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`
                whitespace-nowrap py-3 px-1 border-b-2
                font-medium text-sm transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded-t-sm
                ${activeTab === 'completed'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              {t('common.completed')}
              <span className={`
                rounded-full px-2 py-0.5 ml-2 text-xs font-medium
                ${activeTab === 'completed'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'}
              `}>
                {completedTasks.length}
              </span>
            </button>
          </nav>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="text-center py-3 px-4 text-sm text-red-700 bg-red-100 border-b border-red-200">{error}</div>
        )}

        {/* Table Container */}
        <div className={`relative px-6 pb-6 ${isAllExpanded ? '' : 'overflow-x-auto'}`}>
          <table
            className={`table-auto w-full border-collapse mt-4 ${isAllExpanded ? '' : 'min-w-[1200px]'}`}
            style={{ tableLayout: isAllExpanded ? 'auto' : 'fixed' }}
          >
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {headers.map(h => {
                   // --- NEW: Sortable Header Logic ---
                   const isSortable = ['ticketNo', 'startDate'].includes(h.key);
                   const isActiveSort = sortConfig.key === h.key;

                   return (
                    <th
                      key={h.key}
                      scope="col"
                      onClick={isSortable ? () => handleSort(h.key) : undefined}
                      className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-300 ${(!isAllExpanded && h.widthClass) ? h.widthClass : ''} ${isSortable ? 'cursor-pointer hover:bg-gray-100 select-none group' : ''}`}
                      style={{
                        maxWidth: (!isAllExpanded ? h.maxWidth : undefined) || undefined,
                        whiteSpace: isAllExpanded ? 'normal' : 'nowrap', // Simplified whitespace logic
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <div className="flex items-center gap-1">
                        {h.label}
                        {isSortable && (
                          <span className={`text-[10px] ml-0.5 ${isActiveSort ? 'text-blue-600' : 'text-gray-300 group-hover:text-gray-400'}`}>
                             {isActiveSort 
                                ? (sortConfig.direction === 'asc' ? '▲' : '▼') 
                                : '▲▼' // Show both or a neutral indicator when not active
                              }
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-100">
              {/* Loading State */}
              {isLoading && (
                <tr><td colSpan={headers.length} className="text-center py-10 text-gray-500">{t('common.loading')}</td></tr>
              )}

              {/* Empty State */}
              {!isLoading && !error && filteredTasksToDisplay.length === 0 && (
                <tr>
                  <td colSpan={headers.length} className="text-center py-10 text-gray-500">
                    {tasksToDisplay.length > 0 ? (
                      t('tickets.noFilterMatch') // Filters are active but found nothing
                    ) : (
                      activeTab === 'active'
                        ? t('tickets.noActiveTasks') // Tab is genuinely empty
                        : t('tickets.noCompletedTasks')  // Tab is genuinely empty
                    )}
                  </td>
                </tr>
              )}

              {/* Task Rows */}
              {!isLoading && sortedTasks.map(task => (
                <tr key={task.id} className="group hover:bg-gray-50 transition-colors duration-100 relative">
                  {headers.map(header => {
                    const cellKey = getCellKey(task.id, header.key);
                    const isEditingThisCell = editingCell?.taskId === task.id && editingCell?.columnKey === header.key;
                    const isEditable = INLINE_EDITABLE_COLUMNS.includes(header.key);
                    const isPopupTrigger = POPUP_TRIGGER_COLUMNS.includes(header.key);

                    return (
                      <td
                        key={cellKey}
                        className={[
                          'relative align-top border-b border-gray-100',
                          // Cursors based on actionability
                          !isEditingThisCell && isPopupTrigger ? 'cursor-pointer' : '',
                          !isEditingThisCell && isEditable && !isPopupTrigger ? 'cursor-text' : '',
                          // Width classes only in fixed layout mode
                          (!isAllExpanded && header.widthClass) ? header.widthClass : '',
                          // No padding when editing, handled by input/select styles
                          isEditingThisCell ? 'p-0' : '',
                          // Align top in expanded mode for better readability with wrapped text
                          isAllExpanded ? 'align-top' : 'align-middle'
                        ].filter(Boolean).join(' ')}
                        style={{
                          maxWidth: (!isAllExpanded ? header.maxWidth : undefined) || undefined,
                          // Height auto needed for expanding textarea
                          height: (isEditingThisCell && TEXTAREA_COLUMNS.includes(header.key)) ? 'auto' : undefined,
                        }}
                        // Trigger editing/popup
                        onClick={(e) => !isEditingThisCell && handleGenericPopupClick(e, task.id, header.key)}
                        onDoubleClick={(e) => !isEditingThisCell && handleCellDoubleClick(e, task.id, header.key)}
                      >
                        {renderCellContent(task, header)}
                        {/* Saving Indicators */}
                        {savingStatus[cellKey] === 'saving' && (
                          <span className="absolute top-1 right-2 text-xs text-gray-500 animate-pulse">{t('common.saving')}</span>
                        )}
                        {savingStatus[cellKey] === 'saved' && (
                          <span className="absolute top-1 right-2 text-xs text-green-600">{t('common.saved')}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Modals --- */}

      {/* --- MODIFIED: NotePopup Modal (for Inquiry) --- */}
      {isPopupOpen && popupTargetInfo && (
        <NotePopup
          teamId={teamId}
          taskId={popupTargetInfo.taskId}
          columnKey={popupTargetInfo.columnKey}
          onClose={closeGenericPopup}
          isMasterAdminView={isMasterAdminView} // <-- Pass it down
          membersList={membersList}
        />
      )}


      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={handleTaskCreated}
        teamId={teamId}
        onTaskCreated={handleTaskCreated}
        // --- ADD THESE PROPS ---
        categoriesList={categoriesList}
        typesList={typesList}
        priorityOptions={priorityOptions}
        statusOptions={statusOptions}
        membersList={membersList}
      />


      {/* Add New Option Modal */}
      {isAddOptionOpen && addOptionMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black opacity-40 z-40" onClick={handleAddOptionCancel}></div>
          <div className="bg-white rounded-lg shadow-xl z-50 max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-semibold mb-2">{t('common.addNew')}</h4>
            <p className="text-sm text-gray-600 mb-4">{t('admin.addNewOption', `Add a new ${addOptionMeta.headerKey}`)}:</p>
            {/* Show error specific to this modal if any */}
            {error && addOptionMeta && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <input
              autoFocus
              value={addOptionValue}
              onChange={(e) => setAddOptionValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddOptionSave();
                if (e.key === 'Escape') handleAddOptionCancel();
              }}
              className="w-full border px-3 py-2 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('admin.newOptionValue', `New ${addOptionMeta.headerKey} value`)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={handleAddOptionCancel} className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400">{t('common.cancel')}</button>
              <button onClick={handleAddOptionSave} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Options Editor Modal */}
      {isOptionsModalOpen && (
        <OptionsEditorModal
          isOpen={isOptionsModalOpen}
          onClose={() => setIsOptionsModalOpen(false)}
          teamId={teamId}
          t={t} // Pass t function
          // Pass current state lists
          categoriesList={categoriesList}
          typesList={typesList}
          membersList={membersList}
          priorityOptions={priorityOptions}
          statusOptions={statusOptions}
          // Pass down persistence functions
          persistTeamArrayField={persistTeamArrayField}
          saveMemberLabel={saveMemberLabel}
          removeMember={removeMember}
          addMemberObject={addMemberObject}
          // Callbacks are less needed now due to onSnapshot, but can be kept for optimistic UI
          onCategoriesChange={() => { }}
          onTypesChange={() => { }}
          onMembersChange={() => { }}
          onPrioritiesChange={() => { }}
          onStatusOptionsChange={() => { }}
        />
      )}

      {/* Invite Member Modal */}
      {isInviteOpen && inviteMeta && (
        <InviteMemberModal
          isOpen={isInviteOpen}
          onClose={handleInviteCanceled}
          teamId={teamId}
          t={t} // Pass t function
          onInvited={handleInviteCompleted} // Pass the callback
        />
      )}
    </>
  );
};

export default TeamProjectTable;


/* ==================================================================
  MODAL COMPONENTS
===================================================================*/

/* ------------------------------------------------------------------
  OptionsEditorModal
  - Manages editing Categories, Types, Priorities, Statuses, Members
-------------------------------------------------------------------*/
function OptionsEditorModal({
  isOpen,
  onClose,
  teamId,
  t, // Receive t function as a prop
  categoriesList,
  typesList,
  membersList, // Array of {uid, label}
  priorityOptions,
  statusOptions,
  persistTeamArrayField, // (fieldName, array) => Promise<void>
  saveMemberLabel,       // (uid, newLabel) => Promise<void>
  removeMember,          // (uid) => Promise<void>
  addMemberObject,       // (uid, label) => Promise<void>
  // Optimistic update callbacks (optional now)
  onCategoriesChange,
  onTypesChange,
  onMembersChange,
  onPrioritiesChange,
  onStatusOptionsChange,
}) {
  const [tab, setTab] = useState('categories'); // 'categories' | 'types' | 'priorities' | 'statuses' | 'members'
  const [items, setItems] = useState([]);        // Current list being edited (strings or member objects)
  const [newValue, setNewValue] = useState('');        // Input for adding new items
  const [editingIndex, setEditingIndex] = useState(null); // Index of item being edited
  const [editingValueLocal, setEditingValueLocal] = useState(''); // Local state for the item being edited
  const [modalError, setModalError] = useState(''); // Error specific to this modal
  const [isSaving, setIsSaving] = useState(false); // Loading state for async operations

  // Reset modal state when opened
  useEffect(() => {
    if (!isOpen) return;
    setTab('categories'); // Default tab
    setEditingIndex(null);
    setEditingValueLocal('');
    setNewValue('');
    setModalError('');
    setIsSaving(false);
  }, [isOpen]);

  // Update local items list when the active tab or props change
  useEffect(() => {
    if (!isOpen) return;
    let currentItems = [];
    switch (tab) {
      case 'categories': currentItems = categoriesList; break;
      case 'types': currentItems = typesList; break;
      case 'priorities': currentItems = priorityOptions; break;
      case 'statuses': currentItems = statusOptions; break;
      case 'members': currentItems = membersList.map(m => ({ uid: m.uid, label: m.label })); break; // Use a copy for members
      default: currentItems = [];
    }
    setItems(currentItems);
    // Reset editing state when switching tabs
    setEditingIndex(null);
    setEditingValueLocal('');
    setNewValue('');
    setModalError('');
  }, [tab, categoriesList, typesList, priorityOptions, statusOptions, membersList, isOpen]);

  if (!isOpen) return null;

  // --- Persistence Wrappers (with loading/error handling) ---

  const handlePersistArray = async (fieldName, newArr) => {
    setModalError('');
    setIsSaving(true);
    try {
      await persistTeamArrayField(fieldName, newArr);
      // Let onSnapshot update the list visually
    } catch (err) {
      console.error(`Failed to persist ${fieldName}:`, err);
      setModalError(t('admin.saveError', `Failed to save changes for ${fieldName}. See console.`));
      // Optionally revert local state if needed, but onSnapshot should correct it
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMemberLabel = async (uid, newLabel) => {
    setModalError('');
    setIsSaving(true);
    try {
      await saveMemberLabel(uid, newLabel);
      setEditingIndex(null); // Exit editing mode on success
      setEditingValueLocal('');
    } catch (err) {
      setModalError(t('admin.saveMemberLabelError', 'Failed to save member label. See console.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveMember = async (uid) => {
    setModalError('');
    setIsSaving(true);
    try {
      await removeMember(uid);
      // Let onSnapshot handle UI update
    } catch (err) {
      setModalError(t('admin.removeMemberError', 'Failed to remove member. See console.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMemberObject = async (uid, label) => {
    setModalError('');
    setIsSaving(true);
    try {
      await addMemberObject(uid, label);
      setNewValue(''); // Clear input on success
    } catch (err) {
      setModalError(t('admin.addMemberError', 'Failed to add member. See console.'));
    } finally {
      setIsSaving(false);
    }
  };

  // --- Action Handlers ---

  const handleAdd = async () => {
    const v = (newValue || '').trim();
    if (!v) return;
    setModalError('');

    if (tab === 'members') {
      let uid = v;
      let label = v;
      if (v.includes('|')) { // Support "uid|label" format
        const parts = v.split('|');
        uid = parts[0].trim();
        label = parts.slice(1).join('|').trim() || uid; // Fallback label to uid if empty
      }
      if (!uid) {
        setModalError(t('admin.uidRequiredError', 'Please provide a UID (or uid|label).'));
        return;
      }
      // Check if UID already exists
      if (items.some(item => item.uid === uid)) {
        setModalError(t('admin.memberExistsError', "A member with this UID already exists."));
        return;
      }
      await handleAddMemberObject(uid, label);
      return;
    }

    // For string-based lists
    if (items.includes(v)) {
      setModalError(t('admin.itemExistsError', "This item already exists."));
      return;
    }

    let next = [...items, v];
    let fieldName = '';
    // Special case: Ensure new status is added *before* the last item
    if (tab === 'statuses') {
      const completeStatus = next.pop(); // Remove last
      next.push(v); // Add new
      if (completeStatus !== undefined) next.push(completeStatus); // Add last back
      fieldName = 'statusOptions';
    } else {
      // Normal append for others
      fieldName = tab; // 'categories', 'types', 'priorities'
      if (tab === 'priorities') fieldName = 'priorities'; // Ensure correct field name
      else if (tab === 'categories') fieldName = 'categories';
      else if (tab === 'types') fieldName = 'types';
      else {
        setModalError(t('admin.invalidTabError', `Cannot determine field name for tab: ${tab}`));
        return;
      }
    }


    setItems(next); // Optimistic UI update
    setNewValue(''); // Clear input
    await handlePersistArray(fieldName, next); // Persist
  };

  const startEdit = (idx) => {
    setModalError('');
    setEditingIndex(idx);
    const itemToEdit = items[idx];
    // Check item type here as well
    setEditingValueLocal(typeof itemToEdit === 'object' && itemToEdit !== null ? itemToEdit.label : itemToEdit);
  };

  const saveEdit = async () => {
    const v = (editingValueLocal || '').trim();
    if (!v || editingIndex === null) return;
    setModalError('');

    // Check item type to decide logic
    const itemToEdit = items[editingIndex];
    if (typeof itemToEdit === 'object' && itemToEdit !== null && 'uid' in itemToEdit) {
      const uid = itemToEdit.uid;
      // Check if new label is empty
      if (!v) {
        setModalError(t('admin.memberLabelEmptyError', "Member label cannot be empty."));
        return;
      }
      await handleSaveMemberLabel(uid, v);
      return;
    }

    // For string-based lists
    // Check if the edited value duplicates another existing item
    const duplicateIndex = items.findIndex(item => item === v);
    if (duplicateIndex !== -1 && duplicateIndex !== editingIndex) {
      setModalError(t('admin.itemExistsError', "This item already exists."));
      return;
    }

    const next = items.map((it, i) => (i === editingIndex ? v : it));

    let fieldName = '';
    if (tab === 'statuses') fieldName = 'statusOptions';
    else if (tab === 'priorities') fieldName = 'priorities';
    else if (tab === 'categories') fieldName = 'categories';
    else if (tab === 'types') fieldName = 'types';
    else {
      setModalError(t('admin.invalidTabError', `Cannot determine field name for tab: ${tab}`));
      return;
    }

    setItems(next); // Optimistic update
    setEditingIndex(null); // Exit editing mode locally
    setEditingValueLocal('');
    await handlePersistArray(fieldName, next);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingValueLocal('');
    setModalError('');
  };

  const handleRemove = async (idx) => {
    if (isSaving) return; // Prevent double actions
    setModalError('');

    const itemToRemove = items[idx];

    // Check item type to decide logic
    if (typeof itemToRemove === 'object' && itemToRemove !== null && 'uid' in itemToRemove) {
      const uid = itemToRemove.uid;
      await handleRemoveMember(uid);
      return;
    }

    // For string-based lists
    // Prevent deleting the last status if it's the 'Complete' status? Maybe allow via confirmation.
    if (tab === 'statuses' && idx === items.length - 1) {
      if (!window.confirm(t('admin.confirmDeleteFinalStatus', 'Are you sure you want to remove the final status? This is usually the "Complete" status.'))) {
        return;
      }
    } else if (!window.confirm(t('common.confirmDelete'))) { // Use translated confirm
      return;
    }


    const next = items.filter((_, i) => i !== idx);

    let fieldName = '';
    if (tab === 'statuses') fieldName = 'statusOptions';
    else if (tab === 'priorities') fieldName = 'priorities';
    else if (tab === 'categories') fieldName = 'categories';
    else if (tab === 'types') fieldName = 'types';
    else {
      setModalError(t('admin.invalidTabError', `Cannot determine field name for tab: ${tab}`));
      return;
    }

    setItems(next); // Optimistic update
    await handlePersistArray(fieldName, next);
  };

  const handleCloseModal = () => {
    if (isSaving) return; // Don't close while saving
    onClose();
  };

  // --- List Item Renderer ---
  const renderListItem = (it, idx) => {
    const isEditingThisItem = editingIndex === idx;

    // --- FIX 1: Check item type, not tab state ---
    // --- Member List Item ---
    if (typeof it === 'object' && it !== null && 'uid' in it) {
      return (
        <li key={it.uid} className="flex items-center justify-between gap-2 bg-gray-50 p-2 rounded text-sm">
          <div className="min-w-0 flex-1">
            {isEditingThisItem ? (
              <input
                className="border rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={editingValueLocal}
                onChange={(e) => setEditingValueLocal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') cancelEdit();
                }}
                autoFocus
              />
            ) : (
              <div className="font-medium text-gray-800 truncate" title={it.label}>{it.label}</div>
            )}
            <div className="text-xs text-gray-500 truncate" title={it.uid}>{t('admin.uidLabel', 'UID')}: {it.uid}</div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {isEditingThisItem ? (
              <>
                <button className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50" onClick={saveEdit} disabled={isSaving}>{t('common.save')}</button>
                <button className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300 disabled:opacity-50" onClick={cancelEdit} disabled={isSaving}>{t('common.cancel')}</button>
              </>
            ) : (
              <>
                <button className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs hover:bg-yellow-200 disabled:opacity-50" onClick={() => startEdit(idx)} disabled={isSaving}>{t('common.edit')}</button>
                <button className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 disabled:opacity-50" onClick={() => handleRemove(idx)} disabled={isSaving}>{t('common.remove')}</button>
              </>
            )}
          </div>
        </li>
      );
    }

    // --- Regular String List Item ---
    // (If it's not an object, it must be a string)
    return (
      <li key={String(it) + idx} className="flex items-center justify-between gap-2 bg-gray-50 p-2 rounded text-sm">
        <div className="min-w-0 flex-1">
          {isEditingThisItem ? (
            <input
              className="border rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={editingValueLocal}
              onChange={(e) => setEditingValueLocal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              autoFocus
            />
          ) : (
            <div className="text-gray-800 truncate" title={String(it)}>{String(it)}</div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isEditingThisItem ? (
            <>
              <button className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50" onClick={saveEdit} disabled={isSaving}>{t('common.save')}</button>
              <button className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300 disabled:opacity-50" onClick={cancelEdit} disabled={isSaving}>{t('common.cancel')}</button>
            </>
          ) : (
            <>
              <button className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs hover:bg-yellow-200 disabled:opacity-50" onClick={() => startEdit(idx)} disabled={isSaving}>{t('common.edit')}</button>

              <button className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 disabled:opacity-50" onClick={() => handleRemove(idx)} disabled={isSaving}>{t('common.remove')}</button>
            </>
          )}
        </div>
      </li>
    );
  };

  // --- Helper to get translated tab title ---
  const getTabTitle = (tabKey) => {
    switch (tabKey) {
      case 'categories': return t('admin.categories');
      case 'types': return t('admin.types');
      case 'priorities': return t('admin.priorities');
      case 'statuses': return t('admin.statuses');
      case 'members': return t('admin.tabMembers');
      default: return tabKey;
    }
  }

  // --- Modal Structure ---
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl z-50 max-w-3xl w-full p-6 relative flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center mb-4 pb-2 border-b">
          <h3 className="text-lg font-semibold text-gray-800">{t('admin.editDropdownOptions', 'Edit Dropdown Options')}</h3>
          <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 focus:outline-none" disabled={isSaving}>&times;</button>
        </div>

        {/* Layout: Sidebar + Content */}
        <div className="flex gap-4 flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="w-44 bg-gray-50 p-3 rounded flex-shrink-0 overflow-y-auto">
            <nav className="flex flex-col gap-1">
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'categories' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('categories')}>{t('admin.categories')}</button>
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'types' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('types')}>{t('admin.types')}</button>
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'priorities' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('priorities')}>{t('admin.priorities')}</button>
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'statuses' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('statuses')}>{t('admin.statuses')}</button>
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'members' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('members')}>{t('admin.tabMembers')}</button>
            </nav>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Add New Item Form */}
            <div className="mb-3 flex items-center justify-between gap-2 pb-2 border-b">
              <h4 className="text-base font-medium text-gray-700">{getTabTitle(tab)}</h4>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
              >
                <input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={tab === 'members' ? t('admin.memberPlaceholder', 'uid|label (or uid)') : t('admin.newOptionValue', 'New value')}
                  className="border px-2 py-1 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 flex-grow"
                  disabled={isSaving}
                />
                <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50" disabled={isSaving}>
                  {isSaving ? t('common.saving', 'Saving...') : t('common.add', 'Add')}
                </button>
              </form>
            </div>

            {/* Error Display */}
            {modalError && <p className="text-red-600 text-sm mb-2 px-1">{modalError}</p>}

            {/* List of Items */}
            <ul className="space-y-1.5 overflow-y-auto flex-1 pr-1">
              {/* --- FIX 2: Added key prop --- */}
              {items.length === 0 && <li key="empty-state" className="text-sm text-gray-500 px-1 py-4 text-center">{t('admin.noItems', 'No items defined for')} {tab}.</li>}

              {items.map((it, idx) => renderListItem(it, idx))}

              {/* --- FIX 2: Added key prop --- */}
              <li key="spacer" style={{ height: '10px' }}></li>
            </ul>

            {/* Footer / Close Button */}
            <div className="mt-4 pt-3 border-t flex justify-end gap-2">
              <button onClick={handleCloseModal} className="px-4 py-1.5 rounded border text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50" disabled={isSaving}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------
  InviteMemberModal
  - Finds user by email, sends notification, adds UID to team
-------------------------------------------------------------------*/
function InviteMemberModal({ isOpen, onClose, teamId, t, onInvited }) {
  const [email, setEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setError('');
      setSuccess('');
      setIsInviting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInvite = async () => {
    if (!email.trim() || !email.includes('@')) { // Basic email validation
      setError(t('admin.invalidEmail', 'Please enter a valid email address.'));
      return;
    }

    setIsInviting(true);
    setError('');
    setSuccess('');

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Authentication error: User not logged in.");
      }

      // 1. Find the user by email in the 'users' collection
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email.trim().toLowerCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError(t('admin.userNotFound', 'User with this email not found in the system.'));
        setIsInviting(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const invitedUserId = userDoc.id;
      const invitedData = userDoc.data();
      // Determine best label: displayName > name > email > uid
      const invitedLabel = invitedData.displayName || invitedData.name || invitedData.email || invitedUserId;

      // Prevent self-invites
      if (invitedUserId === currentUser.uid) {
        setError(t('admin.inviteSelfError', "You cannot invite yourself to the team."));
        setIsInviting(false);
        return;
      }

      // 2. Get team data (needed for name and member check)
      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await getDoc(teamRef);

      if (!teamSnap.exists()) {
        // This case should ideally not happen if the table component loaded correctly
        setError(t('admin.teamNotFoundError', 'Team data not found. Cannot process invitation.'));
        setIsInviting(false);
        return;
      }

      const teamData = teamSnap.data();
      const teamName = teamData.teamName || `Team ${teamId.substring(0, 6)}`; // Use ID prefix if no name
      const members = teamData.members || [];

      // 3. Check if user is already a member (handle both UID array and object array)
      const isAlreadyMember = members.some(member =>
        (typeof member === 'object' && member.uid === invitedUserId) || // Check object array
        (typeof member === 'string' && member === invitedUserId)     // Check UID string array
      );

      if (isAlreadyMember) {
        setError(t('admin.alreadyMemberError', 'This user is already a member of the team.'));
        setIsInviting(false);
        return;
      }

      // 4. Create the invitation notification for the invited user
      const senderName = currentUser.displayName || currentUser.email || 'A team member';
      await addDoc(collection(db, 'notifications'), {
        userId: invitedUserId,       // Recipient
        type: 'INVITATION',
        senderId: currentUser.uid,
        senderName: senderName,
        teamId: teamId,
        teamName: teamName,
        createdAt: serverTimestamp(),
        isRead: false,
        message: `${senderName} ${t('admin.inviteNotification', 'invited you to join the team')} "${teamName}".`
      });

      setSuccess(`${t('admin.inviteSuccess', 'Invitation sent successfully to')} ${invitedLabel} (${email})!`);

      // 5. Call the onInvited callback to update the team document and potentially the table cell
      if (typeof onInvited === 'function') {
        onInvited(invitedUserId, invitedLabel); // Pass UID and Label back
      }

      // Optionally close modal after success
      setTimeout(() => {
        if (typeof onClose === 'function') onClose();
      }, 1500); // Keep success message visible briefly

    } catch (err) {
      console.error('Error sending invitation:', err);
      setError(t('admin.inviteFailError', 'Failed to send invitation. Please check the console and try again.'));
      setIsInviting(false); // Ensure loading state stops on error
    }
    // No finally block needed for setIsInviting if errors are handled above
  };

  const handleClose = () => {
    // Only allow close if not currently inviting
    if (!isInviting && typeof onClose === 'function') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      {/* Modal Content */}
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative">
        {/* Close Button */}
        <button onClick={handleClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 focus:outline-none" disabled={isInviting}>&times;</button>
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-gray-800">{t('admin.inviteMember')}</h3>
          <p className="text-sm text-gray-500 mt-1">{t('admin.inviteSubtext', 'Enter the email address of the user you want to invite.')}</p>
        </div>

        {/* Status Messages */}
        {error && <p className="text-red-600 text-sm mb-3 p-2 bg-red-50 rounded border border-red-200">{error}</p>}
        {success && <p className="text-green-600 text-sm mb-3 p-2 bg-green-50 rounded border border-green-200">{success}</p>}

        {/* Input Field */}
        {!success && ( // Hide input after success
          <div className="space-y-4">
            <div>
              <label htmlFor="inviteEmail" className="sr-only">{t('admin.emailLabel', "User's Email")}</label>
              <input
                type="email"
                id="inviteEmail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('admin.emailPlaceholder', 'e.g., teammate@example.com')}
                className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                disabled={isInviting}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 mt-6 border-t pt-4">
          <button onClick={handleClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md text-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50" disabled={isInviting}>
            {success ? t('common.close') : t('common.cancel')}
          </button>
          {!success && ( // Hide invite button after success
            <button
              onClick={handleInvite}
              disabled={isInviting || !email.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isInviting ? t('common.inviting', 'Sending...') : t('admin.sendInvite', 'Send Invite')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}