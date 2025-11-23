// src/components/ConfirmationModal.jsx
import React, { useContext } from 'react';
import { LanguageContext } from '../contexts/LanguageContext';

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, isDeleting = false }) => {
  const { t } = useContext(LanguageContext);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 transition-opacity">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md transform transition-all scale-100 p-6 border border-gray-200">
        
        <div className="flex items-center gap-3 mb-4">
          {isDeleting && (
            <div className="bg-red-100 p-2 rounded-full text-red-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          )}
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        </div>

        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          {message}
        </p>

        <div className="flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button 
            onClick={onConfirm}
            className={`px-4 py-2 rounded-md text-white text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${isDeleting ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'}`}
          >
            {isDeleting ? t('common.delete', 'Delete') : t('common.confirm', 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;