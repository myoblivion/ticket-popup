import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../firebaseConfig'; // Assumes storage is exported from your config
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

// A simple spinner component
const Spinner = () => (
  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
);

/**
 * NotePopup
 *
 * Fix summary:
 * - Do NOT use dangerouslySetInnerHTML every render for contentEditable.
 * - Set editorRef.current.innerHTML once when initialHtml arrives.
 * - Let the DOM keep user edits; autosave updates Firestore and lastSavedHtmlRef.
 */
const NotePopup = ({ teamId, taskId, columnKey, onClose, onClick }) => {
  const [saveStatus, setSaveStatus] = useState('loading'); // 'loading', 'idle', 'saving', 'saved', 'error'
  const [uploadStatus, setUploadStatus] = useState(''); // e.g., 'Uploading image (25%)...'
  const [initialHtml, setInitialHtml] = useState(null);

  const editorRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const lastSavedHtmlRef = useRef(null);
  const isMountedRef = useRef(true);
  const hasInjectedInitialRef = useRef(false); // IMPORTANT: only inject initialHtml into DOM once

  // --- 1. Fetch Initial Data ---
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
      try {
        const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
        const docSnap = await getDoc(docRef);

        let noteHtml = '';
        if (docSnap.exists()) {
          noteHtml = docSnap.data()[columnKey] || '';
        }

        if (isMountedRef.current) {
          setInitialHtml(noteHtml);
          lastSavedHtmlRef.current = noteHtml;
          setSaveStatus('idle');
        }
      } catch (error) {
        console.error('Failed to fetch note:', error);
        if (isMountedRef.current) {
          setInitialHtml('');
          setSaveStatus('error');
        }
      }
    };

    fetchData();

    // Cleanup function when component unmounts
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [teamId, taskId, columnKey]);

  // Inject initialHtml into editor DOM only once (prevents overwriting user edits)
  useEffect(() => {
    if (initialHtml === null) return;
    if (editorRef.current && !hasInjectedInitialRef.current) {
      editorRef.current.innerHTML = initialHtml;
      hasInjectedInitialRef.current = true;
    }
    // we intentionally do NOT add editorRef or hasInjectedInitialRef to deps;
    // we only want to run this when initialHtml changes from null -> a value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHtml]);

  // --- 2. Autosave Logic ---
  const saveToFirebase = async (htmlToSave) => {
    // avoid unnecessary network calls
    if (htmlToSave === lastSavedHtmlRef.current) {
      setSaveStatus('idle');
      return;
    }

    const docRef = doc(db, 'teams', teamId, 'tasks', taskId);
    try {
      await updateDoc(docRef, {
        [columnKey]: htmlToSave,
      });

      if (isMountedRef.current) {
        lastSavedHtmlRef.current = htmlToSave;
        setSaveStatus('saved');
        // do NOT overwrite editor DOM here
        setTimeout(() => {
          if (isMountedRef.current) setSaveStatus('idle');
        }, 2000);
      }
    } catch (error) {
      console.error('Autosave error:', error);
      if (isMountedRef.current) setSaveStatus('error');
    }
  };

  const handleInput = () => {
    if (saveStatus === 'loading') return;

    setSaveStatus('saving');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (editorRef.current) {
        // Read content directly from DOM (uncontrolled)
        const currentHtml = editorRef.current.innerHTML;
        saveToFirebase(currentHtml);
      }
    }, 1500);
  };

  // --- 3. Image Paste & Upload Logic ---
  const handleImageUpload = (file) => {
    if (!file || !editorRef.current) return;

    const placeholderId = `upload-placeholder-${Date.now()}`;
    const blobUrl = URL.createObjectURL(file);

    const imgHtml = `<img 
      src="${blobUrl}" 
      id="${placeholderId}" 
      alt="Uploading..." 
      style="max-width: 90%; opacity: 0.5; filter: blur(3px); border-radius: 4px; display:block; margin: 8px 0;"
    />`;
    // insert placeholder at caret
    document.execCommand('insertHTML', false, imgHtml);

    const storagePath = `notes/${teamId}/${taskId}/${columnKey}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    setUploadStatus('Uploading image (0%)...');

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (isMountedRef.current) {
          setUploadStatus(`Uploading image (${Math.round(progress)}%)...`);
        }
      },
      (error) => {
        console.error('Upload failed:', error);
        if (isMountedRef.current) {
          setUploadStatus('Upload failed.');
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

              // Immediately trigger autosave after placeholder replaced
              handleInput();
            }
          }
          if (isMountedRef.current) {
            setUploadStatus('Upload complete!');
            setTimeout(() => {
              if (isMountedRef.current) setUploadStatus('');
            }, 3000);
          }
        } catch (error) {
          console.error('Failed to get download URL:', error);
          if (isMountedRef.current) setUploadStatus('Upload failed.');
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
      // default to plain text paste
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    }
  };

  // --- 4. Render Autosave Status ---
  const getStatusMessage = () => {
    switch (saveStatus) {
      case 'saving':
        return { msg: 'Saving...', color: 'text-gray-500' };
      case 'saved':
        return { msg: 'Saved', color: 'text-green-600' };
      case 'error':
        return { msg: 'Error saving. Check console.', color: 'text-red-600' };
      default:
        return { msg: '', color: 'text-gray-500' };
    }
  };
  const { msg: saveMsg, color: saveColor } = getStatusMessage();

  return (
    // Container: wider and taller popup (you can keep your overlay/modal wrapper)
    <div
      style={{
        width: '1000px',
        maxWidth: '900px', // <-- keep your preferred sizing
        height: '80vh',
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.25rem',
        boxSizing: 'border-box',
      }}
      onClick={onClick}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937' }}>
          Note: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Helvetica Neue", monospace', color: '#2563eb' }}>{columnKey}</span>
        </h2>
        <button onClick={onClose} aria-label="Close" style={{ color: '#9ca3af', fontSize: '24px', lineHeight: '1' }}>
          &times;
        </button>
      </div>

      {saveStatus === 'loading' || initialHtml === null ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : (
        // NOTE: removed dangerouslySetInnerHTML to prevent React from clobbering
        <div
          ref={editorRef}
          contentEditable={true}
          onInput={handleInput}
          onPaste={handlePaste}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          style={{
            flex: 1,
            border: '1px solid #e5e7eb',
            borderRadius: '0.375rem',
            padding: '0.75rem',
            overflowY: 'auto',
            outline: 'none',
            minHeight: '380px',
            boxSizing: 'border-box',
          }}
        />
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #e5e7eb',
          paddingTop: '1rem',
          marginTop: '1rem',
        }}
      >
        <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column' }}>
          <span
            style={
              saveColor === 'text-green-600'
                ? { color: '#16a34a', fontWeight: 500 }
                : saveColor === 'text-red-600'
                ? { color: '#dc2626', fontWeight: 500 }
                : { color: '#6b7280', fontWeight: 500 }
            }
          >
            {saveMsg}
          </span>
          <span style={{ color: '#2563eb' }}>{uploadStatus}</span>
        </div>

        <button onClick={onClose} style={{ padding: '0.5rem 1rem', backgroundColor: '#e5e7eb', color: '#111827', borderRadius: '0.375rem', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          Close
        </button>
      </div>
    </div>
  );
};

export default NotePopup;
