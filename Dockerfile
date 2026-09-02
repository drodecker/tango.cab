FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY server.mjs ./server.mjs
COPY site ./site
EXPOSE 3000
CMD ["node", "server.mjs"]
