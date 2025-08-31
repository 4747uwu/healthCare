# 🔧 PRODUCTION: backend/Dockerfile (Modern Puppeteer Setup)
FROM node:22-bookworm-slim AS base

# Install only essential tools. Puppeteer will handle the rest.
RUN apt-get update && apt-get install -y \
    dcmtk \
    git \
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

# Set Puppeteer environment variables.
# We let Puppeteer download its own browser, so skip the npm one.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_CACHE_DIR=/home/nodejs/.cache/puppeteer

# Install npm packages (this will be faster as it skips the download)
RUN npm ci --omit=dev && npm cache clean --force

# Copy the rest of your application code
COPY . .

# ----------------------------------------------------------------------------------
# ✅ CRITICAL FIX: Install Chrome and its dependencies using the official command
# This is run as the 'nodejs' user to ensure correct permissions and location.
# ----------------------------------------------------------------------------------
RUN chown -R nodejs:nodejs /app
USER nodejs
RUN npx puppeteer browsers install chrome

# Switch back to the WORKDIR as the nodejs user
WORKDIR /app

# Expose port
EXPOSE 3000

# Start command
CMD ["node", "server.js"]