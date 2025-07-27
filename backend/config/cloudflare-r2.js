import { S3Client } from '@aws-sdk/client-s3';

// ✅ HARDCODED: Your actual Cloudflare R2 Configuration
export const r2Config = {
    // ✅ HARDCODED: Your actual account endpoint from the screenshot
    endpoint: 'https://b39c632fcc14248dfcf837983059a2cd.r2.cloudflarestorage.com',
    
    // R2 credentials from environment
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    
    // ✅ HARDCODED: Your actual bucket name from screenshot
    zipBucket: 'studyzip',
    
    // ✅ HARDCODED: Your public URL pattern (from S3 API shown in screenshot)
    publicUrlPattern: 'https://pub-studyzip.r2.dev',
    
    // ✅ HARDCODED: Custom domain configuration
    customDomain: process.env.R2_CUSTOM_DOMAIN || null,
    
    // ✅ HARDCODED: S3 API endpoint for your bucket
    s3ApiEndpoint: 'https://b39c632fcc14248dfcf837983059a2cd.r2.cloudflarestorage.com/studyzip',
    
    // Region from screenshot
    region: 'apac', // Asia-Pacific as shown
    
    // CDN settings optimized for medical imaging
    cdnSettings: {
        cacheMaxAge: 86400,        // 24 hours browser cache
        edgeCacheMaxAge: 2592000,  // 30 days edge cache (R2 has generous limits)
        enableCompression: false,  // Don't compress ZIP files
        enableCaching: true
    },
    
    // R2 Features
    features: {
        enablePublicAccess: true,
        enableCustomDomain: !!process.env.R2_CUSTOM_DOMAIN,
        enablePresignedUrls: false, // R2 supports direct public access
        enableAnalytics: true,
        enableCDN: true // Built-in CDN
    }
};

// ✅ HARDCODED: Create R2 S3-compatible client with your endpoint
export const r2Client = new S3Client({
    region: 'auto', // R2 uses 'auto' as region
    endpoint: r2Config.endpoint,
    credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
    },
    // R2-specific configuration
    forcePathStyle: true, // Required for R2
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

console.log('🔧 Cloudflare R2 configuration loaded for studyzip bucket');
console.log(`🌐 Public URL pattern: ${r2Config.publicUrlPattern}`);
console.log(`📦 Bucket: ${r2Config.zipBucket}`);
console.log(`🌍 Region: ${r2Config.region}`);