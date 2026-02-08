FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev \
 && rm -f package-lock.json \
 && rm -f node_modules/.package-lock.json \
 && rm -rf /root/.npm /tmp/*
COPY src ./src

RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3000
CMD ["node", "src/server.js"]
