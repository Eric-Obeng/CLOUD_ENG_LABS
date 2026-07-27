# Small base image - alpine keeps the final image size (and attack
# surface) down compared to the default node image.
FROM node:20-alpine

WORKDIR /app

# Copy manifest first so Docker can cache the npm install layer
# separately from app code changes (faster rebuilds).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

# Run as a non-root user - security best practice, avoids running
# the container process as root inside the container.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

CMD ["npm", "start"]