FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.js payment-config.cjs toon_middleware.js registry.js blockrun-arbitrage.cjs x402-verifier.cjs watchdog-attestation.cjs ./
EXPOSE 3000
CMD ["node", "index.js"]