import React, { useState } from 'react';
import { db, auth } from '../firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import Spinner from './Spinner';
// Placeholder - Fetch actual members later
const placeholderMembers = [
    { uid: 'uid1', name: 'Member One (member1@example.com)'},
    { uid: 'uid2', name: 'Member Two (member2@example.com)'}
];
// Placeholder - Fetch actual categories/types later
const placeholderCategories = ['Tech Issue', 'Feature Request', 'Inquiry'];
const placeholderTypes = ['Bug', 'Enhancement', 'Question', 'Backend', 'Frontend'];

const CreateTaskModal = ({ isOpen, onClose, teamId, onTaskCreated }) => {
  // --- Form State ---
  const [priority, setPriority] = useState('Medium'); // Default
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [type, setType] = useState('');
  const [newType, setNewType] = useState('');
  const [status, setStatus] = useState('Not started'); // Default
  const [ticketNo, setTicketNo] = useState(''); // Maybe auto-generate later?
  const [company, setCompany] = useState('');
  const [inquiryDetails, setInquiryDetails] = useState('');
  const [csManager, setCsManager] = useState(''); // Store UID or Email/Name
  const [externalCs, setExternalCs] = useState('');
  const [qaManager, setQaManager] = useState('');
  const [externalQa, setExternalQa] = useState('');
  const [developer, setDeveloper] = useState('');
  const [externalDev, setExternalDev] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  // --- Reset Form ---
  const resetForm = () => {
    setPriority('Medium'); setCategory(''); setNewCategory(''); setType(''); setNewType('');
    setStatus('Not started'); setTicketNo(''); setCompany(''); setInquiryDetails('');
    setCsManager(''); setExternalCs(''); setQaManager(''); setExternalQa(''); setDeveloper(''); setExternalDev('');
    setStartDate(''); setEndDate(''); setError(''); setIsSaving(false);
  };

  // --- Handle Submit ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    // ** TODO: Data Validation **
    if (!inquiryDetails.trim()) {
        setError('Inquiry Details are required.');
        setIsSaving(false);
        return;
    }

    // Determine final category/type (handle new ones - saving new options needs separate logic)
    const finalCategory = newCategory.trim() || category;
    const finalType = newType.trim() || type;

    // Determine final assignees
    const finalCs = externalCs.trim() || csManager;
    const finalQa = externalQa.trim() || qaManager;
    const finalDev = externalDev.trim() || developer;

    try {
        const tasksCollectionRef = collection(db, `teams/${teamId}/tasks`);
        await addDoc(tasksCollectionRef, {
            priority, category: finalCategory, type: finalType, status,
            ticketNo: ticketNo.trim(), // Consider auto-generating this
            company: company.trim(),
            inquiryDetails: inquiryDetails.trim(),
            csManager: finalCs, qaManager: finalQa, developer: finalDev,
            startDate: startDate || null, // Store as null if empty
            endDate: endDate || null, // Store as null if empty
            createdAt: serverTimestamp(),
            // Add createdBy if needed: createdBy: auth.currentUser?.uid
        });

        resetForm();
        onClose();
        if (onTaskCreated) onTaskCreated(); // Trigger refresh in parent
    } catch (err) {
        console.error("Error adding task:", err);
        setError("Failed to create task. Please try again.");
        setIsSaving(false);
    }
  };

  // --- Helper Functions for Selects (Can be moved) ---
  const renderMemberOptions = () => (
    <>
      <option value="">Select Member</option>
      {placeholderMembers.map(m => <option key={m.uid} value={m.name}>{m.name}</option>)}
      <option value="EXTERNAL">-- Enter Manually --</option>
    </>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl transform transition-all max-h-[90vh] flex flex-col"> {/* Added max-h & flex */}
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <h3 className="text-xl font-semibold text-gray-800">Create New Project Task</h3>
          <button onClick={onClose} /* ... */ >&times;</button>
        </div>

        {/* Form Body - Scrollable */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto"> {/* Added overflow */}
          {error && <p className="text-red-600 bg-red-100 p-3 rounded-md text-sm">{error}</p>}

          {/* Priority Radio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <div className="flex gap-4">
              {['High', 'Medium', 'Low'].map(p => (
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
                {placeholderCategories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="CREATE_NEW">-- Create New --</option>
              </select>
            </div>
            {category === 'CREATE_NEW' && (
              <div>
                <label htmlFor="newCategory" className="block text-sm font-medium text-gray-700 mb-1">New Category Name</label>
                <input type="text" id="newCategory" value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500" required/>
              </div>
            )}
          </div>

          {/* Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select id="type" value={type} onChange={e => { setType(e.target.value); if(e.target.value !== 'CREATE_NEW') setNewType(''); }} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 bg-white">
                 <option value="">Select Type</option>
                 {placeholderTypes.map(t => <option key={t} value={t}>{t}</option>)}
                 <option value="CREATE_NEW">-- Create New --</option>
              </select>
             </div>
             {type === 'CREATE_NEW' && (
                <div>
                  <label htmlFor="newType" className="block text-sm font-medium text-gray-700 mb-1">New Type Name</label>
                  <input type="text" id="newType" value={newType} onChange={e => setNewType(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500" required/>
                </div>
              )}
          </div>

          {/* Status */}
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select id="status" value={status} onChange={e => setStatus(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 bg-white">
              <option value="Not started">Not started</option>
              <option value="In progress">In progress</option>
              <option value="QA">QA</option>
              <option value="Complete">Complete</option>
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
                 <select id="csManager" value={csManager} onChange={e => { setCsManager(e.target.value); if(e.target.value !== 'EXTERNAL') setExternalCs(''); }} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 bg-white mb-1">
                     {renderMemberOptions()}
                 </select>
                 {csManager === 'EXTERNAL' && <input type="text" value={externalCs} onChange={e => setExternalCs(e.target.value)} placeholder="Enter Name/Email" className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 text-sm"/>}
             </div>
             {/* QA Manager */}
             <div>
                 <label htmlFor="qaManager" className="block text-sm font-medium text-gray-700 mb-1">QA Manager</label>
                 <select id="qaManager" value={qaManager} onChange={e => { setQaManager(e.target.value); if(e.target.value !== 'EXTERNAL') setExternalQa(''); }} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 bg-white mb-1">
                      {renderMemberOptions()}
                 </select>
                 {qaManager === 'EXTERNAL' && <input type="text" value={externalQa} onChange={e => setExternalQa(e.target.value)} placeholder="Enter Name/Email" className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 text-sm"/>}
             </div>
             {/* Developer */}
             <div>
                 <label htmlFor="developer" className="block text-sm font-medium text-gray-700 mb-1">Developer</label>
                 <select id="developer" value={developer} onChange={e => { setDeveloper(e.target.value); if(e.target.value !== 'EXTERNAL') setExternalDev(''); }} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 bg-white mb-1">
                     {renderMemberOptions()}
                 </select>
                 {developer === 'EXTERNAL' && <input type="text" value={externalDev} onChange={e => setExternalDev(e.target.value)} placeholder="Enter Name/Email" className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 text-sm"/>}
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
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-gray-500 bg-white rounded-lg border border-gray-200 hover:bg-gray-100 focus:ring-4 focus:outline-none focus:ring-blue-300 hover:text-gray-900 focus:z-10 mr-2">
            Cancel
          </button>
          <button
            type="submit" // Will trigger form's onSubmit
            form="create-task-form" // Link button to form if it's outside
            onClick={handleSubmit} // Added onClick for direct handling as well
            disabled={isSaving}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 disabled:opacity-50 inline-flex items-center"
          >
            {isSaving && <Spinner />} 
            {isSaving ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateTaskModal;