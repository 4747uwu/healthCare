import Patient from '../models/patientModel.js';
import User from '../models/userModel.js';
import DicomStudy from '../models/dicomStudyModel.js';
import Doctor from '../models/doctorModel.js';
import Lab from '../models/labModel.js';
import Document from '../models/documentModal.js'; // 🔧 NEW: Document model
import WasabiService from '../services/wasabi.service.js'; // 🔧 NEW: Wasabi integration
import cache from '../utils/cache.js';
import websocketService from '../config/webSocket.js'; // 🔧 NEW: WebSocket service
import { findPatientFlexible } from '../utils/patientUtils.js';

// 🔧 WORKFLOW STATUS MAPPING (same as existing)
const WORKFLOW_STATUS_MAPPING = {
    'NEW': 'new_study_received',
    'PENDING': 'pending_assignment',
    'ASSIGNED': 'assigned_to_doctor',
    'IN_PROGRESS': 'report_in_progress',
    'COMPLETED': 'report_finalized',
    'DOWNLOADED': 'report_downloaded',
    'new_study_received': 'new_study_received',
    'pending_assignment': 'pending_assignment',
    'assigned_to_doctor': 'assigned_to_doctor',
    'report_in_progress': 'report_in_progress',
    'report_downloaded_radiologist': 'report_downloaded_radiologist',
    'report_finalized': 'report_finalized',
    'report_downloaded': 'report_downloaded',
    'final_report_downloaded': 'final_report_downloaded',
    'archived': 'archived'
};

const normalizeWorkflowStatus = (status) => {
    if (!status) return 'new_study_received';
    return WORKFLOW_STATUS_MAPPING[status] || 'new_study_received';
};

const sanitizeInput = (input) => {
    if (typeof input === 'string') {
        return input.trim();
    }
    return input;
};

