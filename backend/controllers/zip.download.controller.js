import DicomStudy from '../models/dicomStudyModel.js';
import { updateWorkflowStatus } from '../utils/workflowStatusManger.js';
import zipCreationService from '../services/wasabi.zip.service.js';
// ✅ ADD: Import getSignedUrl for presigned URLs
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { wasabiS3 } from '../config/wasabi.js';

// Smart download - uses pre-processed ZIP if available
export const downloadPreProcessedStudy = async (req, res) => {
    try {
        const { orthancStudyId } = req.params;
        
        console.log(`🔍 Pre-processed download requested for: ${orthancStudyId} by user: ${req.user.role}`);
        
        // Find study with ZIP info
        const study = await DicomStudy.findOne({ orthancStudyID: orthancStudyId }).lean();
        
        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }
        
        // Check if pre-processed ZIP is available
        const zipInfo = study.preProcessedDownload;
        
        if (zipInfo && zipInfo.zipStatus === 'completed' && zipInfo.zipUrl) {
            // Check if ZIP hasn't expired
            const now = new Date();
            if (!zipInfo.zipExpiresAt || zipInfo.zipExpiresAt > now) {
                console.log(`✅ Using pre-processed ZIP: ${zipInfo.zipFileName} (${zipInfo.zipSizeMB}MB)`);
                
                // Update download stats
                await DicomStudy.findByIdAndUpdate(study._id, {
                    $inc: { 'preProcessedDownload.downloadCount': 1 },
                    'preProcessedDownload.lastDownloaded': new Date()
                });
                
                // Update workflow status
                await updateWorkflowStatusForDownload(study, req.user);
                
                // Set appropriate headers for download
                res.setHeader('Content-Disposition', `attachment; filename="${zipInfo.zipFileName}"`);
                res.setHeader('Content-Type', 'application/zip');
                res.setHeader('X-Download-Method', 'pre-processed-wasabi');
                res.setHeader('X-ZIP-Size-MB', zipInfo.zipSizeMB.toString());
                
                // Redirect to Wasabi URL for direct download
                return res.redirect(zipInfo.zipUrl);
            } else {
                console.log(`⚠️ Pre-processed ZIP expired, returning status`);
                return res.status(410).json({
                    success: false,
                    status: 'expired',
                    message: 'Pre-processed ZIP has expired',
                    expiredAt: zipInfo.zipExpiresAt,
                    fallbackUrl: `/orthanc-download/study/${orthancStudyId}/download-direct`
                });
            }
        } else if (zipInfo && zipInfo.zipStatus === 'processing') {
            console.log(`⏳ ZIP still processing`);
            
            return res.status(202).json({
                success: false,
                status: 'processing',
                message: 'ZIP file is being prepared. Please try again in a few moments.',
                estimatedCompletion: 'Processing...',
                jobId: zipInfo.zipJobId,
                checkStatusUrl: `/orthanc/zip-status/${zipInfo.zipJobId}`,
                fallbackUrl: `/orthanc-download/study/${orthancStudyId}/download-direct`
            });
        } else if (zipInfo && zipInfo.zipStatus === 'failed') {
            console.log(`❌ ZIP creation failed`);
            
            return res.status(500).json({
                success: false,
                status: 'failed',
                message: 'ZIP creation failed',
                error: zipInfo.zipMetadata?.error || 'Unknown error',
                fallbackUrl: `/orthanc-download/study/${orthancStudyId}/download-direct`
            });
        } else {
            // No pre-processed ZIP available
            console.log(`📦 No pre-processed ZIP available for: ${orthancStudyId}`);
            
            return res.status(404).json({
                success: false,
                status: 'not_available',
                message: 'Pre-processed ZIP not available',
                canCreate: true,
                createUrl: `/orthanc/create-zip/${orthancStudyId}`,
                fallbackUrl: `/orthanc-download/study/${orthancStudyId}/download-direct`
            });
        }
        
    } catch (error) {
        console.error('Error in pre-processed download:', error);
        res.status(500).json({
            success: false,
            message: 'Pre-processed download failed',
            error: error.message,
            fallbackUrl: `/orthanc-download/study/${req.params.orthancStudyId}/download-direct`
        });
    }
};

