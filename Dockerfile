FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/monitor.sqlite
EXPOSE 3000
CMD ["npm", "start"]
