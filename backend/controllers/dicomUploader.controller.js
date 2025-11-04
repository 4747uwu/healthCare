import axios from 'axios';
import sharp from 'sharp';
import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Lab from '../models/labModel.js';
import CloudflareR2ZipService from '../services/wasabi.zip.service.js';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import { Buffer } from 'buffer';

// 🔧 ENHANCED: Image to DICOM conversion with proper metadata (NO ORTHANC)
const convertImageToDicom = async (imageBuffer, metadata, imageIndex = 0) => {
    try {
        console.log(`🔄 Converting image ${imageIndex + 1} to DICOM...`);
        
        // Process image with Sharp
        const processedImage = await sharp(imageBuffer)
            .removeAlpha() // Remove alpha channel for DICOM compatibility
            .png({ quality: 90 })
            .toBuffer();
        
        // Generate DICOM UIDs
        const studyInstanceUID = metadata.studyInstanceUID || `1.2.826.0.1.3680043.8.498.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
        const seriesInstanceUID = metadata.seriesInstanceUID || `1.2.826.0.1.3680043.8.498.${Date.now()}.${imageIndex}.${Math.random().toString(36).substr(2, 9)}`;
        const sopInstanceUID = `1.2.826.0.1.3680043.8.498.${Date.now()}.${imageIndex}.${Math.random().toString(36).substr(2, 9)}`;
        
        // Get image dimensions
        const imageInfo = await sharp(processedImage).metadata();
        
        // Format DICOM date and time
        const now = new Date();
        const dicomDate = now.toISOString().slice(0, 10).replace(/-/g, '');
        const dicomTime = now.toISOString().slice(11, 19).replace(/:/g, '');
        
        // 🔧 CRITICAL: Build DICOM dataset for binary creation
        const dicomDataset = {
            // Patient Module
            PatientName: metadata.patientName || "UNKNOWN^PATIENT",
            PatientID: metadata.patientId || "UNKNOWN",
            PatientBirthDate: metadata.patientBirthDate || "",
            PatientSex: metadata.patientSex || "O",
            
            // General Study Module
            StudyInstanceUID: studyInstanceUID,
            StudyDate: dicomDate,
            StudyTime: dicomTime,
            AccessionNumber: metadata.accessionNumber || "",
            StudyDescription: metadata.studyDescription || "Uploaded Image Study",
            ReferringPhysicianName: metadata.referringPhysician || "",
            StudyID: metadata.studyId || "1",
            
            // General Series Module
            SeriesInstanceUID: seriesInstanceUID,
            SeriesNumber: "1",
            SeriesDate: dicomDate,
            SeriesTime: dicomTime,
            Modality: metadata.modality || "OT",
            SeriesDescription: metadata.seriesDescription || "Uploaded Image Series",
            BodyPartExamined: metadata.bodyPartExamined || "",
            
            // General Equipment Module
            Manufacturer: "XCENTIC",
            ManufacturerModelName: "XCENTIC_UPLOADER",
            SoftwareVersions: "v1.0",
            StationName: "XCENTIC_STATION",
            
            // General Image Module
            ImageType: ["ORIGINAL", "PRIMARY"],
            InstanceNumber: (imageIndex + 1).toString(),
            SOPInstanceUID: sopInstanceUID,
            SOPClassUID: "1.2.840.10008.5.1.4.1.1.7", // Secondary Capture Image Storage
            
            // Image Pixel Module
            SamplesPerPixel: 1,
            PhotometricInterpretation: "MONOCHROME2",
            Rows: imageInfo.height,
            Columns: imageInfo.width,
            BitsAllocated: 8,
            BitsStored: 8,
            HighBit: 7,
            PixelRepresentation: 0,
            
            // Institution Module
            InstitutionName: metadata.institutionName || "XCENTIC Medical Center",
            InstitutionAddress: metadata.institutionAddress || ""
        };
        
        // Convert processed image to grayscale for DICOM
        const grayscaleBuffer = await sharp(processedImage)
            .grayscale()
            .raw()
            .toBuffer();
        
        console.log(`✅ DICOM dataset created for image ${imageIndex + 1}`);
        
        return {
            dicomDataset,
            studyInstanceUID,
            seriesInstanceUID,
            sopInstanceUID,
            pixelData: grayscaleBuffer,
            imageInfo: {
                width: imageInfo.width,
                height: imageInfo.height,
                size: grayscaleBuffer.length
            }
        };
        
    } catch (error) {
        console.error(`❌ Error converting image ${imageIndex + 1} to DICOM:`, error);
        throw new Error(`Failed to convert image to DICOM: ${error.message}`);
    }
};

// 🔧 NEW: Create DICOM binary file (simplified version)
const createDicomBinary = async (dicomDataset, pixelData) => {
    try {
        // This is a simplified DICOM file creation
        // In production, you'd use a proper DICOM library like dcmjs
        
        // Create a basic DICOM file structure
        const header = Buffer.from([
            // DICOM prefix
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            // ... more DICOM header bytes would go here
        ]);
        
        // For now, create a placeholder DICOM file
        const dicomFile = Buffer.concat([
            header,
            Buffer.from(JSON.stringify(dicomDataset)),
            pixelData
        ]);
        
        return dicomFile;
        
    } catch (error) {
        console.error('❌ Error creating DICOM binary:', error);
        throw new Error(`Failed to create DICOM binary: ${error.message}`);
    }
};

// 🔧 NEW: Create ZIP directly without Orthanc
const createZipFromImages = async (dicomResults, metadata) => {
    try {
        console.log('📦 Creating ZIP file from processed images...');
        
        return new Promise((resolve, reject) => {
            const archive = archiver('zip', {
                zlib: { level: 6 } // Compression level
            });
            
            const chunks = [];
            
            archive.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            archive.on('end', () => {
                const zipBuffer = Buffer.concat(chunks);
                console.log(`✅ ZIP created successfully, size: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);
                resolve(zipBuffer);
            });
            
            archive.on('error', (err) => {
                console.error('❌ ZIP creation error:', err);
                reject(err);
            });
            
            // Add each DICOM file to the ZIP
            dicomResults.forEach((result, index) => {
                if (result.status === 'success') {
                    try {
                        // Create a simplified DICOM file
                        const dicomBinary = createDicomBinary(result.dicomDataset, result.pixelData);
                        archive.append(dicomBinary, { 
                            name: `image_${index + 1}_${result.sopInstanceUID}.dcm` 
                        });
                    } catch (err) {
                        console.warn(`⚠️ Failed to add image ${index + 1} to ZIP:`, err.message);
                    }
                }
            });
            
            // Add metadata file
            const metadataJson = JSON.stringify({
                studyInfo: metadata,
                createdAt: new Date().toISOString(),
                imageCount: dicomResults.filter(r => r.status === 'success').length,
                creator: 'XCENTIC Image Uploader'
            }, null, 2);
            
            archive.append(metadataJson, { name: 'study_metadata.json' });
            
            archive.finalize();
        });
        
    } catch (error) {
        console.error('❌ Error creating ZIP:', error);
        throw new Error(`Failed to create ZIP: ${error.message}`);
    }
};

