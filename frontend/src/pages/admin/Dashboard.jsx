import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import UniversalNavbar from '../../components/layout/AdminNavbar';
import WorklistSearch from '../../components/admin/WorklistSearch';
import api from '../../services/api';
import useAdminWebSocket from '../../hooks/useAdminWebSocket';
import { useAuth } from '../../hooks/useAuth';

const AdminDashboard = React.memo(() => {
  const { currentUser } = useAuth();
  const stableUser = useMemo(() => currentUser, [currentUser?.id, currentUser?.role]);
  
  const { isConnected, connectionStatus, newStudyCount, resetNewStudyCount, reconnect } = useAdminWebSocket(stableUser);

  const [allStudies, setAllStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('pending');
  
  // Single page mode state management
  const [recordsPerPage, setRecordsPerPage] = useState(100);
  const [totalRecords, setTotalRecords] = useState(0);
  
  // Date filter state for backend integration
  const [dateFilter, setDateFilter] = useState('today');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [dateType, setDateType] = useState('UploadDate');
  
  const [dashboardStats, setDashboardStats] = useState({
    totalStudies: 0,
    pendingStudies: 0,
    inProgressStudies: 0,
    completedStudies: 0,
    activeLabs: 0,
    activeDoctors: 0
  });

  const [values, setValues] = useState({
    today: 0,
    pending: 0,
    inprogress: 0,
    completed: 0,
  });
  
  const intervalRef = useRef(null);

  // 🆕 NEW: API endpoint mapping for tabs
  const getEndpointForCategory = useCallback((category) => {
    switch (category) {
      case 'pending':
        return '/admin/studies/pending';
      case 'inprogress':
        return '/admin/studies/inprogress';
      case 'completed':
        return '/admin/studies/completed';
      case 'all':
      default:
        return '/admin/studies';
    }
  }, []);
  console.log(activeCategory)

  // 🔧 UPDATED: Fetch studies with dynamic endpoint
  const fetchAllData = useCallback(async (searchParams = {}) => {
    try {
      setLoading(true);
      console.log(`🔄 DASHBOARD: Fetching data using backend search for category: ${activeCategory}`);
      
      // Use backend search for all data fetching
      const backendParams = {
        limit: recordsPerPage,
        dateType: dateType,
        workflowStatus: activeCategory !== 'all' ? activeCategory : 'all',
        ...searchParams
      };
      
      // Add date filter parameters
      if (dateFilter === 'custom') {
        if (customDateFrom) backendParams.customDateFrom = customDateFrom;
        if (customDateTo) backendParams.customDateTo = customDateTo;
        backendParams.dateFilter = 'custom';
      } else if (dateFilter && dateFilter !== 'all') {
        backendParams.quickDatePreset = dateFilter;
      }
      
      console.log('📤 DASHBOARD: fetchAllData backend params:', backendParams);
      
      // Use the backend search endpoint for all data fetching
      const [studiesResponse, valuesResponse] = await Promise.all([
        api.get('/admin/studies/search', { params: backendParams }),
        api.get('/admin/values', { params: backendParams })
      ]);
      
      // Process studies response
      if (studiesResponse.data.success) {
        setAllStudies(studiesResponse.data.data);
        setTotalRecords(studiesResponse.data.totalRecords);
        
        console.log(`✅ DASHBOARD: Backend data fetch successful: ${studiesResponse.data.data.length} studies`);
      }

      // Process values response
      if (valuesResponse.data && valuesResponse.data.success) {
        setValues({
          today: valuesResponse.data.total || 0,
          pending: valuesResponse.data.pending || 0,
          inprogress: valuesResponse.data.inprogress || 0,
          completed: valuesResponse.data.completed || 0,
        });
      }
    
      
      console.log(`✅ ${activeCategory} data fetched successfully`);
      
    } catch (error) {
      console.error(`❌ Error fetching ${activeCategory} data:`, error);
      setAllStudies([]);
      setTotalRecords(0);
      setValues({
        today: 0,
        pending: 0,
        inprogress: 0,
        completed: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [activeCategory, recordsPerPage, dateFilter, customDateFrom, customDateTo, dateType]);

  console.log(allStudies)
  // 🔧 SIMPLIFIED: Single useEffect for initial load and dependency changes
  useEffect(() => {
    console.log(`🔄 Data dependencies changed - fetching fresh data`);
    fetchAllData();
  }, [fetchAllData]);

  // 🔧 SIMPLIFIED: Single auto-refresh interval
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      console.log('🔄 Auto-refreshing all data...');
      fetchAllData();
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchAllData]);

  // Date filter handlers
  const handleDateFilterChange = useCallback((newDateFilter) => {
    console.log(`📅 DASHBOARD: Changing date filter to ${newDateFilter}`);
    setDateFilter(newDateFilter);
    resetNewStudyCount();
  }, [resetNewStudyCount]);

  const handleCustomDateChange = useCallback((from, to) => {
    console.log(`📅 DASHBOARD: Setting custom date range from ${from} to ${to}`);
    setCustomDateFrom(from);
    setCustomDateTo(to);
    if (from || to) {
      setDateFilter('custom');
    }
    resetNewStudyCount();
  }, [resetNewStudyCount]);

  const handleDateTypeChange = useCallback((newDateType) => {
    console.log(`📅 DASHBOARD: Changing date type to ${newDateType}`);
    setDateType(newDateType);
    resetNewStudyCount();
  }, [resetNewStudyCount]);

  // Handle search with backend parameters
  const handleSearchWithBackend = useCallback(async (searchParams) => {
    try {
      console.log('🔍 DASHBOARD: Backend search triggered with params:', searchParams);
      
      // ✅ CHECK: If searchParams contains direct data, use it immediately
      if (searchParams.data && searchParams.totalRecords !== undefined) {
        console.log(`🔍 DASHBOARD: Using direct search results: ${searchParams.data.length} studies`);
        console.log(`🌍 DASHBOARD: Backend filtering: ${searchParams.backendFiltering || false}`);
        
        setAllStudies(searchParams.data);
        setTotalRecords(searchParams.totalRecords);
        setLoading(false);
        
        // Update dashboard stats for search results
        const stats = {
          totalStudies: searchParams.totalRecords,
          pendingStudies: searchParams.data.filter(s => 
            ['new_study_received', 'pending_assignment'].includes(s.workflowStatus)
          ).length,
          inProgressStudies: searchParams.data.filter(s => 
            ['assigned_to_doctor', 'doctor_opened_report', 'report_in_progress', 
             'report_drafted', 'report_finalized', 'report_uploaded'].includes(s.workflowStatus)
          ).length,
          completedStudies: searchParams.data.filter(s => 
            ['final_report_downloaded'].includes(s.workflowStatus)
          ).length,
          activeLabs: [...new Set(searchParams.data.map(s => s.sourceLab?._id).filter(Boolean))].length,
          activeDoctors: [...new Set(searchParams.data.map(s => s.lastAssignedDoctor?._id).filter(Boolean))].length,
          searchPerformed: true,
          backendFiltering: searchParams.backendFiltering
        };
        
        setDashboardStats(stats);
        
        // Update values for the search results
        setValues({
          today: searchParams.totalRecords,
          pending: stats.pendingStudies,
          inprogress: stats.inProgressStudies,
          completed: stats.completedStudies,
        });
        
        return;
      }
      
      // ✅ FALLBACK: If no direct data, perform backend search via API
      setLoading(true);
      console.log('🔍 DASHBOARD: Performing backend API search');
      
      const apiParams = {
        limit: 5000,
        dateType: dateType,
        ...searchParams
      };
      
      // Add date filter parameters
      if (dateFilter === 'custom') {
        if (customDateFrom) apiParams.customDateFrom = customDateFrom;
        if (customDateTo) apiParams.customDateTo = customDateTo;
        apiParams.dateFilter = 'custom';
      } else if (dateFilter && dateFilter !== 'all') {
        apiParams.quickDatePreset = dateFilter;
      }
      
      console.log('📤 DASHBOARD: Backend search API params:', apiParams);
      
      const response = await api.get('/admin/studies/search', { params: apiParams });
      
      if (response.data.success) {
        console.log(`✅ DASHBOARD: Backend search successful: ${response.data.data.length} studies`);
        
        setAllStudies(response.data.data);
        setTotalRecords(response.data.totalRecords);
        
        // Update stats from backend response
        if (response.data.summary) {
          setDashboardStats({
            totalStudies: response.data.totalRecords,
            pendingStudies: response.data.summary.pendingStudies || 0,
            inProgressStudies: response.data.summary.inProgressStudies || 0,
            completedStudies: response.data.summary.completedStudies || 0,
            activeLabs: response.data.summary.activeLabs || 0,
            activeDoctors: response.data.summary.activeDoctors || 0
          });
        }
        
      } else {
        console.error('❌ DASHBOARD: Backend search failed:', response.data.message);
        setAllStudies([]);
        setTotalRecords(0);
      }
      
    } catch (error) {
      console.error('❌ DASHBOARD: Backend search error:', error);
      setAllStudies([]);
      setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  }, [recordsPerPage, dateType, dateFilter, customDateFrom, customDateTo]);

  // Handle records per page change
  const handleRecordsPerPageChange = useCallback((newRecordsPerPage) => {
    console.log(`📊 DASHBOARD: Changing records per page from ${recordsPerPage} to ${newRecordsPerPage}`);
    setRecordsPerPage(newRecordsPerPage);
    resetNewStudyCount();
  }, [recordsPerPage, resetNewStudyCount]);

  const handleAssignmentComplete = useCallback(() => {
    console.log('📋 Assignment completed, refreshing data...');
    fetchAllData();
  }, [fetchAllData]);

  const handleManualRefresh = useCallback(() => {
    console.log('🔄 Manual refresh triggered for all data');
    fetchAllData();
    resetNewStudyCount();
  }, [fetchAllData, resetNewStudyCount]);

  const handleWorklistView = useCallback(() => {
    resetNewStudyCount();
  }, [resetNewStudyCount]);

  const handleCategoryChange = useCallback((category) => {
    console.log(`🏷️ DASHBOARD: Changing category from ${activeCategory} to ${category}`);
    
    // 🔧 FIXED: Only change if actually different
    if (activeCategory !== category) {
      setActiveCategory(category);
      resetNewStudyCount();
    }
  }, [activeCategory, resetNewStudyCount]);

  // Connection status display logic
  const statusDisplay = useMemo(() => {
    switch (connectionStatus) {
      case 'connected':
        return {
          color: 'bg-emerald-500',
          text: 'Live',
          textColor: 'text-emerald-700'
        };
      case 'connecting':
        return {
          color: 'bg-amber-500 animate-pulse',
          text: 'Connecting...',
          textColor: 'text-amber-700'
        };
      case 'error':
        return {
          color: 'bg-red-500',
          text: 'Offline',
          textColor: 'text-red-700'
        };
      default:
        return {
          color: 'bg-gray-500',
          text: 'Offline',
          textColor: 'text-gray-700'
        };
    }
  }, [connectionStatus]);

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      <UniversalNavbar />

      <div className="min-w-full mx-auto p-1 sm:p-2 lg:p-0 flex-1 flex flex-col">
        {/* Main Content - Now WorklistSearch handles all controls */}
        <div className="bg-white flex-1 min-h-full rounded border border-gray-200 flex flex-col">
          <div className="flex-1 flex flex-col min-h-0 p-0 sm:p-2 lg:px-1 lg:pb-0 pb-0">
            <WorklistSearch 
              allStudies={allStudies}
              loading={loading}
              totalRecords={totalRecords}
              userRole="admin"
              onAssignmentComplete={handleAssignmentComplete}
              onView={handleWorklistView}
              activeCategory={activeCategory}
              onCategoryChange={handleCategoryChange}
              categoryStats={dashboardStats}
              recordsPerPage={recordsPerPage}
              onRecordsPerPageChange={handleRecordsPerPageChange}
              dateFilter={dateFilter}
              onDateFilterChange={handleDateFilterChange}
              customDateFrom={customDateFrom}
              customDateTo={customDateTo}
              onCustomDateChange={handleCustomDateChange}
              dateType={dateType}
              onDateTypeChange={handleDateTypeChange}
              onSearchWithBackend={handleSearchWithBackend}
              values={values}
              // 🆕 NEW: Pass additional props for integrated controls
              newStudyCount={newStudyCount}
              connectionStatus={connectionStatus}
              onManualRefresh={handleManualRefresh}
              onResetNewStudyCount={resetNewStudyCount}
            />
          </div>
        </div>

        {/* Mobile Stats - Keep this for mobile view */}
        <div className="lg:hidden mt-1 sm:mt-2">
          <details className="bg-white rounded border border-gray-200 shadow-sm">
            <summary className="px-2 py-1.5 cursor-pointer text-xs font-medium text-gray-700 hover:bg-gray-50 select-none">
              <span className="flex items-center justify-between">
                View Statistics
                <svg className="w-3 h-3 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </summary>
            <div className="px-2 pb-2 grid grid-cols-3 gap-1 sm:gap-2">
              <div className="text-center p-1.5 bg-blue-50 rounded">
                <div className="text-sm font-semibold text-blue-600">
                  {dashboardStats.pendingStudies.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">Pending</div>
              </div>
              <div className="text-center p-1.5 bg-orange-50 rounded">
                <div className="text-sm font-semibold text-orange-600">
                  {dashboardStats.inProgressStudies.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">In Progress</div>
              </div>
              <div className="text-center p-1.5 bg-green-50 rounded">
                <div className="text-sm font-semibold text-green-600">
                  {dashboardStats.completedStudies.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">Completed</div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
});

export default AdminDashboard;