import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db, auth } from '../firebaseConfig';
import { onAuthStateChanged } from "firebase/auth";
import Header from './Header';
import InviteMemberModal from './InviteMemberModal';
import AnnounceModal from './AnnounceModal';
import ScheduleMeetingModal from './ScheduleMeetingModal';
import TeamProjectTable from './TeamProjectTable';
import NotificationsModal from './NotificationsModal'; // <-- 1. IMPORT NEW MODAL

// Spinner component remains the same
const Spinner = () => (
    <div className="flex justify-center items-center py-10">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);

// -- AnnouncementsSection (unchanged) --
const AnnouncementsSection = ({ teamId, isTeamCreator, refreshTrigger }) => { // Added refreshTrigger prop
    const [updates, setUpdates] = useState([]); // Combine announcements and meetings
    const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
    const [errorAnnouncements, setErrorAnnouncements] = useState(null);

    const fetchAnnouncements = useCallback(async () => {
        setIsLoadingAnnouncements(true);
        setErrorAnnouncements(null);
        try {
            const announcementsRef = collection(db, `teams/${teamId}/announcements`);
            const q = query(announcementsRef, orderBy('createdAt', 'desc')); // Order by most recent
            const querySnapshot = await getDocs(q);
            const fetchedUpdates = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setUpdates(fetchedUpdates);
        } catch (err) {
            console.error("Error fetching announcements:", err);
            setErrorAnnouncements("Failed to load announcements and meetings.");
        } finally {
            setIsLoadingAnnouncements(false);
        }
    }, [teamId]); // Dependency on teamId

    useEffect(() => {
        // Fetch announcements initially and whenever refreshTrigger changes
        fetchAnnouncements();
    }, [teamId, fetchAnnouncements, refreshTrigger]); // Added refreshTrigger to dependencies

    return (
        <div className="bg-white p-4 rounded-lg shadow border h-full">
            <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Updates & Announcements</h3>
            {isLoadingAnnouncements && <Spinner />}
            {errorAnnouncements && <p className="text-red-500 text-sm mt-2">{errorAnnouncements}</p>}
            {!isLoadingAnnouncements && updates.length === 0 && (
                <p className="text-sm text-gray-500 italic">No announcements or meetings yet.</p>
            )}
            {!isLoadingAnnouncements && updates.length > 0 && (
                <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {updates.map(update => (
                        <li key={update.id} className={`text-sm p-2 border-l-4 rounded-r bg-gray-50 ${update.type === 'meeting' ? 'border-blue-500' : 'border-green-500'}`}>
                            {update.type === 'meeting' ? (
                                <>
                                    <strong className="font-medium text-blue-700">Meeting:</strong> {update.title} <br />
                                    <span className="text-xs text-gray-500">Starts: {update.startDateTime?.toDate().toLocaleString()} </span>
                                    {update.endDateTime && <span className="text-xs text-gray-500"> - Ends: {update.endDateTime?.toDate().toLocaleString()}</span>}
                                    {update.description && <p className="text-xs text-gray-600 mt-1">{update.description}</p>}
                                    {update.meetingLink && (
                                        <a href={update.meetingLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs mt-1 block">
                                            Join Meeting
                                        </a>
                                    )}
                                    <p className="text-xs text-gray-500 mt-2">Scheduled by: {update.creatorDisplayName} at {update.createdAt?.toDate().toLocaleDateString()}</p>
                                </>
                            ) : (
                                <>
                                    <strong className="font-medium text-green-700">Announcement:</strong> {update.text} <br />
                                    <p className="text-xs text-gray-500">By: {update.creatorDisplayName} at {update.createdAt?.toDate().toLocaleDateString()}</p>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
// -- End Updated AnnouncementsSection --

// -- MembersSection (unchanged) --
const MembersSection = ({ membersDetails, isTeamCreator, onInviteClick }) => {
    // TODO: Add functionality to remove members (only for creator)
    return (
        <div className="bg-white p-4 rounded-lg shadow border h-full">
            <div className="flex justify-between items-center mb-3 border-b pb-2">
                <h3 className="text-lg font-semibold text-gray-700">Members</h3>
                {isTeamCreator && (
                    <button
                        onClick={onInviteClick}
                        className="text-xs bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-3 rounded-md shadow-sm transition-colors"
                    >
                        + Invite
                    </button>
                )}
            </div>
            {membersDetails.length > 0 ? (
                <ul className="list-none space-y-2 max-h-96 overflow-y-auto pr-2">
                    {membersDetails.map((member) => (
                        <li key={member.uid} className="flex items-center justify-between gap-3 bg-gray-50 p-2 rounded">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <span className="flex-shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full bg-blue-100 text-sm font-semibold text-blue-800">
                                    {(member.displayName || member.email || '?')[0].toUpperCase()}
                                </span>
                                <span className="text-sm font-medium text-gray-800 truncate" title={member.displayName || member.email}>
                                    {member.displayName || member.email || `UID: ${member.uid}`}
                                </span>
                            </div>
                            {/* {isTeamCreator && member.uid !== auth.currentUser?.uid && ( // Don't allow removing self
                                <button className="text-xs text-red-500 hover:text-red-700 flex-shrink-0">Remove</button> // TODO: Add onClick
                            )} */}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-gray-500 italic">No members listed yet.</p>
            )}
        </div>
    );
};


const TeamView = () => {
    const { teamId } = useParams();
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState(auth.currentUser);
    const [teamData, setTeamData] = useState(null);
    const [membersDetails, setMembersDetails] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- ADD THIS STATE ---
    // This state will control rendering the page content
    const [isAuthorized, setIsAuthorized] = useState(false);

    // State to trigger refresh of announcements/meetings
    const [announcementRefreshKey, setAnnouncementRefreshKey] = useState(0);

    // Modal States
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [isAnnounceModalOpen, setIsAnnounceModalOpen] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    // --- 2. ADD NOTIFICATION MODAL STATE ---
    const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);


    // Determine if the current user created the team
    const isTeamCreator = teamData?.createdBy === currentUser?.uid;

    // Callback to refresh announcements/meetings
    const refreshAnnouncements = useCallback(() => {
        setAnnouncementRefreshKey(prevKey => prevKey + 1);
    }, []);

    // Auth listener to update current user state
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
        });
        return unsubscribe;
    }, []);

    // --- MODIFIED Fetching logic (unchanged) ---
    useEffect(() => {
        const fetchTeamAndMembers = async () => {
            if (!teamId) { 
                setError("No team ID provided."); 
                setIsLoading(false); 
                return; 
            }
            
            setIsLoading(true); 
            setError(null); 
            setTeamData(null); 
            setMembersDetails([]);
            setIsAuthorized(false); // Reset authorization on each fetch

            try {
                // Fetch the team document
                const teamDocRef = doc(db, "teams", teamId);
                const teamDocSnap = await getDoc(teamDocRef);

                // --- 1. Check if team exists ---
                if (!teamDocSnap.exists()) {
                    setError("Team not found.");
                    setIsLoading(false);
                    // You might want to redirect here too, e.g., navigate('/home');
                    return; 
                }

                const fetchedTeamData = teamDocSnap.data();

                // --- 2. AUTHORIZATION CHECK ---
                
                // Case A: User is not logged in
                if (!currentUser) {
                    console.warn("Access Denied: User not logged in. Redirecting to login.");
                    navigate('/'); // Redirect to login/root page
                    setIsLoading(false); // Stop loading
                    return; // Stop execution
                }

                // Case B: User is logged in, but NOT in the members list
                if (!fetchedTeamData.members || !fetchedTeamData.members.includes(currentUser.uid)) {
                    console.warn("Access Denied: User is not a member of this team. Redirecting to home.");
                    navigate('/home'); // Redirect to home dashboard
                    setIsLoading(false); // Stop loading
                    return; // Stop execution
                }

                // --- 3. SUCCESS: User is authorized ---
                setIsAuthorized(true); // Grant access
                setTeamData({ id: teamDocSnap.id, ...fetchedTeamData });

                // --- 4. Fetch member details (now that we're authorized) ---
                const memberUIDs = fetchedTeamData.members || [];
                if (memberUIDs.length > 0) {
                    const memberPromises = memberUIDs.map(uid => getDoc(doc(db, "users", uid)));
                    const memberDocsSnap = await Promise.all(memberPromises);
                    const memberInfo = memberDocsSnap.map((userDoc, index) => {
                        const uid = memberUIDs[index];
                        if (userDoc.exists()) { const userData = userDoc.data(); return { uid, displayName: userData.displayName || null, email: userData.email || 'No email' }; }
                        else { return { uid, displayName: null, email: 'Profile not found' }; }
                    });
                    setMembersDetails(memberInfo);
                } else { 
                    setMembersDetails([]); 
                }

            } catch (err) { 
                console.error("Error fetching team/members:", err); 
                setError("Failed to load data."); 
            } finally { 
                setIsLoading(false); // Final state update
            }
        };

        fetchTeamAndMembers();
        
    }, [teamId, currentUser, navigate]); // Added currentUser and navigate as dependencies

    return (
        <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
            {/* --- 3. PASS PROP TO HEADER --- */}
            <Header onNotificationClick={() => setIsNotificationsModalOpen(true)} />

            <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                
                {/* --- MODIFIED RENDER LOGIC (unchanged) --- */}
                
                {isLoading && <Spinner />}
                
                {error && <div className="text-center text-red-600 bg-red-100 p-4 rounded-md shadow">{error}</div>}

                {!isLoading && !error && teamData && isAuthorized && (
                    <>
                        <div className="mb-6 flex justify-between items-center">
                            <Link to="/home" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 hover:underline">
                                &larr; Back to Teams
                            </Link>
                            {/* Admin Action Buttons */}
                            {isTeamCreator && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setIsAnnounceModalOpen(true)}
                                        className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md shadow-sm transition-colors"
                                    >
                                        Announce
                                    </button>
                                    <button
                                        onClick={() => setIsScheduleModalOpen(true)}
                                        className="bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md shadow-sm transition-colors"
                                    >
                                        Schedule Meeting
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Use Grid for layout */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Column 1: Team Info & Announcements */}
                            <div className="lg:col-span-2 space-y-6">
                                {/* Team Info Card */}
                                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                                    <h1 className="text-3xl font-bold text-gray-800 mb-2">{teamData.teamName}</h1>
                                    <p className="text-base text-gray-600">{teamData.description || 'No description provided.'}</p>
                                    <p className="text-xs text-gray-500 mt-3">Created: {teamData.createdAt?.toDate().toLocaleDateString() || 'N/A'}</p>
                                </div>

                                {/* Announcements Section */}
                                <AnnouncementsSection teamId={teamId} isTeamCreator={isTeamCreator} refreshTrigger={announcementRefreshKey} />
                            </div>

                            {/* Column 2: Members */}
                            <div className="lg:col-span-1">
                                <MembersSection
                                    membersDetails={membersDetails}
                                    isTeamCreator={isTeamCreator}
                                    onInviteClick={() => setIsInviteModalOpen(true)}
                                />
                            </div>

                            {/* Full Width Below: Team Project Table */}
                            <div className="lg:col-span-3 mt-8">
                                <TeamProjectTable teamId={teamId} />
                            </div>

                        </div>
                    </>
                )}
            </main>

            {/* Render Modals (only render if authorized, otherwise they could flash) */}
            {isAuthorized && (
                <>
                    <InviteMemberModal
                        isOpen={isInviteModalOpen}
                        onClose={() => setIsInviteModalOpen(false)}
                        teamId={teamId}
                    />
                    <AnnounceModal
                        isOpen={isAnnounceModalOpen}
                        onClose={() => setIsAnnounceModalOpen(false)}
                        teamId={teamId}
                        onAnnouncementPosted={refreshAnnouncements} // Pass callback
                    />
                    <ScheduleMeetingModal
                        isOpen={isScheduleModalOpen}
                        onClose={() => setIsScheduleModalOpen(false)}
                        teamId={teamId}
                        onMeetingScheduled={refreshAnnouncements} // Pass callback
                    />

                    {/* --- 4. RENDER THE NEW MODAL --- */}
                    <NotificationsModal
                        isOpen={isNotificationsModalOpen}
                        onClose={() => setIsNotificationsModalOpen(false)}
                    />
                </>
            )}

        </div>
    );
};

export default TeamView;