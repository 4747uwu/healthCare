import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Doctor from '../models/doctorModel.js';
import NodeCache from 'node-cache';
import mongoose from 'mongoose'
// import { calculateStudyTAT, getLegacyTATFields } from '../utils/TATutility.js';

const cache = new NodeCache({ stdTTL: 300 });

// 🔧 STANDARDIZED: Status categories used across ALL doctor functions
const DOCTOR_STATUS_CATEGORIES = {
    pending: [
        'new_study_received', 
        'pending_assignment',
        'assigned_to_doctor',           // ✅ SAME AS ADMIN
        'doctor_opened_report',         // ✅ SAME AS ADMIN  
        'report_in_progress',          // ✅ SAME AS ADMIN
        'report_downloaded_radiologist', // ✅ SAME AS ADMIN
        'report_downloaded'            // ✅ SAME AS ADMIN
    ],
    inprogress: [
        'report_finalized', 
        'report_drafted', 
        'report_uploaded'
    ],
    completed: ['final_report_downloaded']
};
const formatDicomDateTime = (studyDate, studyTime) => {
    if (!studyDate) return 'N/A';
    
    let dateTime = new Date(studyDate);
    
    if (studyTime && studyTime.length >= 6) {
      // Parse DICOM time format: "152054" = 15:20:54
      const hours = parseInt(studyTime.substring(0, 2));
      const minutes = parseInt(studyTime.substring(2, 4));
      const seconds = parseInt(studyTime.substring(4, 6));
      
      // Set the time components (this keeps it in the same date, just adds time)
      dateTime.setUTCHours(hours, minutes, seconds, 0);
    }
    
    return dateTime.toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC' // Keep as UTC since DICOM times are typically in local hospital time
    }).replace(',', '');
  };

// 🔧 HELPER: Get all statuses for a category
const getAllStatusesForCategory = (category) => {
    if (category === 'all') {
        return [
            ...DOCTOR_STATUS_CATEGORIES.pending,
            ...DOCTOR_STATUS_CATEGORIES.inprogress,
            ...DOCTOR_STATUS_CATEGORIES.completed
        ];
    }
    return DOCTOR_STATUS_CATEGORIES[category] || [];
};

// 🔧 HELPER: Get category for a status
const getCategoryForStatus = (status) => {
    for (const [category, statuses] of Object.entries(DOCTOR_STATUS_CATEGORIES)) {
        if (statuses.includes(status)) {
            return category;
        }
    }
    return 'unknown';
};


