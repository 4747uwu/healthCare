import DicomStudy from '../models/dicomStudyModel.js';
import cloudflareR2ZipService from '../services/wasabi.zip.service.js';
import { r2Config, getCDNOptimizedUrl, getPresignedUrl } from '../config/cloudflare-r2.js';
import { updateWorkflowStatus } from '../utils/workflowStatusManger.js';
import archiver from 'archiver';
import axios from 'axios';
import path from 'path';

/**
 * Create and download bulk ZIP from Cloudflare R2 CDN
 * @route POST /api/bulk-download/r2-zip
 */
export const createBulkR2Zip = async (req, res) => {
    try {
        const { studyIds, downloadName = 'BulkStudies' } = req.body;
        
        if (!studyIds || !Array.isArray(studyIds) || studyIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least one study ID'
            });
        }

        if (studyIds.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 50 studies allowed per bulk download'
            });
        }

        console.log(`🚀 Bulk R2 ZIP download requested for ${studyIds.length} studies by ${req.user.role}: ${req.user.fullName || req.user.email}`);

        // Find studies with R2 ZIP information
        const studies = await DicomStudy.find({ 
            _id: { $in: studyIds },
            'preProcessedDownload.zipStatus': 'completed',
            'preProcessedDownload.zipUrl': { $exists: true }
        })
        .select('_id orthancStudyID patientId patientInfo preProcessedDownload workflowStatus')
        .lean();

        if (studies.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No studies found with completed R2 ZIP files',
                availableStudies: 0,
                requestedStudies: studyIds.length
            });
        }

        // Check for expired ZIPs
        const now = new Date();
        const validStudies = studies.filter(study => {
            const zipInfo = study.preProcessedDownload;
            return !zipInfo.zipExpiresAt || zipInfo.zipExpiresAt > now;
        });

        if (validStudies.length === 0) {
            return res.status(410).json({
                success: false,
                message: 'All R2 ZIP files have expired',
                expiredStudies: studies.length
            });
        }

        // Set response headers for bulk ZIP download
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const bulkZipFileName = `${downloadName}_${validStudies.length}Studies_${timestamp}.zip`;
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${bulkZipFileName}"`);
        res.setHeader('X-Download-Method', 'cloudflare-r2-bulk-cdn');
        res.setHeader('X-Storage-Provider', 'cloudflare-r2');
        res.setHeader('X-Studies-Count', validStudies.length.toString());
        res.setHeader('X-CDN-Enabled', 'true');

        // Create archiver instance for bulk ZIP
        const archive = archiver('zip', {
            zlib: { level: 6 }, // Good compression for bulk downloads
            forceLocalTime: true
        });

        // Handle archiver events
        archive.on('error', (err) => {
            console.error('❌ Bulk ZIP archiver error:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Error creating bulk ZIP archive',
                    error: err.message
                });
            }
        });

        archive.on('warning', (err) => {
            if (err.code === 'ENOENT') {
                console.warn('⚠️ Bulk ZIP archiver warning:', err.message);
            } else {
                console.error('❌ Bulk ZIP archiver warning (critical):', err);
            }
        });

        // Pipe archive to response
        archive.pipe(res);

        let successCount = 0;
        let failedCount = 0;
        let totalSizeMB = 0;

        console.log(`📦 Processing ${validStudies.length} studies for bulk R2 ZIP download`);

        // Process each study
        for (const [index, study] of validStudies.entries()) {
            try {
                const zipInfo = study.preProcessedDownload;
                
                // Extract R2 key from multiple possible locations
                let zipKey = zipInfo.zipKey || 
                           zipInfo.zipMetadata?.r2Key || 
                           zipInfo.zipMetadata?.zipKey;

                // Construct key if not found
                if (!zipKey && zipInfo.zipFileName) {
                    const year = new Date(zipInfo.zipCreatedAt || Date.now()).getFullYear();
                    zipKey = `studies/${year}/${zipInfo.zipFileName}`;
                }

                if (!zipKey) {
                    console.warn(`⚠️ No R2 key found for study ${study._id}, skipping...`);
                    failedCount++;
                    continue;
                }

                // Generate CDN-optimized URL for download
                let downloadUrl;
                
                if (r2Config.features.enablePresignedUrls) {
                    // Use presigned URL for direct access
                    downloadUrl = await getPresignedUrl(zipKey, 3600); // 1 hour expiry for bulk downloads
                } else if (zipInfo.zipUrl && (zipInfo.zipUrl.includes('r2.dev') || zipInfo.zipUrl.includes(r2Config.customDomain))) {
                    // Use existing CDN URL
                    downloadUrl = zipInfo.zipUrl;
                } else {
                    // Generate fresh CDN URL
                    downloadUrl = await getCDNOptimizedUrl(zipKey, {
                        filename: zipInfo.zipFileName,
                        contentType: 'application/zip'
                    });
                }

                console.log(`📥 Downloading study ${index + 1}/${validStudies.length}: ${zipInfo.zipFileName} (${zipInfo.zipSizeMB || 0}MB)`);

                // Download the ZIP file from R2 CDN
                const response = await axios.get(downloadUrl, {
                    responseType: 'stream',
                    timeout: 300000, // 5 minutes timeout for large files
                    maxRedirects: 5,
                    headers: {
                        'User-Agent': 'Medical-Platform-BulkDownload/1.0',
                        'Accept': 'application/zip, */*',
                        'Cache-Control': 'no-cache'
                    }
                });

                // Create descriptive filename for the archive
                const patientId = study.patientId || study.patientInfo?.patientID || 'Unknown';
                const patientName = study.patientInfo?.patientName || 'Unknown';
                const cleanPatientName = patientName.replace(/[^a-zA-Z0-9]/g, '_');
                const cleanPatientId = patientId.replace(/[^a-zA-Z0-9]/g, '_');
                
                const studyPrefix = `Study_${index + 1}_${cleanPatientId}_${cleanPatientName}`;
                const archiveFileName = `${studyPrefix}_${zipInfo.zipFileName}`;

                // Add to bulk archive
                archive.append(response.data, { name: archiveFileName });

                successCount++;
                totalSizeMB += zipInfo.zipSizeMB || 0;

                // Update download statistics (async, don't wait)
                setImmediate(async () => {
                    try {
                        await DicomStudy.findByIdAndUpdate(study._id, {
                            $inc: { 'preProcessedDownload.downloadCount': 1 },
                            'preProcessedDownload.lastDownloaded': new Date()
                        });

                        // Update workflow status for bulk download
                        await updateWorkflowStatus({
                            studyId: study._id,
                            status: req.user.role === 'doctor_account' ? 'report_downloaded_radiologist' : 'report_downloaded',
                            note: `Study downloaded as part of bulk R2 CDN download (${successCount}/${validStudies.length}) by ${req.user.fullName || req.user.email}`,
                            user: req.user
                        });
                    } catch (updateError) {
                        console.warn(`⚠️ Failed to update stats for study ${study._id}:`, updateError.message);
                    }
                });

            } catch (error) {
                console.error(`❌ Failed to download study ${study._id} from R2:`, error.message);
                failedCount++;
                
                // Add error info to archive as text file
                const errorInfo = `Error downloading study: ${study.orthancStudyID || study._id}\nError: ${error.message}\nTimestamp: ${new Date().toISOString()}`;
                archive.append(errorInfo, { name: `ERROR_Study_${index + 1}_${study._id}.txt` });
            }
        }

        // Add summary file to the archive
        const summaryInfo = `Bulk Download Summary
Generated: ${new Date().toISOString()}
Requested by: ${req.user.fullName || req.user.email} (${req.user.role})
Storage Provider: Cloudflare R2 with CDN
Download Method: Bulk R2 CDN Archive

Statistics:
- Total Studies Requested: ${studyIds.length}
- Studies Found with R2 ZIP: ${studies.length}
- Valid (Non-expired) Studies: ${validStudies.length}
- Successfully Downloaded: ${successCount}
- Failed Downloads: ${failedCount}
- Total Size: ${totalSizeMB.toFixed(2)} MB
- Archive Created: ${bulkZipFileName}

Study Details:
${validStudies.map((study, idx) => 
    `${idx + 1}. Patient ID: ${study.patientId || 'N/A'} | ZIP: ${study.preProcessedDownload?.zipFileName || 'N/A'} | Size: ${study.preProcessedDownload?.zipSizeMB || 0}MB`
).join('\n')}

Note: This archive contains pre-processed DICOM studies from Cloudflare R2 storage with global CDN delivery.
Each study ZIP file maintains its original structure and metadata.
`;

        archive.append(summaryInfo, { name: 'DOWNLOAD_SUMMARY.txt' });

        // Finalize the archive
        await archive.finalize();

        console.log(`✅ Bulk R2 ZIP download completed: ${successCount} successful, ${failedCount} failed, ${totalSizeMB.toFixed(2)}MB total`);

    } catch (error) {
        console.error('❌ Bulk R2 ZIP download error:', error);
        
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Failed to create bulk R2 ZIP download',
                error: error.message,
                storageProvider: 'cloudflare-r2'
            });
        } else {
            // If headers already sent, we can't send JSON response
            res.end();
        }
    }
};

