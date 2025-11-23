# Stage 1: Base
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Development
FROM base AS dev
# Expose Vite default port
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# Stage 3: Build
FROM base AS build
COPY . .
# We set VITE_API_URL to empty string so that requests are relative (e.g. /auth/login)
# This allows Nginx to proxy them to the backend.
ENV VITE_API_URL=""
RUN npm run build

# Stage 4: Production
FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
