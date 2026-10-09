FROM node:20-slim
WORKDIR /app
COPY package.json consolidated-app.cjs ./
COPY handlers ./handlers
COPY registry.js ./
RUN npm install --production
EXPOSE 3000
CMD ["node", "consolidated-app.cjs"]
