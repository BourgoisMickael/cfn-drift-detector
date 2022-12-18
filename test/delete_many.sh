#!/usr/bin/env bash

source .env

export AWS_MAX_ATTEMPTS=10
for i in $(seq 1 1000)
do
    echo $i
    aws cloudformation delete-stack \
        --region $DEPLOY_REGION \
        --stack-name t${i} &
    sleep 0.5
done
