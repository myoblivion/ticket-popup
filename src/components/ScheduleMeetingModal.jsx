import React, { useState } from 'react';
import { db } from '../firebaseConfig'; // Import db
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'; // Import Firestore functions
import { auth } from '../firebaseConfig'; // Import auth to get current user

const ScheduleMeetingModal = ({ isOpen, onClose, teamId, onMeetingScheduled }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSchedule = async () => {
    if (!title.trim() || !startDate || !startTime) {
      setError("Meeting title, start date, and start time are required.");
      return;
    }
    if (!auth.currentUser) {
        setError("You must be logged in to schedule a meeting.");
        return;
    }

    setIsScheduling(true);
    setError('');
    try {
      const startDateTime = new Date(`${startDate}T${startTime}`);
      let endDateTime = null;
      if (endDate && endTime) {
        endDateTime = new Date(`${endDate}T${endTime}`);
        // Basic validation: ensure end time is not before start time
        if (endDateTime <= startDateTime) {
          setError("End time cannot be before or the same as start time.");
          setIsScheduling(false);
          return;
        }
      }

      await addDoc(collection(db, `teams/${teamId}/announcements`), {
        type: 'meeting',
        title: title,
        description: description,
        startDateTime: startDateTime,
        endDateTime: endDateTime,
        meetingLink: meetingLink.trim() || null,
        createdBy: auth.currentUser.uid,
        creatorDisplayName: auth.currentUser.displayName || auth.currentUser.email,
        createdAt: serverTimestamp(),
      });

      setTitle('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setStartTime('');
      setEndTime('');
      setMeetingLink('');
      onClose();
      if (onMeetingScheduled) {
        onMeetingScheduled();
      }
    } catch (err) {
      console.error("Error scheduling meeting:", err);
      setError("Failed to schedule meeting. Please try again.");
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800">Schedule Meeting</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <div className="space-y-4"> {/* Increased spacing for better readability */}
            {/* Title */}
            <div>
                <label htmlFor="meetingTitle" className="block text-sm font-medium text-gray-700 mb-1">Meeting Title <span className="text-red-500">*</span></label>
                <input type="text" id="meetingTitle" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Weekly Sync, Project Brainstorm" className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500" required/>
            </div>

            {/* Description */}
            <div>
                <label htmlFor="meetingDescription" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea id="meetingDescription" value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief agenda or purpose of the meeting..." rows="3" className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"/>
            </div>

            {/* Start Date & Time */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 gap-3">
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500" required/>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500" required/>
                </div>
            </div>

            {/* End Date & Time */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End (Optional)</label>
                <div className="grid grid-cols-2 gap-3">
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"/>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"/>
                </div>
            </div>

            {/* Meeting Link */}
            <div>
                <label htmlFor="meetingLink" className="block text-sm font-medium text-gray-700 mb-1">Meeting Link (Optional)</label>
                <input type="url" id="meetingLink" value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="e.g., https://meet.google.com/abc-xyz" className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"/>
            </div>
        </div>
        <div className="flex justify-end gap-2 mt-6 border-t pt-4"> {/* Adjusted top margin and padding */}
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
            <button onClick={handleSchedule} disabled={!title.trim() || !startDate || !startTime || isScheduling} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                {isScheduling ? 'Scheduling...' : 'Schedule Meeting'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleMeetingModal;