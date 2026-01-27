FROM node:18-alpine

WORKDIR /app

# Copy package files first for caching
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application source
COPY . .

# Expose port
EXPOSE 4005

# Set production environment
ENV NODE_ENV=production

# Database migration and server start
CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]
