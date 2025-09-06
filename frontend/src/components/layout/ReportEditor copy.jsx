import React from 'react';
import {useState, useRef, useEffect, useCallback} from 'react'

const ReportEditor = ({ content, onChange }) => {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [paginatedContent, setPaginatedContent] = useState('');
  const contentEditableRef = useRef(null);

  // When content prop changes, update the editor's view
  useEffect(() => {
    if (contentEditableRef.current && content !== contentEditableRef.current.innerHTML) {
      contentEditableRef.current.innerHTML = content || '';
    }
  }, [content]);

  // 🔧 NEW: Process content for multi-page preview
  const processContentForPreview = useCallback((htmlContent) => {
    if (!htmlContent) return '';

    // Check if content already has multi-page structure
    if (htmlContent.includes('report-page')) {
      // Content already has pages - just style them properly
      return htmlContent.replace(
        /(<div[^>]*class="[^"]*report-page[^"]*"[^>]*>)/g, 
        '$1'
      );
    }

    // If no multi-page structure, return as single page
    return `
      <div class="report-page-preview" data-page="1">
        ${htmlContent}
      </div>
    `;
  }, []);

  // Update paginated content when content or preview mode changes
  useEffect(() => {
    if (isPreviewMode && content) {
      const processed = processContentForPreview(content);
      setPaginatedContent(processed);
    }
  }, [content, isPreviewMode, processContentForPreview]);

  const handleContentChange = (e) => {
    onChange(e.target.innerHTML);
  };
  
  // Wrapper for simple browser commands
  const applyCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    contentEditableRef.current?.focus();
  };

  // Applies styles like font size and color
  const applyStyle = (style, value) => {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(style, false, value);
    document.execCommand('styleWithCSS', false, false);
    contentEditableRef.current?.focus();
  };

  // Count pages from content
  const getPageCount = () => {
    if (!content) return 0;
    const matches = content.match(/data-page="/g);
    return matches ? matches.length : 1;
  };

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* Enhanced Toolbar */}
      <div className="bg-white border-b shadow-sm p-2 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
          {/* Mode Toggle */}
          <div className="flex bg-gray-100 rounded overflow-hidden">
            <button onClick={() => setIsPreviewMode(false)} className={`px-3 py-1 ${!isPreviewMode ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}>Edit</button>
            <button onClick={() => setIsPreviewMode(true)} className={`px-3 py-1 ${isPreviewMode ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}>Preview</button>
          </div>

          <div className="h-5 w-px bg-gray-200 mx-1"></div>

          {/* Font Family */}
          <select onChange={(e) => applyCommand('fontName', e.target.value)} className="border rounded px-2 py-1 bg-white hover:bg-gray-50">
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Verdana">Verdana</option>
          </select>

          {/* Font Size */}
          <select onChange={(e) => applyStyle('fontSize', e.target.value)} className="border rounded px-2 py-1 bg-white hover:bg-gray-50">
            <option value="10pt">10pt</option>
            <option value="11pt" defaultValue>11pt</option>
            <option value="12pt">12pt</option>
            <option value="14pt">14pt</option>
            <option value="18pt">18pt</option>
          </select>

          <div className="h-5 w-px bg-gray-200 mx-1"></div>

          {/* Basic Styles */}
          <button onClick={() => applyCommand('bold')} className="px-2 py-1 font-bold hover:bg-gray-100 rounded">B</button>
          <button onClick={() => applyCommand('italic')} className="px-2 py-1 italic hover:bg-gray-100 rounded">I</button>
          <button onClick={() => applyCommand('underline')} className="px-2 py-1 underline hover:bg-gray-100 rounded">U</button>
          
          {/* Color Picker */}
          <label className="flex items-center px-2 py-1 hover:bg-gray-100 rounded cursor-pointer">
            <span className="mr-1">A</span>
            <input type="color" onChange={(e) => applyCommand('foreColor', e.target.value)} className="w-5 h-5 border-none bg-transparent p-0 cursor-pointer" />
          </label>

          <div className="h-5 w-px bg-gray-200 mx-1"></div>

          {/* Alignment */}
          <button onClick={() => applyCommand('justifyLeft')} className="px-2 py-1 hover:bg-gray-100 rounded">L</button>
          <button onClick={() => applyCommand('justifyCenter')} className="px-2 py-1 hover:bg-gray-100 rounded">C</button>
          <button onClick={() => applyCommand('justifyRight')} className="px-2 py-1 hover:bg-gray-100 rounded">R</button>

          <div className="h-5 w-px bg-gray-200 mx-1"></div>

          {/* Lists */}
          <button onClick={() => applyCommand('insertUnorderedList')} className="px-2 py-1 hover:bg-gray-100 rounded">UL</button>
          <button onClick={() => applyCommand('insertOrderedList')} className="px-2 py-1 hover:bg-gray-100 rounded">OL</button>
          
          {/* Multi-page indicator */}
          {isPreviewMode && content && (
            <div className="ml-auto text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded">
              📄 {getPageCount()} page{getPageCount() !== 1 ? 's' : ''} • Multi-page preview
            </div>
          )}
        </div>
      </div>

      {/* Editor & Preview Area */}
      <div className="flex-1 overflow-auto bg-gray-300 p-4">
        <style dangerouslySetInnerHTML={{ __html: documentStyles }} />
        {isPreviewMode ? (
          /* 🔧 FIXED: Multi-page preview with proper styling */
          <div className="preview-container">
            <div 
              className="multi-page-preview"
              dangerouslySetInnerHTML={{ __html: paginatedContent || content }} 
            />
          </div>
        ) : (
          <div
            ref={contentEditableRef}
            contentEditable
            className="report-editor bg-white shadow-lg mx-auto"
            style={{ width: '21cm', minHeight: '29.7cm', padding: '1.5cm' }}
            onInput={handleContentChange}
            suppressContentEditableWarning={true}
          />
        )}
      </div>
    </div>
  );
};

