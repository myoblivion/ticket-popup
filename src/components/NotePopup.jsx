// NotePopup.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, storage } from '../firebaseConfig';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import './NotePopup.css';

/* ---------- Small spinners ---------- */
const Spinner = () => <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>;
const MiniSpinner = () => <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>;

/* ---------- ModalShell (overlay & scroll lock) ---------- */
const ModalShell = ({ children, onClose, width = 1000, maxWidth = '90vw', maxHeight = '90vh' }) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div aria-modal="true" role="dialog" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      <div style={{ position: 'relative', zIndex: 1001, width, maxWidth, maxHeight, height: '80vh' }}>{children}</div>
    </div>
  );
};

/* ---------- Editor toolbar ---------- */
const EditorToolbar = ({ onFormat, onInsertLink, showLinkInput, linkUrl, setLinkUrl, onApplyLink, onCancelLink }) => {
  const btn = { padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', minWidth: 30, background: 'white' };
  const select = { padding: 4, border: '1px solid #ccc', borderRadius: 4, background: 'white' };
  const colorInputStyle = { padding: 0, border: 'none', width: 30, height: 30, cursor: 'pointer', background: 'transparent' };
  const linkInputStyle = { border: '1px solid #9ca3af', borderRadius: 4, padding: '4px 6px', fontSize: '0.875rem', outline: 'none' };

  const handleMouseDown = (e, cmd, val = null) => { e.preventDefault(); onFormat(cmd, val); };
  return (
    <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap', background: '#f9fafb', position: 'relative' }}>
      <button onMouseDown={(e) => handleMouseDown(e, 'bold')} style={btn}><b>B</b></button>
      <button onMouseDown={(e) => handleMouseDown(e, 'italic')} style={btn}><i>I</i></button>
      <button onMouseDown={(e) => handleMouseDown(e, 'underline')} style={btn}><u>U</u></button>
      <button onMouseDown={(e) => handleMouseDown(e, 'strikeThrough')} style={btn}><s>S</s></button>

      {/* *
        * THE FIX IS HERE: 
        * I removed onMouseDown={e => e.preventDefault()} from this <select> tag.
        *
      */}
      <select onChange={(e) => onFormat('fontSize', e.target.value)} style={select}>
        <option value="3">Normal</option>
        <option value="5">Large</option>
        <option value="1">Small</option>
      </select>

      <input type="color" onInput={(e) => onFormat('foreColor', e.target.value)} style={colorInputStyle} />

      <button onMouseDown={(e) => { e.preventDefault(); onInsertLink(); }} style={btn}>🔗</button>
      <button onMouseDown={(e) => { e.preventDefault(); onFormat('unlink'); }} style={btn}>Unlink</button>

      {showLinkInput && (
        <div style={{ position: 'absolute', top: '100%', left: 8, background: 'white', border: '1px solid #ccc', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: 8, borderRadius: 6, zIndex: 20, display: 'flex', gap: 8, marginTop: 4 }}>
          <input id="note-link-input" type="text" style={linkInputStyle} placeholder="https://example.com" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} autoFocus onMouseDown={(e) => e.stopPropagation()} />
          <button onMouseDown={(e) => { e.preventDefault(); onApplyLink(); }} style={{ ...btn, background: '#3b82f6', color: 'white' }}>Apply</button>
          <button onMouseDown={(e) => { e.preventDefault(); onCancelLink(); }} style={btn}>Cancel</button>
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

/* ---------- Note editor (main) ---------- */
const NotePopupContent = ({ teamId, taskId, columnKey, onClose }) => {
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
  // saved info: { type: 'placeholder', id } | { type: 'caret', range } | { type: 'edit', anchor } | { type: 'none' }
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
    if (!teamId || !taskId || !columnKey) {
      setSaveStatus('error');
      console.error('Missing props teamId/taskId/columnKey');
      return;
    }
    (async () => {
      setSaveStatus('loading');
      setFiles([]);
      try {
        const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
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
  }, [teamId, taskId, columnKey, getFilesFieldName]);

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
    const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
    try {
      await updateDoc(docRef, { [columnKey]: html });
      if (isMountedRef.current) { lastSavedHtmlRef.current = html; setSaveStatus('saved'); setTimeout(() => { if (isMountedRef.current) setSaveStatus('idle'); }, 1500); }
    } catch (err) {
      console.error('Autosave error', err);
      if (isMountedRef.current) setSaveStatus('error');
    }
  }, [teamId, taskId, columnKey]);

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

    const storagePath = `notes_images/${teamId}/${taskId}/${columnKey}/${Date.now()}-${file.name}`;
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

  /* *****************************************
    * NEW CLICK HANDLER            *
    *****************************************
  */
  const handleEditorClick = (e) => {
    // Check for Ctrl/Cmd key
    const isSpecialClick = e.ctrlKey || e.metaKey;

    if (isSpecialClick) {
      // Find the nearest <a> tag ancestor
      const anchor = e.target.closest('a');
      
      if (anchor && anchor.href) {
        // Prevent the editor from doing anything (like moving the cursor)
        e.preventDefault();
        // Open the link in a new tab
        window.open(anchor.href, '_blank', 'noopener,noreferrer');
      }
    }
    // If not Ctrl/Cmd+Click, do nothing and let the default contentEditable behavior happen
  };

  /* ---------- file upload helpers (kept) ---------- */
  const handleUploadButtonClick = () => fileInputRef.current?.click();
  const handleFileSelected = (e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = null; };

  const handleFileUpload = (file) => {
    if (!file) return;
    setFileError('');
    const storagePath = `notes_files/${teamId}/${taskId}/${columnKey}/${Date.now()}-${file.name}`;
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
          const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
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
      const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const cur = snap.data()[getFilesFieldName()] || []; // Corrected: getFieOlsFieldName() -> getFilesFieldName()
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

  // wrapper for simple format commands
  const handleFormat = useCallback((command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  // When Insert Link is clicked:
  // - if selection is inside an <a>: we will set type 'edit' and prefill url
  // - if selection is non-empty inside editor: extract contents into placeholder span and save placeholder id
  // - if collapsed caret inside editor: save caret Range
  const handleInsertLink = useCallback(() => {
    const sel = window.getSelection();
    let range = null;
    try { if (sel && sel.rangeCount > 0) range = sel.getRangeAt(0).cloneRange(); } catch (e) { range = null; }

    linkSelectionRef.current = null;

    // if selection inside an existing anchor, edit mode
    if (range && editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
      // find closest anchor ancestor
      let node = range.startContainer;
      while (node && node !== editorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'A') {
          // edit this anchor
          linkSelectionRef.current = { type: 'edit', anchor: node };
          setLinkUrl(node.getAttribute('href') || 'https://');
          setShowLinkInput(true);
          return;
        }
        node = node.parentNode;
      }
    }

    if (range && !range.collapsed && editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
      // Extract content into a placeholder span immediately (prevents losing selection)
      const placeholderId = `pl-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      let extracted;
      try {
        extracted = range.extractContents();
      } catch (err) {
        // fallback: plain text
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

    // If collapsed caret inside editor: save caret range
    if (range && editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
      linkSelectionRef.current = { type: 'caret', range };
    } else {
      linkSelectionRef.current = { type: 'none' };
    }
    setLinkUrl('https://');
    setShowLinkInput(true);
  }, []);

  // Cleanup helper: remove empty anchors
  const removeEmptyAnchors = (root) => {
    const anchors = (root || editorRef.current)?.querySelectorAll('a') || [];
    anchors.forEach(a => {
      if (!a.textContent.trim() && !a.querySelector('img')) {
        // remove empty anchor
        const parent = a.parentNode;
        if (parent) parent.removeChild(a);
      }
    });
  };

  // apply link: handles 'edit', 'placeholder', 'caret', 'none'
  const applyLink = useCallback(() => {
    let url = (linkUrl || '').trim();
    if (!editorRef.current) { setShowLinkInput(false); setLinkUrl(''); linkSelectionRef.current = null; return; }
    if (!url) {
      // If there was a placeholder, restore its inner content
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
        // update href of existing anchor
        const anchor = saved.anchor;
        anchor.setAttribute('href', url);
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
        // if anchor has no text, set text to url
        if (!anchor.textContent.trim()) anchor.textContent = url;
        // place caret after anchor
        const after = document.createRange();
        after.setStartAfter(anchor);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
      } else if (saved?.type === 'placeholder') {
        const ph = editorRef.current.querySelector(`#${saved.id}`);
        if (ph) {
          // create anchor and move inner nodes into it, unwrapping any anchors inside
          const frag = document.createDocumentFragment();
          while (ph.firstChild) frag.appendChild(ph.firstChild);
          // unwrap any anchors inside fragment
          const temp = document.createElement('div');
          temp.appendChild(frag);
          unwrapAnchors(temp);
          const anchor = document.createElement('a');
          anchor.setAttribute('href', url);
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
          // move children from temp into anchor
          while (temp.firstChild) anchor.appendChild(temp.firstChild);
          ph.parentNode.replaceChild(anchor, ph);
          // caret after anchor
          const after = document.createRange();
          after.setStartAfter(anchor);
          after.collapse(true);
          sel.removeAllRanges();
          sel.addRange(after);
        } else {
          // fallback
          document.execCommand('createLink', false, url);
        }
      } else if (saved?.type === 'caret' && saved.range) {
        // restore range and insert anchor with url text
        const r = saved.range;
        sel.removeAllRanges();
        try { sel.addRange(r); } catch (err) { /* ignore */ }
        // if caret is inside an anchor, update that anchor instead
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
        // create anchor element
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.textContent = url;
        try {
          r.insertNode(a);
          // caret after
          const after = document.createRange();
          after.setStartAfter(a);
          after.collapse(true);
          sel.removeAllRanges();
          sel.addRange(after);
        } catch (err) {
          // fallback
          document.execCommand('createLink', false, url);
        }
      } else {
        // no saved info: fallback to createLink, then set rel/target for last anchor
        document.execCommand('createLink', false, url);
        const anchors = editorRef.current.querySelectorAll('a[href]');
        if (anchors.length) {
          const a = anchors[anchors.length - 1];
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
          if (!a.textContent.trim()) a.textContent = url;
        }
      }

      // remove any empty anchors left behind
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

  // cancel link, restore placeholder if present
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
      case 'saving': return { msg: 'Saving note...', color: '#6b7280' };
      case 'saved': return { msg: 'Note saved', color: '#16a34a' };
      case 'error': return { msg: 'Error saving note', color: '#dc2626' };
      default: return { msg: '', color: '#6b7280' };
    }
  };
  const status = getStatusMessage();

  /* ---------- render ---------- */
  return (
    <div style={{ width: '100%', height: '100%', background: 'white', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', padding: '12px 16px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1f2937' }}>Note: <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{columnKey}</span></h2>
        <button onClick={onClose} aria-label="Close" style={{ color: '#9ca3af', fontSize: 24, background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left file area */}
        <div style={{ width: 280, borderRight: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, padding: '12px 12px 6px 12px' }}>File Attachments</h3>
          {fileError && <div style={{ color: '#dc2626', padding: '0 12px' }}>{fileError}</div>}
          <ul style={{ listStyle: 'none', padding: '8px 12px', margin: 0, overflowY: 'auto', flex: 1 }}>
            {files.length === 0 && <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No files attached.</p>}
            {files.map(f => (
              <li key={f.path} style={{ background: 'white', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</div>
                <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: 13 }}>Download</a>
                  <button onClick={() => handleFileDelete(f)} disabled={isDeletingFile === f.path} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 13 }}>
                    {isDeletingFile === f.path ? <MiniSpinner /> : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div style={{ padding: 12, borderTop: '1px solid #e5e7eb' }}>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelected} />
            <button onClick={handleUploadButtonClick} disabled={!!fileUploadProgress || !!isDeletingFile} style={{ width: '100%', padding: '10px', background: '#3b82f6', color: 'white', borderRadius: 6, border: 'none', fontWeight: 600 }}>
              {fileUploadProgress ? <MiniSpinner /> : 'Upload File'}
            </button>
          </div>
        </div>

        {/* Editor area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {saveStatus === 'loading' || initialHtml === null ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>
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
                onClick={handleEditorClick} /* <-- MODIFICATION */
                className="note-editor"   /* <-- MODIFICATION */
                tabIndex={0}
                style={{ flex: 1, padding: 12, overflowY: 'auto', outline: 'none' }}
              />
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb', padding: '12px 16px' }}>
        <div style={{ fontSize: 13 }}>
          <div style={{ color: status.color, fontWeight: 600 }}>{status.msg}</div>
          <div style={{ color: '#2563eb', height: 18 }}>{fileUploadProgress}</div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 12px', background: '#e5e7eb', borderRadius: 6, border: 'none', fontWeight: 600 }}>Close</button>
        </div>
      </div>
    </div>
  );
};

/* ---------- Wrapper export ---------- */
const NotePopup = (props) => {
  const { onClose } = props;
  return (
    <ModalShell onClose={onClose}>
      <NotePopupContent {...props} />
    </ModalShell>
  );
};

export default NotePopup;