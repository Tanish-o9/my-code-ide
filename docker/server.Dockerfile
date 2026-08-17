FROM node:20-alpine

# Install build dependencies for native modules (like node-pty)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    bash

WORKDIR /app/server

COPY server/package*.json ./
RUN npm install

COPY server/ ./

RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]
