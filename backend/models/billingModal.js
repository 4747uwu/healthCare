import mongoose from 'mongoose';

const BillingConfigSchema = new mongoose.Schema({
    // ✅ PRICING: Modality-based pricing configuration
    modalityPricing: [{
        modality: {
            type: String,
            required: true,
            enum: ['CT', 'MRI', 'XR', 'US', 'DX', 'CR', 'MG', 'NM', 'PT', 'UNKNOWN'],
            index: true
        },
        pricePerStudy: {
            type: Number,
            required: true,
            min: 0
        },
        currency: {
            type: String,
            default: 'INR',
            enum: ['INR', 'USD', 'EUR', 'GBP']
        },
        isActive: {
            type: Boolean,
            default: true
        }
    }],
    
    // ✅ BILLING: Default pricing and settings
    defaultSettings: {
        currency: {
            type: String,
            default: 'INR',
            enum: ['INR', 'USD', 'EUR', 'GBP']
        },
        taxRate: {
            type: Number,
            default: 18, // 18% GST for India
            min: 0,
            max: 100
        },
        defaultPricePerStudy: {
            type: Number,
            default: 100,
            min: 0
        },
        billingCycle: {
            type: String,
            enum: ['monthly', 'quarterly', 'yearly'],
            default: 'monthly'
        },
        paymentTerms: {
            type: String,
            default: 'Net 30 days'
        }
    },
    
    // ✅ DISCOUNTS: Lab-specific pricing and discounts
    labSpecificPricing: [{
        lab: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Lab',
            required: true
        },
        discountPercentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        customPricing: [{
            modality: String,
            pricePerStudy: Number
        }],
        isActive: {
            type: Boolean,
            default: true
        },
        effectiveFrom: {
            type: Date,
            default: Date.now
        },
        effectiveTo: {
            type: Date
        }
    }],
    
    // ✅ METADATA: Configuration metadata
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    version: {
        type: Number,
        default: 1
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { 
    timestamps: true,
    collection: 'billing_configs'
});

// ✅ INDEXES: Optimize for frequent queries
BillingConfigSchema.index({ 'modalityPricing.modality': 1 });
BillingConfigSchema.index({ 'labSpecificPricing.lab': 1 });
BillingConfigSchema.index({ isActive: 1 });

// ✅ METHODS: Get pricing for specific modality and lab
BillingConfigSchema.methods.getPriceForStudy = function(modality, labId = null) {
    // Check lab-specific pricing first
    if (labId) {
        const labPricing = this.labSpecificPricing.find(lp => 
            lp.lab.toString() === labId.toString() && 
            lp.isActive &&
            (!lp.effectiveTo || lp.effectiveTo > new Date())
        );
        
        if (labPricing) {
            // Check custom pricing for this modality
            const customPrice = labPricing.customPricing.find(cp => cp.modality === modality);
            if (customPrice) {
                return customPrice.pricePerStudy;
            }
            
            // Apply discount to standard pricing
            const standardPrice = this.getStandardPrice(modality);
            return standardPrice * (1 - labPricing.discountPercentage / 100);
        }
    }
    
    // Return standard pricing
    return this.getStandardPrice(modality);
};

BillingConfigSchema.methods.getStandardPrice = function(modality) {
    const modalityPrice = this.modalityPricing.find(mp => 
        mp.modality === modality && mp.isActive
    );
    
    return modalityPrice ? modalityPrice.pricePerStudy : this.defaultSettings.defaultPricePerStudy;
};

export default mongoose.model('BillingConfig', BillingConfigSchema);