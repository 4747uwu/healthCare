# 🔧 PRODUCTION: backend/Dockerfile (Definitive Puppeteer Fix)
FROM node:22-bookworm-slim AS base

# Install essential tools AND the complete, official list of Puppeteer dependencies
RUN apt-get update && apt-get install -y \
    dcmtk \
    git \
    # ✅ FIX: Using the complete, official dependency list from the Puppeteer team
    # This covers all common graphics, font, audio, and system libraries.
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnss3 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    libasound2 \
    libxkbcommon0 \
    libcairo2 \
    libpango-1.0-0 \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Create non-root user for security FIRST
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs

# Create cache directory and set ownership
RUN mkdir -p /home/nodejs/.cache/puppeteer && \
    chown -R nodejs:nodejs /home/nodejs

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_CACHE_DIR=/home/nodejs/.cache/puppeteer

# Install npm packages
RUN npm ci --omit=dev && npm cache clean --force

# Copy the rest of your application code
COPY . .

# Install Chrome and its dependencies using the official command
RUN chown -R nodejs:nodejs /app
USER nodejs
RUN npx puppeteer browsers install chrome

# Switch back to the WORKDIR as the nodejs user
WORKDIR /app

# Expose port
EXPOSE 3000

# Start command
CMD ["node", "server.js"]