// 🔧 OPTIMIZED: getPatientDetailedView (same name, enhanced performance)
export const getPatientDetailedView = async (req, res) => {
    try {
        const { patientId } = req.params;
        const { patientMongoId } = req.query; // ✅ ADD: Accept MongoDB ID
        const userId = req.user.id;

        console.log(`🔍 LabEdit fetching patient: patientId=${patientId}, mongoId=${patientMongoId}`);

        // ✅ CHANGED: Use flexible patient finding
        const patient = await findPatientFlexible(patientId, patientMongoId);

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // ✅ CHANGED: Use patient._id for all related queries
        const allStudies = await DicomStudy.find({ patient: patient._id })
            .select(`
                studyInstanceUID studyDate studyTime modality modalitiesInStudy 
                accessionNumber workflowStatus caseType examDescription examType 
                sourceLab uploadedReports createdAt referringPhysician referringPhysicianName
                assignment reportInfo.finalizedAt
                reportInfo.startedAt timingInfo numberOfSeries numberOfImages
                institutionName patientInfo studyPriority
                technologist physicians modifiedDate modifiedTime reportDate reportTime
            `)
            .populate('sourceLab', 'name identifier')
            // 🔧 FIXED: Correct populate path for assignment array
            .populate({
                path: 'assignment.assignedTo',
                model: 'User',
                select: 'fullName email'
            })
            .sort({ createdAt: -1 })
            .lean();

        // ✅ ADD: Include both IDs in response
        const responseData = {
            patientInfo: {
                patientMongoId: patient._id, // ✅ ADD: MongoDB ID
                patientId: patient.patientID,
                patientID: patient.patientID, // For compatibility
                fullName: patient.computed?.fullName || 
                         `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Unknown',
                firstName: patient.firstName || '',
                lastName: patient.lastName || '',
                age: patient.ageString || 'N/A',
                gender: patient.gender || 'N/A',
                dateOfBirth: patient.dateOfBirth || 'N/A',
                contactPhone: patient.contactInformation?.phone || 'N/A',
                contactEmail: patient.contactInformation?.email || 'N/A',
                mrn: patient.mrn || 'N/A'
            },
            clinicalInfo: {
                clinicalHistory: patient.clinicalInfo?.clinicalHistory || '',
                previousInjury: patient.clinicalInfo?.previousInjury || '',
                previousSurgery: patient.clinicalInfo?.previousSurgery || '',
                lastModifiedBy: patient.clinicalInfo?.lastModifiedBy || null,
                lastModifiedAt: patient.clinicalInfo?.lastModifiedAt || null
            },
            medicalHistory: {
                clinicalHistory: patient.medicalHistory?.clinicalHistory || patient.clinicalInfo?.clinicalHistory || '',
                previousInjury: patient.medicalHistory?.previousInjury || patient.clinicalInfo?.previousInjury || '',
                previousSurgery: patient.medicalHistory?.previousSurgery || patient.clinicalInfo?.previousSurgery || ''
            },
            // 🔧 ENHANCED: More comprehensive study info with NEW FIELDS
            studyInfo: currentStudy ? {
                studyId: currentStudy.studyInstanceUID,
                studyDate: currentStudy.studyDate,
                studyTime: currentStudy.studyTime || 'N/A',
                modality: currentStudy.modality || (currentStudy.modalitiesInStudy?.length > 0 ? currentStudy.modalitiesInStudy.join(', ') : 'N/A'),
                modalitiesInStudy: currentStudy.modalitiesInStudy || [],
                accessionNumber: currentStudy.accessionNumber || 'N/A',
                status: currentStudy.workflowStatus,
                caseType: currentStudy.caseType || 'routine',
                workflowStatus: currentStudy.workflowStatus,
                examDescription: currentStudy.examDescription || 'N/A',
                institutionName: currentStudy.institutionName || currentStudy.sourceLab?.name || 'N/A',
                numberOfSeries: currentStudy.numberOfSeries || 0,
                numberOfImages: currentStudy.numberOfImages || 0,
                seriesImages: `${currentStudy.numberOfSeries || 0}/${currentStudy.numberOfImages || 0}`,
                
                // 🆕 NEW: Priority and case information
                studyPriority: currentStudy.studyPriority || 'SELECT',
                // 🔧 FIXED: Handle assignment array - get the latest assignment
                priorityLevel: currentStudy.assignment?.length > 0 ? currentStudy.assignment[currentStudy.assignment.length - 1].priority || 'NORMAL' : 'NORMAL',
                
                // 🆕 NEW: Time tracking information
                modifiedDate: currentStudy.modifiedDate || null,
                modifiedTime: currentStudy.modifiedTime || 'N/A',
                reportDate: currentStudy.reportDate || null,
                reportTime: currentStudy.reportTime || 'N/A',
                
                // 🆕 NEW: Technologist information
                technologist: currentStudyTechnologist,
                
                // 🆕 NEW: Enhanced physician information
                physicians: {
                    referring: currentStudyReferringPhysician,
                    requesting: currentStudyRequestingPhysician
                },
                
                images: [],
                tat: currentStudyTAT,
                // 🔧 FIXED: Handle assignment array - get the latest assigned doctor
                assignedDoctor: currentStudy.assignment?.length > 0 ? 
                    currentStudy.assignment[currentStudy.assignment.length - 1].assignedTo?.fullName || 'Not Assigned' : 'Not Assigned',
                assignedAt: currentStudy.assignment?.length > 0 ? 
                    currentStudy.assignment[currentStudy.assignment.length - 1].assignedAt || null : null,
                reportStartedAt: currentStudy.reportInfo?.startedAt || null,
                reportFinalizedAt: currentStudy.reportInfo?.finalizedAt || null
            } : {},
            
            // 🔧 ENHANCED: Visit info with NEW FIELDS
            visitInfo: {
                examDescription: currentStudy?.examDescription || 'N/A',
                examType: currentStudy?.examType || 'N/A',
                center: currentStudy?.sourceLab?.name || 'Default Lab',
                labIdentifier: currentStudy?.sourceLab?.identifier || 'N/A',
                studyDate: currentStudy?.studyDate || 'N/A',
                studyTime: currentStudy?.studyTime || 'N/A',
                caseType: currentStudy?.caseType?.toUpperCase() || 'ROUTINE',
                studyStatus: currentStudy?.workflowStatus || 'N/A',
                orderDate: currentStudy?.createdAt || 'N/A',
                reportDate: currentStudy?.reportInfo?.finalizedAt || 'N/A',
                
                // 🆕 NEW: Enhanced physician info in visit
                referringPhysician: currentStudyReferringPhysician.name,
                referringPhysicianEmail: currentStudyReferringPhysician.email,
                referringPhysicianMobile: currentStudyReferringPhysician.mobile,
                referringPhysicianInstitution: currentStudyReferringPhysician.institution,
                referringPhysicianContact: currentStudyReferringPhysician.contactInfo || 'N/A',
                
                // 🆕 NEW: Requesting physician info
                requestingPhysician: currentStudyRequestingPhysician.name,
                requestingPhysicianEmail: currentStudyRequestingPhysician.email,
                requestingPhysicianMobile: currentStudyRequestingPhysician.mobile,
                requestingPhysicianInstitution: currentStudyRequestingPhysician.institution,
                
                // 🆕 NEW: Priority information
                studyPriority: currentStudy?.studyPriority || 'SELECT',
                // 🔧 FIXED: Handle assignment array
                priorityLevel: currentStudy?.assignment?.length > 0 ? 
                    currentStudy.assignment[currentStudy.assignment.length - 1].priority || 'NORMAL' : 'NORMAL',
                
                // 🆕 NEW: Time information
                modifiedDate: currentStudy?.modifiedDate || 'N/A',
                modifiedTime: currentStudy?.modifiedTime || 'N/A',
                reportDate: currentStudy?.reportDate || 'N/A',
                reportTime: currentStudy?.reportTime || 'N/A',
                
                // 🆕 NEW: Technologist info
                technologistName: currentStudyTechnologist.name,
                technologistMobile: currentStudyTechnologist.mobile,
                technologistComments: currentStudyTechnologist.comments,
                technologistReasonToSend: currentStudyTechnologist.reasonToSend
            },
            
            // 🔧 ENHANCED: All studies with NEW FIELDS
            allStudies: allStudies.map(study => {
                const studyTAT = calculateTAT(study);
                const studyReferringPhysician = getReferringPhysician(study);
                const studyRequestingPhysician = getRequestingPhysician(study);
                const studyTechnologist = getTechnologistInfo(study);
                
                return {
                    studyId: study.studyInstanceUID,
                    studyDate: study.studyDate,
                    studyTime: study.studyTime || 'N/A',
                    modality: study.modality || (study.modalitiesInStudy?.length > 0 ? study.modalitiesInStudy.join(', ') : 'N/A'),
                    accessionNumber: study.accessionNumber || 'N/A',
                    status: study.workflowStatus,
                    examDescription: study.examDescription || 'N/A',
                    caseType: study.caseType || 'routine',
                    
                    // 🆕 NEW: Priority information
                    studyPriority: study.studyPriority || 'SELECT',
                    // 🔧 FIXED: Handle assignment array
                    priorityLevel: study.assignment?.length > 0 ? 
                        study.assignment[study.assignment.length - 1].priority || 'NORMAL' : 'NORMAL',
                    modifiedDate: study.modifiedDate || null,
                    modifiedTime: study.modifiedTime || 'N/A',
                    reportDate: study.reportDate || null,
                    reportTime: study.reportTime || 'N/A',
                    
                    // 🆕 NEW: Enhanced physician information
                    referringPhysician: studyReferringPhysician.name,
                    referringPhysicianEmail: studyReferringPhysician.email,
                    referringPhysicianMobile: studyReferringPhysician.mobile,
                    referringPhysicianInstitution: studyReferringPhysician.institution,
                    requestingPhysician: studyRequestingPhysician.name,
                    requestingPhysicianEmail: studyRequestingPhysician.email,
                    
                    // 🆕 NEW: Technologist information
                    technologist: studyTechnologist,
                    
                    // 🔧 FIXED: Handle assignment array
                    assignedDoctor: study.assignment?.length > 0 ? 
                        study.assignment[study.assignment.length - 1].assignedTo?.userAccount?.fullName || 'Not Assigned' : 'Not Assigned',
                    tat: {
                        totalDays: studyTAT.totalTATDays,
                        totalDaysFormatted: studyTAT.totalTATDays !== null ? `${studyTAT.totalTATDays} days` : 'N/A',
                        studyToReportFormatted: studyTAT.studyToReportTAT ? formatTAT(studyTAT.studyToReportTAT) : 'N/A',
                        uploadToReportFormatted: studyTAT.uploadToReportTAT ? formatTAT(studyTAT.uploadToReportTAT) : 'N/A'
                    }
                };
            }),
            
            // 🔧 ENHANCED: Include studies array for compatibility with NEW FIELDS
            studies: allStudies.map(study => {
                const studyTAT = calculateTAT(study);
                const studyReferringPhysician = getReferringPhysician(study);
                const studyRequestingPhysician = getRequestingPhysician(study);
                const studyTechnologist = getTechnologistInfo(study);
                
                return {
                    _id: study._id,
                    studyInstanceUID: study.studyInstanceUID,
                    accessionNumber: study.accessionNumber || 'N/A',
                    studyDateTime: study.studyDate,
                    studyTime: study.studyTime || 'N/A',
                    modality: study.modality || (study.modalitiesInStudy?.length > 0 ? study.modalitiesInStudy.join(', ') : 'N/A'),
                    modalitiesInStudy: study.modalitiesInStudy || [],
                    description: study.examDescription || 'N/A',
                    workflowStatus: study.workflowStatus,
                    priority: study.caseType?.toUpperCase() || 'ROUTINE',
                    location: study.sourceLab?.name || 'Default Lab',
                    // 🔧 FIXED: Handle assignment array
                    assignedDoctor: study.assignment?.length > 0 ? 
                        study.assignment[study.assignment.length - 1].assignedTo?.userAccount?.fullName || 'Not Assigned' : 'Not Assigned',
                    reportFinalizedAt: study.reportInfo?.finalizedAt,
                    numberOfSeries: study.numberOfSeries || 0,
                    numberOfImages: study.numberOfImages || 0,
                    
                    // 🆕 NEW: Enhanced study information
                    studyPriority: study.studyPriority || 'SELECT',
                    // 🔧 FIXED: Handle assignment array
                    priorityLevel: study.assignment?.length > 0 ? 
                        study.assignment[study.assignment.length - 1].priority || 'NORMAL' : 'NORMAL',
                    modifiedDate: study.modifiedDate,
                    modifiedTime: study.modifiedTime,
                    reportDate: study.reportDate,
                    reportTime: study.reportTime,
                    
                    // 🆕 NEW: Complete physician information
                    physicians: {
                        referring: studyReferringPhysician,
                        requesting: studyRequestingPhysician
                    },
                    referringPhysician: studyReferringPhysician.name,
                    referringPhysicianInstitution: studyReferringPhysician.institution,
                    referringPhysicianEmail: studyReferringPhysician.email,
                    referringPhysicianMobile: studyReferringPhysician.mobile,
                    requestingPhysician: studyRequestingPhysician.name,
                    
                    // 🆕 NEW: Technologist information
                    technologist: studyTechnologist,
                    
                    tat: studyTAT
                };
            }),
            
            // 🆕 NEW: Enhanced referring physicians with requesting physicians
            referringPhysicians: {
                current: {
                    referring: currentStudyReferringPhysician,
                    requesting: currentStudyRequestingPhysician
                },
                all: allReferringPhysicians,
                count: allReferringPhysicians.length
            },
            
            // 🆕 NEW: Technologist information summary
            technologists: {
                current: currentStudyTechnologist,
                all: allStudies.map(study => getTechnologistInfo(study))
                             .filter(tech => tech.name !== 'N/A')
                             .reduce((unique, tech) => {
                                 if (!unique.find(t => t.name === tech.name)) {
                                     unique.push(tech);
                                 }
                                 return unique;
                             }, [])
            },
            
            // 🆕 NEW: Priority and case type summary
            prioritySummary: {
                currentStudyPriority: currentStudy?.studyPriority || 'SELECT',
                currentPriorityLevel: currentStudy?.assignment?.priority || 'NORMAL',
                currentCaseType: currentStudy?.caseType || 'routine',
                allPriorities: [...new Set(allStudies.map(s => s.studyPriority).filter(Boolean))],
                allCaseTypes: [...new Set(allStudies.map(s => s.caseType).filter(Boolean))]
            },
            
            documents: patient.documents || [],
            studyReports: studyReports,
            referralInfo: patient.referralInfo || '',
            
            summary: {
                totalStudies: allStudies.length,
                completedStudies: allStudies.filter(s => ['report_finalized', 'report_downloaded', 'final_report_downloaded'].includes(s.workflowStatus)).length,
                pendingStudies: allStudies.filter(s => ['new_study_received', 'pending_assignment', 'assigned_to_doctor', 'report_in_progress'].includes(s.workflowStatus)).length,
                averageTAT: allStudies.length > 0 ? 
                    Math.round(allStudies.reduce((sum, study) => {
                        const tat = calculateTAT(study);
                        return sum + (tat.totalTATDays || 0);
                    }, 0) / allStudies.length) : 0,
                
                // 🆕 NEW: Enhanced summary statistics
                emergencyCases: allStudies.filter(s => s.studyPriority === 'Emergency Case').length,
                mlcCases: allStudies.filter(s => s.studyPriority === 'MLC Case').length,
                referralCases: allStudies.filter(s => s.studyPriority === 'Meet referral doctor').length,
                uniqueTechnologists: [...new Set(allStudies.map(s => s.technologist?.name).filter(Boolean))].length,
                uniqueReferringPhysicians: [...new Set(allStudies.map(s => getReferringPhysician(s).name).filter(name => name !== 'N/A'))].length
            }
        };

        // 🔧 PERFORMANCE: Cache the result
        // cache.set(cacheKey, responseData, 180); // 3 minutes

        console.log('✅ Patient detailed view fetched successfully with ALL NEW FIELDS');
        console.log(`📊 Enhanced Summary: ${responseData.summary.totalStudies} studies, ${responseData.summary.emergencyCases} emergency, ${responseData.summary.uniqueTechnologists} technologists`);

        res.json({
            success: true,
            data: responseData,
            fromCache: false
        });

    } catch (error) {
        console.error('❌ Error in labEdit getPatientDetailedView:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching patient details',
            error: error.message
        });
    }
};

export const resetStudyTAT = async (req, res) => {
  try {
    const { studyId } = req.params;
    const { reason = 'manual_reset' } = req.body;
    const userId = req.user?.id;
    
    console.log(`[TAT Reset] 🔄 Resetting TAT for study: ${studyId}`);
    
    // Find the study by studyInstanceUID
    const study = await DicomStudy.findOne({ studyInstanceUID: studyId })
      .populate('patient', 'patientID patientNameRaw')
      .populate('assignment.assignedTo', 'fullName');
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }
    
    const resetTime = new Date();
    const previousResetCount = study.timingInfo?.tatResetCount || 0;
    const newResetCount = previousResetCount + 1;
    
    console.log(`[TAT Reset] Current workflow status: ${study.workflowStatus}`);
    console.log(`[TAT Reset] Assigned to: ${study.assignment?.assignedTo?.fullName || 'None'}`);
    
    // 🔧 RESET KEY TIMESTAMPS
    
    // 1. Reset study creation time (Phase 1 baseline)
    study.createdAt = resetTime;
    
    // 2. Reset assignment time if doctor is assigned (Phase 2 baseline)
    if (study.assignment?.assignedTo) {
      study.assignment.assignedAt = resetTime;
      console.log(`[TAT Reset] ✅ Reset assignment time for assigned doctor`);
    }
    
    // 3. Reset report start time if report is in progress (Phase 3 baseline)
    if (['report_in_progress', 'report_drafted', 'report_finalized'].includes(study.workflowStatus)) {
      if (study.reportInfo) {
        study.reportInfo.startedAt = resetTime;
        // Clear completion times so TAT calculation continues
        study.reportInfo.finalizedAt = null;
        study.reportInfo.downloadedAt = null;
        console.log(`[TAT Reset] ✅ Reset report timing`);
      }
    }
    
    // 4. Reset stored TAT values to zero
    study.timingInfo = {
      uploadToAssignmentMinutes: 0,
      assignmentToReportMinutes: 0,
      reportToDownloadMinutes: 0,
      totalTATMinutes: 0,
      tatResetAt: resetTime,
      tatResetReason: reason,
      tatResetCount: newResetCount
    };
    
    // 5. Add status history entry
    study.statusHistory.push({
      status: study.workflowStatus,
      changedAt: resetTime,
      changedBy: userId,
      note: `TAT reset (Reset #${newResetCount}): ${reason}. All timing counters reset to zero.`
    });
    
    // Save the study
    await study.save();
    
    console.log(`[TAT Reset] ✅ TAT reset completed for study: ${studyId} (Reset #${newResetCount})`);
    
    // Send WebSocket notification
    try {
      await websocketService.notifySimpleNewStudy();
      console.log(`[TAT Reset] 📢 WebSocket notification sent`);
    } catch (wsError) {
      console.error(`[TAT Reset] ⚠️ WebSocket notification failed:`, wsError.message);
    }
    
    res.json({
      success: true,
      message: `TAT reset successfully (Reset #${newResetCount})`,
      data: {
        studyId: studyId,
        resetCount: newResetCount,
        resetAt: resetTime,
        resetReason: reason,
        timingsReset: {
          createdAt: resetTime,
          assignedAt: study.assignment?.assignedAt || null,
          reportStartedAt: study.reportInfo?.startedAt || null
        },
        currentTAT: {
          uploadToAssignmentMinutes: 0,
          assignmentToReportMinutes: 0,
          reportToDownloadMinutes: 0,
          totalTATMinutes: 0
        }
      }
    });
    
  } catch (error) {
    console.error('[TAT Reset] ❌ Error resetting TAT:', error);
    res.status(500).json({ 
      error: error.message,
      message: 'Failed to reset TAT'
    });
  }
};

const resetTATForPatientStudies = async (patientObjectId, changeInfo, userId) => {
  console.log(`[TAT Reset Helper] 🔄 Starting TAT reset for patient: ${patientObjectId}`);
  
  const activeStudies = await DicomStudy.find({
      patient: patientObjectId,
      workflowStatus: { 
          $nin: ['archived', 'final_report_downloaded'] 
      }
  });
  
  console.log(`[TAT Reset Helper] 📊 Found ${activeStudies.length} active studies`);
  
  if (activeStudies.length === 0) {
      return {
          success: true,
          affectedStudiesCount: 0,
          message: 'No active studies to reset'
      };
  }
  
  const resetTime = new Date();
  let successCount = 0;
  const resetDetails = [];
  const updatedStudies = [];
  
  for (const study of activeStudies) {
      try {
          const newResetCount = (study.timingInfo?.tatResetCount || 0) + 1;
          
          console.log(`[TAT Reset] Processing study ${study.studyInstanceUID}`);
          console.log(`[TAT Reset] Current timestamps:`, {
              createdAt: study.createdAt,
              assignedAt: study.assignment?.assignedAt,
              reportStartedAt: study.reportInfo?.startedAt
          });
          
          // Store original values for audit
          const originalCreatedAt = study.createdAt;
          const originalAssignedAt = study.assignment?.assignedAt;
          const originalReportStartedAt = study.reportInfo?.startedAt;
          
          // 🔧 CRITICAL FIX: Reset the actual timestamps that TAT calculation uses
          study.createdAt = resetTime;
          
          // Reset Phase 2 baseline (assignment) if assigned
          if (study.assignment?.assignedTo) {
              study.assignment.assignedAt = resetTime;
              console.log(`[TAT Reset] ✅ Reset assignment time to: ${resetTime}`);
          }
          
          // Reset Phase 3 baseline (report start) if in progress
          if (['report_in_progress', 'report_drafted', 'report_finalized'].includes(study.workflowStatus)) {
              if (study.reportInfo) {
                  study.reportInfo.startedAt = resetTime;
                  console.log(`[TAT Reset] ✅ Reset report start time to: ${resetTime}`);
              }
          }
          
          // 🔧 CRITICAL FIX: Reset TAT counters to zero
          study.timingInfo = {
              uploadToAssignmentMinutes: 0,
              assignmentToReportMinutes: 0,
              reportToDownloadMinutes: 0,
              totalTATMinutes: 0,
              tatResetAt: resetTime,
              tatResetReason: 'clinical_history_change',
              tatResetCount: newResetCount,
              previousValues: {
                  originalCreatedAt,
                  originalAssignedAt,
                  originalReportStartedAt
              }
          };
          
          // Add status history
          study.statusHistory.push({
              status: study.workflowStatus,
              changedAt: resetTime,
              changedBy: userId,
              note: `TAT reset due to clinical history change (Reset #${newResetCount}). All timing counters reset to zero.`
          });
          
          await study.save();
          successCount++;
          
          // 🔧 CALCULATE FRESH TAT AFTER RESET
          const freshTAT = calculateTATForStudy(study);
          
          console.log(`[TAT Reset] Fresh TAT after reset:`, freshTAT);
          
          resetDetails.push({
              studyId: study.studyInstanceUID,
              resetCount: newResetCount,
              workflowStatus: study.workflowStatus,
              freshTAT: freshTAT
          });
          
          updatedStudies.push({
              studyInstanceUID: study.studyInstanceUID,
              tat: freshTAT,
              resetAt: resetTime,
              resetCount: newResetCount
          });
          
          console.log(`[TAT Reset Helper] ✅ TAT reset for study: ${study.studyInstanceUID} (Reset #${newResetCount})`);
          
      } catch (studyError) {
          console.error(`[TAT Reset Helper] ❌ Failed to reset TAT for study ${study.studyInstanceUID}:`, studyError.message);
      }
  }
  
  return {
      success: true,
      affectedStudiesCount: successCount,
      totalStudiesFound: activeStudies.length,
      resetDetails: resetDetails,
      resetTime: resetTime,
      changeInfo: changeInfo,
      updatedStudies: updatedStudies
  };
};
// 🆕 NEW: Helper function to calculate TAT for a single study (extract from getPatientDetailedView)
// 🔧 FIXED: Helper function to calculate TAT for a single study
// 🔧 STANDARDIZED: Unified TAT calculation function
const calculateTATForStudy = (study) => {
  if (!study) return getEmptyTAT();

  console.log(`[TAT Calc] Calculating TAT for study: ${study.studyInstanceUID}`);

  // 🔧 CRITICAL FIX: Handle study date in YYYYMMDD format
  let studyDate = null;
  if (study.studyDate) {
      if (typeof study.studyDate === 'string' && study.studyDate.length === 8) {
          // Handle YYYYMMDD format (like "19960308")
          const year = study.studyDate.substring(0, 4);
          const month = study.studyDate.substring(4, 6);
          const day = study.studyDate.substring(6, 8);
          studyDate = new Date(`${year}-${month}-${day}`);
      } else {
          studyDate = new Date(study.studyDate);
      }
      
      if (studyDate && isNaN(studyDate.getTime())) {
          console.log(`[TAT Calc] ⚠️ Invalid study date: ${study.studyDate}`);
          studyDate = null;
      }
  }

  const uploadDate = study.createdAt ? new Date(study.createdAt) : null;
  const assignedDate = study.assignment?.assignedAt ? new Date(study.assignment.assignedAt) : null;
  const reportDate = study.reportInfo?.finalizedAt ? new Date(study.reportInfo.finalizedAt) : null;
  const currentDate = new Date();

  const calculateMinutes = (start, end) => {
      if (!start || !end) return null;
      return Math.round((end - start) / (1000 * 60));
  };

  const calculateDays = (start, end) => {
      if (!start || !end) return null;
      return Math.round((end - start) / (1000 * 60 * 60 * 24));
  };

  // 🔧 CRITICAL: Calculate TAT based on what phase we're in
  const endDate = reportDate || currentDate;
  
  const result = {
      // Phase 1: Study to Upload
      studyToUploadTAT: studyDate && uploadDate ? calculateMinutes(studyDate, uploadDate) : null,
      
      // Phase 2: Upload to Assignment
      uploadToAssignmentTAT: uploadDate && assignedDate ? calculateMinutes(uploadDate, assignedDate) : null,
      
      // Phase 3: Assignment to Report
      assignmentToReportTAT: assignedDate && reportDate ? calculateMinutes(assignedDate, reportDate) : null,
      
      // End-to-End TAT calculations
      studyToReportTAT: studyDate && reportDate ? calculateMinutes(studyDate, reportDate) : null,
      uploadToReportTAT: uploadDate && reportDate ? calculateMinutes(uploadDate, reportDate) : null,
      
      // Total TAT (from upload baseline to current/report)
      totalTATDays: uploadDate ? calculateDays(uploadDate, endDate) : null,
      totalTATMinutes: uploadDate ? calculateMinutes(uploadDate, endDate) : null,
      
      // Reset-aware TAT (for studies that had TAT reset)
      resetAwareTATDays: uploadDate ? calculateDays(uploadDate, currentDate) : null,
      
      // Formatted versions for display
      studyToReportTATFormatted: null,
      uploadToReportTATFormatted: null,
      assignmentToReportTATFormatted: null,
      totalTATFormatted: null
  };

  // Apply formatting
  if (result.studyToReportTAT) {
      result.studyToReportTATFormatted = formatTAT(result.studyToReportTAT);
  }
  if (result.uploadToReportTAT) {
      result.uploadToReportTATFormatted = formatTAT(result.uploadToReportTAT);
  }
  if (result.assignmentToReportTAT) {
      result.assignmentToReportTATFormatted = formatTAT(result.assignmentToReportTAT);
  }
  if (result.totalTATDays !== null) {
      result.totalTATFormatted = `${result.totalTATDays} days`;
  }

  console.log(`[TAT Calc] Final TAT result:`, result);
  return result;
};

// 🔧 HELPER: Get empty TAT structure
const getEmptyTAT = () => ({
    studyToUploadTAT: null,
    uploadToAssignmentTAT: null,
    assignmentToReportTAT: null,
    studyToReportTAT: null,
    uploadToReportTAT: null,
    totalTATDays: null,
    totalTATMinutes: null,
    resetAwareTATDays: null,
    studyToReportTATFormatted: 'N/A',
    uploadToReportTATFormatted: 'N/A',
    assignmentToReportTATFormatted: 'N/A',
    totalTATFormatted: 'N/A'
});

// 🔧 HELPER: Format TAT for display
const formatTAT = (minutes) => {
    if (!minutes || minutes <= 0) return 'N/A';
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours === 0) {
        return `${remainingMinutes}m`;
    } else if (hours < 24) {
        return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    } else {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    }
};


