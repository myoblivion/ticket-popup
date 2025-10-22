import React, { useState, useEffect, useRef } from 'react';

// A simple spinner component
const Spinner = () => (
  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
);

const NotePopup = ({ cellLocator, onClose }) => {
  const [note, setNote] = useState('');
  const [imageFileIds, setImageFileIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState({ msg: '', type: '' });
  const editorRef = useRef(null);

  useEffect(() => {
    // Fetch initial data when the component mounts
    const fetchData = async () => {
      if (!cellLocator) return;
      setIsLoading(true);
      try {
        // In a real app, the sheet and cell would be dynamic
        const [sheet, cell] = cellLocator.split('!');
        const response = await fetch(`http://localhost:3001/api/notes/${sheet}/${cell}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        if (data) {
          setNote(data.note || '');
          setImageFileIds(data.imageFileIds ? data.imageFileIds.split(',') : []);
        }
      } catch (error) {
        console.error("Failed to fetch note:", error);
        setStatus({ msg: 'Failed to load data.', type: 'error' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [cellLocator]);
  
  const handleSave = async () => {
    if (!cellLocator || isSaving) return;
    setIsSaving(true);
    setStatus({ msg: 'Saving...', type: 'info' });

    try {
        const [sheet, cell] = cellLocator.split('!');
        const payload = {
            note: editorRef.current.innerHTML,
            imageFileIds: imageFileIds
        };

        const response = await fetch(`http://localhost:3001/api/notes/${sheet}/${cell}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Failed to save.');
        
        setStatus({ msg: 'Saved successfully!', type: 'success' });
        setTimeout(() => setStatus({ msg: '', type: '' }), 3000);

    } catch (error) {
        console.error("Save error:", error);
        setStatus({ msg: 'Save failed.', type: 'error' });
    } finally {
        setIsSaving(false);
    }
  };
  
  // Basic display for images. A real app might handle this better.
  const renderImages = () => {
    return imageFileIds.map(id => (
        <img 
            key={id}
            src={`https://drive.google.com/uc?export=view&id=${id}`}
            alt="Saved content"
            className="max-w-xs rounded-md my-2"
        />
    ));
  };


  return (
    <div className="w-full max-w-2xl h-[600px] bg-white rounded-lg shadow-2xl flex flex-col p-6">
      <div className="flex justify-between items-center border-b pb-3 mb-4">
        <h2 className="text-xl font-semibold text-gray-800">
          Cell Notes & Images: <span className="font-mono text-blue-600">{cellLocator}</span>
        </h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div 
            ref={editorRef}
            contentEditable={true}
            dangerouslySetInnerHTML={{ __html: note }}
            className="flex-1 border rounded-md p-3 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      <div className="mt-4">
        {renderImages()}
      </div>

      <div className="flex justify-between items-center border-t pt-4 mt-4">
        <div className={`text-sm ${
            status.type === 'success' ? 'text-green-600' :
            status.type === 'error' ? 'text-red-600' : 'text-gray-500'
        }`}>
            {status.msg}
        </div>
        <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-semibold">
                Close
            </button>
            <button onClick={handleSave} disabled={isSaving || isLoading} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold disabled:opacity-50">
                {isSaving ? 'Saving...' : 'Save'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default NotePopup;