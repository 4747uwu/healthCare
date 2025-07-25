import mongoose from 'mongoose';

/**
 * 🔧 SUPER SIMPLE TAT UTILITY
 * Just 4 metrics, no complex logic
 */

// Helper to get current IST time
export const getCurrentISTTime = () => {
    const now = new Date();
    const istOffset = 0; // IST is UTC+5:30
    return new Date(now.getTime() + istOffset);
};

// Helper to calculate minutes between two dates
const calculateMinutes = (startDate, endDate) => {
    if (!startDate || !endDate) return null;
    const diffMs = new Date(endDate) - new Date(startDate);
    return Math.round(diffMs / (1000 * 60));
};

// Helper to format TAT for display
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

/**
 * 🔧 SIMPLE TAT CALCULATION
 * Just the 4 metrics from your image
 */
export const calculateSimpleTAT = (study) => {
    if (!study) return getEmptyTAT();

    // Extract dates - SIMPLE
    const uploadDate = study.createdAt; // This gets reset when clinical info changes
    const assignedDate = study.assignment?.assignedAt || (study.assignment?.[0]?.assignedAt);
    const reportDate = study.reportInfo?.finalizedAt;
    const studyDate = study.studyDate;

    // Calculate the 4 TAT metrics - SIMPLE
    const result = {
        // The 4 metrics from your image
        studyToReportTAT: studyDate && reportDate ? calculateMinutes(studyDate, reportDate) : null,
        uploadToAssignmentTAT: uploadDate && assignedDate ? calculateMinutes(uploadDate, assignedDate) : null,
        uploadToReportTAT: uploadDate && reportDate ? calculateMinutes(uploadDate, reportDate) : null,
        assignmentToReportTAT: assignedDate && reportDate ? calculateMinutes(assignedDate, reportDate) : null,
        
        // Formatted versions
        studyToReportTATFormatted: 'N/A',
        uploadToAssignmentTATFormatted: 'N/A',
        uploadToReportTATFormatted: 'N/A',
        assignmentToReportTATFormatted: 'N/A',
        
        // Basic metadata
        calculatedAt: getCurrentISTTime(),
        isCompleted: !!reportDate
    };

    // Format the values
    result.studyToReportTATFormatted = result.studyToReportTAT ? formatTAT(result.studyToReportTAT) : 'N/A';
    result.uploadToAssignmentTATFormatted = result.uploadToAssignmentTAT ? formatTAT(result.uploadToAssignmentTAT) : 'N/A';
    result.uploadToReportTATFormatted = result.uploadToReportTAT ? formatTAT(result.uploadToReportTAT) : 'N/A';
    result.assignmentToReportTATFormatted = result.assignmentToReportTAT ? formatTAT(result.assignmentToReportTAT) : 'N/A';

    return result;
};

// Simple empty TAT
const getEmptyTAT = () => ({
    studyToReportTAT: null,
    uploadToAssignmentTAT: null,
    uploadToReportTAT: null,
    assignmentToReportTAT: null,
    studyToReportTATFormatted: 'N/A',
    uploadToAssignmentTATFormatted: 'N/A',
    uploadToReportTATFormatted: 'N/A',
    assignmentToReportTATFormatted: 'N/A',
    calculatedAt: getCurrentISTTime(),
    isCompleted: false
});
export const resetUploadTime = async (studyId, userId = null) => {
    try {
        console.log(`[TAT Reset] 🔄 Resetting upload time for study: ${studyId}`);
        
        const DicomStudy = mongoose.model('DicomStudy');
        const resetTime = getCurrentISTTime();
        
        // Extract userId
        let actualUserId = null;
        if (userId) {
            if (typeof userId === 'string') {
                actualUserId = userId;
            } else if (typeof userId === 'object' && userId.changedBy) {
                actualUserId = userId.changedBy;
            }
        }
        
        console.log(`[TAT Reset] Using resetTime: ${resetTime.toISOString()}`);
        console.log(`[TAT Reset] Target study ID: ${studyId}`);
        
        // 🔧 FIX: Update both createdAt and recalculate TAT
        const updateResult = await DicomStudy.updateOne(
            { _id: studyId },
            {
                $set: {
                    createdAt: resetTime,
                    updatedAt: resetTime
                },
                $push: {
                    statusHistory: {
                        status: 'upload_time_reset',
                        changedAt: resetTime,
                        changedBy: actualUserId,
                        note: 'Upload time reset due to clinical history change'
                    }
                }
            },
            { 
                strict: false,
                overwrite: false,
                timestamps: false
            }
        );

        console.log(`[TAT Reset] Update result:`, updateResult);

        if (updateResult.matchedCount > 0 && updateResult.modifiedCount > 0) {
            console.log(`[TAT Reset] ✅ Upload time reset to: ${resetTime.toISOString()}`);
            
            // 🔧 NEW: Fetch the updated study and recalculate TAT
            const updatedStudy = await DicomStudy.findById(studyId).lean();
            if (updatedStudy) {
                console.log(`[TAT Reset] 🔄 Recalculating TAT with new upload time...`);
                
                // Calculate fresh TAT with the new upload time
                const freshTAT = calculateSimpleTAT(updatedStudy);
                
                // Update the study with the new TAT calculations
                await DicomStudy.updateOne(
                    { _id: studyId },
                    {
                        $set: {
                            'calculatedTAT': freshTAT,
                            'tatInfo': {
                                studyToReportTAT: freshTAT.studyToReportTAT,
                                uploadToAssignmentTAT: freshTAT.uploadToAssignmentTAT,
                                uploadToReportTAT: freshTAT.uploadToReportTAT,
                                assignmentToReportTAT: freshTAT.assignmentToReportTAT,
                                studyToReportTATFormatted: freshTAT.studyToReportTATFormatted,
                                uploadToAssignmentTATFormatted: freshTAT.uploadToAssignmentTATFormatted,
                                uploadToReportTATFormatted: freshTAT.uploadToReportTATFormatted,
                                assignmentToReportTATFormatted: freshTAT.assignmentToReportTATFormatted,
                                lastReset: resetTime,
                                resetReason: 'clinical_history_change',
                                resetBy: actualUserId,
                                lastCalculated: resetTime,
                                isCompleted: freshTAT.isCompleted
                            }
                            // Update legacy timingInfo for backward compatibility
                            // 'timingInfo.uploadToAssignmentMinutes': freshTAT.uploadToAssignmentTAT,
                            // 'timingInfo.assignmentToReportMinutes': freshTAT.assignmentToReportTAT,
                            // 'timingInfo.totalTATMinutes': freshTAT.uploadToReportTAT,
                            // 'timingInfo.tatResetAt': resetTime,
                            // 'timingInfo.tatResetReason': 'clinical_history_change',
                            // 'timingInfo.tatResetCount': { $inc: 1 },
                            // 'timingInfo.lastCalculated': resetTime
                        }
                    },
                    { timestamps: false }
                );
                
                console.log(`[TAT Reset] ✅ TAT recalculated:`, {
                    uploadToAssignmentTAT: freshTAT.uploadToAssignmentTATFormatted,
                    uploadToReportTAT: freshTAT.uploadToReportTATFormatted,
                    assignmentToReportTAT: freshTAT.assignmentToReportTATFormatted
                });
                
                return { 
                    success: true, 
                    resetTime: resetTime,
                    newCreatedAt: resetTime,
                    freshTAT: freshTAT,
                    message: 'Upload time reset and TAT recalculated successfully'
                };
            } else {
                console.warn(`[TAT Reset] ⚠️ Could not fetch updated study for TAT recalculation`);
                return { 
                    success: true, 
                    resetTime: resetTime,
                    message: 'Upload time reset but TAT recalculation failed'
                };
            }
        } else {
            console.log(`[TAT Reset] ❌ No study found or no changes made with ID: ${studyId}`);
            return { success: false, error: 'Study not found or no changes made' };
        }

    } catch (error) {
        console.error(`[TAT Reset] ❌ Error:`, error);
        return { success: false, error: error.message };
    }
};

