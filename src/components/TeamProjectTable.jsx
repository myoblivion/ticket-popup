import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db } from '../firebaseConfig';
import {
  collection,
  query,
  orderBy,
  Timestamp,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
// import ColumnActionPopup from './ColumnActionPopup'; // No longer needed
import NotePopup from './NotePopup'; // <-- IMPORTED NOTPOPUP
import CreateTaskModal from './CreateTaskModal';

// --- We no longer need the Google Script URL ---

// placeholders...
const placeholderMembers = [
  { uid: 'uid1', name: 'Member One (member1@example.com)' },
  { uid: 'uid2', name: 'Member Two (member2@example.com)' }
];
const placeholderCategories = ['Tech Issue', 'Feature Request', 'Inquiry'];
const placeholderTypes = ['Bug', 'Enhancement', 'Question', 'Backend', 'Frontend'];
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];
const STATUS_OPTIONS = ['Not started', 'In progress', 'QA', 'Complete'];

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
  'No tasks created yet.',
  '(open)',
  '(empty)',
  'Delete this task? This action cannot be undone.',
  'Delete task',
  'Saving…',
  'Saved',
  // Add any other static UI text here
];

const TeamProjectTable = ({ teamId }) => { // Removed onOpenNotePopup, as it's handled internally
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


  // --- UPDATED: Translation Effect (now with batching to avoid query length limit) ---
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
        // MyMemory has a practical limit around 500 chars for `q=`.
        const batches = [];
        const delimiter = ' ||| ';
        const delimEncLen = encodeURIComponent(delimiter).length;
        const MAX_ENCODED_CHARS = 480; // safe headroom under 500

        let currentBatch = [];
        let currentLen = 0;

        for (const s of stringsToTranslate) {
          const encLen = encodeURIComponent(s).length;
          // if single string too long, we still need to send it alone (it may fail server-side)
          if (currentBatch.length === 0 && encLen > MAX_ENCODED_CHARS) {
            // put it in its own batch anyway
            batches.push([s]);
            currentBatch = [];
            currentLen = 0;
            continue;
          }

          // if adding this string would exceed length, flush current and start new
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

        // sequentially fetch each batch and collect translated strings in order
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
          // split by delimiter (allow spaces around delimiter)
          const translatedStringsArray = translatedJoinedStrings.split(/\s*\|\|\|\s*/);
          // If counts mismatch, gracefully fallback by filling missing with original
          for (let i = 0; i < batch.length; i++) {
            const translated = translatedStringsArray[i] || batch[i];
            translatedFullList.push(translated.trim());
          }
        }

        // Map originals -> translations in one pass
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

  // --- Translation Helper Function (unchanged) ---
  const t = useCallback((text) => {
    if (currentLanguage === 'en' || !text) {
      return text;
    }
    return translations.get(text) || text;
  }, [currentLanguage, translations]);


  // --- Firestore realtime listener (unchanged) ---
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

  // helpers (unchanged)
  const getCellKey = (taskId, headerKey) => `${taskId}-${headerKey}`;

  // saving state helper (unchanged)
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

  // cleanup timer/debounce refs (unchanged)
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

  // save helpers (unchanged)
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

  // deleteRow (unchanged)
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
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setSavingState(key, 'saved');
    } catch (err) {
      console.error('Error deleting task:', err);
      setError('Failed to delete task.');
      setTimeout(() => setSavingState(key, null), 1200);
    }
  }, [teamId, t]); // Added 't' dependency

  // start editing (unchanged)
  const startEditingCell = (taskId, columnKey, currentValue) => {
    setEditingCell({ taskId, columnKey });
    setEditingValue(currentValue ?? '');
    setEditingOriginalValue(currentValue ?? '');
  };

  // cancel editing (unchanged)
  const cancelEditing = () => {
    setEditingCell(null);
    setEditingValue('');
    setEditingOriginalValue('');
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  };

  // debounce auto-save for text-like columns (unchanged)
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

  // Auto-focus logic (unchanged)
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

  // handlers (unchanged)
  const handleCellDoubleClick = (e, taskId, columnKey) => {
    e.stopPropagation();
    if (!INLINE_EDITABLE_COLUMNS.includes(columnKey)) return;
    const task = tasks.find(t => t.id === taskId);
    const currentValue = task ? (task[columnKey] ?? '') : '';
    startEditingCell(taskId, columnKey, String(currentValue));
  };

  // --- UPDATED: Click handler ---
  const handleGenericPopupClick = (e, taskId, columnKey) => {
    e.stopPropagation();
    if (editingCell?.taskId === taskId && editingCell?.columnKey === columnKey) return;
    
    // Check if this column is meant to trigger the NotePopup
    if (POPUP_TRIGGER_COLUMNS.includes(columnKey)) {
      // Set the state with the correct info for NotePopup
      setPopupTargetInfo({ taskId, columnKey }); // <-- PASSES THE KEY
      setIsPopupOpen(true);
    }
  };

  // --- UPDATED: Close popup handler ---
  const closeGenericPopup = () => {
    setIsPopupOpen(false);
    setPopupTargetInfo(null);
  };

  const handleSelectChange = async (taskId, columnKey, newValue) => {
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
        // For <input> and <select>
        e.preventDefault();
        saveAndClose(taskId, columnKey, editingValue || '');
      }
    }
  };

  // expansion helpers (unchanged)
  const toggleAllColumns = () => setIsAllExpanded(prev => !prev);


  // cell renderer: now accepts isAllExpanded
  const renderCellContent = (task, header, isAllExpanded) => {
    const isEditingThisCell = editingCell?.taskId === task.id && editingCell?.columnKey === header.key;
    const rawValue = task[header.key];
    const value = rawValue !== undefined && rawValue !== null ? String(rawValue) : '';

    // actions (unchanged)
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

    // editing UI (unchanged)
    if (isEditingThisCell) {
      // Select (dropdown) columns
      if (['priority', 'category', 'type', 'status', 'csManager', 'qaManager', 'developer'].includes(header.key)) {
        let options = [];
        switch (header.key) {
          case 'priority': options = PRIORITY_OPTIONS; break;
          case 'category': options = placeholderCategories; break;
          case 'type': options = placeholderTypes; break;
          case 'status': options = STATUS_OPTIONS; break;
          default: options = placeholderMembers.map(m => m.name);
        }
        return (
          <select
            ref={selectRef}
            value={editingValue} // The original English value
            onChange={(e) => {
              const newVal = e.target.value;
              setEditingValue(newVal);
              handleSelectChange(task.id, header.key, newVal);
            }}
            onBlur={() => setTimeout(() => { if (editingCell?.taskId === task.id) cancelEditing(); }, 100)} // delay to allow click-to-change
            className="absolute inset-0 w-full h-full px-2 py-1 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm z-10"
            onKeyDown={handleInputKeyDown}
          >
            <option value="">{t(`(empty)`)}</option>
            {/* Show translated options, but the value is English */}
            {options.map(opt => <option key={opt} value={opt}>{t(opt)}</option>)}
            {editingOriginalValue && !options.includes(editingOriginalValue) && <option value={editingOriginalValue}>{editingOriginalValue}</option>}
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

      // Text-like columns (ticketNo, company, inquiryDetails, notes)
      if (TEXTAREA_COLUMNS.includes(header.key)) {
        return (
          <textarea
            ref={inputRef}
            value={editingValue} // Original value
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={(e) => handleBlurSave(task.id, header.key, e.target.value)}
            onKeyDown={handleInputKeyDown}
            rows={Math.max(3, (String(editingValue || '').split('\n').length))} // Start with at least 3 rows, and grow
            className="absolute inset-0 w-full h-full min-h-[80px] p-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm resize-y z-10 shadow-lg"
          />
        );
      }
    }

    // --- Translated Display (unchanged) ---

    // not editing: if ALL columns are expanded, show full text
    if (isAllExpanded) {
      return (
        <div className="px-4 py-2.5 whitespace-pre-wrap break-words text-sm text-gray-700" title={t(value)}>
          {t(value) || '-'}
        </div>
      );
    }

    // --- UPDATED: 'inquiry' column ---
    // normal truncated display; inquiry still triggers popup
    if (header.key === 'inquiry') {
      return (
        <div className="truncate px-4 py-2.5">
          <button
            onClick={(e) => { handleGenericPopupClick(e, task.id, header.key); }} // <-- No label needed
            className="text-left w-full text-sm text-blue-600 hover:underline truncate"
            type="button"
          >
            {t('(open)')} {/* <-- Always show (open) */}
          </button>
        </div>
      );
    }

    // default normal truncated display
    return (
      <div className="truncate px-4 py-2.5 text-sm text-gray-700" title={t(value)}>
        {t(value) || '-'}
      </div>
    );
  };

  // --- Main component return ---
  return (
    <>
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        {/* Header (unchanged) */}
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
            <button
              onClick={() => setIsCreateTaskModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 px-4 rounded-md shadow-sm transition-colors"
            >
              + {t('New Task')}
            </button>
          </div>
        </div>

        {/* Global Error Display (unchanged) */}
        {error && (
          <div className="text-center py-4 text-red-600 bg-red-50">{error}</div>
        )}

        {/* Table (unchanged) */}
        <div className="overflow-x-auto relative mt-4 px-6 pb-6">
          <table className="table-auto w-full min-w-[1000px] border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {headers.map(h => (
                  <th
                    key={h.key}
                    scope="col"
                    className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-300 ${h.widthClass || 'w-auto'}`}
                    style={{
                      maxWidth: h.maxWidth || undefined,
                      whiteSpace: currentLanguage === 'en' ? 'nowrap' : 'normal',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      wordBreak: currentLanguage === 'en' ? 'normal' : 'keep-all'
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className={currentLanguage === 'en' ? 'truncate' : ''}>
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

              {!isLoading && !error && tasks.length === 0 && (
                <tr><td colSpan={headers.length} className="text-center py-10 text-gray-500">{t('No tasks created yet.')}</td></tr>
              )}

              {!isLoading && tasks.map(task => {
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
                            POPUP_TRIGGER_COLUMNS.includes(header.key) && !isEditingThisCell ? 'cursor-pointer' : '', // <-- This makes it clickable
                            INLINE_EDITABLE_COLUMNS.includes(header.key) && !isEditingThisCell ? 'cursor-text' : '',
                            header.widthClass || '',
                            isEditingThisCell ? 'p-0' : ''
                          ].filter(Boolean).join(' ')}
                          style={{
                            maxWidth: header.maxWidth || undefined,
                            verticalAlign: isAllExpanded ? 'top' : 'middle',
                            height: isExpandingTextarea ? 'auto' : undefined,
                          }}
                          onClick={(e) => handleGenericPopupClick(e, task.id, header.key)} // <-- UPDATED
                          onDoubleClick={(e) => handleCellDoubleClick(e, task.id, header.key)}
                        >
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

      {/* --- REPLACEMENT: NotePopup Modal --- */}
      {isPopupOpen && popupTargetInfo && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4"
          onClick={closeGenericPopup} // Close on overlay click
        >
          <div 
            className="bg-transparent" // NotePopup provides its own background/styling
            onClick={e => e.stopPropagation()} // Prevent modal close on popup click
          >
            <NotePopup
              teamId={teamId}
              taskId={popupTargetInfo.taskId}
              columnKey={popupTargetInfo.columnKey}
              onClose={closeGenericPopup}
            />
          </div>
        </div>
      )}
      {/* --- END REPLACEMENT --- */}

      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={() => setIsCreateTaskModalOpen(false)}
        teamId={teamId}
        onTaskCreated={() => { }}
      />
    </>
  );
};

export default TeamProjectTable;
