# Cron jobs for Spotify

## Requirements
- [AWS CLI](https://aws.amazon.com/cli/)
- [EB CLI](https://github.com/aws/aws-elastic-beanstalk-cli)
- [Docker](https://docs.docker.com/install/)

## How to deploy
1. Build the Docker image `docker build . -t 627172978538.dkr.ecr.eu-central-1.amazonaws.com/queue-spotify`
2. (Only first time) sign in to AWS ECR `aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin 627172978538.dkr.ecr.eu-central-1.amazonaws.com/queue-spotify`
3. Push the image to AWS `docker push 627172978538.dkr.ecr.eu-central-1.amazonaws.com/queue-spotify:latest`
4. Redeploy the service `eb deploy`

