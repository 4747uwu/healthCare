import { S3Client } from '@aws-sdk/client-s3';

// ✅ HARDCODED: Your actual Cloudflare R2 Configuration with credentials
export const r2Config = {
    endpoint: 'https://b39c632fcc14248dfcf837983059a2cd.r2.cloudflarestorage.com',
    
    // ✅ HARDCODED: Your actual R2 credentials
    accessKeyId: '84a50df7100eea000b6ddd0c2ddce67a',
    secretAccessKey: '1a925bae4d85529b3c8e68460b29d03de672a4d9fbba2a7fd430af0edc4f2a91',
    
    zipBucket: 'studyzip',
    publicUrlPattern: 'https://pub-studyzip.r2.dev',
    customDomain: process.env.R2_CUSTOM_DOMAIN || null,
    
    // ✅ FIXED: R2 always uses 'auto' as region
    region: 'auto',
    
    cdnSettings: {
        cacheMaxAge: 86400,
        edgeCacheMaxAge: 2592000,
        enableCompression: false,
        enableCaching: true
    },
    
    features: {
        enablePublicAccess: true,
        enableCustomDomain: !!process.env.R2_CUSTOM_DOMAIN,
        enablePresignedUrls: false,
        enableAnalytics: true,
        enableCDN: true
    }
};

// ✅ ENHANCED: Validate hardcoded credentials
console.log('🔍 DEBUG: R2 Credential Validation:');
console.log(`🔑 Access Key: ${r2Config.accessKeyId.substring(0,8)}...`);
console.log(`🔐 Secret Key: ${r2Config.secretAccessKey.substring(0,8)}...`);

if (!r2Config.accessKeyId || !r2Config.secretAccessKey) {
    console.error('❌ CRITICAL: R2 credentials missing!');
    throw new Error('Missing R2 credentials');
}

// ✅ FIXED: Proper R2 client configuration with hardcoded credentials
export const r2Client = new S3Client({
    region: 'auto', // ✅ CRITICAL: R2 uses 'auto'
    endpoint: r2Config.endpoint,
    credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
    },
    forcePathStyle: true,
    signatureVersion: 'v4'
});

// ✅ FIXED: Helper function to get public URL for R2 object
export const getR2PublicUrl = (key, useCustomDomain = false) => {
    if (useCustomDomain && r2Config.customDomain) {
        return `https://${r2Config.customDomain}/${key}`;
    }
    
    // ✅ HARDCODED: Use your actual public URL pattern
    return `${r2Config.publicUrlPattern}/${key}`;
};

// ✅ ENHANCED: Build CDN-optimized URL with R2's built-in CDN
export const getCDNOptimizedUrl = (key, options = {}) => {
    const baseUrl = getR2PublicUrl(key, r2Config.features.enableCustomDomain);
    
    // Add CDN optimization parameters for R2
    const params = new URLSearchParams();
    
    if (options.cacheControl !== false) {
        // R2 CDN cache headers
        params.append('cache-control', `public, max-age=${r2Config.cdnSettings.cacheMaxAge}, s-maxage=${r2Config.cdnSettings.edgeCacheMaxAge}`);
    }
    
    if (options.filename) {
        params.append('content-disposition', `attachment; filename="${options.filename}"`);
    }
    
    if (options.contentType) {
        params.append('content-type', options.contentType);
    }
    
    // R2-specific optimization
    if (options.r2Optimize !== false) {
        params.append('r2-cache', 'aggressive');
    }
    
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
};

console.log('🔧 Cloudflare R2 configuration loaded with hardcoded credentials');
console.log(`📦 Bucket: ${r2Config.zipBucket}`);
console.log(`🌐 Endpoint: ${r2Config.endpoint}`);
console.log(`🔑 Access Key: ${r2Config.accessKeyId.substring(0,8)}...`);
console.log(`🔐 Secret Key: ***HARDCODED***`);
console.log('✅ R2 credentials are now hardcoded and ready!');