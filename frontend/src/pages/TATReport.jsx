import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import UniversalNavbar from '../components/layout/AdminNavbar';
import api from '../services/api';

// ✅ FIXED: Update TATReport.jsx with proper type checking
// filepath: d:\website\devops\digital ocean\frontend\src\pages\TATReport.jsx

const TATReport = () => {
  const { currentUser } = useAuth();
  
  // State management
  const [studies, setStudies] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedModalities, setSelectedModalities] = useState([]);
  const [recordsPerPage, setRecordsPerPage] = useState(100);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Date filters
  const [dateType, setDateType] = useState('uploadDate');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // ✅ NEW: Modality options with combined modalities
  const modalityOptions = [
    'CT', 'MR', 'CR', 'DX', 'PR', 'US', 'XR', 'MG', 'NM', 'PT',
    'MR/SR', 'CT/SR', 'CR/SR', 'DX/SR', 'PR/MR', 'CT/MR'
  ];

  // ✅ NEW: Records per page options
  const recordOptions = [10, 25, 50, 100, 250, 500, 1000];

  // Fetch locations with search capability
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        console.log('🔍 Fetching locations...');
        const response = await api.get('/tat/locations');
        console.log('📍 Locations response:', response.data);
        
        if (response.data.success) {
          setLocations(response.data.locations);
          console.log(`✅ Loaded ${response.data.locations.length} locations`);
        } else {
          console.error('❌ Locations API returned success: false');
          toast.error('Failed to load locations');
        }
      } catch (error) {
        console.error('❌ Error fetching locations:', error);
        toast.error(`Failed to load locations: ${error.response?.status || 'Network error'}`);
      }
    };

    fetchLocations();
  }, []);

  // Fetch TAT data with enhanced filters
  const fetchTATData = useCallback(async () => {
    if (!selectedLocation) {
      console.log('⚠️ No location selected, skipping TAT data fetch');
      return;
    }

    setLoading(true);
    try {
      console.log('🔍 Fetching TAT data...', { selectedLocation, dateType, fromDate, toDate });
      
      const params = {
        location: selectedLocation,
        dateType,
        fromDate,
        toDate,
        limit: recordsPerPage
      };

      // Add modality filter if selected
      if (selectedModalities.length > 0) {
        params.modality = selectedModalities.join(',');
      }

      console.log('📤 TAT request params:', params);
      const response = await api.get('/tat/report', { params });
      console.log('📊 TAT response:', response.data);
      
      if (response.data.success) {
        setStudies(response.data.studies);
        console.log(`✅ Loaded ${response.data.studies.length} studies`);
        setCurrentPage(1); // Reset to first page when new data loads
      } else {
        console.error('❌ TAT API returned success: false');
        toast.error('Failed to load TAT data');
        setStudies([]);
      }
    } catch (error) {
      console.error('❌ Error fetching TAT data:', error);
      toast.error(`Failed to load TAT data: ${error.response?.status || 'Network error'}`);
      setStudies([]);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, dateType, fromDate, toDate, selectedModalities, recordsPerPage]);

  // ✅ NEW: Filter and search logic
  const filteredStudies = useMemo(() => {
    let filtered = [...studies];

    // Search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(study => 
        (study.patientName || '').toLowerCase().includes(search) ||
        (study.patientId || '').toLowerCase().includes(search) ||
        (study.accessionNumber || '').toLowerCase().includes(search) ||
        (study.referredBy || '').toLowerCase().includes(search) ||
        (study.reportedBy || '').toLowerCase().includes(search) ||
        (study.studyDescription || '').toLowerCase().includes(search)
      );
    }

    // Modality filter
    if (selectedModalities.length > 0) {
      filtered = filtered.filter(study => {
        const studyModality = study.modality || '';
        return selectedModalities.some(selectedMod => {
          if (selectedMod.includes('/')) {
            const modalityParts = selectedMod.split('/');
            return modalityParts.every(part => studyModality.includes(part));
          } else {
            return studyModality.includes(selectedMod);
          }
        });
      });
    }

    return filtered;
  }, [studies, searchTerm, selectedModalities]);

  // ✅ NEW: Pagination logic
  const totalPages = Math.ceil(filteredStudies.length / recordsPerPage);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const paginatedStudies = filteredStudies.slice(startIndex, startIndex + recordsPerPage);

  // Handle filter changes
  const handleLocationChange = (location) => {
    setSelectedLocation(location);
  };

  const handleModalityFilter = (modalities) => {
    setSelectedModalities(modalities);
    setCurrentPage(1);
  };

  const handleRecordsPerPageChange = (newRecordsPerPage) => {
    setRecordsPerPage(newRecordsPerPage);
    setCurrentPage(1);
  };

  const handleModalityToggle = (modality) => {
    const newSelection = selectedModalities.includes(modality)
      ? selectedModalities.filter(m => m !== modality)
      : [...selectedModalities, modality];
    
    handleModalityFilter(newSelection);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  // ✅ FIXED: Helper functions with proper type checking
  const safeValue = (value, defaultVal = '-') => {
    // Handle null, undefined, empty string, or other falsy values
    if (value === null || value === undefined || value === '') return defaultVal;
    // Convert to string if it's not already
    return String(value);
  };

  const getTATStatusColor = (tatValue) => {
    // ✅ FIXED: Proper type checking and conversion
    if (!tatValue || tatValue === '-' || tatValue === null || tatValue === undefined) {
      return 'bg-gray-100 text-gray-700 border border-gray-200';
    }
    
    // Convert to string first, then extract numbers
    const tatString = String(tatValue);
    const minutes = parseInt(tatString.replace(/[^\d]/g, ''));
    
    if (isNaN(minutes) || minutes === 0) {
      return 'bg-gray-100 text-gray-700 border border-gray-200';
    }
    
    if (minutes <= 60) return 'bg-green-100 text-green-800 border border-green-200';
    if (minutes <= 240) return 'bg-blue-100 text-blue-800 border border-blue-200';
    if (minutes <= 480) return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
    if (minutes <= 1440) return 'bg-orange-100 text-orange-800 border border-orange-200';
    return 'bg-red-100 text-red-800 border border-red-200';
  };

  const getStatusColor = (status) => {
    // ✅ FIXED: Safe string conversion
    const statusString = status ? String(status).toLowerCase() : '';
    
    switch (statusString) {
      case 'final_report_downloaded':
      case 'report_finalized':
      case 'completed':
        return 'bg-green-100 text-green-800 border border-green-200';
      case 'report_in_progress':
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      case 'assigned_to_doctor':
      case 'assigned':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'pending_assignment':
      case 'pending':
        return 'bg-orange-100 text-orange-800 border border-orange-200';
      case 'new_study_received':
      case 'new':
        return 'bg-gray-100 text-gray-800 border border-gray-200';
      default:
        return 'bg-gray-100 text-gray-600 border border-gray-200';
    }
  };

  const formatDateTime = (dateValue) => {
    if (!dateValue) return '-';
    
    try {
      // Handle both string and Date object
      const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
      
      if (isNaN(date.getTime())) {
        return '-';
      }
      
      return format(date, 'MMM dd, yyyy • HH:mm');
    } catch (error) {
      console.warn('Date formatting error:', error, 'Value:', dateValue);
      return '-';
    }
  };

  // ✅ FIXED: Safe value extraction for nested objects
  const getSafeNestedValue = (obj, path, defaultValue = '-') => {
    try {
      const keys = path.split('.');
      let current = obj;
      
      for (const key of keys) {
        if (current === null || current === undefined) {
          return defaultValue;
        }
        current = current[key];
      }
      
      return current !== null && current !== undefined ? String(current) : defaultValue;
    } catch (error) {
      console.warn('Error accessing nested value:', error, 'Path:', path, 'Object:', obj);
      return defaultValue;
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      <UniversalNavbar />
      
      {/* ✅ FIXED: Main content with proper flex and overflow handling */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ✅ COMPACT: Header section */}
        <div className="flex-shrink-0 p-4 bg-white border-b border-gray-200">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-900">TAT Performance Report</h1>
            <p className="text-gray-600">Analyze turnaround times and study performance metrics</p>
          </div>

          {/* ✅ COMPACT: Filter Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            {/* Date Type */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date Type</label>
              <select
                value={dateType}
                onChange={(e) => setDateType(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="uploadDate">Upload Date</option>
                <option value="studyDate">Study Date</option>
                <option value="assignedDate">Assigned Date</option>
                <option value="reportDate">Report Date</option>
              </select>
            </div>

            {/* From Date */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* To Date */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Generate Button */}
            <div className="flex items-end">
              <button
                onClick={fetchTATData}
                disabled={!selectedLocation || loading}
                className="w-full px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating...
                  </>
                ) : (
                  'Generate Report'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ✅ MAIN: Table container with proper scrolling */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ✅ INTEGRATED: Table header with filters */}
          <div className="flex-shrink-0 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 p-3">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  TAT Performance Report
                </h3>
                <p className="text-xs text-gray-600">
                  Showing {paginatedStudies.length} of {filteredStudies.length} studies 
                  {filteredStudies.length !== studies.length && ` (filtered from ${studies.length} total)`}
                </p>
              </div>

              {/* ✅ COMPACT: Filter Controls */}
              <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                <select
                  value={selectedLocation}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  className="w-full sm:w-40 px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Locations</option>
                  {locations.map(location => (
                    <option key={location.value} value={location.value}>
                      {location.label}
                    </option>
                  ))}
                </select>

                <select
                  value={recordsPerPage}
                  onChange={(e) => handleRecordsPerPageChange(parseInt(e.target.value))}
                  className="w-full sm:w-24 px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {recordOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ✅ COMPACT: Search and Modality Filters */}
            <div className="space-y-2">
              {/* Search Bar */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search by patient name, ID, accession number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Modality Filter */}
              <div>
                <div className="flex items-center mb-1">
                  <span className="text-xs font-medium text-gray-700 mr-2">Modality:</span>
                  {selectedModalities.length > 0 && (
                    <button
                      onClick={() => handleModalityFilter([])}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {modalityOptions.map(modality => (
                    <button
                      key={modality}
                      onClick={() => handleModalityToggle(modality)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                        selectedModalities.includes(modality)
                          ? 'bg-blue-500 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {modality}
                      {selectedModalities.includes(modality) && (
                        <span className="ml-1">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ✅ SCROLLABLE: Table content */}
          <div className="flex-1 overflow-auto bg-white">
            <table className="w-full border-collapse table-auto text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-r from-gray-800 to-gray-900 text-white">
                  <th className="border-r border-gray-600 px-2 py-3 text-left text-xs font-semibold">STATUS</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-left text-xs font-semibold">PATIENT ID</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-left text-xs font-semibold">PATIENT NAME</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-center text-xs font-semibold">SEX</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-left text-xs font-semibold">REFERRED BY</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-left text-xs font-semibold">ACC NUMBER</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-left text-xs font-semibold">STUDY TYPE</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-center text-xs font-semibold">MODALITY</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-center text-xs font-semibold">S/I COUNT</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-left text-xs font-semibold">INSTITUTION</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-left text-xs font-semibold">STUDY DATE</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-left text-xs font-semibold">UPLOAD DATE</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-left text-xs font-semibold">ASSIGN DATE</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-left text-xs font-semibold">REPORT DATE</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-center text-xs font-semibold">S-R TAT<br/>UPLOAD→ASSIGNMENT</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-center text-xs font-semibold">S-R TAT<br/>STUDY→REPORT</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-center text-xs font-semibold">U-R TAT<br/>UPLOAD→REPORT</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-center text-xs font-semibold">A-R TAT<br/>ASSIGN→REPORT</th>
                  <th className="border-r border-gray-600 px-2 py-3 text-left text-xs font-semibold">REPORTED BY</th>
                  <th className="px-2 py-3 text-center text-xs font-semibold">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedStudies.length > 0 ? (
                  paginatedStudies.map((study, index) => (
                    <tr 
                      key={study._id || index} 
                      className={`hover:bg-blue-50 transition-colors duration-150 ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                      }`}
                    >
                      <td className="border-r border-gray-100 px-2 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded-full ${getStatusColor(study.studyStatus)}`}>
                          <div className="w-1 h-1 rounded-full bg-current mr-1"></div>
                          {safeValue(study.studyStatus)
                            .replace(/_/g, ' ')
                            .split(' ')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ')
                            .substring(0, 12)}
                        </span>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2">
                        <div className="font-medium text-gray-900 truncate max-w-[80px]" title={safeValue(study.patientId)}>
                          {safeValue(study.patientId)}
                        </div>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2">
                        <div className="font-medium text-gray-900 truncate max-w-[120px]" title={safeValue(study.patientName)}>
                          {safeValue(study.patientName)}
                        </div>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold ${
                          study.gender === 'M' ? 'bg-blue-100 text-blue-800' : 
                          study.gender === 'F' ? 'bg-pink-100 text-pink-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {safeValue(study.gender)}
                        </span>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2">
                        <div className="text-gray-700 truncate max-w-[100px]" title={safeValue(study.referredBy)}>
                          {safeValue(study.referredBy)}
                        </div>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2">
                        <div className="font-mono text-gray-700 text-xs truncate max-w-[80px]" title={safeValue(study.accessionNumber)}>
                          {safeValue(study.accessionNumber)}
                        </div>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2">
                        <div className="text-gray-700 truncate max-w-[120px]" title={safeValue(study.studyDescription)}>
                          {safeValue(study.studyDescription)}
                        </div>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800">
                          {safeValue(study.modality)}
                        </span>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2 text-center whitespace-nowrap">
                        <span className="font-mono text-xs text-gray-600">
                          {safeValue(study.series_Images)}
                        </span>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2">
                        <div className="text-gray-700 text-xs truncate max-w-[120px]" title={safeValue(study.institutionName)}>
                          {safeValue(study.institutionName)}
                        </div>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2 whitespace-nowrap">
                        <div className="font-mono text-xs text-gray-700">
                          {safeValue(study.billedOnStudyDate)}
                        </div>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2 whitespace-nowrap">
                        <div className="font-mono text-xs text-gray-700">
                          {safeValue(study.uploadDate)}
                        </div>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2 whitespace-nowrap">
                        <div className="font-mono text-xs text-gray-700">
                          {safeValue(study.assignedDate)}
                        </div>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2 whitespace-nowrap">
                        <div className="font-mono text-xs text-gray-700">
                          {study.reportDate ? formatDateTime(study.reportDate) : '-'}
                        </div>
                      </td>
                      
                      {/* ✅ FIXED: TAT columns with safe nested value access */}
                      <td className="border-r border-gray-100 px-2 py-2 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded-full ${getTATStatusColor(getSafeNestedValue(study, 'fullTatDetails.uploadToAssignmentTAT'))}`}>
                          {getSafeNestedValue(study, 'fullTatDetails.uploadToAssignmentTAT', 'N/A')}
                        </span>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded-full ${getTATStatusColor(getSafeNestedValue(study, 'fullTatDetails.studyToReportTATFormatted'))}`}>
                          {getSafeNestedValue(study, 'fullTatDetails.studyToReportTATFormatted', 'N/A')}
                        </span>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded-full ${getTATStatusColor(getSafeNestedValue(study, 'fullTatDetails.uploadToReportTATFormatted'))}`}>
                          {getSafeNestedValue(study, 'fullTatDetails.uploadToReportTATFormatted', 'N/A')}
                        </span>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded-full ${getTATStatusColor(getSafeNestedValue(study, 'fullTatDetails.assignmentToReportTATFormatted'))}`}>
                          {getSafeNestedValue(study, 'fullTatDetails.assignmentToReportTATFormatted', 'N/A')}
                        </span>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2">
                        <div className="text-gray-700 text-xs truncate max-w-[100px]" title={safeValue(study.reportedBy)}>
                          {safeValue(study.reportedBy)}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button 
                          className="inline-flex items-center justify-center w-6 h-6 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 hover:scale-105 transition-all duration-150"
                          title="Download Report"
                          onClick={() => console.log('Download report for study:', study._id)}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="20" className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-lg font-medium text-gray-500">
                            {searchTerm || selectedModalities.length > 0 
                              ? 'No studies match your search criteria' 
                              : 'No TAT data available'
                            }
                          </p>
                          <p className="text-sm text-gray-400">
                            {searchTerm || selectedModalities.length > 0 
                              ? 'Try adjusting your search terms or filters' 
                              : 'Select a location and date range to generate the report'
                            }
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ✅ FIXED: Pagination Footer */}
          {filteredStudies.length > 0 && (
            <div className="flex-shrink-0 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200 px-3 py-2">
              <div className="flex flex-col lg:flex-row items-center justify-between gap-2">
                {/* Left: Record Info */}
                <div className="flex items-center space-x-4 text-xs text-gray-600">
                  <span>
                    Showing <span className="font-semibold">{startIndex + 1}</span> to{' '}
                    <span className="font-semibold">{Math.min(startIndex + recordsPerPage, filteredStudies.length)}</span> of{' '}
                    <span className="font-semibold">{filteredStudies.length}</span> studies
                  </span>
                  
                  {/* TAT Legend */}
                  <div className="flex items-center space-x-2 text-xs">
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                      <span>≤1h</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
                      <span>≤4h</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full mr-1"></div>
                      <span>≤8h</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-orange-500 rounded-full mr-1"></div>
                      <span>≤24h</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div>
                      <span>24h</span>
                    </div>
                  </div>
                </div>

                {/* Right: Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-2 py-1 text-xs font-medium text-gray-500 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    
                    {/* Page Numbers */}
                    <div className="flex items-center space-x-1">
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        return (
                          <button
                            key={pageNum}
                            onClick={() => handlePageChange(pageNum)}
                            className={`px-2 py-1 text-xs font-medium rounded ${
                              currentPage === pageNum
                                ? 'bg-blue-500 text-white'
                                : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-2 py-1 text-xs font-medium text-gray-500 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}

                {/* Last Updated */}
                <div className="text-xs text-gray-500 flex items-center">
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {format(new Date(), 'HH:mm')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TATReport;