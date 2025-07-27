import mongoose from 'mongoose';
import DicomStudy from '../models/dicomStudyModel.js';
import Lab from '../models/labModel.js';
import BillingConfig from '../models/billingModal.js';
import BillingInvoice from '../models/billingInvoice.js';
import User from '../models/userModel.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// ✅ DASHBOARD: Owner dashboard with all labs
export const getOwnerDashboard = async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', sortBy = 'name', sortOrder = 'asc' } = req.query;
        
        console.log(`🏢 Owner Dashboard - User: ${req.user.email}, Page: ${page}`);
        
        // Build search query
        const searchQuery = {};
        if (search) {
            searchQuery.$or = [
                { name: { $regex: search, $options: 'i' } },
                { identifier: { $regex: search, $options: 'i' } },
                { contactEmail: { $regex: search, $options: 'i' } }
            ];
        }
        
        // ✅ PARALLEL: Execute all queries including modalities with correct handling
        const [labsAggregationResult, totalLabsResult, overallStatsResult, modalitiesResult] = await Promise.allSettled([
            // Existing labs aggregation
            Lab.aggregate([
                { $match: { isActive: true, ...searchQuery } },
                {
                    $lookup: {
                        from: 'dicomstudies',
                        localField: '_id',
                        foreignField: 'sourceLab',
                        as: 'studies'
                    }
                },
                {
                    $addFields: {
                        totalStudies: { $size: '$studies' },
                        thisMonthStudies: {
                            $size: {
                                $filter: {
                                    input: '$studies',
                                    cond: {
                                        $gte: ['$$this.createdAt', new Date(new Date().getFullYear(), new Date().getMonth(), 1)]
                                    }
                                }
                            }
                        },
                        lastMonthStudies: {
                            $size: {
                                $filter: {
                                    input: '$studies',
                                    cond: {
                                        $and: [
                                            { $gte: ['$$this.createdAt', new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)] },
                                            { $lt: ['$$this.createdAt', new Date(new Date().getFullYear(), new Date().getMonth(), 1)] }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                },
                {
                    $project: {
                        name: 1,
                        identifier: 1,
                        contactPerson: 1,
                        contactEmail: 1,
                        contactPhone: 1,
                        address: 1,
                        isActive: 1,
                        createdAt: 1,
                        totalStudies: 1,
                        thisMonthStudies: 1,
                        lastMonthStudies: 1,
                        growthRate: {
                            $cond: {
                                if: { $gt: ['$lastMonthStudies', 0] },
                                then: {
                                    $multiply: [
                                        { $divide: [
                                            { $subtract: ['$thisMonthStudies', '$lastMonthStudies'] },
                                            '$lastMonthStudies'
                                        ]},
                                        100
                                    ]
                                },
                                else: 0
                            }
                        }
                    }
                },
                { $sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 } },
                { $skip: (page - 1) * limit },
                { $limit: parseInt(limit) }
            ]),
            
            // Total labs count
            Lab.countDocuments({ isActive: true, ...searchQuery }),
            
            // Overall statistics
            DicomStudy.aggregate([
                {
                    $group: {
                        _id: null,
                        totalStudies: { $sum: 1 },
                        thisMonthStudies: {
                            $sum: {
                                $cond: [
                                    { $gte: ['$createdAt', new Date(new Date().getFullYear(), new Date().getMonth(), 1)] },
                                    1,
                                    0
                                ]
                            }
                        },
                        totalRevenue: { $sum: '$billing.amount' },
                        uniqueLabs: { $addToSet: '$sourceLab' }
                    }
                },
                {
                    $addFields: {
                        uniqueLabsCount: { $size: '$uniqueLabs' }
                    }
                }
            ]),
            
            // ✅ FIXED: Get distinct modalities with proper handling
            DicomStudy.aggregate([
                {
                    $addFields: {
                        effectiveModality: {
                            $cond: {
                                if: { $and: [{ $ne: ["$modalitiesInStudy", null] }, { $gt: [{ $size: "$modalitiesInStudy" }, 0] }] },
                                then: { $arrayElemAt: ["$modalitiesInStudy", 0] },
                                else: { $ifNull: ["$modality", "Unknown"] }
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: "$effectiveModality"
                    }
                },
                {
                    $sort: { _id: 1 }
                }
            ])
        ]);

        // Handle results
        const labsAggregation = labsAggregationResult.status === 'fulfilled' ? labsAggregationResult.value : [];
        const totalLabs = totalLabsResult.status === 'fulfilled' ? totalLabsResult.value : 0;
        const overallStatsArray = overallStatsResult.status === 'fulfilled' ? overallStatsResult.value : [];
        const modalitiesAggResult = modalitiesResult.status === 'fulfilled' ? modalitiesResult.value : [];

        const stats = overallStatsArray[0] || {
            totalStudies: 0,
            thisMonthStudies: 0,
            totalRevenue: 0,
            uniqueLabsCount: 0
        };
        
        // ✅ FILTER: Extract modalities from aggregation result
        const modalities = modalitiesAggResult
            .map(item => item._id)
            .filter(modality => modality && modality.trim() && modality !== 'Unknown')
            .sort();

        console.log(`✅ Owner Dashboard: Found ${modalities.length} distinct modalities:`, modalities);
        
        res.json({
            success: true,
            data: {
                labs: labsAggregation,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalLabs / limit),
                    totalLabs,
                    limit: parseInt(limit)
                },
                overallStats: {
                    totalLabs: stats.uniqueLabsCount,
                    totalStudies: stats.totalStudies,
                    thisMonthStudies: stats.thisMonthStudies,
                    totalRevenue: stats.totalRevenue || 0
                },
                // ✅ NEW: Include modalities in response
                modalities: modalities
            }
        });
        
    } catch (error) {
        console.error('❌ Owner Dashboard Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch owner dashboard',
            error: error.message
        });
    }
};

// ✅ LAB DETAILS: Get detailed lab information with billing
export const getLabDetails = async (req, res) => {
    try {
        const { labId } = req.params;
        const { startDate, endDate } = req.query;
        
        console.log(`🔍 Lab Details - Lab: ${labId}, Period: ${startDate} to ${endDate}`);
        
        // Default to current month if no dates provided
        const periodStart = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const periodEnd = endDate ? new Date(endDate) : new Date();
        
        // Get lab information
        const lab = await Lab.findById(labId);
        if (!lab) {
            return res.status(404).json({
                success: false,
                message: 'Lab not found'
            });
        }
        
        // ✅ FIXED: Get studies with proper modality handling like in admin controller
        const studiesAggregation = await DicomStudy.aggregate([
            {
                $match: {
                    sourceLab: new mongoose.Types.ObjectId(labId),
                    createdAt: { $gte: periodStart, $lte: periodEnd }
                }
            },
            {
                $addFields: {
                    // ✅ FIX: Use the same modality logic as admin controller
                    effectiveModality: {
                        $cond: {
                            if: { $and: [{ $ne: ["$modalitiesInStudy", null] }, { $gt: [{ $size: "$modalitiesInStudy" }, 0] }] },
                            then: { $arrayElemAt: ["$modalitiesInStudy", 0] }, // Take first modality from array
                            else: { $ifNull: ["$modality", "N/A"] } // Fallback to single modality or N/A
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$effectiveModality", // ✅ FIXED: Group by effectiveModality instead of $modality
                    count: { $sum: 1 },
                    studies: { $push: {
                        _id: '$_id',
                        studyInstanceUID: '$studyInstanceUID',
                        patientName: '$patientInfo.patientName',
                        studyDate: '$studyDate',
                        createdAt: '$createdAt',
                        modality: "$effectiveModality" // ✅ ADD: Include the effective modality
                    }}
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);
        
        console.log(`📊 Found ${studiesAggregation.length} modality groups:`, 
            studiesAggregation.map(g => `${g._id}: ${g.count} studies`).join(', '));
        
        // Calculate total studies
        const totalStudies = studiesAggregation.reduce((sum, modality) => sum + modality.count, 0);
        
        // Get current billing configuration
        const billingConfig = await BillingConfig.findOne({ isActive: true });
        
        // ✅ FIXED: Calculate billing amount for each modality with correct modality names
        const modalityBilling = studiesAggregation.map(modalityData => {
            const modalityName = modalityData._id || 'Unknown';
            const pricePerStudy = billingConfig ? 
                billingConfig.getPriceForStudy(modalityName, labId) : 100;
            
            console.log(`💰 Pricing for ${modalityName}: ₹${pricePerStudy} per study`);
            
            return {
                modality: modalityName, // ✅ FIXED: Use correct modality name
                studyCount: modalityData.count,
                pricePerStudy: pricePerStudy,
                subtotal: modalityData.count * pricePerStudy,
                studies: modalityData.studies
            };
        });
        
        // Calculate totals
        const subtotal = modalityBilling.reduce((sum, mb) => sum + mb.subtotal, 0);
        const taxRate = billingConfig?.defaultSettings?.taxRate || 18;
        const taxAmount = subtotal * (taxRate / 100);
        const totalAmount = subtotal + taxAmount;
        
        console.log(`✅ Lab ${lab.name} billing summary: ${totalStudies} studies, ₹${totalAmount.toFixed(2)} total`);
        
        res.json({
            success: true,
            data: {
                lab: {
                    _id: lab._id,
                    name: lab.name,
                    identifier: lab.identifier,
                    contactPerson: lab.contactPerson,
                    contactEmail: lab.contactEmail,
                    contactPhone: lab.contactPhone,
                    address: lab.address
                },
                billingPeriod: {
                    startDate: periodStart,
                    endDate: periodEnd,
                    description: `${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}`
                },
                studies: {
                    totalStudies,
                    modalityBreakdown: modalityBilling
                },
                billing: {
                    subtotal,
                    taxRate,
                    taxAmount,
                    totalAmount,
                    currency: billingConfig?.defaultSettings?.currency || 'INR'
                },
                billingConfig: billingConfig ? {
                    modalityPricing: billingConfig.modalityPricing,
                    defaultSettings: billingConfig.defaultSettings
                } : null
            }
        });
        
    } catch (error) {
        console.error('❌ Lab Details Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch lab details',
            error: error.message
        });
    }
};

// ✅ BILLING CONFIG: Get/Update billing configuration
export const getBillingConfig = async (req, res) => {
    try {
        console.log(`⚙️ Get Billing Config - User: ${req.user.email}`);
        
        let billingConfig = await BillingConfig.findOne({ isActive: true });
        
        if (!billingConfig) {
            // Create default billing configuration
            billingConfig = new BillingConfig({
                modalityPricing: [
                    { modality: 'CT', pricePerStudy: 150, currency: 'INR' },
                    { modality: 'MRI', pricePerStudy: 200, currency: 'INR' },
                    { modality: 'XR', pricePerStudy: 50, currency: 'INR' },
                    { modality: 'US', pricePerStudy: 75, currency: 'INR' },
                    { modality: 'DX', pricePerStudy: 60, currency: 'INR' },
                    { modality: 'CR', pricePerStudy: 55, currency: 'INR' },
                    { modality: 'MG', pricePerStudy: 80, currency: 'INR' },
                    { modality: 'NM', pricePerStudy: 120, currency: 'INR' },
                    { modality: 'PT', pricePerStudy: 180, currency: 'INR' }
                ],
                createdBy: req.user._id,
                isActive: true
            });
            
            await billingConfig.save();
            console.log('✅ Created default billing configuration');
        }
        
        res.json({
            success: true,
            data: billingConfig
        });
        
    } catch (error) {
        console.error('❌ Get Billing Config Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch billing configuration',
            error: error.message
        });
    }
};

export const updateBillingConfig = async (req, res) => {
    try {
        const { modalityPricing, defaultSettings, labSpecificPricing } = req.body;
        
        console.log(`⚙️ Update Billing Config - User: ${req.user.email}`);
        
        let billingConfig = await BillingConfig.findOne({ isActive: true });
        
        if (!billingConfig) {
            billingConfig = new BillingConfig({
                createdBy: req.user._id
            });
        }
        
        // Update fields
        if (modalityPricing) {
            billingConfig.modalityPricing = modalityPricing;
        }
        
        if (defaultSettings) {
            billingConfig.defaultSettings = { ...billingConfig.defaultSettings, ...defaultSettings };
        }
        
        if (labSpecificPricing) {
            billingConfig.labSpecificPricing = labSpecificPricing;
        }
        
        billingConfig.lastUpdatedBy = req.user._id;
        billingConfig.version += 1;
        
        await billingConfig.save();
        
        res.json({
            success: true,
            message: 'Billing configuration updated successfully',
            data: billingConfig
        });
        
    } catch (error) {
        console.error('❌ Update Billing Config Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update billing configuration',
            error: error.message
        });
    }
};

// ✅ INVOICE: Generate invoice for a lab
export const generateInvoice = async (req, res) => {
    try {
        const { labId } = req.params;
        const { startDate, endDate, notes } = req.body;
        
        console.log(`📄 Generate Invoice - Lab: ${labId}, Period: ${startDate} to ${endDate}`);
        
        const periodStart = new Date(startDate);
        const periodEnd = new Date(endDate);
        
        // Get lab
        const lab = await Lab.findById(labId);
        if (!lab) {
            return res.status(404).json({
                success: false,
                message: 'Lab not found'
            });
        }
        
        // Get billing configuration
        const billingConfig = await BillingConfig.findOne({ isActive: true });
        if (!billingConfig) {
            return res.status(400).json({
                success: false,
                message: 'Billing configuration not found'
            });
        }
        
        // ✅ FIXED: Get studies with proper modality handling
        const studies = await DicomStudy.find({
            sourceLab: labId,
            createdAt: { $gte: periodStart, $lte: periodEnd }
        }).populate('patient', 'patientNameRaw patientID');
        
        if (studies.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No studies found for the specified period'
            });
        }
        
        // ✅ FIXED: Calculate billing for each study with correct modality
        const studiesBilled = studies.map(study => {
            // ✅ FIX: Use the same modality logic as admin controller
            const effectiveModality = study.modalitiesInStudy?.length > 0 ? 
                study.modalitiesInStudy.join(', ') : (study.modality || 'N/A');
            
            const pricePerStudy = billingConfig.getPriceForStudy(effectiveModality, labId);
            
            console.log(`📋 Study ${study.studyInstanceUID}: ${effectiveModality} - ₹${pricePerStudy}`);
            
            return {
                study: study._id,
                studyInstanceUID: study.studyInstanceUID,
                patientName: study.patientInfo?.patientName || study.patient?.patientNameRaw || 'Unknown',
                studyDate: study.studyDate,
                modality: effectiveModality, // ✅ FIXED: Use effective modality
                pricePerStudy: pricePerStudy,
                discountApplied: 0,
                finalPrice: pricePerStudy
            };
        });
        
        // ✅ FIXED: Create modality breakdown with correct modalities
        const modalityBreakdown = {};
        studiesBilled.forEach(study => {
            const modalityKey = study.modality;
            if (!modalityBreakdown[modalityKey]) {
                modalityBreakdown[modalityKey] = {
                    modality: modalityKey,
                    studyCount: 0,
                    pricePerStudy: study.pricePerStudy,
                    subtotal: 0
                };
            }
            modalityBreakdown[modalityKey].studyCount++;
            modalityBreakdown[modalityKey].subtotal += study.finalPrice;
        });
        
        console.log(`📊 Invoice modality breakdown:`, Object.keys(modalityBreakdown));
        
        // Generate invoice number
        const invoiceNumber = await BillingInvoice.generateInvoiceNumber();
        
        // Create invoice
        const invoice = new BillingInvoice({
            invoiceNumber,
            lab: labId,
            billingPeriod: {
                startDate: periodStart,
                endDate: periodEnd
            },
            studiesBilled,
            breakdown: {
                modalityBreakdown: Object.values(modalityBreakdown),
                totalStudies: studies.length,
                discountPercentage: 0,
                taxRate: billingConfig.defaultSettings.taxRate,
                currency: billingConfig.defaultSettings.currency
            },
            status: 'generated',
            payment: {
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
            },
            generatedBy: req.user._id,
            notes
        });
        
        // Calculate totals
        invoice.calculateTotals();
        
        await invoice.save();
        
        // Populate lab information
        await invoice.populate('lab', 'name identifier contactPerson contactEmail contactPhone address');
        
        console.log(`✅ Invoice ${invoiceNumber} generated successfully`);
        
        res.json({
            success: true,
            message: 'Invoice generated successfully',
            data: invoice
        });
        
    } catch (error) {
        console.error('❌ Generate Invoice Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate invoice',
            error: error.message
        });
    }
};

