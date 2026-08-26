FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js registry.js toon_middleware.js payment-config.cjs ./

ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
