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

        <!-- Normal signature section -->
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
    // ... existing code ...

    try {
      console.log(`🔄 Converting draft report to ${format} using enhanced table formatting...`);
      
      // 🔧 ENHANCED: Apply multiple table fixes
      let cleanedHTML = fixTableStructureForPandoc(reportContent);
      cleanedHTML = cleanHTMLForPandoc(cleanedHTML);
      
      const endpoint = format.toLowerCase() === 'docx' 
        ? `/documents/study/${studyId}/convert-and-upload-libreoffice`
        : `/documents/study/${studyId}/convert-and-upload`;
      
      const response = await api.post(endpoint, {
        htmlContent: cleanedHTML,
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
      console.log(`🔄 Converting report to ${format} using enhanced table formatting...`);
      
      // 🔧 ENHANCED: Apply multiple table fixes
      let cleanedHTML = fixTableStructureForPandoc(reportContent);
      cleanedHTML = cleanHTMLForPandoc(cleanedHTML);
      
      const endpoint = format.toLowerCase() === 'docx' 
        ? `/documents/study/${studyId}/convert-upload-onlyoffice`
        : `/documents/study/${studyId}/convert-and-upload`;
    
      const response = await api.post(endpoint, {
        htmlContent: cleanedHTML,
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
  // 🔧 ENHANCED: Create patient table template with proper inline styles for Pandoc
  const patientTableTemplate = `
    <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 10pt; margin-bottom: 20px;">
      <tr>
        <td style="width: 20%; font-weight: bold; padding: 8px; border: 1px solid black; background-color: #e7f5fe;"><strong>Name:</strong></td>
        <td style="width: 30%; padding: 8px 12px; border: 1px solid black;">&nbsp;&nbsp;${patientData?.fullName || patientData?.patientName || '[Patient Name]'}</td>
        <td style="width: 20%; font-weight: bold; padding: 8px; border: 1px solid black; background-color: #e7f5fe;"><strong>Patient ID:</strong></td>
        <td style="width: 30%; padding: 8px 12px; border: 1px solid black;">&nbsp;&nbsp;${patientData?.patientId || patientData?.patientID || '[Patient ID]'}</td>
      </tr>
      <tr>
        <td style="width: 20%; font-weight: bold; padding: 8px; border: 1px solid black; background-color: #e7f5fe;"><strong>Accession No:</strong></td>
        <td style="width: 30%; padding: 8px 12px; border: 1px solid black;">&nbsp;&nbsp;${studyData?.accessionNumber || 'N/A'}</td>
        <td style="width: 20%; font-weight: bold; padding: 8px; border: 1px solid black; background-color: #e7f5fe;"><strong>Age/Gender:</strong></td>
        <td style="width: 30%; padding: 8px 12px; border: 1px solid black;">&nbsp;&nbsp;${patientData?.age || 'N/A'} / ${patientData?.gender || 'F'}</td>
      </tr>
      <tr>
        <td style="width: 20%; font-weight: bold; padding: 8px; border: 1px solid black; background-color: #e7f5fe;"><strong>Referred By:</strong></td>
        <td style="width: 30%; padding: 8px 12px; border: 1px solid black;">&nbsp;&nbsp;N/A</td>
        <td style="width: 20%; font-weight: bold; padding: 8px; border: 1px solid black; background-color: #e7f5fe;"><strong>Date:</strong></td>
        <td style="width: 30%; padding: 8px 12px; border: 1px solid black;">&nbsp;&nbsp;${studyData?.studyDate ? new Date(studyData.studyDate).toLocaleDateString() : new Date().toLocaleDateString()}</td>
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
  const MAX_CHARS_PER_PAGE = 2500; // Characters per page
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

  console.log(`✅ Content split into ${pageNumber} pages with fixed table formatting`);
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

// 🔧 ENHANCED: Clean HTML function with table formatting fixes
const cleanHTMLForPandoc = (htmlContent) => {
  if (!htmlContent) return '';
  
  // Create a temporary DOM parser
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  
  // Remove all class attributes from table elements
  const tables = doc.querySelectorAll('table');
  tables.forEach(table => {
    table.removeAttribute('class');
    table.removeAttribute('style');
    
    // Fix cell padding and alignment
    const cells = table.querySelectorAll('td');
    cells.forEach((cell, index) => {
      const cellText = cell.textContent.trim();
      
      // Remove any existing classes and styles
      cell.removeAttribute('class');
      cell.removeAttribute('style');
      
      // Get the column index (0-based)
      const columnIndex = Array.from(cell.parentNode.children).indexOf(cell);
      
      // Add padding to ensure proper spacing
      if (columnIndex === 1 || columnIndex === 3) {
        // Second and fourth columns - add leading space for better alignment
        if (cellText && !cell.innerHTML.startsWith('&nbsp;')) {
          cell.innerHTML = '&nbsp;&nbsp;' + cell.innerHTML;
        }
      }
      
      // Add trailing space to first and third columns to ensure separation
      if (columnIndex === 0 || columnIndex === 2) {
        if (cellText && !cell.innerHTML.endsWith('&nbsp;')) {
          cell.innerHTML = cell.innerHTML + '&nbsp;';
        }
      }
    });
  });
  
  console.log('🧹 HTML cleaned for Pandoc - fixed table alignment');
  return doc.documentElement.innerHTML;
};

// 🔧 NEW: Browser-compatible table structure fix
const fixTableStructureForPandoc = (htmlContent) => {
  if (!htmlContent) return '';
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  
  const tables = doc.querySelectorAll('table');
  tables.forEach(table => {
    // Remove all styling
    table.removeAttribute('class');
    table.removeAttribute('style');
    
    // Process each row
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      
      if (cells.length === 4) {
        // Create new cells with proper styling
        cells.forEach((cell, index) => {
          const cellContent = cell.innerHTML;
          
          // Remove existing attributes
          cell.removeAttribute('class');
          cell.removeAttribute('style');
          
          // Apply new styles based on column position
          if (index === 0 || index === 2) {
            // First and third columns - headers
            cell.setAttribute('style', 'width: 20%; font-weight: bold; padding: 8px; border: 1px solid black; background-color: #e7f5fe;');
          } else {
            // Second and fourth columns - data
            cell.setAttribute('style', 'width: 30%; padding: 8px 12px; border: 1px solid black;');
          }
          
          cell.innerHTML = cellContent;
        });
      }
    });
    
    // Add table-wide styling
    table.setAttribute('style', 'width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 10pt;');
  });
  
  return doc.documentElement.innerHTML;
};