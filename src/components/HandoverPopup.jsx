// HandoverPopup.jsx
import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { db, storage, auth } from '../firebaseConfig'; // Added auth
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  collection,    // NEW
  query,         // NEW
  orderBy,       // NEW
  onSnapshot,    // NEW
  addDoc,        // NEW
  serverTimestamp  // NEW
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import './NotePopup.css'; // We can reuse the same CSS
import { LanguageContext } from '../contexts/LanguageContext'; // NEW

/* ---------- Icons ---------- */
const PaperClipIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.414a4 4 0 00-5.656-5.656l-6.415 6.415a6 6 0 108.486 8.486L20.5 13" />
  </svg>
);
const ChatBubbleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

/* ---------- Small spinners ---------- */
const Spinner = () => <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>;
const MiniSpinner = () => <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>;

/* ---------- ModalShell (overlay & scroll lock) ---------- */
const ModalShell = ({ children, onClose }) => {
  // Set a larger default size
  const width = 1200;
  const maxWidth = '95vw';
  const maxHeight = '90vh';

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div 
        className="relative z-[1001] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{ width: `${width}px`, maxWidth, maxHeight, height: '85vh' }}
      >
        {children}
      </div>
    </div>
  );
};

/* ---------- Editor toolbar ---------- */
const EditorToolbar = ({ onFormat, onInsertLink, showLinkInput, linkUrl, setLinkUrl, onApplyLink, onCancelLink }) => {
  const btn = "p-1.5 border border-gray-300 rounded cursor-pointer min-w-[30px] bg-white hover:bg-gray-100";
  const select = "py-1 px-1.5 border border-gray-300 rounded bg-white text-sm";
  const colorInputStyle = "p-0 border-none w-7 h-7 cursor-pointer bg-transparent";
  const linkInputStyle = "border border-gray-400 rounded px-2 py-1 text-sm outline-none";

  const handleMouseDown = (e, cmd, val = null) => { e.preventDefault(); onFormat(cmd, val); };
  return (
    <div className="flex gap-2 p-2 border-b border-gray-200 flex-wrap bg-gray-50 relative">
      <button onMouseDown={(e) => handleMouseDown(e, 'bold')} className={`${btn} font-bold`}>B</button>
      <button onMouseDown={(e) => handleMouseDown(e, 'italic')} className={`${btn} italic`}>I</button>
      <button onMouseDown={(e) => handleMouseDown(e, 'underline')} className={`${btn} underline`}>U</button>
      <button onMouseDown={(e) => handleMouseDown(e, 'strikeThrough')} className={`${btn} line-through`}>S</button>

      <select onChange={(e) => onFormat('fontSize', e.target.value)} className={select}>
        <option value="3">Normal</option>
        <option value="5">Large</option>
        <option value="1">Small</option>
      </select>

      <input type="color" onInput={(e) => onFormat('foreColor', e.target.value)} className={colorInputStyle} />

      <button onMouseDown={(e) => { e.preventDefault(); onInsertLink(); }} className={btn}>🔗</button>
      <button onMouseDown={(e) => { e.preventDefault(); onFormat('unlink'); }} className={btn}>Unlink</button>

      {showLinkInput && (
        <div className="absolute top-full left-2 bg-white border border-gray-300 shadow-lg p-2 rounded-lg z-20 flex gap-2 mt-1">
          <input id="note-link-input" type="text" className={linkInputStyle} placeholder="https://example.com" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} autoFocus onMouseDown={(e) => e.stopPropagation()} />
          <button onMouseDown={(e) => { e.preventDefault(); onApplyLink(); }} className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">Apply</button>
          <button onMouseDown={(e) => { e.preventDefault(); onCancelLink(); }} className="px-3 py-1 bg-gray-200 text-sm rounded hover:bg-gray-300">Cancel</button>
        </div>
      )}
    </div>
  );
};

/* ---------- Utility: remove anchors inside a Node (unwrap them) ---------- */
function unwrapAnchors(node) {
  // Walk the node tree and replace <a> elements with their children
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => n.nodeName === 'A' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
  });
  // collect anchors first because replacing while walking is problematic
  const anchors = [];
  let cur;
  while ((cur = walker.nextNode())) anchors.push(cur);
  anchors.forEach(a => {
    const parent = a.parentNode;
    if (!parent) return;
    // move children out
    while (a.firstChild) parent.insertBefore(a.firstChild, a);
    parent.removeChild(a);
  });
}

