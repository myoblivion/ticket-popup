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
  
  // --- React Router Hooks ---
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

  // --- Inline Editing State ---
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingOriginalValue, setEditingOriginalValue] = useState('');
  const debounceRef = useRef(null);
  const inputRef = useRef(null); 
  const selectRef = useRef(null); 

  // --- Saving Indicator State ---
  const [savingStatus, setSavingStatus] = useState({});
  const savingTimersRef = useRef({});

  // --- NEW: Pagination State ---
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // --- Load team members / options from Firestore ---
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

        // --- Load Handover Checkers ---
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

  // --- Popup logic ---
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

  // --- Sorting Logic ---
  const sortedHandovers = useMemo(() => {
    let data = [...filteredHandoversToDisplay];
    
    if (!sortConfig.key) return data;

    return data.sort((a, b) => {
      let valA, valB;

      if (sortConfig.key === 'number') {
        valA = Number(a.number) || 0;
        valB = Number(b.number) || 0;
      } else if (sortConfig.key === 'date') {
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

  // --- Reset Page on Filter/Sort/Tab Change ---
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, activeTab, sortConfig]);

  // --- NEW: Pagination Logic ---
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentHandovers = sortedHandovers.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(sortedHandovers.length / itemsPerPage);

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

  // --- NEW: Edit button handler that starts inline edit on the 'content' column ---
  const handleEditClick = (item) => {
    // Start editing the content column for this row
    const currentValue = item.content ?? '';
    startEditingCell(item.id, 'content', String(currentValue));
  };

  // --- Inline Editing Functions (from TeamProjectTable) ---
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

  // --- Editing Event Handlers ---
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

  // --- Filter/Modal Handlers ---
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

  const openDetailsModal = (item) => {
    const modalUrl = `/team/${teamId}/handover/${item.id}`; 
    const modalTitle = `Handover ${item.id} - details`;

    navigate(modalUrl); 
    document.title = modalTitle;

    setSelectedHandover(item);
    setIsDetailsModalOpen(true);
  };

  const closeDetailsModal = () => {
    setIsDetailsModalOpen(false);
    setSelectedHandover(null);
    document.title = baseTitleRef.current;
  
    navigate(`/team/${teamId}`, { replace: true }); 
  };
  
  // --- Persistence functions for OptionsEditorModal ---
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

  // --- Headers ---
  const mainHeaders = useMemo(() => [
    { key: 'number', label: t('handovers.id', 'No.') }, 
    { key: 'date', label: t('handovers.date', 'Date') },
    { key: 'categories', label: t('handovers.categories', 'Categories') },
    { key: 'content', label: t('handovers.content', 'Handover Contents') },
    { key: 'details', label: t('handovers.details', 'Details') },
    { key: 'postedBy', label: t('handovers.postedBy', 'Posted by') },
  ], [t]);

  // --- Checker headers ---
  const checkerHeaders = useMemo(() => {
    if (!checkerList || checkerList.length === 0) {
      return [];
    }
    return checkerList.map(checker => ({
      key: checker.key,
      label: checker.label 
    }));
  }, [checkerList]); 

  const checkerKeys = useMemo(() => checkerList.map(c => c.key), [checkerList]);


  // --- Cell Renderer ---
  const renderCellContent = (item, headerKey, meta = {}) => {
    const isEditingThisCell = editingCell?.docId === item.id && editingCell?.columnKey === headerKey;
    const rawValue = item[headerKey];
    const displayValue = rawValue !== undefined && rawValue !== null ? String(rawValue) : '';

    // --- 1. EDITING UI ---
    if (isEditingThisCell) {
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
            {isMemberSelect && editingOriginalValue && !membersList.some(m => m.uid === editingOriginalValue) && (
              <option value={editingOriginalValue} disabled>{editingOriginalValue} (removed)</option>
            )}
            {!isMemberSelect && editingOriginalValue && !options.includes(editingOriginalValue) && (
              <option value={editingOriginalValue} disabled>{editingOriginalValue} (removed)</option>
            )}
          </select>
        );
      }

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
          <div className="text-center flex items-center gap-3">
            <button
              onClick={() => handleEditClick(item)}
              className="text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium"
              aria-label={t('common.edit', 'Edit')}
              type="button"
            >
              {t('common.edit', 'Edit')}
            </button>
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
            <>
            <table
              className={`table-auto w-full border-collapse mt-4 ${isAllExpanded ? '' : 'min-w-[1200px]'}`}
              style={{ tableLayout: isAllExpanded ? 'auto' : 'fixed' }}
            >
              <thead className="bg-gray-50 sticky top-0 z-10 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  {mainHeaders.map((header) => {
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
                                : '▲▼' 
                              }
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
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
                  {checkerHeaders.length === 0 && (
                      <th scope="col" className="p-3 text-center font-medium border-r" style={{ width: '80px' }}>-</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100 text-sm">
                {currentHandovers.map((item, index) => { 
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
                              !isEditingThisCell && isEditable ? 'cursor-text' : '',
                              !isAllExpanded && header.key === 'content' ? 'w-[450px]' : '',
                              !isAllExpanded && header.key === 'remarks' ? 'w-[200px]' : '',
                              !isAllExpanded && header.key === 'status' ? 'w-[130px]' : '',
                              !isAllExpanded && header.key === 'actions' ? 'w-[80px]' : '',
                              !isAllExpanded && checkerKeys.includes(header.key) ? 'w-[80px]' : '',
                              !isAllExpanded && header.key === 'number' ? 'w-[80px]' : '', 
                              !isAllExpanded && !checkerKeys.includes(header.key) && !['number', 'content', 'remarks', 'status', 'actions'].includes(header.key) ? 'w-[120px]' : '',
                              isEditingThisCell ? 'p-0' : ''
                            ].filter(Boolean).join(' ')}
                            style={{
                              maxWidth: !isAllExpanded ? 
                                (header.key === 'content' ? '450px' : 
                                (header.key === 'remarks' ? '200px' : 
                                (header.key === 'status' ? '130px' : 
                                (checkerKeys.includes(header.key) ? '80px' : 
                                (header.key === 'actions' ? '80px' : 
                                (header.key === 'number' ? '80px' : '120px')))))) : undefined, 
                              height: (isEditingThisCell && TEXTAREA_COLUMNS.includes(header.key)) ? 'auto' : undefined,
                            }}
                            onDoubleClick={(e) => !isEditingThisCell && handleCellDoubleClick(e, item.id, header.key)}
                          >
                            {/* Pass correct absolute index for the "Number" column to count down correctly */}
                            {renderCellContent(item, header.key, { index: indexOfFirstItem + index, total: filteredHandoversToDisplay.length })}

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

            {/* --- NEW: Pagination Footer --- */}
            <div className="flex items-center justify-between mt-4 border-t pt-4">
              {/* Items per page selector */}
              <div className="flex items-center gap-2">
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1); 
                  }}
                  className="border rounded p-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                  style={{ width: '60px' }}
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
            {/* --- END Pagination Footer --- */}
            </>
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
      
      {/* Options Editor Modal */}
      {isOptionsModalOpen && (
        <OptionsEditorModal
          isOpen={isOptionsModalOpen}
          onClose={() => setIsOptionsModalOpen(false)}
          teamId={teamId}
          t={t}
          categoriesList={categoriesList}
          membersList={membersList}
          priorityOptions={priorityOptions}
          statusOptions={statusOptions}
          checkerList={checkerList} 
          persistTeamArrayField={persistTeamArrayField}
          saveMemberLabel={saveMemberLabel}
          removeMember={removeMember}
          addMemberObject={addMemberObject}
        />
      )}

      {/* Invite Member Modal */}
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
