# set secret keys
aws ssm put-parameter --name githubWebhookSecret --type String --value exampleValue
aws ssm put-parameter --name githubUserToken --type String --value exampleValue
aws ssm put-parameter --name channelAccessToken --type String --value exampleValue
aws ssm put-parameter --name channelAccessSecret --type String --value exampleValue
