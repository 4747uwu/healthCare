import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Lab from '../models/labModel.js';
import mongoose from 'mongoose';

// 🔥 COMPLETE BACKEND SEARCH - No frontend filtering needed
export const searchStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        
        // Extract all search parameters
        const {
            // Quick search
            searchType = 'all', // 'patientName', 'patientId', 'accession', 'all'
            searchTerm = '',
            
            // Advanced search fields
            patientName = '',
            patientId = '',
            accessionNumber = '',
            description = '',
            refName = '',
            
            // Filters
            workflowStatus = 'all',
            selectedLocation = 'ALL',
            location = '',
            modality = '',
            emergencyCase = 'false',
            mlcCase = 'false',
            studyType = 'all',
            
            // Date filters
            dateFilter,
            customDateFrom,
            customDateTo,
            dateType = 'UploadDate',
            quickDatePreset,
            
            // Pagination
            page = 1,
            limit = 5000
        } = req.query;

        console.log(`🔍 BACKEND SEARCH: Processing complete search with params:`, req.query);

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // 🔧 BUILD: Complete aggregation pipeline
        const pipeline = [];
        const matchConditions = {};

        // 🔍 QUICK SEARCH LOGIC
        if (searchTerm && searchTerm.trim()) {
            const trimmedSearchTerm = searchTerm.trim();
            console.log(`🔍 Quick search: "${trimmedSearchTerm}" (type: ${searchType})`);
            
            switch (searchType) {
                case 'patientName':
                    matchConditions.$or = [
                        { 'patientInfo.patientName': { $regex: trimmedSearchTerm, $options: 'i' } }
                    ];
                    break;
                    
                case 'patientId':
                    matchConditions.$or = [
                        { 'patientInfo.patientID': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { patientId: { $regex: trimmedSearchTerm, $options: 'i' } }
                    ];
                    break;
                    
                case 'accession':
                    matchConditions.accessionNumber = { $regex: trimmedSearchTerm, $options: 'i' };
                    break;
                    
                default: // 'all'
                    matchConditions.$or = [
                        { 'patientInfo.patientName': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { 'patientInfo.patientID': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { patientId: { $regex: trimmedSearchTerm, $options: 'i' } },
                        { accessionNumber: { $regex: trimmedSearchTerm, $options: 'i' } }
                    ];
            }
        }

        // 🔍 ADVANCED SEARCH FIELDS (override quick search if specified)
        const advancedSearchConditions = [];

        if (patientName && patientName.trim()) {
            advancedSearchConditions.push({
                'patientInfo.patientName': { $regex: patientName.trim(), $options: 'i' }
            });
            console.log(`🔍 Advanced search - Patient Name: "${patientName}"`);
        }

        if (patientId && patientId.trim()) {
            advancedSearchConditions.push({
                $or: [
                    { 'patientInfo.patientID': { $regex: patientId.trim(), $options: 'i' } },
                    { patientId: { $regex: patientId.trim(), $options: 'i' } }
                ]
            });
            console.log(`🔍 Advanced search - Patient ID: "${patientId}"`);
        }

        if (accessionNumber && accessionNumber.trim()) {
            advancedSearchConditions.push({
                accessionNumber: { $regex: accessionNumber.trim(), $options: 'i' }
            });
            console.log(`🔍 Advanced search - Accession: "${accessionNumber}"`);
        }

        if (description && description.trim()) {
            advancedSearchConditions.push({
                $or: [
                    { description: { $regex: description.trim(), $options: 'i' } },
                    { studyDescription: { $regex: description.trim(), $options: 'i' } },
                    { examDescription: { $regex: description.trim(), $options: 'i' } }
                ]
            });
            console.log(`🔍 Advanced search - Description: "${description}"`);
        }

        if (refName && refName.trim()) {
            advancedSearchConditions.push({
                $or: [
                    { referringPhysicianName: { $regex: refName.trim(), $options: 'i' } },
                    { 'referringPhysician.name': { $regex: refName.trim(), $options: 'i' } }
                ]
            });
            console.log(`🔍 Advanced search - Referring Physician: "${refName}"`);
        }

        // If advanced search conditions exist, use them instead of quick search
        if (advancedSearchConditions.length > 0) {
            if (matchConditions.$or) delete matchConditions.$or; // Remove quick search
            matchConditions.$and = advancedSearchConditions;
        }

        // 🏷️ WORKFLOW STATUS FILTER
        if (workflowStatus && workflowStatus !== 'all') {
            const statusMap = {
                'pending': ['new_study_received', 'pending_assignment'],
                'inprogress': ['assigned_to_doctor', 'doctor_opened_report', 'report_in_progress', 
                              'report_drafted', 'report_finalized', 'report_uploaded',
                              'report_downloaded_radiologist', 'report_downloaded'],
                'completed': ['final_report_downloaded']
            };
            
            if (statusMap[workflowStatus]) {
                matchConditions.workflowStatus = { $in: statusMap[workflowStatus] };
            } else {
                matchConditions.workflowStatus = workflowStatus;
            }
            console.log(`🏷️ Workflow Status filter: ${workflowStatus}`);
        }

        // 📍 LOCATION FILTER - Enhanced to handle both location and selectedLocation
        const locationFilter = location || selectedLocation;
        if (locationFilter && locationFilter !== 'ALL') {
            // Create flexible location matching
            matchConditions.$or = [
                ...(matchConditions.$or || []),
                { location: { $regex: locationFilter, $options: 'i' } },
                { institutionName: { $regex: locationFilter, $options: 'i' } }
            ];
            console.log(`📍 Location filter: ${locationFilter}`);
        }

        // 🏥 MODALITY FILTER
        if (modality && modality.trim()) {
            const modalities = modality.split(',').map(m => m.trim()).filter(m => m);
            if (modalities.length > 0) {
                matchConditions.modality = { 
                    $in: modalities.map(mod => new RegExp(`^${mod}`, 'i'))
                };
                console.log(`🏥 Modality filter: ${modalities.join(', ')}`);
            }
        }

        // 🚨 EMERGENCY CASE FILTER
        if (emergencyCase === 'true') {
            matchConditions.$or = [
                ...(matchConditions.$or || []),
                { caseType: { $in: ['urgent', 'emergency', 'URGENT', 'EMERGENCY'] } },
                { 'assignment.priority': 'URGENT' },
                { studyPriority: 'Emergency Case' }
            ];
            console.log('🚨 Emergency cases filter applied');
        }

        // 🏷️ MLC CASE FILTER
        if (mlcCase === 'true') {
            matchConditions.$or = [
                ...(matchConditions.$or || []),
                { mlcCase: true },
                { studyPriority: 'MLC Case' }
            ];
            console.log('🏷️ MLC cases filter applied');
        }

        // 📋 STUDY TYPE FILTER
        if (studyType && studyType !== 'all') {
            matchConditions.studyType = studyType;
            console.log(`📋 Study type filter: ${studyType}`);
        }

        // 📅 DATE FILTER - Use quickDatePreset or dateFilter
        const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
        const activeDateFilter = quickDatePreset || dateFilter;
        
        if (activeDateFilter && activeDateFilter !== 'all') {
            if (activeDateFilter === 'custom' && (customDateFrom || customDateTo)) {
                const dateQuery = {};
                
                if (customDateFrom) {
                    dateQuery.$gte = new Date(customDateFrom);
                }
                
                if (customDateTo) {
                    const toDate = new Date(customDateTo);
                    toDate.setHours(23, 59, 59, 999);
                    dateQuery.$lte = toDate;
                }
                
                if (Object.keys(dateQuery).length > 0) {
                    matchConditions[dateField] = dateQuery;
                }
                console.log(`📅 Custom date filter: ${customDateFrom} to ${customDateTo}`);
            } else {
                // Quick date presets
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const dateQuery = {};
                
                switch (activeDateFilter) {
                    case 'today':
                        dateQuery.$gte = today;
                        dateQuery.$lt = new Date(today.getTime() + 24 * 60 * 60 * 1000);
                        break;
                    case 'yesterday':
                        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
                        dateQuery.$gte = yesterday;
                        dateQuery.$lt = today;
                        break;
                    case 'thisWeek':
                        const startOfWeek = new Date(today);
                        startOfWeek.setDate(today.getDate() - today.getDay());
                        dateQuery.$gte = startOfWeek;
                        break;
                    case 'thisMonth':
                        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                        dateQuery.$gte = startOfMonth;
                        break;
                    case 'last24h':
                        dateQuery.$gte = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                        break;
                }
                
                if (Object.keys(dateQuery).length > 0) {
                    matchConditions[dateField] = dateQuery;
                }
                console.log(`📅 Date filter: ${activeDateFilter}`);
            }
        }

        console.log('🔧 Final match conditions:', JSON.stringify(matchConditions, null, 2));

        // 🔧 BUILD: Optimized aggregation pipeline
        if (Object.keys(matchConditions).length > 0) {
            pipeline.push({ $match: matchConditions });
        }

        // 🔧 ADD: Lookups for related data (same as admin controller)
        pipeline.push(
            {
                $lookup: {
                    from: 'labs',
                    localField: 'sourceLab',
                    foreignField: '_id',
                    as: 'sourceLab'
                }
            },
            {
                $lookup: {
                    from: 'patients',
                    localField: 'patient',
                    foreignField: '_id',
                    as: 'patient'
                }
            }
        );

        // 🔧 ADD: Facet for data and count
        pipeline.push({
            $facet: {
                data: [
                    { $sort: { createdAt: -1 } },
                    { $skip: skip },
                    { $limit: parseInt(limit) },
                    {
                        $project: {
                            _id: 1,
                            studyInstanceUID: 1,
                            orthancStudyID: 1,
                            accessionNumber: 1,
                            workflowStatus: 1,
                            modality: 1,
                            modalitiesInStudy: 1,
                            studyDescription: 1,
                            examDescription: 1,
                            seriesCount: 1,
                            instanceCount: 1,
                            seriesImages: 1,
                            studyDate: 1,
                            studyTime: 1,
                            createdAt: 1,
                            ReportAvailable: 1,
                            'assignment.priority': 1,
                            'assignment.assignedAt': 1,
                            'assignment.assignedTo': 1,
                            lastAssignedDoctor: 1,
                            lastAssignmentAt: 1,
                            doctorReports: 1,
                            reportInfo: 1,
                            reportFinalizedAt: 1,
                            caseType: 1,
                            calculatedTAT: 1,
                            'patientInfo.patientID': 1,
                            'patientInfo.patientName': 1,
                            'patientInfo.age': 1,
                            'patientInfo.gender': 1,
                            institutionName: 1,
                            referringPhysicianName: 1,
                            patient: 1,
                            sourceLab: 1,
                            patientId: 1,
                            location: 1
                        }
                    }
                ],
                count: [{ $count: 'total' }]
            }
        });

        console.log('🚀 Executing search aggregation pipeline...');
        const queryStart = Date.now();
        
        const result = await DicomStudy.aggregate(pipeline).allowDiskUse(true);
        
        const studies = result[0]?.data || [];
        const totalRecords = result[0]?.count[0]?.total || 0;
        
        const queryTime = Date.now() - queryStart;

        // 🔧 ENHANCED: Format studies similar to admin controller
        const formattedStudies = studies.map(study => {
            // Extract patient info (from lookup or embedded)
            const patientData = Array.isArray(study.patient) && study.patient[0] 
                ? study.patient[0] 
                : study.patient;
            const labData = Array.isArray(study.sourceLab) && study.sourceLab[0] 
                ? study.sourceLab[0] 
                : study.sourceLab;

            // Format patient name
            const patientName = study.patientInfo?.patientName || 
                               patientData?.patientNameRaw || 
                               `${patientData?.firstName || ''} ${patientData?.lastName || ''}`.trim() ||
                               'Unknown Patient';

            // Format age/gender
            const age = study.patientInfo?.age || patientData?.ageString || 'N/A';
            const gender = study.patientInfo?.gender || patientData?.gender || 'N/A';
            const ageGender = `${age}${gender !== 'N/A' ? ` / ${gender}` : ''}`;

            // Format dates
            const formatDicomDateTime = (studyDate, studyTime) => {
                if (!studyDate) return 'N/A';
                
                let dateTime = new Date(studyDate);
                
                if (studyTime && studyTime.length >= 6) {
                    const hours = parseInt(studyTime.substring(0, 2));
                    const minutes = parseInt(studyTime.substring(2, 4));
                    const seconds = parseInt(studyTime.substring(4, 6));
                    dateTime.setUTCHours(hours, minutes, seconds, 0);
                }
                
                return dateTime.toLocaleString('en-GB', {
                    year: 'numeric',
                    month: 'short', 
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                    timeZone: 'UTC'
                }).replace(',', '');
            };

            return {
                _id: study._id,
                studyInstanceUID: study.studyInstanceUID,
                orthancStudyID: study.orthancStudyID,
                patientId: study.patientInfo?.patientID || study.patientId,
                patientName: patientName,
                ageGender: ageGender,
                accessionNumber: study.accessionNumber || 'N/A',
                modality: study.modality || 'N/A',
                description: study.studyDescription || study.examDescription || 'N/A',
                location: study.location || labData?.name || study.institutionName || 'N/A',
                studyDateTime: formatDicomDateTime(study.studyDate, study.studyTime),
                uploadDateTime: study.createdAt ? new Date(study.createdAt).toLocaleString('en-GB', {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }).replace(',', '') : 'N/A',
                workflowStatus: study.workflowStatus,
                seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                ReportAvailable: study.ReportAvailable || false,
                reportedDate: study.reportInfo?.finalizedAt || study.reportFinalizedAt || null,
                reportedBy: study.reportInfo?.reporterName || 'N/A',
                priority: study.assignment?.priority || 'NORMAL',
                assignedDoctor: study.assignment?.assignedTo || null,
                lastAssignedDoctor: study.lastAssignedDoctor,
                createdAt: study.createdAt,
                sourceLab: labData,
                patient: patientData,
                calculatedTAT: study.calculatedTAT
            };
        });

        const processingTime = Date.now() - startTime;

        console.log(`✅ Backend search completed: ${studies.length} studies found in ${queryTime}ms`);

        // 🔧 RESPONSE: Same format as admin controller
        res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalRecords,
            recordsPerPage: parseInt(limit),
            data: formattedStudies,
            searchPerformed: true,
            backendFiltering: true,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalRecords / parseInt(limit)),
                totalRecords,
                limit: parseInt(limit),
                hasNextPage: parseInt(page) < Math.ceil(totalRecords / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1
            },
            filters: {
                searchType,
                searchTerm,
                patientName,
                patientId,
                accessionNumber,
                workflowStatus,
                location: locationFilter,
                modality,
                emergencyCase: emergencyCase === 'true',
                mlcCase: mlcCase === 'true',
                dateFilter: activeDateFilter,
                dateType
            },
            performance: {
                totalTime: processingTime,
                queryTime,
                recordsProcessed: totalRecords,
                backend: 'complete'
            }
        });

    } catch (error) {
        console.error('❌ Backend search error:', error);
        res.status(500).json({
            success: false,
            message: 'Backend search failed',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// 🔍 ADVANCED: Auto-complete search suggestions
export const getSearchSuggestions = async (req, res) => {
    try {
        const { searchType = 'all', searchTerm = '', limit = 10 } = req.query;
        
        if (!searchTerm || searchTerm.trim().length < 2) {
            return res.json({
                success: true,
                suggestions: []
            });
        }

        const trimmedSearchTerm = searchTerm.trim();
        let aggregationPipeline = [];

        switch (searchType) {
            case 'patientName':
                aggregationPipeline = [
                    {
                        $match: {
                            'patientInfo.patientName': {
                                $regex: trimmedSearchTerm,
                                $options: 'i'
                            }
                        }
                    },
                    {
                        $group: {
                            _id: '$patientInfo.patientName',
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { count: -1 } },
                    { $limit: parseInt(limit) },
                    {
                        $project: {
                            suggestion: '$_id',
                            count: 1,
                            _id: 0
                        }
                    }
                ];
                break;

            case 'patientId':
                aggregationPipeline = [
                    {
                        $match: {
                            $or: [
                                {
                                    'patientInfo.patientID': {
                                        $regex: trimmedSearchTerm,
                                        $options: 'i'
                                    }
                                },
                                {
                                    patientId: {
                                        $regex: trimmedSearchTerm,
                                        $options: 'i'
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: {
                                $ifNull: ['$patientInfo.patientID', '$patientId']
                            },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { count: -1 } },
                    { $limit: parseInt(limit) },
                    {
                        $project: {
                            suggestion: '$_id',
                            count: 1,
                            _id: 0
                        }
                    }
                ];
                break;

            case 'accession':
                aggregationPipeline = [
                    {
                        $match: {
                            accessionNumber: {
                                $regex: trimmedSearchTerm,
                                $options: 'i'
                            }
                        }
                    },
                    {
                        $group: {
                            _id: '$accessionNumber',
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { count: -1 } },
                    { $limit: parseInt(limit) },
                    {
                        $project: {
                            suggestion: '$_id',
                            count: 1,
                            _id: 0
                        }
                    }
                ];
                break;

            default:
                return res.json({
                    success: true,
                    suggestions: []
                });
        }

        const suggestions = await DicomStudy.aggregate(aggregationPipeline);

        res.json({
            success: true,
            searchType,
            searchTerm: trimmedSearchTerm,
            suggestions: suggestions.map(s => ({
                text: s.suggestion,
                count: s.count
            }))
        });

    } catch (error) {
        console.error('❌ Error getting search suggestions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get search suggestions',
            suggestions: []
        });
    }
};