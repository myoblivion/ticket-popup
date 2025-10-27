// src/components/EndorsementModal.js
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, orderBy, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore'; // Import addDoc, serverTimestamp
import AddEndorsementModal from './AddEndorsementModal'; // *** IMPORT THE NEW MODAL ***

// --- Spinner component ---
const Spinner = () => (
    <div className="flex justify-center items-center py-6">
        <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);

// --- formatDate utility ---
const formatDate = (value, { fallback = '' } = {}) => {
    // ... (keep formatDate function as before)
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
        else return value; // Return original string if parsing fails
        } else {
        return String(value); // Fallback for other types
        }
        // Simple YYYY-MM-DD format
        return d.toISOString().split('T')[0];
    } catch (err) {
        console.error('formatDate error', err, value);
        return String(value);
    }
};

const EndorsementModal = ({ isOpen, onClose, teamId }) => {
    const [endorsements, setEndorsements] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    // *** NEW STATE for Add Modal ***
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // --- Column Headers ---
    const headers = [
        { key: 'id', label: 'ID' },
        { key: 'writerName', label: 'Writer' },
        { key: 'createdAt', label: 'Date' },
        { key: 'content', label: 'Content' },
        { key: 'teamLeadApproved', label: 'Team Lead' },
        { key: 'managerApproved', label: 'Manager' },
        { key: 'qaManagerApproved', label: 'QA Manager' },
        { key: 'devLeadApproved', label: 'Dev Lead' },
        { key: 'status', label: 'Status' },
        { key: 'details', label: 'Details' },
    ];

    // --- Fetch Endorsements ---
    const fetchEndorsements = useCallback(async () => {
        if (!teamId) return;
        setIsLoading(true);
        setError(null);
        try {
            const endorsementsRef = collection(db, `teams/${teamId}/endorsements`);
            const q = query(endorsementsRef, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const fetchedData = querySnapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            }));
            setEndorsements(fetchedData);
        } catch (err) {
            console.error("Error fetching endorsements:", err);
            setError("Failed to load endorsement data. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, [teamId]);

    // Fetch data when modal opens or teamId changes
    useEffect(() => {
        if (isOpen && teamId) {
            fetchEndorsements();
        } else {
            setEndorsements([]);
            setError(null);
        }
    }, [isOpen, teamId, fetchEndorsements]);


    // --- Render Checkbox Cell ---
    const renderCheckbox = (item, fieldKey) => {
        const isChecked = item[fieldKey] === true;
        return (
            <input
                type="checkbox"
                checked={isChecked}
                readOnly
                className="form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out cursor-not-allowed"
            />
        );
    };

    // --- Render Status Cell ---
    const renderStatus = (item) => {
        const statusOptions = ['Pending', 'Approved', 'Rejected', 'In Progress'];
        return (
            <select
                value={item.status || 'Pending'}
                readOnly
                className="text-xs border rounded px-2 py-1 w-full bg-gray-100 cursor-not-allowed appearance-none"
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

    // *** Function to open the Add modal ***
    const openAddModal = () => {
        setIsAddModalOpen(true);
    };

     // *** Function to handle refresh after adding ***
     const handleEndorsementAdded = () => {
        fetchEndorsements(); // Refetch the list
     };

    if (!isOpen) return null;

    return (
        <> {/* Use Fragment to wrap multiple root elements */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-70">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="flex justify-between items-center p-4 border-b">
                        <h2 className="text-xl font-semibold text-gray-800">Endorsements</h2>
                        {/* *** ADD ENDORSEMENT BUTTON IN HEADER *** */}
                        <div className="flex items-center gap-4">
                            <button
                                onClick={openAddModal}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm shadow-sm"
                            >
                                + Add Endorsement
                            </button>
                            <button
                                onClick={onClose}
                                className="text-gray-400 hover:text-gray-600 text-2xl focus:outline-none"
                                aria-label="Close modal"
                            >
                                &times;
                            </button>
                        </div>
                    </div>

                    {/* Content & Table */}
                    <div className="flex-1 overflow-auto p-4">
                        {isLoading && <Spinner />}
                        {error && <p className="text-red-600 text-center p-4">{error}</p>}
                        {!isLoading && !error && endorsements.length === 0 && (
                            // *** UPDATED EMPTY STATE WITH BUTTON ***
                            <div className="text-center p-6">
                                <p className="text-gray-500 italic mb-4">No endorsements found for this team.</p>
                                <button
                                    onClick={openAddModal}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm shadow-sm"
                                >
                                    Add First Endorsement
                                </button>
                            </div>
                        )}
                        {!isLoading && !error && endorsements.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
                                    <thead className="bg-gray-50 sticky top-0 z-10">
                                        <tr>
                                            {headers.map((header) => (
                                                <th
                                                    key={header.key}
                                                    scope="col"
                                                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap border-r last:border-r-0"
                                                >
                                                    {header.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {endorsements.map((item) => (
                                            <tr key={item.id} className="hover:bg-gray-50 text-sm">
                                                <td className="px-3 py-2 whitespace-nowrap border-r">{item.id.substring(0, 6)}...</td>
                                                <td className="px-3 py-2 whitespace-nowrap border-r">{item.writerName || 'N/A'}</td>
                                                <td className="px-3 py-2 whitespace-nowrap border-r">{formatDate(item.createdAt)}</td>
                                                <td className="px-3 py-2 whitespace-normal break-words max-w-xs border-r">{item.content || '-'}</td>
                                                <td className="px-3 py-2 text-center border-r">{renderCheckbox(item, 'teamLeadApproved')}</td>
                                                <td className="px-3 py-2 text-center border-r">{renderCheckbox(item, 'managerApproved')}</td>
                                                <td className="px-3 py-2 text-center border-r">{renderCheckbox(item, 'qaManagerApproved')}</td>
                                                <td className="px-3 py-2 text-center border-r">{renderCheckbox(item, 'devLeadApproved')}</td>
                                                <td className="px-3 py-2 border-r min-w-[120px]">{renderStatus(item)}</td>
                                                <td className="px-3 py-2 whitespace-normal break-words max-w-xs">{item.details || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end p-4 border-t bg-gray-50">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md text-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>

            {/* *** RENDER THE ADD MODAL *** */}
            <AddEndorsementModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                teamId={teamId}
                onEndorsementAdded={handleEndorsementAdded}
            />
        </>
    );
};

export default EndorsementModal;