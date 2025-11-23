// src/components/FAQSection.jsx
import React, { useState, useEffect, useRef, useContext } from 'react';
import { db, storage } from '../firebaseConfig';
import {
  collection, query, orderBy, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, onSnapshot, arrayUnion, arrayRemove, setDoc
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { LanguageContext } from '../contexts/LanguageContext';

// --- Icons ---
const SearchIcon = () => <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const PlusIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
const TrashIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const EditIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;
const XIcon = () => <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
const CheckIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;
const CalendarIcon = () => <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
const ChevronLeft = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>;
const ChevronRight = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;

const Spinner = () => <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>;

// --- RICH TEXT EDITOR COMPONENT (Unchanged) ---
const RichTextEditor = ({ value, onChange, placeholder, className, teamId, minHeight = "40px" }) => {
  const contentEditableRef = useRef(null);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (contentEditableRef.current && contentEditableRef.current.innerHTML !== value) {
       if (!isProcessingRef.current) {
          contentEditableRef.current.innerHTML = value || '';
       }
    }
  }, [value]);

  const handleInput = (e) => {
    isProcessingRef.current = true;
    onChange(e.currentTarget.innerHTML);
    isProcessingRef.current = false;
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.includes('image')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const tempId = `upload-${Date.now()}`;
        const span = document.createElement('span');
        span.id = tempId;
        span.innerText = ' [Uploading Image...] ';
        span.style.color = '#2563eb';
        span.style.fontSize = '0.8em';
        range.insertNode(span);

        try {
           const path = `faq_inline/${teamId}/${Date.now()}_${file.name}`;
           const storageRef = ref(storage, path);
           await uploadBytesResumable(storageRef, file);
           const url = await getDownloadURL(storageRef);
           const placeholderEl = document.getElementById(tempId);
           if (placeholderEl) {
             const img = document.createElement('img');
             img.src = url;
             img.className = "max-w-full h-auto rounded my-2 border border-gray-200 shadow-sm"; 
             placeholderEl.parentNode.replaceChild(img, placeholderEl);
             onChange(contentEditableRef.current.innerHTML);
           }
        } catch (err) {
           console.error("Inline upload failed", err);
           const placeholderEl = document.getElementById(tempId);
           if (placeholderEl) placeholderEl.innerText = ' [Image Upload Failed] ';
        }
      }
    }
  };

  return (
    <div
      ref={contentEditableRef}
      className={`bg-white overflow-y-auto focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
      style={{ minHeight }}
      contentEditable
      onInput={handleInput}
      onPaste={handlePaste}
      suppressContentEditableWarning={true}
      data-placeholder={placeholder}
    />
  );
};

// --- CUSTOM DATE RANGE PICKER ---
const DateRangePicker = ({ startDate, endDate, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const containerRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const handleDateClick = (day) => {
    const clickedDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const dateStr = clickedDate.toISOString().split('T')[0];

    if (!startDate || (startDate && endDate)) {
      // Start new selection
      onChange(dateStr, null);
    } else {
      // Complete selection
      if (clickedDate < new Date(startDate)) {
        onChange(dateStr, startDate);
      } else {
        onChange(startDate, dateStr);
      }
      setIsOpen(false);
    }
  };

  const renderCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const blanks = Array(firstDay).fill(null);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
      <div className="p-4 w-64">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => setViewDate(new Date(year, month - 1))} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft /></button>
          <span className="font-bold text-gray-700">{viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
          <button onClick={() => setViewDate(new Date(year, month + 1))} className="p-1 hover:bg-gray-100 rounded"><ChevronRight /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2 text-gray-500">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {blanks.map((_, i) => <div key={`blank-${i}`} />)}
          {days.map(day => {
            const currentStr = new Date(year, month, day).toISOString().split('T')[0];
            const isSelected = currentStr === startDate || currentStr === endDate;
            const isInRange = startDate && endDate && currentStr > startDate && currentStr < endDate;
            
            let cellClass = "h-8 w-8 flex items-center justify-center rounded cursor-pointer text-sm hover:bg-gray-100";
            if (isSelected) cellClass = "h-8 w-8 flex items-center justify-center rounded bg-blue-600 text-white shadow-md";
            else if (isInRange) cellClass = "h-8 w-8 flex items-center justify-center bg-blue-50 text-blue-700";

            return (
              <div key={day} onClick={() => handleDateClick(day)} className={cellClass}>
                {day}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-between pt-2 border-t">
            <button onClick={() => onChange(null, null)} className="text-xs text-red-500 hover:underline">Clear</button>
            <button onClick={() => setIsOpen(false)} className="text-xs text-blue-500 hover:underline">Close</button>
        </div>
      </div>
    );
  };

  const displayValue = startDate 
    ? `${startDate} ${endDate ? `~ ${endDate}` : ''}`
    : 'Select Date Range';

  return (
    <div className="relative" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="border border-gray-300 rounded p-2 text-sm bg-white flex items-center justify-between cursor-pointer min-w-[200px] hover:border-blue-400"
      >
        <span className={!startDate ? 'text-gray-400' : 'text-gray-700'}>{displayValue}</span>
        <CalendarIcon />
      </div>
      
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 z-50 animate-fade-in-down">
          {renderCalendar()}
        </div>
      )}
    </div>
  );
};


const FAQSection = ({ teamId, isAdmin }) => {
  const { t } = useContext(LanguageContext);
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterOptionsOpen, setFilterOptionsOpen] = useState(false);

  // --- Filter State ---
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    type: '',
    startDate: null, // CHANGED from simple 'date'
    endDate: null    // ADDED endDate
  });

  // --- Dynamic Options ---
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);

  useEffect(() => {
    if (!teamId) return;
    
    const teamDocRef = doc(db, 'teams', teamId);
    const unsubOptions = onSnapshot(teamDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCategories(data.faqCategories || []); 
        setTypes(data.faqTypes || []);
      }
    });

    const faqCollection = collection(db, 'teams', teamId, 'faqs');
    const q = query(faqCollection, orderBy('updatedAt', 'desc'));
    const unsubFaqs = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setFaqs(data);
      setLoading(false);
    });

    return () => { unsubOptions(); unsubFaqs(); };
  }, [teamId]);

  const handleAddOption = async (field, value) => {
    if (!value?.trim()) return;
    const teamRef = doc(db, 'teams', teamId);
    try {
      await updateDoc(teamRef, { [field]: arrayUnion(value.trim()) });
    } catch (e) {
      await setDoc(teamRef, { [field]: [value.trim()] }, { merge: true });
    }
  };

  const handleDeleteOption = async (field, value) => {
    if (!confirm(t('faq.confirmDeleteOption', `Delete option "${value}"?`))) return;
    const teamRef = doc(db, 'teams', teamId);
    try { await updateDoc(teamRef, { [field]: arrayRemove(value) }); } catch(e){}
  };

  const filteredFaqs = faqs.filter(item => {
    const div = document.createElement("div");
    div.innerHTML = item.question + " " + item.answer;
    const textContent = div.textContent || div.innerText || "";
    const searchLower = filters.search.toLowerCase();

    const matchesSearch = !filters.search || 
      textContent.toLowerCase().includes(searchLower) ||
      (item.keywords && item.keywords.some(k => k.toLowerCase().includes(searchLower)));

    const matchesCategory = !filters.category || item.category === filters.category;
    const matchesType = !filters.type || item.type === filters.type;
    
    // --- UPDATED DATE LOGIC ---
    let matchesDate = true;
    if (filters.startDate) {
      const itemDate = item.updatedAt?.toDate ? item.updatedAt.toDate().toISOString().split('T')[0] : '';
      if (filters.endDate) {
        // Range Check
        matchesDate = itemDate >= filters.startDate && itemDate <= filters.endDate;
      } else {
        // Single Day Check (Exact Match)
        matchesDate = itemDate === filters.startDate;
      }
    }
    
    return matchesSearch && matchesCategory && matchesType && matchesDate;
  });

  const [editItem, setEditItem] = useState(null);
  const openAddModal = () => { setEditItem(null); setModalOpen(true); };
  const openEditModal = (item) => { setEditItem(item); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditItem(null); };

  const handleDelete = async (id, images) => {
    if (!window.confirm(t('faq.confirmDelete', 'Delete this FAQ?'))) return;
    try {
      if (images && images.length > 0) {
        for (const img of images) {
          const imgRef = ref(storage, img.path);
          await deleteObject(imgRef).catch(e => console.log('img delete err', e));
        }
      }
      await deleteDoc(doc(db, 'teams', teamId, 'faqs', id));
    } catch (err) { console.error(err); alert('Failed to delete'); }
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 flex flex-col h-full">
      {/* Header & Filters */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-800">{t('faq.title', 'Frequently Asked Sheet')}</h2>
          <div className="flex gap-2 mr-12">
             {isAdmin && (
               <button onClick={() => setFilterOptionsOpen(true)} className="text-xs bg-white border border-gray-300 hover:bg-gray-100 px-3 py-2 rounded text-gray-600">
                 {t('faq.manageFilters', 'Manage Filters')}
               </button>
             )}
             <button onClick={openAddModal} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded shadow flex items-center gap-2">
               <PlusIcon /> {t('faq.addNew', 'Add New')}
             </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><SearchIcon /></div>
            <input type="text" placeholder={t('faq.searchPlaceholder', 'Search...')} className="pl-10 w-full border border-gray-300 rounded p-2 text-sm" value={filters.search} onChange={(e) => setFilters({...filters, search: e.target.value})} />
          </div>
          <select className="border border-gray-300 rounded p-2 text-sm" value={filters.category} onChange={(e) => setFilters({...filters, category: e.target.value})}>
            <option value="">{t('faq.allCategories', 'All Categories')}</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="border border-gray-300 rounded p-2 text-sm" value={filters.type} onChange={(e) => setFilters({...filters, type: e.target.value})}>
            <option value="">{t('faq.allTypes', 'All Types')}</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          
          {/* --- CUSTOM DATE RANGE PICKER --- */}
          <DateRangePicker 
            startDate={filters.startDate}
            endDate={filters.endDate}
            onChange={(start, end) => setFilters(prev => ({ ...prev, startDate: start, endDate: end }))}
          />

        </div>
      </div>

      {/* Content List */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {loading ? <div className="flex justify-center py-10"><Spinner /></div> : (
          <div className="space-y-4">
            {filteredFaqs.length === 0 && <p className="text-center text-gray-500 italic py-10">{t('faq.noEntries', 'No entries found.')}</p>}
            {filteredFaqs.map(item => (
              <div key={item.id} className="bg-white p-4 rounded shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex gap-2 mb-2 text-xs">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full border border-blue-200">{item.category}</span>
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full border border-purple-200">{item.type}</span>
                      <span className="text-gray-400 ml-2">{item.updatedAt?.toDate().toLocaleDateString()}</span>
                    </div>
                    <h3 className="font-bold text-gray-800 mb-2" dangerouslySetInnerHTML={{ __html: item.question }} />
                    <div className="text-sm text-gray-600 mb-3 prose max-w-none" dangerouslySetInnerHTML={{ __html: item.answer }} />
                    {item.keywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {item.keywords.map((k, i) => (
                          <span key={i} className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">#{k}</span>
                        ))}
                      </div>
                    )}
                    {item.images?.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2 border-t pt-2 mt-2">
                         <span className="text-xs text-gray-400 mr-2 my-auto">Attachments:</span>
                        {item.images.map((img, idx) => (
                          <a key={idx} href={img.url} target="_blank" rel="noreferrer" className="block shrink-0 border rounded overflow-hidden w-16 h-16 hover:opacity-80">
                            <img src={img.url} alt="att" className="w-full h-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex flex-col gap-2 ml-4 border-l pl-3">
                      <button onClick={() => openEditModal(item)} className="text-gray-400 hover:text-blue-600 p-1"><EditIcon /></button>
                      <button onClick={() => handleDelete(item.id, item.images)} className="text-gray-400 hover:text-red-600 p-1"><TrashIcon /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && <AddEditFAQModal isOpen={modalOpen} onClose={closeModal} teamId={teamId} editItem={editItem} categories={categories} types={types} onAddOption={handleAddOption} />}
      {filterOptionsOpen && <ManageOptionsModal isOpen={filterOptionsOpen} onClose={() => setFilterOptionsOpen(false)} onAdd={handleAddOption} onDelete={handleDeleteOption} categories={categories} types={types} />}
    </div>
  );
};

const AddEditFAQModal = ({ isOpen, onClose, teamId, editItem, categories, types, onAddOption }) => {
  const { t } = useContext(LanguageContext);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [existingImages, setExistingImages] = useState([]);
  const [newImages, setNewImages] = useState([]); 
  const [isSaving, setIsSaving] = useState(false);
  const [addingField, setAddingField] = useState(null);
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    if (editItem) {
      setQuestion(editItem.question); 
      setAnswer(editItem.answer);     
      setCategory(editItem.category || (categories[0] || ''));
      setType(editItem.type || (types[0] || ''));
      setKeywordInput(editItem.keywords ? editItem.keywords.join(' ') : '');
      setExistingImages(editItem.images || []);
    } else {
      setCategory(categories[0] || '');
      setType(types[0] || '');
    }
  }, [editItem, categories, types]);

  const startAdding = (field) => { setAddingField(field); setNewValue(''); };
  const cancelAdding = () => { setAddingField(null); setNewValue(''); };
  const saveNewOption = async () => {
    if (!newValue.trim()) return;
    await onAddOption(addingField, newValue);
    if (addingField === 'faqCategories') setCategory(newValue.trim());
    if (addingField === 'faqTypes') setType(newValue.trim());
    setAddingField(null); setNewValue('');
  };
  const handleKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); saveNewOption(); } else if (e.key === 'Escape') cancelAdding(); };
  const handleFileChange = (e) => { if (e.target.files) setNewImages(prev => [...prev, ...Array.from(e.target.files)]); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    if (!category || !type) { alert(t('faq.missingCategoryType', 'Select Category and Type')); setIsSaving(false); return; }
    const keywords = keywordInput.split(' ').map(k => k.replace('#', '').trim()).filter(k => k);
    try {
      let uploadedImages = [];
      for (const file of newImages) {
        const path = `faq_attachments/${teamId}/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, path);
        const uploadTask = await uploadBytesResumable(storageRef, file);
        const url = await getDownloadURL(uploadTask.ref);
        uploadedImages.push({ name: file.name, url, path });
      }
      const payload = {
        question, answer, category, type, keywords,
        images: [...existingImages, ...uploadedImages], 
        updatedAt: serverTimestamp()
      };
      if (editItem) await updateDoc(doc(db, 'teams', teamId, 'faqs', editItem.id), payload);
      else await addDoc(collection(db, 'teams', teamId, 'faqs'), payload);
      onClose();
    } catch (err) { console.error(err); alert("Error saving"); } finally { setIsSaving(false); }
  };

  const removeExistingImage = async (idx) => {
    if (!confirm(t('faq.removeImage', 'Remove?'))) return;
    const img = existingImages[idx];
    try { await deleteObject(ref(storage, img.path)); } catch(e){ console.error(e); }
    setExistingImages(prev => prev.filter((_, i) => i !== idx));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black bg-opacity-50" onClick={onClose}>
      <div className="bg-white rounded shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-gray-200" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-lg">{editItem ? t('faq.editFaq', 'Edit FAQ') : t('faq.newFaq', 'New FAQ')}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 font-bold text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">{t('faq.category', 'Category')}</label>
              {addingField === 'faqCategories' ? (
                <div className="flex items-center gap-2"><input autoFocus className="flex-1 border border-blue-500 rounded p-2 text-sm" value={newValue} onChange={(e) => setNewValue(e.target.value)} onKeyDown={handleKeyDown}/><button type="button" onClick={saveNewOption} className="text-green-600 bg-green-50 p-2 rounded"><CheckIcon /></button><button type="button" onClick={cancelAdding} className="text-red-600 bg-red-50 p-2 rounded"><XIcon /></button></div>
              ) : (
                <div className="flex gap-2">
                    <select value={category} onChange={e => setCategory(e.target.value)} className="w-full border rounded p-2" required>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button type="button" onClick={() => startAdding('faqCategories')} className="px-3 bg-gray-100 border rounded hover:bg-gray-200 font-bold text-blue-600">+</button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">{t('faq.type', 'Type')}</label>
              {addingField === 'faqTypes' ? (
                <div className="flex items-center gap-2"><input autoFocus className="flex-1 border border-blue-500 rounded p-2 text-sm" value={newValue} onChange={(e) => setNewValue(e.target.value)} onKeyDown={handleKeyDown}/><button type="button" onClick={saveNewOption} className="text-green-600 bg-green-50 p-2 rounded"><CheckIcon /></button><button type="button" onClick={cancelAdding} className="text-red-600 bg-red-50 p-2 rounded"><XIcon /></button></div>
              ) : (
                <div className="flex gap-2">
                    <select value={type} onChange={e => setType(e.target.value)} className="w-full border rounded p-2" required>
                        {types.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button type="button" onClick={() => startAdding('faqTypes')} className="px-3 bg-gray-100 border rounded hover:bg-gray-200 font-bold text-blue-600">+</button>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">{t('faq.question', 'Question')} <span className="text-xs font-normal text-gray-400 ml-1">(Paste image supported)</span></label>
            <RichTextEditor teamId={teamId} value={question} onChange={setQuestion} className="border rounded p-3" minHeight="100px" placeholder="Type question here..." />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">{t('faq.answer', 'Answer')} <span className="text-xs font-normal text-gray-400 ml-1">(Paste image supported)</span></label>
            <RichTextEditor teamId={teamId} value={answer} onChange={setAnswer} className="border rounded p-3" minHeight="300px" placeholder="Type detailed answer here..." />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">{t('faq.keywords', 'Keywords')}</label>
            <input type="text" placeholder="#tag1 #tag2" className="w-full border rounded p-2" value={keywordInput} onChange={e => setKeywordInput(e.target.value)} />
          </div>
          <div className="bg-gray-50 p-3 rounded border border-gray-200">
            <label className="block text-sm font-bold text-gray-700 mb-2">{t('faq.photos', 'Attachments')} (General Files)</label>
            <input type="file" multiple accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-2"/>
            <div className="flex gap-2 flex-wrap">
              {existingImages.map((img, idx) => (
                <div key={`ex-${idx}`} className="relative w-16 h-16 border rounded group bg-white">
                  <img src={img.url} className="w-full h-full object-cover rounded" alt="prev" />
                  <button type="button" onClick={() => removeExistingImage(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">&times;</button>
                </div>
              ))}
              {newImages.map((file, idx) => (
                <div key={`new-${idx}`} className="relative w-16 h-16 border border-blue-400 rounded bg-white">
                  <img src={URL.createObjectURL(file)} className="w-full h-full object-cover rounded" alt="prev" />
                  <button type="button" onClick={() => setNewImages(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">&times;</button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 mr-2">{t('faq.cancel', 'Cancel')}</button>
            <button type="submit" disabled={isSaving} className="px-6 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 disabled:opacity-50">{isSaving ? t('faq.saving', 'Saving...') : t('faq.save', 'Save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ManageOptionsModal = ({ isOpen, onClose, onAdd, onDelete, categories, types }) => {
  const { t } = useContext(LanguageContext);
  const [newCat, setNewCat] = useState('');
  const [newType, setNewType] = useState('');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black bg-opacity-50" onClick={onClose}>
      <div className="bg-white rounded shadow-lg w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4">Manage Options</h3>
        <div className="mb-4">
            <div className="flex gap-2 mb-2"><input value={newCat} onChange={e => setNewCat(e.target.value)} className="border rounded p-1 flex-1" placeholder="New Category" /><button onClick={() => { onAdd('faqCategories', newCat); setNewCat(''); }} className="bg-green-600 text-white px-3 rounded">Add</button></div>
            <div className="flex flex-wrap gap-1">{categories.map(c => <span key={c} className="bg-gray-100 text-xs px-2 py-1 rounded flex items-center gap-1">{c}<button onClick={() => onDelete('faqCategories', c)} className="text-red-500 font-bold ml-1">&times;</button></span>)}</div>
        </div>
        <div className="mb-4">
            <div className="flex gap-2 mb-2"><input value={newType} onChange={e => setNewType(e.target.value)} className="border rounded p-1 flex-1" placeholder="New Type" /><button onClick={() => { onAdd('faqTypes', newType); setNewType(''); }} className="bg-green-600 text-white px-3 rounded">Add</button></div>
            <div className="flex flex-wrap gap-1">{types.map(t => <span key={t} className="bg-gray-100 text-xs px-2 py-1 rounded flex items-center gap-1">{t}<button onClick={() => onDelete('faqTypes', t)} className="text-red-500 font-bold ml-1">&times;</button></span>)}</div>
        </div>
        <div className="text-right"><button onClick={onClose} className="text-blue-600 font-bold">Done</button></div>
      </div>
    </div>
  );
};

export default FAQSection;