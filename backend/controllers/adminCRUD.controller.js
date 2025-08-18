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
// 🆕 NEW: Advanced Search Controller with Backend Integration - UPDATED to match admin controller format
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
            quickDatePreset = 'all',
            customDateFrom,
            customDateTo,
            dateType = 'UploadDate',
            
            // Pagination
            page = 1,
            limit = 100
        } = req.query;

        console.log('🔍 BACKEND SEARCH: Received search request with params:', req.query);

        const startTime = Date.now();
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // 🔧 BUILD: MongoDB aggregation pipeline for advanced search
        const pipeline = [];

        // ✅ STEP 1: Build match conditions
        const matchConditions = {};

        // 🔍 SEARCH LOGIC: Handle different search types with correct field mapping
        if (search && search.trim()) {
            const searchTerm = search.trim();
            console.log(`🔍 BACKEND SEARCH: General search term: "${searchTerm}"`);
            
            matchConditions.$or = [
                { 'patientInfo.patientName': { $regex: searchTerm, $options: 'i' } },
                { 'patientInfo.patientID': { $regex: searchTerm, $options: 'i' } },
                { patientId: { $regex: searchTerm, $options: 'i' } },
                { accessionNumber: { $regex: searchTerm, $options: 'i' } },
                { studyInstanceUID: { $regex: searchTerm, $options: 'i' } }
            ];
        }

        // 🎯 SPECIFIC FIELD SEARCHES (override general search)
        if (patientName && patientName.trim()) {
            console.log(`🔍 BACKEND SEARCH: Patient name search: "${patientName}"`);
            delete matchConditions.$or;
            matchConditions.$or = [
                { 'patientInfo.patientName': { $regex: patientName.trim(), $options: 'i' } },
                { patientName: { $regex: patientName.trim(), $options: 'i' } }
            ];
        }

        if (patientId && patientId.trim()) {
            console.log(`🔍 BACKEND SEARCH: Patient ID search: "${patientId}"`);
            delete matchConditions.$or;
            matchConditions.$or = [
                { 'patientInfo.patientID': { $regex: patientId.trim(), $options: 'i' } },
                { patientId: { $regex: patientId.trim(), $options: 'i' } }
            ];
        }

        if (accessionNumber && accessionNumber.trim()) {
            console.log(`🔍 BACKEND SEARCH: Accession number search: "${accessionNumber}"`);
            delete matchConditions.$or;
            matchConditions.accessionNumber = { $regex: accessionNumber.trim(), $options: 'i' };
        }

        // 🏷️ STATUS FILTER
        if (status && status !== 'all') {
            const statusMap = {
                'pending': ['new_study_received', 'pending_assignment'],
                'inprogress': ['assigned_to_doctor', 'doctor_opened_report', 'report_in_progress', 'report_finalized', 'report_drafted', 'report_uploaded', 'report_downloaded_radiologist', 'report_downloaded'],
                'completed': ['final_report_downloaded']
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
                matchConditions.$or = matchConditions.$or || [];
                matchConditions.$or.push(
                    { modality: { $in: modalities.map(mod => new RegExp(mod, 'i')) } },
                    { modalitiesInStudy: { $in: modalities.map(mod => new RegExp(mod, 'i')) } }
                );
                console.log(`🏥 BACKEND SEARCH: Modality filter: ${modalities.join(', ')}`);
            }
        }

        // 📍 LOCATION FILTER
        if (location && location.trim() && location !== 'ALL') {
            const locationConditions = [
                { location: { $regex: location.trim(), $options: 'i' } },
                { 'sourceLab.name': { $regex: location.trim(), $options: 'i' } },
                { institutionName: { $regex: location.trim(), $options: 'i' } }
            ];
            
            if (matchConditions.$or) {
                matchConditions.$and = [
                    { $or: matchConditions.$or },
                    { $or: locationConditions }
                ];
                delete matchConditions.$or;
            } else {
                matchConditions.$or = locationConditions;
            }
            console.log(`📍 BACKEND SEARCH: Location filter: ${location}`);
        }

        // 🚨 EMERGENCY FILTER
        if (emergency === 'true') {
            matchConditions.caseType = { $in: ['urgent', 'emergency'] };
            console.log('🚨 BACKEND SEARCH: Emergency cases only');
        }

        // 📅 DATE FILTER LOGIC
        const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
        
        if (quickDatePreset && quickDatePreset !== 'all') {
            if (quickDatePreset === 'custom' && (customDateFrom || customDateTo)) {
                const dateFilter = {};
                
                if (customDateFrom) {
                    dateFilter.$gte = new Date(customDateFrom);
                }
                
                if (customDateTo) {
                    const toDate = new Date(customDateTo);
                    toDate.setHours(23, 59, 59, 999);
                    dateFilter.$lte = toDate;
                }
                
                if (Object.keys(dateFilter).length > 0) {
                    matchConditions[dateField] = dateFilter;
                }
            } else {
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
                }
            }
        }

        // ✅ STEP 2: Add match stage if we have conditions
        if (Object.keys(matchConditions).length > 0) {
            pipeline.push({ $match: matchConditions });
            console.log('🔍 BACKEND SEARCH: Applied match conditions:', JSON.stringify(matchConditions, null, 2));
        }

        // ✅ STEP 3: Add lookups for related data (same as admin controller)
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
                    from: 'patients',
                    localField: 'patient',
                    foreignField: '_id',
                    as: 'patientDetails',
                    pipeline: [
                        { $project: { 
                            patientNameRaw: 1, 
                            firstName: 1, 
                            lastName: 1,
                            medicalHistory: 1,
                            clinicalInfo: 1
                        }}
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
                                    { $project: { fullName: 1, email: 1, isActive: 1 } }
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

        // ✅ STEP 4: Add sorting and pagination
        pipeline.push(
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: parseInt(limit) }
        );

        // ✅ STEP 5: Add projection to match admin controller format
        pipeline.push({
            $project: {
                _id: 1,
                studyInstanceUID: 1,
                orthancStudyID: 1,
                accessionNumber: 1,
                workflowStatus: 1,
                modality: 1,
                modalitiesInStudy: 1,
                studyDescription: 1,
                examDescription: 1,
                seriesCount: 1,
                instanceCount: 1,
                seriesImages: 1,
                studyDate: 1,
                studyTime: 1,
                createdAt: 1,
                ReportAvailable: 1,
                'assignment.priority': 1,
                'assignment.assignedAt': 1,
                lastAssignedDoctor: 1,
                doctorReports: 1,
                reportInfo: 1,
                reportFinalizedAt: 1,
                caseType: 1,
                patientId: 1,
                age: 1,
                gender: 1,
                clinicalHistory: 1,
                preProcessedDownload: 1,
                patientInfo: 1, // Include patientInfo object
                
                // Populate related data
                sourceLab: { $arrayElemAt: ['$sourceLab', 0] },
                patientDetails: { $arrayElemAt: ['$patientDetails', 0] },
                assignedDoctorDetails: 1
            }
        });

        console.log('🚀 BACKEND SEARCH: Executing aggregation pipeline...');
        const queryStart = Date.now();
        
        // Execute main query and count query in parallel
        const [studiesResult, countResult] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(true),
            DicomStudy.countDocuments(matchConditions)
        ]);
        
        const queryTime = Date.now() - queryStart;
        console.log(`⚡ BACKEND SEARCH: Query executed in ${queryTime}ms`);

        const studies = studiesResult;
        const totalRecords = countResult;

        // ✅ STEP 6: Format studies to match admin controller format exactly
        const formatStart = Date.now();
        
        // Pre-compile category mapping for better performance
        const categoryMap = {
            'new_study_received': 'pending',
            'pending_assignment': 'pending',
            'assigned_to_doctor': 'inprogress',
            'doctor_opened_report': 'inprogress',
            'report_in_progress': 'inprogress',
            'report_finalized': 'inprogress',
            'report_drafted': 'inprogress',
            'report_uploaded': 'inprogress',
            'report_downloaded_radiologist': 'inprogress',
            'report_downloaded': 'inprogress',
            'final_report_downloaded': 'completed'
        };

        const formattedStudies = studies.map(study => {
            // Get patient data
            const patient = study.patientDetails;
            const sourceLab = study.sourceLab;

            // Check for Wasabi zip availability
            const hasWasabiZip = study.preProcessedDownload?.zipStatus === 'completed' && 
                                study.preProcessedDownload?.zipUrl &&
                                (!study.preProcessedDownload?.zipExpiresAt || 
                                 study.preProcessedDownload.zipExpiresAt > new Date());

            // Handle both legacy (object) and new (array) formats for lastAssignedDoctor
            let latestAssignedDoctor = null;
            let latestAssignmentEntry = null;
            let allDoctorAssignments = [];
            let isLegacyFormat = false;

            // Normalize lastAssignedDoctor to always be an array for consistent processing
            let assignmentArray = [];
            
            if (Array.isArray(study.lastAssignedDoctor)) {
                assignmentArray = study.lastAssignedDoctor;
            } else if (study.lastAssignedDoctor && typeof study.lastAssignedDoctor === 'object') {
                assignmentArray = [study.lastAssignedDoctor];
                isLegacyFormat = true;
            }

            if (assignmentArray.length > 0) {
                // Get the latest assignment (last element in array)
                latestAssignmentEntry = assignmentArray[assignmentArray.length - 1];
                
                // Find the corresponding doctor details
                if (study.assignedDoctorDetails && study.assignedDoctorDetails.length > 0) {
                    latestAssignedDoctor = study.assignedDoctorDetails.find(doctor => 
                        doctor._id.toString() === latestAssignmentEntry.doctorId?.toString()
                    ) || study.assignedDoctorDetails[0];
                }

                // Build all doctor assignments
                allDoctorAssignments = assignmentArray.map(assignment => ({
                    doctorId: assignment.doctorId,
                    assignedAt: assignment.assignedAt,
                    doctorDetails: study.assignedDoctorDetails?.find(doctor => 
                        doctor._id.toString() === assignment.doctorId?.toString()
                    )
                }));
            }
            
            // Build patient display with proper fallback chain
            let patientDisplay = "N/A";
            let patientIdForDisplay = study.patientId || "N/A";
            
            // Use patientInfo first, then patient details, then fallback
            if (study.patientInfo?.patientName) {
                patientDisplay = study.patientInfo.patientName;
            } else if (patient?.patientNameRaw) {
                patientDisplay = patient.patientNameRaw;
            } else if (patient?.firstName || patient?.lastName) {
                patientDisplay = `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
            }

            // Use patientInfo for patient ID as well
            if (study.patientInfo?.patientID) {
                patientIdForDisplay = study.patientInfo.patientID;
            }

            const patientAgeGenderDisplay = study.age && study.gender ? 
                                          `${study.age}/${study.gender}` : 
                                          study.age || study.gender || 'N/A';

            // Fast category lookup using pre-compiled map
            const currentCategory = categoryMap[study.workflowStatus] || 'unknown';
            
            // Calculate TAT (you may want to import your TAT calculation function)
            // const tat = calculateTATForStudy(study);

            return {
                _id: study._id,
                orthancStudyID: study.orthancStudyID,
                studyInstanceUID: study.studyInstanceUID,
                instanceID: study.studyInstanceUID,
                accessionNumber: study.accessionNumber,
                patientId: patientIdForDisplay,
                patientName: patientDisplay,
                ageGender: patientAgeGenderDisplay,
                description: study.studyDescription || study.examDescription || 'N/A',
                modality: study.modalitiesInStudy?.length > 0 ? 
                         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                location: sourceLab?.name || 'N/A',
                studyDateTime: study.studyDate && study.studyTime 
                ? formatDicomDateTime(study.studyDate, study.studyTime)
                : study.studyDate 
                    ? new Date(study.studyDate).toLocaleDateString('en-GB', {
                        year: 'numeric', month: 'short', day: '2-digit'
                    })
                    : 'N/A',
                
                studyDate: study.studyDate,
                uploadDateTime: study.createdAt
                ? new Date(study.createdAt).toLocaleString('en-GB', {
                    timeZone: 'Asia/Kolkata',
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }).replace(',', '')
                : 'N/A',
                workflowStatus: study.workflowStatus,
                currentCategory: currentCategory,
                createdAt: study.createdAt,
                reportedBy: study.reportInfo?.reporterName || 'N/A',
                reportedDate: Array.isArray(study.doctorReports) && study.doctorReports.length > 0
                ? (() => {
                    const latestReport = study.doctorReports.reduce((latest, current) => 
                        new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
                    );
                    return new Date(latestReport.createdAt).toLocaleString('en-GB', {
                        timeZone: 'Asia/Kolkata',
                        year: 'numeric', month: 'short', day: '2-digit',
                        hour: '2-digit', minute: '2-digit', hour12: false
                    }).replace(',', '');
                })()
                : null,
                assignedDoctorName: latestAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
                priority: study.assignment?.priority || 'NORMAL',
                caseType: study.caseType || 'routine',
                ReportAvailable: study.ReportAvailable || false,
                reportFinalizedAt: study.reportFinalizedAt,
                clinicalHistory: study?.clinicalHistory?.clinicalHistory || 
                               patient?.medicalHistory?.clinicalHistory || 
                               patient?.clinicalInfo?.clinicalHistory || '',
                doctorAssignments: allDoctorAssignments,

                downloadOptions: {
                    hasWasabiZip: hasWasabiZip,
                    hasR2Zip: hasWasabiZip,
                    wasabiFileName: study.preProcessedDownload?.zipFileName || null,
                    wasabiSizeMB: study.preProcessedDownload?.zipSizeMB || 0,
                    wasabiDownloadCount: study.preProcessedDownload?.downloadCount || 0,
                    wasabiCreatedAt: study.preProcessedDownload?.zipCreatedAt || null,
                    wasabiExpiresAt: study.preProcessedDownload?.zipExpiresAt || null,
                    zipStatus: study.preProcessedDownload?.zipStatus || 'not_started'
                },
                latestAssignedDoctorDetails: latestAssignedDoctor ? {
                    _id: latestAssignedDoctor._id,
                    fullName: latestAssignedDoctor.userAccount?.fullName || 'Unknown Doctor',
                    email: latestAssignedDoctor.userAccount?.email || null,
                    specialization: latestAssignedDoctor.specialization || null,
                    isActive: latestAssignedDoctor.userAccount?.isActive || false,
                    assignedAt: latestAssignmentEntry?.assignedAt || null
                } : null,
                assignmentHistory: {
                    totalAssignments: allDoctorAssignments.length,
                    hasActiveAssignment: latestAssignedDoctor !== null,
                    lastAssignedAt: latestAssignmentEntry?.assignedAt || null,
                    isLegacyFormat: isLegacyFormat,
                    assignmentChain: allDoctorAssignments.map(assignment => ({
                        doctorName: assignment.doctorDetails?.userAccount?.fullName || 'Unknown Doctor',
                        assignedAt: assignment.assignedAt,
                        isActive: assignment.doctorDetails?.userAccount?.isActive || false
                    }))
                }
            };
        });

        const formatTime = Date.now() - formatStart;
        const executionTime = Date.now() - startTime;

        console.log(`✅ BACKEND SEARCH: Found ${totalRecords} studies in ${executionTime}ms`);
        console.log(`📊 BACKEND SEARCH: Returning ${formattedStudies.length} studies for page ${page}`);

        // Return response in same format as admin controller
        res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalRecords: totalRecords,
            recordsPerPage: parseInt(limit),
            data: formattedStudies,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalRecords / parseInt(limit)),
                totalRecords: totalRecords,
                limit: parseInt(limit),
                hasNextPage: parseInt(page) < Math.ceil(totalRecords / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1,
                recordRange: {
                    start: (parseInt(page) - 1) * parseInt(limit) + 1,
                    end: Math.min(parseInt(page) * parseInt(limit), totalRecords)
                },
                isSinglePage: totalRecords <= parseInt(limit)
            },
            performance: {
                queryTime: executionTime,
                fromCache: false,
                recordsReturned: formattedStudies.length,
                requestedLimit: parseInt(limit),
                actualReturned: formattedStudies.length,
                breakdown: {
                    coreQuery: queryTime,
                    lookups: 0,
                    formatting: formatTime
                }
            },
            metadata: {
                searchCriteria: {
                    hasSearch: !!(search || patientName || patientId || accessionNumber),
                    searchType: patientName ? 'patientName' : 
                               patientId ? 'patientId' : 
                               accessionNumber ? 'accessionNumber' : 
                               search ? 'general' : 'none',
                    hasFilters: !!(status || modality || location || emergency || mlc),
                    dateFilter: quickDatePreset,
                    dateType,
                    globalSearch: quickDatePreset === 'all'
                },
                filters: {
                    category: status || 'all',
                    modality: modality || 'all',
                    location: location || 'all',
                    search: search || patientName || patientId || accessionNumber || null
                }
            },
            meta: {
                executionTime,
                searchPerformed: true,
                backend: 'mongodb-aggregation',
                cacheUsed: false,
                fieldsSearched: Object.keys(matchConditions).length > 0 ? Object.keys(matchConditions) : ['all'],
                globalSearch: quickDatePreset === 'all'
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