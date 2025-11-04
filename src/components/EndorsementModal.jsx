// src/components/EndorsementModal.jsx
import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, orderBy, getDocs, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import AddEndorsementModal from './AddEndorsementModal';
import HandoverPopup from './HandoverPopup'; // <-- 1. IMPORT THE NEW POPUP
import { LanguageContext } from '../contexts/LanguageContext';

// --- Spinner component ---
const Spinner = () => (
    <div className="flex justify-center items-center py-6">
        <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);

// --- formatDate utility ---
const formatDate = (value, { fallback = '' } = {}) => {
    if (!value) return fallback;
    try {
        let d;
        if (typeof value === 'object' && typeof value.toDate === 'function') {
        d = value.toDate();
        } else if (value instanceof Date) {
        d = value;
        } else if (typeof value === 'string') {
        const parsed = new Date(value);
        if (!isNaN(parsed)) d = parsed;
        else return value;
        } else {
        return String(value);
        }
        return d.toISOString().split('T')[0]; // YYYY-MM-DD format
    } catch (err) {
        console.error('formatDate error', err, value);
        return String(value);
    }
};

// --- THIS IS THE HANDOVER SECTION COMPONENT ---
// (It is not a modal itself)
const HandoversSection = ({ teamId }) => {
    const { t } = useContext(LanguageContext);
    const [handovers, setHandovers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // --- 2. ADD STATE FOR THE DETAILS POPUP ---
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [selectedHandover, setSelectedHandover] = useState(null);

    // --- NEW HANDLER: Update checkbox field in Firestore ---
    const handleCheckboxChange = async (docId, field, currentValue) => {
        const docRef = doc(db, `teams/${teamId}/endorsements`, docId);
        try {
            setHandovers(prev => 
                prev.map(item => 
                    item.id === docId ? { ...item, [field]: !currentValue } : item
                )
            );
            await updateDoc(docRef, { [field]: !currentValue });
        } catch (err) {
            console.error("Error updating checkbox:", err);
            setHandovers(prev => 
                prev.map(item => 
                    item.id === docId ? { ...item, [field]: currentValue } : item
                )
            );
        }
    };

    // --- NEW HANDLER: Update status field in Firestore ---
    const handleStatusChange = async (docId, newStatus) => {
        const docRef = doc(db, `teams/${teamId}/endorsements`, docId);
        const oldStatus = handovers.find(h => h.id === docId)?.status;
        try {
            setHandovers(prev =>
                prev.map(item =>
                    item.id === docId ? { ...item, status: newStatus } : item
                )
            );
            await updateDoc(docRef, { status: newStatus });
        } catch (err) {
            console.error("Error updating status:", err);
            setHandovers(prev =>
                prev.map(item =>
                    item.id === docId ? { ...item, status: oldStatus } : item
                )
            );
        }
    };

    // --- NEW: Delete Handover Function ---
    const handleDelete = async (docId) => {
        if (!window.confirm(t('handovers.confirmDelete', 'Are you sure you want to delete this item?'))) {
            return;
        }
        
        const docRef = doc(db, `teams/${teamId}/endorsements`, docId);
        try {
            await deleteDoc(docRef);
            setHandovers(prev => prev.filter(item => item.id !== docId));
        } catch (err) {
            console.error("Error deleting handover:", err);
            setError(t('handovers.deleteError', 'Failed to delete handover. Please try again.'));
        }
    };

    // --- NEW Column Headers (from screenshot) ---
    const mainHeaders = useMemo(() => [
        { key: 'id', label: t('handovers.id', '번호') },
        { key: 'date', label: t('handovers.date', 'date') },
        { key: 'categories', label: t('handovers.categories', 'categories') },
        { key: 'content', label: t('handovers.content', 'handover contents') },
        { key: 'details', label: t('handovers.details', 'handover details') },
        { key: 'postedBy', label: t('handovers.postedBy', 'Posted by') },
    ], [t]);

    const checkerHeaders = useMemo(() => [
        { key: 'checkerCS', label: t('handovers.checkerCS', 'CS팀장') },
        { key: 'checkerPark', label: t('handovers.checkerPark', '박팀장') },
        { key: 'checkerSeo', label: t('handovers.checkerSeo', '서실장') },
        { key: 'checkerDev', label: t('handovers.checkerDev', '개발실장') },
        { key: 'checkerYoo', label: t('handovers.checkerYoo', '유실장') },
        { key: 'checkerKim', label: t('handovers.checkerKim', '김실장') },
    ], [t]);

    // --- Fetch Handovers ---
    const fetchHandovers = useCallback(async () => {
        if (!teamId) return;
        setIsLoading(true);
        setError(null);
        try {
            const handoversRef = collection(db, `teams/${teamId}/endorsements`);
            const q = query(handoversRef, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const fetchedData = querySnapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            }));
            setHandovers(fetchedData);
        } catch (err) {
            console.error("Error fetching handovers:", err);
            setError(t('admin.loadEndorsementsError', "Failed to load handover data. Please try again."));
        } finally {
            setIsLoading(false);
        }
    }, [teamId, t]);

    useEffect(() => {
        fetchHandovers();
    }, [fetchHandovers]);

    // --- UPDATED: Render EDITABLE Checkbox Cell ---
    const renderCheckbox = (item, fieldKey) => (
        <input
            type="checkbox"
            checked={item[fieldKey] === true}
            onChange={() => handleCheckboxChange(item.id, fieldKey, item[fieldKey])}
            className="form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out cursor-pointer"
        />
    );

    // --- UPDATED: Render EDITABLE Status Cell ---
    const renderStatus = (item) => {
        const statusOptions = ['Pending', 'In Progress', 'Approved', 'Rejected'];
        return (
            <select
                value={item.status || 'Pending'}
                onChange={(e) => handleStatusChange(item.id, e.target.value)}
                className="text-xs border rounded px-2 py-1 w-full bg-white cursor-pointer"
            >
                {statusOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
                {!statusOptions.includes(item.status) && item.status && (
                    <option value={item.status}>{item.status}</option>
                )}
            </select>
        );
    };

    const openAddModal = () => {
        setIsAddModalOpen(true);
    };

    const handleHandoverAdded = () => {
        fetchHandovers(); // Refetch the list
    };

    // --- 3. *** THIS IS THE FIX *** ---
    // This function now correctly sets the state to open the popup
    const openDetailsModal = (item) => {
        setSelectedHandover(item);
        setIsDetailsModalOpen(true);
    };

    const closeDetailsModal = () => {
        setIsDetailsModalOpen(false);
        setSelectedHandover(null);
    };

    return (
        <>
            <div>
                {/* --- Section Header --- */}
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-semibold text-gray-800">{t('admin.viewHandovers', 'View Handovers')}</h2>
                    <button
                        onClick={openAddModal}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm shadow-sm"
                    >
                        {t('admin.addHandover', '+ Add Handover')}
                    </button>
                </div>

                {/* --- Content Box --- */}
                <div className="bg-white rounded-lg shadow border overflow-hidden">
                    {isLoading && <Spinner />}
                    {error && <p className="text-red-600 text-center p-4">{error}</p>}
                    
                    {!isLoading && !error && handovers.length === 0 && (
                        <div className="text-center p-6">
                            <p className="text-gray-500 italic mb-4">{t('admin.noHandovers', 'No handovers found for this team.')}</p>
                            <button
                                onClick={openAddModal}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm shadow-sm"
                            >
                                {t('admin.addFirstHandover', 'Add First Handover')}
                            </button>
                        </div>
                    )}

                    {!isLoading && !error && handovers.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
                                <thead className="bg-gray-50 sticky top-0 z-10 text-xs text-gray-500 uppercase tracking-wider">
                                    <tr>
                                        {mainHeaders.map((header) => (
                                            <th
                                                key={header.key}
                                                scope="col"
                                                rowSpan={2}
                                                className="p-3 text-left font-medium border-b border-r"
                                            >
                                                {header.label}
                                            </th>
                                        ))}
                                        <th
                                            scope="col"
                                            colSpan={checkerHeaders.length}
                                            className="p-3 text-center font-medium border-b border-r"
                                        >
                                            {t('handovers.checker', 'Checker')}
                                        </th>
                                        <th scope="col" rowSpan={2} className="p-3 text-left font-medium border-b border-r">
                                            {t('handovers.status', 'Status')}
                                        </th>
                                        <th scope="col" rowSpan={2} className="p-3 text-left font-medium border-b border-r">
                                            {t('handovers.remarks', 'Remarks')}
                                        </th>
                                        <th scope="col" rowSpan={2} className="p-3 text-left font-medium border-b">
                                            {t('handovers.actions', 'Actions')}
                                        </th>
                                    </tr>
                                    <tr>
                                        {checkerHeaders.map((header) => (
                                            <th
                                                key={header.key}
                                                scope="col"
                                                className="p-3 text-center font-medium border-r"
                                            >
                                                {header.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                    {handovers.map((item, index) => (
                                        <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="p-2 whitespace-nowrap border-r">{item.id.substring(0, 6)}...</td>
                                            <td className="p-2 whitespace-nowrap border-r">{formatDate(item.createdAt)}</td>
                                            <td className="p-2 break-words max-w-xs border-r">{item.categories || '-'}</td>
                                            <td className="p-2 break-words max-w-md border-r">{item.content || '-'}</td>
                                            <td className="p-2 text-center border-r">
                                                <button onClick={() => openDetailsModal(item)} className="text-blue-600 hover:underline text-xs font-medium">
                                                    {t('common.view', 'View')}
                                                </button>
                                            </td>
                                            <td className="p-2 whitespace-nowrap border-r">{item.postedBy || item.writerName || 'N/A'}</td>
                                            
                                            {checkerHeaders.map((h) => (
                                                <td key={h.key} className="p-2 text-center border-r">
                                                    {renderCheckbox(item, h.key)}
                                                </td>
                                            ))}

                                            <td className="p-2 border-r min-w-[120px]">{renderStatus(item)}</td>
                                            <td className="p-2 break-words max-w-xs border-r">{item.remarks || item.details || '-'}</td>
                                            
                                            <td className="p-2 text-center">
                                                <button 
                                                    onClick={() => handleDelete(item.id)}
                                                    className="text-red-600 hover:text-red-800 hover:underline text-xs font-medium"
                                                >
                                                    {t('common.delete', 'Delete')}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* --- RENDER THE POPUPS --- */}

            <AddEndorsementModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                teamId={teamId}
                onEndorsementAdded={handleHandoverAdded}
                t={t}
            />

            {isDetailsModalOpen && selectedHandover && (
                <HandoverPopup
                    teamId={teamId}
                    handoverId={selectedHandover.id}
                    columnKey="details" // This is the field to edit
                    onClose={closeDetailsModal}
                />
            )}
        </>
    );
};

export default HandoversSection;