// ✅ RECEIPT: Generate and download receipt
export const generateReceipt = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        
        console.log(`🧾 Generate Receipt - Invoice: ${invoiceId}`);
        
        // Get invoice with populated data
        const invoice = await BillingInvoice.findById(invoiceId)
            .populate('lab', 'name identifier contactPerson contactEmail contactPhone address')
            .populate('generatedBy', 'fullName email');
        
        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }
        
        // Create PDF
        const doc = new PDFDocument({ margin: 50 });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="receipt-${invoice.invoiceNumber}.pdf"`);
        
        // Pipe PDF to response
        doc.pipe(res);
        
        // Header
        doc.fontSize(20)
           .text('MEDICAL DIAGNOSTIC BILLING RECEIPT', 50, 50, { align: 'center' });
        
        doc.fontSize(12)
           .text(`Invoice Number: ${invoice.invoiceNumber}`, 50, 100)
           .text(`Generated Date: ${invoice.generatedAt.toLocaleDateString()}`, 50, 120)
           .text(`Due Date: ${invoice.payment.dueDate.toLocaleDateString()}`, 50, 140);
        
        // Lab Information
        doc.fontSize(14)
           .text('LAB INFORMATION', 50, 180);
        
        doc.fontSize(10)
           .text(`Lab Name: ${invoice.lab.name}`, 50, 200)
           .text(`Identifier: ${invoice.lab.identifier}`, 50, 215)
           .text(`Contact: ${invoice.lab.contactPerson}`, 50, 230)
           .text(`Email: ${invoice.lab.contactEmail}`, 50, 245);
        
        // Billing Period
        doc.fontSize(14)
           .text('BILLING PERIOD', 300, 180);
        
        doc.fontSize(10)
           .text(`From: ${invoice.billingPeriod.startDate.toLocaleDateString()}`, 300, 200)
           .text(`To: ${invoice.billingPeriod.endDate.toLocaleDateString()}`, 300, 215)
           .text(`Total Studies: ${invoice.breakdown.totalStudies}`, 300, 230);
        
        // Modality Breakdown Table
        let yPosition = 300;
        doc.fontSize(14)
           .text('MODALITY BREAKDOWN', 50, yPosition);
        
        yPosition += 30;
        
        // Table headers
        doc.fontSize(10)
           .text('Modality', 50, yPosition)
           .text('Count', 150, yPosition)
           .text('Price/Study', 220, yPosition)
           .text('Subtotal', 320, yPosition);
        
        yPosition += 20;
        
        // Table rows
        invoice.breakdown.modalityBreakdown.forEach(item => {
            doc.text(item.modality, 50, yPosition)
               .text(item.studyCount.toString(), 150, yPosition)
               .text(`₹${item.pricePerStudy}`, 220, yPosition)
               .text(`₹${item.subtotal.toFixed(2)}`, 320, yPosition);
            yPosition += 20;
        });
        
        // Totals
        yPosition += 30;
        doc.fontSize(12)
           .text(`Subtotal: ₹${invoice.breakdown.subtotal.toFixed(2)}`, 320, yPosition);
        
        if (invoice.breakdown.discountAmount > 0) {
            yPosition += 20;
            doc.text(`Discount (${invoice.breakdown.discountPercentage}%): -₹${invoice.breakdown.discountAmount.toFixed(2)}`, 320, yPosition);
        }
        
        yPosition += 20;
        doc.text(`Tax (${invoice.breakdown.taxRate}%): ₹${invoice.breakdown.taxAmount.toFixed(2)}`, 320, yPosition);
        
        yPosition += 20;
        doc.fontSize(14)
           .text(`TOTAL: ₹${invoice.breakdown.totalAmount.toFixed(2)}`, 320, yPosition);
        
        // Footer
        doc.fontSize(8)
           .text('This is a computer-generated receipt.', 50, 700, { align: 'center' })
           .text(`Generated by: ${invoice.generatedBy.fullName} on ${new Date().toLocaleString()}`, 50, 715, { align: 'center' });
        
        // Update invoice to mark receipt as generated
        invoice.receiptGenerated = true;
        invoice.receiptGeneratedAt = new Date();
        await invoice.save();
        
        // End PDF
        doc.end();
        
    } catch (error) {
        console.error('❌ Generate Receipt Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate receipt',
            error: error.message
        });
    }
};

// ✅ INVOICES: Get all invoices
export const getAllInvoices = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, labId } = req.query;
        
        const query = {};
        if (status) query.status = status;
        if (labId) query.lab = labId;
        
        const invoices = await BillingInvoice.find(query)
            .populate('lab', 'name identifier')
            .populate('generatedBy', 'fullName')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
        
        const totalInvoices = await BillingInvoice.countDocuments(query);
        
        res.json({
            success: true,
            data: {
                invoices,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalInvoices / limit),
                    totalInvoices,
                    limit: parseInt(limit)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Get All Invoices Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch invoices',
            error: error.message
        });
    }
};

// ✅ ADD this function to get individual invoice details:

export const getInvoiceDetail = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        
        console.log(`📄 Get Invoice Detail - Invoice: ${invoiceId}`);
        
        const invoice = await BillingInvoice.findById(invoiceId)
            .populate('lab', 'name identifier contactPerson contactEmail contactPhone address')
            .populate('generatedBy', 'fullName email');
        
        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }
        
        res.json({
            success: true,
            data: invoice
        });
        
    } catch (error) {
        console.error('❌ Get Invoice Detail Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch invoice details',
            error: error.message
        });
    }
};


export default {
    getOwnerDashboard,
    getLabDetails,
    getBillingConfig,
    updateBillingConfig,
    generateInvoice,
    generateReceipt,
    getAllInvoices,
    getInvoiceDetail
};