import mongoose from 'mongoose';

const BillingInvoiceSchema = new mongoose.Schema({
    // ✅ INVOICE: Basic invoice information
    invoiceNumber: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    lab: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lab',
        required: true,
        index: true
    },
    
    // ✅ PERIOD: Billing period
    billingPeriod: {
        startDate: {
            type: Date,
            required: true,
            index: true
        },
        endDate: {
            type: Date,
            required: true,
            index: true
        },
        description: {
            type: String,
            default: function() {
                const start = this.billingPeriod.startDate.toLocaleDateString();
                const end = this.billingPeriod.endDate.toLocaleDateString();
                return `Billing Period: ${start} to ${end}`;
            }
        }
    },
    
    // ✅ STUDIES: Detailed breakdown of studies
    studiesBilled: [{
        study: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DicomStudy',
            required: true
        },
        studyInstanceUID: String,
        patientName: String,
        studyDate: Date,
        modality: String,
        pricePerStudy: Number,
        discountApplied: {
            type: Number,
            default: 0
        },
        finalPrice: Number
    }],
    
    // ✅ BREAKDOWN: Financial breakdown
    breakdown: {
        // Modality-wise breakdown
        modalityBreakdown: [{
            modality: String,
            studyCount: Number,
            pricePerStudy: Number,
            subtotal: Number
        }],
        
        // Summary
        totalStudies: {
            type: Number,
            required: true,
            min: 0
        },
        subtotal: {
            type: Number,
            required: true,
            min: 0
        },
        discountAmount: {
            type: Number,
            default: 0,
            min: 0
        },
        discountPercentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        taxableAmount: {
            type: Number,
            required: true,
            min: 0
        },
        taxRate: {
            type: Number,
            default: 18,
            min: 0,
            max: 100
        },
        taxAmount: {
            type: Number,
            required: true,
            min: 0
        },
        totalAmount: {
            type: Number,
            required: true,
            min: 0
        },
        currency: {
            type: String,
            default: 'INR',
            enum: ['INR', 'USD', 'EUR', 'GBP']
        }
    },
    
    // ✅ STATUS: Invoice status and payment tracking
    status: {
        type: String,
        enum: ['draft', 'generated', 'sent', 'paid', 'overdue', 'cancelled'],
        default: 'draft',
        index: true
    },
    
    // ✅ PAYMENT: Payment information
    payment: {
        dueDate: {
            type: Date,
            required: true,
            index: true
        },
        paidDate: Date,
        paymentMethod: {
            type: String,
            enum: ['bank_transfer', 'cheque', 'cash', 'upi', 'card', 'other']
        },
        transactionReference: String,
        paidAmount: {
            type: Number,
            min: 0
        },
        paymentNotes: String
    },
    
    // ✅ METADATA: Creation and update tracking
    generatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    generatedAt: {
        type: Date,
        default: Date.now
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // ✅ RECEIPT: Receipt generation
    receiptGenerated: {
        type: Boolean,
        default: false
    },
    receiptPath: String,
    receiptGeneratedAt: Date,
    
    // ✅ NOTES: Additional information
    notes: String,
    internalNotes: String
}, { 
    timestamps: true,
    collection: 'billing_invoices'
});

// ✅ INDEXES: Optimize for common queries
BillingInvoiceSchema.index({ lab: 1, status: 1 });
BillingInvoiceSchema.index({ 'billingPeriod.startDate': 1, 'billingPeriod.endDate': 1 });
BillingInvoiceSchema.index({ status: 1, 'payment.dueDate': 1 });
BillingInvoiceSchema.index({ invoiceNumber: 1 }, { unique: true });

// ✅ METHODS: Generate invoice number
BillingInvoiceSchema.statics.generateInvoiceNumber = async function() {
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    
    const prefix = `INV-${currentYear}${currentMonth}`;
    
    // Find the last invoice for this month
    const lastInvoice = await this.findOne({
        invoiceNumber: { $regex: `^${prefix}` }
    }).sort({ invoiceNumber: -1 });
    
    let sequence = 1;
    if (lastInvoice) {
        const lastSequence = parseInt(lastInvoice.invoiceNumber.split('-').pop());
        sequence = lastSequence + 1;
    }
    
    return `${prefix}-${String(sequence).padStart(4, '0')}`;
};

// ✅ METHODS: Calculate totals
BillingInvoiceSchema.methods.calculateTotals = function() {
    const subtotal = this.studiesBilled.reduce((sum, study) => sum + study.finalPrice, 0);
    const discountAmount = subtotal * (this.breakdown.discountPercentage / 100);
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = taxableAmount * (this.breakdown.taxRate / 100);
    const totalAmount = taxableAmount + taxAmount;
    
    this.breakdown.subtotal = subtotal;
    this.breakdown.discountAmount = discountAmount;
    this.breakdown.taxableAmount = taxableAmount;
    this.breakdown.taxAmount = taxAmount;
    this.breakdown.totalAmount = totalAmount;
    this.breakdown.totalStudies = this.studiesBilled.length;
    
    return {
        subtotal,
        discountAmount,
        taxableAmount,
        taxAmount,
        totalAmount
    };
};

export default mongoose.model('BillingInvoice', BillingInvoiceSchema);