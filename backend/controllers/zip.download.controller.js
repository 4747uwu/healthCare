import DicomStudy from '../models/dicomStudyModel.js';
import { updateWorkflowStatus } from '../utils/workflowStatusManger.js';
import cloudflareR2ZipService from '../services/wasabi.zip.service.js';
import { r2Config, getCDNOptimizedUrl, getR2PublicUrl, getPresignedUrl } from '../config/cloudflare-r2.js';

// Smart download - uses R2 with CDN if available
export const downloadPreProcessedStudy = async (req, res) => {
    try {
        const { orthancStudyId } = req.params;
        
        console.log(`🔍 R2 pre-processed download requested for: ${orthancStudyId} by user: ${req.user.role}`);
        
        // Find study with ZIP info
        const study = await DicomStudy.findOne({ orthancStudyID: orthancStudyId }).lean();
        
        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }
        
        // Check if pre-processed ZIP is available in R2
        const zipInfo = study.preProcessedDownload;
        
        if (zipInfo && zipInfo.zipStatus === 'completed' && zipInfo.zipUrl) {
            // Check if ZIP hasn't expired
            const now = new Date();
            if (!zipInfo.zipExpiresAt || zipInfo.zipExpiresAt > now) {
                console.log(`✅ Using R2 pre-processed ZIP: ${zipInfo.zipFileName} (${zipInfo.zipSizeMB}MB)`);
                
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
                res.setHeader('X-Download-Method', 'cloudflare-r2-cdn');
                res.setHeader('X-ZIP-Size-MB', zipInfo.zipSizeMB.toString());
                res.setHeader('X-Storage-Provider', 'cloudflare-r2');
                res.setHeader('X-CDN-Enabled', 'true');
                
                // Use CDN-optimized URL for best performance
                const cdnUrl = zipInfo.zipUrl.includes('r2.dev') || zipInfo.zipUrl.includes(r2Config.customDomain)
                    ? zipInfo.zipUrl
                    : await getCDNOptimizedUrl(zipInfo.zipKey || zipInfo.zipFileName, {
                        filename: zipInfo.zipFileName,
                        contentType: 'application/zip',
                        expiresIn: r2Config.presignedSettings.defaultExpirySeconds // ✅ 30 days
                    });
                
                // Redirect to R2 CDN URL for direct download
                return res.redirect(cdnUrl);
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
            console.log(`⏳ ZIP still processing in R2`);
            
            return res.status(202).json({
                success: false,
                status: 'processing',
                message: 'ZIP file is being prepared in Cloudflare R2. Please try again in a few moments.',
                estimatedCompletion: 'Processing...',
                jobId: zipInfo.zipJobId,
                checkStatusUrl: `/orthanc/zip-status/${zipInfo.zipJobId}`,
                fallbackUrl: `/orthanc-download/study/${orthancStudyId}/download-direct`,
                storageProvider: 'cloudflare-r2'
            });
        } else if (zipInfo && zipInfo.zipStatus === 'failed') {
            console.log(`❌ R2 ZIP creation failed`);
            
            return res.status(500).json({
                success: false,
                status: 'failed',
                message: 'ZIP creation failed in Cloudflare R2',
                error: zipInfo.zipMetadata?.error || 'Unknown error',
                fallbackUrl: `/orthanc-download/study/${orthancStudyId}/download-direct`,
                storageProvider: 'cloudflare-r2'
            });
        } else {
            // No pre-processed ZIP available
            console.log(`📦 No pre-processed ZIP available in R2 for: ${orthancStudyId}`);
            
            return res.status(404).json({
                success: false,
                status: 'not_available',
                message: 'Pre-processed ZIP not available in Cloudflare R2',
                canCreate: true,
                createUrl: `/orthanc/create-zip/${orthancStudyId}`,
                fallbackUrl: `/orthanc-download/study/${orthancStudyId}/download-direct`,
                storageProvider: 'cloudflare-r2'
            });
        }
        
    } catch (error) {
        console.error('Error in R2 pre-processed download:', error);
        res.status(500).json({
            success: false,
            message: 'R2 pre-processed download failed',
            error: error.message,
            fallbackUrl: `/orthanc-download/study/${req.params.orthancStudyId}/download-direct`,
            storageProvider: 'cloudflare-r2'
        });
    }
};

