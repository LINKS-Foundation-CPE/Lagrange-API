# A major line, not `lts`: `lts` moves to a new major on its own schedule, which
# would change the runtime under a routine rebuild. Patch releases still arrive,
# because the deploy rebuilds with --pull.
FROM node:24

WORKDIR /api
COPY package*.json ./

RUN npm install
COPY . .

EXPOSE 8500

# Start the application with tsx (to be removed after build phase is introduced)
CMD ["npx", "tsx", "./src/server"]
# CMD ["npm", "run", "migrate"]
