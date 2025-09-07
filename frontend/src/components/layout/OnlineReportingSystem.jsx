import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import TemplateTreeView from './TemplateTreeView';
import ReportEditor from './ReportEditor';
import PatientInfoPanel from './PatientInfoPanel';
import sessionManager from '../../services/sessionManager';

const OnlineReportingSystem = () => {
  const { studyId } = useParams();
  const navigate = useNavigate();
  
  const [studyData, setStudyData] = useState(null);
  const [patientData, setPatientData] = useState(null);
  const [templates, setTemplates] = useState({});
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [reportData, setReportData] = useState({});
  const [reportContent, setReportContent] = useState(''); // The content for the rich text editor
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (studyId) {
      initializeReportingSystem();
    }
  }, [studyId]);

  const initializeReportingSystem = async () => {
    setLoading(true);
    try {
      const currentUser = sessionManager.getCurrentUser();
      if (!currentUser) {
        toast.error('Authentication required.');
        navigate('/login');
        return;
      }
      
      // Fetch all necessary data in parallel
      const [studyResponse, templatesResponse] = await Promise.all([
        api.get(`/labEdit/patients/${studyId}`),
        api.get('/html-templates/reporting')
      ]);

      if (studyResponse.data.success) {
        const data = studyResponse.data.data;
        setStudyData(data.currentStudy || {});
        setPatientData(data.patientInfo || {});
        setReportData({ // Pre-fill data for potential use in the UI
            referringPhysician: data.referringPhysician?.name || 'N/A',
        });
      } else {
        toast.error("Failed to load study data.");
      }
      
      if (templatesResponse.data.success) {
        setTemplates(templatesResponse.data.data.templates);
      }
      
      // Start with a blank editor, prompting user to select a template
      setReportContent(''); 

    } catch (error) {
      console.error('❌ [Reporting] API Error:', error);
      toast.error('Failed to load reporting system');
      if (error.response?.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  // SIMPLIFIED: Just loads the raw HTML from the selected template into the editor
  const handleTemplateSelect = async (templateId) => {
    try {
      const response = await api.get(`/html-templates/${templateId}`);
      if (response.data.success) {
        const template = response.data.data;
        setSelectedTemplate(template);
        setReportContent(template.htmlContent); // Directly set the editor content
        toast.success(`Template "${template.title}" loaded.`);
      }
    } catch (error) {
      console.error('❌ Error loading HTML template:', error);
      toast.error('Failed to load template');
    }
  };

  // OPTIONAL: A simplified function to save the raw HTML as a draft
  const handleSaveDraft = async () => {
    if (!reportContent.trim()) {
      toast.error('Cannot save an empty draft.');
      return;
    }
    setSaving(true);
    try {
      // This would call a simple backend endpoint to save the HTML content
      await api.post(`/study/${studyId}/save-draft`, { htmlContent: reportContent });
      toast.success('Draft saved successfully!');
    } catch (error) {
      toast.error('Failed to save draft.');
    } finally {
      setSaving(false);
    }
  };

  // NEW: The primary function to generate the .docx file
  const handleFinalizeWithDocxService = async () => {
    if (!reportContent.trim()) {
      toast.error('Please enter report content to finalize.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to finalize this report? Once finalized, it cannot be edited.`
    );
    if (!confirmed) return;

    setFinalizing(true);
    
    try {
      const currentUser = sessionManager.getCurrentUser();
      
      // 1. Define the template name (e.g., based on the doctor's email)
      // const templateName = currentUser.email + '.docx';
      const templateName = "MyReport.docx";

      // 2. Prepare the placeholders object for our C# service
      const placeholders = {
        '--name--': patientData?.fullName || '',
        '--patientid--': patientData?.patientId || '',
        '--accessionno--': studyData?.accessionNumber || '',
        '--agegender--': `${patientData?.age || ''} / ${patientData?.gender || ''}`,
        '--referredby--': reportData?.referringPhysician || '',
        '--reporteddate--': studyData?.studyDate ? new Date(studyData.studyDate).toLocaleDateString() : new Date().toLocaleDateString(),
        '--Content--': reportContent // The main content from the rich text editor
      };

      // 3. Call your Node.js endpoint which will proxy to the C# service
      const response = await api.post(`/documents/study/${studyId}/generate-report`, {
        templateName,
        placeholders
      });

      if (response.data.success) {
        toast.success('Report finalized and saved successfully!');
        if (response.data.data?.downloadUrl) {
          window.open(response.data.data.downloadUrl, '_blank');
        }
        setTimeout(() => navigate('/admin/worklist'), 3000);
      } else {
        throw new Error(response.data.message || 'Failed to finalize report');
      }

    } catch (error) {
      console.error('❌ Error finalizing report with DOCX service:', error);
      toast.error(error.message || 'An unexpected error occurred during finalization.');
    } finally {
      setFinalizing(false);
    }
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
              <button onClick={() => navigate('/admin/worklist')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg">
                Back to Worklist
              </button>
              
              <button onClick={handleSaveDraft} disabled={saving || !reportContent.trim()} className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              
              <button onClick={handleFinalizeWithDocxService} disabled={finalizing || !reportContent.trim()} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg disabled:opacity-50">
                {finalizing ? 'Finalizing...' : 'Finalize Report'}
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
            <h2 className="font-semibold text-gray-900">Report Templates</h2>
          </div>
          <TemplateTreeView
            templates={templates}
            onTemplateSelect={handleTemplateSelect}
            studyModality={studyData?.modality}
          />
        </div>

        {/* Center - Report Editor */}
        <div className="flex-1 flex flex-col">
          <ReportEditor
            content={reportContent}
            onChange={setReportContent}
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
    </div>
  );
};

export default OnlineReportingSystem;