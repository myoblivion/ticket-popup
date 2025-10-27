// src/components/AddEndorsementModal.js
import React, { useState } from 'react';
import { db, auth } from '../firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const AddEndorsementModal = ({ isOpen, onClose, teamId, onEndorsementAdded }) => {
  const [writerName, setWriterName] = useState('');
  const [content, setContent] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState('Pending'); // Default status
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Get current user's display name or email as default writer
  useState(() => {
      const currentUser = auth.currentUser;
      if (currentUser) {
          setWriterName(currentUser.displayName || currentUser.email || '');
      }
  }, []);


  const resetForm = () => {
    // Keep writer name? Or reset? Let's keep it.
    // setWriterName('');
    setContent('');
    setDetails('');
    setStatus('Pending');
    setIsSaving(false);
    setError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!writerName.trim() || !content.trim()) {
      setError('Writer Name and Content are required.');
      return;
    }
    setIsSaving(true);
    setError('');

    try {
      const endorsementsRef = collection(db, `teams/${teamId}/endorsements`);
      await addDoc(endorsementsRef, {
        writerName: writerName.trim(),
        content: content.trim(),
        details: details.trim(),
        status: status,
        createdAt: serverTimestamp(),
        // Approvals default to false
        teamLeadApproved: false,
        managerApproved: false,
        qaManagerApproved: false,
        devLeadApproved: false,
        // Add creator info if needed
        creatorUid: auth.currentUser?.uid || null,
      });

      resetForm();
      onEndorsementAdded(); // Notify parent to refresh
      onClose(); // Close this modal

    } catch (err) {
      console.error("Error adding endorsement:", err);
      setError("Failed to save endorsement. Please try again.");
      setIsSaving(false);
    }
  };

  const handleClose = () => {
      if (isSaving) return; // Prevent closing while saving
      resetForm();
      onClose();
  };


  if (!isOpen) return null;

  // Status options for the dropdown
  const statusOptions = ['Pending', 'Approved', 'Rejected', 'In Progress'];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-50"> {/* Higher z-index */}
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative">
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl focus:outline-none"
          aria-label="Close modal"
          disabled={isSaving}
        >
          &times;
        </button>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Add New Endorsement</h2>

        {error && <p className="text-red-600 text-sm mb-3 p-2 bg-red-50 rounded border border-red-200">{error}</p>}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="writerName" className="block text-sm font-medium text-gray-700 mb-1">Writer Name</label>
            <input
              type="text"
              id="writerName"
              value={writerName}
              onChange={(e) => setWriterName(e.target.value)}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              disabled={isSaving}
              required
            />
          </div>
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea
              id="content"
              rows="3"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              disabled={isSaving}
              required
            ></textarea>
          </div>
           <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
             <select
                id="status"
                className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={isSaving}
             >
                 {statusOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                 ))}
             </select>
          </div>
          <div>
            <label htmlFor="details" className="block text-sm font-medium text-gray-700 mb-1">Details (Optional)</label>
            <textarea
              id="details"
              rows="2"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              disabled={isSaving}
            ></textarea>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md text-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Endorsement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEndorsementModal;