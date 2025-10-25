import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import {
  doc,
  updateDoc,
  serverTimestamp,
  deleteDoc
} from "firebase/firestore";

/* ------------------------------------------------------------------
  EditUpdateModal: edits announcement or meeting in teams/{teamId}/announcements/{updateId}
  - For type === 'announcement' -> edit text
  - For type === 'meeting' -> edit title, description, meetingLink, startDateTime, endDateTime
-------------------------------------------------------------------*/
function EditUpdateModal({ isOpen, onClose, teamId, updateId, updateType, initialData, onSaved }) { // Removed default {}
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // --- FIX: Use optional chaining (?.) in case initialData is null ---
  // Announcement fields
  const [text, setText] = useState(initialData?.text || '');

  // Meeting fields
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [meetingLink, setMeetingLink] = useState(initialData?.meetingLink || '');
  
  // store ISO local date-time strings for inputs (YYYY-MM-DDTHH:mm)
  const tsToLocalInput = (ts) => {
    if (!ts) return '';
    try {
      const d = (ts && typeof ts.toDate === 'function') ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
      if (isNaN(d)) return '';
      const iso = d.toISOString();
      return iso.slice(0, 16); // Returns YYYY-MM-DDTHH:mm
    } catch (err) {
      console.error('tsToLocalInput error', err, ts);
      return '';
    }
  };

  // --- FIX: Use optional chaining (?.) here as well ---
  const [startDateTimeLocal, setStartDateTimeLocal] = useState(tsToLocalInput(initialData?.startDateTime));
  const [endDateTimeLocal, setEndDateTimeLocal] = useState(tsToLocalInput(initialData?.endDateTime));

  useEffect(() => {
    if (!isOpen) return;
    // initialize from initialData each time modal opens
    // This effect will run AFTER the component has rendered and hooks are set
    setError('');
    
    // We also use optional chaining here for safety
    if (updateType === 'announcement') {
      setText(initialData?.text || '');
    } else {
      setTitle(initialData?.title || '');
      setDescription(initialData?.description || '');
      setMeetingLink(initialData?.meetingLink || '');
      setStartDateTimeLocal(tsToLocalInput(initialData?.startDateTime));
      setEndDateTimeLocal(tsToLocalInput(initialData?.endDateTime));
    }
  }, [isOpen, initialData, updateType]);

  // This is the most important guard:
  // If the modal isn't open, don't render its contents.
  // This also prevents errors if initialData is null because the component won't render.
  if (!isOpen) return null;

  const close = () => {
    if (typeof onClose === 'function') onClose();
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      const ref = doc(db, `teams/${teamId}/announcements`, updateId);
      if (updateType === 'announcement') {
        await updateDoc(ref, {
          text: text || '',
          updatedAt: serverTimestamp()
        });
      } else {
        // meeting
        const toUpdate = {
          title: title || '',
          description: description || '',
          meetingLink: meetingLink || '',
          updatedAt: serverTimestamp()
        };

        // convert local inputs back to Date objects
        if (startDateTimeLocal) {
          const s = new Date(startDateTimeLocal);
          if (!isNaN(s)) toUpdate.startDateTime = s;
        } else {
          toUpdate.startDateTime = null;
        }
        if (endDateTimeLocal) {
          const e = new Date(endDateTimeLocal);
          if (!isNaN(e)) toUpdate.endDateTime = e;
        } else {
          toUpdate.endDateTime = null;
        }

        await updateDoc(ref, toUpdate);
      }

      if (typeof onSaved === 'function') onSaved();
      close();
    } catch (err) {
      console.error("Failed to save update:", err);
      setError("Failed to save. See console.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = window.confirm("Delete this item? This action cannot be undone.");
    if (!ok) return;
    try {
      const ref = doc(db, `teams/${teamId}/announcements`, updateId);
      await deleteDoc(ref);
      if (typeof onSaved === 'function') onSaved();
      close();
    } catch (err) {
      console.error("Failed to delete:", err);
      setError("Failed to delete. See console.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800">{updateType === 'announcement' ? 'Edit Announcement' : 'Edit Meeting'}</h3>
          <button onClick={close} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>

        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

        {updateType === 'announcement' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Announcement Text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full border rounded p-2"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
              <input type="datetime-local" value={startDateTimeLocal} onChange={(e) => setStartDateTimeLocal(e.target.value)} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
              <input type="datetime-local" value={endDateTimeLocal} onChange={(e) => setEndDateTimeLocal(e.target.value)} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Link</label>
              <input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full border rounded p-2" />
            </div>
          </div>
        )}

        <div className="flex justify-between items-center gap-2 mt-6 border-t pt-4">
          <div className="flex items-center gap-2">
            <button onClick={handleDelete} className="px-3 py-2 bg-red-100 text-red-700 rounded text-sm">Delete</button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={close} className="px-3 py-2 bg-gray-200 rounded">Cancel</button>
            <button onClick={handleSave} disabled={isSaving} className="px-3 py-2 bg-blue-600 text-white rounded">
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditUpdateModal;