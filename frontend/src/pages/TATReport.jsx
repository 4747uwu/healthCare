import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import UniversalNavbar from '../../components/layout/AdminNavbar';
import TATReportTable from '../../components/admin/TATReportTable';
import api from '../../services/api';

const TATReport = () => {
  const { currentUser } = useAuth();
  
  // State management
  const [studies, setStudies] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedModalities, setSelectedModalities] = useState([]);
  const [recordsPerPage, setRecordsPerPage] = useState(100);
  
  // Date filters
  const [dateType, setDateType] = useState('uploadDate');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Fetch locations with search capability
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await api.get('/tat/locations');
        if (response.data.success) {
          setLocations(response.data.locations);
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
      }
    };

    fetchLocations();
  }, []);

  // Fetch TAT data with enhanced filters
  const fetchTATData = useCallback(async () => {
    if (!selectedLocation) return;

    setLoading(true);
    try {
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

      const response = await api.get('/tat/report', { params });
      
      if (response.data.success) {
        setStudies(response.data.studies);
      }
    } catch (error) {
      console.error('Error fetching TAT data:', error);
      setStudies([]);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, dateType, fromDate, toDate, selectedModalities, recordsPerPage]);

  // Fetch data when filters change
  useEffect(() => {
    if (selectedLocation) {
      fetchTATData();
    }
  }, [fetchTATData]);

  // Handle filter changes
  const handleLocationChange = (location) => {
    setSelectedLocation(location);
  };

  const handleModalityFilter = (modalities) => {
    setSelectedModalities(modalities);
  };

  const handleRecordsPerPageChange = (newRecordsPerPage) => {
    setRecordsPerPage(newRecordsPerPage);
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      <UniversalNavbar />
      
      <div className="flex-1 p-6 overflow-hidden">
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">TAT Performance Report</h1>
            <p className="text-gray-600">Analyze turnaround times and study performance metrics</p>
          </div>

          {/* Filter Controls */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* Date Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date Type</label>
                <select
                  value={dateType}
                  onChange={(e) => setDateType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="uploadDate">Upload Date</option>
                  <option value="studyDate">Study Date</option>
                  <option value="assignedDate">Assigned Date</option>
                  <option value="reportDate">Report Date</option>
                </select>
              </div>

              {/* From Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* To Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Generate Button */}
              <div className="flex items-end">
                <button
                  onClick={fetchTATData}
                  disabled={!selectedLocation || loading}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
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

          {/* TAT Table with new features */}
          <div className="flex-1 min-h-0">
            <TATReportTable
              studies={studies}
              onLocationChange={handleLocationChange}
              locations={locations}
              selectedLocation={selectedLocation}
              onModalityFilter={handleModalityFilter}
              selectedModalities={selectedModalities}
              onRecordsPerPageChange={handleRecordsPerPageChange}
              recordsPerPage={recordsPerPage}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TATReport;