import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp, arrayUnion, writeBatch, query, where, getDocs } from "firebase/firestore";
import { db, auth } from '../firebaseConfig'; // Import auth as well

// Simple Loading Spinner for the button
const ButtonSpinner = () => (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


const CreateTeamModal = ({ isOpen, onClose, onTeamCreated }) => {
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [memberEmails, setMemberEmails] = useState(''); // Store emails as a comma-separated string for now
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const currentUser = auth.currentUser; // Get current user

  const resetForm = () => {
    setTeamName('');
    setDescription('');
    setMemberEmails('');
    setError('');
    setIsCreating(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!teamName.trim() || !currentUser) {
        setError('Team name is required.');
        return;
    }

    setIsCreating(true);
    setError('');

    try {
        const teamsCollectionRef = collection(db, "teams");
        // Add the new team document
        const newTeamRef = await addDoc(teamsCollectionRef, {
            teamName: teamName.trim(),
            description: description.trim(),
            createdAt: serverTimestamp(),
            createdBy: currentUser.uid, // Store the creator's user ID
            members: [currentUser.uid] // Start with the creator as a member
            // We'll add invited members later if needed, or handle invites separately
        });

        console.log("Team created with ID: ", newTeamRef.id);
        // Optionally handle member invites here (more complex)
        // For now, we just create the team with the creator

        resetForm();
        onTeamCreated(); // Notify HomePage to refresh the list
        onClose(); // Close the modal

    } catch (err) {
        console.error("Error creating team:", err);
        setError("Failed to create team. Please try again.");
        setIsCreating(false); // Ensure button is re-enabled on error
    }
  };


  // Prevent rendering if not open
  if (!isOpen) {
    return null;
  }

  return (
    // Modal backdrop and container
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg transform transition-all duration-300 ease-in-out scale-100">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800">Create New Team</h3>
          <button
            onClick={handleClose}
            className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm p-1.5 ml-auto inline-flex items-center"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
          </button>
        </div>

        {/* Modal Body - Form */}
        <form onSubmit={handleCreateTeam}>
          <div className="p-6 space-y-4">
            {error && <p className="text-red-600 bg-red-100 p-3 rounded-md text-sm">{error}</p>}
            <div>
              <label htmlFor="teamName" className="block mb-2 text-sm font-medium text-gray-900">Team Name *</label>
              <input
                type="text"
                id="teamName"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                placeholder="Project Alpha"
                required
              />
            </div>
            <div>
              <label htmlFor="description" className="block mb-2 text-sm font-medium text-gray-900">Description</label>
              <textarea
                id="description"
                rows="3"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                placeholder="Briefly describe the team's purpose..."
              ></textarea>
            </div>
            <div>
              <label htmlFor="memberEmails" className="block mb-2 text-sm font-medium text-gray-900">Invite Members (by email, comma-separated)</label>
              <input
                type="text"
                id="memberEmails"
                value={memberEmails}
                onChange={(e) => setMemberEmails(e.target.value)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                placeholder="member1@example.com, member2@example.com"
              />
               <p className="mt-1 text-xs text-gray-500">Note: Invite functionality requires further implementation.</p>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end p-6 space-x-2 border-t border-gray-200 rounded-b">
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-500 bg-white hover:bg-gray-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-gray-200 text-sm font-medium px-5 py-2.5 hover:text-gray-900 focus:z-10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center disabled:opacity-50"
            >
              {isCreating && <ButtonSpinner />}
              {isCreating ? 'Creating...' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTeamModal;