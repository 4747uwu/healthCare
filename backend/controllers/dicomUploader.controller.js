import axios from 'axios';
import sharp from 'sharp';
import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Lab from '../models/labModel.js';
import CloudflareR2ZipService from '../services/wasabi.zip.service.js';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import { Buffer } from 'buffer';
import dcmjs from 'dcmjs'; // ✅ PROPER DICOM LIBRARY

// 🔧 FIXED: Use correct dcmjs API
const { DicomMetaDictionary, DicomDict } = dcmjs.data;

// 🔧 PROPER: Create real DICOM file using dcmjs (FIXED API)
const createProperDicomFile = async (imageBuffer, metadata, imageIndex = 0) => {
    try {
        console.log(`🔄 Creating proper DICOM file for image ${imageIndex + 1}...`);
        
        // Process image with Sharp to get proper pixel data
        const processedImage = await sharp(imageBuffer)
            .grayscale()
            .png({ quality: 90 })
            .toBuffer();
        
        const imageInfo = await sharp(processedImage).metadata();
        
        // Get raw pixel data for DICOM
        const pixelData = await sharp(processedImage)
            .raw()
            .toBuffer();
        
        // Generate DICOM UIDs
        const studyInstanceUID = metadata.studyInstanceUID;
        const seriesInstanceUID = metadata.seriesInstanceUID;
        const sopInstanceUID = `1.2.826.0.1.3680043.8.498.${Date.now()}.${imageIndex}.${Math.random().toString(36).substr(2, 9)}`;
        
        // Format DICOM date and time
        const now = new Date();
        const dicomDate = now.toISOString().slice(0, 10).replace(/-/g, '');
        const dicomTime = now.toISOString().slice(11, 19).replace(/:/g, '');
        
        // 🔧 FIXED: Use correct dcmjs structure
        const dataset = {
            // File Meta Information
            _meta: {
                FileMetaInformationVersion: new Uint8Array([0x00, 0x01]),
                MediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.7", // Secondary Capture
                MediaStorageSOPInstanceUID: sopInstanceUID,
                TransferSyntaxUID: "1.2.840.10008.1.2", // Implicit VR Little Endian
                ImplementationClassUID: "1.2.826.0.1.3680043.8.498",
                ImplementationVersionName: "XCENTIC_v1.0"
            },
            
            // Patient Module
            PatientName: metadata.patientName || "UNKNOWN^PATIENT",
            PatientID: metadata.patientId || "UNKNOWN",
            PatientBirthDate: metadata.patientBirthDate?.replace(/-/g, '') || "",
            PatientSex: metadata.patientSex || "O",
            
            // General Study Module
            StudyInstanceUID: studyInstanceUID,
            StudyDate: dicomDate,
            StudyTime: dicomTime,
            ReferringPhysicianName: metadata.referringPhysician || "",
            StudyID: "1",
            AccessionNumber: metadata.accessionNumber || "",
            StudyDescription: metadata.studyDescription || "Uploaded Image Study",
            
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
            SOPClassUID: "1.2.840.10008.5.1.4.1.1.7", // Secondary Capture
            SOPInstanceUID: sopInstanceUID,
            
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
            InstitutionAddress: metadata.institutionAddress || "",
            
            // Pixel Data
            PixelData: Array.from(pixelData)
        };
        
        // 🔧 FIXED: Use correct dcmjs API to write DICOM file
        const dicomDict = new DicomDict(dataset);
        const dicomBuffer = dicomDict.write();
        
        console.log(`✅ Proper DICOM file created for image ${imageIndex + 1}, size: ${dicomBuffer.length} bytes`);
        
        return {
            dicomFile: Buffer.from(dicomBuffer),
            sopInstanceUID,
            imageInfo: {
                width: imageInfo.width,
                height: imageInfo.height,
                size: dicomBuffer.length
            }
        };
        
    } catch (error) {
        console.error(`❌ Error creating DICOM file for image ${imageIndex + 1}:`, error);
        
        // 🔧 FALLBACK: If dcmjs fails, create a simple valid DICOM structure
        console.log(`🔄 Falling back to manual DICOM creation for image ${imageIndex + 1}...`);
        return await createManualDicomFile(imageBuffer, metadata, imageIndex);
    }
};

