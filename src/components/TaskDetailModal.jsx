import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  doc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  getDocs,
  getDoc
} from "firebase/firestore";
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "firebase/storage"; // Import Storage functions
import { db, auth, storage } from '../firebaseConfig'; // Ensure 'storage' is exported from your config
import { LanguageContext } from '../contexts/LanguageContext';

const Spinner = () => (
  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
);

const TaskDetailModal = ({ isOpen, onClose, taskId, teamId, teamMembers = [] }) => {
  const { t } = useContext(LanguageContext);
  
  // --- Main Data State ---
  const [taskData, setTaskData] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- History State ---
  const [showHistory, setShowHistory] = useState(false);
  const [assignmentHistory, setAssignmentHistory] = useState([]);
  const [workHistory, setWorkHistory] = useState([]);

  // --- Comment State ---
  const [commentTab, setCommentTab] = useState('ko');
  const [commentText, setCommentText] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [comments, setComments] = useState([]);

  // --- Attachment State ---
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState([]); // Files waiting to be posted
  const fileInputRef = useRef(null); // For generic files
  const imageInputRef = useRef(null); // For images only

  // --- Modal State ---
  const [isAssigneeModalOpen, setIsAssigneeModalOpen] = useState(false);

  // ----------------------------------------------------------------
  // 1. INITIAL DATA FETCHING
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !taskId || !teamId) return;
    setLoading(true);

    // Listener for Task Details
    const taskRef = doc(db, 'teams', teamId, 'tasks', taskId);
    const unsubTask = onSnapshot(taskRef, (snap) => {
      if (snap.exists()) {
        setTaskData({ id: snap.id, ...snap.data() });
      }
      setLoading(false);
    });

    // Listener for Comments
    const commentsRef = collection(db, 'teams', teamId, 'tasks', taskId, 'comments');
    const qComments = query(commentsRef, orderBy('createdAt', 'desc'));
    const unsubComments = onSnapshot(qComments, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubTask();
      unsubComments();
    };
  }, [isOpen, taskId, teamId]);

  // Fetch History only when expanded
  useEffect(() => {
    if (!showHistory || !taskId || !teamId) return;

    const fetchHistories = async () => {
      try {
        const assignRef = collection(db, 'teams', teamId, 'tasks', taskId, 'assignmentHistory');
        const qAssign = query(assignRef, orderBy('assignedAt', 'desc'));
        const assignSnap = await getDocs(qAssign);
        setAssignmentHistory(assignSnap.docs.map(d => d.data()));

        const workRef = collection(db, 'teams', teamId, 'tasks', taskId, 'workHistory');
        const qWork = query(workRef, orderBy('endTime', 'desc'));
        const workSnap = await getDocs(qWork);
        setWorkHistory(workSnap.docs.map(d => d.data()));
      } catch (err) {
        console.error("Error fetching history", err);
      }
    };
    fetchHistories();
  }, [showHistory, taskId, teamId]);


  // ----------------------------------------------------------------
  // 2. TASK FIELD HANDLERS
  // ----------------------------------------------------------------
  const handleUpdateField = async (field, value) => {
    if (!taskData) return;
    try {
      const taskRef = doc(db, 'teams', teamId, 'tasks', taskId);
      await updateDoc(taskRef, { [field]: value });
    } catch (error) {
      console.error("Error updating field:", error);
    }
  };

  const handleAddAssignee = async (memberUid) => {
    if (taskData.assignees?.some(a => a.uid === memberUid)) return;

    const member = teamMembers.find(m => m.uid === memberUid);
    const assigneeObj = {
      uid: memberUid,
      displayName: member?.displayName || 'Unknown',
      status: 'Assigned',
      assignedAt: new Date()
    };

    const taskRef = doc(db, 'teams', teamId, 'tasks', taskId);
    const historyRef = collection(db, 'teams', teamId, 'tasks', taskId, 'assignmentHistory');

    await updateDoc(taskRef, { assignees: arrayUnion(assigneeObj) });

    const user = auth.currentUser;
    await addDoc(historyRef, {
      assignerName: user.displayName || user.email || 'Admin',
      workerName: member?.displayName || 'Unknown',
      assignedAt: serverTimestamp()
    });

    setIsAssigneeModalOpen(false);
  };

  const handleStopWork = async (assignee) => {
    if (!assignee.currentSessionStart) {
      alert("No active session found for this user.");
      return;
    }
    const endTime = new Date();
    const startTime = assignee.currentSessionStart.toDate ? assignee.currentSessionStart.toDate() : new Date(assignee.currentSessionStart);
    const diffSeconds = Math.floor((endTime - startTime) / 1000);

    const updatedAssignees = taskData.assignees.map(a => {
      if (a.uid === assignee.uid) {
        return { ...a, status: 'Stop Work', currentSessionStart: null };
      }
      return a;
    });

    const taskRef = doc(db, 'teams', teamId, 'tasks', taskId);
    await updateDoc(taskRef, { assignees: updatedAssignees });

    const workRef = collection(db, 'teams', teamId, 'tasks', taskId, 'workHistory');
    await addDoc(workRef, {
      workerName: assignee.displayName,
      startTime: startTime,
      endTime: endTime,
      workTimeSeconds: diffSeconds
    });
  };
  
  const handleStartWork = async (assignee) => {
    const updatedAssignees = taskData.assignees.map(a => {
        if (a.uid === assignee.uid) {
          return { ...a, status: 'In Progress', currentSessionStart: new Date() };
        }
        return a;
    });
  
    const taskRef = doc(db, 'teams', teamId, 'tasks', taskId);
    await updateDoc(taskRef, { assignees: updatedAssignees, actualStartDate: taskData.actualStartDate || serverTimestamp() });
  };


  // ----------------------------------------------------------------
  // 3. ATTACHMENT HANDLERS (Upload & Paste)
  // ----------------------------------------------------------------
  const uploadFileToStorage = async (file) => {
    if (!file) return;
    setIsUploading(true);
    try {
      // Path: task_attachments/{taskId}/{timestamp}_{filename}
      const storagePath = `task_attachments/${taskId}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      // Add to pending attachments state
      const newAttachment = {
        name: file.name,
        url: url,
        type: file.type // 'image/png', 'application/pdf', etc.
      };

      setPendingAttachments(prev => [...prev, newAttachment]);
    } catch (error) {
      console.error("Upload failed:", error);
      alert("File upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  // Handle clicking the icons
  const handleFileIconClick = () => fileInputRef.current.click();
  const handleImageIconClick = () => imageInputRef.current.click();

  // Handle file selection from inputs
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadFileToStorage(e.target.files[0]);
    }
  };

  // Handle CTRL+V (Paste) on textarea
  const handlePaste = (e) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault(); // Prevent default paste behavior if it's a file
      const file = e.clipboardData.files[0];
      uploadFileToStorage(file);
    }
  };

  const handleRemovePendingAttachment = (index) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };


  // ----------------------------------------------------------------
  // 4. COMMENT HANDLERS
  // ----------------------------------------------------------------
  const handlePostComment = async () => {
    if ((!commentText.trim() && pendingAttachments.length === 0) || isUploading) return;

    const translations = {
      [commentTab]: commentText,
      [commentTab === 'ko' ? 'en' : 'ko']: t('taskDetail.translationPending') 
    };

    const user = auth.currentUser;
    // Robust Name Check: DisplayName -> Email -> Fallback
    const safeCreatorName = user.displayName || user.email || 'Unknown User';

    const commentRef = collection(db, 'teams', teamId, 'tasks', taskId, 'comments');
    
    await addDoc(commentRef, {
      creatorUid: user.uid,
      creatorName: safeCreatorName,
      translations,
      recipients: selectedRecipients,
      attachments: pendingAttachments, // Save the uploaded file URLs
      createdAt: serverTimestamp()
    });

    // Reset form
    setCommentText('');
    setSelectedRecipients([]);
    setPendingAttachments([]);
  };

  const handleDeleteComment = async (commentId) => {
    if(!window.confirm(t('taskDetail.confirmDeleteComment'))) return;
    try {
        const commentDocRef = doc(db, 'teams', teamId, 'tasks', taskId, 'comments', commentId);
        await deleteDoc(commentDocRef);
    } catch (err) {
        console.error("Error deleting comment:", err);
        alert("Failed to delete comment");
    }
  };

  // ----------------------------------------------------------------
  // 5. RENDER
  // ----------------------------------------------------------------

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto flex flex-col">
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{t('taskDetail.title')}</h2>
            <p className="text-sm text-gray-500">ID: {taskId}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center"><Spinner /></div>
        ) : (
          <div className="p-6 space-y-8">

            {/* --- INFO SECTION --- */}
            <div className="bg-white rounded-lg border p-5 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-gray-800">{t('taskDetail.infoTitle')}</h3>
                    <button className="bg-blue-500 text-white text-xs px-3 py-1 rounded hover:bg-blue-600">
                        + {t('taskDetail.show')}
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">{t('taskDetail.creationDate')}</label>
                        <div className="p-2 bg-gray-50 rounded border text-sm text-gray-600">
                           {taskData.createdAt?.toDate ? taskData.createdAt.toDate().toLocaleString() : '-'}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">{t('taskDetail.goalDueDate')}</label>
                        <input 
                           type="date" 
                           className="w-full p-2 border rounded text-sm"
                           value={taskData.companyGoalDueDate || ''}
                           onChange={(e) => handleUpdateField('companyGoalDueDate', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">{t('taskDetail.phase')}</label>
                        <select 
                            className="w-full p-2 border rounded text-sm bg-white"
                            value={taskData.taskPhase || 'Not Started'}
                            onChange={(e) => handleUpdateField('taskPhase', e.target.value)}
                        >
                            <option value="Not Started">Not Started</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Review">Review</option>
                            <option value="Completed">Completed</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">{t('taskDetail.priority')}</label>
                        <select 
                            className="w-full p-2 border rounded text-sm bg-white"
                            value={taskData.taskPriority || 'Normal'}
                            onChange={(e) => handleUpdateField('taskPriority', e.target.value)}
                        >
                            <option value="Low">Low</option>
                            <option value="Normal">Normal</option>
                            <option value="Urgent">Urgent</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">{t('taskDetail.actualStartDate')}</label>
                        <div className="p-2 bg-gray-50 rounded border text-sm text-gray-600">
                             {taskData.actualStartDate?.toDate ? taskData.actualStartDate.toDate().toLocaleString() : '-'}
                        </div>
                    </div>
                    <div>
                         <label className="block text-xs font-bold text-gray-700 mb-1">{t('taskDetail.actualCompletionDate')}</label>
                         <div className="p-2 bg-gray-50 rounded border text-sm text-gray-600">
                             {taskData.actualCompletionDate?.toDate ? taskData.actualCompletionDate.toDate().toLocaleString() : '-'}
                        </div>
                    </div>
                </div>
            </div>

            {/* --- ASSIGNEES SECTION --- */}
            <div className="bg-white rounded-lg border p-5 shadow-sm">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-blue-600">{t('taskDetail.assignedEmployees')}</h3>
                </div>
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold text-sm">{t('taskDetail.assignees')}</h4>
                        <button onClick={() => setIsAssigneeModalOpen(true)} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs shadow-sm">
                            + {t('taskDetail.setAssignee')}
                        </button>
                    </div>
                    <div className="bg-gray-50 p-4 rounded border min-h-[60px]">
                        {(!taskData.assignees || taskData.assignees.length === 0) && (
                            <p className="text-gray-400 text-sm italic">{t('admin.noMembers')}</p>
                        )}
                        <ul className="space-y-2">
                            {taskData.assignees?.map((assignee, idx) => (
                                <li key={idx} className="flex items-center justify-between bg-white p-2 rounded border shadow-sm">
                                    <span className="text-sm font-medium text-gray-700">
                                        • {assignee.displayName} <span className="text-gray-400 text-xs">({assignee.status})</span>
                                    </span>
                                    <div className="space-x-2">
                                        {assignee.status !== 'In Progress' && (
                                            <button onClick={() => handleStartWork(assignee)} className="text-green-600 text-xs border border-green-600 px-2 py-1 rounded hover:bg-green-50">
                                                {t('taskDetail.startWork')}
                                            </button>
                                        )}
                                        {assignee.status === 'In Progress' && (
                                            <button onClick={() => handleStopWork(assignee)} className="text-red-600 text-xs border border-red-600 px-2 py-1 rounded hover:bg-red-50">
                                                {t('taskDetail.stopWork')}
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                <div>
                     <h4 className="font-semibold text-sm mb-2">{t('taskDetail.deploymentStage')}</h4>
                     <select 
                        className="border rounded px-3 py-2 text-sm w-40"
                        value={taskData.deploymentStage || 'Not Yet'}
                        onChange={(e) => handleUpdateField('deploymentStage', e.target.value)}
                     >
                         <option value="Not Yet">Not Yet</option>
                         <option value="Staging">Staging</option>
                         <option value="Production">Production</option>
                     </select>
                </div>
            </div>

            {/* --- HISTORY SECTION --- */}
            <div className="bg-white rounded-lg border p-5 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-gray-800">{t('taskDetail.historyTitle')}</h3>
                    <button onClick={() => setShowHistory(!showHistory)} className="bg-blue-500 text-white text-xs px-3 py-1 rounded hover:bg-blue-600">
                        {showHistory ? `- ${t('taskDetail.hide')}` : `+ ${t('taskDetail.show')}`}
                    </button>
                </div>
                {showHistory && (
                    <div className="space-y-6 animate-fadeIn">
                        <div>
                            <h4 className="font-semibold text-sm mb-2">{t('taskDetail.changeHistory')}</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left text-gray-500">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2">{t('taskDetail.assigner')}</th>
                                            <th className="px-4 py-2">{t('taskDetail.worker')}</th>
                                            <th className="px-4 py-2">{t('taskDetail.assignmentTime')}</th>
                                            <th className="px-4 py-2">{t('taskDetail.unassignmentTime')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {assignmentHistory.length > 0 ? assignmentHistory.map((h, i) => (
                                            <tr key={i} className="bg-white border-b">
                                                <td className="px-4 py-2 font-medium">{h.assignerName}</td>
                                                <td className="px-4 py-2">{h.workerName}</td>
                                                <td className="px-4 py-2">{h.assignedAt?.toDate().toLocaleString()}</td>
                                                <td className="px-4 py-2">-</td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="4" className="px-4 py-4 text-center bg-blue-50 text-gray-400">{t('taskDetail.noHistory')}</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div>
                            <h4 className="font-semibold text-sm mb-2">{t('taskDetail.workHistory')}</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left text-gray-500">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2">{t('taskDetail.worker')}</th>
                                            <th className="px-4 py-2">{t('taskDetail.start')}</th>
                                            <th className="px-4 py-2">{t('taskDetail.end')}</th>
                                            <th className="px-4 py-2">{t('taskDetail.workTime')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {workHistory.length > 0 ? workHistory.map((h, i) => (
                                            <tr key={i} className="bg-white border-b">
                                                <td className="px-4 py-2 font-medium">{h.workerName}</td>
                                                <td className="px-4 py-2">{h.startTime?.toDate().toLocaleString()}</td>
                                                <td className="px-4 py-2">{h.endTime?.toDate().toLocaleString()}</td>
                                                <td className="px-4 py-2">{h.workTimeSeconds}s</td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="4" className="px-4 py-4 text-center bg-blue-50 text-gray-400">{t('taskDetail.noHistory')}</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* --- COMMENTS SECTION --- */}
            <div className="bg-white rounded-lg border p-5 shadow-sm">
                <h3 className="font-bold text-lg text-gray-800 mb-4">{t('taskDetail.commentsTitle')}</h3>

                {/* Comment List */}
                <div className="space-y-4 mb-6 max-h-60 overflow-y-auto">
                    {comments.map(c => (
                        <div key={c.id} className="border rounded p-3 bg-gray-50 group relative">
                            {/* Delete Button */}
                            {auth.currentUser?.uid === c.creatorUid && (
                                <button 
                                    onClick={() => handleDeleteComment(c.id)}
                                    className="absolute top-2 right-2 text-gray-400 hover:text-red-600 p-1"
                                    title={t('common.delete')}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            )}
                            <div className="flex justify-between mb-1 pr-6">
                                <span className="font-bold text-sm">{c.creatorName}</span>
                                <span className="text-xs text-gray-400">{c.createdAt?.toDate().toLocaleString()}</span>
                            </div>
                            
                            {/* Comment Body */}
                            <div className="text-sm text-gray-700 whitespace-pre-wrap">
                                {c.translations?.[commentTab] || c.translations?.['en'] || c.translations?.['ko']}
                            </div>

                            {/* Render Attachments in History */}
                            {c.attachments && c.attachments.length > 0 && (
                                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {c.attachments.map((att, idx) => (
                                        <div key={idx} className="relative group border rounded overflow-hidden bg-gray-100">
                                            {att.type?.startsWith('image/') ? (
                                                <a href={att.url} target="_blank" rel="noreferrer">
                                                    <img src={att.url} alt={att.name} className="h-20 w-full object-cover" />
                                                </a>
                                            ) : (
                                                <a href={att.url} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center h-20 p-2 text-blue-600 hover:underline">
                                                    <span className="text-2xl">📄</span>
                                                    <span className="text-xs truncate w-full text-center">{att.name}</span>
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Recipients Tag */}
                            {c.recipients && c.recipients.length > 0 && (
                                <div className="mt-2 text-xs text-blue-600 bg-blue-50 inline-block px-2 py-1 rounded">
                                    {t('taskDetail.to')} {teamMembers.filter(m => c.recipients.includes(m.uid)).map(m => m.displayName).join(', ')}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Input Controls */}
                <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-center mb-2">
                         <span className="text-xs font-bold">{t('taskDetail.recipient')}</span>
                         <div className="flex gap-2">
                             {teamMembers.map(member => (
                                 <label key={member.uid} className="flex items-center space-x-1 text-xs cursor-pointer">
                                     <input 
                                        type="checkbox" 
                                        checked={selectedRecipients.includes(member.uid)}
                                        onChange={(e) => {
                                            if(e.target.checked) setSelectedRecipients(prev => [...prev, member.uid]);
                                            else setSelectedRecipients(prev => prev.filter(id => id !== member.uid));
                                        }}
                                     />
                                     <span>{member.displayName}</span>
                                 </label>
                             ))}
                         </div>
                    </div>

                    <div className="flex gap-1 border-b mb-2">
                        <button 
                            onClick={() => setCommentTab('ko')}
                            className={`px-4 py-1 text-sm rounded-t ${commentTab === 'ko' ? 'bg-white border border-b-0 font-bold' : 'bg-gray-100 text-gray-500'}`}
                        >
                            {t('taskDetail.korean')}
                        </button>
                        <button 
                             onClick={() => setCommentTab('en')}
                             className={`px-4 py-1 text-sm rounded-t ${commentTab === 'en' ? 'bg-white border border-b-0 font-bold' : 'bg-gray-100 text-gray-500'}`}
                        >
                            {t('taskDetail.english')}
                        </button>
                    </div>

                    {/* Main Text Input + Paste Handler */}
                    <textarea 
                        className="w-full border rounded p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                        rows="3"
                        placeholder={commentTab === 'ko' ? t('taskDetail.placeholderKo') : t('taskDetail.placeholderEn')}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onPaste={handlePaste} // <--- Handle Paste Image
                    ></textarea>

                    {/* Pending Attachments Preview */}
                    {pendingAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {pendingAttachments.map((att, i) => (
                                <div key={i} className="relative border p-1 rounded bg-white flex items-center gap-2 pr-7">
                                    <span className="text-xs text-gray-600 max-w-[100px] truncate">{att.name}</span>
                                    <button 
                                        onClick={() => handleRemovePendingAttachment(i)}
                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-red-500 hover:text-red-700"
                                    >
                                        &times;
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-between items-center mt-2">
                        <div className="flex gap-2 text-gray-500">
                            {/* Hidden Inputs */}
                            <input 
                                type="file" 
                                ref={imageInputRef} 
                                className="hidden" 
                                accept="image/*" 
                                onChange={handleFileChange} 
                            />
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                onChange={handleFileChange} 
                            />

                            {/* Icons */}
                            <button 
                                onClick={handleImageIconClick}
                                className="hover:bg-gray-200 p-1 rounded" 
                                title="Upload Image"
                                disabled={isUploading}
                            >
                                📷
                            </button>
                            <button 
                                onClick={handleFileIconClick}
                                className="hover:bg-gray-200 p-1 rounded" 
                                title="Upload File"
                                disabled={isUploading}
                            >
                                📁
                            </button>
                            {isUploading && <span className="text-xs text-blue-500 animate-pulse ml-2">{t('common.saving')}</span>}
                        </div>
                        <button 
                            onClick={handlePostComment}
                            disabled={isUploading || (!commentText.trim() && pendingAttachments.length === 0)}
                            className="bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
                        >
                            {t('taskDetail.post')}
                        </button>
                    </div>
                </div>
            </div>
          </div>
        )}

        {isAssigneeModalOpen && (
             <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
                 <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
                     <h3 className="font-bold text-lg mb-4">{t('taskDetail.selectAssignee')}</h3>
                     <ul className="space-y-2 max-h-60 overflow-y-auto">
                         {teamMembers.map(m => (
                             <li key={m.uid} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded border">
                                 <span>{m.displayName}</span>
                                 <button 
                                    onClick={() => handleAddAssignee(m.uid)}
                                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded"
                                 >
                                     Select
                                 </button>
                             </li>
                         ))}
                     </ul>
                     <button onClick={() => setIsAssigneeModalOpen(false)} className="mt-4 w-full py-2 border rounded text-gray-600">{t('taskDetail.cancel')}</button>
                 </div>
             </div>
        )}

      </div>
    </div>
  );
};

export default TaskDetailModal;