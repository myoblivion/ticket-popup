import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebaseConfig';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  getDoc,
  writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Link } from 'react-router-dom';

// Spinner component
const Spinner = () => (
  <div className="flex justify-center items-center py-10">
    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

const NotificationsModal = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!isOpen || !currentUser) {
      if (!currentUser) setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setNotifications(notifs);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching notifications:', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen, currentUser]);

  const handleAcceptInvite = async (notification) => {
    if (!currentUser) return;
    try {
      // 1. Add user to the team's members array
      const teamRef = doc(db, 'teams', notification.teamId);
      await updateDoc(teamRef, {
        members: arrayUnion(currentUser.uid),
      });

      // 2. (Optional but good) Add team to user's profile
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        teams: arrayUnion(notification.teamId),
      });
      
      // 3. Delete the notification
      await deleteDoc(doc(db, 'notifications', notification.id));

    } catch (error) {
      console.error('Error accepting invite:', error);
    }
  };

  const handleDeclineInvite = async (notificationId) => {
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (error) {
      console.error('Error declining invite:', error);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        isRead: true,
      });
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!currentUser) return;
    const batch = writeBatch(db);
    notifications.forEach(notif => {
        if (!notif.isRead) {
            const notifRef = doc(db, 'notifications', notif.id);
            batch.update(notifRef, { isRead: true });
        }
    });
    try {
        await batch.commit();
    } catch (error) {
        console.error("Error marking all as read:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-end z-50 p-4 pt-20">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-xl font-semibold text-gray-800">Notifications</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
        </div>
        {isLoading ? (
          <Spinner />
        ) : notifications.length === 0 ? (
          <p className="text-gray-500 text-center p-10">You have no notifications.</p>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <ul className="divide-y divide-gray-200">
              {notifications.map((notif) => (
                <li key={notif.id} className={`p-4 ${!notif.isRead ? 'bg-blue-50' : 'bg-white'}`}>
                  {notif.type === 'INVITATION' && (
                    <>
                      <p className="text-sm">
                        <span className="font-semibold">{notif.senderName}</span> invited you to join{' '}
                        <span className="font-semibold">{notif.teamName}</span>.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleAcceptInvite(notif)}
                          className="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleDeclineInvite(notif.id)}
                          className="text-xs px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                        >
                          Decline
                        </button>
                      </div>
                    </>
                  )}
                  {notif.type === 'ANNOUNCEMENT' && (
                    <Link to={`/team/${notif.teamId}`} onClick={() => { markAsRead(notif.id); onClose(); }}>
                      <p className="text-sm">
                        <span className="font-semibold">{notif.senderName}</span> made an announcement in{' '}
                        <span className="font-semibold">{notif.teamName}</span>:
                      </p>
                      <p className="text-sm text-gray-600 mt-1 truncate">"{notif.title}"</p>
                    </Link>
                  )}
                  {notif.type === 'MEETING' && (
                    <Link to={`/team/${notif.teamId}`} onClick={() => { markAsRead(notif.id); onClose(); }}>
                      <p className="text-sm">
                        <span className="font-semibold">{notif.senderName}</span> scheduled a meeting in{' '}
                        <span className="font-semibold">{notif.teamName}</span>:
                      </p>
                      <p className="text-sm text-gray-600 mt-1 truncate">"{notif.title}"</p>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {notifications.length > 0 && (
            <div className="p-2 border-t text-center">
                <button 
                    onClick={markAllAsRead} 
                    className="text-sm text-blue-600 hover:underline"
                >
                    Mark all as read
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsModal;