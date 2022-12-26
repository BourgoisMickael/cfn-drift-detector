# CloudFormation Drift Detector

Perform regular drift detection on every stacks and report drifts by email automatically.

![email-screenshot](https://raw.githubusercontent.com/BourgoisMickael/cfn-drift-detector/master/assets/email-screenshot.png)

❗ Drift detection triggers way to many false positive for now, this project might spam you with emails where you can't do anything. There are many bug issues open, see https://github.com/aws-cloudformation/cloudformation-coverage-roadmap/issues?q=is%3Aissue+is%3Aopen+drift+detection+label%3Abug

___
## How does it work ?

- Detection
    1. The `DetectionSchedule` scheduler triggers the `DetectStackDrifts` lambda. By default, it runs every 15 minutes between 6 AM and 7 AM everyday. (It allows retries in case of Throttling by CloudFormation).
    2. For each selected `Regions` the lambda lists all the stacks and filters the ones matching `IgnoreStackIdRegex` and the ones that have already have a drift detection with a age smaller than `DriftAgeCheckHours` (23 hours by default).
    3. Loop over all the stacks and call the `DetectStackDrift` API.

- Notification
    1. The `NotificationSchedule` scheduler triggers the `NotifyStackDrifts` lambda. By default, it runs at 7:45 AM everyday, this should leave enough time for the drift detection and potential retries to finish.
    2. For each selected `Regions` the lambda lists all the stacks and filters the ones matching `IgnoreStackIdRegex` or the ones that are not drifted.
    3. Depending on `NotifierService`, the lambda will send an HTML or text report to the `Destination` email.

![architecture](https://raw.githubusercontent.com/BourgoisMickael/cfn-drift-detector/master/assets/architecture.png)

## Development

Copy `.env.example` to `.env` and replace with your desired configuration.
Then run `npm i && npm run build && ./deploy.sh`

## Testing

Run `test/deploy.sh` for a stack with drifts or `test/deploy_many.sh` for 1000 stacks to test with CloudFormation throttling.