// Get download info
export const getDownloadInfo = async (req, res) => {
    try {
        const { orthancStudyId } = req.params;
        
        const study = await DicomStudy.findOne({ orthancStudyID: orthancStudyId })
            .select('preProcessedDownload seriesCount instanceCount orthancStudyID')
            .lean();
        
        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }
        
        const zipInfo = study.preProcessedDownload || {};
        
        res.json({
            success: true,
            data: {
                orthancStudyId: study.orthancStudyID,
                hasPreProcessedZip: zipInfo.zipStatus === 'completed' && !!zipInfo.zipUrl,
                zipStatus: zipInfo.zipStatus || 'not_started',
                zipSizeMB: zipInfo.zipSizeMB || 0,
                zipCreatedAt: zipInfo.zipCreatedAt,
                zipExpiresAt: zipInfo.zipExpiresAt,
                downloadCount: zipInfo.downloadCount || 0,
                lastDownloaded: zipInfo.lastDownloaded,
                seriesCount: study.seriesCount || 0,
                instanceCount: study.instanceCount || 0,
                jobId: zipInfo.zipJobId,
                error: zipInfo.zipMetadata?.error,
                downloadMethods: {
                    preProcessed: `/api/download/study/${orthancStudyId}/pre-processed`,
                    direct: `/api/orthanc-download/study/${orthancStudyId}/download-direct`,
                    create: `/api/orthanc/create-zip/${orthancStudyId}`,
                    info: `/api/download/study/${orthancStudyId}/info`
                }
            }
        });
        
    } catch (error) {
        console.error('Error getting download info:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get download information',
            error: error.message
        });
    }
};

// Create ZIP manually
export const createZipManually = async (req, res) => {
    try {
        const { orthancStudyId } = req.params;
        
        const study = await DicomStudy.findOne({ orthancStudyID: orthancStudyId });
        
        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }
        
        // Check if ZIP is already being processed or completed
        if (study.preProcessedDownload?.zipStatus === 'processing') {
            return res.json({
                success: false,
                message: 'ZIP creation already in progress',
                status: 'processing',
                jobId: study.preProcessedDownload.zipJobId
            });
        }
        
        if (study.preProcessedDownload?.zipStatus === 'completed' && study.preProcessedDownload?.zipUrl) {
            return res.json({
                success: true,
                message: 'ZIP already exists',
                status: 'completed',
                zipUrl: study.preProcessedDownload.zipUrl,
                zipSizeMB: study.preProcessedDownload.zipSizeMB
            });
        }
        
        // Queue new ZIP creation job
        const zipJob = await zipCreationService.addZipJob({
            orthancStudyId: orthancStudyId,
            studyDatabaseId: study._id,
            studyInstanceUID: study.studyInstanceUID,
            instanceCount: study.instanceCount || 0,
            seriesCount: study.seriesCount || 0
        });
        
        res.json({
            success: true,
            message: 'ZIP creation queued',
            jobId: zipJob.id,
            status: 'queued',
            checkStatusUrl: `/api/orthanc/zip-status/${zipJob.id}`,
            downloadUrl: `/api/download/study/${orthancStudyId}/pre-processed`
        });
        
    } catch (error) {
        console.error('Error creating ZIP:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to queue ZIP creation',
            error: error.message
        });
    }
};