/**
 * Get bulk download status and information
 * @route GET /api/bulk-download/r2-info
 */
export const getBulkR2Info = async (req, res) => {
    try {
        const { studyIds } = req.query;
        
        if (!studyIds) {
            return res.status(400).json({
                success: false,
                message: 'Please provide study IDs'
            });
        }

        const studyIdArray = Array.isArray(studyIds) ? studyIds : studyIds.split(',').map(id => id.trim());

        if (studyIdArray.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 50 studies allowed per bulk download check'
            });
        }

        // Find studies with R2 ZIP status
        const studies = await DicomStudy.find({ 
            _id: { $in: studyIdArray }
        })
        .select('_id orthancStudyID patientId patientInfo preProcessedDownload workflowStatus')
        .lean();

        const now = new Date();
        
        const analysisResults = {
            totalRequested: studyIdArray.length,
            studiesFound: studies.length,
            studiesNotFound: studyIdArray.length - studies.length,
            zipAvailable: 0,
            zipProcessing: 0,
            zipFailed: 0,
            zipExpired: 0,
            zipNotStarted: 0,
            totalSizeMB: 0,
            canBulkDownload: false,
            studyDetails: [],
            estimatedTime: '0 minutes',
            storageProvider: 'cloudflare-r2',
            cdnEnabled: true
        };

        for (const study of studies) {
            const zipInfo = study.preProcessedDownload;
            const isExpired = zipInfo?.zipExpiresAt && zipInfo.zipExpiresAt <= now;
            
            let status = 'not_started';
            let sizeMB = 0;
            
            if (zipInfo) {
                if (zipInfo.zipStatus === 'completed' && zipInfo.zipUrl && !isExpired) {
                    status = 'available';
                    analysisResults.zipAvailable++;
                    sizeMB = zipInfo.zipSizeMB || 0;
                    analysisResults.totalSizeMB += sizeMB;
                } else if (zipInfo.zipStatus === 'processing') {
                    status = 'processing';
                    analysisResults.zipProcessing++;
                } else if (zipInfo.zipStatus === 'failed') {
                    status = 'failed';
                    analysisResults.zipFailed++;
                } else if (isExpired) {
                    status = 'expired';
                    analysisResults.zipExpired++;
                } else {
                    analysisResults.zipNotStarted++;
                }
            } else {
                analysisResults.zipNotStarted++;
            }

            analysisResults.studyDetails.push({
                studyId: study._id,
                orthancStudyId: study.orthancStudyID,
                patientId: study.patientId || study.patientInfo?.patientID,
                patientName: study.patientInfo?.patientName,
                zipStatus: status,
                zipSizeMB: sizeMB,
                zipFileName: zipInfo?.zipFileName,
                zipCreatedAt: zipInfo?.zipCreatedAt,
                zipExpiresAt: zipInfo?.zipExpiresAt,
                workflowStatus: study.workflowStatus
            });
        }

        // Determine if bulk download is possible
        analysisResults.canBulkDownload = analysisResults.zipAvailable > 0;
        
        // Estimate download time based on total size
        if (analysisResults.totalSizeMB > 0) {
            const estimatedMinutes = Math.ceil(analysisResults.totalSizeMB / 100); // Assume 100MB/minute with R2 CDN
            analysisResults.estimatedTime = estimatedMinutes > 60 
                ? `${Math.ceil(estimatedMinutes / 60)} hours` 
                : `${estimatedMinutes} minutes`;
        }

        res.json({
            success: true,
            message: `Analysis complete for ${studyIdArray.length} studies`,
            data: analysisResults,
            recommendations: {
                canProceed: analysisResults.canBulkDownload,
                shouldCreateMissing: analysisResults.zipNotStarted > 0,
                shouldRetryFailed: analysisResults.zipFailed > 0,
                hasExpiredFiles: analysisResults.zipExpired > 0,
                processingInProgress: analysisResults.zipProcessing > 0
            },
            endpoints: {
                bulkDownload: '/api/bulk-download/r2-zip',
                createMissing: '/api/orthanc/create-zip-batch',
                checkStatus: '/api/bulk-download/r2-info'
            }
        });

    } catch (error) {
        console.error('❌ Error getting bulk R2 info:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to analyze bulk download readiness',
            error: error.message
        });
    }
};

