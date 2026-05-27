FROM node:20-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:20-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:20-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app

# --- NUEVO: Capturar las variables para el build de Vite ---
ARG VITE_CONVEX_URL
ARG VITE_SITE_URL
ARG VITE_CONVEX_SITE_URL
ARG VITE_VAPID_PUBLIC_KEY

ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV VITE_SITE_URL=$VITE_SITE_URL
ENV VITE_CONVEX_SITE_URL=$VITE_CONVEX_SITE_URL
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
# -----------------------------------------------------------

RUN npm run build

FROM node:20-alpine
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
CMD ["npm", "run", "start"]