import React, { useState } from 'react';
import { db, auth } from '../firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';

const InviteMemberModal = ({ isOpen, onClose, teamId }) => {
  const [email, setEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleInvite = async () => {
    if (!email.trim()) {
      setError('Please enter an email address.');
      return;
    }
    
    setIsInviting(true);
    setError('');
    setSuccess('');

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("You must be logged in.");
      }

      // 1. Find the user by email
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email.trim().toLowerCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError('User with this email not found.');
        setIsInviting(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const invitedUserId = userDoc.id;

      // 2. Get team data (for team name and member check)
      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await getDoc(teamRef);

      if (!teamSnap.exists()) {
        setError('Team not found. This should not happen.');
        setIsInviting(false);
        return;
      }

      const teamData = teamSnap.data();
      const teamName = teamData.teamName;
      const members = teamData.members || [];

      // 3. Check if user is already a member
      if (members.includes(invitedUserId)) {
        setError('This user is already a member of the team.');
        setIsInviting(false);
        return;
      }
      const senderName = currentUser.displayName || currentUser.email; // <-- Use email as fallback
      // 4. Create the notification
      await addDoc(collection(db, 'notifications'), {
        userId: invitedUserId, // The user being invited
        type: 'INVITATION',
        senderId: currentUser.uid,
        senderName: senderName,
        teamId: teamId,
        teamName: teamName,
        createdAt: serverTimestamp(),
        isRead: false,
      });

      setSuccess(`Invitation sent to ${email}!`);
      setEmail(''); // Clear input
      setTimeout(onClose, 2000); // Close modal after 2s

    } catch (err) {
      console.error('Error sending invitation:', err);
      setError('Failed to send invitation. Please try again.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setError('');
    setSuccess('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800">Invite Member</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        {success && <p className="text-green-500 text-sm mb-3">{success}</p>}
        <div className="space-y-4">
          <div>
            <label htmlFor="inviteEmail" className="block text-sm font-medium text-gray-700 mb-1">
              User's Email
            </label>
            <input
              type="email"
              id="inviteEmail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., teammate@example.com"
              className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6 border-t pt-4">
          <button onClick={handleClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
            Cancel
          </button>
          <button
            onClick={handleInvite}
            disabled={isInviting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isInviting ? 'Sending...' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InviteMemberModal;