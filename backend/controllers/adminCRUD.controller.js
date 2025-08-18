import mongoose from 'mongoose';
import User from '../models/userModel.js';
import Doctor from '../models/doctorModel.js';
import Lab from '../models/labModel.js';
import DicomStudy from '../models/dicomStudyModel.js';
import sharp from 'sharp';
import multer from 'multer';
import bcrypt from 'bcryptjs';

const storage = multer.memoryStorage();

// 🔧 Signature upload middleware
export const uploadDoctorSignature = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
}).single('signature');

// 🆕 GET ALL DOCTORS (FIXED SEARCH)
export const getAllDoctorsForAdmin = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const status = req.query.status; // 'active', 'inactive', or undefined for all
        
        const skip = (page - 1) * limit;
        
        // 🔧 FIXED: Build aggregation pipeline for proper search
        const pipeline = [
            {
                $lookup: {
                    from: 'users',
                    localField: 'userAccount',
                    foreignField: '_id',
                    as: 'userAccount'
                }
            },
            {
                $unwind: '$userAccount'
            }
        ];
        
        // Add search and status filters
        const matchConditions = {};
        
        if (search) {
            matchConditions.$or = [
                { 'userAccount.fullName': { $regex: search, $options: 'i' } },
                { 'userAccount.email': { $regex: search, $options: 'i' } },
                { specialization: { $regex: search, $options: 'i' } },
                { licenseNumber: { $regex: search, $options: 'i' } },
                { department: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (status) {
            matchConditions['userAccount.isActive'] = status === 'active';
        }
        
        if (Object.keys(matchConditions).length > 0) {
            pipeline.push({ $match: matchConditions });
        }
        
        // Add sorting and pagination
        pipeline.push(
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit }
        );
        
        // Get doctors
        const doctors = await Doctor.aggregate(pipeline);
        
        // Get total count for pagination
        const countPipeline = [
            {
                $lookup: {
                    from: 'users',
                    localField: 'userAccount',
                    foreignField: '_id',
                    as: 'userAccount'
                }
            },
            {
                $unwind: '$userAccount'
            }
        ];
        
        if (Object.keys(matchConditions).length > 0) {
            countPipeline.push({ $match: matchConditions });
        }
        
        countPipeline.push({ $count: 'total' });
        
        const countResult = await Doctor.aggregate(countPipeline);
        const totalDoctors = countResult[0]?.total || 0;
        
        // Get statistics
        const stats = await Doctor.aggregate([
            {
                $lookup: {
                    from: 'users',
                    localField: 'userAccount',
                    foreignField: '_id',
                    as: 'userAccount'
                }
            },
            {
                $unwind: '$userAccount'
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    active: { $sum: { $cond: ['$userAccount.isActive', 1, 0] } },
                    inactive: { $sum: { $cond: ['$userAccount.isActive', 0, 1] } }
                }
            }
        ]);
        
        res.status(200).json({
            success: true,
            data: doctors,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalDoctors / limit),
                totalRecords: totalDoctors,
                limit,
                hasNextPage: page < Math.ceil(totalDoctors / limit),
                hasPrevPage: page > 1
            },
            stats: stats[0] || { total: 0, active: 0, inactive: 0 }
        });
        
    } catch (error) {
        console.error('❌ Error fetching doctors:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch doctors',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 GET SINGLE DOCTOR
export const getDoctorForAdmin = async (req, res) => {
    try {
        const { doctorId } = req.params;
        
        const doctor = await Doctor.findById(doctorId)
            .populate('userAccount', 'fullName email username isActive createdAt')
            .lean();
        
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor not found'
            });
        }
        
        // Get doctor's study statistics
        const studyStats = await DicomStudy.aggregate([
            {
                $match: {
                    'lastAssignedDoctor.doctorId': new mongoose.Types.ObjectId(doctorId)
                }
            },
            {
                $group: {
                    _id: null,
                    totalAssigned: { $sum: 1 },
                    completed: {
                        $sum: {
                            $cond: [
                                { $in: ['$workflowStatus', ['report_finalized', 'final_report_downloaded']] },
                                1,
                                0
                            ]
                        }
                    },
                    pending: {
                        $sum: {
                            $cond: [
                                { $in: ['$workflowStatus', ['assigned_to_doctor', 'doctor_opened_report', 'report_in_progress']] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);
        
        const stats = studyStats[0] || { totalAssigned: 0, completed: 0, pending: 0 };
        
        res.status(200).json({
            success: true,
            data: {
                ...doctor,
                stats
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching doctor:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch doctor details',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 UPDATE DOCTOR (FIXED FOR MONGODB SIGNATURES)
export const updateDoctorForAdmin = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.withTransaction(async () => {
            const { doctorId } = req.params;
            const {
                fullName,
                email,
                username,
                specialization,
                licenseNumber,
                department,
                qualifications,
                yearsOfExperience,
                contactPhoneOffice,
                isActiveProfile,
                isActive
            } = req.body;
            
            const doctor = await Doctor.findById(doctorId).populate('userAccount').session(session);
            
            if (!doctor) {
                throw new Error('Doctor not found');
            }
            
            // 🔧 FIXED: Handle signature upload for MongoDB storage
            let signatureUpdates = {};
            if (req.file) {
                try {
                    console.log('📝 Processing signature update for MongoDB storage...');
                    
                    // Optimize signature image
                    const optimizedSignature = await sharp(req.file.buffer)
                        .resize(400, 200, {
                            fit: 'contain',
                            background: { r: 255, g: 255, b: 255, alpha: 1 }
                        })
                        .png({ quality: 90, compressionLevel: 6 })
                        .toBuffer();
                    
                    // Convert to base64 for MongoDB storage
                    const base64Signature = optimizedSignature.toString('base64');
                    
                    signatureUpdates = {
                        signature: base64Signature,
                        signatureMetadata: {
                            uploadedAt: new Date(),
                            originalSize: req.file.size || 0,
                            optimizedSize: optimizedSignature.length,
                            originalName: req.file.originalname || 'signature.png',
                            mimeType: 'image/png',
                            lastUpdated: new Date()
                        }
                    };
                    
                    console.log('✅ Signature converted to base64 for MongoDB storage');
                } catch (signatureError) {
                    console.error('❌ Error processing signature:', signatureError);
                    // Continue without signature update
                }
            }
            
            // Update user account
            const userUpdates = {};
            if (fullName) userUpdates.fullName = fullName;
            if (email) userUpdates.email = email;
            if (username) userUpdates.username = username;
            if (isActive !== undefined) userUpdates.isActive = isActive === 'true' || isActive === true;
            
            if (Object.keys(userUpdates).length > 0) {
                await User.findByIdAndUpdate(
                    doctor.userAccount._id,
                    userUpdates,
                    { session, runValidators: true }
                );
            }
            
            // Update doctor profile
            const doctorUpdates = {
                ...signatureUpdates
            };
            
            if (specialization) doctorUpdates.specialization = specialization;
            if (licenseNumber) doctorUpdates.licenseNumber = licenseNumber;
            if (department) doctorUpdates.department = department;
            if (qualifications) {
                doctorUpdates.qualifications = Array.isArray(qualifications) 
                    ? qualifications 
                    : qualifications.split(',').map(q => q.trim()).filter(q => q);
            }
            if (yearsOfExperience !== undefined) doctorUpdates.yearsOfExperience = parseInt(yearsOfExperience) || 0;
            if (contactPhoneOffice) doctorUpdates.contactPhoneOffice = contactPhoneOffice;
            if (isActiveProfile !== undefined) doctorUpdates.isActiveProfile = isActiveProfile === 'true' || isActiveProfile === true;
            
            await Doctor.findByIdAndUpdate(
                doctorId,
                doctorUpdates,
                { session, runValidators: true }
            );
            
            console.log('✅ Doctor updated successfully');
        });
        
        res.status(200).json({
            success: true,
            message: 'Doctor updated successfully'
        });
        
    } catch (error) {
        console.error('❌ Error updating doctor:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update doctor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        await session.endSession();
    }
};

// 🆕 DELETE DOCTOR (FIXED FOR MONGODB SIGNATURES)
export const deleteDoctorForAdmin = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.withTransaction(async () => {
            const { doctorId } = req.params;
            
            const doctor = await Doctor.findById(doctorId).populate('userAccount').session(session);
            
            if (!doctor) {
                throw new Error('Doctor not found');
            }
            
            // Update assigned studies to remove doctor assignment
            const assignedStudies = await DicomStudy.updateMany(
                {
                    'lastAssignedDoctor.doctorId': new mongoose.Types.ObjectId(doctorId),
                    workflowStatus: { $in: ['assigned_to_doctor', 'doctor_opened_report', 'report_in_progress'] }
                },
                {
                    $pull: { lastAssignedDoctor: { doctorId: new mongoose.Types.ObjectId(doctorId) } },
                    $set: { 
                        workflowStatus: 'pending_assignment'
                    }
                },
                { session }
            );
            
            console.log(`✅ Updated ${assignedStudies.modifiedCount} studies to pending_assignment status`);
            
            // Delete doctor profile (signature is stored in MongoDB, so no external cleanup needed)
            await Doctor.findByIdAndDelete(doctorId).session(session);
            
            // Delete user account
            await User.findByIdAndDelete(doctor.userAccount._id).session(session);
            
            console.log('✅ Doctor deleted successfully');
        });
        
        res.status(200).json({
            success: true,
            message: 'Doctor deleted successfully'
        });
        
    } catch (error) {
        console.error('❌ Error deleting doctor:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete doctor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        await session.endSession();
    }
};

// 🆕 GET ALL LABS (ALREADY OPTIMIZED)
export const getAllLabsForAdmin = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const status = req.query.status; // 'active', 'inactive', or undefined for all
        
        // Build query
        const query = {};
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { identifier: { $regex: search, $options: 'i' } },
                { contactEmail: { $regex: search, $options: 'i' } },
                { contactPerson: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (status) {
            query.isActive = status === 'active';
        }
        
        const skip = (page - 1) * limit;
        
        // Get labs without heavy aggregation
        const labs = await Lab.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        
        // Get total count
        const totalLabs = await Lab.countDocuments(query);
        
        // Get basic statistics separately (optimized)
        const [studyStats, staffStats, generalStats] = await Promise.all([
            // Study counts per lab (only get counts, not full documents)
            DicomStudy.aggregate([
                {
                    $group: {
                        _id: '$sourceLab',
                        totalStudies: { $sum: 1 },
                        pending: {
                            $sum: {
                                $cond: [
                                    { $in: ['$workflowStatus', ['new_study_received', 'pending_assignment']] },
                                    1,
                                    0
                                ]
                            }
                        },
                        inProgress: {
                            $sum: {
                                $cond: [
                                    { $in: ['$workflowStatus', ['assigned_to_doctor', 'doctor_opened_report', 'report_in_progress']] },
                                    1,
                                    0
                                ]
                            }
                        },
                        completed: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$workflowStatus', 'final_report_downloaded'] },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                }
            ]).allowDiskUse(true),
            
            // Staff counts per lab
            User.aggregate([
                {
                    $match: {
                        lab: { $exists: true, $ne: null }
                    }
                },
                {
                    $group: {
                        _id: '$lab',
                        totalStaff: { $sum: 1 },
                        activeStaff: {
                            $sum: {
                                $cond: ['$isActive', 1, 0]
                            }
                        }
                    }
                }
            ]).allowDiskUse(true),
            
            // General lab statistics
            Lab.aggregate([
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        active: { $sum: { $cond: ['$isActive', 1, 0] } },
                        inactive: { $sum: { $cond: ['$isActive', 0, 1] } }
                    }
                }
            ])
        ]);
        
        // Create lookup maps for efficient data merging
        const studyStatsMap = new Map();
        studyStats.forEach(stat => {
            if (stat._id) {
                studyStatsMap.set(stat._id.toString(), {
                    totalStudies: stat.totalStudies,
                    pending: stat.pending,
                    inProgress: stat.inProgress,
                    completed: stat.completed
                });
            }
        });
        
        const staffStatsMap = new Map();
        staffStats.forEach(stat => {
            if (stat._id) {
                staffStatsMap.set(stat._id.toString(), {
                    totalStaff: stat.totalStaff,
                    activeStaff: stat.activeStaff
                });
            }
        });
        
        // Enhance labs with statistics
        const enhancedLabs = labs.map(lab => {
            const labId = lab._id.toString();
            const studyStat = studyStatsMap.get(labId) || { totalStudies: 0, pending: 0, inProgress: 0, completed: 0 };
            const staffStat = staffStatsMap.get(labId) || { totalStaff: 0, activeStaff: 0 };
            
            return {
                ...lab,
                totalStudies: studyStat.totalStudies,
                activeStaff: staffStat.activeStaff,
                totalStaff: staffStat.totalStaff,
                studyStats: {
                    pending: studyStat.pending,
                    inProgress: studyStat.inProgress,
                    completed: studyStat.completed
                },
                staffStats: {
                    total: staffStat.totalStaff,
                    active: staffStat.activeStaff
                }
            };
        });
        
        res.status(200).json({
            success: true,
            data: enhancedLabs,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalLabs / limit),
                totalRecords: totalLabs,
                limit,
                hasNextPage: page < Math.ceil(totalLabs / limit),
                hasPrevPage: page > 1
            },
            stats: generalStats[0] || { total: 0, active: 0, inactive: 0 }
        });
        
    } catch (error) {
        console.error('❌ Error fetching labs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch labs',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 GET SINGLE LAB (FIXED MEMORY ERROR)
export const getLabForAdmin = async (req, res) => {
    try {
        const { labId } = req.params;
        
        // Get lab basic info
        const lab = await Lab.findById(labId).lean();
        
        if (!lab) {
            return res.status(404).json({
                success: false,
                message: 'Lab not found'
            });
        }
        
        // Get statistics separately to avoid memory issues
        const [studyStats, staffStats] = await Promise.all([
            // Study statistics
            DicomStudy.aggregate([
                { $match: { sourceLab: new mongoose.Types.ObjectId(labId) } },
                {
                    $group: {
                        _id: null,
                        totalStudies: { $sum: 1 },
                        pending: {
                            $sum: {
                                $cond: [
                                    { $in: ['$workflowStatus', ['new_study_received', 'pending_assignment']] },
                                    1,
                                    0
                                ]
                            }
                        },
                        inProgress: {
                            $sum: {
                                $cond: [
                                    { $in: ['$workflowStatus', ['assigned_to_doctor', 'doctor_opened_report', 'report_in_progress']] },
                                    1,
                                    0
                                ]
                            }
                        },
                        completed: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$workflowStatus', 'final_report_downloaded'] },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                }
            ]),
            
            // Staff statistics
            User.aggregate([
                { $match: { lab: new mongoose.Types.ObjectId(labId) } },
                {
                    $group: {
                        _id: null,
                        totalStaff: { $sum: 1 },
                        activeStaff: {
                            $sum: {
                                $cond: ['$isActive', 1, 0]
                            }
                        }
                    }
                }
            ])
        ]);
        
        const studyData = studyStats[0] || { totalStudies: 0, pending: 0, inProgress: 0, completed: 0 };
        const staffData = staffStats[0] || { totalStaff: 0, activeStaff: 0 };
        
        // Combine data
        const labDetails = {
            ...lab,
            totalStudies: studyData.totalStudies,
            studyStats: {
                pending: studyData.pending,
                inProgress: studyData.inProgress,
                completed: studyData.completed
            },
            staffStats: {
                total: staffData.totalStaff,
                active: staffData.activeStaff
            }
        };
        
        res.status(200).json({
            success: true,
            data: labDetails
        });
        
    } catch (error) {
        console.error('❌ Error fetching lab:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch lab details',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 UPDATE LAB
export const updateLabForAdmin = async (req, res) => {
    try {
        const { labId } = req.params;
        const {
            name,
            identifier,
            contactPerson,
            contactEmail,
            contactPhone,
            address,
            isActive,
            notes
        } = req.body;
        
        const updateData = {};
        
        if (name) updateData.name = name;
        if (identifier) updateData.identifier = identifier;
        if (contactPerson) updateData.contactPerson = contactPerson;
        if (contactEmail) updateData.contactEmail = contactEmail;
        if (contactPhone) updateData.contactPhone = contactPhone;
        if (address) updateData.address = address;
        if (isActive !== undefined) updateData.isActive = isActive === 'true' || isActive === true;
        if (notes !== undefined) updateData.notes = notes;
        
        const updatedLab = await Lab.findByIdAndUpdate(
            labId,
            updateData,
            { new: true, runValidators: true }
        );
        
        if (!updatedLab) {
            return res.status(404).json({
                success: false,
                message: 'Lab not found'
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'Lab updated successfully',
            data: updatedLab
        });
        
    } catch (error) {
        console.error('❌ Error updating lab:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update lab',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 DELETE LAB
export const deleteLabForAdmin = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.withTransaction(async () => {
            const { labId } = req.params;
            
            const lab = await Lab.findById(labId).session(session);
            
            if (!lab) {
                throw new Error('Lab not found');
            }
            
            // Check if lab has any studies
            const studyCount = await DicomStudy.countDocuments({
                sourceLab: labId
            }).session(session);
            
            if (studyCount > 0) {
                throw new Error('Cannot delete lab with existing studies');
            }
            
            // Check if lab has any staff members
            const staffCount = await User.countDocuments({
                lab: labId
            }).session(session);
            
            if (staffCount > 0) {
                throw new Error('Cannot delete lab with existing staff members. Please reassign or delete staff first.');
            }
            
            // Delete lab
            await Lab.findByIdAndDelete(labId).session(session);
            
            console.log('✅ Lab deleted successfully');
        });
        
        res.status(200).json({
            success: true,
            message: 'Lab deleted successfully'
        });
        
    } catch (error) {
        console.error('❌ Error deleting lab:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete lab',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        await session.endSession();
    }
};

// 🆕 GET ALL OWNERS
export const getAllOwnersForAdmin = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const status = req.query.status; // 'active', 'inactive', or undefined for all
        
        const skip = (page - 1) * limit;
        
        // Build query for owners
        const query = { role: 'owner' };
        
        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (status) {
            query.isActive = status === 'active';
        }
        
        // Get owners
        const owners = await User.find(query)
            .select('-password -resetPasswordOTP -resetPasswordOTPExpires -resetPasswordAttempts -resetPasswordLockedUntil')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        
        // Get total count
        const totalOwners = await User.countDocuments(query);
        
        // Get statistics
        const stats = await User.aggregate([
            { $match: { role: 'owner' } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    active: { $sum: { $cond: ['$isActive', 1, 0] } },
                    inactive: { $sum: { $cond: ['$isActive', 0, 1] } }
                }
            }
        ]);
        
        res.status(200).json({
            success: true,
            data: owners,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalOwners / limit),
                totalRecords: totalOwners,
                limit,
                hasNextPage: page < Math.ceil(totalOwners / limit),
                hasPrevPage: page > 1
            },
            stats: stats[0] || { total: 0, active: 0, inactive: 0 }
        });
        
    } catch (error) {
        console.error('❌ Error fetching owners:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch owners',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 GET SINGLE OWNER
export const getOwnerForAdmin = async (req, res) => {
    try {
        const { ownerId } = req.params;
        
        const owner = await User.findById(ownerId)
            .select('-password -resetPasswordOTP -resetPasswordOTPExpires -resetPasswordAttempts -resetPasswordLockedUntil')
            .lean();
        
        if (!owner || owner.role !== 'owner') {
            return res.status(404).json({
                success: false,
                message: 'Owner not found'
            });
        }
        
        // Get owner's activity statistics (invoices generated, etc.)
        const activityStats = await mongoose.connection.db.collection('billinginvoices').aggregate([
            {
                $match: {
                    generatedBy: new mongoose.Types.ObjectId(ownerId)
                }
            },
            {
                $group: {
                    _id: null,
                    totalInvoicesGenerated: { $sum: 1 },
                    totalAmountGenerated: { $sum: '$breakdown.totalAmount' },
                    lastInvoiceDate: { $max: '$generatedAt' }
                }
            }
        ]).toArray();
        
        const stats = activityStats[0] || { 
            totalInvoicesGenerated: 0, 
            totalAmountGenerated: 0, 
            lastInvoiceDate: null 
        };
        
        res.status(200).json({
            success: true,
            data: {
                ...owner,
                activityStats: stats
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching owner:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch owner details',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 CREATE OWNER
export const createOwnerForAdmin = async (req, res) => {
    try {
        const {
            username,
            email,
            password,
            fullName,
            isActive = true,
            ownerPermissions = {
                canViewAllLabs: true,
                canManageBilling: true,
                canSetPricing: true,
                canGenerateReports: true
            }
        } = req.body;
        
        // Validation
        if (!username || !email || !password || !fullName) {
            return res.status(400).json({
                success: false,
                message: 'Username, email, password, and full name are required'
            });
        }
        
        // Check if username or email already exists
        const existingUser = await User.findOne({
            $or: [
                { username: username.toLowerCase() },
                { email: email.toLowerCase() }
            ]
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: existingUser.username === username.toLowerCase() 
                    ? 'Username already exists' 
                    : 'Email already exists'
            });
        }
        
        // Create owner account
        const newOwner = new User({
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            password,
            fullName,
            role: 'owner',
            isActive: isActive === 'true' || isActive === true,
            ownerPermissions
        });
        
        await newOwner.save();
        
        // Remove password from response
        const ownerResponse = newOwner.toObject();
        delete ownerResponse.password;
        delete ownerResponse.resetPasswordOTP;
        delete ownerResponse.resetPasswordOTPExpires;
        delete ownerResponse.resetPasswordAttempts;
        delete ownerResponse.resetPasswordLockedUntil;
        
        console.log('✅ Owner account created successfully:', newOwner.email);
        
        res.status(201).json({
            success: true,
            message: 'Owner account created successfully',
            data: ownerResponse
        });
        
    } catch (error) {
        console.error('❌ Error creating owner:', error);
        
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
            });
        }
        
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create owner account',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 UPDATE OWNER
export const updateOwnerForAdmin = async (req, res) => {
    try {
        const { ownerId } = req.params;
        const {
            username,
            email,
            fullName,
            isActive,
            ownerPermissions,
            newPassword
        } = req.body;
        
        const owner = await User.findById(ownerId);
        
        if (!owner || owner.role !== 'owner') {
            return res.status(404).json({
                success: false,
                message: 'Owner not found'
            });
        }
        
        // Build update object
        const updateData = {};
        
        if (username) {
            // Check if username is already taken by another user
            const existingUser = await User.findOne({
                username: username.toLowerCase(),
                _id: { $ne: ownerId }
            });
            
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Username already exists'
                });
            }
            
            updateData.username = username.toLowerCase();
        }
        
        if (email) {
            // Check if email is already taken by another user
            const existingUser = await User.findOne({
                email: email.toLowerCase(),
                _id: { $ne: ownerId }
            });
            
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already exists'
                });
            }
            
            updateData.email = email.toLowerCase();
        }
        
        if (fullName) updateData.fullName = fullName;
        if (isActive !== undefined) updateData.isActive = isActive === 'true' || isActive === true;
        if (ownerPermissions) updateData.ownerPermissions = ownerPermissions;
        
        // Handle password update
        if (newPassword && newPassword.trim() !== '') {
            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 6 characters long'
                });
            }
            
            const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10);
            updateData.password = await bcrypt.hash(newPassword, salt);
        }
        
        const updatedOwner = await User.findByIdAndUpdate(
            ownerId,
            updateData,
            { new: true, runValidators: true }
        ).select('-password -resetPasswordOTP -resetPasswordOTPExpires -resetPasswordAttempts -resetPasswordLockedUntil');
        
        console.log('✅ Owner updated successfully:', updatedOwner.email);
        
        res.status(200).json({
            success: true,
            message: 'Owner updated successfully',
            data: updatedOwner
        });
        
    } catch (error) {
        console.error('❌ Error updating owner:', error);
        
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
            });
        }
        
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update owner',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 DELETE OWNER
export const deleteOwnerForAdmin = async (req, res) => {
    try {
        const { ownerId } = req.params;
        
        const owner = await User.findById(ownerId);
        
        if (!owner || owner.role !== 'owner') {
            return res.status(404).json({
                success: false,
                message: 'Owner not found'
            });
        }
        
        // Check if this is the last owner account
        const ownerCount = await User.countDocuments({ role: 'owner', isActive: true });
        
        if (ownerCount <= 1) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete the last active owner account. At least one owner must remain.'
            });
        }
        
        // Delete owner account
        await User.findByIdAndDelete(ownerId);
        
        console.log('✅ Owner deleted successfully:', owner.email);
        
        res.status(200).json({
            success: true,
            message: 'Owner deleted successfully'
        });
        
    } catch (error) {
        console.error('❌ Error deleting owner:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete owner',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ UPDATE the default export to include new owner functions:
export default {
    // ... existing functions ...
    getAllOwnersForAdmin,
    getOwnerForAdmin,
    createOwnerForAdmin,
    updateOwnerForAdmin,
    deleteOwnerForAdmin
};

// Add this to adminCRUD.controller.js

// 🆕 NEW: Advanced Search Controller with Backend Integration
export const searchStudiesForAdmin = async (req, res) => {
    try {
        const {
            // Search parameters
            patientName,
            patientId,
            accessionNumber,
            search, // General search term
            
            // Filters
            status,
            modality,
            location,
            emergency,
            mlc,
            
            // Date filters
            quickDatePreset = 'today',
            customDateFrom,
            customDateTo,
            dateType = 'UploadDate',
            
            // Pagination
            page = 1,
            limit = 100
        } = req.query;

        console.log('🔍 BACKEND SEARCH: Received search request with params:', req.query);

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // 🔧 BUILD: MongoDB aggregation pipeline for advanced search
        const pipeline = [];

        // ✅ STEP 1: Build match conditions
        const matchConditions = {};

        // 🔍 SEARCH LOGIC: Handle different search types
        if (search && search.trim()) {
            const searchTerm = search.trim();
            console.log(`🔍 BACKEND SEARCH: General search term: "${searchTerm}"`);
            
            // Default to patient name search if no specific field specified
            matchConditions.$or = [
                { patientName: { $regex: searchTerm, $options: 'i' } },
                { patientId: { $regex: searchTerm, $options: 'i' } },
                { accessionNumber: { $regex: searchTerm, $options: 'i' } }
            ];
        }

        // 🎯 SPECIFIC FIELD SEARCHES (override general search)
        if (patientName && patientName.trim()) {
            console.log(`🔍 BACKEND SEARCH: Patient name search: "${patientName}"`);
            delete matchConditions.$or; // Remove general search
            matchConditions.patientName = { $regex: patientName.trim(), $options: 'i' };
        }

        if (patientId && patientId.trim()) {
            console.log(`🔍 BACKEND SEARCH: Patient ID search: "${patientId}"`);
            delete matchConditions.$or; // Remove general search
            matchConditions.patientId = { $regex: patientId.trim(), $options: 'i' };
        }

        if (accessionNumber && accessionNumber.trim()) {
            console.log(`🔍 BACKEND SEARCH: Accession number search: "${accessionNumber}"`);
            delete matchConditions.$or; // Remove general search
            matchConditions.accessionNumber = { $regex: accessionNumber.trim(), $options: 'i' };
        }

        // 🏷️ STATUS FILTER
        if (status && status !== 'all') {
            const statusMap = {
                'pending': ['new_study_received', 'pending_assignment'],
                'inprogress': ['assigned_to_doctor', 'doctor_opened_report', 'report_in_progress'],
                'completed': ['report_finalized', 'final_report_downloaded']
            };
            
            if (statusMap[status]) {
                matchConditions.workflowStatus = { $in: statusMap[status] };
            } else {
                matchConditions.workflowStatus = status;
            }
            console.log(`🏷️ BACKEND SEARCH: Status filter: ${status}`);
        }

        // 🏥 MODALITY FILTER
        if (modality && modality.trim()) {
            const modalities = modality.split(',').map(m => m.trim()).filter(m => m);
            if (modalities.length > 0) {
                matchConditions.modality = { 
                    $in: modalities.map(mod => new RegExp(mod, 'i')) 
                };
                console.log(`🏥 BACKEND SEARCH: Modality filter: ${modalities.join(', ')}`);
            }
        }

        // 📍 LOCATION FILTER
        if (location && location.trim() && location !== 'ALL') {
            matchConditions.$or = [
                { location: { $regex: location.trim(), $options: 'i' } },
                { 'sourceLab.name': { $regex: location.trim(), $options: 'i' } },
                { institutionName: { $regex: location.trim(), $options: 'i' } }
            ];
            console.log(`📍 BACKEND SEARCH: Location filter: ${location}`);
        }

        // 🚨 EMERGENCY FILTER
        if (emergency === 'true') {
            matchConditions.$or = [
                { caseType: 'urgent' },
                { caseType: 'emergency' },
                { priority: 'URGENT' }
            ];
            console.log('🚨 BACKEND SEARCH: Emergency cases only');
        }

        // 🏷️ MLC FILTER
        if (mlc === 'true') {
            matchConditions.mlcCase = true;
            console.log('🏷️ BACKEND SEARCH: MLC cases only');
        }

        // 📅 DATE FILTER LOGIC
        const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
        
        if (quickDatePreset === 'custom' && (customDateFrom || customDateTo)) {
            const dateFilter = {};
            
            if (customDateFrom) {
                dateFilter.$gte = new Date(customDateFrom);
                console.log(`📅 BACKEND SEARCH: Custom date from: ${customDateFrom}`);
            }
            
            if (customDateTo) {
                const toDate = new Date(customDateTo);
                toDate.setHours(23, 59, 59, 999); // End of day
                dateFilter.$lte = toDate;
                console.log(`📅 BACKEND SEARCH: Custom date to: ${customDateTo}`);
            }
            
            if (Object.keys(dateFilter).length > 0) {
                matchConditions[dateField] = dateFilter;
            }
        } else if (quickDatePreset && quickDatePreset !== 'all') {
            // Quick date presets
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const dateFilter = {};
            
            switch (quickDatePreset) {
                case 'today':
                    dateFilter.$gte = today;
                    dateFilter.$lt = new Date(today.getTime() + 24 * 60 * 60 * 1000);
                    break;
                case 'yesterday':
                    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
                    dateFilter.$gte = yesterday;
                    dateFilter.$lt = today;
                    break;
                case 'thisWeek':
                    const startOfWeek = new Date(today);
                    startOfWeek.setDate(today.getDate() - today.getDay());
                    dateFilter.$gte = startOfWeek;
                    break;
                case 'thisMonth':
                    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    dateFilter.$gte = startOfMonth;
                    break;
                case 'last24h':
                    dateFilter.$gte = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    break;
            }
            
            if (Object.keys(dateFilter).length > 0) {
                matchConditions[dateField] = dateFilter;
                console.log(`📅 BACKEND SEARCH: Date preset: ${quickDatePreset}`);
            }
        }

        // ✅ STEP 2: Add match stage if we have conditions
        if (Object.keys(matchConditions).length > 0) {
            pipeline.push({ $match: matchConditions });
        }

        // ✅ STEP 3: Add lookups for related data
        pipeline.push(
            {
                $lookup: {
                    from: 'labs',
                    localField: 'sourceLab',
                    foreignField: '_id',
                    as: 'sourceLab',
                    pipeline: [
                        { $project: { name: 1, identifier: 1, contactEmail: 1 } }
                    ]
                }
            },
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'lastAssignedDoctor.doctorId',
                    foreignField: '_id',
                    as: 'assignedDoctorDetails',
                    pipeline: [
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'userAccount',
                                foreignField: '_id',
                                as: 'userAccount',
                                pipeline: [
                                    { $project: { fullName: 1, email: 1 } }
                                ]
                            }
                        },
                        {
                            $project: {
                                specialization: 1,
                                department: 1,
                                userAccount: { $arrayElemAt: ['$userAccount', 0] }
                            }
                        }
                    ]
                }
            }
        );

        // ✅ STEP 4: Add facet for data + count
        pipeline.push({
            $facet: {
                data: [
                    { $sort: { createdAt: -1 } },
                    { $skip: skip },
                    { $limit: parseInt(limit) },
                    {
                        $project: {
                            // Core patient info
                            patientName: 1,
                            patientId: 1,
                            patientAge: 1,
                            patientSex: 1,
                            patientDateOfBirth: 1,
                            
                            // Study info
                            studyInstanceUID: 1,
                            studyDate: 1,
                            studyTime: 1,
                            accessionNumber: 1,
                            modality: 1,
                            description: 1,
                            institutionName: 1,
                            
                            // Workflow
                            workflowStatus: 1,
                            caseType: 1,
                            priority: 1,
                            mlcCase: 1,
                            
                            // Timestamps
                            createdAt: 1,
                            updatedAt: 1,
                            
                            // Populated data
                            sourceLab: { $arrayElemAt: ['$sourceLab', 0] },
                            assignedDoctor: { $arrayElemAt: ['$assignedDoctorDetails', 0] },
                            lastAssignedDoctor: 1,
                            
                            // Counts
                            seriesCount: 1,
                            instanceCount: 1,
                            
                            // TAT
                            tat: 1
                        }
                    }
                ],
                count: [{ $count: 'total' }]
            }
        });

        console.log('🚀 BACKEND SEARCH: Executing aggregation pipeline...');
        const startTime = Date.now();
        
        const result = await DicomStudy.aggregate(pipeline).allowDiskUse(true);
        
        const executionTime = Date.now() - startTime;
        console.log(`⚡ BACKEND SEARCH: Query executed in ${executionTime}ms`);

        const studies = result[0]?.data || [];
        const totalRecords = result[0]?.count[0]?.total || 0;

        // ✅ STEP 5: Generate summary statistics
        const summary = {
            totalRecords,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalRecords / parseInt(limit)),
            limit: parseInt(limit),
            executionTime,
            searchCriteria: {
                hasSearch: !!(search || patientName || patientId || accessionNumber),
                searchType: patientName ? 'patientName' : 
                           patientId ? 'patientId' : 
                           accessionNumber ? 'accessionNumber' : 
                           search ? 'general' : 'none',
                hasFilters: !!(status || modality || location || emergency || mlc),
                dateFilter: quickDatePreset,
                dateType
            }
        };

        console.log(`✅ BACKEND SEARCH: Found ${totalRecords} studies in ${executionTime}ms`);
        console.log(`📊 BACKEND SEARCH: Returning ${studies.length} studies for page ${page}`);

        res.status(200).json({
            success: true,
            data: studies,
            totalRecords,
            summary,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalRecords / parseInt(limit)),
                limit: parseInt(limit),
                hasNextPage: parseInt(page) < Math.ceil(totalRecords / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1
            },
            meta: {
                executionTime,
                searchPerformed: true,
                backend: 'mongodb-aggregation',
                cacheUsed: false
            }
        });

    } catch (error) {
        console.error('❌ BACKEND SEARCH: Error executing search:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to execute search',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            searchPerformed: false
        });
    }
};