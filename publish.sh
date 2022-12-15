#!/usr/bin/env bash

source .env

sam package \
    --region $DEPLOY_REGION \
    --profile $DEPLOY_PROFILE \
    --template-file sam/template.yml \
    --s3-bucket $S3_BUCKET \
    --s3-prefix cfn-drift-detector \
    --output-template-file template-output.yml

sam publish \
    --region $DEPLOY_REGION \
    --profile $DEPLOY_PROFILE \
    --template-file template-output.yml
