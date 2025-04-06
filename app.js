// app.js
require('dotenv').config(); // Load environment variables from .env file (for local testing)
const express = require('express');
const axios = require('axios');
const AssistantV2 = require('ibm-watson/assistant/v2');
const { IamAuthenticator } = require('ibm-watson/auth');

// Initialize Express app
const app = express();
app.use(express.json()); // Parse JSON requests

// Environment variables (set these in IBM Code Engine)
const {
  FB_PAGE_ACCESS_TOKEN,
  WATSON_API_KEY,
  ASSISTANT_ID,
  VERIFY_TOKEN,
  PORT = 8080 // Default port for Code Engine
} = process.env;

// Initialize Watsonx Assistant
const assistant = new AssistantV2({
  version: '2023-05-29', // Use latest version
  authenticator: new IamAuthenticator({ apikey: WATSON_API_KEY }),
  serviceUrl: 'https://api.us-south.assistant.watson.cloud.ibm.com' // Update region if needed
});

// 1. Facebook Webhook Verification Endpoint
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.error('Webhook verification failed');
    res.sendStatus(403);
  }
});

// 2. Handle Incoming Facebook Comments
app.post('/webhook', async (req, res) => {
  try {
    const entries = req.body.entry;
    for (const entry of entries) {
      for (const change of entry.changes) {
        if (change.field === 'feed' && change.value.item === 'comment') {
          const commentId = change.value.comment_id;
          const commentText = await fetchFacebookComment(commentId);
          const watsonReply = await analyzeWithWatson(commentText);
          await postFacebookReply(commentId, watsonReply);
        }
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing comment:', error);
    res.sendStatus(500);
  }
});

// Fetch Comment Text from Facebook
async function fetchFacebookComment(commentId) {
  const response = await axios.get(`https://graph.facebook.com/v22.0/${commentId}`, {
    params: {
      access_token: FB_PAGE_ACCESS_TOKEN,
      fields: 'message'
    }
  });
  return response.data.message;
}

// Analyze Comment with Watsonx Assistant
async function analyzeWithWatson(text) {
  try {
    const session = await assistant.createSession({
      assistantId: ASSISTANT_ID
    });

    const response = await assistant.message({
      assistantId: ASSISTANT_ID,
      sessionId: session.result.session_id,
      input: {
        message_type: 'text',
        text: text
      }
    });

    return response.result.output.generic[0]?.text || "I didn't understand that";
  } catch (error) {
    console.error('Watson error:', error);
    return "Sorry, I'm having trouble understanding.";
  }
}

// Post Reply to Facebook Comment
async function postFacebookReply(commentId, message) {
  await axios.post(`https://graph.facebook.com/v22.0/${commentId}/comments`, null, {
    params: {
      access_token: FB_PAGE_ACCESS_TOKEN,
      message: message
    }
  });
}

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});