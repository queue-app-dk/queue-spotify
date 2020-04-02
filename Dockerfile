FROM node:12-alpine

COPY . /code
WORKDIR /code
RUN npm install --prod

EXPOSE 8080

CMD ["npm", "run", "prod"]
