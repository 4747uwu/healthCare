import React, { useState, useEffect } from 'react';

const TemplateTreeView = ({ templates, selectedTemplate, onTemplateSelect, studyModality }) => {
  const [expandedCategories, setExpandedCategories] = useState({});

  // Auto-expand categories when templates load
  useEffect(() => {
    if (templates && Object.keys(templates).length > 0) {
      console.log('🔍 TemplateTreeView received templates:', templates);
      
      // Auto-expand first category for better UX
      const firstCategory = Object.keys(templates)[0];
      if (firstCategory) {
        setExpandedCategories(prev => ({ ...prev, [firstCategory]: true }));
      }
    }
  }, [templates]);

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const getCategoryIcon = (category) => {
    const icons = {
      'General': '📋',
      'Cardiology': '❤️',
      'Neurology': '🧠',
      'Oncology': '🎗️',
      'Pediatric': '👶',
      'CT': '🔵',
      'MRI': '🟣',
      'X-Ray': '⚪',
      'Ultrasound': '🟡',
      'Emergency': '🚨',
      'Other': '📁'
    };
    return icons[category] || '📁';
  };

  // Debug logging
  console.log('🔍 TemplateTreeView render - templates:', templates);
  console.log('🔍 TemplateTreeView render - templates type:', typeof templates);
  console.log('🔍 TemplateTreeView render - templates keys:', Object.keys(templates || {}));

  // Better empty state check
  if (!templates || typeof templates !== 'object' || Object.keys(templates).length === 0) {
    console.log('⚠️ No templates available, showing empty state');
    return (
      <div className="p-4 text-center">
        <div className="text-gray-400 mb-2">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-gray-500">No templates available</p>
        <p className="text-xs text-gray-400 mt-1">
          {templates === null ? 'Loading templates...' : 'Contact admin to add templates'}
        </p>
      </div>
    );
  }

  console.log('✅ Rendering templates tree');

  return (
    <div className="h-full">
      {/* Header */}
      <div className="p-3 bg-gray-50 border-b">
        <h3 className="font-medium text-gray-900 text-sm">HTML Templates</h3>
        <p className="text-xs text-gray-600">Select a template to insert into your report</p>
      </div>

      {/* Templates Tree */}
      <div className="p-2 overflow-y-auto">
        {Object.entries(templates).map(([category, categoryTemplates]) => (
          <div key={category} className="mb-4">
            <button
              onClick={() => toggleCategory(category)}
              className="flex items-center justify-between w-full p-3 text-left bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-2">
                <span className="text-lg">{getCategoryIcon(category)}</span>
                <span className="font-medium text-gray-700">{category}</span>
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                  {Array.isArray(categoryTemplates) ? categoryTemplates.length : 0}
                </span>
              </div>
              <svg 
                className={`w-5 h-5 text-gray-500 transition-transform ${
                  expandedCategories[category] ? 'rotate-90' : ''
                }`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            
            {expandedCategories[category] && Array.isArray(categoryTemplates) && (
              <div className="mt-2 space-y-1">
                {categoryTemplates.map(template => (
                  <button
                    key={template.id}
                    onClick={() => onTemplateSelect(template.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedTemplate?._id === template.id || selectedTemplate?.id === template.id
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-white border-gray-200 hover:border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    <div className="font-medium text-sm mb-1">{template.title}</div>
                    <div className="text-xs text-gray-500 line-clamp-2">
                      {template.htmlContent 
                        ? template.htmlContent.replace(/<[^>]*>/g, '').substring(0, 100) + '...' 
                        : 'HTML Template'
                      }
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">
                        HTML
                      </span>
                      <span className="text-xs text-gray-400">
                        {template.htmlContent ? Math.ceil(template.htmlContent.length / 1000) : 0}K chars
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t bg-gray-50 text-xs text-gray-500">
        <div className="flex justify-between">
          <span>
            {Object.values(templates).reduce((total, categoryTemplates) => {
              return total + (Array.isArray(categoryTemplates) ? categoryTemplates.length : 0);
            }, 0)} templates available
          </span>
          <span className="text-green-600">HTML Format</span>
        </div>
      </div>
    </div>
  );
};

export default TemplateTreeView;