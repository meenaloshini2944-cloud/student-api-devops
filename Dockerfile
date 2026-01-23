# Use an LTS Node image for stability
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY src ./src

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "src/server.js"]
