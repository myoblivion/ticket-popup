import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { signOut } from "firebase/auth";
import { auth } from '../firebaseConfig'; // Assuming auth is exported from here

// Placeholder Icons (replace with actual icons or library like react-icons)
const NotificationIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.4-1.4a2 2 0 01-1.4-1.4V11a6 6 0 10-12 0v2.2a2 2 0 01-1.4 1.4L3 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
);
const UserIcon = () => (
    <svg className="w-6 h-6 rounded-full" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.1 17.8a14 14 0 0113.8 0M12 10a3 3 0 110-6 3 3 0 010 6zm0 12a9 9 0 110-18 9 9 0 010 18z"></path></svg>
);
const SearchIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
);

const Header = () => {
    const [user, setUser] = useState(null);
    const [showUserDropdown, setShowUserDropdown] = useState(false);

    useEffect(() => {
        // Simple listener just to get user email for display, actual auth protection is in App.jsx
        const unsubscribe = auth.onAuthStateChanged((currentUser) => {
            setUser(currentUser);
        });
        return () => unsubscribe();
    }, []);

    // Close dropdown when clicking outside
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
            alert("Failed to log out.");
        }
    };

    return (
        <header className="bg-white shadow-md sticky top-0 z-50 w-full">
            <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"> {/* Container with max-width and padding */}
                <div className="flex justify-between items-center h-16"> {/* Flex container for alignment */}

                    {/* Left: Dashboard/Brand */}
                    <div className="flex-shrink-0">
                        <Link to="/home" className="text-2xl font-bold text-gray-800 hover:text-blue-600 transition-colors">
                            {/* You can add a logo here */}
                            Dashboard
                        </Link>
                    </div>

                    {/* Middle: Search Bar */}
                    <div className="flex-1 px-4 sm:px-6 lg:px-8 max-w-lg"> {/* Takes up space, limited width, padding */}
                        <div className="relative">
                            <input
                                type="search"
                                placeholder="Search..."
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
                            className="p-1 rounded-full text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 hover:bg-gray-100"
                        >
                            <span className="sr-only">View notifications</span>
                            <NotificationIcon />
                        </button>

                        {/* Profile dropdown */}
                        <div className="relative">
                            <div>
                                <button
                                    type="button"
                                    className="bg-white rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                    id="user-menu-button"
                                    aria-expanded={showUserDropdown}
                                    aria-haspopup="true"
                                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                                >
                                    <span className="sr-only">Open user menu</span>
                                    {/* Replace with user avatar if available */}
                                    <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-gray-500">
                                      <span className="text-sm font-medium leading-none text-white">
                                        {(user?.email || '?')[0].toUpperCase()}
                                      </span>
                                    </span>
                                    {/* <UserIcon /> */}
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
                                        <p className="text-sm text-gray-500">Signed in as</p>
                                        <p className="text-sm font-medium text-gray-900 truncate" title={user?.email || ''}>
                                            {user?.email || '...'}
                                        </p>
                                    </div>
                                    <Link
                                        to="/settings"
                                        onClick={() => setShowUserDropdown(false)}
                                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                        role="menuitem" tabIndex="-1"
                                    >
                                        Settings
                                    </Link>
                                    <button
                                        onClick={handleLogout}
                                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                                        role="menuitem" tabIndex="-1"
                                    >
                                        Logout
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