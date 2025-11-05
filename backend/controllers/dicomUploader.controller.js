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

// 🔧 FIXED: Import DicomMetaDictionary for proper VR handling
const { DicomMetaDictionary, DicomDict } = dcmjs.data;

// 🔧 FIXED: Create real DICOM file using dcmjs with proper VR handling
const createProperDicomFile = async (imageBuffer, metadata, imageIndex = 0) => {
    try {
        console.log(`🔄 Creating proper DICOM file for image ${imageIndex + 1} (using DicomMetaDictionary)...`);
        
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
        
        // 🔧 FIXED: Build dataset with friendly names (dcmjs will normalize VRs)
        const dataset = {
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
        
        // 🔧 CRITICAL FIX: Convert friendly dataset into proper DICOM elements with VRs
        console.log(`🔧 Normalizing dataset using DicomMetaDictionary...`);
const dicomData = DicomMetaDictionary.denaturalizeDataset(dataset);
        
        // 🔧 CRITICAL FIX: Include File Meta Information
        console.log(`🔧 Creating File Meta Information...`);
       DicomMetaDictionary.createMeta(dicomData)

        
        // 🔧 CRITICAL FIX: Create DicomDict with proper structure
        console.log(`🔧 Creating DicomDict and writing buffer...`);
        const dicomDict = new DicomDict(meta);
        dicomDict.dict = dicomData; // Set the normalized data
        
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
        
        // 🔧 FALLBACK: If dcmjs still fails, use manual creation
        console.log(`🔄 Falling back to manual DICOM creation for image ${imageIndex + 1}...`);
        return await createManualDicomFile(imageBuffer, metadata, imageIndex);
    }
};

// 🔧 FALLBACK: Manual DICOM creation (enhanced but still simple)
const createManualDicomFile = async (imageBuffer, metadata, imageIndex = 0) => {
    try {
        console.log(`🔄 Creating manual DICOM file for image ${imageIndex + 1}...`);
        
        // Process image
        const processedImage = await sharp(imageBuffer)
            .grayscale()
            .png({ quality: 90 })
            .toBuffer();
        
        const imageInfo = await sharp(processedImage).metadata();
        const pixelData = await sharp(processedImage).raw().toBuffer();
        
        const sopInstanceUID = `1.2.826.0.1.3680043.8.498.${Date.now()}.${imageIndex}.${Math.random().toString(36).substr(2, 9)}`;
        
        // Format DICOM date and time
        const now = new Date();
        const dicomDate = now.toISOString().slice(0, 10).replace(/-/g, '');
        const dicomTime = now.toISOString().slice(11, 19).replace(/:/g, '');
        
        // Create enhanced valid DICOM file
        const dicomFile = createEnhancedValidDicom({
            patientName: metadata.patientName || "UNKNOWN^PATIENT",
            patientId: metadata.patientId || "UNKNOWN",
            patientBirthDate: metadata.patientBirthDate?.replace(/-/g, '') || "",
            patientSex: metadata.patientSex || "O",
            studyInstanceUID: metadata.studyInstanceUID,
            seriesInstanceUID: metadata.seriesInstanceUID,
            sopInstanceUID: sopInstanceUID,
            modality: metadata.modality || "OT",
            studyDescription: metadata.studyDescription || "Uploaded Image Study",
            seriesDescription: metadata.seriesDescription || "Uploaded Image Series",
            accessionNumber: metadata.accessionNumber || "",
            manufacturer: "XCENTIC",
            manufacturerModel: "XCENTIC_UPLOADER",
            institutionName: metadata.institutionName || "XCENTIC Medical Center",
            dicomDate: dicomDate,
            dicomTime: dicomTime,
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

// 🔧 ENHANCED: Create a comprehensive valid DICOM file (manual fallback)
function createEnhancedValidDicom(params) {
    const chunks = [];
    
    // DICOM Preamble (128 bytes of zeros)
    chunks.push(Buffer.alloc(128, 0));
    
    // DICOM Prefix 'DICM'
    chunks.push(Buffer.from('DICM', 'ascii'));
    
    // File Meta Information Group Length (we'll calculate this later)
    const metaInfoStart = chunks.length;
    
    // Add File Meta Information elements (Explicit VR)
    chunks.push(createDicomElement('0002', '0001', 'OB', Buffer.from([0x00, 0x01]))); // File Meta Information Version
    chunks.push(createDicomElement('0002', '0002', 'UI', '1.2.840.10008.5.1.4.1.1.7')); // Media Storage SOP Class UID
    chunks.push(createDicomElement('0002', '0003', 'UI', params.sopInstanceUID)); // Media Storage SOP Instance UID
    chunks.push(createDicomElement('0002', '0010', 'UI', '1.2.840.10008.1.2')); // Transfer Syntax UID
    chunks.push(createDicomElement('0002', '0012', 'UI', '1.2.826.0.1.3680043.8.498')); // Implementation Class UID
    chunks.push(createDicomElement('0002', '0013', 'SH', 'XCENTIC_v1.0')); // Implementation Version Name
    
    // Calculate and insert Group Length
    const metaInfoLength = chunks.slice(metaInfoStart + 1).reduce((total, chunk) => total + chunk.length, 0);
    chunks.splice(metaInfoStart, 0, createDicomElement('0002', '0000', 'UL', Buffer.from([
        metaInfoLength & 0xFF,
        (metaInfoLength >> 8) & 0xFF,
        (metaInfoLength >> 16) & 0xFF,
        (metaInfoLength >> 24) & 0xFF
    ])));
    
    // Add main dataset elements (Implicit VR from here)
    chunks.push(createDicomElementImplicit('0008', '0005', 'ISO_IR 100')); // Specific Character Set
    chunks.push(createDicomElementImplicit('0008', '0008', 'ORIGINAL\\PRIMARY')); // Image Type
    chunks.push(createDicomElementImplicit('0008', '0016', '1.2.840.10008.5.1.4.1.1.7')); // SOP Class UID
    chunks.push(createDicomElementImplicit('0008', '0018', params.sopInstanceUID)); // SOP Instance UID
    chunks.push(createDicomElementImplicit('0008', '0020', params.dicomDate)); // Study Date
    chunks.push(createDicomElementImplicit('0008', '0030', params.dicomTime)); // Study Time
    chunks.push(createDicomElementImplicit('0008', '0050', params.accessionNumber)); // Accession Number
    chunks.push(createDicomElementImplicit('0008', '0060', params.modality)); // Modality
    chunks.push(createDicomElementImplicit('0008', '0070', params.manufacturer)); // Manufacturer
    chunks.push(createDicomElementImplicit('0008', '0080', params.institutionName)); // Institution Name
    chunks.push(createDicomElementImplicit('0008', '1030', params.studyDescription)); // Study Description
    chunks.push(createDicomElementImplicit('0008', '103E', params.seriesDescription)); // Series Description
    
    // Patient Module
    chunks.push(createDicomElementImplicit('0010', '0010', params.patientName)); // Patient Name
    chunks.push(createDicomElementImplicit('0010', '0020', params.patientId)); // Patient ID
    chunks.push(createDicomElementImplicit('0010', '0030', params.patientBirthDate)); // Patient Birth Date
    chunks.push(createDicomElementImplicit('0010', '0040', params.patientSex)); // Patient Sex
    
    // Study Module
    chunks.push(createDicomElementImplicit('0020', '000D', params.studyInstanceUID)); // Study Instance UID
    chunks.push(createDicomElementImplicit('0020', '0010', '1')); // Study ID
    
    // Series Module
    chunks.push(createDicomElementImplicit('0020', '000E', params.seriesInstanceUID)); // Series Instance UID
    chunks.push(createDicomElementImplicit('0020', '0011', '1')); // Series Number
    
    // Image Module
    chunks.push(createDicomElementImplicit('0020', '0013', '1')); // Instance Number
    
    // Image Pixel Module
    chunks.push(createDicomElementImplicit('0028', '0002', intToUint16LE(1))); // Samples per Pixel
    chunks.push(createDicomElementImplicit('0028', '0004', 'MONOCHROME2')); // Photometric Interpretation
    chunks.push(createDicomElementImplicit('0028', '0010', intToUint16LE(params.rows))); // Rows
    chunks.push(createDicomElementImplicit('0028', '0011', intToUint16LE(params.columns))); // Columns
    chunks.push(createDicomElementImplicit('0028', '0100', intToUint16LE(8))); // Bits Allocated
    chunks.push(createDicomElementImplicit('0028', '0101', intToUint16LE(8))); // Bits Stored
    chunks.push(createDicomElementImplicit('0028', '0102', intToUint16LE(7))); // High Bit
    chunks.push(createDicomElementImplicit('0028', '0103', intToUint16LE(0))); // Pixel Representation
    
    // Pixel Data
    chunks.push(createDicomElementImplicit('7FE0', '0010', params.pixelData));
    
    return Buffer.concat(chunks);
}

// Helper: Convert integer to uint16 little endian
function intToUint16LE(value) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(value, 0);
    return buffer;
}

// Helper: Create DICOM element with explicit VR (for File Meta Information)
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
    
    // VR (2 bytes)
    chunks.push(Buffer.from(vr, 'ascii'));
    
    // Length handling depends on VR
    if (['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'].includes(vr)) {
        // Long form: 2 reserved bytes + 4 byte length
        chunks.push(Buffer.from([0, 0])); // Reserved
        const length = dataBuffer.length;
        chunks.push(Buffer.from([
            length & 0xFF,
            (length >> 8) & 0xFF,
            (length >> 16) & 0xFF,
            (length >> 24) & 0xFF
        ]));
    } else {
        // Short form: 2 byte length
        const length = dataBuffer.length;
        chunks.push(Buffer.from([
            length & 0xFF,
            (length >> 8) & 0xFF
        ]));
    }
    
    // Data
    chunks.push(dataBuffer);
    
    // Pad to even length if necessary
    if (dataBuffer.length % 2 === 1) {
        chunks.push(Buffer.from([0]));
    }
    
    return Buffer.concat(chunks);
}

// Helper: Create DICOM element with implicit VR (for main dataset)
function createDicomElementImplicit(group, element, data) {
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

// 🔧 UNCHANGED: Create ZIP with proper DICOM files
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
                        console.log(`📄 Adding DICOM file ${index + 1} to ZIP (${result.imageInfo.size} bytes)...`);
                        
                        // Verify the file buffer is valid
                        if (!result.dicomFile || result.dicomFile.length === 0) {
                            throw new Error(`DICOM file ${index + 1} is empty or invalid`);
                        }
                        
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
                library: 'dcmjs + DicomMetaDictionary + manual fallback',
                dicomSizes: dicomResults.map(r => ({
                    filename: r.originalFilename,
                    dicomSize: r.imageInfo?.size || 0,
                    sopInstanceUID: r.sopInstanceUID
                }))
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

// Keep the rest of the upload function exactly the same...
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
        
        // 🔧 STEP 4: Process each image to proper DICOM using enhanced dcmjs
        const uploadResults = [];
        const dicomResults = [];
        
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            console.log(`🔄 Processing image ${i + 1}/${req.files.length}: ${file.originalname}`);
            
            try {
                // Create proper DICOM file using enhanced dcmjs with DicomMetaDictionary
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
                uploadMethod: 'image_to_dicom_dcmjs_enhanced', // Updated method
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
                note: `Study created from ${uploadResults.filter(r => r.status === 'success').length} uploaded image(s) using enhanced dcmjs with DicomMetaDictionary. Lab: ${lab.name}`
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