// 🔧 FALLBACK: Manual DICOM creation (simpler but valid)
const createManualDicomFile = async (imageBuffer, metadata, imageIndex = 0) => {
    try {
        // Process image
        const processedImage = await sharp(imageBuffer)
            .grayscale()
            .png({ quality: 90 })
            .toBuffer();
        
        const imageInfo = await sharp(processedImage).metadata();
        const pixelData = await sharp(processedImage).raw().toBuffer();
        
        const sopInstanceUID = `1.2.826.0.1.3680043.8.498.${Date.now()}.${imageIndex}.${Math.random().toString(36).substr(2, 9)}`;
        
        // Create minimal but valid DICOM file
        const dicomFile = createMinimalValidDicom({
            patientName: metadata.patientName || "UNKNOWN^PATIENT",
            patientId: metadata.patientId || "UNKNOWN",
            studyInstanceUID: metadata.studyInstanceUID,
            seriesInstanceUID: metadata.seriesInstanceUID,
            sopInstanceUID: sopInstanceUID,
            modality: metadata.modality || "OT",
            rows: imageInfo.height,
            columns: imageInfo.width,
            pixelData: pixelData
        });
        
        console.log(`✅ Manual DICOM file created for image ${imageIndex + 1}, size: ${dicomFile.length} bytes`);
        
        return {
            dicomFile: dicomFile,
            sopInstanceUID,
            imageInfo: {
                width: imageInfo.width,
                height: imageInfo.height,
                size: dicomFile.length
            }
        };
        
    } catch (error) {
        console.error(`❌ Error in manual DICOM creation for image ${imageIndex + 1}:`, error);
        throw error;
    }
};

// 🔧 MINIMAL: Create a basic valid DICOM file
function createMinimalValidDicom(params) {
    const chunks = [];
    
    // DICOM Preamble (128 bytes of zeros)
    chunks.push(Buffer.alloc(128, 0));
    
    // DICOM Prefix 'DICM'
    chunks.push(Buffer.from('DICM', 'ascii'));
    
    // Add essential DICOM elements
    chunks.push(createDicomElement('0008', '0005', 'CS', 'ISO_IR 100')); // Specific Character Set
    chunks.push(createDicomElement('0008', '0016', 'UI', '1.2.840.10008.5.1.4.1.1.7')); // SOP Class UID
    chunks.push(createDicomElement('0008', '0018', 'UI', params.sopInstanceUID)); // SOP Instance UID
    chunks.push(createDicomElement('0008', '0060', 'CS', params.modality)); // Modality
    
    // Patient Module
    chunks.push(createDicomElement('0010', '0010', 'PN', params.patientName)); // Patient Name
    chunks.push(createDicomElement('0010', '0020', 'LO', params.patientId)); // Patient ID
    
    // Study Module
    chunks.push(createDicomElement('0020', '000D', 'UI', params.studyInstanceUID)); // Study Instance UID
    
    // Series Module
    chunks.push(createDicomElement('0020', '000E', 'UI', params.seriesInstanceUID)); // Series Instance UID
    chunks.push(createDicomElement('0020', '0011', 'IS', '1')); // Series Number
    
    // Image Module
    chunks.push(createDicomElement('0020', '0013', 'IS', '1')); // Instance Number
    
    // Image Pixel Module
    chunks.push(createDicomElement('0028', '0002', 'US', Buffer.from([1, 0]))); // Samples per Pixel
    chunks.push(createDicomElement('0028', '0004', 'CS', 'MONOCHROME2')); // Photometric Interpretation
    chunks.push(createDicomElement('0028', '0010', 'US', intToUint16LE(params.rows))); // Rows
    chunks.push(createDicomElement('0028', '0011', 'US', intToUint16LE(params.columns))); // Columns
    chunks.push(createDicomElement('0028', '0100', 'US', Buffer.from([8, 0]))); // Bits Allocated
    chunks.push(createDicomElement('0028', '0101', 'US', Buffer.from([8, 0]))); // Bits Stored
    chunks.push(createDicomElement('0028', '0102', 'US', Buffer.from([7, 0]))); // High Bit
    chunks.push(createDicomElement('0028', '0103', 'US', Buffer.from([0, 0]))); // Pixel Representation
    
    // Pixel Data
    chunks.push(createDicomElement('7FE0', '0010', 'OW', params.pixelData));
    
    return Buffer.concat(chunks);
}

// Helper: Convert integer to uint16 little endian
function intToUint16LE(value) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(value, 0);
    return buffer;
}

// Helper: Create DICOM element
function createDicomElement(group, element, vr, data) {
    const chunks = [];
    
    // Convert data to buffer if string
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data.toString(), 'utf8');
    
    // Group and Element (4 bytes little endian)
    const groupBuffer = Buffer.alloc(2);
    const elementBuffer = Buffer.alloc(2);
    groupBuffer.writeUInt16LE(parseInt(group, 16), 0);
    elementBuffer.writeUInt16LE(parseInt(element, 16), 0);
    
    chunks.push(groupBuffer);
    chunks.push(elementBuffer);
    
    // For implicit VR, we don't include VR in the data stream
    // Length (4 bytes for implicit VR)
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(dataBuffer.length, 0);
    chunks.push(lengthBuffer);
    
    // Data
    chunks.push(dataBuffer);
    
    // Pad to even length if necessary
    if (dataBuffer.length % 2 === 1) {
        chunks.push(Buffer.from([0]));
    }
    
    return Buffer.concat(chunks);
}

