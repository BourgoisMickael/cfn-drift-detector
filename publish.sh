#!/usr/bin/env bash

# source .env

sam package \
    --region $DEPLOY_REGION \
    --template-file sam/template.yml \
    --s3-bucket $S3_BUCKET \
    --s3-prefix cfn-drift-detector \
    --output-template-file template-output.yml

sam publish \
    --region $DEPLOY_REGION \
    --template-file template-output.yml

ACCOUNT_ID=$(
    aws sts get-caller-identity \
        --query Account \
        --output text
)

aws serverlessrepo put-application-policy \
    --region $DEPLOY_REGION \
    --application-id arn:aws:serverlessrepo:$DEPLOY_REGION:$ACCOUNT_ID:applications/cfn-drift-detector \
    --statements "Actions=Deploy,Principals=*,StatementId=PublicAccess"
