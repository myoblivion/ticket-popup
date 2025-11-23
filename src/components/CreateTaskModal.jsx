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
  setDoc,
  query,      
  orderBy,    
  limit,      
  getDocs     
} from 'firebase/firestore';
import Spinner from './Spinner';
import InviteMemberModal from './InviteMemberModal';

const CreateTaskModal = ({
  isOpen,
  onClose,
  teamId,
  onTaskCreated,
  categoriesList = [],
  typesList = [], 
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
  const [isLoadingTicket, setIsLoadingTicket] = useState(false); 
  
  // NEW: Control whether the user can type the ticket number manually
  const [isTicketEditable, setIsTicketEditable] = useState(false); 

  // --- Invite Modal State ---
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteMeta, setInviteMeta] = useState(null);

  // --- Set default status ---
  useEffect(() => {
    if (statusOptions && statusOptions.length > 0) {
      setStatus(statusOptions[0]); 
    }
  }, [statusOptions]);

  // --- Set default priority ---
  useEffect(() => {
    if (priorityOptions && priorityOptions.length > 0) {
      const defaultPriority = priorityOptions.includes('Medium') ? 'Medium' : priorityOptions[0];
      setPriority(defaultPriority);
    }
  }, [priorityOptions]);

  // --- AUTO-GENERATE TICKET NUMBER LOGIC ---
  useEffect(() => {
    const fetchNextTicketNumber = async () => {
        if (!isOpen || !teamId) return;
        
        setIsLoadingTicket(true);
        // Default assumption: Locked until we find it's empty
        setIsTicketEditable(false);

        try {
            const tasksRef = collection(db, `teams/${teamId}/tasks`);
            // Get absolute latest created task to check format
            const q = query(tasksRef, orderBy('createdAt', 'desc'), limit(1));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                // CASE: FIRST RECORD EVER
                // Enable input so user can define the pattern (e.g. "T-001" or "1000")
                setTicketNo('');
                setIsTicketEditable(true);
            } else {
                // CASE: RECORDS EXIST -> Auto-Increment based on previous pattern
                const latestTask = querySnapshot.docs[0].data();
                const prevTicket = latestTask.ticketNo || '';

                // Regex to find the LAST number sequence in a string
                // Works for: "T-018" -> "018", "t02x" -> "02", "100" -> "100"
                const numberPattern = /(\d+)(?!.*\d)/;
                const match = prevTicket.match(numberPattern);

                if (match) {
                    const fullMatch = match[0]; // e.g., "018"
                    const index = match.index;

                    // 1. Parse Number
                    const currentNumVal = parseInt(fullMatch, 10);
                    
                    // 2. Increment
                    const nextNumVal = currentNumVal + 1;

                    // 3. Preserve Padding (e.g. length 3 => "019")
                    const originalLength = fullMatch.length;
                    const nextNumStr = String(nextNumVal).padStart(originalLength, '0');

                    // 4. Reconstruct (Prefix + NewNumber + Suffix)
                    const prefix = prevTicket.substring(0, index);
                    const suffix = prevTicket.substring(index + fullMatch.length);

                    setTicketNo(`${prefix}${nextNumStr}${suffix}`);
                    setIsTicketEditable(false); // Keep locked to maintain pattern
                } else {
                    // Fallback: Previous ticket had no numbers? Let user type.
                    setTicketNo(prevTicket); 
                    setIsTicketEditable(true);
                }
            }

        } catch (err) {
            console.error("Error fetching next ticket number:", err);
            setIsTicketEditable(true); // Fail safe: let user type
        } finally {
            setIsLoadingTicket(false);
        }
    };

    fetchNextTicketNumber();
  }, [isOpen, teamId]);


  // --- Helper function to save new options ---
  const saveNewOptionToTeam = useCallback(async (fieldName, newLabel) => {
    if (!teamId || !fieldName || !newLabel || !newLabel.trim()) {
      throw new Error('Invalid parameters for saving new option.');
    }
    const teamDocRef = doc(db, 'teams', teamId);
    const normalized = newLabel.trim();

    let firestoreField = '';
    if (fieldName === 'category') firestoreField = 'categories';
    else if (fieldName === 'type') firestoreField = 'types';
    else {
      return; 
    }

    try {
      await updateDoc(teamDocRef, { [firestoreField]: arrayUnion(normalized) });
    } catch (err) {
      if (err.code === 'not-found' || err.message?.includes('No document to update')) {
        try {
          await setDoc(teamDocRef, { [firestoreField]: [normalized] }, { merge: true });
        } catch (setErr) {
          console.error(`Error setting new field ${firestoreField}:`, setErr);
          throw setErr; 
        }
      } else {
        console.error(`Error updating field ${firestoreField} with arrayUnion:`, err);
        throw err; 
      }
    }
  }, [teamId]);


  if (!isOpen) return null;


  const resetForm = () => {
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
      if (newCategory.trim()) {
        await saveNewOptionToTeam('category', newCategory.trim());
      }
      if (newType.trim()) {
        await saveNewOptionToTeam('type', newType.trim());
      }

      const tasksCollectionRef = collection(db, `teams/${teamId}/tasks`);
      await addDoc(tasksCollectionRef, {
        priority,
        category: finalCategory,
        type: finalType,
        status,
        ticketNo: ticketNo.trim(), 
        company: company.trim(),
        inquiryDetails: inquiryDetails.trim(),
        csManager: csManager, 
        qaManager: qaManager, 
        developer: developer, 
        startDate: startDate ? startDate : null, 
        endDate: endDate ? endDate : null, 
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || null
      });

      resetForm();
      onClose();
      if (onTaskCreated) onTaskCreated(); 
    } catch (err) {
      console.error("Error adding task or saving new option:", err);
      setError("Failed to create task. Please try again.");
      setIsSaving(false);
    }
  };

  const renderMemberOptions = () => (
    <>
      <option value="">Select Member</option>
      {membersList.map(m => (
        <option key={m.uid} value={m.uid}>{m.label}</option>
      ))}
      <option value="__INVITE_USER__">-- Add new user... --</option>
    </>
  );

  const handleMemberSelectChange = (value, setter) => {
    if (value === '__INVITE_USER__') {
      setInviteMeta({ onInvite: setter });
      setIsInviteModalOpen(true);
    } else {
      setter(value);
    }
  };

  const handleInviteCompleted = async (invitedUid, invitedLabel) => {
    try {
      const teamDocRef = doc(db, 'teams', teamId);
      await updateDoc(teamDocRef, {
        members: arrayUnion({ uid: invitedUid, label: invitedLabel })
      });
    } catch (err) {
      console.error("Failed to add new member to team:", err);
    }

    if (inviteMeta && typeof inviteMeta.onInvite === 'function') {
      inviteMeta.onInvite(invitedUid);
    }

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
                <label htmlFor="ticketNo" className="block text-sm font-medium text-gray-700 mb-1">
                    Ticket # 
                    {isTicketEditable && <span className="text-xs text-blue-500 font-normal ml-2">(Define format)</span>}
                    {!isTicketEditable && <span className="text-xs text-gray-400 font-normal ml-2">(Auto-generated)</span>}
                </label>
                <div className="relative">
                    <input 
                        type="text" 
                        id="ticketNo" 
                        value={ticketNo} 
                        onChange={(e) => setTicketNo(e.target.value)}
                        readOnly={!isTicketEditable} // <-- DYNAMICALLY LOCKED
                        placeholder={isTicketEditable ? "e.g. T-001" : ""}
                        className={`w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 ${!isTicketEditable ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : 'bg-white'}`}
                    />
                    {isLoadingTicket && (
                        <div className="absolute right-2 top-2">
                            <Spinner />
                        </div>
                    )}
                </div>
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
              <div>
                <label htmlFor="qaManager" className="block text-sm font-medium text-gray-700 mb-1">QA Manager</label>
                <select
                  id="qaManager"
                  value={qaManager}
                  onChange={e => handleMemberSelectChange(e.target.value, setQaManager)}
                  className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 bg-white mb-1"
                >
                  {renderMemberOptions()}
                </select>
              </div>
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
              disabled={isSaving || isLoadingTicket} // Disable if still fetching ticket #
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