/**
 * Create missing R2 ZIP files for bulk download
 * @route POST /api/bulk-download/create-missing-zips
 */
export const createMissingR2Zips = async (req, res) => {
    try {
        const { studyIds } = req.body;
        
        if (!studyIds || !Array.isArray(studyIds) || studyIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide study IDs array'
            });
        }

        if (studyIds.length > 20) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 20 studies allowed per batch ZIP creation'
            });
        }

        // Find studies that need ZIP creation
        const studies = await DicomStudy.find({ 
            _id: { $in: studyIds }
        })
        .select('_id orthancStudyID studyInstanceUID instanceCount seriesCount preProcessedDownload')
        .lean();

        const now = new Date();
        const studiesNeedingZip = studies.filter(study => {
            const zipInfo = study.preProcessedDownload;
            
            if (!zipInfo || zipInfo.zipStatus !== 'completed' || !zipInfo.zipUrl) {
                return true; // Needs ZIP creation
            }
            
            // Check if expired
            if (zipInfo.zipExpiresAt && zipInfo.zipExpiresAt <= now) {
                return true; // Expired, needs recreation
            }
            
            return false; // Already has valid ZIP
        });

        if (studiesNeedingZip.length === 0) {
            return res.json({
                success: true,
                message: 'All studies already have valid R2 ZIP files',
                studiesProcessed: 0,
                studiesSkipped: studies.length
            });
        }

        // Queue ZIP creation jobs
        const queuedJobs = [];
        for (const study of studiesNeedingZip) {
            try {
                const zipJob = await cloudflareR2ZipService.addZipJob({
                    orthancStudyId: study.orthancStudyID,
                    studyDatabaseId: study._id,
                    studyInstanceUID: study.studyInstanceUID,
                    instanceCount: study.instanceCount || 0,
                    seriesCount: study.seriesCount || 0
                });

                queuedJobs.push({
                    studyId: study._id,
                    orthancStudyId: study.orthancStudyID,
                    jobId: zipJob.id,
                    status: 'queued'
                });

            } catch (error) {
                console.error(`❌ Failed to queue ZIP job for study ${study._id}:`, error);
                queuedJobs.push({
                    studyId: study._id,
                    orthancStudyId: study.orthancStudyID,
                    jobId: null,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        const successCount = queuedJobs.filter(job => job.status === 'queued').length;
        const failCount = queuedJobs.length - successCount;

        res.json({
            success: true,
            message: `Queued ZIP creation for ${successCount} studies, ${failCount} failed`,
            data: {
                totalRequested: studyIds.length,
                studiesNeedingZip: studiesNeedingZip.length,
                studiesQueued: successCount,
                studiesFailed: failCount,
                estimatedCompletion: '5-15 minutes per study',
                queuedJobs: queuedJobs,
                checkStatusUrl: '/api/bulk-download/r2-info',
                bulkDownloadUrl: '/api/bulk-download/r2-zip'
            },
            storageProvider: 'cloudflare-r2'
        });

    } catch (error) {
        console.error('❌ Error creating missing R2 ZIPs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to queue missing ZIP creation',
            error: error.message
        });
    }
};