export const getAssignedStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = Math.min(parseInt(req.query.limit) || 20, 1000);

        // 🔥 STEP 1: Get doctor with lean query for better performance
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        console.log(`🔍 DOCTOR: Searching for studies assigned to doctor: ${doctor._id}`);

        const { 
            search, status, category, modality, priority, patientName, 
            customDateFrom, customDateTo, quickDatePreset, dateFilter, dateType = 'UploadDate'
        } = req.query;

        // 🔥 STEP 2: EXACT SAME date filtering logic as admin controller and getValues
        let filterStartDate = null;
        let filterEndDate = null;
        const IST_OFFSET = 5.5 * 60 * 60 * 1000; 
        
        // 🔥 CRITICAL: Use EXACT same date filtering logic as admin controller
        if (req.query.quickDatePreset || req.query.dateFilter) {
            const preset = req.query.quickDatePreset || req.query.dateFilter;
            const now = Date.now(); // Use timestamp for better performance
            
            switch (preset) {
                case 'last24h':
                    // Last 24 hours from current IST time
                    const nowIST = new Date(Date.now() + IST_OFFSET);
                    filterEndDate = new Date(Date.now()); // Current UTC time
                    filterStartDate = new Date(Date.now() - 86400000); // 24 hours ago UTC
                    break;

                case 'today':
                    // ✅ FIX: Today in IST timezone
                    const currentTimeIST = new Date(Date.now() + IST_OFFSET);
                    
                    // Create start of day in IST (00:00:00 IST)
                    const todayStartIST = new Date(
                        currentTimeIST.getFullYear(),
                        currentTimeIST.getMonth(),
                        currentTimeIST.getDate(),
                        0, 0, 0, 0
                    );
                    
                    // Create end of day in IST (23:59:59.999 IST)
                    const todayEndIST = new Date(
                        currentTimeIST.getFullYear(),
                        currentTimeIST.getMonth(),
                        currentTimeIST.getDate(),
                        23, 59, 59, 999
                    );
                    
                    // Convert IST times back to UTC for MongoDB query
                    filterStartDate = new Date(todayStartIST.getTime() - IST_OFFSET);
                    filterEndDate = new Date(todayEndIST.getTime() - IST_OFFSET);
                    
                    console.log(`🕐 Today IST: ${todayStartIST.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})} to ${todayEndIST.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
                    console.log(`🌍 Today UTC: ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()}`);
                    break;

                case 'yesterday':
                    // ✅ FIX: Yesterday in IST timezone
                    const currentTimeISTYesterday = new Date(Date.now() + IST_OFFSET);
                    const yesterdayIST = new Date(currentTimeISTYesterday.getTime() - 86400000); // Subtract 1 day
                    
                    // Create start of yesterday in IST
                    const yesterdayStartIST = new Date(
                        yesterdayIST.getFullYear(),
                        yesterdayIST.getMonth(),
                        yesterdayIST.getDate(),
                        0, 0, 0, 0
                    );
                    
                    // Create end of yesterday in IST
                    const yesterdayEndIST = new Date(
                        yesterdayIST.getFullYear(),
                        yesterdayIST.getMonth(),
                        yesterdayIST.getDate(),
                        23, 59, 59, 999
                    );
                    
                    // Convert IST times back to UTC for MongoDB query
                    filterStartDate = new Date(yesterdayStartIST.getTime() - IST_OFFSET);
                    filterEndDate = new Date(yesterdayEndIST.getTime() - IST_OFFSET);
                    
                    console.log(`🕐 Yesterday IST: ${yesterdayStartIST.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})} to ${yesterdayEndIST.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
                    console.log(`🌍 Yesterday UTC: ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()}`);
                    break;

                case 'thisWeek':
                    // ✅ FIX: This week in IST timezone
                    const currentTimeISTWeek = new Date(Date.now() + IST_OFFSET);
                    
                    // Get start of week (Sunday) in IST
                    const dayOfWeek = currentTimeISTWeek.getDay(); // 0 = Sunday, 1 = Monday, etc.
                    const weekStartIST = new Date(
                        currentTimeISTWeek.getFullYear(),
                        currentTimeISTWeek.getMonth(),
                        currentTimeISTWeek.getDate() - dayOfWeek,
                        0, 0, 0, 0
                    );
                    
                    // End is current time in IST
                    const weekEndIST = new Date(currentTimeISTWeek.getTime());
                    
                    // Convert IST times back to UTC for MongoDB query
                    filterStartDate = new Date(weekStartIST.getTime() - IST_OFFSET);
                    filterEndDate = new Date(weekEndIST.getTime() - IST_OFFSET);
                    break;

                case 'thisMonth':
                    // ✅ FIX: This month in IST timezone
                    const currentTimeISTMonth = new Date(Date.now() + IST_OFFSET);
                    
                    // Get start of month in IST
                    const monthStartIST = new Date(
                        currentTimeISTMonth.getFullYear(),
                        currentTimeISTMonth.getMonth(),
                        1,
                        0, 0, 0, 0
                    );
                    
                    // End is current time in IST
                    const monthEndIST = new Date(currentTimeISTMonth.getTime());
                    
                    // Convert IST times back to UTC for MongoDB query
                    filterStartDate = new Date(monthStartIST.getTime() - IST_OFFSET);
                    filterEndDate = new Date(monthEndIST.getTime() - IST_OFFSET);
                    break;

                case 'assignedToday':
                    // Special filter for doctors - studies assigned today in IST
                    const currentTimeISTAssigned = new Date(Date.now() + IST_OFFSET);
                    const assignedTodayStartIST = new Date(
                        currentTimeISTAssigned.getFullYear(),
                        currentTimeISTAssigned.getMonth(),
                        currentTimeISTAssigned.getDate(),
                        0, 0, 0, 0
                    );
                    const assignedTodayEndIST = new Date(
                        currentTimeISTAssigned.getFullYear(),
                        currentTimeISTAssigned.getMonth(),
                        currentTimeISTAssigned.getDate(),
                        23, 59, 59, 999
                    );
                    filterStartDate = new Date(assignedTodayStartIST.getTime() - IST_OFFSET);
                    filterEndDate = new Date(assignedTodayEndIST.getTime() - IST_OFFSET);
                    break;

                case 'custom':
                    if (req.query.customDateFrom || req.query.customDateTo) {
                        console.log(`📅 DOCTOR: Applying CUSTOM DATE filter from ${req.query.customDateFrom} to ${req.query.customDateTo} for ${dateType}`);
                        
                        // ✅ FIX: Handle custom dates - assume they're entered in IST
                        if (req.query.customDateFrom) {
                            // Parse as IST date
                            const customStartIST = new Date(req.query.customDateFrom + 'T00:00:00');
                            filterStartDate = new Date(customStartIST.getTime() - IST_OFFSET);
                        }
                        
                        if (req.query.customDateTo) {
                            // Parse as IST date
                            const customEndIST = new Date(req.query.customDateTo + 'T23:59:59');
                            filterEndDate = new Date(customEndIST.getTime() - IST_OFFSET);
                        }
                    } else {
                        // Default to last 24 hours
                        filterEndDate = new Date();
                        filterStartDate = new Date(Date.now() - 86400000);
                    }
                    break;

                default:
                    // Default to last 24 hours
                    filterEndDate = new Date();
                    filterStartDate = new Date(Date.now() - 86400000);
            }
        } else {
            // ✅ IST FIX: Default to today in IST when no filter specified
            const currentTimeISTDefault = new Date(Date.now() + IST_OFFSET);
            const todayStartISTDefault = new Date(
                currentTimeISTDefault.getFullYear(),
                currentTimeISTDefault.getMonth(),
                currentTimeISTDefault.getDate(),
                0, 0, 0, 0
            );
            const todayEndISTDefault = new Date(
                currentTimeISTDefault.getFullYear(),
                currentTimeISTDefault.getMonth(),
                currentTimeISTDefault.getDate(),
                23, 59, 59, 999
            );
            filterStartDate = new Date(todayStartISTDefault.getTime() - IST_OFFSET);
            filterEndDate = new Date(todayEndISTDefault.getTime() - IST_OFFSET);
        }

        // 🔥 STEP 3: Build the core query EXACTLY like getValues
        let baseQuery;
        if (filterStartDate && filterEndDate) {
            console.log(`📅 DOCTOR: Applying DATE filter from ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()} on field: ${dateType}`);
            
            if (quickDatePreset === 'assignedToday' || dateFilter === 'assignedToday') {
                // Special handling for assigned today - filter by assignment date instead of study/upload date
                baseQuery = {
                    $or: [
                        { lastAssignedDoctor: { $elemMatch: { doctorId: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } },
                        { assignment: { $elemMatch: { assignedTo: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } }
                    ]
                };
            } else {
                // Normal date filtering on study date or upload date
                const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
                baseQuery = {
                    $or: [
                        { 'lastAssignedDoctor.doctorId': doctor._id },
                        { 'assignment.assignedTo': doctor._id }
                    ],
                    [dateField]: { $gte: filterStartDate, $lte: filterEndDate }
                };
            }
        } else {
            baseQuery = {
                $or: [
                    { 'lastAssignedDoctor.doctorId': doctor._id },
                    { 'assignment.assignedTo': doctor._id }
                ]
            };
        }

        // 🔧 STEP 4: Optimized category filtering with pre-defined status arrays
        let queryFilters = { ...baseQuery };

        if (category && category !== 'all') {
            const statusesForCategory = getAllStatusesForCategory(category);
            queryFilters.workflowStatus = statusesForCategory.length === 1 ? 
                statusesForCategory[0] : { $in: statusesForCategory };
        } else if (status) {
            queryFilters.workflowStatus = status;
        } else {
            // Include all doctor statuses by default
            queryFilters.workflowStatus = { $in: getAllStatusesForCategory('all') };
        }

        // 🔥 STEP 5: Apply other filters
        if (search) {
            queryFilters.$text = { $search: search };
        }
        if (modality) {
            queryFilters.modality = modality;
        }
        if (priority) {
            queryFilters['assignment.priority'] = priority;
        }

        console.log(`🔍 DOCTOR: Final query filters:`, JSON.stringify(queryFilters, null, 2));

        // 🔥 STEP 6: Continue with the rest of the aggregation pipeline (same as before)
        const pipeline = [
            { $match: queryFilters },
            { $sort: { 'assignment.assignedAt': -1, createdAt: -1 } },
            { $limit: limit },
            {
                $project: {
                    _id: 1, studyInstanceUID: 1, orthancStudyID: 1, modalitiesInStudy: 1,
                    accessionNumber: 1, workflowStatus: 1, modality: 1, examDescription: 1,
                    studyDescription: 1, seriesImages: 1, seriesCount: 1, instanceCount: 1,
                    studyDate: 1, studyTime: 1, createdAt: 1, ReportAvailable: 1,
                    clinicalHistory: 1, doctorReports: 1, caseType: 1, assignment: 1,
                    lastAssignedDoctor: 1, patient: 1, sourceLab: 1, age: 1, gender: 1,
                    preProcessedDownload: 1
                }
            },
            {
                $addFields: {
                    currentCategory: {
                        $switch: {
                            branches: [
                                { case: { $in: ["$workflowStatus", DOCTOR_STATUS_CATEGORIES.pending] }, then: 'pending' },
                                { case: { $in: ["$workflowStatus", DOCTOR_STATUS_CATEGORIES.inprogress] }, then: 'inprogress' },
                                { case: { $in: ["$workflowStatus", DOCTOR_STATUS_CATEGORIES.completed] }, then: 'completed' }
                            ],
                            default: 'unknown'
                        }
                    }
                }
            }
        ];

        // Execute the rest of the function (same as before)...
        console.log(`🚀 Executing optimized doctor studies query...`);
        const queryStart = Date.now();

        const [studiesResult, totalCountResult] = await Promise.allSettled([
            DicomStudy.aggregate(pipeline).allowDiskUse(false),
            patientName ? 
                DicomStudy.aggregate([
                    { $match: queryFilters },
                    { $lookup: { from: 'patients', localField: 'patient', foreignField: '_id', as: 'patientData' } },
                    { $match: { 
                        $or: [ 
                            { 'patientData.patientNameRaw': { $regex: patientName, $options: 'i' } }, 
                            { 'patientData.patientID': { $regex: patientName, $options: 'i' } } 
                        ] 
                    }},
                    { $count: "total" }
                ]).allowDiskUse(false) :
                DicomStudy.countDocuments(queryFilters)
        ]);

        if (studiesResult.status === 'rejected') {
            throw new Error(`Studies query failed: ${studiesResult.reason.message}`);
        }

        const studies = studiesResult.value;
        const totalStudies = totalCountResult.status === 'fulfilled' ? 
            (patientName ? (totalCountResult.value[0]?.total || 0) : totalCountResult.value) : 
            studies.length;

        const queryTime = Date.now() - queryStart;
        console.log(`📊 DOCTOR: Query results: Found ${studies.length} studies, total matching: ${totalStudies} (${queryTime}ms)`);

        // Continue with the rest of your existing formatting logic...
        // (The rest of the function remains the same)
        
        // Rest of formatting and response code stays the same...
        const lookupMaps = { patients: new Map(), labs: new Map() };

        if (studies.length > 0) {
            const lookupStart = Date.now();
            const uniqueIds = {
                patients: [...new Set(studies.map(s => s.patient?.toString()).filter(Boolean))],
                labs: [...new Set(studies.map(s => s.sourceLab?.toString()).filter(Boolean))]
            };

            const lookupPromises = [];
            if (uniqueIds.patients.length > 0) {
                lookupPromises.push(
                    mongoose.model('Patient')
                        .find({ _id: { $in: uniqueIds.patients.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('patientID firstName lastName patientNameRaw gender ageString computed.fullName clinicalInfo.clinicalHistory')
                        .lean()
                        .then(results => ({ type: 'patients', data: results }))
                );
            }
            if (uniqueIds.labs.length > 0) {
                lookupPromises.push(
                    mongoose.model('Lab')
                        .find({ _id: { $in: uniqueIds.labs.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('name identifier')
                        .lean()
                        .then(results => ({ type: 'labs', data: results }))
                );
            }

            const lookupResults = await Promise.allSettled(lookupPromises);
            lookupResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    const { type, data } = result.value;
                    data.forEach(item => {
                        lookupMaps[type].set(item._id.toString(), item);
                    });
                }
            });
        }

        // Apply patient name filtering after lookups (if specified)
        let filteredStudies = studies;
        if (patientName) {
            filteredStudies = studies.filter(study => {
                const patient = lookupMaps.patients.get(study.patient?.toString());
                const searchRegex = new RegExp(patientName, 'i');
                return (patient && (
                    searchRegex.test(patient.computed?.fullName || '') ||
                    searchRegex.test(patient.patientNameRaw || '') ||
                    searchRegex.test(patient.patientID || '')
                ));
            });
        }

        // Continue with your existing formatting logic...
        const formatStart = Date.now();
        const formattedStudies = filteredStudies.map(study => {
            const patient = lookupMaps.patients.get(study.patient?.toString());
            const sourceLab = lookupMaps.labs.get(study.sourceLab?.toString());

            const hasWasabiZip = study.preProcessedDownload?.zipStatus === 'completed' && 
                    study.preProcessedDownload?.zipUrl &&
                    (!study.preProcessedDownload?.zipExpiresAt || 
                     study.preProcessedDownload.zipExpiresAt > new Date());

            let assignmentData = null;
            if (study.assignment && study.assignment.length > 0) {
                assignmentData = study.assignment[study.assignment.length - 1];
            } else if (study.lastAssignedDoctor && study.lastAssignedDoctor.length > 0) {
                assignmentData = study.lastAssignedDoctor[study.lastAssignedDoctor.length - 1];
            }

            let patientDisplay = 'N/A';
            let patientIdDisplay = 'N/A';
            const patientAgeGenderDisplay = study.age && study.gender ? 
                                `${study.age}/${study.gender}` : 
                                study.age || study.gender || 'N/A';

            if (patient) {
                patientDisplay = patient.computed?.fullName || patient.patientNameRaw || 'N/A';
                patientIdDisplay = patient.patientID || 'N/A';
            }

            return {
                _id: study._id,
                orthancStudyID: study.orthancStudyID,
                studyInstanceUID: study.studyInstanceUID,
                accessionNumber: study.accessionNumber,
                patientId: patientIdDisplay,
                patientName: patientDisplay,
                ageGender: patientAgeGenderDisplay,
                description: study.examDescription || study.studyDescription || 'N/A',
                modality: study.modalitiesInStudy?.length > 0 ? 
                    study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                location: sourceLab?.name || 'N/A',
                studyDateTime: study.studyDate && study.studyTime 
                    ? formatDicomDateTime(study.studyDate, study.studyTime)
                    : study.studyDate 
                        ? new Date(study.studyDate).toLocaleDateString('en-GB', {
                            year: 'numeric', month: 'short', day: '2-digit'
                        })
                        : 'N/A',
                uploadDateTime: study.createdAt
                    ? new Date(study.createdAt).toLocaleString('en-GB', {
                        timeZone: 'Asia/Kolkata',
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }).replace(',', '')
                    : 'N/A',
                reportedDate: Array.isArray(study.doctorReports) && study.doctorReports.length > 0
                    ? (() => {
                        const latestReport = study.doctorReports[study.doctorReports.length - 1];
                        const reportDate = latestReport.finalizedAt || latestReport.createdAt;
                        return reportDate ? new Date(reportDate) : null;
                    })()
                    : null,
                downloadOptions: {
                    hasWasabiZip: hasWasabiZip,
                    hasR2Zip: hasWasabiZip,
                    wasabiFileName: study.preProcessedDownload?.zipFileName || null,
                    wasabiSizeMB: study.preProcessedDownload?.zipSizeMB || 0,
                    wasabiDownloadCount: study.preProcessedDownload?.downloadCount || 0,
                    wasabiCreatedAt: study.preProcessedDownload?.zipCreatedAt || null,
                    wasabiExpiresAt: study.preProcessedDownload?.zipExpiresAt || null,
                    zipStatus: study.preProcessedDownload?.zipStatus || 'not_started'
                },
                workflowStatus: study.workflowStatus,
                caseType: study.caseType || 'routine',
                currentCategory: study.currentCategory,
                priority: assignmentData?.priority || study.caseType?.toUpperCase() || 'NORMAL',
                assignedDate: assignmentData?.assignedAt,
                reportStartedAt: study.reportInfo?.startedAt,
                reportFinalizedAt: study.reportInfo?.finalizedAt,
                reportedBy: study.reportInfo?.reporterName || 'N/A',
                ReportAvailable: study.ReportAvailable || true,
                clinicalHistory: study?.clinicalHistory?.clinicalHistory || patient?.clinicalInfo?.clinicalHistory || ''
            };
        });

        // Optimized category counting
        const categoryCounts = { all: totalStudies, pending: 0, inprogress: 0, completed: 0 };
        formattedStudies.forEach(study => {
            if (study.currentCategory && categoryCounts.hasOwnProperty(study.currentCategory)) {
                categoryCounts[study.currentCategory]++;
            }
        });

        const formatTime = Date.now() - formatStart;
        const totalProcessingTime = Date.now() - startTime;

        console.log(`✅ DOCTOR: Formatting completed in ${formatTime}ms`);
        console.log(`🎯 DOCTOR: Total processing time: ${totalProcessingTime}ms for ${formattedStudies.length} studies`);
        
        res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalRecords: totalStudies,
            data: formattedStudies,
            pagination: {
                currentPage: 1,
                totalPages: Math.ceil(totalStudies / limit),
                totalRecords: totalStudies,
                limit: limit,
                hasNextPage: totalStudies > limit,
                hasPrevPage: false,
                recordRange: {
                    start: 1,
                    end: formattedStudies.length
                }
            },
            summary: {
                byCategory: categoryCounts,
                urgentStudies: formattedStudies.filter(s => ['URGENT', 'EMERGENCY', 'STAT'].includes(s.priority)).length,
                total: totalStudies
            },
            performance: {
                queryTime: totalProcessingTime,
                recordsReturned: formattedStudies.length,
                breakdown: {
                    coreQuery: queryTime,
                    formatting: formatTime,
                    totalProcessing: totalProcessingTime
                }
            }
        });

    } catch (error) {
        console.error('❌ DOCTOR: Error fetching assigned studies:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching assigned studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const getPatientDetailedViewForDoctor = async (req, res) => {
    try {
        const { id: patientId } = req.params;

        // 🔧 PERFORMANCE: Find doctor with lean query
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        // 🔧 OPTIMIZED: Parallel queries for better performance
        const [patient, studies] = await Promise.all([
            Patient.findOne({ patientID: patientId }).lean(),
            DicomStudy.find({
                patient: { $exists: true },
                lastAssignedDoctor: doctor._id
            })
            .populate('sourceLab', 'name identifier')
            .sort({ studyDate: -1 })
            .lean()
        ]);

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // 🔧 OPTIMIZED: Format studies efficiently
        const formattedStudies = studies.map(study => ({
            _id: study._id,
            studyDateTime: study.studyDate,
            modality: study.modalitiesInStudy ? study.modalitiesInStudy.join(', ') : 'N/A',
            description: study.examDescription || study.examType || 'N/A',
            workflowStatus: study.workflowStatus,
            location: study.sourceLab?.name || 'N/A',
            priority: study.caseType || 'ROUTINE',
            assignedAt: study.lastAssignmentAt,
            reportContent: study.reportContent,
            reportFinalizedAt: study.reportFinalizedAt
        }));

        const responseData = {
            patientInfo: {
                patientID: patient.patientID,
                firstName: patient.firstName || '',
                lastName: patient.lastName || '',
                age: patient.ageString || '',
                gender: patient.gender || '',
                dateOfBirth: patient.dateOfBirth || '',
                contactNumber: patient.contactInformation?.phone || '',
                address: patient.address || ''
            },
            clinicalInfo: patient.clinicalInfo || {},
            referralInfo: patient.referralInfo || '',
            studies: formattedStudies,
            documents: patient.documents || []
        };

        res.json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error('Error fetching patient details for doctor:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch patient details'
        });
    }
};

// export const getValues = async (req, res) => {
//     console.log(`🔍 DOCTOR VALUES: Fetching dashboard values with filters: ${JSON.stringify(req.query)}`);
//     try {
//         const startTime = Date.now();
        
//         const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
//         if (!doctor) {
//             return res.status(404).json({ success: false, message: 'Doctor profile not found' });
//         }

//         console.log(`🔍 DOCTOR VALUES: Doctor ID: ${doctor._id}`);

//         // --- UNIFIED FILTERING LOGIC ---

//         const { 
//             search, category, modality, priority, 
//             customDateFrom, customDateTo, quickDatePreset
//         } = req.query;

//         // 🔥 STEP 1: Determine the date range for filtering based on assignment date.
//         let filterStartDate = null;
//         let filterEndDate = null;
//         if (quickDatePreset) {
//             const now = new Date();
//             switch (quickDatePreset) {
//                 case '24h':
//                 case 'last24h':
//                     filterStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
//                     filterEndDate = now;
//                     break;
//                 case 'today':
//                 case 'assignedToday':
//                     filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
//                     filterEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
//                     break;
//                 case 'yesterday':
//                     const yesterday = new Date();
//                     yesterday.setDate(now.getDate() - 1);
//                     filterStartDate = new Date(yesterday.setHours(0, 0, 0, 0));
//                     filterEndDate = new Date(yesterday.setHours(23, 59, 59, 999));
//                     break;
//                 case 'week':
//                 case 'thisWeek':
//                     filterStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
//                     filterEndDate = now;
//                     break;
//                 case 'month':
//                 case 'thisMonth':
//                     filterStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
//                     filterEndDate = now;
//                     break;
//                 case 'custom':
//                     filterStartDate = customDateFrom ? new Date(customDateFrom + 'T00:00:00Z') : null;
//                     filterEndDate = customDateTo ? new Date(customDateTo + 'T23:59:59Z') : null;
//                     break;
//             }
//         }

//         // 🔥 STEP 2: Build the core query. The structure changes based on whether a date filter is active.
//         let baseQuery;
//         if (filterStartDate && filterEndDate) {
//             console.log(`📅 DOCTOR VALUES: Applying ASSIGNMENT DATE filter from ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()}`);
//             baseQuery = {
//                 $or: [
//                     { lastAssignedDoctor: { $elemMatch: { doctorId: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } },
//                     { assignment: { $elemMatch: { assignedTo: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } }
//                 ]
//             };
//         } else {
//             baseQuery = {
//                 $or: [
//                     { 'lastAssignedDoctor.doctorId': doctor._id },
//                     { 'assignment.assignedTo': doctor._id }
//                 ]
//             };
//         }

//         // 🔧 STEP 3: Combine the base query with all other query parameters.
//         let queryFilters = { ...baseQuery };

//         // if (category && category !== 'all') {
//         //     queryFilters.workflowStatus = { $in: getAllStatusesForCategory(category) };
//         // }
//         if (search) {
//             queryFilters.$text = { $search: search };
//         }
//         if (modality) {
//             queryFilters.modality = modality;
//         }
//         if (priority) {
//             queryFilters['assignment.priority'] = priority;
//         }

//         console.log(`🔍 DOCTOR VALUES: Final query filters:`, JSON.stringify(queryFilters, null, 2));

//         // 🔥 STEP 4: This single aggregation pipeline gets ALL the data we need efficiently.
//         const pipeline = [
//             { $match: queryFilters },
//             {
//                 $group: {
//                     _id: {
//                         $switch: {
//                             branches: [
//                                 { case: { $in: ['$workflowStatus', DOCTOR_STATUS_CATEGORIES.pending] }, then: 'pending' },
//                                 { case: { $in: ['$workflowStatus', DOCTOR_STATUS_CATEGORIES.inprogress] }, then: 'inprogress' },
//                                 { case: { $in: ['$workflowStatus', DOCTOR_STATUS_CATEGORIES.completed] }, then: 'completed' },
//                             ],
//                             default: 'unknown'
//                         }
//                     },
//                     count: { $sum: 1 }
//                 }
//             }
//         ];

//         const categoryCountsResult = await DicomStudy.aggregate(pipeline).allowDiskUse(true);

//         const counts = { pending: 0, inprogress: 0, completed: 0, total: 0 };

//         categoryCountsResult.forEach(group => {
//             if (counts.hasOwnProperty(group._id)) {
//                 counts[group._id] = group.count;
//             }
//         });

//         counts.total = counts.pending + counts.inprogress + counts.completed;
//         const allStudiesCount = await DicomStudy.countDocuments({ // Get total for the 'All' tab
//              $or: [
//                 { 'lastAssignedDoctor.doctorId': doctor._id },
//                 { 'assignment.assignedTo': doctor._id }
//             ]
//         });

//         const processingTime = Date.now() - startTime;
//         console.log(`🎯 DOCTOR VALUES: Dashboard values calculated - Total: ${counts.total}, Pending: ${counts.pending}, InProgress: ${counts.inprogress}, Completed: ${counts.completed}`);

//         const response = {
//             success: true,
//             all: allStudiesCount, // This is the unfiltered total for the "All" button
//             total: counts.total,  // This is the total for the currently active filter set
//             pending: counts.pending,
//             inprogress: counts.inprogress,
//             completed: counts.completed,
//             performance: { queryTime: processingTime }
//         };

//         res.status(200).json(response);

//     } catch (error) {
//         console.error('❌ DOCTOR VALUES: Error fetching dashboard values:', error);
//         res.status(500).json({ 
//             success: false, 
//             message: 'Server error fetching dashboard statistics.',
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     }
// };


export const getValues = async (req, res) => {
    console.log(`🔍 DOCTOR VALUES: Fetching dashboard values with filters: ${JSON.stringify(req.query)}`);
    try {
        const startTime = Date.now();
        
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor profile not found' });
        }

        console.log(`🔍 DOCTOR VALUES: Doctor ID: ${doctor._id}`);

        // 🔥 CRITICAL FIX: Use EXACT same parameter extraction as admin controller
        const { 
            search, category, modality, priority, 
            customDateFrom, customDateTo, quickDatePreset, dateFilter, dateType = 'UploadDate'
        } = req.query;

        console.log(`🔍 DOCTOR VALUES: Received filters - customDateFrom: ${customDateFrom}, customDateTo: ${customDateTo}, quickDatePreset: ${quickDatePreset}, dateFilter: ${dateFilter}, dateType: ${dateType}`);

        // 🔥 STEP 1: EXACT SAME date filtering logic as admin controller
        let filterStartDate = null;
        let filterEndDate = null;
        const IST_OFFSET = 5.5 * 60 * 60 * 1000;
        
        // 🔥 CRITICAL: Use EXACT same date filtering logic as admin controller
        if (req.query.quickDatePreset || req.query.dateFilter) {
            const preset = req.query.quickDatePreset || req.query.dateFilter;
            const now = Date.now(); // Use timestamp for better performance
            
            switch (preset) {
                case 'last24h':
                    // Last 24 hours from current IST time
                    const nowIST = new Date(Date.now() + IST_OFFSET);
                    filterEndDate = new Date(Date.now()); // Current UTC time
                    filterStartDate = new Date(Date.now() - 86400000); // 24 hours ago UTC
                    break;

                case 'today':
                    // ✅ FIX: Today in IST timezone
                    const currentTimeIST = new Date(Date.now() + IST_OFFSET);
                    
                    // Create start of day in IST (00:00:00 IST)
                    const todayStartIST = new Date(
                        currentTimeIST.getFullYear(),
                        currentTimeIST.getMonth(),
                        currentTimeIST.getDate(),
                        0, 0, 0, 0
                    );
                    
                    // Create end of day in IST (23:59:59.999 IST)
                    const todayEndIST = new Date(
                        currentTimeIST.getFullYear(),
                        currentTimeIST.getMonth(),
                        currentTimeIST.getDate(),
                        23, 59, 59, 999
                    );
                    
                    // Convert IST times back to UTC for MongoDB query
                    filterStartDate = new Date(todayStartIST.getTime() - IST_OFFSET);
                    filterEndDate = new Date(todayEndIST.getTime() - IST_OFFSET);
                    
                    console.log(`🕐 Today IST: ${todayStartIST.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})} to ${todayEndIST.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
                    console.log(`🌍 Today UTC: ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()}`);
                    break;

                case 'yesterday':
                    // ✅ FIX: Yesterday in IST timezone
                    const currentTimeISTYesterday = new Date(Date.now() + IST_OFFSET);
                    const yesterdayIST = new Date(currentTimeISTYesterday.getTime() - 86400000); // Subtract 1 day
                    
                    // Create start of yesterday in IST
                    const yesterdayStartIST = new Date(
                        yesterdayIST.getFullYear(),
                        yesterdayIST.getMonth(),
                        yesterdayIST.getDate(),
                        0, 0, 0, 0
                    );
                    
                    // Create end of yesterday in IST
                    const yesterdayEndIST = new Date(
                        yesterdayIST.getFullYear(),
                        yesterdayIST.getMonth(),
                        yesterdayIST.getDate(),
                        23, 59, 59, 999
                    );
                    
                    // Convert IST times back to UTC for MongoDB query
                    filterStartDate = new Date(yesterdayStartIST.getTime() - IST_OFFSET);
                    filterEndDate = new Date(yesterdayEndIST.getTime() - IST_OFFSET);
                    
                    console.log(`🕐 Yesterday IST: ${yesterdayStartIST.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})} to ${yesterdayEndIST.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
                    console.log(`🌍 Yesterday UTC: ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()}`);
                    break;

                case 'thisWeek':
                    // ✅ FIX: This week in IST timezone
                    const currentTimeISTWeek = new Date(Date.now() + IST_OFFSET);
                    
                    // Get start of week (Sunday) in IST
                    const dayOfWeek = currentTimeISTWeek.getDay(); // 0 = Sunday, 1 = Monday, etc.
                    const weekStartIST = new Date(
                        currentTimeISTWeek.getFullYear(),
                        currentTimeISTWeek.getMonth(),
                        currentTimeISTWeek.getDate() - dayOfWeek,
                        0, 0, 0, 0
                    );
                    
                    // End is current time in IST
                    const weekEndIST = new Date(currentTimeISTWeek.getTime());
                    
                    // Convert IST times back to UTC for MongoDB query
                    filterStartDate = new Date(weekStartIST.getTime() - IST_OFFSET);
                    filterEndDate = new Date(weekEndIST.getTime() - IST_OFFSET);
                    break;

                case 'thisMonth':
                    // ✅ FIX: This month in IST timezone
                    const currentTimeISTMonth = new Date(Date.now() + IST_OFFSET);
                    
                    // Get start of month in IST
                    const monthStartIST = new Date(
                        currentTimeISTMonth.getFullYear(),
                        currentTimeISTMonth.getMonth(),
                        1,
                        0, 0, 0, 0
                    );
                    
                    // End is current time in IST
                    const monthEndIST = new Date(currentTimeISTMonth.getTime());
                    
                    // Convert IST times back to UTC for MongoDB query
                    filterStartDate = new Date(monthStartIST.getTime() - IST_OFFSET);
                    filterEndDate = new Date(monthEndIST.getTime() - IST_OFFSET);
                    break;

                case 'assignedToday':
                    // Special filter for doctors - studies assigned today in IST
                    const currentTimeISTAssigned = new Date(Date.now() + IST_OFFSET);
                    const assignedTodayStartIST = new Date(
                        currentTimeISTAssigned.getFullYear(),
                        currentTimeISTAssigned.getMonth(),
                        currentTimeISTAssigned.getDate(),
                        0, 0, 0, 0
                    );
                    const assignedTodayEndIST = new Date(
                        currentTimeISTAssigned.getFullYear(),
                        currentTimeISTAssigned.getMonth(),
                        currentTimeISTAssigned.getDate(),
                        23, 59, 59, 999
                    );
                    filterStartDate = new Date(assignedTodayStartIST.getTime() - IST_OFFSET);
                    filterEndDate = new Date(assignedTodayEndIST.getTime() - IST_OFFSET);
                    break;

                case 'custom':
                    if (req.query.customDateFrom || req.query.customDateTo) {
                        console.log(`📅 DOCTOR VALUES: Applying CUSTOM DATE filter from ${req.query.customDateFrom} to ${req.query.customDateTo} for ${dateType}`);
                        
                        // ✅ FIX: Handle custom dates - assume they're entered in IST
                        if (req.query.customDateFrom) {
                            // Parse as IST date
                            const customStartIST = new Date(req.query.customDateFrom + 'T00:00:00');
                            filterStartDate = new Date(customStartIST.getTime() - IST_OFFSET);
                        }
                        
                        if (req.query.customDateTo) {
                            // Parse as IST date
                            const customEndIST = new Date(req.query.customDateTo + 'T23:59:59');
                            filterEndDate = new Date(customEndIST.getTime() - IST_OFFSET);
                        }
                    } else {
                        // Default to last 24 hours
                        filterEndDate = new Date();
                        filterStartDate = new Date(Date.now() - 86400000);
                    }
                    break;

                default:
                    // Default to last 24 hours
                    filterEndDate = new Date();
                    filterStartDate = new Date(Date.now() - 86400000);
            }
        } else {
            // ✅ IST FIX: Default to today in IST when no filter specified
            const currentTimeISTDefault = new Date(Date.now() + IST_OFFSET);
            const todayStartISTDefault = new Date(
                currentTimeISTDefault.getFullYear(),
                currentTimeISTDefault.getMonth(),
                currentTimeISTDefault.getDate(),
                0, 0, 0, 0
            );
            const todayEndISTDefault = new Date(
                currentTimeISTDefault.getFullYear(),
                currentTimeISTDefault.getMonth(),
                currentTimeISTDefault.getDate(),
                23, 59, 59, 999
            );
            filterStartDate = new Date(todayStartISTDefault.getTime() - IST_OFFSET);
            filterEndDate = new Date(todayEndISTDefault.getTime() - IST_OFFSET);
        }

        // 🔥 STEP 3: Build the core query EXACTLY like getValues
        let baseQuery;
        if (filterStartDate && filterEndDate) {
            console.log(`📅 DOCTOR VALUES: Applying DATE filter from ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()} on field: ${dateType}`);
            
            if (quickDatePreset === 'assignedToday' || dateFilter === 'assignedToday') {
                // Special handling for assigned today - filter by assignment date instead of study/upload date
                baseQuery = {
                    $or: [
                        { lastAssignedDoctor: { $elemMatch: { doctorId: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } },
                        { assignment: { $elemMatch: { assignedTo: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } }
                    ]
                };
            } else {
                // Normal date filtering on study date or upload date
                const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
                baseQuery = {
                    $or: [
                        { 'lastAssignedDoctor.doctorId': doctor._id },
                        { 'assignment.assignedTo': doctor._id }
                    ],
                    [dateField]: { $gte: filterStartDate, $lte: filterEndDate }
                };
            }
        } else {
            baseQuery = {
                $or: [
                    { 'lastAssignedDoctor.doctorId': doctor._id },
                    { 'assignment.assignedTo': doctor._id }
                ]
            };
        }

        // 🔧 STEP 4: Optimized category filtering with pre-defined status arrays
        let queryFilters = { ...baseQuery };

        if (category && category !== 'all') {
            const statusesForCategory = getAllStatusesForCategory(category);
            queryFilters.workflowStatus = statusesForCategory.length === 1 ? 
                statusesForCategory[0] : { $in: statusesForCategory };
        } else if (status) {
            queryFilters.workflowStatus = status;
        } else {
            // Include all doctor statuses by default
            queryFilters.workflowStatus = { $in: getAllStatusesForCategory('all') };
        }

        // 🔥 STEP 5: Apply other filters
        if (search) {
            queryFilters.$text = { $search: search };
        }
        if (modality) {
            queryFilters.modality = modality;
        }
        if (priority) {
            queryFilters['assignment.priority'] = priority;
        }

        console.log(`🔍 DOCTOR VALUES: Final query filters:`, JSON.stringify(queryFilters, null, 2));

        // 🔥 STEP 6: This single aggregation pipeline gets ALL the data we need efficiently.
        const pipeline = [
            { $match: queryFilters },
            {
                $group: {
                    _id: {
                        $switch: {
                            branches: [
                                { case: { $in: ['$workflowStatus', DOCTOR_STATUS_CATEGORIES.pending] }, then: 'pending' },
                                { case: { $in: ['$workflowStatus', DOCTOR_STATUS_CATEGORIES.inprogress] }, then: 'inprogress' },
                                { case: { $in: ['$workflowStatus', DOCTOR_STATUS_CATEGORIES.completed] }, then: 'completed' },
                            ],
                            default: 'unknown'
                        }
                    },
                    count: { $sum: 1 }
                }
            }
        ];

        const categoryCountsResult = await DicomStudy.aggregate(pipeline).allowDiskUse(true);

        const counts = { pending: 0, inprogress: 0, completed: 0, total: 0 };

        categoryCountsResult.forEach(group => {
            if (counts.hasOwnProperty(group._id)) {
                counts[group._id] = group.count;
            }
        });

        counts.total = counts.pending + counts.inprogress + counts.completed;
        const allStudiesCount = await DicomStudy.countDocuments({ // Get total for the 'All' tab
             $or: [
                { 'lastAssignedDoctor.doctorId': doctor._id },
                { 'assignment.assignedTo': doctor._id }
            ]
        });

        const processingTime = Date.now() - startTime;
        console.log(`🎯 DOCTOR VALUES: Dashboard values calculated - Total: ${counts.total}, Pending: ${counts.pending}, InProgress: ${counts.inprogress}, Completed: ${counts.completed}`);

        const response = {
            success: true,
            all: allStudiesCount, // This is the unfiltered total for the "All" button
            total: counts.total,  // This is the total for the currently active filter set
            pending: counts.pending,
            inprogress: counts.inprogress,
            completed: counts.completed,
            performance: { queryTime: processingTime }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error('❌ DOCTOR VALUES: Error fetching dashboard values:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching dashboard statistics.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


export const startReport = async (req, res) => {
    try {
        const { studyId } = req.params;

        // 🔧 PERFORMANCE: Find doctor with lean query
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        // 🔧 OPTIMIZED: Single query with update
        const study = await DicomStudy.findOneAndUpdate(
            {
                _id: studyId,
                lastAssignedDoctor: doctor._id
            },
            {
                $set: {
                    workflowStatus: 'report_in_progress',
                    reportStartedAt: new Date()
                },
                $push: {
                    statusHistory: {
                        status: 'report_in_progress',
                        changedAt: new Date(),
                        changedBy: req.user._id,
                        note: 'Doctor started working on report'
                    }
                }
            },
            { new: true }
        );

        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found or not assigned to you'
            });
        }

        res.json({
            success: true,
            message: 'Report started successfully'
        });

    } catch (error) {
        console.error('Error starting report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start report'
        });
    }
};

// 🔧 OPTIMIZED: submitReport (same name, enhanced performance)
export const submitReport = async (req, res) => {
    try {
        const { studyId } = req.params;
        const { reportContent, findings, impression, recommendations } = req.body;

        // 🔧 PERFORMANCE: Find doctor with lean query
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        // 🔧 OPTIMIZED: Single atomic update
        const study = await DicomStudy.findOneAndUpdate(
            {
                _id: studyId,
                lastAssignedDoctor: doctor._id
            },
            {
                $set: {
                    reportContent: {
                        content: reportContent,
                        findings: findings,
                        impression: impression,
                        recommendations: recommendations,
                        finalizedBy: doctor._id,
                        finalizedAt: new Date()
                    },
                    workflowStatus: 'report_finalized',
                    reportFinalizedAt: new Date()
                },
                $push: {
                    statusHistory: {
                        status: 'report_finalized',
                        changedAt: new Date(),
                        changedBy: req.user._id,
                        note: 'Report finalized by doctor'
                    }
                }
            },
            { new: true }
        );

        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found or not assigned to you'
            });
        }

        res.json({
            success: true,
            message: 'Report submitted successfully'
        });

    } catch (error) {
        console.error('Error submitting report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit report'
        });
    }
};

