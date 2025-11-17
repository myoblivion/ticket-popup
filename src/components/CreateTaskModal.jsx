// src/components/CreateTaskModal.js
import React, { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../firebaseConfig';
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  setDoc
} from 'firebase/firestore';
import Spinner from './Spinner';
import InviteMemberModal from './InviteMemberModal';

const CreateTaskModal = ({
  isOpen,
  onClose,
  teamId,
  onTaskCreated,
  categoriesList = [],
  typesList = [], // This prop is now correctly used
  priorityOptions = ['High', 'Medium', 'Low'],
  statusOptions = ['Not started', 'In progress', 'QA', 'Complete'],
  membersList = [] 
}) => {
  // --- Form State ---
  const [priority, setPriority] = useState('Medium');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [type, setType] = useState('');
  const [newType, setNewType] = useState('');
  const [status, setStatus] = useState('Not started');
  const [ticketNo, setTicketNo] = useState('');
  const [company, setCompany] = useState('');
  const [inquiryDetails, setInquiryDetails] = useState('');
  const [csManager, setCsManager] = useState('');
  const [qaManager, setQaManager] = useState('');
  const [developer, setDeveloper] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // --- Invite Modal State ---
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteMeta, setInviteMeta] = useState(null);

  // --- Set default status when options load ---
  useEffect(() => {
    if (statusOptions && statusOptions.length > 0) {
      setStatus(statusOptions[0]); // Default to the first status in the list
    }
  }, [statusOptions]);

  // --- Set default priority when options load ---
  useEffect(() => {
    if (priorityOptions && priorityOptions.length > 0) {
      // Find 'Medium' or default to first
      const defaultPriority = priorityOptions.includes('Medium') ? 'Medium' : priorityOptions[0];
      setPriority(defaultPriority);
    }
  }, [priorityOptions]);


  // --- NEW: Helper function to save new options ---
  const saveNewOptionToTeam = useCallback(async (fieldName, newLabel) => {
    if (!teamId || !fieldName || !newLabel || !newLabel.trim()) {
      throw new Error('Invalid parameters for saving new option.');
    }
    const teamDocRef = doc(db, 'teams', teamId);
    const normalized = newLabel.trim();

    // Field mapping
    let firestoreField = '';
    if (fieldName === 'category') firestoreField = 'categories';
    else if (fieldName === 'type') firestoreField = 'types';
    else {
      console.warn(`Unknown fieldName: ${fieldName}`);
      return; // Don't save if field is unknown
    }

    // Use arrayUnion to add the item if the field exists
    try {
      await updateDoc(teamDocRef, { [firestoreField]: arrayUnion(normalized) });
    } catch (err) {
      // If the field doesn't exist yet (or doc doesn't exist), use setDoc with merge
      if (err.code === 'not-found' || err.message?.includes('No document to update')) {
        try {
          await setDoc(teamDocRef, { [firestoreField]: [normalized] }, { merge: true });
        } catch (setErr) {
          console.error(`Error setting new field ${firestoreField}:`, setErr);
          throw setErr; // Re-throw the error from setDoc
        }
      } else {
        console.error(`Error updating field ${firestoreField} with arrayUnion:`, err);
        throw err; // Re-throw other update errors
      }
    }
  }, [teamId]);


  // The conditional return MUST come AFTER all hook calls (useState, useEffect, useCallback)
  if (!isOpen) return null;


  // --- Reset Form ---
  const resetForm = () => {
    // Reset to defaults based on props
    setPriority(priorityOptions.includes('Medium') ? 'Medium' : priorityOptions[0] || 'Medium');
    setCategory('');
    setNewCategory('');
    setType('');
    setNewType('');
    setStatus(statusOptions[0] || 'Not started');
    setTicketNo('');
    setCompany('');
    setInquiryDetails('');
    setCsManager('');
    setQaManager('');
    setDeveloper('');
    setStartDate('');
    setEndDate('');
    setError('');
    setIsSaving(false);
  };

  // --- Handle Submit ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    if (!inquiryDetails.trim()) {
      setError('Inquiry Details are required.');
      setIsSaving(false);
      return;
    }

    const finalCategory = newCategory.trim() || category;
    const finalType = newType.trim() || type;

    if (!finalCategory) {
       setError('Category is required.');
       setIsSaving(false);
       return;
    }
    
    try {
      // --- NEW: Persist new options if they were created ---
      if (newCategory.trim()) {
        await saveNewOptionToTeam('category', newCategory.trim());
      }
      if (newType.trim()) {
        await saveNewOptionToTeam('type', newType.trim());
      }

      // --- Create the task ---
      const tasksCollectionRef = collection(db, `teams/${teamId}/tasks`);
      await addDoc(tasksCollectionRef, {
        priority,
        category: finalCategory,
        type: finalType,
        status,
        ticketNo: ticketNo.trim(),
        company: company.trim(),
        inquiryDetails: inquiryDetails.trim(),
        csManager: csManager, // Already a UID or empty string
        qaManager: qaManager, // Already a UID or empty string
        developer: developer, // Already a UID or empty string
        startDate: startDate ? startDate : null, // Store as null if empty
        endDate: endDate ? endDate : null, // Store as null if empty
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || null
      });

      resetForm();
      onClose();
      if (onTaskCreated) onTaskCreated(); // Trigger refresh in parent
    } catch (err) {
      console.error("Error adding task or saving new option:", err);
      setError("Failed to create task. Please try again.");
      setIsSaving(false);
    }
  };

  // --- Helper to render member dropdown options ---
  const renderMemberOptions = () => (
    <>
      <option value="">Select Member</option>
      {/* Use membersList prop now */}
      {membersList.map(m => (
        <option key={m.uid} value={m.uid}>{m.label}</option>
      ))}
      <option value="__INVITE_USER__">-- Add new user... --</option>
    </>
  );

  // --- Handle member select change ---
  const handleMemberSelectChange = (value, setter) => {
    if (value === '__INVITE_USER__') {
      setInviteMeta({ onInvite: setter });
      setIsInviteModalOpen(true);
    } else {
      setter(value);
    }
  };

  // --- Handle Invite Modal callbacks ---
  const handleInviteCompleted = async (invitedUid, invitedLabel) => {
    // Add new member to team document
    try {
      const teamDocRef = doc(db, 'teams', teamId);
      // This will trigger the onSnapshot in TeamProjectTable,
      // which will update the membersList prop for this modal.
      await updateDoc(teamDocRef, {
        members: arrayUnion({ uid: invitedUid, label: invitedLabel })
      });
    } catch (err) {
      console.error("Failed to add new member to team:", err);
    }

    // Automatically assign the newly invited user to the correct field
    if (inviteMeta && typeof inviteMeta.onInvite === 'function') {
      inviteMeta.onInvite(invitedUid);
    }

    // Close and reset invite modal
    setIsInviteModalOpen(false);
    setInviteMeta(null);
  };

  const handleInviteCanceled = () => {
    setIsInviteModalOpen(false);
    setInviteMeta(null);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl transform transition-all max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
            <h3 className="text-xl font-semibold text-gray-800">Create New Project Task</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl focus:outline-none"
              aria-label="Close modal"
              disabled={isSaving}
            >
              &times;
            </button>
          </div>

          {/* Form Body - Scrollable */}
          <form id="create-task-form" onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
            {error && <p className="text-red-600 bg-red-100 p-3 rounded-md text-sm">{error}</p>}

            {/* Priority Radio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <div className="flex gap-4">
                {priorityOptions.map(p => (
                  <label key={p} className="flex items-center space-x-2">
                    <input type="radio" name="priority" value={p} checked={priority === p} onChange={(e) => setPriority(e.target.value)} className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"/>
                    <span>{p}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select id="category" value={category} onChange={e => { setCategory(e.target.value); if(e.target.value !== 'CREATE_NEW') setNewCategory(''); }} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 bg-white">
                  <option value="">Select Category</option>
                  {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="CREATE_NEW">-- Create New --</option>
                </select>
              </div>
              {category === 'CREATE_NEW' && (
                <div>
                  <label htmlFor="newCategory" className="block text-sm font-medium text-gray-700 mb-1">New Category Name</label>
                  <input type="text" id="newCategory" value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., New UI" required/>
                </div>
              )}
            </div>

            {/* Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                {/* --- 
                  THIS IS THE FIX: 
                  Changed placeholderTypes.map to typesList.map
                  ---
                */}
                <select id="type" value={type} onChange={e => { setType(e.target.value); if(e.target.value !== 'CREATE_NEW') setNewType(''); }} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 bg-white">
                  <option value="">Select Type</option>
                  {typesList.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="CREATE_NEW">-- Create New --</option>
                </select>
              </div>
              {type === 'CREATE_NEW' && (
                <div>
                  <label htmlFor="newType" className="block text-sm font-medium text-gray-700 mb-1">New Type Name</label>
                  <input type="text" id="newType" value={newType} onChange={e => setNewType(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., Mobile View" required/>
                </div>
              )}
            </div>

            {/* Status */}
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select id="status" value={status} onChange={e => setStatus(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 bg-white">
                {statusOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Ticket # & Company */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ticketNo" className="block text-sm font-medium text-gray-700 mb-1">Ticket #</label>
                <input type="text" id="ticketNo" value={ticketNo} onChange={e => setTicketNo(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"/>
              </div>
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                <input type="text" id="company" value={company} onChange={e => setCompany(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"/>
              </div>
            </div>

            {/* Inquiry Details */}
            <div>
              <label htmlFor="inquiryDetails" className="block text-sm font-medium text-gray-700 mb-1">Inquiry Details *</label>
              <textarea id="inquiryDetails" value={inquiryDetails} onChange={e => setInquiryDetails(e.target.value)} rows="3" className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500" required/>
            </div>

            {/* Assignees (CS, QA, Dev) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* CS Manager */}
              <div>
                <label htmlFor="csManager" className="block text-sm font-medium text-gray-700 mb-1">CS Manager</label>
                <select
                  id="csManager"
                  value={csManager}
                  onChange={e => handleMemberSelectChange(e.target.value, setCsManager)}
                  className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 bg-white mb-1"
                >
                  {renderMemberOptions()}
                </select>
              </div>
              {/* QA Manager */}
              <div>
                <label htmlFor="qaManager" className="block text-sm font-medium text-gray-700 mb-1">QA Manager</label>
                {/* --- 
                  THIS IS THE SECOND FIX: 
                  Changed e.gant.value to e.target.value
                  ---
                */}
                <select
                  id="qaManager"
                  value={qaManager}
                  onChange={e => handleMemberSelectChange(e.target.value, setQaManager)}
                  className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 bg-white mb-1"
                >
                  {renderMemberOptions()}
                </select>
              </div>
              {/* Developer */}
              <div>
                <label htmlFor="developer" className="block text-sm font-medium text-gray-700 mb-1">Developer</label>
                <select
                  id="developer"
                  value={developer}
                  onChange={e => handleMemberSelectChange(e.target.value, setDeveloper)}
                  className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 bg-white mb-1"
                >
                  {renderMemberOptions()}
                </select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" id="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"/>
              </div>
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" id="endDate" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"/>
              </div>
            </div>

          </form>

          {/* Footer - Sticky */}
          <div className="flex items-center justify-end p-6 border-t sticky bottom-0 bg-white z-10">
            <button type="button" onClick={onClose} disabled={isSaving} className="px-5 py-2.5 text-sm font-medium text-gray-500 bg-white rounded-lg border border-gray-200 hover:bg-gray-100 focus:ring-4 focus:outline-none focus:ring-blue-300 hover:text-gray-900 focus:z-10 mr-2 disabled:opacity-50">
              Cancel
            </button>
            <button
              type="submit" // Triggers the form
              form="create-task-form" // Links to the form by its ID
              disabled={isSaving}
              className="px-5 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 disabled:opacity-50 inline-flex items-center"
            >
              {isSaving && <Spinner />}
              {isSaving ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>

      {/* Render the Invite Member Modal */}
      {isInviteModalOpen && (
        <InviteMemberModal
          isOpen={isInviteModalOpen}
          onClose={handleInviteCanceled}
          teamId={teamId}
          onInvited={handleInviteCompleted} // Pass the correct callback
        />
      )}
    </>
  );
};

export default CreateTaskModal;