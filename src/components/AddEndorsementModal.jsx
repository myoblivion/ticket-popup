// src/components/AddEndorsementModal.jsx
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebaseConfig';
import { collection, addDoc, serverTimestamp, getCountFromServer } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';

const AddEndorsementModal = ({ isOpen, onClose, teamId, onEndorsementAdded, t }) => {
  const [user] = useAuthState(auth);
  
  // --- NEW STATE for Handover fields ---
  const [categories, setCategories] = useState('');
  const [handoverContents, setHandoverContents] = useState('');
  const [remarks, setRemarks] = useState('');
  const [postedBy, setPostedBy] = useState('');
  const [status, setStatus] = useState('Pending');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Status options (data, not translated)
  const statusOptions = ['Pending', 'In Progress', 'Approved', 'Rejected'];

  useEffect(() => {
    if (isOpen) {
      // Reset form on open
      setCategories('');
      setHandoverContents('');
      setRemarks('');
      setStatus('Pending');
      setError('');
      setIsSaving(false);
      // Pre-fill "Posted by" name from logged-in user
      if (user) {
        setPostedBy(user.displayName || user.email || '');
      }
    }
  }, [isOpen, user]);

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
      
      // --- AUTO-GENERATE NUMBER ---
      // Get the current count of documents in the collection
      const snapshot = await getCountFromServer(handoversRef);
      const count = snapshot.data().count;
      const newNumber = count + 1; 
      
      await addDoc(handoversRef, {
        number: newNumber, // Auto-generated sequential number
        categories: categories,
        content: handoverContents, 
        remarks: remarks,         
        postedBy: postedBy,       
        status: status,
        createdAt: serverTimestamp(),
        
        // Default all new checkers to false
        checkerCS: false,
        checkerPark: false,
        checkerSeo: false,
        checkerDev: false,
        checkerYoo: false,
        checkerKim: false,
      });
      
      onEndorsementAdded(); // Call parent to refresh
      onClose(); // Close self
    } catch (err) {
      console.error("Error adding handover:", err);
      setError(t('handovers.addErrorFailed', 'Failed to save handover.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="text-lg font-semibold text-gray-800">
              {t('handovers.addTitle', 'Add New Handover')}
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
            {/* Removed Manual Number Input */}
            
            <div>
              <label htmlFor="categories" className="block text-sm font-medium text-gray-700 mb-1">
                {t('handovers.categories', 'Categories')}
              </label>
              <input
                id="categories"
                type="text"
                value={categories}
                onChange={(e) => setCategories(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
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
          <div className="flex justify-end items-center gap-3 p-4 border-t bg-gray-50">
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
              {isSaving ? t('common.saving', 'Saving...') : t('handovers.saveButton', 'Save Handover')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEndorsementModal;