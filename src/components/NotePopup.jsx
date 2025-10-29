import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, storage } from '../firebaseConfig'; // Assumes storage is exported from your config
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';

// Small spinners
const Spinner = () => <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>;
const MiniSpinner = () => <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>;

// ---------------- Modal Shell (overlay + center + scroll lock) ----------------
const ModalShell = ({ children, onClose, width = 1000, maxWidth = '90vw', maxHeight = '90vh' }) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // prevent background scroll
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      role="dialog"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.45)',
          zIndex: 1000,
        }}
      />

      {/* Content container */}
      <div
        style={{
          position: 'relative',
          zIndex: 1001,
          width: width,
          maxWidth: maxWidth,
          maxHeight: maxHeight,
          height: '80vh',
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ---------------- Editor Toolbar ----------------
const EditorToolbar = ({
  onFormat,
  onInsertLink,
  // Props for the new link input
  showLinkInput,
  linkUrl,
  setLinkUrl,
  onApplyLink,
  onCancelLink
}) => {
  // Use onMouseDown to avoid editor blur
  const handleMouseDown = (e, command, value = null) => {
    e.preventDefault();
    onFormat(command, value);
  };

  const handleLink = (e) => {
    e.preventDefault();
    onInsertLink();
  };

  const handleColorChange = (e) => {
    e.preventDefault();
    onFormat('foreColor', e.target.value);
  };

  const handleSizeChange = (e) => {
    e.preventDefault();
    onFormat('fontSize', e.target.value);
  };

  const handleApplyLink = (e) => {
    e.preventDefault();
    onApplyLink();
  };

  const btnStyle = {
    padding: '4px 8px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    cursor: 'pointer',
    minWidth: '30px',
    backgroundColor: 'white'
  };

  const selectStyle = {
    padding: '4px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: 'white',
  };

  const colorInputStyle = {
    padding: 0,
    border: 'none',
    width: '30px',
    height: '30px',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    verticalAlign: 'middle'
  };

  const linkInputStyle = {
    border: '1px solid #9ca3af',
    borderRadius: '4px',
    padding: '4px 6px',
    fontSize: '0.875rem',
    outline: 'none',
  };

  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      padding: '8px',
      borderBottom: '1px solid #e5e7eb',
      flexWrap: 'wrap',
      backgroundColor: '#f9fafb',
      borderRadius: '0.375rem 0.375rem 0 0',
      position: 'relative'
    }}>
      <button onMouseDown={(e) => handleMouseDown(e, 'bold')} style={btnStyle} title="Bold"><b>B</b></button>
      <button onMouseDown={(e) => handleMouseDown(e, 'italic')} style={btnStyle} title="Italic"><i>I</i></button>
      <button onMouseDown={(e) => handleMouseDown(e, 'underline')} style={btnStyle} title="Underline"><u>U</u></button>
      <button onMouseDown={(e) => handleMouseDown(e, 'strikeThrough')} style={btnStyle} title="Strikethrough"><s style={{ textDecoration: 'line-through' }}>S</s></button>

      <select onMouseDown={e => e.preventDefault()} onChange={handleSizeChange} style={selectStyle} title="Font Size">
        <option value="3">Normal</option>
        <option value="5">Large</option>
        <option value="1">Small</option>
      </select>

      <input type="color" onInput={handleColorChange} style={colorInputStyle} title="Font Color" />

      <button onMouseDown={handleLink} style={btnStyle} title="Insert Link">🔗</button>
      <button onMouseDown={(e) => handleMouseDown(e, 'unlink')} style={btnStyle} title="Remove Link"><s>🔗</s></button>

      {showLinkInput && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '8px',
          backgroundColor: 'white',
          border: '1px solid #ccc',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          padding: '8px',
          borderRadius: '6px',
          zIndex: 20,
          display: 'flex',
          gap: '8px',
          marginTop: '4px'
        }}>
          <input
            id="note-link-input"
            type="text"
            style={linkInputStyle}
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            autoFocus
            onMouseDown={(e) => e.stopPropagation()}
          />
          <button onMouseDown={handleApplyLink} style={{ ...btnStyle, backgroundColor: '#3b82f6', color: 'white' }}>Apply</button>
          <button onMouseDown={(e) => { e.preventDefault(); onCancelLink(); }} style={btnStyle}>Cancel</button>
        </div>
      )}
    </div>
  );
};