// 🔧 OPTIMIZED: getDoctorStats (same name, enhanced performance)
export const getDoctorStats = async (req, res) => {
    try {
        // 🔧 PERFORMANCE: Find doctor with lean query
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        // 🔧 CRITICAL: Parallel aggregation queries for performance
        const [
            totalAssigned,
            pending,
            inProgress,
            completed,
            urgentStudies
        ] = await Promise.all([
            DicomStudy.countDocuments({ lastAssignedDoctor: doctor._id }),
            DicomStudy.countDocuments({
                lastAssignedDoctor: doctor._id,
                workflowStatus: 'assigned_to_doctor'
            }),
            DicomStudy.countDocuments({
                lastAssignedDoctor: doctor._id,
                workflowStatus: 'report_in_progress'
            }),
            DicomStudy.countDocuments({
                lastAssignedDoctor: doctor._id,
                workflowStatus: 'report_finalized'
            }),
            DicomStudy.countDocuments({
                lastAssignedDoctor: doctor._id,
                caseType: { $in: ['URGENT', 'EMERGENCY'] },
                workflowStatus: { $in: ['assigned_to_doctor', 'report_in_progress'] }
            })
        ]);

        res.json({
            success: true,
            data: {
                totalAssigned,
                pending,
                inProgress,
                completed,
                urgentStudies,
                assignmentStats: doctor.assignmentStats || {}
            }
        });

    } catch (error) {
        console.error('Error fetching doctor stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch doctor statistics'
        });
    }
};

