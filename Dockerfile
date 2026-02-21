# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend con frontend dist embebido
FROM node:20-bookworm
# Build tools needed for better-sqlite3 native bindings
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Copy package files first
COPY backend/package*.json ./
# Install and rebuild native modules inside Docker (ensure GLIBC compatibility)
RUN npm install --no-optional && npm rebuild
# Now copy the backend source
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist ./public
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "index.js"]
