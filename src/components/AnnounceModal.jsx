import React, { useState } from 'react';
import { db } from '../firebaseConfig'; // Import db
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'; // Import Firestore functions
import { auth } from '../firebaseConfig'; // Import auth to get current user

const AnnounceModal = ({ isOpen, onClose, teamId, onAnnouncementPosted }) => { // Added onAnnouncementPosted prop
  const [announcementText, setAnnouncementText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handlePost = async () => {
    if (!announcementText.trim()) {
      setError("Announcement cannot be empty.");
      return;
    }
    if (!auth.currentUser) {
        setError("You must be logged in to post an announcement.");
        return;
    }

    setIsPosting(true);
    setError('');
    try {
      await addDoc(collection(db, `teams/${teamId}/announcements`), {
        type: 'announcement', // To differentiate from meetings
        text: announcementText,
        createdBy: auth.currentUser.uid,
        creatorDisplayName: auth.currentUser.displayName || auth.currentUser.email,
        createdAt: serverTimestamp(),
      });
      setAnnouncementText(''); // Clear input
      onClose(); // Close modal
      if (onAnnouncementPosted) { // Trigger refresh in parent
        onAnnouncementPosted();
      }
    } catch (err) {
      console.error("Error posting announcement:", err);
      setError("Failed to post announcement. Please try again.");
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800">New Announcement</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <textarea
            rows="4"
            value={announcementText}
            onChange={(e) => setAnnouncementText(e.target.value)}
            className="w-full p-2 border rounded mb-4 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Write your announcement..."
        />
        <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
            <button onClick={handlePost} disabled={!announcementText.trim() || isPosting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                {isPosting ? 'Posting...' : 'Post Announcement'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default AnnounceModal;