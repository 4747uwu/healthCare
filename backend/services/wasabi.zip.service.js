import axios from 'axios';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import {
    HeadBucketCommand,
    CreateBucketCommand,
    PutObjectCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
    PutBucketCorsCommand,
    PutBucketPolicyCommand,
    HeadObjectCommand
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { r2Client, r2Config, getR2PublicUrl, getCDNOptimizedUrl } from '../config/cloudflare-r2.js';
import DicomStudy from '../models/dicomStudyModel.js';

// ✅ ADDED: Promisify filesystem operations for better async handling
const fsAccess = promisify(fs.access);
const fsUnlink = promisify(fs.unlink);
const fsRmdir = promisify(fs.rmdir);
const fsStat = promisify(fs.stat);

const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice';
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePassword';
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');

// ✅ ADDED: Get the shared storage path from environment variables
const ORTHANC_STORAGE_PATH = process.env.ORTHANC_STORAGE_PATH || '/root/orthanc/orthancstorage';
if (!ORTHANC_STORAGE_PATH) {
    console.error("❌ FATAL ERROR: ORTHANC_STORAGE_PATH environment variable is not set.");
    process.exit(1);
}

console.log(`📁 Orthanc Storage Path: ${ORTHANC_STORAGE_PATH}`);

class CloudflareR2ZipService {
    constructor() {
        this.r2 = r2Client;
        this.zipJobs = new Map();
        this.processing = new Set();
        this.nextJobId = 1;
        this.isProcessing = false;
        
        this.concurrency = 2; // ✅ REDUCED: Lower concurrency for filesystem operations
        this.processingDelay = 3000; // ✅ INCREASED: More time between jobs
        this.zipBucket = r2Config.zipBucket;
        
        this.instanceBatchSize = 50; // ✅ INCREASED: Process more files per batch (filesystem is faster)
        this.maxRetries = 3;
        this.retryDelay = 2000;
        
        // ✅ NEW: Cleanup configuration
        this.enableAutoCleanup = process.env.ENABLE_INSTANCE_CLEANUP === 'true' || true; // Default to true
        this.cleanupDelay = 5000; // Wait 5 seconds after ZIP completion before cleanup
        
        console.log(`📦 R2 ZIP Service initialized (FILESYSTEM MODE WITH AUTO-CLEANUP):`);
        console.log(`💽 Reading from storage path: ${ORTHANC_STORAGE_PATH}`);
        console.log(`🔧 Concurrency: ${this.concurrency}`);
        console.log(`📦 Instance batch size: ${this.instanceBatchSize}`);
        console.log(`🗑️ Auto-cleanup enabled: ${this.enableAutoCleanup}`);
        
        // ✅ VERIFY: Check if storage path exists and is accessible
        this.verifyStoragePath();
    }

    // ✅ NEW: Verify storage path accessibility
    async verifyStoragePath() {
        try {
            await fsAccess(ORTHANC_STORAGE_PATH, fs.constants.R_OK);
            console.log(`✅ Orthanc storage path verified: ${ORTHANC_STORAGE_PATH}`);
        } catch (error) {
            console.error(`❌ FATAL: Cannot access Orthanc storage path: ${ORTHANC_STORAGE_PATH}`);
            console.error(`❌ Error: ${error.message}`);
            process.exit(1);
        }
    }

    // Add ZIP creation job to queue
    async addZipJob(studyData) {
        const jobId = this.nextJobId++;
        const job = {
            id: jobId,
            type: 'create-study-zip-r2',
            data: studyData,
            status: 'waiting',
            createdAt: new Date(),
            progress: 0,
            result: null,
            error: null,
            instancesProcessed: [], // ✅ NEW: Track processed instances for cleanup
            cleanupStatus: 'pending' // ✅ NEW: Track cleanup status
        };
        
        this.zipJobs.set(jobId, job);
        console.log(`📦 R2 ZIP Creation Job ${jobId} queued for study: ${studyData.orthancStudyId}`);
        
        if (!this.isProcessing) {
            this.startZipProcessing();
        }
        
        return job;
    }

    // Optimized queue processing
    async startZipProcessing() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        
        console.log('🚀 Cloudflare R2 ZIP Creation Queue processor started (FILESYSTEM MODE)');
        
        while (this.getWaitingZipJobs().length > 0 || this.processing.size > 0) {
            const memUsage = process.memoryUsage();
            const memUsedGB = memUsage.heapUsed / (1024 * 1024 * 1024);
            
            if (this.processing.size < this.concurrency && this.getWaitingZipJobs().length > 0) {
                const waitingJobs = this.getWaitingZipJobs();
                const job = waitingJobs[0];
                
                console.log(`📊 System Status: Memory: ${memUsedGB.toFixed(2)}GB, Queue: ${waitingJobs.length}`);
                this.processZipJob(job); // Run async without await
            }
            
            await new Promise(resolve => setTimeout(resolve, this.processingDelay));
        }
        
        this.isProcessing = false;
        console.log('⏹️ Cloudflare R2 ZIP Creation Queue processor stopped');
    }

    // Process a single job
    async processZipJob(job) {
        this.processing.add(job.id);
        job.status = 'active';
        
        const memUsage = process.memoryUsage();
        const memUsedGB = memUsage.heapUsed / (1024 * 1024 * 1024);
        
        console.log(`🚀 Processing R2 ZIP Job ${job.id} (Memory: ${memUsedGB.toFixed(2)}GB)`);
        
        try {
            job.result = await this.createAndUploadStudyZipToR2(job);
            job.status = 'completed';
            console.log(`✅ R2 ZIP Job ${job.id} completed successfully`);
            
            // ✅ NEW: Schedule cleanup after successful ZIP creation
            if (this.enableAutoCleanup && job.instancesProcessed.length > 0) {
                console.log(`🗑️ Scheduling cleanup for ${job.instancesProcessed.length} instances in ${this.cleanupDelay}ms`);
                setTimeout(() => {
                    this.cleanupInstanceFiles(job);
                }, this.cleanupDelay);
            }
            
            if (global.gc) {
                global.gc();
                console.log(`🗑️ Garbage collection triggered after job ${job.id}`);
            }

        } catch (error) {
            console.error(`❌ R2 ZIP Job ${job.id} failed:`, error.message);
            job.error = error.message;
            job.status = 'failed';
            
            // ✅ NEW: Still cleanup instances even if ZIP failed (optional)
            if (this.enableAutoCleanup && job.instancesProcessed.length > 0) {
                console.log(`🗑️ Cleaning up instances despite ZIP failure`);
                setTimeout(() => {
                    this.cleanupInstanceFiles(job);
                }, this.cleanupDelay);
            }
        } finally {
            this.processing.delete(job.id);
        }
    }
    
    async createAndUploadStudyZipToR2(job) {
        const { orthancStudyId, studyDatabaseId, studyInstanceUID } = job.data;
        const startTime = Date.now();
        
        try {
            console.log(`[ZIP WORKER] 📦 Starting job for study: ${orthancStudyId} (Filesystem Method)`);
            
            await DicomStudy.findByIdAndUpdate(studyDatabaseId, { 
                'preProcessedDownload.zipStatus': 'processing',
                'preProcessedDownload.zipJobId': job.id.toString(),
                'preProcessedDownload.zipMetadata.createdBy': 'cloudflare-r2-service-filesystem',
                'preProcessedDownload.zipMetadata.storageProvider': 'cloudflare-r2',
                'preProcessedDownload.zipMetadata.method': 'filesystem-direct-read'
            });
            job.progress = 10;

            console.log(`[ZIP WORKER] 🔍 Fetching all instance metadata from Orthanc...`);
            const instancesUrl = `${ORTHANC_BASE_URL}/studies/${orthancStudyId}/instances?expanded=true`;
            const instancesResponse = await axios.get(instancesUrl, { 
                headers: { 'Authorization': orthancAuth }, 
                timeout: 30000 
            });
            const detailedInstances = instancesResponse.data;

            if (!detailedInstances || detailedInstances.length === 0) {
                throw new Error("No instances found for this study");
            }
            
            console.log(`[ZIP WORKER] 📊 Found ${detailedInstances.length} instances to process`);
            job.progress = 25;

            const firstInstance = detailedInstances[0];
            const patientName = (firstInstance.PatientMainDicomTags.PatientName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_');
            const patientId = (firstInstance.PatientMainDicomTags.PatientID || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_');
            const studyDate = firstInstance.MainDicomTags.StudyDate || '';
            const zipFileName = `Study_${patientName}_${patientId}_${studyDate}_${orthancStudyId}.zip`;
            
            console.log(`[ZIP WORKER] 📂 Creating ZIP with name: ${zipFileName}`);

            // ✅ ENHANCED: Group instances by series and verify file existence
            const seriesMap = new Map();
            const existingInstances = [];
            const missingInstances = [];
            
            for (const instance of detailedInstances) {
                const seriesInstanceUID = instance.MainDicomTags.SeriesInstanceUID;
                
                // ✅ CHECK: Verify instance file exists before adding to series
                const instanceFilePath = this.getInstanceFilePath(instance.ID);
                try {
                    await fsAccess(instanceFilePath, fs.constants.R_OK);
                    existingInstances.push(instance);
                    
                    if (!seriesMap.has(seriesInstanceUID)) {
                        const seriesDescription = (instance.MainDicomTags.SeriesDescription || 'UnknownSeries')
                            .replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 50);
                        const seriesNumber = String(instance.MainDicomTags.SeriesNumber || '000').padStart(3, '0');
                        seriesMap.set(seriesInstanceUID, {
                            folderName: `Series_${seriesNumber}_${seriesDescription}`,
                            instances: []
                        });
                    }
                    seriesMap.get(seriesInstanceUID).instances.push(instance.ID);
                    
                } catch (error) {
                    missingInstances.push(instance.ID);
                    console.warn(`[ZIP WORKER] ⚠️ Instance file not found: ${instance.ID} at ${instanceFilePath}`);
                }
            }

            console.log(`[ZIP WORKER] 📁 File check: ${existingInstances.length} found, ${missingInstances.length} missing`);
            console.log(`[ZIP WORKER] 📁 Organized into ${seriesMap.size} series`);
            
            if (existingInstances.length === 0) {
                throw new Error("No instance files found on filesystem");
            }
            
            job.progress = 35;

            // ✅ SETUP: Create ZIP stream and upload
            const zipStream = new PassThrough();
            const archive = archiver('zip', { zlib: { level: 6 } });
            
            archive.on('error', (err) => {
                console.error('[ZIP WORKER] ❌ Archiver error:', err);
                zipStream.destroy(err);
            });
            
            archive.pipe(zipStream);
            
            const uploadPromise = this.uploadZipToR2(zipStream, zipFileName, {
                studyInstanceUID, 
                orthancStudyId, 
                totalInstances: existingInstances.length,
                totalSeries: seriesMap.size,
                patientName: patientName
            });
            
            console.log(`[ZIP WORKER] 📤 Started streaming upload to R2`);
            job.progress = 40;

            // ✅ PROCESS: Add instances to ZIP from filesystem
            let processedInstances = 0;
            const totalInstances = existingInstances.length;
            
            for (const [seriesUID, seriesData] of seriesMap.entries()) {
                for (let i = 0; i < seriesData.instances.length; i += this.instanceBatchSize) {
                    const batch = seriesData.instances.slice(i, i + this.instanceBatchSize);
                    
                    await Promise.all(batch.map(async (instanceId, index) => {
                        const success = await this.addInstanceFromFileToArchive(
                            archive, instanceId, seriesData.folderName, processedInstances + index + 1
                        );
                        
                        // ✅ TRACK: Keep track of successfully processed instances for cleanup
                        if (success) {
                            job.instancesProcessed.push(instanceId);
                        }
                    }));
                    
                    processedInstances += batch.length;
                    job.progress = 40 + Math.floor((processedInstances / totalInstances) * 45);
                    console.log(`[ZIP WORKER] 📦 Processed ${processedInstances}/${totalInstances} instances`);
                }
            }

            // ✅ FINALIZE: Complete ZIP and upload
            console.log(`[ZIP WORKER] 🔒 Finalizing archive...`);
            await archive.finalize();
            job.progress = 85;
            
            console.log(`[ZIP WORKER] ⏳ Waiting for R2 upload to complete...`);
            const r2Result = await uploadPromise;
            job.progress = 95;
            
            const processingTime = Date.now() - startTime;
            const zipSizeMB = Math.round((r2Result.size || 0) / 1024 / 1024 * 100) / 100;
            
            // ✅ GENERATE: URLs and update database
            const cdnUrl = await getCDNOptimizedUrl(r2Result.key, { 
                filename: zipFileName, 
                contentType: 'application/zip' 
            });
            const publicUrl = getR2PublicUrl(r2Result.key, r2Config.features.enableCustomDomain);
            
            const updateData = {
                'preProcessedDownload.zipUrl': cdnUrl,
                'preProcessedDownload.zipPublicUrl': publicUrl,
                'preProcessedDownload.zipFileName': zipFileName,
                'preProcessedDownload.zipSizeMB': zipSizeMB,
                'preProcessedDownload.zipCreatedAt': new Date(),
                'preProcessedDownload.zipStatus': 'completed',
                'preProcessedDownload.zipMetadata.processingTime': processingTime,
                'preProcessedDownload.zipMetadata.instancesProcessed': job.instancesProcessed.length,
                'preProcessedDownload.zipMetadata.missingInstances': missingInstances.length,
                'preProcessedDownload.zipMetadata.cleanupScheduled': this.enableAutoCleanup
            };
            
            await DicomStudy.findByIdAndUpdate(studyDatabaseId, updateData);
            job.progress = 100;
            
            console.log(`[ZIP WORKER] ✅ ZIP created: ${zipFileName} - ${zipSizeMB}MB in ${processingTime}ms`);
            console.log(`[ZIP WORKER] 📊 Processed ${job.instancesProcessed.length} instances successfully`);
            
            return { 
                success: true, 
                zipUrl: cdnUrl, 
                zipPublicUrl: publicUrl,
                zipFileName, 
                zipSizeMB, 
                processingTime,
                instancesProcessed: job.instancesProcessed.length,
                cleanupScheduled: this.enableAutoCleanup
            };

        } catch (error) {
            console.error(`[ZIP WORKER] ❌ Failed to create ZIP via filesystem method:`, error);
            await DicomStudy.findByIdAndUpdate(studyDatabaseId, { 
                'preProcessedDownload.zipStatus': 'failed',
                'preProcessedDownload.zipMetadata.error': error.message,
                'preProcessedDownload.zipMetadata.instancesProcessed': job.instancesProcessed.length
            });
            throw error;
        }
    }

    /**
     * ✅ ENHANCED: Get the filesystem path for an Orthanc instance
     * @param {string} instanceId - The Orthanc instance UUID
     * @returns {string} - The full file path to the instance
     */
    getInstanceFilePath(instanceId) {
        // Orthanc uses a sharded directory structure: /XX/XX/XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
        const char1 = instanceId.substring(0, 2);
        const char2 = instanceId.substring(2, 4);
        return path.join(ORTHANC_STORAGE_PATH, char1, char2, instanceId);
    }

    /**
     * ✅ ENHANCED: Add instance from filesystem to archive with better error handling
     * @param {archiver.Archiver} archive - The archiver instance
     * @param {string} instanceId - The Orthanc instance UUID
     * @param {string} folderName - The series folder name in the ZIP
     * @param {number} fileNumber - Sequential file number for logging
     * @returns {boolean} - True if successful, false if failed
     */
    async addInstanceFromFileToArchive(archive, instanceId, folderName, fileNumber) {
        try {
            const filePath = this.getInstanceFilePath(instanceId);
            const zipEntryName = `${folderName}/${instanceId}.dcm`;
            
            // ✅ VERIFY: Check file exists and get its size
            try {
                const stats = await fsStat(filePath);
                
                if (stats.isFile() && stats.size > 0) {
                    // ✅ STREAM: Add file to archive using stream for memory efficiency
                    archive.append(fs.createReadStream(filePath), { name: zipEntryName });
                    
                    if (fileNumber % 100 === 0) { // Log every 100 files
                        console.log(`[ZIP WORKER | FS] ✅ Added ${fileNumber}: ${zipEntryName} (${this.formatBytes(stats.size)})`);
                    }
                    
                    return true;
                } else {
                    throw new Error(`File is empty or not a file: size=${stats.size}, isFile=${stats.isFile()}`);
                }
                
            } catch (statError) {
                throw new Error(`File access error: ${statError.message}`);
            }

        } catch (error) {
            console.error(`[ZIP WORKER | FS] ❌ Failed to add instance ${instanceId}:`, error.message);
            
            // ✅ FALLBACK: Add error file to ZIP instead of failing entire job
            const errorContent = `Error processing instance ${instanceId} from filesystem: ${error.message}\nFile path: ${this.getInstanceFilePath(instanceId)}`;
            const errorFileName = `${folderName}/ERROR_${instanceId}.txt`;
            archive.append(Buffer.from(errorContent), { name: errorFileName });
            
            return false;
        }
    }

    /**
     * ✅ NEW: Clean up instance files from filesystem after successful ZIP creation
     * @param {Object} job - The completed ZIP job
     */
    async cleanupInstanceFiles(job) {
        if (!this.enableAutoCleanup || !job.instancesProcessed || job.instancesProcessed.length === 0) {
            console.log(`[CLEANUP] ⚠️ Cleanup skipped - not enabled or no instances processed`);
            return;
        }

        const { orthancStudyId } = job.data;
        console.log(`[CLEANUP] 🗑️ Starting cleanup for ${job.instancesProcessed.length} instances from study: ${orthancStudyId}`);
        
        let cleanedCount = 0;
        let failedCount = 0;
        const cleanupErrors = [];

        for (const instanceId of job.instancesProcessed) {
            try {
                const filePath = this.getInstanceFilePath(instanceId);
                
                // ✅ VERIFY: Check file still exists before attempting deletion
                try {
                    await fsAccess(filePath, fs.constants.F_OK);
                    await fsUnlink(filePath);
                    cleanedCount++;
                    
                    if (cleanedCount % 50 === 0) {
                        console.log(`[CLEANUP] 🗑️ Cleaned ${cleanedCount}/${job.instancesProcessed.length} instances`);
                    }
                    
                } catch (unlinkError) {
                    if (unlinkError.code === 'ENOENT') {
                        // File already doesn't exist - count as success
                        cleanedCount++;
                    } else {
                        throw unlinkError;
                    }
                }
                
            } catch (error) {
                failedCount++;
                cleanupErrors.push({ instanceId, error: error.message });
                console.warn(`[CLEANUP] ⚠️ Failed to delete instance ${instanceId}: ${error.message}`);
            }
        }

        // ✅ CLEANUP: Try to remove empty directories
        await this.cleanupEmptyDirectories(job.instancesProcessed);

        // ✅ UPDATE: Record cleanup results in job and database
        job.cleanupStatus = 'completed';
        job.cleanupResults = {
            cleanedCount,
            failedCount,
            totalRequested: job.instancesProcessed.length,
            errors: cleanupErrors.slice(0, 5) // Keep only first 5 errors
        };

        // ✅ UPDATE: Database with cleanup information
        try {
            await DicomStudy.findByIdAndUpdate(job.data.studyDatabaseId, {
                'preProcessedDownload.zipMetadata.cleanup': {
                    completed: true,
                    completedAt: new Date(),
                    instancesCleaned: cleanedCount,
                    instancesFailed: failedCount,
                    totalInstances: job.instancesProcessed.length
                }
            });
        } catch (dbError) {
            console.warn(`[CLEANUP] ⚠️ Failed to update database with cleanup results: ${dbError.message}`);
        }

        console.log(`[CLEANUP] ✅ Cleanup completed for study ${orthancStudyId}: ${cleanedCount} cleaned, ${failedCount} failed`);
        
        // ✅ FORCE: Garbage collection after cleanup
        if (global.gc) {
            global.gc();
            console.log(`[CLEANUP] 🗑️ Garbage collection triggered after cleanup`);
        }
    }

    /**
     * ✅ NEW: Clean up empty directories after instance deletion
     * @param {Array} instanceIds - Array of instance IDs that were deleted
     */
    async cleanupEmptyDirectories(instanceIds) {
        const dirsToCheck = new Set();
        
        // ✅ COLLECT: Unique directories that might now be empty
        for (const instanceId of instanceIds) {
            const char1 = instanceId.substring(0, 2);
            const char2 = instanceId.substring(2, 4);
            const subDir = path.join(ORTHANC_STORAGE_PATH, char1, char2);
            dirsToCheck.add(subDir);
        }

        // ✅ CLEANUP: Try to remove empty directories
        for (const dirPath of dirsToCheck) {
            try {
                const files = fs.readdirSync(dirPath);
                if (files.length === 0) {
                    await fsRmdir(dirPath);
                    console.log(`[CLEANUP] 📁 Removed empty directory: ${dirPath}`);
                }
            } catch (error) {
                // ✅ SILENT: Don't log errors for directory cleanup (not critical)
                if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') {
                    console.warn(`[CLEANUP] ⚠️ Could not clean directory ${dirPath}: ${error.message}`);
                }
            }
        }
    }

    // Upload ZIP to R2 (unchanged from original)
    async uploadZipToR2(zipStream, fileName, metadata) {
        const year = new Date().getFullYear();
        const key = `studies/${year}/${fileName}`;
        
        console.log(`[R2] 📤 FILESYSTEM Upload: ${fileName} to key: ${key}`);
        
        try {
            const upload = new Upload({
                client: this.r2,
                params: {
                    Bucket: this.zipBucket,
                    Key: key,
                    Body: zipStream,
                    ContentType: 'application/zip',
                    ContentDisposition: `attachment; filename="${fileName}"`,
                    CacheControl: `public, max-age=${r2Config.cdnSettings?.cacheMaxAge || 86400}`,
                    
                    Metadata: {
                        'study-instance-uid': metadata.studyInstanceUID || '',
                        'orthanc-study-id': metadata.orthancStudyId || '',
                        'total-instances': metadata.totalInstances?.toString() || '0',
                        'total-series': metadata.totalSeries?.toString() || '0',
                        'created-at': new Date().toISOString(),
                        'service-version': 'cloudflare-r2-filesystem-with-cleanup',
                        'download-method': 'filesystem-direct-read'
                    },
                    
                    StorageClass: 'STANDARD'
                },
                
                partSize: 10 * 1024 * 1024,  // 10MB parts
                leavePartsOnError: false,
                queueSize: 4,
                
                requestHandler: {
                    requestTimeout: 600000,   // 10 minutes
                    connectionTimeout: 60000  // 1 minute
                }
            });

            // Progress tracking
            let lastLogTime = 0;
            upload.on('httpUploadProgress', (progress) => {
                if (progress.total) {
                    const now = Date.now();
                    const percentComplete = Math.round((progress.loaded / progress.total) * 100);
                    
                    if (percentComplete % 25 === 0 || (now - lastLogTime) > 120000) {
                        console.log(`[R2] 📊 ${fileName}: ${percentComplete}% (${this.formatBytes(progress.loaded)})`);
                        lastLogTime = now;
                    }
                }
            });

            const result = await upload.done();
            
            // Get actual file size after upload
            let fileSize = 0;
            try {
                const headCmd = new HeadObjectCommand({ 
                    Bucket: this.zipBucket, 
                    Key: key 
                });
                const headResult = await this.r2.send(headCmd);
                fileSize = headResult.ContentLength || 0;
            } catch (headError) {
                console.warn(`[R2] ⚠️ Could not get file size for ${fileName}:`, headError.message);
            }
            
            console.log(`[R2] ✅ FILESYSTEM Upload completed: ${fileName} (${this.formatBytes(fileSize)})`);
            
            return {
                url: getCDNOptimizedUrl(key, { filename: fileName, contentType: 'application/zip' }),
                publicUrl: getR2PublicUrl(key),
                key: key,
                bucket: this.zipBucket,
                etag: result.ETag,
                size: fileSize
            };
            
        } catch (error) {
            console.error(`[R2] ❌ FILESYSTEM Upload failed: ${fileName}`, error.message);
            throw new Error(`Upload failed: ${error.message}`);
        }
    }

    // Utility: Format bytes helper
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // ✅ ENHANCED: Get job with cleanup status
    getJob(jobId) {
        const job = this.zipJobs.get(jobId);
        if (job) {
            return {
                ...job,
                cleanupInfo: {
                    enabled: this.enableAutoCleanup,
                    status: job.cleanupStatus || 'pending',
                    results: job.cleanupResults || null
                }
            };
        }
        return null;
    }

    // Get waiting jobs
    getWaitingZipJobs() {
        return Array.from(this.zipJobs.values()).filter(job => job.status === 'waiting');
    }

    // Get all jobs
    getAllJobs() {
        return Array.from(this.zipJobs.values());
    }

    // ✅ ENHANCED: Job stats with cleanup information
    getJobStats() {
        const jobs = this.getAllJobs();
        return {
            total: jobs.length,
            waiting: jobs.filter(j => j.status === 'waiting').length,
            active: jobs.filter(j => j.status === 'active').length,
            completed: jobs.filter(j => j.status === 'completed').length,
            failed: jobs.filter(j => j.status === 'failed').length,
            processing: this.processing.size,
            isProcessing: this.isProcessing,
            storageProvider: 'cloudflare-r2',
            method: 'filesystem-direct-read-with-cleanup',
            cleanup: {
                enabled: this.enableAutoCleanup,
                completedJobs: jobs.filter(j => j.cleanupStatus === 'completed').length,
                pendingCleanup: jobs.filter(j => j.status === 'completed' && j.cleanupStatus !== 'completed').length
            }
        };
    }

    // Ensure R2 bucket exists (unchanged)
    async ensureR2Bucket() {
        try {
            await this.r2.send(new HeadBucketCommand({ Bucket: this.zipBucket }));
            console.log(`✅ R2 ZIP Bucket ${this.zipBucket} exists`);
            return true;
        } catch (error) {
            if (error.$metadata?.httpStatusCode === 404) {
                console.log(`📦 R2 Bucket ${this.zipBucket} not found - create it via Cloudflare dashboard`);
                return false;
            } else {
                console.error(`❌ Error checking R2 ZIP bucket:`, error.message);
                throw error;
            }
        }
    }
}

export default new CloudflareR2ZipService();