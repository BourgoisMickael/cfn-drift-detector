#!/usr/bin/env bash

source .env

sam deploy \
    --region $DEPLOY_REGION \
    --profile $DEPLOY_PROFILE \
    --template-file sam/template.yml \
    --no-fail-on-empty-changeset \
    --s3-bucket $S3_BUCKET \
    --capabilities CAPABILITY_NAMED_IAM \
    --stack-name cfn-drift-detector \
    --parameter-overrides "\
        ParameterKey=DetectionSchedule,ParameterValue='$DETECTION_SCHEDULE' \
        ParameterKey=NotifierService,ParameterValue=SES \
        ParameterKey=NotifierRegion,ParameterValue=$NOTIFIER_REGION \
        ParameterKey=Destination,ParameterValue=$DESTINATION \
        ParameterKey=SesSource,ParameterValue=$SES_SOURCE \
        ParameterKey=Regions,ParameterValue=$REGIONS \
        ParameterKey=IgnoreStackIdRegex,ParameterValue='$IGNORE_STACK_ID_REGEX' \
        ParameterKey=Tracing,ParameterValue=Active"
