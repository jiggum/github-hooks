const crypto = require('crypto')
const yaml = require('js-yaml')
const fs = require('fs')
const path = require('path')
const request = require('request')

function signRequestBody(key, body) {
  return `sha1=${crypto.createHmac('sha1', key).update(body, 'utf-8').digest('hex')}`
}

function getMessage(pr, targetUser) {
  return `:pray: [${pr.title}](${pr.html_url}) @${targetUser}`
}

function sendMessage(
  message,
  {
    messageGroupName,
    botName,
  }
) {
  const json = {
    message,
    botOption: {
        actAsManager: false,
        silentToManager: false,
    }
  }
  const headers = {
    'X-Access-Key': process.env.CHANNEL_ACECSS_TOKEN,
    'X-Access-Secret': process.env.CHANNEL_ACECSS_SECRET,
  }

  const options = {
      url: `https://api.channel.io/open/groups/@${messageGroupName}/messages`,
      method: 'POST',
      headers,
      json,
      qs: {
        botName,
      }
  }

  return new Promise((resolve, reject) => request.post(options, function(err, response) {
    if(err) { console.log(err); return reject(err) }
    console.log("Post response: " + response.statusCode)
    return resolve(response)
  }))
}

function assignNoti(data) {
  let config
  try {
    const configPath = path.resolve(__dirname, 'config.yml')
    config = yaml.safeLoad(fs.readFileSync(configPath, 'utf8'))
  } catch (e) {
    console.log(e)
  }

  const { requested_reviewer: { login }, pull_request } = data
  const targetUser = config.userMap[login]
  if (targetUser) {
    const message = getMessage(pull_request, targetUser)
    sendMessage(message, config)
  }
}

module.exports.prAssignNoti = (event, context, callback) => {
  let errMsg // eslint-disable-line
  const token = process.env.GITHUB_WEBHOOK_SECRET
  const headers = event.headers
  const sig = headers['X-Hub-Signature']
  const githubEvent = headers['X-GitHub-Event']
  const id = headers['X-GitHub-Delivery']
  const calculatedSig = signRequestBody(token, event.body)

  if (typeof token !== 'string') {
    errMsg = 'Must provide a \'GITHUB_WEBHOOK_SECRET\' env variable'
    return callback(null, {
      statusCode: 401,
      headers: { 'Content-Type': 'text/plain' },
      body: errMsg,
    })
  }

  if (!sig) {
    errMsg = 'No X-Hub-Signature found on request'
    return callback(null, {
      statusCode: 401,
      headers: { 'Content-Type': 'text/plain' },
      body: errMsg,
    })
  }

  if (!githubEvent) {
    errMsg = 'No X-Github-Event found on request'
    return callback(null, {
      statusCode: 422,
      headers: { 'Content-Type': 'text/plain' },
      body: errMsg,
    })
  }

  if (!id) {
    errMsg = 'No X-Github-Delivery found on request'
    return callback(null, {
      statusCode: 401,
      headers: { 'Content-Type': 'text/plain' },
      body: errMsg,
    })
  }

  if (sig !== calculatedSig) {
    errMsg = 'X-Hub-Signature incorrect. Github webhook token doesn\'t match'
    return callback(null, {
      statusCode: 401,
      headers: { 'Content-Type': 'text/plain' },
      body: errMsg,
    })
  }

  const data = JSON.parse(event.body)
  /* eslint-disable */
  console.log('---------------------------------')
  console.log(`Github-Event: "${githubEvent}" with action: "${data.action}"`)
  console.log('---------------------------------')
  //   console.log('Payload', event.body)
  /* eslint-enable */
  if (githubEvent === 'pull_request' && data.action === 'review_requested') {
    assignNoti(data)
  }
  // For more on events see https://developer.github.com/v3/activity/events/types/

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      input: event,
    }),
  }

  return callback(null, response)
}