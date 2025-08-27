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
    # 🔧 ENHANCED: Complete Puppeteer Chrome dependencies
    wget \
    gnupg \
    ca-certificates \
    curl \
    # 🔧 CRITICAL: Core system libraries that were missing
    libc6 \
    libstdc++6 \
    libgcc-s1 \
    # 🔧 FONT and TEXT rendering
    fonts-liberation \
    fonts-dejavu-core \
    fontconfig \
    # 🔧 AUDIO libraries
    libasound2 \
    # 🔧 ACCESSIBILITY libraries  
    libappindicator3-1 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    # 🔧 GRAPHICS and RENDERING libraries
    libcairo-gobject2 \
    libcairo2 \
    libdrm2 \
    libgbm1 \
    # 🔧 CRITICAL: GLib and related libraries (this was missing)
    libglib2.0-0 \
    libglib2.0-dev \
    libgtk-3-0 \
    libgtk-4-1 \
    # 🔧 PRINTING support
    libcups2 \
    # 🔧 DBUS for system communication
    libdbus-1-3 \
    # 🔧 MOZILLA/BROWSER libraries
    libnspr4 \
    libnss3 \
    # 🔧 TEXT and FONT rendering
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    # 🔧 X11 and DISPLAY libraries
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
    # 🔧 SYSTEM utilities
    lsb-release \
    xdg-utils \
    # 🔧 SECURITY libraries
    libu2f-udev \
    libvulkan1 \
    # 🔧 ADDITIONAL Chrome dependencies for headless mode
    libgconf-2-4 \
    libxkbcommon0 \
    libepoxy0 \
    libxkbfile1 \
    libsecret-1-0 \
    # 🔧 NEW: Additional missing dependencies often required
    libgdk-pixbuf2.0-0 \
    libgtk-3-dev \
    libxss-dev \
    libasound2-dev \
    libpangocairo-1.0-0 \
    libatk1.0-dev \
    libcairo-gobject2 \
    libgtk-3-dev \
    libgdk-pixbuf2.0-dev \
    # 🔧 SHARED libraries that might be missing
    libc6-dev \
    libgcc-s1 \
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



# 🔧 ENHANCED: Create directory for Puppeteer cache and set permissions
RUN mkdir -p /home/nodejs/.cache/puppeteer && \
    mkdir -p /home/nodejs/.local/share/fonts && \
    chown -R nodejs:nodejs /home/nodejs/.cache && \
    chown -R nodejs:nodejs /home/nodejs/.local

# Change ownership of app directory
RUN chown -R nodejs:nodejs /app

# 🔧 ENHANCED: Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_CACHE_DIR=/home/nodejs/.cache/puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=""
# 🔧 NEW: Additional environment variables for Chrome
ENV CHROME_BIN=""
ENV DISPLAY=:99

# 🔧 NEW: Font configuration for better text rendering
ENV FONTCONFIG_PATH=/etc/fonts

# Switch to non-root user (uncomment if needed)
# USER nodejs

# Expose port
EXPOSE 3000

# Start command
CMD ["node", "server.js"]