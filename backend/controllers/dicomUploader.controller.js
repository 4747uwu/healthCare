import axios from 'axios';
import sharp from 'sharp';
import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Lab from '../models/labModel.js';
import CloudflareR2ZipService from '../services/wasabi.zip.service.js';
import { v4 as uuidv4 } from 'uuid';

const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice';
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePassword';
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');

// 🔧 ENHANCED: Image to DICOM conversion with proper metadata
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
        
        // 🔧 CRITICAL: Build DICOM dataset
        const dicomDataset = {
            // Patient Module
            "00100010": { "vr": "PN", "Value": [metadata.patientName || "UNKNOWN^PATIENT"] }, // Patient's Name
            "00100020": { "vr": "LO", "Value": [metadata.patientId || "UNKNOWN"] }, // Patient ID
            "00100030": { "vr": "DA", "Value": [metadata.patientBirthDate || ""] }, // Patient's Birth Date
            "00100040": { "vr": "CS", "Value": [metadata.patientSex || "O"] }, // Patient's Sex
            
            // General Study Module
            "0020000D": { "vr": "UI", "Value": [studyInstanceUID] }, // Study Instance UID
            "00080020": { "vr": "DA", "Value": [dicomDate] }, // Study Date
            "00080030": { "vr": "TM", "Value": [dicomTime] }, // Study Time
            "00080050": { "vr": "SH", "Value": [metadata.accessionNumber || ""] }, // Accession Number
            "00081030": { "vr": "LO", "Value": [metadata.studyDescription || "Uploaded Image Study"] }, // Study Description
            "00080090": { "vr": "PN", "Value": [metadata.referringPhysician || ""] }, // Referring Physician's Name
            "00200010": { "vr": "SH", "Value": [metadata.studyId || "1"] }, // Study ID
            
            // General Series Module
            "0020000E": { "vr": "UI", "Value": [seriesInstanceUID] }, // Series Instance UID
            "00200011": { "vr": "IS", "Value": [1] }, // Series Number
            "00080021": { "vr": "DA", "Value": [dicomDate] }, // Series Date
            "00080031": { "vr": "TM", "Value": [dicomTime] }, // Series Time
            "00080060": { "vr": "CS", "Value": [metadata.modality || "OT"] }, // Modality
            "0008103E": { "vr": "LO", "Value": [metadata.seriesDescription || "Uploaded Image Series"] }, // Series Description
            "00180015": { "vr": "CS", "Value": [metadata.bodyPartExamined || ""] }, // Body Part Examined
            
            // General Equipment Module
            "00080070": { "vr": "LO", "Value": ["XCENTIC"] }, // Manufacturer
            "00081090": { "vr": "LO", "Value": ["XCENTIC_UPLOADER"] }, // Manufacturer's Model Name
            "00181020": { "vr": "LO", "Value": ["v1.0"] }, // Software Versions
            "00081010": { "vr": "SH", "Value": ["XCENTIC_STATION"] }, // Station Name
            
            // General Image Module
            "00080008": { "vr": "CS", "Value": ["ORIGINAL", "PRIMARY"] }, // Image Type
            "00200013": { "vr": "IS", "Value": [imageIndex + 1] }, // Instance Number
            "00080018": { "vr": "UI", "Value": [sopInstanceUID] }, // SOP Instance UID
            "00080016": { "vr": "UI", "Value": ["1.2.840.10008.5.1.4.1.1.7"] }, // SOP Class UID (Secondary Capture Image Storage)
            
            // Image Pixel Module
            "00280002": { "vr": "US", "Value": [1] }, // Samples per Pixel
            "00280004": { "vr": "CS", "Value": ["MONOCHROME2"] }, // Photometric Interpretation
            "00280010": { "vr": "US", "Value": [imageInfo.height] }, // Rows
            "00280011": { "vr": "US", "Value": [imageInfo.width] }, // Columns
            "00280100": { "vr": "US", "Value": [8] }, // Bits Allocated
            "00280101": { "vr": "US", "Value": [8] }, // Bits Stored
            "00280102": { "vr": "US", "Value": [7] }, // High Bit
            "00280103": { "vr": "US", "Value": [0] }, // Pixel Representation
            
            // 🔧 CUSTOM: Add lab identification in private tags
            "00130010": { "vr": "LO", "Value": [metadata.labIdentifier || "XCENTIC_LAB"] }, // Private Creator
            "00150010": { "vr": "LO", "Value": [metadata.labIdentifier || "XCENTIC_LAB"] }, // Lab ID
            "00210010": { "vr": "LO", "Value": [metadata.labIdentifier || "XCENTIC_LAB"] }, // Alternative Lab ID
            "00430010": { "vr": "LO", "Value": [metadata.labIdentifier || "XCENTIC_LAB"] }, // Another Lab ID
            
            // Institution Module
            "00080080": { "vr": "LO", "Value": [metadata.institutionName || "XCENTIC Medical Center"] }, // Institution Name
            "00080081": { "vr": "ST", "Value": [metadata.institutionAddress || ""] }, // Institution Address
            
            // 🔧 CONVERSION: Add conversion metadata
            "00090010": { "vr": "LO", "Value": ["XCENTIC_CONVERSION"] }, // Private Creator for conversion info
            "00091001": { "vr": "LO", "Value": ["IMAGE_TO_DICOM"] }, // Conversion Type
            "00091002": { "vr": "DT", "Value": [now.toISOString()] }, // Conversion DateTime
            "00091003": { "vr": "LO", "Value": [metadata.originalFilename || "uploaded_image"] }, // Original Filename
        };
        
        // Convert processed image to grayscale for DICOM
        const grayscaleBuffer = await sharp(processedImage)
            .grayscale()
            .raw()
            .toBuffer();
        
        // Add pixel data to DICOM dataset
        dicomDataset["7FE00010"] = {
            "vr": "OB",
            "BulkDataURI": `data:application/octet-stream;base64,${grayscaleBuffer.toString('base64')}`
        };
        
        console.log(`✅ DICOM dataset created for image ${imageIndex + 1}`);
        
        return {
            dicomDataset,
            studyInstanceUID,
            seriesInstanceUID,
            sopInstanceUID,
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

// 🔧 UPLOAD: Upload DICOM to Orthanc
const uploadDicomToOrthanc = async (dicomDataset) => {
    try {
        console.log('📤 Uploading DICOM to Orthanc...');
        
        const response = await axios.post(`${ORTHANC_BASE_URL}/instances`, dicomDataset, {
            headers: {
                'Authorization': orthancAuth,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        console.log('✅ DICOM uploaded to Orthanc:', response.data);
        return response.data;
        
    } catch (error) {
        console.error('❌ Error uploading DICOM to Orthanc:', error.response?.data || error.message);
        throw new Error(`Failed to upload DICOM to Orthanc: ${error.message}`);
    }
};

// 🔧 MAIN: Upload images and convert to DICOM
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
        
        // 🔧 STEP 4: Process each image
        const uploadResults = [];
        const orthancInstanceIds = [];
        
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            console.log(`🔄 Processing image ${i + 1}/${req.files.length}: ${file.originalname}`);
            
            try {
                // Convert image to DICOM
                const dicomResult = await convertImageToDicom(file.buffer, {
                    ...metadata,
                    originalFilename: file.originalname
                }, i);
                
                // Upload to Orthanc
                const orthancResult = await uploadDicomToOrthanc(dicomResult.dicomDataset);
                
                uploadResults.push({
                    filename: file.originalname,
                    sopInstanceUID: dicomResult.sopInstanceUID,
                    orthancInstanceId: orthancResult.ID,
                    imageInfo: dicomResult.imageInfo,
                    status: 'success'
                });
                
                orthancInstanceIds.push(orthancResult.ID);
                
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
        
        // 🔧 STEP 5: Wait for Orthanc to process and get study ID
        console.log('⏳ Waiting for Orthanc to process study...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        let orthancStudyId = null;
        if (orthancInstanceIds.length > 0) {
            try {
                const instanceResponse = await axios.get(`${ORTHANC_BASE_URL}/instances/${orthancInstanceIds[0]}`, {
                    headers: { 'Authorization': orthancAuth }
                });
                orthancStudyId = instanceResponse.data.ParentStudy;
                console.log(`📋 Orthanc Study ID: ${orthancStudyId}`);
            } catch (error) {
                console.warn('⚠️ Could not get Orthanc study ID:', error.message);
            }
        }
        
        // 🔧 STEP 6: Create study in database
        const studyData = {
            studyInstanceUID,
            orthancStudyID: orthancStudyId,
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
            
            // 🔧 CLINICAL HISTORY: Store in DicomStudy
            clinicalHistory: {
                clinicalHistory: clinicalHistory || '',
                dataSource: 'user_input',
                lastModifiedAt: new Date(),
                lastModifiedFrom: 'image_uploader'
            },
            
            storageInfo: {
                type: 'orthanc',
                orthancStudyId: orthancStudyId,
                receivedAt: new Date(),
                isUploadedStudy: true,
                uploadMethod: 'image_to_dicom_conversion',
                originalFiles: uploadResults.map(r => ({
                    filename: r.filename,
                    status: r.status,
                    sopInstanceUID: r.sopInstanceUID,
                    orthancInstanceId: r.orthancInstanceId
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
        
        // 🔧 STEP 7: Queue ZIP creation if we have successful uploads
        const successfulUploads = uploadResults.filter(r => r.status === 'success').length;
        if (successfulUploads > 0 && orthancStudyId) {
            try {
                console.log(`📦 Queuing ZIP creation for uploaded study...`);
                const zipJob = await CloudflareR2ZipService.addZipJob({
                    orthancStudyId: orthancStudyId,
                    studyDatabaseId: dicomStudy._id,
                    studyInstanceUID: studyInstanceUID,
                    instanceCount: successfulUploads,
                    seriesCount: 1
                });
                console.log(`📦 ZIP Job ${zipJob.id} queued for uploaded study`);
            } catch (zipError) {
                console.error(`❌ Failed to queue ZIP job:`, zipError.message);
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
                orthancStudyId: orthancStudyId,
                patientId: patient.patientID,
                patientName: patient.patientNameRaw,
                accessionNumber: metadata.accessionNumber,
                uploadResults: uploadResults,
                successCount: successCount,
                failureCount: failureCount,
                totalProcessed: req.files.length
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
        .select('_id studyInstanceUID patientInfo workflowStatus createdAt storageInfo');
        
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