// ---------------- NotePopupContent (core editor & logic) ----------------
const NotePopupContent = ({ teamId, taskId, columnKey, onClose }) => {
  const [saveStatus, setSaveStatus] = useState('loading');
  const [initialHtml, setInitialHtml] = useState(null);

  // files state
  const [files, setFiles] = useState([]);
  const [fileUploadProgress, setFileUploadProgress] = useState(null);
  const [fileError, setFileError] = useState('');
  const [isDeletingFile, setIsDeletingFile] = useState(null);

  // link input state
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkSelectionRef = useRef(null); // useRef for stable ref

  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const lastSavedHtmlRef = useRef(null);
  const isMountedRef = useRef(true);
  const hasInjectedInitialRef = useRef(false);

  const getFilesFieldName = useCallback(() => `${columnKey}_files`, [columnKey]);

  // fetch initial doc
  useEffect(() => {
    isMountedRef.current = true;
    hasInjectedInitialRef.current = false;
    if (!teamId || !taskId || !columnKey) {
      setSaveStatus('error');
      console.error('Missing required props: teamId, taskId, or columnKey');
      return;
    }
    const fetchData = async () => {
      setSaveStatus('loading');
      setFiles([]);
      try {
        const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
        const docSnap = await getDoc(docRef);
        let noteHtml = '';
        let noteFiles = [];
        if (docSnap.exists()) {
          const data = docSnap.data();
          noteHtml = data[columnKey] || '';
          noteFiles = data[getFilesFieldName()] || [];
        }
        if (isMountedRef.current) {
          setInitialHtml(noteHtml);
          setFiles(noteFiles);
          lastSavedHtmlRef.current = noteHtml;
          setSaveStatus('idle');
        }
      } catch (error) {
        console.error('Failed to fetch note or files:', error);
        if (isMountedRef.current) {
          setInitialHtml('');
          setFiles([]);
          setSaveStatus('error');
        }
      }
    };
    fetchData();
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [teamId, taskId, columnKey, getFilesFieldName]);

  // inject once
  useEffect(() => {
    if (initialHtml === null) return;
    if (editorRef.current && !hasInjectedInitialRef.current) {
      editorRef.current.innerHTML = initialHtml;
      hasInjectedInitialRef.current = true;
    }
  }, [initialHtml]);

  // autosave
  const saveToFirebase = async (htmlToSave) => {
    if (htmlToSave === lastSavedHtmlRef.current) {
      setSaveStatus('idle');
      return;
    }
    const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
    try {
      await updateDoc(docRef, { [columnKey]: htmlToSave });
      if (isMountedRef.current) {
        lastSavedHtmlRef.current = htmlToSave;
        setSaveStatus('saved');
        setTimeout(() => { if (isMountedRef.current) setSaveStatus('idle'); }, 1500);
      }
    } catch (error) {
      console.error('Autosave error:', error);
      if (isMountedRef.current) setSaveStatus('error');
    }
  };

  const handleInput = () => {
    if (showLinkInput) setShowLinkInput(false);
    if (saveStatus === 'loading') return;
    setSaveStatus('saving');
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      if (editorRef.current) {
        const currentHtml = editorRef.current.innerHTML;
        saveToFirebase(currentHtml);
      }
    }, 1500);
  };

  // Image paste/upload logic (unchanged)
  const handleImageUpload = (file) => {
    if (!file || !editorRef.current || !file.type.startsWith('image/')) return;
    const placeholderId = `upload-placeholder-${Date.now()}`;
    const blobUrl = URL.createObjectURL(file);
    const imgHtml = `<img src="${blobUrl}" id="${placeholderId}" alt="Uploading..." style="max-width: 90%; opacity: 0.5; filter: blur(3px); border-radius: 4px; display:block; margin: 8px 0;"/>`;
    document.execCommand('insertHTML', false, imgHtml);

    const storagePath = `notes_images/${teamId}/${taskId}/${columnKey}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);
    setFileUploadProgress('Uploading image (0%)...');
    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (isMountedRef.current) setFileUploadProgress(`Uploading image (${Math.round(progress)}%)...`);
      },
      (error) => {
        console.error('Image upload failed:', error);
        if (isMountedRef.current) {
          setFileUploadProgress('Image upload failed.');
          setTimeout(() => setFileUploadProgress(null), 3000);
        }
        const placeholder = editorRef.current?.querySelector(`#${placeholderId}`);
        if (placeholder) placeholder.remove();
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          if (isMountedRef.current && editorRef.current) {
            const placeholder = editorRef.current.querySelector(`#${placeholderId}`);
            if (placeholder) {
              placeholder.src = downloadURL;
              placeholder.style.opacity = '1';
              placeholder.style.filter = 'none';
              placeholder.removeAttribute('id');
              placeholder.alt = 'Pasted content';
              handleInput();
            }
          }
          if (isMountedRef.current) {
            setFileUploadProgress('Upload complete!');
            setTimeout(() => setFileUploadProgress(null), 3000);
          }
        } catch (error) {
          console.error('Failed to get download URL:', error);
          if (isMountedRef.current) setFileUploadProgress('Upload failed.');
        }
      }
    );
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    let foundImage = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleImageUpload(file);
          foundImage = true;
          break;
        }
      }
    }
    if (!foundImage) {
      // allow plain text paste
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    }
  };

  // file upload helpers (unchanged)
  const handleUploadButtonClick = () => fileInputRef.current?.click();
  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = null;
  };

  const handleFileUpload = (file) => {
    if (!file) return;
    setFileError('');
    const storagePath = `notes_files/${teamId}/${taskId}/${columnKey}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);
    setFileUploadProgress(`Uploading ${file.name} (0%)...`);
    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (isMountedRef.current) setFileUploadProgress(`Uploading ${file.name} (${Math.round(progress)}%)...`);
      },
      (error) => {
        console.error('File upload failed:', error);
        if (isMountedRef.current) {
          setFileError(`Failed to upload ${file.name}.`);
          setFileUploadProgress(null);
        }
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const newFileObject = {
            name: file.name,
            url: downloadURL,
            path: storagePath,
            createdAt: new Date().toISOString(),
          };
          const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
          const filesField = getFilesFieldName();
          await updateDoc(docRef, { [filesField]: arrayUnion(newFileObject) });
          if (isMountedRef.current) {
            setFiles(prevFiles => [...prevFiles, newFileObject]);
            setFileUploadProgress('Upload complete!');
            setTimeout(() => setFileUploadProgress(null), 3000);
          }
        } catch (error) {
          console.error('Failed to update document with new file:', error);
          if (isMountedRef.current) {
            setFileError(`Upload succeeded but failed to save. Please refresh.`);
            setFileUploadProgress(null);
          }
        }
      }
    );
  };

  const handleFileDelete = async (fileToDelete) => {
    if (!fileToDelete || !window.confirm(`Are you sure you want to delete ${fileToDelete.name}?`)) return;
    setIsDeletingFile(fileToDelete.path);
    setFileError('');
    try {
      const fileStorageRef = ref(storage, fileToDelete.path);
      await deleteObject(fileStorageRef);
      const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const currentFiles = docSnap.data()[getFilesFieldName()] || [];
        const newFiles = currentFiles.filter(f => f.path !== fileToDelete.path);
        await updateDoc(docRef, { [getFilesFieldName()]: newFiles });
        if (isMountedRef.current) setFiles(newFiles);
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      if (isMountedRef.current) setFileError(`Failed to delete ${fileToDelete.name}. Please try again.`);
    } finally {
      if (isMountedRef.current) setIsDeletingFile(null);
    }
  };

  // ---------------- Link handling ----------------
  const handleFormat = useCallback((command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  }, []); // stable

  const handleInsertLink = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      // Save a clone of the range (store in ref so it's not part of state lifecycle)
      linkSelectionRef.current = selection.getRangeAt(0).cloneRange();
    } else {
      linkSelectionRef.current = null;
    }
    setShowLinkInput(true);
    setLinkUrl('https://');
    // Focus will move to input automatically (autoFocus on input) but we keep the cloned range in ref.
  }, []);

  const applyLink = useCallback(() => {
    // Basic url normalization
    let url = (linkUrl || '').trim();
    if (!url) {
      // nothing to do
      setShowLinkInput(false);
      setLinkUrl('');
      linkSelectionRef.current = null;
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    const range = linkSelectionRef.current;
    try {
      if (range && range.startContainer && document.contains(range.startContainer)) {
        // restore selection
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        // If selection has text, createLink should wrap it.
        const selectedText = sel.toString();
        if (selectedText && selectedText.trim().length > 0) {
          document.execCommand('createLink', false, url);
        } else {
          // Collapsed selection - insert an anchor with the URL text
          const a = document.createElement('a');
          a.href = url;
          a.textContent = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          range.deleteContents();
          range.insertNode(a);
          // move caret after inserted node
          range.setStartAfter(a);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } else {
        // No valid saved range: append link at caret or at end of editor.
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const r = sel.getRangeAt(0);
          const a = document.createElement('a');
          a.href = url;
          a.textContent = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          r.deleteContents();
          r.insertNode(a);
          r.setStartAfter(a);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        } else if (editorRef.current) {
          // fallback: append at end
          const a = document.createElement('a');
          a.href = url;
          a.textContent = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          editorRef.current.appendChild(a);
        }
      }
    } catch (err) {
      console.error('Failed to apply link:', err);
    } finally {
      // reset link UI
      setShowLinkInput(false);
      setLinkUrl('');
      linkSelectionRef.current = null;
      editorRef.current?.focus();
      handleInput();
    }
  }, [linkUrl, handleInput]);

  const cancelLink = useCallback(() => {
    setShowLinkInput(false);
    setLinkUrl('');
    linkSelectionRef.current = null;
    editorRef.current?.focus();
  }, []);

  // ---------------- Status utility ----------------
  const getStatusMessage = () => {
    switch (saveStatus) {
      case 'saving': return { msg: 'Saving note...', color: 'text-gray-500' };
      case 'saved': return { msg: 'Note saved', color: 'text-green-600' };
      case 'error': return { msg: 'Error saving note. Check console.', color: 'text-red-600' };
      default: return { msg: '', color: 'text-gray-500' };
    }
  };
  const { msg: saveMsg, color: saveColor } = getStatusMessage();

  // ---------------- Render ----------------
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #e5e7eb',
        padding: '0.75rem 1.25rem',
        flexShrink: 0,
      }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937' }}>
          Note: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Helvetica Neue", monospace', color: '#2563eb' }}>{columnKey}</span>
        </h2>
        <button onClick={onClose} aria-label="Close" style={{ color: '#9ca3af', fontSize: '24px', lineHeight: '1', background: 'none', border: 'none', cursor: 'pointer' }}>
          &times;
        </button>
      </div>

      {/* Main */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left sidebar */}
        <div style={{
          width: '280px',
          flexShrink: 0,
          borderRight: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: '#f9fafb'
        }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', padding: '1rem 1rem 0.5rem 1rem', flexShrink: 0 }}>
            File Attachments
          </h3>
          {fileError && <div style={{ color: '#dc2626', fontSize: '0.875rem', margin: '0 1rem 0.5rem 1rem' }}>{fileError}</div>}
          <ul style={{ flex: 1, overflowY: 'auto', listStyle: 'none', padding: '0 1rem', margin: 0 }}>
            {files.length === 0 && <p style={{ fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic', padding: '0.5rem 0' }}>No files attached.</p>}
            {files.map(file => (
              <li key={file.path} style={{ display: 'flex', flexDirection: 'column', padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '0.375rem', marginBottom: '0.5rem', backgroundColor: '#ffffff' }}>
                <span style={{ fontSize: '0.875rem', color: '#1f2937', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontWeight: 500 }} title={file.name}>
                  {file.name}
                </span>
                <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0, marginTop: '0.25rem' }}>
                  <a href={file.url} target="_blank" rel="noopener noreferrer" download={file.name} style={{ fontSize: '0.75rem', color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>Download</a>
                  <button onClick={() => handleFileDelete(file)} disabled={isDeletingFile === file.path} style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}>
                    {isDeletingFile === file.path ? <MiniSpinner /> : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div style={{ padding: '1rem', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelected} />
            <button onClick={handleUploadButtonClick} disabled={!!fileUploadProgress || isDeletingFile} style={{ width: '100%', padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: 'white', borderRadius: '0.375rem', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: (!!fileUploadProgress || isDeletingFile) ? 0.5 : 1, display: 'flex', justifyContent: 'center' }}>
              {fileUploadProgress ? <MiniSpinner /> : 'Upload File'}
            </button>
          </div>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {saveStatus === 'loading' || initialHtml === null ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spinner />
            </div>
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
                contentEditable={true}
                onInput={handleInput}
                onPaste={handlePaste}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => e.preventDefault()}
                tabIndex={0}
                style={{
                  flex: 1,
                  border: 'none',
                  padding: '0.75rem',
                  overflowY: 'auto',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '1px solid #e5e7eb',
        padding: '0.75rem 1.25rem',
        marginTop: 'auto',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column' }}>
          <span style={
            saveColor === 'text-green-600' ? { color: '#16a34a', fontWeight: 500 } :
              saveColor === 'text-red-600' ? { color: '#dc2626', fontWeight: 500 } : { color: '#6b7280', fontWeight: 500 }
          }>
            {saveMsg}
          </span>
          <span style={{ color: '#2563eb', fontWeight: 500, height: '1.25rem' }}>{fileUploadProgress}</span>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={onClose} style={{ padding: '0.5rem 1rem', backgroundColor: '#e5e7eb', color: '#111827', borderRadius: '0.375rem', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------- Exported modal component (wraps content in overlay) ----------------
const NotePopup = (props) => {
  const { onClose } = props;
  return (
    <ModalShell onClose={onClose}>
      <NotePopupContent {...props} />
    </ModalShell>
  );
};

export default NotePopup;
