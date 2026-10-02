FROM node:lts

WORKDIR /api
COPY package*.json ./

RUN npm install
COPY . .

EXPOSE 8500

# Start the application with tsx (to be removed after build phase is introduced)
CMD ["npx", "tsx", "./src/server"]
# CMD ["npm", "run", "migrate"]