/* ---------- NEW: Comment Section Component ---------- */
const CommentSection = ({ teamId, handoverId }) => {
  const { t } = useContext(LanguageContext);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const commentsEndRef = useRef(null);

  useEffect(() => {
    // --- UPDATED FIRESTORE PATH ---
    const commentsRef = collection(db, 'teams', teamId, 'endorsements', handoverId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedComments = [];
      snapshot.forEach((doc) => {
        fetchedComments.push({ id: doc.id, ...doc.data() });
      });
      setComments(fetchedComments);
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching comments: ", err);
      setError(t('comments.loadError'));
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [teamId, handoverId, t]); // <-- Updated dependency

  // Auto-scroll to bottom
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handlePostComment = async (e) => {
    e.preventDefault();
    const text = newComment.trim();
    if (!text || !auth.currentUser) return;

    const { uid, displayName, email } = auth.currentUser;
    const authorName = displayName || email || 'Anonymous';

    try {
      setNewComment(''); // Clear input immediately
      // --- UPDATED FIRESTORE PATH ---
      await addDoc(collection(db, 'teams', teamId, 'endorsements', handoverId, 'comments'), {
        text: text,
        authorId: uid,
        authorName: authorName,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error posting comment: ", err);
      setError(t('comments.postError'));
      setNewComment(text); // Put text back if it failed
    }
  };
  
  // Simple time formatter
  const formatCommentTime = (timestamp) => {
    if (!timestamp) return '...';
    try {
      return timestamp.toDate().toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch (e) {
      return '...'; // In case timestamp isn't populated yet
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 border-l border-gray-200">
      <h3 className="text-sm font-semibold p-3 border-b border-gray-200 flex items-center text-gray-700 flex-shrink-0">
        <ChatBubbleIcon /> {t('comments.title')}
      </h3>
      {isLoading && <Spinner />}
      {error && <div className="text-red-600 p-3 text-sm">{error}</div>}
      <ul className="list-none p-3 m-0 overflow-y-auto flex-1 space-y-3">
        {!isLoading && comments.length === 0 && (
          <li className="text-sm text-gray-500 italic text-center py-4">
            {t('comments.none')}
          </li>
        )}
        {comments.map(comment => (
          <li key={comment.id} className="text-sm">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-800 text-[13px]">{comment.authorName}</span>
              <span className="text-xs text-gray-500">{formatCommentTime(comment.createdAt)}</span>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap break-words m-0 mt-0.5">
              {comment.text}
            </p>
          </li>
        ))}
        <div ref={commentsEndRef} />
      </ul>
      <div className="p-3 border-t border-gray-200 bg-white flex-shrink-0">
        <form onSubmit={handlePostComment}>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t('comments.placeholder')}
            rows="3"
            className="w-full border border-gray-300 rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button 
            type="submit" 
            disabled={!newComment.trim()} 
            className="w-full p-2 bg-blue-600 text-white rounded-md font-semibold mt-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
          >
            {t('comments.post')}
          </button>
        </form>
      </div>
    </div>
  );
};


/* ---------- Handover editor (main) ---------- */
const HandoverPopupContent = ({ teamId, handoverId, columnKey, onClose }) => {
  const { t } = useContext(LanguageContext); // <-- NEW
  const [saveStatus, setSaveStatus] = useState('loading'); // loading | idle | saving | saved | error
  const [initialHtml, setInitialHtml] = useState(null);

  // files state
  const [files, setFiles] = useState([]);
  const [fileUploadProgress, setFileUploadProgress] = useState(null);
  const [fileError, setFileError] = useState('');
  const [isDeletingFile, setIsDeletingFile] = useState(null);

  // link UI
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkSelectionRef = useRef(null);

  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const lastSavedHtmlRef = useRef(null);
  const isMountedRef = useRef(true);
  const injectedRef = useRef(false);

  const getFilesFieldName = React.useCallback(() => `${columnKey}_files`, [columnKey]);

  /* ---------- load initial content ---------- */
  useEffect(() => {
    isMountedRef.current = true;
    injectedRef.current = false;
    if (!teamId || !handoverId || !columnKey) {
      setSaveStatus('error');
      console.error('Missing props teamId/handoverId/columnKey');
      return;
    }
    (async () => {
      setSaveStatus('loading');
      setFiles([]);
      try {
        const docRef = doc(db, 'teams', teamId, 'endorsements', handoverId); // Updated Path
        const snap = await getDoc(docRef);
        let noteHtml = '', noteFiles = [];
        if (snap.exists()) {
          const data = snap.data();
          noteHtml = data[columnKey] || '';
          noteFiles = data[getFilesFieldName()] || [];
        }
        if (isMountedRef.current) {
          setInitialHtml(noteHtml);
          setFiles(noteFiles);
          lastSavedHtmlRef.current = noteHtml;
          setSaveStatus('idle');
        }
      } catch (err) {
        console.error('fetch note error', err);
        if (isMountedRef.current) { setInitialHtml(''); setFiles([]); setSaveStatus('error'); }
      }
    })();
    return () => { isMountedRef.current = false; if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [teamId, handoverId, columnKey, getFilesFieldName]);

  useEffect(() => {
    if (initialHtml === null) return;
    if (editorRef.current && !injectedRef.current) {
      editorRef.current.innerHTML = initialHtml;
      injectedRef.current = true;
    }
  }, [initialHtml]);

  /* ---------- autosave ---------- */
  const saveToFirebase = useCallback(async (html) => {
    if (html === lastSavedHtmlRef.current) { setSaveStatus('idle'); return; }
    const docRef = doc(db, 'teams', teamId, 'endorsements', handoverId); // Updated Path
    try {
      await updateDoc(docRef, { [columnKey]: html });
      if (isMountedRef.current) { lastSavedHtmlRef.current = html; setSaveStatus('saved'); setTimeout(() => { if (isMountedRef.current) setSaveStatus('idle'); }, 1500); }
    } catch (err) {
      console.error('Autosave error', err);
      if (isMountedRef.current) setSaveStatus('error');
    }
  }, [teamId, handoverId, columnKey]);

  const handleInput = useCallback(() => {
    if (showLinkInput) setShowLinkInput(false);
    if (saveStatus === 'loading') return;
    setSaveStatus('saving');
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      if (editorRef.current) saveToFirebase(editorRef.current.innerHTML);
    }, 1200);
  }, [showLinkInput, saveStatus, saveToFirebase]);

  /* ---------- image paste/upload (kept) ---------- */
  const handleImageUpload = (file) => {
    if (!file || !editorRef.current || !file.type.startsWith('image/')) return;
    const placeholderId = `upload-placeholder-${Date.now()}`;
    const blobUrl = URL.createObjectURL(file);
    const imgHtml = `<img src="${blobUrl}" id="${placeholderId}" alt="Uploading..." style="max-width:90%; opacity:.5; filter:blur(3px); border-radius:4px; display:block; margin:8px 0;" />`;
    document.execCommand('insertHTML', false, imgHtml);

    const storagePath = `handover_images/${teamId}/${handoverId}/${columnKey}/${Date.now()}-${file.name}`; // Updated Path
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);
    setFileUploadProgress('Uploading image (0%)...');
    uploadTask.on('state_changed',
      (snap) => {
        const progress = (snap.bytesTransferred / snap.totalBytes) * 100;
        if (isMountedRef.current) setFileUploadProgress(`Uploading image (${Math.round(progress)}%)...`);
      },
      (err) => {
        console.error('Image upload failed', err);
        if (isMountedRef.current) { setFileUploadProgress('Image upload failed.'); setTimeout(() => setFileUploadProgress(null), 3000); }
        const placeholder = editorRef.current?.querySelector(`#${placeholderId}`);
        if (placeholder) placeholder.remove();
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          if (isMountedRef.current && editorRef.current) {
            const placeholder = editorRef.current.querySelector(`#${placeholderId}`);
            if (placeholder) {
              placeholder.src = url;
              placeholder.style.opacity = '1';
              placeholder.style.filter = 'none';
              placeholder.removeAttribute('id');
              placeholder.alt = 'Image';
              handleInput();
            }
          }
          if (isMountedRef.current) { setFileUploadProgress('Upload complete!'); setTimeout(() => setFileUploadProgress(null), 3000); }
        } catch (err) {
          console.error('getDownloadURL failed', err);
          if (isMountedRef.current) setFileUploadProgress('Upload failed.');
        }
      }
    );
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    let found = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) { e.preventDefault(); handleImageUpload(file); found = true; break; }
      }
    }
    if (!found) {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    }
  };

  const handleEditorClick = (e) => {
    const isSpecialClick = e.ctrlKey || e.metaKey;
    if (isSpecialClick) {
      const anchor = e.target.closest('a');
      if (anchor && anchor.href) {
        e.preventDefault();
        window.open(anchor.href, '_blank', 'noopener,noreferrer');
      }
    }
  };

  /* ---------- file upload helpers (kept) ---------- */
  const handleUploadButtonClick = () => fileInputRef.current?.click();
  const handleFileSelected = (e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = null; };

  const handleFileUpload = (file) => {
    if (!file) return;
    setFileError('');
    const storagePath = `handover_files/${teamId}/${handoverId}/${columnKey}/${Date.now()}-${file.name}`; // Updated Path
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);
    setFileUploadProgress(`Uploading ${file.name} (0%)...`);
    uploadTask.on('state_changed',
      (snap) => {
        const progress = (snap.bytesTransferred / snap.totalBytes) * 100;
        if (isMountedRef.current) setFileUploadProgress(`Uploading ${file.name} (${Math.round(progress)}%)...`);
      },
      (err) => {
        console.error('file upload failed', err);
        if (isMountedRef.current) { setFileError(`Failed to upload ${file.name}`); setFileUploadProgress(null); }
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          const newFile = { name: file.name, url, path: storagePath, createdAt: new Date().toISOString() };
          const docRef = doc(db, 'teams', teamId, 'endorsements', handoverId); // Updated Path
          const filesField = getFilesFieldName();
          await updateDoc(docRef, { [filesField]: arrayUnion(newFile) });
          if (isMountedRef.current) { setFiles(prev => [...prev, newFile]); setFileUploadProgress('Upload complete!'); setTimeout(() => setFileUploadProgress(null), 3000); }
        } catch (err) {
          console.error('save file meta failed', err);
          if (isMountedRef.current) { setFileError('Upload succeeded but failed to save. Refresh.'); setFileUploadProgress(null); }
        }
      }
    );
  };

  const handleFileDelete = async (fileToDelete) => {
    if (!fileToDelete || !window.confirm(`Delete ${fileToDelete.name}?`)) return;
    setIsDeletingFile(fileToDelete.path);
    setFileError('');
    try {
      const fileRef = ref(storage, fileToDelete.path);
      await deleteObject(fileRef);
      const docRef = doc(db, 'teams', teamId, 'endorsements', handoverId); // Updated Path
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const cur = snap.data()[getFilesFieldName()] || [];
        const next = cur.filter(f => f.path !== fileToDelete.path);
        await updateDoc(docRef, { [getFilesFieldName()]: next });
        if (isMountedRef.current) setFiles(next);
      }
    } catch (err) {
      console.error('delete failed', err);
      if (isMountedRef.current) setFileError('Delete failed. Try again.');
    } finally {
      if (isMountedRef.current) setIsDeletingFile(null);
    }
  };

  /* ---------- Link handling improvements ---------- */
  const handleFormat = useCallback((command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  const handleInsertLink = useCallback(() => {
    const sel = window.getSelection();
    let range = null;
    try { if (sel && sel.rangeCount > 0) range = sel.getRangeAt(0).cloneRange(); } catch (e) { range = null; }
    linkSelectionRef.current = null;
    if (range && editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
      let node = range.startContainer;
      while (node && node !== editorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'A') {
          linkSelectionRef.current = { type: 'edit', anchor: node };
          setLinkUrl(node.getAttribute('href') || 'https://');
          setShowLinkInput(true);
          return;
        }
        node = node.parentNode;
      }
    }
    if (range && !range.collapsed && editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
      const placeholderId = `pl-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      let extracted;
      try {
        extracted = range.extractContents();
      } catch (err) {
        const text = (window.getSelection()?.toString()) || '';
        extracted = document.createDocumentFragment();
        extracted.appendChild(document.createTextNode(text));
        try { range.deleteContents(); } catch (e) { /* ignore */ }
      }
      const span = document.createElement('span');
      span.setAttribute('data-link-placeholder', '1');
      span.setAttribute('id', placeholderId);
      span.style.background = 'transparent';
      span.appendChild(extracted);
      range.insertNode(span);
      linkSelectionRef.current = { type: 'placeholder', id: placeholderId };
      setLinkUrl('https://');
      setShowLinkInput(true);
      return;
    }
    if (range && editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
      linkSelectionRef.current = { type: 'caret', range };
    } else {
      linkSelectionRef.current = { type: 'none' };
    }
    setLinkUrl('https://');
    setShowLinkInput(true);
  }, []);

  const removeEmptyAnchors = (root) => {
    const anchors = (root || editorRef.current)?.querySelectorAll('a') || [];
    anchors.forEach(a => {
      if (!a.textContent.trim() && !a.querySelector('img')) {
        const parent = a.parentNode;
        if (parent) parent.removeChild(a);
      }
    });
  };

  const applyLink = useCallback(() => {
    let url = (linkUrl || '').trim();
    if (!editorRef.current) { setShowLinkInput(false); setLinkUrl(''); linkSelectionRef.current = null; return; }
    if (!url) {
      const saved = linkSelectionRef.current;
      if (saved?.type === 'placeholder') {
        const ph = editorRef.current.querySelector(`#${saved.id}`);
        if (ph) {
          const parent = ph.parentNode;
          while (ph.firstChild) parent.insertBefore(ph.firstChild, ph);
          parent.removeChild(ph);
        }
      }
      setShowLinkInput(false);
      setLinkUrl('');
      linkSelectionRef.current = null;
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    try {
      const saved = linkSelectionRef.current;
      const sel = window.getSelection();

      if (saved?.type === 'edit' && saved.anchor) {
        const anchor = saved.anchor;
        anchor.setAttribute('href', url);
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
        if (!anchor.textContent.trim()) anchor.textContent = url;
        const after = document.createRange();
        after.setStartAfter(anchor);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
      } else if (saved?.type === 'placeholder') {
        const ph = editorRef.current.querySelector(`#${saved.id}`);
        if (ph) {
          const frag = document.createDocumentFragment();
          while (ph.firstChild) frag.appendChild(ph.firstChild);
          const temp = document.createElement('div');
          temp.appendChild(frag);
          unwrapAnchors(temp);
          const anchor = document.createElement('a');
          anchor.setAttribute('href', url);
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
          while (temp.firstChild) anchor.appendChild(temp.firstChild);
          ph.parentNode.replaceChild(anchor, ph);
          const after = document.createRange();
          after.setStartAfter(anchor);
          after.collapse(true);
          sel.removeAllRanges();
          sel.addRange(after);
        } else {
          document.execCommand('createLink', false, url);
        }
      } else if (saved?.type === 'caret' && saved.range) {
        const r = saved.range;
        sel.removeAllRanges();
        try { sel.addRange(r); } catch (err) { /* ignore */ }
        let node = r.startContainer;
        while (node && node !== editorRef.current) {
          if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'A') {
            node.setAttribute('href', url);
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
            sel.removeAllRanges();
            const after = document.createRange();
            after.setStartAfter(node);
            after.collapse(true);
            sel.addRange(after);
            removeEmptyAnchors();
            handleInput();
            setShowLinkInput(false);
            setLinkUrl('');
            linkSelectionRef.current = null;
            return;
          }
          node = node.parentNode;
        }
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.textContent = url;
        try {
          r.insertNode(a);
          const after = document.createRange();
          after.setStartAfter(a);
          after.collapse(true);
          sel.removeAllRanges();
          sel.addRange(after);
        } catch (err) {
          document.execCommand('createLink', false, url);
        }
      } else {
        document.execCommand('createLink', false, url);
        const anchors = editorRef.current.querySelectorAll('a[href]');
        if (anchors.length) {
          const a = anchors[anchors.length - 1];
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
          if (!a.textContent.trim()) a.textContent = url;
        }
      }
      removeEmptyAnchors(editorRef.current);
    } catch (err) {
      console.error('applyLink error', err);
      try { document.execCommand('createLink', false, url); } catch (e) { /* ignore */ }
    } finally {
      setShowLinkInput(false);
      setLinkUrl('');
      linkSelectionRef.current = null;
      handleInput();
    }
  }, [linkUrl, handleInput]);

  const cancelLink = useCallback(() => {
    const saved = linkSelectionRef.current;
    if (saved?.type === 'placeholder') {
      const ph = editorRef.current?.querySelector(`#${saved.id}`);
      if (ph) {
        const p = ph.parentNode;
        while (ph.firstChild) p.insertBefore(ph.firstChild, ph);
        p.removeChild(ph);
      }
    }
    setShowLinkInput(false);
    setLinkUrl('');
    linkSelectionRef.current = null;
    editorRef.current?.focus();
  }, []);

  /* ---------- small UI helpers ---------- */
  const getStatusMessage = () => {
    switch (saveStatus) {
      case 'saving': return { msg: t('common.saving'), color: '#6b7280' };
      case 'saved': return { msg: t('common.saved'), color: '#16a34a' };
      case 'error': return { msg: t('common.saveError', 'Error saving note'), color: '#dc2626' };
      default: return { msg: '', color: '#6b7280' };
    }
  };
  const status = getStatusMessage();

  /* ---------- render ---------- */
  return (
    <div className="w-full h-full bg-white rounded-lg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-gray-200 p-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-800">
          {t('handovers.details', 'Handover Details')}: <span className="font-mono text-blue-600">{columnKey}</span>
        </h2>
        <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
          <XIcon />
        </button>
      </div>

      {/* Main Content Area (3 columns) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left file area */}
        <div className="w-60 border-r border-gray-200 bg-gray-50 flex flex-col">
          <h3 className="text-sm font-semibold p-3 border-b border-gray-200 flex items-center text-gray-700 flex-shrink-0">
            <PaperClipIcon /> {t('attachments.title')}
          </h3>
          {fileError && <div className="text-red-600 p-3 text-sm">{fileError}</div>}
          <ul className="list-none p-3 m-0 overflow-y-auto flex-1 space-y-2">
            {files.length === 0 && <p className="text-sm text-gray-500 italic">{t('attachments.none')}</p>}
            {files.map(f => (
              <li key={f.path} className="bg-white p-2 border border-gray-200 rounded-md">
                <div className="text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap text-gray-700" title={f.name}>{f.name}</div>
                <div className="mt-1.5 flex gap-3">
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <DownloadIcon /> {t('common.download')}
                  </a>
                  <button onClick={() => handleFileDelete(f)} disabled={isDeletingFile === f.path} className="text-xs text-red-600 hover:underline flex items-center gap-1 disabled:opacity-50">
                    {isDeletingFile === f.path ? <MiniSpinner /> : <><TrashIcon /> {t('common.delete')}</>}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="p-3 border-t border-gray-200 flex-shrink-0">
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelected} />
            <button 
              onClick={handleUploadButtonClick} 
              disabled={!!fileUploadProgress || !!isDeletingFile} 
              className="w-full p-2 bg-blue-600 text-white rounded-md font-semibold text-sm disabled:opacity-50 hover:bg-blue-700 flex items-center justify-center"
            >
              {fileUploadProgress ? <MiniSpinner /> : t('attachments.upload')}
            </button>
          </div>
        </div>

        {/* Editor area (Middle) */}
        <div className="flex-1 flex flex-col">
          {saveStatus === 'loading' || initialHtml === null ? (
            <div className="flex-1 flex items-center justify-center"><Spinner /></div>
          ) : (
            <>
              <EditorToolbar
                onFormat={handleFormat}
                onInsertLink={handleInsertLink}
                showLinkInput={showLinkInput}
                linkUrl={linkUrl}
                setLinkUrl={setLinkUrl}
                onApplyLink={applyLink}
                onCancelLink={cancelLink}
              />

              <div
                ref={editorRef}
                contentEditable
                onInput={handleInput}
                onPaste={handlePaste}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => e.preventDefault()}
                onClick={handleEditorClick}
                className="note-editor"
                tabIndex={0}
                style={{ flex: 1, padding: 12, overflowY: 'auto', outline: 'none' }}
              />
            </>
          )}
        </div>

        {/* --- NEW: Comment Section Area (Right) --- */}
        <div className="w-[300px] flex-shrink-0">
          <CommentSection teamId={teamId} handoverId={handoverId} />
        </div>
        {/* --- END: Comment Section --- */}

      </div>

      {/* Footer */}
      <div className="flex justify-between items-center border-t border-gray-200 p-4 flex-shrink-0">
        <div className="text-xs">
          <div style={{ color: status.color }} className="font-semibold h-4">{status.msg}</div>
          <div className="text-blue-600 h-4">{fileUploadProgress}</div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md text-sm font-medium hover:bg-gray-300">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ---------- Wrapper export ---------- */
const HandoverPopup = (props) => {
  const { onClose } = props;
  return (
    <ModalShell onClose={onClose}>
      <HandoverPopupContent {...props} />
    </ModalShell>
  );
};

export default HandoverPopup;