// 🔧 MAIN: Upload images and convert to DICOM (NO ORTHANC)
export const uploadImages = async (req, res) => {
    console.log('🔍 ===== DICOM UPLOADER CALLED =====');
    console.log('📝 req.body:', req.body);
    console.log('📁 req.files:', req.files?.length || 0, 'files');
    
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No images provided'
            });
        }
        
        const {
            patientName, patientId, patientBirthDate, patientSex,
            studyDescription, seriesDescription, modality, bodyPartExamined,
            referringPhysician, accessionNumber, institutionName, institutionAddress,
            labId, clinicalHistory
        } = req.body;
        
        console.log(`📊 Processing ${req.files.length} image(s) for patient: ${patientName}`);
        
        // 🔧 STEP 1: Find or create patient
        let patient = await Patient.findOne({ patientID: patientId });
        
        if (!patient) {
            console.log(`👤 Creating new patient: ${patientName}`);
            patient = await Patient.create({
                mrn: patientId,
                patientID: patientId,
                patientNameRaw: patientName,
                firstName: patientName?.split(' ')[0] || '',
                lastName: patientName?.split(' ').slice(1).join(' ') || '',
                gender: patientSex || 'O',
                dateOfBirth: patientBirthDate || null,
                computed: {
                    fullName: patientName
                }
            });
        }
        
        // 🔧 STEP 2: Find or create lab
        let lab;
        if (labId && labId !== 'select_lab') {
            lab = await Lab.findById(labId);
        }
        
        if (!lab) {
            lab = await Lab.findOne({ identifier: 'XCENTIC_LAB' });
            if (!lab) {
                lab = await Lab.create({
                    name: 'XCENTIC Upload Lab',
                    identifier: 'XCENTIC_LAB',
                    isActive: true,
                    notes: 'Auto-created for image uploads'
                });
            }
        }
        
        console.log(`🏥 Using lab: ${lab.name}`);
        
        // 🔧 STEP 3: Generate study metadata
        const studyInstanceUID = `1.2.826.0.1.3680043.8.498.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
        const seriesInstanceUID = `1.2.826.0.1.3680043.8.498.${Date.now()}.series.${Math.random().toString(36).substr(2, 9)}`;
        
        const metadata = {
            patientName,
            patientId,
            patientBirthDate,
            patientSex: patientSex || 'O',
            studyDescription: studyDescription || 'Uploaded Image Study',
            seriesDescription: seriesDescription || 'Uploaded Image Series',
            modality: modality || 'OT',
            bodyPartExamined: bodyPartExamined || '',
            referringPhysician: referringPhysician || '',
            accessionNumber: accessionNumber || `ACC${Date.now()}`,
            institutionName: institutionName || 'XCENTIC Medical Center',
            institutionAddress: institutionAddress || '',
            labIdentifier: lab.identifier,
            studyInstanceUID,
            seriesInstanceUID
        };
        
        // 🔧 STEP 4: Process each image (NO ORTHANC UPLOAD)
        const uploadResults = [];
        const dicomResults = [];
        
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            console.log(`🔄 Processing image ${i + 1}/${req.files.length}: ${file.originalname}`);
            
            try {
                // Convert image to DICOM
                const dicomResult = await convertImageToDicom(file.buffer, {
                    ...metadata,
                    originalFilename: file.originalname
                }, i);
                
                dicomResults.push({
                    ...dicomResult,
                    originalFilename: file.originalname,
                    status: 'success'
                });
                
                uploadResults.push({
                    filename: file.originalname,
                    sopInstanceUID: dicomResult.sopInstanceUID,
                    imageInfo: dicomResult.imageInfo,
                    status: 'success'
                });
                
                console.log(`✅ Image ${i + 1} processed successfully`);
                
            } catch (error) {
                console.error(`❌ Failed to process image ${i + 1}:`, error);
                uploadResults.push({
                    filename: file.originalname,
                    status: 'failed',
                    error: error.message
                });
            }
        }
        
        // 🔧 STEP 5: Create ZIP file directly
        const successfulResults = dicomResults.filter(r => r.status === 'success');
        let zipBuffer = null;
        let zipFileName = null;
        
        if (successfulResults.length > 0) {
            console.log(`📦 Creating ZIP file for ${successfulResults.length} successful images...`);
            zipBuffer = await createZipFromImages(successfulResults, metadata);
            zipFileName = `study_${studyInstanceUID}_${Date.now()}.zip`;
        }
        
        // 🔧 STEP 6: Create study in database (FIX ENUM VALUE)
        const studyData = {
            studyInstanceUID,
            orthancStudyID: null, // No Orthanc
            patient: patient._id,
            patientId: patient.patientID,
            sourceLab: lab._id,
            studyDate: new Date(),
            studyTime: new Date().toTimeString().slice(0, 8),
            modalitiesInStudy: [metadata.modality],
            examDescription: metadata.studyDescription,
            institutionName: metadata.institutionName,
            workflowStatus: 'new_study_received',
            seriesCount: 1,
            instanceCount: uploadResults.filter(r => r.status === 'success').length,
            seriesImages: `1/${uploadResults.filter(r => r.status === 'success').length}`,
            accessionNumber: metadata.accessionNumber,
            
            patientInfo: {
                patientID: patient.patientID,
                patientName: patient.patientNameRaw,
                gender: patient.gender,
                dateOfBirth: patientBirthDate
            },
            
            referringPhysicianName: metadata.referringPhysician,
            caseType: 'routine',
            
            // 🔧 FIX: Use valid enum value for lastModifiedFrom
            clinicalHistory: {
                clinicalHistory: clinicalHistory || '',
                dataSource: 'user_input',
                lastModifiedAt: new Date(),
                lastModifiedFrom: 'admin_panel' // ✅ FIXED: Use valid enum value
            },
            
            storageInfo: {
                type: 'direct_upload',
                orthancStudyId: null, // No Orthanc
                receivedAt: new Date(),
                isUploadedStudy: true,
                uploadMethod: 'image_to_dicom_direct',
                originalFiles: uploadResults.map(r => ({
                    filename: r.filename,
                    status: r.status,
                    sopInstanceUID: r.sopInstanceUID
                }))
            },
            
            equipment: {
                manufacturer: 'XCENTIC',
                model: 'Image Uploader',
                stationName: 'XCENTIC_UPLOAD_STATION',
                softwareVersion: 'v1.0'
            },
            
            statusHistory: [{
                status: 'new_study_received',
                changedAt: new Date(),
                note: `Study created from ${uploadResults.filter(r => r.status === 'success').length} uploaded image(s). Lab: ${lab.name}`
            }]
        };
        
        const dicomStudy = await DicomStudy.create(studyData);
        console.log(`✅ Study saved with ID: ${dicomStudy._id}`);
        
        // 🔧 STEP 7: Upload ZIP to Cloudflare R2 if we have successful uploads
        const successfulUploads = uploadResults.filter(r => r.status === 'success').length;
        let zipUploadResult = null;
        
        if (successfulUploads > 0 && zipBuffer) {
            try {
                console.log(`📦 Uploading ZIP directly to Cloudflare R2...`);
                
                // Upload ZIP buffer directly to R2
                zipUploadResult = await CloudflareR2ZipService.uploadZipBuffer({
                    buffer: zipBuffer,
                    fileName: zipFileName,
                    studyDatabaseId: dicomStudy._id,
                    studyInstanceUID: studyInstanceUID,
                    instanceCount: successfulUploads,
                    seriesCount: 1
                });
                
                console.log(`📦 ZIP uploaded successfully to R2:`, zipUploadResult);
                
                // Update study with ZIP info
                await DicomStudy.findByIdAndUpdate(dicomStudy._id, {
                    'preProcessedDownload.zipStatus': 'completed',
                    'preProcessedDownload.zipUrl': zipUploadResult.zipUrl,
                    'preProcessedDownload.zipFileName': zipFileName,
                    'preProcessedDownload.zipSizeMB': (zipBuffer.length / 1024 / 1024),
                    'preProcessedDownload.zipCreatedAt': new Date(),
                    'preProcessedDownload.zipKey': zipUploadResult.zipKey
                });
                
            } catch (zipError) {
                console.error(`❌ Failed to upload ZIP to R2:`, zipError.message);
            }
        }
        
        const successCount = uploadResults.filter(r => r.status === 'success').length;
        const failureCount = uploadResults.filter(r => r.status === 'failed').length;
        
        res.status(201).json({
            success: true,
            message: `Images uploaded successfully. ${successCount} succeeded, ${failureCount} failed.`,
            data: {
                studyId: dicomStudy._id,
                studyInstanceUID: studyInstanceUID,
                orthancStudyId: null, // No Orthanc
                patientId: patient.patientID,
                patientName: patient.patientNameRaw,
                accessionNumber: metadata.accessionNumber,
                uploadResults: uploadResults,
                successCount: successCount,
                failureCount: failureCount,
                totalProcessed: req.files.length,
                zipUploaded: !!zipUploadResult,
                zipInfo: zipUploadResult ? {
                    fileName: zipFileName,
                    sizeMB: (zipBuffer.length / 1024 / 1024).toFixed(2),
                    url: zipUploadResult.zipUrl
                } : null
            }
        });
        
    } catch (error) {
        console.error('❌ Error in image upload:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload images',
            error: error.message
        });
    }
};

// 🔧 GET: Available labs for dropdown
export const getAvailableLabs = async (req, res) => {
    try {
        const labs = await Lab.find({ isActive: true })
            .select('_id name identifier')
            .sort({ name: 1 });
        
        res.json({
            success: true,
            data: labs
        });
        
    } catch (error) {
        console.error('❌ Error fetching labs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch labs',
            error: error.message
        });
    }
};

// 🔧 GET: Upload status and recent uploads
export const getUploadStatus = async (req, res) => {
    try {
        const recentUploads = await DicomStudy.find({
            'storageInfo.isUploadedStudy': true
        })
        .populate('patient', 'patientNameRaw patientID')
        .populate('sourceLab', 'name identifier')
        .sort({ createdAt: -1 })
        .limit(10)
        .select('_id studyInstanceUID patientInfo workflowStatus createdAt storageInfo preProcessedDownload');
        
        res.json({
            success: true,
            data: {
                recentUploads: recentUploads,
                totalUploaded: await DicomStudy.countDocuments({
                    'storageInfo.isUploadedStudy': true
                })
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching upload status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch upload status',
            error: error.message
        });
    }
};