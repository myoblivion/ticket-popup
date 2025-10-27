// src/components/MainLayout.jsx
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom'; // Important: Renders the nested route component
import Header from './Header'; // Assuming Header is persistent
import TeamChatModal from './TeamChatModal'; // Your chat modal
import NotificationsModal from './NotificationsModal'; // Also likely persistent

// Chat Icon SVG (or import if you have it elsewhere)
const ChatIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
);

function MainLayout() {
    const [isChatModalOpen, setIsChatModalOpen] = useState(false);
    const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false); // Manage notifications here too

    return (
        <div className="min-h-screen bg-gray-100 font-sans flex flex-col relative"> {/* Added relative */}
            {/* Header is now part of the layout */}
            <Header onNotificationClick={() => setIsNotificationsModalOpen(true)} />

            {/* Main content area where nested routes will render */}
            <main className="flex-1 w-full py-6">
                <Outlet /> {/* Child route component renders here */}
            </main>

            {/* Floating Chat Button */}
            <button
                onClick={() => setIsChatModalOpen(true)}
                className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg z-40 transition-transform hover:scale-110"
                aria-label="Open Team Chat"
            >
                <ChatIcon />
            </button>

            {/* Render Modals managed by the layout */}
            <TeamChatModal
                isOpen={isChatModalOpen}
                onClose={() => setIsChatModalOpen(false)}
            />
             <NotificationsModal
                isOpen={isNotificationsModalOpen}
                onClose={() => setIsNotificationsModalOpen(false)}
            />
        </div>
    );
}

export default MainLayout;