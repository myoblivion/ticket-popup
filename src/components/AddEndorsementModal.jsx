// src/components/AddEndorsementModal.jsx
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebaseConfig';
import { collection, addDoc, updateDoc, doc, serverTimestamp, getCountFromServer } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';

const AddEndorsementModal = ({ 
  isOpen, 
  onClose, 
  teamId, 
  onEndorsementAdded, 
  t, 
  categoriesList = [], 
  initialData = null, // If provided, we are in EDIT mode
  checkerList = [],   // The list of available checkboxes
  onUpdateCheckers    // Function to update the global list of checkers (add/delete)
}) => {
  const [user] = useAuthState(auth);
  
  // --- Form State ---
  const [categories, setCategories] = useState('');
  const [handoverContents, setHandoverContents] = useState('');
  const [remarks, setRemarks] = useState('');
  const [postedBy, setPostedBy] = useState('');
  const [status, setStatus] = useState('Pending');
  
  // State for the values of the checkboxes (Checked/Unchecked)
  const [checkers, setCheckers] = useState({});

  // State for Managing (Adding) new Checkers
  const [newCheckerLabel, setNewCheckerLabel] = useState('');
  const [isAddingChecker, setIsAddingChecker] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Status options
  const statusOptions = ['Pending', 'In Progress', 'Approved', 'Rejected'];

  useEffect(() => {
    if (isOpen) {
      setError('');
      setIsSaving(false);
      setNewCheckerLabel('');
      setIsAddingChecker(false);

      if (initialData) {
        // --- EDIT MODE: Pre-fill data ---
        setCategories(initialData.categories || '');
        setHandoverContents(initialData.content || '');
        setRemarks(initialData.remarks || '');
        setPostedBy(initialData.postedBy || '');
        setStatus(initialData.status || 'Pending');

        // Pre-fill checkers based on the dynamic list
        const loadedCheckers = {};
        checkerList.forEach(c => {
          loadedCheckers[c.key] = initialData[c.key] === true;
        });
        setCheckers(loadedCheckers);

      } else {
        // --- ADD MODE: Reset form ---
        setCategories('');
        setHandoverContents('');
        setRemarks('');
        setStatus('Pending');
        
        // Default "Posted by"
        if (user) {
          setPostedBy(user.displayName || user.email || '');
        } else {
          setPostedBy('');
        }

        // Reset checkers to false
        const defaultCheckers = {};
        checkerList.forEach(c => {
          defaultCheckers[c.key] = false;
        });
        setCheckers(defaultCheckers);
      }
    }
  }, [isOpen, initialData, user, checkerList]);

  // --- Handlers for Checkbox Values (Data) ---
  const handleCheckerChange = (key, checked) => {
    setCheckers(prev => ({
      ...prev,
      [key]: checked
    }));
  };

  // --- Handlers for Managing Checkers (Structure) ---
  const handleAddChecker = async (e) => {
    e.preventDefault(); // prevent form submit
    if (!newCheckerLabel.trim()) return;

    // Generate a safe key (e.g., "Design Lead" -> "checkerDesignLead")
    const safeLabel = newCheckerLabel.replace(/[^a-zA-Z0-9]/g, '');
    const newKey = `checker${safeLabel}`;

    // Prevent duplicates
    if (checkerList.some(c => c.key === newKey)) {
      alert("This checker already exists!");
      return;
    }

    const newChecker = { key: newKey, label: newCheckerLabel };
    const newList = [...checkerList, newChecker];
    
    // Call parent to update Firestore
    if (onUpdateCheckers) {
      await onUpdateCheckers(newList);
    }
    
    setNewCheckerLabel('');
    setIsAddingChecker(false);
  };

  const handleDeleteChecker = async (keyToDelete) => {
    if (!window.confirm("Delete this checker column? Existing data for this column may be hidden.")) return;
    
    const newList = checkerList.filter(c => c.key !== keyToDelete);
    
    if (onUpdateCheckers) {
      await onUpdateCheckers(newList);
    }
  };

  // --- Main Form Submit ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!handoverContents || !postedBy) {
      setError(t('handovers.addErrorRequired', 'Posted by and Handover Contents are required.'));
      return;
    }
    setIsSaving(true);
    setError('');
    
    try {
      const handoversRef = collection(db, `teams/${teamId}/endorsements`); 

      if (initialData) {
        // --- UPDATE EXISTING ---
        const docRef = doc(db, `teams/${teamId}/endorsements`, initialData.id);
        
        await updateDoc(docRef, {
          categories: categories,
          content: handoverContents, 
          remarks: remarks,         
          postedBy: postedBy,       
          status: status,
          // Spread current state of checkers (true/false)
          ...checkers
        });

      } else {
        // --- CREATE NEW ---
        // Get the current count for auto-numbering
        const snapshot = await getCountFromServer(handoversRef);
        const count = snapshot.data().count;
        const newNumber = count + 1; 
        
        await addDoc(handoversRef, {
          number: newNumber, 
          categories: categories,
          content: handoverContents, 
          remarks: remarks,         
          postedBy: postedBy,       
          status: status,
          createdAt: serverTimestamp(),
          // Spread checkers (defaults or modified)
          ...checkers
        });
      }
      
      onEndorsementAdded(); // Refresh parent
      onClose();
    } catch (err) {
      console.error("Error saving handover:", err);
      setError(t('handovers.addErrorFailed', 'Failed to save handover.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const isEditMode = !!initialData;
  const modalTitle = isEditMode 
    ? t('handovers.editTitle', 'Edit Handover') 
    : t('handovers.addTitle', 'Add New Handover');
  const saveLabel = isEditMode 
    ? t('handovers.updateButton', 'Update Handover') 
    : t('handovers.saveButton', 'Save Handover');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white z-10">
            <h3 className="text-lg font-semibold text-gray-800">
              {modalTitle}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl focus:outline-none"
              aria-label={t('common.close', 'Close')}
              disabled={isSaving}
            >
              &times;
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            
            {/* Categories */}
            <div>
              <label htmlFor="categories" className="block text-sm font-medium text-gray-700 mb-1">
                {t('handovers.categories', 'Categories')}
              </label>
              <input
                id="categories"
                type="text"
                value={categories}
                onChange={(e) => setCategories(e.target.value)}
                list="category-options"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <datalist id="category-options">
                {categoriesList.map((cat, i) => (
                  <option key={i} value={cat} />
                ))}
              </datalist>
            </div>

            {/* Posted By */}
            <div>
              <label htmlFor="postedBy" className="block text-sm font-medium text-gray-700 mb-1">
                {t('handovers.postedBy', 'Posted by')} <span className="text-red-500">*</span>
              </label>
              <input
                id="postedBy"
                type="text"
                value={postedBy}
                onChange={(e) => setPostedBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            {/* Content */}
            <div>
              <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
                {t('handovers.content', 'Handover Contents')} <span className="text-red-500">*</span>
              </label>
              <textarea
                id="content"
                rows="4"
                value={handoverContents}
                onChange={(e) => setHandoverContents(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            {/* Status */}
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                {t('handovers.status', 'Status')}
              </label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                {statusOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Checkers Section */}
            <div className="border p-3 rounded-md bg-gray-50">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  {t('handovers.checkers', 'Checkers')}
                </label>
              </div>

              {/* List of Checkers */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {checkerList.map((checker) => (
                  <div key={checker.key} className="flex items-center justify-between bg-white px-2 py-1 rounded border border-gray-200 group">
                    <div className="flex items-center overflow-hidden">
                      <input
                        id={`chk-${checker.key}`}
                        type="checkbox"
                        checked={checkers[checker.key] || false}
                        onChange={(e) => handleCheckerChange(checker.key, e.target.checked)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                      />
                      <label htmlFor={`chk-${checker.key}`} className="ml-2 text-sm text-gray-700 truncate select-none cursor-pointer">
                        {checker.label}
                      </label>
                    </div>
                    {/* Delete Checker Button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteChecker(checker.key)}
                      className="text-gray-300 hover:text-red-500 ml-1 focus:outline-none opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete this checker"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {/* Add New Checker UI */}
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="New checker name..."
                  value={newCheckerLabel}
                  onChange={(e) => setNewCheckerLabel(e.target.value)}
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault(); 
                        handleAddChecker(e);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddChecker}
                  disabled={!newCheckerLabel.trim()}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label htmlFor="remarks" className="block text-sm font-medium text-gray-700 mb-1">
                {t('handovers.remarks', 'Remarks (Optional)')}
              </label>
              <input
                id="remarks"
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end items-center gap-3 p-4 border-t bg-gray-50 sticky bottom-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-wait"
            >
              {isSaving ? t('common.saving', 'Saving...') : saveLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEndorsementModal;
