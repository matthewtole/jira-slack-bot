FROM node:5

# Install dependencies
RUN apt-get update \
  && apt-get install -qy git python build-essential \
  && rm -rf /var/lib/apt/lists/*

# Setup user
RUN useradd -g daemon -m -d /app app

# Drop privileges
USER app
WORKDIR /app

# Add package info first (allows using cache if deps unchanged)
ADD package.json /app/
ADD npm-shrinkwrap.json /app/

# Install app deps
RUN npm install --no-optional

# Add rest of app
ADD . /app

# Add env file, or the app crashed
COPY .env.sample /app/.env

# Default command to run on boot
CMD ["start"]
ENTRYPOINT ["npm"]
