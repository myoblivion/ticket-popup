import React from 'react';

const InviteMemberModal = ({ isOpen, onClose, teamId }) => {
  if (!isOpen) return null;

  // TODO: Add form for email input and invite logic
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800">Invite Members</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        <p className="text-sm text-gray-600">Enter email addresses (comma-separated) to invite:</p>
        <input type="email" className="mt-2 w-full p-2 border rounded" placeholder="user@example.com, another@example.com" />
        <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Send Invites</button> {/* TODO: Add onClick handler */}
        </div>
      </div>
    </div>
  );
};

export default InviteMemberModal;