import React from 'react';

const ColumnActionPopup = ({ isOpen, onClose, targetInfo }) => {
  if (!isOpen) return null;

  return (
    // Simple fixed overlay and centered content
    <div
      className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 p-4"
      onClick={onClose} // Close when clicking the backdrop
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 w-full max-w-xs text-center"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the box
      >
        <h3 className="text-lg font-semibold mb-2 text-gray-800">Popup Opened</h3>
        <p className="text-sm text-gray-600 mb-4">
          You clicked on column: <span className="font-medium">{targetInfo?.column}</span> <br/>
          For task ID: <span className="font-medium">{targetInfo?.taskId}</span>
        </p>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default ColumnActionPopup;