export const updatePatientDetails = async (req, res) => {
  try {
      const { patientId } = req.params;
      const { patientMongoId } = req.body; // ✅ ADD: Accept MongoDB ID from body
      
      console.log(`🔧 Updating patient: patientId=${patientId}, mongoId=${patientMongoId}`);

      // ✅ CHANGED: Use flexible patient finding
      const patient = await findPatientFlexible(patientId, patientMongoId);

      if (!patient) {
          return res.status(404).json({
              success: false,
              message: 'Patient not found'
          });
      }

      // ✅ CHANGED: Use patient._id for update
      const updatedPatient = await Patient.findByIdAndUpdate(
          patient._id, // ✅ Use MongoDB _id
          updateData,
          { new: true }
      );

      // ✅ CHANGED: Update related studies using patient._id
      await DicomStudy.updateMany(
          { patient: patient._id }, // ✅ Use MongoDB _id
          { /* update data */ }
      );

      res.json({
          success: true,
          message: 'Patient updated successfully',
          data: {
              patientMongoId: updatedPatient._id, // ✅ RETURN: Both IDs
              patientId: updatedPatient.patientID
          }
      });

  } catch (error) {
      console.error('❌ Error updating patient:', error);
      res.status(500).json({
          success: false,
          message: 'Error updating patient details',
          error: error.message
      });
  }
};

