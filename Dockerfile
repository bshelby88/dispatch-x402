FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY index.js registry.js toon_middleware.js *.cjs ./

ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
