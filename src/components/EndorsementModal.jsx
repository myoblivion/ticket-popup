// src/components/EndorsementModal.jsx

import React, { useState, useEffect, useCallback, useContext, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebaseConfig';

import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  deleteDoc,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  getDoc,
  setDoc,
  where,
  deleteField
} from 'firebase/firestore';

import AddEndorsementModal from './AddEndorsementModal';
import HandoverPopup from './HandoverPopup';
import { LanguageContext } from '../contexts/LanguageContext';

// --- Placeholders ---
const DEFAULT_PLACEHOLDERS = {
  members: [],
  categories: ['General', 'Tech', 'Operations'],
  // types removed
  priorities: [],
};
const DEFAULT_STATUS_OPTIONS = ['Pending', 'In Progress', 'Approved', 'Rejected'];

// --- NEW: Default Checkers (as a fallback) ---
const DEFAULT_CHECKERS = [
  { key: 'checkerCS', label: 'CS Lead' },
  { key: 'checkerPark', label: 'Park Lead' },
  { key: 'checkerSeo', label: 'Seo Director' },
  { key: 'checkerDev', label: 'Dev Director' },
  { key: 'checkerYoo', label: 'Yoo Director' },
  { key: 'checkerKim', label: 'Kim Director' },
];

// --- NEW: Editable Columns Config ---
const INLINE_EDITABLE_COLUMNS = [
  'number', 'categories', 'content', 'postedBy', 'status', 'remarks'
];
// These columns will use a <textarea> for editing
const TEXTAREA_COLUMNS = ['content', 'remarks'];
// These columns will be a <select> dropdown of team members
const MEMBER_COLUMNS = ['postedBy'];

// --- Spinner component ---
const Spinner = () => (
  <div className="flex justify-center items-center py-6">
    <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

// --- formatDate utility ---
const formatDate = (value, { fallback = '' } = {}) => {
  if (!value) return fallback;
  try {
    let d;
    // Handle Firestore Timestamps
    if (typeof value === 'object' && value !== null && typeof value.toDate === 'function') {
      d = value.toDate();
    } else if (value instanceof Date) {
      d = value;
    } else if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      if (!isNaN(parsed)) d = parsed;
      else return value; // Return original string if parsing fails
    } else {
      return String(value);
    }
    return d.toISOString().split('T')[0]; // YYYY-MM-DD format
  } catch (err) {
    console.error('formatDate error', err, value);
    return String(value);
  }
};

