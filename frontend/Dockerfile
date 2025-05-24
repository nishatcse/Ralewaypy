# 1. Base Image for Node.js
FROM node:18-alpine AS builder

# 2. Install Python, pip, and git
RUN apk add --no-cache python3 py3-pip git

# 3. Set up working directory for Python scripts and install Python dependencies
WORKDIR /opt/python-scripts

# Copy requirements.txt from the project root (context is now project root)
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python scripts from the project root (context is now project root)
COPY app.py ./app.py
COPY scheduler.py ./scheduler.py
COPY menu.py ./menu.py
COPY test_auth.py ./test_auth.py
COPY config_updater.py ./config_updater.py
# If there's an .env.example, copy it. Otherwise, ensure Python scripts handle its absence.
# For now, we'll rely on Docker Compose to mount the actual .env file.

# 4. Set up working directory for Next.js app
WORKDIR /usr/src/app

# Copy package.json and lock files from the frontend directory (context is project root)
COPY frontend/package.json ./package.json
COPY frontend/package-lock.json ./package-lock.json
# If using yarn, copy yarn.lock instead of package-lock.json

# Install frontend dependencies
RUN npm install
# If using yarn, use yarn install --frozen-lockfile

# Copy the rest of the frontend application code from the frontend directory (context is project root)
COPY ./frontend/ .

# Build the Next.js application
RUN npm run build
# If using yarn, use yarn build

# 5. Production Image (using Next.js standalone output)
FROM node:18-alpine AS runner

WORKDIR /usr/src/app

# Install Python and pip (needed because API routes execute python scripts)
RUN apk add --no-cache python3 py3-pip

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED 1

# Copy Python requirements and scripts first
WORKDIR /opt/python-scripts
COPY --from=builder /opt/python-scripts/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=builder /opt/python-scripts ./ 
# Ensure python scripts are executable if needed, though `python3 script.py` doesn't require it.

# Now, set up the Next.js standalone app
WORKDIR /usr/src/app # Switch back to app dir for Next.js files
COPY --from=builder /usr/src/app/.next/standalone ./
COPY --from=builder /usr/src/app/.next/static ./.next/static
COPY --from=builder /usr/src/app/public ./public

# Expose port 3000
EXPOSE 3000

# Command to run the Next.js production server
# The server.js is part of the standalone output
CMD ["node", "server.js"]
