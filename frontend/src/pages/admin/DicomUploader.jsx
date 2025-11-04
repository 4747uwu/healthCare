import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';

const DicomUploader = () => {
    const { currentUser } = useAuth();
    const [formData, setFormData] = useState({
        patientName: '',
        patientId: '',
        patientBirthDate: '',
        patientSex: 'M',
        studyDescription: '',
        seriesDescription: '',
        modality: 'OT',
        bodyPartExamined: '',
        referringPhysician: '',
        accessionNumber: '',
        institutionName: 'XCENTIC Medical Center',
        institutionAddress: '',
        labId: '',
        clinicalHistory: ''
    });
    
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadResult, setUploadResult] = useState(null);
    const [availableLabs, setAvailableLabs] = useState([]);
    const [recentUploads, setRecentUploads] = useState([]);
    const [previewImages, setPreviewImages] = useState([]);

    // 🔧 FETCH: Available labs
    const fetchLabs = useCallback(async () => {
        try {
            const response = await api.get('/admin/dicom-uploader/labs');
            if (response.data.success) {
                setAvailableLabs(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching labs:', error);
        }
    }, []);

    // 🔧 FETCH: Recent uploads
    const fetchRecentUploads = useCallback(async () => {
        try {
            const response = await api.get('/admin/dicom-uploader/status');
            if (response.data.success) {
                setRecentUploads(response.data.data.recentUploads);
            }
        } catch (error) {
            console.error('Error fetching recent uploads:', error);
        }
    }, []);

    useEffect(() => {
        fetchLabs();
        fetchRecentUploads();
    }, [fetchLabs, fetchRecentUploads]);

    // 🔧 HANDLE: Form input changes
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // 🔧 HANDLE: File selection with preview
    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        const validFiles = files.filter(file => {
            const isValidType = file.type.startsWith('image/');
            const isValidSize = file.size <= 50 * 1024 * 1024; // 50MB limit
            return isValidType && isValidSize;
        });

        if (validFiles.length !== files.length) {
            alert('Some files were skipped. Only image files under 50MB are allowed.');
        }

        setSelectedFiles(validFiles);

        // Create preview URLs
        const previews = validFiles.map(file => ({
            file,
            url: URL.createObjectURL(file),
            name: file.name,
            size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
        }));
        
        setPreviewImages(previews);
    };

    // 🔧 HANDLE: Remove file from selection
    const removeFile = (index) => {
        const newFiles = selectedFiles.filter((_, i) => i !== index);
        const newPreviews = previewImages.filter((_, i) => i !== index);
        
        // Revoke old URL to prevent memory leaks
        URL.revokeObjectURL(previewImages[index].url);
        
        setSelectedFiles(newFiles);
        setPreviewImages(newPreviews);
    };

    // 🔧 GENERATE: Auto-generate fields
    const generateAccessionNumber = () => {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 4).toUpperCase();
        setFormData(prev => ({
            ...prev,
            accessionNumber: `ACC${timestamp}${random}`
        }));
    };

    const generatePatientId = () => {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 6).toUpperCase();
        setFormData(prev => ({
            ...prev,
            patientId: `PAT${timestamp}${random}`
        }));
    };

    // 🔧 VALIDATE: Form data
    const validateForm = () => {
        const required = ['patientName', 'patientId', 'studyDescription'];
        const missing = required.filter(field => !formData[field].trim());
        
        if (missing.length > 0) {
            alert(`Please fill in required fields: ${missing.join(', ')}`);
            return false;
        }
        
        if (selectedFiles.length === 0) {
            alert('Please select at least one image file');
            return false;
        }
        
        return true;
    };

    // 🔧 SUBMIT: Upload images
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) return;
        
        setUploading(true);
        setUploadProgress(0);
        setUploadResult(null);
        
        try {
            const uploadFormData = new FormData();
            
            // Add form fields
            Object.keys(formData).forEach(key => {
                uploadFormData.append(key, formData[key]);
            });
            
            // Add files
            selectedFiles.forEach(file => {
                uploadFormData.append('images', file);
            });
            
            console.log('🚀 Uploading images to DICOM...');
            
            const response = await api.post('/admin/dicom-uploader/upload', uploadFormData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded * 100) / progressEvent.total
                    );
                    setUploadProgress(progress);
                }
            });
            
            if (response.data.success) {
                setUploadResult(response.data);
                
                // Clear form and files
                setSelectedFiles([]);
                setPreviewImages([]);
                setFormData({
                    patientName: '',
                    patientId: '',
                    patientBirthDate: '',
                    patientSex: 'M',
                    studyDescription: '',
                    seriesDescription: '',
                    modality: 'OT',
                    bodyPartExamined: '',
                    referringPhysician: '',
                    accessionNumber: '',
                    institutionName: 'XCENTIC Medical Center',
                    institutionAddress: '',
                    labId: '',
                    clinicalHistory: ''
                });
                
                // Refresh recent uploads
                fetchRecentUploads();
                
                console.log('✅ Upload successful:', response.data);
            }
            
        } catch (error) {
            console.error('❌ Upload failed:', error);
            setUploadResult({
                success: false,
                message: error.response?.data?.message || 'Upload failed',
                error: error.message
            });
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    // 🔧 CLEANUP: Revoke preview URLs on unmount
    useEffect(() => {
        return () => {
            previewImages.forEach(preview => {
                URL.revokeObjectURL(preview.url);
            });
        };
    }, []);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="py-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">
                                    DICOM Image Uploader
                                </h1>
                                <p className="mt-2 text-gray-600">
                                    Convert and upload images as DICOM studies
                                </p>
                            </div>
                            <div className="flex items-center space-x-3">
                                <div className="flex items-center space-x-2 text-sm text-gray-500">
                                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <span>System Ready</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Main Upload Form */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-xl shadow-sm border">
                            <div className="p-6 border-b border-gray-200">
                                <h2 className="text-xl font-semibold text-gray-900">Upload Images</h2>
                                <p className="text-gray-600 mt-1">Fill in the study details and select images to upload</p>
                            </div>
                            
                            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                                
                                {/* Patient Information */}
                                <div className="bg-blue-50 rounded-lg p-4">
                                    <h3 className="text-lg font-medium text-blue-900 mb-4 flex items-center">
                                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        Patient Information
                                    </h3>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Patient Name *
                                            </label>
                                            <input
                                                type="text"
                                                name="patientName"
                                                value={formData.patientName}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder="John Doe"
                                                required
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Patient ID *
                                                <button
                                                    type="button"
                                                    onClick={generatePatientId}
                                                    className="ml-2 text-xs text-blue-600 hover:text-blue-800"
                                                >
                                                    Generate
                                                </button>
                                            </label>
                                            <input
                                                type="text"
                                                name="patientId"
                                                value={formData.patientId}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder="PAT123456"
                                                required
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Birth Date
                                            </label>
                                            <input
                                                type="date"
                                                name="patientBirthDate"
                                                value={formData.patientBirthDate}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Sex
                                            </label>
                                            <select
                                                name="patientSex"
                                                value={formData.patientSex}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            >
                                                <option value="M">Male</option>
                                                <option value="F">Female</option>
                                                <option value="O">Other</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Study Information */}
                                <div className="bg-green-50 rounded-lg p-4">
                                    <h3 className="text-lg font-medium text-green-900 mb-4 flex items-center">
                                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                        </svg>
                                        Study Information
                                    </h3>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Study Description *
                                            </label>
                                            <input
                                                type="text"
                                                name="studyDescription"
                                                value={formData.studyDescription}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder="Chest X-Ray"
                                                required
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Series Description
                                            </label>
                                            <input
                                                type="text"
                                                name="seriesDescription"
                                                value={formData.seriesDescription}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder="PA and Lateral Views"
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Modality
                                            </label>
                                            <select
                                                name="modality"
                                                value={formData.modality}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            >
                                                <option value="OT">Other</option>
                                                <option value="CT">CT</option>
                                                <option value="MRI">MRI</option>
                                                <option value="XR">X-Ray</option>
                                                <option value="US">Ultrasound</option>
                                                <option value="DX">Digital Radiography</option>
                                                <option value="CR">Computed Radiography</option>
                                                <option value="MG">Mammography</option>
                                                <option value="NM">Nuclear Medicine</option>
                                                <option value="PT">PET</option>
                                            </select>
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Body Part Examined
                                            </label>
                                            <input
                                                type="text"
                                                name="bodyPartExamined"
                                                value={formData.bodyPartExamined}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder="CHEST"
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Accession Number
                                                <button
                                                    type="button"
                                                    onClick={generateAccessionNumber}
                                                    className="ml-2 text-xs text-blue-600 hover:text-blue-800"
                                                >
                                                    Generate
                                                </button>
                                            </label>
                                            <input
                                                type="text"
                                                name="accessionNumber"
                                                value={formData.accessionNumber}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder="ACC123456"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Additional Information */}
                                <div className="bg-purple-50 rounded-lg p-4">
                                    <h3 className="text-lg font-medium text-purple-900 mb-4 flex items-center">
                                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Additional Information
                                    </h3>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Referring Physician
                                            </label>
                                            <input
                                                type="text"
                                                name="referringPhysician"
                                                value={formData.referringPhysician}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder="Dr. Smith"
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Lab
                                            </label>
                                            <select
                                                name="labId"
                                                value={formData.labId}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            >
                                                <option value="">Select Lab</option>
                                                {availableLabs.map(lab => (
                                                    <option key={lab._id} value={lab._id}>
                                                        {lab.name} ({lab.identifier})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Clinical History
                                            </label>
                                            <textarea
                                                name="clinicalHistory"
                                                value={formData.clinicalHistory}
                                                onChange={handleInputChange}
                                                rows="3"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder="Patient history and clinical notes..."
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* File Upload */}
                                <div className="bg-orange-50 rounded-lg p-4">
                                    <h3 className="text-lg font-medium text-orange-900 mb-4 flex items-center">
                                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        Image Files
                                    </h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <input
                                                type="file"
                                                multiple
                                                accept="image/*"
                                                onChange={handleFileSelect}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                            <p className="text-sm text-gray-500 mt-1">
                                                Select multiple image files (JPEG, PNG, etc.). Max 50MB per file.
                                            </p>
                                        </div>
                                        
                                        {/* File Previews */}
                                        {previewImages.length > 0 && (
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                {previewImages.map((preview, index) => (
                                                    <div key={index} className="relative bg-white rounded-lg border p-2">
                                                        <img
                                                            src={preview.url}
                                                            alt={preview.name}
                                                            className="w-full h-24 object-cover rounded"
                                                        />
                                                        <div className="mt-2">
                                                            <p className="text-xs text-gray-600 truncate" title={preview.name}>
                                                                {preview.name}
                                                            </p>
                                                            <p className="text-xs text-gray-500">{preview.size}</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeFile(index)}
                                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Upload Progress */}
                                {uploading && (
                                    <div className="bg-blue-50 rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-blue-900">Uploading...</span>
                                            <span className="text-sm text-blue-600">{uploadProgress}%</span>
                                        </div>
                                        <div className="w-full bg-blue-200 rounded-full h-2">
                                            <div
                                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                                style={{ width: `${uploadProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Upload Result */}
                                {uploadResult && (
                                    <div className={`rounded-lg p-4 ${uploadResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                        <div className="flex items-start">
                                            <div className="flex-shrink-0">
                                                {uploadResult.success ? (
                                                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div className="ml-3">
                                                <h4 className={`text-sm font-medium ${uploadResult.success ? 'text-green-900' : 'text-red-900'}`}>
                                                    {uploadResult.success ? 'Upload Successful' : 'Upload Failed'}
                                                </h4>
                                                <p className={`text-sm mt-1 ${uploadResult.success ? 'text-green-700' : 'text-red-700'}`}>
                                                    {uploadResult.message}
                                                </p>
                                                {uploadResult.success && uploadResult.data && (
                                                    <div className="mt-2 text-sm text-green-700">
                                                        <p>Study ID: {uploadResult.data.studyId}</p>
                                                        <p>Accession: {uploadResult.data.accessionNumber}</p>
                                                        <p>Success: {uploadResult.data.successCount}/{uploadResult.data.totalProcessed} files</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Submit Button */}
                                <div className="flex justify-end space-x-4">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedFiles([]);
                                            setPreviewImages([]);
                                            setUploadResult(null);
                                        }}
                                        className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                        Clear
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={uploading || selectedFiles.length === 0}
                                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                                    >
                                        {uploading ? (
                                            <>
                                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Uploading...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                </svg>
                                                Upload to DICOM
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        
                        {/* Recent Uploads */}
                        <div className="bg-white rounded-xl shadow-sm border">
                            <div className="p-4 border-b border-gray-200">
                                <h3 className="text-lg font-semibold text-gray-900">Recent Uploads</h3>
                            </div>
                            <div className="p-4">
                                {recentUploads.length > 0 ? (
                                    <div className="space-y-3">
                                        {recentUploads.slice(0, 5).map((upload, index) => (
                                            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">
                                                        {upload.patientInfo?.patientName || 'Unknown Patient'}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {new Date(upload.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                    upload.workflowStatus === 'new_study_received' 
                                                        ? 'bg-green-100 text-green-800'
                                                        : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {upload.workflowStatus.replace(/_/g, ' ').toUpperCase()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-sm">No recent uploads</p>
                                )}
                            </div>
                        </div>

                        {/* Help & Info */}
                        <div className="bg-white rounded-xl shadow-sm border">
                            <div className="p-4 border-b border-gray-200">
                                <h3 className="text-lg font-semibold text-gray-900">Help & Information</h3>
                            </div>
                            <div className="p-4 space-y-4">
                                <div>
                                    <h4 className="text-sm font-medium text-gray-900 mb-2">Supported Formats</h4>
                                    <ul className="text-sm text-gray-600 space-y-1">
                                        <li>• JPEG (.jpg, .jpeg)</li>
                                        <li>• PNG (.png)</li>
                                        <li>• BMP (.bmp)</li>
                                        <li>• TIFF (.tiff, .tif)</li>
                                    </ul>
                                </div>
                                
                                <div>
                                    <h4 className="text-sm font-medium text-gray-900 mb-2">File Limits</h4>
                                    <ul className="text-sm text-gray-600 space-y-1">
                                        <li>• Max size: 50MB per file</li>
                                        <li>• No limit on number of files</li>
                                        <li>• Auto-converted to DICOM format</li>
                                    </ul>
                                </div>
                                
                                <div>
                                    <h4 className="text-sm font-medium text-gray-900 mb-2">Processing</h4>
                                    <ul className="text-sm text-gray-600 space-y-1">
                                        <li>• Images converted to grayscale</li>
                                        <li>• DICOM metadata generated</li>
                                        <li>• Automatically uploaded to Orthanc</li>
                                        <li>• ZIP archive created in cloud</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DicomUploader;