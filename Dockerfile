FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Create non-root user and use it
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3000
CMD ["node", "src/server.js"]
