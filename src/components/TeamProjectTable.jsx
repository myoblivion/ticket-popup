// TeamProjectTable.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

const TeamProjectTable = ({ teamId, onTaskChange, isMasterAdminView = false }) => {
  const { t } = useContext(LanguageContext);

  // --- React Router Hooks ---
  const { taskId } = useParams();
  const navigate = useNavigate();

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

  // Single state for expanding all columns
  const [isAllExpanded, setIsAllExpanded] = useState(false);

  // --- NEW: Pagination State ---
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20); // Default to 20 as requested

  // dynamic option lists (load from Firestore team doc if available)
  const [membersList, setMembersList] = useState(DEFAULT_PLACEHOLDERS.members);
  const [categoriesList, setCategoriesList] = useState(DEFAULT_PLACEHOLDERS.categories);
  const [typesList, setTypesList] = useState(DEFAULT_PLACEHOLDERS.types);

  // Support team-level priorities/status overrides
  const [priorityOptions, setPriorityOptions] = useState(DEFAULT_PRIORITY_OPTIONS);
  const [statusOptions, setStatusOptions] = useState(DEFAULT_STATUS_OPTIONS);

  // invite modal state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteMeta, setInviteMeta] = useState(null);

  // add-option modal state (for category/type/priority/status)
  const [isAddOptionOpen, setIsAddOptionOpen] = useState(false);
  const [addOptionMeta, setAddOptionMeta] = useState(null);
  const [addOptionValue, setAddOptionValue] = useState('');

  // Options Editor modal
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false);

  // --- Tab State ---
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'completed'

  // --- Filter State ---
  const [filters, setFilters] = useState({
    company: '',
    developer: '',
    category: ''
  });

  // --- Sorting State ---
  const [sortConfig, setSortConfig] = useState({ key: 'startDate', direction: 'desc' });

  // --- Ref to store original document title ---
  const baseTitleRef = useRef(document.title);

  // headers
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
  ], [t]);

  // --- Filter tasks based on status ---
  const { activeTasks, completedTasks } = useMemo(() => {
    const active = [];
    const completed = [];
    const completeStatusString = 'Complete';

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

  // --- Apply Filters ---
  const filteredTasksToDisplay = useMemo(() => {
    const { company, developer, category } = filters;

    if (!company && !developer && !category) {
      return tasksToDisplay;
    }

    return tasksToDisplay.filter(task => {
      // Company filter
      if (company) {
        if (!task.company || !task.company.toLowerCase().includes(company.toLowerCase())) {
          return false;
        }
      }
      // Developer filter
      if (developer) {
        if (task.developer !== developer) {
          return false;
        }
      }
      // Category filter
      if (category) {
        if (task.category !== category) {
          return false;
        }
      }
      return true;
    });
  }, [tasksToDisplay, filters]);

  // --- Sorting Logic ---
  const sortedTasks = useMemo(() => {
    let data = [...filteredTasksToDisplay];
    
    if (!sortConfig.key) return data;

    return data.sort((a, b) => {
      let valA, valB;

      if (sortConfig.key === 'ticketNo') {
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
        const dateA = a.startDate ? new Date(a.startDate) : new Date(0);
        const dateB = b.startDate ? new Date(b.startDate) : new Date(0);
        valA = dateA.getTime();
        valB = dateB.getTime();
      } else {
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

  // --- Reset Page on Filter/Sort/Tab Change ---
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, activeTab, sortConfig]);

  // --- NEW: Pagination Logic ---
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentTasks = sortedTasks.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(sortedTasks.length / itemsPerPage);

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // --- Sort Handler ---
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Load team members / options
  useEffect(() => {
    if (!teamId) return;
    const teamDocRef = doc(db, 'teams', teamId);
    let unsub = null;

    try {
      unsub = onSnapshot(teamDocRef, async (snap) => {
        if (!snap.exists()) {
          setMembersList(DEFAULT_PLACEHOLDERS.members);
          setCategoriesList(DEFAULT_PLACEHOLDERS.categories);
          setTypesList(DEFAULT_PLACEHOLDERS.types);
          setPriorityOptions(DEFAULT_PRIORITY_OPTIONS);
          setStatusOptions(DEFAULT_STATUS_OPTIONS);
          return;
        }
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
          const resolved = await Promise.all(data.members.map(async (member) => {
            let memberUid;
            let existingLabel = null;

            if (typeof member === 'object' && member !== null && member.uid) {
              memberUid = member.uid;
              existingLabel = member.label || member.name || member.email;
            } else if (typeof member === 'string') {
              memberUid = member;
            } else {
              return null;
            }

            if (!memberUid) return null;

            if (existingLabel) {
              return { uid: memberUid, label: existingLabel };
            }

            try {
              const uSnap = await getDoc(doc(db, 'users', memberUid));
              if (uSnap.exists()) {
                const udata = uSnap.data();
                const label = udata.displayName || udata.name || udata.email || memberUid;
                return { uid: memberUid, label };
              } else {
                return { uid: memberUid, label: memberUid };
              }
            } catch (err) {
              return { uid: memberUid, label: memberUid };
            }
          }));

          const validMembers = resolved.filter(m => m !== null);
          const uniqueMembers = Array.from(
            new Map(validMembers.map(m => [m.uid, m])).values()
          );
          setMembersList(uniqueMembers);

        } else {
          setMembersList(DEFAULT_PLACEHOLDERS.members);
        }
      }, (err) => {
        console.error('Error listening to team meta:', err);
      });
    } catch (e) {
      // Fallback logic omitted for brevity as it mirrors the listener
    }

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [teamId]);

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
          startDate: data.startDate instanceof Timestamp ? data.startDate.toDate().toISOString().slice(0, 10) : (data.startDate || ''),
          endDate: data.endDate instanceof Timestamp ? data.endDate.toDate().toISOString().slice(0, 10) : (data.endDate || ''),
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

  // --- Popup logic ---
  useEffect(() => {
    if (taskId) {
      setPopupTargetInfo({ taskId: taskId, columnKey: 'inquiry' });
      setIsPopupOpen(true);
      document.title = `Task ${taskId} - inquiry`;
    } else {
      setIsPopupOpen(false);
      setPopupTargetInfo(null);
      document.title = baseTitleRef.current;
    }
  }, [taskId]);


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
    if (debounceRef.current) {
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
      setEditingCell(null);
      setEditingValue('');
      setEditingOriginalValue('');
    }
  }, [teamId]);

  const deleteRow = useCallback(async (taskId) => {
    if (!teamId || !taskId) {
      setError('Missing teamId/taskId for deletion.');
      return;
    }
    const key = getCellKey(taskId, 'actions');
    const confirmed = window.confirm(t('common.confirmDeleteTask'));
    if (!confirmed) return;
    try {
      setSavingState(key, 'saving');
      const taskDocRef = doc(db, `teams/${teamId}/tasks`, taskId);
      await deleteDoc(taskDocRef);
      setSavingState(key, 'saved');
    } catch (err) {
      console.error('Error deleting task:', err);
      setError('Failed to delete task.');
      setTimeout(() => setSavingState(key, null), 1200);
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

  useEffect(() => {
    if (!editingCell) return;
    const { taskId, columnKey } = editingCell;
    const isTextarea = TEXTAREA_COLUMNS.includes(columnKey);
    if (!isTextarea) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (editingValue !== editingOriginalValue) {
        saveDraft(taskId, columnKey, editingValue || '');
      }
      debounceRef.current = null;
    }, 800);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [editingValue, editingCell, saveDraft, editingOriginalValue]);


  useEffect(() => {
    if (editingCell) {
      const isSelect = !TEXTAREA_COLUMNS.includes(editingCell.columnKey) && !['startDate', 'endDate'].includes(editingCell.columnKey);
      const ref = isSelect ? selectRef : inputRef;

      if (ref.current) {
        setTimeout(() => {
          try {
            ref.current.focus();
            const el = ref.current;
            if (el.setSelectionRange && typeof el.value === 'string') {
              const pos = el.value.length;
              el.setSelectionRange(pos, pos);
            } else if (el.select && !isSelect) {
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
    const task = tasks.find(t => t.id === taskId);
    const currentValue = task ? (task[columnKey] ?? '') : '';
    startEditingCell(taskId, columnKey, String(currentValue));
  };

  const handleGenericPopupClick = (e, taskId, columnKey) => {
    e.stopPropagation();
    if (editingCell?.taskId === taskId && editingCell?.columnKey === columnKey) return;

    if (POPUP_TRIGGER_COLUMNS.includes(columnKey)) {
      const modalUrl = `/team/${teamId}/task/${taskId}`;
      const modalTitle = `Task ${taskId} - ${columnKey}`;
      navigate(modalUrl);
      document.title = modalTitle;
      setPopupTargetInfo({ taskId, columnKey });
      setIsPopupOpen(true);
    }
  };

  const closeGenericPopup = () => {
    setIsPopupOpen(false);
    setPopupTargetInfo(null);
    document.title = baseTitleRef.current;
    navigate(`/team/${teamId}`, { replace: true });
  };


  const handleSelectChange = async (taskId, columnKey, newValue) => {
    if (['csManager', 'qaManager', 'developer'].includes(columnKey) && newValue === '__INVITE_USER__') {
      setInviteMeta({ headerKey: columnKey, targetTaskId: taskId, applyToEditingCell: editingCell?.taskId === taskId && editingCell?.columnKey === columnKey });
      setIsInviteOpen(true);
      return;
    }

    if (['category', 'type', 'priority', 'status'].includes(columnKey) && newValue === '__ADD_NEW__') {
      setAddOptionValue('');
      setAddOptionMeta({ headerKey: columnKey, targetTaskId: taskId, applyToEditingCell: editingCell?.taskId === taskId && editingCell?.columnKey === columnKey });
      setIsAddOptionOpen(true);
      return;
    }

    await saveAndClose(taskId, columnKey, newValue || '');
  };

  const handleBlurSave = (taskId, columnKey, value) => {
    if (value !== editingOriginalValue) {
      saveAndClose(taskId, columnKey, value || '');
    } else {
      cancelEditing();
    }
  };

  const handleInputKeyDown = (e) => {
    if (!editingCell) return;
    const { taskId, columnKey } = editingCell;
    const isTextarea = e.target && e.target.tagName === 'TEXTAREA';

    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelEditing();
    } else if (e.key === 'Enter') {
      if (isTextarea) {
        if (e.shiftKey) return;
        e.preventDefault();
        saveAndClose(taskId, columnKey, editingValue || '');
      } else {
        e.preventDefault();
        saveAndClose(taskId, columnKey, editingValue || '');
      }
    }
  };

  const toggleAllColumns = () => setIsAllExpanded(prev => !prev);

  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ company: '', developer: '', category: '' });
  }, []);

  const handleTaskCreated = () => {
    setIsCreateTaskModalOpen(false);
    if (onTaskChange) {
      onTaskChange();
    }
  };

  // --- Add New Option Logic ---
  const saveNewOptionToTeam = useCallback(async (headerKey, newLabel) => {
    if (!teamId || !headerKey || !newLabel || !newLabel.trim()) {
      throw new Error('Invalid parameters for saving new option.');
    }
    const teamDocRef = doc(db, 'teams', teamId);
    const normalized = newLabel.trim();

    let fieldName = '';
    if (headerKey === 'category') fieldName = 'categories';
    else if (headerKey === 'type') fieldName = 'types';
    else if (headerKey === 'priority') fieldName = 'priorities';
    else if (headerKey === 'status') fieldName = 'statusOptions';
    else {
      console.error(`saveNewOptionToTeam called with unhandled headerKey: ${headerKey}`);
      throw new Error(`Cannot save option for unknown field: ${headerKey}`);
    }

    try {
      await updateDoc(teamDocRef, { [fieldName]: arrayUnion(normalized) });
    } catch (err) {
      if (err.code === 'not-found' || err.message?.includes('No document to update')) {
        try {
          await setDoc(teamDocRef, { [fieldName]: [normalized] }, { merge: true });
        } catch (setErr) {
          throw setErr;
        }
      } else {
        throw err;
      }
    }
  }, [teamId]);

  const handleAddOptionSave = async () => {
    if (!addOptionMeta) return;
    const { headerKey, targetTaskId, applyToEditingCell } = addOptionMeta;
    const value = (addOptionValue || '').trim();
    if (!value) {
      setError('Please enter a value for the new option.');
      return;
    }

    try {
      setIsAddOptionOpen(false);
      setError(null);

      if (headerKey === 'status') {
        const teamDocRef = doc(db, 'teams', teamId);
        try {
          const snap = await getDoc(teamDocRef);
          let currentStatuses = (snap.exists() && snap.data()?.statusOptions?.length > 0)
            ? [...snap.data().statusOptions]
            : [...DEFAULT_STATUS_OPTIONS];

          if (!currentStatuses.includes(value)) {
            const completeStatus = currentStatuses.pop();
            currentStatuses.push(value);
            if (completeStatus !== undefined) {
              currentStatuses.push(completeStatus);
            }
            await setDoc(teamDocRef, { statusOptions: currentStatuses }, { merge: true });
          }
        } catch (err) {
          console.error("Failed to update status options array:", err);
          throw new Error(`Failed to save new status option: ${err.message}`);
        }
      } else {
        await saveNewOptionToTeam(headerKey, value);
      }

      if (applyToEditingCell && editingCell) {
        setEditingValue(value);
        await saveAndClose(editingCell.taskId, editingCell.columnKey, value);
      } else if (targetTaskId) {
        await saveAndClose(targetTaskId, headerKey, value);
      }

    } catch (err) {
      console.error('Failed to add option:', err);
      setError(`Failed to add ${headerKey} option. See console.`);
      setIsAddOptionOpen(true);
    } finally {
      if (!error) {
        setAddOptionMeta(null);
        setAddOptionValue('');
      }
    }
  };


  const handleAddOptionCancel = () => {
    setIsAddOptionOpen(false);
    setAddOptionMeta(null);
    setAddOptionValue('');
    setError(null);
  };

  // --- Invite Member Logic ---
  const handleInviteCompleted = async (invitedUid, invitedLabel) => {
    setIsInviteOpen(false);
    try {
      const teamDocRef = doc(db, 'teams', teamId);
      const snap = await getDoc(teamDocRef);
      if (snap.exists()) {
        const data = snap.data();
        const members = data.members || [];
        const isObjectArray = members.length > 0 && typeof members[0] === 'object';

        if (isObjectArray) {
          if (!members.some(m => m.uid === invitedUid)) {
            await updateDoc(teamDocRef, { members: arrayUnion({ uid: invitedUid, label: invitedLabel }) });
          }
        } else {
          if (!members.includes(invitedUid)) {
            await updateDoc(teamDocRef, { members: arrayUnion(invitedUid) });
          }
        }
      } else {
        await setDoc(teamDocRef, { members: [invitedUid] });
      }

    } catch (err) {
      console.error('Failed to add invited UID to team members array', err);
      setError('Could not update team members list.');
    }

    if (inviteMeta?.applyToEditingCell && editingCell) {
      setEditingValue(invitedUid);
      await saveAndClose(editingCell.taskId, editingCell.columnKey, invitedUid);
    } else if (inviteMeta?.targetTaskId && inviteMeta?.headerKey) {
      await saveAndClose(inviteMeta.targetTaskId, inviteMeta.headerKey, invitedUid);
    }

    setInviteMeta(null);
  };

  const handleInviteCanceled = () => {
    setIsInviteOpen(false);
    setInviteMeta(null);
  };

  // --- Options Editor Modal Helpers ---
  const persistTeamArrayField = async (fieldName, arr) => {
    if (!teamId) throw new Error('Missing teamId');
    const teamRef = doc(db, 'teams', teamId);
    try {
      await setDoc(teamRef, { [fieldName]: arr }, { merge: true });
    } catch (err) {
      console.error(`Failed to persist ${fieldName}:`, err);
      throw err;
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

      if (members.length > 0 && typeof members[0] === 'object' && members[0].uid) {
        newMembers = members.map(m => (m.uid === uid ? { ...m, label: newLabel } : m));
      } else {
        newMembers = members.map(mUid => (mUid === uid ? { uid, label: newLabel } : { uid: mUid, label: mUid }));
        if (!newMembers.some(m => m.uid === uid)) {
          newMembers.push({ uid, label: newLabel });
        }
      }
      await updateDoc(teamRef, { members: newMembers });
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
      if (!snap.exists()) return;

      const data = snap.data();
      const members = data.members || [];
      let updateData = {};

      if (members.length > 0 && typeof members[0] === 'object') {
        updateData.members = members.filter(m => m.uid !== uid);
      } else {
        updateData.members = arrayRemove(uid);
      }

      updateData[`roles.${uid}`] = deleteField();
      updateData[`permissions.${uid}`] = deleteField();

      await updateDoc(teamRef, updateData);
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

      if (members.length > 0 && typeof members[0] === 'object') {
        if (!members.some(m => m.uid === uid)) {
          newMembers = [...members, { uid, label }];
        } else {
          newMembers = members;
        }
      } else {
        newMembers = members.map(mUid => ({ uid: mUid, label: mUid }));
        if (!newMembers.some(m => m.uid === uid)) {
          newMembers.push({ uid, label });
        }
      }

      if (newMembers !== members) {
        await setDoc(teamRef, { members: newMembers }, { merge: true });
      }
    } catch (err) {
      console.error("Failed to add member object:", err);
      throw err;
    }
  };

  const categoryKeyMap = {
    'Tech Issue': 'tickets.techIssue',
    'Feature Request': 'tickets.featureRequest',
    'Inquiry': 'tickets.inquiry'
  };

  const translateDynamic = (val, map) => {
    return t(map[val] || val);
  };

  // --- Cell Renderer ---
  const renderCellContent = (task, header) => {
    const isEditingThisCell = editingCell?.taskId === task.id && editingCell?.columnKey === header.key;
    const rawValue = task[header.key];
    const displayValue = rawValue !== undefined && rawValue !== null ? String(rawValue) : '';

    if (header.key === 'actions') {
      return (
        <div className="flex items-center justify-center gap-2 px-2 py-2">
          <button
            onClick={(e) => { e.stopPropagation(); deleteRow(task.id); }}
            title={t("common.deleteTask")}
            className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-500"
            aria-label={`${t("common.deleteTask")} ${task.id}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      );
    }

    if (isEditingThisCell) {
      if (['priority', 'category', 'type', 'status', 'csManager', 'qaManager', 'developer'].includes(header.key)) {
        let options = [];
        let isMemberSelect = false;
        switch (header.key) {
          case 'priority': options = priorityOptions; break;
          case 'category': options = categoriesList; break;
          case 'type': options = typesList; break;
          case 'status': options = statusOptions; break;
          default:
            options = membersList;
            isMemberSelect = true;
        }

        return (
          <select
            ref={selectRef}
            value={editingValue}
            onChange={(e) => {
              const newValue = e.target.value;
              setEditingValue(newValue);
              handleSelectChange(task.id, header.key, newValue);
            }}
            onBlur={() => {
              setTimeout(() => {
                if (editingCell?.taskId === task.id && editingCell?.columnKey === header.key) {
                  cancelEditing();
                }
              }, 150);
            }}
            className="absolute inset-0 w-full h-full px-2 py-1 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm z-10"
            onKeyDown={handleInputKeyDown}
          >
            <option value="">{t('common.empty')}</option>
            {isMemberSelect
              ? membersList.map(m => <option key={m.uid} value={m.uid}>{t(m.label)}</option>)
              : options.map(opt => <option key={opt} value={opt}>{translateDynamic(opt, categoryKeyMap)}</option>)
            }
            {isMemberSelect
              ? <option value="__INVITE_USER__">{t('admin.inviteUser')}</option>
              : <option value="__ADD_NEW__">{t('common.addNew')}</option>
            }
            {isMemberSelect && editingOriginalValue && !membersList.some(m => m.uid === editingOriginalValue) && (
              <option value={editingOriginalValue} disabled>{editingOriginalValue} (removed)</option>
            )}
            {!isMemberSelect && editingOriginalValue && !options.includes(editingOriginalValue) && (
              <option value={editingOriginalValue} disabled>{editingOriginalValue} (removed)</option>
            )}
          </select>
        );
      }

      if (header.key === 'startDate' || header.key === 'endDate') {
        return (
          <input
            ref={inputRef}
            type="date"
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={(e) => handleBlurSave(task.id, header.key, e.target.value)}
            onKeyDown={handleInputKeyDown}
            className="absolute inset-0 w-full h-full px-3 py-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm z-10"
          />
        );
      }

      if (TEXTAREA_COLUMNS.includes(header.key)) {
        return (
          <textarea
            ref={inputRef}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={(e) => handleBlurSave(task.id, header.key, e.target.value)}
            onKeyDown={handleInputKeyDown}
            rows={Math.max(3, (String(editingValue || '').split('\n').length))}
            className="absolute inset-0 w-full h-full min-h-[80px] p-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm resize-y z-10 shadow-lg"
          />
        );
      }
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

    if (['csManager', 'qaManager', 'developer'].includes(header.key)) {
      const foundMember = membersList.find(m => m.uid === displayValue);
      const label = foundMember ? foundMember.label : displayValue;
      const textToShow = t(label) || '-';
      return (
        <div
          className={`px-4 py-2.5 text-sm text-gray-700 ${isAllExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}
          title={textToShow}
        >
          {textToShow}
        </div>
      );
    }

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

    const textToShow = t(displayValue) || '-';
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
            <button
              onClick={toggleAllColumns}
              title={isAllExpanded ? t('common.collapseAll') : t('common.expandAll')}
              className="text-sm py-1.5 px-3 rounded border bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {isAllExpanded ? t('common.collapseAll') : t('common.expandAll')}
            </button>
            <button
              onClick={() => setIsOptionsModalOpen(true)}
              title={t('admin.editOptions', 'Edit dropdown options')}
              className="text-sm py-1.5 px-3 rounded border bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {t('admin.editOptions', 'Edit Options')}
            </button>
            <button
              onClick={() => setIsCreateTaskModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 px-4 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              {t('common.newTicket')}
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-3 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm font-medium text-gray-700">{t('tickets.filters')}</span>

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
                <option key={m.uid} value={m.uid}>{m.label}</option>
              ))}
            </select>
          </div>

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
                        whiteSpace: isAllExpanded ? 'normal' : 'nowrap',
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
                                : '▲▼'
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
                      t('tickets.noFilterMatch')
                    ) : (
                      activeTab === 'active'
                        ? t('tickets.noActiveTasks')
                        : t('tickets.noCompletedTasks') 
                    )}
                  </td>
                </tr>
              )}

              {/* Task Rows (Using currentTasks from pagination) */}
              {!isLoading && currentTasks.map(task => (
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
                          !isEditingThisCell && isPopupTrigger ? 'cursor-pointer' : '',
                          !isEditingThisCell && isEditable && !isPopupTrigger ? 'cursor-text' : '',
                          (!isAllExpanded && header.widthClass) ? header.widthClass : '',
                          isEditingThisCell ? 'p-0' : '',
                          isAllExpanded ? 'align-top' : 'align-middle'
                        ].filter(Boolean).join(' ')}
                        style={{
                          maxWidth: (!isAllExpanded ? header.maxWidth : undefined) || undefined,
                          height: (isEditingThisCell && TEXTAREA_COLUMNS.includes(header.key)) ? 'auto' : undefined,
                        }}
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

          {/* --- NEW: Pagination Footer --- */}
          {!isLoading && filteredTasksToDisplay.length > 0 && (
            <div className="flex items-center justify-between mt-4 border-t pt-4">
              {/* Items per page selector (No. Filter) */}
              <div className="flex items-center gap-2">
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1); // Reset to page 1 on limit change
                  }}
                  className="border rounded p-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                  style={{ width: '60px' }} // Similar style to the image
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-sm text-gray-500">items per page</span>
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{totalPages}</span>
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm border rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          {/* --- END Pagination Footer --- */}

        </div>
      </div>

      {/* --- Modals --- */}
      {isPopupOpen && popupTargetInfo && (
        <NotePopup
          teamId={teamId}
          taskId={popupTargetInfo.taskId}
          columnKey={popupTargetInfo.columnKey}
          onClose={closeGenericPopup}
          isMasterAdminView={isMasterAdminView}
          membersList={membersList}
        />
      )}

      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={handleTaskCreated}
        teamId={teamId}
        onTaskCreated={handleTaskCreated}
        categoriesList={categoriesList}
        typesList={typesList}
        priorityOptions={priorityOptions}
        statusOptions={statusOptions}
        membersList={membersList}
      />

      {isAddOptionOpen && addOptionMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black opacity-40 z-40" onClick={handleAddOptionCancel}></div>
          <div className="bg-white rounded-lg shadow-xl z-50 max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-semibold mb-2">{t('common.addNew')}</h4>
            <p className="text-sm text-gray-600 mb-4">{t('admin.addNewOption', `Add a new ${addOptionMeta.headerKey}`)}:</p>
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

      {isOptionsModalOpen && (
        <OptionsEditorModal
          isOpen={isOptionsModalOpen}
          onClose={() => setIsOptionsModalOpen(false)}
          teamId={teamId}
          t={t}
          categoriesList={categoriesList}
          typesList={typesList}
          membersList={membersList}
          priorityOptions={priorityOptions}
          statusOptions={statusOptions}
          persistTeamArrayField={persistTeamArrayField}
          saveMemberLabel={saveMemberLabel}
          removeMember={removeMember}
          addMemberObject={addMemberObject}
          onCategoriesChange={() => { }}
          onTypesChange={() => { }}
          onMembersChange={() => { }}
          onPrioritiesChange={() => { }}
          onStatusOptionsChange={() => { }}
        />
      )}

      {isInviteOpen && inviteMeta && (
        <InviteMemberModal
          isOpen={isInviteOpen}
          onClose={handleInviteCanceled}
          teamId={teamId}
          t={t}
          onInvited={handleInviteCompleted}
        />
      )}
    </>
  );
};

export default TeamProjectTable;

// --- OptionsEditorModal Component ---
function OptionsEditorModal({
  isOpen,
  onClose,
  teamId,
  t,
  categoriesList,
  typesList,
  membersList,
  priorityOptions,
  statusOptions,
  persistTeamArrayField,
  saveMemberLabel,
  removeMember,
  addMemberObject,
}) {
  const [tab, setTab] = useState('categories');
  const [items, setItems] = useState([]);
  const [newValue, setNewValue] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValueLocal, setEditingValueLocal] = useState('');
  const [modalError, setModalError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTab('categories');
    setEditingIndex(null);
    setEditingValueLocal('');
    setNewValue('');
    setModalError('');
    setIsSaving(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let currentItems = [];
    switch (tab) {
      case 'categories': currentItems = categoriesList; break;
      case 'types': currentItems = typesList; break;
      case 'priorities': currentItems = priorityOptions; break;
      case 'statuses': currentItems = statusOptions; break;
      case 'members': currentItems = membersList.map(m => ({ uid: m.uid, label: m.label })); break;
      default: currentItems = [];
    }
    setItems(currentItems);
    setEditingIndex(null);
    setEditingValueLocal('');
    setNewValue('');
    setModalError('');
  }, [tab, categoriesList, typesList, priorityOptions, statusOptions, membersList, isOpen]);

  if (!isOpen) return null;

  const handlePersistArray = async (fieldName, newArr) => {
    setModalError('');
    setIsSaving(true);
    try {
      await persistTeamArrayField(fieldName, newArr);
    } catch (err) {
      console.error(`Failed to persist ${fieldName}:`, err);
      setModalError(t('admin.saveError', `Failed to save changes for ${fieldName}. See console.`));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMemberLabel = async (uid, newLabel) => {
    setModalError('');
    setIsSaving(true);
    try {
      await saveMemberLabel(uid, newLabel);
      setEditingIndex(null);
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
      setNewValue('');
    } catch (err) {
      setModalError(t('admin.addMemberError', 'Failed to add member. See console.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = async () => {
    const v = (newValue || '').trim();
    if (!v) return;
    setModalError('');

    if (tab === 'members') {
      let uid = v;
      let label = v;
      if (v.includes('|')) {
        const parts = v.split('|');
        uid = parts[0].trim();
        label = parts.slice(1).join('|').trim() || uid;
      }
      if (!uid) {
        setModalError(t('admin.uidRequiredError', 'Please provide a UID (or uid|label).'));
        return;
      }
      if (items.some(item => item.uid === uid)) {
        setModalError(t('admin.memberExistsError', "A member with this UID already exists."));
        return;
      }
      await handleAddMemberObject(uid, label);
      return;
    }

    if (items.includes(v)) {
      setModalError(t('admin.itemExistsError', "This item already exists."));
      return;
    }

    let next = [...items, v];
    let fieldName = '';
    if (tab === 'statuses') {
      const completeStatus = next.pop();
      next.push(v);
      if (completeStatus !== undefined) next.push(completeStatus);
      fieldName = 'statusOptions';
    } else {
      fieldName = tab;
      if (tab === 'priorities') fieldName = 'priorities';
      else if (tab === 'categories') fieldName = 'categories';
      else if (tab === 'types') fieldName = 'types';
      else {
        setModalError(t('admin.invalidTabError', `Cannot determine field name for tab: ${tab}`));
        return;
      }
    }

    setItems(next);
    setNewValue('');
    await handlePersistArray(fieldName, next);
  };

  const startEdit = (idx) => {
    setModalError('');
    setEditingIndex(idx);
    const itemToEdit = items[idx];
    setEditingValueLocal(typeof itemToEdit === 'object' && itemToEdit !== null ? itemToEdit.label : itemToEdit);
  };

  const saveEdit = async () => {
    const v = (editingValueLocal || '').trim();
    if (!v || editingIndex === null) return;
    setModalError('');

    const itemToEdit = items[editingIndex];
    if (typeof itemToEdit === 'object' && itemToEdit !== null && 'uid' in itemToEdit) {
      const uid = itemToEdit.uid;
      if (!v) {
        setModalError(t('admin.memberLabelEmptyError', "Member label cannot be empty."));
        return;
      }
      await handleSaveMemberLabel(uid, v);
      return;
    }

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

    setItems(next);
    setEditingIndex(null);
    setEditingValueLocal('');
    await handlePersistArray(fieldName, next);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingValueLocal('');
    setModalError('');
  };

  const handleRemove = async (idx) => {
    if (isSaving) return;
    setModalError('');
    const itemToRemove = items[idx];

    if (typeof itemToRemove === 'object' && itemToRemove !== null && 'uid' in itemToRemove) {
      const uid = itemToRemove.uid;
      await handleRemoveMember(uid);
      return;
    }

    if (tab === 'statuses' && idx === items.length - 1) {
      if (!window.confirm(t('admin.confirmDeleteFinalStatus', 'Are you sure you want to remove the final status? This is usually the "Complete" status.'))) {
        return;
      }
    } else if (!window.confirm(t('common.confirmDelete'))) {
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

    setItems(next);
    await handlePersistArray(fieldName, next);
  };

  const handleCloseModal = () => {
    if (isSaving) return;
    onClose();
  };

  const renderListItem = (it, idx) => {
    const isEditingThisItem = editingIndex === idx;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl z-50 max-w-3xl w-full p-6 relative flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 pb-2 border-b">
          <h3 className="text-lg font-semibold text-gray-800">{t('admin.editDropdownOptions', 'Edit Dropdown Options')}</h3>
          <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 focus:outline-none" disabled={isSaving}>&times;</button>
        </div>
        <div className="flex gap-4 flex-1 overflow-hidden">
          <div className="w-44 bg-gray-50 p-3 rounded flex-shrink-0 overflow-y-auto">
            <nav className="flex flex-col gap-1">
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'categories' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('categories')}>{t('admin.categories')}</button>
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'types' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('types')}>{t('admin.types')}</button>
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'priorities' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('priorities')}>{t('admin.priorities')}</button>
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'statuses' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('statuses')}>{t('admin.statuses')}</button>
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'members' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('members')}>{t('admin.tabMembers')}</button>
            </nav>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
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
            {modalError && <p className="text-red-600 text-sm mb-2 px-1">{modalError}</p>}
            <ul className="space-y-1.5 overflow-y-auto flex-1 pr-1">
              {items.length === 0 && <li key="empty-state" className="text-sm text-gray-500 px-1 py-4 text-center">{t('admin.noItems', 'No items defined for')} {tab}.</li>}
              {items.map((it, idx) => renderListItem(it, idx))}
              <li key="spacer" style={{ height: '10px' }}></li>
            </ul>
            <div className="mt-4 pt-3 border-t flex justify-end gap-2">
              <button onClick={handleCloseModal} className="px-4 py-1.5 rounded border text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50" disabled={isSaving}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- InviteMemberModal Component ---
function InviteMemberModal({ isOpen, onClose, teamId, t, onInvited }) {
  const [email, setEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    if (!email.trim() || !email.includes('@')) {
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
      const invitedLabel = invitedData.displayName || invitedData.name || invitedData.email || invitedUserId;

      if (invitedUserId === currentUser.uid) {
        setError(t('admin.inviteSelfError', "You cannot invite yourself to the team."));
        setIsInviting(false);
        return;
      }

      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await getDoc(teamRef);

      if (!teamSnap.exists()) {
        setError(t('admin.teamNotFoundError', 'Team data not found. Cannot process invitation.'));
        setIsInviting(false);
        return;
      }

      const teamData = teamSnap.data();
      const teamName = teamData.teamName || `Team ${teamId.substring(0, 6)}`;
      const members = teamData.members || [];

      const isAlreadyMember = members.some(member =>
        (typeof member === 'object' && member.uid === invitedUserId) ||
        (typeof member === 'string' && member === invitedUserId)
      );

      if (isAlreadyMember) {
        setError(t('admin.alreadyMemberError', 'This user is already a member of the team.'));
        setIsInviting(false);
        return;
      }

      const senderName = currentUser.displayName || currentUser.email || 'A team member';
      await addDoc(collection(db, 'notifications'), {
        userId: invitedUserId,
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

      if (typeof onInvited === 'function') {
        onInvited(invitedUserId, invitedLabel);
      }

      setTimeout(() => {
        if (typeof onClose === 'function') onClose();
      }, 1500);

    } catch (err) {
      console.error('Error sending invitation:', err);
      setError(t('admin.inviteFailError', 'Failed to send invitation. Please check the console and try again.'));
      setIsInviting(false);
    }
  };

  const handleClose = () => {
    if (!isInviting && typeof onClose === 'function') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative">
        <button onClick={handleClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 focus:outline-none" disabled={isInviting}>&times;</button>
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-gray-800">{t('admin.inviteMember')}</h3>
          <p className="text-sm text-gray-500 mt-1">{t('admin.inviteSubtext', 'Enter the email address of the user you want to invite.')}</p>
        </div>
        {error && <p className="text-red-600 text-sm mb-3 p-2 bg-red-50 rounded border border-red-200">{error}</p>}
        {success && <p className="text-green-600 text-sm mb-3 p-2 bg-green-50 rounded border border-green-200">{success}</p>}
        {!success && (
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
        <div className="flex justify-end gap-2 mt-6 border-t pt-4">
          <button onClick={handleClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md text-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50" disabled={isInviting}>
            {success ? t('common.close') : t('common.cancel')}
          </button>
          {!success && (
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