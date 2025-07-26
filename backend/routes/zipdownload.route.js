import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { 
    downloadPreProcessedStudy, 
    getDownloadInfo, 
    createZipManually,
    downloadFromWasabi // ✅ ADD: Missing import
} from '../controllers/zip.download.controller.js';

const router = express.Router();

// Pre-processed download routes
router.get('/study/:orthancStudyId/pre-processed', 
    protect, 
    authorize('admin', 'lab_staff', 'doctor_account'), 
    downloadPreProcessedStudy
);

router.get('/study/:orthancStudyId/info', 
    protect, 
    authorize('admin', 'lab_staff', 'doctor_account'), 
    getDownloadInfo
);

router.post('/study/:orthancStudyId/create-zip', 
    protect, 
    authorize('admin', 'lab_staff'), 
    createZipManually
);

// ✅ ADD: Missing Wasabi direct download route
router.get('/study/:orthancStudyId/wasabi-direct', 
    protect, 
    authorize('admin', 'lab_staff', 'doctor_account'), 
    downloadFromWasabi
);

export default router;