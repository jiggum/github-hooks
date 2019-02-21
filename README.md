# set secret keys
aws ssm put-parameter --name githubWebhookSecret --type String --value githubWebhookSecret
aws ssm put-parameter --name githubUserToken --type String --value githubUserToken