// --- THIS IS THE HANDOVER SECTION COMPONENT ---
const HandoversSection = ({ teamId }) => {
  const { t } = useContext(LanguageContext);
  
  // --- NEW: React Router Hooks ---
  const { handoverId } = useParams(); 
  const navigate = useNavigate(); 
  const baseTitleRef = useRef(document.title); 

  const [handovers, setHandovers] = useState([]);
  const [isLoading, setIsLoading] = useState(true); 
  const [error, setError] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // --- Details Popup State ---
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedHandover, setSelectedHandover] = useState(null);

  // --- State from TeamProjectTable ---
  const [isAllExpanded, setIsAllExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'approved'
  const [filters, setFilters] = useState({
    categories: '',
    postedBy: '',
    status: ''
  });

  // --- Sorting State ---
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

  // --- Options/Modal State ---
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false); // Needed for OptionsEditorModal
  const [inviteMeta, setInviteMeta] = useState(null); // Needed for OptionsEditorModal

  // --- Dynamic Option Lists State ---
  const [membersList, setMembersList] = useState(DEFAULT_PLACEHOLDERS.members);
  const [categoriesList, setCategoriesList] = useState(DEFAULT_PLACEHOLDERS.categories);
  // typesList removed
  const [priorityOptions, setPriorityOptions] = useState(DEFAULT_PLACEHOLDERS.priorities);
  const [statusOptions, setStatusOptions] = useState(DEFAULT_STATUS_OPTIONS);
  const [checkerList, setCheckerList] = useState(DEFAULT_CHECKERS); 

  // --- NEW: Inline Editing State ---
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingOriginalValue, setEditingOriginalValue] = useState('');
  const debounceRef = useRef(null);
  const inputRef = useRef(null); 
  const selectRef = useRef(null); 

  // --- NEW: Saving Indicator State ---
  const [savingStatus, setSavingStatus] = useState({});
  const savingTimersRef = useRef({});

  // --- NEW: Load team members / options from Firestore ---
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
          setPriorityOptions(DEFAULT_PLACEHOLDERS.priorities);
          setStatusOptions(DEFAULT_STATUS_OPTIONS);
          setCheckerList(DEFAULT_CHECKERS);
          return;
        }
        const data = snap.data();

        // --- Load Handover-Specific Options ---
        if (data.handoverCategories && Array.isArray(data.handoverCategories) && data.handoverCategories.length > 0) {
          setCategoriesList(data.handoverCategories);
        } else if (data.categories && Array.isArray(data.categories)) { // Fallback to general categories
           setCategoriesList(data.categories);
        } else {
           setCategoriesList(DEFAULT_PLACEHOLDERS.categories);
        }
        
        if (data.handoverStatusOptions && Array.isArray(data.handoverStatusOptions) && data.handoverStatusOptions.length > 0) {
          setStatusOptions(data.handoverStatusOptions);
        } else {
          setStatusOptions(DEFAULT_STATUS_OPTIONS);
        }

        // --- NEW: Load Handover Checkers ---
        if (data.handoverCheckers && Array.isArray(data.handoverCheckers) && data.handoverCheckers.length > 0) {
          setCheckerList(data.handoverCheckers);
        } else {
          setCheckerList(DEFAULT_CHECKERS);
        }

        // --- Load other options for the OptionsEditorModal ---
        if (data.priorities && Array.isArray(data.priorities)) setPriorityOptions(data.priorities);

        // --- Load Members (copied from TeamProjectTable) ---
        if (data.members && Array.isArray(data.members)) {
          const resolved = await Promise.all(data.members.map(async (member) => {
            let memberUid, existingLabel = null;
            if (typeof member === 'object' && member !== null && member.uid) {
              memberUid = member.uid;
              existingLabel = member.label || member.name || member.email;
            } else if (typeof member === 'string') {
              memberUid = member;
            } else {
              return null; 
            }
            if (!memberUid) return null;
            if (existingLabel) return { uid: memberUid, label: existingLabel };
            
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
              console.error('Failed to load user data for:', member, err);
              return { uid: memberUid, label: memberUid };
            }
          }));
          const validMembers = resolved.filter(m => m !== null);
          const uniqueMembers = Array.from(new Map(validMembers.map(m => [m.uid, m])).values());
          setMembersList(uniqueMembers);
        } else {
          setMembersList(DEFAULT_PLACEHOLDERS.members);
        }
      }, (err) => {
        console.error('Error listening to team meta:', err);
        // Set defaults on error
        setMembersList(DEFAULT_PLACEHOLDERS.members);
        setCategoriesList(DEFAULT_PLACEHOLDERS.categories);
        setPriorityOptions(DEFAULT_PLACEHOLDERS.priorities);
        setStatusOptions(DEFAULT_STATUS_OPTIONS);
        setCheckerList(DEFAULT_CHECKERS);
      });
    } catch (e) {
      console.error('Failed to initialize team meta snapshot:', e);
    }

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [teamId]);

  // --- Fetch Handovers with onSnapshot ---
  useEffect(() => {
    if (!teamId) {
      setError("Invalid Team ID provided.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    
    const handoversRef = collection(db, `teams/${teamId}/endorsements`);
    const q = query(handoversRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedData = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        number: docSnap.data().number || '', 
        categories: docSnap.data().categories || '',
        content: docSnap.data().content || '',
        postedBy: docSnap.data().postedBy || '',
        status: docSnap.data().status || 'Pending',
        remarks: docSnap.data().remarks || '',
        ...docSnap.data()
      }));
      setHandovers(fetchedData);
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching handovers:", err);
      setError(t('admin.loadEndorsementsError', "Failed to load handover data. Please try again."));
      setIsLoading(false);
    });

    return () => unsubscribe(); // Unsubscribe on unmount
  }, [teamId, t]);

  // --- NEW: This effect opens the popup if a handoverId is present in the URL ---
  useEffect(() => {
    if (handoverId && handovers.length > 0) { 
      const handoverToOpen = handovers.find(h => h.id === handoverId);
      if (handoverToOpen) {
        setSelectedHandover(handoverToOpen);
        setIsDetailsModalOpen(true);
        document.title = `Handover ${handoverId}`;
      } else {
        console.warn(`Handover with ID ${handoverId} not found.`);
        navigate(`/team/${teamId}`, { replace: true });
      }
    } else if (!handoverId) {
      setIsDetailsModalOpen(false);
      setSelectedHandover(null);
      document.title = baseTitleRef.current; 
    }
  }, [handoverId, handovers, teamId, navigate]); 

  // --- Split handovers into Active and Approved ---
  const { activeHandovers, approvedHandovers } = useMemo(() => {
    const active = [];
    const approved = [];
    const approvedStatusString = 'Approved'; 

    for (const handover of handovers) {
      if (handover.status === approvedStatusString) {
        approved.push(handover);
      } else {
        active.push(handover);
      }
    }
    return { activeHandovers: active, approvedHandovers: approved };
  }, [handovers]);

  // --- Select handovers based on the active tab ---
  const handoversToDisplay = useMemo(() => {
    return activeTab === 'active' ? activeHandovers : approvedHandovers;
  }, [activeTab, activeHandovers, approvedHandovers]);

  // --- Apply Filters ---
  const filteredHandoversToDisplay = useMemo(() => {
    const { categories, postedBy, status } = filters;
    
    if (!categories && !postedBy && !status) {
      return handoversToDisplay; 
    }

    return handoversToDisplay.filter(item => {
      if (categories) {
        if (!item.categories || item.categories !== categories) {
          return false;
        }
      }
      if (postedBy) {
        if (!item.postedBy || item.postedBy !== postedBy) {
          return false;
        }
      }
      if (status) {
        if ((item.status || 'Pending') !== status) { 
          return false;
        }
      }
      return true; 
    });
  }, [handoversToDisplay, filters]);

  // --- NEW: Sorting Logic ---
  const sortedHandovers = useMemo(() => {
    // Create a copy to sort
    let data = [...filteredHandoversToDisplay];
    
    if (!sortConfig.key) return data;

    return data.sort((a, b) => {
      let valA, valB;

      if (sortConfig.key === 'number') {
        valA = Number(a.number) || 0;
        valB = Number(b.number) || 0;
      } else if (sortConfig.key === 'date') {
        // Handle Firestore Timestamp or standard Date or string
        const dateA = a.createdAt && typeof a.createdAt.toDate === 'function' 
          ? a.createdAt.toDate() 
          : new Date(a.createdAt || 0);
        
        const dateB = b.createdAt && typeof b.createdAt.toDate === 'function' 
          ? b.createdAt.toDate() 
          : new Date(b.createdAt || 0);
          
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
  }, [filteredHandoversToDisplay, sortConfig]);

  // --- NEW: Sort Handler ---
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // --- Checkbox & Delete Handlers (Original) ---
  const handleCheckboxChange = async (docId, field, currentValue) => {
    const docRef = doc(db, `teams/${teamId}/endorsements`, docId);
    try {
      await updateDoc(docRef, { [field]: !currentValue });
    } catch (err) {
      console.error("Error updating checkbox:", err);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm(t('handovers.confirmDelete', 'Are you sure you want to delete this handover?'))) {
      return;
    }
    const docRef = doc(db, `teams/${teamId}/endorsements`, docId);
    try {
      await deleteDoc(docRef);
    } catch (err) {
      console.error("Error deleting handover:", err);
      setError(t('handovers.deleteError', 'Failed to delete handover. Please try again.'));
    }
  };

  // --- NEW: Inline Editing Functions (from TeamProjectTable) ---
  const getCellKey = (docId, headerKey) => `${docId}-${headerKey}`;

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

  const saveDraft = useCallback(async (docId, columnKey, value) => {
    if (!teamId || !docId) {
      setError(`Missing teamId/docId for auto-save.`);
      return;
    }
    const saveKey = getCellKey(docId, columnKey);
    try {
      setSavingState(saveKey, 'saving');
      const docRef = doc(db, `teams/${teamId}/endorsements`, docId);
      const valueToSave = columnKey === 'number' ? (Number(value) || 0) : value;
      await updateDoc(docRef, { [columnKey]: valueToSave });
      setSavingState(saveKey, 'saved');
    } catch (err) {
      console.error("Error auto-saving:", err);
      setError(`Failed to save ${columnKey}.`);
      setTimeout(() => setSavingState(saveKey, null), 1200);
    }
  }, [teamId]); 

  const saveAndClose = useCallback(async (docId, columnKey, value) => {
    if (!teamId || !docId) {
      setError(`Missing teamId/docId for save.`);
      return;
    }
    if (debounceRef.current) { 
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const saveKey = getCellKey(docId, columnKey);
    try {
      setSavingState(saveKey, 'saving');
      const docRef = doc(db, `teams/${teamId}/endorsements`, docId);
      const valueToSave = columnKey === 'number' ? (Number(value) || 0) : value;
      await updateDoc(docRef, { [columnKey]: valueToSave });
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

  const startEditingCell = (docId, columnKey, currentValue) => {
    setEditingCell({ docId, columnKey });
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
    const { docId, columnKey } = editingCell;
    const isTextarea = TEXTAREA_COLUMNS.includes(columnKey);
    if (!isTextarea) return; 

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (editingValue !== editingOriginalValue) {
          saveDraft(docId, columnKey, editingValue || '');
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
      const isSelect = ['categories', 'status', 'postedBy'].includes(editingCell.columnKey);
      const isTextarea = TEXTAREA_COLUMNS.includes(editingCell.columnKey);
      
      let ref = inputRef; 
      if (isSelect) ref = selectRef;
      else if (isTextarea) ref = inputRef; 

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

  // --- NEW: Editing Event Handlers ---
  const handleCellDoubleClick = (e, docId, columnKey) => {
    e.stopPropagation();
    if (!INLINE_EDITABLE_COLUMNS.includes(columnKey)) return;
    const item = handovers.find(h => h.id === docId); 
    const currentValue = item ? (item[columnKey] ?? '') : '';
    startEditingCell(docId, columnKey, String(currentValue));
  };

  const handleSelectChange = async (docId, columnKey, newValue) => {
    await saveAndClose(docId, columnKey, newValue || '');
  };

  const handleBlurSave = (docId, columnKey, value) => {
    if (value !== editingOriginalValue) {
        saveAndClose(docId, columnKey, value || '');
    } else {
        cancelEditing(); 
    }
  };

  const handleInputKeyDown = (e) => {
    if (!editingCell) return;
    const { docId, columnKey } = editingCell;
    const isTextarea = e.target && e.target.tagName === 'TEXTAREA';

    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelEditing();
    } else if (e.key === 'Enter') {
      if (isTextarea) {
        if (e.shiftKey) return; 
        e.preventDefault(); 
        saveAndClose(docId, columnKey, editingValue || '');
      } else { 
        e.preventDefault(); 
        saveAndClose(docId, columnKey, editingValue || '');
      }
    }
  };

  // --- Filter/Modal Handlers (Original) ---
  const toggleAllColumns = () => setIsAllExpanded(prev => !prev);
  
  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ categories: '', postedBy: '', status: '' });
  }, []);

  const openAddModal = () => setIsAddModalOpen(true);

  const handleHandoverAdded = () => {
    setIsAddModalOpen(false); 
  };

  // --- MODIFIED: openDetailsModal ---
  const openDetailsModal = (item) => {
    const modalUrl = `/team/${teamId}/handover/${item.id}`; 
    const modalTitle = `Handover ${item.id} - details`;

    navigate(modalUrl); 
    document.title = modalTitle;

    setSelectedHandover(item);
    setIsDetailsModalOpen(true);
  };

  // --- MODIFIED: closeDetailsModal ---
  const closeDetailsModal = () => {
    setIsDetailsModalOpen(false);
    setSelectedHandover(null);
    document.title = baseTitleRef.current;
  
    navigate(`/team/${teamId}`, { replace: true }); 
  };
  
  // --- Persistence functions for OptionsEditorModal (Original) ---
  const persistTeamArrayField = async (fieldName, arr) => {
    if (!teamId) throw new Error('Missing teamId');
    
    let actualFieldName = fieldName;
    if (fieldName === 'categories') actualFieldName = 'handoverCategories';
    if (fieldName === 'statusOptions') actualFieldName = 'handoverStatusOptions';
    if (fieldName === 'priorities') actualFieldName = 'handoverPriorities';
    if (fieldName === 'checkers') actualFieldName = 'handoverCheckers'; 
    
    const teamRef = doc(db, 'teams', teamId);
    try {
      await setDoc(teamRef, { [actualFieldName]: arr }, { merge: true });
    } catch (err) {
      console.error(`Failed to persist ${actualFieldName}:`, err);
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

  const handleInviteCompleted = () => {
      setIsInviteOpen(false);
      setInviteMeta(null);
  };

  const handleInviteCanceled = () => {
      setIsInviteOpen(false);
      setInviteMeta(null);
  };

  // --- Headers (FIXED KOREAN DEFAULTS) ---
  const mainHeaders = useMemo(() => [
    { key: 'number', label: t('handovers.id', 'No.') }, 
    { key: 'date', label: t('handovers.date', 'Date') },
    { key: 'categories', label: t('handovers.categories', 'Categories') },
    { key: 'content', label: t('handovers.content', 'Handover Contents') },
    { key: 'details', label: t('handovers.details', 'Details') },
    { key: 'postedBy', label: t('handovers.postedBy', 'Posted by') },
  ], [t]);

  // --- MODIFIED: Checker headers are now dynamic ---
  const checkerHeaders = useMemo(() => {
    if (!checkerList || checkerList.length === 0) {
      return [];
    }
    return checkerList.map(checker => ({
      key: checker.key,
      label: checker.label 
    }));
  }, [checkerList]); 

  // --- NEW: Memoized list of checker keys for renderCellContent ---
  const checkerKeys = useMemo(() => checkerList.map(c => c.key), [checkerList]);


  // --- NEW: Cell Renderer (Fully refactored) ---
  const renderCellContent = (item, headerKey, meta = {}) => {
    const isEditingThisCell = editingCell?.docId === item.id && editingCell?.columnKey === headerKey;
    const rawValue = item[headerKey];
    const displayValue = rawValue !== undefined && rawValue !== null ? String(rawValue) : '';

    // --- 1. EDITING UI ---
    if (isEditingThisCell) {
      // Select (dropdown) columns
      if (['categories', 'status', 'postedBy'].includes(headerKey)) {
        let options = [];
        let isMemberSelect = false;
        switch (headerKey) {
          case 'categories': options = categoriesList; break;
          case 'status': options = statusOptions; break;
          case 'postedBy': 
            options = membersList; // array of {uid, label}
            isMemberSelect = true;
            break;
          default: break;
        }

        return (
          <select
            ref={selectRef}
            value={editingValue} // For members, this is UID
            onChange={(e) => {
              const newValue = e.target.value;
              setEditingValue(newValue); // Update local state
              handleSelectChange(item.id, headerKey, newValue); // Trigger save
            }}
            onBlur={() => {
              setTimeout(() => {
                if (editingCell?.docId === item.id && editingCell?.columnKey === headerKey) {
                  cancelEditing(); 
                }
              }, 150);
            }}
            className="absolute inset-0 w-full h-full px-2 py-1 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm z-10"
            onKeyDown={handleInputKeyDown} // Handle Escape
          >
            <option value="">{t('common.empty')}</option>
            {isMemberSelect
              ? membersList.map(m => <option key={m.uid} value={m.uid}>{m.label}</option>)
              : options.map(opt => <option key={opt} value={opt}>{opt}</option>)
            }
            {/* Show original value if it's no longer in the list */}
            {isMemberSelect && editingOriginalValue && !membersList.some(m => m.uid === editingOriginalValue) && (
              <option value={editingOriginalValue} disabled>{editingOriginalValue} (removed)</option>
            )}
            {!isMemberSelect && editingOriginalValue && !options.includes(editingOriginalValue) && (
              <option value={editingOriginalValue} disabled>{editingOriginalValue} (removed)</option>
            )}
          </select>
        );
      }

      // Text-like columns (use textarea)
      if (TEXTAREA_COLUMNS.includes(headerKey)) {
        return (
          <textarea
            ref={inputRef}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={(e) => handleBlurSave(item.id, headerKey, e.target.value)}
            onKeyDown={handleInputKeyDown}
            rows={Math.max(3, (String(editingValue || '').split('\n').length))}
            className="absolute inset-0 w-full h-full min-h-[80px] p-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm resize-y z-10 shadow-lg"
          />
        );
      }

      // --- NEW: Default Input (for 'number', etc.) ---
      return (
        <input
          ref={inputRef}
          type={headerKey === 'number' ? 'number' : 'text'}
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={(e) => handleBlurSave(item.id, headerKey, e.target.value)}
          onKeyDown={handleInputKeyDown}
          className="absolute inset-0 w-full h-full p-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm z-10"
        />
      );
    }

    // --- 2. STATIC DISPLAY UI ---

    // Special non-editable columns
    switch(headerKey) {
      case 'number': {
        const manualNumber = item.number; // Value from Firestore
        const { index, total } = meta;
        let textToShow;
        
        if (manualNumber || manualNumber === 0) {
          textToShow = String(manualNumber);
        } 
        else if (index !== undefined && total !== undefined) {
          textToShow = total - index;
        } 
        else {
          textToShow = '-';
        }
        
        return (
          <div
            className={isAllExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'}
            title={textToShow}
          >
            {textToShow}
          </div>
        );
      }

      case 'date':
        return <div className="truncate">{formatDate(item.createdAt)}</div>;
      case 'details':
        return (
          <button onClick={() => openDetailsModal(item)} className="text-blue-600 hover:underline text-xs font-medium">
            {t('common.view', 'View')}
          </button>
        );
      case 'actions':
        return (
          <div className="text-center">
            <button 
              onClick={() => handleDelete(item.id)}
              className="text-red-600 hover:text-red-800 hover:underline text-xs font-medium"
            >
              {t('common.delete', 'Delete')}
            </button>
          </div>
        );
      
      default:
        break; 
    }

    // --- NEW: Dynamic Checker Rendering ---
    if (checkerKeys.includes(headerKey)) {
      return (
        <div className="text-center">
          <input
            type="checkbox"
            checked={item[headerKey] === true}
            onChange={() => handleCheckboxChange(item.id, headerKey, item[headerKey])}
            className="form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out cursor-pointer"
          />
        </div>
      );
    }

    let textToShow = displayValue || '-';
    
    // For member columns, show label instead of UID
    if (MEMBER_COLUMNS.includes(headerKey)) {
      const foundMember = membersList.find(m => m.uid === displayValue);
      textToShow = foundMember ? foundMember.label : (displayValue || '-');
    }
    
    if (headerKey === 'remarks') {
      textToShow = item.remarks || '-';
    }

    return (
      <div
        className={isAllExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'}
        title={textToShow}
      >
        {textToShow}
      </div>
    );
  };


  return (
    <>
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        
        {/* --- Header Section --- */}
        <div className="px-6 pt-4 pb-3 flex flex-wrap justify-between items-center gap-y-2 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800">{t('admin.viewHandovers', 'View Handovers')}</h3>
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
              title={t('admin.editOptions', 'Edit Options')}
              className="text-sm py-1.5 px-3 rounded border bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {t('admin.editOptions', 'Edit Options')}
            </button>
            <button
              onClick={openAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 px-4 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              {t('admin.addHandover', '+ Add Handover')}
            </button>
          </div>
        </div>

        {/* --- Filter Bar --- */}
        <div className="px-6 py-3 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm font-medium text-gray-700">{t('tickets.filters')}</span>
          
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-category" className="text-sm text-gray-600">{t('handovers.categories')}</label>
            <select
              id="filter-category"
              value={filters.categories}
              onChange={(e) => handleFilterChange('categories', e.target.value)}
              className="text-sm py-1 px-2 rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{t('tickets.allCategories')}</option>
              {categoriesList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* --- UPDATED: PostedBy Filter (now a dropdown) --- */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-postedBy" className="text-sm text-gray-600">{t('handovers.postedBy')}</label>
             <select
              id="filter-postedBy"
              value={filters.postedBy}
              onChange={(e) => handleFilterChange('postedBy', e.target.value)}
              className="text-sm py-1 px-2 rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{t('tickets.allDevelopers', 'All Members')}</option>
              {membersList.map(m => (
                <option key={m.uid} value={m.uid}>{m.label}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-status" className="text-sm text-gray-600">{t('handovers.status')}</label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="text-sm py-1 px-2 rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{t('handovers.allStatuses', 'All Statuses')}</option>
              {statusOptions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          
          {(filters.categories || filters.postedBy || filters.status) && (
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:underline focus:outline-none"
            >
              {t('common.clearFilters')}
            </button>
          )}
        </div>

        {/* --- Tabs Section --- */}
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
                {activeHandovers.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('approved')}
              className={`
                whitespace-nowrap py-3 px-1 border-b-2
                font-medium text-sm transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded-t-sm
                ${activeTab === 'approved'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              {t('handovers.approved', 'Approved')}
              <span className={`
                rounded-full px-2 py-0.5 ml-2 text-xs font-medium
                ${activeTab === 'approved'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'}
              `}>
                {approvedHandovers.length}
              </span>
            </button>
          </nav>
        </div>
        
        {/* Error Banner */}
        {error && (
          <div className="text-center py-3 px-4 text-sm text-red-700 bg-red-100 border-b border-red-200">{error}</div>
        )}

        {/* --- Table Container --- */}
        <div className={`relative px-6 pb-6 ${isAllExpanded ? '' : 'overflow-x-auto'}`}>
          {isLoading && <Spinner />}
          
          {!isLoading && !error && filteredHandoversToDisplay.length === 0 && (
            <div className="text-center p-6">
              <p className="text-gray-500 italic mb-4">
                {handoversToDisplay.length > 0
                  ? t('tickets.noFilterMatch')
                  : activeTab === 'active'
                    ? t('admin.noHandovers')
                    : t('admin.noApprovedHandovers', 'No approved handovers found.')
                }
              </p>
            </div>
          )}

          {!isLoading && !error && filteredHandoversToDisplay.length > 0 && (
            <table
              className={`table-auto w-full border-collapse mt-4 ${isAllExpanded ? '' : 'min-w-[1200px]'}`}
              style={{ tableLayout: isAllExpanded ? 'auto' : 'fixed' }}
            >
              <thead className="bg-gray-50 sticky top-0 z-10 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  {mainHeaders.map((header) => {
                    // --- NEW: Sortable Header Logic ---
                    const isSortable = ['number', 'date'].includes(header.key);
                    const isActiveSort = sortConfig.key === header.key;
                    
                    return (
                      <th
                        key={header.key}
                        scope="col"
                        rowSpan={2}
                        onClick={isSortable ? () => handleSort(header.key) : undefined}
                        className={`p-3 text-left font-medium border-b border-r ${isSortable ? 'cursor-pointer hover:bg-gray-100 select-none group' : ''}`}
                        style={{ 
                          // --- MODIFICATION: Increased content width ---
                          width: isAllExpanded ? 'auto' : (header.key === 'content' ? '450px' : (header.key === 'number' ? '80px' : '120px')), 
                          whiteSpace: isAllExpanded ? 'normal' : 'nowrap'
                        }}
                      >
                        <div className="flex items-center gap-1">
                          {header.label}
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
                  {/* --- MODIFIED: Dynamic ColSpan for Checkers --- */}
                  <th
                    scope="col"
                    colSpan={checkerHeaders.length > 0 ? checkerHeaders.length : 1}
                    className="p-3 text-center font-medium border-b border-r"
                    style={{ whiteSpace: isAllExpanded ? 'normal' : 'nowrap' }}
                  >
                    {t('handovers.checker', 'Checker')}
                  </th>
                  <th scope="col" rowSpan={2} className="p-3 text-left font-medium border-b border-r" style={{ width: isAllExpanded ? 'auto' : '130px' }}>
                    {t('handovers.status', 'Status')}
                  </th>
                  <th scope="col" rowSpan={2} className="p-3 text-left font-medium border-b border-r" style={{ width: isAllExpanded ? 'auto' : '200px' }}>
                    {t('handovers.remarks', 'Remarks')}
                  </th>
                  <th scope="col" rowSpan={2} className="p-3 text-left font-medium border-b" style={{ width: isAllExpanded ? 'auto' : '80px' }}>
                    {t('handovers.actions', 'Actions')}
                  </th>
                </tr>
                <tr>
                  {/* --- MODIFIED: Dynamic Checker Headers --- */}
                  {checkerHeaders.map((header) => (
                    <th
                      key={header.key}
                      scope="col"
                      className="p-3 text-center font-medium border-r"
                      style={{ 
                        width: isAllExpanded ? 'auto' : '80px',
                        whiteSpace: isAllExpanded ? 'normal' : 'nowrap'
                      }}
                    >
                      {header.label}
                    </th>
                  ))}
                  {/* Handle case with zero checkers */}
                  {checkerHeaders.length === 0 && (
                      <th scope="col" className="p-3 text-center font-medium border-r" style={{ width: '80px' }}>-</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100 text-sm">
                {sortedHandovers.map((item, index) => { 
                  const allHeaders = [
                    ...mainHeaders,
                    ...checkerHeaders, 
                    { key: 'status' },
                    { key: 'remarks' },
                    { key: 'actions' }
                  ];

                  return (
                    <tr key={item.id} className="group hover:bg-gray-50 transition-colors duration-100">
                      {allHeaders.map(header => {
                        const cellKey = getCellKey(item.id, header.key);
                        const isEditingThisCell = editingCell?.docId === item.id && editingCell?.columnKey === header.key;
                        const isEditable = INLINE_EDITABLE_COLUMNS.includes(header.key);
                        
                        return (
                          <td
                            key={cellKey}
                            className={[
                              'relative p-2 border-r align-top',
                              // Cursors
                              !isEditingThisCell && isEditable ? 'cursor-text' : '',
                              // Widths
                              // --- MODIFICATION: Increased content width ---
                              !isAllExpanded && header.key === 'content' ? 'w-[450px]' : '',
                              !isAllExpanded && header.key === 'remarks' ? 'w-[200px]' : '',
                              !isAllExpanded && header.key === 'status' ? 'w-[130px]' : '',
                              !isAllExpanded && header.key === 'actions' ? 'w-[80px]' : '',
                              // --- MODIFIED: Dynamic checker width ---
                              !isAllExpanded && checkerKeys.includes(header.key) ? 'w-[80px]' : '',
                              !isAllExpanded && header.key === 'number' ? 'w-[80px]' : '', 
                              !isAllExpanded && !checkerKeys.includes(header.key) && !['number', 'content', 'remarks', 'status', 'actions'].includes(header.key) ? 'w-[120px]' : '',
                              // Padding reset for editing
                              isEditingThisCell ? 'p-0' : ''
                            ].filter(Boolean).join(' ')}
                            style={{
                              // --- MODIFICATION: Increased content width ---
                              maxWidth: !isAllExpanded ? 
                                (header.key === 'content' ? '450px' : 
                                (header.key === 'remarks' ? '200px' : 
                                (header.key === 'status' ? '130px' : 
                                // --- MODIFIED: Dynamic checker width ---
                                (checkerKeys.includes(header.key) ? '80px' : 
                                (header.key === 'actions' ? '80px' : 
                                (header.key === 'number' ? '80px' : '120px')))))) : undefined, 
                              height: (isEditingThisCell && TEXTAREA_COLUMNS.includes(header.key)) ? 'auto' : undefined,
                            }}
                            onDoubleClick={(e) => !isEditingThisCell && handleCellDoubleClick(e, item.id, header.key)}
                          >
                            {/* --- FIX: Pass index and total count --- */}
                            {renderCellContent(item, header.key, { index, total: filteredHandoversToDisplay.length })}

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
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* --- RENDER THE MODALS --- */}

      <AddEndorsementModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        teamId={teamId}
        onEndorsementAdded={handleHandoverAdded}
        t={t}
        // Pass dynamic categories to the Add modal
        categoriesList={categoriesList}
      />

      {isDetailsModalOpen && selectedHandover && (
        <HandoverPopup
          teamId={teamId}
          handoverId={selectedHandover.id}
          columnKey="details" // This is the field to edit
          onClose={closeDetailsModal}
        />
      )}
      
      {/* --- NEW: Options Editor Modal --- */}
      {isOptionsModalOpen && (
        <OptionsEditorModal
          isOpen={isOptionsModalOpen}
          onClose={() => setIsOptionsModalOpen(false)}
          teamId={teamId}
          t={t}
          // Pass current state lists
          categoriesList={categoriesList}
          membersList={membersList}
          priorityOptions={priorityOptions}
          statusOptions={statusOptions}
          checkerList={checkerList} 
          // Pass down persistence functions
          persistTeamArrayField={persistTeamArrayField}
          saveMemberLabel={saveMemberLabel}
          removeMember={removeMember}
          addMemberObject={addMemberObject}
          // Callbacks (no longer strictly needed with onSnapshot)
          onCategoriesChange={() => {}}
          onMembersChange={() => {}}
          onPrioritiesChange={() => {}}
          onStatusOptionsChange={() => {}}
          onCheckersChange={() => {}} 
        />
      )}

      {/* --- NEW: Invite Member Modal (Needed by OptionsEditorModal) --- */}
      {isInviteOpen && (
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

export default HandoversSection;


/* ==================================================================
  MODAL COMPONENTS (Copied from TeamProjectTable)
===================================================================*/

/* ------------------------------------------------------------------
  OptionsEditorModal
  - Manages editing Categories, Priorities, Statuses, Members, Checkers
-------------------------------------------------------------------*/
function OptionsEditorModal({
  isOpen,
  onClose,
  teamId,
  t, // Receive t function as a prop
  categoriesList,
  membersList, // Array of {uid, label}
  priorityOptions,
  statusOptions,
  checkerList, // <-- NEW: Array of {key, label}
  persistTeamArrayField, // (fieldName, array) => Promise<void>
  saveMemberLabel,       // (uid, newLabel) => Promise<void>
  removeMember,          // (uid) => Promise<void>
  addMemberObject,       // (uid, label) => Promise<void>
}) {
  const [tab, setTab] = useState('categories'); // 'categories' | 'priorities' | 'statuses' | 'members' | 'checkers'
  const [items, setItems] = useState([]);        // Current list being edited (strings or member/checker objects)
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
      case 'priorities': currentItems = priorityOptions; break;
      case 'statuses': currentItems = statusOptions; break;
      case 'members': currentItems = membersList.map(m => ({ uid: m.uid, label: m.label })); break; // Use a copy
      case 'checkers': currentItems = checkerList.map(c => ({ key: c.key, label: c.label })); break; // <-- NEW
      default: currentItems = [];
    }
    setItems(currentItems || []); // Ensure items is always an array
    setEditingIndex(null);
    setEditingValueLocal('');
    setNewValue('');
    setModalError('');
  }, [tab, categoriesList, priorityOptions, statusOptions, membersList, checkerList, isOpen]); 

  if (!isOpen) return null;

  // --- Persistence Wrappers ---
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
    const currentItems = items || []; 

    if (tab === 'members') {
      let uid = v, label = v;
      if (v.includes('|')) {
        const parts = v.split('|');
        uid = parts[0].trim();
        label = parts.slice(1).join('|').trim() || uid;
      }
      if (!uid) {
        setModalError(t('admin.uidRequiredError', 'Please provide a UID (or uid|label).'));
        return;
      }
      if (currentItems.some(item => item.uid === uid)) {
        setModalError(t('admin.memberExistsError', "A member with this UID already exists."));
        return;
      }
      await handleAddMemberObject(uid, label);
      return;
    }

    // --- NEW: Add Checker ---
    if (tab === 'checkers') {
      let key, label;
      if (v.includes('|')) {
        const parts = v.split('|');
        key = parts[0].trim();
        label = parts.slice(1).join('|').trim() || key;
      } else {
        setModalError(t('admin.checkerFormatError', 'Format must be "key|Label". Example: "checkerOps|Operations"'));
        return;
      }
      
      if (!key) {
        setModalError(t('admin.checkerKeyRequired', 'A "key" is required. Format: "key|Label"'));
        return;
      }
      if (/\s/.test(key) || !/^[a-zA-Z0-9_.-]+$/.test(key)) {
         setModalError(t('admin.checkerKeyInvalid', 'Key must be one word (no spaces, letters/numbers/_,.- only).'));
         return;
      }
      
      if (currentItems.some(item => item.key === key)) {
        setModalError(t('admin.checkerKeyExists', 'A checker with this key already exists.'));
        return;
      }
      
      const newItem = { key, label };
      const next = [...currentItems, newItem];
      
      setItems(next); // Optimistic update
      setNewValue(''); // Clear input
      await handlePersistArray('checkers', next); // Persist
      return; // Stop execution
    }

    // For string-based lists
    if (currentItems.includes(v)) {
      setModalError(t('admin.itemExistsError', "This item already exists."));
      return;
    }

    let next = [...currentItems, v];
    let fieldName = '';
    if (tab === 'statuses') {
      const completeStatus = next.pop(); // Remove last
      next.push(v); // Add new
      if (completeStatus !== undefined) next.push(completeStatus); // Add last back
      fieldName = 'statusOptions';
    } else {
      if (tab === 'priorities') fieldName = 'priorities';
      else if (tab === 'categories') fieldName = 'categories';
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
    // Handle object or string
    if (typeof itemToEdit === 'object' && itemToEdit !== null) {
      setEditingValueLocal(itemToEdit.label); // Works for both members and checkers
    } else {
      setEditingValueLocal(itemToEdit); // For string lists
    }
  };

  const saveEdit = async () => {
    const v = (editingValueLocal || '').trim();
    if (!v || editingIndex === null) return;
    setModalError('');
    const currentItems = items || []; 

    const itemToEdit = currentItems[editingIndex];

    // --- Member Edit ---
    if (typeof itemToEdit === 'object' && itemToEdit !== null && 'uid' in itemToEdit) {
      const uid = itemToEdit.uid;
      if (!v) {
        setModalError(t('admin.memberLabelEmptyError', "Member label cannot be empty."));
        return;
      }
      await handleSaveMemberLabel(uid, v);
      return;
    }

    // --- NEW: Checker Edit ---
    if (typeof itemToEdit === 'object' && itemToEdit !== null && 'key' in itemToEdit) {
      const key = itemToEdit.key;
      if (!v) {
        setModalError(t('admin.checkerLabelEmpty', "Checker label cannot be empty."));
        return;
      }
      
      const next = currentItems.map((it, i) => (i === editingIndex ? { key: key, label: v } : it));
      
      setItems(next); // Optimistic update
      setEditingIndex(null); 
      setEditingValueLocal('');
      await handlePersistArray('checkers', next);
      return; // Stop execution
    }

    // For string-based lists
    const duplicateIndex = currentItems.findIndex(item => item === v);
    if (duplicateIndex !== -1 && duplicateIndex !== editingIndex) {
      setModalError(t('admin.itemExistsError', "This item already exists."));
      return;
    }

    const next = currentItems.map((it, i) => (i === editingIndex ? v : it));
    let fieldName = '';
    if (tab === 'statuses') fieldName = 'statusOptions';
    else if (tab === 'priorities') fieldName = 'priorities';
    else if (tab === 'categories') fieldName = 'categories';
    else {
      setModalError(t('admin.invalidTabError', `Cannot determine field name for tab: ${tab}`));
      return;
    }

    setItems(next); // Optimistic update
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
    const currentItems = items || []; 
    const itemToRemove = currentItems[idx];

    // --- Member Remove ---
    if (typeof itemToRemove === 'object' && itemToRemove !== null && 'uid' in itemToRemove) {
      const uid = itemToRemove.uid;
      await handleRemoveMember(uid);
      return;
    }

    // --- NEW: Checker Remove ---
    if (typeof itemToRemove === 'object' && itemToRemove !== null && 'key' in itemToRemove) {
      if (!window.confirm(t('common.confirmDelete'))) return;
      
      const next = currentItems.filter((_, i) => i !== idx);
      setItems(next); // Optimistic update
      await handlePersistArray('checkers', next);
      return; // Stop execution
    }

    // For string-based lists
    if (tab === 'statuses' && idx === currentItems.length - 1) {
      if (!window.confirm(t('admin.confirmDeleteFinalStatus', 'Are you sure you want to remove the final status? This is usually the "Complete" or "Approved" status.'))) {
        return;
      }
    } else if (!window.confirm(t('common.confirmDelete'))) { 
      return;
    }

    const next = currentItems.filter((_, i) => i !== idx);
    let fieldName = '';
    if (tab === 'statuses') fieldName = 'statusOptions';
    else if (tab === 'priorities') fieldName = 'priorities';
    else if (tab === 'categories') fieldName = 'categories';
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

    // --- NEW: Checker List Item ---
    if (typeof it === 'object' && it !== null && 'key' in it) {
      return (
        <li key={it.key} className="flex items-center justify-between gap-2 bg-gray-50 p-2 rounded text-sm">
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
            <div className="text-xs text-gray-500 truncate" title={it.key}>{t('admin.keyLabel', 'Key')}: {it.key}</div>
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
    switch(tabKey) {
      case 'categories': return t('admin.categories');
      case 'priorities': return t('admin.priorities');
      case 'statuses': return t('admin.statuses');
      case 'members': return t('handovers.postedBy');
      case 'checkers': return t('admin.checkers', 'Checkers'); 
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
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'categories' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('categories')}>{t('admin.categories')} (Endorsement)</button>
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'statuses' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('statuses')}>{t('admin.statuses')} (Endorsement)</button>
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'checkers' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('checkers')}>{t('admin.checkers', 'Checkers')}</button> 
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'priorities' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('priorities')}>{t('admin.priorities')}</button>
              <button className={`text-left text-sm px-3 py-1.5 rounded ${tab === 'members' ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-200'}`} onClick={() => setTab('members')}>{t('handovers.postedBy')}</button>
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
                {/* --- NEW: Dynamic Placeholder --- */}
                <input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={
                    tab === 'members' ? t('admin.memberPlaceholder', 'uid|label (or uid)') :
                    tab === 'checkers' ? t('admin.checkerPlaceholder', 'key|Label') :
                    t('admin.newOptionValue', 'New value')
                  }
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
              {(items || []).length === 0 && <li key="empty-state" className="text-sm text-gray-500 px-1 py-4 text-center">{t('admin.noItems', 'No items defined for')} {tab}.</li>}
              
              {(items || []).map((it, idx) => renderListItem(it, idx))}
              
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
-------------------------------------------------------------------*/
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
              {isInviting ? t('admin.inviting', 'Sending...') : t('admin.sendInvite', 'Send Invite')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}