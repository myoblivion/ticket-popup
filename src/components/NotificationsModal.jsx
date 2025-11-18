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
  const [userTeams, setUserTeams] = useState([]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            setUserTeams(userDocSnap.data().teams || []);
          } else {
            console.warn("User document not found, cannot filter team notifications.");
            setUserTeams([]);
          }
        } catch (error) {
          console.error("Error fetching user's team data:", error);
          setUserTeams([]);
        }
      } else {
        setUserTeams([]);
      }
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
        const notifs = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter(notif => {
            // Always show personal invites or mentions
            if (notif.type === 'INVITATION' || notif.type === 'MENTION') {
              return true; 
            }
            // For team-wide stuff, check membership
            return userTeams.includes(notif.teamId);
          });
          
        setNotifications(notifs);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching notifications:', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen, currentUser, userTeams]);

  const handleAcceptInvite = async (notification) => {
    if (!currentUser) return;
    try {
      const teamRef = doc(db, 'teams', notification.teamId);
      await updateDoc(teamRef, {
        members: arrayUnion(currentUser.uid),
      });

      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        teams: arrayUnion(notification.teamId),
      });
      
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

  const handleMarkAsReadOnHover = (notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
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
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 z-50"
      onClick={onClose}
    >
      <div
        className="absolute top-20 right-8 bg-white rounded-lg shadow-xl w-full max-w-md max-h-[calc(100vh-120px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* --- Header (sticky) --- */}
        <div className="flex justify-between items-center p-4 border-b flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-800">Notifications</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
        </div>

        {/* --- Content --- */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <Spinner />
          ) : notifications.length === 0 ? (
            <p className="text-gray-500 text-center p-10">You have no notifications.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {notifications.map((notif) => (
                <li 
                  key={notif.id} 
                  className={`p-4 ${!notif.isRead ? 'bg-blue-50' : 'bg-white'}`}
                  onMouseEnter={() => handleMarkAsReadOnHover(notif)}
                >
                  {/* --- 1. INVITATION TYPE --- */}
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

                  {/* --- 2. ANNOUNCEMENT TYPE --- */}
                  {notif.type === 'ANNOUNCEMENT' && (
                    <Link to={`/team/${notif.teamId}`} onClick={() => { markAsRead(notif.id); onClose(); }}>
                      <p className="text-sm">
                        <span className="font-semibold">{notif.senderName}</span> made an announcement in{' '}
                        <span className="font-semibold">{notif.teamName}</span>:
                      </p>
                      <p className="text-sm text-gray-600 mt-1 truncate">"{notif.title}"</p>
                    </Link>
                  )}

                  {/* --- 3. MEETING TYPE --- */}
                  {notif.type === 'MEETING' && (
                    <Link to={`/team/${notif.teamId}`} onClick={() => { markAsRead(notif.id); onClose(); }}>
                      <p className="text-sm">
                        <span className="font-semibold">{notif.senderName}</span> scheduled a meeting in{' '}
                        <span className="font-semibold">{notif.teamName}</span>:
                      </p>
                      <p className="text-sm text-gray-600 mt-1 truncate">"{notif.title}"</p>
                    </Link>
                  )}

                  {/* --- 4. MENTION TYPE (NEW) --- */}
                  {notif.type === 'MENTION' && (
                    <Link 
                        // Deep link to open the Task Detail Modal directly
                        to={`/team/${notif.teamId}/task/${notif.taskId}`} 
                        onClick={() => { markAsRead(notif.id); onClose(); }}
                    >
                      <div className="flex items-start gap-2">
                          <div className="text-blue-500 mt-0.5">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                          </div>
                          <div>
                              <p className="text-sm">
                                <span className="font-semibold">{notif.senderName}</span> mentioned you in a comment.
                              </p>
                              <p className="text-xs text-gray-500 mt-1">Task: {notif.taskTitle || notif.taskId}</p>
                              <p className="text-sm text-gray-600 mt-1 line-clamp-2 italic">"{notif.message}"</p>
                          </div>
                      </div>
                    </Link>
                  )}

                </li>
              ))}
            </ul>
          )}
        </div>

        {/* --- Footer (sticky) --- */}
        {notifications.length > 0 && (
            <div className="p-2 border-t text-center flex-shrink-0">
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