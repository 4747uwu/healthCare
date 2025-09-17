import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import TemplateTreeView from './TemplateTreeView';
import ReportEditor from './ReportEditor';
import PatientInfoPanel from './PatientInfoPanel';
import RecentStudies from './RecentStudies';
import sessionManager from '../../services/sessionManager';

const OnlineReportingSystem = () => {
  const { studyId } = useParams();
  const navigate = useNavigate();
  
  console.log('🔍 [OnlineReporting] Component mounted with studyId:', studyId);
  
  const [studyData, setStudyData] = useState(null);
  const [patientData, setPatientData] = useState(null);
  const [templates, setTemplates] = useState({});
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [reportData, setReportData] = useState({});
  const [reportContent, setReportContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [exportFormat, setExportFormat] = useState('docx');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 🆕 NEW: Add state for download options
  const [downloadOptions, setDownloadOptions] = useState(null);

  // 🔍 DEBUG: Log all state changes
  useEffect(() => {
    console.log('📊 [State Update] studyData:', studyData);
  }, [studyData]);

  useEffect(() => {
    console.log('📊 [State Update] patientData:', patientData);
  }, [patientData]);

  useEffect(() => {
    console.log('📊 [State Update] downloadOptions:', downloadOptions);
  }, [downloadOptions]);

  useEffect(() => {
    console.log('📊 [State Update] templates:', templates);
  }, [templates]);

  useEffect(() => {
    console.log('📊 [State Update] selectedTemplate:', selectedTemplate);
  }, [selectedTemplate]);

  useEffect(() => {
    console.log('📊 [State Update] reportData:', reportData);
  }, [reportData]);

  useEffect(() => {
    console.log('📊 [State Update] reportContent length:', reportContent?.length || 0);
  }, [reportContent]);

  // Re-initialize when studyId changes
  useEffect(() => {
    console.log('🔄 [Effect] studyId changed:', studyId);
    if (studyId) {
      console.log('🔄 [Effect] Resetting all state and loading new study data');
      // Reset all state when switching studies
      setStudyData(null);
      setPatientData(null);
      setSelectedTemplate(null);
      setReportData({});
      setReportContent('');
      setSaving(false);
      setFinalizing(false);
      setExportFormat('docx');
      
      // Load new study data
      initializeReportingSystem();
    }
  }, [studyId]);

  const initializeReportingSystem = async () => {
    console.log('🚀 [Initialize] Starting reporting system initialization for studyId:', studyId);
    setLoading(true);
    
    try {
      const currentUser = sessionManager.getCurrentUser();
      console.log('👤 [Initialize] Current user:', currentUser);
      
      if (!currentUser) {
        console.error('❌ [Initialize] No current user found');
        toast.error('Authentication required.');
        navigate('/login');
        return;
      }
      
      console.log('📧 [Initialize] User email:', currentUser.email);
      console.log('👤 [Initialize] User role:', currentUser.role);
      
      // 🔍 DEBUG: Log API endpoints being called
      const studyEndpoint = `/labEdit/patients/${studyId}`;
      const templatesEndpoint = '/html-templates/reporting';
      const downloadInfoEndpoint = `/documents/study/${studyId}/download-info`;
      
      console.log('📡 [API] Calling endpoints:');
      console.log('  - Study:', studyEndpoint);
      console.log('  - Templates:', templatesEndpoint);
      console.log('  - Download Info:', downloadInfoEndpoint);
      
      const [studyResponse, templatesResponse, downloadInfoResponse] = await Promise.all([
        api.get(studyEndpoint),
        api.get(templatesEndpoint),
        api.get(downloadInfoEndpoint)
      ]);

      // 🔍 DEBUG: Log all API responses
      console.log('📡 [API Response] Study Response:', {
        status: studyResponse.status,
        success: studyResponse.data?.success,
        data: studyResponse.data
      });
      
      console.log('📡 [API Response] Templates Response:', {
        status: templatesResponse.status,
        success: templatesResponse.data?.success,
        templatesCount: Object.keys(templatesResponse.data?.data?.templates || {}).length,
        data: templatesResponse.data
      });
      
      console.log('📡 [API Response] Download Info Response:', {
        status: downloadInfoResponse.status,
        success: downloadInfoResponse.data?.success,
        data: downloadInfoResponse.data
      });

      if (studyResponse.data.success) {
        const data = studyResponse.data.data;
        console.log('✅ [Study] Raw study data received:', data);
        
        // Extract study info from the correct nested structure
        const studyInfo = data.studyInfo || {};
        const patientInfo = data.patientInfo || {};
        const allStudies = data.allStudies || [];
        
        console.log('🔍 [Study] Extracted data structures:');
        console.log('  - studyInfo:', studyInfo);
        console.log('  - patientInfo:', patientInfo);
        console.log('  - allStudies count:', allStudies.length);
        console.log('  - allStudies:', allStudies);
        
        // Find the current study from allStudies array or use studyInfo
        const currentStudy = allStudies.find(study => study.studyId === studyId) || studyInfo;
        console.log('🎯 [Study] Current study found:', currentStudy);
        
        // Extract DICOM identifiers that might be needed for viewers
        const orthancStudyID = currentStudy.orthancStudyID || 
                            currentStudy.studyId || 
                            studyInfo.studyId ||
                            null;
      
        const studyInstanceUID = currentStudy.studyInstanceUID || 
                              currentStudy.studyId || 
                              studyInfo.studyId ||
                              null;
      
        console.log('🔍 [DICOM] Extracted IDs:', {
          orthancStudyID,
          studyInstanceUID,
          originalStudyId: currentStudy.studyId || studyInfo.studyId,
          currentStudyKeys: Object.keys(currentStudy || {}),
          studyInfoKeys: Object.keys(studyInfo || {})
        });
      
        const processedStudyData = {
          _id: studyId,
          accessionNumber: currentStudy.accessionNumber || studyInfo.accessionNumber || 'N/A',
          modality: currentStudy.modality || studyInfo.modality || 'N/A',
          studyDate: currentStudy.studyDate || studyInfo.studyDate || new Date().toISOString(),
          description: currentStudy.examDescription || studyInfo.examDescription || '',
          workflowStatus: currentStudy.status || studyInfo.workflowStatus || studyInfo.status || 'assigned_to_doctor',
          priority: currentStudy.priorityLevel || studyInfo.priorityLevel || 'NORMAL',
          
          // DICOM identifiers for viewers - try multiple fallback options
          orthancStudyID: orthancStudyID,
          studyInstanceUID: studyInstanceUID,
          
          // Additional fields that might be useful
          studyId: currentStudy.studyId || studyInfo.studyId,
          caseType: currentStudy.caseType || studyInfo.caseType,
          assignedDoctor: currentStudy.assignedDoctor || studyInfo.assignedDoctor,
          
          ...currentStudy,
          ...studyInfo
        };
        
        console.log('✅ [Study] Processed study data:', processedStudyData);
        setStudyData(processedStudyData);
        
        const processedPatientData = {
          fullName: patientInfo.fullName || patientInfo.patientName || 'Unknown Patient',
          patientId: patientInfo.patientId || patientInfo.patientID || 'N/A',
          age: patientInfo.age || 'N/A',
          gender: patientInfo.gender || 'N/A',
          dateOfBirth: patientInfo.dateOfBirth || 'N/A',
          ...patientInfo
        };
        
        console.log('✅ [Patient] Processed patient data:', processedPatientData);
        setPatientData(processedPatientData);
        
        // Extract referring physician info
        const referringPhysicians = data.referringPhysicians || {};
        const currentReferring = referringPhysicians.current || {};
        
        console.log('👨‍⚕️ [Physician] Referring physicians data:', {
          referringPhysicians,
          currentReferring
        });
        
        const processedReportData = {
          referringPhysician: currentReferring.name || 
                             currentStudy.referringPhysician || 
                             studyInfo.physicians?.referring?.name || 
                             'N/A',
        };
        
        console.log('✅ [Report] Processed report data:', processedReportData);
        setReportData(processedReportData);

        toast.success(`Loaded study: ${currentStudy.accessionNumber || studyInfo.accessionNumber || studyId}`);
      } else {
        console.error('❌ [Study] Failed to load study data:', studyResponse.data);
        toast.error("Failed to load study data.");
      }
      
      if (templatesResponse.data.success) {
        const templateData = templatesResponse.data.data.templates;
        console.log('✅ [Templates] Setting templates:', {
          templateCount: Object.keys(templateData).length,
          templateCategories: Object.keys(templateData),
          templates: templateData
        });
        setTemplates(templateData);
      } else {
        console.error('❌ [Templates] Failed to load templates:', templatesResponse.data);
      }
      
      console.log('🧹 [Content] Resetting report content');
      setReportContent(''); 

      // 🆕 NEW: Set download options
      if (downloadInfoResponse.data.success) {
        const downloadData = downloadInfoResponse.data;
        console.log('✅ [Download] Setting download options:', downloadData);
        console.log('🔍 [Download] Download options breakdown:', {
          hasR2CDN: downloadData.downloadOptions?.hasR2CDN,
          r2SizeMB: downloadData.downloadOptions?.r2SizeMB,
          orthancStudyID: downloadData.orthancStudyID,
          studyInstanceUID: downloadData.studyInstanceUID,
          endpoints: downloadData.downloadOptions?.endpoints
        });
        setDownloadOptions(downloadData);
      } else {
        console.error('❌ [Download] Failed to load download options:', downloadInfoResponse.data);
      }

    } catch (error) {
      console.error('❌ [Initialize] API Error:', error);
      console.error('❌ [Initialize] Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: error.config
      });
      
      if (error.response?.status === 404) {
        console.error('❌ [Initialize] 404 Error - Study not found:', studyId);
        toast.error(`Study ${studyId} not found or access denied.`);
        setTimeout(() => navigate('/doctor/dashboard'), 2000);
      } else if (error.response?.status === 401) {
        console.error('❌ [Initialize] 401 Error - Authentication expired');
        toast.error('Authentication expired. Please log in again.');
        navigate('/login');
      } else {
        console.error('❌ [Initialize] Unknown error:', error.message);
        toast.error(`Failed to load study: ${error.message || 'Unknown error'}`);
      }
    } finally {
      console.log('🏁 [Initialize] Initialization complete, setting loading to false');
      setLoading(false);
    }
  };

  // Download functionality from WorklistTable
  const handleWasabiDownload = async () => {
    console.log('🌐 [Download] Starting R2 CDN download');
    console.log('🔍 [Download] Download options check:', downloadOptions);
    console.log('🔍 [Download] hasR2CDN check:', downloadOptions?.downloadOptions?.hasR2CDN);
    
    if (!downloadOptions?.downloadOptions?.hasR2CDN) {
      console.error('❌ [Download] R2 CDN not available for this study');
      toast.error('R2 CDN download not available for this study');
      return;
    }

    try {
      const endpoint = `/documents/study/${studyId}/download/r2-cdn`;
      console.log('📡 [Download] Calling R2 CDN endpoint:', endpoint);
      
      const loadingToast = toast.loading('Getting R2 CDN download URL...');
      
      const response = await api.get(endpoint);
      
      console.log('📡 [Download] R2 CDN response:', {
        status: response.status,
        success: response.data?.success,
        data: response.data
      });
      
      toast.dismiss(loadingToast);
      
      if (response.data.success) {
        const { downloadUrl, fileName, fileSizeMB, expectedSpeed, storageProvider } = response.data.data;
        
        console.log('✅ [Download] R2 CDN download URL received:', {
          fileName,
          fileSizeMB,
          expectedSpeed,
          storageProvider,
          downloadUrl: downloadUrl ? 'URL received' : 'No URL'
        });
        
        // Large file handling with R2 info
        if (fileSizeMB > 100) {
          console.log('⚠️ [Download] Large file detected, showing confirmation dialog');
          const downloadChoice = confirm(
            `Large file detected: ${fileName} (${fileSizeMB}MB)\n\n` +
            `🚀 Storage: ${storageProvider} with CDN\n` +
            `⚡ Expected speed: ${expectedSpeed}\n` +
            `🌐 Global CDN: Enabled\n\n` +
            `Click OK for direct download, or Cancel to copy URL.`
          );
          
          if (!downloadChoice) {
            console.log('📋 [Download] User chose to copy URL instead of download');
            try {
              await navigator.clipboard.writeText(downloadUrl);
              console.log('✅ [Download] URL copied to clipboard successfully');
              toast.success(
                `📋 R2 CDN URL copied!\n\n` +
                `🚀 Cloudflare R2 with global CDN\n` +
                `⚡ ${expectedSpeed}\n` +
                `🔗 Permanent URL (no expiry)`,
                { duration: 8000, icon: '🌐' }
              );
              return;
            } catch (clipboardError) {
              console.error('❌ [Download] Failed to copy to clipboard:', clipboardError);
              prompt('Copy this R2 CDN URL:', downloadUrl);
              return;
            }
          }
        }
        
        // Direct browser download
        console.log('⬇️ [Download] Starting direct browser download');
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName;
        link.target = '_blank';
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('✅ [Download] Download link clicked successfully');
        toast.success(
          `🚀 R2 CDN Download started: ${fileName}\n` +
          `📁 Size: ${fileSizeMB}MB\n` +
          `⚡ ${expectedSpeed}\n` +
          `🌐 Cloudflare Global CDN`,
          { duration: 6000, icon: '🌐' }
        );
        
      } else {
        console.error('❌ [Download] R2 download failed:', response.data);
        toast.error(response.data.message || 'R2 download failed');
      }
    } catch (error) {
      toast.dismiss();
      console.error('❌ [Download] R2 CDN download error:', error);
      console.error('❌ [Download] Error details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      if (error.response?.status === 404) {
        console.error('❌ [Download] 404 - ZIP file not found in R2');
        toast.error('ZIP file not found in R2. Creating new one...');
      } else if (error.response?.status === 410) {
        console.error('❌ [Download] 410 - ZIP file has expired');
        toast.error('ZIP file has expired. Creating a new one...');
      } else {
        console.error('❌ [Download] Unknown error getting R2 CDN URL');
        toast.error('Failed to get R2 CDN download URL');
      }
    }
  };

  // 🔧 ENHANCED: Update existing download function to use new endpoint
  const handleDownloadStudy = async () => {
    console.log('📥 [Download] Starting study download');
    console.log('🔍 [Download] Download options:', downloadOptions);
    
    if (!downloadOptions) {
      console.error('❌ [Download] No download information available');
      toast.error('Download information not available');
      return;
    }

    // Prefer R2 CDN if available
    if (downloadOptions.downloadOptions.hasR2CDN) {
      console.log('🌐 [Download] R2 CDN available, using R2 download');
      await handleWasabiDownload();
      return;
    }

    // Fallback to direct Orthanc download
    console.log('🔄 [Download] R2 CDN not available, falling back to Orthanc direct');
    try {
      const loadingToastId = toast.loading('Preparing download...', { duration: 10000 });
      
      console.log('🔍 [Download] Attempting direct Orthanc download');
      
      const endpoint = `/documents/study/${studyId}/download/orthanc-direct`;
      console.log('📡 [Download] Calling Orthanc endpoint:', endpoint);
      
      const response = await api.get(endpoint, {
        responseType: 'blob',
        timeout: 300000,
      });
      
      console.log('📡 [Download] Orthanc response received:', {
        status: response.status,
        contentType: response.headers['content-type'],
        dataSize: response.data?.size || 'unknown'
      });
      
      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `study_${studyId}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      console.log('✅ [Download] Orthanc download completed successfully');
      toast.dismiss(loadingToastId);
      toast.success('Download started successfully!');
      
    } catch (error) {
      toast.dismiss(loadingToastId);
      console.error('❌ [Download] Orthanc download error:', error);
      console.error('❌ [Download] Error details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      toast.error('Download failed: ' + (error.message || 'Unknown error'));
    }
  };

  // Radiant Viewer functionality from WorklistTable
  const handleLaunchRadiantViewer = async () => {
    console.log('🖥️ [Radiant] Starting Radiant Viewer launch');
    console.log('🔍 [Radiant] Current study data:', studyData);
    
    const launchId = studyData?.orthancStudyID || 
                  studyData?.studyInstanceUID || 
                  studyData?.studyId || 
                  studyId;
  
    console.log('🔍 [Radiant] Launch ID candidates:', {
      orthancStudyID: studyData?.orthancStudyID,
      studyInstanceUID: studyData?.studyInstanceUID,
      studyId: studyData?.studyId,
      paramStudyId: studyId,
      finalLaunchId: launchId
    });
  
    if (!launchId) {
      console.error('❌ [Radiant] No launch ID available');
      toast.error('Study data not available for Radiant Viewer');
      console.log('🔍 [Radiant] Available study data for Radiant:', studyData);
      return;
    }

    try {
      const loadingToastId = toast.loading('Preparing to launch Radiant Viewer...', { duration: 5000 });
      const protocol = 'myapp';
      let launchUrl = `${protocol}://launch?study=${encodeURIComponent(launchId)}`;
      
      const authToken = sessionManager.getToken();
      console.log('🔑 [Radiant] Auth token available:', !!authToken);
      
      if (authToken) {
        launchUrl += `&token=${encodeURIComponent(authToken)}`;
      }
      
      console.log('🚀 [Radiant] Final launch URL:', launchUrl);
      window.location.href = launchUrl;

      setTimeout(() => {
        toast.dismiss(loadingToastId);
        console.log('✅ [Radiant] Launch command sent successfully');
        toast.success('🖥️ Launch command sent to your system!', { duration: 4000, icon: '➡️' });
      }, 1500);

    } catch (error) {
      console.error('❌ [Radiant] Error launching Radiant Viewer:', error);
      toast.error(`Failed to initiate Radiant Viewer launch: ${error.message}`);
    }
  };

  // OHIF functionality from EyeIconDropdown
  const handleOpenOHIF = async () => {
    console.log('👁️ [OHIF] Starting OHIF Viewer launch');
    console.log('🔍 [OHIF] Current study data:', studyData);
    
    const ohifId = studyData?.studyInstanceUID || 
                studyData?.studyId || 
                studyData?.orthancStudyID || 
                studyId;
  
    console.log('🔍 [OHIF] OHIF ID candidates:', {
      studyInstanceUID: studyData?.studyInstanceUID,
      studyId: studyData?.studyId,
      orthancStudyID: studyData?.orthancStudyID,
      paramStudyId: studyId,
      finalOhifId: ohifId
    });
  
    if (!ohifId) {
      console.error('❌ [OHIF] No OHIF ID available');
      toast.error('Study data not available for OHIF Viewer');
      console.log('🔍 [OHIF] Available study data for OHIF:', studyData);
      return;
    }

    try {
      const ohifBaseURL = import.meta.env.VITE_OHIF_LOCAL_URL || 'http://localhost:4000';
      const orthancBaseURL = import.meta.env.VITE_ORTHANC_URL || 'http://localhost:8042';
      
      console.log('🔧 [OHIF] Configuration:', {
        ohifBaseURL,
        orthancBaseURL,
        ohifId
      });
      
      const orthancUsername = 'alice';
      const orthancPassword = 'alicePassword';
      
      const ohifUrl = new URL(`${ohifBaseURL}/viewer`);
      ohifUrl.searchParams.set('StudyInstanceUIDs', ohifId);
      
      const dataSourceConfig = {
        namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
        sourceName: 'dicomweb',
        configuration: {
          friendlyName: 'Local Orthanc Server',
          name: 'orthanc',
          wadoUriRoot: `${orthancBaseURL}/wado`,
          qidoRoot: `${orthancBaseURL}/dicom-web`,
          wadoRoot: `${orthancBaseURL}/dicom-web`,
          qidoSupportsIncludeField: true,
          supportsReject: false,
          imageRendering: 'wadors',
          thumbnailRendering: 'wadors',
          enableStudyLazyLoad: true,
          supportsFuzzyMatching: false,
          supportsWildcard: true,
          headers: {
            'Authorization': `Basic ${btoa(`${orthancUsername}:${orthancPassword}`)}`
          },
          requestOptions: {
            auth: `${orthancUsername}:${orthancPassword}`,
            headers: {
              'Authorization': `Basic ${btoa(`${orthancUsername}:${orthancPassword}`)}`
            }
          }
        }
      };
      
      ohifUrl.searchParams.set('dataSources', JSON.stringify([dataSourceConfig]));
      
      console.log('🔍 [OHIF] Final OHIF URL:', ohifUrl.toString());
      console.log('🔍 [OHIF] Data source config:', dataSourceConfig);
      
      window.open(ohifUrl.toString(), '_blank');
      console.log('✅ [OHIF] OHIF Viewer opened successfully');
      toast.success('OHIF Viewer opened in new tab');
      
    } catch (error) {
      console.error('❌ [OHIF] Error opening OHIF viewer:', error);
      toast.error('Failed to open OHIF viewer');
    }
  };

  const handleTemplateSelect = async (templateId) => {
    console.log('📄 [Template] Template selection started:', templateId);
    
    try {
      const endpoint = `/html-templates/${templateId}`;
      console.log('📡 [Template] Calling template endpoint:', endpoint);
      
      const response = await api.get(endpoint);
      
      console.log('📡 [Template] Template response:', {
        status: response.status,
        success: response.data?.success,
        templateTitle: response.data?.data?.title,
        contentLength: response.data?.data?.htmlContent?.length || 0
      });
      
      if (response.data.success) {
        const template = response.data.data;
        console.log('✅ [Template] Setting selected template:', {
          id: template._id,
          title: template.title,
          category: template.category,
          modality: template.modality,
          contentPreview: template.htmlContent?.substring(0, 200) + '...'
        });
        
        setSelectedTemplate(template);
        setReportContent(template.htmlContent);
        toast.success(`Template "${template.title}" loaded.`);
      }
    } catch (error) {
      console.error('❌ [Template] Error loading HTML template:', error);
      console.error('❌ [Template] Error details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      toast.error('Failed to load template');
    }
  };

  const handleSaveDraft = async () => {
    console.log('💾 [Draft] Starting draft save');
    console.log('🔍 [Draft] Report content length:', reportContent?.trim()?.length || 0);
    
    if (!reportContent.trim()) {
      console.error('❌ [Draft] Cannot save empty draft');
      toast.error('Cannot save an empty draft.');
      return;
    }
    
    setSaving(true);
    
    try {
      const currentUser = sessionManager.getCurrentUser();
      console.log('👤 [Draft] Current user for draft:', currentUser);
      
      const templateName = "MyReport.docx";

      // Prepare placeholders with current data
      const placeholders = {
        '--name--': patientData?.fullName || 'N/A',
        '--patientid--': patientData?.patientId || 'N/A',
        '--accessionno--': studyData?.accessionNumber || 'N/A',
        '--agegender--': `${patientData?.age || 'N/A'} / ${patientData?.gender || 'N/A'}`,
        '--referredby--': reportData?.referringPhysician || 'N/A',
        '--reporteddate--': studyData?.studyDate ? new Date(studyData.studyDate).toLocaleDateString() : new Date().toLocaleDateString(),
        '--Content--': reportContent,
        '--modality--': studyData?.modality || 'N/A',
        '--studydate--': studyData?.studyDate ? new Date(studyData.studyDate).toLocaleDateString() : 'N/A',
        '--description--': studyData?.description || 'N/A',
        '--doctorname--': currentUser?.fullName || 'Doctor',
        '--hospitalname--': 'Star Radiology',
        '--reportstatus--': 'DRAFT'
      };

      console.log('🔍 [Draft] Placeholders prepared:', {
        studyId,
        templateName,
        placeholdersCount: Object.keys(placeholders).length,
        placeholders
      });

      // Call the new draft report generation endpoint
      const endpoint = `/documents/study/${studyId}/generate-draft-report`;
      console.log('📡 [Draft] Calling draft endpoint:', endpoint);
      
      const response = await api.post(endpoint, {
        templateName,
        placeholders
      });

      console.log('📡 [Draft] Draft response:', {
        status: response.status,
        success: response.data?.success,
        data: response.data
      });

      if (response.data.success) {
        console.log('✅ [Draft] Draft saved successfully:', {
          documentId: response.data.data.documentId,
          filename: response.data.data.filename,
          downloadUrl: response.data.data.downloadUrl
        });
        
        toast.success('Draft saved successfully!', {
          duration: 4000,
          icon: '📝'  
        });
        
        // Optionally show download option
        if (response.data.data.downloadUrl) {
          console.log('🔗 [Draft] Download URL available, showing download option');
          setTimeout(() => {
            const shouldDownload = window.confirm('Draft saved! Would you like to download the draft document?');
            console.log('🔍 [Draft] User download choice:', shouldDownload);
            if (shouldDownload) {
              window.open(response.data.data.downloadUrl, '_blank');
            }
          }, 1000);
        }
        
      } else {
        console.error('❌ [Draft] Draft save failed:', response.data);
        throw new Error(response.data.message || 'Failed to save draft');
      }

    } catch (error) {
      console.error('❌ [Draft] Error saving draft:', error);
      console.error('❌ [Draft] Error details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      // Handle specific error cases
      if (error.response?.status === 404) {
        console.error('❌ [Draft] 404 - Study not found');
        toast.error('Study not found. Please refresh and try again.');
      } else if (error.response?.status === 401) {
        console.error('❌ [Draft] 401 - Authentication expired');
        toast.error('Authentication expired. Please log in again.');
        navigate('/login');
      } else if (error.response?.status === 400) {
        console.error('❌ [Draft] 400 - Invalid data');
        toast.error('Invalid data provided. Please check your report content.');
      } else if (error.response?.status === 500) {
        console.error('❌ [Draft] 500 - Server error');
        toast.error('Server error while saving draft. Please try again.');
      } else {
        console.error('❌ [Draft] Unknown error');
        toast.error(`Failed to save draft: ${error.message || 'Unknown error'}`);
      }
    } finally {
      console.log('🏁 [Draft] Draft save process complete');
      setSaving(false);
    }
  };

  const handleFinalizeReport = async () => {
    console.log('🏁 [Finalize] Starting report finalization');
    console.log('🔍 [Finalize] Report content length:', reportContent?.trim()?.length || 0);
    console.log('🔍 [Finalize] Export format:', exportFormat);
    
    if (!reportContent.trim()) {
      console.error('❌ [Finalize] Cannot finalize empty report');
      toast.error('Please enter report content to finalize.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to finalize this report as ${exportFormat.toUpperCase()}? Once finalized, it cannot be edited.`
    );
    
    console.log('🔍 [Finalize] User confirmation:', confirmed);
    if (!confirmed) return;

    setFinalizing(true);
    
    try {
      const currentUser = sessionManager.getCurrentUser();
      console.log('👤 [Finalize] Current user for finalization:', currentUser);
      
      const templateName = `MyReport.${exportFormat}`;

      const placeholders = {
        '--name--': patientData?.fullName || '',
        '--patientid--': patientData?.patientId || '',
        '--accessionno--': studyData?.accessionNumber || '',
        '--agegender--': `${patientData?.age || ''} / ${patientData?.gender || ''}`,
        '--referredby--': reportData?.referringPhysician || '',
        '--reporteddate--': studyData?.studyDate ? new Date(studyData.studyDate).toLocaleDateString() : new Date().toLocaleDateString(),
        '--Content--': reportContent
      };

      console.log('🔍 [Finalize] Finalization data prepared:', {
        templateName,
        exportFormat,
        placeholdersCount: Object.keys(placeholders).length,
        placeholders
      });

      const endpoint = exportFormat === 'pdf' 
        ? `/documents/study/${studyId}/generate-pdf-report`
        : `/documents/study/${studyId}/generate-report`;

      console.log('📡 [Finalize] Calling finalization endpoint:', endpoint);

      const response = await api.post(endpoint, {
        templateName,
        placeholders,
        format: exportFormat
      });

      console.log('📡 [Finalize] Finalization response:', {
        status: response.status,
        success: response.data?.success,
        data: response.data
      });

      if (response.data.success) {
        console.log('✅ [Finalize] Report finalized successfully');
        toast.success(`Report finalized as ${exportFormat.toUpperCase()} successfully!`);
        
        if (response.data.data?.downloadUrl) {
          console.log('🔗 [Finalize] Opening download URL:', response.data.data.downloadUrl);
          window.open(response.data.data.downloadUrl, '_blank');
        }
        
        // Better back navigation
        const currentUser = sessionManager.getCurrentUser();
        console.log('🔄 [Finalize] Navigating back based on user role:', currentUser?.role);
        
        if (currentUser?.role === 'doctor_account') {
          setTimeout(() => navigate('/doctor/dashboard'), 3000);
        } else {
          setTimeout(() => navigate('/admin/dashboard'), 3000);
        }
      } else {
        console.error('❌ [Finalize] Finalization failed:', response.data);
        throw new Error(response.data.message || 'Failed to finalize report');
      }

    } catch (error) {
      console.error('❌ [Finalize] Error finalizing report:', error);
      console.error('❌ [Finalize] Error details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      toast.error(error.message || 'An unexpected error occurred during finalization.');
    } finally {
      console.log('🏁 [Finalize] Finalization process complete');
      setFinalizing(false);
    }
  };

  const handleBackToWorklist = () => {
    console.log('🔙 [Navigation] Back to worklist clicked');
    const currentUser = sessionManager.getCurrentUser();
    console.log('👤 [Navigation] Current user for navigation:', currentUser);
    
    if (currentUser?.role === 'doctor_account') {
      console.log('🩺 [Navigation] Navigating to doctor dashboard');
      navigate('/doctor/dashboard');
    } else if (currentUser?.role === 'admin') {
      console.log('👑 [Navigation] Navigating to admin dashboard');
      navigate('/admin/dashboard');
    } else if (currentUser?.role === 'lab_staff') {
      console.log('🧪 [Navigation] Navigating to lab dashboard');
      navigate('/lab/dashboard');
    } else {
      console.log('❓ [Navigation] Unknown role, navigating to login');
      navigate('/login');
    }
  };

  // Final debug log
  console.log('📊 [Debug] Current component state:', {
    studyId,
    loading,
    studyData: studyData ? 'loaded' : 'null',
    patientData: patientData ? 'loaded' : 'null',
    downloadOptions: downloadOptions ? 'loaded' : 'null',
    templatesCount: Object.keys(templates).length,
    selectedTemplate: selectedTemplate ? selectedTemplate.title : 'none',
    reportContentLength: reportContent?.length || 0,
    saving,
    finalizing
  });

  if (loading) {
    console.log('⏳ [Render] Showing loading screen');
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-black border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">Loading study {studyId}...</p>
        </div>
      </div>
    );
  }

  console.log('🎨 [Render] Rendering main component');

  return (
  <div className="min-h-screen bg-gray-50 flex">
    {/* Collapsible Left Sidebar - Templates */}
    <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-white border-r border-gray-200 overflow-hidden relative z-10 flex-shrink-0`}>
      
      {/* Header Section with Logo - Only for Template Sidebar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex flex-row items-start justify-between items-center">
          <img 
            src="/xcentic.png" 
            alt="Star Radiology Logo" 
            className="h-12 w-auto mb-1"
          />
          <h2 className="text-sm items-end font-medium text-gray-900 text-center">
            Xcentic Reporting System
          </h2>
        </div>
      </div>

      {/* Template Tree View */}
      <div className="flex-1 overflow-y-auto">
        <TemplateTreeView
          templates={templates}
          selectedTemplate={selectedTemplate}
          onTemplateSelect={handleTemplateSelect}
          studyModality={studyData?.modality}
        />
      </div>
    </div>

    {/* Sidebar Toggle Button */}
    <button
      onClick={() => {
        console.log('🔄 [UI] Toggling sidebar:', !sidebarOpen);
        setSidebarOpen(!sidebarOpen);
      }}
      className={`fixed top-1/2 transform -translate-y-1/2 z-20 bg-white border border-gray-200 rounded-r-lg p-2 shadow-lg hover:bg-gray-50 transition-all duration-200 ${
        sidebarOpen ? 'left-80' : 'left-0'
      }`}
      title={sidebarOpen ? 'Close Templates' : 'Open Templates'}
    >
      <svg 
        className={`w-4 h-4 text-gray-600 transition-transform duration-200 ${
          sidebarOpen ? 'rotate-180' : ''
        }`} 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>

    {/* Main Content Area */}
    <div className="flex-1 flex min-w-0 h-screen">
      {/* Center - Report Editor */}
      <div className="flex-1 flex flex-col min-w-0 pr-84">
        <ReportEditor
          content={reportContent}
          onChange={(content) => {
            console.log('✏️ [Editor] Content changed, new length:', content?.length || 0);
            setReportContent(content);
          }}
        />
      </div>
      
      {/* Right Side Panel - Fixed Width */}
      <div className="w-100 flex-shrink-0 p-2 pt-0 pr-0 flex flex-col h-screen">
        {/* Study Action Buttons - Fixed at top */}
        <div className="flex-shrink-0 mb-2">
          <div className="bg-white border shadow-sm p-[6.5px]">
            
            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-1">
              {/* Download Button */}
              <button
                onClick={() => {
                  console.log('⬇️ [UI] Download button clicked');
                  console.log('🔍 [UI] Download options available:', !!downloadOptions);
                  console.log('🔍 [UI] Has R2 CDN:', downloadOptions?.downloadOptions?.hasR2CDN);
                  
                  if (downloadOptions?.downloadOptions?.hasR2CDN) {
                    handleWasabiDownload();
                  } else {
                    handleDownloadStudy();
                  }
                }}
                className="flex flex-col items-center justify-center p-2 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={downloadOptions?.downloadOptions?.hasR2CDN ? "Download from R2 CDN" : "Download Study"}
              >
                <svg className="w-4 h-4 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {downloadOptions?.downloadOptions?.hasR2CDN ? '🌐 R2 CDN' : 'Download'}
              </button>

              {/* Radiant Viewer Button */}
              <button
                onClick={() => {
                  console.log('🖥️ [UI] Radiant button clicked');
                  handleLaunchRadiantViewer();
                }}
                className="flex flex-col items-center justify-center p-2 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Open in Radiant Viewer"
              >
                <svg className="w-4 h-4 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553 2.276A2 2 0 0121 14.09V17a2 2 0 01-2 2H5a2 2 0 01-2-2v-2.91a2 2 0 01.447-1.814L8 10m7-6v6m0 0l-3-3m3 3l3-3" />
                </svg>
                Radiant
              </button>

              {/* OHIF Button */}
              <button
                onClick={() => {
                  console.log('👁️ [UI] OHIF button clicked');
                  handleOpenOHIF();
                }}
                className="flex flex-col items-center justify-center p-2 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Open in OHIF Viewer"
              >
                <svg className="w-4 h-4 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                OHIF
              </button>
            </div>
          </div>
        </div>

        {/* Empty space - takes remaining height */}
        <div className="flex-1"></div>
        
        {/* Study Controls Panel - Fixed at bottom right corner */}
        <div className="flex-shrink-0 bg-white border border-gray-300 rounded-lg shadow-lg p-4">
          {/* Study Tab */}
          <div className="mb-4">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-medium text-gray-900">Study</span>
            </div>
            
            {/* Study Info */}
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Patient:</span>
                <span className="text-gray-900 font-medium truncate ml-2">{patientData?.fullName || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">ID:</span>
                <span className="text-gray-900 truncate ml-2">{patientData?.patientId || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Modality:</span>
                <span className="text-gray-900 truncate ml-2">{studyData?.modality || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date:</span>
                <span className="text-gray-900 truncate ml-2">
                  {studyData?.studyDate ? new Date(studyData.studyDate).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Accession:</span>
                <span className="text-gray-900 font-mono text-xs truncate ml-2">{studyData?.accessionNumber || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Export Format Dropdown */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Export Format
            </label>
            <select
              value={exportFormat}
              onChange={(e) => {
                console.log('📄 [UI] Export format changed:', e.target.value);
                setExportFormat(e.target.value);
              }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
            >
              <option value="docx">DOCX Document</option>
              <option value="pdf">PDF Document</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={() => {
                console.log('💾 [UI] Save draft button clicked');
                handleSaveDraft();
              }}
              disabled={saving || !reportContent.trim()}
              className="w-full px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-200 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-3 w-3 border border-gray-500 border-t-transparent"></div>
                  Saving...
                </span>
              ) : (
                'Save Draft'
              )}
            </button>
            
            <button
              onClick={() => {
                console.log('🏁 [UI] Finalize report button clicked');
                handleFinalizeReport();
              }}
              disabled={finalizing || !reportContent.trim()}
              className="w-full px-4 py-2 text-sm font-medium bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {finalizing ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                  Finalizing...
                </span>
              ) : (
                `Finalize as ${exportFormat.toUpperCase()}`
              )}
            </button>

            <button
              onClick={() => {
                console.log('🔙 [UI] Back to dashboard button clicked');
                handleBackToWorklist();
              }}
              className="w-full px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Hidden Patient Info Panel */}
    <div className="hidden">
      <PatientInfoPanel
        patientData={patientData}
        studyData={studyData}
        reportData={reportData}
      />
    </div>
  </div>
)};

export default OnlineReportingSystem;