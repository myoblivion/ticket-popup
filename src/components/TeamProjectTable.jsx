import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

// --- Translation UI Strings ---
const UI_STRINGS = [
  'Team Project Tasks',
  'Expand All',
  'Collapse All',
  'New Task',
  'Loading Tasks...',
  'No tasks created yet.', // This is now a fallback
  '(open)',
  '(empty)',
  'Delete this task? This action cannot be undone.',
  'Delete task',
  'Saving…',
  'Saved',
  'Add new…',
  'Cancel',
  'Save',
  'Invite user…',
  'Invite Member',
  // --- NEW ---
  'Active',
  'Completed',
  'No active tasks created yet.',
  'No completed tasks found.'
];

const TeamProjectTable = ({ teamId }) => {
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

  // --- NEW: Translation State ---
  const [currentLanguage, setCurrentLanguage] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);
  // This Map will hold our translations: 'Hello' -> '안녕하세요'
  const [translations, setTranslations] = useState(new Map());
  // This ref will cache results for each language to avoid re-fetching
  const translationCache = useRef(new Map([['en', new Map()]])); // 'en' is pre-cached

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

  // add-option modal state (for category/type)
  const [isAddOptionOpen, setIsAddOptionOpen] = useState(false);
  const [addOptionMeta, setAddOptionMeta] = useState(null);
  const [addOptionValue, setAddOptionValue] = useState('');

  // Options Editor modal
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false);

  // --- NEW: Tab State ---
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'completed'

  // headers (defined here so translation hook can access it)
  const headers = useMemo(() => [
    { key: 'priority', label: 'Priority', widthClass: 'w-[110px]', maxWidth: '110px' },
    { key: 'category', label: 'Category', widthClass: 'w-[140px]', maxWidth: '140px' },
    { key: 'type', label: 'Type', widthClass: 'w-[140px]', maxWidth: '140px' },
    { key: 'status', label: 'Status', widthClass: 'w-[120px]', maxWidth: '120px' },
    { key: 'ticketNo', label: 'Ticket #', widthClass: 'w-[110px]', maxWidth: '110px' },
    { key: 'company', label: 'Company', widthClass: 'w-[160px]', maxWidth: '160px' },
    { key: 'inquiry', label: 'Inquiry', widthClass: 'w-[120px]', maxWidth: '140px' },
    { key: 'inquiryDetails', label: 'Inquiry Details', widthClass: 'min-w-[280px]', maxWidth: '520px' },
    { key: 'notes', label: 'Notes', widthClass: 'w-[160px]', maxWidth: '260px' },
    { key: 'csManager', label: 'CS Manager', widthClass: 'w-[160px]', maxWidth: '160px' },
    { key: 'startDate', label: 'Start Date', widthClass: 'w-[120px]', maxWidth: '120px' },
    { key: 'endDate', label: 'End Date', widthClass: 'w-[120px]', maxWidth: '120px' },
    { key: 'qaManager', label: 'QA Manager', widthClass: 'w-[160px]', maxWidth: '160px' },
    { key: 'developer', label: 'Developer', widthClass: 'w-[160px]', maxWidth: '160px' },
    { key: 'actions', label: '', widthClass: 'w-[64px] text-center', maxWidth: '64px' }
  ], []);

  // --- NEW: Filter tasks based on status ---
  const { activeTasks, completedTasks } = useMemo(() => {
    const active = [];
    const completed = [];
    // Use the exact string from statusOptions that means complete.
    // We assume the *last* item in the status list is the "complete" one.
    const completeStatusString = statusOptions.length > 0
      ? statusOptions[statusOptions.length - 1]
      : 'Complete'; // Fallback

    for (const task of tasks) {
      if (task.status === completeStatusString) {
        completed.push(task);
      } else {
        active.push(task);
      }
    }
    return { activeTasks: active, completedTasks: completed };
  }, [tasks, statusOptions]); // Depends on tasks and the dynamic statusOptions

  const tasksToDisplay = useMemo(() => {
    return activeTab === 'active' ? activeTasks : completedTasks;
  }, [activeTab, activeTasks, completedTasks]);

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

        // categories and types are simple
        if (data.categories && Array.isArray(data.categories)) setCategoriesList(data.categories);
        if (data.types && Array.isArray(data.types)) setTypesList(data.types);
        if (data.priorities && Array.isArray(data.priorities)) setPriorityOptions(data.priorities);
        // Ensure statusOptions is set, otherwise use default
        if (data.statusOptions && Array.isArray(data.statusOptions) && data.statusOptions.length > 0) {
            setStatusOptions(data.statusOptions);
        } else {
            setStatusOptions(DEFAULT_STATUS_OPTIONS);
        }

        // members can be stored as array of uids OR array of objects { uid, label }
        if (data.members && Array.isArray(data.members)) {
          // check if first member is an object
          if (data.members.length > 0 && typeof data.members[0] === 'object' && data.members[0].uid) {
            // already objects
            setMembersList(data.members.map(m => ({ uid: m.uid, label: m.label || m.name || m.email || m.uid })));
          } else {
            // assume array of UIDs: fetch user docs in parallel to get labels
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
            setMembersList(resolved);
          }
        } else {
          // no members field -> use defaults
          setMembersList(DEFAULT_PLACEHOLDERS.members);
        }
      }, (err) => {
        console.error('Error listening to team meta:', err);
      });
    } catch (e) {
      // fallback to getDoc once
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
                setMembersList(data.members.map(m => ({ uid: m.uid, label: m.label || m.name || m.email || m.uid })));
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
                setMembersList(resolved);
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

  // --- Translation Effect (same as before) ---
  useEffect(() => {
    if (currentLanguage === 'en') {
      setTranslations(new Map());
      setIsTranslating(false);
      return;
    }
    if (translationCache.current.has(currentLanguage)) {
      setTranslations(translationCache.current.get(currentLanguage));
      return;
    }

    const collectStrings = () => {
      const strings = new Set();
      const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/;
      const numberRegex = /^\d+$/;
      const dashRegex = /^-+$/;
      UI_STRINGS.forEach(s => { if (s) strings.add(s); });
      headers.forEach(h => { if (h.label) strings.add(h.label); });
      tasks.forEach(task => {
        headers.forEach(h => {
          const val = task[h.key];
          if (val && typeof val === 'string' && val.trim().length > 0) {
            if (
              emailRegex.test(val) ||
              numberRegex.test(val) ||
              dashRegex.test(val) ||
              h.key === 'ticketNo'
            ) {
              // skip
            } else {
              strings.add(val);
            }
          }
        });
      });
      return Array.from(strings);
    };

    const runTranslation = async () => {
      setIsTranslating(true);
      setError(null);
      const stringsToTranslate = collectStrings();
      if (stringsToTranslate.length === 0) {
        setIsTranslating(false);
        return;
      }

      try {
        // We'll batch requests so the encoded query param won't exceed API limits.
        const batches = [];
        const delimiter = ' ||| ';
        const delimEncLen = encodeURIComponent(delimiter).length;
        const MAX_ENCODED_CHARS = 480;

        let currentBatch = [];
        let currentLen = 0;

        for (const s of stringsToTranslate) {
          const encLen = encodeURIComponent(s).length;
          if (currentBatch.length === 0 && encLen > MAX_ENCODED_CHARS) {
            batches.push([s]);
            currentBatch = [];
            currentLen = 0;
            continue;
          }

          const predictedLen = currentBatch.length === 0 ? encLen : (currentLen + delimEncLen + encLen);
          if (predictedLen > MAX_ENCODED_CHARS) {
            batches.push(currentBatch);
            currentBatch = [s];
            currentLen = encLen;
          } else {
            if (currentBatch.length === 0) {
              currentBatch.push(s);
              currentLen = encLen;
            } else {
              currentBatch.push(s);
              currentLen = currentLen + delimEncLen + encLen;
            }
          }
        }
        if (currentBatch.length > 0) batches.push(currentBatch);

        const translatedFullList = [];

        for (const batch of batches) {
          const joined = batch.join(delimiter);
          const langPair = `en|${currentLanguage}`;
          const apiUrl = new URL('https://api.mymemory.translated.net/get');
          apiUrl.searchParams.append('q', joined);
          apiUrl.searchParams.append('langpair', langPair);

          const res = await fetch(apiUrl.toString(), {
            method: 'GET',
            mode: 'cors',
          });

          if (!res.ok) {
            throw new Error(`Translation API returned ${res.status}: ${res.statusText}`);
          }
          const data = await res.json();
          if (data.responseStatus !== 200) {
            const details = data.responseDetails || data.responseStatus;
            throw new Error(`Translation API error: ${details}`);
          }

          const translatedJoinedStrings = data.responseData.translatedText;
          const translatedStringsArray = translatedJoinedStrings.split(/\s*\|\|\|\s*/);
          for (let i = 0; i < batch.length; i++) {
            const translated = translatedStringsArray[i] || batch[i];
            translatedFullList.push(translated.trim());
          }
        }

        const newMap = new Map();
        let idx = 0;
        for (const original of stringsToTranslate) {
          const translated = translatedFullList[idx] || original;
          newMap.set(original, translated.trim());
          idx++;
        }

        translationCache.current.set(currentLanguage, newMap);
        setTranslations(newMap);
      } catch (err) {
        console.error("Translation error:", err);
        setError(`Translation failed: ${err.message}. Check the console.`);
      } finally {
        setIsTranslating(false);
      }
    };

    runTranslation();
  }, [tasks, currentLanguage, headers]);

  // --- Translation Helper Function ---
  const t = useCallback((text) => {
    if (currentLanguage === 'en' || !text) {
      return text;
    }
    return translations.get(text) || text;
  }, [currentLanguage, translations]);

  // --- Firestore realtime listener for tasks (unchanged) ---
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

  // helpers
  const getCellKey = (taskId, headerKey) => `${taskId}-${headerKey}`;

  // saving state helper
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

  // cleanup timer/debounce refs
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

  // save helpers
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

  // deleteRow
  const deleteRow = useCallback(async (taskId) => {
    if (!teamId || !taskId) {
      setError('Missing teamId/taskId for deletion.');
      return;
    }
    const key = getCellKey(taskId, 'actions');
    const confirmed = window.confirm(t('Delete this task? This action cannot be undone.'));
    if (!confirmed) return;
    try {
      setSavingState(key, 'saving');
      const taskDocRef = doc(db, `teams/${teamId}/tasks`, taskId);
      await deleteDoc(taskDocRef);
      // No need for setTasks, onSnapshot will handle it.
      setSavingState(key, 'saved');
    } catch (err)
 {
      console.error('Error deleting task:', err);
      setError('Failed to delete task.');
      setTimeout(() => setSavingState(key, null), 1200);
    }
  }, [teamId, t]);

  // start editing
  const startEditingCell = (taskId, columnKey, currentValue) => {
    setEditingCell({ taskId, columnKey });
    setEditingValue(currentValue ?? '');
    setEditingOriginalValue(currentValue ?? '');
  };

  // cancel editing
  const cancelEditing = () => {
    setEditingCell(null);
    setEditingValue('');
    setEditingOriginalValue('');
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  };

  // debounce auto-save for text-like columns
  useEffect(() => {
    if (!editingCell) return;
    const { taskId, columnKey } = editingCell;
    const isTextarea = TEXTAREA_COLUMNS.includes(columnKey);
    if (!isTextarea) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveDraft(taskId, columnKey, editingValue || '');
      debounceRef.current = null;
    }, 800);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [editingValue, editingCell, saveDraft]);

  // Auto-focus logic
  useEffect(() => {
    if (editingCell) {
      const isSelect = !TEXTAREA_COLUMNS.includes(editingCell.columnKey) && !['startDate', 'endDate'].includes(editingCell.columnKey);
      const ref = isSelect ? selectRef : inputRef;

      if (ref.current) {
        try {
          ref.current.focus();
          const el = ref.current;
          if (el.setSelectionRange && typeof el.value === 'string') {
            const pos = el.value.length;
            el.setSelectionRange(pos, pos);
          } else if (el.select) {
            el.select();
          }
        } catch (e) { /* ignore */ }
      }
    }
  }, [editingCell]);

  // handlers
  const handleCellDoubleClick = (e, taskId, columnKey) => {
    e.stopPropagation();
    if (!INLINE_EDITABLE_COLUMNS.includes(columnKey)) return;
    const task = tasks.find(t => t.id === taskId); // find from all tasks
    const currentValue = task ? (task[columnKey] ?? '') : '';
    startEditingCell(taskId, columnKey, String(currentValue));
  };

  // Click handler for generic popup columns (inquiry)
  const handleGenericPopupClick = (e, taskId, columnKey) => {
    e.stopPropagation();
    if (editingCell?.taskId === taskId && editingCell?.columnKey === columnKey) return;
    if (POPUP_TRIGGER_COLUMNS.includes(columnKey)) {
      setPopupTargetInfo({ taskId, columnKey });
      setIsPopupOpen(true);
    }
  };

  // Close popup
  const closeGenericPopup = () => {
    setIsPopupOpen(false);
    setPopupTargetInfo(null);
  };

  // When user chooses a select option
  const handleSelectChange = async (taskId, columnKey, newValue) => {
    // For member columns we use invite sentinel
    if (['csManager', 'qaManager', 'developer'].includes(columnKey) && newValue === '__INVITE_USER__') {
      setInviteMeta({ headerKey: columnKey, targetTaskId: taskId, applyToEditingCell: editingCell?.taskId === taskId && editingCell?.columnKey === columnKey });
      setIsInviteOpen(true);
      return;
    }

    // For category/type we may want the add-option modal sentinel (legacy)
    if ((columnKey === 'category' || columnKey === 'type') && newValue === '__ADD_NEW__') {
      setAddOptionValue('');
      setAddOptionMeta({ headerKey: columnKey, targetTaskId: taskId, applyToEditingCell: editingCell?.taskId === taskId && editingCell?.columnKey === columnKey });
      setIsAddOptionOpen(true);
      return;
    }

    await saveAndClose(taskId, columnKey, newValue || '');
  };

  const handleBlurSave = (taskId, columnKey, value) => {
    saveAndClose(taskId, columnKey, value || '');
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
        if (e.shiftKey) return; // insert newline
        e.preventDefault();
        saveAndClose(taskId, columnKey, editingValue || '');
      } else {
        e.preventDefault();
        saveAndClose(taskId, columnKey, editingValue || '');
      }
    }
  };

  // expansion helpers
  const toggleAllColumns = () => setIsAllExpanded(prev => !prev);

  // persist new option (category/type) to team doc
  const saveNewOptionToTeam = useCallback(async (headerKey, newLabel) => {
    if (!teamId || !headerKey || !newLabel || !newLabel.trim()) {
      throw new Error('Invalid add-option params');
    }
    const teamDocRef = doc(db, 'teams', teamId);
    const normalized = newLabel.trim();
    try {
      let fieldName = null;
      if (headerKey === 'category') fieldName = 'categories';
      else if (headerKey === 'type') fieldName = 'types';
      else fieldName = headerKey;
      await updateDoc(teamDocRef, { [fieldName]: arrayUnion(normalized) });
    } catch (err) {
      if (err.code === 'not-found' || err.message?.includes('No document to update')) {
        try {
          const fieldName = headerKey === 'category' ? 'categories' : (headerKey === 'type' ? 'types' : 'members');
          await setDoc(teamDocRef, { [fieldName]: [newLabel.trim()] }, { merge: true });
        } catch (setErr) {
          throw setErr;
        }
      } else {
        throw err;
      }
    }
  }, [teamId]);

  // Add-option save (category/type)
  const handleAddOptionSave = async () => {
    if (!addOptionMeta) return;
    const headerKey = addOptionMeta.headerKey;
    const value = (addOptionValue || '').trim();
    if (!value) {
      setError('Enter a value.');
      return;
    }

    try {
      setIsAddOptionOpen(false);
      setError(null);

      await saveNewOptionToTeam(headerKey, value);

      // No need to setCategoriesList, onSnapshot will handle it

      if (addOptionMeta.applyToEditingCell && editingCell) {
        setEditingValue(value);
        await saveAndClose(editingCell.taskId, editingCell.columnKey, value);
      } else if (addOptionMeta.targetTaskId && addOptionMeta.headerKey) {
        await saveAndClose(addOptionMeta.targetTaskId, addOptionMeta.headerKey, value);
      }
    } catch (err) {
      console.error('Failed to add option:', err);
      setError('Failed to add option. See console.');
    } finally {
      setAddOptionMeta(null);
      setAddOptionValue('');
    }
  };

  const handleAddOptionCancel = () => {
    setIsAddOptionOpen(false);
    setAddOptionMeta(null);
    setAddOptionValue('');
  };

  // When InviteMemberModal calls back with invited user info
  const handleInviteCompleted = async (invitedUid, invitedLabel) => {
    setIsInviteOpen(false);

    // No need to setMembersList locally, onSnapshot will handle it

    // persist UID in team doc members array
    try {
      const teamDocRef = doc(db, 'teams', teamId);
      await updateDoc(teamDocRef, { members: arrayUnion(invitedUid) });
    } catch (err) {
      console.error('Failed to add invited uid to team members', err);
      // try setDoc fallback:
      try {
        const teamDocRef = doc(db, 'teams', teamId);
        await setDoc(teamDocRef, { members: [invitedUid] }, { merge: true });
      } catch (setErr) {
        console.error('Fallback failed', setErr);
      }
    }

    // If user was editing a cell, apply invited user immediately
    if (inviteMeta?.applyToEditingCell && editingCell) {
      setEditingValue(invitedUid);
      await saveAndClose(editingCell.taskId, editingCell.columnKey, invitedUid);
    } else if (inviteMeta?.targetTaskId && inviteMeta?.headerKey) {
      await saveAndClose(inviteMeta.targetTaskId, inviteMeta.headerKey, invitedUid);
    } else {
      // nothing else
    }

    setInviteMeta(null);
  };

  const handleInviteCanceled = () => {
    setIsInviteOpen(false);
    setInviteMeta(null);
  };

  // --- Options Editor: helpers to persist lists to team doc ---

  const persistTeamArrayField = async (fieldName, arr) => {
    if (!teamId) throw new Error('Missing teamId');
    const teamRef = doc(db, 'teams', teamId);
    await updateDoc(teamRef, { [fieldName]: arr });
  };

  // Member label edit: if team stores UIDs, convert to objects; else update object label
  const saveMemberLabel = async (uid, newLabel) => {
    if (!teamId) throw new Error('Missing teamId');
    const teamRef = doc(db, 'teams', teamId);
    const snap = await getDoc(teamRef);
    if (!snap.exists()) throw new Error('Team doc missing');

    const data = snap.data();
    const members = data.members || [];

    let newMembers;
    if (members.length > 0 && typeof members[0] === 'object' && members[0].uid) {
      // update label for matching uid
      newMembers = members.map(m => (m.uid === uid ? { ...m, label: newLabel } : m));
    } else {
      // convert uid array to objects
      newMembers = members.map(mUid => (mUid === uid ? { uid, label: newLabel } : { uid: mUid, label: mUid }));
    }

    await updateDoc(teamRef, { members: newMembers });
    // onSnapshot will reflect locally
  };

  // remove member completely: arrayRemove + delete roles/permissions fields
  const removeMember = async (uid) => {
    if (!teamId) throw new Error('Missing teamId');
    if (!window.confirm('Remove this member from the team? This will remove roles/permissions for them.')) return;
    const teamRef = doc(db, 'teams', teamId);

    // update: remove from array, delete roles.uid and permissions.uid fields
    const upd = {
      members: arrayRemove(uid),
      [`roles.${uid}`]: deleteField(),
      [`permissions.${uid}`]: deleteField()
    };

    await updateDoc(teamRef, upd);
    // onSnapshot will update local state
  };

  // add member object entry to team.members (will store object {uid,label})
  const addMemberObject = async (uid, label) => {
    if (!teamId) throw new Error('Missing teamId');
    const teamRef = doc(db, 'teams', teamId);

    // Prefer preserving existing array shape. We'll append object. If existing members were UIDs,
    // this will mix types; acceptable if you want object storage. Better approach would be to normalize entire array.
    // Here we do a merge: if members appear to be UIDs, convert all to objects.
    const snap = await getDoc(teamRef);
    const data = snap.exists() ? snap.data() : {};
    const members = data.members || [];

    let newMembers;
    if (members.length > 0 && typeof members[0] === 'object' && members[0].uid) {
      // already objects
      newMembers = [...members, { uid, label }];
    } else if (members.length > 0) {
      // convert existing uids to objects
      newMembers = [...members.map(mUid => ({ uid: mUid, label: mUid })), { uid, label }];
    } else {
      newMembers = [{ uid, label }];
    }

    await updateDoc(teamRef, { members: newMembers });
    // onSnapshot will update local state
  };

  // cell renderer
  const renderCellContent = (task, header, isAllExpanded) => {
    const isEditingThisCell = editingCell?.taskId === task.id && editingCell?.columnKey === header.key;
    const rawValue = task[header.key];
    const value = rawValue !== undefined && rawValue !== null ? String(rawValue) : '';

    // actions
    if (header.key === 'actions') {
      return (
        <div className="flex items-center justify-center gap-2 px-2 py-2">
          <button
            onClick={(e) => { e.stopPropagation(); deleteRow(task.id); }}
            title={t("Delete task")}
            className="p-1 rounded hover:bg-red-50 focus:outline-none"
            aria-label={`${t("Delete task")} ${task.id}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-1 10-11 0-1-10 12 0zm-4-4h-4l-1 2h6l-1-2zm-6 15v-6m4 6v-6" />
            </svg>
          </button>
        </div>
      );
    }

    // editing UI
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
          default:
            options = membersList; // membersList is array of objects {uid,label}
            isMemberSelect = true;
        }

        return (
          <select
            ref={selectRef}
            value={editingValue} // value is UID for member selects (or plain string)
            onChange={(e) => {
              const newVal = e.target.value;
              setEditingValue(newVal);
              handleSelectChange(task.id, header.key, newVal);
            }}
            onBlur={() => setTimeout(() => { if (editingCell?.taskId === task.id) cancelEditing(); }, 100)}
            className="absolute inset-0 w-full h-full px-2 py-1 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm z-10"
            onKeyDown={handleInputKeyDown}
          >
            <option value="">{t(`(empty)`)}</option>

            {isMemberSelect
              ? membersList.map(m => <option key={m.uid} value={m.uid}>{t(m.label)}</option>)
              : options.map(opt => <option key={opt} value={opt}>{t(opt)}</option>)
            }

            {isMemberSelect
              ? <option value="__INVITE_USER__">{t('Invite user…')}</option>
              : <option value="__ADD_NEW__">{t('Add new…')}</option>
            }

            {isMemberSelect && editingOriginalValue && !membersList.find(m => m.uid === editingOriginalValue) && (
              <option value={editingOriginalValue}>{editingOriginalValue}</option>
            )}
            {!isMemberSelect && editingOriginalValue && !options.includes(editingOriginalValue) && (
              <option value={editingOriginalValue}>{editingOriginalValue}</option>
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
            value={editingValue} // Original value
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={(e) => handleBlurSave(task.id, header.key, e.target.value)}
            onKeyDown={handleInputKeyDown}
            className="absolute inset-0 w-full h-full px-3 py-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm z-10"
          />
        );
      }

      // Text-like columns
      if (TEXTAREA_COLUMNS.includes(header.key)) {
        return (
          <textarea
            ref={inputRef}
            value={editingValue} // Original value
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={(e) => handleBlurSave(task.id, header.key, e.target.value)}
            onKeyDown={handleInputKeyDown}
            rows={Math.max(3, (String(editingValue || '').split('\n').length))}
            className="absolute inset-0 w-full h-full min-h-[80px] p-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm resize-y z-10 shadow-lg"
          />
        );
      }
    }

    // Always keep the inquiry column as a button that opens the popup,
    // even when the table is in expanded (isAllExpanded) mode.
    if (header.key === 'inquiry') {
      return (
        <div className="px-4 py-2.5">
          <button
            onClick={(e) => { handleGenericPopupClick(e, task.id, header.key); }}
            className="text-left w-full text-sm text-blue-600 hover:underline"
            type="button"
          >
            {t('(open)')}
          </button>
        </div>
      );
    }

    // not editing: if ALL columns are expanded, show full text (wrapped)
    if (isAllExpanded) {
      // for member columns show label if we can
      if (['csManager', 'qaManager', 'developer'].includes(header.key)) {
        const found = membersList.find(m => m.uid === value);
        const label = found ? found.label : value;
        return (
          <div className="px-4 py-2.5 whitespace-pre-wrap break-words text-sm text-gray-700" title={t(label)}>
            {t(label) || '-'}
          </div>
        );
      }
      return (
        <div className="px-4 py-2.5 whitespace-pre-wrap break-words text-sm text-gray-700" title={t(value)}>
          {t(value) || '-'}
        </div>
      );
    }

    // default normal truncated display
    // if member column, show label instead of uid
    if (['csManager', 'qaManager', 'developer'].includes(header.key)) {
      const found = membersList.find(m => m.uid === value);
      const label = found ? found.label : value;
      return (
        <div className="truncate px-4 py-2.5 text-sm text-gray-700" title={t(label)}>
          {t(label) || '-'}
        </div>
      );
    }

    return (
      <div className="truncate px-4 py-2.5 text-sm text-gray-700" title={t(value)}>
        {t(value) || '-'}
      </div>
    );
  };

  // --- Main return ---
  return (
    <>
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        <div className="px-6 pt-4 pb-3 flex justify-between items-center border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800">{t('Team Project Tasks')}</h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={currentLanguage}
                onChange={(e) => setCurrentLanguage(e.target.value)}
                className="text-sm py-1.5 px-3 rounded border bg-white appearance-none pr-8"
                disabled={isTranslating}
              >
                <option value="en">English</option>
                <option value="ko">한국어</option>
              </select>
              <svg className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              {isTranslating && (
                <span className="text-xs text-blue-600 absolute -bottom-4 right-0">Translating...</span>
              )}
            </div>
            <button
              onClick={toggleAllColumns}
              title={isAllExpanded ? t('Collapse All') : t('Expand All')}
              className="text-sm py-1.5 px-3 rounded border bg-white hover:bg-gray-50"
            >
              {isAllExpanded ? t('Collapse All') : t('Expand All')}
            </button>

            {/* New: Open Options Editor */}
            <button
              onClick={() => setIsOptionsModalOpen(true)}
              title="Edit dropdowns"
              className="text-sm py-1.5 px-3 rounded border bg-white hover:bg-gray-50"
            >
              Edit dropdowns
            </button>

            <button
              onClick={() => setIsCreateTaskModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 px-4 rounded-md shadow-sm transition-colors"
            >
              + {t('New Task')}
            </button>
          </div>
        </div>
        
        {/* --- NEW: Tabs --- */}
        <div className="px-6 border-b border-gray-200">
          <nav className="flex space-x-4" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('active')}
              className={`
                whitespace-nowrap py-3 px-1 border-b-2
                font-medium text-sm transition-colors duration-150
                ${activeTab === 'active'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              {t('Active')}
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
                font-medium text-sm transition-colors duration-150
                ${activeTab === 'completed'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              {t('Completed')}
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
        {/* --- End NEW: Tabs --- */}


        {error && (
          <div className="text-center py-4 text-red-600 bg-red-50">{error}</div>
        )}

        <div className={`relative mt-4 px-6 pb-6 ${isAllExpanded ? '' : 'overflow-x-auto'}`}>
          <table
            className={`table-auto w-full ${isAllExpanded ? '' : 'min-w-[1000px]'} border-collapse`}
            style={{ tableLayout: isAllExpanded ? 'auto' : 'fixed' }}
          >
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {headers.map(h => (
                  <th
                    key={h.key}
                    scope="col"
                    className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-300 ${(!isAllExpanded && h.widthClass) ? h.widthClass : ''}`}
                    style={{
                      maxWidth: (!isAllExpanded ? h.maxWidth : undefined) || undefined,
                      whiteSpace: isAllExpanded ? 'normal' : (currentLanguage === 'en' ? 'nowrap' : 'normal'),
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere'
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className={isAllExpanded ? '' : (currentLanguage === 'en' ? 'truncate' : '')}>
                        {t(h.label)}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={headers.length} className="text-center py-10 text-gray-500">{t('Loading Tasks...')}</td></tr>
              )}

              {!isLoading && !error && tasksToDisplay.length === 0 && (
                <tr>
                  <td colSpan={headers.length} className="text-center py-10 text-gray-500">
                    {activeTab === 'active'
                      ? t('No active tasks created yet.')
                      : t('No completed tasks found.')
                    }
                  </td>
                </tr>
              )}

              {!isLoading && tasksToDisplay.map(task => {
                return (
                  <tr key={task.id} className="group transition-colors duration-100 relative" >
                    {headers.map(header => {
                      const cellKey = getCellKey(task.id, header.key);
                      const isEditingThisCell = editingCell?.taskId === task.id && editingCell?.columnKey === header.key;
                      const isExpandingTextarea = isEditingThisCell && TEXTAREA_COLUMNS.includes(header.key);

                      return (
                        <td
                          key={cellKey}
                          className={[
                            'relative align-top border-b border-gray-100',
                            POPUP_TRIGGER_COLUMNS.includes(header.key) && !isEditingThisCell ? 'cursor-pointer' : '',
                            INLINE_EDITABLE_COLUMNS.includes(header.key) && !isEditingThisCell ? 'cursor-text' : '',
                            (!isAllExpanded && header.widthClass) ? header.widthClass : '',
                            isEditingThisCell ? 'p-0' : ''
                          ].filter(Boolean).join(' ')}
                          style={{
                            maxWidth: (!isAllExpanded ? header.maxWidth : undefined) || undefined,
                            verticalAlign: isAllExpanded ? 'top' : 'middle',
                            height: isExpandingTextarea ? 'auto' : undefined,
                            overflowWrap: isAllExpanded ? 'anywhere' : undefined,
                            wordBreak: isAllExpanded ? 'break-word' : undefined
                          }}
                          onClick={(e) => handleGenericPopupClick(e, task.id, header.key)}
                          onDoubleClick={(e) => handleCellDoubleClick(e, task.id, header.key)}
                        >
                          {/* Always use renderCellContent — it now ensures 'inquiry' remains a popup button even when expanded */}
                          {renderCellContent(task, header, isAllExpanded)}

                          {savingStatus[cellKey] === 'saving' && (
                            <span className="absolute top-1 right-2 text-xs text-gray-500">{t('Saving…')}</span>
                          )}
                          {savingStatus[cellKey] === 'saved' && (
                            <span className="absolute top-1 right-2 text-xs text-green-600">{t('Saved')}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* NotePopup Modal */}
      {isPopupOpen && popupTargetInfo && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4"
          onClick={closeGenericPopup}
        >
          <div className="bg-transparent" onClick={e => e.stopPropagation()}>
            <NotePopup
              teamId={teamId}
              taskId={popupTargetInfo.taskId}
              columnKey={popupTargetInfo.columnKey}
              onClose={closeGenericPopup}
            />
          </div>
        </div>
      )}

      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={() => setIsCreateTaskModalOpen(false)}
        teamId={teamId}
        onTaskCreated={() => { }}
      />

      {/* Add-option Modal (category/type) */}
      {isAddOptionOpen && addOptionMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black opacity-40 z-40" onClick={handleAddOptionCancel}></div>
          <div className="bg-white rounded-lg shadow-xl z-50 max-w-md w-full p-4" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-semibold mb-2">{t('Add new…')}</h4>
            <p className="text-sm text-gray-600 mb-3">{t(`Add a new ${addOptionMeta.headerKey}`)}</p>
            <input
              autoFocus
              value={addOptionValue}
              onChange={(e) => setAddOptionValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddOptionSave();
                if (e.key === 'Escape') handleAddOptionCancel();
              }}
              className="w-full border px-3 py-2 rounded mb-3"
              placeholder={t('(empty)')}
            />
            <div className="flex justify-end gap-2">
              <button onClick={handleAddOptionCancel} className="px-3 py-1.5 rounded border">{t('Cancel')}</button>
              <button onClick={handleAddOptionSave} className="px-3 py-1.5 rounded bg-blue-600 text-white">{t('Save')}</button>
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
          categoriesList={categoriesList}
          typesList={typesList}
          membersList={membersList}
          priorityOptions={priorityOptions}
          statusOptions={statusOptions}
          onCategoriesChange={(arr) => {/* onSnapshot handles this */}}
          onTypesChange={(arr) => {/* onSnapshot handles this */}}
          onMembersChange={(arr) => {/* onSnapshot handles this */}}
          onPrioritiesChange={(arr) => {/* onSnapshot handles this */}}
          onStatusOptionsChange={(arr) => {/* onSnapshot handles this */}}
          persistTeamArrayField={persistTeamArrayField}
          saveMemberLabel={saveMemberLabel}
          removeMember={removeMember}
          addMemberObject={addMemberObject}
        />
      )}

      {/* Invite Member Modal */}
      {isInviteOpen && inviteMeta && (
        <InviteMemberModal
          isOpen={isInviteOpen}
          onClose={handleInviteCanceled}
          teamId={teamId}
          onInvited={(uid, label) => handleInviteCompleted(uid, label)}
        />
      )}
    </>
  );
};

export default TeamProjectTable;

/* ------------------------------------------------------------------
  OptionsEditorModal
  - Tabs: Categories / Types / Priorities / Statuses / Members
  - Add, Edit, Remove items
  - Persists to team doc: categories, types, priorities, statusOptions, members
-------------------------------------------------------------------*/
function OptionsEditorModal({
  isOpen,
  onClose,
  teamId,
  categoriesList,
  typesList,
  membersList,
  priorityOptions,
  statusOptions,
  onCategoriesChange, // These props are now just for optimistic updates if needed
  onTypesChange,
  onMembersChange,
  onPrioritiesChange,
  onStatusOptionsChange,
  persistTeamArrayField,
  saveMemberLabel,
  removeMember,
  addMemberObject
}) {
  const [tab, setTab] = useState('categories'); // categories | types | priorities | statuses | members
  const [items, setItems] = useState([]);
  const [newValue, setNewValue] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValueLocal, setEditingValueLocal] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTab('categories');
    setEditingIndex(null);
    setEditingValueLocal('');
    setNewValue('');
  }, [isOpen]);

  useEffect(() => {
    // switch items based on tab
    switch (tab) {
      case 'categories': setItems(categoriesList); break;
      case 'types': setItems(typesList); break;
      case 'priorities': setItems(priorityOptions); break;
      case 'statuses': setItems(statusOptions); break;
      case 'members': setItems(membersList.map(m => ({ uid: m.uid, label: m.label }))); break;
      default: setItems([]); break;
    }
    setEditingIndex(null);
    setEditingValueLocal('');
    setNewValue('');
  }, [tab, categoriesList, typesList, priorityOptions, statusOptions, membersList]);

  if (!isOpen) return null;

  const applyArrayChange = async (newArr) => {
    try {
      let fieldName = '';
      switch (tab) {
        case 'categories': fieldName = 'categories'; break;
        case 'types': fieldName = 'types'; break;
        case 'priorities': fieldName = 'priorities'; break;
        case 'statuses': fieldName = 'statusOptions'; break;
        default: return;
      }
      await persistTeamArrayField(fieldName, newArr);
      // onSnapshot will update the parent state
    } catch (err) {
      console.error('Failed to persist array field:', err);
      alert('Failed to save changes. See console.');
    }
  };

  const handleAdd = async () => {
    const v = (newValue || '').trim();
    if (!v) return;
    if (tab === 'members') {
      // for members tab, newValue expected to be a uid (or email) — we'll attempt to resolve if it's an email
      // For simplicity require "uid:label" format or uid only. If only uid provided, label=uid
      // But we will try to detect "label <email>" or "email" patterns are messy; keep simple.
      let uid = v;
      let label = v;
      // if user typed "uid|label" split by pipe
      if (v.includes('|')) {
        const parts = v.split('|');
        uid = parts[0].trim();
        label = parts.slice(1).join('|').trim();
      }
      try {
        await addMemberObject(uid, label); // onSnapshot updates list
        setNewValue('');
      } catch (err) {
        console.error(err);
        alert('Failed to add member. See console.');
      }
      return;
    }
    
    if (items.includes(v)) {
      alert("This item already exists.");
      return;
    }
    const next = [...items, v];
    // Optimistic update locally
    setItems(next);
    setNewValue('');
    // persist
    await applyArrayChange(next);
  };

  const startEdit = (idx) => {
    setEditingIndex(idx);
    if (tab === 'members') {
      setEditingValueLocal(items[idx].label || '');
    } else {
      setEditingValueLocal(items[idx] || '');
    }
  };

  const saveEdit = async () => {
    const v = (editingValueLocal || '').trim();
    if (!v) return;

    if (tab === 'members') {
      // items is array of {uid,label}
      const uid = items[editingIndex].uid;
      try {
        await saveMemberLabel(uid, v);
        // onSnapshot updates list
        setEditingIndex(null);
        setEditingValueLocal('');
      } catch (err) {
        console.error(err);
        alert('Failed to save member label. See console.');
      }
      return;
    }
    
    if (items.includes(v) && items.indexOf(v) !== editingIndex) {
      alert("This item already exists.");
      return;
    }

    const next = items.map((it, i) => i === editingIndex ? v : it);
    // Optimistic update
    setItems(next);
    setEditingIndex(null);
    setEditingValueLocal('');
    // persist
    await applyArrayChange(next);
  };

  const handleRemove = async (idx) => {
    if (!window.confirm('Remove this item?')) return;
    if (tab === 'members') {
      const uid = items[idx].uid;
      try {
        await removeMember(uid); // onSnapshot updates list
      } catch (err) {
        console.error(err);
        alert('Failed to remove member. See console.');
      }
      return;
    }
    const next = items.filter((_, i) => i !== idx);
    // Optimistic update
    setItems(next);
    // persist
    await applyArrayChange(next);
  };

  const handleCancel = () => {
    setEditingIndex(null);
    setEditingValueLocal('');
    setNewValue('');
    if (typeof onClose === 'function') onClose();
  };

  const renderListItem = (it, idx) => {
    if (tab === 'members') {
      return (
        <li key={it.uid} className="flex items-center justify-between gap-2 bg-gray-50 p-2 rounded">
          <div className="min-w-0">
            {editingIndex === idx ? (
               <input 
                 className="border rounded px-2 py-1 text-sm w-full" 
                 value={editingValueLocal} 
                 onChange={(e) => setEditingValueLocal(e.target.value)} 
                 autoFocus
               />
            ) : (
              <div className="text-sm font-medium text-gray-800 truncate">{it.label}</div>
            )}
            <div className="text-xs text-gray-500">UID: {it.uid}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {editingIndex === idx ? (
              <>
                <button className="px-2 py-1 bg-blue-600 text-white rounded text-xs" onClick={saveEdit}>Save</button>
                <button className="px-2 py-1 bg-gray-200 rounded text-xs" onClick={() => { setEditingIndex(null); setEditingValueLocal(''); }}>Cancel</button>
              </>
            ) : (
              <>
                <button className="px-2 py-1 bg-yellow-100 rounded text-xs" onClick={() => startEdit(idx)}>Edit</button>
                <button className="px-2 py-1 bg-red-100 rounded text-xs text-red-600" onClick={() => handleRemove(idx)}>Remove</button>
              </>
            )}
          </div>
        </li>
      );
    }

    // regular string list
    return (
      <li key={String(it)} className="flex items-center justify-between gap-2 bg-gray-50 p-2 rounded">
        <div className="min-w-0 flex-1">
          {editingIndex === idx ? (
            <input 
              className="border rounded px-2 py-1 text-sm w-full" 
              value={editingValueLocal} 
              onChange={(e) => setEditingValueLocal(e.target.value)} 
              autoFocus
            />
          ) : (
            <div className="text-sm text-gray-800 truncate">{it}</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {editingIndex === idx ? (
            <>
              <button className="px-2 py-1 bg-blue-600 text-white rounded text-xs" onClick={saveEdit}>Save</button>
              <button className="px-2 py-1 bg-gray-200 rounded text-xs" onClick={() => { setEditingIndex(null); setEditingValueLocal(''); }}>Cancel</button>
            </>
          ) : (
            <>
              <button className="px-2 py-1 bg-yellow-100 rounded text-xs" onClick={() => startEdit(idx)}>Edit</button>
              <button className="px-2 py-1 bg-red-100 rounded text-xs text-red-600" onClick={() => handleRemove(idx)}>Remove</button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black opacity-40" onClick={handleCancel}></div>
      <div className="bg-white rounded-lg shadow-xl z-50 max-w-3xl w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Edit Dropdowns</h3>
          <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>

        <div className="flex gap-4">
          <div className="w-44 bg-gray-50 p-3 rounded">
            <nav className="flex flex-col gap-2">
              <button className={`text-left text-sm px-2 py-1 rounded ${tab === 'categories' ? 'bg-white shadow' : ''}`} onClick={() => setTab('categories')}>Categories</button>
              <button className={`text-left text-sm px-2 py-1 rounded ${tab === 'types' ? 'bg-white shadow' : ''}`} onClick={() => setTab('types')}>Types</button>
              <button className={`text-left text-sm px-2 py-1 rounded ${tab === 'priorities' ? 'bg-white shadow' : ''}`} onClick={() => setTab('priorities')}>Priorities</button>
              <button className={`text-left text-sm px-2 py-1 rounded ${tab === 'statuses' ? 'bg-white shadow' : ''}`} onClick={() => setTab('statuses')}>Statuses</button>
              <button className={`text-left text-sm px-2 py-1 rounded ${tab === 'members' ? 'bg-white shadow' : ''}`} onClick={() => setTab('members')}>Members</button>
            </nav>
          </div>

          <div className="flex-1">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium capitalize">{tab}</h4>
              <form 
                className="flex items-center gap-2"
                onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
              >
                <input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={tab === 'members' ? 'uid|label (or uid)' : 'New value'}
                  className="border px-2 py-1 rounded text-sm"
                />
                <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Add</button>
              </form>
            </div>

            <ul className="space-y-2 max-h-[48vh] overflow-y-auto pr-2">
              {items.length === 0 && <li className="text-sm text-gray-500">No items</li>}
              {items.map((it, idx) => renderListItem(it, idx))}
            </ul>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={handleCancel} className="px-3 py-1 rounded border">Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
  InviteMemberModal component (adapted from your example).
  It will call onInvited(uid, label) when the invite target user is found
-------------------------------------------------------------------*/
function InviteMemberModal({ isOpen, onClose, teamId, onInvited }) {
  const [email, setEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInvite = async () => {
    if (!email.trim()) {
      setError('Please enter an email address.');
      return;
    }

    setIsInviting(true);
    setError('');
    setSuccess('');

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("You must be logged in.");
      }

      // 1. Find the user by email
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email.trim().toLowerCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError('User with this email not found.');
        setIsInviting(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const invitedUserId = userDoc.id;
      const invitedData = userDoc.data();
      const invitedLabel = invitedData.displayName || invitedData.name || invitedData.email || invitedUserId;

      // 2. Get team data (for team name and member check)
      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await getDoc(teamRef);

      if (!teamSnap.exists()) {
        setError('Team not found. This should not happen.');
        setIsInviting(false);
        return;
      }

      const teamData = teamSnap.data();
      const teamName = teamData.teamName || 'Team';
      const members = teamData.members || [];

      // 3. Check if user is already a member (by UID)
      if (members.includes(invitedUserId) || (members.find && members.find(m => m.uid === invitedUserId))) {
        setError('This user is already a member of the team.');
        setIsInviting(false);
        return;
      }

      const senderName = currentUser.displayName || currentUser.email || currentUser.uid;

      // 4. Create the notification
      await addDoc(collection(db, 'notifications'), {
        userId: invitedUserId,
        type: 'INVITATION',
        senderId: currentUser.uid,
        senderName: senderName,
        teamId: teamId,
        teamName: teamName,
        createdAt: serverTimestamp(),
        isRead: false,
      });

      setSuccess(`Invitation sent to ${email}!`);

      // Notify parent (table) that invitation succeeded and provide uid + label
      if (typeof onInvited === 'function') {
        onInvited(invitedUserId, invitedLabel);
      }

      setEmail('');
      setTimeout(() => {
        if (typeof onClose === 'function') onClose();
      }, 800);
    } catch (err) {
      console.error('Error sending invitation:', err);
      setError('Failed to send invitation. Please try again.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setError('');
    setSuccess('');
    if (typeof onClose === 'function') onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800">Invite Member</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        {success && <p className="text-green-500 text-sm mb-3">{success}</p>}
        <div className="space-y-4">
          <div>
            <label htmlFor="inviteEmail" className="block text-sm font-medium text-gray-700 mb-1">
              User's Email
            </label>
            <input
              type="email"
              id="inviteEmail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., teammate@example.com"
              className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6 border-t pt-4">
          <button onClick={handleClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
            Cancel
          </button>
          <button
            onClick={handleInvite}
            disabled={isInviting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isInviting ? 'Sending...' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}