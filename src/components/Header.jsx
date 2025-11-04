// src/components/Header.jsx
import React, { useState, useEffect, useContext } from 'react'; // --- IMPORT useContext ---
import { Link } from 'react-router-dom';
import { signOut } from "firebase/auth";
import { auth, db } from '../firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';

// --- REMOVE I18N IMPORT ---
// import { useTranslation } from 'react-i18next';
// --- END I18N IMPORT ---

// --- NEW CONTEXT IMPORT ---
import { LanguageContext } from '../contexts/LanguageContext.jsx'; // Import our new context
// --- END NEW CONTEXT IMPORT ---


// Placeholder Icons (no changes)
const BellIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341A6.002 6.002 0 006 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
    </svg>
);
const SearchIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
);

const Header = ({ onNotificationClick }) => {
    // --- USE CONTEXT HOOK ---
    const { t } = useContext(LanguageContext); // Get 't' from our context
    // --- END CONTEXT HOOK ---

    const [user, setUser] = useState(null);
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isMasterAdmin, setIsMasterAdmin] = useState(false);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                try {
                    const userDocRef = doc(db, 'users', currentUser.uid);
                    const docSnap = await getDoc(userDocRef);
                    if (docSnap.exists() && docSnap.data().role === 'Master Admin') {
                        setIsMasterAdmin(true);
                    } else {
                        setIsMasterAdmin(false);
                    }
                } catch (err) {
                    console.error("Error fetching user role in header:", err);
                    setIsMasterAdmin(false);
                }
            } else {
                setIsMasterAdmin(false);
            }
        });
        return () => unsubscribe();
    }, []);

    // Listener for unread notifications (no changes)
    useEffect(() => {
        if (user) {
            const notifsRef = collection(db, 'notifications');
            const q = query(
              notifsRef,
              where('userId', '==', user.uid),
              where('isRead', '==', false)
            );
            
            const unsubscribe = onSnapshot(q, (snapshot) => {
              setUnreadCount(snapshot.size);
            });
            
            return () => unsubscribe();
        } else {
            setUnreadCount(0);
        }
    }, [user]);

    // Close dropdown when clicking outside (no changes)
    useEffect(() => {
        const handleClickOutside = (event) => {
          if (showUserDropdown && !event.target.closest('#user-menu-button') && !event.target.closest('#user-menu-dropdown')) {
            setShowUserDropdown(false);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showUserDropdown]);


    const handleLogout = async () => {
        setShowUserDropdown(false);
        try {
            await signOut(auth);
            // App.jsx routing will handle redirect
        } catch (error) {
            console.error("Logout Error:", error);
            // --- USE T() FUNCTION (now from context) ---
            alert(t('header.logoutError'));
        }
    };

    return (
        <header className="bg-white shadow-md sticky top-0 z-50 w-full">
            <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">

                    {/* Left: Dashboard/Brand */}
                    <div className="flex-shrink-0">
                        <Link 
                            to={isMasterAdmin ? "/admin-dashboard" : "/home"}
                            className="text-2xl font-bold text-gray-800 hover:text-blue-600 transition-colors"
                        >
                            {/* --- USE T() FUNCTION --- */}
                            {t('header.dashboard')}
                        </Link>
                    </div>

                    {/* Middle: Search Bar */}
                    <div className="flex-1 px-4 sm:px-6 lg:px-8 max-w-lg">
                        <div className="relative">
                            <input
                                type="search"
                                // --- USE T() FUNCTION ---
                                placeholder={t('header.searchPlaceholder')}
                                className="block w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                            />
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <SearchIcon />
                            </div>
                        </div>
                    </div>

                    {/* Right: Icons & User Menu */}
                    <div className="flex items-center gap-x-3 sm:gap-x-4">
                        {/* Notification Button */}
                        <button
                            type="button"
                            onClick={onNotificationClick}
                            className="relative p-1 rounded-full text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 hover:bg-gray-100"
                        >
                            {/* --- USE T() FUNCTION --- */}
                            <span className="sr-only">{t('header.viewNotifications')}</span>
                            <BellIcon />
                            {unreadCount > 0 && (
                                <span className="absolute top-0 right-0 block h-3 w-3">
                                    <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                                </span>
                            )}
                        </button>

                        {/* Profile dropdown */}
                        <div className="relative">
                            <div>
                                <button
                                    type="button"
                                    className={`rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                        isMasterAdmin 
                                        ? 'ring-yellow-500' 
                                        : 'focus:ring-blue-500'
                                    }`}
                                    id="user-menu-button"
                                    aria-expanded={showUserDropdown}
                                    aria-haspopup="true"
                                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                                >
                                    {/* --- USE T() FUNCTION --- */}
                                    <span className="sr-only">{t('header.openUserMenu')}</span>
                                    <span className={`inline-flex items-center justify-center h-8 w-8 rounded-full ${
                                        isMasterAdmin ? 'bg-yellow-500' : 'bg-gray-500'
                                    }`}>
                                      <span className="text-sm font-medium leading-none text-white">
                                        {(user?.email || '?')[0].toUpperCase()}
                                      </span>
                                    </span>
                                </button>
                            </div>

                            {/* Dropdown menu */}
                            {showUserDropdown && (
                                <div
                                    id="user-menu-dropdown"
                                    className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
                                    role="menu" aria-orientation="vertical" aria-labelledby="user-menu-button" tabIndex="-1"
                                >
                                    <div className="px-4 py-2 border-b border-gray-100">
                                        {/* --- USE T() FUNCTION --- */}
                                        <p className="text-sm text-gray-500">{t('header.signedInAs')}</p>
                                        <p className="text-sm font-medium text-gray-900 truncate" title={user?.email || ''}>
                                            {user?.email || '...'}
                                        </p>
                                        {isMasterAdmin && (
                                            <span className="text-xs font-semibold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full mt-1 inline-block">
                                                {/* --- USE T() FUNCTION --- */}
                                                {t('header.masterAdmin')}
                                            </span>
                                        )}
                                    </div>
                                    
                                    {isMasterAdmin && (
                                        <Link
                                            to="/admin-dashboard"
                                            onClick={() => setShowUserDropdown(false)}
                                            className="block px-4 py-2 text-sm font-semibold text-yellow-700 hover:bg-gray-100"
                                            role="menuitem" tabIndex="-1"
                                        >
                                            {/* --- USE T() FUNCTION --- */}
                                            {t('header.adminDashboard')}
                                        </Link>
                                    )}
                                    
                                    <Link
                                        to="/settings"
                                        onClick={() => setShowUserDropdown(false)}
                                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                        role="menuitem" tabIndex="-1"
                                    >
                                        {/* --- USE T() FUNCTION --- */}
                                        {t('header.settings')}
                                    </Link>
                                    <button
                                        onClick={handleLogout}
                                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                                        role="menuitem" tabIndex="-1"
                                    >
                                        {/* --- USE T() FUNCTION --- */}
                                        {t('header.logout')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </nav>
        </header>
    );
};

export default Header;