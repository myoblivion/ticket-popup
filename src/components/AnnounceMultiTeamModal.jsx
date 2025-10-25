import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebaseConfig';
import {
  collection,
  doc,
  getDoc,
  writeBatch,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import Spinner from './Spinner'; // Assuming you have a Spinner component

const AnnounceMultiTeamModal = ({ isOpen, onClose, allTeams = [], onAnnouncementSent }) => {
  const [announcementText, setAnnouncementText] = useState('');
  const [selectedTeamIds, setSelectedTeamIds] = useState(new Set());
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setAnnouncementText('');
      setSelectedTeamIds(new Set());
      setError('');
      setSuccess('');
      setIsPosting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCheckboxChange = (teamId, checked) => {
    setSelectedTeamIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(teamId);
      } else {
        next.delete(teamId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedTeamIds.size === allTeams.length) {
      // Deselect all
      setSelectedTeamIds(new Set());
    } else {
      // Select all
      setSelectedTeamIds(new Set(allTeams.map(t => t.id)));
    }
  };

  const handlePost = async () => {
    if (!announcementText.trim()) {
      setError("Announcement cannot be empty.");
      return;
    }
    if (selectedTeamIds.size === 0) {
      setError("Please select at least one team.");
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError("You must be logged in.");
      return;
    }

    setIsPosting(true);
    setError('');
    setSuccess('');
    let errorsOccurred = false;

    try {
      const creatorName = currentUser.displayName || currentUser.email || 'Master Admin';
      const teamIdsArray = Array.from(selectedTeamIds);

      // Process announcements team by team
      for (const teamId of teamIdsArray) {
        try {
          // 1. Get team data (for members and name)
          const teamRef = doc(db, 'teams', teamId);
          const teamSnap = await getDoc(teamRef);
          if (!teamSnap.exists()) {
            console.warn(`Team ${teamId} not found, skipping.`);
            continue; // Skip to the next team
          }
          const teamData = teamSnap.data();
          const members = teamData.members || [];
          const teamName = teamData.teamName || `Team ${teamId}`;

          // 2. Add the announcement document to the team's subcollection
          const announcementRef = await addDoc(collection(db, `teams/${teamId}/announcements`), {
            type: 'announcement',
            text: announcementText,
            createdBy: currentUser.uid,
            creatorDisplayName: creatorName,
            createdAt: serverTimestamp(),
            isGlobal: true, // Optional flag to indicate it came from Master Admin
          });

          // 3. Prepare notifications for all members of this team
          const batch = writeBatch(db);
          members.forEach(memberId => {
            // No need to check for self-notification if master admin isn't usually a member
            const notifRef = doc(collection(db, 'notifications')); // Auto-generate ID
            batch.set(notifRef, {
              userId: memberId,
              type: 'ANNOUNCEMENT',
              senderId: currentUser.uid,
              senderName: creatorName,
              teamId: teamId,
              teamName: teamName,
              title: announcementText.substring(0, 100) + (announcementText.length > 100 ? '...' : ''), // Truncate title
              announcementId: announcementRef.id, // Link to the announcement doc
              createdAt: serverTimestamp(),
              isRead: false,
            });
          });

          // 4. Commit notifications for this team
          await batch.commit();

        } catch (teamErr) {
          console.error(`Error processing announcement for team ${teamId}:`, teamErr);
          errorsOccurred = true;
          // Continue to the next team even if one fails
        }
      } // End of loop through teams

      if (errorsOccurred) {
        setError('Some announcements failed to send. Check console for details.');
      } else {
        setSuccess(`Announcement sent to ${selectedTeamIds.size} team(s).`);
        setAnnouncementText('');
        setSelectedTeamIds(new Set());
        if (onAnnouncementSent) onAnnouncementSent(); // Callback for parent if needed
        setTimeout(onClose, 1500); // Close modal after success message
      }

    } catch (globalErr) {
      console.error("Global error posting announcements:", globalErr);
      setError("An unexpected error occurred. Failed to send announcements.");
      errorsOccurred = true;
    } finally {
      // Only set isPosting to false if there were errors, otherwise success handles it.
      if (errorsOccurred) {
        setIsPosting(false);
      }
    }
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl transform transition-all max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <h3 className="text-xl font-semibold text-gray-800">Send Global Announcement</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Body - Scrollable */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {error && <p className="text-red-600 bg-red-100 p-3 rounded-md text-sm">{error}</p>}
          {success && <p className="text-green-600 bg-green-100 p-3 rounded-md text-sm">{success}</p>}

          {/* Announcement Text */}
          <div>
            <label htmlFor="announcementText" className="block text-sm font-medium text-gray-700 mb-1">
              Announcement Message <span className="text-red-500">*</span>
            </label>
            <textarea
              id="announcementText"
              rows="4"
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
              placeholder="Write your announcement..."
            />
          </div>

          {/* Team Selection */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Select Teams <span className="text-red-500">*</span> ({selectedTeamIds.size} selected)
              </label>
              <button
                onClick={handleSelectAll}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                {selectedTeamIds.size === allTeams.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto border rounded p-3 space-y-2 bg-gray-50">
              {allTeams.length === 0 && <p className="text-sm text-gray-500 italic">No teams available.</p>}
              {allTeams.map(team => (
                <label key={team.id} className="flex items-center space-x-3 p-2 bg-white rounded border border-gray-200 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTeamIds.has(team.id)}
                    onChange={(e) => handleCheckboxChange(team.id, e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-800">{team.teamName}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-6 border-t sticky bottom-0 bg-white z-10 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white rounded-lg border border-gray-200 hover:bg-gray-100 focus:ring-4 focus:outline-none focus:ring-blue-300 hover:text-gray-900 focus:z-10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePost}
            disabled={isPosting || !announcementText.trim() || selectedTeamIds.size === 0}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 disabled:opacity-50 inline-flex items-center"
          >
            {isPosting && <Spinner />}
            {isPosting ? 'Sending...' : `Send to ${selectedTeamIds.size} Team(s)`}
          </button>
        </div>

      </div>
    </div>
  );
};

export default AnnounceMultiTeamModal;