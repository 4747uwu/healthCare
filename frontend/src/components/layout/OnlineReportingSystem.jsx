import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import TemplateTreeView from './TemplateTreeView';
import ReportEditor from './ReportEditor';
import PatientInfoPanel from './PatientInfoPanel';
import sessionManager from '../../services/sessionManager';

// 🔧 NEW: HTML decoder function
const decodeHTMLEntities = (html) => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = html;
  return textarea.value;
};

// 🔧 UPDATED: Enhanced HTML template processor with content insertion
const processHTMLTemplate = (htmlContent, reportData) => {
  // First decode HTML entities
  let processedHtml = decodeHTMLEntities(htmlContent);
  
  console.log('🔧 Processing HTML template for content insertion...');
  
  // Define placeholder mappings
  const placeholderMap = {
    '{{PATIENT_NAME}}': reportData?.patientName || '[Patient Name]',
    '{{PATIENT_ID}}': reportData?.patientId || '[Patient ID]',
    '{{PATIENT_AGE}}': reportData?.age || '[Age]',
    '{{PATIENT_GENDER}}': reportData?.gender || '[Gender]',
    '{{STUDY_DATE}}': reportData?.studyDate ? new Date(reportData.studyDate).toLocaleDateString() : '[Study Date]',
    '{{MODALITY}}': reportData?.modality || '[Modality]',
    '{{ACCESSION_NUMBER}}': reportData?.accessionNumber || '[Accession Number]',
    '{{REFERRING_PHYSICIAN}}': reportData?.referringPhysician || '[Referring Physician]',
    '{{DOCTOR_NAME}}': reportData?.doctorName || '[Doctor Name]',
    '{{DOCTOR_SPECIALIZATION}}': reportData?.doctorSpecialization || '[Specialization]',
    '{{DOCTOR_LICENSE}}': reportData?.doctorLicenseNumber || '[License Number]',
    '{{CURRENT_DATE}}': new Date().toLocaleDateString(),
    '{{CURRENT_TIME}}': new Date().toLocaleTimeString()
  };
  
  // Replace all placeholders
  Object.entries(placeholderMap).forEach(([placeholder, value]) => {
    const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    processedHtml = processedHtml.replace(regex, value);
  });
  
  // Clean template content (remove any existing structure)
  processedHtml = processedHtml
    .replace(/<table[^>]*class="patient-info-table"[^>]*>.*?<\/table>/gis, '') // Remove patient table
    .replace(/<div[^>]*class="signature-section"[^>]*>.*?<\/div>/gis, '') // Remove signature section
    .replace(/<div[^>]*class="report-document"[^>]*>/gi, '') // Remove document wrapper
    .replace(/<\/div>\s*$/gi, '') // Remove closing wrapper
    .trim();
  
  console.log('✅ Template content cleaned and processed for insertion');
  return processedHtml;
};


const generateDefaultReport = ({ patientData, studyData, doctorDetails, currentUser }) => {
  return `
    <div class="report-document multi-page-report">
      <!-- Page 1 -->
      <div class="report-page" data-page="1">
        <!-- Patient Information Table - Always present on every page -->
        <table>
          <tr>
            <td><strong>Name:</strong></td>
            <td>${patientData?.fullName || patientData?.patientName || '[Patient Name]'}</td>
            <td><strong>Patient ID:</strong></td>
            <td>${patientData?.patientId || patientData?.patientID || '[Patient ID]'}</td>
          </tr>
          <tr>
            <td><strong>Accession No:</strong></td>
            <td>${studyData?.accessionNumber || 'N/A'}</td>
            <td><strong>Age/Gender:</strong></td>
            <td>${patientData?.age || 'N/A'} / ${patientData?.gender || 'F'}</td>
          </tr>
          <tr>
            <td><strong>Referred By:</strong></td>
            <td>N/A</td>
            <td><strong>Date:</strong></td>
            <td>${studyData?.studyDate ? new Date(studyData.studyDate).toLocaleDateString() : new Date().toLocaleDateString()}</td>
          </tr>
        </table>

        <!-- Template Content Area - Content flows here -->
        <div id="template-content-area" class="content-flow-area">
          <div class="template-placeholder" style="text-align: center; padding: 40px 20px; color: #666; font-style: italic; border: 2px dashed #ddd; margin: 20px 0;">
            <p>Select a template from the left panel to insert report content here...</p>
            <p style="font-size: 12px; margin-top: 10px;">Content will automatically flow to new pages with table headers.</p>
          </div>
        </div>

        <!-- 🔧 UPDATED: Normal signature section (not floating) -->
        <div class="signature-section">
          <div class="doctor-name">${doctorDetails?.fullName || currentUser?.fullName || 'Dr. Gamma Ray'}</div>
          <div class="doctor-specialization">${doctorDetails?.specialization || 'Oncology'}</div>
          <div class="doctor-license">Reg no. ${doctorDetails?.licenseNumber || 'ONC777G'}</div>
          ${doctorDetails?.signature ? `
            <div class="doctor-signature">
              <img src="data:${doctorDetails?.signatureMetadata?.mimeType || 'image/png'};base64,${doctorDetails.signature}" 
                   alt="Doctor Signature" class="signature-image" />
            </div>
          ` : '<div class="signature-placeholder">[Signature Area]</div>'}
          <div class="disclaimer">Disclaimer: This is an online interpretation...</div>
        </div>
      </div>
    </div>
  `;
};