// ✅ ADD: Direct Wasabi download with presigned URL
export const downloadFromWasabi = async (req, res) => {
    try {
        const { orthancStudyId } = req.params;
        
        console.log(`🌊 Wasabi direct download requested for: ${orthancStudyId}`);
        const requestStart = Date.now();
        
        // ✅ FAST: Get study data with minimal fields
        const study = await DicomStudy.findOne(
            { orthancStudyID: orthancStudyId },
            { 
                preProcessedDownload: 1, 
                _id: 1 
            }
        ).lean();
        
        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }
        
        const zipInfo = study.preProcessedDownload;
        
        if (!zipInfo || zipInfo.zipStatus !== 'completed' || !zipInfo.zipUrl) {
            return res.status(404).json({
                success: false,
                message: 'Pre-processed ZIP not available',
                status: 'not_available'
            });
        }
        
        // ✅ FAST: Quick expiry check
        const now = Date.now();
        if (zipInfo.zipExpiresAt && new Date(zipInfo.zipExpiresAt).getTime() <= now) {
            return res.status(410).json({
                success: false,
                message: 'ZIP has expired',
                status: 'expired'
            });
        }
        
        console.log(`✅ Study validation completed in ${Date.now() - requestStart}ms`);
        
        // ✅ FAST: Extract key from existing URL
        let wasabiKey;
        let bucketName = 'studyzip';
        
        if (zipInfo.zipUrl.includes('wasabisys.com')) {
            const urlParts = new URL(zipInfo.zipUrl);
            wasabiKey = urlParts.pathname.substring(1);
        } else {
            const year = new Date(zipInfo.zipCreatedAt).getFullYear();
            wasabiKey = `studies/${year}/${zipInfo.zipFileName}`;
        }
        
        // ✅ SPEED: Generate presigned URL with optimized settings
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
        
        const urlStart = Date.now();
        
        const getObjectCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: wasabiKey,
            // ✅ OPTIMIZE: Add response headers for better download
            ResponseContentDisposition: `attachment; filename="${zipInfo.zipFileName}"`,
            ResponseContentType: 'application/zip',
            ResponseCacheControl: 'public, max-age=3600'
        });
        
        const presignedUrl = await getSignedUrl(wasabiS3, getObjectCommand, {
            expiresIn: 3600, // 1 hour
            signatureVersion: 'v4'
        });
        
        console.log(`✅ Presigned URL generated in ${Date.now() - urlStart}ms`);
        
        // ✅ ASYNC: Update download stats without waiting
        setImmediate(async () => {
            try {
                await DicomStudy.findByIdAndUpdate(study._id, {
                    $inc: { 'preProcessedDownload.downloadCount': 1 },
                    'preProcessedDownload.lastDownloaded': new Date()
                });
            } catch (updateError) {
                console.warn('⚠️ Failed to update download stats:', updateError.message);
            }
        });
        
        const totalTime = Date.now() - requestStart;
        console.log(`🚀 Total request time: ${totalTime}ms`);
        
        // ✅ RESPONSE: Optimized headers
        res.set({
            'X-Download-Method': 'wasabi-direct',
            'X-Response-Time': `${totalTime}ms`,
            'Cache-Control': 'no-cache'
        });
        
        res.json({
            success: true,
            message: 'Download URL ready',
            data: {
                downloadUrl: presignedUrl,
                fileName: zipInfo.zipFileName,
                fileSizeMB: zipInfo.zipSizeMB,
                downloadMethod: 'wasabi-direct',
                responseTime: totalTime
            }
        });
        
    } catch (error) {
        console.error('❌ Wasabi download error:', error);
        res.status(500).json({
            success: false,
            message: 'Download failed',
            error: error.message
        });
    }
};

// Helper function to update workflow status
async function updateWorkflowStatusForDownload(study, user) {
    try {
        let newStatus;
        let statusNote;
        
        if (user.role === 'doctor_account') {
            newStatus = 'report_downloaded_radiologist';
            statusNote = `Pre-processed study downloaded by radiologist: ${user.fullName || user.email}`;
        } else if (user.role === 'lab_staff' || user.role === 'admin') {
            newStatus = 'report_downloaded';
            statusNote = `Pre-processed study downloaded by ${user.role}: ${user.fullName || user.email}`;
        }
        
        if (newStatus) {
            await updateWorkflowStatus({
                studyId: study._id,
                status: newStatus,
                note: statusNote,
                user: user
            });
            
            console.log(`✅ Workflow status updated to ${newStatus}`);
        }
    } catch (error) {
        console.error('⚠️ Error updating workflow status:', error);
    }
}