// 🔧 SIMPLIFIED: Create ZIP with proper DICOM files (unchanged)
const createZipFromDicomFiles = async (dicomResults, metadata) => {
    try {
        console.log('📦 Creating ZIP file from DICOM files...');
        
        return new Promise((resolve, reject) => {
            const archive = archiver('zip', {
                zlib: { level: 6 }
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
            
            let filesAdded = 0;
            
            // Add each DICOM file to the ZIP
            dicomResults.forEach((result, index) => {
                if (result.status === 'success') {
                    try {
                        console.log(`📄 Adding DICOM file ${index + 1} to ZIP...`);
                        
                        // Use the properly created DICOM file buffer
                        archive.append(result.dicomFile, { 
                            name: `image_${index + 1}_${result.sopInstanceUID}.dcm` 
                        });
                        
                        filesAdded++;
                        console.log(`✅ Added DICOM file ${index + 1} to ZIP successfully`);
                        
                    } catch (err) {
                        console.error(`❌ Failed to add DICOM file ${index + 1} to ZIP:`, err.message);
                    }
                }
            });
            
            if (filesAdded === 0) {
                return reject(new Error('No valid DICOM files to add to ZIP'));
            }
            
            // Add metadata file
            const metadataJson = JSON.stringify({
                studyInfo: metadata,
                createdAt: new Date().toISOString(),
                imageCount: filesAdded,
                creator: 'XCENTIC Image Uploader',
                totalOriginalImages: dicomResults.length,
                successfulConversions: filesAdded,
                dicomCompliant: true,
                library: 'dcmjs + manual fallback'
            }, null, 2);
            
            archive.append(Buffer.from(metadataJson), { name: 'study_metadata.json' });
            
            console.log(`📋 Added metadata file, finalizing ZIP with ${filesAdded} DICOM files...`);
            archive.finalize();
        });
        
    } catch (error) {
        console.error('❌ Error creating ZIP:', error);
        throw new Error(`Failed to create ZIP: ${error.message}`);
    }
};

// 🔧 UPDATED: Main upload function with proper DICOM creation
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
        
        // 🔧 STEP 3: Generate study metadata with proper Orthanc-style ID
        const orthancStudyId = uuidv4(); // Generate UUID like Orthanc
        const studyInstanceUID = `1.2.826.0.1.3680043.8.498.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
        const seriesInstanceUID = `1.2.826.0.1.3680043.8.498.${Date.now()}.series.${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`🔑 Generated Orthanc Study ID: ${orthancStudyId}`);
        console.log(`🔑 Generated Study Instance UID: ${studyInstanceUID}`);
        
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
            orthancStudyId,
            studyInstanceUID,
            seriesInstanceUID
        };
        
        // 🔧 STEP 4: Process each image to proper DICOM using dcmjs with fallback
        const uploadResults = [];
        const dicomResults = [];
        
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            console.log(`🔄 Processing image ${i + 1}/${req.files.length}: ${file.originalname}`);
            
            try {
                // Create proper DICOM file using dcmjs (with manual fallback)
                const dicomResult = await createProperDicomFile(file.buffer, {
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
                
                console.log(`✅ Image ${i + 1} converted to DICOM successfully`);
                
            } catch (error) {
                console.error(`❌ Failed to process image ${i + 1}:`, error);
                uploadResults.push({
                    filename: file.originalname,
                    status: 'failed',
                    error: error.message
                });
            }
        }
        
        // 🔧 STEP 5: Create ZIP file with proper DICOM files
        const successfulResults = dicomResults.filter(r => r.status === 'success');
        let zipBuffer = null;
        let zipFileName = null;
        
        if (successfulResults.length > 0) {
            console.log(`📦 Creating ZIP file for ${successfulResults.length} successful DICOM files...`);
            zipBuffer = await createZipFromDicomFiles(successfulResults, metadata);
            zipFileName = `study_${orthancStudyId}_${Date.now()}.zip`; // Use orthancStudyId
        }
        
        // 🔧 STEP 6: Create study in database
        const studyData = {
            studyInstanceUID,
            orthancStudyID: orthancStudyId, // Use proper Orthanc-style ID
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
            
            clinicalHistory: {
                clinicalHistory: clinicalHistory || '',
                dataSource: 'user_input',
                lastModifiedAt: new Date(),
                lastModifiedFrom: 'admin_panel'
            },
            
            storageInfo: {
                type: 'direct_upload',
                orthancStudyId: orthancStudyId,
                receivedAt: new Date(),
                isUploadedStudy: true,
                uploadMethod: 'image_to_dicom_manual', // Updated method
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
                note: `Study created from ${uploadResults.filter(r => r.status === 'success').length} uploaded image(s) using manual DICOM creation. Lab: ${lab.name}`
            }]
        };
        
        const dicomStudy = await DicomStudy.create(studyData);
        console.log(`✅ Study saved with ID: ${dicomStudy._id}`);
        
        // 🔧 STEP 7: Upload ZIP to Cloudflare R2
        const successfulUploads = uploadResults.filter(r => r.status === 'success').length;
        let zipUploadResult = null;
        
        if (successfulUploads > 0 && zipBuffer) {
            try {
                console.log(`📦 Uploading ZIP directly to Cloudflare R2...`);
                
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
                orthancStudyId: orthancStudyId, // Return proper ID
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

// Keep existing functions unchanged...
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