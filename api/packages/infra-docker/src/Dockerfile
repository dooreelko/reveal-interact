FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY *.js ./

EXPOSE 3000 3001 3002

CMD ["node", "api-server.js"]
