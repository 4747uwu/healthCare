import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import starRadiologyLogo from '../../assets/xcentic.png';

const AdminNavbar = () => {
    const { currentUser, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/auth/login');
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const isActive = (path) => {
        return location.pathname === path;
    };

    const isActivePattern = (pattern) => {
        return location.pathname.includes(pattern);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <nav className="bg-white shadow-lg border-b">
            <div className="max-w-full px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    {/* Left side - Logo and Navigation */}
                    <div className="flex items-center space-x-8">
                        {/* Logo */}
                        <Link to="/admin/dashboard" className="flex items-center">
                            <div className="flex-shrink-0 flex items-center">
                                <img 
                                    className="h-8 w-auto" 
                                    src={starRadiologyLogo} 
                                    alt="Star Radiology" 
                                    onError={(e) => {
                                        console.error('Logo failed to load:', e);
                                        e.target.style.display = 'none';
                                        e.target.nextElementSibling.style.display = 'block';
                                    }}
                                />
                                <div className="hidden">
                                  <div className={`flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500 shadow-lg`}>
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                  </div>
                                </div>
                            </div>
                        </Link>

                        {/* Navigation Links */}
                        <div className="hidden md:flex space-x-1">
                            {/* Dashboard */}
                            <Link
                                to="/admin/dashboard"
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    isActive('/admin/dashboard')
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                                }`}
                            >
                                <div className="flex items-center space-x-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6a2 2 0 01-2 2H10a2 2 0 01-2-2V5z" />
                                    </svg>
                                    <span>Dashboard</span>
                                </div>
                            </Link>

                            {/* 🆕 ADD: DICOM Uploader */}
                            <Link
                                to="/admin/dicom-uploader"
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    isActive('/admin/dicom-uploader')
                                        ? 'bg-green-100 text-green-700'
                                        : 'text-gray-700 hover:text-green-600 hover:bg-gray-100'
                                }`}
                            >
                                <div className="flex items-center space-x-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <span>Upload Images</span>
                                </div>
                            </Link>

                            {/* Doctors Management */}
                            <Link
                                to="/admin/doctors"
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    isActivePattern('/admin/doctors')
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                                }`}
                            >
                                <div className="flex items-center space-x-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <span>Doctors</span>
                                </div>
                            </Link>

                            {/* Labs Management */}
                            <Link
                                to="/admin/labs"
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    isActivePattern('/admin/labs')
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                                }`}
                            >
                                <div className="flex items-center space-x-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                    <span>Labs</span>
                                </div>
                            </Link>

                            {/* Reports */}
                            <Link
                                to="/admin/reports"
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    isActivePattern('/admin/reports')
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                                }`}
                            >
                                <div className="flex items-center space-x-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span>Reports</span>
                                </div>
                            </Link>

                            {/* Settings */}
                            <Link
                                to="/admin/settings"
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    isActivePattern('/admin/settings')
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                                }`}
                            >
                                <div className="flex items-center space-x-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span>Settings</span>
                                </div>
                            </Link>
                        </div>
                    </div>

                    {/* Right side - User Menu */}
                    <div className="flex items-center space-x-4">
                        {/* Notifications */}
                        <button className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5-5 5-5h-5m-6 0H4l5 5-5 5h5m6-10v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2h8a2 2 0 012 2z" />
                            </svg>
                        </button>

                        {/* User Dropdown */}
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                className="flex items-center space-x-2 p-2 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                    <span className="text-sm font-medium text-blue-600">
                                        {currentUser?.fullName?.charAt(0) || currentUser?.username?.charAt(0) || 'A'}
                                    </span>
                                </div>
                                <div className="hidden md:block text-left">
                                    <div className="text-sm font-medium text-gray-900">
                                        {currentUser?.fullName || currentUser?.username || 'Admin'}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {currentUser?.role || 'Administrator'}
                                    </div>
                                </div>
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {/* Dropdown Menu */}
                            {dropdownOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border">
                                    <Link
                                        to="/admin/profile"
                                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                                        onClick={() => setDropdownOpen(false)}
                                    >
                                        <div className="flex items-center space-x-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            <span>Profile</span>
                                        </div>
                                    </Link>
                                    <Link
                                        to="/admin/account-settings"
                                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                                        onClick={() => setDropdownOpen(false)}
                                    >
                                        <div className="flex items-center space-x-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <span>Account Settings</span>
                                        </div>
                                    </Link>
                                    <div className="border-t border-gray-100 my-1"></div>
                                    <button
                                        onClick={handleLogout}
                                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                        <div className="flex items-center space-x-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                            </svg>
                                            <span>Sign Out</span>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Navigation Menu */}
            <div className="md:hidden border-t border-gray-200">
                <div className="px-2 pt-2 pb-3 space-y-1">
                    <Link
                        to="/admin/dashboard"
                        className={`block px-3 py-2 rounded-md text-base font-medium ${
                            isActive('/admin/dashboard')
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                        }`}
                    >
                        Dashboard
                    </Link>
                    
                    {/* 🆕 ADD: Mobile DICOM Uploader */}
                    <Link
                        to="/admin/dicom-uploader"
                        className={`block px-3 py-2 rounded-md text-base font-medium ${
                            isActive('/admin/dicom-uploader')
                                ? 'bg-green-100 text-green-700'
                                : 'text-gray-700 hover:text-green-600 hover:bg-gray-100'
                        }`}
                    >
                        Upload Images
                    </Link>
                    
                    <Link
                        to="/admin/doctors"
                        className={`block px-3 py-2 rounded-md text-base font-medium ${
                            isActivePattern('/admin/doctors')
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                        }`}
                    >
                        Doctors
                    </Link>
                    <Link
                        to="/admin/labs"
                        className={`block px-3 py-2 rounded-md text-base font-medium ${
                            isActivePattern('/admin/labs')
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                        }`}
                    >
                        Labs
                    </Link>
                    <Link
                        to="/admin/reports"
                        className={`block px-3 py-2 rounded-md text-base font-medium ${
                            isActivePattern('/admin/reports')
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                        }`}
                    >
                        Reports
                    </Link>
                    <Link
                        to="/admin/settings"
                        className={`block px-3 py-2 rounded-md text-base font-medium ${
                            isActivePattern('/admin/settings')
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                        }`}
                    >
                        Settings
                    </Link>
                </div>
            </div>
        </nav>
    );
};

export default AdminNavbar;