// 🔧 ENHANCED: Better styles with improved space utilization and alignment
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
  
  /* 🔧 FIXED: Preview container with proper centering */
  .preview-container {
    background: #f5f5f5;
    padding: 20px;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }

  /* 🔧 FIXED: Multi-page preview with consistent spacing */
  .multi-page-preview {
    width: 21cm;
    max-width: 21cm;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  /* 🔧 ENHANCED: Page styling with better space management */
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

  /* 🔧 OPTIMIZED: Patient table with proper margins */
  .page-header-table, .patient-info-table {
    width: calc(100% - 2.5cm);
    border-collapse: collapse;
    margin: 3rem 1.25cm 1rem 1.25cm;
    font-size: 10pt;
  }

  .page-header-table td, .patient-info-table td {
    border: 1px solid #000;
    padding: 8px 10px;
    vertical-align: top;
  }

  .page-header-table td:nth-child(1),
  .page-header-table td:nth-child(3),
  .patient-info-table td:nth-child(1),
  .patient-info-table td:nth-child(3) {
    background-color: #b2dfdb;
    font-weight: bold;
    width: 22%;
  }

  .page-header-table td:nth-child(2),
  .page-header-table td:nth-child(4),
  .patient-info-table td:nth-child(2),
  .patient-info-table td:nth-child(4) {
    background-color: #ffffff;
    width: 28%;
  }

  /* 🔧 OPTIMIZED: Content area with maximum space utilization */
  .content-flow-area {
    margin: 0 1.25cm;
    padding: 0;
    max-height: none;
    overflow: visible;
  }

  /* 🔧 ENHANCED: Signature section with proper positioning */
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

  /* 🔧 OPTIMIZED: Text styles with better spacing */
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

  /* 🔧 IMPROVED: Page break indicators */
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

  /* 🔧 ENHANCED: Page numbering and labels */
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

  /* 🔧 FIXED: Editor mode alignment */
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



export default ReportEditor;