const OnlineReportingSystem = () => {
  const { studyId } = useParams();
  const navigate = useNavigate();
  
  const [studyData, setStudyData] = useState(null);
  const [patientData, setPatientData] = useState(null);
  const [templates, setTemplates] = useState({});
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [reportData, setReportData] = useState({});
  const [reportContent, setReportContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Add these new states for format selection
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [convertingAndUploading, setConvertingAndUploading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    if (studyId) {
      initializeReportingSystem();
    }
  }, [studyId]);

  const initializeReportingSystem = async () => {
    console.log('🔍 [Reporting] Starting initialization...');
    console.log('🔍 [Reporting] Study ID:', studyId);
    
    // Check authentication
     const token = sessionManager.getToken();
    const currentUser = sessionManager.getCurrentUser();
    console.log('🔍 [Reporting] Token available:', !!token);
    console.log('🔍 [Reporting] Current user:', currentUser);
    
    if (!token) {
      console.error('❌ [Reporting] No authentication token found');
      toast.error('Authentication required. Redirecting to login...');
      navigate('/login');
      return;
    }

    setLoading(true);
    try {
      console.log('🔍 [Reporting] Making API calls...');
      
      // 🔧 NEW: Fetch current doctor details first
      let doctorDetails = null;
      if (currentUser?.role === 'doctor_account') {
        try {
          console.log('🔍 [Reporting] Fetching doctor profile...');
          const doctorResponse = await api.get(`/doctor/profile`);
          if (doctorResponse.data.success) {
            doctorDetails = doctorResponse.data.doctor || doctorResponse.data.data;
            console.log('✅ [Reporting] Doctor details loaded:', {
              name: doctorDetails.fullName,
              specialization: doctorDetails.specialization,
              licenseNumber: doctorDetails.licenseNumber,
              hasSignature: !!doctorDetails.signature
            });
          }
        } catch (doctorError) {
          console.warn('⚠️ [Reporting] Could not fetch doctor details:', doctorError.message);
        }
      }
      
      // 🔧 FIXED: Fetch HTML templates using the correct endpoint
      console.log('🔍 [Reporting] Fetching HTML templates...');
      const templatesResponse = await api.get('/html-templates/reporting');
      console.log('✅ [Reporting] Templates response:', templatesResponse.data);
      
      // Fetch study data
      console.log('🔍 [Reporting] Fetching study data...');
      const studyResponse = await api.get(`/labEdit/patients/${studyId}`);
      console.log('✅ [Reporting] Study response:', studyResponse.data);

      // Set templates first
      if (templatesResponse.data.success) {
        console.log('📋 HTML Templates loaded:', templatesResponse.data.data.templates);
        setTemplates(templatesResponse.data.data.templates);
      } else {
        console.warn('⚠️ No HTML templates loaded');
        setTemplates({});
      }

      // Process study data with null checks
      let processedStudyData = null;
      let processedPatientData = null;
      
      if (studyResponse.data.success) {
        const data = studyResponse.data.data;
        console.log('👤 Study data loaded:', data);
        
        processedStudyData = data.currentStudy || {};
        processedPatientData = data.patientInfo || {};
        
        setStudyData(processedStudyData);
        setPatientData(processedPatientData);
        
        // Pre-fill basic report data with safe defaults
        setReportData({
          patientName: processedPatientData.fullName || processedPatientData.patientName || 'Unknown Patient',
          patientId: processedPatientData.patientId || processedPatientData.patientID || 'N/A',
          age: processedPatientData.age || 'N/A',
          gender: processedPatientData.gender || 'N/A',
          studyDate: processedStudyData.studyDate || processedStudyData.studyDateTime || new Date().toISOString(),
          modality: processedStudyData.modality || 'N/A',
          accessionNumber: processedStudyData.accessionNumber || 'N/A',
          referringPhysician: data.referringPhysician?.name || 'N/A',
          examDescription: processedStudyData.examDescription || processedStudyData.description || 'N/A',
          institutionName: processedStudyData.institutionName || 'N/A',
          // 🔧 NEW: Add doctor details
          doctorName: doctorDetails?.fullName || currentUser?.fullName || 'Unknown Doctor',
          doctorSpecialization: doctorDetails?.specialization || 'N/A',
          doctorLicenseNumber: doctorDetails?.licenseNumber || 'N/A',
          doctorSignature: doctorDetails?.signature || null,
          doctorSignatureMetadata: doctorDetails?.signatureMetadata || null
        });
      } else {
        console.warn('⚠️ No study data loaded');
      }

      // 🔧 NEW: Generate default report with actual data
      if (processedStudyData && processedPatientData) {
        const defaultReport = generateDefaultReport({
          patientData: processedPatientData,
          studyData: processedStudyData,
          doctorDetails: doctorDetails || {},
          currentUser: currentUser || {}
        });
        setReportContent(defaultReport);
        console.log('✅ [Reporting] Default report generated');
      }

    } catch (error) {
      console.error('❌ [Reporting] API Error:', error);
      console.error('❌ [Reporting] Error status:', error.response?.status);
      console.error('❌ [Reporting] Error data:', error.response?.data);
      
      if (error.response?.status === 401) {
        toast.error('Session expired. Please login again.');
        navigate('/login');
        return;
      }
      
      toast.error('Failed to load reporting system');
      
    } finally {
      setLoading(false);
    }
  };

const handleTemplateSelect = async (templateId) => {
  try {
    console.log('🔍 Loading HTML template:', templateId);
    const response = await api.get(`/html-templates/${templateId}`);
    
    if (response.data.success) {
      const template = response.data.data;
      setSelectedTemplate(template);
      
      console.log('📋 HTML Template loaded:', template);
      
      // Process template content
      const processedTemplateContent = processHTMLTemplate(template.htmlContent, reportData);
      
      // Process content for multi-page layout
      const multiPageContent = processMultiPageContent(processedTemplateContent, patientData, studyData);
      
      // 🔧 UPDATED: Add signature as normal content at the end
      const completeDocument = `
        <div class="report-document multi-page-report">
          ${multiPageContent}
          
          <!-- 🔧 UPDATED: Normal signature section (not floating) -->
          <div class="signature-section">
            <div class="doctor-name">${reportData?.doctorName || 'Dr. Gamma Ray'}</div>
            <div class="doctor-specialization">${reportData?.doctorSpecialization || 'Oncology'}</div>
            <div class="doctor-license">Reg no. ${reportData?.doctorLicenseNumber || 'ONC777G'}</div>
            ${reportData?.doctorSignature ? `
              <div class="doctor-signature">
                <img src="data:${reportData?.doctorSignatureMetadata?.mimeType || 'image/png'};base64,${reportData.doctorSignature}" 
                     alt="Doctor Signature" class="signature-image" />
              </div>
            ` : '<div class="signature-placeholder">[Signature Area]</div>'}
            <div class="disclaimer">Disclaimer: This is an online interpretation...</div>
          </div>
        </div>
      `;
      
      setReportContent(completeDocument);
      
      console.log('✅ Multi-page template content inserted with normal signature flow');
      toast.success(`Template "${template.title}" loaded with multi-page support`);
    }
  } catch (error) {
    console.error('❌ Error loading HTML template:', error);
    toast.error('Failed to load template');
  }
};

  // Replace the handleSaveDraft function with this:
  const handleSaveDraft = () => {
    if (!reportContent.trim()) {
      toast.error('Please enter report content');
      return;
    }

    // Show draft format selection modal
    setShowDraftModal(true);
  };

  // New function to handle draft conversion and upload
  const handleDraftConvertAndUpload = async (format) => {
    const confirmed = window.confirm(
      `Are you sure you want to save this report as draft in ${format.toUpperCase()} format?`
    );
    
    if (!confirmed) {
      return;
    }

    setSavingDraft(true);
    setShowDraftModal(false);

    try {
      console.log(`🔄 Converting draft report to ${format} using OnlyOffice pipeline...`);
      
      // 🔧 CLEAN HTML before sending
      const cleanedHTML = cleanHTMLForPandoc(reportContent);
      
      // Use OnlyOffice-powered endpoint for DOCX
      const endpoint = format.toLowerCase() === 'docx' 
        ? `/documents/study/${studyId}/convert-and-upload-libreoffice`
        : `/documents/study/${studyId}/convert-and-upload`;
      
      const response = await api.post(endpoint, {
        htmlContent: cleanedHTML, // 🔧 Use cleaned HTML
        format: format,
        reportData: reportData,
        templateInfo: selectedTemplate ? {
          templateId: selectedTemplate._id,
          templateName: selectedTemplate.title,
          templateType: 'html'
        } : null,
        reportStatus: 'draft',
        reportType: 'draft-medical-report'
      });

      if (response.data.success) {
        const conversionMethod = response.data.data?.conversionMethod || 'standard';
        const methodText = conversionMethod === 'libreoffice' ? 'via LibreOffice' : '';
        
        toast.success(`Draft saved as ${format.toUpperCase()} ${methodText} successfully!`);
        console.log('✅ Draft converted and uploaded:', response.data);
        
        if (response.data.downloadUrl) {
          toast.info(
            <div>
              <p className="mb-2">Draft saved and ready for download!</p>
              <a 
                href={response.data.downloadUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-yellow-500 text-white px-3 py-1 rounded text-sm"
              >
                Download Draft {format.toUpperCase()}
              </a>
            </div>,
            { autoClose: 8000 }
          );
        }
        
      } else {
        throw new Error(response.data.message || `Failed to save draft as ${format}`);
      }

    } catch (error) {
      console.error(`❌ Error saving draft as ${format}:`, error);
      
      if (error.response?.data?.message) {
        toast.error(`Failed to save draft as ${format}: ${error.response.data.message}`);
      } else {
        toast.error(`Failed to save draft as ${format}. Please try again.`);
      }
    } finally {
      setSavingDraft(false);
    }
  };

  // Update the existing handleFinalizeReport function:
  const handleFinalizeReport = () => {
    if (!reportContent.trim()) {
      toast.error('Please enter report content');
      return;
    }

    // Show conversion options modal instead of immediate upload
    setShowConversionModal(true);
  };

  // Update the existing handleConvertAndUpload function:
  const handleConvertAndUpload = async (format) => {
    const confirmed = window.confirm(
      `Are you sure you want to finalize this report as ${format.toUpperCase()}? Once finalized, it cannot be edited.`
    );
    
    if (!confirmed) {
      return;
    }

    setConvertingAndUploading(true);
    setShowConversionModal(false);

    try {
      console.log(`🔄 Converting report to ${format} using OnlyOffice pipeline...`);
      
      // 🔧 CLEAN HTML before sending
      const cleanedHTML = cleanHTMLForPandoc(reportContent);
      
      // Use OnlyOffice-powered endpoint
      const endpoint = format.toLowerCase() === 'docx' 
        ? `/documents/study/${studyId}/convert-upload-onlyoffice`  // OnlyOffice for DOCX
        : `/documents/study/${studyId}/convert-and-upload`;        // Direct for PDF
    
      const response = await api.post(endpoint, {
        htmlContent: cleanedHTML, // 🔧 Use cleaned HTML
        format: format,
        reportData: reportData,
        templateInfo: selectedTemplate ? {
          templateId: selectedTemplate._id,
          templateName: selectedTemplate.title,
          templateType: 'html'
        } : null,
        reportStatus: 'finalized',
        reportType: 'final-medical-report'
      });

      if (response.data.success) {
        const conversionMethod = response.data.data?.conversionMethod || 'standard';
        const methodText = conversionMethod === 'libreoffice' ? 'via LibreOffice' : '';
        
        toast.success(`Report converted to ${format.toUpperCase()} ${methodText} and finalized successfully!`);
        console.log('✅ Report converted and uploaded:', response.data);
        
        // Show download options
        if (response.data.downloadUrl) {
          toast.info(
            <div>
              <p className="mb-2">Report finalized and ready for download!</p>
              <a 
                href={response.data.downloadUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
              >
                Download {format.toUpperCase()}
              </a>
            </div>,
            { autoClose: 10000 }
          );
        }
        
        setTimeout(() => {
          navigate('/admin/worklist');
        }, 3000);
        
      } else {
        throw new Error(response.data.message || `Failed to convert to ${format}`);
      }

    } catch (error) {
      console.error(`❌ Error converting to ${format}:`, error);
      
      if (error.response?.data?.message) {
        toast.error(`Failed to convert to ${format}: ${error.response.data.message}`);
      } else {
        toast.error(`Failed to convert report to ${format}. Please try again.`);
      }
    } finally {
      setConvertingAndUploading(false);
    }
  };


const processMultiPageContent = (htmlContent, patientData, studyData) => {
  // Create patient table template for headers
  const patientTableTemplate = `
    <table>
      <tr>
        <td><strong>Name:</strong></td>
        <td>${patientData?.fullName || patientData?.patientName || '[Patient Name]'}</td>
        <td><strong>Patient ID:</strong></td>
        <td>${patientData?.patientId || patientData?.patientID || '[Patient ID]'}</td>
      </tr>
      <tr>
        <td><strong>Accession No:</strong></td>
        <td>${studyData?.accessionNumber || 'N/A'}</td>
        <td><strong>Age/Gender:</strong></td>
        <td>${patientData?.age || 'N/A'} / ${patientData?.gender || 'F'}</td>
      </tr>
      <tr>
        <td><strong>Referred By:</strong></td>
        <td>N/A</td>
        <td><strong>Date:</strong></td>
        <td>${studyData?.studyDate ? new Date(studyData.studyDate).toLocaleDateString() : new Date().toLocaleDateString()}</td>
      </tr>
    </table>
  `;

  // Clean the HTML content first
  const cleanedContent = htmlContent.replace(/^\s+|\s+$/g, '');
  
  // Split content into paragraphs and sections for better control
  const contentParts = cleanedContent.split(/(?=<p[^>]*><strong><u>)|(?=<h[1-6])|(?=<div[^>]*class="section)/);
  
  let processedContent = '';
  let currentPageContent = '';
  let pageNumber = 1;
  
  // Approximate content limits (based on A4 page size)
  const MAX_CHARS_PER_PAGE = 2400; // Characters per page
  const MAX_ELEMENTS_PER_PAGE = 15; // Number of elements per page
  
  let currentCharCount = 0;
  let currentElementCount = 0;

  contentParts.forEach((part, index) => {
    if (!part.trim()) return;
    
    const partCharCount = part.replace(/<[^>]*>/g, '').length;
    const isNewSection = part.includes('<strong><u>') || part.includes('<h');
    
    // Check if we need a new page
    const shouldBreakPage = (
      currentCharCount > 0 && (
        currentCharCount + partCharCount > MAX_CHARS_PER_PAGE ||
        currentElementCount >= MAX_ELEMENTS_PER_PAGE ||
        (isNewSection && currentCharCount > 1500) // Break on new sections if page is getting full
      )
    );

    if (shouldBreakPage) {
      // Close current page
      processedContent += `
        <div class="report-page" data-page="${pageNumber}">
          ${patientTableTemplate}
          <div class="content-flow-area">
            ${currentPageContent}
          </div>
        </div>
      `;
      
      // Start new page
      pageNumber++;
      currentPageContent = part;
      currentCharCount = partCharCount;
      currentElementCount = 1;
    } else {
      currentPageContent += part;
      currentCharCount += partCharCount;
      currentElementCount++;
    }
  });

  // Add final page if there's content
  if (currentPageContent.trim()) {
    processedContent += `
      <div class="report-page" data-page="${pageNumber}">
        ${patientTableTemplate}
        <div class="content-flow-area">
          ${currentPageContent}
        </div>
      </div>
    `;
  }

  console.log(`✅ Content split into ${pageNumber} pages`);
  return processedContent;
};

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Reporting System...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Online Reporting System</h1>
              <p className="text-sm text-gray-600">
                {patientData?.fullName} • {patientData?.patientId} • {studyData?.modality}
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => navigate('/admin/worklist')}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
                <span>Back to Worklist</span>
              </button>
              
              {/* 🔧 UPDATED: Save Draft button with format selection */}
              <button
                onClick={handleSaveDraft}
                disabled={savingDraft || !reportContent.trim()}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={!reportContent.trim() ? 'Enter report content to save draft' : 'Choose format and save as draft'}
              >
                {savingDraft ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>Save Draft</span>
                  </>
                )}
              </button>
              
              {/* 🔧 UPDATED: Finalize Report button with format selection */}
              <button
                onClick={handleFinalizeReport}
                disabled={convertingAndUploading || !reportContent.trim()}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={!reportContent.trim() ? 'Enter report content to finalize' : 'Choose format and finalize report'}
              >
                {convertingAndUploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>Finalizing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Finalize Report</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-screen-minus-header">
        {/* Left Sidebar - Templates */}
        <div className="w-80 bg-white border-r overflow-y-auto">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">HTML Report Templates</h2>
            <p className="text-sm text-gray-600">Select a template to get started</p>
          </div>
          <TemplateTreeView
            templates={templates}
            selectedTemplate={selectedTemplate}
            onTemplateSelect={handleTemplateSelect}
            studyModality={studyData?.modality}
          />
        </div>

        {/* Center - Report Editor */}
        <div className="flex-1 flex flex-col">
          <ReportEditor
            content={reportContent}
            onChange={setReportContent}
            template={selectedTemplate}
            reportData={reportData}
            onReportDataChange={setReportData}
          />
        </div>

        {/* Right Sidebar - Patient Info */}
        <div className="w-80 bg-white border-l overflow-y-auto">
          <PatientInfoPanel
            patientData={patientData}
            studyData={studyData}
            reportData={reportData}
          />
        </div>
      </div>

      {/* 🔧 NEW: Draft Format Selection Modal */}
      {showDraftModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Save Draft - Choose Format
              </h3>
              <p className="text-gray-600 mb-6">
                Select the format for your draft report:
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={() => handleDraftConvertAndUpload('pdf')}
                  disabled={savingDraft}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-3 rounded-lg flex items-center justify-center space-x-2 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"/>
                  </svg>
                  <span>Save Draft as PDF</span>
                </button>
                
                <button
                  onClick={() => handleDraftConvertAndUpload('docx')}
                  disabled={savingDraft}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white px-4 py-3 rounded-lg flex items-center justify-center space-x-2 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"/>
                  </svg>
                  <span>Save Draft as Word Document</span>
                </button>
              </div>
              
              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={() => setShowDraftModal(false)}
                  disabled={savingDraft}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
            
            {savingDraft && (
              <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center rounded-lg">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-yellow-500 border-t-transparent mx-auto mb-2"></div>
                  <p className="text-gray-600">Saving draft...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🔧 UPDATED: Finalize Format Selection Modal */}
      {showConversionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Finalize Report - Choose Format
              </h3>
              <p className="text-gray-600 mb-6">
                Select the format for your finalized report:
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={() => handleConvertAndUpload('pdf')}
                  disabled={convertingAndUploading}
                  className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg flex items-center justify-center space-x-2 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"/>
                  </svg>
                  <span>Finalize as PDF</span>
                </button>
                
                <button
                  onClick={() => handleConvertAndUpload('docx')}
                  disabled={convertingAndUploading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg flex items-center justify-center space-x-2 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"/>
                  </svg>
                  <span>Finalize as Word Document</span>
                </button>
              </div>
              
              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={() => setShowConversionModal(false)}
                  disabled={convertingAndUploading}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
            
            {convertingAndUploading && (
              <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center rounded-lg">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto mb-2"></div>
                  <p className="text-gray-600">Converting and uploading...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OnlineReportingSystem;

// 🔧 UPDATED: Remove all class references and target table elements directly
const documentStyles = `
  /* Base editor styles */
  .report-editor {
    font-family: Arial, sans-serif;
    line-height: 1.4;
    color: #000;
    font-size: 11pt;
    background: white;
    outline: none;
    box-sizing: border-box;
  }
  
  /* Preview container with proper centering */
  .preview-container {
    background: #f5f5f5;
    padding: 20px;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }

  /* Multi-page preview with consistent spacing */
  .multi-page-preview {
    width: 21cm;
    max-width: 21cm;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  /* Page styling with better space management */
  .report-page, .report-page-preview {
    background: white;
    width: 21cm;
    min-height: 29.7cm;
    padding: 0;
    margin: 0;
    box-shadow: 0 6px 20px rgba(0,0,0,0.1);
    box-sizing: border-box;
    position: relative;
    page-break-after: always;
    display: block;
    font-family: Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.4;
    color: #000;
    border: 1px solid #ccc;
  }

  .report-page:last-child, .report-page-preview:last-child {
    page-break-after: auto;
  }

  /* 🔧 FIXED: Target ALL tables directly without classes */
  .report-page table, 
  .report-page-preview table,
  .report-editor table {
    width: calc(100% - 2.5cm);
    border-collapse: collapse;
    margin: 3rem 1.25cm 1rem 1.25cm;
    font-size: 10pt;
  }

  .report-page table td, 
  .report-page-preview table td,
  .report-editor table td {
    border: 1px solid #000;
    padding: 8px 10px;
    vertical-align: top;
  }

  .report-page table td:nth-child(1),
  .report-page table td:nth-child(3),
  .report-page-preview table td:nth-child(1),
  .report-page-preview table td:nth-child(3),
  .report-editor table td:nth-child(1),
  .report-editor table td:nth-child(3) {
    background-color: #b2dfdb;
    font-weight: bold;
    width: 22%;
  }

  .report-page table td:nth-child(2),
  .report-page table td:nth-child(4),
  .report-page-preview table td:nth-child(2),
  .report-page-preview table td:nth-child(4),
  .report-editor table td:nth-child(2),
  .report-editor table td:nth-child(4) {
    background-color: #ffffff;
    width: 28%;
  }

  /* Content area with maximum space utilization */
  .content-flow-area {
    margin: 0 1.25cm;
    padding: 0;
    max-height: none;
    overflow: visible;
  }

  /* Signature section with proper positioning */
  .signature-section {
    margin: 1.5rem 1.25cm 1.25cm 1.25cm;
    text-align: left;
    font-size: 10pt;
    line-height: 1.3;
    border-top: 1px solid #bbb;
    padding-top: 1rem;
    page-break-inside: avoid;
  }

  .doctor-name {
    font-weight: bold;
    margin-bottom: 3px;
    font-size: 12pt;
  }

  .doctor-specialization,
  .doctor-license {
    margin: 3px 0;
    font-size: 11pt;
  }

  .signature-image {
    width: 90px;
    height: 45px;
    margin: 8px 0;
    object-fit: contain;
  }

  .signature-placeholder {
    height: 45px;
    width: 150px;
    margin: 8px 0;
    font-size: 9pt;
    color: #999;
    border: 1px dashed #ccc;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fafafa;
  }

  .disclaimer {
    font-style: italic;
    color: #666;
    font-size: 9pt;
    margin-top: 10px;
    line-height: 1.2;
  }

  /* Template placeholder */
  .template-placeholder {
    text-align: center;
    padding: 30px 20px;
    color: #666;
    font-style: italic;
    border: 2px dashed #ddd;
    margin: 15px 0;
    background: #f9f9f9;
    border-radius: 4px;
  }

  /* Text styles with better spacing */
  p { 
    margin: 6px 0; 
    font-size: 11pt;
    line-height: 1.5;
  }
  
  h1, h2, h3 { 
    font-weight: bold; 
    text-decoration: underline; 
    margin: 15px 0 8px 0; 
    page-break-after: avoid;
  }
  h1 { font-size: 14pt; line-height: 1.3; }
  h2 { font-size: 12pt; line-height: 1.3; }
  h3 { font-size: 11pt; line-height: 1.3; }
  
  ul, ol { 
    padding-left: 22px; 
    margin: 8px 0; 
  }
  li { 
    margin: 3px 0; 
    font-size: 11pt;
    line-height: 1.4;
  }
  strong { font-weight: bold; }
  u { text-decoration: underline; }

  /* Page break indicators */
  div[style*="page-break-after: always"] {
    height: 3px;
    margin: 25px 1.25cm;
    border-top: 2px dashed #0066cc;
    background: linear-gradient(90deg, transparent 0%, #0066cc 50%, transparent 100%);
    position: relative;
  }

  div[style*="page-break-after: always"]:after {
    content: "PAGE BREAK";
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    background: #0066cc;
    color: white;
    font-size: 9pt;
    padding: 3px 8px;
    border-radius: 3px;
    font-weight: bold;
  }

  /* Page numbering and labels */
  .report-page::after, .report-page-preview::after {
    content: "Page " attr(data-page);
    position: absolute;
    bottom: 0.75cm;
    right: 1.25cm;
    font-size: 10pt;
    color: #555;
    font-weight: normal;
  }

  .report-page::before, .report-page-preview::before {
    content: "Page " attr(data-page);
    position: absolute;
    top: -30px;
    left: 0;
    font-size: 12px;
    color: #444;
    background: #e8f4fd;
    padding: 4px 10px;
    border-radius: 4px;
    font-weight: bold;
    border: 1px solid #1976d2;
  }

  /* Editor mode alignment */
  .report-editor.bg-white {
    margin: 0 auto;
  }

  @media print {
    .preview-container { 
      background: white; 
      padding: 0; 
    }
    
    .multi-page-preview {
      gap: 0;
    }
    
    .report-page, .report-page-preview { 
      margin: 0; 
      box-shadow: none; 
      page-break-after: always;
      border: none;
    }
    
    .report-page:last-child, .report-page-preview:last-child { 
      page-break-after: auto; 
    }
    
    .report-page::before, .report-page-preview::before {
      display: none;
    }
    
    div[style*="page-break-after: always"] {
      page-break-after: always;
      border: none;
      height: 0;
      margin: 0;
      background: none;
    }
    
    div[style*="page-break-after: always"]:after {
      display: none;
    }
  }
`;



// 🔧 UPDATED: Use ultra-wide table in extractContentForPandoc
const extractContentForPandoc = (htmlContent, patientData, studyData) => {
  if (!htmlContent) return '';
  
  console.log('🔧 Extracting content for Pandoc conversion with ultra-wide table...');
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  
  // Get the main content
  let contentHTML = doc.body ? doc.body.innerHTML : doc.documentElement.innerHTML;
  
  // Clean up the content
  contentHTML = contentHTML
    .replace(/<div[^>]*>/g, '')
    .replace(/<\/div>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // 🔧 ENHANCED: Use ultra-wide table
  const ultraWideTable = createUltraWideTableForPandoc(patientData, studyData);
  
  const finalContent = `
${ultraWideTable}

${contentHTML}

<p><strong>Dr. ${patientData?.doctorName || 'Gamma Ray'}</strong></p>
<p>${patientData?.doctorSpecialization || 'Oncology'}</p>
<p>Reg no. ${patientData?.doctorLicenseNumber || 'ONC777G'}</p>
<p><em>Disclaimer: This is an online interpretation...</em></p>
`;

  console.log('✅ Content extracted with ultra-wide table for full width');
  return finalContent;
};




// ...existing code...

// 🔧 ULTRA-COMPACT: Create minimal height table with zero spacing
const createUltraWideTableForPandoc = (patientData, studyData) => {
  // Compact spacing - enough for width but not excessive height
  const compactSpacing = '&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;&nbsp;&ensp;&emsp;';
  
  return `
<table style="table-layout: fixed; width: 100%; border-collapse: collapse; margin: 0; padding: 0; line-height: 0.8;">
<tr style="height: 12px; margin: 0; padding: 0; line-height: 0.8;">
<td style="width: 18%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; overflow: hidden; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Name:</strong>${compactSpacing.substring(0, 80)}</td>
<td style="width: 32%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; overflow: hidden; line-height: 0.8; vertical-align: top; font-size: 9pt;">&nbsp;&nbsp;&nbsp;${patientData?.fullName || patientData?.patientName || '[Patient Name]'}${compactSpacing.substring(0, 150)}</td>
<td style="width: 18%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; overflow: hidden; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Patient&nbsp;ID:</strong>${compactSpacing.substring(0, 70)}</td>
<td style="width: 32%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; overflow: hidden; line-height: 0.8; vertical-align: top; font-size: 9pt;">&nbsp;&nbsp;&nbsp;${patientData?.patientId || patientData?.patientID || '[Patient ID]'}${compactSpacing.substring(0, 150)}</td>
</tr>
<tr style="height: 12px; margin: 0; padding: 0; line-height: 0.8;">
<td style="width: 18%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; overflow: hidden; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Accession&nbsp;No:</strong>${compactSpacing.substring(0, 60)}</td>
<td style="width: 32%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; overflow: hidden; line-height: 0.8; vertical-align: top; font-size: 9pt;">&nbsp;&nbsp;&nbsp;${studyData?.accessionNumber || 'N/A'}${compactSpacing.substring(0, 180)}</td>
<td style="width: 18%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; overflow: hidden; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Age/Gender:</strong>${compactSpacing.substring(0, 70)}</td>
<td style="width: 32%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; overflow: hidden; line-height: 0.8; vertical-align: top; font-size: 9pt;">&nbsp;&nbsp;&nbsp;${patientData?.age || 'N/A'} / ${patientData?.gender || 'F'}${compactSpacing.substring(0, 150)}</td>
</tr>
<tr style="height: 12px; margin: 0; padding: 0; line-height: 0.8;">
<td style="width: 18%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; overflow: hidden; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Referred&nbsp;By:</strong>${compactSpacing.substring(0, 65)}</td>
<td style="width: 32%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; overflow: hidden; line-height: 0.8; vertical-align: top; font-size: 9pt;">&nbsp;&nbsp;&nbsp;N/A${compactSpacing.substring(0, 200)}</td>
<td style="width: 18%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; overflow: hidden; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Date:</strong>${compactSpacing.substring(0, 100)}</td>
<td style="width: 32%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; overflow: hidden; line-height: 0.8; vertical-align: top; font-size: 9pt;">&nbsp;&nbsp;&nbsp;${studyData?.studyDate ? new Date(studyData.studyDate).toLocaleDateString() : new Date().toLocaleDateString()}${compactSpacing.substring(0, 120)}</td>
</tr>
</table>
`;
};

// 🔧 ULTRA-COMPACT: Minimal table with ultra-small height
const createMinimalTableForPandoc = (patientData, studyData) => {
  return `
<table style="table-layout: fixed; width: 100%; border-collapse: collapse; margin: 0; padding: 0; line-height: 0.8;">
<tr style="height: 12px; margin: 0; padding: 0; line-height: 0.8;">
<td style="width: 20%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Name:</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
<td style="width: 30%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;">&nbsp;&nbsp;&nbsp;${patientData?.fullName || patientData?.patientName || '[Patient Name]'}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
<td style="width: 20%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Patient&nbsp;ID:</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
<td style="width: 30%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;">&nbsp;&nbsp;&nbsp;${patientData?.patientId || patientData?.patientID || '[Patient ID]'}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
</tr>
<tr style="height: 12px; margin: 0; padding: 0; line-height: 0.8;">
<td style="width: 20%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Accession&nbsp;No:</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
<td style="width: 30%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;">&nbsp;&nbsp;&nbsp;${studyData?.accessionNumber || 'N/A'}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
<td style="width: 20%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Age/Gender:</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
<td style="width: 30%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;">&nbsp;&nbsp;&nbsp;${patientData?.age || 'N/A'} / ${patientData?.gender || 'F'}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
</tr>
<tr style="height: 12px; margin: 0; padding: 0; line-height: 0.8;">
<td style="width: 20%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Referred&nbsp;By:</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
<td style="width: 30%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;">&nbsp;&nbsp;&nbsp;N/A&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
<td style="width: 20%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Date:</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
<td style="width: 30%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;">&nbsp;&nbsp;&nbsp;${studyData?.studyDate ? new Date(studyData.studyDate).toLocaleDateString() : new Date().toLocaleDateString()}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
</tr>
</table>
`;
};

// 🔧 ULTRA-COMPACT: Enhanced cleaning function with minimal height
const cleanHTMLForPandoc = (htmlContent) => {
  if (!htmlContent) return '';
  
  console.log('🧹 Starting HTML cleaning for Pandoc with ultra-compact styling...');
  
  // Create a temporary DOM parser
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  
  // Remove all class and style attributes from ALL elements except tables
  const allElements = doc.querySelectorAll('*:not(table):not(tr):not(td)');
  allElements.forEach(element => {
    element.removeAttribute('class');
    element.removeAttribute('style');
    element.removeAttribute('data-page');
  });
  
  // Specifically handle tables with ultra-compact styling
  const tables = doc.querySelectorAll('table');
  console.log(`🔍 Found ${tables.length} tables to clean with ultra-compact styling`);
  
  tables.forEach((table, tableIndex) => {
    console.log(`🧹 Cleaning table ${tableIndex + 1} with ultra-compact height`);
    
    // Set ultra-compact table styling
    table.removeAttribute('class');
    table.setAttribute('style', 'table-layout: fixed; width: 100%; border-collapse: collapse; margin: 0; padding: 0; line-height: 0.8;');
    
    // Process each row
    const rows = table.querySelectorAll('tr');
    rows.forEach((row, rowIndex) => {
      // Set ultra-compact row height
      row.removeAttribute('class');
      row.setAttribute('style', 'height: 12px; margin: 0; padding: 0; line-height: 0.8;');
      
      const cells = row.querySelectorAll('td, th');
      cells.forEach((cell, cellIndex) => {
        // Remove old attributes
        cell.removeAttribute('class');
        cell.removeAttribute('width');
        cell.removeAttribute('height');
        cell.removeAttribute('colspan');
        cell.removeAttribute('rowspan');
        
        // Set ultra-compact cell styling
        const cellWidth = cellIndex === 0 || cellIndex === 2 ? '20%' : '30%';
        cell.setAttribute('style', `width: ${cellWidth}; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; overflow: hidden; line-height: 0.8; vertical-align: top; font-size: 9pt;`);
        
        // Clean cell content but preserve text
        const cellText = cell.textContent.trim();
        
        // Add compact spacing with single-line enforcement
        if (cellIndex === 0 || cellIndex === 2) {
          // First and third columns (headers) - use non-breaking space for single line
          const singleLineText = cellText.replace(/\s+/g, '&nbsp;');
          cell.innerHTML = singleLineText + '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
        } else if (cellIndex === 1) {
          // Second column (data) - compact spacing
          cell.innerHTML = '&nbsp;&nbsp;&nbsp;' + cellText + '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
        } else if (cellIndex === 3) {
          // Fourth column (data) - compact spacing
          cell.innerHTML = '&nbsp;&nbsp;&nbsp;' + cellText + '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
        } else {
          cell.innerHTML = cellText;
        }
      });
    });
  });
  
  // Remove div wrappers that might interfere
  const divs = doc.querySelectorAll('div');
  divs.forEach(div => {
    if (div.classList.contains('report-page') || 
        div.classList.contains('content-flow-area') ||
        div.classList.contains('report-document')) {
      // Move children out and remove wrapper
      while (div.firstChild) {
        div.parentNode.insertBefore(div.firstChild, div);
      }
      div.remove();
    }
  });
  
  // Get cleaned HTML
  const cleanedHTML = doc.body ? doc.body.innerHTML : doc.documentElement.innerHTML;
  
  console.log('🧹 HTML cleaned for Pandoc with ultra-compact styling');
  return cleanedHTML;
};

// 🔧 ULTRA-COMPACT: processMultiPageContent with minimal height table
const processMultiPageContent = (htmlContent, patientData, studyData) => {
  // Create ultra-compact patient table template for headers
  const patientTableTemplate = `
    <table style="table-layout: fixed; width: 100%; border-collapse: collapse; margin: 0; padding: 0; line-height: 0.8;">
      <tr style="height: 12px; margin: 0; padding: 0; line-height: 0.8;">
        <td style="width: 20%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Name:</strong></td>
        <td style="width: 30%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;">${patientData?.fullName || patientData?.patientName || '[Patient Name]'}</td>
        <td style="width: 20%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Patient&nbsp;ID:</strong></td>
        <td style="width: 30%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;">${patientData?.patientId || patientData?.patientID || '[Patient ID]'}</td>
      </tr>
      <tr style="height: 12px; margin: 0; padding: 0; line-height: 0.8;">
        <td style="width: 20%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Accession&nbsp;No:</strong></td>
        <td style="width: 30%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;">${studyData?.accessionNumber || 'N/A'}</td>
        <td style="width: 20%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Age/Gender:</strong></td>
        <td style="width: 30%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;">${patientData?.age || 'N/A'} / ${patientData?.gender || 'F'}</td>
      </tr>
      <tr style="height: 12px; margin: 0; padding: 0; line-height: 0.8;">
        <td style="width: 20%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Referred&nbsp;By:</strong></td>
        <td style="width: 30%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;">N/A</td>
        <td style="width: 20%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;"><strong>Date:</strong></td>
        <td style="width: 30%; padding: 1px 2px 0px 2px; margin: 0; border: 1px solid black; white-space: nowrap; line-height: 0.8; vertical-align: top; font-size: 9pt;">${studyData?.studyDate ? new Date(studyData.studyDate).toLocaleDateString() : new Date().toLocaleDateString()}</td>
      </tr>
    </table>
  `;

  // Rest of the function remains the same...
  const cleanedContent = htmlContent.replace(/^\s+|\s+$/g, '');
  const contentParts = cleanedContent.split(/(?=<p[^>]*><strong><u>)|(?=<h[1-6])|(?=<div[^>]*class="section)/);
  
  let processedContent = '';
  let currentPageContent = '';
  let pageNumber = 1;
  
  const MAX_CHARS_PER_PAGE = 2500;
  const MAX_ELEMENTS_PER_PAGE = 15;
  
  let currentCharCount = 0;
  let currentElementCount = 0;

  contentParts.forEach((part, index) => {
    if (!part.trim()) return;
    
    const partCharCount = part.replace(/<[^>]*>/g, '').length;
    const isNewSection = part.includes('<strong><u>') || part.includes('<h');
    
    const shouldBreakPage = (
      currentCharCount > 0 && (
        currentCharCount + partCharCount > MAX_CHARS_PER_PAGE ||
        currentElementCount >= MAX_ELEMENTS_PER_PAGE ||
        (isNewSection && currentCharCount > 1500)
      )
    );

    if (shouldBreakPage) {
      processedContent += `
        <div class="report-page" data-page="${pageNumber}">
          ${patientTableTemplate}
          <div class="content-flow-area">
            ${currentPageContent}
          </div>
        </div>
      `;
      
      pageNumber++;
      currentPageContent = part;
      currentCharCount = partCharCount;
      currentElementCount = 1;
    } else {
      currentPageContent += part;
      currentCharCount += partCharCount;
      currentElementCount++;
    }
  });

  if (currentPageContent.trim()) {
    processedContent += `
      <div class="report-page" data-page="${pageNumber}">
        ${patientTableTemplate}
        <div class="content-flow-area">
          ${currentPageContent}
        </div>
      </div>
    `;
  }

  console.log(`✅ Content split into ${pageNumber} pages with ultra-compact tables`);
  return processedContent;
};

// ...existing code...