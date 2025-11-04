import React, { useState } from 'react';
import { db } from '../firebaseConfig'; // Import db
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  getDoc,
  writeBatch
} from 'firebase/firestore'; // Import Firestore functions
import { auth } from '../firebaseConfig'; // Import auth to get current user

// UPDATED: Now receives 't' prop
const ScheduleMeetingModal = ({ isOpen, onClose, teamId, onMeetingScheduled, t }) => {
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
      setError(t('admin.scheduleErrorRequired', "Meeting title, start date, and start time are required."));
      return;
    }
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError(t('admin.scheduleErrorAuth', "You must be logged in to schedule a meeting."));
      return;
    }

    setIsScheduling(true);
    setError('');
    try {
      const startDateTime = new Date(`${startDate}T${startTime}`);
      let endDateTime = null;
      if (endDate && endTime) {
        endDateTime = new Date(`${endDate}T${endTime}`);
        if (endDateTime <= startDateTime) {
          setError(t('admin.scheduleErrorEndTime', "End time cannot be before or the same as start time."));
          setIsScheduling(false);
          return;
        }
      }

      // --- START: MODIFICATION ---
      // 1. Get team data
      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await getDoc(teamRef);
      if (!teamSnap.exists()) {
        throw new Error(t('admin.scheduleErrorTeamNotFound', 'Team not found'));
      }

      const teamData = teamSnap.data();
      const members = teamData.members || [];
      const teamName = teamData.teamName;
      const creatorName = currentUser.displayName || currentUser.email;

      // 2. Add meeting to announcements subcollection
      await addDoc(collection(db, `teams/${teamId}/announcements`), {
        type: 'meeting',
        title: title,
        description: description,
        startDateTime: startDateTime,
        endDateTime: endDateTime,
        meetingLink: meetingLink.trim() || null,
        createdBy: currentUser.uid,
        creatorDisplayName: creatorName,
        createdAt: serverTimestamp(),
      });

      // 3. Batch-write notifications to all *other* members
      const batch = writeBatch(db);
      members.forEach(memberId => {
        if (memberId !== currentUser.uid) { // Don't notify self
          const notifRef = doc(collection(db, 'notifications')); // Create new doc ref
          batch.set(notifRef, {
            userId: memberId,
            type: 'MEETING',
            senderId: currentUser.uid,
            senderName: creatorName,
            teamId: teamId,
            teamName: teamName,
            title: title,
            createdAt: serverTimestamp(),
            isRead: false,
          });
        }
      });
      await batch.commit();
      // --- END: MODIFICATION ---

      // Reset form
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
      setError(t('admin.scheduleErrorGeneral', "Failed to schedule meeting. Please try again."));
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800">{t('admin.scheduleMeetingTitle', 'Schedule Meeting')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <div className="space-y-4">
          <div>
            <label htmlFor="meetingTitle" className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.meetingTitleLabel', 'Meeting Title')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="meetingTitle"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('admin.meetingTitlePlaceholder', "e.g., Weekly Sync, Project Brainstorm")}
              className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="meetingDescription" className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.meetingDescLabel', 'Description')}
            </label>
            <textarea
              id="meetingDescription"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('admin.meetingDescPlaceholder', "Brief agenda or purpose of the meeting...")}
              rows="3"
              className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.meetingStartLabel', 'Start')} <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.meetingEndLabel', 'End (Optional)')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="meetingLink" className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.meetingLinkLabel', 'Meeting Link (Optional)')}
            </label>
            <input
              type="url"
              id="meetingLink"
              value={meetingLink}
              onChange={e => setMeetingLink(e.target.value)}
              placeholder={t('admin.meetingLinkPlaceholder', "e.g., https://meet.google.com/abc-xyz")}
              className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6 border-t pt-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSchedule}
            disabled={!title.trim() || !startDate || !startTime || isScheduling}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isScheduling ? t('admin.schedulingButton', 'Scheduling...') : t('admin.scheduleButton', 'Schedule Meeting')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleMeetingModal;