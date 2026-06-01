# --- build asamasi ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# --- runtime asamasi ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app .
USER node
EXPOSE 8080
CMD ["sh", "-c", "node server.js"]
