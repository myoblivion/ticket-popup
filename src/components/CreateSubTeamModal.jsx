// CreateSubTeamModal.jsx
import React, { useState, useContext } from 'react';
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { db, auth } from '../firebaseConfig';
import { LanguageContext } from '../contexts/LanguageContext';

const ButtonSpinner = () => (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const CreateSubTeamModal = ({ isOpen, onClose, onTeamCreated, parentTeamId, parentTeamName }) => {
  const { t } = useContext(LanguageContext);
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('in_progress');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const currentUser = auth.currentUser;

  const handleClose = () => {
    setTeamName(''); setDescription(''); setError(''); setIsCreating(false); onClose();
  };

  const handleCreateSubTeam = async (e) => {
    e.preventDefault();
    if (!teamName.trim() || !currentUser || !parentTeamId) {
        setError(t('subProject.nameRequired', 'Team name is required.')); return;
    }
    setIsCreating(true); setError('');

    try {
        // --- NEW: FETCH PARENT TEAM ADMINS TO COPY THEM OVER ---
        const parentDocRef = doc(db, "teams", parentTeamId);
        const parentDoc = await getDoc(parentDocRef);
        let initialMembers = [currentUser.uid];
        let initialRoles = { [currentUser.uid]: 'admin' };
        let initialPermissions = { [currentUser.uid]: { announcements: true, schedule: true } };

        if (parentDoc.exists()) {
            const parentData = parentDoc.data();
            // Add Parent Creator
            if (parentData.createdBy && !initialMembers.includes(parentData.createdBy)) {
                initialMembers.push(parentData.createdBy);
                initialRoles[parentData.createdBy] = 'admin';
                initialPermissions[parentData.createdBy] = { announcements: true, schedule: true };
            }
            // Add Parent Admins
            if (parentData.roles) {
                Object.entries(parentData.roles).forEach(([uid, role]) => {
                    if (role === 'admin' && !initialMembers.includes(uid)) {
                        initialMembers.push(uid);
                        initialRoles[uid] = 'admin';
                        initialPermissions[uid] = { announcements: true, schedule: true };
                    }
                });
            }
        }

        const teamsCollectionRef = collection(db, "teams");
        await addDoc(teamsCollectionRef, {
            teamName: teamName.trim(),
            description: description.trim(),
            parentTeamId: parentTeamId, 
            status: status, 
            createdAt: serverTimestamp(),
            createdBy: currentUser.uid, 
            members: initialMembers,
            roles: initialRoles,
            permissions: initialPermissions
        });

        handleClose();
        if(onTeamCreated) onTeamCreated(); 

    } catch (err) {
        console.error("Error creating sub-team:", err);
        setError(t('subProject.createError', 'Failed to create sub-project.'));
        setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex justify-between items-center p-5 border-b border-gray-200">
          <div>
            <h3 className="text-xl font-semibold text-gray-800">{t('subProject.addTitle', 'Add Sub-Project')}</h3>
            <p className="text-xs text-gray-500">{t('subProject.under', 'Under:')} {parentTeamName}</p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-900">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
          </button>
        </div>
        <form onSubmit={handleCreateSubTeam}>
          <div className="p-6 space-y-4">
            {error && <p className="text-red-600 bg-red-100 p-3 rounded-md text-sm">{error}</p>}
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-900">{t('subProject.nameLabel', 'Sub-Project Name')}</label>
              <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5" placeholder={t('subProject.namePlaceholder', 'e.g. SEO Marketing')} required />
            </div>
            <div>
                <label className="block mb-2 text-sm font-medium text-gray-900">{t('subProject.statusLabel', 'Initial Status')}</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5">
                    <option value="not_started">{t('status.not_started', 'Not Started')}</option>
                    <option value="in_progress">{t('status.in_progress', 'In Progress')}</option>
                    <option value="completed">{t('status.completed', 'Completed')}</option>
                    <option value="paused">{t('status.paused', 'Paused')}</option>
                </select>
            </div>
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-900">{t('subProject.descLabel', 'Description (Optional)')}</label>
              <textarea rows="2" value={description} onChange={(e) => setDescription(e.target.value)} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5"></textarea>
            </div>
          </div>
          <div className="flex items-center justify-end p-6 space-x-2 border-t border-gray-200">
            <button type="button" onClick={handleClose} className="text-gray-500 bg-white hover:bg-gray-100 border border-gray-200 text-sm font-medium px-5 py-2.5 rounded-lg">{t('common.cancel', 'Cancel')}</button>
            <button type="submit" disabled={isCreating} className="text-white bg-blue-700 hover:bg-blue-800 font-medium rounded-lg text-sm px-5 py-2.5 flex items-center">
              {isCreating && <ButtonSpinner />}
              {t('subProject.createBtn', 'Create Sub-Project')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateSubTeamModal;