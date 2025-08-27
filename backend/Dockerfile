# 🔧 PRODUCTION: backend/Dockerfile with Debian, DCMTK, and Puppeteer dependencies
FROM node:22-bookworm-slim AS base

# Update package list and install dependencies including DCMTK and Puppeteer requirements
RUN apt-get update && apt-get install -y \
    # Build tools
    python3 \
    make \
    g++ \
    cmake \
    pkg-config \
    git \
    # DCMTK for medical imaging
    dcmtk \
    # 🔧 NEW: Puppeteer Chrome dependencies
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo-gobject2 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libgtk-4-1 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    libu2f-udev \
    libvulkan1 \
    # Additional Chrome dependencies for headless mode
    libgconf-2-4 \
    libxkbcommon0 \
    libepoxy0 \
    libdrm2 \
    libxkbfile1 \
    libsecret-1-0 \
    # Clean up to reduce image size
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user for security
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs

# Create temp directory for DICOM operations with proper permissions
RUN mkdir -p /tmp/dicom_temp && \
    chown -R nodejs:nodejs /tmp/dicom_temp

# 🔧 NEW: Create directory for Puppeteer cache and set permissions
RUN mkdir -p /home/nodejs/.cache/puppeteer && \
    chown -R nodejs:nodejs /home/nodejs/.cache

# Change ownership of app directory
RUN chown -R nodejs:nodejs /app

# 🔧 NEW: Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_CACHE_DIR=/home/nodejs/.cache/puppeteer

# Switch to non-root user (uncomment if needed)
# USER nodejs

# Expose port
EXPOSE 3000

# Start command
CMD ["node", "server.js"]