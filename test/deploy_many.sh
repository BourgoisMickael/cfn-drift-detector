#!/usr/bin/env bash

source .env

export AWS_MAX_ATTEMPTS=10
for i in $(seq 1 1000)
do
    echo $i
    aws cloudformation create-stack \
        --region $DEPLOY_REGION \
        --template-body file://template_many.yml \
        --stack-name t${i} \
        --parameters \
            ParameterKey=Num,ParameterValue=${i} &
    sleep 0.5
done