// 🆕 NEW: Get pending studies for doctor (studies assigned but not started)
export const getPendingStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = Math.min(parseInt(req.query.limit) || 100, 1000);

        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor profile not found' });
        }

        console.log(`🔍 DOCTOR PENDING: Fetching pending studies for doctor: ${doctor._id}`);

        const { 
            search, modality, labId, priority, patientName, 
            quickDatePreset, customDateFrom, customDateTo
        } = req.query;

        // 🔥 STEP 1: Optimized date range determination with pre-calculated timestamps
        let filterStartDate = null;
        let filterEndDate = null;
        const now = new Date();
              // Replace your existing date filtering logic with this:
if (req.query.quickDatePreset || req.query.dateFilter) {
    const preset = req.query.quickDatePreset || req.query.dateFilter;
    const now = Date.now();
    const IST_OFFSET = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds
    
    switch (preset) {
        case 'last24h':
            filterStartDate = new Date(now - 86400000);
            filterEndDate = new Date(now);
            break;

        case 'today':
            // ✅ IST FIX: Today in IST timezone
            const currentTimeIST = new Date(Date.now() + IST_OFFSET);
            const todayStartIST = new Date(
                currentTimeIST.getFullYear(),
                currentTimeIST.getMonth(),
                currentTimeIST.getDate(),
                0, 0, 0, 0
            );
            const todayEndIST = new Date(
                currentTimeIST.getFullYear(),
                currentTimeIST.getMonth(),
                currentTimeIST.getDate(),
                23, 59, 59, 999
            );
            filterStartDate = new Date(todayStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(todayEndIST.getTime() - IST_OFFSET);
            break;

        case 'yesterday':
            // ✅ IST FIX: Yesterday in IST timezone
            const currentTimeISTYesterday = new Date(Date.now() + IST_OFFSET);
            const yesterdayIST = new Date(currentTimeISTYesterday.getTime() - 86400000);
            const yesterdayStartIST = new Date(
                yesterdayIST.getFullYear(),
                yesterdayIST.getMonth(),
                yesterdayIST.getDate(),
                0, 0, 0, 0
            );
            const yesterdayEndIST = new Date(
                yesterdayIST.getFullYear(),
                yesterdayIST.getMonth(),
                yesterdayIST.getDate(),
                23, 59, 59, 999
            );
            filterStartDate = new Date(yesterdayStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(yesterdayEndIST.getTime() - IST_OFFSET);
            break;

        case 'thisWeek':
            // ✅ IST FIX: This week in IST timezone
            const currentTimeISTWeek = new Date(Date.now() + IST_OFFSET);
            
            // Get start of week (Sunday) in IST
            const dayOfWeek = currentTimeISTWeek.getDay(); // 0 = Sunday, 1 = Monday, etc.
            const weekStartIST = new Date(
                currentTimeISTWeek.getFullYear(),
                currentTimeISTWeek.getMonth(),
                currentTimeISTWeek.getDate() - dayOfWeek,
                0, 0, 0, 0
            );
            
            // End is current time in IST
            const weekEndIST = new Date(currentTimeISTWeek.getTime());
            
            // Convert IST times back to UTC for MongoDB query
            filterStartDate = new Date(weekStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(weekEndIST.getTime() - IST_OFFSET);
            break;

        case 'thisMonth':
            // ✅ FIX: This month in IST timezone
            const currentTimeISTMonth = new Date(Date.now() + IST_OFFSET);
            
            // Get start of month in IST
            const monthStartIST = new Date(
                currentTimeISTMonth.getFullYear(),
                currentTimeISTMonth.getMonth(),
                1,
                0, 0, 0, 0
            );
            
            // End is current time in IST
            const monthEndIST = new Date(currentTimeISTMonth.getTime());
            
            // Convert IST times back to UTC for MongoDB query
            filterStartDate = new Date(monthStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(monthEndIST.getTime() - IST_OFFSET);
            break;

        case 'custom':
            if (req.query.customDateFrom || req.query.customDateTo) {
                // ✅ IST FIX: Custom dates in IST
                if (req.query.customDateFrom) {
                    const customStartIST = new Date(req.query.customDateFrom + 'T00:00:00');
                    filterStartDate = new Date(customStartIST.getTime() - IST_OFFSET);
                }
                if (req.query.customDateTo) {
                    const customEndIST = new Date(req.query.customDateTo + 'T23:59:59');
                    filterEndDate = new Date(customEndIST.getTime() - IST_OFFSET);
                }
            } else {
                filterStartDate = new Date(now - 86400000);
                filterEndDate = new Date(now);
            }
            break;

        default:
            filterStartDate = new Date(now - 86400000);
            filterEndDate = new Date(now);
    }
} else {
    // ✅ IST FIX: Default to today in IST when no filter specified
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const currentTimeISTDefault = new Date(Date.now() + IST_OFFSET);
    const todayStartISTDefault = new Date(
        currentTimeISTDefault.getFullYear(),
        currentTimeISTDefault.getMonth(),
        currentTimeISTDefault.getDate(),
        0, 0, 0, 0
    );
    const todayEndISTDefault = new Date(
        currentTimeISTDefault.getFullYear(),
        currentTimeISTDefault.getMonth(),
        currentTimeISTDefault.getDate(),
        23, 59, 59, 999
    );
    filterStartDate = new Date(todayStartISTDefault.getTime() - IST_OFFSET);
    filterEndDate = new Date(todayEndISTDefault.getTime() - IST_OFFSET);
}

        // 🔥 STEP 2: Build the core query. The structure changes based on whether a date filter is active.
        let baseQuery;
        if (filterStartDate && filterEndDate) {
            console.log(`📅 DOCTOR PENDING: Applying ASSIGNMENT DATE filter from ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()}`);
            baseQuery = {
                $or: [
                    { lastAssignedDoctor: { $elemMatch: { doctorId: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } },
                    { assignment: { $elemMatch: { assignedTo: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } }
                ]
            };
        } else {
            baseQuery = {
                $or: [
                    { 'lastAssignedDoctor.doctorId': doctor._id },
                    { 'assignment.assignedTo': doctor._id }
                ]
            };
        }

        // 🔧 STEP 3: Optimized query filters with better type handling
        let queryFilters = { 
            ...baseQuery,
            workflowStatus: { $in: DOCTOR_STATUS_CATEGORIES.pending }
        };

        if (search) {
            queryFilters.$text = { $search: search };
        }
        if (modality) {
            queryFilters.modality = modality;
        }
        if (labId) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(labId);
        }
        if (priority) {
            // Handle priority in date-filtered queries
            if (filterStartDate && filterEndDate) {
                baseQuery.$or.forEach(condition => {
                    const key = Object.keys(condition)[0];
                    condition[key].$elemMatch.priority = priority;
                });
                queryFilters = { ...baseQuery, workflowStatus: { $in: DOCTOR_STATUS_CATEGORIES.pending } };
            } else {
                queryFilters['assignment.priority'] = priority;
            }
        }

        console.log(`🔍 DOCTOR PENDING: Query filters:`, JSON.stringify(queryFilters, null, 2));

        // 🔥 STEP 4: Ultra-optimized aggregation pipeline
        const pipeline = [
            // 🔥 CRITICAL: Start with most selective match first
            { $match: queryFilters },
            
            // 🔥 PERFORMANCE: Sort before project to use index efficiently
            { $sort: { 'assignment.assignedAt': -1, createdAt: -1 } },
            
            // 🔥 CRITICAL: Limit early to reduce pipeline processing
            { $limit: limit },
            
            // 🔥 PERFORMANCE: Project only essential fields after limiting
            {
                $project: {
                    _id: 1,
                    orthancStudyID: 1,
                    studyInstanceUID: 1,
                    accessionNumber: 1,
                    workflowStatus: 1,
                                        modalitiesInStudy: 1,

                    modality: 1,
                    examDescription: 1,
                    studyDescription: 1,
                    seriesCount: 1,
                    instanceCount: 1,
                    seriesImages: 1,
                    studyDate: 1,
                    studyTime: 1,
                    createdAt: 1,
                    ReportAvailable: 1,
                    clinicalHistory: 1,
                    doctorReports: 1,
                    caseType: 1,
                    assignment: 1,
                    lastAssignedDoctor: 1,
                    patient: 1,
                    sourceLab: 1,
                    patientInfo: 1, // Keep denormalized patient data
                    age:1,
                    gender:1,
                    clinicalHistory: 1,
                    preProcessedDownload: 1
                }
            },
            
            // Add currentCategory field
            { $addFields: { currentCategory: 'pending' } }
        ];

        // 🔥 STEP 5: Execute optimized parallel queries
        console.log(`🚀 Executing optimized query...`);
        const queryStart = Date.now();
        
        // Use Promise.allSettled for better error handling
        const [studiesResult, totalCountResult] = await Promise.allSettled([
            DicomStudy.aggregate(pipeline).allowDiskUse(false),
            patientName ? 
                DicomStudy.aggregate([
                    { $match: queryFilters },
                    { $match: { $or: [
                        { 'patientInfo.patientName': { $regex: patientName, $options: 'i' } },
                        { 'patientInfo.patientID': { $regex: patientName, $options: 'i' } }
                    ]}},
                    { $count: "total" }
                ]).allowDiskUse(false) :
                DicomStudy.countDocuments(queryFilters)
        ]);

        // Handle potential errors
        if (studiesResult.status === 'rejected') {
            throw new Error(`Studies query failed: ${studiesResult.reason.message}`);
        }
        if (totalCountResult.status === 'rejected') {
            console.warn('Count query failed, using studies length:', totalCountResult.reason.message);
        }

        let studies = studiesResult.value;
        let totalStudies = totalCountResult.status === 'fulfilled' ? 
            (patientName ? (totalCountResult.value[0]?.total || 0) : totalCountResult.value) : 
            studies.length;

        const queryTime = Date.now() - queryStart;
        console.log(`⚡ Core query completed in ${queryTime}ms - found ${studies.length} studies`);

        // 🔥 STEP 6: Apply patientName filter after aggregation if needed
        if (patientName && studies.length > 0) {
            const filterStart = Date.now();
            studies = studies.filter(study => {
                const patientInfo = study.patientInfo;
                if (!patientInfo) return false;
                
                const nameMatch = patientInfo.patientName && 
                    patientInfo.patientName.toLowerCase().includes(patientName.toLowerCase());
                const idMatch = patientInfo.patientID && 
                    patientInfo.patientID.toLowerCase().includes(patientName.toLowerCase());
                
                return nameMatch || idMatch;
            });
            console.log(`🔍 Patient name filter completed in ${Date.now() - filterStart}ms`);
        }

        // 🔥 STEP 7: Optimized batch lookups with connection pooling awareness
        const lookupMaps = {
            patients: new Map(),
            labs: new Map()
        };

        if (studies.length > 0) {
            const lookupStart = Date.now();
            
            // Extract unique IDs with Set for deduplication
            const uniqueIds = {
                patients: [...new Set(studies.map(s => s.patient?.toString()).filter(Boolean))],
                labs: [...new Set(studies.map(s => s.sourceLab?.toString()).filter(Boolean))]
            };

            // 🔥 PARALLEL: Optimized batch lookups with lean queries
            const lookupPromises = [];

            if (uniqueIds.patients.length > 0) {
                lookupPromises.push(
                    mongoose.model('Patient')
                        .find({ _id: { $in: uniqueIds.patients.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('patientID firstName lastName patientNameRaw gender ageString computed.fullName clinicalInfo.clinicalHistory')
                        .lean()
                        .then(results => ({ type: 'patients', data: results }))
                );
            }

            if (uniqueIds.labs.length > 0) {
                lookupPromises.push(
                    mongoose.model('Lab')
                        .find({ _id: { $in: uniqueIds.labs.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('name identifier')
                        .lean()
                        .then(results => ({ type: 'labs', data: results }))
                );
            }

            // Execute all lookups in parallel
            const lookupResults = await Promise.allSettled(lookupPromises);
            
            // Process results and build maps
            lookupResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    const { type, data } = result.value;
                    data.forEach(item => {
                        lookupMaps[type].set(item._id.toString(), item);
                    });
                } else {
                    console.warn(`Lookup failed for ${result.reason}`);
                }
            });
            
            const lookupTime = Date.now() - lookupStart;
            console.log(`🔍 Batch lookups completed in ${lookupTime}ms`);
        }

        // 🔥 STEP 8: Optimized formatting with pre-compiled data access
        const formatStart = Date.now();
        
        const formattedStudies = studies.map(study => {
            // Get related data from maps (faster than repeated lookups)
            const patientData = lookupMaps.patients.get(study.patient?.toString()) || study.patientInfo;
            const sourceLab = lookupMaps.labs.get(study.sourceLab?.toString());

            const hasWasabiZip = study.preProcessedDownload?.zipStatus === 'completed' && 
                    study.preProcessedDownload?.zipUrl &&
                    (!study.preProcessedDownload?.zipExpiresAt || 
                     study.preProcessedDownload.zipExpiresAt > new Date());

            // Use denormalized patient data first, fallback to lookup
            const patient = patientData || study.patientInfo;
            
            // Optimized assignment data extraction
            const assignmentData = (study.assignment && study.assignment.length > 0) ? 
                study.assignment[study.assignment.length - 1] : 
                (study.lastAssignedDoctor && study.lastAssignedDoctor.length > 0) ? 
                study.lastAssignedDoctor[study.lastAssignedDoctor.length - 1] : null;

            // Optimized patient display building
            let patientName = 'N/A';
            let patientId = 'N/A';
            const patientAgeGenderDisplay = study.age && study.gender ? 
                                `${study.age}/${study.gender}` : 
                                study.age || study.gender || 'N/A';

            if (patient) {
                patientName = patient.computed?.fullName || patient.patientNameRaw || 'N/A';
                patientId = patient.patientID || 'N/A';
            }

            // Optimized date formatting
            let studyDateTime = 'N/A';
            if (study.studyDate && study.studyTime) {
                studyDateTime = `${new Date(study.studyDate).toLocaleDateString()} ${study.studyTime.substring(0, 6)}`;
            } else if (study.studyDate) {
                studyDateTime = new Date(study.studyDate).toLocaleDateString();
            }

            return {
                _id: study._id,
                orthancStudyID: study.orthancStudyID,
                studyInstanceUID: study.studyInstanceUID,
                accessionNumber: study.accessionNumber,
                patientId: patientId,
                patientName: patientName,
                ageGender: patientAgeGenderDisplay,
                description: study.examDescription || study.studyDescription || 'N/A',
                modality: study.modalitiesInStudy?.length > 0 ? 
         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                location: sourceLab?.name || 'N/A',
                studyDateTime: study.studyDate && study.studyTime 
                    ? formatDicomDateTime(study.studyDate, study.studyTime)
                    : study.studyDate 
                        ? new Date(study.studyDate).toLocaleDateString('en-GB', {
                            year: 'numeric', month: 'short', day: '2-digit'
                        })
                        : 'N/A',
                uploadDateTime: study.createdAt
                    ? new Date(study.createdAt).toLocaleString('en-GB', {
                        timeZone: 'Asia/Kolkata', // <-- THIS IS THE FIX.
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }).replace(',', '')
                    : 'N/A',
                reportedDate: Array.isArray(study.doctorReports) && study.doctorReports.length > 0
                    ? (() => {
                        const latestReport = study.doctorReports[study.doctorReports.length - 1];
                        const reportDate = latestReport.finalizedAt || latestReport.createdAt;
                        return reportDate ? new Date(reportDate) : null;
                    })()
                    : null,
                downloadOptions: {
                    hasWasabiZip: hasWasabiZip,
                    hasR2Zip: hasWasabiZip,
                    wasabiFileName: study.preProcessedDownload?.zipFileName || null,
                    wasabiSizeMB: study.preProcessedDownload?.zipSizeMB || 0,
                    wasabiDownloadCount: study.preProcessedDownload?.downloadCount || 0,
                    wasabiCreatedAt: study.preProcessedDownload?.zipCreatedAt || null,
                    wasabiExpiresAt: study.preProcessedDownload?.zipExpiresAt || null,
                    zipStatus: study.preProcessedDownload?.zipStatus || 'not_started'
                },
                workflowStatus: study.workflowStatus,
                caseType: study.caseType || 'routine',
                currentCategory: study.currentCategory,
                priority: assignmentData?.priority || study.caseType?.toUpperCase() || 'NORMAL',
                assignedDate: assignmentData?.assignedAt,
                reportStartedAt: study.reportInfo?.startedAt,
                reportFinalizedAt: study.reportInfo?.finalizedAt,
                reportedBy: study.reportInfo?.reporterName || 'N/A',
                ReportAvailable: study.ReportAvailable || true,
                clinicalHistory: study?.clinicalHistory?.clinicalHistory || patient?.clinicalInfo?.clinicalHistory || ''
            };
        });

        // Optimized category counting
        const categoryCounts = { all: totalStudies, pending: 0, inprogress: 0, completed:  0 };
        formattedStudies.forEach(study => {
            if (study.currentCategory && categoryCounts.hasOwnProperty(study.currentCategory)) {
                categoryCounts[study.currentCategory]++;
            }
        });

        const formatTime = Date.now() - formatStart;
        const totalProcessingTime = Date.now() - startTime;

        console.log(`✅ DOCTOR COMPLETED: Formatting completed in ${formatTime}ms`);
        console.log(`🎯 DOCTOR COMPLETED: Total processing time: ${totalProcessingTime}ms for ${formattedStudies.length} studies`);

        res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalRecords: totalStudies,
            data: formattedStudies,
            pagination: {
                currentPage: 1,
                totalPages: Math.ceil(totalStudies / limit),
                totalRecords: totalStudies,
                limit: limit,
                hasNextPage: totalStudies > limit,
                hasPrevPage: false,
                recordRange: {
                    start: 1,
                    end: formattedStudies.length
                }
            },
            summary: {
                byCategory: { all: totalStudies, pending: 0, inprogress: 0, completed: totalStudies },
                urgentStudies: formattedStudies.filter(s => ['URGENT', 'EMERGENCY', 'STAT'].includes(s.priority)).length,
                total: totalStudies
            },
            performance: {
                queryTime: totalProcessingTime,
                recordsReturned: formattedStudies.length,
                breakdown: {
                    coreQuery: queryTime,
                    formatting: formatTime,
                    totalProcessing: totalProcessingTime
                }
            }
        });

    } catch (error) {
        console.error('❌ DOCTOR COMPLETED: Error fetching completed studies:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching completed studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


export const getCurrentDoctorProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log('🔍 Fetching doctor profile for user:', userId);
    
    const doctor = await Doctor.findOne({ userAccount: userId })
      .populate('userAccount', 'fullName email username')
      .lean();
    
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found'
      });
    }
    
    // Format response with signature
    const doctorProfile = {
      _id: doctor._id,
      fullName: doctor.userAccount.fullName,
      email: doctor.userAccount.email,
      username: doctor.userAccount.username,
      specialization: doctor.specialization,
      licenseNumber: doctor.licenseNumber,
      department: doctor.department,
      qualifications: doctor.qualifications,
      yearsOfExperience: doctor.yearsOfExperience,
      contactPhoneOffice: doctor.contactPhoneOffice,
      signature: doctor.signature, // Base64 signature
      signatureMetadata: doctor.signatureMetadata,
      isActive: doctor.isActiveProfile && doctor.userAccount.isActive
    };
    
    console.log('✅ Doctor profile found:', {
      name: doctorProfile.fullName,
      specialization: doctorProfile.specialization,
      hasSignature: !!doctorProfile.signature
    });
    
    res.json({
      success: true,
      doctor: doctorProfile
    });
    
  } catch (error) {
    console.error('❌ Error fetching doctor profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor profile',
      error: error.message
    });
  }
}






//     getAssignedStudies,
//     getPatientDetailedViewForDoctor,
//     startReport,
//     submitReport,
//     getDoctorStats
// };