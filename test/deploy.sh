#!/usr/bin/env bash

source .env

sam deploy \
    --region $DEPLOY_REGION \
    --profile $DEPLOY_PROFILE \
    --template-file template.yml \
    --no-fail-on-empty-changeset \
    --stack-name cfn-drift-detector-test

STACK_OUTPUT=$(
    aws cloudformation describe-stacks \
        --region $DEPLOY_REGION \
        --profile $DEPLOY_PROFILE \
        --stack-name cfn-drift-detector-test \
        --query "Stacks|[0].Outputs" \
        --output text
)
FIRST_QUEUE_URL=$(echo "$STACK_OUTPUT" | grep "FirstQueueUrl" | cut -f2)
SECOND_QUEUE_URL=$(echo "$STACK_OUTPUT" | grep "SecondQueueUrl" | cut -f2)
THIRD_QUEUE_URL=$(echo "$STACK_OUTPUT" | grep "ThirdQueueUrl" | cut -f2)

set -e

# Drift DELETED
aws sqs delete-queue \
    --region $DEPLOY_REGION \
    --profile $DEPLOY_PROFILE \
    --queue-url $FIRST_QUEUE_URL

# Drift MODIFIED - NOT_EQUALS
aws sqs set-queue-attributes \
    --region $DEPLOY_REGION \
    --profile $DEPLOY_PROFILE \
    --queue-url $SECOND_QUEUE_URL \
    --attributes DelaySeconds=120

# Drift MODIFIED - REMOVE
aws sqs untag-queue \
    --region $DEPLOY_REGION \
    --profile $DEPLOY_PROFILE \
    --queue-url $SECOND_QUEUE_URL \
    --tag-keys Tag1

# Drift MODIFIED - ADD
aws sqs tag-queue \
    --region $DEPLOY_REGION \
    --profile $DEPLOY_PROFILE \
    --queue-url $THIRD_QUEUE_URL \
    --tags Tag2=Value2