// export const resetUploadTime = async (studyId, userId = null) => {
//     try {
//         console.log(`[TAT Reset] 🔄 Resetting upload time for study: ${studyId}`);
        
//         const DicomStudy = mongoose.model('DicomStudy');
//         const resetTime = getCurrentISTTime();
        
//         // Extract userId
//         let actualUserId = null;
//         if (userId) {
//             if (typeof userId === 'string') {
//                 actualUserId = userId;
//             } else if (typeof userId === 'object' && userId.changedBy) {
//                 actualUserId = userId.changedBy;
//             }
//         }
        
//         console.log(`[TAT Reset] Using resetTime: ${resetTime.toISOString()}`);
//         console.log(`[TAT Reset] Target study ID: ${studyId}`);
        
//         // 🔧 FIX: Bypass Mongoose timestamp protection
//         const updateResult = await DicomStudy.updateOne(
//             { _id: studyId },
//             {
//                 $set: {
//                     createdAt: resetTime,
//                     updatedAt: resetTime
//                 },
//                 $push: {
//                     statusHistory: {
//                         status: 'upload_time_reset',
//                         changedAt: resetTime,
//                         changedBy: actualUserId,
//                         note: 'Upload time reset due to clinical history change'
//                     }
//                 }
//             },
//             { 
//                 // 🔥 CRITICAL: Bypass schema validation and timestamps
//                 strict: false,
//                 overwrite: false,
//                 timestamps: false  // 🔥 This disables timestamp auto-management for this operation
//             }
//         );

//         console.log(`[TAT Reset] Update result:`, updateResult);

//         if (updateResult.matchedCount > 0) {
//             console.log(`[TAT Reset] ✅ Study found and updated`);
            
//             if (updateResult.modifiedCount > 0) {
//                 console.log(`[TAT Reset] ✅ Upload time reset to: ${resetTime.toISOString()}`);
                
//                 // Verify the update
//                 const verifyStudy = await DicomStudy.findById(studyId).select('createdAt updatedAt studyInstanceUID').lean();
//                 console.log(`[TAT Reset] Verification - Study after update:`, {
//                     _id: verifyStudy._id,
//                     studyInstanceUID: verifyStudy.studyInstanceUID,
//                     createdAt: verifyStudy.createdAt,
//                     updatedAt: verifyStudy.updatedAt
//                 });
                
//                 return { 
//                     success: true, 
//                     resetTime: resetTime,
//                     newCreatedAt: verifyStudy.createdAt,
//                     message: 'Upload time reset successfully'
//                 };
//             } else {
//                 console.log(`[TAT Reset] ⚠️ Study found but not modified (may already have this value)`);
//                 return { 
//                     success: true, 
//                     resetTime: resetTime,
//                     message: 'Study found but no changes made'
//                 };
//             }
//         } else {
//             console.log(`[TAT Reset] ❌ No study found with ID: ${studyId}`);
//             return { success: false, error: 'Study not found' };
//         }

//     } catch (error) {
//         console.error(`[TAT Reset] ❌ Error:`, error);
//         return { success: false, error: error.message };
//     }
// };