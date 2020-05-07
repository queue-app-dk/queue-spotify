# Cron jobs for Spotify

## Requirements

- [EB CLI](https://github.com/aws/aws-elastic-beanstalk-cli)
- ([Docker](https://docs.docker.com/install/))

## Development workflow

1. Create a branch from the `dev` branch. This branch should either contain a
   deletion, a addition, or a hotfix. Example: `feat/add-sentry`
2. Create the necessary changes and commit them and push it to GitHub. Example:
   `git push -u origin feat/add-sentry`
3. Create a merge request from your branch to `dev`. Get somebody else to do a
   code review.
4. Merge the MR into dev. Now it will deploy automatically to Elastic Beanstalk
5. When you have tested the code on `dev` and the dev/staging server, create a
   MR from `dev` to `master` and when you merge that, it will automatically
   deploy to production

## How to deploy manually

1. (Only first time) Install and setup EB CLI
2. (Re)deploy the service `eb deploy`