// Get download info for R2
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
                storageProvider: zipInfo.zipMetadata?.storageProvider || 'cloudflare-r2',
                cdnEnabled: zipInfo.zipMetadata?.cdnEnabled || true,
                customDomain: zipInfo.zipMetadata?.customDomain || false,
                downloadMethods: {
                    preProcessed: `/api/download/study/${orthancStudyId}/pre-processed`,
                    r2Direct: `/api/download/study/${orthancStudyId}/r2-direct`,
                    direct: `/api/orthanc-download/study/${orthancStudyId}/download-direct`,
                    create: `/api/orthanc/create-zip/${orthancStudyId}`,
                    info: `/api/download/study/${orthancStudyId}/info`
                }
            }
        });
        
    } catch (error) {
        console.error('Error getting R2 download info:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get R2 download information',
            error: error.message
        });
    }
};

// Create ZIP manually in R2
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
                message: 'ZIP creation already in progress in Cloudflare R2',
                status: 'processing',
                jobId: study.preProcessedDownload.zipJobId,
                storageProvider: 'cloudflare-r2'
            });
        }
        
        if (study.preProcessedDownload?.zipStatus === 'completed' && study.preProcessedDownload?.zipUrl) {
            return res.json({
                success: true,
                message: 'ZIP already exists in Cloudflare R2',
                status: 'completed',
                zipUrl: study.preProcessedDownload.zipUrl,
                zipSizeMB: study.preProcessedDownload.zipSizeMB,
                storageProvider: 'cloudflare-r2',
                cdnEnabled: true
            });
        }
        
        // Queue new ZIP creation job for R2
        const zipJob = await cloudflareR2ZipService.addZipJob({
            orthancStudyId: orthancStudyId,
            studyDatabaseId: study._id,
            studyInstanceUID: study.studyInstanceUID,
            instanceCount: study.instanceCount || 0,
            seriesCount: study.seriesCount || 0
        });
        
        res.json({
            success: true,
            message: 'ZIP creation queued for Cloudflare R2',
            jobId: zipJob.id,
            status: 'queued',
            checkStatusUrl: `/api/orthanc/zip-status/${zipJob.id}`,
            downloadUrl: `/api/download/study/${orthancStudyId}/pre-processed`,
            storageProvider: 'cloudflare-r2',
            cdnEnabled: true
        });
        
    } catch (error) {
        console.error('Error creating R2 ZIP:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to queue ZIP creation in Cloudflare R2',
            error: error.message
        });
    }
};