export const uploadDocument = async (req, res) => {
    try {
        const { patientId } = req.params;
        const { patientMongoId } = req.body; // ✅ ADD: Accept MongoDB ID

        // ✅ CHANGED: Use flexible patient finding
        const patient = await findPatientFlexible(patientId, patientMongoId);

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // ✅ Use patient._id for all document operations
        const documentRecord = new Document({
            patientMongoId: patient._id, // ✅ Store MongoDB ID
            patientId: patient.patientID, // ✅ Keep string ID for legacy
            // ... other fields
        });

        await documentRecord.save();

        res.json({
            success: true,
            message: 'Document uploaded successfully'
        });

    } catch (error) {
        console.error('❌ Error uploading document:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading document',
            error: error.message
        });
    }
};

// 🔧 UPDATED: Download document from Wasabi
export const downloadDocument = async (req, res) => {
  try {
    const { patientId, docIndex } = req.params;
    const userId = req.user.id;

    console.log(`⬇️ Downloading document ${docIndex} for patient: ${patientId}`);

    // Validate user
    const user = await User.findById(userId).select('role fullName');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check permissions
    if (!['lab_staff', 'admin', 'doctor_account'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Find patient
    const patient = await Patient.findOne({ patientID: patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Validate document index
    const documentIndex = parseInt(docIndex);
    if (isNaN(documentIndex) || documentIndex < 0 || documentIndex >= patient.documents.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document index'
      });
    }

    const documentRef = patient.documents[documentIndex];

    // 🔧 Handle Wasabi vs Legacy storage
    if (documentRef.storageType === 'wasabi' && documentRef.wasabiKey) {
      console.log('☁️ Downloading from Wasabi...');
      
      // Download from Wasabi
      const wasabiResult = await WasabiService.downloadFile(
        documentRef.wasabiBucket,
        documentRef.wasabiKey
      );

      if (!wasabiResult.success) {
        throw new Error('Failed to download from Wasabi storage');
      }

      // Set response headers
      res.setHeader('Content-Type', documentRef.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${documentRef.fileName}"`);
      res.setHeader('Content-Length', wasabiResult.data.length);

      console.log('✅ Document download from Wasabi successful');
      
      // Send file
      res.send(wasabiResult.data);

    } else {
      // 🔧 Legacy: Download from MongoDB (backward compatibility)
      console.log('🗄️ Downloading from MongoDB (legacy)...');
      
      if (!documentRef.data) {
        return res.status(404).json({
          success: false,
          message: 'Document data not found'
        });
      }

      // Convert base64 back to buffer
      const fileBuffer = Buffer.from(documentRef.data, 'base64');

      // Set response headers
      res.setHeader('Content-Type', documentRef.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${documentRef.fileName}"`);
      res.setHeader('Content-Length', fileBuffer.length);

      console.log('✅ Document download from MongoDB successful');
      
      // Send file

      res.send(fileBuffer);
    }

  } catch (error) {
    console.error('❌ Error downloading document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download document',
      error: error.message
    });
  }
};

// 🔧 UPDATED: Delete document from Wasabi and database
export const deleteDocument = async (req, res) => {
  
  try {
    const { patientId, docIndex } = req.params;
    const userId = req.user.id;

    console.log(`🗑️ Deleting document ${docIndex} for patient: ${patientId}`);

    // Validate user permissions
    const user = await User.findById(userId).select('role');
    if (!user || !['lab_staff', 'admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Find patient
    const patient = await Patient.findOne({ patientID: patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // 🔧 Ensure documents is always an array
    if (!Array.isArray(patient.documents)) {
      patient.documents = [];
    }

    // Validate document index
    const documentIndex = parseInt(docIndex);
    if (isNaN(documentIndex) || documentIndex < 0 || documentIndex >= patient.documents.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document index'
      });
    }

    const documentRef = patient.documents[documentIndex];

    // 🔧 Delete from Wasabi if it's stored there
    if (documentRef.storageType === 'wasabi' && documentRef.wasabiKey) {
      console.log('☁️ Deleting from Wasabi...');
      try {
        await WasabiService.deleteFile(
          documentRef.wasabiBucket,
          documentRef.wasabiKey,
          true // permanent deletion
        );
        console.log('✅ File deleted from Wasabi');
      } catch (wasabiError) {
        console.warn('⚠️ Failed to delete from Wasabi:', wasabiError.message);
        // Continue with database cleanup even if Wasabi deletion fails
      }

      // Delete from Document collection
      if (documentRef._id) {
        try {
          await Document.findByIdAndDelete(documentRef._id);
          console.log('✅ Document record deleted from database');
        } catch (dbError) {
          console.warn('⚠️ Failed to delete document record:', dbError.message);
        }
      }
    }

    // Remove document reference from patient
    patient.documents.splice(documentIndex, 1);
    await patient.save();

    console.log('✅ Document deleted successfully');

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document',
      error: error.message
    });
  }
};

export const deleteStudyReport = async (req, res) => {
  try {
    const { studyId, reportId } = req.params;
    const userId = req.user.id;

    console.log(`🗑️ Deleting study report ${reportId} from study: ${studyId}`);

    // Validate user permissions
    const user = await User.findById(userId).select('role');
    if (!user || !['lab_staff', 'admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Find study
    const study = await DicomStudy.findOne({ studyInstanceUID: studyId });
    if (!study) {
      return res.status(404).json({
        success: false,
        message: 'Study not found'
      });
    }

    // Find report index
    const reportIndex = study.uploadedReports?.findIndex(r => r._id.toString() === reportId);
    if (reportIndex === -1 || reportIndex === undefined) {
      return res.status(404).json({
        success: false,
        message: 'Report not found in study'
      });
    }

    const reportRef = study.uploadedReports[reportIndex];

    // Delete from Wasabi if needed
    if (reportRef.storageType === 'wasabi' && reportRef.wasabiKey) {
      try {
        await WasabiService.deleteFile(
          reportRef.wasabiBucket,
          reportRef.wasabiKey,
          true
        );
        console.log('✅ Study report file deleted from Wasabi');
      } catch (err) {
        console.warn('⚠️ Failed to delete study report from Wasabi:', err.message);
      }
    }

    // Delete from Document collection
    if (reportRef._id) {
      try {
        await Document.findByIdAndDelete(reportRef._id);
        console.log('✅ Study report document record deleted from database');
      } catch (err) {
        console.warn('⚠️ Failed to delete study report document record:', err.message);
      }
    }

    // Remove from uploadedReports array
    study.uploadedReports.splice(reportIndex, 1);
    await study.save();

    res.json({
      success: true,
      message: 'Study report deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting study report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete study report',
      error: error.message
    });
  }
};

// 🔧 NEW: Get presigned URL for direct download (for admin/doctor dashboard)
export const getDocumentDownloadUrl = async (req, res) => {
  try {
    const { patientId, docIndex } = req.params;
    const userId = req.user.id;
    const { expiresIn = 3600 } = req.query; // Default 1 hour

    console.log(`🔗 Getting download URL for document ${docIndex} for patient: ${patientId}`);

    // Validate user
    const user = await User.findById(userId).select('role');
    if (!user || !['lab_staff', 'admin', 'doctor_account'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Find patient
    const patient = await Patient.findOne({ patientID: patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Validate document index
    const documentIndex = parseInt(docIndex);
    if (isNaN(documentIndex) || documentIndex < 0 || documentIndex >= patient.documents.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document index'
      });
    }

    const documentRef = patient.documents[documentIndex];

    // 🔧 Generate presigned URL for Wasabi storage
    if (documentRef.storageType === 'wasabi' && documentRef.wasabiKey) {
      const urlResult = await WasabiService.generatePresignedUrl(
        documentRef.wasabiBucket,
        documentRef.wasabiKey,
        parseInt(expiresIn),
        'GetObject'
      );

      if (!urlResult.success) {
        throw new Error('Failed to generate download URL');
      }

      res.json({
        success: true,
        downloadUrl: urlResult.url,
        expiresAt: urlResult.expiresAt,
        fileName: documentRef.fileName,
        fileSize: documentRef.size,
        contentType: documentRef.contentType
      });

    } else {
      // For legacy MongoDB storage, return API endpoint
      res.json({
        success: true,
        downloadUrl: `/api/lab/patients/${patientId}/documents/${docIndex}/download`,
        expiresAt: new Date(Date.now() + (parseInt(expiresIn) * 1000)),
        fileName: documentRef.fileName,
        fileSize: documentRef.size,
        contentType: documentRef.contentType,
        storageType: 'legacy'
      });
    }

  } catch (error) {
    console.error('❌ Error getting download URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate download URL',
      error: error.message
    });
  }
};

// 🔧 NEW: List patient documents with metadata
export const getPatientDocuments = async (req, res) => {
  try {
    const { patientId } = req.params;
    const userId = req.user.id;

    console.log(`📋 Getting documents for patient: ${patientId}`);

    // Validate user
    const user = await User.findById(userId).select('role');
    if (!user || !['lab_staff', 'admin', 'doctor_account'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Find patient
    const patient = await Patient.findOne({ patientID: patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Format documents response
    const documents = patient.documents.map((doc, index) => ({
      index: index,
      id: doc._id,
      fileName: doc.fileName,
      fileType: doc.fileType,
      contentType: doc.contentType,
      size: doc.size,
      sizeFormatted: WasabiService.formatBytes(doc.size),
      uploadedAt: doc.uploadedAt,
      uploadedBy: doc.uploadedBy,
      storageType: doc.storageType || 'legacy',
      canDownload: true,
      canDelete: ['lab_staff', 'admin'].includes(user.role)
    }));

    res.json({
      success: true,
      data: {
        patientId: patientId,
        documentsCount: documents.length,
        documents: documents
      }
    });

  } catch (error) {
    console.error('❌ Error getting patient documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get patient documents',
      error: error.message
    });
  }
};

// 🔧 UPDATE STUDY WORKFLOW STATUS
export const updateStudyStatus = async (req, res) => {
  try {
    const { studyId } = req.params;
    const { workflowStatus, note } = req.body;
    const userId = req.user.id;

    console.log(`🔄 Updating study status: ${studyId} to ${workflowStatus}`);

    // Validate user permissions
    const user = await User.findById(userId).select('role fullName');
    if (!user || !['lab_staff', 'admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Normalize status
    const normalizedStatus = normalizeWorkflowStatus(workflowStatus);

    // Update study
    const study = await DicomStudy.findOneAndUpdate(
      { studyInstanceUID: studyId },
      {
        $set: { workflowStatus: normalizedStatus },
        $push: {
          statusHistory: {
            status: normalizedStatus,
            changedAt: new Date(),
            changedBy: userId,
            note: note || `Status updated to ${normalizedStatus} by ${user.fullName}`
          }
        }
      },
      { new: true, runValidators: true }
    );

    if (!study) {
      return res.status(404).json({
        success: false,
        message: 'Study not found'
      });
    }

    // Update patient workflow status to match
    await Patient.findOneAndUpdate(
      { patientID: study.patientId },
      {
        $set: {
          currentWorkflowStatus: normalizedStatus,
          activeDicomStudyRef: study._id
        }
      }
    );

    console.log('✅ Study status updated successfully');

    res.json({
      success: true,
      message: 'Study status updated successfully',
      data: {
        studyId: study.studyInstanceUID,
        newStatus: study.workflowStatus,
        updatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('❌ Error updating study status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// 🔧 GET ALL PATIENTS (LAB VIEW)
export const getAllPatients = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, search = '', status = '' } = req.query;

    console.log(`📋 Fetching patients for lab user: ${userId}`);

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { patientID: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query.currentWorkflowStatus = normalizeWorkflowStatus(status);
    }

    // Execute query with pagination
    const patients = await Patient.find(query)
      .populate('clinicalInfo.lastModifiedBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Patient.countDocuments(query);

    // Format response
    const formattedPatients = patients.map(patient => ({
      patientId: patient.patientID,
      fullName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
      age: patient.ageString || 'N/A',
      gender: patient.gender || 'N/A',
      status: patient.currentWorkflowStatus,
      lastModified: patient.clinicalInfo?.lastModifiedAt || patient.updatedAt,
      hasDocuments: patient.documents && patient.documents.length > 0
    }));

    res.json({
      success: true,
      data: {
        patients: formattedPatients,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalRecords: total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching patients:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// 🔧 BULK UPDATE STUDIES
export const bulkUpdateStudies = async (req, res) => {
  try {
    const { studyIds, updateData } = req.body;
    const userId = req.user.id;

    console.log(`🔄 Bulk updating ${studyIds.length} studies`);

    // Validate user permissions
    const user = await User.findById(userId).select('role fullName');
    if (!user || !['lab_staff', 'admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    if (!studyIds || !Array.isArray(studyIds) || studyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid study IDs provided'
      });
    }

    // Prepare update data
    const bulkUpdateData = {};
    
    if (updateData.workflowStatus) {
      bulkUpdateData.workflowStatus = normalizeWorkflowStatus(updateData.workflowStatus);
    }
    
    if (updateData.caseType) {
      bulkUpdateData.caseType = sanitizeInput(updateData.caseType);
    }

    // Add status history entry
    if (updateData.workflowStatus) {
      bulkUpdateData.$push = {
        statusHistory: {
          status: bulkUpdateData.workflowStatus,
          changedAt: new Date(),
          changedBy: userId,
          note: `Bulk status update by ${user.fullName}`
        }
      };
    }

    // Execute bulk update
    const updateResult = await DicomStudy.updateMany(
      { studyInstanceUID: { $in: studyIds } },
      bulkUpdateData,
      { runValidators: true }
    );

    console.log(`✅ Bulk updated ${updateResult.modifiedCount} studies`);

    res.json({
      success: true,
      message: `Successfully updated ${updateResult.modifiedCount} studies`,
      data: {
        modifiedCount: updateResult.modifiedCount,
        matchedCount: updateResult.matchedCount
      }
    });

  } catch (error) {
    console.error('❌ Error in bulk update:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// 🔧 FIXED: Download study report - fetch Wasabi info from Document collection
export const downloadStudyReport = async (req, res) => {
  console.log('🔧 Starting downloadStudyReport...', req.params);
  
  try {
    const { studyId, reportId } = req.params;
    const userId = req.user.id;

    console.log(`⬇️ Downloading study report ${reportId} from study: ${studyId}`);

    // Validate user
    const user = await User.findById(userId).select('role fullName');
    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`✅ User validated: ${user.fullName} (${user.role})`);

    // Check permissions
    if (!['lab_staff', 'admin', 'doctor_account'].includes(user.role)) {
      console.log(`❌ Insufficient permissions: ${user.role}`);
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    console.log('✅ Permissions validated');

    // Find study
    console.log(`🔍 Looking for study: ${studyId}`);
    const study = await DicomStudy.findOne({ studyInstanceUID: studyId });
    if (!study) {
      console.log(`❌ Study not found: ${studyId}`);
      return res.status(404).json({
        success: false,
        message: 'Study not found'
      });
    }

    console.log(`✅ Study found: ${study._id}`);
    console.log(`📋 Study has ${study.uploadedReports?.length ||  0} uploaded reports`);

    // Find report in study
    const report = study.uploadedReports?.find(r => r._id.toString() === reportId);
    if (!report) {
      console.log(`❌ Report not found in study: ${reportId}`);
      console.log(`📋 Available reports:`, study.uploadedReports?.map(r => ({
        id: r._id.toString(),
        filename: r.filename
      })) || []);
      return res.status(404).json({
        success: false,
        message: 'Report not found in study'
      });
    }

    console.log(`✅ Report found in study: ${report.filename}`);
    console.log(`📁 Study report details:`, {
      filename: report.filename,
      contentType: report.contentType,
      size: report.size,
      reportId: report._id.toString()
    });

    // 🔧 CRITICAL FIX: Get complete document info from Document collection
    console.log(`🔍 Fetching complete document info from Document collection...`);
    const documentRecord = await Document.findById(reportId);
    
    if (!documentRecord) {
      console.log(`❌ Document record not found in Document collection: ${reportId}`);
      return res.status(404).json({
        success: false,
        message: 'Document record not found'
      });
    }

    console.log(`✅ Document record found:`, {
      fileName: documentRecord.fileName,
      fileSize: documentRecord.fileSize,
      contentType: documentRecord.contentType,
      wasabiKey: documentRecord.wasabiKey,
      wasabiBucket: documentRecord.wasabiBucket,
      hasWasabiInfo: !!(documentRecord.wasabiKey && documentRecord.wasabiBucket)
    });

    // 🔧 Download from Wasabi using Document collection info
    if (documentRecord.wasabiKey && documentRecord.wasabiBucket) {
      console.log('☁️ Downloading study report from Wasabi...');
      console.log(`📂 Bucket: ${documentRecord.wasabiBucket}, Key: ${documentRecord.wasabiKey}`);
      
      try {
        const wasabiResult = await WasabiService.downloadFile(
          documentRecord.wasabiBucket,
          documentRecord.wasabiKey
        );

        console.log(`📥 Wasabi download result:`, {
          success: wasabiResult.success,
          dataLength: wasabiResult.data?.length || 0,
          error: wasabiResult.error
        });

        if (!wasabiResult.success) {
          console.log(`❌ Wasabi download failed: ${wasabiResult.error}`);
          throw new Error('Failed to download from Wasabi storage: ' + wasabiResult.error);
        }

        console.log('✅ File downloaded from Wasabi successfully');

        // Set response headers using Document collection data
        res.setHeader('Content-Type', documentRecord.contentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${documentRecord.fileName}"`);
        res.setHeader('Content-Length', wasabiResult.data.length);
        res.setHeader('Cache-Control', 'no-cache');

        console.log('📤 Sending file to client...');
        
        // Send file
        res.send(wasabiResult.data);
        
        console.log('✅ Study report download completed successfully');

      } catch (wasabiError) {
        console.error('❌ Wasabi download error:', wasabiError);
        return res.status(500).json({
          success: false,
          message: 'Failed to download file from storage',
          error: wasabiError.message
        });
      }

    } else {
      // 🔧 FALLBACK: Try legacy storage if no Wasabi info
      console.log('🗄️ No Wasabi info found, checking for legacy storage...');
      
      if (documentRecord.fileData) {
        console.log('📁 Found legacy file data, downloading from MongoDB...');
        
        try {
          // Convert base64 back to buffer
          const fileBuffer = Buffer.from(documentRecord.fileData, 'base64');

          // Set response headers
          res.setHeader('Content-Type', documentRecord.contentType || 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${documentRecord.fileName}"`);
          res.setHeader('Content-Length', fileBuffer.length);
          res.setHeader('Cache-Control', 'no-cache');

          console.log('📤 Sending legacy file to client...');
          
          // Send file
          res.send(fileBuffer);
          
          console.log('✅ Study report download from legacy storage completed successfully');

        } catch (legacyError) {
          console.error('❌ Legacy storage download error:', legacyError);
          return res.status(500).json({
            success: false,
            message: 'Failed to download file from legacy storage',
            error: legacyError.message
          });
        }

      } else {
        console.log('❌ No file data found in any storage');
        console.log(`📋 Document storage info:`, {
          hasWasabiKey: !!documentRecord.wasabiKey,
          hasWasabiBucket: !!documentRecord.wasabiBucket,
          hasFileData: !!documentRecord.fileData,
          isActive: documentRecord.isActive
        });
        
        return res.status(404).json({
          success: false,
          message: 'Document file not found in any storage system',
          details: {
            documentId: reportId,
            hasWasabiKey: !!documentRecord.wasabiKey,
            hasWasabiBucket: !!documentRecord.wasabiBucket,
            hasFileData: !!documentRecord.fileData,
            isActive: documentRecord.isActive
          }
        });
      }
    }

  } catch (error) {
    console.error('❌ Error downloading study report:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Make sure we always send a response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to download study report',
        error: error.message
      });
    }
  }
};

// 🔧 DATE VALIDATION HELPERS
const isValidDate = (dateString) => {
    if (!dateString || dateString === '' || dateString === 'N/A' || dateString === null || dateString === undefined) {
        return false;
    }
    const date = new Date(dateString);
    return !isNaN(date.getTime());
};

const parseValidDate = (dateInput) => {
    if (!dateInput || dateInput === '' || dateInput === 'N/A') {
        return null;
    }
    
    // If it's already a Date object, check if it's valid
    if (dateInput instanceof Date) {
        return isNaN(dateInput.getTime()) ? null : dateInput;
    }
    
    // Try to parse the string
    const date = new Date(dateInput);
    return isNaN(date.getTime()) ? null : date;
};

// 🔧 HELPER: Reset TAT for all patient's active studies


export default {
  getPatientDetailedView,
  updatePatientDetails,
  uploadDocument,
  deleteDocument,
  downloadDocument,
  getDocumentDownloadUrl, // 🔧 NEW
  getPatientDocuments, // 🔧 NEW
  updateStudyStatus,
  getAllPatients,
  bulkUpdateStudies,
  downloadStudyReport // 🔧 NEW
};