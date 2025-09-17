import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import starRadiologyLogo from '../../assets/xcentic.png';

const UniversalNavbar = () => {
  const { currentUser, logout } = useAuth();
  const [greeting, setGreeting] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 12) {
        setGreeting('Good morning');
      } else if (hour >= 12 && hour < 18) {
        setGreeting('Good afternoon');
      } else {
        setGreeting('Good evening');
      }
    };

    updateGreeting();
    const interval = setInterval(updateGreeting, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // ✅ ENHANCED: Get role-based configurations with all roles and templates link
  const getRoleConfig = () => {
    switch (currentUser?.role) {
      case 'admin':
        return {
          title: 'Star-Radiology',
          subtitle: 'Admin Portal',
          brandColor: 'text-blue-500',
          accentColor: 'bg-blue-500',
          hoverColor: 'hover:text-blue-600',
          activeColor: 'text-blue-600 bg-blue-50',
          links: [
            { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard', exact: true },
            { to: '/admin/doctors', label: 'Doctors Management', icon: 'users', exact: false },
            { to: '/admin/labs', label: 'Labs Management', icon: 'building', exact: false },
            { to: '/admin/owners', label: 'Owner Management', icon: 'crown', exact: false },
            { to: '/reports/tat', label: 'TAT Reports', icon: 'chart', exact: false },
            { to: '/admin/templates', label: 'Templates', icon: 'templates', exact: false }, // ✅ ADDED
          ],
          quickActions: [
            { to: '/admin/new-doctor', label: 'Add Doctor', icon: 'userPlus' },
            { to: '/admin/new-lab', label: 'Add Lab', icon: 'buildingPlus' },
            { to: '/admin/owners', label: 'Create Owner', icon: 'crown' },
          ]
        };
      case 'owner':
        return {
          title: 'Star-Radiology',
          subtitle: 'Owner Portal',
          brandColor: 'text-purple-500',
          accentColor: 'bg-purple-500',
          hoverColor: 'hover:text-purple-600',
          activeColor: 'text-purple-600 bg-purple-50',
          links: [
            { to: '/owner/dashboard', label: 'Dashboard', icon: 'dashboard', exact: true },
            { to: '/owner/invoices', label: 'Invoice Management', icon: 'receipt', exact: false },
          ],
          quickActions: []
        };
      case 'doctor_account':
        return {
          title: 'Star-Radiology',
          subtitle: 'Doctor Portal',
          brandColor: 'text-emerald-500',
          accentColor: 'bg-emerald-500',
          hoverColor: 'hover:text-emerald-600',
          activeColor: 'text-emerald-600 bg-emerald-50',
          links: [
            { to: '/doctor/dashboard', label: 'Dashboard', icon: 'dashboard', exact: true },
          ]
        };
      case 'lab_staff':
        return {
          title: 'Star-Radiology',
          subtitle: 'Lab Portal',
          brandColor: 'text-orange-500',
          accentColor: 'bg-orange-500',
          hoverColor: 'hover:text-orange-600',
          activeColor: 'text-orange-600 bg-orange-50',
          links: [
            { to: '/lab/dashboard', label: 'Dashboard', icon: 'dashboard', exact: true },
          ]
        };
      default:
        return {
          title: 'Star-Radiology',
          subtitle: 'Medical System',
          brandColor: 'text-slate-500',
          accentColor: 'bg-slate-500',
          hoverColor: 'hover:text-slate-600',
          activeColor: 'text-slate-600 bg-slate-50',
          links: []
        };
    }
  };

  const config = getRoleConfig();

  // ✅ ENHANCED: Icon component with all icons from both files
  const NavIcon = ({ type, className = "w-5 h-5" }) => {
    const icons = {
      dashboard: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6H8V5z" />
        </svg>
      ),
      users: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      ),
      building: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      crown: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      ),
      chart: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      userPlus: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
      buildingPlus: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      ),
      receipt: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5l-5-5-4 4-5-5v-11a2 2 0 012-2h10a2 2 0 012 2v11z" />
        </svg>
      ),
      // ✅ ADDED: Templates icon
      templates: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      // ✅ ADDED: Other icons from the second file
      doctors: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className={className}>
          <g data-name="29-doctor">
            <path d="M34 13h3v3.77a2.965 2.965 0 0 0-2-.77h-1zM11 13h3v3h-1a2.965 2.965 0 0 0-2 .77z" style={{fill: "#2b3e5b"}} />
            <path d="M14.04 21c.03.33.07.66.12.98L14 22h-1a3 3 0 0 1-3-3 3.011 3.011 0 0 1 3-3h1v4c0 .34.01.67.04 1z" style={{fill: "#faa68e"}} />
            <path d="M37 16.77A2.94 2.94 0 0 1 38 19a3 3 0 0 1-3 3h-1v-6h1a2.965 2.965 0 0 1 2 .77z" style={{fill: "#ffcdbe"}} />
            <path d="M37 16.77a2.965 2.965 0 0 0-2-.77h-1a3 3 0 0 1 0 6h1a3 3 0 0 0 3-3 2.94 2.94 0 0 0-1-2.23z" style={{fill: "#fdddd7"}} />
            <path d="M11 16.77a2.965 2.965 0 0 1 2-.77h1a3 3 0 0 0 0 6h-1a3 3 0 0 1-3-3 2.94 2.94 0 0 1 1-2.23zM30.89 35.08l-7.13 4.75-6.65-4.75a2.017 2.017 0 0 0 .89-1.66V29l.09-.12a9.3 9.3 0 0 0 11.82 0L30 29v4.42a2.017 2.017 0 0 0 .89 1.66zM34 13v7c0 .34-.01.67-.04 1H14.04c-.03-.33-.04-.66-.04-1v-7h20z" style={{fill: "#ffcdbe"}} />
            <path d="M14.04 21h19.92a11.475 11.475 0 0 1-2.89 6.78 10.944 10.944 0 0 1-1.16 1.1 9.3 9.3 0 0 1-11.82 0 11.241 11.241 0 0 1-3.93-6.9c-.05-.32-.09-.65-.12-.98zM32 13H11c0-7.18 5.82-12 13-12a13.658 13.658 0 0 1 9.19 3.31A11.416 11.416 0 0 1 37 13h-5z" style={{fill: "#64e1dc"}} />
          </g>
        </svg>
      ),
      admin: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className={className}>
          <g data-name="admin-icon">
            <circle cx="24" cy="16" r="8" style={{fill: "#ffcdbe"}} />
            <path d="M16 16c0-4.4 3.6-8 8-8s8 3.6 8 8c0 2.2-.9 4.2-2.3 5.7" style={{fill: "#fdddd7"}} />
            <path d="M24 8c-4.4 0-8 3.6-8 8 0 1.1.2 2.1.6 3.1C18.1 16.4 20.9 14 24 14s5.9 2.4 7.4 5.1c.4-1 .6-2 .6-3.1 0-4.4-3.6-8-8-8z" style={{fill: "#8b4513"}} />
            <ellipse cx="20" cy="15" rx="1" ry="1.5" style={{fill: "#2b3e5b"}} />
            <ellipse cx="28" cy="15" rx="1" ry="1.5" style={{fill: "#2b3e5b"}} />
            <path d="M24 24c-6 0-11 4-13 10v10c0 2 1.6 3.6 3.6 3.6h18.8c2 0 3.6-1.6 3.6-3.6V34c-2-6-7-10-13-10z" style={{fill: "#1a365d"}} />
          </g>
        </svg>
      ),
      labs: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
      reports: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    };
    
    return icons[type] || icons.dashboard;
  };

  // Check if a nav item is active
  const isActive = (path, exact = false) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  const handleChangePassword = () => {
    navigate('/change-password');
    setIsDropdownOpen(false);
  };

  const handleLogout = () => {
    logout();
    setIsDropdownOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.user-dropdown')) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ✅ PRESERVED: Safety check for config and links
  if (!config || !config.links) {
    return (
      <nav className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-50 shadow-sm">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-12">
            <div className="text-sm text-gray-500">Loading...</div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <>
      {/* Modern Glass-morphism Navbar */}
      <nav className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-50 shadow-sm">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-12">
            
            {/* Left - Brand with Logo */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="flex items-center justify-center">
                  <img 
                    src={starRadiologyLogo} 
                    alt="Star Radiology" 
                    className="h-8 w-auto object-contain"
                    onError={(e) => {
                      console.error('Logo failed to load:', e);
                      e.target.style.display = 'none';
                      e.target.nextElementSibling.style.display = 'block';
                    }}
                  />
                  <div className="hidden">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${config.accentColor} shadow-lg`}>
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-gray-600">{config.subtitle}</p>
                </div>
              </div>
            </div>

            {/* Center - Navigation (Desktop) */}
            <div className="hidden lg:flex items-center space-x-1">
              {config.links && config.links.length > 0 && config.links.map((link, index) => (
                <Link
                  key={index}
                  to={link.to}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive(link.to, link.exact)
                      ? `${config.activeColor} shadow-sm`
                      : `text-gray-600 hover:text-gray-900 hover:bg-gray-50`
                  }`}
                >
                  <NavIcon type={link.icon} className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              ))}
            </div>

            {/* Right - User Menu */}
            <div className="flex items-center space-x-4">
              {/* Greeting (Desktop) */}
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-gray-900">
                  {greeting}, {currentUser?.fullName || currentUser?.firstName}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {currentUser?.role?.replace('_', ' ')}
                </p>
              </div>

              {/* Mobile menu button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isMobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>

              {/* User Avatar with Dropdown */}
              <div className="relative user-dropdown">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center space-x-3 p-2 rounded-xl hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <div className={`w-8 h-8 rounded-lg ${config.accentColor} flex items-center justify-center text-white font-semibold text-sm shadow-md`}>
                    {currentUser?.fullName?.charAt(0)?.toUpperCase() || 
                     currentUser?.firstName?.charAt(0)?.toUpperCase() || 
                     currentUser?.username?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-200/50 py-2 z-50 transform transition-all duration-200 origin-top-right">
                    {/* User Info Header */}
                    <div className="px-4 py-4 border-b border-gray-100">
                      <div className="flex items-center space-x-3">
                        <div className={`w-12 h-12 rounded-xl ${config.accentColor} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                          {currentUser?.fullName?.charAt(0)?.toUpperCase() || 
                           currentUser?.firstName?.charAt(0)?.toUpperCase() || 
                           currentUser?.username?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">
                            {currentUser?.fullName || `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim()}
                          </p>
                          <p className="text-sm text-gray-500">{currentUser?.email}</p>
                          <p className="text-xs text-gray-400 capitalize mt-1 px-2 py-1 bg-gray-100 rounded-full inline-block">
                            {currentUser?.role?.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Menu Items */}
                    <div className="py-2">
                      <button
                        onClick={handleChangePassword}
                        className="w-full flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">Change Password</p>
                          <p className="text-xs text-gray-500">Update your security credentials</p>
                        </div>
                      </button>

                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center space-x-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">Sign Out</p>
                          <p className="text-xs text-gray-500">Sign out of your account</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && config.links && (
          <div className="lg:hidden border-t border-gray-200/50 bg-white/95 backdrop-blur-md">
            <div className="px-4 py-4 space-y-2">
              {config.links.map((link, index) => (
                <Link
                  key={index}
                  to={link.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive(link.to, link.exact)
                      ? `${config.activeColor} shadow-sm`
                      : `text-gray-600 hover:text-gray-900 hover:bg-gray-50`
                  }`}
                >
                  <NavIcon type={link.icon} className="w-5 h-5" />
                  <span>{link.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>
    </>
  );
};

export default UniversalNavbar;