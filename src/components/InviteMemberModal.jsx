import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  setDoc
} from 'firebase/firestore';

const InviteMemberModal = ({ isOpen, onClose, teamId, onInvited }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member'); // only 'member' or 'admin'
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setRole('member');
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

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

      // 1. Find user by email
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
      const invitedData = userDoc.data();
      const invitedLabel = invitedData.displayName || invitedData.name || invitedData.email || invitedUserId;

      // --- NEW CHECK #1: Prevent Self-Invite ---
      if (invitedUserId === currentUser.uid) {
        setError("You cannot invite yourself to the team.");
        setIsInviting(false);
        return;
      }

      // --- NEW CHECK #2: Prevent Inviting Master Admin ---
      if (invitedData.role === 'Master Admin') {
        setError('This user is a Master Admin and does not need to be invited.');
        setIsInviting(false);
        return;
      }
      // --- END OF NEW CHECKS ---

      // 2. Get team doc
      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await getDoc(teamRef);

      if (!teamSnap.exists()) {
        setError('Team not found. This should not happen.');
        setIsInviting(false);
        return;
      }

      const teamData = teamSnap.data();
      const members = teamData.members || [];

      // 3. Check if user is already a member
      if (members.includes(invitedUserId)) {
        setError('This user is already a member of the team.');
        setIsInviting(false);
        return;
      }

      // 4. Send notification (invite)
      const senderName = currentUser.displayName || currentUser.email || currentUser.uid;
      await addDoc(collection(db, 'notifications'), {
        userId: invitedUserId,
        type: 'INVITATION',
        senderId: currentUser.uid,
        senderName: senderName,
        teamId: teamId,
        teamName: teamData.teamName || 'Team',
        createdAt: serverTimestamp(),
        isRead: false,
      });

      // 5. Add invited user to team members list and set their role & permissions
      const permsForRole = role === 'admin' ? { announcements: true, schedule: true } : { announcements: false, schedule: false };

      try {
        await updateDoc(teamRef, {
          members: arrayUnion(invitedUserId),
          [`roles.${invitedUserId}`]: role,
          [`permissions.${invitedUserId}`]: permsForRole
        });
      } catch (err) {
        // fallback to setDoc merge if updateDoc fails (shouldn't happen)
        console.warn('updateDoc failed, trying setDoc merge fallback', err);
        await setDoc(teamRef, {
          members: arrayUnion(invitedUserId),
          roles: { [invitedUserId]: role },
          permissions: { [invitedUserId]: permsForRole }
        }, { merge: true });
      }

      setSuccess(`Invitation sent to ${email}!`);
      setEmail('');
      if (typeof onInvited === 'function') onInvited(invitedUserId, invitedLabel);

      setTimeout(() => {
        if (typeof onClose === 'function') onClose();
      }, 900);
    } catch (err) {
      console.error('Error sending invitation:', err);
      setError('Failed to send invitation. Please try again.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setRole('member');
    setError('');
    setSuccess('');
    if (typeof onClose === 'function') onClose();
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
            <label htmlFor="inviteEmail" className="block text-sm font-medium text-gray-700 mb-1">User's Email</label>
            <input
              type="email"
              id="inviteEmail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., teammate@example.com"
              className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full p-2 border rounded">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Admin will automatically have access to Announcements and Schedule.</p>
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