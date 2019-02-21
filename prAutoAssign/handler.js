const crypto = require('crypto')
const yaml = require('js-yaml')
const fs = require('fs')
const path = require('path')
const https = require('https');

function signRequestBody(key, body) {
  return `sha1=${crypto.createHmac('sha1', key).update(body, 'utf-8').digest('hex')}`
}

function shouldSkip(
  {
    skipLabels,
    skipHeadRefs,
    skipBaseRefs,
    targetLabels,
    targetHeadRefs,
    targetBaseRefs,
    targetEvents,
    numberOfReviewers,
  }, {
    requested_reviewers,
    labels,
    head,
    base,
  },
  action,
  changes,
) {
  if (!targetEvents.includes(action)) {
    console.log('skip by targetEvents')
    return true
  }

  if (action === 'edited' && !changes.base) {
    console.log('skip by edited without base change')
    return true
  }

  if (requested_reviewers.length >= numberOfReviewers) {
    console.log('skip by numberOfReviewers')
    return true
  }

  if (skipLabels && labels.some(label => skipLabels.includes(label.name))) {
    console.log('skip by skipLabels')
    return true
  }

  if (skipHeadRefs && skipHeadRefs.includes(head.ref)) {
    console.log('skip by skipHeadRefs')
    return true
  }

  if (skipBaseRefs && skipBaseRefs.includes(base.ref)) {
    console.log('skip by skipBaseRefs')
    return true
  }

  if (targetLabels && !labels.some(label => targetLabels.includes(label.name))) {
    console.log('skip by targetLabels')
    return true
  }

  if (targetHeadRefs && !targetHeadRefs.includes(head.ref)) {
    console.log('skip by targetHeadRefs')
    return true
  }

  if (targetBaseRefs && !targetBaseRefs.includes(base.ref)) {
    console.log('skip by targetBaseRefs')
    return true
  }

  return false
}

function chooseUsers(owner, prevReviewers, users, desiredNumber) {
  return users
    .filter(
      user =>
        user !== owner &&
        !prevReviewers.map(reviewer => reviewer.login).includes(user)
    )
    .sort(() => 0.5 - Math.random())
    .slice(0, Math.max(desiredNumber - prevReviewers.length, 0))
}

function requestAssign(repository, pullRequest, reviewers) {
  const body = JSON.stringify({'reviewers':  reviewers} )

  const options = {
    hostname: 'api.github.com',
    path: `/repos/${repository.owner.login}/${repository.name}/pulls/${pullRequest.number}/requested_reviewers`,
    port: 443,
    method: 'POST',
    headers: {
      'User-Agent': 'serverless - prAutoAssign',
      'Content-Type': 'application/json',
      'Content-Length': body.length,
      'Authorization': `token ${process.env.GITHUB_USER_TOKEN}`
    }
  }

  const req = https.request(options, function(res) {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  });
  req.on('error', (e) => {
    console.log(`problem with request: ${e.message}`);
  });
  req.write(body)
  req.end()
}

function autoAssign(data) {
  let config
  try {
    const configPath = path.resolve(__dirname, 'config.yml')
    config = yaml.safeLoad(fs.readFileSync(configPath, 'utf8'))
  } catch (e) {
    console.log(e)
  }

  const { action, repository, pull_request, changes} = data
  if (shouldSkip(config, pull_request, action, changes)) {
    return
  }
  const reviewers = chooseUsers(
    pull_request.user.login,
    pull_request.requested_reviewers,
    config.reviewers,
    config.numberOfReviewers,
  )
  if (reviewers.length > 0) {
    requestAssign(repository, pull_request, reviewers)
  }
}

module.exports.prAutoAssign = (event, context, callback) => {
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
  if (githubEvent === 'pull_request') {
    autoAssign(data)
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