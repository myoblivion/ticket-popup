// src/components/FAQSection.jsx
import React, { useState, useEffect, useRef, useContext } from 'react';
import { db, storage, auth } from '../firebaseConfig';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, onSnapshot, arrayUnion, arrayRemove, setDoc
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

const Spinner = () => <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>;

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
    date: ''
  });

  // --- Dynamic Options State (Starts Empty) ---
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);

  // --- Load FAQs & Options ---
  useEffect(() => {
    if (!teamId) return;
    
    // 1. Load Options
    const teamDocRef = doc(db, 'teams', teamId);
    const unsubOptions = onSnapshot(teamDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.faqCategories) setCategories(data.faqCategories);
        else setCategories([]); 
        
        if (data.faqTypes) setTypes(data.faqTypes);
        else setTypes([]);
      }
    });

    // 2. Load FAQs
    const faqCollection = collection(db, 'teams', teamId, 'faqs');
    const q = query(faqCollection, orderBy('updatedAt', 'desc'));
    const unsubFaqs = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setFaqs(data);
      setLoading(false);
    });

    return () => { unsubOptions(); unsubFaqs(); };
  }, [teamId]);

  // --- Helper: Save New Option ---
  const handleAddOption = async (field, value) => {
    if (!value || !value.trim()) return;
    const teamRef = doc(db, 'teams', teamId);
    try {
      await updateDoc(teamRef, { [field]: arrayUnion(value.trim()) });
    } catch (e) {
      await setDoc(teamRef, { [field]: [value.trim()] }, { merge: true });
    }
  };

  // --- Helper: Delete Option ---
  const handleDeleteOption = async (field, value) => {
    // Updated to use unique key to avoid Korean translation
    if (!confirm(t('faq.confirmDeleteOption', `Delete option "${value}"?`))) return;
    const teamRef = doc(db, 'teams', teamId);
    try {
      await updateDoc(teamRef, { [field]: arrayRemove(value) });
    } catch (e) {
      console.error("Error removing option:", e);
    }
  };

  // --- Filtering Logic ---
  const filteredFaqs = faqs.filter(item => {
    const searchLower = filters.search.toLowerCase();
    const matchesSearch = !filters.search || 
      item.question.toLowerCase().includes(searchLower) ||
      item.answer.toLowerCase().includes(searchLower) ||
      (item.keywords && item.keywords.some(k => k.toLowerCase().includes(searchLower)));

    const matchesCategory = !filters.category || item.category === filters.category;
    const matchesType = !filters.type || item.type === filters.type;

    let matchesDate = true;
    if (filters.date) {
      const itemDate = item.updatedAt?.toDate ? item.updatedAt.toDate().toISOString().split('T')[0] : '';
      matchesDate = itemDate === filters.date;
    }

    return matchesSearch && matchesCategory && matchesType && matchesDate;
  });

  // --- CRUD Modals ---
  const [editItem, setEditItem] = useState(null);

  const openAddModal = () => { setEditItem(null); setModalOpen(true); };
  const openEditModal = (item) => { setEditItem(item); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditItem(null); };

  const handleDelete = async (id, images) => {
    if (!window.confirm(t('faq.confirmDelete', 'Are you sure you want to delete this?'))) return;
    try {
      if (images && images.length > 0) {
        for (const img of images) {
          const imgRef = ref(storage, img.path);
          await deleteObject(imgRef).catch(e => console.log('img delete err', e));
        }
      }
      await deleteDoc(doc(db, 'teams', teamId, 'faqs', id));
    } catch (err) {
      console.error(err);
      alert(t('faq.deleteError', 'Failed to delete.'));
    }
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 flex flex-col h-full">
      {/* Header / Filters */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-800">{t('faq.title', 'Frequently Asked Sheet')}</h2>
          <div className="flex gap-2 mr-12">
             {isAdmin && (
               <button onClick={() => setFilterOptionsOpen(true)} className="text-xs bg-white border border-gray-300 hover:bg-gray-100 px-3 py-2 rounded text-gray-600">
                 {t('faq.manageFilters', 'Manage Filters')}
               </button>
             )}
             {/* Changed key to faq.addNew to avoid 'common' translation collision */}
             <button onClick={openAddModal} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded shadow flex items-center gap-2">
               <PlusIcon /> {t('faq.addNew', 'Add New')}
             </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><SearchIcon /></div>
            <input 
              type="text" 
              placeholder={t('faq.searchPlaceholder', 'Search keywords (#tag)...')}
              className="pl-10 w-full border border-gray-300 rounded p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
            />
          </div>
          {/* Category Filter */}
          <select 
            className="border border-gray-300 rounded p-2 text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            value={filters.category}
            onChange={(e) => setFilters({...filters, category: e.target.value})}
          >
            <option value="">{t('faq.allCategories', 'All Categories')}</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {/* Type Filter */}
          <select 
            className="border border-gray-300 rounded p-2 text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            value={filters.type}
            onChange={(e) => setFilters({...filters, type: e.target.value})}
          >
            <option value="">{t('faq.allTypes', 'All Types')}</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {/* Date Filter */}
          <input 
            type="date" 
            className="border border-gray-300 rounded p-2 text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            value={filters.date}
            onChange={(e) => setFilters({...filters, date: e.target.value})}
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
                  <div className="flex-1">
                    {/* Tags */}
                    <div className="flex gap-2 mb-2 text-xs">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full border border-blue-200">{item.category}</span>
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full border border-purple-200">{item.type}</span>
                      <span className="text-gray-400 ml-2">{item.updatedAt?.toDate().toLocaleDateString()}</span>
                    </div>
                    {/* Content */}
                    <h3 className="font-bold text-gray-800 mb-2">{item.question}</h3>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap mb-3">{item.answer}</p>
                    
                    {/* Keywords */}
                    {item.keywords && item.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {item.keywords.map((k, i) => (
                          <span key={i} className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">#{k}</span>
                        ))}
                      </div>
                    )}

                    {/* Images */}
                    {item.images && item.images.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {item.images.map((img, idx) => (
                          <a key={idx} href={img.url} target="_blank" rel="noreferrer" className="block shrink-0 border rounded overflow-hidden w-20 h-20 hover:opacity-80">
                            <img src={img.url} alt="attachment" className="w-full h-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
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

      {/* --- MODALS --- */}
      {modalOpen && (
        <AddEditFAQModal 
          isOpen={modalOpen} 
          onClose={closeModal} 
          teamId={teamId} 
          editItem={editItem} 
          categories={categories} 
          types={types}
          onAddOption={handleAddOption}
        />
      )}

      {filterOptionsOpen && (
        <ManageOptionsModal 
          isOpen={filterOptionsOpen} 
          onClose={() => setFilterOptionsOpen(false)} 
          onAdd={handleAddOption}
          onDelete={handleDeleteOption}
          categories={categories}
          types={types}
        />
      )}
    </div>
  );
};

/* ===================================================================
   Sub-Component: Add/Edit Modal (INLINE EDITING)
   =================================================================== */
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

  // --- INLINE ADD STATE ---
  const [addingField, setAddingField] = useState(null); // 'faqCategories' or 'faqTypes'
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    if (editItem) {
      setQuestion(editItem.question);
      setAnswer(editItem.answer);
      setCategory(editItem.category || (categories.length > 0 ? categories[0] : ''));
      setType(editItem.type || (types.length > 0 ? types[0] : ''));
      setKeywordInput(editItem.keywords ? editItem.keywords.join(' ') : '');
      setExistingImages(editItem.images || []);
    } else {
      setCategory(categories.length > 0 ? categories[0] : '');
      setType(types.length > 0 ? types[0] : '');
    }
  }, [editItem, categories, types]);

  // --- Handlers for Inline Add ---
  const startAdding = (field) => {
    setAddingField(field);
    setNewValue('');
  };

  const cancelAdding = () => {
    setAddingField(null);
    setNewValue('');
  };

  const saveNewOption = async () => {
    if (!newValue.trim()) return;
    
    await onAddOption(addingField, newValue);
    
    // Auto-select the new value
    if (addingField === 'faqCategories') setCategory(newValue.trim());
    if (addingField === 'faqTypes') setType(newValue.trim());

    setAddingField(null);
    setNewValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); 
        saveNewOption();
    } else if (e.key === 'Escape') {
        cancelAdding();
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      setNewImages(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    if (!category || !type) {
        alert(t('faq.missingCategoryType', 'Please create and select a Category and Type first.'));
        setIsSaving(false);
        return;
    }

    const keywords = keywordInput.split(' ').map(k => k.replace('#', '').trim()).filter(k => k);

    try {
      let uploadedImages = [];
      for (const file of newImages) {
        const path = `faq_images/${teamId}/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, path);
        const uploadTask = await uploadBytesResumable(storageRef, file);
        const url = await getDownloadURL(uploadTask.ref);
        uploadedImages.push({ name: file.name, url, path });
      }

      const payload = {
        question,
        answer,
        category,
        type,
        keywords,
        images: [...existingImages, ...uploadedImages],
        updatedAt: serverTimestamp()
      };

      if (editItem) {
        await updateDoc(doc(db, 'teams', teamId, 'faqs', editItem.id), payload);
      } else {
        await addDoc(collection(db, 'teams', teamId, 'faqs'), payload);
      }
      onClose();
    } catch (err) {
      console.error(err);
      alert(t('faq.saveError', "Error saving FAQ"));
    } finally {
      setIsSaving(false);
    }
  };

  const removeExistingImage = async (idx) => {
    if (!window.confirm(t('faq.removeImage', 'Remove image?'))) return;
    const img = existingImages[idx];
    try {
        const imgRef = ref(storage, img.path);
        await deleteObject(imgRef);
        setExistingImages(prev => prev.filter((_, i) => i !== idx));
    } catch (e) {
        console.error(e);
        setExistingImages(prev => prev.filter((_, i) => i !== idx));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black bg-opacity-25" onClick={onClose}>
      <div className="bg-white rounded shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200" onClick={(e) => e.stopPropagation()}>
        
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-lg">{editItem ? t('faq.editFaq', 'Edit FAQ') : t('faq.newFaq', 'New FAQ')}</h3>
          <button onClick={onClose} className="text-gray-500">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* --- CATEGORY FIELD (INLINE EDITING) --- */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">{t('faq.category', 'Category')} (2-a)</label>
              {addingField === 'faqCategories' ? (
                <div className="flex items-center gap-2 w-full animate-fade-in">
                    <input 
                        autoFocus
                        className="flex-1 border border-blue-500 rounded p-2 text-sm outline-none ring-1 ring-blue-500"
                        placeholder={t('faq.typeName', 'Type name...')}
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <button type="button" onClick={saveNewOption} className="text-green-600 hover:text-green-800 bg-green-50 p-1.5 rounded border border-green-200"><CheckIcon /></button>
                    <button type="button" onClick={cancelAdding} className="text-red-600 hover:text-red-800 bg-red-50 p-1.5 rounded border border-red-200"><XIcon /></button>
                </div>
              ) : (
                <div className="flex gap-2">
                    <select 
                        value={category} 
                        onChange={e => setCategory(e.target.value)} 
                        className="w-full border rounded p-2"
                        required
                    >
                        {categories.length === 0 && <option value="">{t('faq.noCategories', 'No categories')}</option>}
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {/* Using faq.add to avoid default Korean 'common.add' */}
                    <button type="button" onClick={() => startAdding('faqCategories')} className="px-3 bg-gray-100 border rounded hover:bg-gray-200 text-lg font-bold text-blue-600" title={t('faq.add', 'Add')}>+</button>
                </div>
              )}
            </div>

            {/* --- TYPE FIELD (INLINE EDITING) --- */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">{t('faq.type', 'Type')} (2-b)</label>
              {addingField === 'faqTypes' ? (
                <div className="flex items-center gap-2 w-full animate-fade-in">
                    <input 
                        autoFocus
                        className="flex-1 border border-blue-500 rounded p-2 text-sm outline-none ring-1 ring-blue-500"
                        placeholder={t('faq.typeName', 'Type name...')}
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <button type="button" onClick={saveNewOption} className="text-green-600 hover:text-green-800 bg-green-50 p-1.5 rounded border border-green-200"><CheckIcon /></button>
                    <button type="button" onClick={cancelAdding} className="text-red-600 hover:text-red-800 bg-red-50 p-1.5 rounded border border-red-200"><XIcon /></button>
                </div>
              ) : (
                <div className="flex gap-2">
                    <select 
                        value={type} 
                        onChange={e => setType(e.target.value)} 
                        className="w-full border rounded p-2"
                        required
                    >
                        {types.length === 0 && <option value="">{t('faq.noTypes', 'No types')}</option>}
                        {types.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {/* Using faq.add to avoid default Korean 'common.add' */}
                    <button type="button" onClick={() => startAdding('faqTypes')} className="px-3 bg-gray-100 border rounded hover:bg-gray-200 text-lg font-bold text-blue-600" title={t('faq.add', 'Add')}>+</button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700">{t('faq.question', 'Question')}</label>
            <input required type="text" className="w-full border rounded p-2" value={question} onChange={e => setQuestion(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700">{t('faq.answer', 'Answer')}</label>
            <textarea required rows="5" className="w-full border rounded p-2" value={answer} onChange={e => setAnswer(e.target.value)}></textarea>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700">{t('faq.keywords', 'Keywords')} ({t('faq.separated', 'separated by space')})</label>
            <input type="text" placeholder={t('faq.keywordsPlaceholder', 'e.g. wifi login error #network')} className="w-full border rounded p-2" value={keywordInput} onChange={e => setKeywordInput(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700">{t('faq.photos', 'Photos')} ({t('faq.insertPhotos', 'Insert Photos')})</label>
            <input type="file" multiple accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-2"/>
            
            {/* Existing Images Preview */}
            <div className="flex gap-2 flex-wrap">
              {existingImages.map((img, idx) => (
                <div key={idx} className="relative w-20 h-20 border rounded">
                  <img src={img.url} className="w-full h-full object-cover" alt="preview" />
                  <button type="button" onClick={() => removeExistingImage(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 w-5 h-5 flex items-center justify-center text-xs">&times;</button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 mr-2">{t('faq.cancel', 'Cancel')}</button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
              {isSaving ? t('faq.saving', 'Saving...') : t('faq.save', 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ===================================================================
   Sub-Component: Manage Filter Options Modal
   =================================================================== */
const ManageOptionsModal = ({ isOpen, onClose, onAdd, onDelete, categories, types }) => {
  const { t } = useContext(LanguageContext);
  const [newCat, setNewCat] = useState('');
  const [newType, setNewType] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black bg-opacity-25" onClick={onClose}>
      <div className="bg-white rounded shadow-lg w-full max-w-md p-6 border border-gray-200" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4">{t('faq.manageOptions', 'Manage Filter Options')}</h3>
        
        <div className="mb-4">
          <h4 className="font-semibold text-sm mb-2">{t('faq.categories', 'Categories')} (2-a)</h4>
          <div className="flex gap-2 mb-2">
            <input value={newCat} onChange={e => setNewCat(e.target.value)} className="border rounded p-1 flex-1 text-sm" placeholder={t('faq.newCategory', 'New Category...')} />
            <button onClick={() => { onAdd('faqCategories', newCat); setNewCat(''); }} className="bg-green-600 text-white px-3 rounded text-sm">{t('faq.add', 'Add')}</button>
          </div>
          <div className="flex flex-wrap gap-1">
            {categories.length === 0 && <span className="text-xs text-gray-400 italic">Empty</span>}
            {categories.map(c => (
                <span key={c} className="bg-gray-100 text-xs px-2 py-1 rounded flex items-center gap-1">
                    {c}
                    <button onClick={() => onDelete('faqCategories', c)} className="text-gray-400 hover:text-red-600 ml-1"><XIcon /></button>
                </span>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <h4 className="font-semibold text-sm mb-2">{t('faq.types', 'Types')} (2-b)</h4>
          <div className="flex gap-2 mb-2">
            <input value={newType} onChange={e => setNewType(e.target.value)} className="border rounded p-1 flex-1 text-sm" placeholder={t('faq.newType', 'New Type...')} />
            <button onClick={() => { onAdd('faqTypes', newType); setNewType(''); }} className="bg-green-600 text-white px-3 rounded text-sm">{t('faq.add', 'Add')}</button>
          </div>
          <div className="flex flex-wrap gap-1">
            {types.length === 0 && <span className="text-xs text-gray-400 italic">Empty</span>}
            {types.map(t => (
                <span key={t} className="bg-gray-100 text-xs px-2 py-1 rounded flex items-center gap-1">
                    {t}
                    <button onClick={() => onDelete('faqTypes', t)} className="text-gray-400 hover:text-red-600 ml-1"><XIcon /></button>
                </span>
            ))}
          </div>
        </div>

        <div className="text-right">
          <button onClick={onClose} className="text-blue-600 hover:underline">{t('faq.done', 'Done')}</button>
        </div>
      </div>
    </div>
  );
};

export default FAQSection;