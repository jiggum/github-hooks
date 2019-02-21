const yaml = require('js-yaml')
const fs = require('fs')
const path = require('path')
const request = require('request')

function getMessage(data, userMap) {
  const targetPRList = data
    .map(pr => ({
      url: pr.html_url,
      title: pr.title,
      reviewers: pr.requested_reviewers.map(reviewer => userMap[reviewer.login])
    }))
    .filter(pr => pr.reviewers.length > 0)
  const messages = targetPRList
    .map(pr => {
    const mestions = pr.reviewers
      .map(s => `@${s}`)
      .join(' ')
    return `:pray: [${pr.title}](${pr.url}) ${mestions}`
  })
  return messages.join('\n')
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

async function requestAssign(repositories) {
  return Promise.all(repositories.map(repository => {
    const options = {
      url: `https://api.github.com/repos/${repository}/pulls`,
      headers: {
        'User-Agent': 'serverless - reviewRequiredNoti',
        'Authorization': `token ${process.env.GITHUB_USER_TOKEN}`
      }
    }
    return new Promise((resolve, reject) => {
      request(options, function(err, response) {
        if(err) { console.log(err); return reject(err) }
        console.log("Get response: " + response.statusCode)
        return resolve(response)
      })
    })
  }))
}

module.exports.reviewRequiredNoti = (event, context, callback) => {
  let config
  try {
    const configPath = path.resolve(__dirname, 'config.yml')
    config = yaml.safeLoad(fs.readFileSync(configPath, 'utf8'))
  } catch (e) {
    console.log(e)
  }

  requestAssign(config.repos)
    .then(responses => {
      const data = responses.reduce((acc, response) => acc.concat(JSON.parse(response.body)), [])
      const message = getMessage(data, config.userMap)
      sendMessage(message, config)
    
      return callback(null, { statusCode: 200 })
    })
    .catch((e) => {
      console.error(e)
      callback(null, { statusCode: 400 })
    })
}