// Replace the downloadFromWasabi function with downloadFromR2
// ✅ UPDATE: The downloadFromR2 function to use 30-day expiry
export const downloadFromR2 = async (req, res) => {
    try {
        const { orthancStudyId } = req.params;
        
        console.log(`🌐 R2 download requested for: ${orthancStudyId}`);
        const requestStart = Date.now();
        
        const study = await DicomStudy.findOne(
            { orthancStudyID: orthancStudyId },
            { preProcessedDownload: 1, _id: 1 }
        ).lean();
        
        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }
        
        const zipInfo = study.preProcessedDownload;
        
        if (!zipInfo || zipInfo.zipStatus !== 'completed' || !zipInfo.zipKey) {
            return res.status(404).json({
                success: false,
                message: 'Pre-processed ZIP not available in Cloudflare R2',
                status: 'not_available'
            });
        }
        
        console.log(`✅ R2 ZIP available: ${zipInfo.zipFileName} (${zipInfo.zipSizeMB}MB)`);
        
        // ✅ SMART: Generate URL based on configuration with 30-day expiry
        let downloadUrl;
        let downloadMethod;
        let urlExpires = false;
        let expiresIn = null;
        let expiryDate = null;
        
        if (r2Config.features.enablePresignedUrls) {
            // ✅ Use presigned URLs with 30-day expiry (recommended for medical data)
            const expirySeconds = r2Config.presignedSettings.defaultExpirySeconds; // 30 days
            downloadUrl = await getPresignedUrl(zipInfo.zipKey, expirySeconds);
            downloadMethod = 'cloudflare-r2-presigned-30day';
            urlExpires = true;
            expiresIn = '30 days';
            expiryDate = new Date(Date.now() + (expirySeconds * 1000));
            console.log(`🔐 Generated 30-day presigned URL (expires: ${expiryDate.toISOString()})`);
        } else {
            // Use public URLs (faster but less secure)
            downloadUrl = `${r2Config.publicUrlPattern}/${zipInfo.zipKey}`;
            downloadMethod = 'cloudflare-r2-public';
            urlExpires = false;
            console.log(`🌍 Generated public URL`);
        }
        
        // Update download stats
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
        
        res.set({
            'X-Download-Method': downloadMethod,
            'X-Storage-Provider': 'cloudflare-r2',
            'X-URL-Type': r2Config.features.enablePresignedUrls ? 'presigned-30day' : 'public',
            'X-URL-Expires': urlExpires ? expiryDate.toISOString() : 'never',
            'X-Response-Time': `${totalTime}ms`,
            'Cache-Control': 'no-cache'
        });
        
        res.json({
            success: true,
            message: `Cloudflare R2 ${r2Config.features.enablePresignedUrls ? '30-day presigned' : 'public'} download URL ready`,
            data: {
                downloadUrl: downloadUrl,
                fileName: zipInfo.zipFileName,
                fileSizeMB: zipInfo.zipSizeMB || 0,
                downloadMethod: downloadMethod,
                responseTime: totalTime,
                
                // Security info
                storageProvider: 'cloudflare-r2',
                urlType: r2Config.features.enablePresignedUrls ? 'presigned-30day' : 'public',
                securityLevel: r2Config.features.enablePresignedUrls ? 'high' : 'medium',
                urlExpires: urlExpires,
                expiresIn: expiresIn,
                expiryDate: expiryDate,
                
                // Performance info
                cdnEnabled: true,
                bucketName: 'studyzip',
                expectedSpeed: 'Fast with Cloudflare R2',
                
                // Medical data compliance
                hipaaCompliant: r2Config.features.enablePresignedUrls,
                accessControlled: r2Config.features.enablePresignedUrls,
                auditTrail: true
            }
        });
        
    } catch (error) {
        console.error('❌ R2 download error:', error);
        res.status(500).json({
            success: false,
            message: 'Cloudflare R2 download failed',
            error: error.message
        });
    }
};

// Helper function to update workflow status (unchanged)
async function updateWorkflowStatusForDownload(study, user) {
    try {
        let newStatus;
        let statusNote;
        
        if (user.role === 'doctor_account') {
            newStatus = 'report_downloaded_radiologist';
            statusNote = `Pre-processed study downloaded by radiologist from Cloudflare R2: ${user.fullName || user.email}`;
        } else if (user.role === 'lab_staff' || user.role === 'admin') {
            newStatus = 'report_downloaded';
            statusNote = `Pre-processed study downloaded by ${user.role} from Cloudflare R2: ${user.fullName || user.email}`;
        }
        
        if (newStatus) {
            await updateWorkflowStatus({
                studyId: study._id,
                status: newStatus,
                note: statusNote,
                user: user
            });
            
            console.log(`✅ Workflow status updated to ${newStatus} (R2)`);
        }
    } catch (error) {
        console.error('⚠️ Error updating workflow status:', error);
    }
}