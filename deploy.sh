#!/usr/bin/env bash

source .env

sam deploy \
    --region eu-west-1 \
    --template-file sam/template.yml \
    --no-fail-on-empty-changeset \
    --s3-bucket $S3_BUCKET \
    --capabilities CAPABILITY_NAMED_IAM \
    --stack-name cfn-drift-detector \
    --parameter-overrides "\
        ParameterKey=DetectionSchedule,ParameterValue='$DETECTION_SCHEDULE' \
        ParameterKey=Regions,ParameterValue=$REGIONS \
        ParameterKey=IgnoreStackIdRegex,ParameterValue='$IGNORE_STACK_ID_REGEX' \
        ParameterKey=SesRegion,ParameterValue=$SES_REGION \
        ParameterKey=SesSource,ParameterValue=$SES_SOURCE \
        ParameterKey=SesDestination,ParameterValue=$SES_DESTINATION"
